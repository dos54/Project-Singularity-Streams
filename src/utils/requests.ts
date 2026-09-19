export class RequestError extends Error {
  constructor(
    message: string,
    public retryAt = 0,
  ) {
    super(message)
  }
}
export async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const timeout = new AbortController()
  const abort = () => timeout.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  const timer = setTimeout(abort, 15_000)
  try {
    const response = await fetch(url, { signal: timeout.signal })
    if (!response.ok) {
      const header = response.headers.get('Retry-After')
      const seconds = header && /^\d+$/.test(header) ? Number(header) : 0
      const retryAt = header ? (seconds ? Date.now() + seconds * 1000 : Date.parse(header)) : 0
      throw new RequestError(
        `Request failed (HTTP ${response.status}).`,
        [429, 503].includes(response.status) && Number.isFinite(retryAt)
          ? Math.min(Date.now() + 3_600_000, retryAt)
          : 0,
      )
    }
    return (await response.json()) as T
  } catch (error) {
    if (signal?.aborted) throw error
    if (timeout.signal.aborted) throw new RequestError('Request timed out. Please retry.')
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
