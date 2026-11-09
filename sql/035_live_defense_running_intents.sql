-- Bounded server-side movement intentions, applied once to the next contacted ball.
-- This is discrete tactical input, not realtime 60Hz multiplayer movement physics.
create table if not exists public.match_motion_intents (
 game_id uuid not null references public.games(id) on delete cascade,
 league_id uuid not null references public.leagues(id),
 team_id text not null references public.teams(id),
 role text not null check(role in ('fielder','runner')),
 selected_position text,
 direction_x numeric(5,3) not null default 0 check(direction_x between -1 and 1),
 direction_z numeric(5,3) not null default 0 check(direction_z between -1 and 1),
 action text not null,
 atbat_key text not null,
 actor uuid,
 updated_at timestamptz not null default now(),
 primary key(game_id,team_id)
);
create table if not exists public.match_motion_commands (
 game_id uuid not null references public.games(id) on delete cascade,
 team_id text not null references public.teams(id),
 command_id uuid not null,
 created_at timestamptz not null default now(),
 primary key(game_id,team_id,command_id)
);
alter table public.match_motion_intents enable row level security;
alter table public.match_motion_commands enable row level security;
revoke all on public.match_motion_intents, public.match_motion_commands from public,anon,authenticated;
grant all on public.match_motion_intents,public.match_motion_commands to service_role;
create index if not exists idx_match_motion_time on public.match_motion_intents(game_id,updated_at desc);

create or replace function private.live_motion(
 p_game uuid,p_team text,p_role text,p_pos text,p_dx numeric,p_dz numeric,
 p_action text,p_command uuid,p_actor uuid,p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql set search_path='' as $$
declare sess public.match_sessions%rowtype;g public.games%rowtype;ctrl public.match_team_controls%rowtype;
 offense text;defense text;live_role text;key text;selected_player bigint;last_change timestamptz;
begin
 if p_command is null or p_actor is null then raise exception 'INVALID_COMMAND';end if;
 if p_dx is null or p_dz is null or p_dx not between -1 and 1 or p_dz not between -1 and 1 then raise exception 'INVALID_DIRECTION';end if;
 if p_role not in ('fielder','runner') then raise exception 'INVALID_ROLE';end if;
 if (p_role='fielder' and p_action not in ('move','catch','jump','dive','throw')) or
    (p_role='runner' and p_action not in ('run','hold','slide','return'))
 then raise exception 'INVALID_MOVEMENT_ACTION';end if;
 select * into sess from public.match_sessions where game_id=p_game for update;
 if not found or sess.completed_at is not null then raise exception 'MATCH_NOT_RUNNING';end if;
 select * into g from public.games where id=p_game;
 if g.phase<>'live' or not exists(
  select 1 from public.leagues l where l.id=g.league_id and l.clock_enabled and l.is_ready
   and l.active_timeline_id=g.timeline_id) then raise exception 'LEAGUE_PAUSED';end if;
 if p_team not in (g.home_team_id,g.away_team_id) then raise exception 'WRONG_TEAM';end if;
 select * into ctrl from public.match_team_controls where game_id=p_game and team_id=p_team for update;
 if not found or ctrl.active_mode<>'player' or ctrl.controlled_by is distinct from p_actor
    or ctrl.last_heartbeat_at is null or ctrl.last_heartbeat_at<p_now-interval '45 seconds'
 then raise exception 'PLAYER_NOT_IN_CONTROL';end if;
 offense:=case when sess.state->>'half'='top' then g.away_team_id else g.home_team_id end;
 defense:=case when sess.state->>'half'='top' then g.home_team_id else g.away_team_id end;
 live_role:=case when p_team=offense then 'runner' else 'fielder' end;
 if p_role<>live_role then raise exception 'WRONG_SIDE_OF_PLAY';end if;
 if p_role='fielder' then
  if p_pos not in ('P','C','1B','2B','3B','SS','LF','CF','RF') then raise exception 'INVALID_POSITION';end if;
  selected_player:=((sess.state->(case when p_team=g.home_team_id then 'home_lineup' else 'away_lineup' end))->'defense'->>p_pos)::bigint;
  if selected_player is null then raise exception 'FIELDER_NOT_IN_LINEUP';end if;
 else p_pos:=null;end if;
 key:=concat(coalesce(sess.state->>'inning','1'),':',sess.state->>'half',':',
   coalesce(sess.state->>(case when p_team=g.home_team_id then 'home_index' else 'away_index' end),'0'));
 if exists(select 1 from public.match_motion_commands where game_id=p_game and team_id=p_team and command_id=p_command)
 then return jsonb_build_object('replayed',true);end if;
 select updated_at into last_change from public.match_motion_intents
 where game_id=p_game and team_id=p_team and atbat_key=key;
 if last_change is not null and p_now<last_change+interval '300 milliseconds' then raise exception 'MOVEMENT_TOO_FAST';end if;
 insert into public.match_motion_commands(game_id,team_id,command_id,created_at)
 values(p_game,p_team,p_command,p_now);
 insert into public.match_motion_intents(game_id,league_id,team_id,role,selected_position,direction_x,direction_z,action,atbat_key,actor,updated_at)
 values(p_game,g.league_id,p_team,p_role,p_pos,p_dx,p_dz,p_action,key,p_actor,p_now)
 on conflict(game_id,team_id) do update set role=excluded.role,selected_position=excluded.selected_position,
  direction_x=excluded.direction_x,direction_z=excluded.direction_z,action=excluded.action,
  atbat_key=excluded.atbat_key,actor=excluded.actor,updated_at=excluded.updated_at;
 return jsonb_build_object('ok',true,'role',p_role,'position',p_pos,'action',p_action,'atbat_key',key);
end;$$;

-- Service-only wrapper: authenticated users call Edge Function; only service role can mutate.
create or replace function public.server_live_motion(
 p_game uuid,p_team text,p_role text,p_pos text,p_dx numeric,p_dz numeric,
 p_action text,p_command uuid,p_actor uuid)
returns jsonb language sql security definer set search_path='' as $$
 select private.live_motion(p_game,p_team,p_role,p_pos,p_dx,p_dz,p_action,p_command,p_actor,clock_timestamp());
$$;
revoke all on function public.server_live_motion(uuid,text,text,text,numeric,numeric,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.server_live_motion(uuid,text,text,text,numeric,numeric,text,uuid,uuid) to service_role;
revoke all on function private.live_motion(uuid,text,text,text,numeric,numeric,text,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function private.live_motion(uuid,text,text,text,numeric,numeric,text,uuid,uuid,timestamptz) to service_role;