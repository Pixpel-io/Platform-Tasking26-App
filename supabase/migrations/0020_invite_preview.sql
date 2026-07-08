-- =============================================================================
-- 0020 — Invite preview by token
--
-- The invite page used to select from `invites` directly, but RLS only shows
-- a row to workspace members or to a signed-in user whose email matches the
-- invite. A signed-out visitor - or someone signed in with the wrong account
-- (the Outlook/Microsoft report) - saw no row and got a misleading "this link
-- is invalid" instead of "sign in with the invited email".
--
-- The token is an unguessable capability, so knowing it entitles you to a
-- minimal preview: invited email, status, expiry, workspace name.
-- =============================================================================

create or replace function public.invite_preview(p_token uuid)
returns table (
  email          text,
  status         public.invite_status,
  expired        boolean,
  workspace_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    i.email,
    i.status,
    i.expires_at < now() as expired,
    w.name as workspace_name
  from public.invites i
  join public.workspaces w on w.id = i.workspace_id
  where i.token = p_token
    and i.deleted_at is null;
$$;

grant execute on function public.invite_preview(uuid) to anon, authenticated;
