-- Secure PostgREST service-role entrypoints for the authenticated Edge Function.
-- Client roles cannot call these directly even if the public schema is exposed.
create or replace function public.server_save_coach_lineup(
 p_league uuid,p_team text,p_opponent text,p_order bigint[],p_defense jsonb,p_actor uuid default null)
returns jsonb language sql set search_path='' as $$
 select private.save_coach_lineup(p_league,p_team,p_opponent,p_order,p_defense,p_actor);
$$;
create or replace function public.server_move_player_level(
 p_league uuid,p_team text,p_player bigint,p_to text,p_actor uuid default null)
returns jsonb language sql set search_path='' as $$
 select private.move_player_level(p_league,p_team,p_player,p_to,p_actor);
$$;
create or replace function public.server_default_coach_lineup(p_league uuid,p_team text)
returns jsonb language sql set search_path='' as $$
 select private.default_coach_lineup(p_league,p_team);
$$;
revoke execute on function public.server_save_coach_lineup(uuid,text,text,bigint[],jsonb,uuid) from public,anon,authenticated;
revoke execute on function public.server_move_player_level(uuid,text,bigint,text,uuid) from public,anon,authenticated;
revoke execute on function public.server_default_coach_lineup(uuid,text) from public,anon,authenticated;
grant execute on function public.server_save_coach_lineup(uuid,text,text,bigint[],jsonb,uuid) to service_role;
grant execute on function public.server_move_player_level(uuid,text,bigint,text,uuid) to service_role;
grant execute on function public.server_default_coach_lineup(uuid,text) to service_role;