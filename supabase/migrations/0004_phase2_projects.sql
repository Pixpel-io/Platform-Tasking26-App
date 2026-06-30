-- =============================================================================
-- Phase 2 — Project Management
-- Tasking — Team Collaboration SaaS
--
-- Projects, tasks (full ClickUp-style attributes), per-project Kanban columns,
-- labels, assignees, watchers, subtasks, checklists, comments, time tracking,
-- and an activity log. Realtime is enabled on the boards so Kanban/List/Calendar
-- views update live.
--
-- Conventions (same as 0000/0001): uuid PKs, created_at/updated_at, soft delete,
-- FK + created_at indexes, RLS on every table. Access checks live in SECURITY
-- DEFINER helpers so task/board policies never recurse through membership.
--
-- Hierarchy: workspace -> projects (independent of groups). Project members are
-- chosen from workspace members. Run after 0000-0003.
-- =============================================================================

create type public.project_status as enum (
  'planning', 'active', 'on_hold', 'completed', 'archived'
);

create type public.priority_level as enum ('none', 'low', 'medium', 'high', 'urgent');

-- 'call_event' style reservation isn't needed here, but keep the activity verb
-- list open-ended (text) so future events don't require a migration.

-- =============================================================================
-- projects
-- =============================================================================
create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  description  text,
  status       public.project_status not null default 'active',
  priority     public.priority_level not null default 'none',
  start_date   date,
  due_date     date,
  owner_id     uuid not null references public.profiles (id) on delete restrict,
  created_by   uuid not null references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index projects_workspace_id_idx on public.projects (workspace_id);
create index projects_owner_id_idx on public.projects (owner_id);
create index projects_created_at_idx on public.projects (created_at);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- =============================================================================
-- project_members — who can see/work a project (chosen from workspace members)
-- =============================================================================
create table public.project_members (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (project_id, user_id)
);

create index project_members_project_id_idx on public.project_members (project_id);
create index project_members_user_id_idx on public.project_members (user_id);
create index project_members_created_at_idx on public.project_members (created_at);

create trigger project_members_set_updated_at
  before update on public.project_members
  for each row execute function public.set_updated_at();

-- =============================================================================
-- labels — per-workspace, attachable to projects and tasks
-- =============================================================================
create table public.labels (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  color        text not null default '#6366f1',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (workspace_id, name)
);

create index labels_workspace_id_idx on public.labels (workspace_id);
create index labels_created_at_idx on public.labels (created_at);

create trigger labels_set_updated_at
  before update on public.labels
  for each row execute function public.set_updated_at();

create table public.project_labels (
  project_id uuid not null references public.projects (id) on delete cascade,
  label_id   uuid not null references public.labels (id) on delete cascade,
  primary key (project_id, label_id)
);

create index project_labels_label_id_idx on public.project_labels (label_id);

-- =============================================================================
-- kanban_columns — per-project, ordered board columns
-- =============================================================================
create table public.kanban_columns (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name       text not null,
  position   integer not null default 0,
  is_done    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index kanban_columns_project_id_position_idx
  on public.kanban_columns (project_id, position);

create trigger kanban_columns_set_updated_at
  before update on public.kanban_columns
  for each row execute function public.set_updated_at();

-- =============================================================================
-- tasks
-- =============================================================================
create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  column_id     uuid references public.kanban_columns (id) on delete set null,
  parent_id     uuid references public.tasks (id) on delete cascade,
  title         text not null,
  description   text,
  priority      public.priority_level not null default 'none',
  start_date    date,
  due_date      date,
  position      double precision not null default 0,
  time_estimate_minutes integer,
  completed_at  timestamptz,
  created_by    uuid not null references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index tasks_project_id_idx on public.tasks (project_id);
create index tasks_column_id_idx on public.tasks (column_id);
create index tasks_parent_id_idx on public.tasks (parent_id);
create index tasks_due_date_idx on public.tasks (due_date);
create index tasks_created_at_idx on public.tasks (created_at);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- =============================================================================
-- task_assignees / task_watchers
-- =============================================================================
create table public.task_assignees (
  task_id    uuid not null references public.tasks (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index task_assignees_user_id_idx on public.task_assignees (user_id);

create table public.task_watchers (
  task_id    uuid not null references public.tasks (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index task_watchers_user_id_idx on public.task_watchers (user_id);

-- =============================================================================
-- task_labels
-- =============================================================================
create table public.task_labels (
  task_id  uuid not null references public.tasks (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  primary key (task_id, label_id)
);

create index task_labels_label_id_idx on public.task_labels (label_id);

-- =============================================================================
-- checklists + checklist_items
-- =============================================================================
create table public.checklists (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  title      text not null default 'Checklist',
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index checklists_task_id_idx on public.checklists (task_id);

create trigger checklists_set_updated_at
  before update on public.checklists
  for each row execute function public.set_updated_at();

create table public.checklist_items (
  id           uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists (id) on delete cascade,
  content      text not null,
  is_done      boolean not null default false,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index checklist_items_checklist_id_idx on public.checklist_items (checklist_id);

create trigger checklist_items_set_updated_at
  before update on public.checklist_items
  for each row execute function public.set_updated_at();

-- =============================================================================
-- task_comments
-- =============================================================================
create table public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete restrict,
  body       text not null,
  edited_at  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index task_comments_task_id_idx on public.task_comments (task_id);
create index task_comments_created_at_idx on public.task_comments (created_at);

create trigger task_comments_set_updated_at
  before update on public.task_comments
  for each row execute function public.set_updated_at();

-- =============================================================================
-- task_attachments — metadata; bytes in Supabase Storage (reuse chat bucket
-- convention but a dedicated bucket comes in the storage migration)
-- =============================================================================
create table public.task_attachments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks (id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid not null references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now()
);

create index task_attachments_task_id_idx on public.task_attachments (task_id);

-- =============================================================================
-- task_time_entries — time tracking
-- =============================================================================
create table public.task_time_entries (
  id              uuid primary key default gen_random_uuid(),
  task_id         uuid not null references public.tasks (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  duration_minutes integer not null,
  note            text,
  started_at      timestamptz,
  created_at      timestamptz not null default now()
);

create index task_time_entries_task_id_idx on public.task_time_entries (task_id);
create index task_time_entries_user_id_idx on public.task_time_entries (user_id);

-- =============================================================================
-- activity_logs — created/updated/assigned/completed/comment/file events
-- =============================================================================
create table public.activity_logs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id   uuid references public.projects (id) on delete cascade,
  task_id      uuid references public.tasks (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null,
  verb         text not null,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index activity_logs_workspace_id_idx on public.activity_logs (workspace_id);
create index activity_logs_project_id_idx on public.activity_logs (project_id);
create index activity_logs_task_id_idx on public.activity_logs (task_id);
create index activity_logs_created_at_idx on public.activity_logs (created_at);

-- =============================================================================
-- SECURITY DEFINER access helpers
-- =============================================================================
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.deleted_at is null
  );
$$;

-- A project is accessible to its members, and to workspace admins/owners (so
-- managers can oversee every project without being explicitly added).
create or replace function public.can_access_project(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id
      and p.deleted_at is null
      and (
        public.is_project_member(p.id)
        or public.is_workspace_admin(p.workspace_id)
      )
  );
$$;

-- Resolve the workspace for a task in one hop (used by task-child policies).
create or replace function public.task_project_id(p_task_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select project_id from public.tasks where id = p_task_id;
$$;

create or replace function public.can_access_task(p_task_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.can_access_project(public.task_project_id(p_task_id));
$$;

-- =============================================================================
-- RPCs
-- =============================================================================

-- Create a project, seat the owner as a member, and seed default Kanban columns.
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
  v_member uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select workspace_id into v_workspace_id
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
      insert into public.project_members (project_id, user_id)
      values (p_project_id, v_member)
      on conflict (project_id, user_id) do update set deleted_at = null;
    end if;
  end loop;
end;
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.projects           enable row level security;
alter table public.project_members    enable row level security;
alter table public.labels             enable row level security;
alter table public.project_labels     enable row level security;
alter table public.kanban_columns     enable row level security;
alter table public.tasks              enable row level security;
alter table public.task_assignees     enable row level security;
alter table public.task_watchers      enable row level security;
alter table public.task_labels        enable row level security;
alter table public.checklists         enable row level security;
alter table public.checklist_items    enable row level security;
alter table public.task_comments      enable row level security;
alter table public.task_attachments   enable row level security;
alter table public.task_time_entries  enable row level security;
alter table public.activity_logs      enable row level security;

-- ---- projects -------------------------------------------------------------
create policy projects_select on public.projects
  for select using (
    public.is_project_member(id) or public.is_workspace_admin(workspace_id)
  );

create policy projects_insert on public.projects
  for insert with check (
    created_by = auth.uid() and public.is_workspace_member(workspace_id)
  );

create policy projects_update on public.projects
  for update using (
    owner_id = auth.uid() or public.is_workspace_admin(workspace_id)
  ) with check (
    owner_id = auth.uid() or public.is_workspace_admin(workspace_id)
  );

-- ---- project_members ------------------------------------------------------
create policy project_members_select on public.project_members
  for select using (public.can_access_project(project_id));

create policy project_members_insert on public.project_members
  for insert with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.owner_id = auth.uid() or public.is_workspace_admin(p.workspace_id))
    )
  );

create policy project_members_delete on public.project_members
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.owner_id = auth.uid() or public.is_workspace_admin(p.workspace_id))
    )
  );

-- ---- labels ---------------------------------------------------------------
create policy labels_select on public.labels
  for select using (public.is_workspace_member(workspace_id));
create policy labels_insert on public.labels
  for insert with check (public.is_workspace_member(workspace_id));
create policy labels_update on public.labels
  for update using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy labels_delete on public.labels
  for delete using (public.is_workspace_admin(workspace_id));

-- ---- project_labels -------------------------------------------------------
create policy project_labels_select on public.project_labels
  for select using (public.can_access_project(project_id));
create policy project_labels_insert on public.project_labels
  for insert with check (public.can_access_project(project_id));
create policy project_labels_delete on public.project_labels
  for delete using (public.can_access_project(project_id));

-- ---- kanban_columns -------------------------------------------------------
create policy kanban_columns_select on public.kanban_columns
  for select using (public.can_access_project(project_id));
create policy kanban_columns_insert on public.kanban_columns
  for insert with check (public.can_access_project(project_id));
create policy kanban_columns_update on public.kanban_columns
  for update using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));
create policy kanban_columns_delete on public.kanban_columns
  for delete using (public.can_access_project(project_id));

-- ---- tasks ----------------------------------------------------------------
create policy tasks_select on public.tasks
  for select using (public.can_access_project(project_id));
create policy tasks_insert on public.tasks
  for insert with check (
    created_by = auth.uid() and public.can_access_project(project_id)
  );
create policy tasks_update on public.tasks
  for update using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));
create policy tasks_delete on public.tasks
  for delete using (public.can_access_project(project_id));

-- ---- task_assignees / watchers / labels -----------------------------------
create policy task_assignees_select on public.task_assignees
  for select using (public.can_access_task(task_id));
create policy task_assignees_insert on public.task_assignees
  for insert with check (public.can_access_task(task_id));
create policy task_assignees_delete on public.task_assignees
  for delete using (public.can_access_task(task_id));

create policy task_watchers_select on public.task_watchers
  for select using (public.can_access_task(task_id));
create policy task_watchers_insert on public.task_watchers
  for insert with check (public.can_access_task(task_id));
create policy task_watchers_delete on public.task_watchers
  for delete using (public.can_access_task(task_id));

create policy task_labels_select on public.task_labels
  for select using (public.can_access_task(task_id));
create policy task_labels_insert on public.task_labels
  for insert with check (public.can_access_task(task_id));
create policy task_labels_delete on public.task_labels
  for delete using (public.can_access_task(task_id));

-- ---- checklists + items ---------------------------------------------------
create policy checklists_select on public.checklists
  for select using (public.can_access_task(task_id));
create policy checklists_insert on public.checklists
  for insert with check (public.can_access_task(task_id));
create policy checklists_update on public.checklists
  for update using (public.can_access_task(task_id))
  with check (public.can_access_task(task_id));
create policy checklists_delete on public.checklists
  for delete using (public.can_access_task(task_id));

create policy checklist_items_select on public.checklist_items
  for select using (
    exists (
      select 1 from public.checklists c
      where c.id = checklist_id and public.can_access_task(c.task_id)
    )
  );
create policy checklist_items_insert on public.checklist_items
  for insert with check (
    exists (
      select 1 from public.checklists c
      where c.id = checklist_id and public.can_access_task(c.task_id)
    )
  );
create policy checklist_items_update on public.checklist_items
  for update using (
    exists (
      select 1 from public.checklists c
      where c.id = checklist_id and public.can_access_task(c.task_id)
    )
  ) with check (
    exists (
      select 1 from public.checklists c
      where c.id = checklist_id and public.can_access_task(c.task_id)
    )
  );
create policy checklist_items_delete on public.checklist_items
  for delete using (
    exists (
      select 1 from public.checklists c
      where c.id = checklist_id and public.can_access_task(c.task_id)
    )
  );

-- ---- task_comments --------------------------------------------------------
create policy task_comments_select on public.task_comments
  for select using (public.can_access_task(task_id));
create policy task_comments_insert on public.task_comments
  for insert with check (
    user_id = auth.uid() and public.can_access_task(task_id)
  );
create policy task_comments_update on public.task_comments
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy task_comments_delete on public.task_comments
  for delete using (
    user_id = auth.uid()
    or public.is_workspace_admin(
      (select workspace_id from public.projects p
       join public.tasks t on t.project_id = p.id where t.id = task_id)
    )
  );

-- ---- task_attachments -----------------------------------------------------
create policy task_attachments_select on public.task_attachments
  for select using (public.can_access_task(task_id));
create policy task_attachments_insert on public.task_attachments
  for insert with check (
    uploaded_by = auth.uid() and public.can_access_task(task_id)
  );
create policy task_attachments_delete on public.task_attachments
  for delete using (uploaded_by = auth.uid());

-- ---- task_time_entries ----------------------------------------------------
create policy task_time_entries_select on public.task_time_entries
  for select using (public.can_access_task(task_id));
create policy task_time_entries_insert on public.task_time_entries
  for insert with check (
    user_id = auth.uid() and public.can_access_task(task_id)
  );
create policy task_time_entries_delete on public.task_time_entries
  for delete using (user_id = auth.uid());

-- ---- activity_logs --------------------------------------------------------
create policy activity_logs_select on public.activity_logs
  for select using (
    (project_id is not null and public.can_access_project(project_id))
    or (project_id is null and public.is_workspace_member(workspace_id))
  );
create policy activity_logs_insert on public.activity_logs
  for insert with check (
    actor_id = auth.uid() and public.is_workspace_member(workspace_id)
  );

-- =============================================================================
-- Activity triggers — auto-log task lifecycle without trusting the client
-- =============================================================================
create or replace function public.log_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.projects where id = coalesce(new.project_id, old.project_id);

  if tg_op = 'INSERT' then
    insert into public.activity_logs (workspace_id, project_id, task_id, actor_id, verb, meta)
    values (v_workspace_id, new.project_id, new.id, auth.uid(), 'task.created',
            jsonb_build_object('title', new.title));
  elsif tg_op = 'UPDATE' then
    if new.completed_at is not null and old.completed_at is null then
      insert into public.activity_logs (workspace_id, project_id, task_id, actor_id, verb)
      values (v_workspace_id, new.project_id, new.id, auth.uid(), 'task.completed');
    elsif new.column_id is distinct from old.column_id then
      insert into public.activity_logs (workspace_id, project_id, task_id, actor_id, verb, meta)
      values (v_workspace_id, new.project_id, new.id, auth.uid(), 'task.moved',
              jsonb_build_object('from', old.column_id, 'to', new.column_id));
    elsif new.deleted_at is not null and old.deleted_at is null then
      insert into public.activity_logs (workspace_id, project_id, task_id, actor_id, verb)
      values (v_workspace_id, new.project_id, new.id, auth.uid(), 'task.deleted');
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger tasks_activity
  after insert or update on public.tasks
  for each row execute function public.log_task_activity();

-- =============================================================================
-- Realtime
-- =============================================================================
alter publication supabase_realtime add table public.projects;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.task_assignees;
alter publication supabase_realtime add table public.kanban_columns;
alter publication supabase_realtime add table public.task_comments;
alter publication supabase_realtime add table public.checklist_items;
