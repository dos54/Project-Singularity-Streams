CREATE INDEX IF NOT EXISTS idx_videos_page ON Videos(PublishedAt DESC, VideoId DESC);
CREATE INDEX IF NOT EXISTS idx_videos_ps_page ON Videos(PublishedAt DESC, VideoId DESC) WHERE IsProjectSingularity=1;
