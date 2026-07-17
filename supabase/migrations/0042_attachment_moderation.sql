-- =============================================================================
-- Attachment content moderation — flag sensitive images so the UI can blur them
-- Tasking — Team Collaboration SaaS
--
-- Every image upload is scanned by AWS Rekognition (in an `after()` hook on
-- sendMessage) and this row is updated with the result. The client renders a
-- Facebook-style "sensitive content" scrim over anything flagged, with a
-- "See anyway" button to reveal. Realtime pushes the update, so a message that
-- inserts before the scan finishes gets blurred as soon as the scan lands.
-- =============================================================================

alter table public.message_attachments
  add column if not exists sensitive boolean not null default false,
  -- pending  : scan not yet run (freshly inserted)
  -- skipped  : not an image, or S3 is disabled - never scanned
  -- clean    : scanned, safe
  -- flagged  : scanned, sensitive (sensitive = true)
  -- failed   : scanner errored - treat as clean but retryable
  add column if not exists moderation_status text not null default 'pending',
  -- The specific Rekognition labels that tripped the flag (e.g. "Explicit
  -- Nudity", "Violence"), kept for future admin review / appeal.
  add column if not exists moderation_labels text[];

-- Fast scanner lookup: "give me every attachment still pending, oldest first"
-- - used if we ever need to backfill or replay after a Rekognition outage.
create index if not exists message_attachments_moderation_pending_idx
  on public.message_attachments (created_at)
  where moderation_status = 'pending';

-- Server-only setter for the moderation columns. message_attachments has no
-- UPDATE policy (the sender can't just untag their own content), so the scan
-- reports its verdict through this SECURITY DEFINER RPC. It only writes the
-- moderation triplet, and only for an attachment the caller actually owns via
-- the parent message.
create or replace function public.set_attachment_moderation(
  p_attachment_id uuid,
  p_sensitive boolean,
  p_status text,
  p_labels text[]
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
  update public.message_attachments a
  set sensitive = p_sensitive,
      moderation_status = p_status,
      moderation_labels = p_labels
  from public.messages m
  where a.id = p_attachment_id
    and m.id = a.message_id
    and m.user_id = v_uid;
end;
$$;

notify pgrst, 'reload schema';
