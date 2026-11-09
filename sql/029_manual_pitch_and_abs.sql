-- Diamond Dynasty v0.7 -- server-authoritative pitch-at-a-time control, no nine-zone grid.
-- Protected behind active player-control mode and authenticated Edge Function.
create table if not exists public.match_pitch_states(
 game_id uuid primary key references public.match_sessions(game_id) on delete cascade,
 league_id uuid not null references public.leagues(id),
 balls smallint not null default 0 check(balls between 0 and 4),
 strikes smallint not null default 0 check(strikes between 0 and 3),
 pitch_no integer not null default 0,
 pending_pitch jsonb,
 review jsonb,
 last_outcome jsonb,
 updated_at timestamptz not null default now()
);
alter table public.match_pitch_states enable row level security;
revoke all on public.match_pitch_states from anon,authenticated;
-- No RLS policies here: the authenticated Edge API returns only redacted state.
alter table public.match_team_controls add column if not exists abs_remaining smallint not null default 2 check(abs_remaining between 0 and 2);
create table if not exists public.match_player_commands(
 game_id uuid not null references public.games(id) on delete cascade,
 league_id uuid not null references public.leagues(id),
 team_id text not null references public.teams(id),
 client_command_id uuid not null,
 type text not null check(type in('pitch','swing','take','abs')),
 payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 primary key(game_id,team_id,client_command_id)
);
alter table public.match_player_commands enable row level security;
revoke all on public.match_player_commands from anon,authenticated;
create index if not exists match_pitch_history_idx on public.match_player_commands(game_id,created_at desc);

-- Server-only helper for official scorebook logging. Locks should be obtained through match_sessions first.
create or replace function private.manual_pitch_log(p_game uuid,p_type text,p_payload jsonb)
returns bigint language plpgsql set search_path='' as $$
declare seq_no bigint;
begin
 select coalesce(max(seq),0)+1 into seq_no from public.game_events where game_id=p_game;
 insert into public.game_events(game_id,seq,type,payload) values(p_game,seq_no,p_type,p_payload);
 return seq_no;
end;$$;

-- Adjudicate a completed plate appearance through the SAME innings/score/runner engine as AI.
-- The live_step implementation below consumes state.manual_result instead of rerolling the at-bat.
create or replace function private.manual_finish(p_game uuid,p_result text,p_metadata jsonb,
 p_now timestamptz default clock_timestamp()) returns jsonb language plpgsql set search_path='' as $$
declare v jsonb; out jsonb;
begin
 if p_result not in ('BB','K','OUT','1B','2B','3B','HR','BUNT') then raise exception 'INVALID_MANUAL_RESULT';end if;
 update public.match_sessions set state=jsonb_set(state,'{manual_result}',
   jsonb_build_object('result',p_result)||coalesce(p_metadata,'{}'::jsonb),true),
   updated_at=p_now where game_id=p_game and completed_at is null;
 if not found then raise exception 'MATCH_NOT_RUNNING';end if;
 out:=private.live_step(p_game,p_now);
 update public.match_pitch_states set balls=0,strikes=0,pending_pitch=null,review=null,
  last_outcome=jsonb_build_object('result',p_result,'completed',true,'at',p_now),updated_at=p_now
 where game_id=p_game;
 return out;
end;$$;

create or replace function private.manual_review_timeout(p_game uuid,p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql set search_path='' as $$
declare sess public.match_sessions%rowtype; ps public.match_pitch_states%rowtype;res jsonb;
begin
 select * into sess from public.match_sessions where game_id=p_game for update;
 if not found or sess.completed_at is not null then return jsonb_build_object('finished',true);end if;
 select * into ps from public.match_pitch_states where game_id=p_game for update;
 if ps.review is null then return jsonb_build_object('waiting',true);end if;
 if p_now<(ps.review->>'until')::timestamptz then return jsonb_build_object('review_pending',true);end if;
 update public.match_pitch_states set review=null,updated_at=p_now where game_id=p_game;
 if ps.balls>=4 then return private.manual_finish(p_game,'BB',jsonb_build_object('last_pitch',ps.review->'pitch'),p_now);end if;
 if ps.strikes>=3 then return private.manual_finish(p_game,'K',jsonb_build_object('last_pitch',ps.review->'pitch'),p_now);end if;
 return jsonb_build_object('review_expired',true,'balls',ps.balls,'strikes',ps.strikes);
end;$$;

create or replace function private.manual_pitch(p_game uuid,p_team text,p_x numeric,p_y numeric,
 p_quality numeric,p_pitch_type text,p_command uuid,p_actor uuid,p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql set search_path='' as $$
declare sess public.match_sessions%rowtype;g public.games%rowtype;ps public.match_pitch_states%rowtype;
 c public.match_team_controls%rowtype;defense_team text;side text;actual_x numeric;actual_y numeric;
 edge numeric;noise numeric;v_pitch jsonb;v_truth boolean;v_called boolean;v_error numeric;
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
  return jsonb_build_object('replayed',true,'pitch',ps.pending_pitch);end if;
 if ps.pending_pitch is not null then raise exception 'PITCH_ALREADY_RELEASED';end if;
 if ps.review is not null then raise exception 'ABS_WINDOW_ACTIVE';end if;
 -- The player chooses location; release precision depends on their run-bar result and corner difficulty.
 edge:=(abs(p_x)+abs(p_y))/2;
 v_error:=0.055 + (1-p_quality)*0.20 + edge*.065;
 actual_x:=greatest(-1.55,least(1.55,p_x+(random()-random())*v_error));
 actual_y:=greatest(-1.55,least(1.55,p_y+(random()-random())*v_error));
 v_truth:=abs(actual_x)<=0.77 and abs(actual_y)<=0.70;
 noise:=case when abs(abs(actual_x)-0.77)<0.08 or abs(abs(actual_y)-0.70)<0.08 then 0.085
             when abs(actual_x)<0.22 and abs(actual_y)<0.22 then 0.01 else 0.035 end;
 v_called:=case when random()<noise then not v_truth else v_truth end;
 v_pitch:=jsonb_build_object('id',gen_random_uuid(),'x',round(actual_x,4),'y',round(actual_y,4),
   'target_x',p_x,'target_y',p_y,'pitch_type',p_pitch_type,'released_at',p_now,'called_strike',v_called,
   'actual_strike',v_truth,'quality',p_quality,'pitcher_team',p_team);
 update public.match_pitch_states set pending_pitch=v_pitch,pitch_no=pitch_no+1,updated_at=p_now
 where game_id=p_game;
 update public.match_sessions set state=jsonb_set(state,'{between_atbats}','false'::jsonb),
 version=version+1,updated_at=p_now where game_id=p_game;
 insert into public.match_player_commands(game_id,league_id,team_id,client_command_id,type,payload)
 values(p_game,g.league_id,p_team,p_command,'pitch',jsonb_build_object('type',p_pitch_type,'target_x',p_x,'target_y',p_y));
 perform private.manual_pitch_log(p_game,'pitch_released',jsonb_build_object('pitch_id',v_pitch->'id','pitch_type',p_pitch_type,'team',p_team));
 -- The batter's client will see released pitch coordinates; the umpire's verdict is hidden until take.
 return jsonb_build_object('ok',true,'pitch_id',v_pitch->'id','released_at',p_now);
end;$$;

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
 if p_actor is null and c.active_mode='player' and c.last_heartbeat_at>p_now-interval '40 seconds' then
  raise exception 'HUMAN_BATTER_ACTIVE';end if;
 select * into ps from public.match_pitch_states where game_id=p_game for update;
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

create or replace function private.manual_abs(p_game uuid,p_team text,p_command uuid,p_actor uuid,
 p_now timestamptz default clock_timestamp()) returns jsonb language plpgsql set search_path='' as $$
declare sess public.match_sessions%rowtype;g public.games%rowtype;ps public.match_pitch_states%rowtype;
 c public.match_team_controls%rowtype;defense_team text;offense_team text;call_strike boolean;true_strike boolean;
 corrected boolean;newballs smallint;newstrikes smallint;v_pitch jsonb;v_out jsonb;
begin
 select * into sess from public.match_sessions where game_id=p_game for update;
 if not found or sess.completed_at is not null then raise exception 'MATCH_NOT_RUNNING';end if;
 select * into g from public.games where id=p_game;
 if not exists(select 1 from public.leagues l where l.id=g.league_id and l.clock_enabled and l.is_ready and l.active_timeline_id=g.timeline_id) then raise exception 'LEAGUE_PAUSED';end if;
 offense_team:=case when sess.state->>'half'='top' then g.away_team_id else g.home_team_id end;
 defense_team:=case when sess.state->>'half'='top' then g.home_team_id else g.away_team_id end;
 if p_team not in(offense_team,defense_team) then raise exception 'WRONG_TEAM';end if;
 select * into c from public.match_team_controls where game_id=p_game and team_id=p_team for update;
 if c.active_mode<>'player' or c.controlled_by is distinct from p_actor or
 c.last_heartbeat_at is null or c.last_heartbeat_at<p_now-interval '45 seconds' then raise exception 'PLAYER_NOT_IN_CONTROL';end if;
 if c.abs_remaining<=0 then raise exception 'ABS_CHALLENGES_EXHAUSTED';end if;
 select * into ps from public.match_pitch_states where game_id=p_game for update;
 if exists(select 1 from public.match_player_commands where game_id=p_game and team_id=p_team and client_command_id=p_command) then
   return jsonb_build_object('replayed',true);end if;
 if ps.review is null or p_now>(ps.review->>'until')::timestamptz then raise exception 'ABS_WINDOW_CLOSED';end if;
 call_strike:=(ps.review->>'called_strike')::boolean;
 true_strike:=(ps.review->>'actual_strike')::boolean;
 corrected:=call_strike<>true_strike;
 v_pitch:=ps.review->'pitch';
 newballs:=ps.balls;newstrikes:=ps.strikes;
 if corrected then
  if call_strike then newstrikes:=newstrikes-1;newballs:=newballs+1;
  else newballs:=newballs-1;newstrikes:=newstrikes+1;end if;
 else
  update public.match_team_controls set abs_remaining=abs_remaining-1,updated_at=p_now where game_id=p_game and team_id=p_team;
 end if;
 update public.match_pitch_states set balls=newballs,strikes=newstrikes,review=null,
  last_outcome=jsonb_build_object('type','ABS','overturned',corrected,'corrected_call',case when true_strike then 'strike' else 'ball' end,
       'pitch_x',v_pitch->'x','pitch_y',v_pitch->'y','pitch_id',v_pitch->'id'),updated_at=p_now where game_id=p_game;
 insert into public.match_player_commands(game_id,league_id,team_id,client_command_id,type,payload)
 values(p_game,g.league_id,p_team,p_command,'abs',jsonb_build_object('overturned',corrected,'pitch_id',v_pitch->'id'));
 update public.match_sessions set version=version+1,updated_at=p_now where game_id=p_game;
 perform private.manual_pitch_log(p_game,'abs_challenge',jsonb_build_object('team',p_team,'overturned',corrected,
   'x',v_pitch->'x','y',v_pitch->'y','pitch_id',v_pitch->'id',
   'actual_call',case when true_strike then 'strike' else 'ball' end));
 if newballs>=4 then v_out:=private.manual_finish(p_game,'BB',jsonb_build_object('abs',corrected),p_now);
 elsif newstrikes>=3 then v_out:=private.manual_finish(p_game,'K',jsonb_build_object('abs',corrected),p_now);
 else v_out:=jsonb_build_object('balls',newballs,'strikes',newstrikes);end if;
 return jsonb_build_object('ok',true,'overturned',corrected,'remaining',case when corrected then c.abs_remaining else c.abs_remaining-1 end,
 'corrected_call',case when true_strike then 'strike' else 'ball' end,'pitch',v_pitch-'actual_strike'-'called_strike',
 'result',v_out);
end;$$;

-- Poll/cron safe automaton for player-mode opponents. One pitch-level step, never a full PA burst.
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

create or replace function public.server_manual_pitch(p_game uuid,p_team text,p_x numeric,p_y numeric,
 p_quality numeric,p_pitch_type text,p_command uuid,p_actor uuid) returns jsonb
language sql set search_path='' as $$select private.manual_pitch(p_game,p_team,p_x,p_y,p_quality,p_pitch_type,p_command,p_actor);$$;
create or replace function public.server_manual_bat(p_game uuid,p_team text,p_action text,p_x numeric,p_y numeric,
 p_timing numeric,p_command uuid,p_actor uuid) returns jsonb
language sql set search_path='' as $$select private.manual_bat(p_game,p_team,p_action,p_x,p_y,p_timing,p_command,p_actor);$$;
create or replace function public.server_manual_abs(p_game uuid,p_team text,p_command uuid,p_actor uuid) returns jsonb
language sql set search_path='' as $$select private.manual_abs(p_game,p_team,p_command,p_actor);$$;
create or replace function public.server_manual_tick(p_game uuid) returns jsonb
language sql set search_path='' as $$select private.manual_tick(p_game);$$;
revoke all on function public.server_manual_pitch(uuid,text,numeric,numeric,numeric,text,uuid,uuid),
 public.server_manual_bat(uuid,text,text,numeric,numeric,numeric,uuid,uuid),
 public.server_manual_abs(uuid,text,uuid,uuid),public.server_manual_tick(uuid) from public,anon,authenticated;
grant execute on function public.server_manual_pitch(uuid,text,numeric,numeric,numeric,text,uuid,uuid),
 public.server_manual_bat(uuid,text,text,numeric,numeric,numeric,uuid,uuid),
 public.server_manual_abs(uuid,text,uuid,uuid),public.server_manual_tick(uuid) to service_role;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on all functions in schema private to service_role;