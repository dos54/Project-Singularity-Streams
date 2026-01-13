export function isPsTwitchStream(twitchStreamTitle: string): boolean {
  const normalizedTitle = twitchStreamTitle.trim().toLowerCase()
  if (normalizedTitle.includes('project singularity')) {
    return true
  }

  return /(^|[^a-z0-9])ps([^a-z0-9]|$)/i.test(normalizedTitle)
}
