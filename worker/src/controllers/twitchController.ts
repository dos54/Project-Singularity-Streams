import type { Env } from '../env'

import { fetchTwitchLivestreams } from '../services/twitchService'
import { withCors } from '../utils/http'
import { readTwitchVideos } from '../services/twitchVideos'

export async function twitchController(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
) {
  const url = new URL(request.url)
  const segments = url.pathname.split('/').filter(Boolean)

  switch (segments[1]) {
    case 'videos':
      return withCors(JSON.stringify(await readTwitchVideos(env)), {
        headers: { 'Cache-Control': 'public, max-age=60' },
      })
    case 'livestreams':
      const liveStreams = await fetchTwitchLivestreams(env)
      return withCors(JSON.stringify({ liveStreams }), {
        headers: {
          'Cache-Control': 'public, max-age=30, stale-while-revalidate=30',
        },
      })

    default:
      return new Response('Not found', { status: 404 })
  }
}
