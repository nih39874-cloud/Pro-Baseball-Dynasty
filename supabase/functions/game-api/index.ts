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
    if (member.role === 'gm' ? league.kind !== 'gm' : league.kind !== 'official' || !member.team_id)
      return fail(req, 'MEMBERSHIP_INVALID', 403);
    const body = await req.json().catch(() => ({}));
    if (typeof body !== 'object' || !body) return fail(req, 'INVALID_REQUEST');
    const action = String(body.action || 'status');
    const pickTeam = String(body.team_id || member.team_id || '');
    const isGM = member.role === 'gm' && league.kind === 'gm';
    const allowedTeam = isGM ? teamIds.has(pickTeam) : pickTeam === member.team_id;
    const responseBase = { kind: league.kind, league_id: league.id, year: league.current_year, phase: league.season_phase,
      season_anchor_at: league.season_anchor_at, is_ready: league.is_ready, clock_enabled: league.clock_enabled, clock_last_tick: league.clock_last_tick, roster_source_status: league.roster_source_status, role: member.role,
      team_id: member.team_id, active_timeline_id: league.active_timeline_id };

    if (action === 'status') {
      const [fin, games, recent, champs] = await Promise.all([
        db.from('team_finances').select('team_id,cash_ntd,debt_ntd').eq('league_id', league.id).order('team_id'),
        db.from('games').select('id,season_year,home_team_id,away_team_id,scheduled_at,phase,home_score,away_score,season_stage,version')
          .eq('league_id', league.id).eq('timeline_id',league.active_timeline_id).eq('season_year',league.current_year)
          .gte('scheduled_at', new Date(Date.now() - 3600000).toISOString()).order('scheduled_at').limit(35),
        db.from('games').select('id,home_team_id,away_team_id,scheduled_at,home_score,away_score,phase,season_stage')
          .eq('league_id', league.id).eq('timeline_id',league.active_timeline_id).eq('season_year',league.current_year)
          .eq('phase','final').order('scheduled_at',{ascending:false}).limit(12),
        db.from('league_champions').select('season_year,team_id').eq('league_id',league.id).order('season_year',{ascending:false}).limit(10)
      ]);
      if (fin.error || games.error || recent.error || champs.error) return fail(req, 'DATABASE_READ_FAILED', 503);
      return json(req, { ok: true, ...responseBase, finances: fin.data, upcoming: games.data,
        recent: recent.data, champions: champs.data });
    }
    if (action === 'coach-config') {
      need(allowedTeam,'TEAM_NOT_ALLOWED');
      const [teamPlayers,configs,history]=await Promise.all([
        db.from('league_players')
          .select('master_player_id,team_id,roster_status,promotion_available_at,roster_changed_at,batting_rating,pitching_rating,fielding_rating,players_master(full_name,primary_position,bats,throws,source_year,draft_year)')
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
      let positions=[];
      if(ids.length){
        const pos=await db.from('player_position_2024')
          .select('master_player_id,league_level,position,games')
          .in('master_player_id',ids).order('games',{ascending:false}).limit(550);
        if(pos.error)return fail(req,'POSITION_DATA_READ_FAILED',503);
        positions=pos.data||[];
      }
      const byId=new Map();
      for(const r of positions){const v=byId.get(r.master_player_id)||[];v.push(r);byId.set(r.master_player_id,v);}
      return json(req,{ok:true,...responseBase,team_id:pickTeam,roster_limit:28,demotion_cooldown_seconds:14400,
        players:(teamPlayers.data||[]).map(x=>({...x,fielding_positions:byId.get(x.master_player_id)||[]})),
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
      const r=await db.rpc('server_move_player_level',{
        p_league:league.id,p_team:pickTeam,p_player:playerId,p_to:to,p_actor:user.id
      });
      return r.error?fail(req,r.error.message,409):json(req,{ok:true,...responseBase,move_result:r.data});
    }
    if (action === 'roster') {
      need(allowedTeam, 'TEAM_NOT_ALLOWED');
      const [players,rosters,offers] = await Promise.all([
        db.from('league_players').select('master_player_id,team_id,roster_status,monthly_salary_ntd,contract_years,fa_service_seasons,promotion_available_at,fa_service_initial_estimate,fa_initial_eligible_reported,fa_2024_service_reported,fa_usage_min_seasons,fa_qualification_threshold,fa_qualify_note,batting_rating,pitching_rating,fielding_rating,salary_verified,fa_years_verified,players_master(full_name,primary_position,source_year,is_import,draft_year,data_confidence,official_cpbl_id,bats,throws,birth_date)')
          .eq('league_id',league.id).eq('team_id',pickTeam).order('master_player_id').limit(250),
        db.from('roster_submissions').select('kind,player_ids,locked,auto_selected,submitted_at')
          .eq('league_id',league.id).eq('timeline_id',league.active_timeline_id).eq('season_year',league.current_year).eq('team_id',pickTeam),
        db.from('fa_offers').select('id,player_id,salary_ntd,years,status,created_at')
          .eq('league_id',league.id).eq('timeline_id',league.active_timeline_id).eq('bidder_team_id',pickTeam).order('created_at',{ascending:false}).limit(30)
      ]);
      if (players.error || rosters.error || offers.error) return fail(req,'ROSTER_READ_FAILED',503);
      const ids=(players.data||[]).map(p=>p.master_player_id);
      let stats=[],visual=[];
      if(ids.length){
        const [st,vi]=await Promise.all([
          db.from('cpbl_season_reference').select('master_player_id,league_level,team_id,batting,pitching').eq('season_year',2024).in('master_player_id',ids).limit(600),
          db.from('player_visual_profiles').select('master_player_id,model_status').in('master_player_id',ids).limit(250)
        ]);
        if(st.error||vi.error)return fail(req,'PLAYER_SOURCE_READ_FAILED',503);
        stats=st.data||[];visual=vi.data||[];
      }
      const byId=new Map(),byVisual=new Map(visual.map(x=>[x.master_player_id,x.model_status]));
      for(const item of stats){const list=byId.get(item.master_player_id)||[];list.push(item);byId.set(item.master_player_id,list);}
      const enriched=(players.data||[]).map(p=>({...p,reference_stats:byId.get(p.master_player_id)||[],visual_status:byVisual.get(p.master_player_id)||'missing'}));
      return json(req,{ok:true,...responseBase,team_id:pickTeam,players:enriched,rosters:rosters.data,offers:offers.data});
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
