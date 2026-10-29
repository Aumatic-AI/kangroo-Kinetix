-- ============================================================
-- Competitor ad analysis rebuild — business-level config
--
-- Adds the one genuinely new column (ad_script_topics, replacing
-- the 5 hardcoded ready_ad_scripts topics in the legacy n8n prompt).
-- Everything else needed (target_countries, competitor_keywords,
-- industry, core_offerings, business_voice, target_audience, settings)
-- is already live schema. Business-specific values are entered in
-- Settings, not seeded here.
-- ============================================================

ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS ad_script_topics JSONB NOT NULL DEFAULT '[]';
