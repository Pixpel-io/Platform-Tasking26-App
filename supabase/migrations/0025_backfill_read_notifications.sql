-- =============================================================================
-- 0025 — Backfill: clear notifications for already-read rooms
--
-- markRead now marks a room's notifications read at the moment the room is
-- opened, but notifications created BEFORE that fix shipped are stuck unread
-- even though the chat itself was read. One-time sweep: any dm/mention/group
-- notification whose room's read_state.last_read_at is at or after the
-- notification's created_at gets its read_at stamped.
-- =============================================================================

update public.notifications n
set read_at = rs.last_read_at
from public.read_state rs
where n.read_at is null
  and rs.user_id = n.user_id
  and (
    (n.conversation_id is not null and rs.conversation_id = n.conversation_id)
    or (n.channel_id is not null and rs.channel_id = n.channel_id)
  )
  and rs.last_read_at >= n.created_at;
