-- 2023 / 2024 published FA service references and explicit 2024 opening estimates.
-- CRITICAL: CPBL 11.004 = 11 seasons + 4 registration days; NOT 11.004 decimal years.
-- 2024-10-30 year-end figures must NOT be presented as verified 2024 opening service.
-- Sources: https://gobaseball.gogoal.com.tw/archives/13525 ; https://tsna.com/article/80231
alter table public.league_players add column if not exists fa_service_initial_estimate numeric(6,3);
alter table public.league_players add column if not exists fa_initial_eligible_reported boolean not null default false;
alter table public.league_players add column if not exists fa_2024_service_reported numeric(6,3);
alter table public.league_players add column if not exists fa_qualification_threshold smallint not null default 9 check(fa_qualification_threshold in(8,9));
alter table public.league_players add column if not exists fa_4yr_college_verified boolean not null default false;
alter table public.league_players add column if not exists fa_qualify_note text;

with fa_input as (
 select * from jsonb_to_recordset('[{"name": "陳子豪", "service_seasons": 11.004, "qualification": "nine_or_repeat", "grade": "A", "requalified_after_exercise": false, "eligible_by_2023": true}, {"name": "黃鈞聲", "service_seasons": 10.03, "qualification": "nine_or_repeat", "grade": "B", "requalified_after_exercise": false, "eligible_by_2023": true}, {"name": "高國慶", "service_seasons": 19.002, "qualification": "nine_or_repeat", "grade": "B", "requalified_after_exercise": false, "eligible_by_2023": true}, {"name": "潘威倫", "service_seasons": 16.038, "qualification": "nine_or_repeat", "grade": "B", "requalified_after_exercise": false, "eligible_by_2023": true}, {"name": "王鏡銘", "service_seasons": 13.043, "qualification": "nine_or_repeat", "grade": "A", "requalified_after_exercise": false, "eligible_by_2023": true}, {"name": "江承峰", "service_seasons": 10.091, "qualification": "nine_or_repeat", "grade": "B", "requalified_after_exercise": false, "eligible_by_2023": true}, {"name": "胡金龍", "service_seasons": 10.067, "qualification": "nine_or_repeat", "grade": "A", "requalified_after_exercise": false, "eligible_by_2023": true}, {"name": "唐肇廷", "service_seasons": 9.109, "qualification": "nine_or_repeat", "grade": "B", "requalified_after_exercise": false, "eligible_by_2023": true}, {"name": "陳韻文", "service_seasons": 9.033, "qualification": "nine_or_repeat", "grade": "A", "requalified_after_exercise": false, "eligible_by_2023": false}, {"name": "陳鏞基", "service_seasons": 4.0, "qualification": "nine_or_repeat", "grade": "A", "requalified_after_exercise": true, "eligible_by_2023": false}, {"name": "林泓育", "service_seasons": 14.105, "qualification": "nine_or_repeat", "grade": "A", "requalified_after_exercise": false, "eligible_by_2023": true}, {"name": "林智平", "service_seasons": 13.124, "qualification": "nine_or_repeat", "grade": "B", "requalified_after_exercise": false, "eligible_by_2023": true}, {"name": "余德龍", "service_seasons": 12.083, "qualification": "nine_or_repeat", "grade": "B", "requalified_after_exercise": false, "eligible_by_2023": true}, {"name": "黃偉晟", "service_seasons": 10.03, "qualification": "nine_or_repeat", "grade": "B", "requalified_after_exercise": false, "eligible_by_2023": true}, {"name": "梁家榮", "service_seasons": 9.108, "qualification": "nine_or_repeat", "grade": "A", "requalified_after_exercise": false, "eligible_by_2023": false}, {"name": "林承飛", "service_seasons": 9.011, "qualification": "nine_or_repeat", "grade": "A", "requalified_after_exercise": false, "eligible_by_2023": false}, {"name": "朱育賢", "service_seasons": 9.0, "qualification": "nine_or_repeat", "grade": "A", "requalified_after_exercise": false, "eligible_by_2023": true}, {"name": "郭嚴文", "service_seasons": 13.075, "qualification": "nine_or_repeat", "grade": "A", "requalified_after_exercise": false, "eligible_by_2023": true}, {"name": "林智勝", "service_seasons": 8.0, "qualification": "nine_or_repeat", "grade": "A", "requalified_after_exercise": true, "eligible_by_2023": true}, {"name": "王勝偉", "service_seasons": 6.034, "qualification": "nine_or_repeat", "grade": "A", "requalified_after_exercise": true, "eligible_by_2023": true}, {"name": "郭永維", "service_seasons": 11.089, "qualification": "nine_or_repeat", "grade": "A", "requalified_after_exercise": false, "eligible_by_2023": true}, {"name": "王溢正", "service_seasons": 9.107, "qualification": "nine_or_repeat", "grade": "A", "requalified_after_exercise": false, "eligible_by_2023": true}, {"name": "賴鴻誠", "service_seasons": 4.0, "qualification": "nine_or_repeat", "grade": "A", "requalified_after_exercise": true, "eligible_by_2023": false}, {"name": "謝榮豪", "service_seasons": 8.092, "qualification": "eight_conditional", "grade": "B", "requalified_after_exercise": false, "eligible_by_2023": false}, {"name": "許基宏", "service_seasons": 8.051, "qualification": "eight_conditional", "grade": "A", "requalified_after_exercise": false, "eligible_by_2023": false}, {"name": "詹子賢", "service_seasons": 8.039, "qualification": "eight_conditional", "grade": "A", "requalified_after_exercise": false, "eligible_by_2023": false}, {"name": "林岱安", "service_seasons": 8.1, "qualification": "eight_conditional", "grade": "A", "requalified_after_exercise": false, "eligible_by_2023": false}, {"name": "林哲瑄", "service_seasons": 8.113, "qualification": "eight_conditional", "grade": "A", "requalified_after_exercise": false, "eligible_by_2023": false}, {"name": "高國麟", "service_seasons": 8.109, "qualification": "eight_conditional", "grade": "A", "requalified_after_exercise": false, "eligible_by_2023": false}, {"name": "李宗賢", "service_seasons": 8.037, "qualification": "eight_conditional", "grade": "A", "requalified_after_exercise": false, "eligible_by_2023": false}, {"name": "藍寅倫", "service_seasons": 8.078, "qualification": "eight_conditional", "grade": "A", "requalified_after_exercise": false, "eligible_by_2023": false}, {"name": "王躍霖", "service_seasons": 8.069, "qualification": "eight_conditional", "grade": "A", "requalified_after_exercise": false, "eligible_by_2023": false}, {"name": "陳家駒", "service_seasons": 7.12, "qualification": "near_15_days", "grade": null, "requalified_after_exercise": false, "eligible_by_2023": false}, {"name": "邱浩鈞", "service_seasons": 7.124, "qualification": "near_15_days", "grade": null, "requalified_after_exercise": false, "eligible_by_2023": false}]'::jsonb)
 as x(name text, service_seasons numeric, qualification text, grade text,
       requalified_after_exercise boolean,eligible_by_2023 boolean)
)
insert into public.fa_history_reference(master_player_id,as_of_season,service_seasons,
qualification,fa_grade,evidence,published_url,certainty)
select m.id,2024,x.service_seasons,x.qualification,x.grade,
 'CPBL year-end service 2024-10-30; '||case when x.requalified_after_exercise then 'repeat FA' else 'initial FA' end,
 'https://gobaseball.gogoal.com.tw/archives/13525','reported'
from fa_input x join public.players_master m on m.full_name=x.name
where m.source_year=2024
on conflict(master_player_id,as_of_season,evidence) do update
 set service_seasons=excluded.service_seasons,fa_grade=excluded.fa_grade,
     qualification=excluded.qualification,published_url=excluded.published_url,
     last_checked_at=now();

with prior as (select jsonb_array_elements_text('["林泓育", "林智平", "郭嚴文", "余德龍", "郭永維", "陳俊秀", "黃偉晟", "朱育賢", "高國慶", "潘威倫", "王鏡銘", "江承峰", "唐肇廷", "胡金龍", "陳子豪", "鄭凱文", "黃鈞聲", "王勝偉", "高國輝", "葉竹軒", "劉時豪", "林智勝", "王溢正"]'::jsonb) name)
insert into public.fa_history_reference(master_player_id,as_of_season,service_seasons,
qualification,fa_grade,evidence,published_url,certainty)
select m.id,2023,null,'qualified_prior',null,'2023 year-end FA announced qualification',
 'https://tsna.com/article/80231','reported'
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