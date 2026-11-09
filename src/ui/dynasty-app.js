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
 <label for="password">密碼</label><input id="password" type="password" autocomplete="current-password" minlength="4" required placeholder="輸入您的密碼">
 <button type="submit" class="primary" ${state.busy?'disabled':''}>${state.busy?'登入中…':'登入球團'}</button></form>
 ${state.error?`<p class="alert" role="alert">${esc(state.error)}</p>`:''}<p class="footnote">固定七個帳號：GM + 六支中職球隊。沒有自行註冊功能。</p></main>`);
}
function header(){return `<header class="app-header"><div><span class="eyebrow">DIAMOND DYNASTY</span><h1>鑽石王朝</h1></div><button class="logout" data-action="logout">登出</button></header>`}
function navigation(){return `<nav class="bottom-nav">${[['home','首頁','⌂'],['roster','球員','♙'],['coach','打線','▤'],['season','賽程','◷'],['market','FA','＄']].map(([id,label,icon])=>`<button data-tab="${id}" class="${state.tab===id?'active':''}"><span>${icon}</span><small>${label}</small></button>`).join('')}</nav>`}
const row=(a,b)=>`<div class="data-row"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`;
const warning=s=>`<div class="notice">${esc(s)}</div>`;
function home(){
 const s=state.status,f=s.finances?.find(x=>x.team_id===team());
 return `<section class="card hero"><div class="eyebrow">球團總部 · ${esc(s.year)} 球季</div><h2>${esc(names[team()]||'聯盟 GM')}</h2><div class="status-line"><span>${esc(s.phase||'未開賽')}</span><strong>${s.clock_enabled?'賽季時鐘啟用':'正式開季前暫停'}</strong></div></section>
 <div class="stats-grid"><div class="card"><small>球團資金</small><b>NT$ ${money(f?.cash_ntd)}</b></div><div class="card"><small>球季狀態</small><b>${s.is_ready?'資料已備妥':'等待正式開季'}</b></div></div>
 ${s.role==='gm'?`<section class="card"><h3>GM：查看球隊</h3><select id="team-selector">${TEAMS.map(t=>`<option value="${esc(t.id)}" ${team()===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select><p class="muted">GM 能檢視六隊；正式球隊互打，沒有 AI 經營隊伍。</p></section>`:''}
 <section class="card"><h3>聯盟週期</h3>${row('星期一','訓練與簽約結算')}${row('星期二至五 08:00–23:00','例行賽')}${row('星期六 12:00–20:00','季後賽／台灣大賽')}${row('其他時間','非比賽管理時段')}</section>
 <section class="card"><h3>最新賽果</h3>${(s.recent||[]).slice(0,6).map(g=>row(`${names[g.away_team_id]||g.away_team_id} @ ${names[g.home_team_id]||g.home_team_id}`,`${g.away_score} : ${g.home_score}`)).join('')||warning('目前尚無已完成比賽。')}</section>`;
}
function roster(){
 const d=state.roster;
 if(!d)return `<section class="card">正在讀取球員名單…</section>`;
 const ps=d.players||[],active=ps.filter(x=>x.roster_status==='active');
 return `<section class="card"><h3>球隊名單</h3><div class="stats-grid"><div><small>一軍</small><h2>${active.length}/28</h2></div><div><small>本隊球員</small><h2>${ps.length}</h2></div></div><p class="muted">季後賽 32 人／季末保留 60 人，未簽約球員永久保留在資料庫。</p></section>
 <section class="card"><h3>球員資料</h3>${ps.map(p=>`<div class="player"><div><b>${esc(p.players_master?.full_name||p.master_player_id)}</b><small>${esc(p.players_master?.primary_position||'未分類')} · ${p.roster_status==='active'?'一軍':'二軍／預備'}</small></div><span class="skill">${esc(p.batting_rating??'-')} / ${esc(p.pitching_rating??'-')}</span></div>`).join('')||warning('此球隊尚無球員資料。')}</section>`;
}
function coach(){
 const d=state.coach;if(!d)return `<section class="card">正在讀取打線…</section>`;
 const available=(d.players||[]).filter(p=>p.roster_status==='active');
 const opps=TEAMS.filter(t=>t.id!==team());
 const opp=state.opponent&&state.opponent!==team()?state.opponent:opps[0]?.id;
 const saved=(d.lineups||[]).find(x=>x.opponent_team_id===opp);
 const namesById=new Map((d.players||[]).map(p=>[p.master_player_id,p.players_master?.full_name||String(p.master_player_id)]));
 return `<section class="card"><h3>對戰專用先發陣容</h3><label>對手球隊</label><select id="opponent">${opps.map(t=>`<option value="${t.id}" ${t.id===opp?'selected':''}>${esc(t.name)}</option>`).join('')}</select><p class="muted">每支球隊擁有對其他五隊的獨立先發設定。所有比賽由電腦自動模擬。</p>
 ${saved?`<h4>目前打線</h4>${saved.batting_order.map((id,i)=>row(`${i+1} 棒`,namesById.get(id)||id)).join('')}` : warning('目前尚無自訂打線。')}
 <button class="secondary" data-action="autolineup">讀取建議打線</button></section>
 <section class="card"><h3>一軍球員管理</h3>${available.map(p=>`<div class="player"><b>${esc(p.players_master?.full_name||p.master_player_id)}</b><button class="small" data-demote="${p.master_player_id}">下二軍</button></div>`).join('')||warning('沒有一軍球員。')}</section>`;
}
function season(){const games=state.status?.upcoming||[];return `<section class="card"><h3>賽程與賽果</h3><p class="muted">永久聯盟，每週循環進行新的球季。</p>${games.map(g=>`<div class="game"><small>${esc((g.scheduled_at||'').slice(0,16).replace('T',' '))} UTC</small><div>${esc(names[g.away_team_id]||g.away_team_id)} <b>${g.away_score??'–'} : ${g.home_score??'–'}</b> ${esc(names[g.home_team_id]||g.home_team_id)}</div></div>`).join('')||warning('尚無已排定的近期賽事。')}</section>`}
function market(){const list=state.fa?.players||[];return `<section class="card"><h3>自由球員市場</h3><p class="muted">球員可選擇薪資以外的因素；合約結果統一於週一訓練開始時公布。未簽約球員不會消失。</p>${list.map(p=>`<div class="player"><div><b>${esc(p.players_master?.full_name||p.master_player_id)}</b><small>${esc(p.players_master?.primary_position||'')}</small></div><button class="small" data-offer="${p.master_player_id}">報價</button></div>`).join('')||warning('目前沒有可接洽的球員。')}</section>`}
function render(){
 if(!state.status){login();return}
 const title={home:'球團總部',roster:'球員名單',coach:'戰術與打線',season:'聯盟賽程',market:'自由球員'}[state.tab];
 const body={home,roster,coach,season,market}[state.tab]();
 shell(`${header()}<main class="content"><div class="section-head"><h2>${title}</h2><button data-action="refresh" class="text-button">重新整理</button></div>${state.error?`<div class="alert" role="alert">${esc(state.error)}</div>`:''}${body}</main>${navigation()}`);
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
 if(form)form.addEventListener('submit',async e=>{e.preventDefault();if(state.busy)return;state.busy=true;state.error='';render();try{const username=document.getElementById('username')?.value||form.querySelector('select')?.value;const password=document.getElementById('password')?.value||form.querySelector('input')?.value;const result=await signIn(username,password);state.status=result.status;state.team=result.status.team_id||'brothers';state.tab='home';state.error='';}catch(err){state.error=err.message||'登入失敗'}finally{state.busy=false;render()}});
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
