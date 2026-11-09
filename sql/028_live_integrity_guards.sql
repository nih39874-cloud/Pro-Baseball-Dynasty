-- Protect active live sessions against GM fast-forward and batch simulation; reject unsupported remote player control.
CREATE OR REPLACE FUNCTION private.simulate_game(p_game uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 g public.games%rowtype;
 batting text; fielding text; batter_ids bigint[]; batter_id bigint;
 home_lineup jsonb;away_lineup jsonb; v_field_lineup jsonb;
 field_pos text; fielder_id bigint; field_skill float8; pitch_skill float8; pitcher_id bigint;
 spray_degrees float8; ball_distance_m float8;
 batter_count integer[]:=array[0,0];
 v_home_score int:=0;v_away_score int:=0;
 inning int;v_last_inning int:=0;half int;outs int;pa int;seq int:=0; bidx int;
 b1 boolean;b2 boolean;b3 boolean; v_runs int; v_hit int; v_kind text;
 roll float8; skill float8; final_result jsonb;
begin
 select * into g from public.games where id=p_game for update;
 if not found then raise exception 'GAME_NOT_FOUND';end if;
 if g.phase='final' then return jsonb_build_object('home',g.home_score,'away',g.away_score);end if;
 if exists(select 1 from public.match_sessions ms where ms.game_id=g.id and ms.completed_at is null) then raise exception 'LIVE_SESSION_REQUIRES_LIVE_ENGINE';end if;
 if exists(select 1 from public.leagues where id=g.league_id and kind='official' and clock_enabled=false) then raise exception 'OFFICIAL_LEAGUE_PAUSED';end if;
 if g.phase not in('scheduled','live') then raise exception 'GAME_NOT_SIMULATABLE';end if;
 if (select count(*) from public.league_players where league_id=g.league_id and team_id=g.home_team_id and roster_status='active')<9
 or (select count(*) from public.league_players where league_id=g.league_id and team_id=g.away_team_id and roster_status='active')<9
 then raise exception 'REAL_ROSTER_INCOMPLETE';end if;
 home_lineup:=private.resolve_game_lineup(g.league_id,g.timeline_id,g.season_year,g.home_team_id,g.away_team_id);
 away_lineup:=private.resolve_game_lineup(g.league_id,g.timeline_id,g.season_year,g.away_team_id,g.home_team_id);
 for inning in 1..20 loop
  v_last_inning:=inning;
  for half in 0..1 loop
   -- Home already ahead after the visitor's final scheduled half inning.
   if half=1 and inning>=9 and v_home_score>v_away_score then exit;end if;
   batting:=case when half=0 then g.away_team_id else g.home_team_id end;
   fielding:=case when half=0 then g.home_team_id else g.away_team_id end;
   v_field_lineup:=case when half=0 then home_lineup else away_lineup end;
   pitcher_id:=(v_field_lineup->'defense'->>'P')::bigint;
   select coalesce(lp.pitching_rating,50) into pitch_skill from public.league_players lp where lp.league_id=g.league_id and lp.master_player_id=pitcher_id;
   pitch_skill:=coalesce(pitch_skill,50);
   select array_agg(entry.value::bigint order by entry.ordinality) into batter_ids
   from jsonb_array_elements_text((case when half=0 then away_lineup else home_lineup end)->'batting_order')
   with ordinality as entry(value,ordinality);
   outs:=0;b1:=false;b2:=false;b3:=false;pa:=0;
   while outs<3 and pa<35 loop
    pa:=pa+1;seq:=seq+1;v_runs:=0;v_hit:=0;
    if half=0 then batter_count[1]:=batter_count[1]+1;bidx:=batter_count[1];
    else batter_count[2]:=batter_count[2]+1;bidx:=batter_count[2];end if;
    batter_id:=null;
    if coalesce(array_length(batter_ids,1),0)>0 then
      batter_id:=batter_ids[(bidx-1)%least(9,array_length(batter_ids,1))+1];
    end if;
    select coalesce(batting_rating,50) into skill from public.league_players where league_id=g.league_id and master_player_id=batter_id;
    skill:=coalesce(skill,50);
    -- A hit location is generated from spray direction and distance, then mapped to one defender.
    -- Negative spray means left field; positive spray means right field (view from home plate).
    spray_degrees:=random()*90-45;
    ball_distance_m:=random()*105+8;
    if ball_distance_m<15 then
      field_pos:=case when abs(spray_degrees)<15 then 'P' else 'C' end;
    elsif ball_distance_m>=62 then
      field_pos:=case when spray_degrees< -15 then 'LF' when spray_degrees>15 then 'RF' else 'CF' end;
    else
      field_pos:=case when spray_degrees< -25 then '3B'
                      when spray_degrees<0 then 'SS'
                      when spray_degrees<25 then '2B'
                      else '1B' end;
    end if;
    fielder_id:=(v_field_lineup->'defense'->>field_pos)::bigint;
    select coalesce(lp.fielding_rating,50) into field_skill from public.league_players lp where lp.league_id=g.league_id and lp.master_player_id=fielder_id;
    field_skill:=coalesce(field_skill,50);
    -- Hitter, pitcher, and defender ratings all affect the probability of reaching base.
    -- A fielder selected from the manager's lineup resolves the play in that defensive zone.
    roll:=random()+(50-skill)*0.0015+(pitch_skill-50)*0.0018+(field_skill-50)*0.0004;
    if roll<0.075 then -- walk, only forced runners advance
      v_kind:='BB';
      if b1 and b2 and b3 then v_runs:=1;end if;
      b3:=b3 or (b1 and b2);b2:=b2 or b1;b1:=true;
    elsif roll<0.25 then
      v_kind:='1B';v_hit:=1;
      if b3 then v_runs:=v_runs+1;end if;
      b3:=b2;b2:=b1;b1:=true;
    elsif roll<0.303 then
      v_kind:='2B';v_hit:=1;
      v_runs:=case when b3 then 1 else 0 end+case when b2 then 1 else 0 end;
      b3:=b1;b2:=true;b1:=false;
    elsif roll<0.31 then
      v_kind:='3B';v_hit:=1;
      v_runs:=case when b3 then 1 else 0 end+case when b2 then 1 else 0 end+case when b1 then 1 else 0 end;
      b3:=true;b2:=false;b1:=false;
    elsif roll<0.343 then
      v_kind:='HR';v_hit:=1;
      v_runs:=1+case when b3 then 1 else 0 end+case when b2 then 1 else 0 end+case when b1 then 1 else 0 end;
      b3:=false;b2:=false;b1:=false;
    elsif roll<0.535 then v_kind:='K';outs:=outs+1;
    else v_kind:='OUT';outs:=outs+1;end if;
    if half=0 then v_away_score:=v_away_score+v_runs;else v_home_score:=v_home_score+v_runs;end if;
    insert into public.game_events(game_id,seq,type,payload)
      values(g.id,seq,'plate_appearance',jsonb_build_object('inning',inning,'half',case when half=0 then 'top' else 'bottom' end,'team',batting,'batter_id',batter_id,'result',v_kind,'runs',v_runs,'field_position',field_pos,'fielder_id',fielder_id,'pitcher_id',pitcher_id,'spray_degrees',round(spray_degrees::numeric,2),'ball_distance_m',round(ball_distance_m::numeric,2)));
    if batter_id is not null then
     insert into public.player_season_stats(league_id,timeline_id,season_year,player_id,team_id,plate_appearances,hits,games_played)
     values(g.league_id,g.timeline_id,g.season_year,batter_id,batting,1,v_hit,0)
     on conflict(league_id,timeline_id,season_year,player_id) do update
       set plate_appearances=public.player_season_stats.plate_appearances+1,hits=public.player_season_stats.hits+v_hit;
    end if;
    if half=1 and inning>=9 and v_home_score>v_away_score then exit;end if; -- walk-off
   end loop;
   if half=1 and inning>=9 and v_home_score>v_away_score then exit;end if;
  end loop;
  if inning>=9 and v_home_score<>v_away_score then exit;end if;
  if inning>=12 and g.season_stage='regular' then exit;end if;
 end loop;
 if g.season_stage<>'regular' and v_away_score=v_home_score then
   if random()<.5 then v_home_score:=v_home_score+1;else v_away_score:=v_away_score+1;end if;
 end if;
 update public.games set phase='final',home_score=v_home_score,away_score=v_away_score,
   game_state=jsonb_build_object('completed','server_auto','innings',v_last_inning,
     'plate_appearances',seq,'tie',v_home_score=v_away_score,
     'lineups',jsonb_build_object('home',home_lineup,'away',away_lineup)),
   version=version+1,completed_at=now(),updated_at=now() where id=g.id;
 -- Record per-game appearances for batters that played; stats rows already capture PA/hits.
 update public.player_season_stats st set games_played=games_played+1
 where st.league_id=g.league_id and st.timeline_id=g.timeline_id and st.season_year=g.season_year
  and st.team_id in(g.home_team_id,g.away_team_id)
  and exists(select 1 from public.game_events ev where ev.game_id=g.id and ev.payload->>'batter_id'=st.player_id::text);
 -- Ticket revenue is a game-design estimate, not the real financial records of CPBL teams.
 update public.team_finances set cash_ntd=cash_ntd+1800000,updated_at=now()
 where league_id=g.league_id and team_id=g.home_team_id;
 insert into public.finance_ledger(league_id,timeline_id,season_year,team_id,amount_ntd,kind,memo)
 values(g.league_id,g.timeline_id,g.season_year,g.home_team_id,1800000,'ticket_estimate','主場票房示意估算');
 final_result:=jsonb_build_object('home',v_home_score,'away',v_away_score,'batters',seq,'inning',v_last_inning);
 return final_result;
end;$function$
;
CREATE OR REPLACE FUNCTION private.gm_advance_year(p_league uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare l public.leagues%rowtype;g record;v_step integer;result text;win_count integer;
begin
 select * into l from public.leagues where id=p_league and kind='gm' for update;
 if not found then raise exception 'GM_ONLY';end if;
 if exists(select 1 from public.match_sessions s where s.league_id=p_league and s.timeline_id=l.active_timeline_id and s.completed_at is null) then raise exception 'ACTIVE_LIVE_MATCH_BLOCKS_GM_ADVANCE';end if;
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
CREATE OR REPLACE FUNCTION private.live_control(p_game uuid, p_team text, p_mode text, p_actor uuid, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare sess public.match_sessions%rowtype; c public.match_team_controls%rowtype;g public.games%rowtype;actual text;
begin
 if p_mode not in('auto','coach','player') then raise exception 'INVALID_MODE';end if;
 if p_mode='player' then raise exception 'REMOTE_PLAYER_CONTROLS_NOT_READY';end if;
 select * into sess from public.match_sessions where game_id=p_game for update;
 if not found or sess.completed_at is not null then raise exception 'MATCH_NOT_RUNNING';end if;
 select * into g from public.games where id=p_game;
 if p_team not in(g.home_team_id,g.away_team_id) then raise exception 'WRONG_TEAM';end if;
 select * into c from public.match_team_controls where game_id=p_game and team_id=p_team for update;
 if not found then raise exception 'CONTROL_NOT_FOUND';end if;
 -- A user can request a mode while the pitch is underway, but the current batter remains under AI.
 if coalesce((sess.state->>'between_atbats')::boolean,false) then
   update public.match_team_controls set active_mode=p_mode,pending_mode=null,
     last_heartbeat_at=p_now,controlled_by=p_actor,updated_at=p_now
    where game_id=p_game and team_id=p_team;
   actual:=p_mode;
 else
   update public.match_team_controls set pending_mode=p_mode,last_heartbeat_at=p_now,
     controlled_by=p_actor,updated_at=p_now where game_id=p_game and team_id=p_team;
   actual:=c.active_mode;
 end if;
 return jsonb_build_object('active_mode',actual,'pending_mode',case when actual=p_mode then null else p_mode end);
end;$function$
;
CREATE OR REPLACE FUNCTION private.live_tick(p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r record; v_count integer:=0;k integer;v_result jsonb; max_steps integer;
begin
 for r in select ms.game_id,g.scheduled_at from public.match_sessions ms
 join public.games g on g.id=ms.game_id join public.leagues l on l.id=ms.league_id
 where ms.completed_at is null and g.phase='live' and l.clock_enabled and l.is_ready
   and g.timeline_id=l.active_timeline_id and g.scheduled_at<=p_now
 order by ms.updated_at limit 15 loop
  update public.match_team_controls set active_mode='auto',pending_mode=null,controlled_by=null,updated_at=p_now
  where game_id=r.game_id and active_mode<>'auto'
    and (last_heartbeat_at is null or last_heartbeat_at<p_now-interval '40 seconds');
  select case when exists(select 1 from public.match_team_controls
       where game_id=r.game_id and active_mode='coach'
          and last_heartbeat_at>=p_now-interval '40 seconds') then 3 else 13 end into max_steps;
  for k in 1..max_steps loop
    v_result:=private.live_step(r.game_id,p_now);
    v_count:=v_count+1;
    exit when coalesce((v_result->>'finished')::boolean,false);
  end loop;
 end loop;
 return v_count;
end;$function$
;
