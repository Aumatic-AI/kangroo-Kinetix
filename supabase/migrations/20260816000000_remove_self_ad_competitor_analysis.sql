-- Removes the self-ad-analysis and competitor-analysis feature entirely —
-- unused: the weekly self-ad-analysis cron (business-ad-analysis.job.ts)
-- and its "winning angle"/"creative directives" intelligence fed into
-- ad-generation prompts, and the competitor-analysis job/config, both
-- removed from the application code in the same cleanup. ad_analysis_reports
-- was the only place either report type was ever written or read; nothing
-- else depends on it (the Meta Ads Dashboard's self-ad score chart computes
-- fresh from ad_performance_daily directly, unrelated to this table).
DROP TABLE IF EXISTS ad_analysis_reports CASCADE;

-- Schedule/last-run columns that only existed to drive the two removed jobs.
ALTER TABLE businesses DROP COLUMN IF EXISTS competitor_analysis_schedule_day;
ALTER TABLE businesses DROP COLUMN IF EXISTS competitor_analysis_schedule_hour;
ALTER TABLE businesses DROP COLUMN IF EXISTS competitor_analysis_last_run_at;
ALTER TABLE businesses DROP COLUMN IF EXISTS self_ad_analysis_schedule_day;
ALTER TABLE businesses DROP COLUMN IF EXISTS self_ad_analysis_schedule_hour;
ALTER TABLE businesses DROP COLUMN IF EXISTS self_ad_analysis_last_run_at;

-- Input config for the removed competitor-analysis job — never surfaced in
-- any Settings UI and never read by anything else.
ALTER TABLE businesses DROP COLUMN IF EXISTS competitor_keywords;
ALTER TABLE businesses DROP COLUMN IF EXISTS ad_script_topics;
