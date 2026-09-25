import type { Env } from '../env'
import { fetchAtomFeed } from './youtubeService'
import { callbackBase, parseNotices, renewSubscriptions } from './youtubeWebsub'
import { enqueueNotices, enqueueRefresh, processInbox } from './youtubeInbox'
import { failureReason } from '../utils/upstream'
import { pollFallback } from './youtubeFallback'

const MINUTE = 60_000

/** A single cron owns enrichment; webhooks only append durable work. */
export async function maintainYoutube(env: Env, now = Date.now()) {
  callbackBase(env)
  const token = crypto.randomUUID()
  const lease = await env.DB.prepare(`INSERT INTO WorkerLeases(Name,Token,ExpiresAt) VALUES ('youtube',?,?)
    ON CONFLICT(Name) DO UPDATE SET Token=excluded.Token,ExpiresAt=excluded.ExpiresAt
    WHERE WorkerLeases.ExpiresAt<=? RETURNING Token`).bind(token, now + 5 * MINUTE, now).first<{ Token: string }>()
  if (!lease) return
  try {
    const { results: missing } = await env.DB.prepare(`SELECT m.YoutubeId FROM Members m
      LEFT JOIN YoutubeSubscriptions s ON s.ChannelId=m.YoutubeId
      WHERE m.YoutubeId IS NOT NULL AND m.YoutubeId<>'' AND s.ChannelId IS NULL`).all<{ YoutubeId: string }>()
    for (const member of missing) {
      await env.DB.prepare('INSERT OR IGNORE INTO YoutubeSubscriptions(ChannelId,CallbackId) VALUES (?,?)')
        .bind(member.YoutubeId, crypto.randomUUID()).run()
    }
    await renewSubscriptions(env, now)

    // A verified lease proves subscription acceptance, not delivery of every event.
    // Check healthy feeds every ten minutes too. Bound work to 15 channels / 3 fetches
    // at once. The second condition also shortens legacy six-hour schedules on deploy.
    const { results: feeds } = await env.DB.prepare(`SELECT s.ChannelId FROM YoutubeSubscriptions s JOIN Members m ON m.YoutubeId=s.ChannelId
      WHERE s.ReconcileAt<=? OR (s.FeedHealthy=1 AND (s.FeedCheckedAt IS NULL OR s.FeedCheckedAt<=?))
      ORDER BY COALESCE(s.FeedCheckedAt,0),s.ChannelId LIMIT 15`)
      .bind(now, now - 10 * MINUTE).all<{ ChannelId: string }>()
    async function reconcile(sub: { ChannelId: string }) {
      try {
        const notices = parseNotices(await fetchAtomFeed(env, sub.ChannelId), sub.ChannelId)
        // Replayed feed entries should not re-enrich every video or rewrite its metadata.
        await enqueueNotices(env, notices, now)
        await env.DB.prepare(`UPDATE YoutubeSubscriptions SET ReconcileAt=?,FeedHealthy=1,FeedCheckedAt=?,FeedError=NULL
          WHERE ChannelId=?`)
          .bind(now + 10 * MINUTE, now, sub.ChannelId).run()
        console.info(JSON.stringify({ operation: 'youtube-reconcile', channelId: sub.ChannelId,
          result: 'ok', entries: notices.length, nextCheckAt: now + 10 * MINUTE }))
      } catch (error) {
        // A failing feed does not prevent processing webhook deliveries or other channels.
        const reason = `reconciliation-${failureReason(error)}`
        console.warn(JSON.stringify({ operation: 'youtube-reconcile', channelId: sub.ChannelId, reason }))
        await env.DB.prepare(`UPDATE YoutubeSubscriptions SET ReconcileAt=?,LastError=?,FeedHealthy=0,FeedCheckedAt=?,FeedError=?
          WHERE ChannelId=?`)
          .bind(now + 30 * MINUTE, reason, now, reason, sub.ChannelId).run()
      }
    }
    for (let i = 0; i < feeds.length; i += 3) await Promise.all(feeds.slice(i, i + 3).map(reconcile))

    await pollFallback(env, now)

    // YouTube push does not guarantee start/end events. Track these from persisted state,
    // even after a video disappears from the channel's recent Atom feed.
    const { results: due } = await env.DB.prepare(`SELECT v.VideoId,m.YoutubeId FROM VideoLiveStatus s
      JOIN Videos v ON v.VideoId=s.VideoId JOIN Members m ON m.MemberId=v.MemberId
      WHERE (s.State='live' AND s.LastChecked<=?) OR
        (s.State='inactive' AND s.ScheduledStartTime IS NOT NULL AND s.LastChecked<=
          CASE WHEN s.ScheduledStartTime<=? THEN ? ELSE ? END)
      ORDER BY s.LastChecked,v.VideoId LIMIT 50`)
      .bind(now - 2 * MINUTE, new Date(now + 15 * MINUTE).toISOString(), now - 2 * MINUTE, now - 30 * MINUTE)
      .all<{ VideoId: string; YoutubeId: string }>()
    await enqueueRefresh(env, due.map(v => ({ videoId: v.VideoId, channelId: v.YoutubeId })), now)
    await processInbox(env, now)
  } finally {
    await env.DB.prepare("DELETE FROM WorkerLeases WHERE Name='youtube' AND Token=?").bind(token).run()
  }
}
