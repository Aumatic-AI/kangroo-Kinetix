-- Blog pipeline for content automation.
--
-- A third pipeline ('blog', content_type 'blog') next to 'social' and 'linkedin'.
-- Blogs are display-only: they live in the gallery tables (property_content /
-- content_revisions / media_assets) and never get a social_posts row, a posting
-- schedule or a platform. Everything is additive:
--   1. widen the pipeline / content_type CHECKs
--   2. a weekly frequency (settings) and a target count (cycles) for blogs
--   3. ensure_cycle_slots creates blog slots
--   4. claim_property_for_job: blogs rotate through the listings on their OWN
--      history, and do not distort the social/LinkedIn rotation (and vice versa)
--   5. content_revisions_guard: a blog revision needs its body
--   6. trigger_manual_content_cycle gets a p_blog argument
--
-- Blog document layout (no new columns):
--   content_revisions.script       -> the post title
--   content_revisions.caption      -> the full post as Markdown (images inlined)
--   content_revisions.hashtags     -> tags
--   content_revisions.format_reason-> why the AI chose this format
--   content_revisions.media_asset_id -> the hero image
--   content_revisions.content_decision.blog -> structured post (blocks, images, angle, format, ...)

-- 1 ---------------------------------------------------------------------------
ALTER TABLE content_generation_queue DROP CONSTRAINT IF EXISTS chk_queue_pipeline;
ALTER TABLE content_generation_queue ADD CONSTRAINT chk_queue_pipeline
    CHECK (pipeline_type IN ('social', 'linkedin', 'blog'));

ALTER TABLE content_generation_queue DROP CONSTRAINT IF EXISTS chk_queue_content_type;
ALTER TABLE content_generation_queue ADD CONSTRAINT chk_queue_content_type CHECK (
    content_type IS NULL
    OR (pipeline_type = 'social' AND content_type IN ('video', 'image'))
    OR (pipeline_type = 'linkedin' AND content_type = 'text_image')
    OR (pipeline_type = 'blog' AND content_type = 'blog')
);

ALTER TABLE property_promotions DROP CONSTRAINT IF EXISTS chk_pp_pipeline;
ALTER TABLE property_promotions ADD CONSTRAINT chk_pp_pipeline
    CHECK (pipeline_type IN ('social', 'linkedin', 'blog'));

ALTER TABLE property_content DROP CONSTRAINT IF EXISTS chk_pc_pipeline;
ALTER TABLE property_content ADD CONSTRAINT chk_pc_pipeline
    CHECK (pipeline_type IN ('social', 'linkedin', 'blog'));

ALTER TABLE property_content DROP CONSTRAINT IF EXISTS chk_pc_content_type;
ALTER TABLE property_content ADD CONSTRAINT chk_pc_content_type CHECK (
    (pipeline_type = 'social' AND content_type IN ('video', 'image'))
    OR (pipeline_type = 'linkedin' AND content_type = 'text_image')
    OR (pipeline_type = 'blog' AND content_type = 'blog')
);

-- 2 ---------------------------------------------------------------------------
ALTER TABLE content_automation_settings
    ADD COLUMN IF NOT EXISTS blog_frequency_per_week SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE content_automation_settings DROP CONSTRAINT IF EXISTS chk_cas_blog_freq;
ALTER TABLE content_automation_settings ADD CONSTRAINT chk_cas_blog_freq
    CHECK (blog_frequency_per_week BETWEEN 0 AND 14);

ALTER TABLE content_generation_cycles
    ADD COLUMN IF NOT EXISTS blog_target_count SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE content_generation_cycles DROP CONSTRAINT IF EXISTS chk_cycles_targets;
ALTER TABLE content_generation_cycles ADD CONSTRAINT chk_cycles_targets CHECK (
    social_target_count BETWEEN 0 AND 14
    AND linkedin_target_count BETWEEN 0 AND 14
    AND blog_target_count BETWEEN 0 AND 14
);

-- 3 ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_cycle_slots(p_cycle UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c content_generation_cycles%ROWTYPE; n INT;
BEGIN
    SELECT * INTO c FROM content_generation_cycles WHERE id = p_cycle;
    IF NOT FOUND THEN RAISE EXCEPTION 'cycle % not found', p_cycle; END IF;
    INSERT INTO content_generation_queue (business_id, cycle_id, pipeline_type, slot_index)
    SELECT c.business_id, c.id, 'social', g FROM generate_series(1, c.social_target_count) g
    UNION ALL
    SELECT c.business_id, c.id, 'linkedin', g FROM generate_series(1, c.linkedin_target_count) g
    UNION ALL
    SELECT c.business_id, c.id, 'blog', g FROM generate_series(1, c.blog_target_count) g
    ON CONFLICT (cycle_id, pipeline_type, slot_index) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;

-- 4 ---------------------------------------------------------------------------
-- Identical to the original selection algorithm, except that the "shared
-- history" criteria (1, 2, 3, 6) only look at promotions in the SAME rotation
-- family: blog promotions form one family, social + LinkedIn the other. So a
-- listing that just got a blog is not pushed to the back of the social rotation,
-- and blogs still spread across listings fairly.
CREATE OR REPLACE FUNCTION public.claim_property_for_job(p_queue UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q content_generation_queue%ROWTYPE; c content_generation_cycles%ROWTYPE; v_prop UUID;
BEGIN
    SELECT * INTO q FROM content_generation_queue WHERE id = p_queue FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'queue job % not found', p_queue; END IF;
    IF q.property_id IS NOT NULL THEN RETURN q.property_id; END IF;   -- retry keeps its property
    SELECT * INTO c FROM content_generation_cycles WHERE id = q.cycle_id;

    -- Serialize selection per (business, environment) so concurrent jobs cannot pick the same property.
    PERFORM pg_advisory_xact_lock(hashtextextended(c.business_id::text || ':' || c.environment, 0));

    SELECT p.id INTO v_prop
      FROM properties p
     WHERE p.business_id = c.business_id
       AND p.status = 'active'
       AND EXISTS (SELECT 1 FROM property_images i
                    WHERE i.property_id = p.id AND i.validation_status <> 'broken')
     ORDER BY
        -- 1. not already being generated for this environment by another job (same family)
        EXISTS (SELECT 1 FROM property_promotions x
                 WHERE x.property_id = p.id AND x.environment = c.environment AND x.status = 'claimed'
                   AND ((x.pipeline_type = 'blog') = (q.pipeline_type = 'blog'))),
        -- 2. not already used in this cycle (while alternatives remain)
        EXISTS (SELECT 1 FROM property_promotions x
                 WHERE x.property_id = p.id AND x.cycle_id = q.cycle_id AND x.status IN ('claimed', 'generated')
                   AND ((x.pipeline_type = 'blog') = (q.pipeline_type = 'blog'))),
        -- 3. shared history: fewest successful promotions in this environment (same family)
        (SELECT count(*) FROM property_promotions x
          WHERE x.property_id = p.id AND x.environment = c.environment AND x.status = 'generated'
            AND ((x.pipeline_type = 'blog') = (q.pipeline_type = 'blog'))),
        -- 4. per-pipeline fairness: fewest successful promotions for THIS pipeline
        (SELECT count(*) FROM property_promotions x
          WHERE x.property_id = p.id AND x.environment = c.environment
            AND x.pipeline_type = q.pipeline_type AND x.status = 'generated'),
        -- 5. least recently promoted for this pipeline (never-promoted first)
        (SELECT max(x.generated_at) FROM property_promotions x
          WHERE x.property_id = p.id AND x.environment = c.environment
            AND x.pipeline_type = q.pipeline_type AND x.status = 'generated') NULLS FIRST,
        -- 6. least recently promoted overall (same family)
        (SELECT max(x.generated_at) FROM property_promotions x
          WHERE x.property_id = p.id AND x.environment = c.environment AND x.status = 'generated'
            AND ((x.pipeline_type = 'blog') = (q.pipeline_type = 'blog'))) NULLS FIRST,
        -- 7. import / append order, then id: fully deterministic
        p.rotation_seq, p.id
     LIMIT 1;

    IF v_prop IS NULL THEN RETURN NULL; END IF;

    INSERT INTO property_promotions (business_id, property_id, environment, pipeline_type, cycle_id, queue_id)
    VALUES (c.business_id, v_prop, c.environment, q.pipeline_type, q.cycle_id, q.id)
    ON CONFLICT (queue_id) DO NOTHING;
    UPDATE content_generation_queue SET property_id = v_prop WHERE id = q.id;
    RETURN v_prop;
END;
$$;

-- 5 ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.content_revisions_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE ctype TEXT; expected INT;
BEGIN
    IF OLD.validation_status = 'valid' AND (
           NEW.script IS DISTINCT FROM OLD.script
        OR NEW.caption IS DISTINCT FROM OLD.caption
        OR NEW.hashtags IS DISTINCT FROM OLD.hashtags
        OR NEW.media_asset_id IS DISTINCT FROM OLD.media_asset_id
        OR NEW.video_format IS DISTINCT FROM OLD.video_format
        OR NEW.video_duration IS DISTINCT FROM OLD.video_duration) THEN
        RAISE EXCEPTION 'a validated revision is immutable; create a new revision'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.validation_status = 'valid' AND OLD.validation_status IS DISTINCT FROM 'valid' THEN
        SELECT content_type INTO ctype FROM property_content WHERE id = NEW.property_content_id;
        IF NEW.media_asset_id IS NULL THEN
            RAISE EXCEPTION 'cannot validate a revision without its final media'
                USING ERRCODE = 'check_violation';
        END IF;
        IF ctype = 'video' THEN
            IF NEW.video_format IS NULL OR NEW.video_duration IS NULL THEN
                RAISE EXCEPTION 'cannot validate a video revision without video_format and video_duration'
                    USING ERRCODE = 'check_violation';
            END IF;
            expected := CASE NEW.video_format WHEN 'single_clip' THEN 1 ELSE 2 END;
            IF (SELECT count(*) FROM content_clips
                 WHERE revision_id = NEW.id AND status = 'completed'
                   AND media_asset_id IS NOT NULL AND clip_index <= expected) <> expected THEN
                RAISE EXCEPTION 'cannot validate: all % clip(s) must be completed', expected
                    USING ERRCODE = 'check_violation';
            END IF;
        ELSIF ctype = 'text_image' AND COALESCE(btrim(NEW.caption), '') = '' THEN
            RAISE EXCEPTION 'cannot validate a LinkedIn revision without text'
                USING ERRCODE = 'check_violation';
        ELSIF ctype = 'blog' AND (COALESCE(btrim(NEW.caption), '') = '' OR COALESCE(btrim(NEW.script), '') = '') THEN
            RAISE EXCEPTION 'cannot validate a blog revision without its title and body'
                USING ERRCODE = 'check_violation';
        END IF;
        NEW.validated_at := now();
    END IF;
    RETURN NEW;
END;
$$;

-- 6 ---------------------------------------------------------------------------
-- Replaces trigger_manual_content_cycle(int, int) with a 3-argument version
-- (p_blog defaults to 0, so existing callers keep working). Same safety rules:
-- editor+ only, automation enabled, Testing mode only — it can never produce
-- Live content.
DROP FUNCTION IF EXISTS public.trigger_manual_content_cycle(int, int);

CREATE OR REPLACE FUNCTION public.trigger_manual_content_cycle(
    p_social INT DEFAULT 1, p_linkedin INT DEFAULT 1, p_blog INT DEFAULT 0)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_business UUID; s content_automation_settings%ROWTYPE; v_week DATE; v_cycle UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_social < 0 OR p_linkedin < 0 OR p_blog < 0 OR p_social + p_linkedin + p_blog < 1 THEN
        RAISE EXCEPTION 'nothing to generate';
    END IF;

    SELECT w INTO v_business FROM (SELECT public.user_business_write_ids() AS w) x LIMIT 1;
    IF v_business IS NULL THEN
        RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO s FROM content_automation_settings WHERE business_id = v_business;
    IF NOT FOUND OR NOT s.is_enabled THEN
        RAISE EXCEPTION 'automation is paused — enable it in Automation settings first';
    END IF;
    IF s.automation_mode <> 'testing' THEN
        RAISE EXCEPTION 'the manual trigger only runs in Testing mode';
    END IF;

    v_week := (date_trunc('week', now() AT TIME ZONE s.generation_timezone) + interval '7 days')::date;

    INSERT INTO content_generation_cycles (business_id, environment, week_start)
    VALUES (v_business, 'testing', v_week)
    ON CONFLICT (business_id, environment, week_start) DO NOTHING;

    SELECT id INTO v_cycle FROM content_generation_cycles
     WHERE business_id = v_business AND environment = 'testing' AND week_start = v_week
     FOR UPDATE;

    IF (SELECT social_target_count FROM content_generation_cycles WHERE id = v_cycle) + p_social > 14
       OR (SELECT linkedin_target_count FROM content_generation_cycles WHERE id = v_cycle) + p_linkedin > 14
       OR (SELECT blog_target_count FROM content_generation_cycles WHERE id = v_cycle) + p_blog > 14 THEN
        RAISE EXCEPTION 'this week already has the maximum of 14 creatives per pipeline';
    END IF;

    UPDATE content_generation_cycles
       SET social_target_count = social_target_count + p_social,
           linkedin_target_count = linkedin_target_count + p_linkedin,
           blog_target_count = blog_target_count + p_blog,
           status = 'pending', completed_at = NULL
     WHERE id = v_cycle;

    PERFORM public.ensure_cycle_slots(v_cycle);
    RETURN v_cycle;
END;
$$;
REVOKE ALL ON FUNCTION public.trigger_manual_content_cycle(int, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trigger_manual_content_cycle(int, int, int) TO authenticated, service_role;
