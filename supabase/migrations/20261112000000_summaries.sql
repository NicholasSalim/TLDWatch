-- A Summary is unique per (YouTube video ID, language) and shared by everyone.
create table public.summaries (
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  language text not null check (language in ('english')),
  spoken_language text not null,
  lengths jsonb not null,
  created_at timestamptz not null default now(),
  primary key (video_id, language)
);

-- Only the server (service role) reads and writes Summaries for now.
alter table public.summaries enable row level security;
