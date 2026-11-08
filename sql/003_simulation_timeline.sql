-- Scheduled server simulation, GM time branches and controlled financial writes.
-- No publicly callable mutation functions: wrappers allow only service_role.
alter table public.leagues add column if not exists is_ready boolean not null default false;
alter table public.playoff_series add column if not exists next_game_number integer not null default 1;

create or replace function private.simulate_game(p_game uuid) returns jsonb
language plpgsql set search_path='' as $$
declare
 g public.games%rowtype;
 batting text; fielding text; batter_ids bigint[]; batter_id bigint;
 batter_count integer[]:=array[0,0];
 v_home_score int:=0;v_away_score int:=0;
 inning int;v_last_inning int:=0;half int;outs int;pa int;seq int:=0; bidx int;
 b1 boolean;b2 boolean;b3 boolean; v_runs int; v_hit int; v_kind text;
 roll float8; skill float8; final_result jsonb;
begin
 select * into g from public.games where id=p_game for update;
 if not found then raise exception 'GAME_NOT_FOUND';end if;
 if g.phase='final' then return jsonb_build_object('home',g.v_home_score,'away',g.v_away_score);end if;
 if g.phase not in('scheduled','live') then raise exception 'GAME_NOT_SIMULATABLE';end if;
 for inning in 1..20 loop
  v_last_inning:=inning;
  for half in 0..1 loop
   -- Home already ahead after the visitor's final scheduled half inning.
   if half=1 and inning>=9 and v_home_score>v_away_score then exit;end if;
   batting:=case when half=0 then g.away_team_id else g.home_team_id end;
   fielding:=case when half=0 then g.home_team_id else g.away_team_id end;
   select array_agg(master_player_id order by coalesce(batting_rating,45) desc,master_player_id) into batter_ids
     from public.league_players where league_id=g.league_id and team_id=batting and roster_status in('active','reserve');
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
   game_state=jsonb_build_object('completed','server_auto','innings',v_last_inning,'plate_appearances',seq,'tie',v_home_score=v_away_score),
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
end;$$;

-- Creation of a compact branch checkpoint; future histories are kept as separate timelines.
create or replace function private.gm_checkpoint(p_league uuid,p_label text default null) returns uuid
language plpgsql set search_path='' as $$
declare l public.leagues%rowtype;snap jsonb;id uuid;
begin
 select * into l from public.leagues where id=p_league for update;
 if l.kind<>'gm' then raise exception 'GM_ONLY';end if;
 snap:=jsonb_build_object('year',l.current_year,'phase',l.season_phase,'label',coalesce(p_label,'GM checkpoint'),
   'funds',(select coalesce(jsonb_agg(jsonb_build_object('team_id',team_id,'cash_ntd',cash_ntd)),'[]'::jsonb) from public.team_finances where league_id=p_league),
   'players',(select coalesce(jsonb_agg(to_jsonb(lp)),'[]'::jsonb) from public.league_players lp where lp.league_id=p_league));
 insert into public.season_snapshots(league_id,timeline_id,season_year,snapshot)
 values(p_league,l.active_timeline_id,l.current_year,snap) returning public.season_snapshots.id into id;
 return id;
end;$$;

create or replace function private.gm_adjust_funds(p_league uuid,p_team text,p_funds bigint,p_actor uuid)
returns bigint language plpgsql set search_path='' as $$
declare l public.leagues%rowtype;old_funds bigint;
begin
 if p_funds<0 or p_funds>100000000000000 then raise exception 'INVALID_AMOUNT';end if;
 select * into l from public.leagues where id=p_league and kind='gm' for update;
 if not found then raise exception 'GM_ONLY';end if;
 select cash_ntd into old_funds from public.team_finances where league_id=p_league and team_id=p_team for update;
 if not found then raise exception 'TEAM_NOT_FOUND';end if;
 update public.team_finances set cash_ntd=p_funds,updated_at=now() where league_id=p_league and team_id=p_team;
 insert into public.finance_ledger(league_id,timeline_id,season_year,team_id,amount_ntd,kind,memo,actor_user_id)
 values(p_league,l.active_timeline_id,l.current_year,p_team,p_funds-old_funds,'gm_adjust','GM 手動設定資金',p_actor);
 return p_funds;
end;$$;

-- GM advance reuses server engine; does not affect the official league.
create or replace function private.gm_advance_year(p_league uuid) returns integer
language plpgsql set search_path='' as $$
declare l public.leagues%rowtype;g record;
begin
 select * into l from public.leagues where id=p_league and kind='gm' for update;
 if not found then raise exception 'GM_ONLY';end if;
 perform private.gm_checkpoint(p_league,'快轉前');
 perform private.schedule_regular(p_league,l.current_year,l.season_anchor_at,l.active_timeline_id);
 for g in select id from public.games where league_id=p_league and timeline_id=l.active_timeline_id and season_year=l.current_year and season_stage='regular' and phase<>'final' order by scheduled_at loop
   perform private.simulate_game(g.id);
 end loop;
 update public.leagues set current_year=current_year+1,season_anchor_at=season_anchor_at+interval '7 days',season_phase='pending' where id=p_league;
 perform private.gm_checkpoint(p_league,'快轉後');
 return l.current_year+1;
end;$$;

-- Rewind any existing snapshot without erasing other timelines. New active timeline branches.
create or replace function private.gm_rewind(p_league uuid,p_year integer) returns uuid
language plpgsql set search_path='' as $$
declare l public.leagues%rowtype;sp public.season_snapshots%rowtype;v_new uuid:=gen_random_uuid(); rec record;
begin
 select * into l from public.leagues where id=p_league and kind='gm' for update;
 if not found then raise exception 'GM_ONLY';end if;
 select * into sp from public.season_snapshots where league_id=p_league and season_year=p_year order by created_at desc limit 1;
 if not found then raise exception 'SNAPSHOT_NOT_FOUND';end if;
 perform private.gm_checkpoint(p_league,'回溯前保留');
 update public.leagues set current_year=p_year,season_phase='pending',active_timeline_id=v_new,
    season_anchor_at=private.next_tuesday_0800(now()) where id=p_league;
 for rec in select * from jsonb_to_recordset(sp.snapshot->'funds') as x(team_id text,cash_ntd bigint) loop
   update public.team_finances set cash_ntd=rec.cash_ntd,updated_at=now() where league_id=p_league and team_id=rec.team_id;
 end loop;
 delete from public.league_players where league_id=p_league;
 insert into public.league_players(id,league_id,master_player_id,team_id,roster_status,monthly_salary_ntd,contract_years,fa_service_seasons,batting_rating,pitching_rating,fielding_rating)
 select gen_random_uuid(),p_league,x.master_player_id,x.team_id,x.roster_status,x.monthly_salary_ntd,x.contract_years,x.fa_service_seasons,x.batting_rating,x.pitching_rating,x.fielding_rating
 from jsonb_to_recordset(sp.snapshot->'players') as x(master_player_id bigint,team_id text,roster_status text,monthly_salary_ntd bigint,contract_years int,fa_service_seasons numeric,batting_rating numeric,pitching_rating numeric,fielding_rating numeric);
 perform private.gm_checkpoint(p_league,'平行時間線開端');
 return v_new;
end;$$;

-- Public RPC wrappers are only executable with the service role; Edge function does authentication.
create or replace function public.server_gm_funds(p_league uuid,p_team text,p_amount bigint,p_actor uuid) returns bigint
language sql security definer set search_path='' as $$ select private.gm_adjust_funds(p_league,p_team,p_amount,p_actor); $$;
create or replace function public.server_gm_advance(p_league uuid) returns integer
language sql security definer set search_path='' as $$ select private.gm_advance_year(p_league); $$;
create or replace function public.server_gm_rewind(p_league uuid,p_year integer) returns uuid
language sql security definer set search_path='' as $$ select private.gm_rewind(p_league,p_year); $$;

revoke execute on function public.server_gm_funds(uuid,text,bigint,uuid),public.server_gm_advance(uuid),public.server_gm_rewind(uuid,integer) from public,anon,authenticated;
grant execute on function public.server_gm_funds(uuid,text,bigint,uuid),public.server_gm_advance(uuid),public.server_gm_rewind(uuid,integer) to service_role;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on all functions in schema private to service_role;
