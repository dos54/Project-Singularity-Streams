<template>
  <v-card
    variant="elevated"
    color="primary"
    :href="`https://www.youtube.com/watch?v=${item.video.videoId}`"
    target="_blank"
    rel="noopener"
    class="video-card"
  >
    <v-card-title class="wrap-title">{{ item.video.title }}</v-card-title>
    <v-card-subtitle>
      {{ item.member.alias }}
    </v-card-subtitle>
    <v-card-text>
      {{ formattedDate }}
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { MemberLatestVideo } from '@/stores/member.store'

const props = defineProps<{
  item: MemberLatestVideo
}>()

const formattedDate = computed(() => {
  const p = props.item.video.publishedAt
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

.video-card {
}
</style>
