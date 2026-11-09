import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
f=json.loads((root/'data/fa_2023_2024_reference.json').read_text())
recs=json.dumps(f['service_2024'],ensure_ascii=False).replace("'","''")
prior=json.dumps(f['qualified_2023'],ensure_ascii=False).replace("'","''")
sql=f"""-- 2023 / 2024 published FA service references and explicit 2024 opening estimates.
-- CRITICAL: CPBL 11.004 = 11 seasons + 4 registration days; NOT 11.004 decimal years.
-- 2024-10-30 year-end figures must NOT be presented as verified 2024 opening service.
-- Sources: {f['source_2024']} ; {f['source_2023']}
alter table public.league_players add column if not exists fa_service_initial_estimate numeric(6,3);
alter table public.league_players add column if not exists fa_initial_eligible_reported boolean not null default false;
alter table public.league_players add column if not exists fa_2024_service_reported numeric(6,3);
alter table public.league_players add column if not exists fa_qualification_threshold smallint not null default 9 check(fa_qualification_threshold in(8,9));
alter table public.league_players add column if not exists fa_4yr_college_verified boolean not null default false;
alter table public.league_players add column if not exists fa_qualify_note text;

with references as (
 select * from jsonb_to_recordset('{recs}'::jsonb)
 as x(name text, service_seasons numeric, qualification text, grade text,
       requalified_after_exercise boolean,eligible_by_2023 boolean)
)
insert into public.fa_history_reference(master_player_id,as_of_season,service_seasons,
qualification,fa_grade,evidence,published_url,certainty)
select m.id,2024,x.service_seasons,x.qualification,x.grade,
 'CPBL year-end service 2024-10-30; '+case when x.requalified_after_exercise then 'repeat FA' else 'initial FA' end,
 '{f['source_2024']}','reported'
from references x join public.players_master m on m.full_name=x.name
where m.source_year=2024
on conflict(master_player_id,as_of_season,evidence) do update
 set service_seasons=excluded.service_seasons,fa_grade=excluded.fa_grade,
     qualification=excluded.qualification,published_url=excluded.published_url,
     last_checked_at=now();

with prior as (select jsonb_array_elements_text('{prior}'::jsonb) name)
insert into public.fa_history_reference(master_player_id,as_of_season,service_seasons,
qualification,fa_grade,evidence,published_url,certainty)
select m.id,2023,null,'qualified_prior',null,'2023 year-end FA announced qualification',
 '{f['source_2023']}','reported'
from prior x join public.players_master m on m.full_name=x.name
where m.source_year=2024
on conflict(master_player_id,as_of_season,evidence) do nothing;

-- Only a 2024 **opening estimate** (subtract at most one whole season).
-- The true opening dates and academic eligibility need registration / college documentation.
with reported as (
 select distinct on (m.id) m.id, f.service_seasons,
 exists (select 1 from public.fa_history_reference r where r.master_player_id=m.id
  and r.as_of_season=2023 and r.qualification='qualified_prior') announced_prior
 from public.players_master m join public.fa_history_reference f on f.master_player_id=m.id
 where f.as_of_season=2024 and f.evidence like 'CPBL year-end service 2024-10-30%'
 order by m.id,f.service_seasons desc
)
update public.league_players lp set
 fa_2024_service_reported=r.service_seasons,
 fa_service_initial_estimate=greatest(0,r.service_seasons-1),
 fa_service_seasons=greatest(0,r.service_seasons-1),
 fa_initial_eligible_reported=r.announced_prior,
 fa_qualify_note='2024年末官方年資；2024開季值以最多扣除一合格球季估算，非官方登錄日數',
 fa_years_verified=false
from reported r join public.leagues l on true
where lp.master_player_id=r.id and lp.league_id=l.id
 and l.current_year=2024 and l.season_phase='pending';

-- Persons with 2023 qualification but not in 2024 year-end bulletin are known
-- to have reached FA qualification historically; show the minimum, not an exact year count.
update public.league_players lp set fa_initial_eligible_reported=true,
 fa_qualify_note=coalesce(lp.fa_qualify_note,'2023年末取得FA資格，2024開季確切年資尚缺登錄日數'),
 fa_service_initial_estimate=coalesce(lp.fa_service_initial_estimate,9),
 fa_service_seasons=case when lp.fa_2024_service_reported is null then 9 else lp.fa_service_seasons end
from public.players_master m join public.leagues l on l.current_year=2024 and l.season_phase='pending'
where m.id=lp.master_player_id and lp.league_id=l.id
and exists(select 1 from public.fa_history_reference f where f.master_player_id=m.id and f.as_of_season=2023 and f.qualification='qualified_prior');

-- Must not activate official league while data are being backfilled.
update public.leagues set clock_enabled=false,is_ready=false where kind='official';
"""
(root/'sql/015_fa_historical_reference.sql').write_text(sql)
print('done',len(sql),len(f['service_2024']),len(f['qualified_2023']))
