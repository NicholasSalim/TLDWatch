-- Members can read a Summary in other languages too, stored as a base
-- language code ("id", "es") next to 'english' and 'original'.
alter table public.summaries drop constraint if exists summaries_language_check;
alter table public.summaries
  add constraint summaries_language_check
  check (language in ('english', 'original') or (language ~ '^[a-z]{2,3}$' and language <> 'en'));

alter table public.history drop constraint if exists history_language_check;
alter table public.history
  add constraint history_language_check
  check (language in ('english', 'original') or (language ~ '^[a-z]{2,3}$' and language <> 'en'));
