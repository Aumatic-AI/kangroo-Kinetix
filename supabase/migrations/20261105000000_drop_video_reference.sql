-- The Social AI video pipeline (and its Settings "Video Character Reference")
-- was removed; video is now generated only by content automation, which never
-- read these columns. Any uploaded reference photos stay in the
-- business_media storage bucket (this does not delete storage objects).
ALTER TABLE public.businesses
    DROP COLUMN IF EXISTS video_reference_enabled,
    DROP COLUMN IF EXISTS video_reference_male_url,
    DROP COLUMN IF EXISTS video_reference_female_url;
