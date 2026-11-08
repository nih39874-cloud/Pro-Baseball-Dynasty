-- Supabase Cron is installed in PostgreSQL; official game processing waits for is_ready=true.
create extension if not exists pg_cron with schema pg_catalog;
-- Legacy job name safe to re-run; each minute only privileged SQL operates.
select cron.schedule('diamond-official-minute', '* * * * *', $$select private.tick_official(now());$$);
-- Publish game and league changes to authenticated clients through Supabase Realtime/RLS.
do $$begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='games') then
  alter publication supabase_realtime add table public.games;
 end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='leagues') then
  alter publication supabase_realtime add table public.leagues;
 end if;
end$$;
