import { ref, onUnmounted } from 'vue'
import type { YoutubeVideo } from '@/types/youtube'
import { apiKey, readState, writeState, validTime } from '@/utils/browserState'
import { isRecord, isVideo } from '@/utils/dataValidation'
import { requestJson } from '@/utils/requests'

const CACHE = 'twitch-vods:v1'
const MAX_AGE = 2 * 60 * 60_000
export function useTwitchVideos() {
  const videos = ref<YoutubeVideo[]>([])
  const warning = ref('')
  let controller: AbortController | undefined
  let disposed = false
  let receivedAt = 0
  const cached = readState<unknown>(CACHE, null)
  if (
    isRecord(cached) &&
    validTime(cached.receivedAt) &&
    Date.now() - Number(cached.receivedAt) < MAX_AGE &&
    Array.isArray(cached.videos) &&
    cached.videos.every((v) => isVideo(v) && v.platform === 'twitch')
  ) {
    videos.value = cached.videos
    receivedAt = Number(cached.receivedAt)
  }
  async function refresh() {
    if (controller || disposed) return
    controller = new AbortController()
    try {
      const result = await requestJson<{ videos: YoutubeVideo[]; stale: boolean }>(
        `${apiKey}/twitch/videos`,
        controller.signal,
      )
      if (
        !Array.isArray(result?.videos) ||
        !result.videos.every((v) => isVideo(v) && v.platform === 'twitch') ||
        typeof result.stale !== 'boolean'
      )
        throw new Error('Invalid Twitch VOD response')
      if (disposed) return
      // Complete server snapshots replace old entries, including expired VODs. Never union them.
      videos.value = result.videos
      receivedAt = Date.now()
      warning.value = result.stale
        ? 'Twitch recordings may be out of date; the last available list is shown.'
        : ''
      writeState(CACHE, { videos: result.videos, receivedAt })
    } catch {
      if (Date.now() - receivedAt >= MAX_AGE) videos.value = []
      if (!disposed)
        warning.value = 'Twitch recordings could not refresh. YouTube videos are still available.'
    } finally {
      controller = undefined
    }
  }
  function clearCache() {
    return writeState(CACHE, null)
  }
  onUnmounted(() => {
    disposed = true
    controller?.abort()
  })
  return { videos, warning, refresh, clearCache }
}
