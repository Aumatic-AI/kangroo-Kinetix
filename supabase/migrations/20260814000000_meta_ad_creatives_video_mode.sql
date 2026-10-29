-- Meta Ads video generation is getting a second video style alongside
-- today's live-action pipeline: "animated poster & graphics" (a designed
-- composition with slow camera movement, not a photoreal human scene).
-- This records which mode generated each video creative, following the
-- same first-class-column pattern already used for video_style/
-- character_type/audio_style on this table.

ALTER TABLE meta_ad_creatives
    ADD COLUMN IF NOT EXISTS video_mode TEXT NOT NULL DEFAULT 'live_action'
        CHECK (video_mode IN ('live_action', 'animated_poster'));
