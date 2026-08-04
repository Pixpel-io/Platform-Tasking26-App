-- Per-mailbox notification preference and an IMAP UID cursor used to avoid
-- duplicate alerts across tabs, devices and retrying sync requests.
alter table public.user_mail_accounts
  add column if not exists notifications_enabled boolean not null default false,
  add column if not exists last_notified_uid bigint;

create index if not exists user_mail_accounts_notifications_idx
  on public.user_mail_accounts(user_id)
  where notifications_enabled = true;

-- Mail is global to the user, not owned by any workspace. Keep its delivery
-- stream physically separate from workspace notifications as well as in UI.
create table if not exists public.mail_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid not null references public.user_mail_accounts(id) on delete cascade,
  uid bigint not null,
  title text not null default '',
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(account_id, uid)
);

create index if not exists mail_notifications_user_created_idx
  on public.mail_notifications(user_id, created_at desc);
create index if not exists mail_notifications_user_unread_idx
  on public.mail_notifications(user_id) where read_at is null;

alter table public.mail_notifications enable row level security;
drop policy if exists "own mail notifications read" on public.mail_notifications;
create policy "own mail notifications read"
  on public.mail_notifications for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "own mail notifications update" on public.mail_notifications;
create policy "own mail notifications update"
  on public.mail_notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mail_notifications'
  ) then
    alter publication supabase_realtime add table public.mail_notifications;
  end if;
end $$;

notify pgrst, 'reload schema';
