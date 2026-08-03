-- Security hardening: bind profile identity to Supabase Auth, close the legacy
-- workspace-creation RPC bypass, protect message routing/authorship fields,
-- and provide an atomic service-role mail rate limiter.

-- A profile email is an identity attribute, not user-editable profile data.
create or replace function public.protect_profile_identity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_auth_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null or new.id <> auth.uid() then
      raise exception 'profile identity does not match the authenticated user';
    end if;
    if tg_op = 'INSERT' and lower(new.email) <> v_auth_email then
      raise exception 'profile email must match the authenticated account';
    end if;
    if tg_op = 'UPDATE' and (new.id <> old.id or new.email is distinct from old.email) then
      raise exception 'profile identity fields cannot be changed';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_identity on public.profiles;
create trigger profiles_protect_identity
  before insert or update on public.profiles
  for each row execute function public.protect_profile_identity();

-- Authorization allowlists must use the verified Auth JWT identity rather
-- than a mutable application profile row.
create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.app_admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.can_create_workspace()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_super_admin() or exists (
    select 1 from public.workspace_creators c
    where auth.uid() is not null
      and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Only the gated wrapper may invoke this implementation. Function owners
-- retain access, so create_workspace_gated continues to work.
revoke all on function public.create_workspace(text, text, text) from public;
revoke all on function public.create_workspace(text, text, text) from anon;
revoke all on function public.create_workspace(text, text, text) from authenticated;

-- Authors/admins may edit content or soft-delete, but may never move a row,
-- change its author/type, or rewrite its creation timestamp.
create or replace function public.protect_message_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.workspace_id is distinct from old.workspace_id
    or new.channel_id is distinct from old.channel_id
    or new.conversation_id is distinct from old.conversation_id
    or new.parent_id is distinct from old.parent_id
    or new.reply_to_id is distinct from old.reply_to_id
    or new.kind is distinct from old.kind
    or new.created_at is distinct from old.created_at then
    raise exception 'message identity and routing fields cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_protect_identity on public.messages;
create trigger messages_protect_identity
  before update on public.messages
  for each row execute function public.protect_message_identity();

-- Atomic, fixed-window limits used by sensitive server-side operations.
create table if not exists public.request_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key (user_id, action)
);

alter table public.request_rate_limits enable row level security;

create or replace function public.consume_request_rate_limit(
  p_user_id uuid,
  p_action text,
  p_window_seconds integer,
  p_max_requests integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required';
  end if;
  if p_window_seconds < 1 or p_max_requests < 1 or length(p_action) > 64 then
    raise exception 'invalid rate limit configuration';
  end if;

  insert into public.request_rate_limits (user_id, action, window_start, request_count)
  values (p_user_id, p_action, now(), 1)
  on conflict (user_id, action) do update
  set window_start = case
        when public.request_rate_limits.window_start <= now() - make_interval(secs => p_window_seconds)
          then now()
        else public.request_rate_limits.window_start
      end,
      request_count = case
        when public.request_rate_limits.window_start <= now() - make_interval(secs => p_window_seconds)
          then 1
        else public.request_rate_limits.request_count + 1
      end
  returning request_count <= p_max_requests into v_allowed;

  return v_allowed;
end;
$$;

revoke all on function public.consume_request_rate_limit(uuid, text, integer, integer) from public;
revoke all on function public.consume_request_rate_limit(uuid, text, integer, integer) from anon;
revoke all on function public.consume_request_rate_limit(uuid, text, integer, integer) from authenticated;
grant execute on function public.consume_request_rate_limit(uuid, text, integer, integer) to service_role;

-- Enforce the same practical limits even when clients use the Supabase
-- Storage fallback instead of S3 presigned uploads.
update storage.buckets set file_size_limit = 52428800 where id = 'chat-attachments';
update storage.buckets set file_size_limit = 5242880 where id in ('avatars', 'workspace-icons');
