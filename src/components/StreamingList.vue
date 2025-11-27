<template>
  <v-card variant="elevated" color="primary">
    <v-card-title>
      <span v-if="user.stream?.isLive || user.youtubeStatus?.live.isLive" class="status-dot"></span>
      {{ user.alias }}
    </v-card-title>

    <v-card-subtitle v-if="subtitle" class="wrap-title">
      <a v-if="user.youtubeStatus?.live.isLive" :href="`https://www.youtube.com/watch?v=${user.youtubeStatus.live.videoId}`" rel="noopener" target="_blank" class="thumbnail-wrapper">
        {{ subtitle }}
      </a>
    </v-card-subtitle>

    <v-card-text v-if="user.stream?.isLive || user.youtubeStatus?.live.isLive">
      <a v-if="user.youtubeStatus?.live.isLive" :href="`https://www.youtube.com/watch?v=${user.youtubeStatus.live.videoId}`" rel="noopener" target="_blank" class="thumbnail-wrapper">
        <img :src="user.youtubeStatus?.live.thumbnailUrl || ''" :alt="user.youtubeStatus?.live.title || ''">
      </a>
      <div>
        <div v-if="user.stream?.isLive">
          LIVE on Twitch to {{ user.stream.viewerCount ?? 0 }} viewers
        </div>
        <div v-if="user.youtubeStatus?.live.isLive">
          LIVE on YouTube to {{ user.youtubeStatus.live.viewerCount }} viewers
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
        v-if="user.youtube"
        :href="`https://www.youtube.com/watch?v=${user.youtubeStatus?.live.videoId || user.youtube}`"
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
import type { StreamInfo, YoutubeStatus } from '@/stores/member.store'

interface User {
  alias: string
  twitch?: string
  youtube?: string
  discord?: string
}

type UserWithStream = User & {
  stream?: StreamInfo | null
  youtubeStatus?: YoutubeStatus | null
}

const props = defineProps<{
  user: UserWithStream
}>()

const subtitle = computed<string | null>(() => {
  if (props.user.stream?.isLive && props.user.stream.title) {
    return props.user.stream.title
  }
  if (props.user.youtubeStatus?.live.isLive && props.user.youtubeStatus.live.title) {
    return props.user.youtubeStatus.live.title
  }
  return null
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
