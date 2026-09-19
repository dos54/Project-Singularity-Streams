export function readPreference(key: string): string | null {
  try { return localStorage.getItem(`singularity:${key}`) } catch { return null }
}
export function savePreference(key: string, value: string) {
  try { localStorage.setItem(`singularity:${key}`, value) } catch { /* Storage may be unavailable. */ }
}
export function parsePageSize(value: unknown): number | null {
  return typeof value === 'string' && ['10', '20', '50', '100'].includes(value) ? Number(value) : null
}
