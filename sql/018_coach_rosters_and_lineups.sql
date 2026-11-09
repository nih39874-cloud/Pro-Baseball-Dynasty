-- Diamond Dynasty: sourced positions, opponent-specific first-team lineups and real-time demotion cooldown
-- 2024 CPBL: 28 first-team active; user-specific mechanic: 4 real hours after demotion.

create table if not exists public.player_position_2024 (
  master_player_id bigint not null references public.players_master(id) on delete cascade,
  league_level text not null check (league_level in ('first','farm')),
  team_id text not null references public.teams(id),
  position text not null check (position in ('P','C','1B','2B','3B','SS','LF','CF','RF')),
  games integer not null default 0 check (games>=0),
  putouts integer not null default 0,
  assists integer not null default 0,
  errors integer not null default 0,
  source_url text not null default 'https://github.com/ldkrsi/cpbl-opendata',
  primary key (master_player_id, league_level, team_id, position)
);
alter table public.player_position_2024 enable row level security;
create policy player_position_ref_read on public.player_position_2024
  for select to authenticated using (true);
grant select on public.player_position_2024 to authenticated;

alter table public.league_players
  add column if not exists promotion_available_at timestamptz,
  add column if not exists roster_changed_at timestamptz,
  add column if not exists roster_seed_source text;

create table if not exists public.coach_lineups (
  league_id uuid not null references public.leagues(id),
  timeline_id uuid not null,
  season_year integer not null,
  team_id text not null references public.teams(id),
  opponent_team_id text not null references public.teams(id),
  batting_order bigint[] not null,
  defense jsonb not null,
  is_custom boolean not null default false,
  needs_review boolean not null default false,
  saved_by uuid references auth.users(id),
  saved_at timestamptz not null default now(),
  primary key (league_id,timeline_id,season_year,team_id,opponent_team_id),
  check (team_id<>opponent_team_id),
  check (cardinality(batting_order)=9),
  check (jsonb_typeof(defense)='object')
);
create index if not exists coach_lineups_lookup on public.coach_lineups(league_id,team_id,opponent_team_id,season_year);
alter table public.coach_lineups enable row level security;
create policy coach_lineups_members_read on public.coach_lineups
  for select to authenticated using (
    exists(select 1 from public.memberships m where m.user_id=(select auth.uid())
      and m.league_id=coach_lineups.league_id
      and (m.role='gm' or m.team_id=coach_lineups.team_id))
  );
grant select on public.coach_lineups to authenticated;

create table if not exists public.roster_move_logs (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id),
  timeline_id uuid not null,
  season_year integer not null,
  team_id text not null references public.teams(id),
  master_player_id bigint not null references public.players_master(id),
  old_status text not null,
  new_status text not null,
  changed_at timestamptz not null default now(),
  promotion_available_at timestamptz,
  changed_by uuid references auth.users(id)
);
create index if not exists roster_move_history on public.roster_move_logs(league_id,team_id,changed_at desc);
alter table public.roster_move_logs enable row level security;
create policy roster_move_team_read on public.roster_move_logs
  for select to authenticated using (
    exists(select 1 from public.memberships m where m.user_id=(select auth.uid())
       and m.league_id=roster_move_logs.league_id
       and (m.role='gm' or m.team_id=roster_move_logs.team_id))
  );
grant select on public.roster_move_logs to authenticated;

-- All mutations are invoker functions in private schema, reached only by service-role API.
create or replace function private.validate_coach_lineup(
  p_league uuid,p_team text,p_order bigint[],p_defense jsonb)
returns void language plpgsql set search_path='' as $$
declare v_ids bigint[];v_name text;v_value text;v_count integer;
begin
  if cardinality(p_order)<>9 or exists(select 1 from unnest(p_order) u where u is null)
     or (select count(distinct u) from unnest(p_order) u)<>9
  then raise exception 'INVALID_BATTING_ORDER'; end if;
  select count(*) into v_count from public.league_players lp
   where lp.league_id=p_league and lp.team_id=p_team and lp.roster_status='active'
     and lp.master_player_id=any(p_order);
  if v_count<>9 then raise exception 'BATTING_PLAYER_NOT_ON_FIRST_TEAM'; end if;
  if p_defense is null or jsonb_typeof(p_defense)<>'object'
     or (select count(*) from jsonb_object_keys(p_defense))<>9
  then raise exception 'INVALID_DEFENSE'; end if;
  foreach v_name in array array['P','C','1B','2B','3B','SS','LF','CF','RF'] loop
    v_value:=p_defense->>v_name;
    if v_value is null or v_value !~ '^[1-9][0-9]*$' then
      raise exception 'MISSING_OR_INVALID_POSITION_%',v_name;
    end if;
  end loop;
  select array_agg(value::bigint) into v_ids from jsonb_each_text(p_defense);
  if cardinality(v_ids)<>9 or (select count(distinct p) from unnest(v_ids) p)<>9
  then raise exception 'DUPLICATE_DEFENDER';end if;
  select count(*) into v_count from public.league_players lp
   where lp.league_id=p_league and lp.team_id=p_team and lp.roster_status='active'
     and lp.master_player_id=any(v_ids);
  if v_count<>9 then raise exception 'DEFENDER_NOT_ON_FIRST_TEAM';end if;
  if (p_defense->>'P')::bigint=any(p_order) then raise exception 'DH_LINEUP_PITCHER_MUST_NOT_BAT';end if;
  foreach v_name in array array['C','1B','2B','3B','SS','LF','CF','RF'] loop
    if not ((p_defense->>v_name)::bigint=any(p_order)) then
      raise exception 'DEFENDER_MISSING_FROM_BATTING_ORDER_%',v_name;
    end if;
  end loop;
end;$$;

create or replace function private.default_coach_lineup(p_league uuid,p_team text)
returns jsonb language plpgsql set search_path='' as $$
declare d jsonb:='{}'::jsonb;v_pos text;v_selected bigint[]:='{}'::bigint[];
  v_id bigint;v_dh bigint;v_pitch bigint;v_order bigint[];
begin
  foreach v_pos in array array['C','1B','2B','3B','SS','LF','CF','RF'] loop
    select lp.master_player_id into v_id from public.league_players lp
      left join public.player_position_2024 pr
        on pr.master_player_id=lp.master_player_id and pr.position=v_pos
      join public.players_master pm on pm.id=lp.master_player_id
     where lp.league_id=p_league and lp.team_id=p_team and lp.roster_status='active'
       and not lp.master_player_id=any(v_selected)
       and coalesce(pm.primary_position,'')<>'P'
     group by lp.master_player_id,lp.batting_rating,pm.primary_position
     order by coalesce(sum(case when pr.league_level='first' then pr.games*3 else pr.games end),0) desc,
       (pm.primary_position=v_pos) desc,coalesce(lp.batting_rating,50) desc,lp.master_player_id
     limit 1;
    if v_id is null then raise exception 'INSUFFICIENT_FIELDERS_%',v_pos;end if;
    v_selected:=array_append(v_selected,v_id);
    d:=jsonb_set(d,array[v_pos],to_jsonb(v_id));
  end loop;
  select lp.master_player_id into v_dh from public.league_players lp
    join public.players_master pm on pm.id=lp.master_player_id
   where lp.league_id=p_league and lp.team_id=p_team and lp.roster_status='active'
     and not lp.master_player_id=any(v_selected) and coalesce(pm.primary_position,'')<>'P'
   order by coalesce(lp.batting_rating,50) desc,lp.master_player_id limit 1;
  if v_dh is null then raise exception 'INSUFFICIENT_DH';end if;
  v_selected:=array_append(v_selected,v_dh);
  select lp.master_player_id into v_pitch from public.league_players lp
    join public.players_master pm on pm.id=lp.master_player_id
   where lp.league_id=p_league and lp.team_id=p_team and lp.roster_status='active'
      and not lp.master_player_id=any(v_selected) and pm.primary_position='P'
   order by coalesce(lp.pitching_rating,50) desc,lp.master_player_id limit 1;
  if v_pitch is null then raise exception 'INSUFFICIENT_PITCHER';end if;
  d:=jsonb_set(d,array['P'],to_jsonb(v_pitch));
  select array_agg(lp.master_player_id order by coalesce(lp.batting_rating,50) desc,lp.master_player_id)
    into v_order from public.league_players lp
   where lp.league_id=p_league and lp.master_player_id=any(v_selected);
  perform private.validate_coach_lineup(p_league,p_team,v_order,d);
  return jsonb_build_object('batting_order',to_jsonb(v_order),'defense',d,'source','auto');
end;$$;

create or replace function private.save_coach_lineup(
 p_league uuid,p_team text,p_opponent text,p_order bigint[],p_defense jsonb,p_actor uuid default null)
returns jsonb language plpgsql set search_path='' as $$
declare l public.leagues%rowtype;
begin
  select * into l from public.leagues where id=p_league for update;
  if not found then raise exception 'LEAGUE_NOT_FOUND';end if;
  if p_opponent=p_team or not exists(select 1 from public.teams where id=p_opponent)
     or not exists(select 1 from public.teams where id=p_team)
  then raise exception 'INVALID_OPPONENT';end if;
  perform private.validate_coach_lineup(p_league,p_team,p_order,p_defense);
  insert into public.coach_lineups(league_id,timeline_id,season_year,team_id,opponent_team_id,
    batting_order,defense,is_custom,needs_review,saved_by,saved_at)
  values(l.id,l.active_timeline_id,l.current_year,p_team,p_opponent,p_order,p_defense,true,false,p_actor,now())
  on conflict(league_id,timeline_id,season_year,team_id,opponent_team_id)
  do update set batting_order=excluded.batting_order,defense=excluded.defense,
    is_custom=true,needs_review=false,saved_by=excluded.saved_by,saved_at=now();
  return jsonb_build_object('ok',true,'opponent',p_opponent,'batting_order',to_jsonb(p_order),'defense',p_defense);
end;$$;

create or replace function private.move_player_level(
 p_league uuid,p_team text,p_player bigint,p_to text,p_actor uuid default null)
returns jsonb language plpgsql set search_path='' as $$
declare l public.leagues%rowtype; lp public.league_players%rowtype;v_now timestamptz:=clock_timestamp();v_count int;v_available timestamptz;
begin
  select * into l from public.leagues where id=p_league for update;
  if not found then raise exception 'LEAGUE_NOT_FOUND';end if;
  if p_to not in ('active','reserve') then raise exception 'INVALID_LEVEL';end if;
  select * into lp from public.league_players where league_id=p_league and master_player_id=p_player for update;
  if not found or lp.team_id is distinct from p_team then raise exception 'PLAYER_NOT_ON_TEAM';end if;
  if lp.roster_status=p_to then raise exception 'PLAYER_ALREADY_AT_LEVEL';end if;
  if lp.roster_status not in ('active','reserve') then raise exception 'PLAYER_NOT_ELIGIBLE_FOR_LEVEL_CHANGE';end if;
  if exists(select 1 from public.games g where g.league_id=p_league and g.timeline_id=l.active_timeline_id
   and g.phase='live' and p_team in (g.home_team_id,g.away_team_id))
  then raise exception 'TEAM_HAS_LIVE_GAME';end if;
  if p_to='active' then
    if lp.promotion_available_at>v_now then
      raise exception 'PROMOTION_COOLDOWN_UNTIL_%',to_char(lp.promotion_available_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"');
    end if;
    select count(*) into v_count from public.league_players
      where league_id=p_league and team_id=p_team and roster_status='active';
    if v_count>=28 then raise exception 'FIRST_TEAM_LIMIT_28';end if;
    v_available:=null;
  else
    v_available:=v_now+interval '4 hours';
  end if;
  update public.league_players set roster_status=p_to,promotion_available_at=v_available,
      roster_changed_at=v_now,updated_at=v_now
    where league_id=p_league and master_player_id=p_player;
  if p_to='reserve' then
    update public.coach_lineups cl set needs_review=true
      where cl.league_id=p_league and cl.timeline_id=l.active_timeline_id
        and cl.season_year=l.current_year and cl.team_id=p_team
        and (p_player=any(cl.batting_order) or exists(
          select 1 from jsonb_each_text(cl.defense) entry where entry.value::bigint=p_player));
  end if;
  insert into public.roster_move_logs(league_id,timeline_id,season_year,team_id,
    master_player_id,old_status,new_status,changed_at,promotion_available_at,changed_by)
  values(p_league,l.active_timeline_id,l.current_year,p_team,p_player,lp.roster_status,p_to,v_now,v_available,p_actor);
  return jsonb_build_object('player_id',p_player,'previous',lp.roster_status,'current',p_to,
    'promotion_available_at',v_available,'changed_at',v_now);
end;$$;

-- Only privileged Edge API roles may call these functions.
revoke all on function private.validate_coach_lineup(uuid,text,bigint[],jsonb) from public,anon,authenticated;
revoke all on function private.default_coach_lineup(uuid,text) from public,anon,authenticated;
revoke all on function private.save_coach_lineup(uuid,text,text,bigint[],jsonb,uuid) from public,anon,authenticated;
revoke all on function private.move_player_level(uuid,text,bigint,text,uuid) from public,anon,authenticated;
grant execute on function private.validate_coach_lineup(uuid,text,bigint[],jsonb) to service_role;
grant execute on function private.default_coach_lineup(uuid,text) to service_role;
grant execute on function private.save_coach_lineup(uuid,text,text,bigint[],jsonb,uuid) to service_role;
grant execute on function private.move_player_level(uuid,text,bigint,text,uuid) to service_role;