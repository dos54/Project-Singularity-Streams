import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { useRefresh } from '../composables/useRefresh'
import RefreshButton from '../components/RefreshButton.vue'

let visible: DocumentVisibilityState
let focused: boolean
const wrappers: Array<ReturnType<typeof mount>> = []
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-19T12:00:00Z'))
  visible = 'visible'
  focused = true
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused)
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visible)
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
  vi.useRealTimers()
})
function setup(streams = vi.fn(async () => 0), videos = vi.fn(async () => 0)) {
  let refresh!: ReturnType<typeof useRefresh>
  wrappers.push(
    mount(
      defineComponent({
        setup() {
          refresh = useRefresh({ streams, videos })
          return () => null
        },
      }),
    ),
  )
  refresh.start()
  return { refresh, streams, videos }
}
describe('refresh scheduling', () => {
  it('refreshes every five minutes only while visible and focused, then coalesces focus events', async () => {
    const { refresh, streams, videos } = setup()
    await vi.advanceTimersByTimeAsync(299_000)
    expect(streams).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(streams).toHaveBeenCalledTimes(1)
    expect(videos).toHaveBeenCalledTimes(1)
    visible = 'hidden'
    focused = false
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('blur'))
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(streams).toHaveBeenCalledTimes(1)
    visible = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    expect(streams).toHaveBeenCalledTimes(1)
    focused = true
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(streams).toHaveBeenCalledTimes(2)
    expect(videos).toHaveBeenCalledTimes(2)
    expect(refresh.lanes.streams.pending).toBe(false)
  })
  it('refreshes after more than two minutes away even before the five-minute deadline', async () => {
    const { streams } = setup()
    focused = false
    window.dispatchEvent(new Event('blur'))
    await vi.advanceTimersByTimeAsync(119_000)
    focused = true
    window.dispatchEvent(new Event('focus'))
    expect(streams).not.toHaveBeenCalled()
    focused = false
    window.dispatchEvent(new Event('blur'))
    await vi.advanceTimersByTimeAsync(121_000)
    focused = true
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(streams).toHaveBeenCalledTimes(1)
  })
  it('shows loading then a disabled countdown and prevents overlapping/manual duplicate requests', async () => {
    let finish!: (value: number) => void
    const streams = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          finish = resolve
        }),
    )
    const { refresh } = setup(streams)
    const button = mount(
      defineComponent({
        components: { RefreshButton },
        setup: () => ({ refresh }),
        template:
          '<RefreshButton label="streams" :busy="refresh.lanes.streams.pending" :seconds="refresh.streamSeconds.value" @refresh="refresh.refresh(\'streams\')" />',
      }),
    )
    wrappers.push(button)
    await button.find('button').trigger('click')
    expect(button.find('.spinner').exists()).toBe(true)
    expect(button.find('button').attributes('disabled')).toBeDefined()
    void refresh.refresh('streams')
    expect(streams).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3000)
    finish(0)
    await flushPromises()
    expect(button.text()).toBe('Please wait · 12s')
    expect(button.find('.spinner').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(12_000)
    expect(button.text()).toBe('Refresh')
    expect(button.find('button').attributes('disabled')).toBeUndefined()
  })
  it('honors a longer server backoff and stops polling on unmount', async () => {
    const streams = vi.fn(async () => Date.now() + 60_000)
    const { refresh } = setup(streams)
    await refresh.refresh('streams')
    expect(refresh.streamSeconds.value).toBe(60)
    await vi.advanceTimersByTimeAsync(15_000)
    await refresh.refresh('streams')
    expect(streams).toHaveBeenCalledTimes(1)
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    await vi.advanceTimersByTimeAsync(600_000)
    expect(streams).toHaveBeenCalledTimes(1)
  })
})
