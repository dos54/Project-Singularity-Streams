import type { Env } from '../env'

// Temporary, unsigned sink: no database access, enrichment, or subscription state.
export async function handleDiagnosticSubscriber(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const respond = (body: string | null, status: number) => new Response(body, {
    status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  })
  const expires = Date.parse(env.YOUTUBE_DIAGNOSTIC_EXPIRES ?? '')
  if (env.ENVIRONMENT !== 'dev' || !env.YOUTUBE_DIAGNOSTIC_PATH ||
      url.pathname !== env.YOUTUBE_DIAGNOSTIC_PATH || !Number.isFinite(expires) || Date.now() >= expires) {
    return respond('Not found', 404)
  }
  if (req.method === 'GET') {
    const challenge = url.searchParams.get('hub.challenge')
    if (!challenge || challenge.length > 1024 ||
        !['subscribe', 'unsubscribe'].includes(url.searchParams.get('hub.mode') ?? '')) {
      return respond('Diagnostic subscriber ready; supply a hub challenge', 400)
    }
    console.info(JSON.stringify({ operation: 'youtube-diagnostic', event: 'verification', status: 200 }))
    return respond(challenge, 200)
  }
  if (req.method !== 'POST') return respond('Method not allowed', 405)
  let bytes = 0
  const reader = req.body?.getReader()
  if (reader) {
    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > 128 * 1024) {
          await reader.cancel()
          return respond('Payload too large', 413)
        }
      }
    } finally { reader.releaseLock() }
  }
  console.info(JSON.stringify({ operation: 'youtube-diagnostic', event: 'notification', bytes }))
  return respond(null, 204)
}
