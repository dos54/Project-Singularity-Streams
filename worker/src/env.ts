/**
 * Cloudflare Worker environment bindings.
 */
export interface Env {
  TWITCH_CLIENT_ID: string
  TWITCH_CLIENT_SECRET: string
  YOUTUBE_API_KEY: string
  KV: KVNamespace
}

/**
 * TTL (seconds) for YouTube live status (Data API) cache stored in the edge cache.
 */
export const YOUTUBE_TTL = 120

/**
 * TTL (seconds) for latest uploads cached in KV or cache.
 */
export const UPLOAD_TTL_SECONDS = 300

/**
 * TTL (seconds) for the combined, sorted uploads list stored in KV.
 */
export const SORTED_UPLOADS_TTL = 300

/**
 * Valid public HTTP paths for this worker.
 */
export const VALID_PATHS = ['/live', '/twitch/live', '/youtube/live', '/youtube/uploads'] as const

export const YOUTUBE_VIDEO_LIST_KEY = 'yt:videos'
export const YOUTUBE_STREAMS_LIST_KEY = 'yt:streams'
export const LIVE_RECHECK_SECONDS = 60
export const NON_LIVE_RECHECK_SECONDS = 300

/**
 * Shared configuration for fast-xml-parser, including attribute handling.
 */
export const XML_PARSER_CONFIG = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
} as const
