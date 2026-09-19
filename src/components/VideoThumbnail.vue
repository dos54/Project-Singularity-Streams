<template>
  <div class="video-thumbnail">
    <img v-if="src && !failed" :src="src" :alt="alt || 'Video preview'" loading="lazy" decoding="async" @error="failed = true" />
    <span v-else class="preview-placeholder">Preview unavailable</span>
  </div>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
const props = defineProps<{ src?: string | null; alt: string | null }>()
const failed = ref(false)
watch(() => props.src, () => { failed.value = false })
</script>
<style scoped>
.video-thumbnail { aspect-ratio: 16 / 9; width: 100%; overflow: hidden; background: #172126; }
img { width: 100%; height: 100%; object-fit: cover; display: block; }
.preview-placeholder { height: 100%; display: grid; place-items: center; color: #c8d0d4; font-size: .875rem; }
</style>
