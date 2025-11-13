<template>
  <v-card variant="elevated" color="primary">
    <v-card-title>
      <span v-if="user.stream?.isLive || user.youtubeStatus?.live.isLive" class="status-dot"></span>
      {{ user.alias }}
    </v-card-title>

    <!-- Prefer Twitch title if live, otherwise YouTube live title, otherwise nothing -->
    <v-card-subtitle v-if="subtitle">
      {{ subtitle }}
    </v-card-subtitle>

    <v-card-text v-if="user.stream?.isLive || user.youtubeStatus?.live.isLive">
      <div v-if="user.stream?.isLive">
        LIVE to {{ user.stream.viewerCount ?? 0 }} viewers on Twitch
      </div>
      <div v-if="user.youtubeStatus?.live.isLive">LIVE on YouTube</div>
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
        :href="`https://www.youtube.com/${user.youtube}`"
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

// Prefer Twitch live title, then YouTube live title
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
</style>
