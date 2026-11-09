-- At-bat authoritative live engine. This is not a low-latency 3D pitch physics replacement.
create or replace function private.live_step(p_game uuid,p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql set search_path='' as $$
declare
 sess public.match_sessions%rowtype;g public.games%rowtype;l public.leagues%rowtype;
 v_state jsonb;side text;fieldside text;batting_team text;fielding_team text;
 line jsonb;fld jsonb;arr jsonb;bat_idx int; batter bigint;pitcher bigint;fielder bigint;
 field_pos text;dist float8;spray float8;bat_skill float8;pitch_skill float8;def_skill float8;
 result text;roll float8; runs int:=0;v_hits int:=0;outs int;inning int;newinning int;
 half text;newhalf text; hs int;ascore int;b1 bigint;b2 bigint;b3 bigint;
 force_score int; seq_no bigint;state_finished boolean:=false;
 offense_tactic text;defense_tactic text;event jsonb;v_count integer; r record;
begin
 select * into sess from public.match_sessions where game_id=p_game for update;
 if not found then raise exception 'MATCH_NOT_STARTED';end if;
 if sess.completed_at is not null then return jsonb_build_object('finished',true,'version',sess.version);end if;
 select * into g from public.games where id=p_game for update;
 select * into l from public.leagues where id=g.league_id;
 if not l.clock_enabled or not l.is_ready or l.active_timeline_id<>g.timeline_id then return jsonb_build_object('paused',true);end if;
 if g.phase<>'live' then raise exception 'NOT_A_LIVE_GAME';end if;
 if p_now<g.scheduled_at then return jsonb_build_object('waiting',true);end if;
 v_state:=sess.state;
 half:=coalesce(v_state->>'half','top'); side:=case when half='top' then 'away' else 'home' end;
 fieldside:=case when half='top' then 'home' else 'away' end;
 batting_team:=case when side='home' then g.home_team_id else g.away_team_id end;
 fielding_team:=case when fieldside='home' then g.home_team_id else g.away_team_id end;
 line:=v_state->(side||'_lineup');fld:=v_state->(fieldside||'_lineup');
 bat_idx:=coalesce((v_state->>(side||'_index'))::int,0);
 arr:=line->'batting_order';
 if jsonb_array_length(arr)<>9 then raise exception 'BATTING_ORDER_INVALID';end if;
 batter:=(arr->>(bat_idx%9))::bigint;
 pitcher:=(fld->'defense'->>'P')::bigint;
 if batter is null or pitcher is null then raise exception 'MATCH_PLAYER_MISSING';end if;
 -- The server chooses a 2D landing sector. Real interactive batted-ball physics comes later.
 spray:=random()*90-45;dist:=random()*105+8;
 if dist<15 then field_pos:=case when abs(spray)<15 then 'P' else 'C' end;
 elsif dist>=62 then field_pos:=case when spray< -15 then 'LF' when spray>15 then 'RF' else 'CF' end;
 else field_pos:=case when spray< -25 then '3B' when spray<0 then 'SS' when spray<25 then '2B' else '1B' end;
 end if;
 fielder:=(fld->'defense'->>field_pos)::bigint;
 select coalesce(batting_rating,50) into bat_skill from public.league_players where league_id=g.league_id and master_player_id=batter;
 select coalesce(pitching_rating,50) into pitch_skill from public.league_players where league_id=g.league_id and master_player_id=pitcher;
 select coalesce(fielding_rating,50) into def_skill from public.league_players where league_id=g.league_id and master_player_id=fielder;
 bat_skill:=coalesce(bat_skill,50);pitch_skill:=coalesce(pitch_skill,50);def_skill:=coalesce(def_skill,50);
 offense_tactic:=coalesce(v_state->'tactics'->>side,'normal');
 defense_tactic:=coalesce(v_state->'tactics'->>fieldside,'normal');
 outs:=coalesce((v_state->>'outs')::int,0);inning:=coalesce((v_state->>'inning')::int,1);
 hs:=coalesce((v_state->>'home_score')::int,0);ascore:=coalesce((v_state->>'away_score')::int,0);
 b1:=nullif(v_state->'bases'->>0,'')::bigint;
 b2:=nullif(v_state->'bases'->>1,'')::bigint;
 b3:=nullif(v_state->'bases'->>2,'')::bigint;
 roll:=random()+(50-bat_skill)*.0015+(pitch_skill-50)*.0018+(def_skill-50)*.0004;
 if defense_tactic='infield_in' then roll:=roll+0.018;end if;
 if defense_tactic='intentional_walk' then roll:=-1;end if;
 if offense_tactic='bunt' then
   outs:=outs+1;result:='BUNT';
   if b3 is not null and outs<3 then runs:=runs+1;b3:=null;end if;
   if b2 is not null then b3:=b2;b2:=null;end if;
   if b1 is not null then b2:=b1;b1:=null;end if;
 elsif roll<0.075 then
   result:='BB';
   if b1 is not null then
     if b2 is not null then
       if b3 is not null then runs:=runs+1;end if;
       b3:=b2;
     end if;
     b2:=b1;
   end if;
   b1:=batter;
 elsif roll<0.25 then
   result:='1B';v_hits:=1;
   if b3 is not null then runs:=runs+1;end if;
   if b2 is not null then runs:=runs+1;end if;
   b3:=null;b2:=b1;b1:=batter;
 elsif roll<0.303 then
   result:='2B';v_hits:=1;
   if b3 is not null then runs:=runs+1;end if;
   if b2 is not null then runs:=runs+1;end if;
   b3:=b1;b2:=batter;b1:=null;
 elsif roll<0.310 then
   result:='3B';v_hits:=1;
   if b3 is not null then runs:=runs+1;end if;
   if b2 is not null then runs:=runs+1;end if;
   if b1 is not null then runs:=runs+1;end if;
   b3:=batter;b2:=null;b1:=null;
 elsif roll<0.343 then
   result:='HR';v_hits:=1;runs:=1;
   if b3 is not null then runs:=runs+1;end if;
   if b2 is not null then runs:=runs+1;end if;
   if b1 is not null then runs:=runs+1;end if;
   b1:=null;b2:=null;b3:=null;
 elsif roll<0.535 then result:='K';outs:=outs+1;
 else result:='OUT';outs:=outs+1;end if;
 if offense_tactic='steal' and b1 is not null and b2 is null and outs<3 and result not in('HR','3B') then
   -- Simplified coach stealing rule; deliberately not advertised as physical animation.
   if random()<0.67 then b2:=b1;b1:=null;
   else outs:=outs+1;b1:=null;end if;
 end if;
 if side='home' then hs:=hs+runs;else ascore:=ascore+runs;end if;
 v_state:=jsonb_set(v_state,array[side||'_index'],to_jsonb(bat_idx+1));
 v_state:=jsonb_set(v_state,array['tactics',side],to_jsonb('normal'::text));
 v_state:=jsonb_set(v_state,array['tactics',fieldside],to_jsonb('normal'::text));
 event:=jsonb_build_object('inning',inning,'half',half,'team',batting_team,'batter_id',batter,
  'pitcher_id',pitcher,'fielder_id',fielder,'field_position',field_pos,
  'spray_degrees',round(spray::numeric,2),'ball_distance_m',round(dist::numeric,2),
  'result',result,'runs',runs,'tactic',offense_tactic,'defense_tactic',defense_tactic);
 select coalesce(max(seq),0)+1 into seq_no from public.game_events where game_id=p_game;
 insert into public.game_events(game_id,seq,type,payload) values(p_game,seq_no,'live_plate_appearance',event);
 insert into public.player_season_stats(league_id,timeline_id,season_year,player_id,team_id,plate_appearances,hits,games_played)
 values(g.league_id,g.timeline_id,g.season_year,batter,batting_team,1,v_hits,0)
 on conflict(league_id,timeline_id,season_year,player_id) do update
 set plate_appearances=public.player_season_stats.plate_appearances+1,
     hits=public.player_season_stats.hits+excluded.hits;
 newhalf:=half;newinning:=inning;
 if half='bottom' and inning>=9 and hs>ascore then state_finished:=true;end if;
 if outs>=3 then
    if half='top' then
      if inning>=9 and hs>ascore then state_finished:=true;
      else newhalf:='bottom';end if;
    else
      if inning>=9 and (hs<>ascore or (inning>=12 and g.season_stage='regular') or inning>=20) then
        state_finished:=true;
        if inning>=20 and hs=ascore and g.season_stage<>'regular' then
          if random()<.5 then hs:=hs+1;else ascore:=ascore+1;end if;
        end if;
      else newhalf:='top';newinning:=inning+1;end if;
    end if;
    outs:=0;b1:=null;b2:=null;b3:=null;
 end if;
 v_state:=v_state||jsonb_build_object('inning',newinning,'half',newhalf,'outs',outs,
 'home_score',hs,'away_score',ascore,'bases',jsonb_build_array(b1,b2,b3),
 'between_atbats',true,'finished',state_finished,'last_result',event);
 update public.match_sessions set state=v_state,version=version+1,updated_at=p_now,
 last_step_at=p_now,completed_at=case when state_finished then p_now else null end where game_id=p_game;
 update public.games set game_state=v_state||jsonb_build_object('live_session',true),
 home_score=hs,away_score=ascore,version=version+1,updated_at=p_now,
 phase=case when state_finished then 'final' else 'live' end,
 completed_at=case when state_finished then p_now else null end where id=p_game;
 -- Requested modes take effect once the current batter has been resolved.
 update public.match_team_controls set active_mode=pending_mode,pending_mode=null,updated_at=p_now
 where game_id=p_game and pending_mode is not null;
 if state_finished then
    -- Count actual player appearances once; no empty-box score credit for reserves.
    update public.player_season_stats st set games_played=games_played+1
    where st.league_id=g.league_id and st.timeline_id=g.timeline_id and st.season_year=g.season_year
      and exists(select 1 from public.game_events ev
        where ev.game_id=g.id and ev.type='live_plate_appearance'
         and ev.payload->>'batter_id'=st.player_id::text);
    update public.team_finances set cash_ntd=cash_ntd+1800000,updated_at=p_now
    where league_id=g.league_id and team_id=g.home_team_id;
    insert into public.finance_ledger(league_id,timeline_id,season_year,team_id,amount_ntd,kind,memo)
    values(g.league_id,g.timeline_id,g.season_year,g.home_team_id,1800000,'ticket_estimate','主場票房示意估算（即時比賽結算）');
 end if;
 return jsonb_build_object('ok',true,'version',sess.version+1,'finished',state_finished,
  'event',event,'home_score',hs,'away_score',ascore);
end;$$;

-- Automatic fallback: a team whose heartbeat was lost is controlled by the simulation.
create or replace function private.live_tick(p_now timestamptz default clock_timestamp())
returns integer language plpgsql set search_path='' as $$
declare r record;c record;v_count integer:=0;k integer;v_result jsonb;
begin
 for r in select ms.game_id,g.scheduled_at from public.match_sessions ms
 join public.games g on g.id=ms.game_id
 join public.leagues l on l.id=ms.league_id
 where ms.completed_at is null and g.phase='live' and l.clock_enabled and l.is_ready
   and g.timeline_id=l.active_timeline_id and g.scheduled_at<=p_now
 order by ms.updated_at limit 15
 loop
  update public.match_team_controls
  set active_mode='auto',pending_mode=null,controlled_by=null,updated_at=p_now
  where game_id=r.game_id and active_mode<>'auto'
    and (last_heartbeat_at is null or last_heartbeat_at<p_now-interval '40 seconds');
  -- Process at most 10 plate appearances per minute so managers can react between cron ticks.
  for k in 1..10 loop
    v_result:=private.live_step(r.game_id,p_now);
    v_count:=v_count+1;
    exit when coalesce((v_result->>'finished')::boolean,false);
  end loop;
 end loop;
 return v_count;
end;$$;

create or replace function private.tick_all(p_now timestamptz default now()) returns jsonb
language plpgsql set search_path='' as $$
declare g text;o text;processed integer;
begin
 -- Scheduled auto games still run through their existing AI simulator. Live sessions are excluded by phase.
 g:=private.tick_league('gm',p_now);
 o:=private.tick_league('official',p_now);
 processed:=private.live_tick(p_now);
 return jsonb_build_object('gm',g,'official',o,'live_plate_appearances',processed);
end;$$;

revoke all on function private.live_step(uuid,timestamptz),private.live_tick(timestamptz) from public,anon,authenticated;
grant execute on function private.live_step(uuid,timestamptz),private.live_tick(timestamptz) to service_role;
revoke execute on function private.tick_all(timestamptz) from public,anon,authenticated;
grant execute on function private.tick_all(timestamptz) to service_role;