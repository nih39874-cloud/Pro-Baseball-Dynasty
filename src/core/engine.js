import {accuracyWindow,trueStrike,umpireCall,addPitchCall,addOut,runBases,clamp,isOffense,currentRole} from './rules.js';
import {FIELDERS} from '../config.js';
import {persist,saveSnapshot,returnToYear,updateFunds} from './state.js';
function rand(a,b){return a+Math.random()*(b-a)}
export class GameEngine{
 constructor(state){this.s=state;this.onMessage=()=>{};this.onAtBat=()=>{};this.onUpdate=()=>{};this.freeze=false;this.outcome=null;this.meterSpeed=2.4;this.meterPhase=0;this.last=0;this.lastSave=0;}
 log(msg){this.s.events.unshift(`${this.s.inning}${this.s.half==='top'?'上':'下'}｜${msg}`);if(this.s.events.length>50)this.s.events.length=50;this.onMessage(msg);}
 setMode(mode){if(!['auto','coach','field'].includes(mode))return;if(mode===this.s.mode){this.s.pendingMode=null;return;}if(this.s.finished){this.s.mode=mode;return;}this.s.pendingMode=mode;this.log(`已排定切換「${{auto:'AI 自動',coach:'總教練',field:'場上球員'}[mode]}」，本打席結束後生效`);this.onUpdate();}
 applyPending(){if(this.s.pendingMode){this.s.mode=this.s.pendingMode;this.s.pendingMode=null;this.log(`已切換為${{auto:'AI 自動',coach:'總教練',field:'場上球員'}[this.s.mode]}`);}this.onAtBat();}
 selectPitch(name){this.s.pitchType=name;this.onUpdate();}
 setAim(x,y){this.s.aim.x=clamp(x,-1.25,1.25);this.s.aim.y=clamp(y,-1.25,1.25);}
 startMeter(){if(this.s.phase!=='ready'||currentRole(this.s)!=='pitcher')return;this.s.phase='meter';this.s.phaseTime=0;this.meterPhase=0;this.onUpdate();}
 releaseMeter(){if(this.s.phase!=='meter')return;const meter=(Math.sin(this.meterPhase)+1)/2;const width=accuracyWindow(this.s.aim.x*.82,.87+this.s.aim.y*.35,this.s.stamina);const error=Math.max(0,Math.abs(meter-.5)-width/2);this.s.phase='ready';this.throwPitch(error);}
 throwPitch(error=rand(0,.3),explicitAim=null){
 if(this.s.phase!=='ready')return;
 this.s.stamina=clamp(this.s.stamina-rand(.25,.65),0,100);
 const aim=explicitAim||this.s.aim, x=clamp(aim.x*.82+rand(-1,1)*(error*.65+(100-this.s.stamina)*.0018),-1.5,1.5),y=clamp(.87+aim.y*.36+rand(-1,1)*(error*.37+(100-this.s.stamina)*.002),.05,1.85);
 this.s.ball={x:0,y:1.52,z:-17.5,tx:x,ty:y,vx:0,vy:0,vz:18,visible:true,trail:true};
 this.s.phase='pitching';this.s.phaseTime=0;this.s.swing=null;this.s.lastPitch={x,y,pitchType:this.s.pitchType,speed:Math.round(129+rand(0,21)*(.6+.4*this.s.stamina/100)),trueStrike:trueStrike(x,y)};
 this.onUpdate();
 }
 swing(strong=false,bunt=false){if(this.s.phase!=='pitching'||this.s.swing)return;this.s.swing={at:this.s.phaseTime,strong,bunt,aim:{...this.s.aim}};this.onUpdate();}
 finishPitch(){
 const s=this.s,p=s.lastPitch; if(!p)return;let swung=!!s.swing;
 const humanBatter=currentRole(s)==='batter';
 if(!humanBatter){swung=Math.random()<(p.trueStrike?.72:.21);if(swung)s.swing={at:rand(.77,1.07),strong:Math.random()<.28,bunt:false,aim:{x:p.x/.82+rand(-.45,.45),y:(p.y-.87)/.36+rand(-.5,.5)}};}
 if(swung){const sw=s.swing,dt=Math.abs(sw.at-.88),dx=Math.abs(sw.aim.x*.82-p.x),dy=Math.abs((.87+sw.aim.y*.36)-p.y);const score=1-dt*2.0-dx*.48-dy*.5;
 if(score>.26||(!humanBatter&&Math.random()<.34)){this.ballInPlay(clamp(score,0,1),sw);return;}
 s.strikes++;this.log('揮棒落空！');if(s.strikes>=3){this.log('揮棒三振');addOut(s);this.applyPending();}s.phase='ready';s.phaseTime=0;return;
 }
 const actual=p.trueStrike,called=umpireCall(p.x,p.y);
 s.call={actual,called,timeLeft:3,x:p.x,y:p.y};s.phase='called';s.phaseTime=0;
 this.log(`主審判決：${called?'好球':'壞球'}${actual!==called?'（可挑戰）':''}`);
 this.onUpdate();
 }
 canABS(){const s=this.s;return s.phase==='called'&&s.call&&s.challenge.abs>0&&s.mode==='field';}
 absChallenge(){if(!this.canABS())return false;const s=this.s;const success=s.call.actual!==s.call.called;s.review={kind:'ABS',success,time:0,original:s.call.called,final:s.call.actual,x:s.call.x,y:s.call.y};if(!success)s.challenge.abs--;s.phase='abs';s.phaseTime=0;this.log(success?'ABS 挑戰成功，準備改判':'ABS 挑戰失敗，維持原判');this.onUpdate();return true;}
 finishCalled(forceActual=false){const s=this.s;if(!s.call)return;const called=forceActual?s.call.actual:s.call.called;s.call=null;let msg=addPitchCall(s,called);s.phase='ready';s.phaseTime=0;this.log(msg);if(msg==='三振出局'||msg==='四壞保送')this.applyPending();}
 ballInPlay(quality,sw){const s=this.s;const power=sw.strong?1.28:sw.bunt?.42:1.0;
 const angle=sw.bunt?rand(3,9):rand(8,55)*(quality>.78?1.16:1),heading=rand(-.95,.95)+(sw.aim.x*.10);
 const speed=(13+quality*35)*power; const vz=-Math.cos(heading)*speed*.80,vx=Math.sin(heading)*speed*.80;
 const vy=2+speed*Math.sin(angle*Math.PI/180)*.57;
 s.ball={x:0,y:.95,z:-.2,vx,vy,vz,visible:true,trail:true};s.phase='fielding';s.phaseTime=0;s.fieldChoice=null;s.selectedFielder=null;s.fielderPos=null;s.swing=null;
 const flight=Math.max(.65,2*vy/13.3);let land={x:vx*flight,y:0,z:-.2+vz*flight};
 const sorted=FIELDERS.filter(f=>!['C','P'].includes(f.key)||Math.hypot(land.x,land.z-f.pos[1])<36).map(f=>({...f,dist:Math.hypot(land.x-f.pos[0],land.z-f.pos[1])})).sort((a,b)=>a.dist-b.dist);
 s.landing=land;s.fieldCandidates=sorted.slice(0,2);s.selectedFielder=sorted[0];s.fielderPos={0:0,x:sorted[0].pos[0],z:sorted[0].pos[1]};s.ballFlight=flight;s.hitQuality=quality;s.ballOutcome=null;
 this.log(`擊出球！預估落點：${land.x<0?'左':'右'}側外野方向`);
 if(s.mode==='field'&&!isOffense(s)&&sorted[1]&&Math.abs(sorted[1].dist-sorted[0].dist)<10){s.fieldChoice={timeLeft:5,candidates:sorted.slice(0,2)};s.phase='fielderChoice';this.log('兩名守備員皆有接球機會，請在 5 秒內選擇');}
 this.onUpdate();
 }
 chooseFielder(key){const s=this.s;if(!s.fieldChoice)return;const f=s.fieldChoice.candidates.find(f=>f.key===key)||s.fieldChoice.candidates[0];s.selectedFielder=f;s.fielderPos={x:f.pos[0],z:f.pos[1]};s.fieldChoice=null;s.phase='fielding';this.log(`${f.label}接手守備`);this.onUpdate();}
 catchBall(){const s=this.s;if(s.phase!=='fielding')return;const f=s.fielderPos||s.selectedFielder?.pos;if(!f)return;const d=Math.hypot(s.ball.x-f.x,s.ball.z-f.z);if(d<9){s.ballOutcome='out';this.endPlay('漂亮接殺！',0);}else this.log('距離太遠，無法接球');}
 throwTo(base){const s=this.s;if(s.phase!=='fielding')return;s.throwTo=base;this.log(`野手傳向${{1:'一壘',2:'二壘',3:'三壘',4:'本壘'}[base]||'內野'}`);}
 resolveField(){const s=this.s;const l=s.landing,sel=s.selectedFielder,dist=Math.hypot(l.x-(s.fielderPos?.x??sel?.pos[0]??0),l.z-(s.fielderPos?.z??sel?.pos[1]??0));
 let hit=0;const outfield=Math.hypot(l.x,l.z)>100; if(outfield&&s.hitQuality>.72){hit=4;this.endPlay('全壘打！球飛出全壘打牆！',hit);return;}
 const fly=s.ballFlight>1.1;const caught=s.ballOutcome==='out'||(dist<8&&Math.random()<(s.mode==='field'&&!isOffense(s)?.50:.79));
 if(caught){this.endPlay(fly?'接殺出局！':'滾地球傳一壘封殺！',0);}else{hit=(Math.hypot(l.x,l.z)>68||s.hitQuality>.74)?2:1;this.endPlay(hit===2?'二壘安打！':'安打上壘！',hit);}
 }
 endPlay(message,hits){const s=this.s;s.ball=null;s.fieldChoice=null;s.ballOutcome=null;if(hits>0){const r=runBases(s,hits);this.log(message+(r?`，帶有 ${r} 分打點`:''));s.balls=0;s.strikes=0;s.atBat++;this.applyPending();}else{this.log(message);addOut(s);this.applyPending();}s.phase='ready';s.phaseTime=0;s.selectedFielder=null;s.fielderPos=null;if(s.inning>9&&s.half==='top'&&s.score[0]!==s.score[1]){s.finished=true;s.phase='finished';this.log('比賽結束！');}this.onUpdate();}
 fastForwardAtBat(){if(this.s.phase==='finished')return;const s=this.s;s.phase='ready';s.call=null;s.ball=null;s.fieldChoice=null;const r=Math.random();if(r<.50){addOut(s);this.log('AI 模擬：出局');}else if(r<.62){const x=addPitchCall(s,false);this.log('AI 模擬：'+x);}else if(r<.89){runBases(s,1);s.balls=0;s.strikes=0;s.atBat++;this.log('AI 模擬：一壘安打');}else{runBases(s,2);s.balls=0;s.strikes=0;s.atBat++;this.log('AI 模擬：二壘安打');}this.applyPending();this.onUpdate();}
 advanceGame(){for(let i=0;i<320&&!this.s.finished;i++)this.fastForwardAtBat();if(!this.s.finished){this.s.finished=true;this.s.phase='finished'}this.log('模擬完成');}
 resetGame(a='brothers',b='dragons'){const s=this.s;Object.assign(s,{visitor:a,home:b,team:a,mode:'auto',pendingMode:null,inning:1,half:'top',outs:0,balls:0,strikes:0,bases:[false,false,false],score:[0,0],pitchNumber:0,atBat:1,phase:'ready',phaseTime:0,ball:null,call:null,review:null,fieldChoice:null,selectedFielder:null,finished:false,stamina:100,challenge:{abs:2,replay:2},events:['比賽開始：'+a+' vs '+b]});this.onUpdate();}
 adminAdvanceSeasons(n=1){for(let i=0;i<n;i++){saveSnapshot(this.s);this.s.practice.year++;this.s.practice.timeline.push({year:this.s.practice.year,note:'GM 快轉建立',funds:{...this.s.practice.funds},at:Date.now()});}persist(this.s);this.log(`GM 快轉至 ${this.s.practice.year} 年`);this.onUpdate();}
 adminReturn(year){if(returnToYear(this.s,year))this.log(`GM 回到 ${year} 年存檔`);else this.log('該年份沒有存檔，無法回溯');this.onUpdate();}
 adminFunds(id,amount){updateFunds(this.s,id,amount);this.log('GM 資金調整成功');this.onUpdate();}
 update(dt){const s=this.s;dt=Math.min(.05,dt);if(s.finished)return;s.phaseTime+=dt;
 if(s.phase==='meter'){this.meterPhase+=dt*this.meterSpeed;return;}
 if(s.phase==='fielderChoice'){s.fieldChoice.timeLeft-=dt;if(s.fieldChoice.timeLeft<=0)this.chooseFielder(s.fieldChoice.candidates[0].key);return;}
 if(s.phase==='abs'){if(s.phaseTime>=3.9){this.finishCalled(true);s.review=null;}return;}
 if(s.phase==='called'){s.call.timeLeft-=dt;if(s.call.timeLeft<=0)this.finishCalled();return;}
 if(s.phase==='ready'){
  if(s.phaseTime<.9)return;
  if(currentRole(s)==='pitcher')return;
  // AI pitch to a human batter, or AI versus AI in watch / coach mode.
  const target={x:rand(-.95,.95),y:rand(-.85,.85)};if(currentRole(s)!=='batter')s.aim=target;this.throwPitch(rand(.02,.22),target);return;
 }
 if(s.phase==='pitching'){
  const t=s.phaseTime,p=s.lastPitch;if(s.ball){const k=clamp(t/.92,0,1);s.ball.x=p.x*k;s.ball.y=1.52+(p.y-1.52)*k+Math.sin(k*Math.PI)*.11;s.ball.z=-17.5+17.5*k;}
  if(t>=1.00){this.finishPitch();}return;
 }
 if(s.phase==='fielding'){
  const b=s.ball;if(!b)return;const t=s.phaseTime,flight=s.ballFlight;b.x=b.vx*t;b.z=-.2+b.vz*t;b.y=Math.max(.12,.95+b.vy*t-6.65*t*t);
  if(s.selectedFielder){const manual=s.mode==='field'&&!isOffense(s);if(!manual){const dest=s.landing;const dx=dest.x-s.fielderPos.x,dz=dest.z-s.fielderPos.z,l=Math.hypot(dx,dz)||1;s.fielderPos.x+=dx/l*Math.min(l,dt*21);s.fielderPos.z+=dz/l*Math.min(l,dt*21);}else{const v=s.fieldMove;s.fielderPos.x+=v.x*dt*15;s.fielderPos.z+=v.y*dt*15;}}
  if(t>=Math.max(.7,s.ballFlight))this.resolveField();
 }
 }
}
