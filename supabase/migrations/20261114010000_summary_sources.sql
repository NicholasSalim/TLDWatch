-- What each Summary was made from: a video (every YouTube Summary, and video
-- Uploads), or an Upload of audio, a PDF, an image, or text. It decides the
-- Summary's shape: only video and audio have Timestamps.
alter table public.summaries
  add column if not exists source text not null default 'video';

alter table public.summaries drop constraint if exists summaries_source_check;
alter table public.summaries
  add constraint summaries_source_check
  check (
    source in ('video', 'audio', 'pdf', 'image', 'text')
    -- Only Uploads can be anything but a video.
    and (source = 'video' or video_id ~ '^upload-[0-9a-f-]{36}$')
  );
