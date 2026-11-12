-- Daily usage counters: new Summaries per Guest, per IP hash and per Member,
-- and the app-wide video minutes read. One row per counter per UTC day.
create table public.usage_counters (
  counter text not null,
  day date not null,
  used integer not null default 0 check (used >= 0),
  primary key (counter, day)
);

alter table public.usage_counters enable row level security;

-- Adds p_amount if that keeps the counter within p_limit. Atomic across
-- concurrent callers: the update re-checks the limit on the locked row.
create function public.try_use_usage(p_counter text, p_day date, p_amount integer, p_limit integer)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  insert into public.usage_counters (counter, day) values (p_counter, p_day)
  on conflict do nothing;

  update public.usage_counters
  set used = used + p_amount
  where counter = p_counter and day = p_day and used + p_amount <= p_limit;

  return found;
end;
$$;

-- Gives back an amount used by a request that then failed.
create function public.give_back_usage(p_counter text, p_day date, p_amount integer)
returns void
language sql
set search_path = ''
as $$
  update public.usage_counters
  set used = greatest(0, used - p_amount)
  where counter = p_counter and day = p_day;
$$;

-- Only the server (service role) may call these.
revoke execute on function public.try_use_usage(text, date, integer, integer) from public, anon, authenticated;
revoke execute on function public.give_back_usage(text, date, integer) from public, anon, authenticated;
