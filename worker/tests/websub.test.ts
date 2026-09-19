import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRuntime, webhookSecret } from './runtime'
import { feed } from './fixtures'
import { MAX_NOTIFICATION_BYTES, topicFor, parseNotices, callbackBase } from '../src/services/youtubeWebsub'
import { env } from './fixtures'

const channel = 'UCJfAntp9CIFvjmlXeDK7Oxg'
const videoId = `${channel}-0`
const callback = 'https://worker.test.invalid/youtube/webhook/test-callback'
let runtime: Awaited<ReturnType<typeof createRuntime>>

function notification(updated = '2026-09-18T01:00:00Z', target = channel) {
  return `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><entry><yt:videoId>${videoId}</yt:videoId><yt:channelId>${target}</yt:channelId><updated>${updated}</updated><title>Untrusted notification title</title></entry></feed>`
}

async function deliver(body = notification(), algorithm = 'sha1', secret = webhookSecret) {
  return runtime.mf.dispatchFetch(callback, { method: 'POST', body, headers: {
    'X-Hub-Signature': `${algorithm}=${createHmac(algorithm, secret).update(body).digest('hex')}`,
  } })
}

async function quietSubscriptions() {
  const members = await runtime.db.prepare('SELECT YoutubeId FROM Members WHERE YoutubeId IS NOT NULL').all<{ YoutubeId: string }>()
  for (const member of members.results) {
    await runtime.db.prepare(`INSERT INTO YoutubeSubscriptions(ChannelId,CallbackId,LeaseExpiresAt,RenewAt,ReconcileAt)
      VALUES (?,?,?,?,?)`).bind(member.YoutubeId, member.YoutubeId === channel ? 'test-callback' : member.YoutubeId,
      Date.now() + 86400_000, Date.now() + 86400_000, Date.now() + 86400_000).run()
  }
}

async function job() {
  return runtime.db.prepare('SELECT * FROM YoutubeInbox WHERE VideoId=?').bind(videoId)
    .first<{ Revision: number; NextAttemptAt: number | null; Attempts: number; LastError: string | null; EventUpdatedAt: number }>()
}

describe('YouTube push through the actual Worker and D1', () => {
  beforeEach(async () => { runtime = await createRuntime({ push: true }); await quietSubscriptions() })
  afterEach(async () => {
    const unexpected = runtime.upstream.unexpected
    await runtime.mf.dispose()
    expect(unexpected).toEqual([])
  })

  it('verifies a pending subscription and records the granted lease', async () => {
    await runtime.db.prepare('UPDATE YoutubeSubscriptions SET PendingUntil=? WHERE ChannelId=?').bind(Date.now() + 60_000, channel).run()
    const params = new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.topic': topicFor(channel), 'hub.challenge': 'a+b & c', 'hub.lease_seconds': '3600' })
    const response = await runtime.mf.dispatchFetch(`${callback}?${params}`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('a+b & c')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const sub = await runtime.db.prepare('SELECT * FROM YoutubeSubscriptions WHERE ChannelId=?').bind(channel).first<{ PendingUntil: number; LeaseExpiresAt: number; RenewAt: number }>()
    expect(sub!.PendingUntil).toBe(0)
    expect(sub!.LeaseExpiresAt - sub!.RenewAt).toBe(720_000)
    expect(sub!.LeaseExpiresAt).toBeGreaterThan(Date.now() + 3_500_000)
  })

  it.each(['not-pending', 'wrong-topic', 'wrong-mode', 'invalid-lease'])('rejects verification: %s', async reason => {
    if (reason !== 'not-pending') await runtime.db.prepare('UPDATE YoutubeSubscriptions SET PendingUntil=?').bind(Date.now() + 60_000).run()
    const params = new URLSearchParams({ 'hub.mode': reason === 'wrong-mode' ? 'unsubscribe' : 'subscribe',
      'hub.topic': topicFor(reason === 'wrong-topic' ? 'other' : channel), 'hub.challenge': 'challenge',
      'hub.lease_seconds': reason === 'invalid-lease' ? '-1' : '3600' })
    expect((await runtime.mf.dispatchFetch(`${callback}?${params}`)).status).toBe(404)
  })

  it.each(['sha1', 'sha256'])('durably accepts %s signatures without doing enrichment in the request', async algorithm => {
    const response = await deliver(notification(), algorithm)
    expect(response.status).toBe(204)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await runtime.count('YoutubeInbox')).toBe(1)
    expect((await job())!.NextAttemptAt).not.toBeNull()
    expect(runtime.upstream.calls.youtube).toBe(0)
    expect(await runtime.count('Videos')).toBe(0)
  })

  it('acknowledges and discards unsigned, invalid and tampered signatures', async () => {
    expect((await runtime.mf.dispatchFetch(callback, { method: 'POST', body: notification() })).status).toBe(204)
    expect((await deliver(notification(), 'sha1', 'wrong-secret')).status).toBe(204)
    const signature = createHmac('sha1', webhookSecret).update(notification()).digest('hex')
    expect((await runtime.mf.dispatchFetch(callback, { method: 'POST', body: notification() + ' ', headers: { 'X-Hub-Signature': `sha1=${signature}` } })).status).toBe(204)
    expect(await runtime.count('YoutubeInbox')).toBe(0)
  })

  it('rejects oversized, malformed, entity-bearing and wrong-channel notifications', async () => {
    expect((await deliver('x'.repeat(MAX_NOTIFICATION_BYTES + 1))).status).toBe(413)
    for (const xml of ['<feed><entry></feed>', '<!DOCTYPE feed [<!ENTITY e "bad">]><feed>&e;</feed>', notification(undefined, 'unknown-channel')]) {
      expect((await deliver(xml)).status).toBe(400)
    }
    expect(await runtime.count('YoutubeInbox')).toBe(0)
  })

  it('rejects unknown callbacks and expired subscriptions', async () => {
    expect((await runtime.mf.dispatchFetch(callback + '-unknown', { method: 'POST', body: notification() })).status).toBe(404)
    await runtime.db.prepare('UPDATE YoutubeSubscriptions SET LeaseExpiresAt=0').run()
    expect((await deliver()).status).toBe(404)
    expect(await runtime.count('YoutubeInbox')).toBe(0)
  })

  it('returns a retryable failure when persistence fails', async () => {
    await runtime.db.prepare('DROP TABLE YoutubeInbox').run()
    expect((await deliver()).status).toBe(503)
    expect(runtime.upstream.calls.youtube).toBe(0)
  })

  it('deduplicates completed events and ignores older deliveries', async () => {
    await deliver()
    await runtime.sync()
    expect((await job())!.NextAttemptAt).toBeNull()
    await deliver()
    await deliver(notification('2026-09-17T00:00:00Z'))
    expect((await job())!.Revision).toBe(1)
    expect((await job())!.NextAttemptAt).toBeNull()
    await runtime.sync()
    expect(runtime.upstream.calls.youtube).toBe(1)
  })

  it('enriches authoritative metadata and publishes the existing API contract', async () => {
    runtime.upstream.title = 'Project Singularity authoritative title'
    await deliver()
    await runtime.sync()
    expect(await runtime.count('Videos')).toBe(1)
    const stored = await runtime.db.prepare('SELECT Title,Description,ThumbnailWidth FROM Videos WHERE VideoId=?').bind(videoId).first()
    expect(stored).toEqual({ Title: runtime.upstream.title, Description: 'Authoritative description', ThumbnailWidth: 480 })
    expect((await job())!.NextAttemptAt).toBeNull()
    expect(runtime.upstream.calls).toMatchObject({ atom: 0, youtube: 1 })
    const response = await runtime.mf.dispatchFetch('https://worker.test.invalid/youtube/videos')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ videos: [{ videoId, title: runtime.upstream.title, state: 'video' }] })
  })

  it('preserves an event arriving while an earlier revision is enriched', async () => {
    await deliver()
    runtime.upstream.onYoutube = async () => {
      await runtime.db.prepare('UPDATE YoutubeInbox SET Revision=Revision+1,NextAttemptAt=?,EventUpdatedAt=EventUpdatedAt+1 WHERE VideoId=?').bind(Date.now(), videoId).run()
    }
    await runtime.sync()
    expect((await job())!.Revision).toBe(2)
    expect((await job())!.NextAttemptAt).not.toBeNull()
    runtime.upstream.onYoutube = undefined
    await runtime.sync()
    expect((await job())!.NextAttemptAt).toBeNull()
  })

  it.each([503, 429, 302])('backs off API status %s, then recovers without losing the event', async status => {
    runtime.upstream.youtubeStatus = status
    await deliver()
    await runtime.sync()
    expect(await job()).toMatchObject({ Attempts: 1, LastError: 'youtube-request-failed' })
    expect((await job())!.NextAttemptAt).toBeGreaterThan(Date.now() + 50_000)
    await runtime.sync()
    expect(runtime.upstream.calls.youtube).toBe(1)
    await runtime.db.prepare('UPDATE YoutubeInbox SET NextAttemptAt=0').run()
    runtime.upstream.youtubeStatus = 200
    await runtime.sync()
    expect(await job()).toMatchObject({ Attempts: 0, NextAttemptAt: null, LastError: null })
  })

  it('retries omitted videos and rejects metadata belonging to a different channel', async () => {
    runtime.upstream.omittedIds.add(videoId)
    await deliver()
    await runtime.sync()
    expect(await job()).toMatchObject({ Attempts: 1, LastError: 'video-unavailable' })
    runtime.upstream.omittedIds.clear()
    runtime.upstream.channelOverride = 'different-channel'
    await runtime.db.prepare('UPDATE YoutubeInbox SET NextAttemptAt=0').run()
    await runtime.sync()
    expect(await job()).toMatchObject({ Attempts: 2, LastError: 'invalid-video-metadata' })
    expect(await runtime.count('Videos')).toBe(0)
  })

  it('checks persisted upcoming/live videos even when they are absent from feeds', async () => {
    runtime.upstream.phase = 'upcoming'
    await deliver()
    await runtime.sync()
    expect(await runtime.db.prepare('SELECT State FROM VideoLiveStatus').first('State')).toBe('inactive')
    runtime.upstream.phase = 'live'
    await runtime.db.prepare('UPDATE VideoLiveStatus SET LastChecked=0').run()
    await runtime.sync()
    expect(await runtime.db.prepare('SELECT State FROM VideoLiveStatus').first('State')).toBe('live')
    runtime.upstream.phase = 'ended'
    await runtime.db.prepare('UPDATE VideoLiveStatus SET LastChecked=0').run()
    await runtime.sync()
    expect(await runtime.db.prepare('SELECT State FROM VideoLiveStatus').first('State')).toBe('video')
    await runtime.sync()
    expect(runtime.upstream.calls).toMatchObject({ atom: 0, youtube: 3 })
  })

  it('reconciles one due channel then leaves it alone until the next sweep', async () => {
    await runtime.db.prepare('UPDATE YoutubeSubscriptions SET ReconcileAt=0 WHERE ChannelId=?').bind(channel).run()
    await runtime.sync()
    expect(runtime.upstream.calls).toMatchObject({ atom: 1, youtube: 1 })
    expect(await runtime.count('Videos')).toBe(1)
    await runtime.sync()
    expect(runtime.upstream.calls).toMatchObject({ atom: 1, youtube: 1 })
  })

  it('continues processing deliveries when reconciliation fails', async () => {
    runtime.upstream.failedChannels.add(channel)
    await runtime.db.prepare('UPDATE YoutubeSubscriptions SET ReconcileAt=0 WHERE ChannelId=?').bind(channel).run()
    await deliver()
    await runtime.sync()
    expect(await runtime.count('Videos')).toBe(1)
    expect((await job())!.NextAttemptAt).toBeNull()
  })

  it('renews due leases using the persisted callback and does not repeat immediately', async () => {
    await runtime.db.prepare('UPDATE YoutubeSubscriptions SET RenewAt=0 WHERE ChannelId=?').bind(channel).run()
    await runtime.sync()
    expect(runtime.upstream.subscriptions).toHaveLength(1)
    const sent = runtime.upstream.subscriptions[0]!
    expect(sent.get('hub.callback')).toBe(callback)
    expect(sent.get('hub.topic')).toBe(topicFor(channel))
    expect(sent.get('hub.secret')).toBe(webhookSecret)
    expect(sent.get('hub.verify')).toBe('async')
    const pending = await runtime.db.prepare('SELECT PendingUntil FROM YoutubeSubscriptions WHERE ChannelId=?').bind(channel).first<number>('PendingUntil')
    expect(pending).toBeGreaterThan(Date.now())
    await runtime.sync()
    expect(runtime.upstream.subscriptions).toHaveLength(1)
  })

  it('backs off hub failures without blocking inbox processing', async () => {
    runtime.upstream.hubStatus = 503
    await runtime.db.prepare('UPDATE YoutubeSubscriptions SET RenewAt=0 WHERE ChannelId=?').bind(channel).run()
    await deliver()
    await runtime.sync()
    expect(await runtime.count('Videos')).toBe(1)
    expect(await runtime.db.prepare('SELECT LastError FROM YoutubeSubscriptions WHERE ChannelId=?').bind(channel).first('LastError')).toBe('subscription-http-503')
    await runtime.sync()
    expect(runtime.upstream.subscriptions).toHaveLength(1)
  })

  it('skips processing under a held lease and recovers an expired lease', async () => {
    await deliver()
    await runtime.db.prepare("INSERT INTO WorkerLeases VALUES ('youtube','another-run',?)").bind(Date.now() + 60_000).run()
    await runtime.sync()
    expect(runtime.upstream.calls.youtube).toBe(0)
    await runtime.db.prepare('UPDATE WorkerLeases SET ExpiresAt=0').run()
    await runtime.sync()
    expect(runtime.upstream.calls.youtube).toBe(1)
    expect(await runtime.db.prepare('SELECT COUNT(*) AS n FROM WorkerLeases').first('n')).toBe(0)
  })

  it('bootstraps subscriptions gradually from the member list', async () => {
    await runtime.db.prepare('DELETE FROM YoutubeSubscriptions').run()
    await runtime.sync()
    expect(await runtime.count('YoutubeSubscriptions')).toBe(15)
    expect(runtime.upstream.subscriptions).toHaveLength(2)
    expect(runtime.upstream.calls).toMatchObject({ atom: 1, youtube: 1 })
    await runtime.sync()
    expect(await runtime.count('YoutubeSubscriptions')).toBe(15)
    expect(runtime.upstream.subscriptions).toHaveLength(4)
    expect(runtime.upstream.calls).toMatchObject({ atom: 2, youtube: 2 })
  })

  it('bounds backlog processing to one request of 50 IDs per tick', async () => {
    const inserts = Array.from({ length: 51 }, (_, i) => runtime.db.prepare(
      'INSERT INTO YoutubeInbox(VideoId,ChannelId,NextAttemptAt) VALUES (?,?,0)',
    ).bind(`${channel}-${i}`, channel))
    await runtime.db.batch(inserts)
    await runtime.sync()
    expect(await runtime.count('Videos')).toBe(50)
    expect(runtime.upstream.calls.youtube).toBe(1)
    expect(await runtime.db.prepare('SELECT COUNT(*) AS n FROM YoutubeInbox WHERE NextAttemptAt IS NOT NULL').first('n')).toBe(1)
    await runtime.sync()
    expect(await runtime.count('Videos')).toBe(51)
    expect(runtime.upstream.calls.youtube).toBe(2)
  })

  it('accepts newer updates and refreshes metadata and the project flag', async () => {
    await deliver()
    await runtime.sync()
    runtime.upstream.title = 'An unrelated game'
    await deliver(notification('2026-09-18T02:00:00Z'))
    await runtime.sync()
    expect(await runtime.count('Videos')).toBe(1)
    expect(await runtime.db.prepare('SELECT Title,IsProjectSingularity FROM Videos').first()).toEqual({ Title: 'An unrelated game', IsProjectSingularity: 0 })
    expect(await job()).toMatchObject({ Revision: 2, NextAttemptAt: null })
  })

  it('stops showing a repeatedly unavailable stream as live while retaining a slow recovery probe', async () => {
    runtime.upstream.phase = 'live'
    await deliver()
    await runtime.sync()
    runtime.upstream.omittedIds.add(videoId)
    await runtime.db.prepare('UPDATE YoutubeInbox SET Attempts=5,NextAttemptAt=0').run()
    await runtime.sync()
    expect(await runtime.db.prepare('SELECT State FROM VideoLiveStatus').first('State')).toBe('inactive')
    expect(await job()).toMatchObject({ Attempts: 6, LastError: 'video-unavailable' })
    expect((await job())!.NextAttemptAt).toBeGreaterThan(Date.now() + 30 * 60_000)
  })

  it('revokes live status on the first omitted response and recovers when available again', async () => {
    runtime.upstream.phase = 'live'
    await deliver()
    await runtime.sync()
    runtime.upstream.omittedIds.add(videoId)
    await runtime.db.prepare('UPDATE YoutubeInbox SET NextAttemptAt=0').run()
    await runtime.sync()
    expect(await runtime.db.prepare('SELECT State FROM VideoLiveStatus').first('State')).toBe('inactive')
    expect(await job()).toMatchObject({ Attempts: 1, LastError: 'video-unavailable' })
    runtime.upstream.omittedIds.clear()
    runtime.upstream.phase = 'ended'
    await runtime.db.prepare('UPDATE YoutubeInbox SET NextAttemptAt=0').run()
    await runtime.sync()
    expect(await runtime.db.prepare('SELECT State FROM VideoLiveStatus').first('State')).toBe('video')
    expect(await job()).toMatchObject({ Attempts: 0, NextAttemptAt: null })
  })

  it('does not duplicate enrichment during overlapping scheduled runs', async () => {
    await deliver()
    await Promise.all([runtime.sync(), runtime.sync()])
    expect(runtime.upstream.calls.youtube).toBe(1)
    expect((await job())!.NextAttemptAt).toBeNull()
  })
})

describe('notification parsing', () => {
  it('rejects insecure or ambiguous callback configuration and short secrets', () => {
    const configured = { ...env, YOUTUBE_CALLBACK_URL: 'https://worker.test.invalid/youtube/webhook', YOUTUBE_WEBHOOK_SECRET: webhookSecret }
    expect(callbackBase(configured)).toBe(configured.YOUTUBE_CALLBACK_URL)
    for (const url of ['http://worker.test.invalid/youtube/webhook', 'https://user:pass@worker.test.invalid/youtube/webhook', 'https://worker.test.invalid/wrong', configured.YOUTUBE_CALLBACK_URL + '?token=secret']) {
      expect(() => callbackBase({ ...configured, YOUTUBE_CALLBACK_URL: url })).toThrow()
    }
    expect(() => callbackBase({ ...configured, YOUTUBE_WEBHOOK_SECRET: 'short' })).toThrow()
  })
  it('handles feed reconciliation and signed tombstones without trusting embedded URLs', () => {
    expect(parseNotices(feed(channel), channel)[0]!.videoId).toBe(videoId)
    expect(parseNotices(`<feed xmlns:at="http://purl.org/atompub/tombstones/1.0"><at:deleted-entry ref="yt:video:${videoId}" when="2026-01-01T00:00:00Z"/></feed>`, channel)).toEqual([
      { videoId, channelId: channel, updatedAt: Date.parse('2026-01-01T00:00:00Z') },
    ])
  })
  it('preserves numeric-looking IDs and rejects missing dates', () => {
    expect(parseNotices(notification().replaceAll(videoId, '12345678901'), channel)[0]!.videoId).toBe('12345678901')
    expect(() => parseNotices(notification('invalid-date'), channel)).toThrow()
  })
})
