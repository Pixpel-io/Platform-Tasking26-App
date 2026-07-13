-- =============================================================================
-- 0034 — Group read receipts
--
-- Instagram-style read receipts for GROUP chats (channels) only: the room shows
-- a reader's avatar under the last message they've seen. That needs two things
-- the base schema didn't allow:
--   1. A member must be able to SELECT their peers' read_state rows for a
--      channel they belong to (the base policy only exposed the caller's own
--      row). Scoped via is_channel_member() so it applies to channels only —
--      DM read_state (conversation_id rows) stays private.
--   2. read_state must be in the realtime publication so avatars update live as
--      members catch up. Old rows fully replicated so RLS can authorize UPDATE
--      delivery.
-- =============================================================================

create policy read_state_select_channel_peers on public.read_state
  for select using (
    channel_id is not null and public.is_channel_member(channel_id)
  );

alter table public.read_state replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.read_state;
exception
  when duplicate_object then null;
end;
$$;
