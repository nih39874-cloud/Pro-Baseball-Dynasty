-- Source-attributed 2024 appearances (NOT a full CPBL registration roster).
create table if not exists public.player_source_appearances (
  master_player_id bigint primary key references public.players_master(id) on delete cascade,
  source_player_id text not null unique,
  source_year integer not null default 2024,
  source_team_history jsonb not null default '[]'::jsonb,
  batting_totals jsonb not null default '{}'::jsonb,
  pitching_totals jsonb not null default '{}'::jsonb,
  coverage text not null default '2024 game appearances only',
  attribution text not null default 'Rebas Open Data 2024, ODC-By',
  updated_at timestamptz not null default now()
);
alter table public.player_source_appearances enable row level security;
create policy player_source_appearances_read on public.player_source_appearances
  for select to authenticated using (true);
alter table public.league_players add column if not exists fa_years_verified boolean not null default false;
alter table public.league_players add column if not exists salary_verified boolean not null default false;
create index if not exists players_master_source_initial_team on public.players_master(initial_team_id);
create index if not exists league_players_by_team on public.league_players(league_id,team_id,roster_status);
revoke insert,update,delete on public.player_source_appearances from anon,authenticated;