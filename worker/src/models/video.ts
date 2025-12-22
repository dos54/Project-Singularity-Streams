import { Status, Video, VideoLiveStatus } from '../types/youtube'

const A = 'project'
const B = 'singularity'

export function isProjectSingularityVideo(video: Video): boolean {
  const title = video.title.toLowerCase()
  const description = video.description?.toLowerCase()

  return (
    (title.includes(A) && title.includes(B)) ||
    (!!description && description.includes(A) && description.includes(B))
  )
}

export function determineLiveStatus(liveStatus: VideoLiveStatus): Status {
  if (
    liveStatus.actualStartTime &&
    (liveStatus.concurrentViewers !== null || liveStatus.activeLiveChatId !== null)
  ) {
    return Status.live
  }

  if (
    liveStatus.actualStartTime ||
    liveStatus.actualEndTime ||
    liveStatus.activeLiveChatId === null
  ) {
    return Status.video
  }

  if (
    liveStatus.actualStartTime ||
    liveStatus.actualEndTime ||
    liveStatus.activeLiveChatId !== null
  ) {
    return Status.inactive
  }

  return Status.inactive
}
