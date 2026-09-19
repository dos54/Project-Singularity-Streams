<template>
  <v-card variant="tonal" color="primary">
    <v-card-title class="member-title"
      ><span>{{ user.alias }}</span
      ><button
        type="button"
        class="favorite-button"
        :class="{ selected: favorite }"
        :aria-pressed="favorite"
        :aria-label="`${favorite ? 'Remove' : 'Add'} ${user.alias} ${favorite ? 'from' : 'to'} favorites`"
        @click="preferences.toggleFavorite(user.memberId)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />
        </svg></button
    ></v-card-title>
    <v-card-actions class="member-links">
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
      <v-btn
        v-if="discordUrl"
        :href="discordUrl"
        color="#5865F2"
        variant="elevated"
        prepend-icon="fa-brands fa-discord"
        target="_blank"
        rel="noopener noreferrer"
      >
        Discord
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import type { Member } from '@/types/member'
import { computed } from 'vue'
import { usePreferencesStore } from '@/stores/preferences.store'

const props = defineProps<{
  user: Member
}>()
const preferences = usePreferencesStore()
const favorite = computed(() => preferences.favoriteIds.includes(props.user.memberId))
const discordUrl = computed(() => {
  const value = props.user.discordInvite?.trim()
  if (!value) return null
  const candidate = /^[\w-]+$/.test(value)
    ? `https://discord.gg/${value}`
    : /^discord\.(gg|com)\//i.test(value)
      ? `https://${value}`
      : value
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      ((url.hostname === 'discord.gg' && url.pathname.length > 1) ||
        (['discord.com', 'www.discord.com', 'discordapp.com'].includes(url.hostname) &&
          url.pathname.startsWith('/invite/')))
      ? url.href
      : null
  } catch {
    return null
  }
})
</script>

<style scoped>
.member-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  white-space: normal;
}
.favorite-button {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
}
.favorite-button svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
}
.favorite-button.selected {
  color: #ffcf6b;
}
.favorite-button.selected svg {
  fill: currentColor;
}
.favorite-button:focus-visible {
  outline: 2px solid currentColor;
}
.member-links {
  flex-wrap: wrap;
  gap: 8px;
}
.member-links :deep(.v-btn) {
  margin-inline-start: 0 !important;
}
</style>
