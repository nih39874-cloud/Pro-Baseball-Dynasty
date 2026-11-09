-- Stop client-declared perfect release from overriding pitcher ability; never return unresolved strike location on replay.
CREATE OR REPLACE FUNCTION private.manual_pitch(p_game uuid, p_team text, p_x numeric, p_y numeric, p_quality numeric, p_pitch_type text, p_command uuid, p_actor uuid, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare sess public.match_sessions%rowtype;g public.games%rowtype;ps public.match_pitch_states%rowtype;
 c public.match_team_controls%rowtype;defense_team text;side text;actual_x numeric;actual_y numeric;
 edge numeric;noise numeric;v_pitch jsonb;v_truth boolean;v_called boolean;v_error numeric;
 pitcher_id bigint; pitcher_skill numeric; effective_quality numeric;
begin
 if p_x is null or p_y is null or p_quality is null or
   p_x not between -1.25 and 1.25 or p_y not between -1.25 and 1.25 or p_quality not between 0 and 1 or
   p_pitch_type not in('four_seam','two_seam','slider','curve','changeup','splitter','cutter','sinker')
 then raise exception 'INVALID_PITCH_INPUT';end if;
 select * into sess from public.match_sessions where game_id=p_game for update;
 if not found or sess.completed_at is not null then raise exception 'MATCH_NOT_RUNNING';end if;
 select * into g from public.games where id=p_game;
 if not exists(select 1 from public.leagues l where l.id=g.league_id and l.clock_enabled and l.is_ready and l.active_timeline_id=g.timeline_id) then raise exception 'LEAGUE_PAUSED';end if;
 side:=case when sess.state->>'half'='top' then 'home' else 'away' end;
 defense_team:=case when side='home' then g.home_team_id else g.away_team_id end;
 if defense_team<>p_team then raise exception 'NOT_DEFENDING_TEAM';end if;
 select * into c from public.match_team_controls where game_id=p_game and team_id=p_team for update;
 if p_actor is not null and (c.active_mode<>'player' or c.controlled_by is distinct from p_actor
   or c.last_heartbeat_at is null or c.last_heartbeat_at<p_now-interval '45 seconds') then
  raise exception 'PLAYER_NOT_IN_CONTROL';end if;
 if p_actor is null and c.active_mode='player' and c.last_heartbeat_at>p_now-interval '40 seconds' then
  raise exception 'HUMAN_PITCHER_ACTIVE';end if;
 insert into public.match_pitch_states(game_id,league_id) values(p_game,g.league_id)
 on conflict(game_id) do nothing;
 select * into ps from public.match_pitch_states where game_id=p_game for update;
 if exists(select 1 from public.match_player_commands where game_id=p_game and team_id=p_team and client_command_id=p_command) then
  return jsonb_build_object('replayed',true,'pitch_id',ps.pending_pitch->'id');end if;
 if ps.pending_pitch is not null then raise exception 'PITCH_ALREADY_RELEASED';end if;
 if ps.review is not null then raise exception 'ABS_WINDOW_ACTIVE';end if;
 -- The player chooses location; release precision depends on their run-bar result and corner difficulty.
 edge:=(abs(p_x)+abs(p_y))/2;
 pitcher_id:=((case when side='home' then sess.state->'home_lineup' else sess.state->'away_lineup' end)->'defense'->>'P')::bigint;
 select coalesce(lp.pitching_rating,50) into pitcher_skill from public.league_players lp
 where lp.league_id=g.league_id and lp.team_id=p_team and lp.master_player_id=pitcher_id and lp.roster_status='active';
 pitcher_skill:=coalesce(pitcher_skill,50);
 -- A claimed perfect release does not override a low-control pitcher or corner difficulty.
 effective_quality:=least(p_quality, greatest(.25, least(.97,.50+pitcher_skill/200.0-edge*.12)));
 v_error:=0.055 + (1-effective_quality)*0.20 + edge*.065;
 actual_x:=greatest(-1.55,least(1.55,p_x+(random()-random())*v_error));
 actual_y:=greatest(-1.55,least(1.55,p_y+(random()-random())*v_error));
 v_truth:=abs(actual_x)<=0.77 and abs(actual_y)<=0.70;
 noise:=case when abs(abs(actual_x)-0.77)<0.08 or abs(abs(actual_y)-0.70)<0.08 then 0.085
             when abs(actual_x)<0.22 and abs(actual_y)<0.22 then 0.01 else 0.035 end;
 v_called:=case when random()<noise then not v_truth else v_truth end;
 v_pitch:=jsonb_build_object('id',gen_random_uuid(),'x',round(actual_x,4),'y',round(actual_y,4),
   'target_x',p_x,'target_y',p_y,'pitch_type',p_pitch_type,'released_at',p_now,'called_strike',v_called,
   'actual_strike',v_truth,'quality',effective_quality,'pitcher_team',p_team);
 update public.match_pitch_states set pending_pitch=v_pitch,pitch_no=pitch_no+1,updated_at=p_now
 where game_id=p_game;
 update public.match_sessions set state=jsonb_set(state,'{between_atbats}','false'::jsonb),
 version=version+1,updated_at=p_now where game_id=p_game;
 insert into public.match_player_commands(game_id,league_id,team_id,client_command_id,type,payload)
 values(p_game,g.league_id,p_team,p_command,'pitch',jsonb_build_object('type',p_pitch_type,'target_x',p_x,'target_y',p_y));
 perform private.manual_pitch_log(p_game,'pitch_released',jsonb_build_object('pitch_id',v_pitch->'id','pitch_type',p_pitch_type,'team',p_team));
 -- Unresolved exact pitch coordinates remain server-private; clients only receive pitch release metadata.
 return jsonb_build_object('ok',true,'pitch_id',v_pitch->'id','released_at',p_now);
end;$function$
;