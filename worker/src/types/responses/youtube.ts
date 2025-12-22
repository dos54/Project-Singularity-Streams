import { Status } from "../youtube";

export interface VideoResponseDto {
  memberId: number,
  videoId: string,
  title: string,
  publishedAt: string,
  thumbnailUrl: string | null,
  isProjectSingularity: boolean,
  state: Status
}

export interface ListVideoResponseDto {
  videos: VideoResponseDto[]
}
