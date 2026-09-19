<template>
  <v-card variant="elevated" color="primary" class="stream-card">
    <v-card-title class="creator-title"><span class="status-dot" aria-hidden="true"></span>{{ user.alias }}</v-card-title>
    <a v-if="youtubeLive || twitchLive" :href="previewUrl" target="_blank" rel="noopener noreferrer" class="stream-preview">
      <VideoThumbnail :src="previewImage" :alt="previewTitle" />
      <span class="stream-title">{{ previewTitle }}</span>
    </a>
    <v-card-actions>
      <v-btn v-if="youtubeLive" :href="youtubeWatchUrl" color="red" variant="elevated" prepend-icon="fa-brands fa-youtube" target="_blank" rel="noopener noreferrer">YouTube</v-btn>
      <v-btn v-if="twitchLive" :href="twitchWatchUrl" color="purple" variant="elevated" prepend-icon="fa-brands fa-twitch" target="_blank" rel="noopener noreferrer">Twitch</v-btn>
    </v-card-actions>
    <v-card-text class="stream-status">
      <span v-if="youtubeLive && twitchLive">Live on YouTube and Twitch</span>
      <span v-else-if="youtubeLive">Live on YouTube</span>
      <span v-else-if="twitchLive">Live on Twitch</span>
      <span v-if="twitchLive && twitchLive.viewerCount != null"> · {{ twitchLive.viewerCount.toLocaleString() }} Twitch viewers</span>
    </v-card-text>
  </v-card>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import type { MemberWithComputed } from '@/types/member'
import VideoThumbnail from './VideoThumbnail.vue'
const props = defineProps<{ user: MemberWithComputed }>()
const youtubeLive = computed(() => props.user.latestYoutubeVideo?.state === 'live' ? props.user.latestYoutubeVideo : null)
const twitchLive = computed(() => props.user.twitchStream?.isLive ? props.user.twitchStream : null)
const youtubeWatchUrl = computed(() => `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeLive.value?.videoId ?? '')}`)
const twitchWatchUrl = computed(() => `https://www.twitch.tv/${encodeURIComponent(twitchLive.value?.login || props.user.twitch || '')}`)
const useYoutubePreview = computed(() => !!youtubeLive.value && (!!youtubeLive.value.thumbnailUrl || !twitchLive.value?.thumbnailUrl))
const previewUrl = computed(() => useYoutubePreview.value ? youtubeWatchUrl.value : twitchWatchUrl.value)
const previewImage = computed(() => useYoutubePreview.value ? youtubeLive.value?.thumbnailUrl : twitchLive.value?.thumbnailUrl)
const previewTitle = computed(() => (useYoutubePreview.value ? youtubeLive.value?.title : twitchLive.value?.title) || `${props.user.alias} is live`)
</script>
<style scoped>
.stream-card { height: 100%; border-radius: 12px; }
.creator-title { display: flex; align-items: center; gap: .6rem; white-space: normal; }
.status-dot { width: 9px; height: 9px; flex-shrink: 0; border-radius: 50%; background: #c62828; }
.stream-preview { display: block; color: inherit; text-decoration: none; }
.stream-preview:focus-visible { outline: 3px solid currentColor; outline-offset: -3px; }
.stream-title { display: block; padding: 12px 16px 4px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
.stream-status { padding-top: 0; font-size: .8rem; }
:deep(.v-card-actions) { flex-wrap: wrap; gap: 8px; }
</style>
