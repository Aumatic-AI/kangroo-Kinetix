-- Reverts 20260808000000_business_services_category.sql — that migration
-- and the code reading it were reverted per request, so remove the
-- `category` key it backfilled onto businesses.services[] to leave no
-- orphaned data behind.
UPDATE businesses
SET services = (
  SELECT jsonb_agg(s - 'category')
  FROM jsonb_array_elements(services) AS s
)
WHERE services IS NOT NULL AND jsonb_array_length(services) > 0;
