import { Status } from "./youtube"

export interface VideoRow {
  VideoId: string
  MemberId: number
  Title: string
  Description: string | null
  PublishedAt: string
  IsProjectSingularity: boolean
  ThumbnailUrl: string | null
  ThumbnailWidth: number | null
  ThumbnailHeight: number | null
}

export interface MemberRow {
  MemberId: number
  Alias: string
  Twitch: string | null
  Youtube: string | null
  YoutubeId: string | null
  DiscordInvite: string | null
}

export interface VideoLiveStatusRow {
  VideoId: string
  State: Status
  LastChecked: number
  ActualStartTime: string | null
  ActualEndTime: string | null
  ActiveLiveChatId: string | null
  ConcurrentViewers: number | null
}

export interface VideoRowWithState extends VideoRow {
  State: Status
}
