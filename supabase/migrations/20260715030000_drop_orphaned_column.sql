-- generation_job_id's FK target (generation_jobs) was dropped in
-- 20260715010000_force_fourteen_tables.sql, which cascaded away the
-- constraint but left the column itself behind, now pointing at nothing.
ALTER TABLE media_assets DROP COLUMN IF EXISTS generation_job_id;
