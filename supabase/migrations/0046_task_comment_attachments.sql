-- =============================================================================
-- Task comment attachments — let users attach photos / videos / files when
-- posting an update on a task, so bug reports and progress notes can carry
-- visual evidence instead of just prose.
-- Tasking — Team Collaboration SaaS
--
-- Mirrors public.message_attachments 1:1 (same columns, same kinds) so the
-- existing AttachmentView on the client can render both without a second
-- code path. RLS keys off can_access_task via the parent comment.
-- =============================================================================

create table if not exists public.task_comment_attachments (
  id           uuid primary key default gen_random_uuid(),
  comment_id   uuid not null references public.task_comments (id) on delete cascade,
  storage_path text not null,
  thumb_path   text,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,
  kind         public.attachment_kind not null default 'file',
  width        integer,
  height       integer,
  duration_ms  integer,
  created_at   timestamptz not null default now()
);

create index if not exists task_comment_attachments_comment_id_idx
  on public.task_comment_attachments (comment_id);

alter table public.task_comment_attachments enable row level security;

-- SELECT: anyone with access to the parent task's project.
create policy task_comment_attachments_select on public.task_comment_attachments
  for select using (
    exists (
      select 1 from public.task_comments c
      where c.id = comment_id and public.can_access_task(c.task_id)
    )
  );

-- INSERT: only the comment's author can attach files to their own comment
-- (blocks anyone else from tacking evidence onto someone else's update).
create policy task_comment_attachments_insert on public.task_comment_attachments
  for insert with check (
    exists (
      select 1 from public.task_comments c
      where c.id = comment_id
        and c.user_id = auth.uid()
        and public.can_access_task(c.task_id)
    )
  );

-- DELETE: author of the comment, or a workspace admin (parallels the
-- task_comments_delete policy).
create policy task_comment_attachments_delete on public.task_comment_attachments
  for delete using (
    exists (
      select 1
      from public.task_comments c
      join public.tasks t on t.id = c.task_id
      join public.projects p on p.id = t.project_id
      where c.id = comment_id
        and (c.user_id = auth.uid() or public.is_workspace_admin(p.workspace_id))
    )
  );

alter publication supabase_realtime add table public.task_comment_attachments;

notify pgrst, 'reload schema';
