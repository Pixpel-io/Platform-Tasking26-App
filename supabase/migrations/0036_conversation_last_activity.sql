-- =============================================================================
-- 0036 — Conversations track their last message (WhatsApp-style DM ordering)
--
-- The DM list should order by most-recent message, but nothing bumped
-- conversations.updated_at when a message landed - the column only changed on
-- row edits, so getConversations' order(updated_at desc) was effectively
-- creation order. Touch the conversation on every new message and backfill
-- from existing messages so the first load after deploy is already correct.
-- =============================================================================

create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.conversation_id is not null then
    update public.conversations
    set updated_at = new.created_at
    where id = new.conversation_id;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_on_message();

-- Backfill: set each conversation's updated_at to its newest message time.
update public.conversations c
set updated_at = m.last_at
from (
  select conversation_id, max(created_at) as last_at
  from public.messages
  where conversation_id is not null
  group by conversation_id
) m
where c.id = m.conversation_id
  and c.updated_at < m.last_at;
