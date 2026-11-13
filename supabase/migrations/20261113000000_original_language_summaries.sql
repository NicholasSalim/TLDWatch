-- A Summary can now be in English or in the video's original (spoken)
-- language, translated from the English one. Still unique per (video, language).
alter table public.summaries drop constraint if exists summaries_language_check;
alter table public.summaries
  add constraint summaries_language_check check (language in ('english', 'original'));
