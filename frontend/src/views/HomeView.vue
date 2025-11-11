<template>
  <v-container fluid>
    <v-row>
      <v-list>
        <v-list-item
          v-for="user in users"
          :key="user.login"
        >
          <TwitchLive :streamer=user />
        </v-list-item>
      </v-list>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import TwitchLive from '@/components/TwitchLive.vue'

const userNames = [
  'duckedgtnh'
]

interface Streamer {
  login: string,
  isLive: boolean,
  title?: string,
  gameName?: string,
  viewerCount?: number
}

const users = ref<Streamer[]>([])

onMounted(async () => {
  if (userNames.length === 0) return
  const csvUserNames = userNames.join(',')
  const res = await fetch(`https://twitch-proxy.dragonofshame.workers.dev/twitch/live?logins=${csvUserNames}`)

  if (!res.ok) {
    console.error('Failed to fetch streams:', res.status)
    return
  }

  users.value = await res.json()
})

</script>
