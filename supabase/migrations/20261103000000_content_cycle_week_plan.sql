-- Weekly posting plan for a generation cycle. Written by the weekly planner
-- (service role) BEFORE the cycle's jobs start, so the AI chooses the days/times
-- for the whole week together — frequency-aware and spread out — instead of each
-- creative picking its own slot in isolation. Shape (see schedule.ts WeekPlan):
--   { timezone, planned_at,
--     social:   [{ slot_index, slots: [{ platform, scheduled_at, timezone, local, reason, adjusted }] }],
--     linkedin: [{ slot_index, slots: [...] }] }
-- NULL = no plan (e.g. the manual trigger); jobs then fall back to per-creative scheduling.
-- Authenticated users cannot write this table (existing RLS/grants), so only the service role sets it.
ALTER TABLE content_generation_cycles ADD COLUMN IF NOT EXISTS week_plan JSONB;
