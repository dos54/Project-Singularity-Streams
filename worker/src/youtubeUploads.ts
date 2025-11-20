// src/youtubeUploads.ts

import { XMLParser } from 'fast-xml-parser'
import type { Env } from './env'
import { XML_PARSER_CONFIG, UPLOAD_TTL_SECONDS, SORTED_UPLOADS_TTL } from './env'
import { getVideoLiveStatuses, type VideoLiveStatus } from './youtubeVideoStatus'

/**
 * Author info from the YouTube Atom feed.
 */
export interface YoutubeFeedAuthor {
  name: string
  uri: string
}

/**
 * Link node from the YouTube Atom feed.
 */
export interface YoutubeFeedLink {
  '@_href': string
}

/**
 * Thumbnail attributes from the YouTube media group.
 */
export interface YoutubeFeedThumbnail {
  '@_url': string
  '@_width': string
  '@_height': string
}

/**
 * media:group section from the YouTube Atom feed.
 */
export interface YoutubeFeedMediaGroup {
  'media:title'?: string
  'media:content'?: unknown
  'media:thumbnail'?: YoutubeFeedThumbnail | YoutubeFeedThumbnail[]
  'media:description'?: string
  'media:community'?: {
    'media:starRating'?: {
      '@_count': string
      '@_average': string
      '@_min': string
      '@_max': string
    }
    'media:statistics'?: {
      '@_views'?: string
    }
  }
}

/**
 * Raw entry from the YouTube Atom feed after XML parsing.
 */
export type RawYoutubeFeedEntry = {
  id: string
  'yt:videoId': string
  'yt:channelId': string
  title: string
  link: YoutubeFeedLink
  author: YoutubeFeedAuthor
  published?: string
  updated?: string
  'media:group'?: YoutubeFeedMediaGroup
}

/**
 * Raw YouTube Atom feed shape after XML parsing.
 */
export interface RawYoutubeFeed {
  feed?: {
    entry?: RawYoutubeFeedEntry[]
  }
}

/**
 * Minimal, normalized representation of a YouTube video for your app.
 */
export type YoutubeFeedEntry = {
  videoId: string
  title: string | null
  published: string | null
  link: string | null
  author: YoutubeFeedAuthor | null
  thumbnailUrl: string | null
  thumbnailWidth: string | null
  thumbnailHeight: string | null
  liveStatus?: VideoLiveStatus
}

/**
 * Latest uploads result for a single channel.
 */
export type YoutubeUploadsResult = {
  channelId: string
  latest: YoutubeFeedEntry[]
}

/**
 * Cache payload shape for uploads stored in the edge cache.
 */
// type YoutubeUploadsCacheEntry = {
//   timestamp: number
//   data: YoutubeUploadsResult[]
// }

export async function annotateUploadsWithLiveStatus(
  uploads: YoutubeFeedEntry[],
  env: Env
): Promise<YoutubeFeedEntry[]> {
  const videoIds = uploads
    .map((v) => v.videoId)
    .filter((id) => id.trim().length > 0)

  if (videoIds.length === 0) return uploads
  const statusMap = await getVideoLiveStatuses(videoIds, env)
  return uploads.map((entry) => ({
    ...entry,
    liveStatus: statusMap[entry.videoId]
  }))
}

/**
 * Helper to pick a thumbnail from the media:group (handles single or array).
 */
function pickThumbnail(th: YoutubeFeedThumbnail | YoutubeFeedThumbnail[] | undefined): {
  url: string | null
  width: string | null
  height: string | null
} {
  if (!th) {
    return { url: null, width: null, height: null }
  }

  const node = Array.isArray(th) ? th[0] : th
  return {
    url: node['@_url'] ?? null,
    width: node['@_width'] ?? null,
    height: node['@_height'] ?? null,
  }
}

/**
 * Sorts YouTube videos from newest to oldest based on `published` ISO string.
 */
function sortVideosByDate(videos: YoutubeFeedEntry[]): YoutubeFeedEntry[] {
  const valid = videos.filter((v) => typeof v.published === 'string')
  return valid.sort((a, b) => b.published!.localeCompare(a.published!))
}

/**
 * Compute a stable hash for a list of channel IDs, used to build KV cache keys.
 */
async function hashChannelList(channelIds: string[]): Promise<string> {
  const sorted = [...channelIds].sort()
  const data = new TextEncoder().encode(sorted.join(','))

  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = [...new Uint8Array(hashBuffer)]

  return btoa(String.fromCharCode(...hashArray))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Build the KV key for the combined, sorted uploads list for a set of channels.
 */
async function makeVideoListCacheKey(channelIds: string[]): Promise<string> {
  const digest = await hashChannelList(channelIds)
  return `sortedVideoList:${digest}`
}

/**
 * Fetch latest uploads for a single channel, with KV caching.
 * Returns minimal `YoutubeFeedEntry` objects.
 */
export async function getLatestVideos(channelId: string, env: Env): Promise<YoutubeFeedEntry[]> {
  const cacheKey = `${channelId}-latest-videos`

  // Try KV cache first
  const cachedJson = await env.KV.get(cacheKey, { type: 'json' })
  if (cachedJson) {
    return cachedJson as YoutubeFeedEntry[]
  }

  // Cache miss: fetch feed
  const url = new URL('https://www.youtube.com/feeds/videos.xml')
  url.searchParams.set('channel_id', channelId)

  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new Error(`Error fetching channel uploads: status=${res.status}`)
  }

  const xml = await res.text()
  const parser = new XMLParser(XML_PARSER_CONFIG)
  const data = parser.parse(xml) as RawYoutubeFeed

  const rawEntry = data.feed?.entry
  const entries: RawYoutubeFeedEntry[] = Array.isArray(rawEntry) ? rawEntry : rawEntry ? [rawEntry] : []

  const simplified: YoutubeFeedEntry[] = entries.map((entry: RawYoutubeFeedEntry) => {
    const videoId = entry['yt:videoId'] ?? ''
    const title = entry.title ?? null
    const published = entry.published ?? null
    const link = entry.link?.['@_href'] ?? null
    const author = entry.author ?? null
    const {
      url: thumbnailUrl,
      width: thumbnailWidth,
      height: thumbnailHeight,
    } = pickThumbnail(entry['media:group']?.['media:thumbnail'])

    return {
      videoId,
      title,
      published,
      link,
      author,
      thumbnailUrl,
      thumbnailWidth,
      thumbnailHeight,
    }
  })

  const limited = simplified.slice(0, 10)

  // Store minimal data in KV
  await env.KV.put(cacheKey, JSON.stringify(limited), {
    expirationTtl: UPLOAD_TTL_SECONDS,
  })

  return limited
}

/**
 * Fetch latest uploads for multiple channels in parallel.
 * One channel failing will not break the entire batch.
 */
export async function getLatestVideosForChannels(
  channelIds: string[],
  env: Env,
): Promise<YoutubeUploadsResult[]> {
  const results = await Promise.all(
    channelIds.map(async (id) => {
      try {
        const latest = await getLatestVideos(id, env)
        return { channelId: id, latest }
      } catch {
        return { channelId: id, latest: [] }
      }
    }),
  )

  return results
}

/**
 * Get a cached, sorted list of the latest videos across a set of channels.
 * Uses KV as a secondary cache for the combined + sorted list.
 */
export async function getCachedVideoList(
  env: Env,
  channelIds: string[],
): Promise<YoutubeFeedEntry[]> {
  const cacheKey = await makeVideoListCacheKey(channelIds)
  const cached = await env.KV.get<YoutubeFeedEntry[]>(cacheKey, { type: 'json' as const })

  if (cached) {
    console.log(`Cache hit on ${cacheKey}`)
    return cached
  }

  console.log(`Cache miss on ${cacheKey}`)

  const lists = await Promise.all(channelIds.map((id) => getLatestVideos(id, env)))
  const combined = lists.flat()
  const sorted = sortVideosByDate(combined)

  await env.KV.put(cacheKey, JSON.stringify(sorted), { expirationTtl: SORTED_UPLOADS_TTL })

  return sorted
}

/**
 * Alternative uploads cacher using the edge Cache API instead of KV.
 * Currently unused, but kept for future flexibility.
 */
// export async function fetchYoutubeUploadsWithCache(
//   channelIds: string[],
//   ctx: ExecutionContext,
//   requestUrl: URL,
//   env: Env,
// ): Promise<YoutubeUploadsResult[]> {
//   if (!channelIds.length) return []

//   const sorted = [...channelIds].sort()
//   const cacheUrl = new URL(requestUrl.toString())
//   cacheUrl.pathname = '/__youtube_cache_uploads'
//   cacheUrl.search = `?channels=${encodeURIComponent(sorted.join(','))}`

//   const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' })
//   const cache = caches.default

//   const now = Date.now()
//   const cached = await cache.match(cacheKey)
//   if (cached) {
//     try {
//       const cachedEntry = (await cached.json()) as YoutubeUploadsCacheEntry
//       if (now - cachedEntry.timestamp < UPLOAD_TTL_SECONDS * 1000) {
//         return cachedEntry.data
//       }
//     } catch {
//       // corrupted cache; ignore and refetch
//     }
//   }

//   const results = await getLatestVideosForChannels(sorted, env)

//   const entry: YoutubeUploadsCacheEntry = {
//     timestamp: now,
//     data: results,
//   }

//   const cacheResp = new Response(JSON.stringify(entry), {
//     headers: {
//       'Content-Type': 'application/json',
//     },
//   })

//   ctx.waitUntil(cache.put(cacheKey, cacheResp.clone()))

//   return results
// }
