export function isPsTwitchStream(twitchStreamTitle: string): boolean {
  const normalizedTitle = twitchStreamTitle.trim().toLowerCase()
  if (normalizedTitle.includes('project singularity')) {
    return true
  }

  return /(^|[^a-z0-9])ps([^a-z0-9]|$)/i.test(normalizedTitle)
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)

  type Unit = Intl.RelativeTimeFormatUnit
  const units: readonly [Unit, number][] = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
    ['second', 1]
  ]

  for (const [unit, unitSeconds] of units) {
    const value = Math.floor(seconds / unitSeconds)
    if (value >= 1) return rtf.format(-value, unit)
  }

  return 'just now'
}
