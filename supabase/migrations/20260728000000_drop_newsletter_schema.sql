-- Newsletter is being removed for now (will be rebuilt separately, later).
-- Drop its remaining tables and the now-newsletter-only column/constraint
-- on the shared email_events log. contacts/contact_categories were already
-- dropped in the earlier outreach/newsletter split.

DROP TABLE IF EXISTS newsletter_campaign_contacts CASCADE;
DROP TABLE IF EXISTS newsletter_campaigns CASCADE;

-- Drop whatever check constraint currently exists on email_events (it
-- enforced the newsletter/outreach dual-channel shape) rather than a
-- hardcoded name, since it was altered once already in an earlier migration.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name FROM pg_constraint WHERE conrelid = 'email_events'::regclass AND contype = 'c';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE email_events DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE email_events DROP COLUMN IF EXISTS newsletter_campaign_id;

DROP TYPE IF EXISTS newsletter_status;
DROP TYPE IF EXISTS subscriber_status;
