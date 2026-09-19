import { defineStore } from 'pinia'
import { ref } from 'vue'
import { readState, writeState } from '@/utils/browserState'

function ids(value: unknown): number[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((id) => Number.isSafeInteger(id) && id > 0))]
    : []
}
export const usePreferencesStore = defineStore('preferences', () => {
  const favoriteIds = ref(ids(readState('favorites', [])))
  const videoFavorites = ref(readState<unknown>('video-favorites', false) === true)
  const streamFavorites = ref(readState<unknown>('stream-favorites', false) === true)
  const storageWarning = ref(false)
  function persist(name: string, value: unknown) {
    if (!writeState(name, value)) storageWarning.value = true
  }
  function toggleFavorite(id: number) {
    favoriteIds.value = favoriteIds.value.includes(id)
      ? favoriteIds.value.filter((value) => value !== id)
      : [...favoriteIds.value, id]
    persist('favorites', favoriteIds.value)
  }
  function setMode(mode: 'video-favorites' | 'stream-favorites', value: boolean) {
    const target = { 'video-favorites': videoFavorites, 'stream-favorites': streamFavorites }[mode]
    target.value = value
    persist(mode, value)
  }
  function reset() {
    favoriteIds.value = []
    persist('favorites', [])
    setMode('video-favorites', false)
    setMode('stream-favorites', false)
  }
  function sync() {
    favoriteIds.value = ids(readState('favorites', []))
  }
  return {
    favoriteIds,
    videoFavorites,
    streamFavorites,
    storageWarning,
    toggleFavorite,
    setMode,
    reset,
    sync,
  }
})
