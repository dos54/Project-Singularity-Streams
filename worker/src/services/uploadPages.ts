import type { Env } from '../env'
import type { VideoRowWithState } from '../types/db'
import { mapVideoRowToDto } from '../mappers/videoMapper'

export function uploadParameters(url: URL) {
  const project = url.searchParams.get('project') === 'true'
  const requested = url.searchParams.get('limit')
  const limit = requested === '500' ? 500 : requested === '100' ? 100 : 10
  const cursor = url.searchParams.get('cursor') || ''
  let after: [string, string] | undefined
  if (cursor) {
    if (cursor.length > 200) throw new Error('Invalid cursor')
    const value: unknown = JSON.parse(atob(cursor))
    if (!Array.isArray(value) || value.length !== 2 ||
      typeof value[0] !== 'string' || !/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(value[0]) ||
      !Number.isFinite(Date.parse(value[0])) || typeof value[1] !== 'string' ||
      !/^[\w-]{1,64}$/.test(value[1])) throw new Error('Invalid cursor')
    after = [value[0], value[1]]
  }
  return { project, after, limit }
}

export async function uploadPage(env: Env, url: URL) {
  const { project, after, limit } = uploadParameters(url)
  const rows = (await env.DB.prepare(`
    SELECT v.*, COALESCE(ls.State,'video') AS State FROM Videos v
    LEFT JOIN VideoLiveStatus ls ON ls.VideoId=v.VideoId
    WHERE COALESCE(ls.State,'video')='video'
    ${project ? 'AND v.IsProjectSingularity=1' : ''}
    ${after ? 'AND (v.PublishedAt,v.VideoId)<(?,?)' : ''}
    ORDER BY v.PublishedAt DESC,v.VideoId DESC LIMIT ?
  `).bind(...(after ?? []), limit + 1).all<VideoRowWithState>()).results
  const videos = rows.slice(0, limit)
  const last = videos.at(-1)
  return { videos: videos.map(mapVideoRowToDto), nextCursor: rows.length > limit && last
    ? btoa(JSON.stringify([last.PublishedAt, last.VideoId])) : null }
}
