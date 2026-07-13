-- =============================================================================
-- 0035 — Seat task assignees into their project
--
-- createTask (and Cleotilda's create_task) inserted task_assignees rows
-- without a matching project_members row. RLS (projects_select) hides the
-- project from non-members, so the assignee's "task.assigned" notification
-- opened a 404. The app now seats assignees before assigning, but:
--   1. Existing assignees are still unseated — backfill them.
--   2. A trigger guarantees every future assignment path seats the assignee,
--      so no code path can reintroduce the 404.
-- =============================================================================

-- ---- 1. Backfill: seat every current assignee into their task's project ----

insert into public.project_members (project_id, user_id)
select distinct t.project_id, ta.user_id
from public.task_assignees ta
join public.tasks t on t.id = ta.task_id
where t.deleted_at is null
on conflict (project_id, user_id)
do update set deleted_at = null;

-- ---- 2. Trigger: seat future assignees automatically ------------------------

create or replace function public.seat_assignee_into_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
begin
  select project_id into v_project_id
  from public.tasks where id = new.task_id;
  if v_project_id is not null then
    insert into public.project_members (project_id, user_id)
    values (v_project_id, new.user_id)
    on conflict (project_id, user_id)
    do update set deleted_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists task_assignees_seat_member on public.task_assignees;

-- BEFORE the 0005 notify trigger alphabetically doesn't matter here — both are
-- AFTER INSERT and independent; ordering between them has no effect.
create trigger task_assignees_seat_member
  after insert on public.task_assignees
  for each row execute function public.seat_assignee_into_project();
