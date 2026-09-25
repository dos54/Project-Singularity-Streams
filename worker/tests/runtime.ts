import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, Response, Log, LogLevel } from 'miniflare'
import { feed, testBindings } from './fixtures'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
let bundle: Promise<string> | undefined

function workerBundle(): Promise<string> {
  return (bundle ??= build({
    absWorkingDir: projectRoot,
    entryPoints: ['worker/src/index.ts'],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
  }).then((result) => result.outputFiles[0]!.text))
}

export const webhookSecret = 'test-only-webhook-secret-with-32-bytes'

export async function createRuntime(options: { push?: boolean; fallback?: boolean; disabled?: boolean; missingTwitchSecret?: boolean } = {}) {
  const upstream = {
    entriesPerChannel: 1,
    title: 'Project Singularity',
    phase: 'video' as 'video' | 'upcoming' | 'live' | 'ended',
    failedChannels: new Set<string>(),
    youtubeStatus: 200,
    youtubeBody: undefined as unknown,
    playlistStatus: 200,
    malformedPlaylist: false,
    omittedIds: new Set<string>(),
    channelOverride: null as string | null,
    onYoutube: undefined as (() => Promise<void>) | undefined,
    subscriptions: [] as URLSearchParams[],
    hubStatus: 202,
    twitchStatuses: [] as number[],
    invalidTwitch: false,
    vodPages: [{ data: [], pagination: {} }] as unknown[],
    vodStatus: 200,
    vodCalls: 0,
    calls: { atom: 0, youtube: 0, twitch: 0, token: 0, channels: 0, playlists: 0 },
    unexpected: [] as string[],
  }
  const mf = new Miniflare({
    script: await workerBundle(),
    modules: true,
    compatibilityDate: '2025-11-10',
    host: '127.0.0.1',
    cf: false,
    // Never read wrangler.jsonc, .env files, credentials, or persisted production bindings.
    d1Databases: ['DB'],
    kvNamespaces: ['KV'],
    bindings: { ...testBindings, YOUTUBE_PUSH_ENABLED: String(options.push ?? false),
      TWITCH_CLIENT_SECRET: options.missingTwitchSecret ? '' : testBindings.TWITCH_CLIENT_SECRET,
      YOUTUBE_FALLBACK_ENABLED: String(options.fallback ?? false),
      SERVICE_DISABLED: String(options.disabled ?? false),
      YOUTUBE_CALLBACK_URL: 'https://worker.test.invalid/youtube/webhook', YOUTUBE_WEBHOOK_SECRET: webhookSecret },
    log: new Log(LogLevel.NONE),
    outboundService: async (request) => {
      const url = new URL(request.url)
      if (url.origin === testBindings.YT_API_BASE && url.pathname === '/youtube/v3/channels') {
        upstream.calls.channels++
        const id = url.searchParams.get('id')!
        return Response.json({ items: [{ id, contentDetails: { relatedPlaylists: { uploads: `uploads-${id}` } } }] })
      }
      if (url.origin === testBindings.YT_API_BASE && url.pathname === '/youtube/v3/playlistItems') {
        upstream.calls.playlists++
        if (upstream.playlistStatus !== 200) return new Response('Unavailable', { status: upstream.playlistStatus })
        if (upstream.malformedPlaylist) return Response.json({ error: 'not a playlist' })
        const channel = url.searchParams.get('playlistId')!.replace(/^uploads-/, '')
        return Response.json({ items: Array.from({ length: upstream.entriesPerChannel }, (_, i) => ({
          contentDetails: { videoId: `${channel}-${i}` },
        })) })
      }
      if (url.origin === 'https://pubsubhubbub.appspot.com' && url.pathname === '/subscribe') {
        upstream.subscriptions.push(new URLSearchParams(await request.text()))
        return new Response(null, { status: upstream.hubStatus })
      }
      if (url.origin === testBindings.ATOM_FEED_BASE && url.pathname === '/feeds/videos.xml') {
        upstream.calls.atom++
        const channel = url.searchParams.get('channel_id')!
        if (upstream.failedChannels.has(channel))
          return new Response('Unavailable', { status: 503 })
        return new Response(feed(channel, upstream.entriesPerChannel, upstream.title))
      }
      if (url.origin === testBindings.YT_API_BASE && url.pathname === '/youtube/v3/videos') {
        upstream.calls.youtube++
        await upstream.onYoutube?.()
        if (upstream.youtubeStatus !== 200)
          return new Response('Unavailable', { status: upstream.youtubeStatus })
        if (upstream.youtubeBody !== undefined) return Response.json(upstream.youtubeBody)
        const details =
          upstream.phase === 'video'
            ? undefined
            : upstream.phase === 'upcoming'
              ? { scheduledStartTime: '2026-12-01T00:00:00Z' }
              : {
                  actualStartTime: '2026-01-01T00:00:00Z',
                  ...(upstream.phase === 'ended'
                    ? { actualEndTime: '2026-01-01T01:00:00Z' }
                    : { concurrentViewers: '10', activeLiveChatId: 'chat' }),
                }
        return Response.json({
          items: url.searchParams
            .get('id')!
            .split(',')
            .filter(id => !upstream.omittedIds.has(id))
            .map((id) => ({ id, liveStreamingDetails: details, snippet: {
              channelId: upstream.channelOverride ?? id.slice(0, id.lastIndexOf('-')),
              title: upstream.title, description: 'Authoritative description', publishedAt: '2026-01-01T00:00:00Z',
              thumbnails: { high: { url: 'https://example.invalid/image.jpg', width: 480, height: 360 } },
            } })),
        })
      }
      if (url.origin === 'https://id.twitch.tv' && url.pathname === '/oauth2/token') {
        upstream.calls.token++
        return Response.json({ access_token: 'test-token', expires_in: 3600 })
      }
      if (url.origin === testBindings.TWITCH_API_BASE && url.pathname === '/helix/streams') {
        upstream.calls.twitch++
        const status = upstream.twitchStatuses.shift() ?? 200
        if (status !== 200) return new Response('Failure', { status })
        if (upstream.invalidTwitch) return Response.json({ error: 'broken response' })
        return Response.json({
          data: [
            {
              id: 'live-stream',
              user_login: 'DUCKEDGTNH',
              thumbnail_url: 'https://static-cdn.jtvnw.net/previews-ttv/live_user_duckedgtnh-{width}x{height}.jpg',
              title: 'Project Singularity',
              game_name: 'Minecraft',
              viewer_count: 10,
            },
          ],
        })
      }
      if (url.origin === testBindings.TWITCH_API_BASE && url.pathname === '/helix/users') {
        return Response.json({ data: url.searchParams.getAll('login').map(login => ({ login, id: `id-${login}` })) })
      }
      if (url.origin === testBindings.TWITCH_API_BASE && url.pathname === '/helix/videos') {
        upstream.vodCalls++
        if (upstream.vodStatus !== 200) return new Response('Unavailable', { status: upstream.vodStatus })
        const page = Number(url.searchParams.get('after') ?? 0)
        return Response.json(upstream.vodPages[page] ?? { data: [], pagination: {} })
      }
      upstream.unexpected.push(`${request.method} ${url.origin}${url.pathname}`)
      throw new Error('Unexpected outbound request blocked by test runtime')
    },
  })
  try {
    const db = await mf.getD1Database('DB')
    const migrations = new URL('../migrations/', import.meta.url)
    for (const name of (await readdir(migrations)).filter((name) => name.endsWith('.sql')).sort()) {
      // Current migrations contain simple statements, no triggers or semicolons in literals.
      const sql = (await readFile(new URL(name, migrations), 'utf8')).replace(/^--.*$/gm, '')
      const statements = sql
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
      if (statements.length) await db.batch(statements.map((s) => db.prepare(s)))
    }
    return {
      mf,
      db,
      upstream,
      async sync() {
        const worker = await mf.getWorker()
        const result = await worker.scheduled({ cron: '*/2 * * * *' })
        if (result.outcome !== 'ok') throw new Error(`Scheduled sync failed: ${result.outcome}`)
      },
      async count(table: 'Videos' | 'VideoLiveStatus' | 'Members' | 'YoutubeInbox' | 'YoutubeSubscriptions') {
        const row = await db
          .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
          .first<{ count: number }>()
        return row!.count
      },
    }
  } catch (error) {
    await mf.dispose()
    throw error
  }
}
