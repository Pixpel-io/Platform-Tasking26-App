-- Allow each user to connect multiple distinct mailboxes. Existing accounts
-- remain untouched; API operations scope every account by both id and user_id.
alter table public.user_mail_accounts
  drop constraint if exists user_mail_accounts_user_id_key;

alter table public.user_mail_accounts
  drop constraint if exists user_mail_accounts_user_id_email_key;

alter table public.user_mail_accounts
  add constraint user_mail_accounts_user_id_email_key unique (user_id, email);

create index if not exists user_mail_accounts_user_updated_idx
  on public.user_mail_accounts(user_id, updated_at desc);
