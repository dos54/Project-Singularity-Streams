export interface Env {
  TWITCH_CLIENT_ID: string
  TWITCH_CLIENT_SECRET: string
  YOUTUBE_API_KEY: string
}

const YOUTUBE_TTL = 300 // seconds

const VALID_PATHS = ['/live', '/twitch/live', '/youtube/live']

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
  const json = await resp.json()
  cachedToken = json.access_token
  tokenExpiresAt = Date.now() + json.expires_in * 1000
  return cachedToken!
}

// ---------- Twitch ----------

type TwitchResult = {
  login: string
  isLive: boolean
  title: string | null
  gameName: string | null
  viewerCount: number | null
}

function parseTwitchLogins(url: URL): string[] {
  // Support both ?twitch= and legacy ?logins=
  const raw = url.searchParams.get('twitch') ?? url.searchParams.get('logins') ?? ''
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
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

  const body = await twitchResp.json()
  const liveMap = new Map<string, any>()
  for (const s of body.data ?? []) {
    liveMap.set(String(s.user_login).toLowerCase(), s)
  }

  return logins.map((login) => {
    const stream = liveMap.get(login.toLowerCase())
    return {
      login,
      isLive: !!stream,
      title: stream?.title ?? null,
      gameName: stream?.game_name ?? null,
      viewerCount: stream?.viewer_count ?? null,
    }
  })
}

// ---------- YouTube ----------

type YoutubeVideoInfo = {
  videoId: string
  title: string | null
  publishedAt: string | null
  thumbnailUrl: string | null
}

type YoutubeChannelResult = {
  channelId: string
  latestVideo: YoutubeVideoInfo | null
  live: {
    isLive: boolean
    videoId: string | null
    title: string | null
    thumbnailUrl: string | null
  }
}

function parseYoutubeChannels(url: URL): string[] {
  // Support ?youtube=UC...,UC... and ?channels=...
  const raw = url.searchParams.get('youtube') ?? url.searchParams.get('channels') ?? ''
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function buildThumbnail(snippet: any): string | null {
  const thumbs = snippet?.thumbnails ?? {}
  return thumbs.medium?.url ?? thumbs.default?.url ?? thumbs.high?.url ?? null
}

async function fetchYoutubeForChannel(
  channelId: string,
  apiKey: string,
): Promise<YoutubeChannelResult> {
  const base = 'https://www.googleapis.com/youtube/v3/search'

  // 1) Latest video (by date)
  const latestUrl = new URL(base)
  latestUrl.searchParams.set('part', 'snippet')
  latestUrl.searchParams.set('channelId', channelId)
  latestUrl.searchParams.set('maxResults', '1')
  latestUrl.searchParams.set('order', 'date')
  latestUrl.searchParams.set('type', 'video')
  latestUrl.searchParams.set('key', apiKey)

  // 2) Live video (if any)
  const liveUrl = new URL(base)
  liveUrl.searchParams.set('part', 'snippet')
  liveUrl.searchParams.set('channelId', channelId)
  liveUrl.searchParams.set('eventType', 'live')
  liveUrl.searchParams.set('type', 'video')
  liveUrl.searchParams.set('key', apiKey)

  const [latestRes, liveRes] = await Promise.all([
    fetch(latestUrl.toString()),
    fetch(liveUrl.toString()),
  ])

  if (!latestRes.ok || !liveRes.ok) {
    throw new Error(`YouTube error: latest=${latestRes.status}, live=${liveRes.status}`)
  }

  const latestJson: any = await latestRes.json()
  const liveJson: any = await liveRes.json()

  const latestItem = latestJson.items?.[0]
  const liveItem = liveJson.items?.[0]

  const latestVideo: YoutubeVideoInfo | null = latestItem
    ? {
        videoId: latestItem.id?.videoId ?? '',
        title: latestItem.snippet?.title ?? null,
        publishedAt: latestItem.snippet?.publishedAt ?? null,
        thumbnailUrl: buildThumbnail(latestItem.snippet),
      }
    : null

  const live = liveItem
    ? {
        isLive: true,
        videoId: liveItem.id?.videoId ?? null,
        title: liveItem.snippet?.title ?? null,
        thumbnailUrl: buildThumbnail(liveItem.snippet),
      }
    : {
        isLive: false,
        videoId: null,
        title: null,
        thumbnailUrl: null,
      }

  return { channelId, latestVideo, live }
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
  cacheUrl.pathname = '/__youtube_cache'
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

// ---------- Worker entry ----------

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
          return withCors(JSON.stringify({ error: 'No Twitch logins provided' }), { status: 400 })
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

        const [twitch, youtube] = await Promise.all([
          logins.length ? fetchTwitchData(logins, env) : Promise.resolve(null),
          channels.length
            ? fetchYoutubeDataWithCache(channels, env, ctx, url)
            : Promise.resolve(null),
        ])

        return withCors(JSON.stringify({ twitch, youtube }))
      }

      // Should be unreachable because of VALID_PATHS
      return withCors(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
      })
    } catch (err: any) {
      return withCors(
        JSON.stringify({
          error: 'Upstream error',
          message: String(err?.message ?? err),
        }),
        { status: 502 },
      )
    }
  },
}
