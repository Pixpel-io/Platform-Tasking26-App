-- 0018: Notify all assignees when someone comments on a task.
--
-- Complements 0005 (task.assigned) and 0017 (task.status): whenever a comment
-- lands on a task, everyone assigned to it (except the commenter) gets a
-- 'task.comment' notification carrying the comment text. Realtime then
-- delivers the toast/bell like every other notification.

create or replace function public.notify_on_task_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_project_id uuid;
  v_task_title text;
  v_actor_name text;
begin
  select t.project_id, t.title, p.workspace_id
    into v_project_id, v_task_title, v_workspace_id
  from public.tasks t
  join public.projects p on p.id = t.project_id
  where t.id = new.task_id
    and t.deleted_at is null;
  if v_workspace_id is null then
    return new;
  end if;

  select coalesce(full_name, email) into v_actor_name
  from public.profiles where id = new.user_id;

  insert into public.notifications (
    workspace_id, user_id, actor_id, type, title, body, task_id, project_id
  )
  select
    v_workspace_id,
    ta.user_id,
    new.user_id,
    'task.comment',
    coalesce(v_actor_name, 'Someone') || ' commented on "' || v_task_title || '"',
    left(new.body, 140),
    new.task_id,
    v_project_id
  from public.task_assignees ta
  where ta.task_id = new.task_id
    and ta.user_id is distinct from new.user_id;

  return new;
end;
$$;

drop trigger if exists task_comments_notify on public.task_comments;
create trigger task_comments_notify
  after insert on public.task_comments
  for each row execute function public.notify_on_task_comment();

-- Comment counts render live on the board; make sure comment inserts/deletes
-- reach subscribed clients.
do $$
begin
  alter publication supabase_realtime add table public.task_comments;
exception
  when duplicate_object then null;
end;
$$;
