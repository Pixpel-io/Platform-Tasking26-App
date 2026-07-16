-- =============================================================================
-- Group deletion — only the group creator can delete a group
-- Tasking — Team Collaboration SaaS
--
-- A SECURITY DEFINER RPC gates STRICTLY on "created_by = auth.uid()": unlike
-- rename/remove-member (which also allow workspace admins), deleting a group is
-- reserved for the person who made it. Soft-deletes the channel (deleted_at) and
-- its channel_members rows so every member's sidebar drops the group on refresh.
--
-- Members subscribed to their own channel_members changes get a live sidebar
-- refresh; the deleter is redirected by the server action.
-- =============================================================================

create or replace function public.delete_channel(
  p_channel_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_created_by uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select created_by
    into v_created_by
  from public.channels
  where id = p_channel_id and deleted_at is null;

  if v_created_by is null then
    raise exception 'group not found';
  end if;

  if v_created_by <> v_uid then
    raise exception 'only the group creator can delete this group';
  end if;

  update public.channels
  set deleted_at = now()
  where id = p_channel_id and deleted_at is null;

  update public.channel_members
  set deleted_at = now()
  where channel_id = p_channel_id and deleted_at is null;
end;
$$;

notify pgrst, 'reload schema';
