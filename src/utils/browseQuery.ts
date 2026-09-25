import { parsePageSize } from './preferences'
export interface BrowseFilters {
  platform: 'all' | 'youtube' | 'twitch'
  q: string
  creators: number[] | null
  streamCreators: number[] | null
  project: boolean
  streamProject: boolean
  pageSize: number
  page: number
}
export const defaultFilters: BrowseFilters = {
  platform: 'all',
  q: '',
  creators: null,
  streamCreators: null,
  project: true,
  streamProject: true,
  pageSize: 10,
  page: 1,
}
export function parseCreators(value: unknown): number[] | null {
  if (value === 'none') return []
  if (typeof value !== 'string' || !value) return null
  const result = value
    .split(',')
    .filter((id) => /^\d+$/.test(id))
    .map(Number)
    .filter((id) => Number.isSafeInteger(id) && id > 0)
  return result.length ? [...new Set(result)].sort((a, b) => a - b).slice(0, 200) : null
}
export function parseBrowseQuery(
  query: Record<string, unknown>,
  fallback: BrowseFilters,
): BrowseFilters {
  const base = query.shared === '1' ? defaultFilters : fallback
  const flag = (value: unknown, previous: boolean) =>
    value === '1' ? true : value === '0' ? false : previous
  const page =
    typeof query.page === 'string' && /^\d+$/.test(query.page) ? Number(query.page) : base.page
  return {
    platform: query.platform === 'youtube' || query.platform === 'twitch' || query.platform === 'all' ? query.platform : base.platform,
    q: typeof query.q === 'string' ? query.q.slice(0, 200) : base.q,
    creators: 'creators' in query ? parseCreators(query.creators) : base.creators,
    streamCreators:
      'streamCreators' in query ? parseCreators(query.streamCreators) : base.streamCreators,
    project: flag(query.project, base.project),
    streamProject: flag(query.streamProject, base.streamProject),
    pageSize: parsePageSize(query.pageSize) ?? base.pageSize,
    page: Number.isSafeInteger(page) && page > 0 && page <= 100_000 ? page : 1,
  }
}
export function serializeBrowse(filters: BrowseFilters): Record<string, string> {
  const selection = (ids: number[] | null) =>
    ids === null ? '' : ids.length ? ids.join(',') : 'none'
  return {
    platform: filters.platform,
    q: filters.q || '',
    creators: selection(filters.creators),
    streamCreators: selection(filters.streamCreators),
    project: filters.project ? '1' : '0',
    streamProject: filters.streamProject ? '1' : '0',
    pageSize: String(filters.pageSize),
    page: String(filters.page),
  }
}
