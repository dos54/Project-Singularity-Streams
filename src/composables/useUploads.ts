import { computed, onUnmounted, ref } from 'vue'
import { useTwitchVideos } from './useTwitchVideos'
import type { YoutubeVideo } from '@/types/youtube'
import { readVideoCache, writeVideoCache, clearVideoCache } from '@/utils/videoCache'
import { apiKey, validTime } from '@/utils/browserState'
import { requestJson, RequestError } from '@/utils/requests'
import { defineStore } from 'pinia'
import type { VideoSnapshot } from '@/utils/videoCache'
import { isVideo, compareVideos } from '@/utils/dataValidation'

const useUploadMemory = defineStore('upload-memory', () => ({
  snapshot: ref<VideoSnapshot | null>(null),
}))

export function useUploads() {
  const twitch = useTwitchVideos()
  const memory = useUploadMemory()
  const videos = ref<YoutubeVideo[]>([])
  const nextCursor = ref<string | null>(null)
  const headReceivedAt = ref<number | null>(null)
  const archiveReceivedAt = ref<number | null>(null)
  const busy = ref(false)
  const initializing = ref(true)
  const loadingAll = ref(false)
  const error = ref('')
  const storageWarning = ref(false)
  const retryAt = ref(0)
  let controller: AbortController | undefined
  let disposed = false
  function cancel() {
    controller?.abort()
  }
  function pause(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort)
        resolve()
      }, ms)
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
    })
  }
  async function save() {
    const snapshot = JSON.parse(
      JSON.stringify({
        videos: videos.value,
        nextCursor: nextCursor.value,
        headReceivedAt: headReceivedAt.value,
        archiveReceivedAt: archiveReceivedAt.value,
      }),
    ) as VideoSnapshot
    memory.snapshot = snapshot
    storageWarning.value = !(await writeVideoCache(apiKey, snapshot))
  }
  async function batch(head: boolean, limit: number, signal: AbortSignal) {
    const cursor = head ? null : nextCursor.value
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) params.set('cursor', cursor)
    let data!: { videos: YoutubeVideo[]; nextCursor: string | null }
    for (let attempt = 0; ; attempt++) {
      try {
        data = await requestJson<typeof data>(`${apiKey}/youtube/uploads?${params}`, signal)
        break
      } catch (failure) {
        const wait = failure instanceof RequestError ? failure.retryAt - Date.now() : 0
        // Only an explicit archive download retries automatically, at most twice per batch.
        if (head || attempt >= 2 || wait <= 0 || wait > 120_000 || signal.aborted) throw failure
        retryAt.value = Date.now() + wait
        await pause(wait, signal)
        retryAt.value = 0
      }
    }
    if (
      !Array.isArray(data?.videos) ||
      !data.videos.every(isVideo) ||
      !(data.nextCursor === null || typeof data.nextCursor === 'string')
    )
      throw new Error('Invalid video response. Please retry.')
    if (disposed || signal.aborted) return
    if (cursor && data.nextCursor === cursor)
      throw new Error('Video history did not advance. Please retry.')
    const existing = new Map(videos.value.map((video) => [video.videoId, video]))
    const overlap = data.videos.some((video) => existing.has(video.videoId))
    for (const video of data.videos) existing.set(video.videoId, video)
    videos.value = [...existing.values()].sort(compareVideos)
    // A non-overlapping head opens a gap. Let explicit Load all fill it; never lose stored history.
    if (!head || !overlap) nextCursor.value = data.nextCursor
    if (head) {
      headReceivedAt.value = Date.now()
    } else archiveReceivedAt.value = Date.now()
    await save()
  }
  async function load(head = true, limit = 10, all = false) {
    if (busy.value || disposed || Date.now() < retryAt.value) return retryAt.value
    busy.value = true
    loadingAll.value = all
    error.value = ''
    controller = new AbortController()
    const signal = controller.signal
    const cursors = new Set<string | null>()
    try {
      do {
        const cursor = head ? null : nextCursor.value
        if (cursors.has(cursor)) throw new Error('Video history did not advance. Please retry.')
        cursors.add(cursor)
        await batch(head, limit, signal)
      } while (all && nextCursor.value && !signal.aborted && !disposed)
      retryAt.value = 0
    } catch (failure) {
      if (!signal.aborted) {
        retryAt.value = failure instanceof RequestError ? failure.retryAt : 0
        error.value =
          failure instanceof Error ? failure.message : 'Could not load videos. Please retry.'
      }
    } finally {
      busy.value = false
      loadingAll.value = false
    }
    return retryAt.value
  }
  async function initialize() {
    try {
      const remembered = memory.snapshot
      const cached = remembered ?? (await readVideoCache(apiKey))
      if (disposed) return
      if (cached) {
        videos.value = cached.videos
        nextCursor.value = cached.nextCursor
        headReceivedAt.value = validTime(cached.headReceivedAt)
        archiveReceivedAt.value = validTime(cached.archiveReceivedAt)
      }
      if (remembered?.headReceivedAt && Date.now() - remembered.headReceivedAt < 2 * 60_000) return
      return await load(true, cached?.videos.length ? 10 : 100)
    } finally {
      initializing.value = false
    }
  }
  async function clearCache() {
    const cleared = await clearVideoCache(apiKey)
    const twitchCleared = twitch.clearCache()
    if (cleared) memory.snapshot = null
    storageWarning.value = !cleared
    return cleared && twitchCleared
  }
  onUnmounted(() => {
    disposed = true
    cancel()
  })
  return {
    videos: computed(() => [...videos.value, ...twitch.videos.value].sort(compareVideos)),
    twitchWarning: twitch.warning,
    nextCursor,
    headReceivedAt,
    archiveReceivedAt,
    busy,
    initializing,
    loadingAll,
    error,
    storageWarning,
    retryAt,
    initialize: async () => { const [result] = await Promise.all([initialize(), twitch.refresh()]); return result },
    refresh: async () => { const [result] = await Promise.all([load(), twitch.refresh()]); return result },
    loadAll: () => load(false, nextCursor.value ? 500 : 100, true),
    cancel,
    clearCache,
  }
}
