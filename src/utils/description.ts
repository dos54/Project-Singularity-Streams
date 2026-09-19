/** Link text without interpreting creator-provided HTML. Only web URLs become links. */
export function linkifyDescription(text: string): { text: string; href?: string }[] {
  const parts: { text: string; href?: string }[] = []
  let offset = 0
  for (const match of text.matchAll(/(?:https?:\/\/|www\.)[^\s<>"']+/gi)) {
    const start = match.index!
    let label = match[0].replace(/[.,!?;:]+$/, '')
    while (label.endsWith(')') && (label.match(/\)/g)?.length ?? 0) > (label.match(/\(/g)?.length ?? 0)) label = label.slice(0, -1)
    const href = label.startsWith('www.') ? `https://${label}` : label
    try {
      const url = new URL(href)
      if (!['http:', 'https:'].includes(url.protocol)) continue
      parts.push({ text: text.slice(offset, start) }, { text: label, href })
      offset = start + label.length
    } catch { /* Keep invalid URLs as ordinary text. */ }
  }
  parts.push({ text: text.slice(offset) })
  return parts
}
