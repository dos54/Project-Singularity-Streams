import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { IDBFactory } from 'fake-indexeddb'
import { usePreferencesStore } from '../stores/preferences.store'
import { apiKey, stateKey, writeState } from '../utils/browserState'
import { readVideoCache, writeVideoCache, clearVideoCache } from '../utils/videoCache'
import { parseBrowseQuery, defaultFilters, serializeBrowse } from '../utils/browseQuery'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.stubGlobal('indexedDB', new IDBFactory())
  setActivePinia(createPinia())
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
describe('favorites', () => {
  it('persists favorites and section modes independently of the video cache', async () => {
    const store = usePreferencesStore()
    store.toggleFavorite(7)
    store.setMode('video-favorites', true)
    await writeVideoCache(apiKey, { videos: [], nextCursor: 'archive' })
    await clearVideoCache(apiKey)
    setActivePinia(createPinia())
    const returned = usePreferencesStore()
    expect(returned.favoriteIds).toEqual([7])
    expect(returned.videoFavorites).toBe(true)
    expect(returned.streamFavorites).toBe(false)
    await writeVideoCache(apiKey, { videos: [], nextCursor: 'archive' })
    returned.reset()
    expect(returned.favoriteIds).toEqual([])
    expect(returned.videoFavorites).toBe(false)
    expect((await readVideoCache(apiKey))?.nextCursor).toBe('archive')
  })
  it('keeps favorites usable in memory when browser storage is denied', () => {
    const store = usePreferencesStore()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    store.toggleFavorite(1)
    expect(store.favoriteIds).toEqual([1])
    expect(store.storageWarning).toBe(true)
  })
  it('ignores corrupt records and imports cross-tab changes', () => {
    localStorage.setItem(stateKey('favorites'), '[null,"bad",-1,7,7]')
    const store = usePreferencesStore()
    expect(store.favoriteIds).toEqual([7])
    writeState('favorites', [9])
    store.sync()
    expect(store.favoriteIds).toEqual([9])
  })
})
describe('shareable filters', () => {
  it('resets recipient defaults for a shared list and validates query values', () => {
    const result = parseBrowseQuery(
      { shared: '1', q: 'Minecraft', creators: '2,2,3,-1,xxx', page: '-1', pageSize: '999' },
      { ...defaultFilters, project: false, q: 'old', page: 8, pageSize: 50 },
    )
    expect(result).toEqual({ ...defaultFilters, q: 'Minecraft', creators: [2, 3] })
    expect(parseBrowseQuery({ creators: 'none' }, defaultFilters).creators).toEqual([])
    expect(
      parseBrowseQuery(
        serializeBrowse({ ...result, page: 3, streamCreators: [4] }),
        defaultFilters,
      ),
    ).toEqual({ ...result, page: 3, streamCreators: [4] })
  })
})
