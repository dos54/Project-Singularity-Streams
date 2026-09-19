import { getAllTwitchMembers } from '../db/members'
import type { Env } from '../env'
import { fetchUpstream, UpstreamError } from '../utils/upstream'

/**
 * Normalized Twitch stream information returned by this worker.
 */
export type TwitchResult = {
  login: string
  isLive: boolean
  title: string | null
  gameName: string | null
  viewerCount: number | null
  thumbnailUrl: string | null
}

/**
 * Raw Twitch API stream object.
 */
type TwitchAPIStream = {
  user_login: string
  title?: string
  game_name?: string
  viewer_count?: number
  thumbnail_url?: string
}

/**
 * Raw Twitch API response for /helix/streams.
 */
type TwitchAPIResponse = {
  data?: TwitchAPIStream[]
}

// In-memory app token cache for Twitch (per-worker instance).
let cachedToken: string | null = null
let tokenExpiresAt = 0
let tokenClientId = ''
let tokenClientSecret = ''

/**
 * Obtain (and cache) a Twitch app access token using client credentials.
 */
async function getAppToken(env: Env): Promise<string> {
  if (!env.TWITCH_CLIENT_ID?.trim() || !env.TWITCH_CLIENT_SECRET?.trim()) {
    throw new UpstreamError('twitch-credentials-missing')
  }
  if (cachedToken && tokenClientId === env.TWITCH_CLIENT_ID && tokenClientSecret === env.TWITCH_CLIENT_SECRET &&
      Date.now() < tokenExpiresAt - 60_000) return cachedToken

  const resp = await fetchUpstream('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID,
      client_secret: env.TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  })

  const json = (await resp.json().catch(() => { throw new Error('Invalid Twitch token response') })) as {
    access_token: string
    expires_in: number
  }

  if (typeof json.access_token !== 'string' || !json.access_token ||
      !Number.isFinite(json.expires_in) || json.expires_in <= 0) throw new Error('Invalid Twitch token response')

  cachedToken = json.access_token
  tokenClientId = env.TWITCH_CLIENT_ID
  tokenClientSecret = env.TWITCH_CLIENT_SECRET
  tokenExpiresAt = Date.now() + json.expires_in * 1000
  return cachedToken!
}

/**
 * Parses Twitch logins from the URL query.
 * Supports both ?twitch=login1,login2 and legacy ?logins=...
 */
export function parseTwitchLogins(url: URL): string[] {
  const raw = url.searchParams.get('twitch') ?? url.searchParams.get('logins') ?? ''
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Fetches live stream data for the given Twitch logins and normalizes it.
 */
export async function fetchTwitchLivestreams(env: Env): Promise<TwitchResult[]> {
  const twitchUsers = await getAllTwitchMembers(env)
  const logins = [...new Set(twitchUsers.map(u => u.Twitch?.trim().toLowerCase()).filter((t): t is string => !!t))]
  if (!logins.length) return []
  // Current roster fits one request. Fail explicitly rather than silently truncate a larger roster.
  if (logins.length > 100) throw new Error('Twitch roster exceeds one request')
  const url = new URL('/helix/streams', env.TWITCH_API_BASE)
  url.searchParams.set('first', '100')
  for (const login of logins) url.searchParams.append('user_login', login)
  let token = await getAppToken(env)
  const request = () => fetchUpstream(url, { headers: {
    'Client-Id': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}`,
  } })
  let twitchResp: Response
  try { twitchResp = await request() }
  catch (error) {
    if (!(error instanceof UpstreamError) || error.reason !== 'http-401') throw error
    // App tokens cannot be refreshed; acquire a replacement once after rejection.
    if (cachedToken === token) { cachedToken = null; tokenExpiresAt = 0 }
    token = await getAppToken(env)
    twitchResp = await request()
  }
  const body = (await twitchResp.json().catch(() => { throw new Error('Invalid Twitch streams response') })) as TwitchAPIResponse
  if (!Array.isArray(body.data) || body.data.some(s => typeof s.user_login !== 'string')) {
    throw new Error('Invalid Twitch streams response')
  }
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
      thumbnailUrl: typeof stream?.thumbnail_url === 'string'
        ? stream.thumbnail_url.replaceAll('{width}', '640').replaceAll('{height}', '360') : null,
    }
  })
}
