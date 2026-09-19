/** Deliberately exclude request URLs, headers, bodies and upstream exception messages. */
export class UpstreamError extends Error {
  constructor(readonly reason: string) {
    super(reason)
  }
}

export async function fetchUpstream(url: string | URL, init: RequestInit = {}): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(10_000) })
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    throw new UpstreamError(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network-error')
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new UpstreamError(`http-${response.status}`)
  }
  return response
}

export function failureReason(error: unknown): string {
  return error instanceof UpstreamError ? error.reason : 'processing-error'
}
