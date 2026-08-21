create table if not exists public.pipinho_calendar_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'google' check (provider = 'google'),
  provider_account_email text,
  calendar_id text,
  calendar_name text,
  timezone text not null default 'UTC',
  scope text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz,
  sync_status text not null default 'connected' check (sync_status in ('connected','syncing','ok','error')),
  sync_error text
);
create table if not exists public.pipinho_calendar_credentials (
  user_id uuid primary key references public.pipinho_calendar_connections(user_id) on delete cascade,
  encrypted_refresh_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.pipinho_calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google' check (provider = 'google'),
  calendar_id text not null,
  provider_event_id text not null,
  title text not null,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  local_start_date date not null,
  local_end_date date not null,
  all_day boolean not null default false,
  attendance_status text not null default 'unknown' check (attendance_status in ('accepted','tentative','needsAction','declined','unknown')),
  event_status text not null default 'confirmed',
  recurring_event_id text,
  provider_updated_at timestamptz,
  sync_batch_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, calendar_id, provider_event_id)
);
create index if not exists pipinho_calendar_events_user_date_idx on public.pipinho_calendar_events(user_id, local_start_date, starts_at);
alter table public.pipinho_calendar_connections enable row level security;
alter table public.pipinho_calendar_credentials enable row level security;
alter table public.pipinho_calendar_events enable row level security;
drop policy if exists "pipinho calendar connections select own" on public.pipinho_calendar_connections;
create policy "pipinho calendar connections select own" on public.pipinho_calendar_connections for select to authenticated using (auth.uid() = user_id);
drop policy if exists "pipinho calendar events select own" on public.pipinho_calendar_events;
create policy "pipinho calendar events select own" on public.pipinho_calendar_events for select to authenticated using (auth.uid() = user_id);
revoke all on table public.pipinho_calendar_credentials from anon, authenticated;
revoke all on table public.pipinho_calendar_connections from anon;
revoke all on table public.pipinho_calendar_events from anon;
revoke insert, update, delete on table public.pipinho_calendar_connections from authenticated;
revoke insert, update, delete on table public.pipinho_calendar_events from authenticated;
grant select on table public.pipinho_calendar_connections to authenticated;
grant select on table public.pipinho_calendar_events to authenticated;
grant all on table public.pipinho_calendar_connections to service_role;
grant all on table public.pipinho_calendar_credentials to service_role;
grant all on table public.pipinho_calendar_events to service_role;
