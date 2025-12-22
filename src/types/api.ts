import type { Member } from './member'
import type { TwitchLivestream } from './twitch'
import type { YoutubeVideo } from './youtube'

export interface MembersResponse {
  members: Member[]
}

export interface TwitchLivestreamsResponse {
  liveStreams: TwitchLivestream[]
}

export interface YoutubeVideosResponse {
  videos: YoutubeVideo[]
}
