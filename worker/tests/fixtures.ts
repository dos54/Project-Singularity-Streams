import type { Env } from '../src/env'
import { Status, type Video, type VideoLiveStatus } from '../src/types/youtube'

export const testBindings = {
  ENVIRONMENT: 'dev',
  ATOM_FEED_BASE: 'https://atom.test.invalid',
  YT_API_BASE: 'https://youtube.test.invalid',
  TWITCH_API_BASE: 'https://twitch.test.invalid',
  TWITCH_CLIENT_ID: 'test-client-id',
  TWITCH_CLIENT_SECRET: 'test-client-secret',
  YOUTUBE_API_KEY: 'test-youtube-key',
} as const

export const env = testBindings as Env

export function liveStatus(overrides: Partial<VideoLiveStatus> = {}): VideoLiveStatus {
  return {
    videoId: 'video-1',
    state: Status.inactive,
    lastChecked: 0,
    actualStartTime: null,
    actualEndTime: null,
    activeLiveChatId: null,
    concurrentViewers: null,
    ...overrides,
  }
}

export function video(overrides: Partial<Video> = {}): Video {
  return {
    id: 'video-1',
    title: 'Project Singularity episode 1',
    description: null,
    author: { memberId: 1, alias: 'Creator', youtube: '@creator', youtubeId: 'channel-1' },
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    isProjectSingularity: true,
    thumbnailUrl: null,
    thumbnailWidth: null,
    thumbnailHeight: null,
    ...overrides,
  }
}

function xml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

export function feed(channel: string, count = 1, title = 'Project Singularity'): string {
  return `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">${Array.from(
    { length: count },
    (_, i) => `<entry>
      <id>yt:video:${channel}-${i}</id><yt:videoId>${channel}-${i}</yt:videoId>
      <yt:channelId>${channel}</yt:channelId><title>${xml(title)} ${i}</title>
      <published>2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z</published>
      <media:group><media:description>Episode description</media:description>
      <media:thumbnail url="https://example.invalid/image.jpg" width="480" height="360"/></media:group>
    </entry>`,
  ).join('')}</feed>`
}
