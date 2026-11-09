// Server event-driven 3D baseball visualization. Cosmetic poses never determine a live result.
// No unresolved pitch coordinates are consulted or rendered.
const FIELDER_SPOTS = Object.freeze({P:[0,-18],C:[0,2],'1B':[20,-18],'2B':[9,-30],'3B':[-20,-18],SS:[-9,-30],LF:[-36,-66],CF:[0,-79],RF:[36,-66]});
const BASE_PATH = Object.freeze([[0,0],[23,-23],[0,-46],[-23,-23],[0,0]]);
export const FIELD_POSITIONS = FIELDER_SPOTS;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number.isFinite(Number(v))?Number(v):a));
const lerp=(a,b,t)=>a+(b-a)*t;
const mix=(a,b,t)=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t)];
const hasBallEvent=e=>['live_plate_appearance','pitch_released','pitch_swing','pitch_called','abs_review'].includes(e?.type);
/** Numeric team-side state extracted from the authorized live-api response. */
export function makeLiveSceneState(data,teamId,frame={}) {
 const game=data?.game||{};const match=data?.session?.state||{};
 const yourControl=(data?.controls||[]).find(c=>c.team_id===teamId);
 const isPlaying=yourControl?.active_mode==='player';
 const viewMode=yourControl?.active_mode==='coach'?'coach':isPlaying?'field':'auto';
 const bases=Array.isArray(match.bases)?match.bases.map(Boolean).slice(0,3):[false,false,false];
 // Once the server accepts a bounded movement intent, show a cosmetic displacement
 // of the selected character. This is not authoritative collision or physics.
 const intent=data?.own_motion;
 const currentKey=`${Number(match.inning)||1}:${match.half||'top'}:${Number(match[(match.half==='top'?'home':'away')+'_index'])||0}`;
 const sameAtBat=intent?.atbat_key===currentKey;
 const fielders={...(frame.fielders||{})};
 const runners=[...(frame.runners||[])];
 if(isPlaying&&sameAtBat&&intent?.role==='fielder'&&
   Object.prototype.hasOwnProperty.call(FIELDER_SPOTS,intent.selected_position)&&
   !Object.prototype.hasOwnProperty.call(fielders,intent.selected_position)){
   const base=FIELDER_SPOTS[intent.selected_position];
   fielders[intent.selected_position]=[base[0]+clamp(intent.direction_x,-1,1)*8,
     base[1]+clamp(intent.direction_z,-1,1)*8];
 }
 if(isPlaying&&sameAtBat&&intent?.role==='runner'&&!runners.length&&
    (intent.action==='run'||intent.action==='slide'||intent.action==='return')){
   const pos=runnerAnimation('1B',.28)||[0,0];
   runners.push([pos[0]+clamp(intent.direction_x,-1,1)*2,
     pos[1]+clamp(intent.direction_z,-1,1)*2]);
 }
 return {
  visitor:game.away_team_id||'dragons',home:game.home_team_id||'brothers',team:teamId||game.away_team_id||'dragons',
  half:match.half==='bottom'?'bottom':'top',inning:Number(match.inning)||1,outs:Number(match.outs)||0,
  atBat:Number(match.at_bat||match.atBat||1),bases,score:[Number(match.away_score??game.away_score??0),Number(match.home_score??game.home_score??0)],
  mode:viewMode,phase:frame.phase||'ready',ball:frame.ball||null,liveFielders:fielders,liveRunners:runners,
  selectedFielder:frame.selectedFielder||null,fielderPos:frame.fielderPos||null,runnerPos:frame.runnerPos||null,
  coachPos:{x:teamId===game.home_team_id?30:-30,z:5},aim:{x:0,y:0},pitchType:'four_seam',
 };
}
/** Scale ball direction into the field coordinate system (home plate is [0, 0]). */
export function ballLanding(sprayDegrees,distanceMeters) {
 const theta=clamp(sprayDegrees,-75,75)*Math.PI/180;
 const d=clamp(distanceMeters,0,135);
 return [Math.sin(theta)*d, -Math.cos(theta)*d];
}
export function runnerAnimation(result,progress) {
 const basesHit=({BB:1,'1B':1,'2B':2,'3B':3,HR:4})[result]||0;
 if(!basesHit)return null;
 const distance=clamp(progress,0,1)*basesHit;
 const segment=Math.min(3,Math.floor(distance)),t=distance-segment;
 return mix(BASE_PATH[segment],BASE_PATH[segment+1],t);
}
export function battedBallFrame(payload={},elapsedMs=0) {
 const spray=clamp(payload.spray_degrees,-65,65),distance=clamp(payload.ball_distance_m,3,130);
 const end=ballLanding(spray,distance),duration=clamp(1200+distance*22,1400,4050);
 const t=clamp(elapsedMs/duration,0,1),height=clamp(distance*.16,2,19);
 const x=lerp(0,end[0],t),z=lerp(-.5,end[1],t),y=.5+4*height*t*(1-t);
 const dt=.04,p=Math.max(0,t-dt);
 const last=[lerp(0,end[0],p),.5+4*height*p*(1-p),lerp(-.5,end[1],p)];
 const current=[x,y,z];
 const fielderKey=Object.prototype.hasOwnProperty.call(FIELDER_SPOTS,payload.field_position)?payload.field_position:null;
 const move=Math.min(1,t/.86);
 const fielders=fielderKey?{[fielderKey]:mix(FIELDER_SPOTS[fielderKey],end,move*.92)}:{};
 const runner=runnerAnimation(payload.result,Math.min(1,t*1.08));
 return {phase:'fielding',ball:t<1?{x,y,z,vx:(x-last[0])*20,vy:(y-last[1])*20,vz:(z-last[2])*20,visible:true,trail:true}:null,
  fielders,runners:runner?[runner]:[],runnerPos:runner?{x:runner[0],z:runner[1]}:null,
  selectedFielder:fielderKey?{key:fielderKey,pos:FIELDER_SPOTS[fielderKey]}:null,
  fielderPos:fielderKey?fielders[fielderKey]:null,finished:t>=1,duration};
}
export function pitchReleaseFrame(elapsedMs=0) {
 const t=clamp(elapsedMs/950,0,1);
 // Only the common central flight is shown. The true target and umpire call stay private.
 return {phase:'pitching',ball:t<1?{x:0,y:1.55+Math.sin(t*Math.PI)*.18,z:lerp(-18.1,-.25,t),vx:0,vy:0,vz:18.8,trail:true}:null,finished:t>=1};
}
export class LiveReplay {
 constructor(){this.gameId=null;this.eventId=null;this.startedAt=0;this.event=null;this.lastData=null;this.forceReplay=false;}
 reset(){this.gameId=null;this.eventId=null;this.startedAt=0;this.event=null;this.lastData=null;this.forceReplay=false;}
 ingest(data,now=performance.now()){
  const game=data?.game; if(!game?.id){this.reset();return;}
  if(this.gameId!==game.id){this.reset();this.gameId=game.id;}
  this.lastData=data;
  const events=Array.isArray(data?.events)?data.events:[];
  const latest=[...events].reverse().find(hasBallEvent);
  if(!latest)return;
  const id=`${game.id}:${latest.seq}:${latest.type}`;
  if(id!==this.eventId){this.eventId=id;this.event=latest;this.startedAt=now;}
 }
 replay(now=performance.now()) {if(this.event){this.startedAt=now;this.forceReplay=true;}}
 scene(teamId,now=performance.now()){
  const e=this.event,elapsed=Math.max(0,now-this.startedAt);
  let frame={};
  if(e?.type==='live_plate_appearance')frame=battedBallFrame(e.payload,elapsed);
  else if(e?.type==='pitch_released')frame=pitchReleaseFrame(elapsed);
  else if(e?.type==='pitch_swing')frame={phase:elapsed<550?'swinging':'ready',ball:null};
  else if(e?.type==='pitch_called')frame=pitchReleaseFrame(elapsed);
  return makeLiveSceneState(this.lastData,teamId,frame);
 }
}