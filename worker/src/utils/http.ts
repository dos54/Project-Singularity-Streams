/**
 * Shared CORS headers for all responses.
 */
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

/**
 * Wraps a Response with JSON content-type and CORS headers.
 */
export function withCors(body: BodyInit | null, init: ResponseInit = {}): Response {
  return new Response(body, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
      ...corsHeaders,
    },
  })
}

/**
 * Handles CORS preflight OPTIONS requests.
 */
export function handleOptions(request: Request): Response {
  const requestHeaders = request.headers.get('Access-Control-Request-Headers') || ''

  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      'Access-Control-Allow-Headers': requestHeaders || 'Content-Type',
    },
  })
}

/**
 * Builds a Cache-Control header value using a stale-while-revalidate strategy.
 *
 * @param maxAgeSeconds - Time (in seconds) during which the response is "fresh".
 * @param staleWhileRevalidateSeconds - Additional time (in seconds) during which a "stale"
 *   response may be served while a revalidation happens in the background.
 *
 * Example:
 *   buildSWRCacheControl(60, 60)
 *   => "public, max-age=60, stale-while-revalidate=60"
 */
export function buildSWRCacheControl(
  maxAgeSeconds: number,
  staleWhileRevalidateSeconds: number,
): string {
  return `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`
}
