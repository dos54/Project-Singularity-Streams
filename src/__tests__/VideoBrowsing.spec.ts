import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import { readVideoCache, writeVideoCache } from '../utils/videoCache'
import { readPreference } from '../utils/preferences'
import { writeState } from '../utils/browserState'
vi.mock('../utils/videoCache', () => ({
  readVideoCache: vi.fn(async () => null),
  writeVideoCache: vi.fn(async () => true),
  clearVideoCache: vi.fn(async () => true),
}))

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.mocked(readVideoCache).mockResolvedValue(null)
  vi.mocked(writeVideoCache).mockClear()
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }))
})
afterEach(() => vi.unstubAllGlobals())
it('filters and paginates locally, saves preferences, and lets the URL override saved page size', async () => {
  localStorage.setItem('singularity:page-size', '50')
  localStorage.setItem('singularity:project-videos', 'false')
  // Retired preferences must not silently hide videos after upgrading the preview.
  writeState('new-only', true)
  writeState('hide-seen', true)
  writeState('position', { id: '1', offset: 0, expanded: [], path: '/' }, true)
  const fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    headers: new Headers(),
    json: async () =>
      url.includes('/uploads')
        ? {
            videos: Array.from({ length: 100 }, (_, i) => ({
              videoId: String(
                i + (url.includes('cursor=last') ? 200 : url.includes('cursor=older') ? 100 : 0),
              ),
              memberId: (i % 3) + 1,
              title: 'Video ' + i,
              description: i === 99 ? 'unique phrase' : '',
              state: 'video',
              isProjectSingularity: true,
            })),
            nextCursor: url.includes('cursor=last')
              ? null
              : url.includes('cursor=older')
                ? 'last'
                : 'older',
          }
        : url.includes('/members')
          ? {
              members: [
                { memberId: 1, alias: 'Rook' },
                { memberId: 2, alias: 'Finch' },
              ],
            }
          : url.includes('/twitch')
            ? { liveStreams: [] }
            : { videos: [] },
  }))
  vi.stubGlobal('fetch', fetchMock)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: HomeView }],
  })
  await router.push('/?pageSize=20')
  const mountView = () =>
    mount(HomeView, {
      global: {
        plugins: [createPinia(), router],
        stubs: {
          NewVideoList: {
            props: ['video'],
            template: '<article class="test-video">{{ video.title }}</article>',
          },
          VContainer: { template: '<div><slot /></div>' },
          VRow: { template: '<div><slot /></div>' },
          VCol: { template: '<div><slot /></div>' },
          VCard: { template: '<article><slot /></article>' },
          VCardTitle: { template: '<h3><slot /></h3>' },
          VCardActions: { template: '<div><slot /></div>' },
          VNavigationDrawer: true,
          VSwitch: {
            props: ['modelValue'],
            emits: ['update:modelValue'],
            template:
              '<input class="project-toggle" type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
          },
          VToolbarTitle: true,
          VSpacer: true,
          VIcon: true,
          VToolbar: true,
          VDivider: true,
          VListItem: true,
          VList: true,
          VBtn: { template: '<button><slot /></button>' },
          StreamingList: true,
        },
      },
    })
  const wrapper = mountView()
  await flushPromises()
  expect(wrapper.findAll('.test-video')).toHaveLength(20)
  expect(readPreference('page-size')).toBe('20')
  expect(wrapper.findAll('.video-column')).toHaveLength(2)
  expect(wrapper.text()).not.toMatch(
    /New since last visit|Hide seen|Continue where you left off|Mark as seen/,
  )
  const count = () => wrapper.find('.result-count:not(.stream-count)').text()
  const callsBeforeFavorites = fetchMock.mock.calls.length
  await wrapper.find('[aria-label="Video creators"] button:last-child').trigger('click')
  expect(count()).toContain('Showing 0 of 100 loaded videos')
  await wrapper.find('[aria-label="Add Rook to favorites"]').trigger('click')
  expect(count()).toContain('Showing 34 of 100 loaded videos')
  await wrapper.find('[aria-label="Add Finch to favorites"]').trigger('click')
  expect(count()).toContain('Showing 67 of 100 loaded videos')
  await wrapper
    .findAll('button')
    .find((button) => button.text() === 'Share filtered list')!
    .trigger('click')
  const shared = new URL(
    wrapper.find('.share-panel input').element.getAttribute('value') ??
      (wrapper.find('.share-panel input').element as HTMLInputElement).value,
  )
  expect(shared.searchParams.get('creators')).toBe('1,2')
  expect(shared.searchParams.get('page')).toBe('1')
  expect(shared.searchParams.has('seen')).toBe(false)
  await wrapper.find('[aria-label="Remove Rook from favorites"]').trigger('click')
  expect(count()).toContain('Showing 33 of 100 loaded videos')
  expect(
    new URL(
      (wrapper.find('.share-panel input').element as HTMLInputElement).value,
    ).searchParams.get('creators'),
  ).toBe('2')
  await wrapper.find('[aria-label="Video creators"] button:first-child').trigger('click')
  expect(count()).toContain('Showing 100 of 100 loaded videos')
  expect(fetchMock.mock.calls).toHaveLength(callsBeforeFavorites)
  const toggles = wrapper.findAll('.project-toggle')
  await toggles[0]!.setValue(false)
  await toggles.at(-1)!.setValue(true)
  expect(readPreference('project-streams')).toBe('false')
  expect(readPreference('project-videos')).toBe('true')
  const calls = fetchMock.mock.calls.length
  await wrapper.find('input[type="search"]').setValue('unique phrase')
  expect(wrapper.findAll('.test-video')).toHaveLength(1)
  expect(fetchMock.mock.calls).toHaveLength(calls)
  await wrapper.find('input[type="search"]').setValue('')
  await wrapper.findAll('select')[1]!.setValue('10')
  await flushPromises()
  expect(router.currentRoute.value.query.pageSize).toBe('10')
  expect(readPreference('page-size')).toBe('10')
  expect(wrapper.findAll('.test-video')).toHaveLength(10)
  expect(fetchMock.mock.calls.filter(([url]) => url.includes('/uploads'))).toHaveLength(1)
  await wrapper
    .findAll('button')
    .find((button) => button.text() === 'Load all videos')!
    .trigger('click')
  await flushPromises()
  expect(fetchMock.mock.calls.filter(([url]) => url.includes('/uploads'))).toHaveLength(3)
  expect(wrapper.find('.result-count:not(.stream-count)').text()).toContain('300 loaded videos')
  expect(wrapper.find('.stream-count').text()).toBe('Showing 0 of 0 active creators')
  expect(wrapper.findAll('button').some((button) => button.text() === 'Load all videos')).toBe(
    false,
  )
  const snapshot = vi.mocked(writeVideoCache).mock.calls.at(-1)![1]
  expect(snapshot.videos).toHaveLength(300)
  expect(snapshot.nextCursor).toBeNull()
  vi.mocked(readVideoCache).mockResolvedValue(snapshot)
  wrapper.unmount()
  const previousCalls = fetchMock.mock.calls.filter(([url]) => url.includes('/uploads')).length
  const returning = mountView()
  await flushPromises()
  expect(returning.find('.result-count:not(.stream-count)').text()).toContain('300 loaded videos')
  expect(returning.findAll('button').some((button) => button.text() === 'Load all videos')).toBe(
    false,
  )
  expect(fetchMock.mock.calls.filter(([url]) => url.includes('/uploads')).length).toBe(
    previousCalls + 1,
  )
  expect(fetchMock.mock.calls.filter(([url]) => url.includes('/uploads')).at(-1)![0]).not.toContain(
    'cursor=',
  )
  returning.unmount()
})
