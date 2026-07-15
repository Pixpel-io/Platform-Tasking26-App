-- =============================================================================
-- 0040_project_member_notifications — notify a user when they are added to a
-- board, both at creation time (create_project) and later (add_project_members).
--
-- Mirrors the add_channel_members precedent (0009, 'group.added'): only freshly
-- added members are notified (re-adding a soft-removed member counts as fresh;
-- re-adding an already-active member does not, so no spam). The board owner /
-- actor never notifies themselves. notificationHref already routes project_id
-- to the board, so no UI/link changes are needed. Both entry points are
-- SECURITY DEFINER RPCs, which is the only layer allowed to insert notifications
-- (the table has no INSERT RLS policy).
-- =============================================================================

create or replace function public.create_project(
  p_workspace_id uuid,
  p_name text,
  p_description text default null,
  p_priority public.priority_level default 'none',
  p_member_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_project_id uuid;
  v_member uuid;
  v_actor_name text;
  v_added uuid[] := '{}'::uuid[];
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a member of this workspace';
  end if;

  insert into public.projects (workspace_id, name, description, priority, owner_id, created_by)
  values (p_workspace_id, p_name, nullif(trim(p_description), ''), coalesce(p_priority, 'none'), v_uid, v_uid)
  returning id into v_project_id;

  insert into public.project_members (project_id, user_id)
  values (v_project_id, v_uid);

  if p_member_ids is not null then
    foreach v_member in array p_member_ids loop
      if v_member <> v_uid and exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = p_workspace_id
          and wm.user_id = v_member
          and wm.deleted_at is null
      ) then
        insert into public.project_members (project_id, user_id)
        values (v_project_id, v_member)
        on conflict (project_id, user_id) do nothing;
        v_added := array_append(v_added, v_member);
      end if;
    end loop;
  end if;

  -- Default board: Backlog, Todo, In Progress, Review, Testing, Done.
  insert into public.kanban_columns (project_id, name, position, is_done) values
    (v_project_id, 'Backlog', 0, false),
    (v_project_id, 'Todo', 1, false),
    (v_project_id, 'In Progress', 2, false),
    (v_project_id, 'Review', 3, false),
    (v_project_id, 'Testing', 4, false),
    (v_project_id, 'Done', 5, true);

  insert into public.activity_logs (workspace_id, project_id, actor_id, verb)
  values (p_workspace_id, v_project_id, v_uid, 'project.created');

  if array_length(v_added, 1) is not null then
    select coalesce(full_name, email) into v_actor_name
    from public.profiles where id = v_uid;

    insert into public.notifications (
      workspace_id, user_id, actor_id, type, title, body, project_id
    )
    select
      p_workspace_id, m, v_uid, 'project.added',
      coalesce(v_actor_name, 'Someone') || ' added you to ' || p_name,
      '', v_project_id
    from unnest(v_added) as m;
  end if;

  return v_project_id;
end;
$$;

create or replace function public.add_project_members(
  p_project_id uuid,
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
  v_project_name text;
  v_member uuid;
  v_actor_name text;
  v_added uuid[] := '{}'::uuid[];
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select workspace_id, name into v_workspace_id, v_project_name
  from public.projects where id = p_project_id and deleted_at is null;
  if v_workspace_id is null then
    raise exception 'project not found';
  end if;

  if not (
    public.is_workspace_admin(v_workspace_id)
    or exists (select 1 from public.projects p where p.id = p_project_id and p.owner_id = v_uid)
  ) then
    raise exception 'only the project owner or a workspace admin can add members';
  end if;

  foreach v_member in array p_member_ids loop
    if exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = v_workspace_id
        and wm.user_id = v_member
        and wm.deleted_at is null
    ) then
      -- Only a fresh add (not already active) is notified; re-adding a
      -- soft-removed member counts as fresh, re-adding an active one does not.
      if not exists (
        select 1 from public.project_members pm
        where pm.project_id = p_project_id
          and pm.user_id = v_member
          and pm.deleted_at is null
      ) then
        v_added := array_append(v_added, v_member);
      end if;

      insert into public.project_members (project_id, user_id)
      values (p_project_id, v_member)
      on conflict (project_id, user_id) do update set deleted_at = null;
    end if;
  end loop;

  if array_length(v_added, 1) is not null then
    select coalesce(full_name, email) into v_actor_name
    from public.profiles where id = v_uid;

    insert into public.notifications (
      workspace_id, user_id, actor_id, type, title, body, project_id
    )
    select
      v_workspace_id, m, v_uid, 'project.added',
      coalesce(v_actor_name, 'Someone') || ' added you to ' || v_project_name,
      '', p_project_id
    from unnest(v_added) as m;
  end if;
end;
$$;

notify pgrst, 'reload schema';
