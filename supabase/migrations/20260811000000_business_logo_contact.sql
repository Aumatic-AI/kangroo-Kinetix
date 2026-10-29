-- Business logo + contact phone, needed so AI Ad Studio can put real
-- branding/contact info on a generated poster ad instead of nothing.
-- Mirrors the existing video_reference_*_url columns' pattern (a plain
-- public URL, not the unused logo_asset_id -> media_assets indirection,
-- since nothing resolves that FK today and this is simpler to consume).

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS contact_phone TEXT;
