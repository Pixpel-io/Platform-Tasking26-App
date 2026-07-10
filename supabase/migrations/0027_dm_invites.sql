-- =============================================================================
-- 0027 — Personal DM invitations (Phase 3)
--
-- People with no shared workspace can connect via a personal email invite
-- (Juan's rule: "they must add themselves through a personal direct
-- invitation"). Accepting creates a dm_connection - a standing pair link that
-- get_or_create_dm honours alongside the shared-workspace gate. Connections
-- grant DM access ONLY: no workspace, board or channel reach.
--
--   dm_invites      email invites with token + expiry (mirrors `invites`)
--   dm_connections  accepted pairs, one row per pair (user_a < user_b)
-- =============================================================================

-- ---- tables -----------------------------------------------------------------

create table public.dm_connections (
  id         uuid primary key default gen_random_uuid(),
  user_a     uuid not null references public.profiles (id) on delete cascade,
  user_b     uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint dm_connections_order_chk check (user_a < user_b),
  unique (user_a, user_b)
);

create index dm_connections_user_a_idx on public.dm_connections (user_a);
create index dm_connections_user_b_idx on public.dm_connections (user_b);

create table public.dm_invites (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  invited_by uuid not null references public.profiles (id) on delete cascade,
  token      uuid not null unique default gen_random_uuid(),
  status     public.invite_status not null default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index dm_invites_invited_by_idx on public.dm_invites (invited_by);
create index dm_invites_email_idx on public.dm_invites (lower(email));

create trigger dm_invites_set_updated_at
  before update on public.dm_invites
  for each row execute function public.set_updated_at();

-- ---- RLS ---------------------------------------------------------------------

alter table public.dm_connections enable row level security;
alter table public.dm_invites enable row level security;

-- You can see connections you're part of. Rows are created only through the
-- accept RPC (security definer), so no insert/update policies for clients.
create policy dm_connections_select on public.dm_connections
  for select using (user_a = auth.uid() or user_b = auth.uid());

create policy dm_connections_delete on public.dm_connections
  for delete using (user_a = auth.uid() or user_b = auth.uid());

-- Inviter manages their own invites; the invited email can see theirs.
create policy dm_invites_select on public.dm_invites
  for select using (
    invited_by = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy dm_invites_insert on public.dm_invites
  for insert with check (invited_by = auth.uid());

create policy dm_invites_update on public.dm_invites
  for update using (invited_by = auth.uid())
  with check (invited_by = auth.uid());

-- ---- helper: standing connection between two users ---------------------------

create or replace function public.has_dm_connection(p_a uuid, p_b uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.dm_connections
    where user_a = least(p_a, p_b) and user_b = greatest(p_a, p_b)
  );
$$;

-- ---- preview RPC (token capability, mirrors invite_preview) -------------------

create or replace function public.dm_invite_preview(p_token uuid)
returns table (
  email        text,
  status       public.invite_status,
  expired      boolean,
  inviter_name text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    i.email,
    i.status,
    i.expires_at < now() as expired,
    coalesce(p.full_name, p.email) as inviter_name
  from public.dm_invites i
  join public.profiles p on p.id = i.invited_by
  where i.token = p_token
    and i.deleted_at is null;
$$;

grant execute on function public.dm_invite_preview(uuid) to anon, authenticated;

-- ---- accept RPC ---------------------------------------------------------------

create or replace function public.accept_dm_invite(p_token uuid)
returns uuid  -- the DM conversation id, ready to open
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.dm_invites%rowtype;
  v_email text;
  v_key text;
  v_conv_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_invite
  from public.dm_invites
  where token = p_token and deleted_at is null
  for update;

  if not found then
    raise exception 'invite not found';
  end if;
  if v_invite.status <> 'pending' then
    raise exception 'invite is no longer pending';
  end if;
  if v_invite.expires_at < now() then
    update public.dm_invites set status = 'expired' where id = v_invite.id;
    raise exception 'invite has expired';
  end if;

  select lower(email) into v_email from public.profiles where id = v_uid;
  if v_email is distinct from lower(v_invite.email) then
    raise exception 'invite email does not match the signed-in user';
  end if;
  if v_uid = v_invite.invited_by then
    raise exception 'cannot accept your own invite';
  end if;

  update public.dm_invites set status = 'accepted' where id = v_invite.id;

  insert into public.dm_connections (user_a, user_b)
  values (
    least(v_uid, v_invite.invited_by),
    greatest(v_uid, v_invite.invited_by)
  )
  on conflict (user_a, user_b) do nothing;

  -- Open (or create) the pair's global DM thread right away.
  v_key := least(v_uid::text, v_invite.invited_by::text) || ':' ||
           greatest(v_uid::text, v_invite.invited_by::text);

  select id into v_conv_id
  from public.conversations
  where dm_key = v_key and deleted_at is null
  limit 1;

  if v_conv_id is null then
    insert into public.conversations (workspace_id, is_group, dm_key, created_by)
    values (null, false, v_key, v_uid)
    returning id into v_conv_id;

    insert into public.conversation_participants (conversation_id, user_id)
    values (v_conv_id, v_uid), (v_conv_id, v_invite.invited_by);
  end if;

  return v_conv_id;
end;
$$;

-- ---- widen the DM gate: shared workspace OR standing connection --------------

create or replace function public.get_or_create_dm(
  p_workspace_id uuid,
  p_other_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_conv_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- DM anyone you share an active workspace with (self included for the
  -- notes thread), or anyone you hold a personal DM connection with.
  if not exists (
    select 1
    from public.workspace_members me
    join public.workspace_members them
      on them.workspace_id = me.workspace_id
    join public.workspaces w on w.id = me.workspace_id
    where me.user_id = v_uid and me.deleted_at is null
      and them.user_id = p_other_user_id and them.deleted_at is null
      and w.deleted_at is null
  ) and not public.has_dm_connection(v_uid, p_other_user_id) then
    raise exception 'no shared workspace or DM connection with this user';
  end if;

  v_key := least(v_uid::text, p_other_user_id::text) || ':' ||
           greatest(v_uid::text, p_other_user_id::text);

  select id into v_conv_id
  from public.conversations
  where dm_key = v_key and deleted_at is null
  limit 1;

  if v_conv_id is not null then
    return v_conv_id;
  end if;

  insert into public.conversations (workspace_id, is_group, dm_key, created_by)
  values (null, false, v_key, v_uid)
  returning id into v_conv_id;

  insert into public.conversation_participants (conversation_id, user_id)
  select v_conv_id, u
  from (select distinct unnest(array[v_uid, p_other_user_id]) as u) users;

  return v_conv_id;
end;
$$;

-- ---- profiles visibility: connections can see each other ----------------------

drop policy if exists profiles_select on public.profiles;
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
    or public.has_dm_connection(auth.uid(), profiles.id)
  );
