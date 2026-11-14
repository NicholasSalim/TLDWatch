-- Guests can upload too (ADR-0004). A Guest's Upload Summary belongs to their
-- anonymous cookie id, kept apart from Members' owner_id (which references
-- members). Exactly one owner per Upload; YouTube Summaries have none.
-- Guests' Upload Summaries are deleted 30 days after they're made (the daily
-- cron), since no account can delete them.
alter table public.summaries
  add column if not exists guest_owner_id uuid;

alter table public.summaries drop constraint if exists summaries_video_id_check;
alter table public.summaries
  add constraint summaries_video_id_check
  check (
    (owner_id is null and guest_owner_id is null and video_id ~ '^[A-Za-z0-9_-]{11}$')
    or (
      (owner_id is null) <> (guest_owner_id is null)
      and video_id ~ '^upload-[0-9a-f-]{36}$'
    )
  );

-- The daily sweep looks for old Guest Uploads.
create index if not exists summaries_guest_uploads_idx
  on public.summaries (created_at)
  where guest_owner_id is not null;
