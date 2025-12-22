import { Env } from '../env'
import { MemberRow } from '../types/db'

export async function findMemberRowByYoutubeId(
  db: D1Database,
  youtubeId: string,
): Promise<MemberRow | null> {
  const row = await db
    .prepare(
      `
      SELECT
        MemberId,
        Alias,
        Twitch,
        Youtube,
        YoutubeId,
        DiscordInvite
      FROM Members
      WHERE YoutubeId = ?
      `,
    )
    .bind(youtubeId)
    .first<MemberRow>()
  return row
}

export async function getAllMembers(db: D1Database): Promise<MemberRow[]> {
  const res = await db
    .prepare(
      `
      SELECT
        MemberId,
        Alias,
        Twitch,
        Youtube,
        YoutubeId,
        DiscordInvite
      FROM Members `,
    )
    .run<MemberRow>()

    return res.results
}

export async function getAllTwitchMembers(env: Env): Promise<MemberRow[]> {
  const res = await env.DB.prepare(`
    SELECT MemberId, Alias, Twitch FROM Members WHERE Twitch IS NOT null;
  `).run<MemberRow>()

  return res.results
}
