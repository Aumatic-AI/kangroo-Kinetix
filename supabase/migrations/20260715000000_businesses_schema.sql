-- ============================================================
-- KINETIX — Businesses schema (single-tenant, multi-tenant-shaped)
--
-- Reconciles the live `brands`-based schema with the finalized
-- design in docs/architecture/database_schema.md. Written as
-- renames/ALTERs, not drop+recreate, so existing seeded data
-- (the one business row, any generated ad creatives, scraped
-- competitor ads) survives untouched.
--
-- See docs/architecture/database_schema.md §11 for the full
-- rename table this migration implements.
-- ============================================================

-- ============================================================
-- 1. CORE: brands -> businesses, + business_users membership
-- ============================================================

ALTER TABLE brands RENAME TO businesses;

CREATE TYPE business_role AS ENUM ('owner', 'admin', 'editor', 'viewer');

CREATE TABLE business_users (
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role        business_role NOT NULL DEFAULT 'admin',
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (business_id, user_id)
);

-- Auto-enroll every new profile into the single existing business.
-- The moment a second business is genuinely needed, replace this
-- with a real invite flow (see docs/architecture/system_design.md §3).
CREATE OR REPLACE FUNCTION public.handle_new_user_business_membership()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.business_users (business_id, user_id, role)
    SELECT id, NEW.id, 'admin' FROM public.businesses LIMIT 1
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END; $$;

CREATE TRIGGER on_profile_created_join_business
    AFTER INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_business_membership();

-- Backfill: enroll whatever profiles already exist today, carrying
-- each user's existing profiles.role forward as their membership role.
INSERT INTO business_users (business_id, user_id, role)
SELECT (SELECT id FROM businesses LIMIT 1), p.id, p.role::text::business_role
FROM profiles p
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.user_business_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT business_id FROM business_users WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.user_business_write_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT business_id FROM business_users
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor');
$$;

-- Replace the old role-only policies on the renamed table with
-- business_users-scoped ones.
DROP POLICY IF EXISTS brands_read ON businesses;
DROP POLICY IF EXISTS brands_write ON businesses;
CREATE POLICY businesses_read ON businesses FOR SELECT TO authenticated
    USING (id IN (SELECT public.user_business_ids()));
CREATE POLICY businesses_write ON businesses FOR ALL TO authenticated
    USING (id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (id IN (SELECT public.user_business_write_ids()));

ALTER TABLE business_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_users_read ON business_users FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
CREATE POLICY business_users_write ON business_users FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));

-- Add the general-purpose settings bucket the finalized doc calls for.
ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';

-- ============================================================
-- Helper macro (manual, repeated per table): rebind a table's
-- brand_id column and its RLS policies onto the new business model.
-- ============================================================

-- ============================================================
-- 2. INTEGRATIONS: connected_accounts -> platform_connections,
--    provider_credentials -> api_credentials
-- ============================================================

ALTER TABLE connected_accounts RENAME TO platform_connections;
ALTER TABLE platform_connections RENAME COLUMN brand_id TO business_id;

DROP POLICY IF EXISTS connected_accounts_read ON platform_connections;
DROP POLICY IF EXISTS connected_accounts_write ON platform_connections;
CREATE POLICY platform_connections_read ON platform_connections FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
CREATE POLICY platform_connections_write ON platform_connections FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));

ALTER TABLE provider_credentials RENAME TO api_credentials;
ALTER TABLE api_credentials
    ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
UPDATE api_credentials SET business_id = (SELECT id FROM businesses LIMIT 1) WHERE business_id IS NULL;
ALTER TABLE api_credentials ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE api_credentials DROP CONSTRAINT IF EXISTS provider_credentials_provider_label_key;
ALTER TABLE api_credentials ADD CONSTRAINT uq_api_credentials_business_provider_label UNIQUE (business_id, provider, label);
CREATE INDEX IF NOT EXISTS idx_api_credentials_business ON api_credentials(business_id);

DROP POLICY IF EXISTS provider_credentials_read ON api_credentials;
DROP POLICY IF EXISTS provider_credentials_write ON api_credentials;
CREATE POLICY api_credentials_read ON api_credentials FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
CREATE POLICY api_credentials_write ON api_credentials FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));

-- ============================================================
-- 3. media_assets: rename FK column only
-- ============================================================

ALTER TABLE media_assets RENAME COLUMN brand_id TO business_id;
DROP POLICY IF EXISTS media_assets_read ON media_assets;
DROP POLICY IF EXISTS media_assets_write ON media_assets;
CREATE POLICY media_assets_read ON media_assets FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
CREATE POLICY media_assets_write ON media_assets FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));

-- ============================================================
-- 4. Meta Ads (paid campaign structure): rename + denormalize
--    business_id onto ad_sets/ads for simple RLS (see database_schema.md §4)
-- ============================================================

ALTER TABLE ad_campaigns RENAME TO campaigns;
ALTER TABLE campaigns RENAME COLUMN brand_id TO business_id;
ALTER TABLE campaigns RENAME COLUMN connected_account_id TO ad_account_id;

ALTER TABLE ad_sets ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
UPDATE ad_sets SET business_id = c.business_id FROM campaigns c WHERE ad_sets.campaign_id = c.id AND ad_sets.business_id IS NULL;
ALTER TABLE ad_sets ALTER COLUMN business_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ad_sets_business ON ad_sets(business_id);

ALTER TABLE ads ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
UPDATE ads SET business_id = s.business_id FROM ad_sets s WHERE ads.ad_set_id = s.id AND ads.business_id IS NULL;
ALTER TABLE ads ALTER COLUMN business_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ads_business ON ads(business_id);

-- ads.creative_id used to point at the now-retired `ad_creatives`.
-- Repoint it at the real, working creative generation table.
ALTER TABLE ads DROP CONSTRAINT IF EXISTS ads_creative_id_fkey;
ALTER TABLE ads ADD CONSTRAINT ads_creative_id_fkey
    FOREIGN KEY (creative_id) REFERENCES meta_ad_creatives(id) ON DELETE SET NULL;

ALTER TABLE ad_metrics_daily RENAME TO ad_performance_daily;
ALTER TABLE ad_performance_daily ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;
UPDATE ad_performance_daily SET business_id = a.business_id FROM ads a WHERE ad_performance_daily.ad_id = a.id AND ad_performance_daily.business_id IS NULL;
ALTER TABLE ad_performance_daily ALTER COLUMN business_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ad_performance_daily_business ON ad_performance_daily(business_id);

DROP POLICY IF EXISTS ad_campaigns_read ON campaigns;
DROP POLICY IF EXISTS ad_campaigns_write ON campaigns;
CREATE POLICY campaigns_read ON campaigns FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
CREATE POLICY campaigns_write ON campaigns FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));

DROP POLICY IF EXISTS ad_sets_read ON ad_sets;
DROP POLICY IF EXISTS ad_sets_write ON ad_sets;
CREATE POLICY ad_sets_read ON ad_sets FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
CREATE POLICY ad_sets_write ON ad_sets FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));

DROP POLICY IF EXISTS ads_read ON ads;
DROP POLICY IF EXISTS ads_write ON ads;
CREATE POLICY ads_read ON ads FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
CREATE POLICY ads_write ON ads FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));

DROP POLICY IF EXISTS ad_metrics_daily_read ON ad_performance_daily;
DROP POLICY IF EXISTS ad_metrics_daily_write ON ad_performance_daily;
CREATE POLICY ad_performance_daily_read ON ad_performance_daily FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
CREATE POLICY ad_performance_daily_write ON ad_performance_daily FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));

-- ============================================================
-- 5. Intelligence engine: meta_competitor_ads, meta_self_ad_metrics,
--    meta_ad_intelligence -> ad_analysis_reports
--    (these are the tables the working Inngest jobs actually touch —
--    kept in their real, working shape; see database_schema.md §0/§5)
-- ============================================================

ALTER TABLE meta_competitor_ads RENAME COLUMN brand_id TO business_id;
ALTER TABLE meta_competitor_ads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE meta_competitor_ads
    ADD CONSTRAINT chk_meta_comp_ads_format CHECK (format IN ('image', 'video', 'carousel') OR format IS NULL);

ALTER TABLE meta_competitor_ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_competitor_ads_read ON meta_competitor_ads FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
CREATE POLICY meta_competitor_ads_write ON meta_competitor_ads FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));

ALTER TABLE meta_self_ad_metrics RENAME COLUMN brand_id TO business_id;
ALTER TABLE meta_self_ad_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_self_ad_metrics_read ON meta_self_ad_metrics FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
CREATE POLICY meta_self_ad_metrics_write ON meta_self_ad_metrics FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));

ALTER TABLE meta_ad_intelligence RENAME TO ad_analysis_reports;
ALTER TABLE ad_analysis_reports RENAME COLUMN brand_id TO business_id;
ALTER TABLE ad_analysis_reports
    ADD CONSTRAINT chk_ad_analysis_reports_type CHECK (report_type IN ('competitor', 'self'));
CREATE INDEX IF NOT EXISTS idx_ad_analysis_reports_business_type ON ad_analysis_reports(business_id, report_type, created_at DESC);

ALTER TABLE ad_analysis_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY ad_analysis_reports_read ON ad_analysis_reports FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
CREATE POLICY ad_analysis_reports_write ON ad_analysis_reports FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));

-- ============================================================
-- 6. meta_ad_creatives: kept in its real, working shape. Additive only.
-- ============================================================

ALTER TABLE meta_ad_creatives RENAME COLUMN brand_id TO business_id;
ALTER TABLE meta_ad_creatives
    ADD COLUMN IF NOT EXISTS media_asset_id UUID REFERENCES media_assets(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS revision_history JSONB NOT NULL DEFAULT '[]';
ALTER TABLE meta_ad_creatives DROP CONSTRAINT IF EXISTS chk_meta_ad_creatives_status;
ALTER TABLE meta_ad_creatives
    ADD CONSTRAINT chk_meta_ad_creatives_status
    CHECK (status IN ('pending', 'processing', 'review', 'approved', 'failed'));
CREATE INDEX IF NOT EXISTS idx_meta_ad_creatives_business_status ON meta_ad_creatives(business_id, status);

ALTER TABLE meta_ad_creatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_ad_creatives_read ON meta_ad_creatives FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
CREATE POLICY meta_ad_creatives_write ON meta_ad_creatives FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));

-- ============================================================
-- 7. Leads (new)
-- ============================================================

CREATE TABLE leads (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    ad_id         UUID REFERENCES ads(id) ON DELETE SET NULL,
    meta_lead_id  TEXT NOT NULL,
    meta_form_id  TEXT,
    campaign_name TEXT,
    adset_name    TEXT,
    ad_name       TEXT,
    field_data    JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (meta_lead_id)
);
CREATE INDEX idx_leads_business ON leads(business_id, created_at DESC);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY leads_read ON leads FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
CREATE POLICY leads_write ON leads FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));

-- ============================================================
-- 8. Social Media: social_posts (new, one row per platform),
--    replacing posts/post_assets/post_metric_snapshots
-- ============================================================

CREATE TABLE social_posts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    connection_id     UUID NOT NULL REFERENCES platform_connections(id) ON DELETE CASCADE,
    status            TEXT NOT NULL DEFAULT 'generating',
    format            TEXT,
    idea_prompt       TEXT,
    caption           TEXT,
    generation_inputs JSONB NOT NULL DEFAULT '{}',
    media_asset_id    UUID REFERENCES media_assets(id) ON DELETE SET NULL,
    scheduled_at      TIMESTAMPTZ,
    published_at      TIMESTAMPTZ,
    error_message     TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_social_posts_status CHECK (status IN ('generating', 'review', 'approved', 'scheduled', 'published', 'failed')),
    CONSTRAINT chk_social_posts_format CHECK (format IN ('video', 'image') OR format IS NULL)
);
CREATE INDEX idx_social_posts_business_status ON social_posts(business_id, status);
CREATE INDEX idx_social_posts_scheduled ON social_posts(scheduled_at) WHERE status = 'scheduled';

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY social_posts_read ON social_posts FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
CREATE POLICY social_posts_write ON social_posts FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));

-- ============================================================
-- 9. Retire dead/superseded tables — nothing in the app reads or
--    writes any of these today.
-- ============================================================

DROP TABLE IF EXISTS ad_analysis_sources CASCADE;
DROP TABLE IF EXISTS ad_creative_assets CASCADE;
DROP TABLE IF EXISTS post_assets CASCADE;
DROP TABLE IF EXISTS post_metric_snapshots CASCADE;
DROP TABLE IF EXISTS ad_analyses CASCADE;
DROP TABLE IF EXISTS posts CASCADE;
DROP TABLE IF EXISTS ad_creatives CASCADE;
DROP TABLE IF EXISTS competitor_ads CASCADE;
DROP TABLE IF EXISTS scrape_jobs CASCADE;
DROP TABLE IF EXISTS competitors CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;

-- ============================================================
-- Note: newsletter/outreach tables (newsletters, subscribers,
-- newsletter_sends, newsletter_recipients, outreach_contacts,
-- outreach_campaigns, outreach_sequence_steps, outreach_enrollments,
-- outreach_emails, email_events) are left untouched. Their brand_id
-- foreign keys still point at the same table (now named `businesses`)
-- and continue to work as-is — renaming their brand_id columns to
-- business_id is deferred to whenever those modules actually get
-- built, per docs/modules/newsletter.md and outreach.md.
-- ============================================================
