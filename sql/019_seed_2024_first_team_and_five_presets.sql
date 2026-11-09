-- Starting 28-player squads are game-generated from 2024 FIRST team usage,
-- NOT historical 2024 Opening Day official roster registrations.
-- Initially 13 P + 15 non-P to permit all 9 defensive positions, DH and bench.
with source_scores as (
 select master_player_id,team_id,
  max(case when league_level='first' then coalesce((batting->>'PA')::integer,0) else 0 end) as first_pa,
  max(case when league_level='first' then coalesce((pitching->>'IP')::numeric,0) else 0 end) as first_ip,
  max(case when league_level='farm' then coalesce((batting->>'PA')::integer,0) else 0 end) as farm_pa,
  max(case when league_level='farm' then coalesce((pitching->>'IP')::numeric,0) else 0 end) as farm_ip
 from public.cpbl_season_reference where season_year=2024 group by master_player_id,team_id
), ranked as (
 select lp.league_id,lp.master_player_id,lp.team_id,m.primary_position,
  row_number() over(partition by lp.league_id,lp.team_id,
    case when m.primary_position='P' then 'pitchers' else 'hitters' end
    order by case when m.primary_position='P'
        then coalesce(ss.first_ip,0)*10+coalesce(ss.farm_ip,0)*.01
        else coalesce(ss.first_pa,0)+coalesce(ss.farm_pa,0)*.01 end desc,
      coalesce(lp.batting_rating,50)+coalesce(lp.pitching_rating,50) desc,lp.master_player_id
   ) as rank_in_role
 from public.league_players lp join public.players_master m on m.id=lp.master_player_id
 left join source_scores ss on ss.master_player_id=m.id and ss.team_id=lp.team_id
 where lp.team_id is not null and lp.roster_status='reserve'
)
update public.league_players lp set roster_status='active',roster_seed_source='2024 season usage estimated first-team 28',updated_at=now()
from ranked r where lp.league_id=r.league_id and lp.master_player_id=r.master_player_id
and r.rank_in_role <= case when r.primary_position='P' then 13 else 15 end;

-- 5 independent slots per team (all start from the same best-available automatic build).
-- Applying this to official does not activate its frozen season clock.
do $$
declare l record; t record;opp record; d jsonb; bat bigint[];
begin
 for l in select id,active_timeline_id,current_year from public.leagues loop
  for t in select id from public.teams loop
   d:=private.default_coach_lineup(l.id,t.id);
   select array_agg((v.value)::bigint order by v.ordinality) into bat
    from jsonb_array_elements_text(d->'batting_order') with ordinality as v(value,ordinality);
   for opp in select id from public.teams where id<>t.id loop
    insert into public.coach_lineups(league_id,timeline_id,season_year,team_id,opponent_team_id,batting_order,defense,is_custom,needs_review)
    values(l.id,l.active_timeline_id,l.current_year,t.id,opp.id,bat,d->'defense',false,false)
    on conflict (league_id,timeline_id,season_year,team_id,opponent_team_id) do nothing;
   end loop;
  end loop;
 end loop;
end $$;