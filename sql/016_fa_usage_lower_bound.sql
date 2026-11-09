-- 2010–2023 evidence-based minimum FA seasons from first-team usage.
-- Does not account for 125 registration days, historic pre-2010 seasons, or post-exercise resets.
create table if not exists public.fa_usage_evidence (
  master_player_id bigint not null references public.players_master(id) on delete cascade,
  as_of_year integer not null default 2024,
  first_season_examined integer not null default 2010,
  last_season_examined integer not null default 2023,
  guaranteed_by_game_usage integer not null default 0 check(guaranteed_by_game_usage>=0),
  seasons_with_appearances integer not null default 0,
  season_details jsonb not null default '[]'::jsonb,
  source_url text not null default 'https://github.com/ldkrsi/cpbl-opendata',
  certainty text not null default 'documented_minimum_from_games',
  updated_at timestamptz not null default now(),
  primary key(master_player_id,as_of_year)
);
alter table public.fa_usage_evidence enable row level security;
drop policy if exists fa_usage_evidence_read on public.fa_usage_evidence;
create policy fa_usage_evidence_read on public.fa_usage_evidence for select to authenticated using(true);
revoke insert,update,delete on public.fa_usage_evidence from anon,authenticated;
alter table public.league_players add column if not exists fa_usage_min_seasons integer check(fa_usage_min_seasons>=0);