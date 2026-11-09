-- Limit detailed live-match tactics to the participating team managers or the GM of the isolated GM league.
-- League-wide final scores remain visible via existing game listings.
DROP POLICY IF EXISTS match_session_member_read ON public.match_sessions;
CREATE POLICY match_session_participant_read ON public.match_sessions
 FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.memberships m JOIN public.games g ON g.id=match_sessions.game_id
  WHERE m.user_id=(select auth.uid()) AND m.league_id=match_sessions.league_id
    AND (m.role='gm' OR m.team_id IN(g.home_team_id,g.away_team_id))
 ));
DROP POLICY IF EXISTS match_controls_member_read ON public.match_team_controls;
CREATE POLICY match_controls_participant_read ON public.match_team_controls
 FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.memberships m JOIN public.games g ON g.id=match_team_controls.game_id
  WHERE m.user_id=(select auth.uid()) AND m.league_id=match_team_controls.league_id
    AND (m.role='gm' OR m.team_id IN(g.home_team_id,g.away_team_id))
 ));
DROP POLICY IF EXISTS match_actions_member_read ON public.match_coach_actions;
CREATE POLICY match_actions_participant_read ON public.match_coach_actions
 FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.memberships m JOIN public.games g ON g.id=match_coach_actions.game_id
  WHERE m.user_id=(select auth.uid()) AND m.league_id=match_coach_actions.league_id
    AND (m.role='gm' OR m.team_id IN(g.home_team_id,g.away_team_id))
 ));