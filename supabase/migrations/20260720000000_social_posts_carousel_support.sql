-- ============================================================
-- Social Media content creation: `social_posts.media_asset_id` only
-- supports one asset per row, but a carousel post needs several
-- (multiple images/videos in one post). Additive nullable array
-- column — single-asset posts (image/video) keep using
-- `media_asset_id` exactly as already designed; only 'carousel'
-- format rows populate `media_asset_ids` instead.
-- ============================================================

ALTER TABLE social_posts
    ADD COLUMN IF NOT EXISTS media_asset_ids UUID[] NOT NULL DEFAULT '{}';
