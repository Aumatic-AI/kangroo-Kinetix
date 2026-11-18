-- "Generate now" also works in Live mode.
--
-- Testing (unchanged): jobs go into the UPCOMING week's Testing cycle and are never published.
-- Live: jobs go into the CURRENT week's Live cycle — appended after the slots the Friday run
-- already created, or in a new cycle if there is none — and each creative is scheduled for an
-- AI-chosen time in the next 7 days (never in the past; see schedulingWindow in schedule.ts),
-- then published like any Live content. It uses the current week, not the next one, so it never
-- pre-creates next week's cycle: the Friday run skips an existing cycle (ON CONFLICT DO NOTHING)
-- and would then not apply the weekly frequencies.
--
-- Live content is published publicly, so in Live mode only owners/admins may trigger it.
-- Everything else is unchanged (editor+ in Testing, automation must be enabled, 0–14 per pipeline).

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
    IF s.automation_mode = 'live' AND NOT public.is_business_admin(v_business) THEN
        RAISE EXCEPTION 'in Live mode only owners and admins can generate content (it will be published)'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_week := (date_trunc('week', now() AT TIME ZONE s.generation_timezone)
               + CASE WHEN s.automation_mode = 'live' THEN interval '0 days' ELSE interval '7 days' END)::date;

    INSERT INTO content_generation_cycles (business_id, environment, week_start)
    VALUES (v_business, s.automation_mode, v_week)
    ON CONFLICT (business_id, environment, week_start) DO NOTHING;

    SELECT id INTO v_cycle FROM content_generation_cycles
     WHERE business_id = v_business AND environment = s.automation_mode AND week_start = v_week
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
