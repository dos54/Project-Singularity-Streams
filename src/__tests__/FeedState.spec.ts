import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { useUploads } from '../composables/useUploads'
import { useMemberStore } from '../stores/member.store'
import { readVideoCache, writeVideoCache } from '../utils/videoCache'
import { apiKey } from '../utils/browserState'
import type { YoutubeVideo } from '../types/youtube'

// These tests cover the permanent YouTube archive; Twitch replacement semantics have a separate suite.
vi.mock('../composables/useTwitchVideos', async () => {
  const { ref } = await import('vue')
  return { useTwitchVideos: () => ({ videos: ref([]), warning: ref(''), refresh: async () => {}, clearCache: () => true }) }
})

function video(id: number): YoutubeVideo {
  return {
    videoId: String(id),
    memberId: 1,
    title: `Video ${id}`,
    publishedAt: new Date(Date.UTC(2026, 0, 1, 0, id)).toISOString(),
    thumbnailUrl: null,
    state: 'video',
    isProjectSingularity: true,
  }
}
const wrappers: Array<ReturnType<typeof mount>> = []
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  setActivePinia(createPinia())
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
function uploads() {
  let result!: ReturnType<typeof useUploads>

  wrappers.push(
    mount(
      defineComponent({
        setup() {
          result = useUploads()
          return () => null
        },
      }),
    ),
  )
  return { feed: result }
}
it('loads 100 initially, refreshes only 10, and preserves archived videos and continuation', async () => {
  let refreshed = false
  const fetch = vi.fn(async (url: string) => {
    const params = new URL(url, 'https://example.test').searchParams
    const videos =
      params.get('limit') === '100'
        ? Array.from({ length: 100 }, (_, i) => video(i))
        : [video(101), video(100), video(99)]
    refreshed = params.get('limit') === '10'
    return Response.json({ videos, nextCursor: refreshed ? 'head-cursor' : 'history-cursor' })
  })
  vi.stubGlobal('fetch', fetch)
  const { feed } = uploads()
  await feed.initialize()
  expect(feed.videos.value).toHaveLength(100)
  await feed.refresh()
  expect(feed.videos.value).toHaveLength(102)
  expect(feed.videos.value[0]?.videoId).toBe('101')
  expect(feed.nextCursor.value).toBe('history-cursor')
  expect(
    fetch.mock.calls.map(([url]) => new URL(url, 'https://example.test').searchParams.get('limit')),
  ).toEqual(['100', '10'])
  expect(feed.headReceivedAt.value).not.toBeNull()
  expect((await readVideoCache(apiKey))?.videos).toHaveLength(102)
})
it('restores the entire cache and opens a gap without discarding it when new results do not overlap', async () => {
  await writeVideoCache(apiKey, { videos: [video(1), video(2)], nextCursor: null })
  const fetch = vi.fn(async (url: string) =>
    Response.json({
      videos: new URL(url, 'https://example.test').searchParams.has('cursor')
        ? [video(3), video(2), video(1)]
        : [video(10)],
      nextCursor: new URL(url, 'https://example.test').searchParams.has('cursor') ? null : 'gap',
    }),
  )
  vi.stubGlobal('fetch', fetch)
  const { feed } = uploads()
  await feed.initialize()
  expect(feed.videos.value).toHaveLength(3)
  expect(feed.nextCursor.value).toBe('gap')
  expect(fetch.mock.calls[0]![0]).toContain('limit=10')
  const headTime = feed.headReceivedAt.value
  await feed.loadAll()
  expect(feed.nextCursor.value).toBeNull()
  expect(feed.videos.value).toHaveLength(4)
  expect(feed.headReceivedAt.value).toBe(headTime)
  expect(feed.archiveReceivedAt.value).not.toBeNull()
})
it('retains cached data on a throttled refresh, preserves its age, and blocks duplicate requests', async () => {
  await writeVideoCache(apiKey, {
    videos: [video(1)],
    nextCursor: null,
    headReceivedAt: 1700000000000,
  })
  const fetch = vi.fn(
    async () => new Response('', { status: 503, headers: { 'Retry-After': '60' } }),
  )
  vi.stubGlobal('fetch', fetch)
  const { feed } = uploads()
  await feed.initialize()
  await feed.refresh()
  expect(feed.videos.value).toHaveLength(1)
  expect(feed.headReceivedAt.value).toBe(1700000000000)
  expect(feed.error.value).toContain('503')
  expect(feed.retryAt.value).toBeGreaterThan(Date.now())
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('reports separate stream failures, preserves old data, and retries only failed sources', async () => {
  let failTwitch = false
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith('/members'))
      return Response.json({ members: [{ memberId: 1, alias: 'Creator', twitch: 'creator' }] })
    if (url.endsWith('/youtube/videos')) return Response.json({ videos: [] })
    return failTwitch
      ? new Response('', { status: 500 })
      : Response.json({ liveStreams: [{ login: 'creator', isLive: true }] })
  })
  vi.stubGlobal('fetch', fetch)
  const store = useMemberStore()
  await store.hydrate()
  expect(store.streamingMembers).toHaveLength(1)
  const originalTime = store.sourceState.twitch.receivedAt
  failTwitch = true
  await Promise.all([store.refreshStreams(), store.refreshStreams()])
  expect(fetch).toHaveBeenCalledTimes(5)
  expect(store.sourceState.twitch.error).toContain('500')
  expect(store.sourceState.youtube.error).toBe('')
  expect(store.sourceState.twitch.receivedAt).toBe(originalTime)
  expect(store.streamingMembers).toHaveLength(1)
  failTwitch = false
  await store.refreshStreams(true)
  expect(fetch).toHaveBeenCalledTimes(6)
  expect(fetch.mock.calls[5]![0]).toContain('/twitch/livestreams')
  expect(store.sourceState.twitch.error).toBe('')
})

it('reuses recent in-memory uploads when returning through client-side navigation', async () => {
  const fetch = vi.fn(async () => Response.json({ videos: [video(1)], nextCursor: null }))
  vi.stubGlobal('fetch', fetch)
  const first = uploads()
  await first.feed.initialize()
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  const returned = uploads()
  await returned.feed.initialize()
  expect(returned.feed.videos.value).toHaveLength(1)
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('upgrades legacy IndexedDB snapshots without losing the loaded archive', async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('singularity-video-cache', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction('snapshots', 'readwrite')
      transaction
        .objectStore('snapshots')
        .put({ videos: [video(1)], nextCursor: 'old-cursor' }, apiKey)
      transaction.oncomplete = () => {
        db.close()
        resolve()
      }
    }
  })
  expect(await readVideoCache(apiKey)).toEqual({ videos: [video(1)], nextCursor: 'old-cursor' })
})

it('refreshes the member directory after an hour in an open session', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1_780_000_000_000)
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      url.endsWith('/members')
        ? { members: [{ memberId: 1, alias: 'Creator' }] }
        : url.endsWith('/youtube/videos')
          ? { videos: [] }
          : { liveStreams: [] },
    ),
  )
  vi.stubGlobal('fetch', fetch)
  const store = useMemberStore()
  await store.hydrate()
  clock.mockReturnValue(Date.now() + 30 * 60_000)
  await store.refreshStreams()
  expect(fetch.mock.calls.filter(([url]) => url.endsWith('/members'))).toHaveLength(1)
  clock.mockReturnValue(Date.now() + 31 * 60_000)
  await store.refreshStreams()
  expect(fetch.mock.calls.filter(([url]) => url.endsWith('/members'))).toHaveLength(2)
})

it('keeps the newest live YouTube broadcast when a creator has more than one', () => {
  const store = useMemberStore()
  store.members = [{ memberId: 1, alias: 'Creator' }]
  store.youtubeVideos = [{ ...video(3), state: 'live' }, { ...video(2), state: 'live' }, video(4)]
  expect(store.streamingMembers[0]?.latestYoutubeVideo?.videoId).toBe('3')
})

it('does not restore cleared cache from the in-memory snapshot after leaving the page', async () => {
  const fetch = vi.fn(async () => Response.json({ videos: [video(1)], nextCursor: null }))
  vi.stubGlobal('fetch', fetch)
  const first = uploads()
  await first.feed.initialize()
  await first.feed.clearCache()
  expect(first.feed.videos.value).toHaveLength(1)
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  const returned = uploads()
  await returned.feed.initialize()
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('retains the loaded archive when an older tab writes its smaller snapshot', async () => {
  await writeVideoCache(apiKey, {
    videos: [video(1), video(2), video(3)],
    nextCursor: null,
    headReceivedAt: 100,
  })
  await writeVideoCache(apiKey, {
    videos: [video(3), video(4)],
    nextCursor: 'older',
    headReceivedAt: 200,
  })
  const saved = await readVideoCache(apiKey)
  expect(saved?.videos.map((item) => item.videoId).sort()).toEqual(['1', '2', '3', '4'])
})

it('merges simultaneous cache writers and keeps a newer head gap open', async () => {
  await Promise.all([
    writeVideoCache(apiKey, {
      videos: [video(1), video(2)],
      nextCursor: null,
      headReceivedAt: 100,
    }),
    writeVideoCache(apiKey, { videos: [video(10)], nextCursor: 'gap', headReceivedAt: 200 }),
  ])
  await writeVideoCache(apiKey, {
    videos: [video(2), video(3)],
    nextCursor: null,
    headReceivedAt: 100,
    archiveReceivedAt: 300,
  })
  const saved = await readVideoCache(apiKey)
  expect(saved?.videos.map((item) => item.videoId)).toEqual(['10', '3', '2', '1'])
  expect(saved?.nextCursor).toBe('gap')
})

it('rejects corrupt legacy cache entries and closes a blocked open when it eventually completes', async () => {
  const oldDatabase = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('singularity-video-cache', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  await new Promise<void>((resolve) => {
    const transaction = oldDatabase.transaction('snapshots', 'readwrite')
    transaction
      .objectStore('snapshots')
      .put({ videos: [{ ...video(1), title: 123 }], nextCursor: null }, apiKey)
    transaction.oncomplete = () => resolve()
  })
  expect(await readVideoCache(apiKey)).toBeNull() // version upgrade blocked by the old tab
  oldDatabase.close()
  expect(await readVideoCache(apiKey)).toBeNull() // invalid title type, not safe to render
  await new Promise<void>((resolve, reject) => {
    const upgrade = indexedDB.open('singularity-video-cache', 3)
    upgrade.onblocked = () => reject(new Error('Abandoned connection still open'))
    upgrade.onsuccess = () => {
      upgrade.result.close()
      resolve()
    }
    upgrade.onerror = () => reject(upgrade.error)
  })
})

it('retains valid videos when a malformed refresh would break search or sorting', async () => {
  await writeVideoCache(apiKey, { videos: [video(1)], nextCursor: null, headReceivedAt: 100 })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ videos: [{ ...video(2), title: { invalid: true } }], nextCursor: null }),
    ),
  )
  const { feed } = uploads()
  await feed.initialize()
  expect(feed.videos.value.map((item) => item.videoId)).toEqual(['1'])
  expect(feed.headReceivedAt.value).toBe(100)
  expect(feed.error.value).toContain('Invalid video response')
})

it('preserves valid stream and member data after malformed responses', async () => {
  let corrupt = false
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      url.endsWith('/members')
        ? { members: [{ memberId: 1, alias: corrupt ? 123 : 'Creator' }] }
        : url.endsWith('/youtube/videos')
          ? { videos: [{ ...video(1), description: corrupt ? {} : '' }] }
          : { liveStreams: [{ login: 'creator', isLive: corrupt ? 'yes' : true }] },
    ),
  )
  vi.stubGlobal('fetch', fetch)
  const store = useMemberStore()
  await store.hydrate()
  corrupt = true
  store.sourceState.members.receivedAt = 1
  await store.refreshStreams()
  expect(store.members[0]?.alias).toBe('Creator')
  expect(store.youtubeVideos[0]?.description).toBe('')
  expect(store.twitchStreams.creator?.isLive).toBe(true)
  expect(
    Object.values(store.sourceState).every((source) => source.error.startsWith('Invalid')),
  ).toBe(true)
})

it('stops a cyclic archive cursor instead of issuing requests indefinitely', async () => {
  await writeVideoCache(apiKey, { videos: [video(1)], nextCursor: 'a' })
  const fetch = vi.fn(async (url: string) => {
    const cursor = new URL(url, 'https://example.test').searchParams.get('cursor')
    return Response.json({ videos: [video(1)], nextCursor: cursor === 'a' ? 'b' : 'a' })
  })
  vi.stubGlobal('fetch', fetch)
  const { feed } = uploads()
  await feed.initialize()
  await feed.loadAll()
  expect(fetch).toHaveBeenCalledTimes(3)
  expect(feed.error.value).toContain('did not advance')
  expect(feed.loadingAll.value).toBe(false)
})
