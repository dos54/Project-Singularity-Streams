import { getAllMembers } from '../db/members'
import { Env } from '../env'
import { determineLiveStatus, isProjectSingularityVideo } from '../models/video'
import { AtomEntry, Author, Status, Video, VideoWithLiveStatus, YoutubeLivestreamResponseItem } from '../types/youtube'
import { parseXmlFeed } from '../parsers/youtube/atomParser'
import {
  atomEntryToVideo,
  attachLiveStatus,
  mapVideoRowsToDtos,
  patchFromYoutubeItems,
  videoLiveStatusRowToVideoLiveStatus,
  videoLiveStatusToRow,
} from '../mappers/videoMapper'
import { memberRowToAuthor } from '../mappers/members'
import {
  getAllVideos,
  upsertVideos,
  getLiveStatusesForVideoIds,
  ensureLiveStatusRows,
  patchVideoLiveStatus,
} from '../db/videos'
import { type VideoLiveStatus } from '../types/youtube'

export async function syncFeed(env: Env) {
  // Get member list, map to Author object, then create a Map for efficient lookups
  const membersList = await getAllMembers(env.DB)
  const authors: Author[] = membersList.map(memberRowToAuthor).filter((a) => !!a.youtubeId)
  const authorByYoutubeId = new Map<string, Author>(authors.map((a) => [a.youtubeId, a]))
  // Get the atom feed of all members
  const results = await Promise.allSettled(authors.map((m) => fetchAtomFeed(env, m.youtubeId)))

  results
    .filter((r) => r.status === 'rejected')
    .forEach((r) => console.error('feed fetch failed:', r.reason))
  const atomXmlStrings = results.filter((r) => r.status === 'fulfilled').map((r) => r.value)

  // Parse the feed, then turn it into a flat list of AtomEntry[]
  const entries: AtomEntry[] = atomXmlStrings.map(parseXmlFeed).flatMap((feed) => {
    const e = feed?.feed?.entry
    if (!e) return []
    return Array.isArray(e) ? e : [e]
  })

  // Create a videos list from the feed which is... a list of Video objects
  const videos: Video[] = entries.map((entry) => {
    const youtubeId = entry['yt:channelId']
    if (!youtubeId) {
      throw new Error('Entry missing yt:channelId')
    }

    const author = authorByYoutubeId.get(youtubeId)
    if (!author) {
      throw new Error(`Author not found for channel ${youtubeId}`)
    }

    const video = atomEntryToVideo(entry, author)
    video.isProjectSingularity = isProjectSingularityVideo(video)
    return video
  })

  await upsertVideos(env, videos)

  const rawStatuses = await getLiveStatusesForVideoIds(
    env,
    videos.map((v) => v.id),
  )
  const statuses = rawStatuses.map(videoLiveStatusRowToVideoLiveStatus)

  const missingLiveStatusIds = new Set(videos.map(v => v.id))
  for (const s of statuses) {missingLiveStatusIds.delete(s.videoId)}

  // console.log('Ensuring they exist')
  const newRows = await ensureLiveStatusRows(env, [...missingLiveStatusIds])
  const newStatuses = newRows.map(videoLiveStatusRowToVideoLiveStatus)

  const allStatuses = [...statuses, ...newStatuses]
  const joined = attachLiveStatus(videos, allStatuses)
  const idsToRefresh = selectVideosNeedingRefresh(joined, Date.now())
  const ytResponseItems = await fetchLiveStatusesFromYoutube(env, idsToRefresh)

  const idToRefreshSet = new Set(idsToRefresh)
  const liveStatusesToRefresh = allStatuses.filter(ls => idToRefreshSet.has(ls.videoId))
  const patchedLiveStatusesToRefresh = patchFromYoutubeItems(liveStatusesToRefresh, ytResponseItems)
  const finalLiveStatuses: VideoLiveStatus[] = patchedLiveStatusesToRefresh.map((ls) => ({
    ...ls,
    state: determineLiveStatus(ls),
  }))

  const liveStatusRows = finalLiveStatuses.map(videoLiveStatusToRow)
  // console.log('Executing patches...')
  await patchVideoLiveStatus(env, liveStatusRows)
}

export async function fetchAtomFeed(env: Env, youtubeId: string): Promise<string> {
  const url = new URL(`${env.ATOM_FEED_BASE}/feeds/videos.xml`)
  url.searchParams.set('channel_id', youtubeId)

  const res = await fetch(url)
  if (!res.ok)
    throw new Error(
      `There was a problem fetching the Atom feed for ${youtubeId}. URL: ${url.toString()}`,
    )
  return res.text()
}

export async function returnAllVideos(env: Env) {
  const rows = await getAllVideos(env)
  return mapVideoRowsToDtos(rows)
}

export function selectVideosNeedingRefresh(items: VideoWithLiveStatus[], nowMs: number): string[] {
  const inactiveMaxAgeMs = 30 * 60 * 1000 // 30 mins
  const liveMaxAgeMs = 5 * 60 * 30 // 5 mins
  return items
    .filter(
      (v) =>
        v.liveStatus === null ||
        (v.liveStatus.state === Status.inactive &&
          nowMs - v.liveStatus.lastChecked > inactiveMaxAgeMs) ||
        (v.liveStatus.state === Status.live && nowMs - v.liveStatus.lastChecked > liveMaxAgeMs),
    )
    .map((v) => v.id)
}

export async function fetchLiveStatusesFromYoutube(env: Env, idsToRefresh: string[]): Promise<YoutubeLivestreamResponseItem[]> {
  if (idsToRefresh.length === 0) return []
  const ytResponseItems: YoutubeLivestreamResponseItem[] = []

  const batches: string[][] = []
  const BATCH_SIZE = 50
  for (let i = 0; i < idsToRefresh.length; i += BATCH_SIZE) {
    batches.push(idsToRefresh.slice(i, i + BATCH_SIZE))
  }

  await Promise.all(
    batches.map(async (batch) => {
      const url = new URL(`${env.YT_API_BASE}/youtube/v3/videos`)
      url.searchParams.set('part', 'liveStreamingDetails')
      url.searchParams.set('id', batch.join(','))
      url.searchParams.set('key', env.YOUTUBE_API_KEY)

      const resp = await fetch(url.toString())
      if (!resp.ok) {
        const text = await resp.text()
        console.error('Youtube videos.list error:',resp.status, text,'URL:',url.toString())
        throw new Error(`Youtube videos.list error: ${resp.status}`)
      }

      type YoutubeResponse = {
        kind?: string
        etag?: string
        items: YoutubeLivestreamResponseItem[]
        pageInfo?: {
          totalResults: number
          resultsPerPage: number
        }
      }

      const responseJson = await resp.json<YoutubeResponse>()
      ytResponseItems.push(...responseJson.items)
    })
  )

  return ytResponseItems
}
