-- Diamond Dynasty 007: independent GM clock and official launch hold
alter table public.leagues add column if not exists clock_enabled boolean not null default false;
alter table public.leagues add column if not exists clock_last_tick timestamptz;
update public.leagues set clock_enabled=(kind='gm'),clock_last_tick=case when kind='gm' then now() else clock_last_tick end
 where kind in ('gm','official');
-- Official stays unready and cannot progress until go-live.
update public.leagues set is_ready=false,clock_enabled=false where kind='official';
create or replace function private.tick_league(p_kind text,p_now timestamptz default now()) returns text
language plpgsql set search_path='' as $$
declare l public.leagues%rowtype;g record;count_done int:=0;status text;v_t text;
begin
 select * into l from public.leagues where kind=p_kind for update;
 if not found then return 'NOT_FOUND';end if;
 if not l.clock_enabled then return 'PAUSED';end if;
 update public.leagues set clock_last_tick=p_now where id=l.id;
 if not l.is_ready then return 'CLOCK_RUNNING_WAITING_FOR_REAL_ROSTERS';end if;
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

create or replace function private.tick_gm(p_now timestamptz default now()) returns text
language sql set search_path='' as $$ select private.tick_league('gm',p_now); $$;
create or replace function private.tick_official(p_now timestamptz default now()) returns text
language sql set search_path='' as $$ select private.tick_league('official',p_now); $$;
create or replace function private.tick_all(p_now timestamptz default now()) returns jsonb
language plpgsql set search_path='' as $$
declare gm_result text;official_result text;
begin
 gm_result:=private.tick_gm(p_now);
 official_result:=private.tick_official(p_now);
 return jsonb_build_object('gm',gm_result,'official',official_result);
end; $$;
do $$begin
 if exists(select 1 from cron.job where jobname='diamond-official-minute') then
  perform cron.unschedule('diamond-official-minute');
 end if;
end$$;
select cron.schedule('diamond-league-minute','* * * * *','select private.tick_all(now());');
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on all functions in schema private to service_role;
