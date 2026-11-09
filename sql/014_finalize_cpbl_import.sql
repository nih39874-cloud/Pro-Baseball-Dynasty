-- Finalize primary+farm appearances from private.cpbl_2024_import_stage.
-- Preserve the independently sourced Rebas identity when a unique player name matches.
-- Never assign a farm-only player to an invented first-team appearance.

-- Match existing 2024 identities by unique exact name (rebas 2024 players only).
with unique_rebas_names as (
 select full_name,min(id) as player_id from public.players_master
 where source_type='rebas_2024_appearance'
 group by full_name having count(*)=1
)
update public.players_master m
set official_cpbl_id=s.official_id,
    birth_date=coalesce(m.birth_date,s.birth_date),
    bats=coalesce(m.bats,s.bats),throws=coalesce(m.throws,s.throws),
    country=coalesce(m.country,s.country),
    source_quality_notes='Matched by unique 2024 exact-name crosswalk (Rebas + CPBL Opendata)'
from private.cpbl_2024_import_stage s join unique_rebas_names u on u.full_name=s.full_name
where m.id=u.player_id and m.official_cpbl_id is null
and not exists (select 1 from public.players_master other where other.official_cpbl_id=s.official_id);

-- A rare Chinese-name collision or alias should never silently overwrite another identity.
insert into public.players_master
(cpbl_id,official_cpbl_id,full_name,initial_team_id,birth_date,bats,throws,country,
 source_year,source_type,source_license,data_confidence,source_quality_notes)
select 'cpbl2024:'||s.official_id,s.official_id,s.full_name,s.team_id,s.birth_date,
 s.bats,s.throws,s.country,2024,'cpbl_2024_farm_and_first',
 'ldkrsi/cpbl-opendata (MIT), CPBL 2024 season totals','observed_2024_first_or_farm',
 'Official season statistical appearance; registration history may be broader'
from private.cpbl_2024_import_stage s
where not exists(select 1 from public.players_master m where m.official_cpbl_id=s.official_id)
on conflict(cpbl_id) do nothing;

-- Correct original 2024 players already present but missing birth/hand metadata.
update public.players_master m
set birth_date=coalesce(m.birth_date,s.birth_date),
    bats=coalesce(m.bats,s.bats), throws=coalesce(m.throws,s.throws),
    country=coalesce(m.country,s.country)
from private.cpbl_2024_import_stage s
where m.official_cpbl_id=s.official_id;

-- Preserve first / farm and team-specific stats independently.
insert into public.cpbl_season_reference(master_player_id,season_year,league_level,team_id,batting,pitching)
select m.id,2024,split->>'level',split->>'team',
 coalesce(split->'batting','{}'::jsonb),coalesce(split->'pitching','{}'::jsonb)
from private.cpbl_2024_import_stage s
join public.players_master m on m.official_cpbl_id=s.official_id
cross join lateral jsonb_array_elements(s.splits) split
on conflict(master_player_id,season_year,league_level,team_id)
do update set batting=excluded.batting,pitching=excluded.pitching,updated_at=now();

-- Both isolated worlds start with the same source roster; all later team actions diverge.
insert into public.league_players(league_id,master_player_id,team_id,roster_status,
 monthly_salary_ntd,fa_service_seasons,batting_rating,pitching_rating,fielding_rating,salary_verified,fa_years_verified)
select l.id,m.id,m.initial_team_id,'reserve',0,0,50,50,50,false,false
from public.players_master m cross join public.leagues l
where m.official_cpbl_id is not null and m.source_year=2024
on conflict(league_id,master_player_id) do nothing;

-- Derived playing strength: normalized 2024 game totals with shrinkage toward 50.
-- These are game-balance ratings, not official CPBL scouting grades.
with totals as (
 select master_player_id, league_level,
 sum(coalesce((batting->>'AB')::numeric,0)) ab,
 sum(coalesce((batting->>'PA')::numeric,0)) pa,
 sum(coalesce((batting->>'H')::numeric,0)) h,
 sum(coalesce((batting->>'BB')::numeric,0)) bb,
 sum(coalesce((batting->>'HBP')::numeric,0)) hbp,
 sum(coalesce((batting->>'SF')::numeric,0)) sf,
 sum(coalesce((batting->>'TB')::numeric,0)) tb,
 sum(coalesce((pitching->>'IPOuts')::numeric,0)) outs,
 sum(coalesce((pitching->>'ER')::numeric,0)) er,
 sum(coalesce((pitching->>'SO')::numeric,0)) k,
 sum(coalesce((pitching->>'BB')::numeric,0)) pbb
 from public.cpbl_season_reference where season_year=2024
 group by master_player_id,league_level
), weighted as (
 select master_player_id,
 sum(pa*case when league_level='first' then 1 else .52 end) pa_weight,
 sum(outs*case when league_level='first' then 1 else .52 end) outs_weight,
 sum(case when pa>0 then (greatest(0,(h+bb+hbp)/nullif(ab+bb+hbp+sf,0)) + tb/greatest(ab,1)) *
   pa * case when league_level='first' then 1 else .52 end else 0 end)
 /nullif(sum(pa*case when league_level='first' then 1 else .52 end),0) as adjusted_ops,
 sum(case when outs>0 then (27*er/outs) * outs*case when league_level='first' then 1 else .52 end else 0 end)
 /nullif(sum(outs*case when league_level='first' then 1 else .52 end),0) era,
 sum(case when outs>0 then (27*k/outs) * outs*case when league_level='first' then 1 else .52 end else 0 end)
 /nullif(sum(outs*case when league_level='first' then 1 else .52 end),0) k9,
 sum(case when outs>0 then (27*pbb/outs) * outs*case when league_level='first' then 1 else .52 end else 0 end)
 /nullif(sum(outs*case when league_level='first' then 1 else .52 end),0) bb9
 from totals group by master_player_id
)
update public.league_players lp
set batting_rating=greatest(30,least(90,round((50+coalesce((w.adjusted_ops-0.68)*50*w.pa_weight/(w.pa_weight+180),0))::numeric,2))),
 pitching_rating=greatest(30,least(90,round((50+coalesce(((4.1-w.era)*3.5+(w.k9-7)*1.2-(w.bb9-3)*.9)*w.outs_weight/(w.outs_weight+180),0))::numeric,2))),
 updated_at=now()
from weighted w, public.leagues l
where lp.master_player_id=w.master_player_id and l.id=lp.league_id
and l.current_year=2024 and l.season_phase='pending';

-- Arm/position from clear pitching-only records; do not guess the position of a batter.
update public.players_master m
set primary_position='P'
from (
 select master_player_id,
 sum(coalesce((pitching->>'IPOuts')::numeric,0)) innings_outs,
 sum(coalesce((batting->>'PA')::numeric,0)) pa
 from public.cpbl_season_reference where season_year=2024 group by master_player_id
) x where x.master_player_id=m.id and m.primary_position is null
 and x.innings_outs>=3 and x.pa<=5;

-- Keep only GM enabled. Never release official league automatically as a side effect of ETL.
update public.leagues set clock_enabled=false,is_ready=false where kind='official';