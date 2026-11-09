-- CPBL 2024 first/farm split data and source-verified player identities.
-- MIT-licensed CPBL OpenData mirror: https://github.com/ldkrsi/cpbl-opendata
-- Rebas ODC-By records remain independent and are never overwritten.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.cpbl_2024_import_stage (
 official_id text primary key,
 full_name text not null,
 team_id text not null references public.teams(id),
 birth_date date,
 bats text,
 throws text,
 country text,
 splits jsonb not null,
 updated_at timestamptz not null default now(),
 constraint official_id_numeric check (official_id ~ '^[0-9]{6,12}$')
);
revoke all on private.cpbl_2024_import_stage from public,anon,authenticated;

alter table public.players_master add column if not exists official_cpbl_id text unique;
alter table public.players_master add column if not exists country text;
alter table public.players_master add column if not exists source_quality_notes text;

create table if not exists public.cpbl_season_reference (
 master_player_id bigint not null references public.players_master(id) on delete cascade,
 season_year integer not null check(season_year between 1990 and 2100),
 league_level text not null check(league_level in ('first','farm')),
 team_id text not null references public.teams(id),
 batting jsonb not null default '{}'::jsonb,
 pitching jsonb not null default '{}'::jsonb,
 source text not null default 'ldkrsi/cpbl-opendata (MIT); CPBL season totals',
 source_url text not null default 'https://github.com/ldkrsi/cpbl-opendata',
 updated_at timestamptz not null default now(),
 primary key(master_player_id,season_year,league_level,team_id)
);
create index if not exists cpbl_season_reference_year_level_team on public.cpbl_season_reference(season_year,league_level,team_id);
alter table public.cpbl_season_reference enable row level security;
drop policy if exists cpbl_season_reference_select on public.cpbl_season_reference;
create policy cpbl_season_reference_select on public.cpbl_season_reference
 for select to authenticated using (true);
revoke insert,update,delete on public.cpbl_season_reference from anon,authenticated;

create table if not exists public.fa_history_reference (
 master_player_id bigint not null references public.players_master(id) on delete cascade,
 as_of_season integer not null,
 service_seasons numeric(6,3),
 qualification text not null check (qualification in ('nine_or_repeat','eight_conditional','near_15_days','qualified_prior','minimum_from_games')),
 fa_grade text check (fa_grade in ('A','B')),
 evidence text not null,
 published_url text not null,
 certainty text not null check (certainty in ('reported','inferred_lower_bound','approximation')),
 last_checked_at timestamptz not null default now(),
 primary key(master_player_id,as_of_season,evidence)
);
create index if not exists fa_history_by_season on public.fa_history_reference(as_of_season,qualification);
alter table public.fa_history_reference enable row level security;
drop policy if exists fa_history_reference_read on public.fa_history_reference;
create policy fa_history_reference_read on public.fa_history_reference
 for select to authenticated using (true);
revoke insert,update,delete on public.fa_history_reference from anon,authenticated;

-- Personnel presentation is a game-art profile, not a verified photo/face.
create table if not exists public.player_visual_profiles (
 master_player_id bigint primary key references public.players_master(id) on delete cascade,
 profile jsonb not null,
 model_status text not null default 'procedural_unverified' check(model_status in ('procedural_unverified','artist_review','licensed_likeness')),
 likeness_license text,
 reference_asset_url text,
 updated_at timestamptz not null default now()
);
alter table public.player_visual_profiles enable row level security;
drop policy if exists player_visual_profiles_read on public.player_visual_profiles;
create policy player_visual_profiles_read on public.player_visual_profiles for select to authenticated using (true);
revoke insert,update,delete on public.player_visual_profiles from anon,authenticated;