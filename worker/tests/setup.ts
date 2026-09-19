import { beforeEach, vi } from 'vitest'

// Vite's Node-side declarations also load DOM CacheStorage. The Node unit
// harness supplies Cloudflare's additional default cache explicitly below.
declare global {
  interface CacheStorage {
    readonly default: Cache
  }
}

// Unit tests must explicitly supply their upstream responses. Integration tests
// use Miniflare's separate outboundService, which also rejects unknown requests.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Unexpected network request: install a fixture response in this test')
    }),
  )
})
