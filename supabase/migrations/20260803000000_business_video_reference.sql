-- Optional fixed character reference photo for AI video generation only
-- (Meta Ads video ads + Social Media video posts) — replaces the two
-- hardcoded Cloudinary URLs that used to live in
-- src/services/ai/character-references.ts with business-configurable
-- uploads, and fixes a real bug in that file: it picked one photo per
-- product area instead of one per gender, so a "female" Meta Ads video
-- always rendered with the male photo and vice versa for Social.
-- Disabled by default — video generation runs with no reference image
-- until both photos are uploaded and this is turned on from Settings.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS video_reference_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS video_reference_male_url TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS video_reference_female_url TEXT;
