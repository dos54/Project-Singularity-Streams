import type { Env } from '../env'

// Native counters are approximate and per Cloudflare location, NOT billing counters.
export async function costGuard(env: Env, binding: 'READ_MISS_LIMITER' | 'WEBHOOK_LIMITER', key: string): Promise<Response | null> {
  if (env.COST_GUARDS_ENABLED !== 'true') return null
  try {
    const limiter = env[binding]
    if (limiter && (await limiter.limit({ key })).success) return null
  } catch { /* Fail closed without logging attacker-controlled traffic. */ }
  return new Response('Temporarily unavailable', {
    status: 503, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Retry-After' },
  })
}
