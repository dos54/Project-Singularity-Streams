import type { Member } from "./member";

export interface Team {
  teamName: string
  members: Member[]
  description: string
}
