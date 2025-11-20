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
export const YOUTUBE_TTL = 300

/**
 * TTL (seconds) for latest uploads cached in KV or cache.
 */
export const UPLOAD_TTL_SECONDS = 60

/**
 * TTL (seconds) for the combined, sorted uploads list stored in KV.
 */
export const SORTED_UPLOADS_TTL = 60

/**
 * Valid public HTTP paths for this worker.
 */
export const VALID_PATHS = ['/live', '/twitch/live', '/youtube/live', '/youtube/uploads'] as const

/**
 * Shared configuration for fast-xml-parser, including attribute handling.
 */
export const XML_PARSER_CONFIG = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
} as const
