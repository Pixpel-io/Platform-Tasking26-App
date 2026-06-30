-- Per-workspace accent color. The active workspace's color overrides the app's
-- --primary CSS variable so the whole UI recolors to match the workspace.
alter table public.workspaces
  add column if not exists color text not null default '#4f46e5';

-- Let create_workspace accept an optional color (defaults to the indigo brand).
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

  return v_ws_id;
end;
$$;
