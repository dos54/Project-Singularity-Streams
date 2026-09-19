import { describe, expect, it, vi } from 'vitest'
import { withCache } from '../src/middleware/cache'

function cacheHarness() {
  const pending: Promise<unknown>[] = []
  const cache = {
    match: vi.fn(async (_key: Request) => undefined as Response | undefined),
    put: vi.fn(async (_key: Request, _value: Response) => {}),
  }
  const ctx = {
    waitUntil(promise: Promise<unknown>) {
      pending.push(promise)
    },
  } as ExecutionContext
  vi.stubGlobal('caches', { default: cache })
  return { cache, ctx, pending }
}

describe('response caching boundaries', () => {
  it('returns an existing response without running the controller', async () => {
    const { cache, ctx } = cacheHarness()
    cache.match.mockResolvedValue(new Response('cached'))
    const next = vi.fn(async () => new Response('fresh'))
    const response = await withCache(
      new Request('https://worker.invalid/members'),
      ctx,
      { ttlSeconds: 30 },
      next,
    )
    expect(await response.text()).toBe('cached')
    expect(next).not.toHaveBeenCalled()
  })

  it('normalizes ignored cache-busting parameters and stores a readable response clone', async () => {
    const { cache, ctx, pending } = cacheHarness()
    const response = await withCache(
      new Request('https://worker.invalid/members?t=123&debug=1'),
      ctx,
      { ttlSeconds: 30, ignoreQueryParams: ['t', 'debug'] },
      async () => new Response('fresh', { headers: { 'Cache-Control': 'public, max-age=30' } }),
    )
    await Promise.all(pending)
    expect(cache.match.mock.calls[0]![0].url).toBe('https://worker.invalid/members')
    expect(cache.put).toHaveBeenCalledOnce()
    expect(await response.text()).toBe('fresh')
    expect(await cache.put.mock.calls[0]![1].text()).toBe('fresh')
  })

  it.each([
    { method: 'POST' },
    { headers: { Authorization: 'Bearer test' } },
    { headers: { Cookie: 'test=1' } },
  ] as RequestInit[])('bypasses cache for a non-public request %j', async (init) => {
    const { cache, ctx } = cacheHarness()
    const next = vi.fn(async () => new Response('response'))
    await withCache(
      new Request('https://worker.invalid/members', init),
      ctx,
      { ttlSeconds: 30 },
      next,
    )
    expect(next).toHaveBeenCalledOnce()
    expect(cache.match).not.toHaveBeenCalled()
    expect(cache.put).not.toHaveBeenCalled()
  })

  it.each([
    { status: 503, headers: { 'Cache-Control': 'public, max-age=30' } },
    { headers: { 'Cache-Control': 'private, max-age=30' } },
    { headers: { 'Cache-Control': 'public, max-age=30', 'Set-Cookie': 'test=1' } },
  ] as ResponseInit[])(
    'does not cache an error, private response or cookie-setting response %j',
    async (init) => {
      const { cache, ctx } = cacheHarness()
      await withCache(
        new Request('https://worker.invalid/members'),
        ctx,
        { ttlSeconds: 30 },
        async () => new Response('response', init),
      )
      expect(cache.put).not.toHaveBeenCalled()
    },
  )
})
