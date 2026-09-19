import { describe, expect, it } from 'vitest'
import { createRuntime } from './runtime'

describe('request cost guards', () => {
  it('rejects unused methods and path variants before accessing storage or upstreams', async () => {
    const runtime = await createRuntime()
    try {
      await runtime.db.prepare('DROP TABLE Members').run()
      for (const path of ['/members/anything', '/youtube/videos/anything', '/twitch/livestreams/anything']) {
        expect((await runtime.mf.dispatchFetch(`https://worker.invalid${path}`)).status).toBe(404)
      }
      expect((await runtime.mf.dispatchFetch('https://worker.invalid/twitch/livestreams', { method: 'POST' })).status).toBe(405)
      expect(runtime.upstream.calls.twitch).toBe(0)
    } finally { await runtime.mf.dispose() }
  })
  it('query strings and credentials cannot bypass the anonymous snapshot cache', async () => {
    const runtime = await createRuntime()
    try {
      const first = await runtime.mf.dispatchFetch('https://worker.invalid/members?random=1')
      expect(first.status).toBe(200)
      expect(first.headers.get('Cache-Control')).toContain('max-age=3600')
      await first.text()
      await runtime.db.prepare('DROP TABLE Members').run()
      const cached = await runtime.mf.dispatchFetch('https://worker.invalid/members?random=2', {
        headers: { Cookie: 'bypass=1', Authorization: 'Bearer unused' },
      })
      expect(cached.status).toBe(200)
      const head = await runtime.mf.dispatchFetch('https://worker.invalid/members', { method: 'HEAD' })
      expect(head.status).toBe(200)
      expect(await head.text()).toBe('')
    } finally { await runtime.mf.dispose() }
  })
  it('the manual kill switch stops reads, webhooks, and scheduled ingestion', async () => {
    const runtime = await createRuntime({ push: true, fallback: true, disabled: true })
    try {
      await runtime.db.prepare('DROP TABLE Members').run()
      for (const path of ['/members', '/youtube/webhook/test', '/youtube/diagnostic/test']) {
        expect((await runtime.mf.dispatchFetch(`https://worker.invalid${path}`)).status).toBe(404)
      }
      await runtime.sync()
      expect(runtime.upstream.calls).toEqual({ atom: 0, youtube: 0, twitch: 0, token: 0, channels: 0, playlists: 0 })
    } finally { await runtime.mf.dispose() }
  })
})
