-- =============================================================================
-- Phase 0 — Auth & Workspace Foundation
-- Tasking — Team Collaboration SaaS
--
-- Hierarchy: Organization -> Workspace -> (Groups + Projects)  [groups/projects
-- arrive in later phases]. This migration covers identity, organizations,
-- workspaces, membership + roles, invites, profiles and presence.
--
-- Conventions enforced everywhere:
--   * uuid primary keys (gen_random_uuid)
--   * created_at / updated_at timestamptz
--   * soft delete via deleted_at
--   * foreign keys + indexes on every FK and created_at
--   * RLS enabled on every table, scoped to workspace membership + role
--
-- RLS recursion note: membership checks live in SECURITY DEFINER functions so
-- a policy on workspace_members never re-queries workspace_members under RLS.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.workspace_role as enum ('owner', 'admin', 'member');

-- 'in_call' is reserved now so the calling module can be layered on later
-- without a schema migration.
create type public.presence_status as enum (
  'online',
  'offline',
  'busy',
  'away',
  'in_call'
);

create type public.invite_status as enum (
  'pending',
  'accepted',
  'revoked',
  'expired'
);

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at fresh
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- profiles — one row per auth.users, public-facing identity + presence
-- =============================================================================
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  full_name    text,
  avatar_url   text,
  presence     public.presence_status not null default 'offline',
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index profiles_created_at_idx on public.profiles (created_at);
create index profiles_email_idx on public.profiles (lower(email));

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- organizations — top of the hierarchy; owns billing later
-- =============================================================================
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique,
  owner_id   uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index organizations_owner_id_idx on public.organizations (owner_id);
create index organizations_created_at_idx on public.organizations (created_at);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- =============================================================================
-- workspaces
-- =============================================================================
create table public.workspaces (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  slug            text,
  icon_url        text,
  created_by      uuid not null references public.profiles (id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (organization_id, slug)
);

create index workspaces_organization_id_idx on public.workspaces (organization_id);
create index workspaces_created_by_idx on public.workspaces (created_by);
create index workspaces_created_at_idx on public.workspaces (created_at);

create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

-- =============================================================================
-- workspace_members — membership + role (a user belongs to many workspaces)
-- =============================================================================
create table public.workspace_members (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         public.workspace_role not null default 'member',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (workspace_id, user_id)
);

create index workspace_members_workspace_id_idx on public.workspace_members (workspace_id);
create index workspace_members_user_id_idx on public.workspace_members (user_id);
create index workspace_members_created_at_idx on public.workspace_members (created_at);

create trigger workspace_members_set_updated_at
  before update on public.workspace_members
  for each row execute function public.set_updated_at();

-- =============================================================================
-- invites — invite members by email; accept-invite flow
-- =============================================================================
create table public.invites (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email        text not null,
  role         public.workspace_role not null default 'member',
  token        uuid not null default gen_random_uuid(),
  status       public.invite_status not null default 'pending',
  invited_by   uuid not null references public.profiles (id) on delete restrict,
  accepted_by  uuid references public.profiles (id) on delete set null,
  expires_at   timestamptz not null default (now() + interval '7 days'),
  accepted_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (token)
);

create index invites_workspace_id_idx on public.invites (workspace_id);
create index invites_email_idx on public.invites (lower(email));
create index invites_invited_by_idx on public.invites (invited_by);
create index invites_created_at_idx on public.invites (created_at);

create trigger invites_set_updated_at
  before update on public.invites
  for each row execute function public.set_updated_at();

-- =============================================================================
-- SECURITY DEFINER helpers — bypass RLS to answer membership questions,
-- which keeps membership policies from recursing into themselves.
-- =============================================================================
create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.deleted_at is null
  );
$$;

create or replace function public.workspace_role_of(p_workspace_id uuid)
returns public.workspace_role
language sql
security definer
stable
set search_path = public
as $$
  select wm.role
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = auth.uid()
    and wm.deleted_at is null
  limit 1;
$$;

create or replace function public.is_workspace_admin(p_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.workspace_role_of(p_workspace_id) in ('owner', 'admin');
$$;

create or replace function public.is_workspace_owner(p_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.workspace_role_of(p_workspace_id) = 'owner';
$$;

-- Accept an invite atomically: validate token, create membership, mark accepted.
create or replace function public.accept_invite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites%rowtype;
  v_uid    uuid := auth.uid();
  v_email  text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_invite
  from public.invites
  where token = p_token
    and deleted_at is null
  for update;

  if not found then
    raise exception 'invite not found';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'invite is no longer pending';
  end if;

  if v_invite.expires_at < now() then
    update public.invites set status = 'expired' where id = v_invite.id;
    raise exception 'invite has expired';
  end if;

  select lower(email) into v_email from public.profiles where id = v_uid;
  if v_email is distinct from lower(v_invite.email) then
    raise exception 'invite email does not match the signed-in user';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_invite.workspace_id, v_uid, v_invite.role)
  on conflict (workspace_id, user_id)
  do update set deleted_at = null, role = excluded.role;

  update public.invites
  set status = 'accepted', accepted_by = v_uid, accepted_at = now()
  where id = v_invite.id;

  return v_invite.workspace_id;
end;
$$;

-- Create a workspace (+ its organization) and seat the creator as owner,
-- all in one transaction. Returns the new workspace id.
create or replace function public.create_workspace(
  p_workspace_name text,
  p_organization_name text default null
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
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.organizations (name, owner_id)
  values (coalesce(nullif(trim(p_organization_name), ''), p_workspace_name), v_uid)
  returning id into v_org_id;

  insert into public.workspaces (organization_id, name, created_by)
  values (v_org_id, p_workspace_name, v_uid)
  returning id into v_ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_ws_id, v_uid, 'owner');

  return v_ws_id;
end;
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles          enable row level security;
alter table public.organizations     enable row level security;
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.invites           enable row level security;

-- ---- profiles -------------------------------------------------------------
-- You can see your own profile, plus anyone who shares a workspace with you.
create policy profiles_select on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1
      from public.workspace_members me
      join public.workspace_members them
        on them.workspace_id = me.workspace_id
      where me.user_id = auth.uid()
        and me.deleted_at is null
        and them.user_id = profiles.id
        and them.deleted_at is null
    )
  );

create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Insert is normally handled by the on_auth_user_created trigger, but allow
-- self-insert as a fallback for first-party flows.
create policy profiles_insert_self on public.profiles
  for insert with check (id = auth.uid());

-- ---- organizations --------------------------------------------------------
-- Visible if you're the owner or a member of any workspace under it.
create policy organizations_select on public.organizations
  for select using (
    owner_id = auth.uid()
    or exists (
      select 1
      from public.workspaces w
      where w.organization_id = organizations.id
        and public.is_workspace_member(w.id)
    )
  );

create policy organizations_insert on public.organizations
  for insert with check (owner_id = auth.uid());

create policy organizations_update_owner on public.organizations
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---- workspaces -----------------------------------------------------------
create policy workspaces_select on public.workspaces
  for select using (public.is_workspace_member(id));

create policy workspaces_insert on public.workspaces
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.organizations o
      where o.id = organization_id and o.owner_id = auth.uid()
    )
  );

-- Admins/owners can rename etc.; owners can soft-delete (deleted_at) too.
create policy workspaces_update_admin on public.workspaces
  for update using (public.is_workspace_admin(id))
  with check (public.is_workspace_admin(id));

-- ---- workspace_members ----------------------------------------------------
-- Any member of the workspace can see the roster.
create policy workspace_members_select on public.workspace_members
  for select using (public.is_workspace_member(workspace_id));

-- Self-insert as owner only when the workspace has no members yet
-- (bootstrap). All other seating goes through accept_invite (SECURITY DEFINER).
create policy workspace_members_insert_bootstrap on public.workspace_members
  for insert with check (
    user_id = auth.uid()
    and role = 'owner'
    and not exists (
      select 1 from public.workspace_members existing
      where existing.workspace_id = workspace_members.workspace_id
    )
  );

-- Admins/owners can change roles and remove members.
create policy workspace_members_update_admin on public.workspace_members
  for update using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create policy workspace_members_delete_admin on public.workspace_members
  for delete using (public.is_workspace_admin(workspace_id));

-- ---- invites --------------------------------------------------------------
-- Members can see invites for their workspace; an invitee can see invites
-- addressed to their own email (so the accept page can load before joining).
create policy invites_select on public.invites
  for select using (
    public.is_workspace_member(workspace_id)
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy invites_insert_admin on public.invites
  for insert with check (
    public.is_workspace_admin(workspace_id)
    and invited_by = auth.uid()
  );

create policy invites_update_admin on public.invites
  for update using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create policy invites_delete_admin on public.invites
  for delete using (public.is_workspace_admin(workspace_id));
