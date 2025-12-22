export type CacheOptions = {
  ttlSeconds: number
  ignoreQueryParams?: string[]
}

function isCacheableRequest(req: Request): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false

  if (req.headers.get('Authorization')) return false
  if (req.headers.get('Cookie')) return false

  return true
}

function isResponsePublicCacheable(res: Response): boolean {
  if (!res.ok) return false
  if (res.headers.has('Set-Cookie')) return false

  const cc = res.headers.get('Cache-Control') ?? ''
  return /\bpublic\b/i.test(cc) && /\bmax-age=\d+\b/i.test(cc)
}

function makeCacheKey(req: Request, opts: CacheOptions): Request {
  const url = new URL(req.url)

  if (opts.ignoreQueryParams?.length) {
    for (const p of opts.ignoreQueryParams) url.searchParams.delete(p)
  }

  return new Request(url.toString(), { method: 'GET' })
}

export async function withCache(
  req: Request,
  ctx: ExecutionContext,
  opts: CacheOptions,
  next: () => Promise<Response>
): Promise<Response> {
  if (!isCacheableRequest(req)) {
    return next()
  }

  const cache = caches.default
  const key = makeCacheKey(req, opts)

  const hit = await cache.match(key)
  if (hit) {
    console.log('Serving cached content', key.url)
    return hit
  }

  const res = await next()

  if (isResponsePublicCacheable(res)) {
    const cached = new Response(res.body, res)

    cached.headers.set(
      'Cache-Control',
      `public, max-age=${opts.ttlSeconds}, stale-while-revalidating=${opts.ttlSeconds}`
    )

    ctx.waitUntil(cache.put(key, cached.clone()))
    return cached
  }

  return res
}
