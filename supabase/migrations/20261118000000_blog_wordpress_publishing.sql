-- Blog → WordPress publishing (Live only).
--
-- A Live blog creative gets exactly one `blog_publications` row the moment it has a
-- valid current revision (trigger on property_content, so no code path can forget it).
-- The Inngest worker claims the row, uploads the images, creates the WordPress post
-- (status "publish") and records the post id/URL. Testing content can never get a row
-- (CHECK + trigger), so during testing blogs stay in the gallery only.
--
-- Same safety model as social_posts, minus scheduling (a blog is published as soon as
-- it is generated):
--  * blog_publish_block_reason() is the single definition of "publishable now"
--    (Live row, Live content, automation enabled AND mode Live, property active, content
--    not archived, revision current and valid). Checked at claim and right before the
--    WordPress call.
--  * pausing or switching to Testing holds pending rows; going Live again releases them.
--  * WordPress has no idempotency key, so the worker looks for its own post (exact title,
--    created after the row) before creating one: a retry after a lost response adopts the
--    post instead of duplicating it.
--  * a Live blog with a publication row can't be regenerated or switch revision, and
--    can't be deleted from the gallery (RESTRICT FK) — same rule as social posts.

-- ============================================================
-- 1. Table
-- ============================================================

CREATE TABLE blog_publications (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id          UUID NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
    property_content_id  UUID NOT NULL,
    content_revision_id  UUID NOT NULL,
    environment          TEXT NOT NULL DEFAULT 'live' CHECK (environment = 'live'),
    destination          TEXT NOT NULL DEFAULT 'wordpress' CHECK (destination = 'wordpress'),
    status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'publishing', 'published', 'failed', 'held', 'skipped')),
    attempt_count        SMALLINT NOT NULL DEFAULT 0,
    next_attempt_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_by            TEXT,
    locked_until         TIMESTAMPTZ,
    publish_started_at   TIMESTAMPTZ,
    published_at         TIMESTAMPTZ,
    wp_post_id           BIGINT,
    wp_url               TEXT,
    -- image id (from content_decision.blog.images) → { id, url } of the uploaded WordPress media,
    -- saved as each upload finishes so a retry never uploads an image twice.
    wp_media             JSONB NOT NULL DEFAULT '{}',
    error_message        TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_blog_pub_content UNIQUE (property_content_id),
    CONSTRAINT uq_blog_pub_id_business UNIQUE (id, business_id),
    CONSTRAINT fk_blog_pub_content FOREIGN KEY (property_content_id, business_id)
        REFERENCES property_content(id, business_id) ON DELETE RESTRICT,
    CONSTRAINT fk_blog_pub_revision FOREIGN KEY (content_revision_id, property_content_id)
        REFERENCES content_revisions(id, property_content_id) ON DELETE RESTRICT,
    CONSTRAINT chk_blog_pub_published CHECK (status <> 'published' OR (wp_post_id IS NOT NULL AND published_at IS NOT NULL))
);
CREATE INDEX idx_blog_pub_business_status ON blog_publications(business_id, status);

CREATE TRIGGER trg_blog_pub_updated_at BEFORE UPDATE ON blog_publications
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 2. Guard: insert rules, immutable identity, state machine
-- ============================================================

CREATE OR REPLACE FUNCTION public.blog_publications_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE pc property_content%ROWTYPE; v_rev_status TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT * INTO pc FROM property_content WHERE id = NEW.property_content_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'content not found' USING ERRCODE = 'check_violation'; END IF;
        IF pc.environment <> 'live' THEN
            RAISE EXCEPTION 'Testing content can never be published' USING ERRCODE = 'check_violation';
        END IF;
        IF pc.pipeline_type <> 'blog' THEN
            RAISE EXCEPTION 'only blog content is published to WordPress' USING ERRCODE = 'check_violation';
        END IF;
        IF pc.current_revision_id IS DISTINCT FROM NEW.content_revision_id THEN
            RAISE EXCEPTION 'a publication must use the current revision' USING ERRCODE = 'check_violation';
        END IF;
        SELECT validation_status INTO v_rev_status FROM content_revisions WHERE id = NEW.content_revision_id;
        IF v_rev_status IS DISTINCT FROM 'valid' THEN
            RAISE EXCEPTION 'a publication needs a valid revision' USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.property_content_id IS DISTINCT FROM OLD.property_content_id
       OR NEW.content_revision_id IS DISTINCT FROM OLD.content_revision_id
       OR NEW.business_id IS DISTINCT FROM OLD.business_id
       OR NEW.environment IS DISTINCT FROM OLD.environment
       OR NEW.destination IS DISTINCT FROM OLD.destination THEN
        RAISE EXCEPTION 'blog publication identity is immutable' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.wp_post_id IS NOT NULL AND NEW.wp_post_id IS DISTINCT FROM OLD.wp_post_id THEN
        RAISE EXCEPTION 'wp_post_id cannot change once recorded' USING ERRCODE = 'check_violation';
    END IF;
    -- published / skipped are terminal.
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
           (OLD.status = 'pending'    AND NEW.status IN ('publishing', 'held', 'skipped'))
        OR (OLD.status = 'publishing' AND NEW.status IN ('published', 'failed', 'pending', 'held', 'skipped'))
        OR (OLD.status = 'held'       AND NEW.status IN ('pending', 'skipped'))
        OR (OLD.status = 'failed'     AND NEW.status IN ('pending', 'skipped'))) THEN
        RAISE EXCEPTION 'illegal blog_publications transition % -> %', OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_blog_pub_guard BEFORE INSERT OR UPDATE ON blog_publications
    FOR EACH ROW EXECUTE FUNCTION public.blog_publications_guard();

-- ============================================================
-- 3. A Live blog gets its publication row the moment it is complete
-- ============================================================

CREATE OR REPLACE FUNCTION public.property_content_queue_blog_publication()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.environment = 'live' AND NEW.pipeline_type = 'blog'
       AND NEW.generation_status = 'completed' AND NEW.current_revision_id IS NOT NULL
       AND NEW.archived_at IS NULL THEN
        INSERT INTO blog_publications (business_id, property_content_id, content_revision_id)
        VALUES (NEW.business_id, NEW.id, NEW.current_revision_id)
        ON CONFLICT (property_content_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_pc_queue_blog_publication AFTER UPDATE OF current_revision_id, generation_status ON property_content
    FOR EACH ROW EXECUTE FUNCTION public.property_content_queue_blog_publication();

-- ============================================================
-- 4. "Publishable now" + claim / finish / retry
-- ============================================================

CREATE OR REPLACE FUNCTION public.blog_publish_block_reason(p_id UUID, p_expect_status TEXT)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE bp blog_publications%ROWTYPE; pc property_content%ROWTYPE; s content_automation_settings%ROWTYPE;
        v_prop_status TEXT; v_rev_status TEXT;
BEGIN
    SELECT * INTO bp FROM blog_publications WHERE id = p_id;
    IF NOT FOUND THEN RETURN 'publication_not_found'; END IF;
    IF bp.status <> p_expect_status THEN RETURN 'status_' || bp.status; END IF;
    IF bp.environment IS DISTINCT FROM 'live' THEN RETURN 'not_live'; END IF;

    SELECT * INTO pc FROM property_content WHERE id = bp.property_content_id;
    IF pc.environment <> 'live' THEN RETURN 'content_not_live'; END IF;
    IF pc.archived_at IS NOT NULL THEN RETURN 'content_archived'; END IF;

    SELECT * INTO s FROM content_automation_settings WHERE business_id = bp.business_id;
    IF NOT FOUND OR NOT s.is_enabled THEN RETURN 'automation_disabled'; END IF;
    IF s.automation_mode <> 'live' THEN RETURN 'mode_not_live'; END IF;

    SELECT status INTO v_prop_status FROM properties WHERE id = pc.property_id;
    IF v_prop_status IS DISTINCT FROM 'active' THEN RETURN 'property_inactive'; END IF;

    IF pc.current_revision_id IS DISTINCT FROM bp.content_revision_id THEN RETURN 'revision_not_current'; END IF;
    SELECT validation_status INTO v_rev_status FROM content_revisions WHERE id = bp.content_revision_id;
    IF v_rev_status IS DISTINCT FROM 'valid' THEN RETURN 'revision_not_valid'; END IF;
    RETURN NULL;
END;
$$;

-- Claims one publication for a worker. Returns 'claimed', or why it wasn't:
-- 'held' / 'skipped' (it was blocked and moved there), 'not_due', 'status_<s>'.
-- A 'publishing' row whose lease expired (worker died) is reclaimable — the
-- worker's own-post lookup and the saved wp_media make that safe.
CREATE OR REPLACE FUNCTION public.claim_blog_publication(p_id UUID, p_worker TEXT, p_lease INTERVAL DEFAULT interval '15 minutes')
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bp blog_publications%ROWTYPE; v_reason TEXT;
BEGIN
    SELECT * INTO bp FROM blog_publications WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RETURN 'publication_not_found'; END IF;
    IF bp.status = 'publishing' AND bp.locked_until < now() THEN
        UPDATE blog_publications SET status = 'pending', locked_by = NULL, locked_until = NULL WHERE id = p_id;
        bp.status := 'pending';
    END IF;
    IF bp.status <> 'pending' THEN RETURN 'status_' || bp.status; END IF;
    IF bp.next_attempt_at > now() THEN RETURN 'not_due'; END IF;

    v_reason := public.blog_publish_block_reason(p_id, 'pending');
    IF v_reason IN ('automation_disabled', 'mode_not_live') THEN
        UPDATE blog_publications SET status = 'held', error_message = NULL WHERE id = p_id;
        RETURN 'held';
    ELSIF v_reason IS NOT NULL THEN
        UPDATE blog_publications SET status = 'skipped', error_message = 'not publishable: ' || v_reason WHERE id = p_id;
        RETURN 'skipped';
    END IF;

    UPDATE blog_publications
       SET status = 'publishing', attempt_count = attempt_count + 1, locked_by = p_worker,
           locked_until = now() + p_lease, publish_started_at = now(), error_message = NULL
     WHERE id = p_id;
    RETURN 'claimed';
END;
$$;

-- Ends an attempt. p_outcome: 'published' (needs p_wp_post_id/p_wp_url), 'retry' (a
-- failure that may succeed later: back to pending with backoff, failed after 5
-- attempts), 'failed' (definite rejection), 'blocked' (re-check failed right before the
-- call). Returns the new status. A stale finisher (lease taken over) is rejected.
CREATE OR REPLACE FUNCTION public.finish_blog_publication(
    p_id UUID, p_worker TEXT, p_outcome TEXT,
    p_wp_post_id BIGINT DEFAULT NULL, p_wp_url TEXT DEFAULT NULL, p_error TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bp blog_publications%ROWTYPE; v_reason TEXT; v_status TEXT;
BEGIN
    SELECT * INTO bp FROM blog_publications WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'publication not found'; END IF;
    IF bp.status <> 'publishing' OR bp.locked_by IS DISTINCT FROM p_worker THEN
        RAISE EXCEPTION 'this worker no longer owns the publication' USING ERRCODE = 'lock_not_available';
    END IF;

    IF p_outcome = 'published' THEN
        IF p_wp_post_id IS NULL THEN RAISE EXCEPTION 'published needs the WordPress post id'; END IF;
        UPDATE blog_publications SET status = 'published', wp_post_id = p_wp_post_id, wp_url = p_wp_url,
               published_at = now(), locked_by = NULL, locked_until = NULL, error_message = NULL WHERE id = p_id;
        RETURN 'published';
    ELSIF p_outcome = 'retry' THEN
        v_status := CASE WHEN bp.attempt_count >= 5 THEN 'failed' ELSE 'pending' END;
        UPDATE blog_publications SET status = v_status, locked_by = NULL, locked_until = NULL, error_message = p_error,
               next_attempt_at = now() + make_interval(mins => 5 * bp.attempt_count) WHERE id = p_id;
        RETURN v_status;
    ELSIF p_outcome = 'failed' THEN
        UPDATE blog_publications SET status = 'failed', locked_by = NULL, locked_until = NULL, error_message = p_error WHERE id = p_id;
        RETURN 'failed';
    ELSIF p_outcome = 'blocked' THEN
        v_reason := public.blog_publish_block_reason(p_id, 'publishing');
        v_status := CASE WHEN v_reason IN ('automation_disabled', 'mode_not_live') THEN 'held' ELSE 'skipped' END;
        UPDATE blog_publications SET status = v_status, locked_by = NULL, locked_until = NULL,
               error_message = CASE WHEN v_status = 'skipped' THEN 'not publishable: ' || COALESCE(v_reason, p_error) END
         WHERE id = p_id;
        RETURN v_status;
    END IF;
    RAISE EXCEPTION 'unknown outcome %', p_outcome;
END;
$$;

-- Gallery "Retry": a failed (or held, once Live again) publication goes back to pending.
-- Runs on the user's session; checks editor access itself. The caller then sends the
-- content/blog-publish event.
CREATE OR REPLACE FUNCTION public.retry_blog_publication(p_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bp blog_publications%ROWTYPE; v_reason TEXT;
BEGIN
    SELECT * INTO bp FROM blog_publications WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'publication not found' USING ERRCODE = 'no_data_found'; END IF;
    IF auth.uid() IS NULL OR bp.business_id NOT IN (SELECT public.user_business_write_ids()) THEN
        RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF bp.status NOT IN ('failed', 'held') THEN
        RAISE EXCEPTION 'only a failed or held publication can be retried (this one is %)', bp.status;
    END IF;
    UPDATE blog_publications SET status = 'pending', next_attempt_at = now(), attempt_count = 0, error_message = NULL WHERE id = p_id;
    v_reason := public.blog_publish_block_reason(p_id, 'pending');
    IF v_reason IS NOT NULL THEN
        RAISE EXCEPTION 'cannot publish now: %', v_reason;   -- rolls the update back
    END IF;
    RETURN 'pending';
END;
$$;

-- ============================================================
-- 5. Pause / Testing holds pending publications; going Live releases them
--    (extends the existing settings trigger; the social part is unchanged)
-- ============================================================

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
        UPDATE blog_publications SET status = 'pending', next_attempt_at = now()
         WHERE business_id = NEW.business_id AND status = 'held';
    END IF;
    RETURN NEW;
END;
$$;

-- ============================================================
-- 6. A published (or publishing) blog can't change underneath WordPress
-- ============================================================

CREATE OR REPLACE FUNCTION public.property_content_pointer_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.current_revision_id IS NOT NULL
       AND NEW.current_revision_id IS DISTINCT FROM OLD.current_revision_id THEN
        IF (SELECT validation_status FROM content_revisions WHERE id = NEW.current_revision_id) <> 'valid' THEN
            RAISE EXCEPTION 'current_revision_id can only point to a valid revision'
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.environment = 'live' AND EXISTS (
               SELECT 1 FROM social_posts
                WHERE property_content_id = NEW.id
                  AND status IN ('scheduled', 'held', 'publishing', 'published')) THEN
            RAISE EXCEPTION 'live content with active posts cannot switch revision'
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.environment = 'live' AND EXISTS (
               SELECT 1 FROM blog_publications
                WHERE property_content_id = NEW.id
                  AND status IN ('pending', 'held', 'publishing', 'published')) THEN
            RAISE EXCEPTION 'a live blog that is being or has been published cannot switch revision'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_content_regeneration(p_content UUID, p_prompt TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pc property_content%ROWTYPE; v_num INT; v_id UUID;
BEGIN
    SELECT * INTO pc FROM property_content WHERE id = p_content FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'content not found'; END IF;
    IF auth.uid() IS NULL OR NOT (pc.business_id IN (SELECT public.user_business_write_ids())) THEN
        RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF pc.archived_at IS NOT NULL THEN RAISE EXCEPTION 'archived content cannot be regenerated'; END IF;
    IF pc.generation_status NOT IN ('completed', 'failed') THEN
        RAISE EXCEPTION 'content is still generating';
    END IF;
    IF pc.environment = 'live' AND EXISTS (SELECT 1 FROM social_posts WHERE property_content_id = pc.id) THEN
        RAISE EXCEPTION 'Live content that has publishing records cannot be regenerated';
    END IF;
    IF pc.environment = 'live' AND EXISTS (SELECT 1 FROM blog_publications WHERE property_content_id = pc.id) THEN
        RAISE EXCEPTION 'A Live blog that has a WordPress publication cannot be regenerated';
    END IF;
    IF EXISTS (SELECT 1 FROM content_revisions WHERE property_content_id = pc.id AND validation_status = 'pending') THEN
        RAISE EXCEPTION 'a revision is already being generated';
    END IF;
    SELECT COALESCE(max(revision_number), 0) + 1 INTO v_num FROM content_revisions WHERE property_content_id = pc.id;
    INSERT INTO content_revisions (business_id, property_content_id, revision_number, generation_prompt, created_by)
    VALUES (pc.business_id, pc.id, v_num, p_prompt, auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- ============================================================
-- 7. Privileges + RLS (members read; only the service role / functions write)
-- ============================================================

REVOKE ALL ON FUNCTION public.blog_publish_block_reason(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_blog_publication(UUID, TEXT, INTERVAL) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_blog_publication(UUID, TEXT, TEXT, BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.property_content_queue_blog_publication() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.blog_publish_block_reason(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_blog_publication(UUID, TEXT, INTERVAL) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_blog_publication(UUID, TEXT, TEXT, BIGINT, TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.retry_blog_publication(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_blog_publication(UUID) TO authenticated, service_role;

ALTER TABLE blog_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY blog_publications_read ON blog_publications FOR SELECT TO authenticated
    USING (business_id IN (SELECT public.user_business_ids()));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON blog_publications FROM anon, authenticated;
REVOKE ALL ON blog_publications FROM anon;
