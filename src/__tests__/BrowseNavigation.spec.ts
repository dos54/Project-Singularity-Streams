import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { useBrowseFilters } from '../composables/useBrowseFilters'
import { readPreference } from '../utils/preferences'

const wrappers: Array<ReturnType<typeof mount>> = []
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.useRealTimers()
})
async function setup(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  await router.push(path)
  let browse!: ReturnType<typeof useBrowseFilters>
  const warning = vi.fn()
  wrappers.push(
    mount(
      defineComponent({
        setup() {
          browse = useBrowseFilters(warning)
          return () => null
        },
      }),
      { global: { plugins: [router] } },
    ),
  )
  return { router, browse, warning }
}
it('restores explicit page and filters through Back and Forward without resetting page to one', async () => {
  const { router, browse } = await setup(
    '/?q=gregtech&creators=2&page=3&pageSize=20&utm_source=test',
  )
  expect(browse.filters.page).toBe(3)
  browse.update({ page: 4 })
  await flushPromises()
  browse.update({ creators: [7] })
  await flushPromises()
  expect(browse.filters.page).toBe(1)
  router.back()
  await flushPromises()
  expect(browse.filters.page).toBe(4)
  expect(browse.filters.creators).toEqual([2])
  router.back()
  await flushPromises()
  expect(browse.filters.page).toBe(3)
  router.forward()
  await flushPromises()
  expect(browse.filters.page).toBe(4)
  expect(router.currentRoute.value.query.utm_source).toBe('test')
})
it('replaces debounced searches without creating an entry for every keystroke', async () => {
  vi.useFakeTimers()
  const { router, browse } = await setup('/?pageSize=10')
  browse.update({ project: false })
  await flushPromises()
  browse.search('mine')
  browse.search('minecraft')
  await vi.advanceTimersByTimeAsync(350)
  await flushPromises()
  expect(router.currentRoute.value.query.q).toBe('minecraft')
  router.back()
  await flushPromises()
  expect(router.currentRoute.value.query.q).toBeUndefined()
  expect(browse.filters.project).toBe(true)
})
it('uses complete shared-view defaults ahead of recipient preferences and saves valid sizes', async () => {
  localStorage.setItem('singularity:page-size', '100')
  localStorage.setItem('singularity:project-videos', 'false')
  const { browse } = await setup('/?shared=1&creators=1,3&pageSize=20')
  expect(browse.filters.creators).toEqual([1, 3])
  expect(browse.filters.project).toBe(true)
  expect(readPreference('page-size')).toBe('20')
})
