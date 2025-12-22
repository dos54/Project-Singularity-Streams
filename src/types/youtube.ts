export type YoutubeState = 'live' | 'ended' | 'video' | 'inactive'

export interface YoutubeVideo {
  memberId: number
  videoId: string
  title: string | null
  publishedAt: string | null
  thumbnailUrl: string | null
  isProjectSingularity: boolean
  state: YoutubeState
}
