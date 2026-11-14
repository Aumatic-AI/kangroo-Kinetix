-- Social creatives: the user chooses image vs video (no longer the AI).
--
--  1. content_automation_settings: separate weekly frequencies for social IMAGES and social VIDEOS.
--     social_frequency_per_week stays, as a generated column (images + videos), so anything still
--     reading the total keeps working. Existing totals are carried over as images.
--  2. content_generation_cycles.social_video_target_count: how many of the cycle's social slots
--     are videos (the rest are images).
--  3. ensure_cycle_slots (weekly cycle): every social slot it creates gets its content_type,
--     videos spread evenly through the week.
--  4. trigger_manual_content_cycle ("Generate now"): takes image and video counts separately and
--     creates each social job with its content_type set. The 3-argument version is dropped.
--
-- The worker passes a job's content_type to the planner as a fixed format (the same mechanism
-- gallery regenerations use). A NULL content_type on an older social job still means
-- "the AI decides".

-- 1 ---------------------------------------------------------------------------
ALTER TABLE content_automation_settings
    ADD COLUMN social_image_frequency_per_week SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN social_video_frequency_per_week SMALLINT NOT NULL DEFAULT 0;

UPDATE content_automation_settings SET social_image_frequency_per_week = social_frequency_per_week;

ALTER TABLE content_automation_settings DROP CONSTRAINT IF EXISTS chk_cas_social_freq;
ALTER TABLE content_automation_settings DROP COLUMN social_frequency_per_week;
ALTER TABLE content_automation_settings
    ADD COLUMN social_frequency_per_week SMALLINT
        GENERATED ALWAYS AS (social_image_frequency_per_week + social_video_frequency_per_week) STORED;
ALTER TABLE content_automation_settings ADD CONSTRAINT chk_cas_social_freq CHECK (
    social_image_frequency_per_week >= 0
    AND social_video_frequency_per_week >= 0
    AND social_image_frequency_per_week + social_video_frequency_per_week <= 14
);

-- 2 ---------------------------------------------------------------------------
ALTER TABLE content_generation_cycles
    ADD COLUMN social_video_target_count SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE content_generation_cycles ADD CONSTRAINT chk_cycles_social_video_target
    CHECK (social_video_target_count BETWEEN 0 AND social_target_count);

-- 3 ---------------------------------------------------------------------------
-- Slot g (1..T) of a cycle with V videos is a video when floor(g·V/T) steps up at g, which
-- spreads the V videos evenly across the T slots (T=3, V=1 → image, image, video).
CREATE OR REPLACE FUNCTION public.ensure_cycle_slots(p_cycle UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c content_generation_cycles%ROWTYPE; n INT;
BEGIN
    SELECT * INTO c FROM content_generation_cycles WHERE id = p_cycle;
    IF NOT FOUND THEN RAISE EXCEPTION 'cycle % not found', p_cycle; END IF;
    INSERT INTO content_generation_queue (business_id, cycle_id, pipeline_type, slot_index, content_type)
    SELECT c.business_id, c.id, 'social', g,
           CASE WHEN (g * c.social_video_target_count) / c.social_target_count
                   > ((g - 1) * c.social_video_target_count) / c.social_target_count
                THEN 'video' ELSE 'image' END
      FROM generate_series(1, c.social_target_count) g
    UNION ALL
    SELECT c.business_id, c.id, 'linkedin', g, NULL FROM generate_series(1, c.linkedin_target_count) g
    UNION ALL
    SELECT c.business_id, c.id, 'blog', g, NULL FROM generate_series(1, c.blog_target_count) g
    ON CONFLICT (cycle_id, pipeline_type, slot_index) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;

-- 4 ---------------------------------------------------------------------------
-- Same behaviour as 20261112134926 (exact jobs appended after the highest slot, holes never
-- refilled, cycle row locked), with social split into images and videos.
DROP FUNCTION IF EXISTS public.trigger_manual_content_cycle(int, int, int);

CREATE OR REPLACE FUNCTION public.trigger_manual_content_cycle(
    p_social_image INT DEFAULT 0, p_social_video INT DEFAULT 0, p_linkedin INT DEFAULT 0, p_blog INT DEFAULT 0)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_business UUID; s content_automation_settings%ROWTYPE; v_week DATE; v_cycle UUID;
    r RECORD; v_last INT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_social_image < 0 OR p_social_video < 0 OR p_linkedin < 0 OR p_blog < 0
       OR p_social_image + p_social_video + p_linkedin + p_blog < 1 THEN
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

    -- Social images first, then social videos, then the other pipelines; each appends after the
    -- pipeline's highest slot, so the two social rows share the social slot numbering.
    FOR r IN SELECT * FROM (VALUES (1, 'social', 'image', p_social_image), (2, 'social', 'video', p_social_video),
                                   (3, 'linkedin', NULL, p_linkedin), (4, 'blog', NULL, p_blog)) v(ord, pipeline, ctype, n)
              WHERE n > 0 ORDER BY ord LOOP
        SELECT COALESCE(max(slot_index), 0) INTO v_last
          FROM content_generation_queue WHERE cycle_id = v_cycle AND pipeline_type = r.pipeline;
        IF v_last + r.n > 14 THEN
            RAISE EXCEPTION 'this week already has the maximum of 14 % creatives', r.pipeline;
        END IF;
        INSERT INTO content_generation_queue (business_id, cycle_id, pipeline_type, slot_index, content_type)
        SELECT v_business, v_cycle, r.pipeline, v_last + g, r.ctype FROM generate_series(1, r.n) g;
    END LOOP;

    UPDATE content_generation_cycles c
       SET social_target_count = GREATEST(c.social_target_count, COALESCE((SELECT max(slot_index) FROM content_generation_queue WHERE cycle_id = v_cycle AND pipeline_type = 'social'), 0)),
           social_video_target_count = GREATEST(c.social_video_target_count, (SELECT count(*) FROM content_generation_queue WHERE cycle_id = v_cycle AND pipeline_type = 'social' AND content_type = 'video')),
           linkedin_target_count = GREATEST(c.linkedin_target_count, COALESCE((SELECT max(slot_index) FROM content_generation_queue WHERE cycle_id = v_cycle AND pipeline_type = 'linkedin'), 0)),
           blog_target_count = GREATEST(c.blog_target_count, COALESCE((SELECT max(slot_index) FROM content_generation_queue WHERE cycle_id = v_cycle AND pipeline_type = 'blog'), 0)),
           status = 'pending', completed_at = NULL
     WHERE c.id = v_cycle;

    RETURN v_cycle;
END;
$$;
REVOKE ALL ON FUNCTION public.trigger_manual_content_cycle(int, int, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trigger_manual_content_cycle(int, int, int, int) TO authenticated, service_role;
