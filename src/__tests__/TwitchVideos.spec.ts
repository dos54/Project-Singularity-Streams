import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { IDBFactory } from 'fake-indexeddb'
import { useUploads } from '../composables/useUploads'
import { useTwitchVideos } from '../composables/useTwitchVideos'
import { readState, writeState } from '../utils/browserState'
import { parseBrowseQuery, defaultFilters, serializeBrowse } from '../utils/browseQuery'

const video = {
  platform: 'twitch',
  videoId: 'twitch:123',
  memberId: 1,
  title: 'Recording',
  description: '',
  publishedAt: '2026-09-24T12:00:00Z',
  thumbnailUrl: '',
  state: 'ended',
  isProjectSingularity: true,
}
const wrappers: ReturnType<typeof mount>[] = []
it('combines platforms without ID collisions and removes an expired Twitch VOD without deleting YouTube history', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  let expired = false
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes('/twitch/videos')
              ? { videos: expired ? [] : [video], stale: false }
              : { videos: [{ ...video, platform: 'youtube', videoId: '123' }], nextCursor: null },
          ),
        ),
    ),
  )
  let feed!: ReturnType<typeof useUploads>
  wrappers.push(
    mount(
      defineComponent({
        setup() {
          feed = useUploads()
          return () => null
        },
      }),
      { global: { plugins: [createPinia()] } },
    ),
  )
  await feed.initialize()
  expect(feed.videos.value.map((v) => v.videoId).sort()).toEqual(['123', 'twitch:123'])
  expired = true
  await feed.refresh()
  expect(feed.videos.value.map((v) => v.videoId)).toEqual(['123'])
})
function setup() {
  let feed!: ReturnType<typeof useTwitchVideos>
  wrappers.push(
    mount(
      defineComponent({
        setup() {
          feed = useTwitchVideos()
          return () => null
        },
      }),
    ),
  )
  return feed
}
beforeEach(() => localStorage.clear())
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  vi.unstubAllGlobals()
})
it('restores recent VODs then replaces, rather than merges, an expired archive', async () => {
  writeState('twitch-vods:v1', { videos: [video], receivedAt: Date.now() })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ videos: [], stale: false }))),
  )
  const feed = setup()
  expect(feed.videos.value).toHaveLength(1)
  await feed.refresh()
  expect(feed.videos.value).toEqual([])
  expect(readState('twitch-vods:v1', null)).toMatchObject({ videos: [] })
})
it('retains recent cached VODs on errors and rejects malformed snapshots', async () => {
  writeState('twitch-vods:v1', { videos: [video], receivedAt: Date.now() })
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ videos: [{ ...video, videoId: 'unsafe' }], stale: false })),
    ),
  )
  const feed = setup()
  await feed.refresh()
  expect(feed.videos.value).toEqual([video])
  expect(feed.warning.value).toContain('could not refresh')
})
it('does not restore stale recordings or a cleared browser cache', () => {
  writeState('twitch-vods:v1', { videos: [video], receivedAt: Date.now() - 3 * 60 * 60_000 })
  const feed = setup()
  expect(feed.videos.value).toEqual([])
  expect(feed.clearCache()).toBe(true)
  expect(readState('twitch-vods:v1', null)).toBeNull()
})
it('includes the platform in shared links and ignores invalid platform values', () => {
  expect(
    parseBrowseQuery(serializeBrowse({ ...defaultFilters, platform: 'twitch' }), defaultFilters)
      .platform,
  ).toBe('twitch')
  expect(parseBrowseQuery({ platform: 'garbage' }, defaultFilters).platform).toBe('all')
})
