<template>
  <v-card variant="outlined" color="primary">
    <v-card-title>
      <span v-if="user.stream?.isLive" class="status-dot"></span>
      {{ user.alias }}
    </v-card-title>
    <v-card-subtitle v-if="user.stream?.isLive">
      {{ user.stream.title }}
    </v-card-subtitle>
    <v-card-text v-if="user.stream?.isLive">
      {{ user.stream?.isLive ? 'LIVE' : 'Offline' }} to {{ user.stream?.viewerCount }} viewers
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
      <v-btn
        v-if="user.discord"
        :href="user.discord"
        color="indigo"
        variant="elevated"
        prepend-icon="fa-brands fa-discord"
        target="_blank"
        rel="noopener"
      >
        Discord
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
interface StreamInfo {
  login: string
  isLive: boolean
  title?: string
  gameName?: string
  viewerCount?: number
}

interface User {
  alias: string
  twitch?: string
  youtube?: string
  discord?: string
}

type UserWithStream = User & {
  stream?: StreamInfo | null
}

defineProps<{
  user: UserWithStream
}>()
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
