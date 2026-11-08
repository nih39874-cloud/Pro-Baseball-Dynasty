-- GM simulation uses the same regular, postseason, roster and settlement rules as the official league.
create or replace function private.gm_advance_year(p_league uuid) returns integer
language plpgsql set search_path='' as $$
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
 perform private.gm_checkpoint(p_league,'快轉後');
 return l.current_year+1;
end;$$;

-- Do not run fake seasons before roster and auth setup. Activation shifts schedule to next Tuesday.
create or replace function public.server_activate_league(p_league uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare l public.leagues%rowtype;matched int;rostered int;new_anchor timestamptz;shift interval;
begin
 select * into l from public.leagues where id=p_league for update;
 if not found then raise exception 'LEAGUE_NOT_FOUND';end if;
 select count(*) into rostered from (select team_id,count(*) n from public.league_players
  where league_id=l.id and roster_status in('active','reserve') and team_id is not null
  group by team_id having count(*)>=9) qualified;
 if rostered<>6 then raise exception 'ALL_SIX_TEAMS_NEED_REAL_ROSTERS';end if;
 select count(*) into matched from public.memberships where league_id=l.id;
 if (l.kind='gm' and matched<>1) or (l.kind='official' and matched<>6) then raise exception 'ACCOUNTS_NOT_PROVISIONED';end if;
 new_anchor:=private.next_tuesday_0800(now());shift:=new_anchor-l.season_anchor_at;
 update public.games set scheduled_at=scheduled_at+shift where league_id=l.id and timeline_id=l.active_timeline_id and phase='scheduled';
 update public.leagues set season_anchor_at=new_anchor,season_phase='pending',is_ready=true where id=l.id;
 return true;
end;$$;
revoke execute on function public.server_activate_league(uuid) from public,anon,authenticated;
grant execute on function public.server_activate_league(uuid) to service_role;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on all functions in schema private to service_role;
