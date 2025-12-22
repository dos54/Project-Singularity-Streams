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
import { storeToRefs } from 'pinia'
import { useMemberStore } from '@/stores/member.store'
import type { YoutubeVideo } from '@/types/youtube'

const props = defineProps<{
  video: YoutubeVideo
}>()

const memberStore = useMemberStore()
const { membersById } = storeToRefs(memberStore)

const memberAlias = computed(() => {
  return membersById.value[props.video.memberId]?.alias ?? `Member #${props.video.memberId}`
})

const formattedDate = computed(() => {
  const p = props.video.publishedAt
  if (!p) return ''
  try {
    return new Date(p).toLocaleString()
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
</style>
