-- Remove the Outreach module entirely. DESTRUCTIVE: drops all outreach data
-- (campaigns, leads, lists, send history) — not recoverable without a backup.
-- email_events was only ever written by Outreach/newsletter (newsletter already
-- removed), so it goes too. The Meta Ads `leads` table is unrelated and kept.

DROP TABLE IF EXISTS outreach_campaign_leads CASCADE;
DROP TABLE IF EXISTS outreach_campaign_lists CASCADE;
DROP TABLE IF EXISTS email_events CASCADE;
DROP TABLE IF EXISTS outreach_campaigns CASCADE;
DROP TABLE IF EXISTS outreach_leads CASCADE;
DROP TABLE IF EXISTS outreach_lead_lists CASCADE;

ALTER TABLE businesses DROP COLUMN IF EXISTS outreach_settings;
