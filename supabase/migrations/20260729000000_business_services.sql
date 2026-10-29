-- Client-configurable list of services the business offers — was hardcoded
-- (inconsistently) in multiple UI dropdowns across Outreach, Meta Ads, and
-- Social. Single source of truth now; fetched once into the business store
-- on app load rather than re-typed per module.

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS services TEXT[] NOT NULL DEFAULT '{}';
