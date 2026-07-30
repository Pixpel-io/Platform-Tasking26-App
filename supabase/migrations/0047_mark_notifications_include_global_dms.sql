-- =============================================================================
-- mark_notifications_read — include global DM notifications
-- Tasking — Team Collaboration SaaS
--
-- DM notifications (since 0028) carry workspace_id = null because DMs are
-- cross-workspace. The original mark_notifications_read only cleared rows
-- scoped to the passed workspace, so visiting the notifications inbox left
-- global DM pings sitting unread and the bell stayed at N. Widen the update
-- to cover the current workspace OR global rows (workspace_id null); the
-- user_id predicate keeps the change scoped to the caller.
-- =============================================================================

create or replace function public.mark_notifications_read(p_workspace_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and (workspace_id = p_workspace_id or workspace_id is null)
    and read_at is null;
$$;

notify pgrst, 'reload schema';
