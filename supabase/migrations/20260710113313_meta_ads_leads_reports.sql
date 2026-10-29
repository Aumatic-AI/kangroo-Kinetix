CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    campaign_name TEXT,
    name TEXT NOT NULL,
    email CITEXT NOT NULL,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ad_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    timeframe TEXT,
    summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY leads_read ON leads FOR SELECT TO authenticated USING (true);
CREATE POLICY leads_write ON leads FOR ALL TO authenticated USING (public.current_user_role() IN ('admin','editor')) WITH CHECK (public.current_user_role() IN ('admin','editor'));

ALTER TABLE ad_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY ad_reports_read ON ad_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY ad_reports_write ON ad_reports FOR ALL TO authenticated USING (public.current_user_role() IN ('admin','editor')) WITH CHECK (public.current_user_role() IN ('admin','editor'));
