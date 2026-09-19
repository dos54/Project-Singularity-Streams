import type { Env } from '../env'
import { fetchUpstream, failureReason } from '../utils/upstream'

interface PollChannel { ChannelId: string; UploadsPlaylistId: string | null }

async function api<T>(env: Env, resource: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`/youtube/v3/${resource}`, env.YT_API_BASE)
  url.search = new URLSearchParams({ ...params, key: env.YOUTUBE_API_KEY }).toString()
  return (await fetchUpstream(url)).json<T>()
}

export async function pollFallback(env: Env, now: number) {
  if (env.YOUTUBE_FALLBACK_ENABLED !== 'true') return
  // All current 15 creators can bootstrap on the first tick. Bound growth and concurrency.
  const { results } = await env.DB.prepare(`SELECT s.ChannelId,s.UploadsPlaylistId
    FROM YoutubeSubscriptions s JOIN Members m ON m.YoutubeId=s.ChannelId
    WHERE s.PollAt<=? AND (s.LeaseExpiresAt<=? OR s.FeedHealthy=0)
    ORDER BY s.PollAt,s.ChannelId LIMIT 15`).bind(now, now).all<PollChannel>()
  async function poll(sub: PollChannel) {
    // Reserve the next attempt before making requests; failures also wait ten minutes.
    await env.DB.prepare('UPDATE YoutubeSubscriptions SET PollAt=? WHERE ChannelId=?')
      .bind(now + 10 * 60_000, sub.ChannelId).run()
    try {
      let playlist = sub.UploadsPlaylistId
      if (!playlist) {
        const body = await api<{ items?: { id: string; contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] }>(
          env, 'channels', { part: 'contentDetails', id: sub.ChannelId })
        playlist = body.items?.find(item => item.id === sub.ChannelId)?.contentDetails?.relatedPlaylists?.uploads ?? null
        if (typeof playlist !== 'string' || !playlist) throw new Error('Missing uploads playlist')
        await env.DB.prepare('UPDATE YoutubeSubscriptions SET UploadsPlaylistId=? WHERE ChannelId=?')
          .bind(playlist, sub.ChannelId).run()
      }
      const body = await api<{ items?: { contentDetails?: { videoId?: string } }[] }>(env, 'playlistItems', {
        part: 'contentDetails', playlistId: playlist, maxResults: '50',
      })
      if (!Array.isArray(body.items)) throw new Error('Invalid playlist response')
      const ids = [...new Set(body.items.map(item => item.contentDetails?.videoId))]
      if (ids.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id))) throw new Error('Invalid video ID')
      // Existing jobs retain their retry schedule; completed discoveries need no rewrite.
      // Live checks and the slower feed reconciliation handle known-video updates.
      if (ids.length) await env.DB.prepare(`INSERT OR IGNORE INTO YoutubeInbox(VideoId,ChannelId,NextAttemptAt)
        SELECT value,?,? FROM json_each(?)`).bind(sub.ChannelId, now, JSON.stringify(ids)).run()
      await env.DB.prepare('UPDATE YoutubeSubscriptions SET LastPollAt=?,PollError=NULL WHERE ChannelId=?')
        .bind(now, sub.ChannelId).run()
      console.info(JSON.stringify({ operation: 'youtube-fallback', channelId: sub.ChannelId, result: 'ok', videos: ids.length }))
    } catch (error) {
      const reason = `poll-${failureReason(error)}`
      await env.DB.prepare('UPDATE YoutubeSubscriptions SET PollError=? WHERE ChannelId=?').bind(reason, sub.ChannelId).run()
      console.warn(JSON.stringify({ operation: 'youtube-fallback', channelId: sub.ChannelId, reason }))
    }
  }
  for (let i = 0; i < results.length; i += 3) await Promise.all(results.slice(i, i + 3).map(poll))
}
