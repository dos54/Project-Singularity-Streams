/**
 * Parses YouTube channel IDs from the URL query.
 * Supports ?youtube=UC...,UC... and ?channels=...
 */
export function parseYoutubeChannels(url: URL): string[] {
  const raw = url.searchParams.get('youtube') ?? url.searchParams.get('channels') ?? ''
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}
