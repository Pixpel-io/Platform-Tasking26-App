-- 0016: Every workspace gets a default "general" group.
--
-- 1) create_workspace also creates a #general channel with the creator in it.
-- 2) A trigger on workspace_members auto-adds every new member (invites,
--    approvals, any path) to that workspace's "general" group, and revives
--    their row if they had been removed before.

-- 1) Recreate create_workspace with the default group ------------------------
create or replace function public.create_workspace(
  p_workspace_name text,
  p_organization_name text default null,
  p_color text default '#4f46e5'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_ws_id uuid;
  v_channel_id uuid;
  v_color text := coalesce(nullif(trim(p_color), ''), '#4f46e5');
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Only accept a 6-digit hex color; fall back to the brand default otherwise.
  if v_color !~ '^#[0-9a-fA-F]{6}$' then
    v_color := '#4f46e5';
  end if;

  insert into public.organizations (name, owner_id)
  values (coalesce(nullif(trim(p_organization_name), ''), p_workspace_name), v_uid)
  returning id into v_org_id;

  insert into public.workspaces (organization_id, name, created_by, color)
  values (v_org_id, p_workspace_name, v_uid, v_color)
  returning id into v_ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_ws_id, v_uid, 'owner');

  -- Default group for the whole team.
  insert into public.channels (workspace_id, name, description, created_by)
  values (v_ws_id, 'general', 'Team-wide announcements and chat', v_uid)
  returning id into v_channel_id;

  insert into public.channel_members (channel_id, user_id)
  values (v_channel_id, v_uid)
  on conflict do nothing;

  return v_ws_id;
end;
$$;

-- 2) Auto-join new workspace members into #general ----------------------------
create or replace function public.auto_join_general()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel_id uuid;
begin
  -- Only act on live memberships.
  if new.deleted_at is not null then
    return new;
  end if;

  select id into v_channel_id
  from public.channels
  where workspace_id = new.workspace_id
    and name = 'general'
    and deleted_at is null
  limit 1;

  if v_channel_id is null then
    return new;
  end if;

  insert into public.channel_members (channel_id, user_id)
  values (v_channel_id, new.user_id)
  on conflict (channel_id, user_id)
  do update set deleted_at = null;

  return new;
end;
$$;

drop trigger if exists workspace_members_auto_join_general on public.workspace_members;
create trigger workspace_members_auto_join_general
  after insert on public.workspace_members
  for each row execute function public.auto_join_general();
