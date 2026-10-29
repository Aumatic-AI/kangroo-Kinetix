-- Caches slow-to-fetch Upload-Post analytics (profile analytics, total
-- impressions per period) so the Root and Social dashboards read a single
-- fast Postgres row instead of waiting on Upload-Post's own API, which
-- aggregates live from each connected platform server-side and can take
-- several seconds. A scheduled Inngest job (jobs-social-analytics-cache-refresh)
-- is the only writer; dashboard routes only ever read.
CREATE TABLE IF NOT EXISTS upload_post_analytics_cache (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    cache_key text NOT NULL,
    data jsonb NOT NULL,
    fetched_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (business_id, cache_key)
);

ALTER TABLE upload_post_analytics_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY upload_post_analytics_cache_read ON upload_post_analytics_cache
    FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));

CREATE POLICY upload_post_analytics_cache_write ON upload_post_analytics_cache
    FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));
