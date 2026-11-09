-- Optimize common league-scoped realtime and coach queries; publish control-mode transitions.
create index if not exists match_controls_league on public.match_team_controls(league_id);
create index if not exists match_controls_team on public.match_team_controls(team_id);
create index if not exists match_controls_user on public.match_team_controls(controlled_by);
create index if not exists match_actions_league on public.match_coach_actions(league_id);
create index if not exists match_actions_team on public.match_coach_actions(team_id);
create index if not exists match_actions_issued_by on public.match_coach_actions(issued_by);
create index if not exists match_actions_player on public.match_coach_actions(player_id);
create index if not exists coach_lineups_team on public.coach_lineups(team_id);
create index if not exists coach_lineups_opponent on public.coach_lineups(opponent_team_id);
create index if not exists coach_lineups_author on public.coach_lineups(saved_by);
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
 and schemaname='public' and tablename='match_team_controls') then
   alter publication supabase_realtime add table public.match_team_controls;
 end if;
end $$;