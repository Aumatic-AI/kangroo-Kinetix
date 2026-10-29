-- Publishing now goes through Upload-Post (api.upload-post.com) instead of
-- our own OAuth tokens. These columns correlate a social_posts row with
-- Upload-Post's own async/scheduled job tracking so we can poll it later:
-- `upload_post_request_id` for an immediate (async) publish, or
-- `upload_post_job_id` for a scheduled one (see docs.upload-post.com's
-- Upload Status / Schedule endpoints).

ALTER TABLE social_posts
    ADD COLUMN IF NOT EXISTS upload_post_request_id TEXT,
    ADD COLUMN IF NOT EXISTS upload_post_job_id TEXT;
