-- Delete one gallery item (property_content + its revisions and clips, which cascade).
--
-- The content tables are deliberately not writable from a user session (see the
-- "Defence in depth" REVOKE in the content automation schema), so deletion goes
-- through this function instead — the same pattern as trigger_manual_content_cycle:
-- SECURITY DEFINER, with the caller's editor access checked inside.
--
-- Refuses an item that is still generating (the worker would write into a row that
-- no longer exists). A row something still references (e.g. a social post) is
-- refused by its RESTRICT foreign key and surfaces as foreign_key_violation.
-- Media files are left in storage; media_assets rows are only unlinked.

CREATE OR REPLACE FUNCTION public.delete_content_item(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_business UUID;
    v_status   TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not signed in' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT business_id, generation_status INTO v_business, v_status
      FROM property_content WHERE id = p_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'content item not found' USING ERRCODE = 'no_data_found';
    END IF;

    IF v_business NOT IN (SELECT public.user_business_write_ids()) THEN
        RAISE EXCEPTION 'editor access is required to delete content' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_status = 'processing' THEN
        RAISE EXCEPTION 'this item is still generating' USING ERRCODE = 'object_in_use';
    END IF;

    DELETE FROM property_content WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_content_item(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_content_item(UUID) TO authenticated, service_role;
