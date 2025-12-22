import { findMemberRowByYoutubeId, getAllMembers } from '../db/members'
import { Env } from '../env'
import { memberRowToAuthor } from '../mappers/members'
import { type Author } from '../types/youtube'

export async function getAuthorByYoutubeId(env: Env, youtubeId: string): Promise<Author> {
  const row = await findMemberRowByYoutubeId(env.DB, youtubeId)

  if (!row) {
    throw new Error(`No member found for youtubeId=${youtubeId}`)
  }

  return memberRowToAuthor(row)
}

export async function getAllMemberService(env: Env) {
  const row = await getAllMembers(env.DB)
  const members = row.map(memberRowToAuthor)

  return members
}
