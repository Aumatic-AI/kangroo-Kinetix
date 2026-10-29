-- studio_sessions.creative_id has linked a session to its creative since
-- Ad Studio was first built — the studio_session_id column added on
-- meta_ad_creatives just now only gets set going forward (in the answers
-- route), so every creative generated before that change still has it
-- null and shows no "Chat History" option in Ad Library. Backfill it from
-- the link that already existed.

UPDATE meta_ad_creatives mac
SET studio_session_id = ss.id
FROM studio_sessions ss
WHERE ss.creative_id = mac.id
  AND mac.studio_session_id IS NULL;
