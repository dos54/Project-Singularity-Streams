import { reactive, watch, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  defaultFilters,
  parseBrowseQuery,
  serializeBrowse,
  type BrowseFilters,
} from '@/utils/browseQuery'
import { readPreference, savePreference, parsePageSize } from '@/utils/preferences'
import { readState, writeState } from '@/utils/browserState'

export function useBrowseFilters(onStorageFailure: () => void) {
  const route = useRoute()
  const router = useRouter()
  const saved = readState<unknown>('browse', null, true)
  const defaults = {
    ...defaultFilters,
    project: readPreference('project-videos') !== 'false',
    streamProject: readPreference('project-streams') !== 'false',
    pageSize: parsePageSize(readPreference('page-size')) ?? 10,
  }
  const baseline =
    saved && typeof saved === 'object'
      ? parseBrowseQuery(saved as ReturnType<typeof serializeBrowse>, defaults)
      : defaults
  const filters = reactive(parseBrowseQuery(route.query, baseline))
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  function save() {
    if (!writeState('browse', serializeBrowse(filters), true)) onStorageFailure()
    savePreference('page-size', String(filters.pageSize))
    savePreference('project-videos', String(filters.project))
    savePreference('project-streams', String(filters.streamProject))
  }
  function navigate(replace: boolean) {
    save()
    const query = { ...route.query, ...serializeBrowse(filters) }
    void (replace ? router.replace({ query }) : router.push({ query }))
  }
  function update(patch: Partial<BrowseFilters>, replace = false) {
    clearTimeout(searchTimer)
    Object.assign(filters, patch, 'page' in patch ? {} : { page: 1 })
    navigate(replace)
  }
  function search(value: string) {
    filters.q = value.slice(0, 200)
    filters.page = 1
    clearTimeout(searchTimer)
    save()
    searchTimer = setTimeout(() => navigate(true), 350)
  }
  watch(
    () => route.query,
    (query) => {
      clearTimeout(searchTimer)
      Object.assign(filters, parseBrowseQuery(query, baseline))
      save()
    },
  )
  save()
  onUnmounted(() => clearTimeout(searchTimer))
  return {
    filters,
    update,
    search,
  }
}
