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
      const [fin, games, recent, champs, clubPlayers] = await Promise.all([
        db.from('team_finances').select('team_id,cash_ntd,debt_ntd').eq('league_id', league.id).order('team_id'),
        db.from('games').select('id,season_year,home_team_id,away_team_id,scheduled_at,phase,home_score,away_score,season_stage,version')
          .eq('league_id', league.id).eq('timeline_id',league.active_timeline_id).eq('season_year',league.current_year)
          .gte('scheduled_at', new Date(Date.now() - 3600000).toISOString()).order('scheduled_at').limit(35),
        db.from('games').select('id,home_team_id,away_team_id,scheduled_at,home_score,away_score,phase,season_stage')
          .eq('league_id', league.id).eq('timeline_id',league.active_timeline_id).eq('season_year',league.current_year)
          .eq('phase','final').order('scheduled_at',{ascending:false}).limit(12),
        db.from('league_champions').select('season_year,team_id').eq('league_id',league.id).order('season_year',{ascending:false}).limit(10),
        db.from('league_players').select('roster_status,monthly_salary_ntd').eq('league_id',league.id).eq('team_id',pickTeam)
      ]);
      if (fin.error || games.error || recent.error || champs.error || clubPlayers.error) return fail(req, 'DATABASE_READ_FAILED', 503);
      return json(req, { ok: true, ...responseBase, finances: fin.data, upcoming: games.data,
        recent: recent.data, champions: champs.data,
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
        db.from('league_players').select('team_id,roster_status').eq('league_id',official.id).limit(1000),
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
    if (action === 'gm-market') {
      if(!isGM)return fail(req,'GM_ONLY',403);
      const {data,error}=await db.from('league_players')
        .select('master_player_id,team_id,roster_status,monthly_salary_ntd,contract_years,players_master(full_name,primary_position,source_year)')
        .eq('league_id',league.id).order('master_player_id').limit(1000);
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
          .eq('league_id',league.id).eq('team_id',pickTeam).order('master_player_id').limit(200),
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
    if (action === 'roster') {
      need(allowedTeam, 'TEAM_NOT_ALLOWED');
      const [players,rosters,offers,opening,champ,started] = await Promise.all([
        db.from('league_players').select('master_player_id,team_id,roster_status,monthly_salary_ntd,contract_years,fa_service_seasons,promotion_available_at,fa_service_initial_estimate,fa_initial_eligible_reported,fa_2024_service_reported,fa_usage_min_seasons,fa_qualification_threshold,fa_qualify_note,salary_verified,fa_years_verified,players_master(full_name,primary_position,source_year,is_import,draft_year,data_confidence,official_cpbl_id,bats,throws,birth_date)')
          .eq('league_id',league.id).eq('team_id',pickTeam).order('master_player_id').limit(250),
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
      let stats=[],visual=[],salaryInfo=[];
      if(ids.length){
        const [st,vi,sa]=await Promise.all([
          db.from('cpbl_season_reference').select('master_player_id,league_level,team_id,batting,pitching').eq('season_year',2024).in('master_player_id',ids).limit(600),
          db.from('player_visual_profiles').select('master_player_id,model_status').in('master_player_id',ids).limit(250),
          db.from('player_salary_reference_2024').select('master_player_id,monthly_salary_ntd,evidence_type,source_url').in('master_player_id',ids).limit(250)
        ]);
        if(st.error||vi.error||sa.error)return fail(req,'PLAYER_SOURCE_READ_FAILED',503);
        stats=st.data||[];visual=vi.data||[];salaryInfo=sa.data||[];
      }
      const byId=new Map(),byVisual=new Map(visual.map(x=>[x.master_player_id,x.model_status])),bySalary=new Map(salaryInfo.map(x=>[x.master_player_id,x]));
      for(const item of stats){const list=byId.get(item.master_player_id)||[];list.push(item);byId.set(item.master_player_id,list);}
      const enriched=(players.data||[]).map(p=>({...p,reference_stats:byId.get(p.master_player_id)||[],salary_reference:bySalary.get(p.master_player_id)||null,visual_status:byVisual.get(p.master_player_id)||'missing'}));
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
