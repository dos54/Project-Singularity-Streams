<template>
  <v-card variant="elevated" color="primary" class="video-card">
    <a
      :href="watchUrl"
      target="_blank"
      rel="noopener"
      class="video-link"
    >
      <VideoThumbnail :src="video.thumbnailUrl" :alt="video.title" />
      <v-card-title class="wrap-title">{{ video.title }}</v-card-title>
    </a>

    <v-card-subtitle>
      <span class="platform-badge">{{ video.platform === 'twitch' ? 'Twitch' : 'YouTube' }}</span>
      <a v-if="creatorUrl" :href="creatorUrl" target="_blank" rel="noopener" class="creator-link">{{
        memberAlias
      }}</a>
      <span v-else>{{ memberAlias }}</span>
    </v-card-subtitle>

    <v-card-text>
      {{ formattedDate }}
      <div v-if="video.description" class="description-block">
        <button
          v-if="expanded"
          type="button"
          class="description-toggle collapse-top"
          :aria-controls="descriptionId"
          :aria-expanded="expanded"
          @click="expanded = false"
        >
          Less
          <svg class="chevron expanded" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <div
          :id="descriptionId"
          class="description"
          :class="{ collapsed: !expanded }"
          @click="expanded = true"
        >
          <template v-for="(part, index) in descriptionParts" :key="index"
            ><a
              v-if="part.href"
              :href="part.href"
              target="_blank"
              rel="noopener noreferrer"
              @click.stop
              >{{ part.text }}</a
            ><template v-else>{{ part.text }}</template></template
          >
        </div>
        <button
          type="button"
          class="description-toggle"
          :aria-controls="descriptionId"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        >
          {{ expanded ? 'Less' : 'More' }}
          <svg class="chevron" :class="{ expanded }" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref, watch, useId } from 'vue'
import { linkifyDescription } from '@/utils/description'
import { storeToRefs } from 'pinia'
import { useMemberStore } from '@/stores/member.store'
import type { YoutubeVideo } from '@/types/youtube'
import { timeAgo } from '@/utils'
import VideoThumbnail from './VideoThumbnail.vue'

const props = defineProps<{ video: YoutubeVideo }>()
const expanded = ref(false)
const descriptionId = useId()
const descriptionParts = computed(() => linkifyDescription(props.video.description || ''))
watch(
  () => props.video.videoId,
  () => {
    expanded.value = false
  },
)

const memberStore = useMemberStore()
const watchUrl = computed(() => props.video.platform === 'twitch'
  ? `https://www.twitch.tv/videos/${encodeURIComponent(props.video.videoId.slice(7))}`
  : `https://www.youtube.com/watch?v=${encodeURIComponent(props.video.videoId)}`)
const { membersById } = storeToRefs(memberStore)
const creatorUrl = computed(() => {
  const member = membersById.value[props.video.memberId]
  if (props.video.platform === 'twitch') return member?.twitch
    ? `https://www.twitch.tv/${encodeURIComponent(member.twitch)}` : null
  if (member?.youtubeId)
    return `https://www.youtube.com/channel/${encodeURIComponent(member.youtubeId)}`
  if (member?.youtube)
    return `https://www.youtube.com/${member.youtube.split('/').map(encodeURIComponent).join('/')}`
  return null
})

const memberAlias = computed(() => {
  return membersById.value[props.video.memberId]?.alias ?? `Member #${props.video.memberId}`
})

const formattedDate = computed(() => {
  const p = props.video.publishedAt
  if (!p) return ''

  const d = new Date(p)
  if (Number.isNaN(d.getTime())) return String(p)
  try {
    return timeAgo(d)
      .split(' ')
      .map((word) => word[0]?.toUpperCase() + word.slice(1))
      .join(' ')
  } catch {
    return d
  }
})
</script>

<style scoped>
.video-card {
  border-radius: 12px;
}
.platform-badge { display: inline-block; margin-right: 8px; font-size: 0.75rem; font-weight: 600; }
.video-link {
  color: inherit;
  text-decoration: none;
}
.creator-link {
  color: inherit;
  text-decoration: none;
}
.creator-link:hover,
.creator-link:focus-visible {
  text-decoration: underline;
}
.description-block {
  margin-top: 12px;
}
.collapse-top {
  margin-bottom: 8px;
}
.description-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  color: inherit;
  font-weight: 600;
}
.description {
  display: block;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.5rem;
}
.description.collapsed {
  cursor: pointer;
}
.description a {
  color: inherit;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.chevron {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.chevron.expanded {
  transform: rotate(180deg);
}
.description.collapsed {
  max-height: 4.2rem;
  overflow: hidden;
  mask-image: linear-gradient(black 3rem, transparent 4.2rem);
}
.description-toggle:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 4px;
}
.wrap-title {
  white-space: normal !important;
  line-height: 1.3;
  font-size: 1rem;
  overflow-wrap: anywhere;
}
</style>
