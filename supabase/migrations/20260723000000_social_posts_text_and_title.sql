-- Text-only posts (no media) for the platforms that support them (Facebook,
-- X, LinkedIn) — a real, distinct format alongside image/video, not a
-- special case of either. Also adds a `title` column, separate from
-- `caption`: YouTube's Upload-Post publish call needs a distinct title +
-- description, which formatPlatformCaptions already generates for youtube
-- (`{ title, text }`) but had nowhere to be stored until now.

ALTER TABLE social_posts DROP CONSTRAINT chk_social_posts_format;
ALTER TABLE social_posts ADD CONSTRAINT chk_social_posts_format
    CHECK (format IN ('video', 'image', 'text') OR format IS NULL);

ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS title text;
