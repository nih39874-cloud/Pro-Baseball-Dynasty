-- Both leagues receive the SAME source-attributed 2024 appeared-player snapshot.
-- Official league stays paused, GM is permitted to operate as a pre-release simulation.
-- Salaries and FA service are unknown and remain unverified; no invented real-world amounts.
insert into public.league_players
 (league_id, master_player_id, team_id, roster_status, monthly_salary_ntd,
  fa_service_seasons, batting_rating, pitching_rating, fielding_rating,
  fa_years_verified, salary_verified)
select l.id,p.id,p.initial_team_id,'reserve',0,0,
 least(85,greatest(30,round(50+110*(
   (coalesce((s.batting_totals->>'H')::numeric,0)+20.8) /
   (coalesce((s.batting_totals->>'AB')::numeric,0)+80) -0.26
   )+40*coalesce((s.batting_totals->>'HR')::numeric,0)/
   (coalesce((s.batting_totals->>'PA')::numeric,0)+80),2))),
 least(85,greatest(30,round(50+100*(
  (coalesce((s.pitching_totals->>'SO')::numeric,0)-coalesce((s.pitching_totals->>'BB')::numeric,0)) /
  (coalesce((s.pitching_totals->>'BF')::numeric,0)+80)-0.12),2))),
 50,false,false
from public.players_master p
join public.player_source_appearances s on s.master_player_id=p.id
cross join public.leagues l
where p.source_type='rebas_2024_appearance' and p.initial_team_id is not null
on conflict(league_id,master_player_id) do nothing;

-- Store an explicit data-coverage description, distinct from clock / launch controls.
alter table public.leagues add column if not exists roster_source_status text not null default 'not_imported';
update public.leagues
 set roster_source_status='2024_rebas_game_appearances_only; missing_2024_nonparticipants_and_2025_2026_draftees'
 where kind in ('gm','official');

-- GM may simulate the observed-player snapshot immediately on its independent 7-day clock.
-- The official league remains suspended regardless of roster state.
do $$
declare qualified_teams integer;
begin
 select count(*) into qualified_teams from (
  select lp.team_id from public.league_players lp join public.leagues l on l.id=lp.league_id
  where l.kind='gm' and lp.roster_status in('active','reserve')
  group by lp.team_id having count(*)>=9
 ) q;
 if qualified_teams<>6 then raise exception 'GM_ROSTER_INCOMPLETE';end if;
 update public.leagues set is_ready=true,clock_enabled=true where kind='gm';
 update public.leagues set is_ready=false,clock_enabled=false where kind='official';
end $$;