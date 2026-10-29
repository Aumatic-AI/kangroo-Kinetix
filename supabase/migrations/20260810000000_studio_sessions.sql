-- Generic chat-based content-creation sessions. Named without "ad" so the
-- same two tables can back other chat-driven generation flows later (e.g.
-- Social Media) via a different `product_area`, not just Meta Ads.
-- `product_area` is 'meta_ads_image' for the only consumer that exists today.

CREATE TABLE IF NOT EXISTS studio_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    product_area TEXT NOT NULL DEFAULT 'meta_ads_image',
    service TEXT,
    status TEXT NOT NULL DEFAULT 'collecting_brief'
        CHECK (status IN ('collecting_brief', 'awaiting_answers', 'generating', 'reviewing', 'failed', 'finalized')),
    initial_idea TEXT NOT NULL,
    aspect_ratio TEXT NOT NULL DEFAULT '4:5'
        CHECK (aspect_ratio IN ('1:1', '4:5', '9:16', '16:9')),
    reference_image_url TEXT,
    qa_brief JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw_image_url TEXT,
    creative_id UUID REFERENCES meta_ad_creatives(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_studio_sessions_business ON studio_sessions(business_id);

CREATE TABLE IF NOT EXISTS studio_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES studio_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    kind TEXT NOT NULL CHECK (kind IN ('text', 'questions', 'image')),
    content TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_studio_messages_session ON studio_messages(session_id);

ALTER TABLE studio_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS studio_sessions_read ON studio_sessions;
CREATE POLICY studio_sessions_read ON studio_sessions FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
DROP POLICY IF EXISTS studio_sessions_write ON studio_sessions;
CREATE POLICY studio_sessions_write ON studio_sessions FOR ALL TO authenticated
    USING (business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (business_id IN (SELECT public.user_business_write_ids()));

ALTER TABLE studio_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS studio_messages_read ON studio_messages;
CREATE POLICY studio_messages_read ON studio_messages FOR SELECT TO authenticated
    USING (session_id IN (SELECT id FROM studio_sessions WHERE business_id IN (SELECT public.user_business_ids())));
DROP POLICY IF EXISTS studio_messages_write ON studio_messages;
CREATE POLICY studio_messages_write ON studio_messages FOR ALL TO authenticated
    USING (session_id IN (SELECT id FROM studio_sessions WHERE business_id IN (SELECT public.user_business_write_ids())))
    WITH CHECK (session_id IN (SELECT id FROM studio_sessions WHERE business_id IN (SELECT public.user_business_write_ids())));
