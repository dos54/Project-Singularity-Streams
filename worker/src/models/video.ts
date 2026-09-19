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
  if (liveStatus.actualEndTime) return Status.video
  if (liveStatus.actualStartTime) return Status.live
  // Keep the existing public/SQL enum: inactive includes upcoming streams.
  if (liveStatus.scheduledStartTime) return Status.inactive
  return Status.video
}
