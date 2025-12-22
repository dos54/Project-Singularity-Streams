-- Migration number: 0005 	 2025-12-22T06:01:19.806Z
CREATE INDEX IF NOT EXISTS idx_videos_publishedat_desc ON Videos(PublishedAt DESC);