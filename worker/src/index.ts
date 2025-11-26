// src/index.ts

import type { Env } from './env'
import { VALID_PATHS, YOUTUBE_TTL, UPLOAD_TTL_SECONDS } from './env'
import { withCors, handleOptions, buildSWRCacheControl } from './http'
import { parseTwitchLogins, fetchTwitchData, type TwitchResult } from './twitch'
import { parseYoutubeChannels } from './youtubeCommon'
import {
  getCachedVideoList,
  annotateUploadsWithLiveStatus,
  type YoutubeFeedEntry,
  buildAndCacheVideoList,
} from './youtubeUploads'

/**
 * Error structure for combined /live endpoint.
 */
type LiveErrors = {
  twitch?: string
  youtube?: string
}

const TWITCH_CACHE_SECONDS = 20

/**
 * Cloudflare Worker entry point and router.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const now = Date.now()
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return handleOptions(request)
    }

    if (!VALID_PATHS.includes(url.pathname as (typeof VALID_PATHS)[number])) {
      return withCors(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
      })
    }

    try {
      // /twitch/live
      if (url.pathname === '/twitch/live') {
        const logins = parseTwitchLogins(url)
        if (!logins.length) {
          return withCors(JSON.stringify({ error: 'No Twitch logins provided' }), {
            status: 400,
          })
        }

        const twitch = await fetchTwitchData(logins, env)
        return withCors(JSON.stringify({ twitch }), {
          headers: {
            'Cache-Control': buildSWRCacheControl(TWITCH_CACHE_SECONDS, TWITCH_CACHE_SECONDS),
          },
        })
      }

      // /youtube/live
      if (url.pathname === '/youtube/live') {
        const channels = parseYoutubeChannels(url)
        if (!channels.length) {
          return withCors(JSON.stringify({ error: 'No YouTube channels provided' }), {
            status: 400,
          })
        }

        const { videos: uploads, isStale } = await getCachedVideoList(env, channels, now)
        const uploadsWithLive = await annotateUploadsWithLiveStatus(uploads, env)
        const liveOnYoutube = uploadsWithLive.filter((upload) => upload.liveStatus?.state === 'live')

        return withCors(JSON.stringify({ liveOnYoutube, stale: isStale }), {
          headers: {
            'Cache-Control': buildSWRCacheControl(YOUTUBE_TTL, YOUTUBE_TTL),
          },
        })
      }


      // /youtube/uploads
      if (url.pathname === '/youtube/uploads') {
        const channels = parseYoutubeChannels(url)
        if (!channels.length) {
          return withCors(JSON.stringify({ error: 'No YouTube channels provided' }), {
            status: 400,
          })
        }

        const forceFresh = request.headers.get('X-Force-Revalidate') === 'true'
        console.log('Force Refresh:', forceFresh)

        let uploads: YoutubeFeedEntry[]
        let isStale: boolean

        if (forceFresh) {
          uploads = await buildAndCacheVideoList(env, channels, now)
          isStale = false
        } else {
          const cached = await getCachedVideoList(env, channels, now)
          uploads = cached.videos
          isStale = cached.isStale
        }

        const uploadsWithLive = await annotateUploadsWithLiveStatus(uploads.slice(0, 20), env)
        const nonLive = uploadsWithLive.filter(u => u.liveStatus?.state !== 'live')

        return withCors(JSON.stringify({ uploads: nonLive, isStale }), {
          status: 200,
          headers: {
            'Cache-Control': buildSWRCacheControl(UPLOAD_TTL_SECONDS, UPLOAD_TTL_SECONDS),
          },
        })
      }

      // Combined endpoint: /live?twitch=...&youtube=...
      if (url.pathname === '/live') {
        const logins = parseTwitchLogins(url)
        const channels = parseYoutubeChannels(url)
        const forceFresh = request.headers.get('X-Force-Revalidate') === 'true'

        if (!logins.length && !channels.length) {
          return withCors(
            JSON.stringify({
              error: 'No Twitch logins or YouTube channels provided',
            }),
            { status: 400 },
          )
        }

        let twitch: TwitchResult[] | null = null
        let youtube: YoutubeFeedEntry[] | null = null
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

        // Youtube branch
        if (channels.length) {
          try {
            let videos: YoutubeFeedEntry[]
            if (forceFresh) {
              videos = await buildAndCacheVideoList(env, channels, now)
            } else {
              const { videos: cachedVideos } = await getCachedVideoList(env, channels, now)
              videos = cachedVideos
            }

            const uploadsWithLive = await annotateUploadsWithLiveStatus(videos, env)
            const youtubeLive = uploadsWithLive.filter(
              (upload) => upload.liveStatus?.state === 'live'
            )

            youtube = youtubeLive
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
          youtube: YoutubeFeedEntry[] | null
          errors?: LiveErrors
        } = { twitch, youtube }

        if (errors.twitch || errors.youtube) {
          payload.errors = errors
        }

        return withCors(JSON.stringify(payload), {
          status: 200,
          headers: {
            'Cache-Control': buildSWRCacheControl(TWITCH_CACHE_SECONDS, TWITCH_CACHE_SECONDS),
          },
        })
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
