-- Outreach campaign form gains the fields the legacy app actually used
-- (Service Type, Target Region, CTA button) plus a hard requirement that
-- every campaign target a specific lead list — no more "everyone not yet
-- contacted" default audience. See design spec §2-3.

ALTER TABLE outreach_campaigns
    ADD COLUMN service_type TEXT,
    ADD COLUMN target_region TEXT,
    ADD COLUMN cta_text TEXT,
    ADD COLUMN cta_link TEXT;

-- No campaign has been sent to a real audience yet (this module just
-- finished its first build pass) — safe to drop any draft rows created
-- during typecheck/manual testing rather than backfill a category.
DELETE FROM outreach_campaigns WHERE category_id IS NULL;

ALTER TABLE outreach_campaigns
    ALTER COLUMN category_id SET NOT NULL;
