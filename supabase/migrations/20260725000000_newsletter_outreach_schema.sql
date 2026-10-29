-- Newsletter + Outreach modules. Both share one contacts table (a person can
-- be a newsletter subscriber and/or an outreach contact, tracked
-- independently) instead of duplicating people across per-module tables.
--
-- contact_categories replaces the legacy apps' hardcoded per-vertical tables
-- (table1..table6) with a normal, client-managed list: rename, add, or
-- delete a category without touching code or schema.

CREATE TABLE contact_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, name)
);
CREATE INDEX idx_contact_categories_business ON contact_categories(business_id);

CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    category_id UUID REFERENCES contact_categories(id) ON DELETE SET NULL,
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
    outreach_status contact_status NOT NULL DEFAULT 'new',
    subscriber_status subscriber_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (business_id, email)
);
CREATE INDEX idx_contacts_business ON contacts(business_id);
CREATE INDEX idx_contacts_category ON contacts(category_id);

CREATE TABLE newsletter_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    category_id UUID REFERENCES contact_categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    topic TEXT,
    status newsletter_status NOT NULL DEFAULT 'draft',
    subject TEXT,
    preheader TEXT,
    content JSONB,
    revision_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    external_broadcast_id TEXT,
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_newsletter_campaigns_business ON newsletter_campaigns(business_id);

CREATE TABLE newsletter_campaign_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    newsletter_campaign_id UUID NOT NULL REFERENCES newsletter_campaigns(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
    sent_at TIMESTAMPTZ,
    UNIQUE (newsletter_campaign_id, contact_id)
);
CREATE INDEX idx_newsletter_campaign_contacts_campaign ON newsletter_campaign_contacts(newsletter_campaign_id);

CREATE TABLE outreach_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    category_id UUID REFERENCES contact_categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    goal TEXT,
    tone TEXT,
    message_brief TEXT,
    status campaign_status NOT NULL DEFAULT 'draft',
    generated_subject TEXT,
    generated_body JSONB,
    revision_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    external_campaign_id TEXT,
    daily_limit INTEGER NOT NULL DEFAULT 50,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_outreach_campaigns_business ON outreach_campaigns(business_id);

CREATE TABLE outreach_campaign_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outreach_campaign_id UUID NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
    sent_at TIMESTAMPTZ,
    UNIQUE (outreach_campaign_id, contact_id)
);
CREATE INDEX idx_outreach_campaign_contacts_campaign ON outreach_campaign_contacts(outreach_campaign_id);

CREATE TABLE outreach_scrape_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    category_id UUID REFERENCES contact_categories(id) ON DELETE SET NULL,
    niches TEXT NOT NULL,
    location TEXT NOT NULL,
    max_results INTEGER NOT NULL DEFAULT 100,
    total_scraped INTEGER NOT NULL DEFAULT 0,
    valid_emails INTEGER NOT NULL DEFAULT 0,
    invalid_emails INTEGER NOT NULL DEFAULT 0,
    apify_run_id TEXT,
    status job_status NOT NULL DEFAULT 'queued',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_outreach_scrape_jobs_business ON outreach_scrape_jobs(business_id);

-- Shared by both modules — one event log answers "what happened to this
-- email" regardless of which module sent it, and analytics for either
-- module reads from here instead of calling a provider live.
CREATE TABLE email_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    channel TEXT NOT NULL CHECK (channel IN ('newsletter', 'outreach')),
    newsletter_campaign_id UUID REFERENCES newsletter_campaigns(id) ON DELETE CASCADE,
    outreach_campaign_id UUID REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
    event_type email_event_type NOT NULL,
    provider_message_id TEXT,
    raw_data JSONB,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (channel = 'newsletter' AND newsletter_campaign_id IS NOT NULL AND outreach_campaign_id IS NULL) OR
        (channel = 'outreach' AND outreach_campaign_id IS NOT NULL AND newsletter_campaign_id IS NULL)
    )
);
CREATE INDEX idx_email_events_business ON email_events(business_id);
CREATE INDEX idx_email_events_contact ON email_events(contact_id);
CREATE INDEX idx_email_events_newsletter_campaign ON email_events(newsletter_campaign_id);
CREATE INDEX idx_email_events_outreach_campaign ON email_events(outreach_campaign_id);

-- RLS — same business_id-scoped pattern as every other table in this schema.
ALTER TABLE contact_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY contact_categories_read ON contact_categories FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
CREATE POLICY contact_categories_write ON contact_categories FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY contacts_read ON contacts FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
CREATE POLICY contacts_write ON contacts FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));

ALTER TABLE newsletter_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY newsletter_campaigns_read ON newsletter_campaigns FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
CREATE POLICY newsletter_campaigns_write ON newsletter_campaigns FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));

ALTER TABLE newsletter_campaign_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY newsletter_campaign_contacts_read ON newsletter_campaign_contacts FOR SELECT TO authenticated
    USING (newsletter_campaign_id IN (SELECT id FROM newsletter_campaigns WHERE business_id IN (SELECT public.user_business_ids())));
CREATE POLICY newsletter_campaign_contacts_write ON newsletter_campaign_contacts FOR ALL TO authenticated
    USING (newsletter_campaign_id IN (SELECT id FROM newsletter_campaigns WHERE business_id IN (SELECT public.user_business_write_ids())))
    WITH CHECK (newsletter_campaign_id IN (SELECT id FROM newsletter_campaigns WHERE business_id IN (SELECT public.user_business_write_ids())));

ALTER TABLE outreach_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY outreach_campaigns_read ON outreach_campaigns FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
CREATE POLICY outreach_campaigns_write ON outreach_campaigns FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));

ALTER TABLE outreach_campaign_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY outreach_campaign_contacts_read ON outreach_campaign_contacts FOR SELECT TO authenticated
    USING (outreach_campaign_id IN (SELECT id FROM outreach_campaigns WHERE business_id IN (SELECT public.user_business_ids())));
CREATE POLICY outreach_campaign_contacts_write ON outreach_campaign_contacts FOR ALL TO authenticated
    USING (outreach_campaign_id IN (SELECT id FROM outreach_campaigns WHERE business_id IN (SELECT public.user_business_write_ids())))
    WITH CHECK (outreach_campaign_id IN (SELECT id FROM outreach_campaigns WHERE business_id IN (SELECT public.user_business_write_ids())));

ALTER TABLE outreach_scrape_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY outreach_scrape_jobs_read ON outreach_scrape_jobs FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
CREATE POLICY outreach_scrape_jobs_write ON outreach_scrape_jobs FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));

ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_events_read ON email_events FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
CREATE POLICY email_events_write ON email_events FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));
