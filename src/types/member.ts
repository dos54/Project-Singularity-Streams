import type { TwitchLivestream } from './twitch'
import type { YoutubeVideo } from './youtube'

export interface Member {
  memberId: number
  alias: string
  twitch?: string | null
  youtube?: string | null
  youtubeId?: string | null
  discordInvite?: string | null
}

export type MemberWithComputed = Member & {
  twitchStream: TwitchLivestream | null
  latestYoutubeVideo: YoutubeVideo | null
}
