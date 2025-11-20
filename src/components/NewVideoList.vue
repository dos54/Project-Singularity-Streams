<template>
  <v-card
    variant="elevated"
    color="primary"
    :href="`https://www.youtube.com/watch?v=${video.videoId}`"
    target="_blank"
    rel="noopener"
    class="video-card"
  >
    <v-card-title class="wrap-title">{{ video.title }}</v-card-title>
    <v-card-subtitle>
      {{ memberAlias }}
    </v-card-subtitle>
    <v-card-text>
      {{ formattedDate }}
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { YoutubeVideoWithChannel } from '@/stores/member.store'
import { useMemberStore } from '@/stores/member.store';
import { storeToRefs } from 'pinia';

const props = defineProps<{
  video: YoutubeVideoWithChannel
}>()

const memberStore = useMemberStore()
const { aliasByChannelId } = storeToRefs(memberStore)
const memberAlias = computed(() => {
  return aliasByChannelId.value[props.video.channelId] ?? props.video.channelId
})

const formattedDate = computed(() => {
  const p = props.video.publishedAt
  if (!p) return ''
  try {
    return new Date(p).toLocaleString() // user’s locale + timezone
  } catch {
    return p
  }
})
</script>

<style scoped>
.wrap-title {
  white-space: normal !important;
  line-height: 1.3;
}

/* .video-card {
} */
</style>
