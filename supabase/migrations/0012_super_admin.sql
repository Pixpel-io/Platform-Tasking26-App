-- 0012: Platform-level Super Admin + gated workspace creation.
--
-- app_admins        - emails with platform-wide authority (the Super Admins)
-- workspace_creators- emails allowed to create workspaces directly
-- workspace_requests- creation requests from everyone else, approved/rejected
--                     from the Super Admin dashboard.

-- 1) Super admin allowlist ------------------------------------------------
create table public.app_admins (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;

-- >>> EDIT THESE: seed your super admin accounts (2 gmails + 1 microsoft).
insert into public.app_admins (email) values
  ('saadovais424@gmail.com'),
  ('sowais@life26.es')
on conflict (email) do nothing;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.app_admins a
    join public.profiles p on lower(p.email) = lower(a.email)
    where p.id = auth.uid()
  );
$$;

-- Only super admins can see or manage the admin list itself.
create policy app_admins_select on public.app_admins
  for select using (public.is_super_admin());
create policy app_admins_insert on public.app_admins
  for insert with check (public.is_super_admin());
create policy app_admins_delete on public.app_admins
  for delete using (public.is_super_admin());

-- 2) Workspace-creator allowlist ------------------------------------------
create table public.workspace_creators (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  added_by   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.workspace_creators enable row level security;

create policy workspace_creators_select on public.workspace_creators
  for select using (public.is_super_admin());
create policy workspace_creators_insert on public.workspace_creators
  for insert with check (public.is_super_admin());
create policy workspace_creators_delete on public.workspace_creators
  for delete using (public.is_super_admin());

create or replace function public.can_create_workspace()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_super_admin() or exists (
    select 1
    from public.workspace_creators c
    join public.profiles p on lower(p.email) = lower(c.email)
    where p.id = auth.uid()
  );
$$;

-- 3) Workspace creation requests ------------------------------------------
create type public.workspace_request_status as enum ('pending', 'approved', 'rejected');

create table public.workspace_requests (
  id                uuid primary key default gen_random_uuid(),
  requested_by      uuid not null references public.profiles (id) on delete cascade,
  workspace_name    text not null,
  organization_name text,
  color             text,
  status            public.workspace_request_status not null default 'pending',
  decided_by        uuid references public.profiles (id) on delete set null,
  decided_at        timestamptz,
  workspace_id      uuid references public.workspaces (id) on delete set null,
  created_at        timestamptz not null default now()
);

create index workspace_requests_status_idx on public.workspace_requests (status);
create index workspace_requests_requested_by_idx on public.workspace_requests (requested_by);

alter table public.workspace_requests enable row level security;

-- Requesters see their own; super admins see all.
create policy workspace_requests_select on public.workspace_requests
  for select using (requested_by = auth.uid() or public.is_super_admin());
create policy workspace_requests_insert on public.workspace_requests
  for insert with check (requested_by = auth.uid());
create policy workspace_requests_update on public.workspace_requests
  for update using (public.is_super_admin())
  with check (public.is_super_admin());

-- 4) Enforce the gate inside create_workspace ------------------------------
-- Wrap the existing RPC: only allowed creators may call it directly.
-- (Approved requests are fulfilled by the requester calling it again once
-- approved - see approve flow in the app.)
create or replace function public.create_workspace_gated(
  p_workspace_name text,
  p_organization_name text default null,
  p_color text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.can_create_workspace() and not exists (
    select 1 from public.workspace_requests
    where requested_by = auth.uid()
      and status = 'approved'
      and workspace_id is null
  ) then
    raise exception 'workspace creation requires approval';
  end if;

  return public.create_workspace(p_workspace_name, p_organization_name, p_color);
end;
$$;

grant execute on function public.create_workspace_gated(text, text, text) to authenticated;
