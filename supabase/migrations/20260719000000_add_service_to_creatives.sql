-- ============================================================
-- Ad creatives now capture which service the ad is for, selected
-- explicitly in Create Ad rather than inferred from free-text. This
-- drives the category-specific vocabulary/rules in the generation
-- prompts instead of relying on keyword-sniffing the idea text.
-- The value is any name from businesses.services, so there is
-- deliberately no CHECK constraint on it.
-- ============================================================

ALTER TABLE meta_ad_creatives
    ADD COLUMN IF NOT EXISTS service TEXT;
