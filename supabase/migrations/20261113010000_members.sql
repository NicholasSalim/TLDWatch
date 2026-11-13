-- A Member's TLDWatch profile, one per Supabase Auth user. It only exists
-- once they've confirmed they're 18 or older at sign-up.
create table public.members (
  id uuid primary key references auth.users (id) on delete cascade,
  adult_confirmed_at timestamptz not null,
  autoplay boolean not null default false,
  created_at timestamptz not null default now()
);

-- Only the server (service role) reads and writes profiles for now.
alter table public.members enable row level security;
