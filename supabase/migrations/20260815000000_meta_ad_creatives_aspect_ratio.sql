ALTER TABLE meta_ad_creatives
  ADD COLUMN IF NOT EXISTS aspect_ratio text NOT NULL DEFAULT '9:16' CHECK (aspect_ratio IN ('9:16', '16:9'));
