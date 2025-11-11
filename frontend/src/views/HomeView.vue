<template>
  <v-container fluid>
    <v-row>
      <ul class="list">
        <li v-for="user in sortedUsers" :key="user.alias">
          <TwitchLive :user="user" />
        </li>
      </ul>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import TwitchLive from '@/components/TwitchLive.vue'

const userNames = ['duckedgtnh', 'sol_ix', 'mastiox', 'flurbenlive', 'glistew']

interface User {
  alias: string
  twitch?: string
  youtube?: string
  discord?: string
}

const userList: User[] = [
  {
    alias: 'Ducked',
    twitch: 'duckedgtnh',
    youtube: '@DuckedGTNH',
    discord: 'discord.gg/ufa5xm9PK7',
  },
  {
    alias: 'Neurotic Goose',
    youtube: '@NeuroticGoose',
    discord: 'discord.gg/ufa5xm9PK7',
  },
  {
    alias: 'Hecuba',
    youtube: '@hecuba39'
  },
  {
    alias: 'HamCorp (Tooj)',
    youtube: '@ham-corp'
  },
  {
    alias: 'soycake',
    youtube: '@soycake'
  },
  {
    alias: '3ricbae',
    youtube: '@3ricbae'
  },
  {
    alias: 'Dragonium',
    youtube: '@dragonium10190'
  },
  {
    alias: 'ChiefLogan',
    youtube: '@chieflogan_'
  },
  {
    alias: 'Jetlagg',
    youtube: '@jetlaggmc'
  },
  {
    alias: 'Jolliwog',
    youtube: '@jolliwog'
  },
  {
    alias: 'Sol IX',
    twitch: 'sol_ix',
    youtube: '@IX_Streams',
    discord: 'discord.com/invite/mEUV7fwdfF'
  },
  {
    alias: 'Mastiox',
    twitch: 'mastiox',
    youtube: '@Mastiox'
  },
  {
    alias: 'Flurben',
    twitch: 'flurbenlive',
  },
  {
    alias: 'Glistew',
    twitch: 'glistew',
  },
]

interface StreamInfo {
  login: string
  isLive: boolean
  title?: string
  gameName?: string
  viewerCount?: number
}

type UserWithStream = User & {
  stream?: StreamInfo | null
}

const twitchUsers = userList.filter((user) => !!user.twitch).map((user) => user.twitch!)

const users = ref<UserWithStream[]>([])

onMounted(async () => {
  if (twitchUsers.length === 0) return
  const csvUserNames = userNames.join(',')
  const res = await fetch(
    `https://twitch-proxy.dragonofshame.workers.dev/twitch/live?logins=${csvUserNames}`,
  )

  if (!res.ok) {
    console.error('Failed to fetch streams:', res.status)
    return
  }

  const streams: StreamInfo[] = await res.json()

  users.value = userList.map((u) => ({
    ...u,
    stream: streams.find((s) => s.login === u.twitch) ?? null,
  }))
})

const sortedUsers = computed<UserWithStream[]>(() =>
  [...users.value].sort((a, b) => Number(!!b.stream?.isLive) - Number(!!a.stream?.isLive)),
)
</script>

<style scoped>
.list {
  list-style: none;
  width: 100%;
  display: grid;
  gap: 1rem;
}
</style>
