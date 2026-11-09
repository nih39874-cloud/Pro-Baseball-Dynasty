// Diamond Dynasty live match API. Server-authoritative at-bat coaching, not frame-level 3D physics.
import {createClient} from 'npm:@supabase/supabase-js@2.58.0';

const url=Deno.env.get('SUPABASE_URL')??'';
const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const ALLOWED=new Set(['https://nih39874-cloud.github.io','http://localhost:4173','http://127.0.0.1:4173']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODES=new Set(['auto','coach']);
const COMMANDS=new Set(['change_pitcher','pinch_hitter','bunt','steal','infield_in','intentional_walk','normal']);
function headers(req:Request){const origin=req.headers.get('origin')??'';
 return {'Access-Control-Allow-Origin':ALLOWED.has(origin)?origin:'https://nih39874-cloud.github.io',
 'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
 'Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json; charset=utf-8','Vary':'Origin'};}
function reply(req:Request,obj:unknown,status=200){return new Response(JSON.stringify(obj),{status,headers:headers(req)});}
function fail(req:Request,message:string,status=400){return reply(req,{ok:false,error:message},status);}
function validUuid(s:unknown):s is string{return typeof s==='string'&&UUID.test(s);}
function rpcError(msg:string){const m=msg.match(/(?:^|\s)([A-Z][A-Z0-9_]{3,})(?:$|\s)/);return m?.[1]??'COMMAND_REJECTED';}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(req)});
 if(req.method!=='POST')return fail(req,'METHOD_NOT_ALLOWED',405);
 if(!url||!secret)return fail(req,'SERVER_NOT_CONFIGURED',503);
 const authorization=req.headers.get('authorization')||'';
 if(!authorization.startsWith('Bearer '))return fail(req,'LOGIN_REQUIRED',401);
 const token=authorization.slice(7).trim();if(!token||token.length>5000)return fail(req,'LOGIN_REQUIRED',401);
 try{
  const {data:auth,error:authError}=await db.auth.getUser(token);
  if(authError||!auth.user)return fail(req,'INVALID_SESSION',401);
  const uid=auth.user.id;
  const {data:members,error:memberError}=await db.from('memberships')
   .select('league_id,team_id,role').eq('user_id',uid).limit(2);
  if(memberError||!members||members.length!==1)return fail(req,'MEMBERSHIP_NOT_READY',403);
  const member=members[0];
  const {data:league,error:leagueError}=await db.from('leagues').select('id,kind,current_year,active_timeline_id,clock_enabled,is_ready')
    .eq('id',member.league_id).single();
  if(leagueError||!league)return fail(req,'LEAGUE_NOT_FOUND',404);
  if(member.role==='gm'?(league.kind!=='gm'):(member.role!=='manager'||league.kind!=='official'||!member.team_id))
   return fail(req,'INVALID_MEMBERSHIP',403);
  const body=await req.json().catch(()=>null);
  if(!body||typeof body!=='object'||Array.isArray(body))return fail(req,'INVALID_BODY');
  const action=String(body.action||'list');
  const selected=String(body.team_id||member.team_id||'');
  const gm=member.role==='gm'&&league.kind==='gm';
  if(action==='list'){
    const start=new Date(Date.now()-7200000).toISOString(),end=new Date(Date.now()+5*86400000).toISOString();
    const {data,error}=await db.from('games')
      .select('id,home_team_id,away_team_id,scheduled_at,phase,home_score,away_score,season_stage')
      .eq('league_id',league.id).eq('timeline_id',league.active_timeline_id).eq('season_year',league.current_year)
      .gte('scheduled_at',start).lte('scheduled_at',end).order('scheduled_at').limit(75);
    if(error)return fail(req,'MATCH_LIST_UNAVAILABLE',503);
    return reply(req,{ok:true,league_kind:league.kind,clock_enabled:league.clock_enabled,year:league.current_year,games:data||[]});
  }
  if(!validUuid(body.game_id))return fail(req,'INVALID_GAME_ID');
  const gameId=body.game_id;
  const {data:game,error:gameError}=await db.from('games')
    .select('id,league_id,timeline_id,season_year,season_stage,home_team_id,away_team_id,phase,home_score,away_score,scheduled_at,version')
    .eq('id',gameId).single();
  if(gameError||!game||game.league_id!==league.id||game.timeline_id!==league.active_timeline_id)
    return fail(req,'GAME_NOT_FOUND',404);
  const participant=[game.home_team_id,game.away_team_id];
  if(!gm&&!participant.includes(member.team_id))return fail(req,'ONLY_PARTICIPATING_TEAM',403);
  if(action==='status'){
    const [s,c,events,coach]=await Promise.all([
      db.from('match_sessions').select('game_id,state,version,updated_at,completed_at').eq('game_id',gameId).maybeSingle(),
      db.from('match_team_controls').select('team_id,active_mode,pending_mode,last_heartbeat_at').eq('game_id',gameId),
      db.from('game_events').select('seq,type,payload,created_at').eq('game_id',gameId).order('seq',{ascending:false}).limit(15),
      db.from('match_coach_actions').select('team_id,action_type,player_id,created_at').eq('game_id',gameId).order('created_at',{ascending:false}).limit(12)
    ]);
    if(s.error||c.error||events.error||coach.error)return fail(req,'MATCH_STATUS_UNAVAILABLE',503);
    return reply(req,{ok:true,game,session:s.data,controls:c.data||[],events:(events.data||[]).reverse(),
      coach_actions:coach.data||[],your_team:gm?selected:member.team_id,server_time:new Date().toISOString()});
  }
  const team=gm?selected:member.team_id;
  if(!participant.includes(team))return fail(req,'INVALID_CONTROL_TEAM',403);
  if(!league.clock_enabled||!league.is_ready)return fail(req,'LEAGUE_PAUSED',409);
  if(action==='join'){
    const res=await db.rpc('server_live_start',{p_game:gameId});
    return res.error?fail(req,rpcError(res.error.message),409):reply(req,{ok:true,state:res.data,game_id:gameId});
  }
  if(action==='mode'){
    const mode=String(body.mode||'');
    if(!MODES.has(mode))return fail(req,'REMOTE_PLAYER_CONTROLS_NOT_READY',409);
    const res=await db.rpc('server_live_control',{p_game:gameId,p_team:team,p_mode:mode,p_actor:uid});
    return res.error?fail(req,rpcError(res.error.message),409):reply(req,{ok:true,control:res.data});
  }
  if(action==='heartbeat'){
    const res=await db.rpc('server_live_heartbeat',{p_game:gameId,p_team:team,p_actor:uid});
    return res.error?fail(req,'HEARTBEAT_FAILED',409):reply(req,{ok:true,active:res.data});
  }
  if(action==='command'){
    const kind=String(body.kind||'');
    if(!COMMANDS.has(kind))return fail(req,'INVALID_COACH_COMMAND');
    if(!validUuid(body.command_id))return fail(req,'INVALID_COMMAND_ID');
    const player=(kind==='change_pitcher'||kind==='pinch_hitter')?Number(body.player_id):null;
    if(player!==null&&(!Number.isSafeInteger(player)||player<=0))return fail(req,'INVALID_PLAYER_ID');
    const res=await db.rpc('server_live_coach_command',{p_game:gameId,p_team:team,
      p_kind:kind,p_player:player,p_command_id:body.command_id,p_actor:uid});
    return res.error?fail(req,rpcError(res.error.message),409):reply(req,{ok:true,result:res.data});
  }
  return fail(req,'UNKNOWN_ACTION',404);
 }catch(err){return fail(req,'REQUEST_FAILED',500);}
});
