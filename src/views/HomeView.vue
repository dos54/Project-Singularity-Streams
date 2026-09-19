<template>
  <v-container class="home-container">
    <v-row>
      <img src="/project-singularity.png" alt="Project Singularity" class="ma-auto fade-edges hero-img" />
    </v-row>

    <!-- Mobile drawer for members -->
    <v-navigation-drawer
      v-model="membersDrawer"
      location="left"
      temporary
      class="d-md-none drawer-75"
      width="300"
    >
      <v-toolbar flat>
        <v-toolbar-title>Members</v-toolbar-title>
        <v-spacer />
        <v-btn icon @click="membersDrawer = false">
          <v-icon icon="fa-regular fa-circle-xmark" />
        </v-btn>
      </v-toolbar>

      <v-divider />

      <v-list>
        <v-list-item v-for="member in sortedMembers" :key="member.memberId">
          <MemberList :user="member" />
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-row>
      <v-col cols="3" class="d-none d-md-block">
        <h2>Members</h2>
        <ul class="list">
          <li v-for="member in sortedMembers" :key="member.memberId">
            <MemberList :user="member" />
          </li>
        </ul>
      </v-col>

      <v-col cols="12" md="9">
        <!-- Mobile: button to open drawer -->
        <div class="d-flex justify-start mb-4 d-md-none">
          <v-btn variant="outlined" color="primary" @click="membersDrawer = true">
            Show Members
          </v-btn>
        </div>

        <section>
          <h2>Currently Streaming</h2>
          <v-switch
            v-model="onlyProjectSingularityStreams"
            label="Project Singularity only" color="primary" inset hide-details class="project-filter"
          ></v-switch>

          <v-switch v-if="isDevelopment" v-model="demo" label="Preview demo livestreams (local only)" />
          <p v-if="demo">Development preview — these streams are fictional.</p>
          <p v-if="error && !demo" role="status">Some stream data could not load. Available streams are shown below.</p>
          <p v-if="!loading || demo" class="result-count stream-count" aria-live="polite">Showing {{ filteredStreamingMembers.length }} of {{ demo ? demoStreams.length : streamingMembers.length }} active creators{{ error && !demo ? ' · Partial data' : '' }}</p>
          <div v-if="loading && !demo">Loading streaming status...</div>
          <div v-else-if="filteredStreamingMembers.length === 0">No streams found.</div>

          <ul v-else class="list media-grid">
            <li v-for="member in filteredStreamingMembers" :key="member.memberId">
              <StreamingList :user="member" />
            </li>
          </ul>
        </section>

        <br />

        <section>
          <h2>Latest Videos</h2>
          <v-switch
            v-model="onlyProjectSingularity"
            label="Project Singularity only" color="primary" inset hide-details class="project-filter"
          ></v-switch>

          <div class="video-filters">
            <label>Search videos<input v-model="search" type="search" placeholder="Title or description" /></label>
            <label>Creator<select v-model="creator"><option value="">All creators</option><option v-for="member in sortedMembers" :key="member.memberId" :value="String(member.memberId)">{{ member.alias }}</option></select></label>
            <label>Per page<select v-model.number="pageSize"><option v-for="size in [10, 20, 50, 100]" :key="size" :value="size">{{ size }}</option></select></label>
          </div>
          <p class="result-count" aria-live="polite">{{ filteredVideos.length }} matching · {{ loadedVideos.length }} videos loaded{{ nextCursor ? ' · More history available' : '' }}</p>
          <div class="history-controls">
            <v-btn v-if="nextCursor && !loadingAll" :disabled="pageLoading" variant="outlined" @click="loadVideos(true)">Load all videos</v-btn>
            <template v-if="loadingAll || waitingForLimit">
              <span role="status">{{ waitingForLimit ? `Server limit reached. Continuing in ${retrySeconds}s…` : 'Loading all videos…' }} {{ loadedVideos.length }} loaded</span>
              <v-btn variant="text" @click="cancelLoading">Stop</v-btn>
            </template>
          </div>
          <p v-if="cacheWarning" role="status">Browser storage is unavailable or full. Videos remain available until you leave this page.</p>
          <nav class="pagination pagination-top" aria-label="Video pages above list">
            <v-btn :disabled="pageLoading || pageIndex === 0" @click="pageIndex--">Previous</v-btn>
            <span>Page {{ pageIndex + 1 }} of {{ pageCount }}</span>
            <v-btn :disabled="pageLoading || pageIndex + 1 >= pageCount" @click="pageIndex++">Next</v-btn>
          </nav>
          <div v-if="pageLoading && !loadedVideos.length">Loading videos...</div>
          <div v-else-if="pageVideos.length === 0">
            {{ pageError || 'No uploads found.' }}
          </div>

          <div v-else class="video-columns">
            <ul v-for="(column, index) in videoColumns" :key="index" class="list video-column">
              <li v-for="video in column" :key="video.videoId"><NewVideoList :video="video" /></li>
            </ul>
          </div>
          <p v-if="pageError && pageVideos.length" role="alert">{{ pageError }}</p>
          <nav class="pagination" aria-label="Video pages">
            <v-btn :disabled="pageLoading || pageIndex === 0" @click="pageIndex--">Previous</v-btn>
            <span aria-live="polite">Page {{ pageIndex + 1 }} of {{ pageCount }}</span>
            <v-btn :disabled="pageLoading || pageIndex + 1 >= pageCount" @click="pageIndex++">Next</v-btn>
            <v-btn v-if="pageError" :disabled="pageLoading" @click="loadVideos(retryAll)">Retry</v-btn>
          </nav>
        </section>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { readPreference, savePreference, parsePageSize } from '@/utils/preferences'
import { readVideoCache, writeVideoCache } from '@/utils/videoCache'
import type { YoutubeVideo } from '@/types/youtube'
import type { MemberWithComputed } from '@/types/member'
import { storeToRefs } from 'pinia'
import { useMemberStore } from '@/stores/member.store'

import StreamingList from '@/components/StreamingList.vue'
import MemberList from '@/components/MemberList.vue'
import NewVideoList from '@/components/NewVideoList.vue'
import { isPsTwitchStream } from '@/utils'

const membersDrawer = ref(false)

const memberStore = useMemberStore()
const { sortedMembers, streamingMembers, loading, error } = storeToRefs(memberStore)

const onlyProjectSingularity = ref(readPreference('project-videos') !== 'false')
const onlyProjectSingularityStreams = ref(readPreference('project-streams') !== 'false')
watch(onlyProjectSingularity, value => savePreference('project-videos', String(value)))
watch(onlyProjectSingularityStreams, value => savePreference('project-streams', String(value)))

const isDevelopment = import.meta.env.DEV
const demo = ref(false)
const demoStreams = ref<MemberWithComputed[]>([])
watch(demo, async enabled => {
  if (import.meta.env.DEV && enabled) demoStreams.value = (await import('@/dev/streams')).demoStreams
})
const filteredStreamingMembers = computed(() => {
  if (demo.value && isDevelopment) return demoStreams.value
  if (!onlyProjectSingularityStreams.value) {
    return streamingMembers.value
  }

  const filteredStreamers = streamingMembers.value.filter((member) => {
    const title = member.twitchStream?.title ?? ''
    const isTwitchLive =
      !!member.twitchStream?.isLive && isPsTwitchStream(title)

    const yt = member.latestYoutubeVideo
    const isYtPsLive = !!yt && yt.state === 'live' && yt.isProjectSingularity

    return isTwitchLive || isYtPsLive
  })

  return filteredStreamers
})

const route = useRoute()
const router = useRouter()
const pageSize = ref(parsePageSize(route.query.pageSize) ?? parsePageSize(readPreference('page-size')) ?? 10)
const search = ref('')
const creator = ref('')
const loadedVideos = ref<YoutubeVideo[]>([])
const pageLoading = ref(false)
const pageError = ref('')
const pageIndex = ref(0)
const nextCursor = ref<string | null>(null)
const loadingAll = ref(false)
const waitingForLimit = ref(false)
const retrySeconds = ref(0)
const cacheWarning = ref(false)
const cacheKey = String(import.meta.env.VITE_API_BASE_URL)
let disposed = false
const retryAll = ref(false)
let controller: AbortController | undefined
function cancelLoading() { controller?.abort() }
function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
}
async function fetchBatch(signal: AbortSignal, refresh = false) {
  const cursor = refresh ? null : nextCursor.value
  const params = new URLSearchParams({ limit: cursor ? '500' : '100' })
  if (cursor) params.set('cursor', cursor)
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(import.meta.env.VITE_API_BASE_URL + '/youtube/uploads?' + params, { signal })
    const retryAfter = Number(response.headers.get('Retry-After'))
    if ((response.status === 429 || response.status === 503) && retryAfter > 0 && retryAfter <= 120 && attempt < 2) {
      waitingForLimit.value = true
      for (retrySeconds.value = Math.ceil(retryAfter); retrySeconds.value > 0; retrySeconds.value--) await pause(1000, signal)
      waitingForLimit.value = false
      continue
    }
    if (!response.ok) throw new Error('Could not load videos (HTTP ' + response.status + '). Please retry.')
    const data = await response.json() as { videos: YoutubeVideo[]; nextCursor: string | null }
    if (data.nextCursor && data.nextCursor === cursor) throw new Error('Video history did not advance. Please retry.')
    const existing = new Map(loadedVideos.value.map(video => [video.videoId, video]))
    const overlaps = data.videos.some(video => existing.has(video.videoId))
    for (const video of data.videos) existing.set(video.videoId, video)
    loadedVideos.value = [...existing.values()].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || b.videoId.localeCompare(a.videoId))
    if (!refresh || !overlaps) nextCursor.value = data.nextCursor
    // Strip Vue proxies before writing a structured-clone snapshot to IndexedDB.
    cacheWarning.value = !await writeVideoCache(cacheKey, JSON.parse(JSON.stringify({ videos: loadedVideos.value, nextCursor: nextCursor.value })))
    return
  }
}
const filteredVideos = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return loadedVideos.value.filter(video =>
    (!onlyProjectSingularity.value || video.isProjectSingularity) &&
    (!creator.value || video.memberId === Number(creator.value)) &&
    (!query || [video.title, video.description].some(text => text?.toLocaleLowerCase().includes(query))))
})
const pageCount = computed(() => Math.max(1, Math.ceil(filteredVideos.value.length / pageSize.value)))
const pageVideos = computed(() => filteredVideos.value.slice(pageIndex.value * pageSize.value, (pageIndex.value + 1) * pageSize.value))
const media = window.matchMedia('(max-width: 600px)')
const narrow = ref(media.matches)
const onResize = () => { narrow.value = media.matches }
const videoColumns = computed(() => narrow.value ? [pageVideos.value] : [pageVideos.value.filter((_, i) => i % 2 === 0), pageVideos.value.filter((_, i) => i % 2 === 1)])
watch([onlyProjectSingularity, search, creator, pageSize], () => { pageIndex.value = 0 })
watch(pageSize, value => {
  savePreference('page-size', String(value))
  void router.replace({ query: { ...route.query, pageSize: String(value) } })
})
watch(() => route.query.pageSize, value => {
  pageSize.value = parsePageSize(value) ?? parsePageSize(readPreference('page-size')) ?? 10
})
async function loadVideos(all = false, refresh = false) {
  if (pageLoading.value) return
  pageLoading.value = true
  pageError.value = ''
  loadingAll.value = all
  retryAll.value = all
  controller = new AbortController()
  const signal = controller.signal
  try {
    do { await fetchBatch(signal, refresh) } while (all && nextCursor.value && !signal.aborted)
  } catch (error) {
    if (!signal.aborted) pageError.value = error instanceof Error ? error.message : 'Could not load videos.'
  } finally { pageLoading.value = false; loadingAll.value = false; waitingForLimit.value = false }
}
onMounted(async () => {
  media.addEventListener('change', onResize)
  savePreference('page-size', String(pageSize.value))
  const hydration = memberStore.hydrate()
  const cached = await readVideoCache(cacheKey)
  if (disposed) return
  if (cached) { loadedVideos.value = cached.videos; nextCursor.value = cached.nextCursor }
  await Promise.all([hydration, loadVideos(false, true)])
})
onUnmounted(() => { disposed = true; media.removeEventListener('change', onResize); cancelLoading() })
</script>

<style scoped>
.project-filter { margin: 8px 0 20px; }
.video-filters { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
.video-filters label { display: grid; gap: 6px; font-size: .875rem; }
.video-filters label:first-child { flex: 1; min-width: 180px; }
.video-filters input, .video-filters select { color: inherit; background: #172126; border: 1px solid #72808a; border-radius: 8px; padding: 10px 12px; }
.result-count { font-size: .875rem; margin-bottom: 16px; opacity: .85; }
.video-columns { display: flex; align-items: flex-start; gap: 1rem; }
.video-columns .video-column { flex: 1; min-width: 0; }
.history-controls { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.home-container { max-width: 1440px !important; padding: 24px; }
.media-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
.media-grid > li { min-width: 0; }
.list {
  list-style: none;
  width: 100%;
  display: grid;
  gap: 1rem;
  padding: 0;
  margin: 0;
}

.fade-edges {
  mask-image: linear-gradient(to right, transparent 0%, black 20%, black 80%, transparent 100%);
  mask-repeat: no-repeat;
  mask-size: 100% 100%;
}

.hero-img {
  display: block;
  width: 100%;
  max-width: 680px;
  height: auto;
}

.drawer-75 {
  max-width: 75% !important;
}
.pagination { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 24px; flex-wrap: wrap; }
.pagination-top { margin-top: 0; margin-bottom: 24px; }

@media (max-width: 600px) {
  .home-container { padding: 16px; }
  .media-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
