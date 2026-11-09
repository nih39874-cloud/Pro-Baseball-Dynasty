-- Correct late AI takeover and refresh offline control state.
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
   'until',p_now+interval '5 seconds','at',p_now,'pitch_id',ps.pending_pitch->'id');
  update public.match_pitch_states set balls=balls+case when called then 0 else 1 end,
   strikes=strikes+case when called then 1 else 0 end,
   review=v_review,pending_pitch=null,last_outcome=jsonb_build_object('type','called','called_strike',called,'pitch_id',ps.pending_pitch->'id'),updated_at=p_now
   where game_id=p_game;
  update public.match_sessions set version=version+1,updated_at=p_now where game_id=p_game;
  perform private.manual_pitch_log(p_game,'pitch_called',jsonb_build_object('team',batting_team,'pitch_id',ps.pending_pitch->'id',
   'call',case when called then 'strike' else 'ball' end,'abs_until',p_now+interval '5 seconds'));
  return jsonb_build_object('ok',true,'called',case when called then 'strike' else 'ball' end,
   'review_until',p_now+interval '5 seconds');
 end if;
 -- Contact is affected by batting aim, server-generated location, and timing.
 v_offset:=sqrt(power(p_x-px,2)+power(p_y-py,2));
 timing_error:=abs(p_timing);
 -- Server-observed elapsed time provides an anti-replay floor, with latency tolerance.
 timing_error:=greatest(timing_error,greatest(0,abs(extract(epoch from (p_now-(ps.pending_pitch->>'released_at')::timestamptz))-.95)-.6)*.25);
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
create or replace function private.manual_tick(p_game uuid,p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql set search_path='' as $$
declare sess public.match_sessions%rowtype;g public.games%rowtype;ps public.match_pitch_states%rowtype;
 offense text;defense text;offc public.match_team_controls%rowtype;defc public.match_team_controls%rowtype;
 v_pitch jsonb;step_result jsonb;
begin
 select * into sess from public.match_sessions where game_id=p_game for update;
 if not found or sess.completed_at is not null then return jsonb_build_object('finished',true);end if;
 select * into g from public.games where id=p_game;
 if g.phase<>'live' or p_now<g.scheduled_at then return jsonb_build_object('waiting',true);end if;
 offense:=case when sess.state->>'half'='top' then g.away_team_id else g.home_team_id end;
 defense:=case when sess.state->>'half'='top' then g.home_team_id else g.away_team_id end;
 -- Heartbeat timeout applies even when a participant polls before the cron job.
 update public.match_team_controls set active_mode='auto',pending_mode=null,controlled_by=null,updated_at=p_now
 where game_id=p_game and active_mode<>'auto' and (last_heartbeat_at is null or last_heartbeat_at<p_now-interval '40 seconds');
 select * into offc from public.match_team_controls where game_id=p_game and team_id=offense;
 select * into defc from public.match_team_controls where game_id=p_game and team_id=defense;
 insert into public.match_pitch_states(game_id,league_id) values(p_game,g.league_id) on conflict(game_id) do nothing;
 select * into ps from public.match_pitch_states where game_id=p_game for update;
 if ps.review is not null then return private.manual_review_timeout(p_game,p_now);end if;
 if ps.pending_pitch is null then
  if defc.active_mode='player' then return jsonb_build_object('awaiting','pitcher');end if;
  return private.manual_pitch(p_game,defense,round(((random()*2)-1)::numeric,3),
     round(((random()*2)-1)::numeric,3),round((.5+random()*.4)::numeric,2),
     (array['four_seam','slider','curve','changeup'])[1+floor(random()*4)::int],gen_random_uuid(),null,p_now);
 end if;
 if offc.active_mode='player' and p_now<(ps.pending_pitch->>'released_at')::timestamptz+interval '12 seconds' then
  return jsonb_build_object('awaiting','batter');end if;
 -- Batting AI, or a disconnected batter whose deadline elapsed.
 if random()<.28 then
   return private.manual_bat(p_game,offense,'take',0,0,0,gen_random_uuid(),null,p_now);
 end if;
 return private.manual_bat(p_game,offense,'swing',
   round(((ps.pending_pitch->>'x')::numeric + (random()-.5)*.8)::numeric,3),
   round(((ps.pending_pitch->>'y')::numeric + (random()-.5)*.8)::numeric,3),
   round(((random()-.5)*1.3)::numeric,3),gen_random_uuid(),null,p_now);
end;$$;