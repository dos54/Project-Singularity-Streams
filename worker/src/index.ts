// src/index.ts

import type { Env } from './env'
import { handleOptions } from './utils/http'
import { routeRequest } from './routes'
import { syncFeed } from './services/youtubeService'
import { withCache } from './middleware/cache'

/**
 * Cloudflare Worker entry point and router.
 */
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return handleOptions(req)
    }

    return withCache(
      req,
      ctx,
      { ttlSeconds: 30, ignoreQueryParams: ['t', 'debug']},
      () => routeRequest(req, env, ctx)
    )
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(syncFeed(env))
  },
}
