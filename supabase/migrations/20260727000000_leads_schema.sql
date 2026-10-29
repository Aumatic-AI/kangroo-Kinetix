-- Outreach is being fully separated from Newsletter: no more shared
-- `contacts` table. Outreach now owns its own `outreach_leads` +
-- `outreach_lead_lists` tables (final terminology: "list", used
-- consistently in DB, API, and UI — prefixed `outreach_` because a plain
-- `leads` table already exists for Meta Ads' Facebook lead-form
-- responses, a completely unrelated concept). Newsletter's subscriber
-- model is deferred/out of scope for this pass and will be rebuilt
-- separately later — its FKs into `contacts` are dropped along with the
-- table (CASCADE), which is expected fallout.
--
-- Nothing here has gone live for the client yet, so there is no real data
-- to preserve — truncate/rebuild rather than migrate in place.
--
-- Written idempotently (guards on every non-naturally-idempotent
-- statement) since a prior partial-apply attempt already happened against
-- the wrong table names (`leads`/`lead_lists`, since dropped/unused) —
-- each statement here is safe to run again regardless of exact state.

DROP TABLE IF EXISTS outreach_campaign_contacts;
DROP TABLE IF EXISTS lead_lists; -- wrong name from an earlier partial attempt this session, always empty

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'outreach_campaigns')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'outreach_scrape_jobs')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_events') THEN
    TRUNCATE outreach_campaigns, outreach_scrape_jobs, email_events;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_status') THEN
    ALTER TYPE contact_status RENAME TO lead_status;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS outreach_lead_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, name)
);
CREATE INDEX IF NOT EXISTS idx_outreach_lead_lists_business ON outreach_lead_lists(business_id);

CREATE TABLE IF NOT EXISTS outreach_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    list_id UUID REFERENCES outreach_lead_lists(id) ON DELETE SET NULL,
    first_name TEXT,
    last_name TEXT,
    email TEXT NOT NULL,
    phone TEXT,
    linkedin_url TEXT,
    company TEXT,
    city TEXT,
    country TEXT,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('scraped', 'manual', 'import')),
    email_verification_status TEXT NOT NULL DEFAULT 'unverified'
        CHECK (email_verification_status IN ('unverified', 'verified', 'invalid', 'catch_all', 'risky')),
    status lead_status NOT NULL DEFAULT 'new',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, email)
);
CREATE INDEX IF NOT EXISTS idx_outreach_leads_business ON outreach_leads(business_id);
CREATE INDEX IF NOT EXISTS idx_outreach_leads_list ON outreach_leads(list_id);

-- outreach_campaigns / outreach_scrape_jobs move from contact_categories to outreach_lead_lists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'outreach_campaigns' AND column_name = 'category_id') THEN
    ALTER TABLE outreach_campaigns DROP COLUMN category_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'outreach_campaigns' AND column_name = 'list_id') THEN
    ALTER TABLE outreach_campaigns ADD COLUMN list_id UUID NOT NULL REFERENCES outreach_lead_lists(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'outreach_scrape_jobs' AND column_name = 'category_id') THEN
    ALTER TABLE outreach_scrape_jobs DROP COLUMN category_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'outreach_scrape_jobs' AND column_name = 'list_id') THEN
    ALTER TABLE outreach_scrape_jobs ADD COLUMN list_id UUID NOT NULL REFERENCES outreach_lead_lists(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Per-campaign send status, decoupled from the lead's own status — this is
-- what lets the same lead be reused across campaigns with no reset step.
CREATE TABLE IF NOT EXISTS outreach_campaign_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outreach_campaign_id UUID NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES outreach_leads(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
    sent_at TIMESTAMPTZ,
    UNIQUE (outreach_campaign_id, lead_id)
);
CREATE INDEX IF NOT EXISTS idx_outreach_campaign_leads_campaign ON outreach_campaign_leads(outreach_campaign_id);

DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS contact_categories CASCADE;

-- RLS — same business_id-scoped pattern as every other table in this schema.
ALTER TABLE outreach_lead_lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outreach_lead_lists_read ON outreach_lead_lists;
CREATE POLICY outreach_lead_lists_read ON outreach_lead_lists FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
DROP POLICY IF EXISTS outreach_lead_lists_write ON outreach_lead_lists;
CREATE POLICY outreach_lead_lists_write ON outreach_lead_lists FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));

ALTER TABLE outreach_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outreach_leads_read ON outreach_leads;
CREATE POLICY outreach_leads_read ON outreach_leads FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
DROP POLICY IF EXISTS outreach_leads_write ON outreach_leads;
CREATE POLICY outreach_leads_write ON outreach_leads FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));

ALTER TABLE outreach_campaign_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outreach_campaign_leads_read ON outreach_campaign_leads;
CREATE POLICY outreach_campaign_leads_read ON outreach_campaign_leads FOR SELECT TO authenticated
    USING (outreach_campaign_id IN (SELECT id FROM outreach_campaigns WHERE business_id IN (SELECT public.user_business_ids())));
DROP POLICY IF EXISTS outreach_campaign_leads_write ON outreach_campaign_leads;
CREATE POLICY outreach_campaign_leads_write ON outreach_campaign_leads FOR ALL TO authenticated
    USING (outreach_campaign_id IN (SELECT id FROM outreach_campaigns WHERE business_id IN (SELECT public.user_business_write_ids())))
    WITH CHECK (outreach_campaign_id IN (SELECT id FROM outreach_campaigns WHERE business_id IN (SELECT public.user_business_write_ids())));
