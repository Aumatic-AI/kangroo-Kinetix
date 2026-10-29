-- Meta creatives are immutable — editing a live ad's headline/body means
-- creating a brand new Meta ad creative object and repointing the ad at it
-- (see the legacy project's /api/meta/update route). ads.creative_id already
-- points at OUR OWN meta_ad_creatives row, so we need a separate column to
-- track which Meta-side creative object is currently live on the ad.
ALTER TABLE ads ADD COLUMN IF NOT EXISTS external_creative_id text;
