import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { members as staticMembers, type Member } from '@/data/members'

// The data fetched from Twitch
interface StreamInfo {
  login: string
  isLive: boolean
  title?: string
  gameName?: string
  viewerCount?: number
}

export type MemberWithStream = Member & {
  stream?: StreamInfo | null
}

// Livetime (ms) of the store
const TWITCH_TTL_MS = 60_000

export const useMemberStore = defineStore('members', () => {
  const members = ref<Member[]>(staticMembers)

  const streamsByLogin = ref<Record<string, StreamInfo>>({})
  const lastTwitchFetch = ref<number | null>(null)
  const isFetchingTwitch = ref(false)
  const twitchError = ref<Error | null>(null)

  const membersWithStreams = computed<MemberWithStream[]>(() =>
    members.value.map((m) => {
      const stream = m.twitch ? streamsByLogin.value[m.twitch] ?? null : null
      return { ...m, stream }
    })
  )

  const sortedMembers = computed<MemberWithStream[]>(() =>
    [...members.value].sort(
      (a, b) => a.alias.toLowerCase().localeCompare(b.alias.toLowerCase()),
    )
  )

  const streamingMembers = computed<MemberWithStream[]>(() =>
    [...membersWithStreams.value].filter((m) => m.stream?.isLive)
  )

  async function fetchTwitchStreams(force = false): Promise<void> {
    const now = Date.now()
    if (!force && lastTwitchFetch.value && now - lastTwitchFetch.value < TWITCH_TTL_MS) {
      return
    }

    const twitchLogins = members.value
      .map((m) => m.twitch)
      .filter((t): t is string => !!t)

    if (twitchLogins.length === 0) return

    isFetchingTwitch.value = true
    twitchError.value = null

    try {
      const csv = twitchLogins.join(',')
      const res = await fetch(
        `https://twitch-proxy.dragonofshame.workers.dev/twitch/live?logins=${csv}`,
      )

      if (!res.ok) {
        throw new Error(`Failed to fetch streams: ${res.status}`)
      }

      const streams: StreamInfo[] = await res.json()
      const map: Record<string, StreamInfo> = {}

      for (const s of streams) {
        map[s.login] = s
      }

      streamsByLogin.value = map
      lastTwitchFetch.value = now
    } catch (e) {
      twitchError.value = e instanceof Error ? e: new Error('Unknown error')
    } finally {
      isFetchingTwitch.value = false
    }
  }

  return {
    members,
    membersWithStreams,
    sortedMembers,
    isFetchingTwitch,
    twitchError,
    streamingMembers,
    fetchTwitchStreams,
  }
})
