-- A Member's History: one row per video they've opened, with the language
-- last opened and when. Deleting the Member deletes their History.
create table public.history (
  member_id uuid not null references public.members (id) on delete cascade,
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  language text not null check (language in ('english', 'original')),
  opened_at timestamptz not null,
  primary key (member_id, video_id)
);

create index history_newest_first on public.history (member_id, opened_at desc);

-- Only the server (service role) reads and writes History for now.
alter table public.history enable row level security;
