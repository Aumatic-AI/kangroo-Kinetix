-- ============================================================
-- KINETIX — Force down to exactly the 14 planned tables
--
-- Drops tables outside the finalized 14-table design and folds
-- two "supporting" tables that had grown up around the working
-- Meta Ads pipeline back into the planned shape:
--
--   meta_self_ad_metrics  -> folded into ad_performance_daily
--                            (ad_id made nullable + a meta_ad_id
--                            fallback column added, since the
--                            paid-campaign-launch flow that would
--                            populate `ads` isn't built yet)
--   meta_competitor_ads   -> retired entirely. The competitor
--                            scraper now dedupes/scores in memory
--                            within a single run and writes only
--                            the synthesized result straight to
--                            ad_analysis_reports — this was always
--                            the documented design in
--                            ai_pipelines/intelligence_engine.md
--                            ("raw competitor ad data is never
--                            stored"); the persisted gallery table
--                            was a later addition beyond that spec.
--
-- All data in both tables was confirmed to be seed/demo data from
-- scripts/seed_meta_ads.ts (4 fake competitor ads, 30 days of
-- randomized fake metrics) — nothing real is lost.
-- ============================================================

-- ============================================================
-- 1. Drop tables confirmed unused by any current code
-- ============================================================

DROP TABLE IF EXISTS email_events CASCADE;
DROP TABLE IF EXISTS newsletter_recipients CASCADE;
DROP TABLE IF EXISTS newsletter_sends CASCADE;
DROP TABLE IF EXISTS newsletters CASCADE;
DROP TABLE IF EXISTS subscribers CASCADE;
DROP TABLE IF EXISTS outreach_emails CASCADE;
DROP TABLE IF EXISTS outreach_enrollments CASCADE;
DROP TABLE IF EXISTS outreach_sequence_steps CASCADE;
DROP TABLE IF EXISTS outreach_campaigns CASCADE;
DROP TABLE IF EXISTS outreach_contacts CASCADE;
DROP TABLE IF EXISTS generation_jobs CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;

-- ============================================================
-- 2. Fold meta_self_ad_metrics into ad_performance_daily
-- ============================================================

ALTER TABLE ad_performance_daily
    ADD COLUMN IF NOT EXISTS meta_ad_id TEXT,
    ADD COLUMN IF NOT EXISTS roas NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS cpa NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS hook_rate NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS hold_rate NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS ad_text TEXT,
    ADD COLUMN IF NOT EXISTS media_url TEXT,
    ADD COLUMN IF NOT EXISTS format TEXT;

-- ad_id can no longer be mandatory: Campaign Launch (which would
-- create real `ads` rows) isn't built yet, so daily metrics need to
-- be writable against a raw Meta ad ID before an internal ads row
-- exists. ad_id gets backfilled once that flow is built.
ALTER TABLE ad_performance_daily DROP CONSTRAINT IF EXISTS ad_metrics_daily_ad_id_fkey;
ALTER TABLE ad_performance_daily ALTER COLUMN ad_id DROP NOT NULL;
ALTER TABLE ad_performance_daily
    ADD CONSTRAINT ad_performance_daily_ad_id_fkey FOREIGN KEY (ad_id) REFERENCES ads(id) ON DELETE SET NULL;

ALTER TABLE ad_performance_daily DROP CONSTRAINT IF EXISTS ad_metrics_daily_ad_id_metric_date_key;

-- Migrate the existing (seed) rows from meta_self_ad_metrics across.
INSERT INTO ad_performance_daily (
    business_id, meta_ad_id, metric_date, spend_cents, impressions, clicks, conversions,
    roas, cpa, hook_rate, hold_rate, ad_text, media_url, format
)
SELECT
    business_id, meta_ad_id, date, ROUND(spend * 100)::int, impressions, clicks, conversions,
    roas, cpa, hook_rate, hold_rate, ad_text, media_url, format
FROM meta_self_ad_metrics;

ALTER TABLE ad_performance_daily
    ADD CONSTRAINT uq_ad_performance_daily_meta_ad_date UNIQUE (meta_ad_id, metric_date);

DROP POLICY IF EXISTS meta_self_ad_metrics_read ON meta_self_ad_metrics;
DROP POLICY IF EXISTS meta_self_ad_metrics_write ON meta_self_ad_metrics;
DROP TABLE meta_self_ad_metrics;

-- ============================================================
-- 3. Retire meta_competitor_ads (no replacement table — see header)
-- ============================================================

DROP POLICY IF EXISTS meta_competitor_ads_read ON meta_competitor_ads;
DROP POLICY IF EXISTS meta_competitor_ads_write ON meta_competitor_ads;
DROP TABLE meta_competitor_ads;
