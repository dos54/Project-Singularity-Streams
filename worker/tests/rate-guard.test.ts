import { describe, expect, it } from 'vitest'
import { costGuard } from '../src/middleware/costGuard'
import { env } from './fixtures'

describe('native cost guards', () => {
  it('permits an allowed request and uses a fixed route key', async () => {
    const config = { ...env, COST_GUARDS_ENABLED: 'true', READ_MISS_LIMITER: {
      async limit({ key }: RateLimitOptions) { expect(key).toBe('/members'); return { success: true } },
    } }
    expect(await costGuard(config, 'READ_MISS_LIMITER', '/members')).toBeNull()
  })
  it('fails closed for exhausted, missing, or failing bindings', async () => {
    for (const limiter of [undefined, { async limit() { return { success: false } } },
      { async limit(): Promise<RateLimitOutcome> { throw new Error('unavailable') } }]) {
      const result = await costGuard({ ...env, COST_GUARDS_ENABLED: 'true', READ_MISS_LIMITER: limiter }, 'READ_MISS_LIMITER', '/members')
      expect(result!.status).toBe(503)
      expect(result!.headers.get('Retry-After')).toBe('60')
    }
  })
})
