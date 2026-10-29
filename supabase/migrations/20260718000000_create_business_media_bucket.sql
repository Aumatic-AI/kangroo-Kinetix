-- ============================================================
-- Storage bucket for generated ad creatives (audio, per-scene
-- images, stitched video) and direct uploads. Referenced throughout
-- the Meta Ads generation pipeline and CreateAdModal's direct-upload
-- feature as "business_media", but the bucket itself was never
-- actually created — every upload call was failing with
-- "Bucket not found".
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('business_media', 'business_media', true)
ON CONFLICT (id) DO NOTHING;

-- Public read — media_urls/media_asset public URLs are rendered
-- directly in <video>/<img> tags throughout the app.
CREATE POLICY business_media_public_read ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'business_media');

-- Server-side Inngest jobs write via the service role key, which
-- bypasses RLS entirely — these policies only cover the one
-- client-side write path (CreateAdModal's direct upload), where
-- objects are always keyed as `${businessId}/...`.
CREATE POLICY business_media_business_write ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'business_media'
        AND (storage.foldername(name))[1]::uuid IN (SELECT public.user_business_write_ids())
    );

CREATE POLICY business_media_business_update ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'business_media'
        AND (storage.foldername(name))[1]::uuid IN (SELECT public.user_business_write_ids())
    );

CREATE POLICY business_media_business_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'business_media'
        AND (storage.foldername(name))[1]::uuid IN (SELECT public.user_business_write_ids())
    );
