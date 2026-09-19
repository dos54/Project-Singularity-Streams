import { describe, it, expect, vi } from 'vitest'
import { fetchUpstream, failureReason } from '../src/utils/upstream'

describe('credential-safe upstream diagnostics', () => {
  it.each([404, 429, 503, 302])('records HTTP %s without exposing the URL or response body', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('sensitive-body', { status })))
    const error = await fetchUpstream('https://example.invalid/?key=secret-value').catch(e => e)
    expect(failureReason(error)).toBe(`http-${status}`)
    expect(String(error)).not.toMatch(/secret-value|sensitive-body/)
  })
  it.each(['TimeoutError', 'AbortError', 'TypeError'])('sanitizes %s exceptions', async name => {
    vi.stubGlobal('fetch', vi.fn(async () => { const error = new Error('secret-value'); error.name = name; throw error }))
    const error = await fetchUpstream('https://example.invalid').catch(e => e)
    expect(failureReason(error)).toBe(name === 'TypeError' ? 'network-error' : 'timeout')
    expect(String(error)).not.toContain('secret-value')
  })
  it('does not disclose unexpected parsing or persistence errors', () => {
    expect(failureReason(new Error('secret-value'))).toBe('processing-error')
  })
})
