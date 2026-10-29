-- Two real bugs in social_posts as originally designed:
--
-- 1. Every generation/upload path writes status = 'draft' (Posts.tsx's UI
--    is built around a generating -> draft -> published lifecycle), but
--    chk_social_posts_status never allowed 'draft' — so the finalize/insert
--    step was failing against the DB constraint the whole time.
-- 2. connection_id is NOT NULL, so content generated/uploaded with no
--    platform selected (now a supported flow — see CreatePostModal) had
--    nowhere to be recorded: no row meant no "generating..." state and no
--    finished result ever showed up in the Posts page.

ALTER TABLE social_posts DROP CONSTRAINT chk_social_posts_status;
ALTER TABLE social_posts ADD CONSTRAINT chk_social_posts_status
    CHECK (status IN ('generating', 'draft', 'review', 'approved', 'scheduled', 'published', 'failed'));

ALTER TABLE social_posts ALTER COLUMN connection_id DROP NOT NULL;
