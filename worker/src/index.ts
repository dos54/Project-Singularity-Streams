import { XMLParser } from 'fast-xml-parser'

export interface Env {
  TWITCH_CLIENT_ID: string
  TWITCH_CLIENT_SECRET: string
  YOUTUBE_API_KEY: string
}

const YOUTUBE_TTL = 300 // live status cache (seconds)
const UPLOAD_TTL_SECONDS = 60 // latest uploads cache (seconds)

const VALID_PATHS = ['/live', '/twitch/live', '/youtube/live', '/youtube/uploads']

let cachedToken: string | null = null
let tokenExpiresAt = 0

// ---------- Shared helpers ----------

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function withCors(body: BodyInit | null, init: ResponseInit = {}): Response {
  return new Response(body, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
      ...corsHeaders,
    },
  })
}

function handleOptions(request: Request): Response {
  const requestHeaders = request.headers.get('Access-Control-Request-Headers') || ''

  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      'Access-Control-Allow-Headers': requestHeaders || 'Content-Type',
    },
  })
}

async function getAppToken(env: Env): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken

  const resp = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID,
      client_secret: env.TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  })

  if (!resp.ok) throw new Error(`Token error: ${resp.status}`)

  const json = (await resp.json()) as {
    access_token: string
    expires_in: number
  }

  cachedToken = json.access_token
  tokenExpiresAt = Date.now() + json.expires_in * 1000
  return cachedToken!
}

// ---------- Twitch ----------

export type TwitchResult = {
  login: string
  isLive: boolean
  title: string | null
  gameName: string | null
  viewerCount: number | null
}

type TwitchAPIStream = {
  user_login: string
  title?: string
  game_name?: string
  viewer_count?: number
}

type TwitchAPIResponse = {
  data?: TwitchAPIStream[]
}

function parseTwitchLogins(url: URL): string[] {
  // Support both ?twitch= and legacy ?logins=
  const raw = url.searchParams.get('twitch') ?? url.searchParams.get('logins') ?? ''
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

async function fetchTwitchData(logins: string[], env: Env): Promise<TwitchResult[]> {
  if (!logins.length) return []

  const token = await getAppToken(env)
  const qs = logins.map((l) => `user_login=${encodeURIComponent(l)}`).join('&')

  const twitchResp = await fetch(`https://api.twitch.tv/helix/streams?${qs}`, {
    headers: {
      'Client-Id': env.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
  })

  if (!twitchResp.ok) {
    throw new Error(`Twitch error: ${twitchResp.status}`)
  }

  const body = (await twitchResp.json()) as TwitchAPIResponse
  const liveMap = new Map<string, TwitchAPIStream>()

  for (const s of body.data ?? []) {
    liveMap.set(s.user_login.toLowerCase(), s)
  }

  return logins.map((login) => {
    const stream = liveMap.get(login.toLowerCase())
    return {
      login,
      isLive: stream !== undefined,
      title: stream?.title ?? null,
      gameName: stream?.game_name ?? null,
      viewerCount: stream?.viewer_count ?? null,
    }
  })
}

// ---------- YouTube live status (Data API) ----------

export type YoutubeChannelResult = {
  channelId: string
  live: {
    isLive: boolean
    videoId: string | null
    title: string | null
    thumbnailUrl: string | null
  }
}

type YoutubeThumbnail = {
  url?: string
}

type YoutubeSnippetThumbnails = {
  default?: YoutubeThumbnail
  medium?: YoutubeThumbnail
  high?: YoutubeThumbnail
}

type YoutubeSearchSnippet = {
  title?: string
  thumbnails?: YoutubeSnippetThumbnails
}

type YoutubeSearchItem = {
  id?: { videoId?: string }
  snippet?: YoutubeSearchSnippet
}

type YoutubeSearchResponse = {
  items?: YoutubeSearchItem[]
}

function parseYoutubeChannels(url: URL): string[] {
  // Support ?youtube=UC...,UC... and ?channels=...
  const raw = url.searchParams.get('youtube') ?? url.searchParams.get('channels') ?? ''
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function buildThumbnail(snippet?: YoutubeSearchSnippet): string | null {
  const thumbs: YoutubeSnippetThumbnails | undefined = snippet?.thumbnails
  if (!thumbs) return null
  return thumbs.medium?.url ?? thumbs.default?.url ?? thumbs.high?.url ?? null
}

async function fetchYoutubeForChannel(
  channelId: string,
  apiKey: string,
): Promise<YoutubeChannelResult> {
  const url = new URL('https://www.googleapis.com/youtube/v3/search')
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('channelId', channelId)
  url.searchParams.set('eventType', 'live')
  url.searchParams.set('type', 'video')
  url.searchParams.set('maxResults', '1')
  url.searchParams.set('key', apiKey)

  const res = await fetch(url.toString())

  if (!res.ok) {
    throw new Error(`YouTube error: status=${res.status}`)
  }

  const json = (await res.json()) as YoutubeSearchResponse
  const item = json.items?.[0]

  const videoId = item?.id?.videoId ?? null
  const snippet = item?.snippet

  if (!videoId) {
    return {
      channelId,
      live: {
        isLive: false,
        videoId: null,
        title: null,
        thumbnailUrl: null,
      },
    }
  }

  return {
    channelId,
    live: {
      isLive: true,
      videoId,
      title: snippet?.title ?? null,
      thumbnailUrl: buildThumbnail(snippet),
    },
  }
}

async function fetchYoutubeDataWithCache(
  channelIds: string[],
  env: Env,
  ctx: ExecutionContext,
  requestUrl: URL,
): Promise<YoutubeChannelResult[]> {
  if (!channelIds.length) return []

  // Normalized cache key: same set of channels -> same key
  const sorted = [...channelIds].sort()
  const cacheUrl = new URL(requestUrl.toString())
  cacheUrl.pathname = '/__youtube_cache_live'
  cacheUrl.search = `?channels=${encodeURIComponent(sorted.join(','))}`
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' })
  const cache = caches.default

  const cached = await cache.match(cacheKey)
  if (cached) {
    const data = (await cached.json()) as YoutubeChannelResult[]
    return data
  }

  const results = await Promise.all(
    sorted.map((id) => fetchYoutubeForChannel(id, env.YOUTUBE_API_KEY)),
  )

  const cacheResp = new Response(JSON.stringify(results), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${YOUTUBE_TTL}`,
    },
  })

  ctx.waitUntil(cache.put(cacheKey, cacheResp.clone()))

  return results
}

// ---------- YouTube latest uploads (Atom feed + XML) ----------

type YoutubeFeedEntry = {
  'yt:videoId'?: string
  title?: string
  published?: string
  link?: { href?: string }
}

type YoutubeFeed = {
  feed?: {
    entry?: YoutubeFeedEntry[]
  }
}

type YoutubeUploadsResult = {
  channelId: string
  latest: YoutubeFeedEntry[]
}

type YoutubeUploadsCacheEntry = {
  timestamp: number
  data: YoutubeUploadsResult[]
}

async function getLatestVideo(channelId: string): Promise<YoutubeFeedEntry[]> {
  const url = new URL('https://www.youtube.com/feeds/videos.xml')
  url.searchParams.set('channel_id', channelId)
  const res = await fetch(url.toString())

  if (!res.ok) {
    throw new Error(`Error fetching channel uploads: status=${res.status}`)
  }

  const xml = await res.text()
  const parser = new XMLParser()

  const data = parser.parse(xml) as YoutubeFeed
  const entries = data.feed?.entry ?? []
  // Return only the latest entry (if any)
  return entries.slice(0, 1)
}

async function getLatestVideosForChannels(channelIds: string[]): Promise<YoutubeUploadsResult[]> {
  const results = await Promise.all(
    channelIds.map(async (id) => {
      try {
        const latest = await getLatestVideo(id)
        return { channelId: id, latest }
      } catch {
        // Prevent one channel failure from killing the whole batch
        return { channelId: id, latest: [] }
      }
    }),
  )

  return results
}

async function fetchYoutubeUploadsWithCache(
  channelIds: string[],
  ctx: ExecutionContext,
  requestUrl: URL,
): Promise<YoutubeUploadsResult[]> {
  if (!channelIds.length) return []

  const sorted = [...channelIds].sort()
  const cacheUrl = new URL(requestUrl.toString())
  cacheUrl.pathname = '/__youtube_cache_uploads'
  cacheUrl.search = `?channels=${encodeURIComponent(sorted.join(','))}`

  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' })
  const cache = caches.default

  const now = Date.now()
  const cached = await cache.match(cacheKey)
  if (cached) {
    try {
      const cachedEntry = (await cached.json()) as YoutubeUploadsCacheEntry
      if (now - cachedEntry.timestamp < UPLOAD_TTL_SECONDS * 1000) {
        return cachedEntry.data
      }
    } catch {
      // corrupted cache; ignore and refetch
    }
  }

  const results = await getLatestVideosForChannels(sorted)

  const entry: YoutubeUploadsCacheEntry = {
    timestamp: now,
    data: results,
  }

  const cacheResp = new Response(JSON.stringify(entry), {
    headers: {
      'Content-Type': 'application/json',
    },
  })

  ctx.waitUntil(cache.put(cacheKey, cacheResp.clone()))

  return results
}

// ---------- Worker entry ----------

type LiveErrors = {
  twitch?: string
  youtube?: string
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const rando = crypto.randomUUID()
    await env.KV.put(rando, 'hehe')
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return handleOptions(request)
    }

    if (!VALID_PATHS.includes(url.pathname)) {
      return withCors(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
      })
    }

    try {
      if (url.pathname === '/twitch/live') {
        const logins = parseTwitchLogins(url)
        if (!logins.length) {
          return withCors(JSON.stringify({ error: 'No Twitch logins provided' }), {
            status: 400,
          })
        }

        const twitch = await fetchTwitchData(logins, env)
        return withCors(JSON.stringify({ twitch }))
      }

      if (url.pathname === '/youtube/live') {
        const channels = parseYoutubeChannels(url)
        if (!channels.length) {
          return withCors(JSON.stringify({ error: 'No YouTube channels provided' }), {
            status: 400,
          })
        }

        const youtube = await fetchYoutubeDataWithCache(channels, env, ctx, url)
        return withCors(JSON.stringify({ youtube }))
      }

      if (url.pathname === '/youtube/uploads') {
        const channels = parseYoutubeChannels(url)
        if (!channels.length) {
          return withCors(JSON.stringify({ error: 'No YouTube channels provided' }), {
            status: 400,
          })
        }

        const uploads = await fetchYoutubeUploadsWithCache(channels, ctx, url)
        return withCors(JSON.stringify({ uploads }), { status: 200 })
      }

      // Combined endpoint: /live?twitch=...&youtube=...
      if (url.pathname === '/live') {
        const logins = parseTwitchLogins(url)
        const channels = parseYoutubeChannels(url)

        if (!logins.length && !channels.length) {
          return withCors(
            JSON.stringify({
              error: 'No Twitch logins or YouTube channels provided',
            }),
            { status: 400 },
          )
        }

        let twitch: TwitchResult[] | null = null
        let youtube: YoutubeChannelResult[] | null = null
        const errors: LiveErrors = {}

        if (logins.length) {
          try {
            twitch = await fetchTwitchData(logins, env)
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            errors.twitch = msg
            twitch = null
          }
        }

        if (channels.length) {
          try {
            youtube = await fetchYoutubeDataWithCache(channels, env, ctx, url)
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            errors.youtube = msg
            youtube = null
          }
        }

        const bothFailed =
          logins.length > 0 && twitch === null && channels.length > 0 && youtube === null

        if (bothFailed) {
          return withCors(
            JSON.stringify({
              error: 'Upstream error',
              details: errors,
            }),
            { status: 502 },
          )
        }

        const payload: {
          twitch: TwitchResult[] | null
          youtube: YoutubeChannelResult[] | null
          errors?: LiveErrors
        } = { twitch, youtube }

        if (errors.twitch || errors.youtube) {
          payload.errors = errors
        }

        return withCors(JSON.stringify(payload), { status: 200 })
      }

      // Should be unreachable because of VALID_PATHS
      return withCors(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return withCors(
        JSON.stringify({
          error: 'Upstream error',
          message,
        }),
        { status: 502 },
      )
    }
  },
}
