import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRuntime } from './runtime'

describe('Worker + real local D1 + mocked upstream services', () => {
  let runtime: Awaited<ReturnType<typeof createRuntime>>
  beforeEach(async () => {
    runtime = await createRuntime()
  })
  afterEach(async () => {
    if (runtime) {
      await runtime.mf.dispose()
      expect(runtime.upstream.unexpected).toEqual([])
    }
  })

  it('applies migrations and serves all 15 members with CORS and JSON', async () => {
    const response = await runtime.mf.dispatchFetch('http://local/members')
    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Content-Type')).toBe('application/json')
    const body = (await response.json()) as { members: { alias: string }[] }
    expect(body.members).toHaveLength(15)
    expect(body.members.some((member) => member.alias === 'Aspect')).toBe(true)
    expect(runtime.upstream.calls).toEqual({ atom: 0, youtube: 0, twitch: 0, token: 0, channels: 0, playlists: 0 })
  })

  it('handles preflight without database/provider work and returns 404 for unknown routes', async () => {
    const response = await runtime.mf.dispatchFetch('http://local/youtube/videos', {
      method: 'OPTIONS',
      headers: { 'Access-Control-Request-Headers': 'Content-Type' },
    })
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
    expect((await runtime.mf.dispatchFetch('http://local/missing')).status).toBe(404)
    expect(runtime.upstream.calls.atom).toBe(0)
  })

  it.each([
    { table: 'Videos', path: '/youtube/videos' },
    { table: 'Members', path: '/members' },
  ])('returns an uncached JSON server error when $path database queries fail', async ({ table, path }) => {
    await runtime.db.prepare(`ALTER TABLE ${table} RENAME TO UnavailableTable`).run()
    const response = await runtime.mf.dispatchFetch(`http://local${path}`)
    expect(response.status).toBe(500)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(await response.json()).toMatchObject({ error: expect.any(String) })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await runtime.db.prepare(`ALTER TABLE UnavailableTable RENAME TO ${table}`).run()
    expect((await runtime.mf.dispatchFetch(`http://local${path}`)).status).toBe(200)
  })

  it('runs the actual scheduled entry point and serves sorted persisted videos', async () => {
    runtime.upstream.entriesPerChannel = 2
    await runtime.sync()
    expect(await runtime.count('Videos')).toBe(30)
    expect(await runtime.count('VideoLiveStatus')).toBe(30)
    const response = await runtime.mf.dispatchFetch('http://local/youtube/videos')
    const { videos } = (await response.json()) as {
      videos: { publishedAt: string; isProjectSingularity: boolean; state: string }[]
    }
    expect(videos).toHaveLength(30)
    expect(videos.every((v) => v.isProjectSingularity && v.state === 'video')).toBe(true)
    const dates = videos.map((v) => v.publishedAt)
    expect(dates).toEqual([...dates].sort().reverse())
    expect(runtime.upstream.calls).toEqual({ atom: 15, youtube: 1, twitch: 0, token: 0, channels: 0, playlists: 0 })
  })

  it('keeps repeated unchanged imports idempotent and avoids extra status API calls', async () => {
    await runtime.sync()
    await runtime.db.prepare('CREATE TABLE TestWrites (VideoId TEXT)').run()
    await runtime.db
      .prepare(
        'CREATE TRIGGER TrackVideoUpdates AFTER UPDATE ON Videos BEGIN INSERT INTO TestWrites VALUES (NEW.VideoId); END',
      )
      .run()
    await runtime.sync()
    expect(await runtime.count('Videos')).toBe(15)
    expect(await runtime.count('VideoLiveStatus')).toBe(15)
    expect(
      await runtime.db.prepare('SELECT COUNT(*) AS count FROM TestWrites').first('count'),
    ).toBe(0)
    expect(runtime.upstream.calls.youtube).toBe(1)
  })

  it('updates changed metadata without duplicating videos and recalculates the project flag', async () => {
    await runtime.sync()
    runtime.upstream.title = 'A different game'
    await runtime.sync()
    expect(await runtime.count('Videos')).toBe(15)
    expect(
      await runtime.db
        .prepare('SELECT COUNT(*) AS count FROM Videos WHERE IsProjectSingularity=1')
        .first('count'),
    ).toBe(0)
    expect(await runtime.db.prepare('SELECT Title FROM Videos LIMIT 1').first('Title')).toBe(
      'A different game 0',
    )
  })

  it('continues ingestion for healthy channels when one feed fails', async () => {
    runtime.upstream.failedChannels.add('UCJfAntp9CIFvjmlXeDK7Oxg')
    await runtime.sync()
    expect(await runtime.count('Videos')).toBe(14)
    expect(runtime.upstream.calls.atom).toBe(15)
  })

  it('does no status API work for empty feeds', async () => {
    runtime.upstream.entriesPerChannel = 0
    await runtime.sync()
    expect(await runtime.count('Videos')).toBe(0)
    expect(runtime.upstream.calls.youtube).toBe(0)
  })

  it('batches a full import into no more than four status requests for 180 videos', async () => {
    runtime.upstream.entriesPerChannel = 12
    await runtime.sync()
    expect(await runtime.count('Videos')).toBe(180)
    expect(runtime.upstream.calls.youtube).toBeLessThanOrEqual(4)
    const response = await runtime.mf.dispatchFetch('http://local/youtube/videos')
    expect(((await response.json()) as { videos: unknown[] }).videos).toHaveLength(100)
  })

  it('refreshes a previously live stream into a completed video', async () => {
    runtime.upstream.phase = 'live'
    await runtime.sync()
    expect(
      await runtime.db
        .prepare("SELECT COUNT(*) FROM VideoLiveStatus WHERE State='live'")
        .first('COUNT(*)'),
    ).toBe(15)
    runtime.upstream.phase = 'ended'
    await runtime.db.prepare('UPDATE VideoLiveStatus SET LastChecked=0').run()
    await runtime.sync()
    expect(
      await runtime.db
        .prepare("SELECT COUNT(*) FROM VideoLiveStatus WHERE State='video'")
        .first('COUNT(*)'),
    ).toBe(15)
  })

  it('normalizes Twitch login casing and caches public results even with cookies', async () => {
    const first = await runtime.mf.dispatchFetch('http://local/twitch/livestreams', {
      headers: { Cookie: 'test-bypass-cache=1' },
    })
    const body = (await first.json()) as {
      liveStreams: { login: string; isLive: boolean; viewerCount: number | null }[]
    }
    expect(body.liveStreams).toHaveLength(5)
    expect(body.liveStreams.find((s) => s.login === 'duckedgtnh')).toMatchObject({
      isLive: true,
      viewerCount: 10,
      thumbnailUrl: 'https://static-cdn.jtvnw.net/previews-ttv/live_user_duckedgtnh-640x360.jpg',
    })
    expect(body.liveStreams.filter((s) => !s.isLive)).toHaveLength(4)
    await runtime.mf.dispatchFetch('http://local/twitch/livestreams', {
      headers: { Cookie: 'test-bypass-cache=1' },
    })
    expect(runtime.upstream.calls).toMatchObject({ twitch: 1, token: 1 })
  })

  it('B6: a scheduled video is rechecked when it becomes live', async () => {
    runtime.upstream.phase = 'upcoming'
    await runtime.sync()
    runtime.upstream.phase = 'live'
    await runtime.db.prepare('UPDATE VideoLiveStatus SET LastChecked=0').run()
    await runtime.sync()
    expect(
      await runtime.db
        .prepare("SELECT COUNT(*) FROM VideoLiveStatus WHERE State='live'")
        .first('COUNT(*)'),
    ).toBe(15)
  })
})
