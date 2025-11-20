import type { Env } from './env'
import { YOUTUBE_TTL } from './env'

/**
 * Normalized YouTube live status for a single channel.
 */
export type YoutubeChannelResult = {
  channelId: string
  live: {
    isLive: boolean
    videoId: string | null
    title: string | null
    thumbnailUrl: string | null
  }
}

/**
 * Thumbnail information from the YouTube Data API.
 */
type YoutubeThumbnail = {
  url?: string
}

/**
 * Snippet thumbnails shape from YouTube Data API.
 */
type YoutubeSnippetThumbnails = {
  default?: YoutubeThumbnail
  medium?: YoutubeThumbnail
  high?: YoutubeThumbnail
}

/**
 * Snippet returned by YouTube search.list.
 */
type YoutubeSearchSnippet = {
  title?: string
  thumbnails?: YoutubeSnippetThumbnails
}

/**
 * Single item in a YouTube search.list response.
 */
type YoutubeSearchItem = {
  id?: { videoId?: string }
  snippet?: YoutubeSearchSnippet
}

/**
 * YouTube search.list API response shape.
 */
type YoutubeSearchResponse = {
  items?: YoutubeSearchItem[]
}

/**
 * Choose the best thumbnail URL from the snippet, preferring medium > default > high.
 */
function buildThumbnail(snippet?: YoutubeSearchSnippet): string | null {
  const thumbs: YoutubeSnippetThumbnails | undefined = snippet?.thumbnails
  if (!thumbs) return null
  return thumbs.medium?.url ?? thumbs.default?.url ?? thumbs.high?.url ?? null
}

/**
 * Fetches live video information (if any) for a given YouTube channel using the Data API.
 */
async function fetchYoutubeForChannel(
  channelId: string,
  apiKey: string,
): Promise<YoutubeChannelResult> {
  const url = new URL('https://www.googleapis.com/youtube/v3/search')
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('channelId', channelId)
  url.searchParams.set('eventType', 'live')
  url.searchParams.set('type', 'video')
  url.searchParams.set('maxResults', '1')
  url.searchParams.set('key', apiKey)

  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new Error(`YouTube error: status=${res.status}`)
  }

  const json = (await res.json()) as YoutubeSearchResponse
  const item = json.items?.[0]
  const videoId = item?.id?.videoId ?? null
  const snippet = item?.snippet

  if (!videoId) {
    return {
      channelId,
      live: {
        isLive: false,
        videoId: null,
        title: null,
        thumbnailUrl: null,
      },
    }
  }

  return {
    channelId,
    live: {
      isLive: true,
      videoId,
      title: snippet?.title ?? null,
      thumbnailUrl: buildThumbnail(snippet),
    },
  }
}

/**
 * Fetch live status for a list of YouTube channels, with edge-cache normalization.
 */
// export async function fetchYoutubeDataWithCache(
//   channelIds: string[],
//   env: Env,
//   ctx: ExecutionContext,
//   requestUrl: URL,
// ): Promise<YoutubeChannelResult[]> {
//   if (!channelIds.length) return []

//   // Normalized cache key: same set of channels -> same key
//   const sorted = [...channelIds].sort()
//   const cacheUrl = new URL(requestUrl.toString())
//   cacheUrl.pathname = '/__youtube_cache_live'
//   cacheUrl.search = `?channels=${encodeURIComponent(sorted.join(','))}`

//   const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' })
//   const cache = caches.default

//   const cached = await cache.match(cacheKey)
//   if (cached) {
//     const data = (await cached.json()) as YoutubeChannelResult[]
//     return data
//   }

//   const results = await Promise.all(
//     sorted.map((id) => fetchYoutubeForChannel(id, env.YOUTUBE_API_KEY)),
//   )

//   const cacheResp = new Response(JSON.stringify(results), {
//     headers: {
//       'Content-Type': 'application/json',
//       'Cache-Control': `public, max-age=${YOUTUBE_TTL}`,
//     },
//   })

//   ctx.waitUntil(cache.put(cacheKey, cacheResp.clone()))

//   return results
// }
