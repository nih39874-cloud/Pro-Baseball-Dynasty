-- Ensure each team receives five opponent-specific lineup slots at every new season, while preserving prior custom presets.
CREATE OR REPLACE FUNCTION private.gm_advance_year(p_league uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare l public.leagues%rowtype;g record;v_step integer;result text;win_count integer;
begin
 select * into l from public.leagues where id=p_league and kind='gm' for update;
 if not found then raise exception 'GM_ONLY';end if;
 if not l.is_ready then raise exception 'LEAGUE_NOT_READY';end if;
 perform private.gm_checkpoint(p_league,'快轉前');
 perform private.schedule_regular(p_league,l.current_year,l.season_anchor_at,l.active_timeline_id);
 for g in select id from public.games where league_id=p_league and timeline_id=l.active_timeline_id and season_year=l.current_year and season_stage='regular' and phase<>'final' order by scheduled_at loop
   perform private.simulate_game(g.id);
 end loop;
 perform private.start_playoffs(l.id);
 for v_step in 1..36 loop
   for g in select id from public.games where league_id=p_league and timeline_id=l.active_timeline_id and season_year=l.current_year and season_stage='playoff' and phase<>'final' order by scheduled_at loop
     perform private.simulate_game(g.id);
   end loop;
   result:=private.progress_playoffs(l.id,l.season_anchor_at+interval '4 days'+v_step*interval '32 minutes');
   select count(*) into win_count from public.league_champions where league_id=l.id and timeline_id=l.active_timeline_id and season_year=l.current_year;
   if win_count>0 then exit;end if;
 end loop;
 if win_count=0 then raise exception 'PLAYOFF_ENGINE_INCOMPLETE';end if;
 perform private.lock_protected(l.id);
 perform private.mark_negotiable(l.id);
 perform private.finish_free_agency(l.id);
 perform private.settle_finances(l.id);
 update public.leagues set current_year=current_year+1,season_anchor_at=season_anchor_at+interval '7 days',season_phase='pending' where id=p_league;
 perform private.seed_coach_presets(p_league);
 perform private.gm_checkpoint(p_league,'快轉後');
 return l.current_year+1;
end;$function$
;
CREATE OR REPLACE FUNCTION private.tick_league(p_kind text, p_now timestamp with time zone DEFAULT now())
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    perform private.seed_coach_presets(l.id);
   else return 'NEEDS_CATCHUP';end if;
 end if;
 if l.season_phase='pending' then
   perform private.schedule_regular(l.id,l.current_year,l.season_anchor_at,l.active_timeline_id);
   perform private.seed_coach_presets(l.id);
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
end;$function$
;
