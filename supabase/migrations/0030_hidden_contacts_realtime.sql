-- =============================================================================
-- 0030 — Realtime for dm_hidden_contacts
--
-- When a hidden person messages you, the unhide trigger deletes your hide row
-- server-side - the sidebar needs that DELETE event to restore the contact
-- (and their message) live instead of on the next full page load.
-- Old rows must be fully replicated for RLS to authorize DELETE delivery.
-- =============================================================================

alter table public.dm_hidden_contacts replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.dm_hidden_contacts;
exception
  when duplicate_object then null;
end;
$$;
