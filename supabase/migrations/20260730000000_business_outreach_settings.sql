-- Business-level outreach sending defaults (schedule/timezone/daily limit) —
-- currently hardcoded in src/services/instantly/client.ts (the campaign
-- schedule passed to Instantly on creation) and the campaign create route's
-- daily_limit fallback. This makes them per-business and DB-backed so a
-- future Settings page can edit them without a code change. No settings UI
-- yet — this migration only adds the storage; the app still reads sensible
-- hardcoded defaults today unless/until wired up.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS outreach_settings JSONB NOT NULL DEFAULT '{
  "daily_limit": 50,
  "timezone": "America/Detroit",
  "days": [0, 1, 2, 3, 4, 5, 6],
  "send_window": { "from": "09:00", "to": "18:00" }
}'::jsonb;

-- Services gain an optional description alongside the name — several
-- AI-facing features only ever saw the bare service name (e.g. "Corporate
-- Workspace"); a description lets the business explain what that actually
-- means for them, giving the AI real grounding instead of guessing from the
-- name alone. Converts the existing TEXT[] into a JSONB array of
-- {name, description} objects, preserving whatever names already exist.
-- description is optional (nullable) — nothing requires backfilling it.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS services_jsonb JSONB;

UPDATE businesses
SET services_jsonb = COALESCE(
  (SELECT jsonb_agg(jsonb_build_object('name', s, 'description', NULL)) FROM unnest(services) AS s),
  '[]'::jsonb
)
WHERE services_jsonb IS NULL;

ALTER TABLE businesses ALTER COLUMN services_jsonb SET NOT NULL;
ALTER TABLE businesses ALTER COLUMN services_jsonb SET DEFAULT '[]'::jsonb;

ALTER TABLE businesses DROP COLUMN services;
ALTER TABLE businesses RENAME COLUMN services_jsonb TO services;
