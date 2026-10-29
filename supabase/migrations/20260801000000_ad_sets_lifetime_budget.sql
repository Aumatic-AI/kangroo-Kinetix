-- Ad Sets can now carry a Lifetime Budget (not just Daily) when the parent
-- campaign isn't using Campaign Budget Optimization — matches the
-- lifetime_budget_cents column that already exists on campaigns.
ALTER TABLE ad_sets ADD COLUMN IF NOT EXISTS lifetime_budget_cents integer;
