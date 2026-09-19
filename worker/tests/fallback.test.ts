import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRuntime } from './runtime'

let runtime: Awaited<ReturnType<typeof createRuntime>>
const channel = 'UCJfAntp9CIFvjmlXeDK7Oxg'

describe('API fallback through scheduled Worker and real D1', () => {
  beforeEach(async () => {
    runtime = await createRuntime({ push: true, fallback: true })
    await runtime.db.prepare(`INSERT INTO YoutubeSubscriptions(ChannelId,CallbackId,RenewAt,ReconcileAt)
      SELECT YoutubeId,YoutubeId,?,? FROM Members WHERE YoutubeId IS NOT NULL`)
      .bind(Date.now() + 86400_000, Date.now() + 86400_000).run()
  })
  afterEach(async () => {
    await runtime.mf.dispose()
    expect(runtime.upstream.unexpected).toEqual([])
  })
  it('loads all 15 creators on the first tick and does not poll again before ten minutes', async () => {
    const before = Date.now()
    await runtime.sync()
    expect(runtime.upstream.calls.playlists).toBe(15)
    expect(await runtime.count('Videos')).toBe(15)
    const state = await runtime.db.prepare('SELECT PollAt,LastPollAt FROM YoutubeSubscriptions WHERE ChannelId=?')
      .bind(channel).first<{ PollAt: number; LastPollAt: number }>()
    expect(state!.LastPollAt).toBeGreaterThanOrEqual(before)
    expect(state!.PollAt - state!.LastPollAt).toBe(600_000)
    await runtime.sync()
    expect(runtime.upstream.calls.playlists).toBe(15)
  })
  it('reuses cached playlists and does not re-enrich unchanged discoveries', async () => {
    await runtime.sync()
    await runtime.db.prepare('UPDATE YoutubeSubscriptions SET PollAt=0').run()
    await runtime.sync()
    expect(runtime.upstream.calls.channels).toBe(15)
    expect(runtime.upstream.calls.playlists).toBe(30)
    expect(runtime.upstream.calls.youtube).toBe(1)
  })
  it('stops polling only when both feed health and a verified lease are present', async () => {
    await runtime.db.prepare('UPDATE YoutubeSubscriptions SET FeedHealthy=1,LeaseExpiresAt=?').bind(Date.now() + 86400_000).run()
    await runtime.sync()
    expect(runtime.upstream.calls.playlists).toBe(0)
    await runtime.db.prepare('UPDATE YoutubeSubscriptions SET FeedHealthy=0 WHERE ChannelId=?').bind(channel).run()
    await runtime.sync()
    expect(runtime.upstream.calls.playlists).toBe(1)
    await runtime.db.prepare('UPDATE YoutubeSubscriptions SET FeedHealthy=1,LeaseExpiresAt=0,PollAt=0 WHERE ChannelId=?').bind(channel).run()
    await runtime.sync()
    expect(runtime.upstream.calls.playlists).toBe(2)
  })
  it('detects a failed feed, polls immediately, and stops again after feed recovery', async () => {
    await runtime.db.prepare('UPDATE YoutubeSubscriptions SET FeedHealthy=1,LeaseExpiresAt=?').bind(Date.now() + 86400_000).run()
    await runtime.db.prepare('UPDATE YoutubeSubscriptions SET ReconcileAt=0 WHERE ChannelId=?').bind(channel).run()
    runtime.upstream.failedChannels.add(channel)
    await runtime.sync()
    const state = await runtime.db.prepare('SELECT FeedCheckedAt,ReconcileAt,FeedError FROM YoutubeSubscriptions WHERE ChannelId=?')
      .bind(channel).first<{ FeedCheckedAt: number; ReconcileAt: number; FeedError: string }>()
    expect(state!.ReconcileAt - state!.FeedCheckedAt).toBe(1800_000)
    expect(state!.FeedError).toBe('reconciliation-http-503')
    expect(runtime.upstream.calls.playlists).toBe(1)
    runtime.upstream.failedChannels.clear()
    await runtime.db.prepare('UPDATE YoutubeSubscriptions SET ReconcileAt=0,PollAt=0 WHERE ChannelId=?').bind(channel).run()
    await runtime.sync()
    expect(runtime.upstream.calls.playlists).toBe(1)
  })
  it('backs off API errors without clearing feed errors, then recovers', async () => {
    runtime.upstream.playlistStatus = 403
    await runtime.sync()
    expect(await runtime.count('Videos')).toBe(0)
    expect((await runtime.db.prepare('SELECT PollError FROM YoutubeSubscriptions WHERE ChannelId=?')
      .bind(channel).first<{ PollError: string }>())!.PollError).toBe('poll-http-403')
    await runtime.sync()
    expect(runtime.upstream.calls.playlists).toBe(15)
    runtime.upstream.playlistStatus = 200
    await runtime.db.prepare('UPDATE YoutubeSubscriptions SET PollAt=0').run()
    await runtime.sync()
    expect(await runtime.count('Videos')).toBe(15)
  })
  it('does not mark malformed responses as successful polls', async () => {
    runtime.upstream.malformedPlaylist = true
    await runtime.sync()
    expect(await runtime.count('YoutubeInbox')).toBe(0)
    expect((await runtime.db.prepare('SELECT LastPollAt FROM YoutubeSubscriptions WHERE ChannelId=?')
      .bind(channel).first<{ LastPollAt: number | null }>())!.LastPollAt).toBeNull()
  })
})
