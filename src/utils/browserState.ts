export const apiKey = String(import.meta.env.VITE_API_BASE_URL)
export const stateKey = (name: string) => `singularity:v1:${apiKey}:${name}`

export function readState<T>(name: string, fallback: T, session = false): T {
  try {
    const value = (session ? sessionStorage : localStorage).getItem(stateKey(name))
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}
export function writeState(name: string, value: unknown, session = false): boolean {
  try {
    ;(session ? sessionStorage : localStorage).setItem(stateKey(name), JSON.stringify(value))
    return true
  } catch {
    return false
  }
}
export function validTime(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= Date.now() + 60_000
    ? value
    : null
}
export function receivedAgo(time: number | null, now: number): string {
  if (!time) return 'Receipt time unknown'
  const minutes = Math.max(0, Math.floor((now - time) / 60_000))
  return minutes === 0
    ? 'Received just now'
    : minutes < 60
      ? `Received ${minutes} min ago`
      : `Received ${Math.floor(minutes / 60)} hr ago`
}
