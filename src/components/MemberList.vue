<template>
  <v-card variant="tonal" color="primary">
    <v-card-title>{{ user.alias }}</v-card-title>
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
      <v-btn v-if="discordUrl" :href="discordUrl" color="#5865F2" variant="elevated" prepend-icon="fa-brands fa-discord" target="_blank" rel="noopener noreferrer">
        Discord
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import type { Member } from '@/types/member'
import { computed } from 'vue'

const props = defineProps<{
  user: Member
}>()
const discordUrl = computed(() => {
  const value = props.user.discordInvite?.trim()
  if (!value) return null
  const candidate = /^[\w-]+$/.test(value) ? `https://discord.gg/${value}` : /^discord\.(gg|com)\//i.test(value) ? `https://${value}` : value
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' && !url.username && !url.password &&
      ((url.hostname === 'discord.gg' && url.pathname.length > 1) ||
       (['discord.com', 'www.discord.com', 'discordapp.com'].includes(url.hostname) && url.pathname.startsWith('/invite/')))
      ? url.href : null
  } catch { return null }
})
</script>

<style scoped>
.member-links { flex-wrap: wrap; gap: 8px; }
.member-links :deep(.v-btn) { margin-inline-start: 0 !important; }
</style>
