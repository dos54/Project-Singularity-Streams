// src/index.ts

import type { Env } from './env'
import { handleOptions } from './utils/http'
import { routeRequest } from './routes'
import { syncFeed } from './services/youtubeService'
import { withCache } from './middleware/cache'
import { handleYoutubeWebhook } from './services/youtubeWebsub'
import { maintainYoutube } from './services/youtubeMaintenance'
import { handleDiagnosticSubscriber } from './services/youtubeDiagnostic'
import { costGuard } from './middleware/costGuard'
import { uploadParameters } from './services/uploadPages'

/**
 * Cloudflare Worker entry point and router.
 */
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (env.SERVICE_DISABLED === 'true') return new Response('Not found', { status: 404 })
    if (new URL(req.url).pathname.startsWith('/youtube/diagnostic/')) {
      const blocked = await costGuard(env, 'WEBHOOK_LIMITER', 'diagnostic')
      if (blocked) return blocked
      return handleDiagnosticSubscriber(req, env)
    }
    const webhook = /^\/youtube\/webhook\/([a-zA-Z0-9_-]{1,128})$/.exec(new URL(req.url).pathname)
    if (webhook) {
      const blocked = await costGuard(env, 'WEBHOOK_LIMITER', 'youtube-webhook')
      if (blocked) return blocked
      try { return await handleYoutubeWebhook(req, env, webhook[1]!) }
      catch {
        console.error('YouTube webhook persistence failed')
        return new Response('Please retry', { status: 503, headers: { 'Cache-Control': 'no-store' } })
      }
    }
    if (req.method === 'OPTIONS') {
      return handleOptions(req)
    }

    // These endpoints are anonymous snapshots; no query or credential affects the result.
    const url = new URL(req.url)
    if (!['/members', '/youtube/videos', '/youtube/uploads', '/twitch/livestreams'].includes(url.pathname)) {
      return new Response('Not found', { status: 404 })
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD, OPTIONS' } })
    }
    if (url.pathname === '/youtube/uploads') {
      try {
        const { project, after, limit } = uploadParameters(url)
        url.search = ''
        if (project) url.searchParams.set('project', 'true')
        if (limit !== 10) url.searchParams.set('limit', String(limit))
        if (after) url.searchParams.set('cursor', btoa(JSON.stringify(after)))
      } catch {
        return new Response('Invalid cursor', { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } })
      }
    } else url.search = ''
    const publicRequest = new Request(url, { method: 'GET' })

    const response = await withCache(
      publicRequest,
      ctx,
      { ttlSeconds: url.pathname === '/members' || (url.pathname === '/youtube/uploads' && url.searchParams.has('cursor')) ? 3600 : 30 },
      async () => (await costGuard(env, 'READ_MISS_LIMITER', url.pathname)) ?? routeRequest(publicRequest, env, ctx)
    )
    return req.method === 'HEAD' ? new Response(null, response) : response
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    if (env.SERVICE_DISABLED === 'true') return
    ctx.waitUntil(env.YOUTUBE_PUSH_ENABLED === 'true' ? maintainYoutube(env) : syncFeed(env))
  },
}
