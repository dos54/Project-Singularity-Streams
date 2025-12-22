import { getAllTwitchMembers } from '../db/members'
import type { Env } from '../env'

/**
 * Normalized Twitch stream information returned by this worker.
 */
export type TwitchResult = {
  login: string
  isLive: boolean
  title: string | null
  gameName: string | null
  viewerCount: number | null
}

/**
 * Raw Twitch API stream object.
 */
type TwitchAPIStream = {
  user_login: string
  title?: string
  game_name?: string
  viewer_count?: number
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

/**
 * Obtain (and cache) a Twitch app access token using client credentials.
 */
async function getAppToken(env: Env): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken

  const resp = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID,
      client_secret: /*env.TWITCH_CLIENT_SECRET*/ 'cv1qsa5c4tsykhqprogx6z096ovixh',
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
  const logins = twitchUsers.map(u => u.Twitch).filter((t): t is string => t !== null)
  const token = await getAppToken(env)
  const qs = logins.map((l) => `user_login=${encodeURIComponent(l)}`).join('&')

  const twitchResp = await fetch(`${env.TWITCH_API_BASE}/helix/streams?${qs}`, {
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
