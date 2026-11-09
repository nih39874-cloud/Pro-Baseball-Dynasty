// Dedicated, authenticated live-match API. Every write goes through a server-role-only SQL function.
// Browser credentials never receive a service key or unrestricted write access.
import {createClient} from 'npm:@supabase/supabase-js@2.58.0';
const url = Deno.env.get('SUPABASE_URL') ?? '';
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const db = createClient(url, secret, {auth:{persistSession:false,autoRefreshToken:false}});
const ALLOWED = new Set(['https://nih39874-cloud.github.io','http://localhost:4173','http://127.0.0.1:4173']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const commandTypes=new Set(['change_pitcher','pinch_hitter','bunt','steal','infield_in','intentional_walk','normal']);
const pitchTypes=new Set(['four_seam','two_seam','slider','curve','changeup','splitter','cutter','sinker']);
const normalized=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=-1.25&&v<=1.25;
function headers(req:Request){const origin=req.headers.get('origin')||'';return {'Access-Control-Allow-Origin':ALLOWED.has(origin)?origin:'https://nih39874-cloud.github.io','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Content-Type':'application/json; charset=utf-8'};}
function reply(req:Request,data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:headers(req)})}
function fail(req:Request,error:string,status=400){return reply(req,{ok:false,error},status)}
function assert(ok:unknown,code:string):asserts ok{if(!ok)throw new Error(code)}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(req)});
 if(req.method!=='POST')return fail(req,'METHOD_NOT_ALLOWED',405);
 if(!url||!secret)return fail(req,'SERVER_NOT_CONFIGURED',503);
 const token=(req.headers.get('authorization')||'').replace(/^Bearer /i,'');
 if(!token||token.length>5000)return fail(req,'LOGIN_REQUIRED',401);
 try{
  const {data:authed,error:authError}=await db.auth.getUser(token);
  if(authError||!authed.user)return fail(req,'INVALID_SESSION',401);
  const actor=authed.user.id;
  const {data:memberships,error:memberError}=await db.from('memberships').select('league_id,team_id,role').eq('user_id',actor).limit(2);
  if(memberError||memberships?.length!==1)return fail(req,'MEMBERSHIP_NOT_READY',403);
  const member=memberships[0];
  const {data:league,error:leagueError}=await db.from('leagues').select('id,kind,current_year,active_timeline_id,clock_enabled,is_ready').eq('id',member.league_id).single();
  if(leagueError||!league)return fail(req,'LEAGUE_NOT_FOUND',404);
  const isGM=member.role==='gm'&&league.kind==='gm';
  if(!isGM&&(member.role!=='manager'||league.kind!=='official'||!member.team_id))return fail(req,'MEMBERSHIP_INVALID',403);
  const body=await req.json().catch(()=>null);
  assert(body&&typeof body==='object'&&!Array.isArray(body),'INVALID_BODY');
  const action=String(body.action||'list');
  if(action==='list'){
    let query=db.from('games').select('id,home_team_id,away_team_id,scheduled_at,phase,home_score,away_score,version,season_stage')
     .eq('league_id',league.id).eq('timeline_id',league.active_timeline_id).eq('season_year',league.current_year)
     .gte('scheduled_at',new Date(Date.now()-4*3600*1000).toISOString()).order('scheduled_at').limit(45);
    if(!isGM)query=query.or(`home_team_id.eq.${member.team_id},away_team_id.eq.${member.team_id}`);
    const {data,error}=await query;
    if(error)return fail(req,'LIVE_LIST_FAILED',503);
    return reply(req,{ok:true,games:data||[],clock_enabled:league.clock_enabled,kind:league.kind,year:league.current_year});
  }
  assert(typeof body.game_id==='string'&&UUID.test(body.game_id),'INVALID_GAME_ID');
  const gameId=body.game_id;
  const {data:game,error:gameError}=await db.from('games').select('id,league_id,timeline_id,season_year,home_team_id,away_team_id,scheduled_at,phase,home_score,away_score,game_state,version')
   .eq('id',gameId).eq('league_id',league.id).eq('timeline_id',league.active_timeline_id).single();
  if(gameError||!game)return fail(req,'GAME_NOT_FOUND',404);
  const participates=game.home_team_id===member.team_id||game.away_team_id===member.team_id;
  if(!isGM&&!participates)return fail(req,'GAME_NOT_ALLOWED',403);
  if(action==='status'){
    const [sess,control,events,pitch]=await Promise.all([
      db.from('match_sessions').select('state,version,updated_at,completed_at').eq('game_id',gameId).maybeSingle(),
      db.from('match_team_controls').select('team_id,active_mode,pending_mode,last_heartbeat_at,abs_remaining').eq('game_id',gameId),
      db.from('game_events').select('seq,type,payload,created_at').eq('game_id',gameId).order('seq',{ascending:false}).limit(35),
      db.from('match_pitch_states').select('balls,strikes,pitch_no,pending_pitch,review,last_outcome,updated_at').eq('game_id',gameId).maybeSingle()
    ]);
    if(sess.error||control.error||events.error||pitch.error)return fail(req,'MATCH_READ_FAILED',503);
    const ps=pitch.data;
    // Keep unresolved pitch position and private umpire verdict on the server.
    // Realtime callbacks trigger a fresh authorized status read, never broadcast private coordinates.
    const publicPitch=ps?.pending_pitch?{id:ps.pending_pitch.id,
      pitch_type:ps.pending_pitch.pitch_type,released_at:ps.pending_pitch.released_at,
      speed_kmh:ps.pending_pitch.speed_kmh,stamina_percent:ps.pending_pitch.stamina_percent}:null;
    const review=ps?.review?{pitch_id:ps.review.pitch_id,until:ps.review.until,called_strike:ps.review.called_strike}:null;
    return reply(req,{ok:true,game,session:sess.data,controls:control.data||[],events:(events.data||[]).reverse(),
      pitch_state:ps?{balls:ps.balls,strikes:ps.strikes,pitch_no:ps.pitch_no,pending_pitch:publicPitch,review,
        last_outcome:ps.last_outcome,updated_at:ps.updated_at}:null,clock_enabled:league.clock_enabled});
  }
  const teamId=isGM?String(body.team_id||''):member.team_id;
  if(!teamId||![game.home_team_id,game.away_team_id].includes(teamId))return fail(req,'CONTROL_TEAM_NOT_PARTICIPANT',403);
  if(!isGM&&body.team_id&&body.team_id!==member.team_id)return fail(req,'TEAM_NOT_ALLOWED',403);
  if(!league.clock_enabled||!league.is_ready)return fail(req,'LEAGUE_PAUSED',409);
  let response;
  if(action==='join'){
    response=await db.rpc('server_live_start',{p_game:gameId});
  }else if(action==='mode'){
    const mode=String(body.mode||'');
    assert(['auto','coach','player'].includes(mode),'MODE_NOT_AVAILABLE');
    response=await db.rpc('server_live_control',{p_game:gameId,p_team:teamId,p_mode:mode,p_actor:actor});
  }else if(action==='tick'){
    if(game.phase!=='live')return fail(req,'MATCH_NOT_RUNNING',409);
    response=await db.rpc('server_manual_tick',{p_game:gameId});
  }else if(action==='pitch'){
    const x=body.x,y=body.y,quality=body.quality;
    const kind=String(body.pitch_type||'four_seam'),cmd=String(body.command_id||'');
    assert(normalized(x)&&normalized(y)&&typeof quality==='number'&&quality>=0&&quality<=1&&pitchTypes.has(kind)&&UUID.test(cmd),'INVALID_PITCH_INPUT');
    response=await db.rpc('server_manual_pitch',{p_game:gameId,p_team:teamId,p_x:x,p_y:y,p_quality:quality,
      p_pitch_type:kind,p_command:cmd,p_actor:actor});
  }else if(action==='bat'){
    const x=body.x,y=body.y,timing=body.timing,kind=String(body.kind||''),cmd=String(body.command_id||'');
    assert(normalized(x)&&normalized(y)&&typeof timing==='number'&&Number.isFinite(timing)&&timing>=-1&&timing<=1
      &&['swing','take'].includes(kind)&&UUID.test(cmd),'INVALID_BAT_INPUT');
    response=await db.rpc('server_manual_bat',{p_game:gameId,p_team:teamId,p_action:kind,p_x:x,p_y:y,
      p_timing:timing,p_command:cmd,p_actor:actor});
  }else if(action==='abs'){
    const cmd=String(body.command_id||'');assert(UUID.test(cmd),'INVALID_COMMAND_ID');
    response=await db.rpc('server_manual_abs',{p_game:gameId,p_team:teamId,p_command:cmd,p_actor:actor});
  }else if(action==='heartbeat'){
    response=await db.rpc('server_live_heartbeat',{p_game:gameId,p_team:teamId,p_actor:actor});
  }else if(action==='command'){
    const kind=String(body.kind||'');
    assert(commandTypes.has(kind),'INVALID_COACH_COMMAND');
    const cmdId=String(body.command_id||'');assert(UUID.test(cmdId),'INVALID_COMMAND_ID');
    const player=body.player_id==null?null:Number(body.player_id);
    if(kind==='change_pitcher'||kind==='pinch_hitter')assert(Number.isSafeInteger(player)&&player>0,'INVALID_SUBSTITUTE');
    response=await db.rpc('server_live_coach_command',{p_game:gameId,p_team:teamId,p_kind:kind,p_player:player,p_command_id:cmdId,p_actor:actor});
  }else return fail(req,'UNKNOWN_ACTION',404);
  if(response.error){
   // Return a short validation code only, not internal database details.
   const msg=String(response.error.message||'');
   const match=msg.match(/^([A-Z][A-Z0-9_]*)(?:\s|$)/);
   return fail(req,match?.[1]||'MATCH_COMMAND_REJECTED',409);
  }
  return reply(req,{ok:true,value:response.data});
 }catch(error){
  const msg=error instanceof Error?error.message:'REQUEST_FAILED';
  return fail(req,/^[A-Z0-9_]+$/.test(msg)?msg:'REQUEST_FAILED',400);
 }
});