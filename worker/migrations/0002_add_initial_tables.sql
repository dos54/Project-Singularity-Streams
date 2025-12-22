-- Migration number: 0002 	 2025-12-17T07:41:54.935Z
CREATE TABLE Members (
  MemberId INTEGER PRIMARY KEY,
  Alias TEXT NOT NULL,
  Twitch TEXT UNIQUE,
  Youtube TEXT UNIQUE,
  YoutubeId TEXT UNIQUE,
  DiscordInvite TEXT,
  CHECK (
    Youtube IS NULL
    OR YoutubeId IS NOT NULL
  )
);

CREATE TABLE Videos (
  VideoId TEXT PRIMARY KEY,
  MemberId INTEGER NOT NULL,
  Title TEXT NOT NULL,
  Description TEXT,
  IsProjectSingularity BOOLEAN NOT NULL DEFAULT 0,
  PublishedAt TEXT NOT NULL,
  ThumbnailUrl TEXT,
  ThumbnailWidth INTEGER,
  ThumbnailHeight INTEGER,
  CHECK (IsProjectSingularity IN (0, 1)),
  FOREIGN KEY (MemberId) REFERENCES Members(MemberId) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_videos_member_published ON Videos (MemberId, PublishedAt DESC);

CREATE TABLE VideoLiveStatus (
  VideoId TEXT PRIMARY KEY,
  State TEXT NOT NULL CHECK (State IN ('live', 'video', 'inactive')),
  LastChecked INTEGER NOT NULL,
  ActualStartTime TEXT,
  ActualEndTime TEXT,
  ActiveLiveChatId TEXT,
  ConcurrentViewers INTEGER,
  FOREIGN KEY (VideoId) REFERENCES Videos(VideoId) ON UPDATE cascade ON DELETE CASCADE
);