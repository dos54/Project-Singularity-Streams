export interface Video {
  id: string
  author: Author
  title: string
  description: string | null
  publishedAt: Date
  isProjectSingularity: boolean
  thumbnailUrl: string | null
  thumbnailHeight: number | null
  thumbnailWidth: number | null
}

export interface Author {
  memberId: number
  alias: string
  twitch?: string
  youtube: string
  youtubeId: string
  discordInvite?: string
}

export interface VideoLiveStatus {
  videoId: string
  state: Status
  lastChecked: number
  actualStartTime: string | null
  actualEndTime: string | null
  activeLiveChatId: string | null
  concurrentViewers: number | null
}

export type VideoWithLiveStatus = Video & {
  liveStatus: VideoLiveStatus | null
}

export enum Status { live = 'live', video = 'video', inactive = 'inactive' }

export interface YoutubeLivestreamResponseItem {
  kind: string
  etag: string
  id: string
  liveStreamingDetails: {
    actualStartTime: string | null
    actualEndTime: string | null
    activeLiveChatId: string | null
    concurrentViewers: number | null
  } | null
}
