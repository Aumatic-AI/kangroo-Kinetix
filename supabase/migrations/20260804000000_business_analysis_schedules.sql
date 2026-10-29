-- User-configurable day/time for the two weekly background jobs
-- (Competitor Analysis, Self Ad Analysis) — replaces their hardcoded cron
-- expressions ("0 0 * * 0" / "0 2 * * 0"). Inngest cron triggers can't
-- read a database value at run time, so both jobs now run on a frequent
-- fixed hourly checker instead and compare against these columns
-- (business-schedule.ts's shouldRunScheduledJob) to decide whether to
-- actually do the real work this tick. Day: 0 (Sunday) – 6 (Saturday),
-- matching the same convention already used by outreach_settings.days.
-- Defaults to Monday (1) at 00:00 for both, per the product decision —
-- same effective day as the old jobs, just user-editable from here on.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS competitor_analysis_schedule_day SMALLINT NOT NULL DEFAULT 1 CHECK (competitor_analysis_schedule_day BETWEEN 0 AND 6);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS competitor_analysis_schedule_hour SMALLINT NOT NULL DEFAULT 0 CHECK (competitor_analysis_schedule_hour BETWEEN 0 AND 23);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS competitor_analysis_last_run_at TIMESTAMPTZ;

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS self_ad_analysis_schedule_day SMALLINT NOT NULL DEFAULT 1 CHECK (self_ad_analysis_schedule_day BETWEEN 0 AND 6);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS self_ad_analysis_schedule_hour SMALLINT NOT NULL DEFAULT 0 CHECK (self_ad_analysis_schedule_hour BETWEEN 0 AND 23);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS self_ad_analysis_last_run_at TIMESTAMPTZ;
