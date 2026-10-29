-- The original constraint required a campaign to be attributed on every
-- event. In practice a webhook event isn't always reliably tagged with
-- which campaign triggered it (e.g. a delivery-delayed event) — relax to
-- only forbid the wrong-channel FK being set, not require the right one.
ALTER TABLE email_events DROP CONSTRAINT IF EXISTS email_events_check;
ALTER TABLE email_events ADD CONSTRAINT email_events_channel_fk_check CHECK (
    NOT (channel = 'newsletter' AND outreach_campaign_id IS NOT NULL) AND
    NOT (channel = 'outreach' AND newsletter_campaign_id IS NOT NULL)
);
