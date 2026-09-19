import { nextTick, onMounted, onUnmounted } from 'vue'

// Keep an on-screen card steady during a refresh, without saving reading history.
export function useFeedAnchor() {
  let interaction = 0
  let disposed = false
  const interacted = () => {
    interaction++
  }
  const events = ['wheel', 'pointerdown', 'keydown', 'touchstart']
  async function keepPosition<T>(action: () => Promise<T>): Promise<T> {
    const cards = () => [...document.querySelectorAll<HTMLElement>('[data-video-id]')]
    const anchor = cards().find((node) => {
      const box = node.getBoundingClientRect()
      return box.bottom > 0 && box.top < window.innerHeight
    })
    const id = anchor?.dataset.videoId
    const offset = anchor?.getBoundingClientRect().top ?? 0
    const revision = interaction
    const result = await action()
    await nextTick()
    if (id && !disposed && revision === interaction && document.visibilityState === 'visible') {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      if (!disposed && revision === interaction && document.visibilityState === 'visible') {
        const current = cards().find((node) => node.dataset.videoId === id)
        if (current)
          window.scrollBy({
            top: current.getBoundingClientRect().top - offset,
            behavior: 'instant',
          })
      }
    }
    return result
  }
  onMounted(() => {
    for (const event of events) window.addEventListener(event, interacted, { passive: true })
  })
  onUnmounted(() => {
    disposed = true
    for (const event of events) window.removeEventListener(event, interacted)
  })
  return { keepPosition }
}
