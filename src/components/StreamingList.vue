<template>
  <v-card variant="elevated" color="primary">
    <v-card-title>
      <span v-if="isLive" class="status-dot"></span>
      {{ user.alias }}
    </v-card-title>

    <v-card-subtitle v-if="subtitle" class="wrap-title">
      <a
        v-if="user.latestYoutubeVideo?.state === 'live'"
        :href="youtubeWatchUrl"
        rel="noopener"
        target="_blank"
        class="thumbnail-wrapper"
      >
        {{ subtitle }}
      </a>
      <span v-else>
        {{ subtitle }}
      </span>
    </v-card-subtitle>

    <v-card-text v-if="isLive">
      <a
        v-if="user.latestYoutubeVideo?.state === 'live'"
        :href="youtubeWatchUrl"
        rel="noopener"
        target="_blank"
        class="thumbnail-wrapper"
      >
        <img
          :src="user.latestYoutubeVideo?.thumbnailUrl || ''"
          :alt="user.latestYoutubeVideo?.title || ''"
        />
      </a>

      <div>
        <div v-if="user.twitchStream?.isLive">
          LIVE on Twitch to {{ user.twitchStream.viewerCount ?? 0 }} viewers
        </div>

        <div v-if="user.latestYoutubeVideo?.state === 'live'">
          LIVE on YouTube
        </div>
      </div>
    </v-card-text>

    <v-card-actions>
      <v-btn
        v-if="user.twitch"
        :href="`https://www.twitch.tv/${user.twitch}`"
        color="purple"
        variant="elevated"
        prepend-icon="fa-brands fa-twitch"
        target="_blank"
        rel="noopener"
      >
        Twitch
      </v-btn>

      <v-btn
        v-if="user.youtube || user.youtubeId"
        :href="youtubeChannelUrl"
        color="red"
        variant="elevated"
        prepend-icon="fa-brands fa-youtube"
        target="_blank"
        rel="noopener"
      >
        YouTube
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { MemberWithComputed } from '@/types/member'

const props = defineProps<{
  user: MemberWithComputed
}>()

const isLive = computed(() => {
  return Boolean(props.user.twitchStream?.isLive || props.user.latestYoutubeVideo?.state === 'live')
})

const subtitle = computed<string | null>(() => {
  if (props.user.twitchStream?.isLive && props.user.twitchStream.title) {
    return props.user.twitchStream.title
  }
  if (props.user.latestYoutubeVideo?.state === 'live' && props.user.latestYoutubeVideo.title) {
    return props.user.latestYoutubeVideo.title
  }
  return null
})

const youtubeWatchUrl = computed(() => {
  const id = props.user.latestYoutubeVideo?.videoId
  return id ? `https://www.youtube.com/watch?v=${id}` : 'https://www.youtube.com'
})

const youtubeChannelUrl = computed(() => {
  // Prefer explicit channel id if present
  if (props.user.youtubeId) return `https://www.youtube.com/channel/${props.user.youtubeId}`
  // If backend provides @handle in `youtube`, use it directly
  if (props.user.youtube) return `https://www.youtube.com/${props.user.youtube}`
  return 'https://www.youtube.com'
})
</script>

<style scoped>
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: red;
  border: 2px solid rgb(189, 0, 0);
  display: inline-block;
}

.wrap-title {
  white-space: normal !important;
  line-height: 1.3;
}

.thumbnail-wrapper {
  display: inline-block;
  border-radius: 8px;
  overflow: hidden;
  width: auto;
}

.thumbnail-wrapper img {
  display: block;
  width: 100%;
}

a {
  text-decoration: none;
  color: black;
}
</style>
