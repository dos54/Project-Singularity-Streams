import { describe, expect, it, vi } from 'vitest'
import { determineLiveStatus } from '../src/models/video'
import { atomEntryToVideo } from '../src/mappers/videoMapper'
import { parseXmlFeed } from '../src/parsers/youtube/atomParser'
import {
  fetchLiveStatusesFromYoutube,
  selectVideosNeedingRefresh,
} from '../src/services/youtubeService'
import { Status } from '../src/types/youtube'
import { env, liveStatus, video } from './fixtures'

describe('fixed regressions', () => {
  it('B1: ended streams take precedence over leftover viewer/chat fields', () => {
    expect(
      determineLiveStatus(
        liveStatus({
          actualStartTime: '2026-01-01',
          actualEndTime: '2026-01-02',
          concurrentViewers: 10,
        }),
      ),
    ).toBe(Status.video)
  })

  it('B2: live streams do not depend on a public viewer count or enabled chat', () => {
    expect(determineLiveStatus(liveStatus({ actualStartTime: '2026-01-01' }))).toBe(Status.live)
  })

  it('B3: the documented five-minute live refresh interval is respected', () => {
    expect(
      selectVideosNeedingRefresh(
        [{ ...video(), liveStatus: liveStatus({ state: Status.live, lastChecked: 0 }) }],
        10_000,
      ),
    ).toEqual([])
  })

  it('B4: YouTube failure logs never contain the API key', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Unavailable', { status: 503 })),
    )
    await fetchLiveStatusesFromYoutube(env, ['video-1']).catch(() => {})
    expect(JSON.stringify(log.mock.calls)).not.toContain(env.YOUTUBE_API_KEY)
  })

  it('B5: the documented minimal push payload can be ingested without media:group', () => {
    const parsed = parseXmlFeed(
      '<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><entry><yt:videoId>video-1</yt:videoId><yt:channelId>channel-1</yt:channelId><title>Project Singularity</title><published>2026-01-01T00:00:00Z</published></entry></feed>',
    )
    const entry = Array.isArray(parsed.feed.entry) ? parsed.feed.entry[0]! : parsed.feed.entry
    expect(atomEntryToVideo(entry, video().author)).toMatchObject({
      id: 'video-1',
      thumbnailUrl: null,
    })
  })
})
