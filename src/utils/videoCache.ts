import type { YoutubeVideo } from '@/types/youtube'

export interface VideoSnapshot { videos: YoutubeVideo[]; nextCursor: string | null }
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('singularity-video-cache', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export async function readVideoCache(key: string): Promise<VideoSnapshot | null> {
  try {
    const db = await database()
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction('snapshots').objectStore('snapshots').get(key)
        request.onsuccess = () => {
          const value = request.result
          resolve(value && Array.isArray(value.videos) && (value.nextCursor === null || typeof value.nextCursor === 'string') ? value : null)
        }
        request.onerror = () => reject(request.error)
      })
    } finally { db.close() }
  } catch { return null }
}
export async function writeVideoCache(key: string, snapshot: VideoSnapshot): Promise<boolean> {
  try {
    const db = await database()
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('snapshots', 'readwrite')
        tx.objectStore('snapshots').put(snapshot, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
      return true
    } finally { db.close() }
  } catch { return false }
}
