import type { Member } from '@/types/member'
import type { TwitchLivestream } from '@/types/twitch'
import type { YoutubeVideo } from '@/types/youtube'

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const optionalText = (value: unknown) => value == null || typeof value === 'string'
const memberId = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

// Older cache snapshots can omit nullable presentation fields, but cannot supply other types.
export function isVideo(value: unknown): value is YoutubeVideo {
  return (
    isRecord(value) &&
    typeof value.videoId === 'string' &&
    !!value.videoId &&
    memberId(value.memberId) &&
    optionalText(value.title) &&
    optionalText(value.description) &&
    optionalText(value.thumbnailUrl) &&
    optionalText(value.publishedAt) &&
    (value.publishedAt == null || Number.isFinite(Date.parse(value.publishedAt as string))) &&
    typeof value.isProjectSingularity === 'boolean' &&
    typeof value.state === 'string' &&
    ['video', 'live', 'inactive', 'ended'].includes(value.state)
  )
}
export function isMember(value: unknown): value is Member {
  return (
    isRecord(value) &&
    memberId(value.memberId) &&
    typeof value.alias === 'string' &&
    !!value.alias.trim() &&
    ['twitch', 'youtube', 'youtubeId', 'discordInvite'].every((key) => optionalText(value[key]))
  )
}
export function isTwitchStream(value: unknown): value is TwitchLivestream {
  return (
    isRecord(value) &&
    typeof value.login === 'string' &&
    !!value.login.trim() &&
    typeof value.isLive === 'boolean' &&
    ['title', 'gameName', 'thumbnailUrl'].every((key) => optionalText(value[key])) &&
    (value.viewerCount == null ||
      (typeof value.viewerCount === 'number' &&
        Number.isFinite(value.viewerCount) &&
        value.viewerCount >= 0))
  )
}
export function compareVideos(a: YoutubeVideo, b: YoutubeVideo) {
  const left = a.publishedAt ?? ''
  const right = b.publishedAt ?? ''
  return left !== right
    ? left < right
      ? 1
      : -1
    : a.videoId === b.videoId
      ? 0
      : a.videoId < b.videoId
        ? 1
        : -1
}
