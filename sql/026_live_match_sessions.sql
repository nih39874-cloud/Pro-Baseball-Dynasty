-- Diamond Dynasty v0.6: server-authoritative at-bat live coaching and state synchronization.
-- Games are simulated at the at-bat level; real-time 3D projectile input is a separate unfinished system.
create table if not exists public.match_sessions (
  game_id uuid primary key references public.games(id) on delete cascade,
  league_id uuid not null references public.leagues(id),
  timeline_id uuid not null,
  season_year integer not null,
  state jsonb not null,
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_step_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists match_sessions_active on public.match_sessions(league_id,completed_at) where completed_at is null;
alter table public.match_sessions enable row level security;
drop policy if exists match_session_member_read on public.match_sessions;
create policy match_session_member_read on public.match_sessions for select to authenticated using (
  exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.league_id=match_sessions.league_id)
);
grant select on public.match_sessions to authenticated;
revoke insert,update,delete on public.match_sessions from anon,authenticated;

create table if not exists public.match_team_controls (
  game_id uuid not null references public.games(id) on delete cascade,
  league_id uuid not null references public.leagues(id),
  team_id text not null references public.teams(id),
  active_mode text not null default 'auto' check (active_mode in ('auto','coach','player')),
  pending_mode text check (pending_mode in ('auto','coach','player')),
  last_heartbeat_at timestamptz,
  controlled_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key(game_id,team_id)
);
alter table public.match_team_controls enable row level security;
drop policy if exists match_controls_member_read on public.match_team_controls;
create policy match_controls_member_read on public.match_team_controls for select to authenticated using (
  exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.league_id=match_team_controls.league_id)
);
grant select on public.match_team_controls to authenticated;
revoke insert,update,delete on public.match_team_controls from anon,authenticated;

create table if not exists public.match_coach_actions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  league_id uuid not null references public.leagues(id),
  team_id text not null references public.teams(id),
  action_type text not null,
  player_id bigint references public.players_master(id),
  payload jsonb not null default '{}'::jsonb,
  state_version bigint not null,
  created_at timestamptz not null default now(),
  issued_by uuid references auth.users(id),
  client_command_id uuid not null,
  unique(game_id,team_id,client_command_id)
);
create index if not exists match_actions_recent on public.match_coach_actions(game_id,created_at desc);
alter table public.match_coach_actions enable row level security;
drop policy if exists match_actions_member_read on public.match_coach_actions;
create policy match_actions_member_read on public.match_coach_actions for select to authenticated using (
  exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.league_id=match_coach_actions.league_id)
);
grant select on public.match_coach_actions to authenticated;
revoke insert,update,delete on public.match_coach_actions from anon,authenticated;

create or replace function private.live_start(p_game uuid,p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql set search_path='' as $$
declare g public.games%rowtype; l public.leagues%rowtype; h jsonb; a jsonb; v_state jsonb;
begin
 select * into g from public.games where id=p_game for update;
 if not found then raise exception 'GAME_NOT_FOUND'; end if;
 select * into l from public.leagues where id=g.league_id;
 if not l.clock_enabled or not l.is_ready or g.timeline_id<>l.active_timeline_id then raise exception 'LEAGUE_PAUSED_OR_STALE';end if;
 if g.phase='final' then raise exception 'GAME_ALREADY_FINAL';end if;
 if p_now<g.scheduled_at-interval '5 minutes' then raise exception 'TOO_EARLY_FOR_MATCH';end if;
 if g.phase='live' then
   select state into v_state from public.match_sessions where game_id=p_game;
   if v_state is null then raise exception 'LIVE_MATCH_STATE_MISSING';end if;
   return v_state;
 end if;
 if g.phase<>'scheduled' then raise exception 'INVALID_GAME_PHASE';end if;
 h:=private.resolve_game_lineup(g.league_id,g.timeline_id,g.season_year,g.home_team_id,g.away_team_id);
 a:=private.resolve_game_lineup(g.league_id,g.timeline_id,g.season_year,g.away_team_id,g.home_team_id);
 v_state:=jsonb_build_object('inning',1,'half','top','outs',0,'home_score',0,'away_score',0,
    'bases',jsonb_build_array(null,null,null),'home_index',0,'away_index',0,
    'home_lineup',h,'away_lineup',a,'tactics',jsonb_build_object('home','normal','away','normal'),
    'between_atbats',true,'last_result',jsonb_build_object('text','比賽開始'),'finished',false,
    'used_pitchers',jsonb_build_object('home',jsonb_build_array((h->'defense'->>'P')::bigint),
                                          'away',jsonb_build_array((a->'defense'->>'P')::bigint)),
    'used_hitters',jsonb_build_object('home',h->'batting_order','away',a->'batting_order'));
 insert into public.match_sessions(game_id,league_id,timeline_id,season_year,state,last_step_at)
 values(g.id,g.league_id,g.timeline_id,g.season_year,v_state,p_now);
 insert into public.match_team_controls(game_id,league_id,team_id) values
   (g.id,g.league_id,g.home_team_id),(g.id,g.league_id,g.away_team_id)
 on conflict(game_id,team_id) do nothing;
 update public.games set phase='live',game_state=v_state||jsonb_build_object('live_session',true),version=version+1,updated_at=p_now where id=g.id;
 return v_state;
end;$$;

-- Toggle is deferred until the active at-bat ends. GM can control either team in GM league,
-- but the Edge API must verify its membership. Normal users can only control their own team.
create or replace function private.live_control(p_game uuid,p_team text,p_mode text,p_actor uuid,
 p_now timestamptz default clock_timestamp()) returns jsonb language plpgsql set search_path='' as $$
declare sess public.match_sessions%rowtype; c public.match_team_controls%rowtype;g public.games%rowtype;actual text;
begin
 if p_mode not in('auto','coach','player') then raise exception 'INVALID_MODE';end if;
 if p_mode='player' then raise exception 'PLAYER_3D_MODE_NOT_READY';end if;
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
end;$$;

create or replace function private.live_heartbeat(p_game uuid,p_team text,p_actor uuid,
 p_now timestamptz default clock_timestamp()) returns boolean language plpgsql set search_path='' as $$
begin
 update public.match_team_controls set last_heartbeat_at=p_now,controlled_by=p_actor,updated_at=p_now
 where game_id=p_game and team_id=p_team and exists (
 select 1 from public.match_sessions s where s.game_id=p_game and s.completed_at is null);
 return found;
end;$$;

create or replace function private.live_coach_command(p_game uuid,p_team text,p_kind text,p_player bigint,
 p_command_id uuid,p_actor uuid,p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql set search_path='' as $$
declare sess public.match_sessions%rowtype;g public.games%rowtype;c public.match_team_controls%rowtype;
 side text; rival text; bat jsonb; d jsonb; current_player bigint;pos text;slot int;
 lineup jsonb;v jsonb;used jsonb;result jsonb;existing uuid;entry jsonb;
begin
 select * into sess from public.match_sessions where game_id=p_game for update;
 if not found or sess.completed_at is not null then raise exception 'MATCH_NOT_RUNNING';end if;
 select * into g from public.games where id=p_game;
 if p_team=g.home_team_id then side:='home';rival:='away';
 elsif p_team=g.away_team_id then side:='away';rival:='home';
 else raise exception 'WRONG_TEAM';end if;
 select * into c from public.match_team_controls where game_id=p_game and team_id=p_team;
 if c.active_mode<>'coach' or c.last_heartbeat_at is null or c.last_heartbeat_at<p_now-interval '45 seconds' then
 raise exception 'COACH_NOT_ACTIVE';end if;
 select id into existing from public.match_coach_actions where game_id=p_game and team_id=p_team and client_command_id=p_command_id;
 if existing is not null then return jsonb_build_object('ok',true,'replayed',true,'action_id',existing);end if;
 if not coalesce((sess.state->>'between_atbats')::boolean,false) then raise exception 'ATBAT_IN_PROGRESS';end if;
 lineup:=sess.state->(side||'_lineup'); bat:=lineup->'batting_order';d:=lineup->'defense';
 if p_kind in ('change_pitcher','pinch_hitter') then
  if p_player is null or not exists(select 1 from public.league_players lp
     where lp.league_id=g.league_id and lp.team_id=p_team and lp.master_player_id=p_player and lp.roster_status='active')
  then raise exception 'SUBSTITUTE_NOT_ON_FIRST_TEAM';end if;
 end if;
 if p_kind='change_pitcher' then
   if (sess.state->>'half')=(case when side='home' then 'bottom' else 'top' end) then raise exception 'CHANGE_PITCHER_ONLY_WHILE_FIELDING';end if;
   if not exists(select 1 from public.players_master pm where pm.id=p_player and pm.primary_position='P') then raise exception 'SUBSTITUTE_NOT_A_PITCHER';end if;
   if ((sess.state->'used_pitchers'->side) @> jsonb_build_array(p_player)) then raise exception 'PITCHER_ALREADY_USED';end if;
   if (bat @> jsonb_build_array(p_player)) then raise exception 'PITCHER_ALREADY_BATTING';end if;
   d:=jsonb_set(d,'{P}',to_jsonb(p_player),true);
   lineup:=jsonb_set(lineup,'{defense}',d);
   sess.state:=jsonb_set(sess.state,array[side||'_lineup'],lineup);
   used:=coalesce(sess.state->'used_pitchers'->side,'[]'::jsonb)||jsonb_build_array(p_player);
   sess.state:=jsonb_set(sess.state,array['used_pitchers',side],used);
 elsif p_kind='pinch_hitter' then
   if exists(select 1 from public.players_master pm where pm.id=p_player and pm.primary_position='P') then raise exception 'PITCHER_CANNOT_PINCH_HIT';end if;
   if (coalesce(sess.state->'used_hitters'->side,'[]'::jsonb) @> jsonb_build_array(p_player)) then raise exception 'HITTER_ALREADY_USED';end if;
   if exists(select 1 from jsonb_array_elements_text(bat) as x(v) where x.v::bigint=p_player) then
    raise exception 'BATTER_ALREADY_IN_LINEUP';end if;
   if (d->>'P')::bigint=p_player then raise exception 'PITCHER_CANNOT_PINCH_HIT';end if;
   -- Only current offensive side can pinch hit.
   if (sess.state->>'half') <> (case when side='home' then 'bottom' else 'top' end) then
    raise exception 'CANNOT_PINCH_HIT_WHILE_FIELDING';end if;
   slot:=coalesce((sess.state->>(side||'_index'))::int,0)%9;
   current_player:=(bat->>slot)::bigint;
   bat:=jsonb_set(bat,array[slot::text],to_jsonb(p_player));
   -- If the removed hitter was also in the field, the replacement inherits that position.
   for pos,entry in select key,value from jsonb_each(d) loop
    if entry::text=to_jsonb(current_player)::text then d:=jsonb_set(d,array[pos],to_jsonb(p_player));end if;
   end loop;
   lineup:=jsonb_set(jsonb_set(lineup,'{batting_order}',bat),'{defense}',d);
   sess.state:=jsonb_set(sess.state,array[side||'_lineup'],lineup);
   used:=coalesce(sess.state->'used_hitters'->side,'[]'::jsonb)||jsonb_build_array(p_player);
   sess.state:=jsonb_set(sess.state,array['used_hitters',side],used);
 elsif p_kind in('bunt','steal','infield_in','intentional_walk','normal') then
   if p_kind in('bunt','steal') and (sess.state->>'half')<>(case when side='home' then 'bottom' else 'top' end) then
     raise exception 'OFFENSE_TACTIC_ONLY';end if;
   if p_kind in('infield_in','intentional_walk') and (sess.state->>'half')=(case when side='home' then 'bottom' else 'top' end) then
     raise exception 'DEFENSE_TACTIC_ONLY';end if;
   sess.state:=jsonb_set(sess.state,array['tactics',side],to_jsonb(p_kind));
 else raise exception 'UNKNOWN_COACH_COMMAND';end if;
 -- Verify final fielding card is legal (pinch hitter substitution may replace a defender).
 perform private.validate_coach_lineup(g.league_id,p_team,
  array(select value::bigint from jsonb_array_elements_text(sess.state->(side||'_lineup')->'batting_order') as x(value)),
  sess.state->(side||'_lineup')->'defense');
 update public.match_sessions set state=sess.state,version=version+1,updated_at=p_now where game_id=p_game;
 update public.games set game_state=sess.state||jsonb_build_object('live_session',true),
  version=version+1,updated_at=p_now where id=p_game;
 insert into public.match_coach_actions(game_id,league_id,team_id,action_type,player_id,
  payload,state_version,issued_by,client_command_id)
 values(p_game,g.league_id,p_team,p_kind,p_player,jsonb_build_object('side',side),sess.version+1,p_actor,p_command_id);
 return jsonb_build_object('ok',true,'version',sess.version+1,'kind',p_kind,'player_id',p_player);
end;$$;

-- service-role only callable functions under the exposed public namespace. Edge checks membership.
create or replace function public.server_live_start(p_game uuid) returns jsonb
language sql set search_path='' as $$ select private.live_start(p_game); $$;
create or replace function public.server_live_control(p_game uuid,p_team text,p_mode text,p_actor uuid)
returns jsonb language sql set search_path='' as $$ select private.live_control(p_game,p_team,p_mode,p_actor); $$;
create or replace function public.server_live_heartbeat(p_game uuid,p_team text,p_actor uuid)
returns boolean language sql set search_path='' as $$ select private.live_heartbeat(p_game,p_team,p_actor); $$;
create or replace function public.server_live_coach_command(p_game uuid,p_team text,p_kind text,p_player bigint,p_command_id uuid,p_actor uuid)
returns jsonb language sql set search_path='' as $$ select private.live_coach_command(p_game,p_team,p_kind,p_player,p_command_id,p_actor); $$;
revoke all on function public.server_live_start(uuid) from public,anon,authenticated;
revoke all on function public.server_live_control(uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.server_live_heartbeat(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.server_live_coach_command(uuid,text,text,bigint,uuid,uuid) from public,anon,authenticated;
grant execute on function public.server_live_start(uuid),public.server_live_control(uuid,text,text,uuid),
 public.server_live_heartbeat(uuid,text,uuid),public.server_live_coach_command(uuid,text,text,bigint,uuid,uuid) to service_role;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on all functions in schema private to service_role;

-- This project already exposes 'games' through its realtime publication; add the live session table.
do $$begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='match_sessions') then
    alter publication supabase_realtime add table public.match_sessions;
  end if;
end$$;