export type YoutubeState = 'live' | 'ended' | 'video' | 'inactive'

export interface YoutubeVideo {
  description?: string | null
  memberId: number
  videoId: string
  title: string | null
  publishedAt: string | null
  thumbnailUrl: string | null
  isProjectSingularity: boolean
  state: YoutubeState
}
