-- Backfill a cautious FA minimum for 2024 opening. Does not override published report data.
UPDATE public.league_players lp
 SET fa_usage_min_seasons=e.guaranteed_by_game_usage,
     fa_service_initial_estimate=COALESCE(lp.fa_service_initial_estimate,e.guaranteed_by_game_usage::numeric),
     fa_service_seasons=CASE WHEN lp.fa_service_initial_estimate IS NULL THEN e.guaranteed_by_game_usage::numeric ELSE lp.fa_service_seasons END,
     fa_qualify_note=COALESCE(lp.fa_qualify_note,'2010–2023一軍至少80場或80局之合格球季下限，不含一軍登錄日或更早年資')
 FROM public.fa_usage_evidence e,public.leagues l
 WHERE lp.master_player_id=e.master_player_id AND e.as_of_year=2024
 AND l.id=lp.league_id AND l.current_year=2024 AND l.season_phase='pending';
