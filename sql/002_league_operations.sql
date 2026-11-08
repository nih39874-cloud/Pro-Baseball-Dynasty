-- 鑽石王朝 server operations v0.2. All authoritative writes are server-only.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

alter table public.leagues add column if not exists season_anchor_at timestamptz;
alter table public.leagues add column if not exists season_phase text not null default 'pending';
alter table public.leagues add column if not exists active_timeline_id uuid not null default gen_random_uuid();
alter table public.leagues add constraint leagues_season_phase_chk check (season_phase in ('pending','regular','playoff','offseason','training'));

alter table public.games add column if not exists timeline_id uuid;
alter table public.games add column if not exists season_stage text not null default 'regular';
alter table public.games add column if not exists series_id uuid;
alter table public.games add column if not exists completed_at timestamptz;
create index if not exists games_active_phase on public.games (league_id,timeline_id,season_year,phase,scheduled_at);
update public.games g set timeline_id=l.active_timeline_id from public.leagues l where g.league_id=l.id and g.timeline_id is null;
alter table public.games alter column timeline_id set not null;

alter table public.players_master add column if not exists is_import boolean not null default false;
alter table public.players_master add column if not exists draft_year integer;
alter table public.players_master add column if not exists draft_round integer;
alter table public.players_master add column if not exists modeling_status text not null default 'missing';
alter table public.players_master add column if not exists data_confidence text not null default 'unverified';

create table if not exists public.player_season_stats (
 league_id uuid not null references public.leagues(id),
 timeline_id uuid not null,
 season_year integer not null,
 player_id bigint not null references public.players_master(id),
 team_id text not null references public.teams(id),
 games_played integer not null default 0 check (games_played >=0),
 plate_appearances integer not null default 0 check (plate_appearances>=0),
 hits integer not null default 0 check (hits>=0),
 pitching_outs integer not null default 0 check (pitching_outs>=0),
 roster_days integer not null default 0 check (roster_days>=0),
 primary key(league_id,timeline_id,season_year,player_id)
);
create index if not exists stats_freq on public.player_season_stats(league_id,timeline_id,season_year,team_id,games_played desc);

create table if not exists public.roster_submissions (
 league_id uuid not null references public.leagues(id), timeline_id uuid not null,
 season_year integer not null, team_id text not null references public.teams(id),
 kind text not null check (kind in ('playoff32','protected60')),
 player_ids bigint[] not null default '{}',
 submitted_by uuid references auth.users(id),
 submitted_at timestamptz not null default now(),
 auto_selected boolean not null default false,
 locked boolean not null default false,
 primary key(league_id,timeline_id,season_year,team_id,kind),
 check (array_length(player_ids,1) is null or array_length(player_ids,1) <= case when kind='playoff32' then 32 else 60 end)
);

create table if not exists public.fa_offers (
 id uuid primary key default gen_random_uuid(),
 league_id uuid not null references public.leagues(id), timeline_id uuid not null,
 season_year integer not null, player_id bigint not null references public.players_master(id),
 bidder_team_id text not null references public.teams(id),
 salary_ntd bigint not null check (salary_ntd>=70000 and salary_ntd<=50000000),
 years integer not null check(years between 1 and 5),
 status text not null default 'offered' check(status in('offered','accepted','rejected','withdrawn')),
 created_at timestamptz not null default now(),
 resolved_at timestamptz
);
create index if not exists fa_open_by_player on public.fa_offers(league_id,timeline_id,player_id,status,created_at);

create table if not exists public.finance_ledger (
 id bigint generated always as identity primary key,
 league_id uuid not null references public.leagues(id),
 timeline_id uuid not null,
 season_year integer not null,
 team_id text not null references public.teams(id),
 amount_ntd bigint not null,
 kind text not null,
 memo text,
 actor_user_id uuid references auth.users(id),
 created_at timestamptz not null default now()
);

create table if not exists public.playoff_series (
 id uuid primary key default gen_random_uuid(),
 league_id uuid not null references public.leagues(id), timeline_id uuid not null,
 season_year integer not null,
 stage text not null check(stage in ('wildcard','challenge','final')),
 team_a text not null references public.teams(id), team_b text not null references public.teams(id),
 best_of integer not null check(best_of in (3,7)),
 wins_a integer not null default 0, wins_b integer not null default 0,
 status text not null default 'active' check(status in ('active','finished')),
 next_at timestamptz not null,
 created_at timestamptz not null default now(),
 unique(league_id,timeline_id,season_year,stage)
);
alter table public.games add constraint games_series_fk foreign key (series_id) references public.playoff_series(id);

create table if not exists public.league_champions (
 league_id uuid not null references public.leagues(id), timeline_id uuid not null,
 season_year integer not null, team_id text not null references public.teams(id),
 created_at timestamptz not null default now(),
 primary key(league_id,timeline_id,season_year)
);

-- SQL operations in the private schema are not available to browser clients.
alter table public.player_season_stats enable row level security;
alter table public.roster_submissions enable row level security;
alter table public.fa_offers enable row level security;
alter table public.finance_ledger enable row level security;
alter table public.playoff_series enable row level security;
alter table public.league_champions enable row level security;

create policy stats_read on public.player_season_stats for select to authenticated using (exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.league_id=player_season_stats.league_id));
create policy roster_read on public.roster_submissions for select to authenticated using (exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.league_id=roster_submissions.league_id));
create policy offers_read on public.fa_offers for select to authenticated using (exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.league_id=fa_offers.league_id));
create policy ledger_read on public.finance_ledger for select to authenticated using (exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.league_id=finance_ledger.league_id));
create policy series_read on public.playoff_series for select to authenticated using (exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.league_id=playoff_series.league_id));
create policy champions_read on public.league_champions for select to authenticated using (exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.league_id=league_champions.league_id));

-- Authenticated clients can only READ game data. No client write policies.
grant usage on schema public to authenticated;
grant select on public.teams,public.leagues,public.memberships,public.players_master,public.league_players,
 public.team_finances,public.games,public.game_events,public.season_snapshots,
 public.player_season_stats,public.roster_submissions,public.fa_offers,public.finance_ledger,
 public.playoff_series,public.league_champions to authenticated;
revoke insert,update,delete on public.leagues,public.memberships,public.league_players,
 public.team_finances,public.games,public.game_events,public.season_snapshots,
 public.player_season_stats,public.roster_submissions,public.fa_offers,public.finance_ledger,
 public.playoff_series,public.league_champions from anon,authenticated;

-- First league starts at the NEXT Tuesday 08:00 Asia/Taipei, not the previous Tuesday.
create or replace function private.next_tuesday_0800(t timestamptz) returns timestamptz
language sql stable set search_path = '' as $$
 select ((date_trunc('week', t at time zone 'Asia/Taipei') + interval '1 day 8 hours')+
   case when (date_trunc('week', t at time zone 'Asia/Taipei') + interval '1 day 8 hours') <= (t at time zone 'Asia/Taipei')
     then interval '7 days' else interval '0 day' end) at time zone 'Asia/Taipei';
$$;

update public.leagues set season_anchor_at=private.next_tuesday_0800(now()) where season_anchor_at is null;

-- 24 repetitions of a 5-round, 6-team round robin = 120 games/team, 360 league games.
create or replace function private.schedule_regular(p_league uuid,p_year integer,p_anchor timestamptz,p_timeline uuid)
returns integer language plpgsql set search_path='' as $$
declare
 teams text[]:=array['brothers','dragons','unilions','guardians','rakuten','TSG'];
 rotated text[]:=array['dragons','unilions','guardians','rakuten','TSG'];
 circle text[]; rotated_first text; c int; r int; match_no int; slot int; scheduled timestamptz; h text; a text; made int:=0;
begin
 if exists(select 1 from public.games where league_id=p_league and timeline_id=p_timeline and season_year=p_year and season_stage='regular') then return 0;end if;
 for c in 0..23 loop
  rotated:=array['dragons','unilions','guardians','rakuten','TSG'];
  for r in 0..4 loop
   circle:=array[teams[1],rotated[1],rotated[2],rotated[3],rotated[4],rotated[5]];
   slot:=c*5+r;
   scheduled:=p_anchor + (slot/30)*interval '1 day' + (slot%30)*interval '32 minutes';
   for match_no in 1..3 loop
    if c%2=0 then h:=circle[match_no];a:=circle[7-match_no];else h:=circle[7-match_no];a:=circle[match_no];end if;
    insert into public.games(league_id,timeline_id,season_year,home_team_id,away_team_id,scheduled_at,phase,season_stage)
      values(p_league,p_timeline,p_year,h,a,scheduled,'scheduled','regular');
    made:=made+1;
   end loop;
   rotated_first:=rotated[5];
   rotated:=array[rotated_first,rotated[1],rotated[2],rotated[3],rotated[4]];
  end loop;
 end loop;
 return made;
end;$$;

-- Automatic roster: respect manual picks, fill by actual season appearances; never invent a player.
create or replace function private.auto_roster(p_league uuid,p_timeline uuid,p_year int,p_team text,p_kind text)
returns integer language plpgsql set search_path='' as $$
declare
 v_limit integer:=case when p_kind='playoff32' then 32 else 60 end;
 v_existing bigint[]:='{}';v_player record;v_count integer;v_locked boolean:=false;
begin
 select coalesce(player_ids,'{}'),locked into v_existing,v_locked from public.roster_submissions
 where league_id=p_league and timeline_id=p_timeline and season_year=p_year and team_id=p_team and kind=p_kind;
 if v_locked then return coalesce(array_length(v_existing,1),0);end if;
 v_existing:=coalesce(v_existing,'{}');
 -- Remove duplicates and invalid picks while preserving user order.
 select coalesce(array_agg(id order by ord),'{}') into v_existing from (
  select x.id,min(x.ord) ord from unnest(v_existing) with ordinality x(id,ord)
  where exists(select 1 from public.league_players lp where lp.league_id=p_league and lp.master_player_id=x.id and lp.team_id=p_team and lp.roster_status<>'retired')
  group by x.id order by min(x.ord) limit v_limit) q;
 for v_player in
  select lp.master_player_id from public.league_players lp
  left join public.player_season_stats stats on stats.league_id=p_league and stats.timeline_id=p_timeline and stats.season_year=p_year and stats.player_id=lp.master_player_id
  where lp.league_id=p_league and lp.team_id=p_team and lp.roster_status<>'retired' and not lp.master_player_id=any(v_existing)
  order by coalesce(stats.games_played,0) desc,coalesce(stats.plate_appearances,0)+coalesce(stats.pitching_outs,0) desc,lp.master_player_id
 loop
  exit when coalesce(array_length(v_existing,1),0)>=v_limit;
  v_existing:=array_append(v_existing,v_player.master_player_id);
 end loop;
 insert into public.roster_submissions(league_id,timeline_id,season_year,team_id,kind,player_ids,auto_selected,locked)
 values(p_league,p_timeline,p_year,p_team,p_kind,v_existing,true,true)
 on conflict(league_id,timeline_id,season_year,team_id,kind)
 do update set player_ids=excluded.player_ids,auto_selected=true,locked=true,submitted_at=now();
 return coalesce(array_length(v_existing,1),0);
end;$$;

-- Private functions revoked by default; Edge Functions use a server service role.
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on all functions in schema private to service_role;
