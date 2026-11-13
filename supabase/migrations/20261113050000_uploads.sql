-- Uploads: a Member's own video files, summarized privately.
-- An Upload Summary lives with the others, under an "upload-<uuid>" id, with
-- an owner; deleting the Member deletes it (and their History) with them.
alter table public.summaries
  add column if not exists owner_id uuid references public.members (id) on delete cascade;

alter table public.summaries drop constraint if exists summaries_video_id_check;
alter table public.summaries
  add constraint summaries_video_id_check
  check (
    (owner_id is null and video_id ~ '^[A-Za-z0-9_-]{11}$')
    or (owner_id is not null and video_id ~ '^upload-[0-9a-f-]{36}$')
  );

alter table public.history drop constraint if exists history_video_id_check;
alter table public.history
  add constraint history_video_id_check
  check (video_id ~ '^[A-Za-z0-9_-]{11}$' or video_id ~ '^upload-[0-9a-f-]{36}$');

-- Files wait here, privately, only while they're summarized: one folder per
-- Member. 50 MB is Supabase's largest file on the free plan.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', false, 52428800, array['video/*'])
on conflict (id) do nothing;
