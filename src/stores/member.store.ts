import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

import type { Member, MemberWithComputed } from '@/types/member'
import type { TwitchLivestream } from '@/types/twitch'
import type { YoutubeVideo } from '@/types/youtube'
import type { MembersResponse, TwitchLivestreamsResponse, YoutubeVideosResponse } from '@/types/api'

const API_BASE = import.meta.env.VITE_API_BASE_URL

export const useMemberStore = defineStore('members', () => {
  // --- state ---
  const members = ref<Member[]>([])
  const twitchStreams = ref<Record<string, TwitchLivestream>>({})
  const youtubeVideos = ref<YoutubeVideo[]>([])

  const loading = ref(false)
  const error = ref<Error | null>(null)

  // --- derived ---
  const membersById = computed(() => Object.fromEntries(members.value.map((m) => [m.memberId, m])))

  const membersWithStreams = computed<MemberWithComputed[]>(() =>
    members.value.map((m) => ({
      ...m,
      twitchStream: m.twitch ? (twitchStreams.value[m.twitch] ?? null) : null,
      latestYoutubeVideo:
        youtubeLiveByMemberId.value[m.memberId] ??
        currentYoutubeByMemberId.value[m.memberId] ??
        null,
    })),
  )

  const streamingMembers = computed(() =>
    membersWithStreams.value.filter(
      (m) => m.twitchStream?.isLive || m.latestYoutubeVideo?.state === 'live',
    ),
  )

  const sortedMembers = computed(() =>
    [...membersWithStreams.value].sort((a, b) =>
      a.alias.localeCompare(b.alias, undefined, { sensitivity: 'base' }),
    ),
  )

  const youtubeLiveByMemberId = computed<Record<number, YoutubeVideo>>(() => {
    const out: Record<number, YoutubeVideo> = {}
    for (const v of youtubeVideos.value) {
      if (v.state === 'live') out[v.memberId] = v
    }
    return out
  })

  const currentYoutubeByMemberId = computed<Record<number, YoutubeVideo>>(() => {
    const out: Record<number, YoutubeVideo> = {}

    for (const v of youtubeVideos.value) {
      const cur = out[v.memberId]

      // 1️⃣ Live always wins
      if (v.state === 'live') {
        out[v.memberId] = v
        continue
      }

      // 2️⃣ If we already have a live stream, never replace it
      if (cur?.state === 'live') continue

      // 3️⃣ Otherwise pick newest VOD
      const curTime = Date.parse(cur?.publishedAt ?? '') || 0
      const newTime = Date.parse(v.publishedAt ?? '') || 0
      if (!cur || newTime > curTime) {
        out[v.memberId] = v
      }
    }

    return out
  })


  const uploads = computed(() =>
    youtubeVideos.value
      .filter((v) => v.state === 'video')
      .sort((a, b) => {
        const aTime = Date.parse(a.publishedAt ?? '') || 0
        const bTime = Date.parse(b.publishedAt ?? '') || 0
        return bTime - aTime
      })
  )

  // --- actions ---
  async function fetchMembers() {
    loading.value = true
    try {
      const res = await fetch(`${API_BASE}/members`)
      if (!res.ok) throw new Error('Failed to fetch members')

      const data = (await res.json()) as MembersResponse
      members.value = data.members
    } finally {
      loading.value = false
    }
  }

  async function fetchTwitchLivestreams() {
    try {
      const res = await fetch(`${API_BASE}/twitch/livestreams`)
      if (!res.ok) throw new Error('Failed to fetch Twitch livestreams')

      const data = (await res.json()) as TwitchLivestreamsResponse
      twitchStreams.value = Object.fromEntries(data.liveStreams.map((s) => [s.login, s]))
    } catch (e) {
      error.value = e instanceof Error ? e : new Error('Unknown error')
    }
  }

  async function fetchYoutubeVideos() {
    try {
      const res = await fetch(`${API_BASE}/youtube/videos`)
      if (!res.ok) throw new Error('Failed to fetch YouTube videos')

      const data = (await res.json()) as YoutubeVideosResponse
      youtubeVideos.value = data.videos
    } catch (e) {
      error.value = e instanceof Error ? e : new Error('Unknown error')
    }
  }

  async function hydrate() {
    error.value = null
    await Promise.all([fetchMembers(), fetchTwitchLivestreams(), fetchYoutubeVideos()])
  }

  return {
    // state
    members,
    twitchStreams,
    youtubeVideos,
    loading,
    error,

    // computed
    sortedMembers,
    streamingMembers,
    membersWithStreams,
    membersById,
    uploads,

    // actions
    hydrate,
  }
})
