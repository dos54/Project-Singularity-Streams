import { Env } from '../env'
import { videoToRow } from '../mappers/videoMapper'
import { VideoLiveStatusRow, VideoRow, VideoRowWithState } from '../types/db'
import type { Video, YoutubeLivestreamResponseItem } from '../types/youtube'

export async function upsertVideos(env: Env, videos: Video[]) {
  if (videos.length === 0) return

  const rows: VideoRow[] = videos.map(videoToRow)

  const stmt = env.DB.prepare(`
    INSERT INTO Videos (
      VideoId, MemberId, Title, Description, PublishedAt,
      IsProjectSingularity, ThumbnailUrl, ThumbnailWidth, ThumbnailHeight
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (VideoId) DO UPDATE SET
      Title = excluded.Title,
      Description = excluded.Description,
      IsProjectSingularity = excluded.IsProjectSingularity
    WHERE
      Videos.Title IS NOT excluded.Title OR
      Videos.Description IS NOT excluded.Description OR
      Videos.IsProjectSingularity IS NOT excluded.IsProjectSingularity;
  `)

  const CHUNK = 100
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)

    const res = await env.DB.batch(
      slice.map((r) =>
        stmt.bind(
          r.VideoId,
          r.MemberId,
          r.Title,
          r.Description,
          r.PublishedAt,
          r.IsProjectSingularity ? 1 : 0,
          r.ThumbnailUrl,
          r.ThumbnailWidth,
          r.ThumbnailHeight,
        ),
      ),
    )

    // const rows_read = res.reduce((sum, item) => sum + item.meta.rows_read, 0)
    // const rows_written = res.reduce((sum, item) => sum + item.meta.rows_written, 0)
    // console.log(`Rows written: ${rows_written}\nRows read: ${rows_read}`)
  }
}

type MemberFilter = | { memberId: number; memberAlias?: never} | { memberAlias: string; memberId: never }

type VideoFilters = {
  isProjectSingularity?: boolean
  limit?: number
} & Partial<MemberFilter>

export async function getAllVideos(env: Env, filters: VideoFilters = {}): Promise<VideoRowWithState[]> {
  // Filters here
  const where: string[] = []
  const params: unknown[] = [] //

  if (filters.isProjectSingularity !== undefined) {
    where.push('v.isProjectSingularity = ?')
    params.push(filters.isProjectSingularity ? 1 : 0)
  }

  const limit = filters.limit ?? 100

  const sql = `
      SELECT v.MemberId, v.VideoId, v.Title, v.PublishedAt, v.ThumbnailUrl, v.IsProjectSingularity, COALESCE(ls.State, 'video') AS State
      FROM Videos v
      LEFT JOIN VideoLiveStatus ls ON ls.VideoId = v.VideoId
      ${where.length ? `WHERE ${where.join(" AND ")}`: ""}
      ORDER BY v.PublishedAt DESC
      LIMIT ?;
  `
  params.push(limit)

  const stmt = env.DB.prepare(sql).bind(...params)
  const res = (await stmt.run<VideoRowWithState>())
  // console.log(res.meta)
  // console.log('Filters applied:',filters)
  // console.log('Sql statement:',sql)
  return res.results
}

export async function ensureLiveStatusRows(
  env: Env,
  videoIds: string[]
): Promise<VideoLiveStatusRow[]> {
  if (videoIds.length === 0) return []
  const toReturn: VideoLiveStatusRow[] = []
  const params: unknown[] = []

  const stmt = env.DB.prepare(`
      INSERT INTO VideoLiveStatus (
        VideoId, State, LastChecked, ActualStartTime, ActualEndTime, ActiveLiveChatId, ConcurrentViewers
      ) VALUES (
        ?, 'inactive', 0, NULL, NULL, NULL, NULL
      )
      ON CONFLICT(VideoId) DO NOTHING
      RETURNING *
    `)

  const CHUNK = 100
  for (let i = 0; i < videoIds.length; i += CHUNK) {
    const slice = videoIds.slice(i, i+CHUNK)

    const res = await env.DB.batch<VideoLiveStatusRow>(
      slice.map((videoId) =>
        stmt.bind(
          videoId
        )
      )
    )

    const rows_read = res.reduce((sum, item) => sum + item.meta.rows_read, 0)
    const rows_written = res.reduce((sum, item) => sum + item.meta.rows_written, 0)
    // console.log(`Rows written: ${rows_written}\nRows read: ${rows_read}`)
    for (const r of res) {
      if (r.results?.length){
        toReturn.push(...r.results)
      }
    }
  }
  return toReturn
}

export async function getLiveStatusesForVideoIds(env: Env, videoIds: string[]): Promise<VideoLiveStatusRow[]> {
  if (videoIds.length === 0) return []

  const data: VideoLiveStatusRow[] = []

  const CHUNK = 16
  for (let i = 0; i < videoIds.length; i += CHUNK) {
    const slice = videoIds.slice(i, i + CHUNK)
    const values = slice.map(() => '?').join(',')
    const stmt = env.DB.prepare(`
      SELECT * FROM VideoLiveStatus WHERE VideoId IN (${values})
    `)
    const results = await stmt.bind(...slice).run<VideoLiveStatusRow>()
    data.push(...results.results)
  }
  return data
}

export async function patchVideoLiveStatus(env: Env, videoLiveStatuses: VideoLiveStatusRow[], now = Date.now()) {
  if (videoLiveStatuses.length === 0) {console.log('Nothing to patch!'); return }

  const stmt = env.DB.prepare(`
    UPDATE VideoLiveStatus
    SET
      State = ?,
      LastChecked = ?,
      ActualStartTime = ?,
      ActualEndTime = ?,
      ActiveLiveChatId = ?,
      ConcurrentViewers = ?
    WHERE VideoId = ?
  `)

  const CHUNK = 100
  for (let i = 0; i < videoLiveStatuses.length; i += CHUNK) {
    const slice = videoLiveStatuses.slice(i, i + CHUNK)

    const res = await env.DB.batch(
      slice.map((v) =>
        stmt.bind(
          v.State,
          v.LastChecked,
          v.ActualStartTime,
          v.ActualEndTime,
          v.ActiveLiveChatId,
          v.ConcurrentViewers,
          v.VideoId
        )
      )
    )

    const rows_read = res.reduce((sum, item) => sum + item.meta.rows_read, 0)
    const rows_written = res.reduce((sum, item) => sum + item.meta.rows_written, 0)
    console.log(`Rows written: ${rows_written}\nRows read: ${rows_read}`)
  }
}
