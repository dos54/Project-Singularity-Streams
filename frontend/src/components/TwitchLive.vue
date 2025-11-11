<template>
  <v-card>
    <v-card-title>
      {{ streamer.gameName }}
    </v-card-title>
    <v-card-subtitle>
      {{ streamer.isLive ? 'Live' : 'Offline' }}
    </v-card-subtitle>
    <v-card-actions>
      <v-btn
      :href="`https://www.twitch.tv/${streamer.login}`"
      target="_blank"
      rel="noopener"
      >
        Twitch
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
interface Streamer {
  login: string,
  isLive: boolean,
  title?: string,
  gameName?: string,
  viewerCount?: number
}

const props = defineProps<{
  streamer: Streamer,
}>()

</script>
