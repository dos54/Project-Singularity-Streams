-- Migration number: 0004 	 2025-12-18T10:52:38.593Z
CREATE INDEX IF NOT EXISTS idx_videos_ps_published ON Videos (PublishedAt DESC)
WHERE IsProjectSingularity = 1;