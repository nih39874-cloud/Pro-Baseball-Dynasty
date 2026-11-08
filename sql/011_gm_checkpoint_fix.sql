-- Remove checkpoint variable/column ambiguity before GM season fast-forward.
CREATE OR REPLACE FUNCTION private.gm_checkpoint(p_league uuid, p_label text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare l public.leagues%rowtype;snap jsonb;v_checkpoint_id uuid;
begin
 select * into l from public.leagues where public.leagues.id=p_league for update;
 if l.kind<>'gm' then raise exception 'GM_ONLY';end if;
 snap:=jsonb_build_object('year',l.current_year,'phase',l.season_phase,'label',coalesce(p_label,'GM checkpoint'),
   'funds',(select coalesce(jsonb_agg(jsonb_build_object('team_id',team_id,'cash_ntd',cash_ntd)),'[]'::jsonb) from public.team_finances where league_id=p_league),
   'players',(select coalesce(jsonb_agg(to_jsonb(lp)),'[]'::jsonb) from public.league_players lp where lp.league_id=p_league));
 insert into public.season_snapshots(league_id,timeline_id,season_year,snapshot)
 values(p_league,l.active_timeline_id,l.current_year,snap) returning public.season_snapshots.id into v_checkpoint_id;
 return v_checkpoint_id;
end;$function$
;