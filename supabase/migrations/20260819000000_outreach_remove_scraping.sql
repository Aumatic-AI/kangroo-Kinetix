-- Removes the Apify-based lead-scraping feature and its old data. Outreach
-- leads/lists are now entirely Meta Ads-derived (see
-- MetaLeadsImportService) — nothing scrapes or is manually created anymore.
--
-- Keeps outreach_campaigns rows (and outreach_campaign_leads send history)
-- intact, per explicit decision: only unused leads/lists are removed, not
-- campaign history. Their legacy list_id pointer is nulled first so the
-- subsequent list deletion below doesn't hit its NO ACTION foreign key.
UPDATE outreach_campaigns SET list_id = NULL WHERE list_id IS NOT NULL;

DELETE FROM outreach_leads WHERE source IN ('scraped', 'manual');

-- No list is Meta-derived yet at this point (that mechanism is new), so
-- every existing row here is old manual/scrape-era data.
DELETE FROM outreach_lead_lists;

DROP TABLE IF EXISTS outreach_scrape_jobs;
DROP TYPE IF EXISTS job_status;
