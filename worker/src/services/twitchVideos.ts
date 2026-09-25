import type { Env } from '../env'
import { getAllTwitchMembers } from '../db/members'
import { twitchRequest } from './twitchService'
import { failureReason } from '../utils/upstream'

const KEY = 'twitch-vods:v1'
const INTERVAL = 2 * 60 * 60_000
export interface TwitchVideo {
  platform: 'twitch'
  videoId: string
  memberId: number
  title: string
  description: string
  publishedAt: string
  thumbnailUrl: string
  isProjectSingularity: boolean
  state: 'ended'
}
interface ChannelSnapshot {
  checkedAt: number
  videos: TwitchVideo[]
}
interface Snapshot {
  nextCheckAt: number
  channels: Record<string, ChannelSnapshot>
  failed: boolean
}
type RecordValue = Record<string, unknown>
const record = (v: unknown): v is RecordValue => !!v && typeof v === 'object' && !Array.isArray(v)
async function helix(env: Env, path: string, params: URLSearchParams) {
  const url = new URL(`/helix/${path}`, env.TWITCH_API_BASE)
  url.search = params.toString()
  const body: unknown = await (await twitchRequest(env, url)).json()
  if (!record(body) || !Array.isArray(body.data) || !body.data.every(record))
    throw new Error('Invalid Twitch data')
  return { data: body.data as RecordValue[], pagination: body.pagination }
}

/** Visitors read this snapshot only; upstream work belongs to the scheduled handler. */
export async function readTwitchVideos(env: Env, now = Date.now()) {
  const snapshot = await env.KV.get<Snapshot>(KEY, 'json')
  const channels = Object.values(snapshot?.channels ?? {})
  return {
    videos: channels.filter((c) => now - c.checkedAt < 6 * 60 * 60_000).flatMap((c) => c.videos),
    checkedAt: channels.length ? Math.min(...channels.map((c) => c.checkedAt)) : null,
    stale: !snapshot || snapshot.failed || now > snapshot.nextCheckAt + 5 * 60_000,
  }
}

export async function maintainTwitchVideos(env: Env, now = Date.now()) {
  const previous = await env.KV.get<Snapshot>(KEY, 'json')
  if (previous && previous.nextCheckAt > now) return
  const token = crypto.randomUUID()
  const lease = await env.DB.prepare(
    `INSERT INTO WorkerLeases(Name,Token,ExpiresAt) VALUES ('twitch-vods',?,?)
    ON CONFLICT(Name) DO UPDATE SET Token=excluded.Token,ExpiresAt=excluded.ExpiresAt
    WHERE WorkerLeases.ExpiresAt<=? RETURNING Token`,
  )
    .bind(token, now + 10 * 60_000, now)
    .first()
  if (!lease) return
  const snapshot: Snapshot = {
    nextCheckAt: now + INTERVAL,
    channels: { ...previous?.channels },
    failed: false,
  }
  try {
    const members = (await getAllTwitchMembers(env)).filter((m) => m.Twitch?.trim())
    if (members.length > 20) throw new Error('Twitch VOD roster exceeds bounded sweep')
    const logins = new Set(members.map((m) => m.Twitch!.trim().toLowerCase()))
    for (const login of Object.keys(snapshot.channels))
      if (!logins.has(login)) delete snapshot.channels[login]
    if (logins.size) {
      const users = await helix(
        env,
        'users',
        new URLSearchParams([...logins].map((login): [string, string] => ['login', login])),
      )
      if (users.data.some((u) => typeof u.id !== 'string' || typeof u.login !== 'string'))
        throw new Error('Invalid Twitch users')
      const streamParams = new URLSearchParams({ first: '100' })
      for (const user of users.data) streamParams.append('user_id', user.id as string)
      const live = users.data.length ? await helix(env, 'streams', streamParams) : { data: [] }
      if (live.data.some((s) => typeof s.id !== 'string'))
        throw new Error('Invalid Twitch stream IDs')
      const liveIds = new Set(live.data.map((s) => s.id))
      for (const member of members) {
        const login = member.Twitch!.trim().toLowerCase()
        try {
          const user = users.data.find((u) => (u.login as string).toLowerCase() === login)
          const videos: TwitchVideo[] = []
          if (user) {
            let cursor = ''
            const seen = new Set<string>()
            for (let page = 0; page < 5; page++) {
              const params = new URLSearchParams({
                user_id: user.id as string,
                type: 'archive',
                first: '100',
              })
              if (cursor) params.set('after', cursor)
              const result = await helix(env, 'videos', params)
              for (const v of result.data) {
                if (
                  typeof v.id !== 'string' ||
                  !/^\d+$/.test(v.id) ||
                  v.user_id !== user.id ||
                  typeof v.title !== 'string' ||
                  typeof v.description !== 'string' ||
                  typeof v.published_at !== 'string' ||
                  !Number.isFinite(Date.parse(v.published_at)) ||
                  typeof v.thumbnail_url !== 'string' ||
                  v.type !== 'archive'
                )
                  throw new Error('Invalid Twitch video')
                if (liveIds.has(v.stream_id)) continue
                videos.push({
                  platform: 'twitch',
                  videoId: `twitch:${v.id}`,
                  memberId: member.MemberId,
                  title: v.title,
                  description: v.description,
                  publishedAt: new Date(v.published_at).toISOString(),
                  thumbnailUrl: v.thumbnail_url
                    .replaceAll('%{width}', '320')
                    .replaceAll('%{height}', '180'),
                  isProjectSingularity: [v.title, v.description].some(
                    (text) =>
                      text.toLowerCase().includes('project') &&
                      text.toLowerCase().includes('singularity'),
                  ),
                  state: 'ended',
                })
              }
              if (!record(result.pagination)) throw new Error('Invalid Twitch pagination')
              const next = result.pagination.cursor
              if (next === undefined || next === '') break
              if (typeof next !== 'string' || seen.has(next) || page === 4)
                throw new Error('Incomplete Twitch archive')
              seen.add(next)
              cursor = next
            }
          }
          // Replace only after every page succeeds; absence then means unavailable, not an outage.
          snapshot.channels[login] = {
            checkedAt: now,
            videos: [...new Map(videos.map((v) => [v.videoId, v])).values()],
          }
        } catch (error) {
          snapshot.failed = true
          console.warn(
            JSON.stringify({ operation: 'twitch-vods', login, reason: failureReason(error) }),
          )
        }
      }
    }
  } catch (error) {
    snapshot.failed = true
    console.warn(JSON.stringify({ operation: 'twitch-vods', reason: failureReason(error) }))
  } finally {
    try {
      await env.KV.put(KEY, JSON.stringify(snapshot))
    } finally {
      await env.DB.prepare("DELETE FROM WorkerLeases WHERE Name='twitch-vods' AND Token=?")
        .bind(token)
        .run()
    }
  }
}
