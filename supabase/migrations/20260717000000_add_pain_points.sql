-- ============================================================
-- Ad generation prompts (image/video/idea) need the customer
-- pain points a business's ads should speak to. Every other field
-- the proven n8n prompts reference already has a home on
-- businesses (core_offerings, business_voice, target_audience,
-- industry) — this is the one genuinely missing field.
-- ============================================================

ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS pain_points TEXT;
