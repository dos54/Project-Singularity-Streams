import type {
  AtomEntry,
  Video,
  Author,
  AtomEntryThumbnail,
  VideoLiveStatus,
  VideoWithLiveStatus,
  YoutubeLivestreamResponseItem,
} from '../types/youtube'
import type { VideoLiveStatusRow, VideoRow, VideoRowWithState } from '../types/db'
import { VideoResponseDto } from '../types/responses/youtube'

function pickThumbnail(t?: AtomEntryThumbnail | AtomEntryThumbnail[]) {
  if (!t) return null
  return Array.isArray(t) ? t[t.length - 1] : t
}

export function atomEntryToVideo(entry: AtomEntry, author: Author): Video {
  const thumbnail = pickThumbnail(entry['media:group']['media:thumbnail'])
  return {
    id: entry['yt:videoId'],
    title: entry.title,
    description: entry['media:group']['media:description'],
    publishedAt: new Date(entry.published),
    isProjectSingularity: false,
    thumbnailUrl: thumbnail?.['@_url'] ?? null,
    thumbnailHeight: thumbnail ? Number(thumbnail?.['@_height']) : null,
    thumbnailWidth: thumbnail ? Number(thumbnail?.['@_width']) : null,
    author,
  }
}

export function videoToRow(v: Video): VideoRow {
  return {
    VideoId: v.id,
    MemberId: v.author.memberId,
    Title: v.title,
    Description: v.description ?? null,
    PublishedAt: v.publishedAt.toISOString(),
    IsProjectSingularity: v.isProjectSingularity,
    ThumbnailUrl: v.thumbnailUrl,
    ThumbnailWidth: v.thumbnailWidth,
    ThumbnailHeight: v.thumbnailHeight,
  }
}

export function attachLiveStatus(
  videos: Video[],
  statuses: VideoLiveStatus[],
): VideoWithLiveStatus[] {
  const byId = new Map(statuses.map((s) => [s.videoId, s]))
  return videos.map((v) => ({ ...v, liveStatus: byId.get(v.id) ?? null }))
}

export function videoLiveStatusRowToVideoLiveStatus(ls: VideoLiveStatusRow): VideoLiveStatus {
  return {
    videoId: ls.VideoId,
    state: ls.State,
    lastChecked: ls.LastChecked,
    actualStartTime: ls.ActualStartTime,
    actualEndTime: ls.ActualEndTime,
    activeLiveChatId: ls.ActiveLiveChatId,
    concurrentViewers: ls.ConcurrentViewers,
  }
}

export function videoLiveStatusToRow(ls: VideoLiveStatus): VideoLiveStatusRow {
  return {
    VideoId: ls.videoId,
    State: ls.state,
    LastChecked: ls.lastChecked,
    ActualStartTime: ls.actualStartTime,
    ActualEndTime: ls.actualEndTime,
    ActiveLiveChatId: ls.activeLiveChatId,
    ConcurrentViewers: ls.concurrentViewers,
  }
}

export function patchFromYoutubeItems(
  videoLiveStatuses: VideoLiveStatus[],
  ytResponseItems: YoutubeLivestreamResponseItem[],
): VideoLiveStatus[] {
  const now = Date.now()
  const responseMap = new Map<string, YoutubeLivestreamResponseItem>(
    ytResponseItems.map((i) => [i.id, i]),
  )

  return videoLiveStatuses.map((ls) => {
    const yt = responseMap.get(ls.videoId)
    if (!yt) return ls

    return {
      ...ls,
      lastChecked: now,
      actualStartTime: yt.liveStreamingDetails?.actualStartTime ?? null,
      actualEndTime: yt.liveStreamingDetails?.actualEndTime ?? null,
      activeLiveChatId: yt.liveStreamingDetails?.activeLiveChatId ?? null,
      concurrentViewers: yt.liveStreamingDetails?.concurrentViewers ?? null,
    }
  })
}

export function mapVideoRowToDto(row: VideoRowWithState): VideoResponseDto {
  return {
    memberId: row.MemberId,
    videoId: row.VideoId,
    title: row.Title,
    publishedAt:
      typeof row.PublishedAt === 'string'
        ? row.PublishedAt
        : new Date(row.PublishedAt).toISOString(),
    thumbnailUrl: row.ThumbnailUrl,
    isProjectSingularity:
      typeof row.IsProjectSingularity === 'boolean'
        ? row.IsProjectSingularity
        : Boolean(row.IsProjectSingularity),
    state: row.State
  }
}

export function mapVideoRowsToDtos(rows: VideoRowWithState[]): VideoResponseDto[] {
  return rows.map(mapVideoRowToDto)
}
