import { Env } from '../env'
import { withCors } from '../utils/http'
import { returnAllVideos, syncFeed } from '../services/youtubeService'

export async function youtubeController(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(req.url)
  const { pathname } = url
  const segments = url.pathname.split('/').filter(Boolean)

  try {
    switch (segments[1]) {
      // case 'refresh': {
      //   await syncFeed(env)
      //   return new Response(
      //     'Attempting to update feed...',
      //     { status: 200 }
      //   )
      // }

      case 'videos': {
        try {
          const  videos = await returnAllVideos(env)
          return withCors(JSON.stringify({ videos }), {
            headers: {
              'Cache-Control': 'public, max-age=30, stale-while-revalidate=30'
            }
          })
        } catch (err) {
          console.error('youtubeController Error:', err)
        }
      }

      default:
        return new Response(
          'Not found',
          {status: 404}
        )
    }
  } catch (err) {
    return new Response ('There was a server error', {status: 500})
  }
}
