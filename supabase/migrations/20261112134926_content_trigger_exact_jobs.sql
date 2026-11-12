-- "Generate now" creates EXACTLY the jobs requested.
--
-- Before: trigger_manual_content_cycle raised the week's targets by the requested counts and then
-- called ensure_cycle_slots, which creates a queue job for EVERY slot 1..target that has none. A
-- slot whose job row had gone missing was silently refilled, so one click for 1 social creative
-- started 2 jobs (seen 2026-11-12: target was already 1 with no slot-1 row; the click raised it to
-- 2 and filled slots 1 and 2).
--
-- Now: for each pipeline, the requested number of jobs is appended after the highest existing
-- slot_index, and the target becomes at least that highest slot (so targets keep counting the
-- slots allocated). Holes are never refilled by this function. ensure_cycle_slots is unchanged:
-- the weekly cycle still uses it, where topping up to the weekly target is intended.
-- The cycle row is locked FOR UPDATE, so two concurrent clicks can't pick the same slot.

CREATE OR REPLACE FUNCTION public.trigger_manual_content_cycle(
    p_social INT DEFAULT 1, p_linkedin INT DEFAULT 1, p_blog INT DEFAULT 0)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_business UUID; s content_automation_settings%ROWTYPE; v_week DATE; v_cycle UUID;
    r RECORD; v_last INT;
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

    FOR r IN SELECT * FROM (VALUES ('social', p_social), ('linkedin', p_linkedin), ('blog', p_blog)) v(pipeline, n) WHERE n > 0 LOOP
        SELECT COALESCE(max(slot_index), 0) INTO v_last
          FROM content_generation_queue WHERE cycle_id = v_cycle AND pipeline_type = r.pipeline;
        IF v_last + r.n > 14 THEN
            RAISE EXCEPTION 'this week already has the maximum of 14 % creatives', r.pipeline;
        END IF;
        INSERT INTO content_generation_queue (business_id, cycle_id, pipeline_type, slot_index)
        SELECT v_business, v_cycle, r.pipeline, v_last + g FROM generate_series(1, r.n) g;
    END LOOP;

    UPDATE content_generation_cycles c
       SET social_target_count = GREATEST(c.social_target_count, COALESCE((SELECT max(slot_index) FROM content_generation_queue WHERE cycle_id = v_cycle AND pipeline_type = 'social'), 0)),
           linkedin_target_count = GREATEST(c.linkedin_target_count, COALESCE((SELECT max(slot_index) FROM content_generation_queue WHERE cycle_id = v_cycle AND pipeline_type = 'linkedin'), 0)),
           blog_target_count = GREATEST(c.blog_target_count, COALESCE((SELECT max(slot_index) FROM content_generation_queue WHERE cycle_id = v_cycle AND pipeline_type = 'blog'), 0)),
           status = 'pending', completed_at = NULL
     WHERE c.id = v_cycle;

    RETURN v_cycle;
END;
$$;
REVOKE ALL ON FUNCTION public.trigger_manual_content_cycle(int, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trigger_manual_content_cycle(int, int, int) TO authenticated, service_role;
