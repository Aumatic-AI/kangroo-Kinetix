-- A Live post more than 6 hours late is skipped by claim_publish_jobs. It used to say only
-- "missed the 6 hours publishing window", which hid WHY it never went out: a post blocked
-- by publish_block_reason (account disconnected, listing deactivated, automation paused…)
-- is never claimed, so it just aged out. The skip message now names the reason, and says
-- when nothing blocked it (the publisher didn't run). Same function otherwise.

CREATE OR REPLACE FUNCTION public.claim_publish_jobs(
    p_worker TEXT, p_limit INT DEFAULT 10, p_lease INTERVAL DEFAULT '10 minutes', p_post_id UUID DEFAULT NULL)
RETURNS SETOF social_posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE social_posts sk
       SET status = 'skipped', locked_by = NULL, locked_until = NULL,
           error_message = 'missed the ' || (public.content_publish_max_lateness())::text || ' publishing window: '
               || CASE COALESCE(public.publish_block_reason(sk.id, 'scheduled', false), 'overdue')
                    WHEN 'overdue' THEN 'nothing blocked it, but the publisher didn''t run in time'
                    WHEN 'connection_missing' THEN 'no connected account for this platform'
                    WHEN 'mode_not_live' THEN 'automation was not in Live mode'
                    WHEN 'automation_disabled' THEN 'automation was paused'
                    WHEN 'property_inactive' THEN 'the listing was deactivated'
                    WHEN 'content_archived' THEN 'the creative was archived'
                    WHEN 'revision_not_current' THEN 'the creative changed after it was scheduled'
                    ELSE replace(public.publish_block_reason(sk.id, 'scheduled', false), '_', ' ')
                  END
     WHERE sk.status = 'scheduled' AND sk.property_content_id IS NOT NULL
       AND sk.scheduled_at < now() - public.content_publish_max_lateness();

    RETURN QUERY
    WITH picked AS (
        SELECT sp2.id FROM social_posts sp2
         WHERE sp2.status = 'scheduled' AND sp2.property_content_id IS NOT NULL
           AND (p_post_id IS NULL OR sp2.id = p_post_id)
           AND sp2.scheduled_at <= now()
           AND public.publish_block_reason(sp2.id, 'scheduled', true) IS NULL
         ORDER BY sp2.scheduled_at
         LIMIT p_limit
         FOR UPDATE OF sp2 SKIP LOCKED),
    claimed AS (
        UPDATE social_posts sp
           SET status = 'publishing',
               publish_attempt_count = sp.publish_attempt_count + 1,
               locked_by = p_worker, locked_until = now() + p_lease,
               publish_started_at = now(), error_message = NULL
          FROM picked WHERE sp.id = picked.id
        RETURNING sp.*),
    logged AS (
        INSERT INTO publishing_logs (business_id, social_post_id, attempt_number, status, idempotency_key, request_metadata)
        SELECT c.business_id, c.id, c.publish_attempt_count, 'started', c.idempotency_key,
               jsonb_build_object('worker', p_worker)
          FROM claimed c
        RETURNING 1)
    SELECT * FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_publish_jobs(TEXT, INT, INTERVAL, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_publish_jobs(TEXT, INT, INTERVAL, UUID) TO service_role;
