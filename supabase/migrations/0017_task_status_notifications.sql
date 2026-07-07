-- 0017: Notify all assignees when a task's status (column) changes.
--
-- Complements 0005's task.assigned trigger: whenever a task moves between
-- kanban columns, everyone assigned to it (except whoever moved it) gets a
-- 'task.status' notification naming the new status. Realtime then delivers
-- the toast/bell like every other notification.

create or replace function public.notify_on_task_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_status text;
begin
  -- Only when the task actually changed column (status).
  if new.column_id is not distinct from old.column_id then
    return new;
  end if;
  if new.deleted_at is not null then
    return new;
  end if;

  select p.workspace_id into v_workspace_id
  from public.projects p
  where p.id = new.project_id;
  if v_workspace_id is null then
    return new;
  end if;

  select name into v_status
  from public.kanban_columns
  where id = new.column_id;

  select coalesce(full_name, email) into v_actor_name
  from public.profiles where id = v_actor;

  insert into public.notifications (
    workspace_id, user_id, actor_id, type, title, body, task_id, project_id
  )
  select
    v_workspace_id,
    ta.user_id,
    v_actor,
    'task.status',
    coalesce(v_actor_name, 'Someone') || ' moved "' || new.title || '" to '
      || coalesce(v_status, 'a new status'),
    new.title,
    new.id,
    new.project_id
  from public.task_assignees ta
  where ta.task_id = new.id
    and ta.user_id is distinct from v_actor;

  return new;
end;
$$;

drop trigger if exists tasks_notify_status_change on public.tasks;
create trigger tasks_notify_status_change
  after update on public.tasks
  for each row execute function public.notify_on_task_status_change();
