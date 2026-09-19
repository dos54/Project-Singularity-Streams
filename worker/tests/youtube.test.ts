import { describe, expect, it, vi } from 'vitest'
import {
  fetchAtomFeed,
  fetchLiveStatusesFromYoutube,
  selectVideosNeedingRefresh,
} from '../src/services/youtubeService'
import { Status } from '../src/types/youtube'
import { env, liveStatus, video } from './fixtures'

describe('YouTube requests and refresh selection', () => {
  it('makes no quota-consuming request for an empty refresh list', async () => {
    expect(await fetchLiveStatusesFromYoutube(env, [])).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('batches 101 IDs into three requests of at most 50 without losing results', async () => {
    const fetcher = vi.fn(async (input: string) => {
      const url = new URL(input)
      expect(url.origin).toBe(env.YT_API_BASE)
      expect(url.searchParams.get('part')).toBe('liveStreamingDetails')
      return Response.json({
        items: url.searchParams
          .get('id')!
          .split(',')
          .map((id) => ({ id })),
      })
    })
    vi.stubGlobal('fetch', fetcher)
    const ids = Array.from({ length: 101 }, (_, i) => `video-${i}`)
    const items = await fetchLiveStatusesFromYoutube(env, ids)
    expect(items.map((i) => i.id).sort()).toEqual([...ids].sort())
    expect(
      fetcher.mock.calls.map(([url]) => new URL(url).searchParams.get('id')!.split(',').length),
    ).toEqual([50, 50, 1])
  })

  it('rejects an upstream API failure instead of returning an empty success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Unavailable', { status: 503 })),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(fetchLiveStatusesFromYoutube(env, ['video-1'])).rejects.toThrow('503')
  })

  it('encodes the channel ID when fetching an Atom feed', async () => {
    const fetcher = vi.fn(async (_input: string | URL) => new Response('<feed/>'))
    vi.stubGlobal('fetch', fetcher)
    expect(await fetchAtomFeed(env, 'channel&unexpected=1')).toBe('<feed/>')
    const url = new URL(String(fetcher.mock.calls[0]![0]))
    expect(url.pathname).toBe('/feeds/videos.xml')
    expect(url.searchParams.get('channel_id')).toBe('channel&unexpected=1')
    expect(url.searchParams.has('unexpected')).toBe(false)
  })

  it('rejects unsuccessful feed responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    )
    await expect(fetchAtomFeed(env, 'channel-1')).rejects.toThrow('http-404')
  })

  it('selects unknown and stale inactive statuses but leaves fresh statuses alone', () => {
    const now = 2_000_000
    const items = [
      { ...video({ id: 'unknown' }), liveStatus: null },
      { ...video({ id: 'stale' }), liveStatus: liveStatus({ lastChecked: now - 1_800_001 }) },
      { ...video({ id: 'fresh' }), liveStatus: liveStatus({ lastChecked: now }) },
      {
        ...video({ id: 'live' }),
        liveStatus: liveStatus({ state: Status.live, lastChecked: now - 600_000 }),
      },
    ]
    expect(selectVideosNeedingRefresh(items, now)).toEqual(['unknown', 'stale', 'live'])
  })
})
