-- Live social publishing (1–2) and blog publish times (3).
--
-- 1. finish_publish: a 'published' or 'failed' outcome now also clears
--    publish_outcome_unknown. recover_stale_publishing can flag a post unknown
--    while its worker is still mid-call (lease expired); when that worker then
--    finishes with a definite outcome, the flag must not linger — an unknown
--    'published' post was excluded from every view of "done".
-- 2. confirm_unknown_publish: lets a signed-in editor resolve an unknown-outcome
--    post from the gallery after checking the platform (resolve_unknown_publish
--    itself stays service-role only).

CREATE OR REPLACE FUNCTION public.finish_publish(
    p_post UUID, p_attempt SMALLINT, p_outcome TEXT,
    p_error TEXT DEFAULT NULL, p_retryable BOOLEAN DEFAULT false,
    p_platform_post_id TEXT DEFAULT NULL, p_response JSONB DEFAULT NULL, p_block_reason TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sp social_posts%ROWTYPE; v_status TEXT; v_log TEXT; v_since INT;
BEGIN
    SELECT * INTO sp FROM social_posts WHERE id = p_post FOR UPDATE;
    IF NOT FOUND OR sp.property_content_id IS NULL THEN RAISE EXCEPTION 'automation post % not found', p_post; END IF;
    IF sp.status <> 'publishing' OR sp.publish_attempt_count <> p_attempt THEN
        RAISE EXCEPTION 'stale publish attempt % for post % (status %, attempt %)',
            p_attempt, p_post, sp.status, sp.publish_attempt_count USING ERRCODE = 'check_violation';
    END IF;
    v_since := sp.publish_attempt_count - sp.retry_base_attempt;

    IF p_outcome = 'published' THEN
        UPDATE social_posts SET status = 'published', published_at = now(), platform_post_id = p_platform_post_id,
               error_message = NULL, publish_outcome_unknown = false,
               locked_by = NULL, locked_until = NULL WHERE id = p_post;
        v_status := 'published'; v_log := 'succeeded';
    ELSIF p_outcome = 'failed' THEN
        IF p_retryable AND v_since < 3 THEN
            UPDATE social_posts SET status = 'scheduled', error_message = left(p_error, 500),
                   next_attempt_at = now() + make_interval(mins => 5 * v_since), publish_outcome_unknown = false,
                   locked_by = NULL, locked_until = NULL WHERE id = p_post;
            v_status := 'scheduled';
        ELSE
            UPDATE social_posts SET status = 'failed', error_message = left(p_error, 500), publish_outcome_unknown = false,
                   locked_by = NULL, locked_until = NULL WHERE id = p_post;
            v_status := 'failed';
        END IF;
        v_log := 'failed';
    ELSIF p_outcome = 'unknown' THEN
        UPDATE social_posts SET publish_outcome_unknown = true, error_message = left(p_error, 500),
               locked_by = NULL, locked_until = NULL WHERE id = p_post;
        v_status := 'publishing'; v_log := 'unknown';
    ELSIF p_outcome = 'blocked' THEN
        v_status := CASE
            WHEN p_block_reason IN ('automation_disabled', 'mode_not_live') THEN 'held'
            WHEN p_block_reason LIKE 'connection\_%' THEN 'failed'
            ELSE 'skipped' END;
        UPDATE social_posts SET status = v_status, error_message = 'blocked before publish: ' || COALESCE(p_block_reason, 'unknown'),
               publish_outcome_unknown = false, locked_by = NULL, locked_until = NULL WHERE id = p_post;
        v_log := 'blocked';
    ELSE
        RAISE EXCEPTION 'unknown outcome %', p_outcome;
    END IF;

    UPDATE publishing_logs
       SET status = v_log, finished_at = now(), error_message = left(p_error, 500),
           response_metadata = COALESCE(p_response, response_metadata)
     WHERE social_post_id = p_post AND attempt_number = p_attempt;
    RETURN v_status;
END;
$$;

-- An editor confirms what actually happened to an unknown-outcome post (they
-- checked the platform). Same effect as resolve_unknown_publish.
CREATE OR REPLACE FUNCTION public.confirm_unknown_publish(p_post UUID, p_outcome TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_business UUID;
BEGIN
    SELECT business_id INTO v_business FROM social_posts WHERE id = p_post AND property_content_id IS NOT NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'automation post not found' USING ERRCODE = 'no_data_found'; END IF;
    IF auth.uid() IS NULL OR v_business NOT IN (SELECT public.user_business_write_ids()) THEN
        RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_outcome NOT IN ('published', 'failed') THEN RAISE EXCEPTION 'outcome must be published or failed'; END IF;
    RETURN public.resolve_unknown_publish(p_post, p_outcome, NULL,
        'confirmed by a user in the gallery (' || COALESCE(auth.uid()::text, '?') || ')');
END;
$$;

REVOKE ALL ON FUNCTION public.finish_publish(UUID, SMALLINT, TEXT, TEXT, BOOLEAN, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_publish(UUID, SMALLINT, TEXT, TEXT, BOOLEAN, TEXT, JSONB, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.confirm_unknown_publish(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_unknown_publish(UUID, TEXT) TO authenticated, service_role;

-- ============================================================
-- 3. Blogs publish at an AI-chosen time, like social posts
-- ============================================================
-- A blog revision now carries proposed_schedule with one slot, platform 'blog'
-- (from the week plan, or the AI for that blog alone). A Live blog's publication
-- waits for that time instead of publishing the moment it is generated. Unlike a
-- social post there is no lateness cut-off: a blog held while paused is published
-- when released, at its time or right away if that has passed.

ALTER TABLE blog_publications ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
UPDATE blog_publications SET scheduled_at = created_at WHERE scheduled_at IS NULL;

CREATE OR REPLACE FUNCTION public.property_content_queue_blog_publication()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_at TIMESTAMPTZ;
BEGIN
    IF NEW.environment = 'live' AND NEW.pipeline_type = 'blog'
       AND NEW.generation_status = 'completed' AND NEW.current_revision_id IS NOT NULL
       AND NEW.archived_at IS NULL THEN
        SELECT (slot ->> 'scheduled_at')::timestamptz INTO v_at
          FROM content_revisions r,
               jsonb_array_elements(CASE WHEN jsonb_typeof(r.proposed_schedule) = 'array' THEN r.proposed_schedule ELSE '[]'::jsonb END) slot
         WHERE r.id = NEW.current_revision_id AND slot ->> 'platform' = 'blog'
         LIMIT 1;
        v_at := GREATEST(COALESCE(v_at, now()), now());
        INSERT INTO blog_publications (business_id, property_content_id, content_revision_id, scheduled_at, next_attempt_at)
        VALUES (NEW.business_id, NEW.id, NEW.current_revision_id, v_at, v_at)
        ON CONFLICT (property_content_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.property_content_queue_blog_publication() FROM PUBLIC, anon, authenticated;

-- Releasing held blogs keeps their planned time (or now, if it has passed). Social part unchanged.
CREATE OR REPLACE FUNCTION public.content_settings_hold_release()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE was_live BOOLEAN; now_live BOOLEAN;
BEGIN
    was_live := OLD.automation_mode = 'live' AND OLD.is_enabled;
    now_live := NEW.automation_mode = 'live' AND NEW.is_enabled;
    IF was_live AND NOT now_live THEN
        UPDATE social_posts SET status = 'held'
         WHERE business_id = NEW.business_id AND property_content_id IS NOT NULL AND status = 'scheduled';
        UPDATE blog_publications SET status = 'held'
         WHERE business_id = NEW.business_id AND status = 'pending';
    ELSIF now_live AND NOT was_live THEN
        PERFORM public.release_held_posts(NEW.business_id);
        -- The settings API sends content/blog-publish for every pending row after this.
        UPDATE blog_publications SET status = 'pending', next_attempt_at = GREATEST(COALESCE(scheduled_at, now()), now())
         WHERE business_id = NEW.business_id AND status = 'held';
    END IF;
    RETURN NEW;
END;
$$;
