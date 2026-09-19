-- One-time migration ledger repair for singularitystream-db only.
-- Verified 2026-09-19: schema/indexes from 0002/0004/0005 already exist,
-- all 15 seeded members exist (with later edits), and the ledger is empty.
-- 0001 is a comment-only migration. Preserve existing member edits and videos.
-- This records historical completion; it does not execute the old migrations.
INSERT INTO d1_migrations (name) VALUES
  ('0001_init.sql'),
  ('0002_add_initial_tables.sql'),
  ('0003_insert_members_list.sql'),
  ('0004_idx_videos_ps_member_published.sql'),
  ('0005_add_videos_publishedat_index.sql')
ON CONFLICT(name) DO NOTHING;
