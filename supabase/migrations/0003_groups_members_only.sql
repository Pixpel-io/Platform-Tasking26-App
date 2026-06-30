-- =============================================================================
-- Phase 1 correction — Groups are membership-only (no public/private concept)
-- Tasking — Team Collaboration SaaS
--
-- The original spec says: "No public/private channel concept — access =
-- membership, enforced in RLS." 0001 shipped a public/private flag and let any
-- workspace member read public channels. This migration removes that: every
-- group is private-by-membership. A group's creator (or a workspace admin) can
-- add members; everyone else only sees groups they belong to.
--
-- Non-destructive: existing channels/messages are kept. Public channels simply
-- become members-only — their existing members keep access, others lose the
-- implicit read they had. Run after 0001/0002.
-- =============================================================================

-- ---- 1. Access is now purely membership ------------------------------------
-- can_access_channel previously allowed any workspace member into a public
-- channel. Collapse it to: workspace member AND explicit channel member.
create or replace function public.can_access_channel(p_channel_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.channels c
    where c.id = p_channel_id
      and c.deleted_at is null
      and public.is_workspace_member(c.workspace_id)
      and public.is_channel_member(c.id)
  );
$$;

-- ---- 2. Tighten the channels SELECT policy ---------------------------------
drop policy if exists channels_select on public.channels;
create policy channels_select on public.channels
  for select using (
    public.is_workspace_member(workspace_id)
    and public.is_channel_member(id)
  );

-- ---- 3. Member inserts: only the creator or a workspace admin may add ------
-- Drop the old policy that let anyone self-join a *public* channel.
drop policy if exists channel_members_insert on public.channel_members;
create policy channel_members_insert on public.channel_members
  for insert with check (
    exists (
      select 1 from public.channels c
      where c.id = channel_id
        and (
          public.is_workspace_admin(c.workspace_id)
          or c.created_by = auth.uid()
        )
    )
  );

-- ---- 4. Drop the is_private column -----------------------------------------
alter table public.channels drop column if exists is_private;

-- ---- 5. Replace create_channel — no privacy flag, optional member list -----
drop function if exists public.create_channel(uuid, text, text, boolean);

create or replace function public.create_channel(
  p_workspace_id uuid,
  p_name text,
  p_description text default null,
  p_member_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_channel_id uuid;
  v_member uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a member of this workspace';
  end if;

  insert into public.channels (workspace_id, name, description, created_by)
  values (p_workspace_id, p_name, nullif(trim(p_description), ''), v_uid)
  returning id into v_channel_id;

  -- Creator is always a member.
  insert into public.channel_members (channel_id, user_id)
  values (v_channel_id, v_uid);

  -- Seat any additional members that belong to the same workspace.
  if p_member_ids is not null then
    foreach v_member in array p_member_ids loop
      if v_member <> v_uid and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = p_workspace_id
          and wm.user_id = v_member
          and wm.deleted_at is null
      ) then
        insert into public.channel_members (channel_id, user_id)
        values (v_channel_id, v_member)
        on conflict (channel_id, user_id) do nothing;
      end if;
    end loop;
  end if;

  return v_channel_id;
end;
$$;

-- ---- 6. add_channel_members — let creator/admin add people after creation --
create or replace function public.add_channel_members(
  p_channel_id uuid,
  p_member_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_workspace_id uuid;
  v_member uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select workspace_id into v_workspace_id
  from public.channels
  where id = p_channel_id and deleted_at is null;

  if v_workspace_id is null then
    raise exception 'group not found';
  end if;

  if not (
    public.is_workspace_admin(v_workspace_id)
    or exists (
      select 1 from public.channels c
      where c.id = p_channel_id and c.created_by = v_uid
    )
  ) then
    raise exception 'only the group creator or a workspace admin can add members';
  end if;

  foreach v_member in array p_member_ids loop
    if exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = v_workspace_id
        and wm.user_id = v_member
        and wm.deleted_at is null
    ) then
      insert into public.channel_members (channel_id, user_id)
      values (p_channel_id, v_member)
      on conflict (channel_id, user_id)
      do update set deleted_at = null;
    end if;
  end loop;
end;
$$;
