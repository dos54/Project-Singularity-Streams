ALTER TABLE YoutubeSubscriptions ADD COLUMN FeedHealthy INTEGER NOT NULL DEFAULT 0;
ALTER TABLE YoutubeSubscriptions ADD COLUMN FeedCheckedAt INTEGER;
ALTER TABLE YoutubeSubscriptions ADD COLUMN FeedError TEXT;
ALTER TABLE YoutubeSubscriptions ADD COLUMN SubscriptionError TEXT;
ALTER TABLE YoutubeSubscriptions ADD COLUMN UploadsPlaylistId TEXT;
ALTER TABLE YoutubeSubscriptions ADD COLUMN PollAt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE YoutubeSubscriptions ADD COLUMN LastPollAt INTEGER;
ALTER TABLE YoutubeSubscriptions ADD COLUMN PollError TEXT;
CREATE INDEX idx_youtube_poll ON YoutubeSubscriptions(PollAt);
