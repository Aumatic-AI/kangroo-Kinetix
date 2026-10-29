-- outreach_campaign_lists (added in 20260818000000) was missing RLS
-- policies entirely — same business_id-scoped pattern as
-- outreach_campaign_leads, its closest analog (a join table hanging off
-- outreach_campaigns).
ALTER TABLE outreach_campaign_lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outreach_campaign_lists_read ON outreach_campaign_lists;
CREATE POLICY outreach_campaign_lists_read ON outreach_campaign_lists FOR SELECT TO authenticated
    USING (outreach_campaign_id IN (SELECT id FROM outreach_campaigns WHERE business_id IN (SELECT public.user_business_ids())));
DROP POLICY IF EXISTS outreach_campaign_lists_write ON outreach_campaign_lists;
CREATE POLICY outreach_campaign_lists_write ON outreach_campaign_lists FOR ALL TO authenticated
    USING (outreach_campaign_id IN (SELECT id FROM outreach_campaigns WHERE business_id IN (SELECT public.user_business_write_ids())))
    WITH CHECK (outreach_campaign_id IN (SELECT id FROM outreach_campaigns WHERE business_id IN (SELECT public.user_business_write_ids())));
