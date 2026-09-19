import { describe, expect, it, vi } from 'vitest'
import { env } from './fixtures'
import { handleDiagnosticSubscriber } from '../src/services/youtubeDiagnostic'

const path = '/youtube/diagnostic/test-subscriber'
const bindings = () => ({ ...env, ENVIRONMENT: 'dev' as const,
  YOUTUBE_DIAGNOSTIC_PATH: path, YOUTUBE_DIAGNOSTIC_EXPIRES: new Date(Date.now() + 60_000).toISOString() })
const request = (query = '') => new Request(`https://worker.test.invalid${path}${query}`)

describe('temporary diagnostic subscriber', () => {
  it('echoes verification without requiring a pending database subscription', async () => {
    const response = await handleDiagnosticSubscriber(request('?hub.mode=subscribe&hub.challenge=hello'), bindings())
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('hello')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
  it('is unavailable in production, when disabled, expired, or on a different path', async () => {
    for (const config of [
      { ...bindings(), ENVIRONMENT: 'production' as const },
      { ...bindings(), YOUTUBE_DIAGNOSTIC_PATH: undefined },
      { ...bindings(), YOUTUBE_DIAGNOSTIC_EXPIRES: 'invalid' },
      { ...bindings(), YOUTUBE_DIAGNOSTIC_EXPIRES: '2020-01-01' },
      { ...bindings(), YOUTUBE_DIAGNOSTIC_PATH: '/other' },
    ]) expect((await handleDiagnosticSubscriber(request(), config)).status).toBe(404)
  })
  it('rejects missing challenges and unsupported methods', async () => {
    expect((await handleDiagnosticSubscriber(request(), bindings())).status).toBe(400)
    expect((await handleDiagnosticSubscriber(new Request(request(), { method: 'DELETE' }), bindings())).status).toBe(405)
  })
  it('accepts unsigned deliveries but logs only size, never their contents', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    const response = await handleDiagnosticSubscriber(new Request(request(), { method: 'POST', body: 'private-body' }), bindings())
    expect(response.status).toBe(204)
    expect(log).toHaveBeenCalledWith(JSON.stringify({ operation: 'youtube-diagnostic', event: 'notification', bytes: 12 }))
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-body')
    log.mockRestore()
  })
  it('rejects oversized notifications even without a Content-Length header', async () => {
    const response = await handleDiagnosticSubscriber(new Request(request(), {
      method: 'POST', body: 'x'.repeat(128 * 1024 + 1),
    }), bindings())
    expect(response.status).toBe(413)
  })
})
