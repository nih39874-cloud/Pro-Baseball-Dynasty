import {TEAMS} from '../config.js';
import {signIn,signOut,apiCall,getSessionMetadata} from '../backend/auth.js';

const root=document.getElementById('app');
const names={brothers:'中信兄弟',dragons:'味全龍',unilions:'統一7-ELEVEn獅',guardians:'富邦悍將',rakuten:'樂天桃猿',TSG:'台鋼雄鷹'};
const phases={training:'週一訓練',regular:'例行賽',playoffs:'季後賽',offseason:'休賽季'};
const state={status:null,tab:'home',team:null,roster:null,coach:null,fa:null,error:'',busy:false,opponent:null};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n||0).toLocaleString('zh-TW');
function shell(body){root.innerHTML=body;bind()}
function notice(message){state.error=message;render()}
function team(){return state.status?.role==='gm'?(state.team||'brothers'):state.status?.team_id}
function loading(){shell('<main class="center"><div class="brand">◆ 鑽石王朝</div><p>正在確認登入狀態…</p></main>')}
function login(){
 shell(`<main class="login-layout"><div class="login-logo">◆</div><h1>鑽石王朝</h1><p>DIAMOND DYNASTY · 永久聯盟</p><form id="login-form" class="login-card">
 <label for="username">帳號</label><select id="username" required><option value="GM">GM · 聯盟管理員</option>${TEAMS.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select>
 <label for="password">PIN 碼</label><input id="password" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="current-password" minlength="4" maxlength="8" required placeholder="GM 8 碼／球隊 4 碼">
 <button type="submit" class="primary" ${state.busy?'disabled':''}>${state.busy?'登入中…':'登入球團'}</button></form>
 ${state.error?`<p class="alert" role="alert">${esc(state.error)}</p>`:''}<p class="footnote">固定七個帳號：GM + 六支中職球隊。沒有自行註冊功能。</p></main>`);
}
function brandColor(){return TEAMS.find(x=>x.id===team())?.color||'#d9af5e'}
function header(){const current=TEAMS.find(x=>x.id===team());return `<header class="app-header"><div class="brand-lockup"><span class="brand-gem">◆</span><div><span class="eyebrow">PRO BASEBALL DYNASTY</span><h1>鑽石王朝</h1></div></div><div class="header-tools"><span class="role-tag">${state.status?.role==='gm'?'LEAGUE GM':esc(current?.short||'球團')}</span><button class="logout" data-action="logout" aria-label="登出">⏻</button></div></header>`}
function navigation(){return `<nav class="bottom-nav" aria-label="主要導覽">${[['home','總部','⌂'],['roster','名單','▦'],['coach','戰術','▤'],['season','賽事','◷'],['market','市場','↗']].map(([id,label,icon])=>`<button aria-label="${label}" aria-current="${state.tab===id?'page':'false'}" data-tab="${id}" class="${state.tab===id?'active':''}"><span class="nav-icon">${icon}</span><small>${label}</small></button>`).join('')}</nav>`}
const row=(a,b)=>`<div class="data-row"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`;
const warning=s=>`<div class="notice">${esc(s)}</div>`;
function home(){
 const s=state.status,f=s.finances?.find(x=>x.team_id===team()),current=TEAMS.find(x=>x.id===team());
 const next=(s.upcoming||[]).find(g=>g.phase!=='final')||(s.upcoming||[])[0];
 const label=next?`${names[next.away_team_id]||next.away_team_id} vs ${names[next.home_team_id]||next.home_team_id}`:'尚無下一場已排定賽事';
 const phaseText=s.clock_enabled?'賽程運行中':s.is_ready?'等待聯盟開賽':'尚未啟用正式比賽';
 return `<section class="card hero"><div class="hero-glow"></div><div class="hero-top"><span class="eyebrow">SEASON ${esc(s.year)} · CLUB OFFICE</span><span class="live-chip">${s.clock_enabled?'● LIVE':'● 待開賽'}</span></div>
 <div class="club-identity"><span class="club-emblem" aria-hidden="true">${esc((current?.short||'GM').slice(0,2))}</span><div><small>${s.role==='gm'?'聯盟管理檢視':'球團經營者'}</small><h2>${esc(names[team()]||'聯盟總管理處')}</h2><span class="club-sub">永久聯盟 · 第 ${esc(s.year)} 球季</span></div></div><div class="hero-bottom"><span>${esc(phaseText)}</span><span class="phase-dot">◆</span></div></section>
 <div class="section-caption"><span>CLUB OVERVIEW</span><span>球團概況</span></div>
 <div class="kpi-grid"><div class="card kpi"><span class="kpi-icon">▣</span><small>可用資金</small><b>NT$ ${money(f?.cash_ntd)}</b><span class="kpi-foot">球團營運資產</span></div><div class="card kpi"><span class="kpi-icon">◈</span><small>球季狀態</small><b>${s.is_ready?'準備就緒':'尚待啟用'}</b><span class="kpi-foot">正式聯盟狀態</span></div></div>
 <section class="card fixture-card"><div class="card-heading"><h3>下一場對戰</h3><span class="section-kicker">NEXT FIXTURE</span></div><div class="match-spotlight"><div class="match-icon">⚾</div><div><b>${esc(label)}</b><small>${next?esc(new Date(next.scheduled_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}))+' · 台灣時間':'賽程開放後將顯示於此'}</small></div></div><button class="card-link" data-tab="season">查看聯盟賽程 <span>→</span></button></section>
 <div class="section-caption"><span>MANAGEMENT</span><span>快捷管理</span></div>
 <div class="shortcut-grid"><button data-tab="roster"><span class="shortcut-symbol">▦</span><strong>球員名單</strong><small>一軍／二軍</small></button><button data-tab="coach"><span class="shortcut-symbol">▤</span><strong>戰術配置</strong><small>先發／調度</small></button><button data-tab="market"><span class="shortcut-symbol">↗</span><strong>自由球員</strong><small>簽約／市場</small></button><button data-tab="season"><span class="shortcut-symbol">◷</span><strong>聯盟賽程</strong><small>賽果／對戰</small></button></div>
 ${s.role==='gm'?`<section class="card gm-team"><div class="card-heading"><h3>GM 球隊檢視</h3><span class="section-kicker">ALL CLUBS</span></div><select id="team-selector">${TEAMS.map(t=>`<option value="${esc(t.id)}" ${team()===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select><p class="muted">僅供 GM 檢視六支真人經營球隊。</p></section>`:''}
 <section class="card"><div class="card-heading"><h3>聯盟運作週期</h3><span class="section-kicker">WEEKLY CYCLE</span></div><div class="timeline-row"><span class="time-day training">MON</span><div><b>訓練日</b><small>簽約結算 · 球員訓練</small></div></div><div class="timeline-row"><span class="time-day regular">TUE–FRI</span><div><b>08:00–23:00 例行賽</b><small>系統自動計算對戰結果</small></div></div><div class="timeline-row"><span class="time-day postseason">SAT</span><div><b>12:00–20:00 季後賽</b><small>挑戰賽 · 台灣大賽</small></div></div><div class="timeline-row"><span class="time-day break">OFF</span><div><b>非比賽時段</b><small>FA · 交易 · 休賽期作業</small></div></div></section>
 <section class="card"><div class="card-heading"><h3>近期戰報</h3><span class="section-kicker">RECENT RESULTS</span></div>${(s.recent||[]).slice(0,5).map(g=>`<div class="result-row"><span>${esc(names[g.away_team_id]||g.away_team_id)}</span><b>${esc(g.away_score)} : ${esc(g.home_score)}</b><span>${esc(names[g.home_team_id]||g.home_team_id)}</span></div>`).join('')||warning('本球季尚無已結束的比賽。')}</section>`;
}
function roster(){
 const d=state.roster;
 if(!d)return `<section class="card">正在讀取球員名單…</section>`;
 const ps=d.players||[],active=ps.filter(x=>x.roster_status==='active');
 return `<section class="card"><div class="card-heading"><h3>球隊名單</h3><span class="section-kicker">ROSTER</span></div><div class="stats-grid"><div><small>一軍</small><h2>${active.length}/28</h2></div><div><small>本隊球員</small><h2>${ps.length}</h2></div></div><p class="muted">季後賽 32 人／季末保留 60 人，未簽約球員永久保留在資料庫。</p></section>
 <section class="card"><div class="card-heading"><h3>球員資料</h3><span class="section-kicker">PLAYER DATABASE</span></div>${ps.map(p=>`<div class="player"><div><b>${esc(p.players_master?.full_name||p.master_player_id)}</b><small>${esc(p.players_master?.primary_position||'未分類')} · ${p.roster_status==='active'?'一軍':'二軍／預備'}</small></div><span class="skill">球探報告待校準</span></div>`).join('')||warning('此球隊尚無球員資料。')}</section>`;
}
function coach(){
 const d=state.coach;if(!d)return `<section class="card">正在讀取打線…</section>`;
 const available=(d.players||[]).filter(p=>p.roster_status==='active');
 const opps=TEAMS.filter(t=>t.id!==team());
 const opp=state.opponent&&state.opponent!==team()?state.opponent:opps[0]?.id;
 const saved=(d.lineups||[]).find(x=>x.opponent_team_id===opp);
 const namesById=new Map((d.players||[]).map(p=>[p.master_player_id,p.players_master?.full_name||String(p.master_player_id)]));
 return `<section class="card"><div class="card-heading"><h3>對戰專用先發陣容</h3><span class="section-kicker">TACTICS</span></div><label>對手球隊</label><select id="opponent">${opps.map(t=>`<option value="${t.id}" ${t.id===opp?'selected':''}>${esc(t.name)}</option>`).join('')}</select><p class="muted">每支球隊擁有對其他五隊的獨立先發設定。所有比賽由電腦自動模擬。</p>
 ${saved?`<h4>目前打線</h4>${saved.batting_order.map((id,i)=>row(`${i+1} 棒`,namesById.get(id)||id)).join('')}` : warning('目前尚無自訂打線。')}
 <button class="secondary" data-action="autolineup">讀取建議打線</button></section>
 <section class="card"><h3>一軍球員管理</h3>${available.map(p=>`<div class="player"><b>${esc(p.players_master?.full_name||p.master_player_id)}</b><button class="small" data-demote="${p.master_player_id}">下二軍</button></div>`).join('')||warning('沒有一軍球員。')}</section>`;
}
function season(){const games=state.status?.upcoming||[];return `<section class="card"><div class="card-heading"><h3>賽程與賽果</h3><span class="section-kicker">LEAGUE FIXTURES</span></div><p class="muted">永久聯盟，每週循環進行新的球季。</p>${games.map(g=>`<div class="game"><small>${esc((g.scheduled_at||'').slice(0,16).replace('T',' '))} UTC</small><div>${esc(names[g.away_team_id]||g.away_team_id)} <b>${g.away_score??'–'} : ${g.home_score??'–'}</b> ${esc(names[g.home_team_id]||g.home_team_id)}</div></div>`).join('')||warning('尚無已排定的近期賽事。')}</section>`}
function market(){const list=state.fa?.players||[];return `<section class="card"><div class="card-heading"><h3>自由球員市場</h3><span class="section-kicker">FREE AGENTS</span></div><p class="muted">球員可選擇薪資以外的因素；合約結果統一於週一訓練開始時公布。未簽約球員不會消失。</p>${list.map(p=>`<div class="player"><div><b>${esc(p.players_master?.full_name||p.master_player_id)}</b><small>${esc(p.players_master?.primary_position||'')}</small></div><button class="small" data-offer="${p.master_player_id}">報價</button></div>`).join('')||warning('目前沒有可接洽的球員。')}</section>`}
function render(){
 if(!state.status){login();return}
 const title={home:'球團總部',roster:'球員名單',coach:'戰術與打線',season:'聯盟賽程',market:'自由球員'}[state.tab];
 const body={home,roster,coach,season,market}[state.tab]();
 root.style.setProperty("--club-accent",brandColor());
 shell(`${header()}<main class="content"><div class="section-head"><div><span class="eyebrow">CLUB MANAGEMENT</span><h2>${title}</h2></div><button data-action="refresh" class="text-button" aria-label="重新整理">↻ 更新</button></div>${state.error?`<div class="alert" role="alert">${esc(state.error)}</div>`:''}${body}</main>${navigation()}`);
}
async function fetchTab(){
 try{
 if(state.tab==='roster')state.roster=await apiCall('roster',{team_id:team()});
 if(state.tab==='coach')state.coach=await apiCall('coach-config',{team_id:team()});
 if(state.tab==='market')state.fa=await apiCall('free-agents');
 if(state.tab==='home'||state.tab==='season')state.status=await apiCall('status');
 state.error='';
 }catch(e){state.error=e.message||'同步失敗'}render();
}
function bind(){
 const form=document.getElementById('login-form');
 if(form)form.addEventListener('submit',async e=>{e.preventDefault();if(state.busy)return;const username=form.querySelector('#username').value;const password=form.querySelector('#password').value;state.busy=true;state.error='';render();try{const result=await signIn(username,password);state.status=result.status;state.team=result.status.team_id||'brothers';state.tab='home';state.error='';}catch(err){state.error=err.message||'登入失敗'}finally{state.busy=false;render()}});
 root.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{state.tab=b.dataset.tab;state.error='';render();void fetchTab()}));
 root.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',async()=>{try{if(b.dataset.action==='logout'){await signOut();state.status=null;state.error='';render()}else if(b.dataset.action==='refresh'){await fetchTab()}else if(b.dataset.action==='autolineup'){const r=await apiCall('coach-default',{team_id:team()});state.error='已取得建議打線；正式調整需完成打序編輯介面。';render()}}catch(e){notice(e.message)}}));
 const ts=document.getElementById('team-selector');if(ts)ts.addEventListener('change',()=>{state.team=ts.value;state.roster=null;state.coach=null;render();void fetchTab()});
 const op=document.getElementById('opponent');if(op)op.addEventListener('change',()=>{state.opponent=op.value;render()});
 root.querySelectorAll('[data-demote]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('確定將球員下放二軍？'))return;try{await apiCall('coach-move',{team_id:team(),player_id:Number(b.dataset.demote),to_level:'reserve'});await fetchTab()}catch(e){notice(e.message)}}));
 root.querySelectorAll('[data-offer]').forEach(b=>b.addEventListener('click',async()=>{const salary=prompt('輸入月薪（新臺幣）','100000');if(salary===null)return;const years=prompt('合約年限（1～5）','1');if(years===null)return;try{await apiCall('offer-fa',{team_id:team(),player_id:Number(b.dataset.offer),salary_ntd:Number(salary),years:Number(years)});state.error='已送出報價，等待下次統一結算。';render()}catch(e){notice(e.message)}}));
}
loading();
if(getSessionMetadata())apiCall('status').then(s=>{state.status=s;state.team=s.team_id||'brothers';render()}).catch(()=>{state.status=null;login()});
else login();
