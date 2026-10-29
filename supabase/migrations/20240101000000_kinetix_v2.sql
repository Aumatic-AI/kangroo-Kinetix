-- ============================================================
-- KINETIX — Marketing Automation Platform
-- PostgreSQL Schema v2 (Supabase edition)
--
-- Single-tenant (one team). Brands kept as a table so adding
-- a second brand/client later is just an INSERT, not a migration.
--
-- Supabase specifics:
--   * Users come from auth.users -> mirrored in public.profiles
--   * Media files live in Supabase Storage -> we store bucket paths
--   * API keys live in Supabase Vault -> we store vault secret ids
--   * RLS enabled on all tables (policies at the bottom)
--   * pg_cron enqueues scheduled work into the jobs table;
--     an external Node worker polls and executes
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
-- Enable in Supabase dashboard: pg_cron (Database > Extensions)

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role          AS ENUM ('admin', 'editor', 'viewer');
CREATE TYPE platform_type      AS ENUM ('facebook', 'instagram', 'linkedin', 'x', 'tiktok', 'youtube', 'threads');
CREATE TYPE account_status     AS ENUM ('connected', 'expired', 'revoked', 'error');
CREATE TYPE job_status         AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');
CREATE TYPE generation_type    AS ENUM ('ad_copy', 'image', 'video', 'newsletter', 'outreach_email', 'analysis');
CREATE TYPE asset_type         AS ENUM ('image', 'video', 'audio', 'document');
CREATE TYPE asset_source       AS ENUM ('ai_generated', 'uploaded', 'scraped');
CREATE TYPE creative_status    AS ENUM ('draft', 'in_review', 'approved', 'rejected', 'archived');
CREATE TYPE post_status        AS ENUM ('draft', 'scheduled', 'publishing', 'published', 'failed', 'deleted');
CREATE TYPE campaign_status    AS ENUM ('draft', 'active', 'paused', 'completed', 'archived');
CREATE TYPE newsletter_status  AS ENUM ('draft', 'generating', 'ready', 'scheduled', 'sending', 'sent', 'failed');
CREATE TYPE subscriber_status  AS ENUM ('active', 'unsubscribed', 'bounced', 'complained');
CREATE TYPE contact_status     AS ENUM ('new', 'contacted', 'replied', 'interested', 'not_interested', 'bounced', 'do_not_contact');
CREATE TYPE email_event_type   AS ENUM ('sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'complained', 'unsubscribed');

-- ============================================================
-- 1. CORE
-- ============================================================

-- Mirrors auth.users; created automatically via trigger below.
CREATE TABLE profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       CITEXT NOT NULL,
    full_name   TEXT,
    avatar_url  TEXT,
    role        user_role NOT NULL DEFAULT 'editor',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
    RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- The "brand kit" — everything the AI needs to generate on-brand content.
-- You'll have one row for now; more later is just an INSERT.
CREATE TABLE brands (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    website_url     TEXT,
    logo_asset_id   UUID,                    -- FK added after media_assets exists
    description     TEXT,                    -- what the brand does
    tone_of_voice   TEXT,                    -- e.g. "witty, confident, no jargon"
    target_audience TEXT,
    brand_colors    JSONB NOT NULL DEFAULT '[]',   -- ["#FF5733", ...]
    keywords        TEXT[] NOT NULL DEFAULT '{}',
    guidelines      JSONB NOT NULL DEFAULT '{}',   -- dos/don'ts, banned words, CTA prefs
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. INTEGRATIONS
-- ============================================================

CREATE TABLE connected_accounts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id         UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    platform         platform_type NOT NULL,
    account_kind     TEXT NOT NULL,              -- 'page', 'profile', 'ad_account', 'business'
    external_id      TEXT NOT NULL,              -- platform's ID (page_id, ad_account_id)
    display_name     TEXT,
    -- store tokens in Supabase Vault; keep only the vault secret id here
    access_token_ref  TEXT,
    refresh_token_ref TEXT,
    token_expires_at TIMESTAMPTZ,
    scopes           TEXT[] NOT NULL DEFAULT '{}',
    status           account_status NOT NULL DEFAULT 'connected',
    metadata         JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (brand_id, platform, account_kind, external_id)
);
CREATE INDEX idx_connected_accounts_brand ON connected_accounts(brand_id);

-- Third-party API credentials (Apify, OpenAI, Resend, Replicate...)
CREATE TABLE provider_credentials (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider    TEXT NOT NULL,               -- 'apify', 'openai', 'resend', 'replicate'
    label       TEXT NOT NULL DEFAULT 'default',
    secret_ref  TEXT NOT NULL,               -- Supabase Vault secret id
    config      JSONB NOT NULL DEFAULT '{}',
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, label)
);

-- ============================================================
-- 3. COMPETITOR INTELLIGENCE (Apify pipeline)
-- ============================================================

CREATE TABLE competitors (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id      UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    website_url   TEXT,
    meta_page_id  TEXT,                          -- for Meta Ad Library scrapes
    handles       JSONB NOT NULL DEFAULT '{}',   -- {"instagram": "@x", "linkedin": "..."}
    notes         TEXT,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (brand_id, name)
);

CREATE TABLE scrape_jobs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id       UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    competitor_id  UUID REFERENCES competitors(id) ON DELETE SET NULL,
    actor_id       TEXT,                         -- Apify actor used
    apify_run_id   TEXT UNIQUE,
    source         TEXT NOT NULL DEFAULT 'meta_ad_library',
    status         job_status NOT NULL DEFAULT 'queued',
    input_params   JSONB NOT NULL DEFAULT '{}',
    ads_found      INT NOT NULL DEFAULT 0,
    error_message  TEXT,
    started_at     TIMESTAMPTZ,
    finished_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_scrape_jobs_brand ON scrape_jobs(brand_id, created_at DESC);

CREATE TABLE competitor_ads (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scrape_job_id      UUID NOT NULL REFERENCES scrape_jobs(id) ON DELETE CASCADE,
    competitor_id      UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
    platform           platform_type NOT NULL,
    external_ad_id     TEXT,                     -- Ad Library ID (dedupe key)
    format             TEXT,                     -- 'image', 'video', 'carousel'
    headline           TEXT,
    body_text          TEXT,
    cta_text           TEXT,
    landing_url        TEXT,
    creative_urls      TEXT[] NOT NULL DEFAULT '{}',  -- original URLs; mirror to Storage for permanence
    started_running_at TIMESTAMPTZ,
    is_active          BOOLEAN,
    raw_data           JSONB NOT NULL DEFAULT '{}',   -- full Apify payload
    scraped_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (competitor_id, external_ad_id)
);
CREATE INDEX idx_competitor_ads_competitor ON competitor_ads(competitor_id, scraped_at DESC);

CREATE TABLE ad_analyses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id      UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    scrape_job_id UUID REFERENCES scrape_jobs(id) ON DELETE SET NULL,
    title         TEXT,
    summary       TEXT,                        -- human-readable insights
    findings      JSONB NOT NULL DEFAULT '{}', -- {hooks:[], angles:[], ctas:[], visual_styles:[]}
    model_used    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ad_analysis_sources (
    analysis_id      UUID NOT NULL REFERENCES ad_analyses(id) ON DELETE CASCADE,
    competitor_ad_id UUID NOT NULL REFERENCES competitor_ads(id) ON DELETE CASCADE,
    PRIMARY KEY (analysis_id, competitor_ad_id)
);

-- ============================================================
-- 4. AI GENERATION & CREATIVES
-- ============================================================

CREATE TABLE generation_jobs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id      UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    requested_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
    type          generation_type NOT NULL,
    status        job_status NOT NULL DEFAULT 'queued',
    provider      TEXT,                         -- 'openai', 'replicate', 'runway'...
    model         TEXT,
    prompt        TEXT,
    input_params  JSONB NOT NULL DEFAULT '{}',  -- analysis_id, competitor_ad_id, aspect ratio...
    output        JSONB NOT NULL DEFAULT '{}',  -- text output or asset refs
    tokens_used   INT,
    cost_usd      NUMERIC(10,4),
    error_message TEXT,
    started_at    TIMESTAMPTZ,
    finished_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_generation_jobs_brand ON generation_jobs(brand_id, created_at DESC);

CREATE TABLE media_assets (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    type              asset_type NOT NULL,
    source            asset_source NOT NULL DEFAULT 'uploaded',
    generation_job_id UUID REFERENCES generation_jobs(id) ON DELETE SET NULL,
    bucket            TEXT NOT NULL DEFAULT 'media',   -- Supabase Storage bucket
    storage_path      TEXT NOT NULL,                   -- path inside the bucket
    thumbnail_path    TEXT,
    mime_type         TEXT,
    width_px          INT,
    height_px         INT,
    duration_seconds  NUMERIC(8,2),
    size_bytes        BIGINT,
    metadata          JSONB NOT NULL DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (bucket, storage_path)
);
CREATE INDEX idx_media_assets_brand ON media_assets(brand_id, created_at DESC);

ALTER TABLE brands
    ADD CONSTRAINT fk_brands_logo FOREIGN KEY (logo_asset_id)
    REFERENCES media_assets(id) ON DELETE SET NULL;

CREATE TABLE ad_creatives (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    status            creative_status NOT NULL DEFAULT 'draft',
    headline          TEXT,
    primary_text      TEXT,
    description       TEXT,
    cta_text          TEXT,
    landing_url       TEXT,
    -- provenance: what inspired/produced this creative
    inspired_by_ad_id UUID REFERENCES competitor_ads(id) ON DELETE SET NULL,
    analysis_id       UUID REFERENCES ad_analyses(id) ON DELETE SET NULL,
    generation_job_id UUID REFERENCES generation_jobs(id) ON DELETE SET NULL,
    created_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ad_creatives_brand ON ad_creatives(brand_id, status);

CREATE TABLE ad_creative_assets (
    creative_id UUID NOT NULL REFERENCES ad_creatives(id) ON DELETE CASCADE,
    asset_id    UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
    position    INT NOT NULL DEFAULT 0,
    PRIMARY KEY (creative_id, asset_id)
);

-- ============================================================
-- 5. ORGANIC SOCIAL PUBLISHING
-- ============================================================

CREATE TABLE posts (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id             UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    connected_account_id UUID NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
    creative_id          UUID REFERENCES ad_creatives(id) ON DELETE SET NULL,
    caption              TEXT,
    hashtags             TEXT[] NOT NULL DEFAULT '{}',
    status               post_status NOT NULL DEFAULT 'draft',
    scheduled_at         TIMESTAMPTZ,
    published_at         TIMESTAMPTZ,
    external_post_id     TEXT,
    permalink            TEXT,
    error_message        TEXT,
    created_by           UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_posts_brand_status ON posts(brand_id, status);
CREATE INDEX idx_posts_scheduled ON posts(scheduled_at) WHERE status = 'scheduled';

CREATE TABLE post_assets (
    post_id  UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
    position INT NOT NULL DEFAULT 0,
    PRIMARY KEY (post_id, asset_id)
);

-- Time-series snapshots (worker polls platform APIs every N hours)
CREATE TABLE post_metric_snapshots (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    post_id      UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    captured_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    likes        INT NOT NULL DEFAULT 0,
    comments     INT NOT NULL DEFAULT 0,
    shares       INT NOT NULL DEFAULT 0,
    saves        INT NOT NULL DEFAULT 0,
    impressions  INT NOT NULL DEFAULT 0,
    reach        INT NOT NULL DEFAULT 0,
    clicks       INT NOT NULL DEFAULT 0,
    video_views  INT NOT NULL DEFAULT 0,
    raw_data     JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_post_metrics_post_time ON post_metric_snapshots(post_id, captured_at DESC);

-- ============================================================
-- 6. META ADS (paid)
-- ============================================================

CREATE TABLE ad_campaigns (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id              UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    connected_account_id  UUID REFERENCES connected_accounts(id) ON DELETE SET NULL, -- ad account
    name                  TEXT NOT NULL,
    objective             TEXT,                  -- 'OUTCOME_TRAFFIC', 'OUTCOME_LEADS'...
    status                campaign_status NOT NULL DEFAULT 'draft',
    external_campaign_id  TEXT,
    daily_budget_cents    INT,
    lifetime_budget_cents INT,
    currency              TEXT NOT NULL DEFAULT 'USD',
    start_at              TIMESTAMPTZ,
    end_at                TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ad_campaigns_brand ON ad_campaigns(brand_id, status);

CREATE TABLE ad_sets (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id        UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
    name               TEXT NOT NULL,
    status             campaign_status NOT NULL DEFAULT 'draft',
    external_adset_id  TEXT,
    targeting          JSONB NOT NULL DEFAULT '{}',  -- audience, geo, age, interests
    placements         JSONB NOT NULL DEFAULT '{}',
    daily_budget_cents INT,
    bid_strategy       TEXT,
    optimization_goal  TEXT,
    start_at           TIMESTAMPTZ,
    end_at             TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ads (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_set_id      UUID NOT NULL REFERENCES ad_sets(id) ON DELETE CASCADE,
    creative_id    UUID REFERENCES ad_creatives(id) ON DELETE SET NULL,
    name           TEXT NOT NULL,
    status         campaign_status NOT NULL DEFAULT 'draft',
    external_ad_id TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ad_metrics_daily (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ad_id       UUID NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    impressions INT NOT NULL DEFAULT 0,
    reach       INT NOT NULL DEFAULT 0,
    clicks      INT NOT NULL DEFAULT 0,
    spend_cents INT NOT NULL DEFAULT 0,
    conversions INT NOT NULL DEFAULT 0,
    ctr         NUMERIC(8,4),
    cpc_cents   INT,
    cpm_cents   INT,
    raw_data    JSONB NOT NULL DEFAULT '{}',
    UNIQUE (ad_id, metric_date)
);
CREATE INDEX idx_ad_metrics_ad_date ON ad_metrics_daily(ad_id, metric_date DESC);

-- ============================================================
-- 7. NEWSLETTER
-- ============================================================

CREATE TABLE newsletters (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    title             TEXT NOT NULL,
    topic             TEXT,                     -- the input topic given to the AI
    status            newsletter_status NOT NULL DEFAULT 'draft',
    subject_line      TEXT,
    preview_text      TEXT,
    content_html      TEXT,
    content_markdown  TEXT,
    generation_job_id UUID REFERENCES generation_jobs(id) ON DELETE SET NULL,
    scheduled_at      TIMESTAMPTZ,
    sent_at           TIMESTAMPTZ,
    created_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_newsletters_brand ON newsletters(brand_id, created_at DESC);

CREATE TABLE subscribers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id        UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    email           CITEXT NOT NULL,
    full_name       TEXT,
    status          subscriber_status NOT NULL DEFAULT 'active',
    tags            TEXT[] NOT NULL DEFAULT '{}',
    source          TEXT,                      -- 'import', 'signup_form', 'manual'
    subscribed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    unsubscribed_at TIMESTAMPTZ,
    metadata        JSONB NOT NULL DEFAULT '{}',
    UNIQUE (brand_id, email)
);
CREATE INDEX idx_subscribers_brand_status ON subscribers(brand_id, status);

CREATE TABLE newsletter_sends (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    newsletter_id    UUID NOT NULL REFERENCES newsletters(id) ON DELETE CASCADE,
    provider         TEXT,                        -- 'resend', 'sendgrid', 'ses'
    segment_filter   JSONB NOT NULL DEFAULT '{}', -- tags/status used to pick recipients
    total_recipients INT NOT NULL DEFAULT 0,
    started_at       TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE newsletter_recipients (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    send_id             UUID NOT NULL REFERENCES newsletter_sends(id) ON DELETE CASCADE,
    subscriber_id       UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
    provider_message_id TEXT,
    delivered_at        TIMESTAMPTZ,
    opened_at           TIMESTAMPTZ,             -- first open
    clicked_at          TIMESTAMPTZ,             -- first click
    bounced_at          TIMESTAMPTZ,
    unsubscribed_at     TIMESTAMPTZ,
    UNIQUE (send_id, subscriber_id)
);
CREATE INDEX idx_nl_recipients_send ON newsletter_recipients(send_id);

-- ============================================================
-- 8. OUTREACH (cold email)
-- ============================================================

CREATE TABLE outreach_contacts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id     UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    email        CITEXT NOT NULL,
    full_name    TEXT,
    company      TEXT,
    job_title    TEXT,
    linkedin_url TEXT,
    status       contact_status NOT NULL DEFAULT 'new',
    source       TEXT,                         -- 'apify_scrape', 'csv_import', 'manual'
    enrichment   JSONB NOT NULL DEFAULT '{}',  -- extra data for personalization
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (brand_id, email)
);
CREATE INDEX idx_outreach_contacts_brand_status ON outreach_contacts(brand_id, status);

CREATE TABLE outreach_campaigns (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id         UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    goal             TEXT,                      -- what the AI optimizes messaging for
    status           campaign_status NOT NULL DEFAULT 'draft',
    from_email       TEXT,
    from_name        TEXT,
    daily_send_limit INT NOT NULL DEFAULT 50,
    created_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE outreach_sequence_steps (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id      UUID NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
    step_number      INT NOT NULL,
    delay_days       INT NOT NULL DEFAULT 0,    -- days after previous step
    subject_template TEXT,
    body_template    TEXT,                       -- {{placeholders}}; AI fills per contact
    stop_on_reply    BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (campaign_id, step_number)
);

CREATE TABLE outreach_enrollments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id    UUID NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
    contact_id     UUID NOT NULL REFERENCES outreach_contacts(id) ON DELETE CASCADE,
    current_step   INT NOT NULL DEFAULT 0,
    is_completed   BOOLEAN NOT NULL DEFAULT false,
    stopped_reason TEXT,                        -- 'replied', 'bounced', 'unsubscribed', 'manual'
    enrolled_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (campaign_id, contact_id)
);

CREATE TABLE outreach_emails (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id       UUID NOT NULL REFERENCES outreach_enrollments(id) ON DELETE CASCADE,
    step_id             UUID REFERENCES outreach_sequence_steps(id) ON DELETE SET NULL,
    generation_job_id   UUID REFERENCES generation_jobs(id) ON DELETE SET NULL,
    subject             TEXT,
    body                TEXT,
    provider_message_id TEXT,
    scheduled_at        TIMESTAMPTZ,
    sent_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_outreach_emails_enrollment ON outreach_emails(enrollment_id);

-- Event stream for both outreach & newsletter emails (fed by
-- webhook from your email provider, e.g. Resend webhooks)
CREATE TABLE email_events (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email_id     UUID REFERENCES outreach_emails(id) ON DELETE CASCADE,
    recipient_id BIGINT REFERENCES newsletter_recipients(id) ON DELETE CASCADE,
    event_type   email_event_type NOT NULL,
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata     JSONB NOT NULL DEFAULT '{}',   -- link clicked, user agent, bounce reason
    CHECK (email_id IS NOT NULL OR recipient_id IS NOT NULL)
);
CREATE INDEX idx_email_events_email ON email_events(email_id, occurred_at);

-- ============================================================
-- 9. OPS — job queue + audit (the n8n replacement)
--
-- pg_cron INSERTs scheduled jobs; an external Node worker polls
-- with FOR UPDATE SKIP LOCKED and executes (Apify, Meta, Resend,
-- Replicate calls). Dashboard subscribes via Supabase Realtime.
-- ============================================================

CREATE TABLE jobs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type          TEXT NOT NULL,   -- 'scrape.competitor', 'post.publish', 'metrics.poll_posts',
                                   -- 'metrics.sync_ads', 'generate.image', 'generate.video',
                                   -- 'newsletter.send', 'outreach.process_step'
    payload       JSONB NOT NULL DEFAULT '{}',
    status        job_status NOT NULL DEFAULT 'queued',
    priority      INT NOT NULL DEFAULT 0,
    attempts      INT NOT NULL DEFAULT 0,
    max_attempts  INT NOT NULL DEFAULT 3,
    run_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at    TIMESTAMPTZ,
    finished_at   TIMESTAMPTZ,
    error_message TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jobs_pending ON jobs(run_at, priority DESC) WHERE status = 'queued';

-- Worker claim query (run inside a transaction):
--   SELECT * FROM jobs
--   WHERE status = 'queued' AND run_at <= now()
--   ORDER BY priority DESC, run_at
--   LIMIT 1 FOR UPDATE SKIP LOCKED;

CREATE TABLE audit_logs (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,                -- 'post.published', 'campaign.paused'...
    entity_type TEXT,
    entity_id   UUID,
    details     JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_time ON audit_logs(created_at DESC);

-- ============================================================
-- 10. ROW LEVEL SECURITY
--
-- Single-team model: any authenticated user can read; writes
-- require editor/admin. The worker uses the service_role key,
-- which bypasses RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT role FROM profiles WHERE id = auth.uid();
$$;

DO $$
DECLARE t TEXT;
BEGIN
    FOR t IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
            t || '_read', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
             USING (public.current_user_role() IN (''admin'',''editor''))
             WITH CHECK (public.current_user_role() IN (''admin'',''editor''))',
            t || '_write', t);
    END LOOP;
END $$;

-- Tighten later per-table if needed (e.g. only admins touch
-- provider_credentials and connected_accounts):
-- DROP POLICY provider_credentials_write ON provider_credentials;
-- CREATE POLICY provider_credentials_admin ON provider_credentials
--   FOR ALL TO authenticated
--   USING (public.current_user_role() = 'admin')
--   WITH CHECK (public.current_user_role() = 'admin');

-- ============================================================
-- 11. pg_cron SCHEDULES (run after enabling pg_cron extension)
-- ============================================================

-- Daily competitor scrape at 06:00 UTC
-- SELECT cron.schedule('daily-competitor-scrape', '0 6 * * *', $$
--   INSERT INTO jobs (type, payload)
--   SELECT 'scrape.competitor', jsonb_build_object('competitor_id', id)
--   FROM competitors WHERE is_active;
-- $$);

-- Poll post metrics every 3 hours (posts from last 14 days)
-- SELECT cron.schedule('poll-post-metrics', '0 */3 * * *', $$
--   INSERT INTO jobs (type, payload)
--   SELECT 'metrics.poll_posts', jsonb_build_object('post_id', id)
--   FROM posts WHERE status = 'published' AND published_at > now() - interval '14 days';
-- $$);

-- Sync Meta ad metrics daily at 04:00 UTC
-- SELECT cron.schedule('sync-ad-metrics', '0 4 * * *', $$
--   INSERT INTO jobs (type, payload) VALUES ('metrics.sync_ads', '{}');
-- $$);

-- Publish due scheduled posts (every 5 min)
-- SELECT cron.schedule('publish-due-posts', '*/5 * * * *', $$
--   INSERT INTO jobs (type, payload, priority)
--   SELECT 'post.publish', jsonb_build_object('post_id', id), 10
--   FROM posts WHERE status = 'scheduled' AND scheduled_at <= now();
-- $$);

-- Process outreach sequence steps daily at 09:00 UTC
-- SELECT cron.schedule('outreach-steps', '0 9 * * *', $$
--   INSERT INTO jobs (type, payload) VALUES ('outreach.process_step', '{}');
-- $$);
