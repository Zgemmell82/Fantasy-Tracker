-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- One row per account holds that account's leagues, lineups and connections.
create table if not exists public.tracker_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.tracker_state enable row level security;

-- Each signed-in user can read and change only their own row.
drop policy if exists "read own state" on public.tracker_state;
drop policy if exists "insert own state" on public.tracker_state;
drop policy if exists "update own state" on public.tracker_state;
drop policy if exists "delete own state" on public.tracker_state;

create policy "read own state" on public.tracker_state for select to authenticated using (auth.uid() = user_id);
create policy "insert own state" on public.tracker_state for insert to authenticated with check (auth.uid() = user_id);
create policy "update own state" on public.tracker_state for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own state" on public.tracker_state for delete to authenticated using (auth.uid() = user_id);

-- Yahoo Fantasy connections (used by the "yahoo" Edge Function).
-- Row-level security is on with no policies, so only the service role (the function) can read or write it.
create table if not exists public.yahoo_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.yahoo_tokens enable row level security;
