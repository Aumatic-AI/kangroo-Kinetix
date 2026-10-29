-- Lets one outreach campaign target more than one list. outreach_campaigns.list_id
-- stays (now nullable) as the legacy single-list pointer for backward compat;
-- new campaigns are tracked here instead, and every existing campaign's
-- list_id is backfilled into this table so nothing already sent loses its
-- list association.
CREATE TABLE IF NOT EXISTS outreach_campaign_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outreach_campaign_id uuid NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
  list_id uuid NOT NULL REFERENCES outreach_lead_lists(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (outreach_campaign_id, list_id)
);

INSERT INTO outreach_campaign_lists (outreach_campaign_id, list_id)
SELECT id, list_id FROM outreach_campaigns WHERE list_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE outreach_campaigns ALTER COLUMN list_id DROP NOT NULL;
