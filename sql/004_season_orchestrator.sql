-- Persistent timed league orchestration (7 real days per in-game season).
-- IMPORTANT: official.is_ready remains false until licensed rosters and accounts exist.

alter table public.league_players drop constraint if exists league_players_roster_status_check;
alter table public.league_players add constraint league_players_roster_status_check
 check (roster_status in('active','reserve','negotiable','free_agent','retired'));
alter table public.team_finances add column if not exists debt_ntd bigint not null default 0 check(debt_ntd>=0);

create or replace function private.start_series(p_league uuid,p_timeline uuid,p_year integer,
 p_stage text,p_a text,p_b text,p_best int,p_at timestamptz) returns uuid
language plpgsql set search_path='' as $$
declare sid uuid;
begin
 insert into public.playoff_series(league_id,timeline_id,season_year,stage,team_a,team_b,best_of,next_at)
 values(p_league,p_timeline,p_year,p_stage,p_a,p_b,p_best,p_at)
 on conflict(league_id,timeline_id,season_year,stage) do nothing returning id into sid;
 if sid is null then return null;end if;
 insert into public.games(league_id,timeline_id,season_year,home_team_id,away_team_id,scheduled_at,phase,season_stage,series_id)
 values(p_league,p_timeline,p_year,p_a,p_b,p_at,'scheduled','playoff',sid);
 update public.playoff_series set next_game_number=2,next_at=p_at+interval '32 minutes' where id=sid;
 return sid;
end;$$;

create or replace function private.start_playoffs(p_league uuid) returns text
language plpgsql set search_path='' as $$
declare l public.leagues%rowtype;rankings text[];t text;
begin
 select * into l from public.leagues where id=p_league for update;
 if l.season_phase='playoff' then return 'ALREADY';end if;
 if exists(select 1 from public.games where league_id=l.id and timeline_id=l.active_timeline_id and season_year=l.current_year and season_stage='regular' and phase<>'final') then return 'REGULAR_PENDING';end if;
 select array_agg(team_id order by wins desc,run_diff desc,team_id) into rankings from (
  select t.id team_id,
   count(*) filter (where (g.home_team_id=t.id and g.home_score>g.away_score) or (g.away_team_id=t.id and g.away_score>g.home_score)) wins,
   coalesce(sum(case when g.home_team_id=t.id then g.home_score-g.away_score when g.away_team_id=t.id then g.away_score-g.home_score else 0 end),0) run_diff
  from public.teams t left join public.games g on g.league_id=l.id and g.timeline_id=l.active_timeline_id and g.season_year=l.current_year and g.season_stage='regular' and g.phase='final' and (t.id=g.home_team_id or t.id=g.away_team_id)
  group by t.id) q;
 if array_length(rankings,1)<>6 then raise exception 'STANDINGS_INCOMPLETE';end if;
 -- Fictional interim playoff bracket: #3 vs #4 BO3; winner vs #2 BO3; final winner vs #1 BO7.
 -- Keep this configurable pending exact-year CPBL regulations.
 for t in select id from public.teams where id<>all(rankings[1:4]) loop
   perform private.auto_roster(l.id,l.active_timeline_id,l.current_year,t,'protected60');
 end loop;
 for t in select unnest(rankings[1:4]) loop
   perform private.auto_roster(l.id,l.active_timeline_id,l.current_year,t,'playoff32');
 end loop;
 perform private.start_series(l.id,l.active_timeline_id,l.current_year,'wildcard',rankings[3],rankings[4],3,l.season_anchor_at+interval '4 days');
 update public.leagues set season_phase='playoff' where id=l.id;
 return 'PLAYOFF_STARTED';
end;$$;

create or replace function private.progress_playoffs(p_league uuid,p_now timestamptz)
returns text language plpgsql set search_path='' as $$
declare l public.leagues%rowtype;s public.playoff_series%rowtype;
 a int;b int;target int;winner text;seed2 text;seed1 text;seed_rankings text[];next_game text;
begin
 select * into l from public.leagues where id=p_league for update;
 select * into s from public.playoff_series where league_id=p_league and timeline_id=l.active_timeline_id and season_year=l.current_year and status='active' order by case stage when 'wildcard' then 1 when 'challenge' then 2 else 3 end limit 1 for update;
 if not found then return 'NO_ACTIVE_SERIES';end if;
 select count(*) filter (where (g.home_team_id=s.team_a and g.home_score>g.away_score) or (g.away_team_id=s.team_a and g.away_score>g.home_score)),
        count(*) filter (where (g.home_team_id=s.team_b and g.home_score>g.away_score) or (g.away_team_id=s.team_b and g.away_score>g.home_score))
 into a,b from public.games g where g.series_id=s.id and g.phase='final';
 update public.playoff_series set wins_a=a,wins_b=b where id=s.id;
 target:=(s.best_of+1)/2;
 if a>=target or b>=target then
  winner:=case when a>=target then s.team_a else s.team_b end;
  update public.playoff_series set status='finished' where id=s.id;
  -- Recover #1 / #2 from regular standings; no fabricated player stats.
  select array_agg(team_id order by wins desc,run_diff desc,team_id) into seed_rankings from (
   select t.id team_id,
    count(*) filter (where (g.home_team_id=t.id and g.home_score>g.away_score) or (g.away_team_id=t.id and g.away_score>g.home_score)) wins,
    coalesce(sum(case when g.home_team_id=t.id then g.home_score-g.away_score when g.away_team_id=t.id then g.away_score-g.home_score else 0 end),0) run_diff
   from public.teams t left join public.games g on g.league_id=l.id and g.timeline_id=l.active_timeline_id and g.season_year=l.current_year and g.season_stage='regular' and g.phase='final' and(t.id=g.home_team_id or t.id=g.away_team_id)
   group by t.id) z;
  seed1:=seed_rankings[1];seed2:=seed_rankings[2];
  if s.stage='wildcard' then
   perform private.start_series(l.id,l.active_timeline_id,l.current_year,'challenge',seed2,winner,3,greatest(p_now,l.season_anchor_at+interval '4 days 2 hours'));
  elsif s.stage='challenge' then
   perform private.start_series(l.id,l.active_timeline_id,l.current_year,'final',seed1,winner,7,greatest(p_now,l.season_anchor_at+interval '4 days 5 hours'));
  else
   insert into public.league_champions(league_id,timeline_id,season_year,team_id)
    values(l.id,l.active_timeline_id,l.current_year,winner) on conflict do nothing;
  end if;
  return 'FINISHED_'||s.stage;
 end if;
 if not exists(select 1 from public.games where series_id=s.id and phase in('scheduled','live')) then
  -- Each game finishes within 8 minutes, with next game no sooner than 32 minutes after the previous start.
  insert into public.games(league_id,timeline_id,season_year,home_team_id,away_team_id,scheduled_at,phase,season_stage,series_id)
   values(l.id,l.active_timeline_id,l.current_year,
    case when s.next_game_number%2=0 then s.team_b else s.team_a end,
    case when s.next_game_number%2=0 then s.team_a else s.team_b end,
    greatest(p_now,s.next_at),'scheduled','playoff',s.id);
  update public.playoff_series set next_game_number=next_game_number+1,next_at=greatest(p_now,s.next_at)+interval '32 minutes' where id=s.id;
  return 'NEXT_'||s.stage;
 end if;
 return 'WAITING';
end;$$;

create or replace function private.lock_protected(p_league uuid) returns integer
language plpgsql set search_path='' as $$
declare l public.leagues%rowtype;t record;total int:=0;
begin
 select * into l from public.leagues where id=p_league for update;
 for t in select id from public.teams loop
   perform private.auto_roster(l.id,l.active_timeline_id,l.current_year,t.id,'protected60');total:=total+1;
 end loop;
 return total;
end;$$;

create or replace function private.mark_negotiable(p_league uuid) returns integer
language plpgsql set search_path='' as $$
declare l public.leagues%rowtype;v_count int;
begin
 select * into l from public.leagues where id=p_league for update;
 perform private.lock_protected(p_league);
 update public.league_players lp set roster_status='negotiable',updated_at=now()
 where lp.league_id=p_league and lp.team_id is not null and lp.roster_status<>'retired'
  and not exists(select 1 from public.roster_submissions rs where rs.league_id=lp.league_id and rs.timeline_id=l.active_timeline_id and rs.season_year=l.current_year and rs.team_id=lp.team_id
    and rs.kind='protected60' and lp.master_player_id=any(rs.player_ids));
 get diagnostics v_count=row_count;
 return v_count;
end;$$;

create or replace function private.finish_free_agency(p_league uuid) returns integer
language plpgsql set search_path='' as $$
declare l public.leagues%rowtype;p record;offer public.fa_offers%rowtype;done int:=0;
begin
 select * into l from public.leagues where id=p_league for update;
 for p in select * from public.league_players where league_id=p_league and roster_status='negotiable' for update loop
  select * into offer from public.fa_offers where league_id=p_league and timeline_id=l.active_timeline_id and season_year=l.current_year and player_id=p.master_player_id and status='offered'
  order by salary_ntd desc,created_at asc limit 1;
  if found then
    update public.league_players set team_id=offer.bidder_team_id,roster_status='reserve',monthly_salary_ntd=offer.salary_ntd,contract_years=offer.years,updated_at=now()
     where id=p.id;
    update public.fa_offers set status=case when id=offer.id then 'accepted' else 'rejected' end,resolved_at=now()
     where league_id=p_league and timeline_id=l.active_timeline_id and player_id=p.master_player_id and status='offered';
  else
    update public.league_players set team_id=null,roster_status='free_agent',updated_at=now() where id=p.id;
  end if;
  done:=done+1;
 end loop;
 return done;
end;$$;

create or replace function private.settle_finances(p_league uuid) returns integer
language plpgsql set search_path='' as $$
declare l public.leagues%rowtype;t record;due bigint;cash bigint;pay bigint;unpaid bigint;paid int:=0;
begin
 select * into l from public.leagues where id=p_league for update;
 for t in select * from public.teams loop
  select coalesce(sum(monthly_salary_ntd*12),0)+5000000 into due from public.league_players
   where league_id=p_league and team_id=t.id and roster_status<>'retired';
  -- Estimate sponsors; do not present as authentic CPBL revenue.
  update public.team_finances set cash_ntd=cash_ntd+40000000,updated_at=now() where league_id=p_league and team_id=t.id;
  insert into public.finance_ledger(league_id,timeline_id,season_year,team_id,amount_ntd,kind,memo)
   values(p_league,l.active_timeline_id,l.current_year,t.id,40000000,'sponsor_estimate','年度基礎贊助設計值');
  select cash_ntd into cash from public.team_finances where league_id=p_league and team_id=t.id for update;
  pay:=least(cash,due);unpaid:=due-pay;
  update public.team_finances set cash_ntd=cash_ntd-pay,debt_ntd=debt_ntd+unpaid,updated_at=now()
   where league_id=p_league and team_id=t.id;
  insert into public.finance_ledger(league_id,timeline_id,season_year,team_id,amount_ntd,kind,memo)
   values(p_league,l.active_timeline_id,l.current_year,t.id,-pay,'salary_and_training',case when unpaid>0 then '未清償債務 '||unpaid::text else '年薪及訓練支出' end);
  paid:=paid+1;
 end loop;
 return paid;
end;$$;

-- Tick is idempotent, uses PostgreSQL time and a row lock, and only runs an authorized READY official league.
create or replace function private.tick_official(p_now timestamptz default now()) returns text
language plpgsql set search_path='' as $$
declare l public.leagues%rowtype;g record;count_done int:=0;status text;v_t text;
begin
 select * into l from public.leagues where kind='official' for update;
 if not found or not l.is_ready then return 'WAITING_FOR_VERIFIED_ROSTERS_AND_USERS';end if;
 if p_now<l.season_anchor_at then return 'WAITING_START';end if;
 if p_now >= l.season_anchor_at+interval '7 days' then
   if l.season_phase='training' then
    update public.leagues set current_year=current_year+1,season_anchor_at=season_anchor_at+interval '7 days',season_phase='regular' where id=l.id;
    select * into l from public.leagues where id=l.id;
    perform private.schedule_regular(l.id,l.current_year,l.season_anchor_at,l.active_timeline_id);
   else return 'NEEDS_CATCHUP';end if;
 end if;
 if l.season_phase='pending' then
   perform private.schedule_regular(l.id,l.current_year,l.season_anchor_at,l.active_timeline_id);
   update public.leagues set season_phase='regular' where id=l.id;
   l.season_phase:='regular';
 end if;
 for g in select id from public.games where league_id=l.id and timeline_id=l.active_timeline_id and season_year=l.current_year and phase='scheduled'
    and scheduled_at+interval '8 minutes' <= p_now order by scheduled_at limit 15 loop
   perform private.simulate_game(g.id);count_done:=count_done+1;
 end loop;
 if p_now>=l.season_anchor_at+interval '4 days' and l.season_phase='regular' then
   if not exists(select 1 from public.games where league_id=l.id and timeline_id=l.active_timeline_id and season_year=l.current_year and season_stage='regular' and phase<>'final') then
    status:=private.start_playoffs(l.id);
   end if;
 end if;
 if p_now>=l.season_anchor_at+interval '4 days' and p_now<l.season_anchor_at+interval '4 days 12 hours' then
   perform private.progress_playoffs(l.id,p_now);
 end if;
 if p_now>=l.season_anchor_at+interval '4 days 12 hours' and l.season_phase='playoff' then
   perform private.lock_protected(l.id);
   update public.leagues set season_phase='offseason' where id=l.id;
 end if;
 if p_now>=l.season_anchor_at+interval '4 days 16 hours' and p_now<l.season_anchor_at+interval '6 days' then
   perform private.mark_negotiable(l.id);
 end if;
 if p_now>=l.season_anchor_at+interval '6 days' and l.season_phase='offseason' then
   perform private.finish_free_agency(l.id);
   perform private.settle_finances(l.id);
   update public.leagues set season_phase='training' where id=l.id;
 end if;
 return 'OK_SIMULATED_'||count_done::text;
end;$$;

-- Server-only RLS-bypassing wrapper, callable only by project service role / cron owner.
create or replace function public.server_submit_roster(p_league uuid,p_team text,p_kind text,p_ids bigint[],p_actor uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare l public.leagues%rowtype;cap int;invalid int;unique_count int;
begin
 select * into l from public.leagues where id=p_league for update;
 if not found then raise exception 'LEAGUE_NOT_FOUND';end if;
 if p_kind not in('playoff32','protected60') then raise exception 'INVALID_ROSTER_TYPE';end if;
 cap:=case when p_kind='playoff32' then 32 else 60 end;
 select count(*) into unique_count from (select distinct unnest(coalesce(p_ids,'{}'::bigint[])) id) x;
 if coalesce(array_length(p_ids,1),0)>cap or unique_count<>coalesce(array_length(p_ids,1),0) then raise exception 'INVALID_ROSTER_SIZE';end if;
 select count(*) into invalid from unnest(coalesce(p_ids,'{}'::bigint[])) i
 where not exists(select 1 from public.league_players lp where lp.league_id=p_league and lp.team_id=p_team and lp.master_player_id=i and lp.roster_status in('active','reserve'));
 if invalid>0 then raise exception 'UNOWNED_PLAYER';end if;
 if exists(select 1 from public.roster_submissions rs where league_id=p_league and timeline_id=l.active_timeline_id and season_year=l.current_year and team_id=p_team and kind=p_kind and locked) then raise exception 'ROSTER_LOCKED';end if;
 insert into public.roster_submissions(league_id,timeline_id,season_year,team_id,kind,player_ids,submitted_by,auto_selected,locked)
 values(p_league,l.active_timeline_id,l.current_year,p_team,p_kind,p_ids,p_actor,false,false)
 on conflict(league_id,timeline_id,season_year,team_id,kind)
 do update set player_ids=excluded.player_ids,submitted_by=p_actor,submitted_at=now(),auto_selected=false;
 return unique_count;
end;$$;

create or replace function public.server_offer_fa(p_league uuid,p_team text,p_player bigint,p_salary bigint,p_years int)
returns uuid language plpgsql security definer set search_path='' as $$
declare l public.leagues%rowtype;p public.league_players%rowtype;offer_id uuid;
begin
 select * into l from public.leagues where id=p_league for update;
 if p_salary<70000 or p_salary>50000000 or p_years<1 or p_years>5 then raise exception 'INVALID_OFFER';end if;
 select * into p from public.league_players where league_id=p_league and master_player_id=p_player for update;
 if not found or p.roster_status not in('free_agent','negotiable') then raise exception 'PLAYER_NOT_AVAILABLE';end if;
 if p.team_id=p_team then raise exception 'CANNOT_APPROACH_OWN_PLAYER';end if;
 insert into public.fa_offers(league_id,timeline_id,season_year,player_id,bidder_team_id,salary_ntd,years)
 values(p_league,l.active_timeline_id,l.current_year,p_player,p_team,p_salary,p_years) returning id into offer_id;
 -- Midseason unattached free agents can accept immediately, while protected-roster negotiations settle in the offseason.
 if p.roster_status='free_agent' then
  update public.league_players set team_id=p_team,roster_status='reserve',monthly_salary_ntd=p_salary,contract_years=p_years,updated_at=now() where id=p.id;
  update public.fa_offers set status='accepted',resolved_at=now() where id=offer_id;
 end if;
 return offer_id;
end;$$;

revoke execute on function public.server_submit_roster(uuid,text,text,bigint[],uuid),public.server_offer_fa(uuid,text,bigint,bigint,int)
 from public,anon,authenticated;
grant execute on function public.server_submit_roster(uuid,text,text,bigint[],uuid),public.server_offer_fa(uuid,text,bigint,bigint,int)
 to service_role;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on all functions in schema private to service_role;
