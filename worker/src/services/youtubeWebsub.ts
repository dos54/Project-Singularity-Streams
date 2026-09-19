import { XMLParser, XMLValidator } from 'fast-xml-parser'
import type { Env } from '../env'
import { XML_PARSER_CONFIG } from '../env'
import { enqueueNotices, type VideoNotice } from './youtubeInbox'
import { fetchUpstream, failureReason, UpstreamError } from '../utils/upstream'

export const HUB_URL = 'https://pubsubhubbub.appspot.com/subscribe'
export const MAX_NOTIFICATION_BYTES = 128 * 1024
export const topicFor = (channel: string) => `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channel)}`

export interface Subscription {
  ChannelId: string; CallbackId: string; PendingUntil: number; LeaseExpiresAt: number;
  RenewAt: number; ReconcileAt: number
}

export function callbackBase(env: Env): string {
  const url = new URL(env.YOUTUBE_CALLBACK_URL ?? '')
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/youtube/webhook') {
    throw new Error('YOUTUBE_CALLBACK_URL must be an HTTPS URL ending in /youtube/webhook')
  }
  const length = new TextEncoder().encode(env.YOUTUBE_WEBHOOK_SECRET ?? '').length
  if (length < 32 || length >= 200) throw new Error('YOUTUBE_WEBHOOK_SECRET must contain 32–199 bytes')
  return url.toString()
}

export async function verifySignature(body: Uint8Array, signature: string | null, secret: string): Promise<boolean> {
  const match = /^(sha1|sha256)=([0-9a-f]+)$/i.exec(signature ?? '')
  if (!match || match[2]!.length !== (match[1]!.toLowerCase() === 'sha1' ? 40 : 64)) return false
  const bytes = Uint8Array.from(match[2]!.match(/../g)!, value => Number.parseInt(value, 16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: match[1]!.toLowerCase() === 'sha1' ? 'SHA-1' : 'SHA-256' }, false, ['verify'])
  return crypto.subtle.verify('HMAC', key, bytes, new Uint8Array(body))
}

async function boundedBody(req: Request): Promise<Uint8Array | null> {
  if (Number(req.headers.get('Content-Length')) > MAX_NOTIFICATION_BYTES) return null
  const reader = req.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.byteLength
      if (size > MAX_NOTIFICATION_BYTES) { await reader.cancel(); return null }
      chunks.push(result.value)
    }
  } finally { reader.releaseLock() }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length }
  return body
}

export function parseNotices(xml: string, channel: string): VideoNotice[] {
  if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('Invalid XML')
  const parsed = new XMLParser(XML_PARSER_CONFIG).parse(xml)
  if (!parsed?.feed || typeof parsed.feed !== 'object') throw new Error('Missing feed')
  const entries = parsed.feed.entry ? (Array.isArray(parsed.feed.entry) ? parsed.feed.entry : [parsed.feed.entry]) : []
  const deleted = parsed.feed['at:deleted-entry'] ? (Array.isArray(parsed.feed['at:deleted-entry']) ? parsed.feed['at:deleted-entry'] : [parsed.feed['at:deleted-entry']]) : []
  if (entries.length + deleted.length > 50) throw new Error('Too many entries')
  const notices: VideoNotice[] = []
  for (const entry of entries) {
    const id = entry['yt:videoId']
    const updatedAt = Date.parse(entry.updated ?? entry.published)
    if (entry['yt:channelId'] !== channel || typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id) || !Number.isFinite(updatedAt)) throw new Error('Invalid entry')
    notices.push({ videoId: id, channelId: channel, updatedAt })
  }
  for (const entry of deleted) {
    const id = String(entry['@_ref'] ?? '').replace(/^yt:video:/, '')
    const updatedAt = Date.parse(entry['@_when'])
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id) || !Number.isFinite(updatedAt)) throw new Error('Invalid deleted entry')
    notices.push({ videoId: id, channelId: channel, updatedAt })
  }
  return notices
}

export async function handleYoutubeWebhook(req: Request, env: Env, callbackId: string): Promise<Response> {
  const respond = (body: string | null, status: number) => new Response(body, { status, headers: { 'Cache-Control': 'no-store' } })
  if (env.YOUTUBE_PUSH_ENABLED !== 'true') return respond('Not found', 404)
  try { callbackBase(env) } catch { return respond('Webhook not configured', 503) }
  if (req.method !== 'GET' && req.method !== 'POST') return respond('Method not allowed', 405)
  const sub = await env.DB.prepare(`SELECT s.* FROM YoutubeSubscriptions s
    JOIN Members m ON m.YoutubeId=s.ChannelId WHERE s.CallbackId=?`).bind(callbackId).first<Subscription>()
  if (!sub) return respond('Not found', 404)
  const now = Date.now()
  if (req.method === 'GET') {
    const params = new URL(req.url).searchParams
    const challenge = params.get('hub.challenge')
    const lease = Number(params.get('hub.lease_seconds'))
    if (params.get('hub.mode') !== 'subscribe' || params.get('hub.topic') !== topicFor(sub.ChannelId) || sub.PendingUntil < now ||
        !challenge || challenge.length > 1024 || !Number.isInteger(lease) || lease <= 0 || lease > 90 * 86400) return respond('Invalid verification', 404)
    await env.DB.prepare(`UPDATE YoutubeSubscriptions SET PendingUntil=0,LeaseExpiresAt=?,RenewAt=?,LastError=NULL,SubscriptionError=NULL WHERE CallbackId=? AND PendingUntil>=?`)
      .bind(now + lease * 1000, now + Math.floor(lease * 800), callbackId, now).run()
    return respond(challenge, 200)
  }
  if (sub.LeaseExpiresAt < now) return respond('Subscription expired', 404)
  const body = await boundedBody(req)
  if (!body) return respond('Payload too large', 413)
  // PubSubHubbub 0.4 specifies acknowledging but discarding invalid signatures.
  if (!await verifySignature(body, req.headers.get('X-Hub-Signature'), env.YOUTUBE_WEBHOOK_SECRET!)) return respond(null, 204)
  let notices: VideoNotice[]
  try { notices = parseNotices(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(body), sub.ChannelId) }
  catch { return respond('Invalid notification', 400) }
  await enqueueNotices(env, notices, now)
  await env.DB.prepare('UPDATE YoutubeSubscriptions SET LastDeliveryAt=? WHERE CallbackId=?').bind(now, callbackId).run()
  // Success is returned only after work is durable. The next cron processes it.
  return respond(null, 204)
}

export async function renewSubscriptions(env: Env, now = Date.now()) {
  const base = callbackBase(env)
  const { results: subs } = await env.DB.prepare(`SELECT s.* FROM YoutubeSubscriptions s JOIN Members m ON m.YoutubeId=s.ChannelId
    WHERE s.RenewAt<=? ORDER BY s.RenewAt,s.ChannelId LIMIT 2`).bind(now).all<Subscription>()
  for (const sub of subs) {
    // Commit intent BEFORE asking the hub: it may verify before POST returns.
    await env.DB.prepare('UPDATE YoutubeSubscriptions SET PendingUntil=?,RenewAt=? WHERE ChannelId=?')
      .bind(now + 10 * 60_000, now + 15 * 60_000, sub.ChannelId).run()
    try {
      const result = await fetchUpstream(HUB_URL, { method: 'POST',
        body: new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify': 'async', 'hub.topic': topicFor(sub.ChannelId),
          'hub.callback': `${base}/${sub.CallbackId}`, 'hub.secret': env.YOUTUBE_WEBHOOK_SECRET!, 'hub.lease_seconds': String(86400 * 5) }) })
      await result.body?.cancel()
      if (result.status !== 202 && result.status !== 204) throw new UpstreamError(`unexpected-http-${result.status}`)
    } catch (error) {
      const reason = `subscription-${failureReason(error)}`
      console.warn(JSON.stringify({ operation: 'youtube-subscribe', channelId: sub.ChannelId, reason }))
      await env.DB.prepare('UPDATE YoutubeSubscriptions SET LastError=?,SubscriptionError=? WHERE ChannelId=?').bind(reason, reason, sub.ChannelId).run()
    }
  }
}
