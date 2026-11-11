-- Remove the Meta Ads module's schema. The product is now posting automation
-- only; nothing in the app reads or writes any of these tables any more.
--
-- Kept on purpose: media_assets, social_posts, platform_connections, businesses
-- and every content_*/property_* table (none have an FK to the tables below;
-- only these tables referenced platform_connections, via campaigns.ad_account_id).
--
-- Order matters because of foreign keys:
--   studio_messages -> studio_sessions <-> meta_ad_creatives <- ads -> ad_sets -> campaigns
--   ad_performance_daily, leads -> ads
-- studio_sessions and meta_ad_creatives reference each other, so the cycle is
-- broken by dropping studio_sessions with CASCADE (which drops only the FK
-- constraint on meta_ad_creatives.studio_session_id, not the table).

DROP TABLE IF EXISTS public.studio_messages;
DROP TABLE IF EXISTS public.ad_performance_daily;
DROP TABLE IF EXISTS public.leads;
DROP TABLE IF EXISTS public.studio_sessions CASCADE;
DROP TABLE IF EXISTS public.ads;
DROP TABLE IF EXISTS public.ad_sets;
DROP TABLE IF EXISTS public.campaigns;
DROP TABLE IF EXISTS public.meta_ad_creatives;

-- Only the dropped tables used this enum.
DROP TYPE IF EXISTS public.campaign_status;
