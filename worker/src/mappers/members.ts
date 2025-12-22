import { Author } from "../types/youtube";
import { MemberRow } from "../types/db";

export function memberRowToAuthor(row: MemberRow): Author {
  return {
    memberId: row.MemberId,
    alias: row.Alias,
    twitch: row.Twitch ?? undefined,
    youtube: row.Youtube ?? "",
    youtubeId: row.YoutubeId ?? "",
    discordInvite: row.DiscordInvite ?? undefined
  }
}
