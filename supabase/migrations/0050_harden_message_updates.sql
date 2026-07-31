-- Keep message authorship and delivery immutable after insertion. Pinning is
-- the sole collaborator action, performed by a narrow SECURITY DEFINER RPC.
drop policy if exists messages_update on public.messages;

create policy messages_update_author_or_admin on public.messages
  for update using (
    user_id = auth.uid() or public.is_workspace_admin(workspace_id)
  ) with check (
    user_id = auth.uid() or public.is_workspace_admin(workspace_id)
  );

create or replace function public.set_message_pin(
  p_message_id uuid,
  p_pinned boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  update public.messages m
  set pinned_at = case when p_pinned then now() else null end,
      pinned_by = case when p_pinned then v_uid else null end
  where m.id = p_message_id
    and (
      (m.channel_id is not null and public.can_access_channel(m.channel_id))
      or (m.conversation_id is not null and public.is_conversation_participant(m.conversation_id))
    );
end;
$$;

revoke all on function public.set_message_pin(uuid, boolean) from public;
grant execute on function public.set_message_pin(uuid, boolean) to authenticated;
