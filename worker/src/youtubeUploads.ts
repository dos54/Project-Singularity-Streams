import { XMLParser } from 'fast-xml-parser'
import type { Env } from './env'
import { XML_PARSER_CONFIG, UPLOAD_TTL_SECONDS, SORTED_UPLOADS_TTL, YOUTUBE_STREAMS_LIST_KEY, YOUTUBE_VIDEO_LIST_KEY, LIVE_RECHECK_SECONDS, NON_LIVE_RECHECK_SECONDS } from './env'

/* -------------------------------------------------------------------------- */
/*  Live status types                                                         */
/* -------------------------------------------------------------------------- */

export type VideoLiveState = 'live' | 'ended' | 'video' | 'inactive'

export interface VideoLiveStatus {
  state: VideoLiveState
  lastChecked: number
  actualStartTime?: string
  actualEndTime?: string
  concurrentViewers?: string | number
}

interface YoutubeVideosListItem {
  id?: string
  liveStreamingDetails?: {
    actualStartTime?: string
    actualEndTime?: string
    concurrentViewers?: string
  }
}

interface YoutubeVideosListResponse {
  items?: YoutubeVideosListItem[]
}

/* -------------------------------------------------------------------------- */
/*  Atom feed + combined list types                                           */
/* -------------------------------------------------------------------------- */

export interface YoutubeFeedAuthor {
  name: string
  uri: string
}

export interface YoutubeFeedLink {
  '@_href': string
}

export interface YoutubeFeedThumbnail {
  '@_url': string
  '@_width': string
  '@_height': string
}

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

export interface RawYoutubeFeed {
  feed?: {
    entry?: RawYoutubeFeedEntry[] | RawYoutubeFeedEntry
  }
}

/**
 * Minimal, normalized representation of a YouTube video
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
  // filled by annotateUploadsWithLiveStatus
  liveStatus?: VideoLiveStatus
}

export type YoutubeUploadsResult = {
  channelId: string
  latest: YoutubeFeedEntry[]
}

/**
 * Cached combined list payload
 */
export interface SortedVideoListCache {
  updatedAt: number
  ttlMs: number
  videos: YoutubeFeedEntry[]
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

export function getCanonicalIds(videoIds: string[]): string[] {
  return Array.from(new Set(videoIds.map((id) => id.trim()).filter((id) => id.length > 0)))
}

/**
 * Derive live/video/inactive from liveStreamingDetails
 */
function deriveLiveStateFromDetails(details?: {
  actualStartTime?: string
  actualEndTime?: string
  concurrentViewers?: string | number
  activeLiveChatId?: string
}): VideoLiveState {
  if (!details) return 'video'

  const { actualStartTime, actualEndTime, concurrentViewers, activeLiveChatId } = details

  if (actualEndTime) {
    return 'video'
  }

  if (actualStartTime && (concurrentViewers || activeLiveChatId)) {
    return 'live'
  }

  return 'inactive'
}

/**
 * Small helper for thumbnails
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
 * Newest → oldest by published date
 */
function sortVideosByDate(videos: YoutubeFeedEntry[]): YoutubeFeedEntry[] {
  const valid = videos.filter((v) => typeof v.published === 'string')
  return valid.sort((a, b) => b.published!.localeCompare(a.published!))
}

/* -------------------------------------------------------------------------- */
/*  Streams cache: one KV object with all live statuses                       */
/* -------------------------------------------------------------------------- */

interface StreamsStatusCache {
  statuses: Record<string, VideoLiveStatus>;
}

/**
 * Fetch live status for a set of videos.
 *
 * - All statuses are stored in a single KV object under YOUTUBE_STREAMS_LIST_KEY.
 * - Each status has its own lastChecked, and we still use per-state staleness.
 */
export async function getVideoLiveStatuses(
  videoIds: string[],
  env: Env,
): Promise<Record<string, VideoLiveStatus>> {
  const now = Date.now();
  const unique = getCanonicalIds(videoIds);
  if (unique.length === 0) return {};

  // Load the single streams object from KV
  const cache =
    (await env.KV.get<StreamsStatusCache>(YOUTUBE_STREAMS_LIST_KEY, {
      type: 'json',
    })) ?? { statuses: {} };

  const result: Record<string, VideoLiveStatus> = {};
  const toRefresh: string[] = [];

  for (const id of unique) {
    const cached = cache.statuses[id];

    if (!cached) {
      toRefresh.push(id);
      continue;
    }

    // Non-live → reuse indefinitely, no re-check
    if (
      cached.state === 'video' ||
      cached.state === 'ended' ||
      cached.state === 'inactive'
    ) {
      result[id] = cached;
      continue;
    }

    const ageSeconds = (now - cached.lastChecked) / 1000;

    if (ageSeconds > LIVE_RECHECK_SECONDS) {
      toRefresh.push(id);
    } else {
      result[id] = cached;
    }
  }

  if (toRefresh.length === 0) {
    return result;
  }

  // Query YouTube for stale/missing IDs in batches of 50
  const batches: string[][] = [];
  for (let i = 0; i < toRefresh.length; i += 50) {
    batches.push(toRefresh.slice(i, i + 50));
  }

  await Promise.all(
    batches.map(async (batch) => {
      const url = new URL('https://www.googleapis.com/youtube/v3/videos');
      url.searchParams.set('part', 'liveStreamingDetails');
      url.searchParams.set('id', batch.join(','));
      url.searchParams.set('key', env.YOUTUBE_API_KEY);

      const resp = await fetch(url.toString());
      if (!resp.ok) {
        const text = await resp.text();
        console.error('Youtube videos.list error:', resp.status, text);
        console.log(url.toString());
        throw new Error(`Youtube videos.list error: ${resp.status}`);
      }

      const json = (await resp.json()) as YoutubeVideosListResponse;
      const items = json.items ?? [];

      const itemMap = new Map<string, YoutubeVideosListItem>();
      for (const item of items) {
        if (item.id) itemMap.set(item.id, item);
      }

      await Promise.all(
        batch.map(async (videoId) => {
          const item = itemMap.get(videoId);
          const details = item?.liveStreamingDetails;
          const state = deriveLiveStateFromDetails(details);

          const status: VideoLiveStatus = {
            state,
            lastChecked: now,
            actualStartTime: details?.actualStartTime,
            actualEndTime: details?.actualEndTime,
            concurrentViewers: details?.concurrentViewers,
          };

          // Update in-memory result + cache
          result[videoId] = status;
          cache.statuses[videoId] = status;
        }),
      );
    }),
  );

  // Persist the single streams object back to KV.
  // TTL can be fairly generous; staleness is enforced via lastChecked.
  const STREAMS_CACHE_TTL_SECONDS = NON_LIVE_RECHECK_SECONDS * 4;
  await env.KV.put(
    YOUTUBE_STREAMS_LIST_KEY,
    JSON.stringify(cache),
    { expirationTtl: STREAMS_CACHE_TTL_SECONDS },
  );

  return result;
}

/* -------------------------------------------------------------------------- */
/*  Annotate uploads with live status                                         */
/* -------------------------------------------------------------------------- */

export async function annotateUploadsWithLiveStatus(
  uploads: YoutubeFeedEntry[],
  env: Env,
): Promise<YoutubeFeedEntry[]> {
  const videoIds = uploads.map((v) => v.videoId).filter((id) => id.trim().length > 0)

  if (videoIds.length === 0) return uploads

  const statusMap = await getVideoLiveStatuses(videoIds, env)

  return uploads.map((entry) => ({
    ...entry,
    liveStatus: statusMap[entry.videoId],
  }))
}

/* -------------------------------------------------------------------------- */
/*  Channel feed → per-channel cached uploads                                 */
/* -------------------------------------------------------------------------- */

export async function getLatestVideos(channelId: string, env: Env): Promise<YoutubeFeedEntry[]> {
  const cacheKey = `${channelId}-latest-videos`

  const cachedJson = await env.KV.get<YoutubeFeedEntry[]>(cacheKey, { type: 'json' })
  if (cachedJson) {
    return cachedJson
  }

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
  const entries: RawYoutubeFeedEntry[] = Array.isArray(rawEntry)
    ? rawEntry
    : rawEntry
      ? [rawEntry]
      : []

  const simplified: YoutubeFeedEntry[] = entries.map((entry) => {
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

  await env.KV.put(cacheKey, JSON.stringify(limited), {
    expirationTtl: UPLOAD_TTL_SECONDS,
  })

  return limited
}

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

/* -------------------------------------------------------------------------- */
/*  Combined sorted list cache (one big KV item per channel set)              */
/* -------------------------------------------------------------------------- */

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

async function makeVideoListCacheKey(channelIds: string[]): Promise<string> {
  const digest = await hashChannelList(channelIds)
  return `sortedVideoList:${digest}`
}

/**
 * Get the data attached to the key, and determine if that data is stale or not.
 */
export async function getCachedOrToRefresh(
  key: string,
  env: Env,
  now: number,
): Promise<{
  data: SortedVideoListCache | null
  isStale: boolean
}> {
  const data = await env.KV.get<SortedVideoListCache>(key, { type: 'json' })

  if (!data) {
    return { data: null, isStale: true }
  }

  const age = now - data.updatedAt

  console.log('[cache] hit', {
    key,
    updatedAt: data.updatedAt,
    ttlMs: data.ttlMs,
    age,
    isStale: age > data.ttlMs,
  })

  return {
    data,
    isStale: age > data.ttlMs,
  }
}

export async function cacheVideoList(
  key: string,
  cache: SortedVideoListCache,
  env: Env,
  now: number,
): Promise<void> {
  cache.updatedAt = now

  await env.KV.put(key, JSON.stringify(cache), {
    expirationTtl: (cache.ttlMs / 1000) * 100,
  })
}

/**
 * Get a cached, sorted list of the latest videos across a set of channels.
 * Does not recompute on stale; caller can decide what to do with isStale.
 */
export async function getCachedVideoList(
  env: Env,
  channelIds: string[],
  now: number,
): Promise<{
  videos: YoutubeFeedEntry[]
  isStale: boolean
}> {
  const cacheKey = await makeVideoListCacheKey(channelIds)
  const { data: cached, isStale } = await getCachedOrToRefresh(cacheKey, env, now)

  if (cached) {
    console.log(`Cache hit on ${cacheKey}`)
    return {
      videos: cached.videos,
      isStale,
    }
  }

  console.log(`Cache miss on ${cacheKey}`)
  return {
    videos: [],
    isStale: true,
  }
}

/**
 * Build a fresh sorted list and write it to KV.
 */
export async function buildAndCacheVideoList(
  env: Env,
  channelIds: string[],
  now: number,
): Promise<YoutubeFeedEntry[]> {
  const cacheKey = await makeVideoListCacheKey(channelIds)

  const lists = await Promise.all(channelIds.map((id) => getLatestVideos(id, env)))
  const combined = lists.flat()
  const nonLive = combined.filter(u => u.liveStatus?.state === 'video')
  const sorted = sortVideosByDate(nonLive)

  const cache: SortedVideoListCache = {
    updatedAt: now,
    ttlMs: SORTED_UPLOADS_TTL * 1000,
    videos: sorted,
  }

  await cacheVideoList(cacheKey, cache, env, now)

  return sorted
}
