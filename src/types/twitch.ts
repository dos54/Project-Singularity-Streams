export interface TwitchLivestream {
  login: string
  isLive: boolean
  title: string | null
  gameName: string | null
  viewerCount: number | null
}
