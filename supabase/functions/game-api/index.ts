// Diamond Dynasty server API, all live mutations are authenticated and role checked.
// API keys with service privileges are never returned to browsers.
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const ALLOWED = ['https://nih39874-cloud.github.io', 'http://localhost:4173', 'http://127.0.0.1:4173'];
function headers(req: Request) {
  const origin = req.headers.get('origin') || '';
  return { 'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : 'https://nih39874-cloud.github.io',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Content-Type': 'application/json; charset=utf-8' };
}
function json(req: Request, obj: unknown, code = 200): Response {
  return new Response(JSON.stringify(obj), { status: code, headers: headers(req) });
}
function fail(req: Request, message: string, code = 400) { return json(req, { ok: false, error: message }, code); }
function need(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const teamIds = new Set(['brothers', 'dragons', 'unilions', 'guardians', 'rakuten', 'TSG']);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== 'POST') return fail(req, 'METHOD_NOT_ALLOWED', 405);
  if (!url || !secret) return fail(req, 'SERVER_NOT_CONFIGURED', 503);
  const bearer = req.headers.get('authorization') || '';
  if (!bearer.startsWith('Bearer ')) return fail(req, 'LOGIN_REQUIRED', 401);
  const token = bearer.slice(7).trim();
  if (!token || token.length > 5000) return fail(req, 'LOGIN_REQUIRED', 401);
  try {
    const { data: authData, error: authError } = await db.auth.getUser(token);
    if (authError || !authData.user) return fail(req, 'INVALID_SESSION', 401);
    const user = authData.user;
    const { data: memberships, error: memError } = await db.from('memberships')
      .select('league_id,team_id,role').eq('user_id', user.id).limit(2);
    if (memError || !memberships || memberships.length !== 1) return fail(req, 'MEMBERSHIP_NOT_READY', 403);
    const member = memberships[0];
    const { data: league, error: leagueError } = await db.from('leagues').select('*').eq('id', member.league_id).single();
    if (leagueError || !league) return fail(req, 'LEAGUE_NOT_FOUND', 404);
    if (!((member.role==='gm' && league.kind==='gm') || (member.role==='manager' && league.kind==='official' && !!member.team_id)))
      return fail(req, 'MEMBERSHIP_INVALID', 403);
    const body = await req.json().catch(() => ({}));
    if (typeof body !== 'object' || !body) return fail(req, 'INVALID_REQUEST');
    const action = String(body.action || 'status');
    const isGM = member.role === 'gm' && league.kind === 'gm';
    const pickTeam = isGM ? 'dragons' : String(member.team_id || '');
    const allowedTeam = isGM ? pickTeam === 'dragons' : pickTeam === member.team_id;
    const responseBase = { kind: league.kind, league_id: league.id, year: league.current_year, phase: league.season_phase,
      season_anchor_at: league.season_anchor_at, is_ready: league.is_ready, clock_enabled: league.clock_enabled, clock_last_tick: league.clock_last_tick, roster_source_status: league.roster_source_status, role: member.role,
      team_id: isGM ? 'dragons' : member.team_id, sandbox: isGM, active_timeline_id: league.active_timeline_id };

    if (action === 'status') {
      const [fin, games, recent, champs, clubPlayers, financialEvents, monthlyCharges, completedLeagueGames] = await Promise.all([
        db.from('team_finances').select('team_id,cash_ntd,debt_ntd').eq('league_id', league.id).order('team_id'),
        db.from('games').select('id,season_year,home_team_id,away_team_id,scheduled_at,phase,home_score,away_score,season_stage,version')
          .eq('league_id', league.id).eq('timeline_id',league.active_timeline_id).eq('season_year',league.current_year)
          .gte('scheduled_at', new Date(Date.now() - 3600000).toISOString()).order('scheduled_at').limit(35),
        db.from('games').select('id,home_team_id,away_team_id,scheduled_at,home_score,away_score,phase,season_stage')
          .eq('league_id', league.id).eq('timeline_id',league.active_timeline_id).eq('season_year',league.current_year)
          .eq('phase','final').order('scheduled_at',{ascending:false}).limit(12),
        db.from('league_champions').select('season_year,team_id').eq('league_id',league.id).order('season_year',{ascending:false}).limit(10),
        db.from('league_players').select('roster_status,monthly_salary_ntd').eq('league_id',league.id).eq('team_id',pickTeam).neq('roster_status','future'),
        db.from('finance_ledger').select('id,kind,amount_ntd,memo,created_at').eq('league_id',league.id).eq('timeline_id',league.active_timeline_id).eq('season_year',league.current_year).eq('team_id',pickTeam).order('created_at',{ascending:false}).limit(250),
        db.from('monthly_finance_charges').select('month_no,salary_due_ntd,stadium_due_ntd,staff_due_ntd,travel_due_ntd,equipment_due_ntd,total_paid_ntd,total_owed_ntd,charged_at').eq('league_id',league.id).eq('timeline_id',league.active_timeline_id).eq('season_year',league.current_year).eq('team_id',pickTeam).order('month_no',{ascending:false}).limit(12),
        db.from('games').select('home_team_id,away_team_id,home_score,away_score,season_stage').eq('league_id',league.id).eq('timeline_id',league.active_timeline_id).eq('season_year',league.current_year).eq('phase','final').limit(1000)
      ]);
      if (fin.error || games.error || recent.error || champs.error || clubPlayers.error || financialEvents.error || monthlyCharges.error || completedLeagueGames.error) return fail(req, 'DATABASE_READ_FAILED', 503);
      const standings=[...teamIds].map(team=>{
        let wins=0,losses=0,draws=0,runsFor=0,runsAgainst=0;
        for(const g of completedLeagueGames.data||[]){
          if(g.season_stage!=='regular')continue;
          const home=g.home_team_id===team,away=g.away_team_id===team;
          if(!home&&!away)continue;
          const ours=Number(home?g.home_score:g.away_score),theirs=Number(home?g.away_score:g.home_score);
          if(ours>theirs)wins++;else if(ours<theirs)losses++;else draws++;
          runsFor+=ours;runsAgainst+=theirs;
        }
        return {team_id:team,wins,losses,draws,runs_for:runsFor,runs_against:runsAgainst,win_pct:wins+losses?wins/(wins+losses):0};
      }).sort((a,b)=>b.win_pct-a.win_pct||b.wins-a.wins||a.team_id.localeCompare(b.team_id));
      return json(req, { ok: true, ...responseBase, finances: fin.data, upcoming: games.data,
        recent: recent.data, champions: champs.data, standings,
        monthly_finance:(monthlyCharges.data||[])[0]||null,
        months_charged:(monthlyCharges.data||[]).length,
        season_monthly_costs_ntd:(monthlyCharges.data||[]).reduce((a,x)=>a+Number(x.total_paid_ntd||0),0),
        finance_entries:(financialEvents.data||[]).slice(0,24),
        season_game_income_ntd:(financialEvents.data||[]).filter(x=>x.kind==='home_game_net'||x.kind==='away_game_media').reduce((a,x)=>a+Number(x.amount_ntd||0),0),
        roster_summary:{total:(clubPlayers.data||[]).length,active:(clubPlayers.data||[]).filter(p=>p.roster_status==='active').length,reserve:(clubPlayers.data||[]).filter(p=>p.roster_status==='reserve').length,
          monthly_payroll_ntd:(clubPlayers.data||[]).filter(p=>p.roster_status==='active'||p.roster_status==='reserve').reduce((a,p)=>a+Number(p.monthly_salary_ntd||0),0)} });
    }
    if (action === 'gm-observe') {
      if (!isGM) return fail(req,'GM_ONLY',403);
      // Strictly read only from the official timeline; no mutation may target it.
      const {data:official,error:leagueErr}=await db.from('leagues').select('id,current_year,active_timeline_id,season_phase,clock_enabled').eq('kind','official').single();
      if (leagueErr||!official) return fail(req,'OFFICIAL_LEAGUE_MISSING',404);
      const [finance,players,finals] = await Promise.all([
        db.from('team_finances').select('team_id,cash_ntd,debt_ntd').eq('league_id',official.id),
        db.from('league_players').select('team_id,roster_status').eq('league_id',official.id).neq('roster_status','future').limit(1000),
        db.from('games').select('home_team_id,away_team_id,home_score,away_score').eq('league_id',official.id).eq('timeline_id',official.active_timeline_id).eq('season_year',official.current_year).eq('phase','final').limit(1000)
      ]);
      if(finance.error||players.error||finals.error)return fail(req,'OFFICIAL_READ_FAILED',503);
      const teams=[...teamIds].map(id=>{
        const f=(finance.data||[]).find(x=>x.team_id===id);
        const ps=(players.data||[]).filter(x=>x.team_id===id);
        let wins=0,losses=0,draws=0;
        for(const g of finals.data||[]){
          if(g.home_team_id!==id&&g.away_team_id!==id)continue;
          if(g.home_score===g.away_score){draws++;continue;}
          const winner=g.home_score>g.away_score?g.home_team_id:g.away_team_id;
          if(winner===id)wins++;else losses++;
        }
        return {team_id:id,cash_ntd:f?.cash_ntd??null,debt_ntd:f?.debt_ntd??null,
          players:ps.length,active:ps.filter(x=>x.roster_status==='active').length,wins,losses,draws};
      });
      return json(req,{ok:true,year:official.current_year,phase:official.season_phase,clock_enabled:official.clock_enabled,teams});
    }
    if (action === 'gm-diagnostics') {
      if(!isGM)return fail(req,'GM_ONLY',403);
      const {data,error}=await db.rpc('server_gm_diagnostics',{p_actor:user.id});
      return error?fail(req,error.message,409):json(req,{ok:true,report:data});
    }
    if (action === 'gm-simulate') {
      if(!isGM)return fail(req,'GM_ONLY',403);
      const count=Number(body.count||1);
      need(Number.isSafeInteger(count)&&count>=1&&count<=30,'INVALID_GAME_COUNT');
      const {data,error}=await db.rpc('server_gm_simulate_games',{p_actor:user.id,p_count:count});
      return error?fail(req,error.message,409):json(req,{ok:true,simulation:data});
    }
    if (action === 'trade-board') {
      if(isGM)return fail(req,'OFFICIAL_MANAGERS_ONLY',403);
      const [players,offers]=await Promise.all([
        db.from('league_players').select('master_player_id,team_id,roster_status,monthly_salary_ntd,players_master(full_name,primary_position,source_year)')
          .eq('league_id',league.id).eq('roster_status','reserve').limit(500),
        db.from('trade_offers').select('id,proposer_team_id,target_team_id,offered_player_id,requested_player_id,status,created_at,resolved_at')
          .eq('league_id',league.id).eq('timeline_id',league.active_timeline_id).order('created_at',{ascending:false}).limit(150)
      ]);
      if(players.error||offers.error)return fail(req,'TRADE_BOARD_READ_FAILED',503);
      return json(req,{ok:true,...responseBase,
        candidates:players.data||[],offers:(offers.data||[]).filter(x=>x.proposer_team_id===pickTeam||x.target_team_id===pickTeam)});
    }
    if (action === 'trade-offer') {
      if(isGM)return fail(req,'OFFICIAL_MANAGERS_ONLY',403);
      const offered=Number(body.offered_player_id),requested=Number(body.requested_player_id);
      need(Number.isSafeInteger(offered)&&offered>0&&Number.isSafeInteger(requested)&&requested>0,'INVALID_PLAYERS');
      const {data,error}=await db.rpc('server_propose_trade',{p_actor:user.id,p_offered:offered,p_requested:requested});
      return error?fail(req,error.message,409):json(req,{ok:true,offer_id:data});
    }
    if (action === 'trade-respond') {
      if(isGM)return fail(req,'OFFICIAL_MANAGERS_ONLY',403);
      const offerId=String(body.offer_id||'');
      need(/^[a-f0-9-]{36}$/i.test(offerId)&&typeof body.accept==='boolean','INVALID_TRADE_RESPONSE');
      const {data,error}=await db.rpc('server_respond_trade',{p_actor:user.id,p_offer:offerId,p_accept:body.accept});
      return error?fail(req,error.message,409):json(req,{ok:true,status:data});
    }
    if (action === 'gm-market') {
      if(!isGM)return fail(req,'GM_ONLY',403);
      const {data,error}=await db.from('league_players')
        .select('master_player_id,team_id,roster_status,monthly_salary_ntd,contract_years,players_master(full_name,primary_position,source_year)')
        .eq('league_id',league.id).neq('roster_status','future').order('master_player_id').limit(1000);
      return error?fail(req,'GM_MARKET_READ_FAILED',503):json(req,{ok:true,players:data||[]});
    }
    if (action === 'gm-sign') {
      if(!isGM)return fail(req,'GM_ONLY',403);
      const playerId=Number(body.player_id),salary=Number(body.salary_ntd),years=Number(body.years);
      if(!Number.isSafeInteger(playerId)||playerId<1||!Number.isSafeInteger(salary)||!Number.isSafeInteger(years))
        return fail(req,'INVALID_OFFER');
      const {data,error}=await db.rpc('server_gm_sandbox_sign',{p_actor:user.id,p_player:playerId,p_salary:salary,p_years:years});
      return error?fail(req,error.message,409):json(req,{ok:true,signing_id:data,completed:true});
    }
    if (action === 'gm-signings') {
      if(!isGM)return fail(req,'GM_ONLY',403);
      const {data,error}=await db.from('gm_sandbox_signings')
        .select('player_id,team_id,prior_team_id,salary_ntd,contract_years,signed_at,players_master(full_name)')
        .eq('league_id',league.id).order('signed_at',{ascending:false}).limit(30);
      return error?fail(req,'SIGNING_HISTORY_READ_FAILED',503):json(req,{ok:true,signings:data||[]});
    }
    if (action === 'coach-config') {
      need(allowedTeam,'TEAM_NOT_ALLOWED');
      const [teamPlayers,configs,history]=await Promise.all([
        db.from('league_players')
          .select('master_player_id,team_id,roster_status,promotion_available_at,roster_changed_at,players_master(full_name,primary_position,bats,throws,source_year,draft_year)')
          .eq('league_id',league.id).eq('team_id',pickTeam).neq('roster_status','future').order('master_player_id').limit(200),
        db.from('coach_lineups')
          .select('team_id,opponent_team_id,batting_order,defense,is_custom,needs_review,saved_at')
          .eq('league_id',league.id).eq('timeline_id',league.active_timeline_id)
          .eq('season_year',league.current_year).eq('team_id',pickTeam),
        db.from('roster_move_logs')
          .select('master_player_id,old_status,new_status,changed_at,promotion_available_at')
          .eq('league_id',league.id).eq('team_id',pickTeam).order('changed_at',{ascending:false}).limit(15)
      ]);
      if(teamPlayers.error||configs.error||history.error)return fail(req,'COACH_CONFIG_READ_FAILED',503);
      const ids=(teamPlayers.data||[]).map(p=>p.master_player_id);
      let positions=[],statRows=[];
      if(ids.length){
        const [pos,stats]=await Promise.all([
          db.from('player_position_2024')
            .select('master_player_id,league_level,position,games')
            .in('master_player_id',ids).order('games',{ascending:false}).limit(550),
          db.from('cpbl_season_reference')
            .select('master_player_id,league_level,batting,pitching')
            .eq('season_year',2024).in('master_player_id',ids).limit(600)
        ]);
        if(pos.error||stats.error)return fail(req,'POSITION_OR_STATS_READ_FAILED',503);
        positions=pos.data||[];
        statRows=stats.data||[];
      }
      const byId=new Map(),statById=new Map();
      for(const r of positions){const v=byId.get(r.master_player_id)||[];v.push(r);byId.set(r.master_player_id,v);}
      for(const r of statRows){
        const items=statById.get(r.master_player_id)||[];items.push(r);statById.set(r.master_player_id,items);
      }
      return json(req,{ok:true,...responseBase,team_id:pickTeam,roster_limit:28,demotion_cooldown_seconds:14400,
        stats_reference_year:2024,
        players:(teamPlayers.data||[]).map(x=>({...x,fielding_positions:byId.get(x.master_player_id)||[],
          reference_stats:statById.get(x.master_player_id)||[]})),
        lineups:configs.data||[],recent_moves:history.data||[]});
    }
    if (action === 'coach-default') {
      need(allowedTeam,'TEAM_NOT_ALLOWED');
      const r=await db.rpc('server_default_coach_lineup',{p_league:league.id,p_team:pickTeam});
      return r.error?fail(req,r.error.message,409):json(req,{ok:true,...responseBase,default_lineup:r.data});
    }
    if (action === 'coach-save') {
      need(allowedTeam,'TEAM_NOT_ALLOWED');
      const opponent=String(body.opponent_team_id||'');
      need(teamIds.has(opponent)&&opponent!==pickTeam,'INVALID_OPPONENT');
      const batting=body.batting_order,defense=body.defense;
      need(Array.isArray(batting)&&batting.length===9
        &&batting.every(x=>Number.isSafeInteger(x)&&x>0)
        &&defense&&typeof defense==='object'&&!Array.isArray(defense),'INVALID_LINEUP');
      const required=['P','C','1B','2B','3B','SS','LF','CF','RF'];
      need(Object.keys(defense).length===9 && required.every(k=>Number.isSafeInteger(defense[k])&&defense[k]>0),
        'INVALID_DEFENSE');
      const r=await db.rpc('server_save_coach_lineup',{
        p_league:league.id,p_team:pickTeam,p_opponent:opponent,p_order:batting,
        p_defense:defense,p_actor:user.id
      });
      return r.error?fail(req,r.error.message,409):json(req,{ok:true,...responseBase,save_result:r.data});
    }
    if (action === 'coach-move') {
      need(allowedTeam,'TEAM_NOT_ALLOWED');
      const playerId=Number(body.player_id),to=String(body.to_level||'');
      need(Number.isSafeInteger(playerId)&&playerId>0&&(to==='active'||to==='reserve'),'INVALID_LEVEL_CHANGE');
      const r=isGM
        ? await db.rpc('server_gm_move_player_level',{p_actor:user.id,p_player:playerId,p_to:to})
        : await db.rpc('server_move_player_level',{
            p_league:league.id,p_team:pickTeam,p_player:playerId,p_to:to,p_actor:user.id
          });
      return r.error?fail(req,r.error.message,409):json(req,{ok:true,...responseBase,move_result:r.data});
    }
    if (action === 'team-stats') {
      need(allowedTeam,'TEAM_NOT_ALLOWED');
      const {data,error}=await db.rpc('server_team_season_stats',
        {p_league:league.id,p_year:league.current_year,p_team:pickTeam});
      return error?fail(req,'SEASON_STATS_READ_FAILED',503):json(req,{ok:true,...responseBase,players:data||[]});
    }
    if (action === 'awards') {
      const {data,error}=await db.from('season_awards')
        .select('season_year,award_code,player_id,team_id,score,players_master(full_name)')
        .eq('league_id',league.id).eq('timeline_id',league.active_timeline_id)
        .order('season_year',{ascending:false}).limit(100);
      return error?fail(req,'AWARDS_READ_FAILED',503):json(req,{ok:true,...responseBase,awards:data||[]});
    }
    if (action === 'roster') {
      need(allowedTeam, 'TEAM_NOT_ALLOWED');
      const [players,rosters,offers,opening,champ,started] = await Promise.all([
        db.from('league_players').select('master_player_id,team_id,roster_status,monthly_salary_ntd,contract_years,fa_service_seasons,promotion_available_at,fa_service_initial_estimate,fa_initial_eligible_reported,fa_2024_service_reported,fa_usage_min_seasons,fa_qualification_threshold,fa_qualify_note,salary_verified,fa_years_verified,players_master(full_name,primary_position,source_year,is_import,draft_year,data_confidence,official_cpbl_id,bats,throws,birth_date)')
          .eq('league_id',league.id).eq('team_id',pickTeam).neq('roster_status','future').order('master_player_id').limit(250),
        db.from('roster_submissions').select('kind,player_ids,locked,auto_selected,submitted_at')
          .eq('league_id',league.id).eq('timeline_id',league.active_timeline_id).eq('season_year',league.current_year).eq('team_id',pickTeam),
        db.from('fa_offers').select('id,player_id,salary_ntd,years,status,created_at')
          .eq('league_id',league.id).eq('timeline_id',league.active_timeline_id).eq('bidder_team_id',pickTeam).order('created_at',{ascending:false}).limit(30),
        db.from('season_first_team_rosters').select('player_ids,source,submitted_at').eq('league_id',league.id).eq('timeline_id',league.active_timeline_id).eq('season_year',league.current_year).eq('team_id',pickTeam).maybeSingle(),
        db.from('league_champions').select('team_id').eq('league_id',league.id).eq('timeline_id',league.active_timeline_id).eq('season_year',league.current_year).limit(1),
        db.from('games').select('id').eq('league_id',league.id).eq('timeline_id',league.active_timeline_id).eq('season_year',league.current_year).in('phase',['live','final']).limit(1)
      ]);
      if (players.error || rosters.error || offers.error || opening.error || champ.error || started.error) return fail(req,'ROSTER_READ_FAILED',503);
      const ids=(players.data||[]).map(p=>p.master_player_id);
      let stats=[],visual=[],salaryInfo=[],conditions=[];
      if(ids.length){
        const [st,vi,sa,co]=await Promise.all([
          db.from('cpbl_season_reference').select('master_player_id,league_level,team_id,batting,pitching').eq('season_year',2024).in('master_player_id',ids).limit(600),
          db.from('player_visual_profiles').select('master_player_id,model_status').in('master_player_id',ids).limit(250),
          db.from('player_salary_reference_2024').select('master_player_id,monthly_salary_ntd,evidence_type,source_url').in('master_player_id',ids).limit(250),
          db.from('player_conditions').select('master_player_id,fatigue,morale,injury_games_remaining').eq('league_id',league.id).in('master_player_id',ids).limit(250)
        ]);
        if(st.error||vi.error||sa.error||co.error)return fail(req,'PLAYER_SOURCE_READ_FAILED',503);
        stats=st.data||[];visual=vi.data||[];salaryInfo=sa.data||[];conditions=co.data||[];
      }
      const byId=new Map(),byVisual=new Map(visual.map(x=>[x.master_player_id,x.model_status])),bySalary=new Map(salaryInfo.map(x=>[x.master_player_id,x])),byCondition=new Map(conditions.map(x=>[x.master_player_id,x]));
      for(const item of stats){const list=byId.get(item.master_player_id)||[];list.push(item);byId.set(item.master_player_id,list);}
      const enriched=(players.data||[]).map(p=>({...p,reference_stats:byId.get(p.master_player_id)||[],salary_reference:bySalary.get(p.master_player_id)||null,condition:byCondition.get(p.master_player_id)||{fatigue:0,morale:50,injury_games_remaining:0},visual_status:byVisual.get(p.master_player_id)||'missing'}));
      return json(req,{ok:true,...responseBase,team_id:pickTeam,players:enriched,rosters:rosters.data,opening_roster:opening.data,season_finished:(champ.data||[]).length>0,season_started:(started.data||[]).length>0,offers:offers.data});
    }
    if (action === 'free-agents') {
      const r=await db.from('league_players').select('master_player_id,roster_status,monthly_salary_ntd,players_master(full_name,primary_position,source_year)')
        .eq('league_id',league.id).in('roster_status',['free_agent','negotiable']).limit(200);
      return r.error?fail(req,'FA_READ_FAILED',503):json(req,{ok:true,...responseBase,players:r.data});
    }
    if (action === 'submit-roster') {
      need(allowedTeam,'TEAM_NOT_ALLOWED');
      const kind = String(body.kind || '');
      need(kind === 'playoff32' || kind === 'protected60','INVALID_ROSTER_TYPE');
      const playerIds = body.player_ids;
      need(Array.isArray(playerIds) && playerIds.every(x => Number.isSafeInteger(x) && x>0),'INVALID_PLAYER_IDS');
      const {data,error}=await db.rpc('server_submit_roster',{p_league:league.id,p_team:pickTeam,p_kind:kind,p_ids:playerIds,p_actor:user.id});
      return error?fail(req,error.message,409):json(req,{ok:true,count:data});
    }
    if (action === 'first-team-save') {
      need(allowedTeam,'TEAM_NOT_ALLOWED');
      const ids=body.player_ids;
      need(Array.isArray(ids)&&ids.length<=28&&ids.every(x=>Number.isSafeInteger(x)&&x>0),'INVALID_PLAYER_IDS');
      const {data,error}=await db.rpc('server_save_first_team28',{p_league:league.id,p_team:pickTeam,p_ids:ids,p_actor:user.id});
      return error?fail(req,error.message,409):json(req,{ok:true,count:data});
    }
    if (action === 'offer-fa') {
      need(allowedTeam,'TEAM_NOT_ALLOWED');
      const playerId=Number(body.player_id),salary=Number(body.salary_ntd),years=Number(body.years);
      need(Number.isSafeInteger(playerId)&&Number.isSafeInteger(salary)&&Number.isSafeInteger(years),'INVALID_OFFER');
      const {data,error}=await db.rpc('server_offer_fa',{p_league:league.id,p_team:pickTeam,p_player:playerId,p_salary:salary,p_years:years});
      return error?fail(req,error.message,409):json(req,{ok:true,offer_id:data});
    }
    if (action === 'gm-funds' || action === 'gm-advance' || action === 'gm-rewind') {
      if (!isGM) return fail(req,'GM_ONLY',403);
      let out;
      if (action === 'gm-funds') {
        const amount=Number(body.amount_ntd);
        need(allowedTeam&&Number.isSafeInteger(amount)&&amount>=0&&amount<=1e14,'INVALID_FINANCIAL_CHANGE');
        out=await db.rpc('server_gm_funds',{p_league:league.id,p_team:pickTeam,p_amount:amount,p_actor:user.id});
      } else if (action === 'gm-advance') {
        out=await db.rpc('server_gm_advance',{p_league:league.id});
      } else {
        const year=Number(body.year);
        need(Number.isInteger(year)&&year>=2024&&year<=2200,'INVALID_YEAR');
        out=await db.rpc('server_gm_rewind',{p_league:league.id,p_year:year});
      }
      return out.error?fail(req,out.error.message,409):json(req,{ok:true,value:out.data});
    }
    return fail(req,'UNKNOWN_ACTION',404);
  } catch (error) {
    // Expected validation errors are short machine-readable codes, not SQL internals.
    const msg=error instanceof Error?error.message:'REQUEST_FAILED';
    if (/^[A-Z_]+$/.test(msg)) return fail(req,msg,400);
    return fail(req,'REQUEST_FAILED',500);
  }
});
