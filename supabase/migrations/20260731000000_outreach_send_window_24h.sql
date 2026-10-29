-- The initial default sending window (09:00-18:00 America/Detroit) meant a
-- campaign created outside that window just sat queued with zero visible
-- send activity, easily mistaken for "broken" — confirmed live: a freshly
-- created, healthy (non-paused) campaign showed zero Instantly analytics
-- for hours because it was created before the window opened. Widening the
-- default to the full day removes that confusion; a real business-hours
-- window can be reintroduced later via a Settings UI once one exists.
ALTER TABLE businesses ALTER COLUMN outreach_settings SET DEFAULT '{
  "daily_limit": 50,
  "timezone": "America/Detroit",
  "days": [0, 1, 2, 3, 4, 5, 6],
  "send_window": { "from": "00:00", "to": "23:59" }
}'::jsonb;

UPDATE businesses
SET outreach_settings = jsonb_set(outreach_settings, '{send_window}', '{"from": "00:00", "to": "23:59"}'::jsonb)
WHERE outreach_settings -> 'send_window' = '{"from": "09:00", "to": "18:00"}'::jsonb;
