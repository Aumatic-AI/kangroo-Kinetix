-- Upload-Post video publishes commonly fall back to background/async
-- processing (per their docs, anything over ~59s auto-switches) — we need
-- an intermediate status between "draft" and "published"/"failed" for
-- that in-flight window, distinct from "generating" (content creation)
-- and "scheduled" (a future publish time, not yet due).

ALTER TABLE social_posts DROP CONSTRAINT chk_social_posts_status;
ALTER TABLE social_posts ADD CONSTRAINT chk_social_posts_status
    CHECK (status IN ('generating', 'draft', 'publishing', 'review', 'approved', 'scheduled', 'published', 'failed'));
