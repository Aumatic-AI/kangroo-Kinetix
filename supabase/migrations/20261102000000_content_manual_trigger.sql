-- Testing-phase additions to content automation:
--  1. Video formats re-based on Seedance 2.0 (4–15 s per clip, so 1 clip ≤15 s or
--     2 clips ≤30 s total; the original 30 s / 2×20 s targets exceed the model).
--  2. Where the AI's *proposed* posting schedule lives while nothing is published
--     (Testing content never gets social_posts rows).
--  3. content_automation_settings.auto_run_enabled — gates the weekly cron.
--     Defaults false: the system is in place but never starts on its own.
--  4. trigger_manual_content_cycle(): atomic "generate now" used by the temporary
--     manual button. Testing mode only.

-- 1 ---------------------------------------------------------------------------
ALTER TABLE content_revisions DROP CONSTRAINT IF EXISTS chk_revisions_video_format;
ALTER TABLE content_revisions ADD CONSTRAINT chk_revisions_video_format
    CHECK (video_format IS NULL OR video_format IN ('single_clip', 'two_clip'));

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
        END IF;
        NEW.validated_at := now();
    END IF;
    RETURN NEW;
END;
$$;

-- 2 ---------------------------------------------------------------------------
-- proposed_schedule: [{platform, scheduled_at (UTC ISO), timezone, local_time, reason}]
-- content_decision:  {content_type, video_format?, reason, ...} — the AI's own rationale.
-- Neither is frozen by the validated-revision guard (informational, never publishable).
ALTER TABLE content_revisions
    ADD COLUMN IF NOT EXISTS proposed_schedule JSONB,
    ADD COLUMN IF NOT EXISTS content_decision  JSONB;

-- 3 ---------------------------------------------------------------------------
ALTER TABLE content_automation_settings
    ADD COLUMN IF NOT EXISTS auto_run_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.content_settings_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NOT public.is_service_context()
           AND NOT public.is_business_admin(NEW.business_id)
           AND (NEW.automation_mode <> 'testing' OR NEW.is_enabled OR NEW.auto_run_enabled) THEN
            RAISE EXCEPTION 'only owners/admins can enable automation or select Live mode'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        NEW.mode_changed_at := NULL;
        NEW.mode_changed_by := NULL;
        RETURN NEW;
    END IF;

    IF NEW.business_id <> OLD.business_id THEN
        RAISE EXCEPTION 'business_id is immutable' USING ERRCODE = 'check_violation';
    END IF;
    IF (NEW.automation_mode IS DISTINCT FROM OLD.automation_mode
        OR NEW.is_enabled IS DISTINCT FROM OLD.is_enabled
        OR NEW.auto_run_enabled IS DISTINCT FROM OLD.auto_run_enabled)
       AND NOT public.is_service_context()
       AND NOT public.is_business_admin(NEW.business_id) THEN
        RAISE EXCEPTION 'only owners/admins can change the automation mode, pause/resume, or auto-run'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.automation_mode IS DISTINCT FROM OLD.automation_mode THEN
        NEW.mode_changed_at := now();
        NEW.mode_changed_by := auth.uid();
    ELSE
        NEW.mode_changed_at := OLD.mode_changed_at;
        NEW.mode_changed_by := OLD.mode_changed_by;
    END IF;
    RETURN NEW;
END;
$$;

-- 4 ---------------------------------------------------------------------------
-- Adds p_social / p_linkedin creatives to the UPCOMING Monday-start week's
-- Testing cycle (creating it if needed) and creates the queue slots. Each click
-- adds slots; the 14-per-pipeline weekly CHECK is the cap. Editor+ only, and
-- only while automation is enabled AND in Testing mode — it can never produce
-- Live content.
CREATE OR REPLACE FUNCTION public.trigger_manual_content_cycle(p_social INT DEFAULT 1, p_linkedin INT DEFAULT 1)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_business UUID; s content_automation_settings%ROWTYPE; v_week DATE; v_cycle UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_social < 0 OR p_linkedin < 0 OR p_social + p_linkedin < 1 THEN
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
       OR (SELECT linkedin_target_count FROM content_generation_cycles WHERE id = v_cycle) + p_linkedin > 14 THEN
        RAISE EXCEPTION 'this week already has the maximum of 14 creatives per pipeline';
    END IF;

    UPDATE content_generation_cycles
       SET social_target_count = social_target_count + p_social,
           linkedin_target_count = linkedin_target_count + p_linkedin,
           status = 'pending', completed_at = NULL
     WHERE id = v_cycle;

    PERFORM public.ensure_cycle_slots(v_cycle);
    RETURN v_cycle;
END;
$$;
REVOKE ALL ON FUNCTION public.trigger_manual_content_cycle(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trigger_manual_content_cycle(int, int) TO authenticated, service_role;
