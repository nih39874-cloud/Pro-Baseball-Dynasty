import {renderCoachSetup,validateCoachSelection,FIELDING_POSITIONS} from './coach-setup.js';
import {renderLivePanel} from './live-view.js';
import {liveApi,subscribeLiveGame} from '../backend/live.js';
import {renderRosterRow} from './player-summary.js';
import {signIn,signOut,apiCall,getSessionMetadata} from '../backend/auth.js';
import {TEAMS,START_FUNDS,INITIAL_SEASON,BACKEND} from '../config.js';
import {currentRole,isOffense,accuracyWindow} from '../core/rules.js';
const $=id=>document.getElementById(id);
const fmt=n=>(n/100000000).toFixed(2)+' 億';
function escapeHtml(t){return String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
export class GameUI{
 constructor(engine){this.e=engine;this.state=engine.s;this.modal='intro';this.lastMessage='';this.lastStamp=0;this.lastRole='';this.lastStatus='';this.lastPhase='';this.lastInning='';this.batToggle=false;this.remote=null;this.remoteRoster=null;this.remoteFA=null;this.remoteCoach=null;this.coachOpponent=null;this.coachDraft=null;this.liveList=null;this.liveSelected=null;this.liveData=null;this.liveRoster=null;this.liveStop=null;this.liveTimer=null;this.liveHeartbeat=null;this.liveLoading=false;this.working=false;this.bind();this.showModal('intro');}
 bind(){
 $('btn-menu').addEventListener('click',()=>this.showModal('dashboard'));
 $('modeBar').addEventListener('click',e=>{const b=e.target.closest('[data-mode]');if(b)this.e.setMode(b.dataset.mode)});
 $('actionArea').addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const act=b.dataset.act;if(act==='pitch'){if(this.state.phase==='ready')this.e.startMeter();else if(this.state.phase==='meter')this.e.releaseMeter();}
 else if(act==='swing')this.e.swing(false,false);else if(act==='power')this.e.swing(true,false);else if(act==='bunt')this.e.swing(false,true);
 else if(act==='abs')this.e.absChallenge();else if(act==='review')this.openToast('重播挑戰：目前練習引擎尚未連接重播審查');
 else if(act.startsWith('ball:'))this.e.selectPitch(act.split(':')[1]);
 else if(act.startsWith('throw:'))this.e.throwTo(Number(act.split(':')[1]));else if(act==='catch')this.e.catchBall();
 else if(act==='dash')this.state.runnerBoost=true;
 else if(act==='tactics')this.showModal('tactics');else if(act==='pause')this.showModal('dashboard');
 this.renderActions();});
 $('fieldChoice').addEventListener('click',e=>{const b=e.target.closest('[data-player]');if(b)this.e.chooseFielder(b.dataset.player)});
 $('modalBody').addEventListener('click',e=>this.handleModalClick(e).catch(err=>this.openToast(err.message||'操作失敗')));
 $('modalBody').addEventListener('change',e=>{if(e.target.id==='chooseOpp'){this.selectedOpp=e.target.value}});
 this.e.onMessage=msg=>{this.openToast(msg);this.render()};this.e.onUpdate=()=>this.render();
 }
 openToast(msg){$('toast').textContent=msg;$('toast').classList.add('shown');clearTimeout(this.toastHandle);this.toastHandle=setTimeout(()=>$('toast').classList.remove('shown'),1400)}
 showModal(type){if(type!=='live')this.stopLiveWatcher();this.modal=type;$('modal').classList.remove('hidden');this.renderModal();if(this.remote&&['dashboard','finance','season','gm','roster','fa','coach','live'].includes(type))this.loadRemote(type)}
 hideModal(){this.stopLiveWatcher();$('modal').classList.add('hidden');this.modal='';}
 async handleModalClick(e){const b=e.target.closest('[data-nav],[data-team],[data-start],[data-gm],[data-quick],[data-restart],[data-login],[data-logout],[data-refresh],[data-submit-roster],[data-offer],[data-coach-opponent],[data-coach-save],[data-coach-autofill],[data-coach-move],[data-live-select],[data-live-join],[data-live-mode],[data-live-cmd],[data-live-refresh]');if(!b)return;
 if(b.dataset.login!==undefined){if(this.working)return;const username=$('loginUser')?.value?.trim();const password=$('loginPass')?.value||'';this.working=true;try{const r=await signIn(username,password);this.remote=r.status;this.state.team=r.status.team_id||this.state.team;this.openToast('登入成功：'+(r.status.role==='gm'?'GM':'球隊經理人'));this.showModal('dashboard');}finally{this.working=false;}return;}
 if(b.dataset.logout!==undefined){await signOut();this.remote=null;this.remoteRoster=null;this.remoteFA=null;this.remoteCoach=null;this.coachDraft=null;$('connection').textContent='LOCAL';this.openToast('已登出正式聯盟');this.showModal('auth');return;}
 if(b.dataset.refresh!==undefined){await this.loadRemote(this.modal);return;}
 if(b.dataset.submitRoster!==undefined){if(!this.remote)return;const kind=b.dataset.submitRoster;const ids=[...$('modalBody').querySelectorAll('[data-roster-pick]:checked')].map(x=>Number(x.value));const cap=kind==='playoff32'?32:60;if(ids.length>cap)throw Error('超過 '+cap+' 人名單上限');await apiCall('submit-roster',{team_id:this.viewTeam(),kind,player_ids:ids});this.openToast('已儲存名單');await this.loadRemote('roster');return;}
 if(b.dataset.offer!==undefined){if(!this.remote)return;const playerId=Number($('faPlayer')?.value),salary=Number($('faSalary')?.value),years=Number($('faYears')?.value);await apiCall('offer-fa',{team_id:this.viewTeam(),player_id:playerId,salary_ntd:salary,years});this.openToast('接洽已送出');await this.loadRemote('fa');return;}

 if(b.dataset.liveSelect!==undefined){await this.watchLive(b.dataset.liveSelect);return;}
 if(b.dataset.liveJoin!==undefined){await this.watchLive(b.dataset.liveJoin,true);return;}
 if(b.dataset.liveRefresh!==undefined){await this.loadRemote('live');if(this.liveSelected)await this.fetchLiveGame();return;}
 if(b.dataset.liveMode!==undefined){
  if(!this.liveSelected)throw Error('請先選擇比賽');
  await liveApi('mode',{game_id:this.liveSelected,team_id:this.viewTeam(),mode:b.dataset.liveMode});
  await this.fetchLiveGame();this.openToast('控制模式已更新');return;
 }
 if(b.dataset.liveCmd!==undefined){
  if(!this.liveSelected)throw Error('請先選擇比賽');
  const kind=b.dataset.liveCmd;
  const player=kind==='change_pitcher'?Number($('livePitcher')?.value):kind==='pinch_hitter'?Number($('livePinch')?.value):null;
  if((kind==='change_pitcher'||kind==='pinch_hitter')&&(!Number.isSafeInteger(player)||player<=0))throw Error('請先選擇球員');
  await liveApi('command',{game_id:this.liveSelected,team_id:this.viewTeam(),kind,player_id:player,command_id:crypto.randomUUID()});
  this.openToast('戰術指令已由伺服器接受');await this.fetchLiveGame();return;
 }
 if(b.dataset.coachOpponent!==undefined){this.coachOpponent=b.dataset.coachOpponent;this.coachDraft=null;this.renderModal();return;}
 if(b.dataset.coachAutofill!==undefined){
  const data=await apiCall('coach-default',{team_id:this.viewTeam()});
  this.coachDraft={batting_order:data.default_lineup.batting_order,defense:data.default_lineup.defense,needs_review:false};
  this.renderModal();this.openToast('已重新排列，請確認後儲存');return;
 }
 if(b.dataset.coachSave!==undefined){
  if(!this.remoteCoach)return;
  const content=$('modalBody');
  const batting=[...content.querySelectorAll('[data-coach-bat]')].sort((a,b)=>Number(a.dataset.coachBat)-Number(b.dataset.coachBat)).map(x=>Number(x.value));
  const defense=Object.fromEntries([...content.querySelectorAll('[data-coach-position]')].map(x=>[x.dataset.coachPosition,Number(x.value)]));
  const error=validateCoachSelection(batting,defense,this.remoteCoach.players||[]);
  if(error)throw Error(error);
  await apiCall('coach-save',{team_id:this.viewTeam(),opponent_team_id:this.coachOpponent,batting_order:batting,defense});
  this.coachDraft=null;this.openToast('已保存對戰專用打序與守備');await this.loadRemote('coach');return;
 }
 if(b.dataset.coachMove!==undefined){
  if(!this.remoteCoach)return;
  const player=Number(b.dataset.coachPlayer),level=b.dataset.coachMove;
  await apiCall('coach-move',{team_id:this.viewTeam(),player_id:player,to_level:level});
  this.coachDraft=null;
  this.openToast(level==='active'?'球員已升上一軍':'球員已降二軍，四小時冷卻開始');
  await this.loadRemote('coach');return;
 }
 if(b.dataset.nav){if(b.dataset.nav==='close'){this.hideModal();return;}this.showModal(b.dataset.nav);return;}
 if(b.dataset.team){if(this.remote&&this.remote.role!=='gm')throw Error('正式聯盟不能更換自己的球隊');this.state.team=b.dataset.team;this.state.practice.selectedTeam=b.dataset.team;this.renderModal();if(this.remote&&['roster','coach','live'].includes(this.modal)){this.coachOpponent=null;this.coachDraft=null;await this.loadRemote(this.modal);}return;}
 if(b.dataset.start){const opp=this.selectedOpp||TEAMS.find(t=>t.id!==this.state.team).id;this.e.resetGame(this.state.team,opp);this.hideModal();this.render();return;}
 if(b.dataset.restart){this.e.resetGame(this.state.team,this.state.home===this.state.team?this.state.visitor:this.state.home);this.hideModal();return;}
 if(b.dataset.quick){if(b.dataset.quick==='atbat')this.e.fastForwardAtBat();if(b.dataset.quick==='game')this.e.advanceGame();this.renderModal();return;}
 if(b.dataset.gm&&this.remote){if(this.remote.role!=='gm')throw Error('僅 GM 可以修改');const cmd=b.dataset.gm;let payload={};let action='';if(cmd==='year'){action='gm-advance';}if(cmd==='back'){action='gm-rewind';payload.year=Number($('returnYear')?.value||this.remote.year);}if(cmd==='money'){action='gm-funds';payload.team_id=$('gmTeam')?.value;payload.amount_ntd=Number($('gmFunds')?.value);}if(!action)return;const result=await apiCall(action,payload);this.openToast('GM 伺服器操作完成');await this.loadRemote('gm');return;}
 if(b.dataset.gm){const cmd=b.dataset.gm;if(cmd==='year'){const x=Number($('addYears').value||1);this.e.adminAdvanceSeasons(Math.min(40,Math.max(1,x)));}if(cmd==='back'){this.e.adminReturn(Number($('returnYear').value||2024));}if(cmd==='money'){const team=$('gmTeam').value;const amount=Number($('gmFunds').value);if(Number.isFinite(amount)&&amount>=0)this.e.adminFunds(team,amount);}this.renderModal();}
 }
 stopLiveWatcher(){
  if(this.liveTimer){clearInterval(this.liveTimer);this.liveTimer=null;}
  if(this.liveHeartbeat){clearInterval(this.liveHeartbeat);this.liveHeartbeat=null;}
  if(this.liveStop){this.liveStop();this.liveStop=null;}
 }
 async fetchLiveGame(){
  if(!this.remote||!this.liveSelected||this.liveLoading)return;
  this.liveLoading=true;
  try{
   this.liveData=await liveApi('status',{game_id:this.liveSelected,team_id:this.viewTeam()});
   if(this.modal==='live')this.renderModal();
  }finally{this.liveLoading=false;}
 }
 async watchLive(gameId,join=false){
  this.stopLiveWatcher();this.liveSelected=gameId;this.liveData=null;this.liveRoster=null;
  if(join)await liveApi('join',{game_id:gameId,team_id:this.viewTeam()});
  await this.fetchLiveGame();
  const game=this.liveData?.game;
  if(game&&[game.home_team_id,game.away_team_id].includes(this.viewTeam())){
   try{this.liveRoster=await apiCall('coach-config',{team_id:this.viewTeam()});}catch{}
  }
  this.liveStop=await subscribeLiveGame(gameId,()=>{if(this.modal==='live')void this.fetchLiveGame().catch(()=>{});});
  this.liveTimer=setInterval(()=>{if(this.modal==='live')void this.fetchLiveGame().catch(()=>{});},5000);
  this.liveHeartbeat=setInterval(()=>{
   const mine=this.liveData?.controls?.find(x=>x.team_id===this.viewTeam());
   if(this.modal==='live'&&mine?.active_mode==='coach'&&this.liveData?.game?.phase==='live')
     void liveApi('heartbeat',{game_id:gameId,team_id:this.viewTeam()}).catch(()=>{});
  },15000);
  if(this.modal==='live')this.renderModal();
 }
 viewTeam(){return this.remote?.role==='gm'?this.state.team:(this.remote?.team_id||this.state.team)}
 async loadRemote(modal=this.modal){if(!this.remote)return;try{
  if(modal==='roster')this.remoteRoster=await apiCall('roster',{team_id:this.viewTeam()});
  else if(modal==='coach') {this.remoteCoach=await apiCall('coach-config',{team_id:this.viewTeam()}); if(!TEAMS.some(t=>t.id===this.coachOpponent&&t.id!==this.viewTeam()))this.coachOpponent=TEAMS.find(t=>t.id!==this.viewTeam()).id;}
  else if(modal==='fa')this.remoteFA=await apiCall('free-agents');
  else if(modal==='live'){this.liveList=await liveApi('list');if(this.liveSelected)await this.watchLive(this.liveSelected);}
  else this.remote=await apiCall('status');
  $('connection').textContent=this.remote.kind==='gm'?'GM ONLINE':'CPBL ONLINE';
  if(this.modal===modal)this.renderModal();
 }catch(err){this.openToast(err.message||'無法同步');}
 }
 teamCards(){return TEAMS.map(t=>`<button class="team-card ${t.id===this.state.team?'active':''}" data-team="${t.id}"><i class="team-color" style="background:${t.color}"></i><div><b>${t.name}</b><small>${t.id===this.state.team?'目前選擇':'可選擇球隊'}</small></div></button>`).join('')}
 teamOptions(exclude=''){return TEAMS.filter(t=>t.id!==exclude).map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}
 header(title,subtitle=''){return `<button class="closeX" data-nav="close" aria-label="關閉">×</button><h2>${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}`}
 renderModal(){const s=this.state,p=s.practice;
 if(this.modal==='intro'){$('modalBody').innerHTML=`<div class="intro"><div><span class="chip">PWA · 3D · 橫向操作</span><h1 style="margin-top:11px">鑽石王朝</h1><div class="subtitle">PRO BASEBALL DYNASTY</div><p>六隊經營 × 第一人稱棒球實戰。你可以現在直接操作投球瞄準、精準跑條、打擊、守備及 ABS 挑戰。</p><div class="notice">目前提供<strong>本機練習賽與管理操作</strong>；專用 Supabase 後端已建立；球隊帳號尚待安全開通；2024 出賽球員＋2025／2026 選秀球員已入庫，但完整註冊名單、寫實人物模型與逐球同步對戰仍未完成，不會把練習資料當正式紀錄。</div><div class="modal-actions"><button class="btn accent" data-nav="choose">開始練習賽</button><button class="btn" data-nav="dashboard">球隊與 GM 控制中心</button><button class="btn" data-nav="auth">正式聯盟登入</button></div></div><div class="intro-feature"><b>操作特點</b><div class="bullet">◆ 自動 / 總教練 / 場上球員切換<br/>◆ MOBA 左手瞄準、右手球種與揮棒<br/>◆ 3D 球場與 ABS 電子好球帶<br/>◆ GM 與正式聯盟分離資料架構<br/>◆ 每隊初始資金 NT$5 億元</div></div></div>`;return;}
 if(this.modal==='choose'){$('modalBody').innerHTML=this.header('選擇本機練習球隊','在這裡選擇要操控的球隊；練習賽不需要正式帳號，也不會寫入官方聯盟。')+`<div class="team-grid">${this.teamCards()}</div><div class="section"><div class="formline"><label>對戰球隊</label><select id="chooseOpp">${this.teamOptions(s.team)}</select></div><div class="modal-actions"><button class="btn accent" data-start="1">進入 3D 球場</button><button class="btn ghost" data-nav="intro">返回</button></div></div>`;return;}
 if(this.modal==='dashboard'&&this.remote){const r=this.remote;const cash=r.finances?.find(x=>x.team_id===this.viewTeam());$('modalBody').innerHTML=this.header(r.kind==='gm'?'GM 模擬管理中心':'中職六隊管理中心',`${r.kind==='gm'?'GM 模擬聯盟':'中職六隊聯盟'} · ${r.year} 年 · ${TEAMS.find(t=>t.id===this.viewTeam())?.name||'GM'} · ${r.phase}`)+`<div class="panel-grid"><div class="metric"><small>目前資金</small><b>${fmt(cash?.cash_ntd||0)}</b></div><div class="metric"><small>目前球季</small><b>${r.year}</b></div><div class="metric"><small>賽季狀態</small><b>${r.clock_enabled?(r.is_ready?'時鐘與賽事運行中':'時鐘運行・等待球員'):'正式上線前暫停'}</b></div></div><div class="modal-actions"><button class="btn" data-nav="roster">球隊球員／名單</button><button class="btn accent" data-nav="coach">總教練先發／一二軍</button><button class="btn accent" data-nav="live">即時觀戰／臨場調度</button><button class="btn" data-nav="fa">自由球員</button><button class="btn" data-nav="finance">聯盟財務</button><button class="btn" data-nav="season">賽程</button>${r.role==='gm'?'<button class="btn accent" data-nav="gm">GM 後端控制</button>':''}<button class="btn" data-nav="choose">本機 3D 練習</button><button class="btn" data-logout>登出</button><button class="btn" data-refresh>重新同步</button></div><div class="notice">後端賽程與經營資料已連線；逐球 3D 比賽目前仍是本機練習，不會擅自寫入正式戰績。</div><div class="section"><h3>最近賽事</h3>${(r.recent||[]).slice(0,7).map(x=>`<div class="rowline">${escapeHtml(x.away_team_id)} ${x.away_score}：${x.home_score} ${escapeHtml(x.home_team_id)} <span>${escapeHtml(x.season_stage)}</span></div>`).join('')||'<p>尚未有已結束的比賽。</p>'}</div>`;return;}
 if(this.modal==='live'&&this.remote){
  const selected=this.liveData?.game;
  $('modalBody').innerHTML=this.header('即時比賽同步與臨場總教練','伺服器逐打席判定 · 可觀戰及管理先發／換投／代打')+
   (this.remote.role==='gm'?'<div class="team-grid">'+this.teamCards()+'</div>':'')+
   renderLivePanel({games:this.liveList?.games||[],selection:this.liveSelected,gameData:this.liveData,
    teamId:this.viewTeam(),players:this.liveRoster?.players||[],clockEnabled:this.liveList?.clock_enabled??false});
  return;
 }
 if(this.modal==='coach'&&this.remote){
  const data=this.remoteCoach;
  $('modalBody').innerHTML=this.header('總教練管理 · 五套打序與球員升降',`${TEAMS.find(t=>t.id===this.viewTeam())?.name||''} · ${this.remote.year} 球季`)+
  (this.remote.role==='gm'?'<div class="team-grid">'+this.teamCards()+'</div>':'')+
  (data?renderCoachSetup({teamId:this.viewTeam(),opponentId:this.coachOpponent,teams:TEAMS,players:data.players||[],lineups:data.lineups||[],draft:this.coachDraft})
    :'<div class="notice">正在讀取總教練資料…</div>');
  return;
 }
 if(this.modal==='roster'&&this.remote){const r=this.remoteRoster;const members=r?.players||[];const picks=new Set(r?.rosters?.find(x=>x.kind==='protected60')?.player_ids||[]);$('modalBody').innerHTML=this.header('正式球員與名單',`${TEAMS.find(t=>t.id===this.viewTeam())?.name||''} · 本季 ${this.remote.year}`)+`${this.remote.role==='gm'?`<div class="team-grid">${this.teamCards()}</div>`:''}<div class="notice">現有球員 ${members.length} 人。已整合2024一、二軍投打成績與2025／2026年選秀；FA區分開季估算、歷史出賽下限及季末公布值。薪資與真人臉型仍需個別核實。</div>${members.length?`<div class="listLog" style="max-height:33vh">${members.map(p=>renderRosterRow(p,picks.has(p.master_player_id))).join('')}</div><div class="modal-actions"><button class="btn accent" data-submit-roster="protected60">保存 60 人名單</button><button class="btn" data-submit-roster="playoff32">保存 32 人名單</button></div>`:'<p>資料庫目前尚未匯入實際球員。名單操作會在球員資料加入後啟用。</p>'}<div class="modal-actions"><button class="btn" data-refresh>重新讀取</button><button class="btn" data-nav="dashboard">返回</button></div>`;return;}
 if(this.modal==='fa'&&this.remote){const r=this.remoteFA;const ps=r?.players||[];$('modalBody').innerHTML=this.header('自由球員接洽','無球隊及未列入 60 人保留名單的球員可接洽，季中也可進行。')+`<div class="notice">目前可接洽球員 ${ps.length} 人。球員不會因為無人簽約就消失。</div>${ps.length?`<div class="formline"><label>球員</label><select id="faPlayer">${ps.map(p=>`<option value="${p.master_player_id}">${escapeHtml(p.players_master?.full_name||String(p.master_player_id))}</option>`).join('')}</select><label>月薪</label><input id="faSalary" type="number" min="70000" value="100000"/><label>年限</label><input id="faYears" type="number" min="1" max="5" value="1"/><button class="btn accent" data-offer="1">提出接洽</button></div>`:''}<div class="modal-actions"><button class="btn" data-refresh>重新讀取</button><button class="btn" data-nav="dashboard">返回</button></div>`;return;}
 if(this.modal==='finance'&&this.remote){const r=this.remote;$('modalBody').innerHTML=this.header('正式聯盟財務',`${r.year} 球季，新台幣計價`)+`<div class="panel-grid">${(r.finances||[]).map(f=>`<div class="metric"><small>${TEAMS.find(t=>t.id===f.team_id)?.name||f.team_id}</small><b>${fmt(f.cash_ntd)}</b><small>未清償 ${Number(f.debt_ntd).toLocaleString('zh-TW')} 元</small></div>`).join('')}</div><p>票房、贊助及訓練費採遊戲平衡估算，不代表真實球團財報。</p><button class="btn" data-nav="dashboard">返回</button>`;return;}
 if(this.modal==='season'&&this.remote){const r=this.remote;$('modalBody').innerHTML=this.header('正式賽程',`2024 起始 · 每週二 08:00 開季 · Asia/Taipei`)+`<div class="notice">${!r.clock_enabled?'正式六隊聯盟暫停至正式上線；不會推進年份或賽事。':r.is_ready?'GM 時鐘已開啟，將依每週二開季的排程運行。':'GM 時鐘持續運行中；待真實球員資料齊全後才開始產生比賽與戰績。'}</div><div class="listLog" style="max-height:48vh">${(r.upcoming||[]).slice(0,25).map(g=>`<div class="rowline">${escapeHtml(g.away_team_id)} @ ${escapeHtml(g.home_team_id)} <span>${new Date(g.scheduled_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</span></div>`).join('')||'未來一小時至近期暫無賽程'}</div><button class="btn" data-nav="dashboard">返回</button>`;return;}
 if(this.modal==='gm'&&this.remote){const r=this.remote;if(r.role!=='gm'){$('modalBody').innerHTML=this.header('禁止進入','僅 GM 可使用時間與財務控制。');return;}$('modalBody').innerHTML=this.header('GM 伺服器控制中心',`真正的 GM 模擬聯盟：${r.year} 年，可快轉、回溯保存年份、修改資金`)+`<div class="notice">${r.clock_enabled?'GM 時鐘每分鐘同步一次。':'GM 時鐘目前關閉。'}${r.is_ready?'已載入可用的 2024 出賽名單與 2025／2026 年選秀球員。':'目前仍缺真實球員名單，GM 賽事與年份快轉尚不可正式結算。'} 正式六隊聯盟保持暫停，不受 GM 操作影響。</div><div class="formline"><button class="btn accent" data-gm="year">模擬並推進一年</button><label>回到年份</label><input id="returnYear" type="number" value="${r.year}" min="2024"/><button class="btn" data-gm="back">回溯存檔</button></div><div class="formline"><label>球隊</label><select id="gmTeam">${this.teamOptions()}</select><label>資金（元）</label><input id="gmFunds" type="number" min="0" value="500000000"/><button class="btn" data-gm="money">儲存資金</button></div><button class="btn" data-nav="dashboard">返回管理</button>`;return;}
 if(this.modal==='dashboard'){$('modalBody').innerHTML=this.header('球隊管理中心',`本機聯盟：${p.year} 年　·　${TEAMS.find(t=>t.id===s.team)?.name}　·　七天一季`)+`<div class="panel-grid"><div class="metric"><small>球隊資金</small><b>${fmt(p.funds[s.team]??START_FUNDS)}</b></div><div class="metric"><small>遊戲年份</small><b>${p.year}</b></div><div class="metric"><small>比賽狀態</small><b>${s.finished?'已結束':s.inning+' 局 '+(s.half==='top'?'上':'下')}</b></div></div><div class="modal-actions"><button class="btn accent" data-nav="choose">選擇對戰</button><button class="btn" data-nav="roster">陣容與球員</button><button class="btn" data-nav="coach">總教練管理（需登入）</button><button class="btn" data-nav="live">即時比賽（需登入）</button><button class="btn" data-nav="fa">自由球員接洽</button><button class="btn" data-nav="finance">財務</button><button class="btn" data-nav="season">聯盟與球季</button><button class="btn" data-nav="gm">GM 控制中心</button><button class="btn" data-nav="auth">正式聯盟登入</button></div><div class="section"><h3>本場操作</h3><div class="modal-actions"><button class="btn" data-quick="atbat">模擬一打席</button><button class="btn" data-quick="game">模擬至比賽結束</button><button class="btn" data-restart="1">重新開始練習賽</button><button class="btn accent" data-nav="close">繼續觀看／操作</button></div></div><div class="section"><h3>即時戰況</h3><div class="listLog">${s.events.slice(0,8).map(v=>`<div>• ${escapeHtml(v)}</div>`).join('')}</div></div>`;return;}
 if(this.modal==='live'){$('modalBody').innerHTML=this.header('即時比賽','需登入後方可觀看正式聯盟比賽及提交指令。')+'<button class="btn accent" data-nav="auth">前往登入</button><button class="btn" data-nav="dashboard">返回</button>';return;}
 if(this.modal==='coach'){$('modalBody').innerHTML=this.header('總教練管理','一、二軍與對戰五隊陣容必須登入後，由 Supabase 驗證並保存。')+'<div class="notice">本機練習賽沒有正式球員歸屬，請登入對應的管理員或球隊帳號進行真實名單操作。</div><button class="btn accent" data-nav="auth">前往登入</button><button class="btn" data-nav="dashboard">返回</button>';return;}
 if(this.modal==='roster'){$('modalBody').innerHTML=this.header('球隊名單與球員管理','正式資料將以 2024 全季六隊球員＋2025、2026 年選秀新人為準；不可虛構真實球員薪資或 FA 年資。')+`<div class="notice">完整歷史名單目前尚未匯入。練習賽使用位置型 AI 球員，並非真實球員 3D 建模。名單匯入將支援 player_id、year、team_id、position、height、bat、throw、salary、fa_years、data_confidence。</div><div class="section"><h3>正式球隊名單制度</h3><div class="rowline">季後賽可登錄名單 <span>最多 32 人，逾時依出賽頻率選取</span></div><div class="rowline">球季保留名單 <span>每隊最多 60 人，逾時自動補足</span></div><div class="rowline">未保留球員 <span>季中可持續接受其他球隊接洽</span></div><div class="rowline">FA 資格 <span>使用公開資料與逐季年資推算</span></div></div><div class="modal-actions"><button class="btn" data-nav="dashboard">返回管理</button></div>`;return;}
 if(this.modal==='finance'){$('modalBody').innerHTML=this.header('球隊財務','2024 起始每隊 5 億元；目前練習資金在本機保存，不會影響正式聯盟。')+`<div class="panel-grid">${TEAMS.map(t=>`<div class="metric"><small>${t.name}</small><b>${fmt(p.funds[t.id]??START_FUNDS)}</b></div>`).join('')}</div><div class="notice">正式版會按合約逐期扣除薪資、結算票房贊助與賽季營運成本；未接後端前不會自行假造真實財務資料。</div><button class="btn" data-nav="dashboard">返回管理</button>`;return;}
 if(this.modal==='season'){$('modalBody').innerHTML=this.header('聯盟與七天球季','週二 08:00 開季，所有時間以 Asia/Taipei 為準。')+`<div class="panel-grid"><div class="metric"><small>週二～週五</small><b>例行賽</b></div><div class="metric"><small>週六 08:00～20:00</small><b>季後賽</b></div><div class="metric"><small>週六～週一</small><b>休賽與訓練</b></div></div><div class="rowline">2024 首季 <span>六隊，含台鋼雄鷹</span></div><div class="rowline">例行賽 <span>每隊 120 場；30 場／日，08:00～24:00</span></div><div class="rowline">季後賽 <span>32 人名單自動補全</span></div><div class="rowline">休賽季 <span>36 小時；60 人保留名單與自由球員</span></div><div class="rowline">秋訓／春訓 <span>24 小時</span></div><div class="notice">上列為已定案規格；目前瀏覽器版僅能實際玩本機練習賽。正式伺服器排程與真實名單匯入尚待部署。</div><button class="btn" data-nav="dashboard">返回管理</button>`;return;}
 if(this.modal==='gm'){$('modalBody').innerHTML=this.header('GM 管理員控制中心','管理員練習聯盟與六隊正式聯盟獨立。以下調整只影響此瀏覽器的 GM 本機資料。')+`<div class="panel-grid"><div class="metric"><small>目前模擬年份</small><b>${p.year}</b></div><div class="metric"><small>年份存檔筆數</small><b>${p.timeline.length}</b></div><div class="metric"><small>正式聯盟</small><b>不受影響</b></div></div><div class="section"><h3>快轉時間</h3><div class="formline"><label>推進球季數</label><input type="number" id="addYears" value="1" min="1" max="40"/><button class="btn accent" data-gm="year">快轉</button></div></div><div class="section"><h3>回到歷史存檔</h3><div class="formline"><select id="returnYear">${p.timeline.map(t=>`<option value="${t.year}">${t.year} 年</option>`).join('')}</select><button class="btn" data-gm="back">回溯該年</button></div></div><div class="section"><h3>修改任意球隊資金</h3><div class="formline fundsSet"><select id="gmTeam">${this.teamOptions()}</select><label>金額</label><input id="gmFunds" type="number" min="0" value="500000000"/><button class="btn accent" data-gm="money">設定新台幣金額</button></div></div><div class="modal-actions"><button class="btn" data-nav="dashboard">返回管理</button><button class="btn accent" data-nav="close">返回比賽</button></div>`;return;}
 if(this.modal==='tactics'){$('modalBody').innerHTML=this.header('總教練戰術與調度','鏡頭保留在自家休息區第一人稱；場上投打由 AI 執行。')+`<div class="panel-grid"><div class="metric"><small>換投</small><b>投手調度</b></div><div class="metric"><small>打擊</small><b>代打與觸擊</b></div><div class="metric"><small>守備</small><b>趨前與佈陣</b></div></div><div class="notice">已完成總教練走動與接管模式；已加入賽前打序、守備位置及一二軍升降的後端管理介面；臨場換投和代打仍待串接。</div><div class="modal-actions"><button class="btn accent" data-nav="coach">排打序／守位／升降</button><button class="btn" data-nav="close">回到休息區</button></div>`;return;}
 if(this.modal==='auth'){$('modalBody').innerHTML=this.header('正式聯盟登入','已連接鑽石王朝 Supabase。帳號需先在後端安全建立。')+`<div class="notice">球隊玩家只能管理自己的球隊；GM 只管理獨立的 GM 模擬聯盟。未設定的帳號不會使用假登入。</div><div class="formline"><label>帳號</label><input id="loginUser" autocomplete="username" placeholder="brothers / GM"/><label>密碼</label><input id="loginPass" type="password" autocomplete="current-password" placeholder="登入密碼"/><button class="btn accent" data-login="1">登入</button></div><button class="btn" data-nav="dashboard">返回練習</button>`;return;}
 }
 render(){const s=this.state;const a=TEAMS.find(t=>t.id===s.visitor)||TEAMS[0],b=TEAMS.find(t=>t.id===s.home)||TEAMS[1],role=currentRole(s);
 $('scoreboard').innerHTML=`<div class="teamscore"><i class="team-color" style="height:20px;width:5px;background:${a.color}"></i>${a.short} <b>${s.score[0]}</b></div><div class="innings"><strong>${s.inning}局${s.half==='top'?'上 ▲':'下 ▼'}</strong><small>${s.outs} OUT · ${s.balls}B ${s.strikes}S</small></div><div class="teamscore"><b>${s.score[1]}</b> ${b.short}<i class="team-color" style="height:20px;width:5px;background:${b.color}"></i></div>`;
 $('infoLeft').innerHTML=`<div class="gold">${s.mode==='auto'?'AI 自動模擬':s.mode==='coach'?'總教練視角':isOffense(s)?'打者第一視角':'投手第一視角'}</div><div class="info-row">球種<span>${escapeHtml(s.pitchType)}</span></div><div class="info-row">投手球數<span>${s.pitchNumber}</span></div><div class="info-row">體力<span>${s.stamina.toFixed(0)}%</span></div><div class="tension"><span style="width:${s.stamina}%"></span></div><div class="info-row">壘包<span>${s.bases.map((v,i)=>v?['一','二','三'][i]:'·').join(' ')}</span></div><div class="info-row">ABS 剩餘<span>${s.challenge.abs} 次</span></div>`;
 for(const btn of $('modeBar').querySelectorAll('[data-mode]'))btn.classList.toggle('selected',btn.dataset.mode===String(s.pendingMode||s.mode));
 const el=$('bottomStatus');el.textContent=s.finished?'比賽結束 · 請開啟選單開始新賽事':s.pendingMode?'等待本打席結束後切換控制模式':s.events[0]||'準備開始';
 $('stickLabel').textContent=role==='coach'?'移動':role==='pitcher'?'投球落點':role==='batter'?'球棒位置':role==='auto'?'AI 模擬':'守備／跑壘';
 const overlay=$('aimOverlay');overlay.classList.toggle('visible',['pitcher','batter'].includes(role)&&s.phase!=='fielding');overlay.classList.toggle('batter',role==='batter');
 $('aimDot').style.left=`${50+s.aim.x*34}%`;$('aimDot').style.top=`${50-s.aim.y*32}%`;
 $('batGuide').style.left=`${50+s.aim.x*34}%`;$('batGuide').style.top=`${50-s.aim.y*32}%`;
 $('meter').classList.toggle('hidden',s.phase!=='meter');if(s.phase==='meter'){const k=(Math.sin(this.e.meterPhase)+1)/2,w=accuracyWindow(s.aim.x*.82,.87+s.aim.y*.35,s.stamina)*100;$('meterNeedle').style.left=`${k*100}%`;$('meterZone').style.left=`${50-w/2}%`;$('meterZone').style.width=`${w}%`;}
 if(s.phase==='fielderChoice'&&s.fieldChoice){$('fieldChoice').classList.remove('hidden');$('fieldChoice').innerHTML=`<strong>防守選擇 · 剩餘 ${Math.ceil(s.fieldChoice.timeLeft)} 秒</strong><div class="fielder-choices">${s.fieldChoice.candidates.map(f=>`<button data-player="${f.key}">${f.label}</button>`).join('')}</div><small>逾時交由 AI 判斷</small>`;}else $('fieldChoice').classList.add('hidden');
 if(s.phase==='abs'&&s.review){$('challengeBanner').classList.remove('hidden');const r=s.review;const x=50+(r.x/1.4)*48,y=100-((r.y-.30)/1.2)*100;$('challengeBanner').innerHTML=`<strong>ABS CHALLENGE</strong><div class="track"><i style="left:${x}%;top:${y}%"></i></div><small>原判：${r.original?'好球':'壞球'}　／　ABS：${r.final?'好球':'壞球'}</small><b>${r.success?'判決更改｜挑戰成功':'維持原判｜挑戰失敗'}</b>`;}else $('challengeBanner').classList.add('hidden');
 if(role!==this.lastRole||s.phase!==this.lastPhase){this.renderActions();this.lastRole=role;this.lastPhase=s.phase;}
 }
 renderActions(){const s=this.state,role=currentRole(s);let defs=[];
 if(role==='auto')defs=[['▶','模擬一打席','quick',false],['☰','管理','pause',true]];
 if(role==='coach')defs=[['⚑','重播挑戰','review',false],['↻','換投','tactics',false],['☷','戰術','tactics',true]];
 if(role==='pitcher')defs=[['①','四縫線','ball:四縫線',false],['②','滑球','ball:滑球',false],['③','曲球','ball:曲球',false],['✥','ABS','abs',false],['◉',s.phase==='meter'?'放球':'投球','pitch',true]];
 if(role==='batter')defs=[['◈','短打','bunt',false],['✦','強振','power',false],['✥','ABS','abs',false],['⚾','揮棒','swing',true]];
 if(s.phase==='fielding'&&role!=='auto'&&role!=='coach')defs=isOffense(s)?[['⇦','回壘','dash',false],['⇧','衝刺','dash',true]]:[['↗','一壘','throw:1',false],['↑','二壘','throw:2',false],['↙','三壘','throw:3',false],['◉','接球','catch',true]];
 const secondary=defs.filter(x=>!x[3]),primary=defs.find(x=>x[3]);
 $('actionArea').innerHTML=`<div class="action-stack"><div class="action-row">${secondary.slice(0,3).map(a=>this.button(a,s)).join('')}</div>${secondary.length>3?`<div class="action-row">${secondary.slice(3).map(a=>this.button(a,s)).join('')}</div>`:''}</div>${primary?this.button(primary,s,'primary'):''}`;
 // Delegate menu buttons not in e.g. action named quick to actual action.
 if(role==='auto')$('actionArea').querySelector('[data-act="quick"]')?.addEventListener('click',()=>this.e.fastForwardAtBat());
 }
 button(a,s,extra=''){const selected=a[2]==='ball:'+s.pitchType;const disabled=a[2]==='abs'&&!this.e.canABS();return `<button ${a[3]?'id="mainAction"':''} class="action ${extra} ${selected?'highlight':''}" data-act="${a[2]}" ${disabled?'disabled':''}><span class="symbol">${a[0]}</span><span class="word">${a[1]}</span></button>`;}
}
