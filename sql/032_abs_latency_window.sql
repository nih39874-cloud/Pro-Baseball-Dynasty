-- Mobile-friendly ABS review window and server-side latency tolerance for bat decisions.
create or replace function private.manual_bat(p_game uuid,p_team text,p_action text,p_x numeric,p_y numeric,
 p_timing numeric,p_command uuid,p_actor uuid,p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql set search_path='' as $$
declare sess public.match_sessions%rowtype;g public.games%rowtype;ps public.match_pitch_states%rowtype;
 c public.match_team_controls%rowtype;side text;batting_team text;px numeric;py numeric;
 v_offset numeric;timing_error numeric;power numeric;r numeric;v_res text;v_meta jsonb;
 called boolean;truth boolean;v_review jsonb;v_last jsonb;
begin
 if p_action not in ('swing','take') or p_x is null or p_y is null or p_timing is null or
    p_x not between -1.25 and 1.25 or p_y not between -1.25 and 1.25 or p_timing not between -1 and 1
 then raise exception 'INVALID_BAT_INPUT';end if;
 select * into sess from public.match_sessions where game_id=p_game for update;
 if not found or sess.completed_at is not null then raise exception 'MATCH_NOT_RUNNING';end if;
 select * into g from public.games where id=p_game;
 if not exists(select 1 from public.leagues l where l.id=g.league_id and l.clock_enabled and l.is_ready and l.active_timeline_id=g.timeline_id) then raise exception 'LEAGUE_PAUSED';end if;
 side:=case when sess.state->>'half'='top' then 'away' else 'home' end;
 batting_team:=case when side='home' then g.home_team_id else g.away_team_id end;
 if p_team<>batting_team then raise exception 'NOT_BATTING_TEAM';end if;
 select * into c from public.match_team_controls where game_id=p_game and team_id=p_team for update;
 if p_actor is not null and (c.active_mode<>'player' or c.controlled_by is distinct from p_actor or
   c.last_heartbeat_at is null or c.last_heartbeat_at<p_now-interval '45 seconds') then raise exception 'PLAYER_NOT_IN_CONTROL';end if;
 select * into ps from public.match_pitch_states where game_id=p_game for update;
 if p_actor is null and c.active_mode='player' and c.last_heartbeat_at>p_now-interval '40 seconds'
    and ps.pending_pitch is not null
    and p_now<(ps.pending_pitch->>'released_at')::timestamptz+interval '12 seconds' then
  raise exception 'HUMAN_BATTER_ACTIVE';end if;
 if not found or ps.pending_pitch is null then raise exception 'NO_PITCH_TO_HIT';end if;
 if exists(select 1 from public.match_player_commands where game_id=p_game and team_id=p_team and client_command_id=p_command) then
  return jsonb_build_object('replayed',true,'last_outcome',ps.last_outcome);end if;
 if ps.review is not null then raise exception 'ABS_WINDOW_ACTIVE';end if;
 px:=(ps.pending_pitch->>'x')::numeric;py:=(ps.pending_pitch->>'y')::numeric;
 called:=(ps.pending_pitch->>'called_strike')::boolean;
 truth:=(ps.pending_pitch->>'actual_strike')::boolean;
 insert into public.match_player_commands(game_id,league_id,team_id,client_command_id,type,payload)
 values(p_game,g.league_id,p_team,p_command,p_action,jsonb_build_object('aim_x',p_x,'aim_y',p_y,'timing',p_timing,'pitch_id',ps.pending_pitch->'id'));
 if p_action='take' then
  v_review:=jsonb_build_object('pitch',ps.pending_pitch,'called_strike',called,'actual_strike',truth,
   'until',p_now+interval '10 seconds','at',p_now,'pitch_id',ps.pending_pitch->'id');
  update public.match_pitch_states set balls=balls+case when called then 0 else 1 end,
   strikes=strikes+case when called then 1 else 0 end,
   review=v_review,pending_pitch=null,last_outcome=jsonb_build_object('type','called','called_strike',called,'pitch_id',ps.pending_pitch->'id'),updated_at=p_now
   where game_id=p_game;
  update public.match_sessions set version=version+1,updated_at=p_now where game_id=p_game;
  perform private.manual_pitch_log(p_game,'pitch_called',jsonb_build_object('team',batting_team,'pitch_id',ps.pending_pitch->'id',
   'call',case when called then 'strike' else 'ball' end,'abs_until',p_now+interval '10 seconds'));
  return jsonb_build_object('ok',true,'called',case when called then 'strike' else 'ball' end,
   'review_until',p_now+interval '10 seconds');
 end if;
 -- Contact is affected by batting aim, server-generated location, and timing.
 v_offset:=sqrt(power(p_x-px,2)+power(p_y-py,2));
 timing_error:=abs(p_timing);
 -- Server-observed elapsed time provides an anti-replay floor, with latency tolerance.
 timing_error:=greatest(timing_error,greatest(0,extract(epoch from (p_now-(ps.pending_pitch->>'released_at')::timestamptz))-6)*.12);
 r:=random();
 if v_offset>0.50 or timing_error>0.88 then
  v_res:='MISS';
 elsif v_offset>0.33 or timing_error>0.60 then
  v_res:=case when r<0.75 then 'FOUL' else 'OUT' end;
 else
  power:=greatest(0,1-v_offset*1.25-timing_error*.65+(random()-.5)*.30);
  if power>.85 and r<.17 then v_res:='HR';
  elsif power>.67 and r<.39 then v_res:='2B';
  elsif power>.44 and r<.60 then v_res:='1B';
  elsif power>.35 and r<.64 then v_res:='3B';
  else v_res:='OUT';end if;
 end if;
 v_meta:=jsonb_build_object('manual_pitch',ps.pending_pitch-'actual_strike'-'called_strike','aim_x',p_x,'aim_y',p_y,
   'timing',p_timing,'spray_degrees',least(45,greatest(-45, p_timing*36 + (p_x-px)*12)),
   'ball_distance_m',case when v_res='HR' then 115 when v_res='2B' then 74 when v_res='3B' then 95 else 22+round(random()*45) end);
 update public.match_pitch_states set pending_pitch=null,updated_at=p_now where game_id=p_game;
 if v_res in('MISS','FOUL') then
   update public.match_pitch_states set strikes=case when v_res='FOUL' then least(2,strikes+1) else least(3,strikes+1) end,
    last_outcome=jsonb_build_object('type',v_res,'pitch_id',ps.pending_pitch->'id'),updated_at=p_now
   where game_id=p_game;
   update public.match_sessions set version=version+1,updated_at=p_now where game_id=p_game;
   perform private.manual_pitch_log(p_game,'pitch_swing',jsonb_build_object('outcome',v_res,'team',batting_team,'pitch_id',ps.pending_pitch->'id'));
   if v_res='MISS' and ps.strikes>=2 then
      return private.manual_finish(p_game,'K',v_meta,p_now);
   end if;
   return jsonb_build_object('ok',true,'result',v_res,'balls',ps.balls,'strikes',case when v_res='FOUL' then least(2,ps.strikes+1) else least(3,ps.strikes+1) end);
 end if;
 return private.manual_finish(p_game,v_res,v_meta,p_now);
end;$$;