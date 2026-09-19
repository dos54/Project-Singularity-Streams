import { describe, expect, it, vi } from 'vitest'
import { determineLiveStatus, isProjectSingularityVideo } from '../src/models/video'
import {
  atomEntryToVideo,
  attachLiveStatus,
  patchFromYoutubeItems,
  videoToRow,
  mapVideoRowToDto,
} from '../src/mappers/videoMapper'
import { parseXmlFeed } from '../src/parsers/youtube/atomParser'
import { memberRowToAuthor } from '../src/mappers/members'
import { Status, type YoutubeLivestreamResponseItem } from '../src/types/youtube'
import { feed, liveStatus, video } from './fixtures'

describe('video classification and mapping', () => {
  it.each([
    ['PROJECT SINGULARITY', null, true],
    ['Other game', 'On the Project Singularity server', true],
    ['Other game', null, false],
    ['Project', 'Singularity', false],
  ])('classifies title %s and description %s', (title, description, expected) => {
    expect(isProjectSingularityVideo(video({ title, description }))).toBe(expected)
  })

  it.each([
    [liveStatus(), Status.video],
    [liveStatus({ actualStartTime: '2026-01-01T00:00:00Z', concurrentViewers: 0 }), Status.live],
    [
      liveStatus({ actualStartTime: '2026-01-01T00:00:00Z', activeLiveChatId: 'chat' }),
      Status.live,
    ],
    [
      liveStatus({
        actualStartTime: '2026-01-01T00:00:00Z',
        actualEndTime: '2026-01-01T01:00:00Z',
      }),
      Status.video,
    ],
  ])('classifies supported status %#', (status, expected) => {
    expect(determineLiveStatus(status)).toBe(expected)
  })

  it('parses singleton Atom entries, escaped titles and thumbnail attributes', () => {
    const parsed = parseXmlFeed(feed('channel-1', 1, 'Project Singularity & friends'))
    const entry = Array.isArray(parsed.feed.entry) ? parsed.feed.entry[0]! : parsed.feed.entry
    const mapped = atomEntryToVideo(entry, video().author)
    expect(mapped).toMatchObject({
      id: 'channel-1-0',
      title: 'Project Singularity & friends 0',
      thumbnailWidth: 480,
      thumbnailHeight: 360,
    })
    expect(videoToRow(mapped)).toMatchObject({
      VideoId: 'channel-1-0',
      MemberId: 1,
      PublishedAt: '2026-01-01T00:00:00.000Z',
    })
  })

  it('parses multiple Atom entries', () => {
    expect(parseXmlFeed(feed('channel-1', 3)).feed.entry).toHaveLength(3)
  })

  it('joins live statuses by video ID regardless of response order', () => {
    const result = attachLiveStatus(
      [video(), video({ id: 'other' })],
      [liveStatus({ videoId: 'other' })],
    )
    expect(result[0]!.liveStatus).toBeNull()
    expect(result[1]!.liveStatus?.videoId).toBe('other')
  })

  it('patches returned API items without erasing records omitted by YouTube', () => {
    vi.spyOn(Date, 'now').mockReturnValue(12345)
    const absent = liveStatus({ videoId: 'missing', lastChecked: 100 })
    const items = [
      {
        id: 'video-1',
        liveStreamingDetails: { actualStartTime: '2026-01-01T00:00:00Z', concurrentViewers: 2 },
      },
    ] as YoutubeLivestreamResponseItem[]
    const result = patchFromYoutubeItems([liveStatus(), absent], items)
    expect(result[0]).toMatchObject({
      lastChecked: 12345,
      concurrentViewers: 2,
      actualEndTime: null,
    })
    expect(result[1]).toEqual(absent)
  })

  it('maps database rows to the public response contract', () => {
    const dto = mapVideoRowToDto({ ...videoToRow(video()), State: Status.video })
    expect(dto).toEqual({
      memberId: 1,
      videoId: 'video-1',
      title: 'Project Singularity episode 1',
      publishedAt: '2026-01-01T00:00:00.000Z',
      thumbnailUrl: null,
      description: null,
      isProjectSingularity: true,
      state: 'video',
    })
    expect(dto.description).toBeNull()
  })

  it('normalizes nullable member fields', () => {
    expect(
      memberRowToAuthor({
        MemberId: 1,
        Alias: 'Creator',
        Twitch: null,
        Youtube: null,
        YoutubeId: null,
        DiscordInvite: null,
      }),
    ).toEqual({
      memberId: 1,
      alias: 'Creator',
      twitch: undefined,
      youtube: '',
      youtubeId: '',
      discordInvite: undefined,
    })
  })
})
