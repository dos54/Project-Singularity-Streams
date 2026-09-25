export type YoutubeState = 'live' | 'ended' | 'video' | 'inactive'

export interface YoutubeVideo {
  /** Omitted on legacy YouTube responses and browser caches. */
  platform?: 'youtube' | 'twitch'
  description?: string | null
  memberId: number
  videoId: string
  title: string | null
  publishedAt: string | null
  thumbnailUrl: string | null
  isProjectSingularity: boolean
  state: YoutubeState
}
