ALTER TABLE VideoLiveStatus ADD COLUMN ScheduledStartTime TEXT;
CREATE INDEX idx_status_state_checked ON VideoLiveStatus(State, LastChecked);

CREATE TABLE YoutubeSubscriptions (
  ChannelId TEXT PRIMARY KEY,
  CallbackId TEXT NOT NULL UNIQUE,
  PendingUntil INTEGER NOT NULL DEFAULT 0,
  LeaseExpiresAt INTEGER NOT NULL DEFAULT 0,
  RenewAt INTEGER NOT NULL DEFAULT 0,
  ReconcileAt INTEGER NOT NULL DEFAULT 0,
  LastDeliveryAt INTEGER,
  LastError TEXT
);
CREATE INDEX idx_youtube_renew ON YoutubeSubscriptions(RenewAt);
CREATE INDEX idx_youtube_reconcile ON YoutubeSubscriptions(ReconcileAt);

CREATE TABLE YoutubeInbox (
  VideoId TEXT PRIMARY KEY,
  ChannelId TEXT NOT NULL,
  EventUpdatedAt INTEGER NOT NULL DEFAULT 0,
  Revision INTEGER NOT NULL DEFAULT 1,
  Attempts INTEGER NOT NULL DEFAULT 0,
  NextAttemptAt INTEGER,
  LastError TEXT
);
CREATE INDEX idx_youtube_inbox_due ON YoutubeInbox(NextAttemptAt)
  WHERE NextAttemptAt IS NOT NULL;

CREATE TABLE WorkerLeases (
  Name TEXT PRIMARY KEY,
  Token TEXT NOT NULL,
  ExpiresAt INTEGER NOT NULL
);
