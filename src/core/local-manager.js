// Offline team-management sandbox. Independent from the official Supabase league.
// Actual team ownership, salary, FA years and positional eligibility are NOT inferred.
export const FARM_COOLDOWN_MS=4*60*60*1000;
export const ACTIVE_LIMIT=28;
export const DEFENSE_KEYS=['P','C','1B','2B','3B','SS','LF','CF','RF'];
const STORE='pbd_local_management_v1';
const canonical=p=>String(p.id);
const isPitcher=p=>p.primary_position==='P'||Number(p.pitching_outs_2024||0)>0;
const power=p=>isPitcher(p)?Number(p.pitching_outs_2024||0):Number(p.batting_pa_2024||0);
function initialTeam(players){
 const sorted=players.slice().sort((a,b)=>power(b)-power(a));
 const pitchers=sorted.filter(isPitcher).slice(0,11);
 const others=sorted.filter(p=>!isPitcher(p)).slice(0,ACTIVE_LIMIT-pitchers.length);
 const active=new Set([...pitchers,...others].map(canonical));
 const ordered=others.slice(0,9).map(canonical);
 const positions={P:canonical(pitchers[0]||sorted[0]),C:ordered[0], '1B':ordered[1],'2B':ordered[2],'3B':ordered[3],SS:ordered[4],LF:ordered[5],CF:ordered[6],RF:ordered[7]};
 return {active:[...active],cooldowns:{},lineups:{},defaultLineup:{batting:ordered,defense:positions},notes:[]};
}
export function localManagementSeed(catalog,teamIds){
 const groups=new Map(teamIds.map(id=>[id,[]]));
 for(const p of catalog||[])if(groups.has(p.team_id))groups.get(p.team_id).push(p);
 const teams={};for(const [id,players] of groups)teams[id]=initialTeam(players);
 return {version:1,teams};
}
function safeRead(storage){
 try{const raw=JSON.parse(storage.getItem(STORE)||'null');if(raw?.version===1&&raw.teams&&typeof raw.teams==='object')return raw;}catch{}
 return null;
}
export class LocalManager {
 constructor(catalog,teamIds,storage=globalThis.localStorage){
  this.storage=storage;this.players=new Map((catalog||[]).map(p=>[canonical(p),p]));
  this.teamIds=teamIds;
  this.base=localManagementSeed(catalog,teamIds);
  const saved=safeRead(storage);
  this.data=saved||this.base;
  // Protect newly added teams without resetting old saves.
  for(const id of teamIds)if(!this.data.teams[id])this.data.teams[id]=this.base.teams[id];
 }
 team(id){const t=this.data.teams[id];if(!t)throw Error('找不到球隊');return t;}
 members(teamId){return [...this.players.values()].filter(p=>p.team_id===teamId);}
 active(teamId){const active=new Set(this.team(teamId).active);return this.members(teamId).filter(p=>active.has(canonical(p)));}
 save(){try{this.storage?.setItem(STORE,JSON.stringify(this.data));}catch{}}
 move(teamId,id,toActive,now=Date.now()){
  const t=this.team(teamId),p=this.players.get(String(id));
  if(!p||p.team_id!==teamId)throw Error('找不到球隊所屬球員');
  const key=canonical(p),has=t.active.includes(key);
  if(toActive&&has||!toActive&&!has)throw Error('球員目前已在該層級');
  if(toActive){
   if(t.active.length>=ACTIVE_LIMIT)throw Error('一軍最多登錄 28 人，請先下放其他球員');
   const ready=Number(t.cooldowns[key]||0);
   if(now<ready)throw Error('下二軍後仍在 4 小時升上一軍冷卻中');
   t.active.push(key);delete t.cooldowns[key];
  }else{
   t.active=t.active.filter(x=>x!==key);
   t.cooldowns[key]=now+FARM_COOLDOWN_MS;
   for(const preset of Object.values(t.lineups))if(preset.batting.includes(key)||Object.values(preset.defense).includes(key))preset.needsReview=true;
  }
  this.save();return true;
 }
 getLineup(teamId,opponentId){
  const t=this.team(teamId);
  return t.lineups[opponentId]||{...t.defaultLineup,needsReview:true};
 }
 saveLineup(teamId,opponentId,batting,defense){
  if(opponentId===teamId||!this.teamIds.includes(opponentId))throw Error('無效的對戰球隊');
  const t=this.team(teamId),set=new Set(t.active),order=batting.map(String);
  const defensive=Object.fromEntries(DEFENSE_KEYS.map(k=>[k,String(defense[k]||'')]));
  if(order.length!==9||new Set(order).size!==9||order.some(id=>!set.has(id)))throw Error('打序必須由九名不同的一軍球員組成');
  const ids=Object.values(defensive);
  if(ids.length!==9||new Set(ids).size!==9||ids.some(id=>!set.has(id)))throw Error('守備九個位置必須由不同的一軍球員擔任');
  if(order.includes(defensive.P))throw Error('指定打擊制下投手不可排入打序');
  if(DEFENSE_KEYS.filter(k=>k!=='P').some(k=>!order.includes(defensive[k])))throw Error('八名非投手守備員必須列在先發打序');
  if(!isPitcher(this.players.get(defensive.P)))throw Error('投手位置必須選擇投手');
  t.lineups[opponentId]={batting:order,defense:defensive,needsReview:false,updatedAt:Date.now()};
  this.save();return t.lineups[opponentId];
 }
 summary(teamId){
  const members=this.members(teamId),active=this.active(teamId);
  return {members:members.length,active:active.length,reserve:members.length-active.length,opponents:Object.keys(this.team(teamId).lineups).length};
 }
}
