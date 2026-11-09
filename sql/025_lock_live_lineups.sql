-- Prevent changes to an active game's starting card; in-game substitutions are a separate control path.
CREATE OR REPLACE FUNCTION private.save_coach_lineup(p_league uuid, p_team text, p_opponent text, p_order bigint[], p_defense jsonb, p_actor uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare l public.leagues%rowtype;
begin
  select * into l from public.leagues where id=p_league for update;
  if not found then raise exception 'LEAGUE_NOT_FOUND';end if;
  if exists (select 1 from public.games g
    where g.league_id=p_league and g.timeline_id=l.active_timeline_id
      and g.season_year=l.current_year and g.phase='live'
      and ((g.home_team_id=p_team and g.away_team_id=p_opponent)
        or (g.away_team_id=p_team and g.home_team_id=p_opponent)))
  then raise exception 'PREGAME_LINEUP_LOCKED_DURING_LIVE_GAME';end if;
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
end;$function$
;