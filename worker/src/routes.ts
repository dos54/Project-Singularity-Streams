import { membersController } from "./controllers/membersController";
import { twitchController } from "./controllers/twitchController";
import { youtubeController } from "./controllers/youtubeController";
import type { Env } from "./env";
import { withCors } from './utils/http'
import { failureReason } from './utils/upstream'

/** Router to handle requests */
export async function routeRequest (
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url)
  const segments = url.pathname.split('/').filter(Boolean)

  try {
    switch (segments[0]) {
      case 'youtube':
        return await youtubeController(request, env, ctx)

      case 'twitch':
        return await twitchController(request, env, ctx)

      case 'members':
        return await membersController(request, env, ctx)

      default:
        return new Response("Not found", { status: 404 })
    }

  } catch (err) {
    console.error(JSON.stringify({ operation: 'public-read', path: url.pathname, reason: failureReason(err) }))
    return withCors(JSON.stringify({ error: 'There was a server-side error' }), {
      status: 500, headers: { 'Cache-Control': 'no-store' },
    })
  }
}
