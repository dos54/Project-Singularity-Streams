import { defineStore } from 'pinia'
import { ref, computed, reactive } from 'vue'
import { requestJson, RequestError } from '@/utils/requests'
import { isMember, isTwitchStream, isVideo } from '@/utils/dataValidation'

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

  const sourceState = reactive({
    members: { loading: false, error: '', receivedAt: null as number | null, retryAt: 0 },
    twitch: { loading: false, error: '', receivedAt: null as number | null, retryAt: 0 },
    youtube: { loading: false, error: '', receivedAt: null as number | null, retryAt: 0 },
  })
  const loading = computed(() => Object.values(sourceState).some((source) => source.loading))
  const error = computed(
    () => Object.values(sourceState).find((source) => source.error)?.error || null,
  )

  // --- derived ---
  const membersById = computed(() => Object.fromEntries(members.value.map((m) => [m.memberId, m])))

  const membersWithStreams = computed<MemberWithComputed[]>(() =>
    members.value.map((m) => ({
      ...m,
      twitchStream: m.twitch ? (twitchStreams.value[m.twitch.trim().toLowerCase()] ?? null) : null,
      latestYoutubeVideo: currentYoutubeByMemberId.value[m.memberId] ?? null,
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

  const currentYoutubeByMemberId = computed<Record<number, YoutubeVideo>>(() => {
    const out: Record<number, YoutubeVideo> = {}

    for (const v of youtubeVideos.value) {
      const cur = out[v.memberId]

      // 1️⃣ Live always wins
      if (v.state === 'live' && cur?.state !== 'live') {
        out[v.memberId] = v
        continue
      }

      // 2️⃣ If we already have a live stream, never replace it
      if (cur?.state === 'live' && v.state !== 'live') continue

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
      }),
  )

  // --- actions ---
  const pending = new Map<string, Promise<void>>()
  function fetchSource(name: keyof typeof sourceState) {
    if (pending.has(name)) return pending.get(name)!
    const state = sourceState[name]
    if (Date.now() < state.retryAt) return Promise.resolve()
    const task = (async () => {
      state.loading = true
      state.error = ''
      try {
        if (name === 'members') {
          const data = await requestJson<MembersResponse>(`${API_BASE}/members`)
          if (!Array.isArray(data?.members) || !data.members.every(isMember))
            throw new Error('Invalid members response.')
          members.value = data.members
        } else if (name === 'twitch') {
          const data = await requestJson<TwitchLivestreamsResponse>(
            `${API_BASE}/twitch/livestreams`,
          )
          if (!Array.isArray(data?.liveStreams) || !data.liveStreams.every(isTwitchStream))
            throw new Error('Invalid Twitch response.')
          twitchStreams.value = Object.fromEntries(
            data.liveStreams.map((stream) => [stream.login.trim().toLowerCase(), stream]),
          )
        } else {
          const data = await requestJson<YoutubeVideosResponse>(`${API_BASE}/youtube/videos`)
          if (!Array.isArray(data?.videos) || !data.videos.every(isVideo))
            throw new Error('Invalid YouTube response.')
          youtubeVideos.value = data.videos
        }
        state.receivedAt = Date.now()
        state.retryAt = 0
      } catch (failure) {
        state.error = failure instanceof Error ? failure.message : 'Could not load data.'
        state.retryAt = failure instanceof RequestError ? failure.retryAt : 0
      } finally {
        state.loading = false
        pending.delete(name)
      }
    })()
    pending.set(name, task)
    return task
  }
  async function refreshStreams(failedOnly = false) {
    const names = (['members', 'youtube', 'twitch'] as const).filter((name) =>
      failedOnly
        ? !!sourceState[name].error
        : name !== 'members' ||
          !sourceState.members.receivedAt ||
          !!sourceState.members.error ||
          Date.now() - sourceState.members.receivedAt >= 3_600_000,
    )
    await Promise.all(names.map(fetchSource))
    return Math.max(...Object.values(sourceState).map((source) => source.retryAt))
  }
  async function hydrate() {
    await Promise.all(
      (['members', 'youtube', 'twitch'] as const)
        .filter((name) => {
          const state = sourceState[name]
          return (
            !state.receivedAt ||
            !!state.error ||
            Date.now() - state.receivedAt >= (name === 'members' ? 3_600_000 : 120_000)
          )
        })
        .map(fetchSource),
    )
  }

  return {
    // state
    members,
    twitchStreams,
    youtubeVideos,
    loading,
    error,
    sourceState,

    // computed
    sortedMembers,
    streamingMembers,
    membersWithStreams,
    membersById,
    uploads,

    // actions
    hydrate,
    refreshStreams,
  }
})
