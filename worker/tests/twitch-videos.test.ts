import { describe, it, expect } from 'vitest'
import { createRuntime } from './runtime'

const vod = (id: string, stream = 'ended-stream') => ({
  id,
  user_id: 'id-duckedgtnh',
  stream_id: stream,
  title: 'Project Singularity recording',
  description: 'A past broadcast',
  published_at: '2026-09-24T12:00:00Z',
  thumbnail_url: 'https://static-cdn.jtvnw.net/thumb-%{width}x%{height}.jpg',
  type: 'archive',
})
describe('Twitch VOD snapshots', () => {
  it('paginates, excludes current broadcasts, replaces expired entries and skips checks until due', async () => {
    const r = await createRuntime({ push: true })
    try {
      await r.db.prepare("UPDATE Members SET Twitch=NULL WHERE lower(Twitch)<>'duckedgtnh'").run()
      r.upstream.vodPages = [
        { data: [vod('1'), vod('2', 'live-stream')], pagination: { cursor: '1' } },
        { data: [vod('3')], pagination: {} },
      ]
      await r.sync()
      const kv = await r.mf.getKVNamespace('KV')
      type Snapshot = {
        nextCheckAt: number
        channels: Record<string, { videos: { videoId: string; thumbnailUrl: string }[] }>
      }
      const stored = JSON.parse((await kv.get('twitch-vods:v1'))!) as Snapshot
      expect(stored!.channels.duckedgtnh!.videos.map((v) => v.videoId)).toEqual([
        'twitch:1',
        'twitch:3',
      ])
      expect(stored!.channels.duckedgtnh!.videos[0]!.thumbnailUrl).toContain('320x180')
      expect(r.upstream.vodCalls).toBe(2)
      await r.sync()
      expect(r.upstream.vodCalls).toBe(2)
      await kv.put('twitch-vods:v1', JSON.stringify({ ...stored, nextCheckAt: 0 }))
      r.upstream.vodPages = [{ data: [vod('3')], pagination: {} }]
      await r.sync()
      const fresh = JSON.parse((await kv.get('twitch-vods:v1'))!) as Snapshot
      expect(fresh!.channels.duckedgtnh!.videos.map((v) => v.videoId)).toEqual(['twitch:3'])
      const calls = r.upstream.vodCalls
      const response = await r.mf.dispatchFetch('https://worker.invalid/twitch/videos')
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({
        videos: [{ videoId: 'twitch:3', platform: 'twitch' }],
        stale: false,
      })
      expect(r.upstream.vodCalls).toBe(calls)
    } finally {
      await r.mf.dispose()
    }
  })
  it('retains the complete previous snapshot on malformed or incomplete responses and upstream failures', async () => {
    const r = await createRuntime({ push: true })
    try {
      await r.db.prepare("UPDATE Members SET Twitch=NULL WHERE lower(Twitch)<>'duckedgtnh'").run()
      const kv = await r.mf.getKVNamespace('KV')
      r.upstream.vodPages = [{ data: [vod('1')], pagination: {} }]
      await r.sync()
      const good = JSON.parse((await kv.get('twitch-vods:v1'))!) as Record<string, unknown>
      for (const failure of ['http', 'malformed', 'cursor']) {
        await kv.put('twitch-vods:v1', JSON.stringify({ ...good, nextCheckAt: 0 }))
        r.upstream.vodStatus = failure === 'http' ? 503 : 200
        r.upstream.vodPages =
          failure === 'malformed'
            ? [{ data: [{ id: 'bad' }], pagination: {} }]
            : [
                { data: [], pagination: { cursor: '1' } },
                { data: [], pagination: { cursor: '1' } },
              ]
        await r.sync()
        const failed = JSON.parse((await kv.get('twitch-vods:v1'))!) as Record<string, unknown>
        expect(failed!.channels).toEqual(good!.channels)
        expect(failed!.failed).toBe(true)
      }
    } finally {
      await r.mf.dispose()
    }
  })
})
