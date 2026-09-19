import type { Env } from '../env'
import { withCors } from '../utils/http'
import { returnAllVideos } from '../services/youtubeService'
import { uploadPage } from '../services/uploadPages'

export async function youtubeController(
  req: Request,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(req.url)
  // Let the shared router turn failures into JSON 500 responses with CORS.
  switch (url.pathname) {
    case '/youtube/uploads':
      return withCors(JSON.stringify(await uploadPage(env, url)), {
        headers: { 'Cache-Control': 'public, max-age=30' },
      })
    case '/youtube/videos':
      return withCors(JSON.stringify({ videos: await returnAllVideos(env) }), {
        headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=30' },
      })
    default:
      return new Response('Not found', { status: 404 })
  }
}
