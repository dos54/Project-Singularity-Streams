import type { Env } from './env'

export type VideoLiveState = 'live' | 'ended' | 'video' | 'inactive'

export interface VideoLiveStatus {
  state: VideoLiveState
  lastChecked: number
  actualStartTime?: string
  actualEndTime?: string
  concurrentViewers?: string
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

const VIDEO_STATUS_PREFIX = 'yt_live:'
const LIVE_RECHECK_SECONDS = 60
const NON_LIVE_RECHECK_SECONDS = 60 * 60 * 24

function makeVideoStatusKey(videoId: string): string {
  return `${VIDEO_STATUS_PREFIX}${videoId}`
}

/**
 * Interpret Youtube videos.list reponse item into our VideoLiveStatus
 */
function deriveStatusFromItem(item: YoutubeVideosListItem, now: number): VideoLiveStatus {
  const details = item.liveStreamingDetails

  if (!details) {
    return { state: 'video', lastChecked: now }
  }

  const { actualStartTime, actualEndTime, concurrentViewers } = details

  if (actualEndTime) {
    return {
      state: 'ended',
      lastChecked: now,
      actualStartTime,
      actualEndTime,
    }
  }

  if (actualStartTime) {
    return {
      state: 'live',
      lastChecked: now,
      actualStartTime,
      concurrentViewers,
    }
  }

  return {
    state: 'inactive',
    lastChecked: now,
  }
}

/**
 * Fetch live status for a set of videos
 *
 * - If a video is not in KV, it will be queried
 * - If a video is in KV but is stale, it will be re-queried
 * - Otherwise, it will reuse the cached value
 */
export async function getVideoLiveStatuses(
  videoIds: string[],
  env: Env,
): Promise<Record<string, VideoLiveStatus>> {
  const now = Date.now()
  const unique = Array.from(new Set(videoIds.filter((id) => id.trim().length > 0)))
  if (unique.length === 0) return {}

  const result: Record<string, VideoLiveStatus> = {}
  const toRefresh: string[] = []

  // -------- Parallel KV reads --------
  const keys = unique.map((id) => makeVideoStatusKey(id))
  const cachedStatuses = await Promise.all(
    keys.map((key) => env.KV.get<VideoLiveStatus>(key, { type: 'json' as const })),
  )

  for (let i = 0; i < unique.length; i++) {
    const id = unique[i]
    const cached = cachedStatuses[i]

    if (!cached) {
      toRefresh.push(id)
      continue
    }

    // Non-live → reuse, no re-check
    if (cached.state === 'video' || cached.state === 'ended' || cached.state === 'inactive') {
      result[id] = cached
      continue
    }

    const ageSeconds = (now - cached.lastChecked) / 1000

    if (ageSeconds > LIVE_RECHECK_SECONDS) {
      toRefresh.push(id)
    } else {
      result[id] = cached
    }
  }

  if (toRefresh.length === 0) {
    return result
  }

  // -------- YouTube API batches (already parallel) --------
  const batches: string[][] = []
  for (let i = 0; i < toRefresh.length; i += 50) {
    batches.push(toRefresh.slice(i, i + 50))
  }

  await Promise.all(
    batches.map(async (batch) => {
      const url = new URL('https://www.googleapis.com/youtube/v3/videos')
      url.searchParams.set('part', 'liveStreamingDetails')
      url.searchParams.set('id', batch.join(','))
      url.searchParams.set('key', env.YOUTUBE_API_KEY)

      const resp = await fetch(url.toString())
      if (!resp.ok) {
        const text = await resp.text()
        console.error('Youtube videos.list error:', resp.status, text)
        console.log(url.toString())
        throw new Error(`Youtube videos.list error: ${resp.status}`)
      }

      const json = (await resp.json()) as YoutubeVideosListResponse
      const items = json.items ?? []

      const itemMap = new Map<string, YoutubeVideosListItem>()
      for (const item of items) {
        if (item.id) itemMap.set(item.id, item)
      }

      // Optionally parallelize KV.puts per batch as well:
      await Promise.all(
        batch.map(async (videoId) => {
          const item = itemMap.get(videoId)
          const status = deriveStatusFromItem(item ?? {}, now)

          const ttlSeconds =
            status.state === 'live' ? LIVE_RECHECK_SECONDS * 2 : NON_LIVE_RECHECK_SECONDS

          const key = makeVideoStatusKey(videoId)
          await env.KV.put(key, JSON.stringify(status), { expirationTtl: ttlSeconds })

          // Safe to mutate: single-threaded event loop
          result[videoId] = status
        }),
      )
    }),
  )

  return result
}
