-- Per-user custom IMAP/SMTP connections. Credentials are encrypted by the
-- application before insertion. No client-facing policies are intentional:
-- only the service-role server may read or write this table.
create table if not exists public.user_mail_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  display_name text,
  imap_host text not null,
  imap_port integer not null check (imap_port between 1 and 65535),
  imap_secure boolean not null default true,
  smtp_host text not null,
  smtp_port integer not null check (smtp_port between 1 and 65535),
  smtp_secure boolean not null default true,
  username text not null,
  encrypted_password text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, email)
);

create index if not exists user_mail_accounts_user_id_idx
  on public.user_mail_accounts(user_id);

alter table public.user_mail_accounts enable row level security;

drop trigger if exists user_mail_accounts_set_updated_at
  on public.user_mail_accounts;
create trigger user_mail_accounts_set_updated_at
  before update on public.user_mail_accounts
  for each row execute function public.set_updated_at();

