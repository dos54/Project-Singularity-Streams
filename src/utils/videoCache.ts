import type { YoutubeVideo } from '@/types/youtube'
import { compareVideos, isRecord, isVideo } from './dataValidation'
import { validTime } from './browserState'

export interface VideoSnapshot {
  videos: YoutubeVideo[]
  nextCursor: string | null
  headReceivedAt?: number | null
  archiveReceivedAt?: number | null
}
function isSnapshot(value: unknown): value is VideoSnapshot {
  return (
    isRecord(value) &&
    Array.isArray(value.videos) &&
    value.videos.every(isVideo) &&
    (value.nextCursor === null || typeof value.nextCursor === 'string')
  )
}

function mergeSnapshots(previous: VideoSnapshot, incoming: VideoSnapshot): VideoSnapshot {
  const headTime = (snapshot: VideoSnapshot) => validTime(snapshot.headReceivedAt) ?? 0
  const archiveTime = (snapshot: VideoSnapshot) => validTime(snapshot.archiveReceivedAt) ?? 0
  // Prefer the newest head's continuation so an older tab cannot close a newly discovered gap.
  // This can conservatively reread some archive pages when Load all is explicitly requested.
  const latest =
    headTime(previous) > headTime(incoming) ||
    (headTime(previous) === headTime(incoming) && archiveTime(previous) > archiveTime(incoming))
      ? previous
      : incoming
  const earlier = latest === previous ? incoming : previous
  const videos = new Map(earlier.videos.map((video) => [video.videoId, video]))
  for (const video of latest.videos) videos.set(video.videoId, video)
  return {
    videos: [...videos.values()].sort(compareVideos),
    nextCursor: latest.nextCursor,
    headReceivedAt: Math.max(headTime(previous), headTime(incoming)) || null,
    archiveReceivedAt: Math.max(archiveTime(previous), archiveTime(incoming)) || null,
  }
}
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('singularity-video-cache', 2)
    let abandoned = false
    const fail = (error: unknown) => {
      abandoned = true
      clearTimeout(timer)
      reject(error)
    }
    const timer = setTimeout(() => fail(new Error('Storage open timed out')), 3000)
    request.onupgradeneeded = () => {
      // Keep version 2 compatible with existing caches; retired seen stores are unused.
      for (const name of ['snapshots'])
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name)
    }
    request.onblocked = () => fail(new Error('Storage upgrade blocked'))
    request.onsuccess = () => {
      clearTimeout(timer)
      if (abandoned) {
        request.result.close()
        return
      }
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => fail(request.error)
  })
}

export async function clearVideoCache(key: string): Promise<boolean> {
  return mutate('snapshots', (store) => store.delete(key))
}
async function mutate(name: string, action: (store: IDBObjectStore) => void): Promise<boolean> {
  try {
    const db = await database()
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(name, 'readwrite')
        action(tx.objectStore(name))
        tx.oncomplete = () => resolve()
        tx.onerror = tx.onabort = () => reject(tx.error)
      })
      return true
    } finally {
      db.close()
    }
  } catch {
    return false
  }
}
export async function readVideoCache(key: string): Promise<VideoSnapshot | null> {
  try {
    const db = await database()
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction('snapshots').objectStore('snapshots').get(key)
        request.onsuccess = () => {
          const value = request.result
          resolve(isSnapshot(value) ? value : null)
        }
        request.onerror = () => reject(request.error)
      })
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}
export async function writeVideoCache(key: string, snapshot: VideoSnapshot): Promise<boolean> {
  if (!isSnapshot(snapshot)) return false
  try {
    const db = await database()
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('snapshots', 'readwrite')
        const store = tx.objectStore('snapshots')
        const existing = store.get(key)
        existing.onsuccess = () => {
          // The read and write share one transaction, including when two tabs save concurrently.
          store.put(
            isSnapshot(existing.result) ? mergeSnapshots(existing.result, snapshot) : snapshot,
            key,
          )
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
      return true
    } finally {
      db.close()
    }
  } catch {
    return false
  }
}
