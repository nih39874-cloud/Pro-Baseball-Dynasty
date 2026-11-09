-- Resolve actual pregame opponent-specific lineup; rebuild automatically when a selected player was demoted.
create or replace function private.resolve_game_lineup(
 p_league uuid,p_timeline uuid,p_year integer,p_team text,p_opponent text)
returns jsonb language plpgsql set search_path='' as $$
declare saved public.coach_lineups%rowtype;resolved jsonb;
begin
 select * into saved from public.coach_lineups
 where league_id=p_league and timeline_id=p_timeline and season_year=p_year
   and team_id=p_team and opponent_team_id=p_opponent;
 if found and not saved.needs_review then
   begin
     perform private.validate_coach_lineup(p_league,p_team,saved.batting_order,saved.defense);
     return jsonb_build_object('batting_order',to_jsonb(saved.batting_order),
       'defense',saved.defense,'source',case when saved.is_custom then 'coach_custom' else 'coach_default' end,
       'opponent',p_opponent);
   exception when others then
     -- Never use an invalid lineup in a scheduled game. Preserve the coach's saved template for correction.
     null;
   end;
 end if;
 resolved:=private.default_coach_lineup(p_league,p_team);
 return resolved||jsonb_build_object('source','auto_fallback','opponent',p_opponent);
end;$$;
revoke all on function private.resolve_game_lineup(uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function private.resolve_game_lineup(uuid,uuid,integer,text,text) to service_role;

-- Apply the selected nine-batter order and store defensive assignments in game snapshots.
CREATE OR REPLACE FUNCTION private.simulate_game(p_game uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 g public.games%rowtype;
 batting text; fielding text; batter_ids bigint[]; batter_id bigint;
 home_lineup jsonb;away_lineup jsonb;
 batter_count integer[]:=array[0,0];
 v_home_score int:=0;v_away_score int:=0;
 inning int;v_last_inning int:=0;half int;outs int;pa int;seq int:=0; bidx int;
 b1 boolean;b2 boolean;b3 boolean; v_runs int; v_hit int; v_kind text;
 roll float8; skill float8; final_result jsonb;
begin
 select * into g from public.games where id=p_game for update;
 if not found then raise exception 'GAME_NOT_FOUND';end if;
 if g.phase='final' then return jsonb_build_object('home',g.home_score,'away',g.away_score);end if;
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
    roll:=random()+(50-skill)*0.0015;
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
      values(g.id,seq,'plate_appearance',jsonb_build_object('inning',inning,'half',case when half=0 then 'top' else 'bottom' end,'team',batting,'batter_id',batter_id,'result',v_kind,'runs',v_runs));
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
