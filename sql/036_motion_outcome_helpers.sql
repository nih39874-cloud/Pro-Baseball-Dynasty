-- Tactical movement effects used by both AI and manual contact resolution.
-- This does NOT claim precise 3D ball collision or client-authoritative results.
create or replace function private.motion_defense_bonus(
 p_game uuid,p_team text,p_position text,p_spray float8,p_distance float8,
 p_atbat_key text,p_now timestamptz)
returns float8 language plpgsql set search_path='' as $$
declare intent public.match_motion_intents%rowtype;x float8;z float8;start_x float8;start_z float8;
 current_distance float8;new_distance float8;
begin
 select * into intent from public.match_motion_intents
 where game_id=p_game and team_id=p_team and role='fielder'
 and selected_position=p_position and atbat_key=p_atbat_key
 and updated_at>=p_now-interval '18 seconds';
 if not found then return 0;end if;
 x:=sin(radians(p_spray))*p_distance;z:=-cos(radians(p_spray))*p_distance;
 start_x:=case p_position when 'LF' then -36 when 'CF' then 0 when 'RF' then 36
 when 'SS' then -9 when '2B' then 9 when '3B' then -20 when '1B' then 20 else 0 end;
 start_z:=case p_position when 'LF' then -66 when 'CF' then -79 when 'RF' then -66
 when 'SS' then -30 when '2B' then -30 when '3B' then -18 when '1B' then -18
 when 'P' then -18 else 2 end;
 current_distance:=sqrt(power(x-start_x,2)+power(z-start_z,2));
 new_distance:=sqrt(power(x-(start_x+intent.direction_x*8),2)+power(z-(start_z+intent.direction_z*8),2));
 return greatest(-.012,least(.03,(current_distance-new_distance)*.004))+
  case when intent.action='dive' and p_distance<65 then .006
   when intent.action='jump' and p_distance>=65 then .006
   when intent.action='catch' then .003 else 0 end;
end;$$;

create or replace function private.motion_runner_effect(
 p_game uuid,p_team text,p_atbat_key text,p_now timestamptz,
 p_result text,p_b2 bigint,p_b3 bigint,p_outs integer)
returns jsonb language plpgsql set search_path='' as $$
declare intent public.match_motion_intents%rowtype;nb2 bigint:=p_b2;nb3 bigint:=p_b3;nouts integer:=p_outs;
begin
 select * into intent from public.match_motion_intents
 where game_id=p_game and team_id=p_team and role='runner'
 and atbat_key=p_atbat_key and updated_at>=p_now-interval '18 seconds';
 if found and intent.action in('run','slide') and p_result='1B' and nb2 is not null and nb3 is null and nouts<3 then
  if random() < (case when intent.action='slide' then .77 else .68 end) then
   nb3:=nb2;nb2:=null;
  else nouts:=nouts+1;nb2:=null;end if;
 end if;
 return jsonb_build_object('b2',nb2,'b3',nb3,'outs',nouts,'action',case when found then intent.action else null end);
end;$$;

revoke all on function private.motion_defense_bonus(uuid,text,text,float8,float8,text,timestamptz),
 private.motion_runner_effect(uuid,text,text,timestamptz,text,bigint,bigint,integer)
 from public,anon,authenticated;
grant execute on function private.motion_defense_bonus(uuid,text,text,float8,float8,text,timestamptz),
 private.motion_runner_effect(uuid,text,text,timestamptz,text,bigint,bigint,integer) to service_role;