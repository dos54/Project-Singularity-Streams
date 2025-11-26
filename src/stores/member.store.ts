import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { members as staticMembers, type Member } from '@/data/members'

export interface StreamInfo {
  login: string
  isLive: boolean
  title: string | null
  gameName: string | null
  viewerCount: number | null
}

export interface YoutubeVideoInfo {
  videoId: string
  title: string | null
  publishedAt: string | null
  thumbnailUrl: string | null
}

export interface YoutubeVideoWithChannel extends YoutubeVideoInfo {
  channelId: string
}

export interface YoutubeStatus {
  channelId: string
  latestVideo: YoutubeVideoInfo | null
  live: {
    isLive: boolean
    videoId: string | null
    title: string | null
    thumbnailUrl: string | null
    viewerCount?: number | null
  }
}

export interface LiveYoutubeEntry {
  videoId: string
  title?: string
  published?: string
  link?: string
  author?: {
    name?: string
    uri?: string
  }
  thumbnailUrl?: string
  thumbnailWidth?: string
  thumbnailHeight?: string
  liveStatus?: {
    state: 'live' | 'ended' | 'video' | 'inactive'
    lastChecked: number
    actualStartTime?: string
    actualEndTime?: string
    concurrentViewers?: string
  }
}

export interface LiveApiResponse {
  twitch: StreamInfo[] | null
  youtube: LiveYoutubeEntry[] | null
}

// /youtube/uploads response
interface UploadApiEntry {
  videoId: string
  title?: string
  published?: string
  thumbnailUrl?: string
  author?: {
    name?: string
    uri?: string
  }
}

interface UploadApiResponse {
  uploads: UploadApiEntry[]
  isStale: boolean
}

export type MemberWithStream = Member & {
  stream?: StreamInfo | null
  youtubeStatus?: YoutubeStatus | null
}

export interface MemberLatestVideo {
  member: Member
  video: YoutubeVideoInfo
}

const STATUS_TTL_MS = 60_000
const UPLOAD_TTL_MS = 60_000
const CACHE_KEY = 'memberStatusCache_v1'
const UPLOAD_CACHE_KEY = 'memberUploadsCache_v2' // bumped because shape changed
const WORKER_BASE_URL = 'https://twitch-proxy.dragonofshame.workers.dev'

interface UploadCachePayload {
  timestamp: number
  uploads: Record<string, YoutubeVideoInfo>
}

interface StatusCachePayload {
  timestamp: number
  twitch: Record<string, StreamInfo>
  youtube: Record<string, YoutubeStatus>
}

export const useMemberStore = defineStore('members', () => {
  const members = ref<Member[]>(staticMembers)

  // live status
  const streamsByLogin = ref<Record<string, StreamInfo>>({})
  const youtubeByChannelId = ref<Record<string, YoutubeStatus>>({})
  const lastStatusFetch = ref<number | null>(null)
  const isFetchingStatus = ref(false)
  const statusError = ref<Error | null>(null)

  // uploads
  const latestVideoByChannelId = ref<Record<string, YoutubeVideoInfo>>({})
  const lastUploadsFetch = ref<number | null>(null)
  const isFetchingUploads = ref(false)
  const uploadsError = ref<Error | null>(null)

  // hydrate from localStorage
  if (typeof window !== 'undefined') {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as StatusCachePayload
        const now = Date.now()
        if (now - parsed.timestamp < STATUS_TTL_MS) {
          streamsByLogin.value = parsed.twitch
          youtubeByChannelId.value = parsed.youtube
          lastStatusFetch.value = parsed.timestamp
        }
      } catch {}
    }

    const rawUploads = window.localStorage.getItem(UPLOAD_CACHE_KEY)
    if (rawUploads) {
      try {
        const parsed = JSON.parse(rawUploads) as UploadCachePayload
        const now = Date.now()
        if (now - parsed.timestamp < UPLOAD_TTL_MS) {
          latestVideoByChannelId.value = parsed.uploads
          lastUploadsFetch.value = parsed.timestamp
        }
      } catch {}
    }
  }

  const membersWithStreams = computed<MemberWithStream[]>(() =>
    members.value.map((m) => {
      const stream = m.twitch ? (streamsByLogin.value[m.twitch] ?? null) : null
      const youtubeStatus =
        m.youtubeId && m.youtubeId.trim().length > 0
          ? (youtubeByChannelId.value[m.youtubeId] ?? null)
          : null
      return { ...m, stream, youtubeStatus }
    }),
  )

  const sortedMembers = computed<MemberWithStream[]>(() =>
    [...membersWithStreams.value].sort((a, b) =>
      a.alias.toLowerCase().localeCompare(b.alias.toLowerCase()),
    ),
  )

  // channelId -> alias
  const aliasByChannelId = computed<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const m of members.value) {
      if (m.youtubeId) {
        map[m.youtubeId] = m.alias
      }
    }
    return map
  })

  // THIS is "currently streaming" = Twitch OR YouTube live
  const streamingMembers = computed<MemberWithStream[]>(() =>
    membersWithStreams.value.filter((m) => m.stream?.isLive || m.youtubeStatus?.live.isLive),
  )

  const membersByLatestUpload = computed<MemberLatestVideo[]>(() => {
    const result: MemberLatestVideo[] = []

    for (const m of members.value) {
      if (!m.youtubeId) continue
      const video = latestVideoByChannelId.value[m.youtubeId]
      if (!video || !video.publishedAt) continue
      result.push({ member: m, video })
    }

    return result.sort((a, b) => {
      const aTime = Date.parse(a.video.publishedAt ?? '') || 0
      const bTime = Date.parse(b.video.publishedAt ?? '') || 0
      return bTime - aTime
    })
  })

  const uploadsList = computed<YoutubeVideoWithChannel[]>(() => {
    const result: YoutubeVideoWithChannel[] = []

    for (const [channelId, video] of Object.entries(latestVideoByChannelId.value)) {
      if (!video.publishedAt) continue
      result.push({ ...video, channelId })
    }

    return result.sort((a, b) => {
      const aTime = Date.parse(a.publishedAt ?? '') || 0
      const bTime = Date.parse(b.publishedAt ?? '') || 0
      return bTime - aTime
    })
  })

  async function refreshStatus(force = false): Promise<void> {
    const now = Date.now()
    if (!force && lastStatusFetch.value !== null && now - lastStatusFetch.value < STATUS_TTL_MS) {
      return
    }

    const twitchLogins = members.value
      .map((m) => m.twitch)
      .filter((t): t is string => !!t && t.trim().length > 0)

    const youtubeIds = members.value
      .map((m) => m.youtubeId)
      .filter((id): id is string => !!id && id.trim().length > 0)

    if (twitchLogins.length === 0 && youtubeIds.length === 0) return

    isFetchingStatus.value = true
    statusError.value = null

    try {
      const params = new URLSearchParams()
      if (twitchLogins.length > 0) {
        params.set('twitch', twitchLogins.join(','))
      }
      if (youtubeIds.length > 0) {
        params.set('youtube', youtubeIds.join(','))
      }

      const res = await fetch(`${WORKER_BASE_URL}/live?${params.toString()}`)
      if (!res.ok) {
        throw new Error(`Failed to fetch status: ${res.status}`)
      }

      const data = (await res.json()) as LiveApiResponse

      const twitchMap: Record<string, StreamInfo> = {}
      if (data.twitch) {
        for (const s of data.twitch) {
          twitchMap[s.login] = {
            login: s.login,
            isLive: s.isLive,
            title: s.title ?? null,
            gameName: s.gameName ?? null,
            viewerCount: s.viewerCount ?? null,
          }
        }
      }

      const youtubeMap: Record<string, YoutubeStatus> = {}

      if (data.youtube) {
        for (const entry of data.youtube) {
          const uri = entry.author?.uri ?? ''
          const match = uri.match(/\/channel\/([^/?]+)/)
          const channelId = match?.[1]
          if (!channelId) continue

          const isLive = entry.liveStatus?.state === 'live'

          youtubeMap[channelId] = {
            channelId,
            latestVideo: null,
            live: {
              isLive,
              videoId: entry.videoId ?? null,
              title: entry.title ?? null,
              thumbnailUrl: entry.thumbnailUrl ?? null,
              viewerCount: entry.liveStatus?.concurrentViewers
                ? Number(entry.liveStatus.concurrentViewers)
                : null,
            },
          }
        }
      }

      streamsByLogin.value = twitchMap
      youtubeByChannelId.value = youtubeMap

      lastStatusFetch.value = now

      if (typeof window !== 'undefined') {
        const payload: StatusCachePayload = {
          timestamp: now,
          twitch: twitchMap,
          youtube: youtubeMap,
        }
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
      }
    } catch (e) {
      statusError.value = e instanceof Error ? e : new Error('Unknown error while fetching status')
    } finally {
      isFetchingStatus.value = false
    }
  }

  async function fetchLatestUploads(force = false): Promise<void> {
    const now = Date.now()

    const youtubeIds = members.value
      .map((m) => m.youtubeId)
      .filter((id): id is string => !!id && id.trim().length > 0)

    if (youtubeIds.length === 0) return
    if (isFetchingUploads.value) return

    isFetchingUploads.value = true
    uploadsError.value = null

    try {
      const params = new URLSearchParams()
      params.set('youtube', youtubeIds.join(','))

      const headers: HeadersInit = {}
      if (force) {
        headers['X-Force-Revalidate'] = 'true'
      }

      const res = await fetch(`${WORKER_BASE_URL}/youtube/uploads?${params.toString()}`, {
        headers,
        method: 'GET'
      })
      if (!res.ok) {
        throw new Error(`Failed to fetch uploads: ${res.status}`)
      }

      const data = (await res.json()) as UploadApiResponse
      const map: Record<string, YoutubeVideoInfo> = {}

      for (const entry of data.uploads) {
        if (!entry.videoId) continue

        const uri = entry.author?.uri ?? ''
        const match = uri.match(/\/channel\/([^/?]+)/)
        const channelId = match?.[1]
        if (!channelId) continue

        map[channelId] = {
          videoId: entry.videoId,
          title: entry.title ?? null,
          publishedAt: entry.published ?? null,
          thumbnailUrl: entry.thumbnailUrl ?? null,
        }
      }

      latestVideoByChannelId.value = map
      lastUploadsFetch.value = now

      if (typeof window !== 'undefined') {
        const payload: UploadCachePayload = {
          timestamp: now,
          uploads: map,
        }
        window.localStorage.setItem(UPLOAD_CACHE_KEY, JSON.stringify(payload))
      }

      if (data.isStale && !force && typeof window !== 'undefined') {
        console.log('Stale data received, refreshing data')
        window.setTimeout(() => {
          fetchLatestUploads(true).catch((err) => {
            console.error('Failed to revalidate uploads', err)
          })
        }, 3000)
      }
    } catch (e) {
      uploadsError.value =
        e instanceof Error ? e : new Error('Unknown error while fetching uploads')
    } finally {
      isFetchingUploads.value = false
    }
  }

  return {
    members,
    membersWithStreams,
    sortedMembers,
    streamingMembers, // ← Twitch + YouTube live
    isFetchingStatus,
    statusError,
    refreshStatus,

    latestVideoByChannelId,
    membersByLatestUpload,
    uploadsList,
    aliasByChannelId,
    isFetchingUploads,
    uploadsError,
    fetchLatestUploads,
  }
})
