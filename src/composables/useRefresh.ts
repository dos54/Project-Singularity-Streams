import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'

const INTERVAL = 5 * 60_000
const RETURN_AFTER = 2 * 60_000
export function useRefresh(actions: Record<'streams' | 'videos', () => Promise<number | void>>) {
  const now = ref(Date.now())
  const enabled = ref(false)
  const active = ref(false)
  const lanes = reactive({
    streams: { pending: false, until: 0, due: Date.now() + INTERVAL },
    videos: { pending: false, until: 0, due: Date.now() + INTERVAL },
  })
  let awayAt: number | null = null
  let timer: ReturnType<typeof setInterval> | undefined
  const isActive = () => document.visibilityState === 'visible' && document.hasFocus()
  async function refresh(name: 'streams' | 'videos') {
    const lane = lanes[name]
    if (!enabled.value || lane.pending || Date.now() < lane.until) return
    lane.pending = true
    lane.until = Date.now() + 15_000
    lane.due = Date.now() + INTERVAL
    try {
      const retryAt = await actions[name]()
      if (retryAt) {
        lane.until = Math.max(lane.until, retryAt)
        lane.due = Math.max(lane.due, retryAt)
      }
    } finally {
      lane.pending = false
      now.value = Date.now()
    }
  }
  function tick() {
    now.value = Date.now()
    active.value = isActive()
    if (!active.value) {
      awayAt ??= now.value
      return
    }
    const returning = awayAt !== null && now.value - awayAt > RETURN_AFTER
    awayAt = null
    if (!enabled.value) return
    for (const name of ['streams', 'videos'] as const) {
      if (returning || now.value >= lanes[name].due) void refresh(name)
    }
  }
  function markAway() {
    awayAt ??= Date.now()
    active.value = false
  }
  function start() {
    enabled.value = true
    for (const lane of Object.values(lanes)) lane.due = Date.now() + INTERVAL
    tick()
  }
  const remaining = (name: 'streams' | 'videos') =>
    computed(() => Math.max(0, Math.ceil((lanes[name].until - now.value) / 1000)))
  onMounted(() => {
    tick()
    timer = setInterval(tick, 1000)
    window.addEventListener('blur', markAway)
    window.addEventListener('focus', tick)
    window.addEventListener('pageshow', tick)
    document.addEventListener('visibilitychange', tick)
  })
  onUnmounted(() => {
    enabled.value = false
    clearInterval(timer)
    window.removeEventListener('blur', markAway)
    window.removeEventListener('focus', tick)
    window.removeEventListener('pageshow', tick)
    document.removeEventListener('visibilitychange', tick)
  })
  return {
    now,
    enabled,
    active,
    lanes,
    refresh,
    start,
    streamSeconds: remaining('streams'),
    videoSeconds: remaining('videos'),
  }
}
