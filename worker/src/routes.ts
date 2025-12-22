import { membersController } from "./controllers/membersController";
import { twitchController } from "./controllers/twitchController";
import { youtubeController } from "./controllers/youtubeController";
import type { Env } from "./env";

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
        return youtubeController(request, env, ctx)

      case 'twitch':
        return twitchController(request, env, ctx)

      case 'members':
        return membersController(request, env, ctx)

      default:
        return new Response("Not found", { status: 404 })
    }

  } catch (err) {
    console.error('Error @ routeRequest:', err)
    return new Response('There was a server-side error', { status: 500 })
  }
}
