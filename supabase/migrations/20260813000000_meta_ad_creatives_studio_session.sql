-- Reverse pointer from a creative back to the Ad Studio chat session that
-- generated it, so the Ad Library can offer a "Chat History" link on
-- studio-originated creatives only — regular (non-studio) creatives keep
-- this null.

ALTER TABLE meta_ad_creatives
    ADD COLUMN IF NOT EXISTS studio_session_id UUID REFERENCES studio_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_meta_ad_creatives_studio_session ON meta_ad_creatives(studio_session_id);
