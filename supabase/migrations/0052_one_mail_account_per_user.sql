-- The current UI supports one active mailbox per user. The original compound
-- uniqueness allowed a second row when a user changed their email address,
-- after which reads could select an arbitrary account.
delete from public.user_mail_accounts older
using public.user_mail_accounts newer
where older.user_id = newer.user_id
  and (
    older.updated_at < newer.updated_at
    or (older.updated_at = newer.updated_at and older.id < newer.id)
  );

alter table public.user_mail_accounts
  drop constraint if exists user_mail_accounts_user_id_email_key;

alter table public.user_mail_accounts
  add constraint user_mail_accounts_user_id_key unique (user_id);
