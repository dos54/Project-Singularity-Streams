<template>
  <v-container class="home-container">
    <v-row class="hero-row"
      ><img
        src="/project-singularity.png"
        alt="Project Singularity"
        class="ma-auto fade-edges hero-img"
    /></v-row>
    <v-navigation-drawer
      v-model="membersDrawer"
      location="left"
      temporary
      class="d-md-none drawer-75"
      width="300"
    >
      <v-toolbar flat
        ><v-toolbar-title>Members</v-toolbar-title><v-spacer /><v-btn
          icon
          aria-label="Close members"
          @click="membersDrawer = false"
          ><v-icon icon="fa-regular fa-circle-xmark" /></v-btn
      ></v-toolbar>
      <p class="drawer-hint">Star creators to build your favorites feed.</p>
      <v-list
        ><v-list-item v-for="member in sortedMembers" :key="member.memberId"
          ><MemberList :user="member" /></v-list-item
      ></v-list>
    </v-navigation-drawer>
    <v-row>
      <v-col cols="3" class="d-none d-md-block">
        <h2 id="members-heading" tabindex="-1">Members</h2>
        <p class="section-hint">Star your favorite creators.</p>
        <ul class="list">
          <li v-for="member in sortedMembers" :key="member.memberId">
            <MemberList :user="member" />
          </li>
        </ul>
      </v-col>
      <v-col cols="12" md="9">
        <div class="d-flex justify-start mb-4 d-md-none">
          <v-btn variant="outlined" @click="membersDrawer = true">Show Members</v-btn>
        </div>
        <p
          v-if="preferences.storageWarning || storageWarning || uploads.storageWarning.value"
          role="status"
        >
          Browser storage is unavailable or full. Some preferences and videos may only last until
          you leave.
        </p>
        <section aria-labelledby="stream-heading">
          <div class="section-heading">
            <h2 id="stream-heading">Currently Streaming</h2>
            <RefreshButton
              label="streams"
              :busy="refresh.lanes.streams.pending || loading"
              :seconds="streamCooldown"
              :disabled="!refresh.enabled.value || demo"
              @refresh="refresh.refresh('streams')"
            />
          </div>
          <div class="section-options">
            <div class="segmented" aria-label="Stream creators">
              <button
                type="button"
                :aria-pressed="!personal.streamFavorites"
                @click="setMode('streamFavorites', false)"
              >
                Everyone</button
              ><button
                type="button"
                :aria-pressed="personal.streamFavorites"
                @click="setMode('streamFavorites', true)"
              >
                Favorites
              </button>
            </div>
            <v-switch
              :model-value="filters.streamProject"
              label="Project Singularity only"
              color="primary"
              inset
              hide-details
              class="project-filter"
              @update:model-value="browse.update({ streamProject: !!$event })"
            />
          </div>
          <p v-if="filters.streamCreators !== null" class="section-hint">
            Shared selection: {{ filters.streamCreators.length }} creators.
            <button
              type="button"
              class="text-button"
              @click="browse.update({ streamCreators: null, page: filters.page })"
            >
              Clear selection
            </button>
          </p>
          <v-switch
            v-if="isDevelopment"
            v-model="demo"
            label="Preview demo livestreams (local only)"
          />
          <p v-if="demo" role="status">Development preview — these streams are fictional.</p>
          <p v-if="streamIssues && !demo" class="status-message" role="status">
            {{ streamIssues }}
            {{
              streamsKnown
                ? 'Showing available or previously received results.'
                : 'Stream availability is unknown.'
            }}
          </p>
          <button
            v-if="streamIssues && !demo"
            type="button"
            class="text-button"
            :disabled="
              loading ||
              refresh.lanes.streams.pending ||
              streamCooldown > 0 ||
              !refresh.enabled.value
            "
            @click="retryFailedStreams"
          >
            {{
              streamCooldown > 0 ? `Please wait · ${streamCooldown}s` : 'Retry unavailable sources'
            }}
          </button>
          <div v-if="!demo" class="freshness">
            <span>YouTube: {{ sourceStatus('youtube') }}</span
            ><span>Twitch: {{ sourceStatus('twitch') }}</span>
          </div>
          <p v-if="streamsKnown || demo" class="result-count stream-count" aria-live="polite">
            Showing {{ filteredStreams.length }} of {{ allStreams.length }} active creators{{
              streamIssues && !demo ? ' · Partial or stale data' : ''
            }}
          </p>
          <div v-if="loading && !streamsKnown && !demo">Loading streaming status…</div>
          <div v-else-if="!filteredStreams.length" class="empty-state">
            <p>{{ streamEmpty }}</p>
            <button
              v-if="personal.streamFavorites && !preferences.favoriteIds.length"
              type="button"
              class="text-button"
              @click="chooseFavorites"
            >
              Choose favorite creators
            </button>
            <button
              v-else-if="streamsKnown && allStreams.length"
              type="button"
              class="text-button"
              @click="resetStreamFilters"
            >
              Show all active creators
            </button>
          </div>
          <ul v-else class="list media-grid">
            <li v-for="member in filteredStreams" :key="member.memberId">
              <StreamingList :user="member" />
            </li>
          </ul>
        </section>

        <section class="videos-section" aria-labelledby="videos-heading">
          <div class="section-heading">
            <h2 id="videos-heading">Latest Videos</h2>
            <RefreshButton
              label="videos"
              :busy="
                refresh.lanes.videos.pending || uploads.busy.value || uploads.initializing.value
              "
              :seconds="videoCooldown"
              :disabled="!refresh.enabled.value"
              @refresh="refresh.refresh('videos')"
            />
          </div>
          <div class="section-options">
            <div class="segmented" aria-label="Video creators">
              <button
                type="button"
                :aria-pressed="!personal.videoFavorites"
                @click="setMode('videoFavorites', false)"
              >
                Everyone</button
              ><button
                type="button"
                :aria-pressed="personal.videoFavorites"
                @click="setMode('videoFavorites', true)"
              >
                Favorites
              </button>
            </div>
            <v-switch
              :model-value="filters.project"
              label="Project Singularity only"
              color="primary"
              inset
              hide-details
              class="project-filter"
              @update:model-value="browse.update({ project: !!$event })"
            />
          </div>
          <div class="video-filters">
            <label
              >Search videos<input
                :value="filters.q"
                type="search"
                maxlength="200"
                placeholder="Title or description"
                @input="browse.search(($event.target as HTMLInputElement).value)"
            /></label>
            <label
              >Creator<select
                :value="creatorValue"
                @change="selectCreator(($event.target as HTMLSelectElement).value)"
              >
                <option value="">All creators</option>
                <option
                  v-if="filters.creators && filters.creators.length !== 1"
                  :value="creatorValue"
                >
                  {{
                    filters.creators.length
                      ? `${filters.creators.length} selected creators`
                      : 'No creators selected'
                  }}
                </option>
                <option
                  v-for="member in sortedMembers"
                  :key="member.memberId"
                  :value="String(member.memberId)"
                >
                  {{ member.alias }}
                </option>
              </select></label
            >
            <label
              >Per page<select
                :value="filters.pageSize"
                @change="
                  browse.update({ pageSize: Number(($event.target as HTMLSelectElement).value) })
                "
              >
                <option v-for="size in [10, 20, 50, 100]" :key="size" :value="size">
                  {{ size }}
                </option>
              </select></label
            >
          </div>
          <button type="button" class="text-button share-button" @click="prepareShare">
            Share filtered list
          </button>
          <div v-if="shareOpen" class="share-panel">
            <label
              >Link to this filtered list<input
                :value="shareUrl"
                readonly
                @focus="($event.target as HTMLInputElement).select()"
            /></label>
            <p>Includes your search, filters, selected creators, and page size. Opens on page 1.</p>
            <button type="button" class="text-button" @click="copyShare">Copy link</button
            ><button v-if="canShare" type="button" class="text-button" @click="nativeShare">
              Share…</button
            ><button type="button" class="text-button" @click="shareOpen = false">Close</button
            ><span role="status">{{ shareMessage }}</span>
          </div>
          <p class="result-count" aria-live="polite">
            Showing {{ filteredVideos.length }} of {{ uploads.videos.value.length }} loaded videos{{
              uploads.nextCursor.value ? ' · More history available' : ''
            }}
          </p>
          <p class="freshness">
            {{ receivedAgo(uploads.headReceivedAt.value, refresh.now.value)
            }}{{
              uploads.error.value && uploads.videos.value.length
                ? ' · Showing saved videos; refresh failed'
                : ''
            }}
          </p>
          <div class="history-controls">
            <v-btn
              v-if="uploads.nextCursor.value && !uploads.loadingAll.value"
              :disabled="uploads.busy.value || videoCooldown > 0"
              variant="outlined"
              @click="loadHistory"
              >Load all videos</v-btn
            >
            <template v-if="uploads.loadingAll.value"
              ><span role="status"
                >{{
                  videoCooldown > 0
                    ? `Server limit reached. Continuing in ${videoCooldown}s…`
                    : 'Loading all videos…'
                }}
                {{ uploads.videos.value.length }} loaded</span
              ><v-btn variant="text" @click="uploads.cancel">Stop</v-btn></template
            >
          </div>
          <p v-if="uploads.error.value" role="status">
            {{ uploads.error.value }}
            {{
              videoCooldown > 0
                ? `Please wait ${videoCooldown}s before retrying.`
                : 'Use Refresh to retry the latest videos, or Load all videos to continue history.'
            }}
          </p>
          <nav class="pagination pagination-top" aria-label="Video pages above list">
            <v-btn :disabled="currentPage <= 1" @click="browse.update({ page: currentPage - 1 })"
              >Previous</v-btn
            ><span>Page {{ currentPage }} of {{ pageCount }}</span
            ><v-btn
              :disabled="currentPage >= pageCount"
              @click="browse.update({ page: currentPage + 1 })"
              >Next</v-btn
            >
          </nav>
          <div
            v-if="
              (uploads.busy.value || uploads.initializing.value) && !uploads.videos.value.length
            "
          >
            Loading videos…
          </div>
          <div v-else-if="!pageVideos.length" class="empty-state">
            <p>{{ videoEmpty }}</p>
            <button
              v-if="personal.videoFavorites && !preferences.favoriteIds.length"
              type="button"
              class="text-button"
              @click="chooseFavorites"
            >
              Choose favorite creators</button
            ><button
              v-else-if="uploads.videos.value.length"
              type="button"
              class="text-button"
              @click="resetVideoFilters"
            >
              Clear video filters
            </button>
          </div>
          <div v-else class="video-columns">
            <ul v-for="(column, index) in videoColumns" :key="index" class="list video-column">
              <li v-for="video in column" :key="video.videoId" :data-video-id="video.videoId">
                <NewVideoList :video="video" />
              </li>
            </ul>
          </div>
          <nav class="pagination" aria-label="Video pages below list">
            <v-btn :disabled="currentPage <= 1" @click="browse.update({ page: currentPage - 1 })"
              >Previous</v-btn
            ><span>Page {{ currentPage }} of {{ pageCount }}</span
            ><v-btn
              :disabled="currentPage >= pageCount"
              @click="browse.update({ page: currentPage + 1 })"
              >Next</v-btn
            >
          </nav>
        </section>
        <details class="browser-settings">
          <summary>Browser preferences</summary>
          <p>
            Favorites stay in this browser. Automatic updates run every 5 minutes while this page is
            visible and focused.
          </p>
          <button type="button" class="text-button" @click="resetFavorites">Reset favorites</button
          ><button
            type="button"
            class="text-button"
            :disabled="uploads.busy.value"
            @click="clearCache"
          >
            Clear saved video cache
          </button>
          <p role="status">{{ settingsMessage }}</p>
        </details>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { computed, ref, reactive, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useMemberStore } from '@/stores/member.store'
import { usePreferencesStore } from '@/stores/preferences.store'
import { useBrowseFilters } from '@/composables/useBrowseFilters'
import { useUploads } from '@/composables/useUploads'
import { useRefresh } from '@/composables/useRefresh'
import { useFeedAnchor } from '@/composables/useFeedAnchor'
import { receivedAgo, stateKey } from '@/utils/browserState'
import { serializeBrowse } from '@/utils/browseQuery'
import { isPsTwitchStream } from '@/utils'
import type { MemberWithComputed } from '@/types/member'
import MemberList from '@/components/MemberList.vue'
import StreamingList from '@/components/StreamingList.vue'
import NewVideoList from '@/components/NewVideoList.vue'
import RefreshButton from '@/components/RefreshButton.vue'

const route = useRoute()
const router = useRouter()
const membersDrawer = ref(false)
const storageWarning = ref(false)
const preferences = usePreferencesStore()
const memberStore = useMemberStore()
const { sortedMembers, streamingMembers, loading, sourceState } = storeToRefs(memberStore)
const browse = useBrowseFilters(() => {
  storageWarning.value = true
})
const { filters } = browse
const shared = route.query.shared === '1'
const personal = reactive({
  videoFavorites: !shared && preferences.videoFavorites,
  streamFavorites: !shared && preferences.streamFavorites,
})
const modeNames = {
  videoFavorites: 'video-favorites',
  streamFavorites: 'stream-favorites',
} as const
function setMode(mode: keyof typeof personal, value: boolean) {
  personal[mode] = value
  preferences.setMode(modeNames[mode], value)
  if (mode !== 'streamFavorites') browse.update({ page: 1 })
}
const uploads = useUploads()
const filteredVideos = computed(() => {
  const query = filters.q.trim().toLocaleLowerCase()
  return uploads.videos.value.filter(
    (video) =>
      (!filters.project || video.isProjectSingularity) &&
      (filters.creators === null || filters.creators.includes(video.memberId)) &&
      (!personal.videoFavorites || preferences.favoriteIds.includes(video.memberId)) &&
      (!query ||
        [video.title, video.description].some((text) => text?.toLocaleLowerCase().includes(query))),
  )
})
const pageCount = computed(() =>
  Math.max(1, Math.ceil(filteredVideos.value.length / filters.pageSize)),
)
const currentPage = computed(() => Math.min(filters.page, pageCount.value))
const pageVideos = computed(() =>
  filteredVideos.value.slice(
    (currentPage.value - 1) * filters.pageSize,
    currentPage.value * filters.pageSize,
  ),
)
const media = window.matchMedia('(max-width: 600px)')
const narrow = ref(media.matches)
const onResize = () => {
  narrow.value = media.matches
}
const videoColumns = computed(() =>
  narrow.value
    ? [pageVideos.value]
    : [
        pageVideos.value.filter((_, i) => i % 2 === 0),
        pageVideos.value.filter((_, i) => i % 2 === 1),
      ],
)
const { keepPosition } = useFeedAnchor()
let failedSourcesOnly = false
const refresh = useRefresh({
  streams: () => {
    const failedOnly = failedSourcesOnly
    failedSourcesOnly = false
    return memberStore.refreshStreams(failedOnly)
  },
  videos: () => keepPosition(() => uploads.refresh()),
})
const videoCooldown = computed(() =>
  Math.max(
    refresh.videoSeconds.value,
    Math.ceil((uploads.retryAt.value - refresh.now.value) / 1000),
    0,
  ),
)
const streamCooldown = computed(() =>
  Math.max(
    refresh.streamSeconds.value,
    ...Object.values(sourceState.value).map((source) =>
      Math.ceil((source.retryAt - refresh.now.value) / 1000),
    ),
    0,
  ),
)
function retryFailedStreams() {
  failedSourcesOnly = true
  void refresh.refresh('streams')
}
const isDevelopment = import.meta.env.DEV
const demo = ref(false)
const demoStreams = ref<MemberWithComputed[]>([])
watch(demo, async (enabled) => {
  if (import.meta.env.DEV && enabled)
    demoStreams.value = (await import('@/dev/streams')).demoStreams
})
const allStreams = computed(() =>
  demo.value && isDevelopment ? demoStreams.value : streamingMembers.value,
)
const filteredStreams = computed(() =>
  allStreams.value
    .filter(
      (member) =>
        (!personal.streamFavorites || preferences.favoriteIds.includes(member.memberId)) &&
        (filters.streamCreators === null || filters.streamCreators.includes(member.memberId)) &&
        (!filters.streamProject ||
          (member.twitchStream?.isLive && isPsTwitchStream(member.twitchStream.title ?? '')) ||
          (member.latestYoutubeVideo?.state === 'live' &&
            member.latestYoutubeVideo.isProjectSingularity)),
    )
    .sort(
      (a, b) =>
        Number(preferences.favoriteIds.includes(b.memberId)) -
          Number(preferences.favoriteIds.includes(a.memberId)) || a.alias.localeCompare(b.alias),
    ),
)
const streamsKnown = computed(
  () =>
    !!sourceState.value.members.receivedAt &&
    !!(sourceState.value.youtube.receivedAt || sourceState.value.twitch.receivedAt),
)
const streamIssues = computed(() =>
  (['members', 'youtube', 'twitch'] as const)
    .filter((name) => sourceState.value[name].error)
    .map(
      (name) =>
        `${{ members: 'Members', youtube: 'YouTube', twitch: 'Twitch' }[name]} unavailable.`,
    )
    .join(' '),
)
function sourceStatus(name: 'youtube' | 'twitch') {
  const source = sourceState.value[name]
  if (!source.receivedAt) return source.loading ? 'Loading…' : 'Not received'
  return `${receivedAgo(source.receivedAt, refresh.now.value)}${source.error ? ' · Refresh failed' : ''}`
}
const streamEmpty = computed(() =>
  !streamsKnown.value && !demo.value
    ? 'Could not determine who is live. Use Refresh to try again.'
    : personal.streamFavorites && !preferences.favoriteIds.length
      ? 'Star some creators to see your favorite streams here.'
      : allStreams.value.length
        ? 'No active creators match these filters.'
        : streamIssues.value
          ? 'No live streams in the available data. Some sources could not be refreshed.'
          : 'No creators are live right now.',
)
const videoEmpty = computed(() =>
  personal.videoFavorites && !preferences.favoriteIds.length
    ? 'Star some creators to build your video feed.'
    : uploads.error.value && !uploads.videos.value.length
      ? 'Videos could not be loaded. Use Refresh to retry.'
      : uploads.videos.value.length
        ? `No loaded videos match these filters.${uploads.nextCursor.value ? ' Load all videos to search older history.' : ''}`
        : 'No uploads found.',
)
const creatorValue = computed(() =>
  filters.creators === null ? '' : filters.creators.length ? filters.creators.join(',') : 'none',
)
function selectCreator(value: string) {
  browse.update({ creators: value ? (value === 'none' ? [] : value.split(',').map(Number)) : null })
}
function chooseFavorites() {
  if (window.matchMedia('(max-width: 959px)').matches) membersDrawer.value = true
  else document.getElementById('members-heading')?.focus()
}
function resetStreamFilters() {
  setMode('streamFavorites', false)
  browse.update({ streamProject: false, streamCreators: null, page: filters.page })
}
function resetVideoFilters() {
  personal.videoFavorites = false
  preferences.setMode('video-favorites', false)
  browse.update({ q: '', creators: null, project: false })
}
async function loadHistory() {
  await keepPosition(() => uploads.loadAll())
}
const shareOpen = ref(false)
const shareMessage = ref('')
const canShare = typeof navigator.share === 'function'
const shareUrl = computed(() => {
  const intersect = (ids: number[] | null, favorite: boolean) =>
    !favorite ? ids : preferences.favoriteIds.filter((id) => ids === null || ids.includes(id))
  const query = {
    ...serializeBrowse({
      ...filters,
      creators: intersect(filters.creators, personal.videoFavorites),
      streamCreators: intersect(filters.streamCreators, personal.streamFavorites),
      page: 1,
    }),
    shared: '1',
  }
  return new URL(router.resolve({ path: '/', query }).href, window.location.origin).href
})
watch(shareUrl, () => {
  shareMessage.value = ''
})
function prepareShare() {
  shareOpen.value = true
  shareMessage.value = ''
}
async function copyShare() {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    shareMessage.value = 'Link copied.'
  } catch {
    shareMessage.value = 'Select the link above and copy it manually.'
  }
}
async function nativeShare() {
  try {
    await navigator.share({ title: 'Project Singularity', url: shareUrl.value })
  } catch {
    shareMessage.value = 'You can copy the link instead.'
  }
}
const settingsMessage = ref('')
async function clearCache() {
  settingsMessage.value = (await uploads.clearCache())
    ? 'Saved video cache cleared. Currently displayed videos remain available.'
    : 'The saved cache could not be cleared. Browser storage may be unavailable.'
}
function resetFavorites() {
  preferences.reset()
  Object.assign(personal, {
    videoFavorites: false,
    streamFavorites: false,
  })
  settingsMessage.value = 'Favorites reset. Your video cache is unchanged.'
}
function storageChanged(event: StorageEvent) {
  if (event.key === stateKey('favorites')) preferences.sync()
}
let disposed = false
onMounted(async () => {
  media.addEventListener('change', onResize)
  window.addEventListener('storage', storageChanged)
  await Promise.all([memberStore.hydrate(), uploads.initialize()])
  if (!disposed) refresh.start()
})
onUnmounted(() => {
  disposed = true
  media.removeEventListener('change', onResize)
  window.removeEventListener('storage', storageChanged)
})
</script>

<style scoped>
.home-container {
  max-width: 1440px !important;
  padding: 0 24px 24px;
}
.hero-row {
  margin-top: 0;
  margin-bottom: clamp(28px, 4vw, 52px);
  /* Fade the artwork into the dark backdrop before the content starts. */
  mask-image: linear-gradient(to bottom, black 0%, black 78%, transparent 100%);
  mask-repeat: no-repeat;
  mask-size: 100% 100%;
}
.hero-img {
  display: block;
  width: 100%;
  max-width: 680px;
  height: auto;
}
.fade-edges {
  mask-image: linear-gradient(to right, transparent 0%, black 20%, black 80%, transparent 100%);
  mask-repeat: no-repeat;
  mask-size: 100% 100%;
}
.drawer-75 {
  max-width: 75% !important;
}
.drawer-hint {
  padding: 12px 16px;
  font-size: 0.85rem;
}
.section-heading,
.section-options,
.history-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.section-heading {
  justify-content: space-between;
  margin-bottom: 12px;
}
.section-options {
  margin: 8px 0 16px;
}
.section-hint {
  font-size: 0.85rem;
  opacity: 0.85;
  margin: 8px 0 16px;
}
.project-filter {
  flex: 0 1 auto;
  margin: 0;
}
.segmented {
  display: inline-flex;
  border: 1px solid #718087;
  border-radius: 8px;
  overflow: hidden;
}
.segmented button {
  padding: 8px 12px;
  min-height: 40px;
  font-size: 0.85rem;
}
.segmented button[aria-pressed='true'] {
  background: #d6f3e7;
  color: #18342d;
}
button:focus-visible,
input:focus-visible,
select:focus-visible,
summary:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
.videos-section {
  margin-top: 36px;
}
.video-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}
.video-filters label,
.share-panel label {
  display: grid;
  gap: 6px;
  font-size: 0.875rem;
}
.video-filters label:first-child {
  flex: 1;
  min-width: 180px;
}
.video-filters input,
.video-filters select,
.share-panel input {
  color: inherit;
  background: #172126;
  border: 1px solid #72808a;
  border-radius: 8px;
  padding: 10px 12px;
  max-width: 100%;
}
.share-button {
  margin-bottom: 16px;
}
.text-button {
  padding: 8px;
  min-height: 40px;
  text-decoration: underline;
  text-underline-offset: 3px;
  font-size: 0.875rem;
}
.result-count {
  font-size: 0.875rem;
  margin-bottom: 8px;
  opacity: 0.9;
}
.freshness {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  font-size: 0.8rem;
  opacity: 0.8;
  margin-bottom: 12px;
}
.status-message,
.share-panel {
  padding: 12px;
  border: 1px solid #647b76;
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 0.875rem;
}
.share-panel input {
  width: 100%;
}
.share-panel p {
  margin-top: 8px;
}
.history-controls {
  margin-bottom: 16px;
}
.empty-state {
  padding: 20px 0;
}
.list {
  list-style: none;
  width: 100%;
  display: grid;
  gap: 1rem;
  padding: 0;
  margin: 0;
}
.media-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
}
.media-grid > li {
  min-width: 0;
}
.video-columns {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}
.video-column {
  flex: 1;
  min-width: 0;
}
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 24px;
  flex-wrap: wrap;
}
.pagination-top {
  margin: 12px 0 24px;
}
.browser-settings {
  margin-top: 32px;
  font-size: 0.875rem;
}
.browser-settings summary {
  cursor: pointer;
  padding: 8px 0;
}
@media (max-width: 600px) {
  .home-container {
    padding: 0 16px 16px;
  }
  .media-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .section-heading h2 {
    font-size: 1.35rem;
  }
}
</style>
