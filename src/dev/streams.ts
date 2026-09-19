import type { MemberWithComputed } from '@/types/member'

// Imported only by the development-only preview switch; never written to the API.
export const demoStreams: MemberWithComputed[] = ['YouTube', 'Twitch', 'Both'].map((platform, index) => ({
  memberId: -index - 1,
  alias: `Demo Creator (${platform})`,
  twitch: 'demo',
  latestYoutubeVideo: platform === 'Twitch' ? null : {
    memberId: -index - 1, videoId: 'demo', title: 'Project Singularity — building our next base',
    publishedAt: null, thumbnailUrl: '/project-singularity.png', isProjectSingularity: true, state: 'live',
  },
  twitchStream: platform === 'YouTube' ? null : {
    login: 'demo', isLive: true, title: 'Project Singularity — exploring together',
    gameName: 'Minecraft', viewerCount: 42, thumbnailUrl: '/project-singularity.png',
  },
}))
