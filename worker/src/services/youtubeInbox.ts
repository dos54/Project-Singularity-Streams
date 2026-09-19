import type { Env } from '../env'
import { getAllMembers } from '../db/members'
import { upsertVideos, ensureLiveStatusRows, patchVideoLiveStatus } from '../db/videos'
import { memberRowToAuthor } from '../mappers/members'
import { determineLiveStatus, isProjectSingularityVideo } from '../models/video'
import type { Video, VideoLiveStatus } from '../types/youtube'
import { videoLiveStatusToRow } from '../mappers/videoMapper'

export interface VideoNotice { videoId: string; channelId: string; updatedAt: number }
interface WorkRow { VideoId: string; ChannelId: string; Revision: number; Attempts: number }

// Keep completed rows as a high-water mark so replayed/older deliveries stay cheap.
export async function enqueueNotices(env: Env, notices: VideoNotice[], now = Date.now()) {
  if (!notices.length) return
  const stmt = env.DB.prepare(`INSERT INTO YoutubeInbox
    (VideoId, ChannelId, EventUpdatedAt, NextAttemptAt) VALUES (?, ?, ?, ?)
    ON CONFLICT(VideoId) DO UPDATE SET EventUpdatedAt=excluded.EventUpdatedAt,
      Revision=YoutubeInbox.Revision+1, Attempts=0, NextAttemptAt=excluded.NextAttemptAt, LastError=NULL
    WHERE YoutubeInbox.ChannelId=excluded.ChannelId AND excluded.EventUpdatedAt>YoutubeInbox.EventUpdatedAt`)
  await env.DB.batch(notices.map(n => stmt.bind(n.videoId, n.channelId, n.updatedAt, now)))
}

// Reconciliation and live polling do not overwrite the notification high-water mark.
export async function enqueueRefresh(env: Env, videos: { videoId: string; channelId: string }[], now = Date.now()) {
  if (!videos.length) return
  const stmt = env.DB.prepare(`INSERT INTO YoutubeInbox(VideoId,ChannelId,NextAttemptAt) VALUES (?,?,?)
    ON CONFLICT(VideoId) DO UPDATE SET Revision=YoutubeInbox.Revision+1, NextAttemptAt=excluded.NextAttemptAt
    WHERE YoutubeInbox.ChannelId=excluded.ChannelId AND YoutubeInbox.NextAttemptAt IS NULL`)
  await env.DB.batch(videos.map(v => stmt.bind(v.videoId, v.channelId, now)))
}

interface YoutubeItem {
  id: string
  snippet?: { channelId: string; title: string; description?: string; publishedAt: string;
    thumbnails?: Record<string, { url: string; width?: number; height?: number }> }
  liveStreamingDetails?: { actualStartTime?: string; actualEndTime?: string; scheduledStartTime?: string;
    concurrentViewers?: string | number; activeLiveChatId?: string }
}

async function retry(env: Env, job: WorkRow, reason: string, now: number) {
  // Bounded per-video retries; after repeated failures probe at most every six hours.
  const delay = Math.min(6 * 60 * 60_000, 60_000 * 2 ** Math.min(job.Attempts, 9))
  await env.DB.prepare(`UPDATE YoutubeInbox SET Attempts=Attempts+1,NextAttemptAt=?,LastError=?
    WHERE VideoId=? AND Revision=?`).bind(now + delay + Math.floor(Math.random() * 10_000), reason, job.VideoId, job.Revision).run()
}

export async function processInbox(env: Env, now = Date.now()) {
  const { results: jobs } = await env.DB.prepare(`SELECT VideoId,ChannelId,Revision,Attempts FROM YoutubeInbox
    WHERE NextAttemptAt<=? ORDER BY NextAttemptAt,VideoId LIMIT 50`).bind(now).all<WorkRow>()
  if (!jobs.length) return { processed: 0, retried: 0 }
  const authors = new Map((await getAllMembers(env.DB)).map(memberRowToAuthor).map(a => [a.youtubeId, a]))
  const url = new URL('/youtube/v3/videos', env.YT_API_BASE)
  url.searchParams.set('part', 'snippet,liveStreamingDetails')
  url.searchParams.set('id', jobs.map(j => j.VideoId).join(','))
  url.searchParams.set('key', env.YOUTUBE_API_KEY)
  let items: YoutubeItem[]
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: 'manual' })
    if (!response.ok) throw new Error('upstream')
    const body = await response.json<{ items?: YoutubeItem[] }>()
    if (!Array.isArray(body.items)) throw new Error('invalid response')
    items = body.items
  } catch {
    // Never log URLs, request objects or upstream bodies containing credentials.
    for (const job of jobs) await retry(env, job, 'youtube-request-failed', now)
    return { processed: 0, retried: jobs.length }
  }
  const byId = new Map(items.map(item => [item.id, item]))
  let processed = 0
  for (const job of jobs) {
    const item = byId.get(job.VideoId)
    const author = authors.get(job.ChannelId)
    if (!author) {
      await env.DB.prepare('DELETE FROM YoutubeInbox WHERE VideoId=? AND Revision=?').bind(job.VideoId, job.Revision).run()
      continue
    }
    if (!item?.snippet) {
      // Private/deleted videos are omitted by videos.list. Retry eventual publication first.
      if (job.Attempts >= 5) {
        await env.DB.prepare("UPDATE VideoLiveStatus SET State='inactive',LastChecked=?,ScheduledStartTime=NULL,ActualStartTime=NULL,ActualEndTime=NULL WHERE VideoId=?")
          .bind(now, job.VideoId).run()
      }
      await retry(env, job, 'video-unavailable', now)
      continue
    }
    const snippet = item.snippet
    if (snippet.channelId !== job.ChannelId || typeof snippet.title !== 'string' || !Number.isFinite(Date.parse(snippet.publishedAt))) {
      await retry(env, job, 'invalid-video-metadata', now)
      continue
    }
    const thumbnail = snippet.thumbnails?.high ?? snippet.thumbnails?.medium ?? snippet.thumbnails?.default
    const video: Video = {
      id: job.VideoId, author, title: snippet.title, description: snippet.description ?? null,
      publishedAt: new Date(snippet.publishedAt), isProjectSingularity: false,
      thumbnailUrl: thumbnail?.url ?? null, thumbnailWidth: thumbnail?.width ?? null, thumbnailHeight: thumbnail?.height ?? null,
    }
    video.isProjectSingularity = isProjectSingularityVideo(video)
    const details = item.liveStreamingDetails
    const viewers = details?.concurrentViewers == null ? null : Number(details.concurrentViewers)
    const status: VideoLiveStatus = {
      videoId: video.id, state: 'inactive' as VideoLiveStatus['state'], lastChecked: now,
      actualStartTime: details?.actualStartTime ?? null, actualEndTime: details?.actualEndTime ?? null,
      scheduledStartTime: details?.scheduledStartTime ?? null, activeLiveChatId: details?.activeLiveChatId ?? null,
      concurrentViewers: viewers != null && Number.isFinite(viewers) ? viewers : null,
    }
    status.state = determineLiveStatus(status)
    await upsertVideos(env, [video])
    await ensureLiveStatusRows(env, [video.id])
    await patchVideoLiveStatus(env, [videoLiveStatusToRow(status)])
    // A delivery arriving during enrichment increments Revision and remains pending.
    await env.DB.prepare('UPDATE YoutubeInbox SET NextAttemptAt=NULL,Attempts=0,LastError=NULL WHERE VideoId=? AND Revision=?')
      .bind(job.VideoId, job.Revision).run()
    processed++
  }
  return { processed, retried: jobs.length - processed }
}
