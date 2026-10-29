-- ============================================================
-- KINETIX — Finish retiring "brand" terminology
--
-- The tenant entity is `businesses` / `business_id` everywhere now,
-- but two columns describing the business's marketing identity
-- (brand_voice, brand_colors) and several FK constraint names from
-- the original migration still said "brand". Renaming both for
-- consistency — there is no remaining use of "brand" as a synonym
-- for the tenant/business concept anywhere in the schema after this.
-- ============================================================

ALTER TABLE businesses RENAME COLUMN brand_voice TO business_voice;
ALTER TABLE businesses RENAME COLUMN brand_colors TO business_colors;

ALTER TABLE businesses RENAME CONSTRAINT fk_brands_logo TO fk_businesses_logo;
ALTER TABLE ad_analysis_reports RENAME CONSTRAINT meta_ad_intelligence_brand_id_fkey TO ad_analysis_reports_business_id_fkey;
ALTER TABLE campaigns RENAME CONSTRAINT ad_campaigns_brand_id_fkey TO campaigns_business_id_fkey;
ALTER TABLE media_assets RENAME CONSTRAINT media_assets_brand_id_fkey TO media_assets_business_id_fkey;
ALTER TABLE meta_ad_creatives RENAME CONSTRAINT meta_ad_creatives_brand_id_fkey TO meta_ad_creatives_business_id_fkey;
ALTER TABLE platform_connections RENAME CONSTRAINT connected_accounts_brand_id_fkey TO platform_connections_business_id_fkey;
