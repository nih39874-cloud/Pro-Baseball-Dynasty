import {TEAMS} from '../config.js';
import {signIn,signOut,apiCall,getSessionMetadata} from '../backend/auth.js';

const root=document.querySelector('#app');
const teamMap=Object.fromEntries(TEAMS.map(t=>[t.id,t]));
const names=Object.fromEntries(TEAMS.map(t=>[t.id,t.name]));
const state={session:null,page:'home',view:'',modal:null,roster:null,coach:null,fa:null,gmMarket:null,gmHistory:null,observer:null,diagnostics:null,gmBusy:false,seasonStats:null,awards:null,statTab:'batters',tradeBoard:null,tradeTargetTeam:null,
  search:'',filter:'all',gameTab:'schedule',marketTab:'available',selectedOpponent:'brothers',openingMode:false,openingIds:null,lineupDraft:null,lineupTab:'batting',lineupPicker:null,notice:'',loading:false,loginUser:'GM'};
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const fmt=n=>Number(n??0).toLocaleString('zh-TW');
const gm=()=>state.session?.role==='gm';
const ownTeam=()=>gm()?'dragons':state.session?.team_id;
const tname=id=>names[id]||id||'聯盟';
const money=n=>n==null?'—':'NT$ '+fmt(n);
const cashShort=n=>n==null?'—':Number(n)>=100000000?(Number(n)/100000000).toFixed(2)+' 億':Number(n)>=10000?(Number(n)/10000).toFixed(0)+' 萬':fmt(n);
const salaryTag=p=>({contemporaneous_report:'當年公開','2024_compilation':'2024 整理','game_estimate':'遊戲推估'}[p?.salary_reference?.evidence_type]||'待確認');
const box=(title,content,extra='')=>'<section class="panel '+extra+'"><div class="panel-title">'+title+'</div>'+content+'</section>';
const empty=s=>'<div class="empty">'+escape(s)+'</div>';
const btn=(label,route,icon='◇')=>'<button type="button" class="menu-btn" data-page="'+route+'"><span class="menu-icon">'+icon+'</span><span>'+label+'</span><span class="menu-chev">›</span></button>';
const toDate=s=>{if(!s)return '未排定'; const d=new Date(s);return isNaN(d)?'日期待確認':d.toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})};
function login(){
 const items=[{id:'GM',name:'GM｜平行球團'},...TEAMS.map(t=>({id:t.id,name:t.name}))];
 return '<main class="auth"><div class="auth-logo">◆</div><h1>鑽石王朝</h1><p>職業棒球經營聯盟</p><form id="login-form" class="auth-form"><label>選擇登入帳號</label><select name="user">'+items.map(x=>'<option value="'+x.id+'" '+(state.loginUser===x.id?'selected':'')+'>'+escape(x.name)+'</option>').join('')+'</select><label>PIN 碼</label><input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="current-password" maxlength="8" required placeholder="GM 8 位｜球隊 4 位"><button class="main-action" type="submit" '+(state.loading?'disabled':'')+'>'+(state.loading?'驗證中…':'登入遊戲')+'</button></form>'+(state.notice?'<p class="error">'+escape(state.notice)+'</p>':'')+'<small>一個 GM 平行球團、六支真人球隊</small></main>';
}
function top(){
 const club=gm()?'GM 平行球團':tname(ownTeam());
 return '<header class="top game-top"><div class="top-brand"><span class="logo game-logo">◆</span><div><b>鑽石王朝</b><small>'+escape(club)+'</small></div></div><div class="top-tools"><span class="season-plate">S'+escape(state.session?.year||'2024')+'</span><button type="button" data-action="logout" aria-label="登出">⏻</button></div></header>';
}
const navItems=[['home','首頁','⌂'],['roster','球員','▤'],['coach','戰術','⚑'],['season','賽事','◷'],['market','市場','◇']];
function bottom(){return '<nav class="bottom">'+navItems.map(([id,name,icon])=>'<button data-page="'+id+'" class="'+(state.page===id?'on':'')+'"><b>'+icon+'</b><span>'+name+'</span></button>').join('')+'</nav>'}
function home(){
 const s=state.session||{},f=s.finances?.find(x=>x.team_id===ownTeam());
 const team=ownTeam(),games=s.upcoming||[],recent=s.recent||[],match=games.find(g=>g.phase!=='final'&&(g.home_team_id===team||g.away_team_id===team));
 const opponent=match?(match.home_team_id===team?match.away_team_id:match.home_team_id):null;
 const roster=s.roster_summary||{},code=gm()?'GM':teamMap[team]?.short?.slice(0,2)||'隊';
 const cash=f?cashShort(f.cash_ntd):'—',started=recent.length>0;
 const stateText=gm()?'獨立沙盒':s.season_phase==='pending'&&!started?'開季準備':s.clock_enabled?'球季進行中':'聯盟待啟用';
 const t=match?toDate(match.scheduled_at):'待聯盟排定';
 const gameHeadline=gm()?'你的球團，你的王朝':match?'下一場迎戰 '+tname(opponent):'為新球季做好準備';
 const mini=(txt,desc,dest,icon,num)=>'<button data-page="'+dest+'" class="arena-tile"><span class="arena-tile-icon">'+icon+'</span><span class="arena-tile-copy"><b>'+txt+'</b><small>'+desc+'</small></span><span class="arena-tile-id">'+num+'</span></button>';
 return '<div class="arena-home">'+
 '<section class="arena-head"><div class="arena-eyebrow"><span>FRANCHISE // '+escape(s.year||2024)+'</span><span class="arena-live">● '+(gm()?'GM TEST':'CPBL SEASON')+'</span></div>'+
 '<div class="arena-center"><div class="arena-shield">'+escape(code)+'</div><div class="arena-club"><small>'+escape(stateText)+'</small><strong>'+escape(gm()?'平行宇宙｜味全龍':tname(team))+'</strong><em>DYNASTY MANAGEMENT</em></div></div>'+
 '<div class="arena-duel"><span class="diamond-glow">◇</span><div><small>'+escape(gm()?'球團經營模擬':'下一場賽事')+'</small><b>'+escape(gameHeadline)+'</b><span>'+escape(gm()?'交易與名單不影響正式六隊':t)+'</span></div><button data-page="'+(gm()?'observe':'season')+'">'+(gm()?'查看六隊':'進入賽事')+' ↗</button></div></section>'+
 '<div class="arena-kpis"><div><small>球團資金</small><b>'+escape(cash)+'</b><span>NTD</span></div><div><small>一軍名單</small><b>'+escape(roster.active??'—')+'<em> / 28</em></b><span>ACTIVE</span></div><div><small>總球員數</small><b>'+escape(roster.total??'—')+'</b><span>ROSTER</span></div></div>'+
 '<div class="arena-section"><span>球團指揮中心</span><small>SELECT MODE</small></div>'+
 '<div class="arena-actions">'+
 mini('球員中心','陣容管理 · 2024 身價','roster','▦','01')+
 mini('教練戰術室','先發九棒 · DH 守備','coach','⚑','02')+
 mini('聯盟賽事','對戰 · 戰績 · 排程','season','⚾','03')+
 mini('自由市場','FA · 簽約談判','market','◇','04')+
 mini('財務合約','薪資 · 資金','finance','＄','05')+
 mini(gm()?'GM 測試中心':'球團檔案',gm()?'場次快轉 · 資料診斷':'經營檔案',gm()?'lab':'club','◈','06')+
 '</div><div class="arena-ticker"><span>◆ 聯盟情報</span><marquee scrollamount="3">'+(gm()?'GM 專用沙盒已啟用｜可隨時簽約與升降一二軍｜正式聯盟資料隔離':'六隊真人經營｜開季 28 人名單｜例行賽與季後賽由系統自動模擬')+'</marquee></div></div>';
}
function roster(){
 if(!state.roster)return empty('球員資料讀取中');
 const d=state.roster,all=d.players||[],currentActive=all.filter(p=>p.roster_status==='active').length;
 const pending=d.phase==='pending'&&!d.season_finished&&!d.season_started;
 const seasonClosed=d.season_finished||['offseason','finished','completed','complete','ended','season_end'].includes(d.phase);
 const moveEnabled=gm()||(!pending&&!seasonClosed);
 const eligible=all.filter(p=>['active','reserve'].includes(p.roster_status));
 const selected=all.filter(p=>state.filter==='all'||(state.filter==='active'?p.roster_status==='active':state.filter==='reserve'?p.roster_status==='reserve':state.filter==='future'?Number(p.players_master?.source_year)>=2025:['2025','2026'].includes(state.filter)?Number(p.players_master?.source_year)===Number(state.filter):false));
 const list=selected.filter(p=>!state.search||String(p.players_master?.full_name||'').includes(state.search));
 const futureCount=all.filter(p=>Number(p.players_master?.source_year)>=2025).length;
 const tabs=[['all','全部'],['active','一軍'],['reserve','二軍'],['future','新秀']];
 if(state.openingMode&&pending&&!gm()){
  const selectedIds=state.openingIds||[];
  const rows=eligible.filter(p=>!state.search||String(p.players_master?.full_name||'').includes(state.search));
  return '<div class="compact-summary"><div><small>開季球季</small><b>'+escape(d.year)+'</b></div><div><small>已選球員</small><b>'+selectedIds.length+'/28</b></div><div><small>開季狀態</small><b>'+(d.opening_roster?.source==='manual'?'已提交':'預設名單')+'</b></div></div>'+
   '<div class="roster-tip">點選二軍球員即可選入新球季一軍，若滿 28 人請先取消其他球員。開季前可重選；未提交則沿用上季季末一軍。</div>'+
   '<div class="inline-search"><input id="filter-players" placeholder="搜尋可選球員" value="'+escape(state.search)+'"><button data-action="search-roster">查詢</button></div>'+
   '<div class="list-scroller">'+rows.map(p=>'<button class="list-row opening-row '+(selectedIds.includes(p.master_player_id)?'checked':'')+'" data-opening-toggle="'+p.master_player_id+'"><span class="selection-indicator">'+(selectedIds.includes(p.master_player_id)?'✓':'○')+'</span><span class="position">'+escape(p.players_master?.primary_position||'—')+'</span><span class="row-main"><strong>'+escape(p.players_master?.full_name||p.master_player_id)+'</strong><small>'+(p.roster_status==='active'?'上季一軍':'二軍')+'</small></span></button>').join('')+'</div>'+
   '<div class="roster-actions"><button class="secondary-action" data-action="cancel-opening">返回</button><button class="primary-action" data-action="save-opening" '+(selectedIds.length===Math.min(28,eligible.length)?'':'disabled')+'>確認開季名單</button></div>';
 }
 const line=p=>{
  const active=p.roster_status==='active',reserve=p.roster_status==='reserve',recentDraft=Number(p.players_master?.source_year)>=2025;
  const availableAt=reserve&&p.promotion_available_at?new Date(p.promotion_available_at).getTime():0;
  const cooldown=!gm()&&reserve&&availableAt>Date.now();
  const full=reserve&&currentActive>=28;
  const blocked=cooldown||full;
  const action=active?'下二軍':reserve?'升一軍':null;
  const label=cooldown?'冷卻至 '+new Date(availableAt).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}):full?'一軍已滿':action;
  return '<div class="list-row '+(recentDraft?'recent-draft-roster-row':'')+'"><span class="position">'+escape(p.players_master?.primary_position||'—')+'</span><button class="player-name" data-player="'+p.master_player_id+'"><strong>'+escape(p.players_master?.full_name||p.master_player_id)+'</strong><small>'+(active?'一軍':reserve?'二軍／預備':'其他狀態')+' · '+(recentDraft?p.players_master?.source_year+' 年選秀 · ':'')+'月薪 '+money(p.monthly_salary_ntd)+'</small></button>'+
   (action&&moveEnabled?'<button class="mini roster-action" data-move="'+p.master_player_id+'" data-to="'+(active?'reserve':'active')+'" '+(blocked?'disabled':'')+'>'+escape(label)+'</button>':'')+'</div>';
 };
 const notice=gm()?'GM 平行測試模式：一、二軍隨時可升降，不受開季、季末與 4 小時冷卻限制；一軍仍限 28 人。':pending?'目前尚未開賽：請按上方「選擇開季 28 人」，勾選要升一軍的球員。開賽後恢復單人升降按鈕。':seasonClosed?'本球季已結束：一軍／二軍升降停用，等待下季選名單。':'降二軍後 4 小時才能再升一軍；升一軍後可立即下放。';
 return '<div class="compact-summary"><div><small>已入隊</small><b>'+eligible.length+'</b></div><div><small>一軍名單</small><b>'+currentActive+'/28</b></div><div><small>25/26 新秀</small><b>'+futureCount+'</b></div></div>'+
 (pending&&!gm()?'<button class="opening-entry" data-action="open-opening"><span>選擇開季 28 人（含升一軍）</span><strong>'+(d.opening_roster?.source==='manual'?'已提交 · 可修改':'預設沿用上季')+' ›</strong></button>':'')+
 '<div class="switch-tabs roster-tabs">'+tabs.map(([id,label])=>'<button data-filter="'+id+'" class="'+(state.filter===id?'selected':'')+'">'+label+(id==='future'?' '+futureCount:'')+'</button>').join('')+'</div>'+
 '<div class="inline-search"><input id="filter-players" placeholder="搜尋球員姓名" value="'+escape(state.search)+'"><button data-action="search-roster">查詢</button></div>'+
 '<div class="roster-tip">'+(['future','2025','2026'].includes(state.filter)?'2025／2026 年新秀已直接加入二軍，可依目前球季的升降規則上到一軍，月薪已設定。':notice)+'</div>'+(['future','2025','2026'].includes(state.filter)?'<div class="future-year-switch"><button data-filter="future" class="'+(state.filter==='future'?'selected':'')+'">全部</button><button data-filter="2025" class="'+(state.filter==='2025'?'selected':'')+'">2025</button><button data-filter="2026" class="'+(state.filter==='2026'?'selected':'')+'">2026</button></div>':'')+'<button class="roster-stats-entry" data-page="stats">查看本球季球員投打成績 ›</button>'+
 '<div class="list-scroller">'+list.map(line).join('')+(list.length?'':empty('沒有符合條件的球員'))+'</div>';
}
const defenseSlots=[['P','投手'],['C','捕手'],['1B','一壘'],['2B','二壘'],['3B','三壘'],['SS','游擊'],['LF','左外'],['CF','中外'],['RF','右外'],['DH','指定打擊']];
function publicStats(p){
 const rows=(p.reference_stats||[]).filter(r=>r.league_level==='first');
 const group=rows.length?rows:(p.reference_stats||[]);
 const batting=group.reduce((a,r)=>{for(const k of ['AB','H','BB','HBP','SF','HR','RBI','SB'])a[k]+=(Number(r.batting?.[k])||0);return a},{AB:0,H:0,BB:0,HBP:0,SF:0,HR:0,RBI:0,SB:0});
 const pitching=group.reduce((a,r)=>{for(const k of ['IP','ER','SO','BB'])a[k]+=(Number(r.pitching?.[k])||0);return a},{IP:0,ER:0,SO:0,BB:0});
 const avg=batting.AB?'.'+String(Math.round(batting.H/batting.AB*1000)).padStart(3,'0'):'—';
 const obp=batting.AB+batting.BB+batting.HBP+batting.SF?'.'+String(Math.round((batting.H+batting.BB+batting.HBP)/(batting.AB+batting.BB+batting.HBP+batting.SF)*1000)).padStart(3,'0'):'—';
 const era=pitching.IP?(pitching.ER*9/(Math.floor(pitching.IP)+((Math.round(pitching.IP*10)%10)/3))).toFixed(2):'—';
 return {avg,obp,hr:batting.AB?batting.HR:'—',rbi:batting.AB?batting.RBI:'—',era,so:pitching.IP?pitching.SO:'—'};
}
function draftForOpponent(){
 const opponent=state.selectedOpponent;
 const saved=(state.coach?.lineups||[]).find(x=>x.opponent_team_id===opponent);
 const active=(state.coach?.players||[]).filter(x=>x.roster_status==='active');
 if(saved)return {order:(saved.batting_order||[]).map(Number),defense:Object.fromEntries(Object.entries(saved.defense||{}).map(([k,v])=>[k,Number(v)])),dirty:false};
 const fielders=active.filter(x=>x.players_master?.primary_position!=='P');
 const pitcher=active.find(x=>x.players_master?.primary_position==='P');
 const chosen=fielders.slice(0,9).map(x=>Number(x.master_player_id));
 const slots=Object.fromEntries(defenseSlots.filter(([k])=>k!=='DH').map(([k],i)=>[k,k==='P'?Number(pitcher?.master_player_id||0):chosen[i>0?i-1:0]||0]));
 return {order:chosen,defense:slots,dirty:false};
}
function coach(){
 const data=state.coach;if(!data)return empty('戰術資料讀取中');
 const opps=TEAMS.filter(t=>t.id!==ownTeam());
 const opp=opps.some(x=>x.id===state.selectedOpponent)?state.selectedOpponent:opps[0]?.id;
 if(opp!==state.selectedOpponent)state.selectedOpponent=opp;
 if(state.view==='lineup'){
  const draft=state.lineupDraft||draftForOpponent();
  const roster=(data.players||[]),byId=new Map(roster.map(p=>[Number(p.master_player_id),p]));
  const name=id=>escape(byId.get(Number(id))?.players_master?.full_name||'尚未選人');
  const batting= draft.order.map((id,i)=>'<div class="lineup-edit-row"><span class="bat-num">'+(i+1)+'</span><div class="lineup-person"><b>'+name(id)+'</b><small>'+escape(byId.get(Number(id))?.players_master?.primary_position||'')+' · '+publicStats(byId.get(Number(id))||{}).avg+' / '+publicStats(byId.get(Number(id))||{}).obp+'</small></div><div class="reorder"><button data-order-up="'+i+'" '+(i===0?'disabled':'')+' aria-label="上移棒次">↑</button><button data-order-down="'+i+'" '+(i===8?'disabled':'')+' aria-label="下移棒次">↓</button></div></div>').join('');
  const dh=draft.order.find(id=>!Object.entries(draft.defense).some(([key,value])=>key!=='P'&&Number(value)===Number(id)));
  const defense=defenseSlots.map(([key,label])=>'<div class="lineup-edit-row"><span class="def-pos">'+label+'</span><button data-pick-defense="'+key+'" class="lineup-person"><b>'+name(key==='DH'?dh:draft.defense[key])+'</b><small>'+(key==='P'?'僅可選投手':key==='DH'?'指定打擊 · 僅可選打者':'僅可選打者')+'</small></button><span class="lineup-arrow">›</span></div>').join('');
  const picker=state.lineupPicker;
  const pickerBody=picker?'<div class="overlay"><div class="dialog picker-dialog"><div class="dialog-title"><strong>選擇'+escape(defenseSlots.find(x=>x[0]===picker.key)?.[1]||'守備')+'球員</strong><button data-action="close-picker">×</button></div><div class="picker-headers"><span>2024 公開成績 · '+(picker.key==='P'?'限投手':'限打者')+'</span><span>'+(picker.key==='P'?'ERA / SO':'AVG / OBP / HR')+'</span></div><div class="picker-list">'+roster.filter(p=>p.roster_status==='active'&&(picker.key==='P'?p.players_master?.primary_position==='P':p.players_master?.primary_position!=='P')).map(p=>{const n=Number(p.master_player_id),v=publicStats(p);return '<button data-choose-player="'+n+'"><span><b>'+escape(p.players_master?.full_name||n)+'</b><small>'+escape(p.players_master?.primary_position||'—')+'</small></span><span class="picker-stats">'+(picker.key==='P'?v.era+' / '+v.so:v.avg+' / '+v.obp+' / '+v.hr)+'</span></button>'}).join('')+'</div></div></div>':'';
  return '<div class="editor-shell"><div class="editor-head"><button class="editor-back" data-action="exit-lineup">‹ 戰術選單</button><div class="editor-opponent">'+escape(tname(opp))+'</div></div>'+
   '<div class="editor-tabs"><button data-lineup-tab="batting" class="'+(state.lineupTab==='batting'?'selected':'')+'">打擊順序</button><button data-lineup-tab="defense" class="'+(state.lineupTab==='defense'?'selected':'')+'">守備位置</button></div>'+
   '<div class="editor-rows '+(state.lineupTab==='defense'?'defense-rows':'')+'">'+(state.lineupTab==='batting'?batting:defense)+'</div>'+
   '<div class="editor-actions"><button data-action="suggest-lineup" class="secondary-action">系統建議</button><button data-action="save-lineup" class="primary-action">儲存打線</button></div>'+
   '<div class="editor-hint">資料為 2024 年公開成績，非隱藏戰力。投手不能進入九棒；打擊順序僅能上下調整，換人請至守備位置（含 DH）。</div></div>'+pickerBody;
 }
 return '<section class="panel tactics-main"><div class="panel-title">對戰專用打線</div><div class="form-row"><label>對戰對手</label><select id="opponent">'+opps.map(t=>'<option value="'+t.id+'" '+(opp===t.id?'selected':'')+'>'+t.name+'</option>').join('')+'</select></div><div class="stack-buttons"><button data-action="enter-lineup">編輯完整先發打線 <span>›</span></button><button data-action="suggest-lineup">取得系統建議 <span>›</span></button><button data-page="roster">球員升降管理 <span>›</span></button></div><p class="quiet">點「編輯完整先發打線」會開啟全頁，完整顯示九棒，打擊順序僅可上下調整，換人請至守備位置（含 DH）。</p></section>';
}
function season(){
 const games=state.session?.upcoming||[],recent=state.session?.recent||[];
 const current=state.gameTab==='schedule'?games:recent;
 const tabs=[['schedule','聯盟賽程'],['results','最新戰報'],['standings','聯盟排名'],['rules','賽事週期']];
 return '<div class="switch-tabs arena-tabs">'+tabs.map(([id,name])=>'<button data-gametab="'+id+'" class="'+(state.gameTab===id?'selected':'')+'">'+name+'</button>').join('')+'</div>'+
 (state.gameTab==='standings'?'<div class="standings-board"><div class="standings-head"><span>排名</span><span>球隊</span><span>勝-敗-和</span><span>勝率</span></div>'+(state.session?.standings||[]).map((t,i)=>'<div class="standings-row '+(t.team_id===ownTeam()?'mine':'')+'"><span>'+(i+1)+'</span><b>'+escape(tname(t.team_id))+'</b><span>'+t.wins+'-'+t.losses+'-'+t.draws+'</span><strong>'+(t.wins+t.losses?t.win_pct.toFixed(3):'—')+'</strong></div>').join('')+'</div>':
 state.gameTab==='rules'?'<div class="league-schedule">'+
 [['MON','週一訓練','球員成長、簽約結算'],['TUE–FRI','例行賽','08:00 – 23:00'],['SAT','季後賽','12:00 – 20:00'],['OFF','休賽管理','陣容與市場管理']].map(([day,title,desc])=>'<div class="schedule-cycle"><span>'+day+'</span><div><b>'+title+'</b><small>'+desc+'</small></div></div>').join('')+'</div>':
 '<div class="list-scroller match-feed">'+current.map(g=>'<div class="match-card"><div class="match-card-label"><span>'+escape(g.season_stage==='playoff'?'季後賽':'例行賽')+'</span><small>'+toDate(g.scheduled_at)+'</small></div><div class="match-card-grid"><div><b>'+escape(tname(g.away_team_id))+'</b><small>客隊</small></div><strong>'+(g.away_score??'—')+'<i>:</i>'+(g.home_score??'—')+'</strong><div><b>'+escape(tname(g.home_team_id))+'</b><small>主隊</small></div></div></div>').join('')+(current.length?'':empty('目前還沒有賽事紀錄，聯盟啟動後將在此顯示'))+'</div>');
}
function market(){
 const all=gm()?(state.gmMarket?.players||[]):(state.fa?.players||[]);
 const current=gm()?all.filter(p=>state.marketTab==='own'?p.team_id===ownTeam():p.team_id!==ownTeam()):all;
 const list=current.filter(p=>!state.search||String(p.players_master?.full_name||'').includes(state.search));
 return (gm()?'':'<button class="opening-entry" data-page="trades"><span>六隊球員交易提案</span><strong>提出／接受交易 ›</strong></button>')+'<div class="market-hero"><span>PLAYER MARKET // '+escape(state.session?.year||'2024')+'</span><b>'+(gm()?'平行宇宙 · 即時交易':'自由球員競價市場')+'</b><small>'+(gm()?'在自己的平行球團自由簽人，不影響正式六隊':'球員提出報價後，依聯盟週期結算')+'</small></div>'+
 (gm()?'<div class="switch-tabs"><button data-markettab="available" class="'+(state.marketTab==='available'?'selected':'')+'">市場球員</button><button data-markettab="own" class="'+(state.marketTab==='own'?'selected':'')+'">本隊續約</button></div>':'')+
 '<div class="inline-search"><input id="filter-market" placeholder="搜尋姓名 / 球員" value="'+escape(state.search)+'"><button data-action="search-market">搜尋</button></div>'+
 '<div class="list-scroller market-rows">'+list.slice(0,220).map(p=>'<div class="list-row"><span class="position">'+escape(p.players_master?.primary_position||'—')+'</span><span class="row-main"><strong>'+escape(p.players_master?.full_name||p.master_player_id)+'</strong><small>'+escape(gm()?tname(p.team_id):'自由身分')+' · 月薪 '+money(p.monthly_salary_ntd)+'</small></span><button class="mini scout-mini" data-scout-id="'+p.master_player_id+'">球探</button><button class="mini" data-sign="'+p.master_player_id+'">'+(gm()?(p.team_id===ownTeam()?'續約':'簽入'):'報價')+'</button></div>').join('')+(list.length?'':empty('此分類暫時沒有符合條件的球員'))+'</div>';
}

function trades(){
 if(gm())return empty('GM 獨立沙盒不參與正式六隊交易');
 const board=state.tradeBoard;
 if(!board)return empty('正在讀取交易市場');
 const candidates=board.candidates||[],offers=board.offers||[];
 const ownTeamId=ownTeam();
 const teamOptions=TEAMS.filter(t=>t.id!==ownTeamId);
 const target=teamOptions.some(t=>t.id===state.tradeTargetTeam)?state.tradeTargetTeam:teamOptions[0]?.id;
 if(!state.tradeTargetTeam)state.tradeTargetTeam=target;
 const mine=candidates.filter(p=>p.team_id===ownTeamId);
 const theirs=candidates.filter(p=>p.team_id===target);
 const map=new Map(candidates.map(p=>[Number(p.master_player_id),p]));
 const selectedName=id=>escape(map.get(Number(id))?.players_master?.full_name||'球員 '+id);
 const offerRows=offers.map(o=>{
   const received=o.target_team_id===ownTeamId, pending=o.status==='pending';
   return '<div class="trade-offer-row"><div><small>'+escape(received?'對方提案 · '+tname(o.proposer_team_id):'我方提案 · '+tname(o.target_team_id))+'</small><b>'+selectedName(o.offered_player_id)+' ⇄ '+selectedName(o.requested_player_id)+'</b><small>'+escape({pending:'待回覆',accepted:'交易完成',rejected:'已拒絕',cancelled:'已取消'}[o.status]||o.status)+'</small></div>'+
    (pending?'<div class="trade-decision">'+(received?'<button data-trade-id="'+o.id+'" data-trade-accept="true">接受</button>':'')+'<button data-trade-id="'+o.id+'" data-trade-accept="false">'+(received?'拒絕':'取消')+'</button></div>':'')+'</div>';
 }).join('');
 return '<div class="market-hero"><span>TRADE CENTER // OFFICIAL LEAGUE</span><b>六隊交易室</b><small>交易提案由對方球隊經理核准；目前僅開放預備／二軍球員一換一，避免一軍 28 人數失衡。</small></div>'+
 '<div class="trade-form"><form id="trade-form"><label>想向哪支球隊交易？</label><select id="trade-target-team">'+teamOptions.map(t=>'<option value="'+t.id+'" '+(t.id===target?'selected':'')+'>'+t.name+'</option>').join('')+'</select>'+
 '<label>我方提出的二軍球員</label><select name="offered" required>'+mine.map(p=>'<option value="'+p.master_player_id+'">'+escape(p.players_master?.full_name||p.master_player_id)+' · '+escape(p.players_master?.primary_position||'—')+'</option>').join('')+'</select>'+
 '<label>想交換對方的二軍球員</label><select name="requested" required>'+theirs.map(p=>'<option value="'+p.master_player_id+'">'+escape(p.players_master?.full_name||p.master_player_id)+' · '+escape(p.players_master?.primary_position||'—')+'</option>').join('')+'</select>'+
 '<button type="submit" '+(!mine.length||!theirs.length?'disabled':'')+'>送出交易提案</button></form></div>'+
 '<div class="finance-section-head"><b>我的交易提案</b><small>'+offers.length+' 筆</small></div>'+
 '<div class="list-scroller trade-history">'+(offerRows||empty('目前尚無交易紀錄'))+'</div>';
}

function finance(){
 const data=state.session||{},f=data.finances?.find(x=>x.team_id===ownTeam()),r=data.roster_summary||{},m=data.monthly_finance||{};
 const cash=Number(f?.cash_ntd||0),events=data.finance_entries||[];
 const income=Number(data.season_game_income_ntd||0);
 const bills=[
 ['球員月薪',Number(m.salary_due_ntd||r.monthly_payroll_ntd||0),'薪資合約'],
 ['球場維護',Number(m.stadium_due_ntd??800000),'草皮、設施及器材維修'],
 ['教練行政',Number(m.staff_due_ntd??1250000),'教練團、行政及後勤'],
 ['交通住宿',Number(m.travel_due_ntd??400000),'移動、住宿及補給'],
 ['訓練設備',Number(m.equipment_due_ntd??350000),'球具、訓練與雜支']
 ];
 const monthlyTotal=bills.reduce((a,x)=>a+x[1],0);
 const types={monthly_player_salary:'球員薪資',monthly_stadium_maintenance:'球場維護',monthly_coach_admin:'教練與行政',monthly_travel:'交通與住宿',monthly_training_equipment:'訓練設備及雜支',annual_salary_reversal:'舊制年薪退還',annual_player_payroll:'舊制全年薪資',home_game_net:'主場賽事淨收入',away_game_media:'客場轉播分潤',sponsor_estimate:'年度贊助收入',gm_adjust:'GM 手動調整',annual_training_cost:'年度訓練費'};
 return '<div class="finance-arena"><span>FRONT OFFICE // CASH FLOW</span><small>球團可用資金</small><strong>NT$ '+fmt(cash)+'</strong><p>本季已結算 '+escape(data.months_charged||0)+'/12 個遊戲月份</p></div>'+
 '<div class="finance-kpi-grid"><div><small>每月固定支出</small><strong class="negative">'+money(monthlyTotal)+'</strong><span>一、二軍與營運雜支</span></div><div><small>本季賽事收入</small><strong class="positive">+'+money(income)+'</strong><span>主場淨收入＋客場分潤</span></div></div>'+
 '<div class="finance-section-head"><b>每月支出明細</b><small>第 '+escape(m.month_no||1)+' 月基準</small></div>'+
 '<div class="monthly-expenses">'+bills.map(([name,amount,detail])=>'<div class="expense-row"><div><b>'+name+'</b><small>'+detail+'</small></div><strong>−'+money(amount)+'</strong></div>').join('')+'</div>'+
 '<div class="finance-section-head"><b>近期收支紀錄</b><small>最新 '+events.length+' 筆</small></div>'+
 '<div class="list-scroller finance-transactions">'+events.map(e=>'<div class="finance-transaction"><div><b>'+escape(types[e.kind]||e.kind)+'</b><small>'+toDate(e.created_at)+'</small></div><strong class="'+(Number(e.amount_ntd)>=0?'positive':'negative')+'">'+(Number(e.amount_ntd)>=0?'+':'−')+'NT$ '+fmt(Math.abs(Number(e.amount_ntd||0)))+'</strong></div>').join('')+(events.length?'':empty('尚無收支紀錄'))+'</div>'+
 '<div class="finance-explain">每 10 場例行賽代表一個遊戲月份，球季共 12 個月。固定支出與每場球賽收支分開計算；資金不足轉為負債。票價、雜支和球場維護費均為遊戲估值。</div>';
}

function teamStats(){
 const all=state.seasonStats?.players||[];
 const pitchers=all.filter(x=>x.primary_position==='P');
 const hitters=all.filter(x=>x.primary_position!=='P');
 const list=state.statTab==='pitchers'?pitchers:hitters;
 const avg=x=>x.pa>x.walks?'.'+String(Math.round(x.hits/(x.pa-x.walks)*1000)).padStart(3,'0'):'—';
 const era=x=>x.pitching_outs>0?(x.earned_runs*27/x.pitching_outs).toFixed(2):'—';
 return '<div class="roster-tip">本球季實際模擬成績；至少打完一場才會有資料。</div>'+
 '<div class="switch-tabs"><button data-stat-tab="batters" class="'+(state.statTab==='batters'?'selected':'')+'">打擊成績</button><button data-stat-tab="pitchers" class="'+(state.statTab==='pitchers'?'selected':'')+'">投球成績</button></div>'+
 '<div class="list-scroller">'+list.map(x=>'<div class="stats-player-row"><div><strong>'+escape(x.full_name)+'</strong><small>'+escape(x.primary_position||'—')+' · '+x.games+' 場</small></div><div><b>'+(state.statTab==='pitchers'?era(x):avg(x))+'</b><small>'+(state.statTab==='pitchers'?'ERA · K '+x.pitching_strikeouts:'AVG · HR '+x.home_runs+' · RBI '+x.rbi)+'</small></div></div>').join('')+
 (list.length?'':empty('本季尚無球員出賽成績'))+'</div>'+
 '<button class="gm-observe-link" data-page="roster">返回球員中心</button>';
}
function awards(){
 const d=state.awards?.awards||[];
 const awardNames={MVP:'年度最有價值球員',HOME_RUN_KING:'全壘打王',BATTING_CHAMPION:'打擊王',STRIKEOUT_KING:'三振王'};
 return '<div class="roster-tip">歷年總冠軍及個人獎項將持續累積。</div>'+
 '<div class="list-scroller">'+d.map(x=>'<div class="stats-player-row"><div><strong>'+escape(x.season_year+' '+(awardNames[x.award_code]||x.award_code))+'</strong><small>'+escape(tname(x.team_id))+'</small></div><div><b>'+escape(x.players_master?.full_name||x.player_id)+'</b></div></div>').join('')+
 (d.length?'':empty('目前尚未頒發年度獎項'))+'</div>'+
 '<button class="gm-observe-link" data-page="club">返回球團資料</button>';
}

function club(){
 const champions=(state.session?.champions||[]).map(x=>'<div class="lineup-row"><span>'+escape(x.season_year)+' 年總冠軍</span><b>'+escape(tname(x.team_id))+'</b></div>').join('');
 return box('球團資訊','<div class="financial-row"><span>所屬球隊</span><b>'+escape(gm()?'GM 平行球團':tname(ownTeam()))+'</b></div><div class="financial-row"><span>遊戲球季</span><b>'+escape(state.session?.year)+'</b></div><div class="financial-row"><span>管理模式</span><b>'+(gm()?'獨立模擬':'六隊真人')+'</b></div>')+
 box('王朝歷史',champions||'<p class="quiet">首季總冠軍尚未產生。</p>')+
 '<button class="gm-observe-link" data-page="awards">歷年個人獎項 ›</button>';
}
function lab(){
 if(!gm())return empty('此功能僅供 GM 平行球團操作');
 const d=state.diagnostics?.report||{};
 const list=d.issues||[];
 return '<div class="gm-lab"><div class="market-hero"><span>GM SANDBOX // DEBUG TOOLS</span><b>聯盟測試控制中心</b><small>這些操作只影響 GM 平行聯盟，不會修改正式六隊比賽及球員。</small></div>'+
 '<div class="compact-summary"><div><small>目前球季</small><b>'+escape(d.year??state.session?.year??'—')+'</b></div><div><small>已完賽</small><b>'+escape(d.finished_games??'—')+'</b></div><div><small>待模擬</small><b>'+escape(d.scheduled_games??'—')+'</b></div></div>'+
 '<div class="gm-lab-actions">'+
 '<button data-gm-simulate="1" '+(state.gmBusy?'disabled':'')+'><span>▶</span><b>下一場</b><small>模擬 1 場</small></button>'+
 '<button data-gm-simulate="10" '+(state.gmBusy?'disabled':'')+'><span>≫</span><b>下一個月</b><small>最多模擬 10 場</small></button>'+
 '<button data-gm-simulate="30" '+(state.gmBusy?'disabled':'')+'><span>⚡</span><b>批次模擬</b><small>最多模擬 30 場</small></button>'+
 '<button data-action="gm-check" '+(state.gmBusy?'disabled':'')+'><span>✓</span><b>資料健檢</b><small>名單、打線、財務</small></button>'+
 '</div><div class="gm-lab-report"><div class="finance-section-head"><b>系統完整性檢查</b><small>'+(d.checked_at?toDate(d.checked_at):'尚未檢查')+'</small></div>'+
 (list.length?list.map(x=>'<div class="gm-issue '+(x.level==='error'?'gm-issue-error':'')+'"><strong>'+escape(x.code||'CHECK')+'</strong><span>'+escape(x.message)+'</span></div>').join(''):
 '<div class="gm-no-issues">✓ '+(d.checked_at?'目前檢查項目沒有異常':'請按「資料健檢」檢查')+'</div>')+
 '</div><div class="roster-tip">快轉僅處理 GM 模擬聯盟；正式六隊已排定明天上午 08:00 開賽，不會受到影響。</div>'+
 '<button class="gm-observe-link" data-page="observe">查看正式六隊唯讀情報 ↗</button></div>';
}
function observe(){
 const d=state.observer;
 if(!d)return empty('正在讀取六隊狀況');
 return '<div class="market-banner">正式六隊 · 僅供查看<br>這裡的資料與 GM 平行球團完全獨立，不能在此替球隊簽約。</div><div class="team-observe">'+(d.teams||[]).map(x=>'<div class="observe-card"><div class="observe-title"><i style="background:'+escape(teamMap[x.team_id]?.color||'#888')+'"></i><strong>'+escape(tname(x.team_id))+'</strong><span>'+x.wins+'勝 '+x.losses+'敗</span></div><div class="observe-stats"><div>一軍<b>'+x.active+'/28</b></div><div>球員<b>'+x.players+'</b></div><div>資金<b>'+money(x.cash_ntd)+'</b></div></div></div>').join('')+'</div>';
}
function modal(){
 if(!state.modal)return '';
 const m=state.modal;
 return '<div class="overlay"><div class="dialog"><div class="dialog-title"><strong>'+escape(m.title)+'</strong><button data-action="close-modal" aria-label="關閉">×</button></div>'+m.content+'</div></div>';
}
function openPlayer(id){
 const p=(state.roster?.players||[]).find(x=>x.master_player_id===id);if(!p)return;
 const master=p.players_master||{},year=Number(master.draft_year||master.source_year||0);
 const title=master.full_name||'球員資料';
 const status=p.roster_status==='active'?'一軍':p.roster_status==='reserve'?'二軍／預備':p.roster_status;
 state.modal={title,content:'<div class="player-game-heading"><span>'+escape(master.primary_position||'—')+'</span><b>'+escape(title)+'</b><small>'+escape(year||'')+'</small></div>'+
 '<div class="financial-row"><span>名單狀態</span><b>'+escape(status)+'</b></div>'+
 '<div class="financial-row"><span>選秀年度</span><b>'+escape(year||'—')+'</b></div>'+
 '<div class="financial-row"><span>月薪</span><b>'+money(p.monthly_salary_ntd)+'</b></div>'+
 '<div class="financial-row"><span>疲勞／士氣</span><b>'+escape(p.condition?.fatigue??0)+' / '+escape(p.condition?.morale??50)+'</b></div>'+
 '<div class="financial-row"><span>合約年限</span><b>'+escape(p.contract_years||'—')+'</b></div>'+
 '<p class="quiet">'+(year>=2025?'2025／2026 年新秀已正式列入二軍，現在可升降；新秀月薪為遊戲估值。':'薪資來源：'+salaryTag(p)+'。不顯示隱藏戰力。')+'</p>'};render();
}
function openSign(id){
 const p=(gm()?state.gmMarket?.players:state.fa?.players||[])?.find(x=>x.master_player_id===id);
 if(!p)return;
 state.modal={title:(gm()?'即時簽約／續約：':'自由球員報價：')+(p.players_master?.full_name||id),content:
 '<form id="sign-form"><input type="hidden" name="player" value="'+id+'"><label>月薪（新臺幣）</label><input name="salary" type="number" min="70000" max="50000000" value="'+(p.monthly_salary_ntd||100000)+'" required><label>合約年限</label><select name="years">'+[1,2,3,4,5].map(n=>'<option value="'+n+'">'+n+' 年</option>').join('')+'</select><p class="quiet">'+(gm()?'送出後立即完成平行球團簽約，不影響正式聯盟。':'報價將依正式聯盟規則處理。')+'</p><button class="main-action" type="submit">'+(gm()?'確認立即簽約':'送出報價')+'</button></form>'};render();
}
function render(){
 if(!state.session){root.innerHTML=login();return;}
 const labels={home:'球團總部',roster:'球員名單',coach:'戰術設定',season:'賽程戰績',market:'自由球員',finance:'財務合約',club:'球團資訊',observe:'正式六隊狀況',lab:'GM 測試中心',stats:'本季球員成績',awards:'歷年年度獎項',trades:'聯盟交易室'};
 const body={home,roster,coach,season,market,finance,club,observe,lab,stats:teamStats,awards,trades}[state.page]();
 const c=teamMap[ownTeam()]?.color||'#d0aa64';
 root.style.setProperty('--team',c);
 root.innerHTML=top()+'<main class="main"><div class="page-head"><h2>'+labels[state.page]+'</h2><button type="button" class="tiny-button" data-action="refresh">⟳</button></div>'+(state.notice?'<div class="notice" role="status">'+escape(state.notice)+'</div>':'')+'<div class="page-body">'+body+'</div></main>'+bottom()+modal();
}
async function load(){
 try{
 if(state.page==='home'||state.page==='season'||state.page==='finance'||state.page==='club')state.session=await apiCall('status');
 else if(state.page==='roster')state.roster=await apiCall('roster',{team_id:ownTeam()});
 else if(state.page==='coach')state.coach=await apiCall('coach-config',{team_id:ownTeam()});
 else if(state.page==='market'){if(gm())state.gmMarket=await apiCall('gm-market');else state.fa=await apiCall('free-agents');}
 else if(state.page==='observe'&&gm())state.observer=await apiCall('gm-observe');
 else if(state.page==='lab'&&gm())state.diagnostics=await apiCall('gm-diagnostics');
 else if(state.page==='stats')state.seasonStats=await apiCall('team-stats');
 else if(state.page==='awards')state.awards=await apiCall('awards');
 else if(state.page==='trades'&&!gm())state.tradeBoard=await apiCall('trade-board');
 state.notice='';
 }catch(e){state.notice=e.message||'讀取失敗';}
 render();
}
function goto(page){
 state.page=page;state.lineupDraft=null;state.lineupPicker=null;state.view='';state.search='';state.filter='all';state.openingMode=false;state.openingIds=null;state.notice='';
 if((page==='observe'||page==='lab')&&!gm()){state.page='home';return render();}
 if(page==='trades'&&gm()){state.page='market';return render();}
 render();void load();
}
root.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.page){goto(b.dataset.page);return;}
 if(b.dataset.gmSimulate!==undefined){
  if(!gm()||state.gmBusy)return;
  const count=Number(b.dataset.gmSimulate);
  if(!confirm('確定在 GM 平行聯盟模擬 '+count+' 場比賽？正式六隊不會受影響。'))return;
  state.gmBusy=true;state.notice='GM 模擬中…';render();
  try{
    const result=await apiCall('gm-simulate',{count});
    const simulated=result.simulation?.simulated||0;
    state.diagnostics=await apiCall('gm-diagnostics');
    state.notice='GM 平行聯盟完成 '+simulated+' 場比賽，正式六隊未變更。';
  }catch(err){state.notice=err.message||'GM 模擬失敗';}
  finally{state.gmBusy=false;render();}
  return;
 }

 if(b.dataset.tradeId){
   if(!confirm('確定'+(b.dataset.tradeAccept==='true'?'接受':'拒絕／取消')+'這筆球員交易？'))return;
   try{await apiCall('trade-respond',{offer_id:b.dataset.tradeId,accept:b.dataset.tradeAccept==='true'});state.tradeBoard=await apiCall('trade-board');state.notice='交易提案已處理';render();}catch(err){state.notice=err.message||'交易操作失敗';render();}return;
 }
 if(b.dataset.lineupTab){state.lineupTab=b.dataset.lineupTab;render();return;}
 if(b.dataset.statTab){state.statTab=b.dataset.statTab;render();return;}
 if(b.dataset.orderUp!==undefined||b.dataset.orderDown!==undefined){const index=Number(b.dataset.orderUp??b.dataset.orderDown),other=index+(b.dataset.orderUp!==undefined?-1:1),order=state.lineupDraft?.order||[];if(other>=0&&other<order.length){[order[index],order[other]]=[order[other],order[index]];state.lineupDraft.dirty=true;}render();return;}
 if(b.dataset.pickDefense){state.lineupPicker={type:'def',key:b.dataset.pickDefense};render();return;}
 if(b.dataset.choosePlayer!==undefined){
  const id=Number(b.dataset.choosePlayer),d=state.lineupDraft,p=state.lineupPicker;
  const roster=state.coach?.players||[];
  const chosen=roster.find(x=>Number(x.master_player_id)===id&&x.roster_status==='active');
  if(!d||!p||!chosen){state.notice='球員資料已變更，請重新整理';render();return;}
  const isPitcher=chosen.players_master?.primary_position==='P';
  if((p.key==='P')!==isPitcher){state.notice=p.key==='P'?'投手位置只能選擇投手':'此位置只能選擇打者';render();return;}
  if(p.key==='P'){d.defense.P=id;}
  else {
    const slots=defenseSlots.filter(([key])=>key!=='P'&&key!=='DH').map(([key])=>key);
    const dh=d.order.find(x=>!slots.some(k=>Number(d.defense[k])===Number(x)));
    const old=p.key==='DH'?dh:Number(d.defense[p.key]);
    if(!old||!d.order.includes(Number(old))){state.notice='打線不完整，請先載入系統建議';render();return;}
    const occupied=slots.find(k=>Number(d.defense[k])===id);
    const inOrder=d.order.includes(id);
    if(p.key==='DH'){
      if(occupied)d.defense[occupied]=Number(old);
      else if(!inOrder)d.order[d.order.indexOf(Number(old))]=id;
    }else{
      d.defense[p.key]=id;
      if(occupied&&occupied!==p.key)d.defense[occupied]=Number(old);
      else if(id===Number(dh)){} 
      else if(!inOrder)d.order[d.order.indexOf(Number(old))]=id;
    }
  }
  d.dirty=true;state.lineupPicker=null;state.notice='';render();return;
 }
 if(b.dataset.filter){state.filter=b.dataset.filter;render();return;}
 if(b.dataset.gametab){state.gameTab=b.dataset.gametab;render();return;}
 if(b.dataset.markettab){state.marketTab=b.dataset.markettab;state.search='';render();return;}
 if(b.dataset.view){state.view=state.view===b.dataset.view?'':b.dataset.view;render();return;}
 if(b.dataset.player){openPlayer(Number(b.dataset.player));return;}
 if(b.dataset.openingToggle){const id=Number(b.dataset.openingToggle);const selected=state.openingIds||[];state.openingIds=selected.includes(id)?selected.filter(x=>x!==id):selected.length<28?[...selected,id]:selected;render();return;}
 if(b.dataset.scoutId!==undefined){
  const playerId=Number(b.dataset.scoutId);
  if(!confirm('球探報告初次費用 NT$25,000；同一年同一球員重新查看不會重複扣費。確定查看？'))return;
  try{
   const res=await apiCall('scout-player',{player_id:playerId});
   const report=res.report||{},grade=Number(report.grade||0);
   state.modal={title:'球探評估',content:'<div class="player-game-heading"><span>★</span><b>評估級別 '+grade+'/5</b></div><p class="quiet">'+escape(report.evidence||'公開資料評估')+'</p><div class="financial-row"><span>本次支出</span><b>'+money(report.fee_ntd||0)+'</b></div><p class="quiet">球探評估不會揭露真正的隱藏戰力。</p>'};
   state.session=await apiCall('status');state.notice='';
  }catch(err){state.notice=err.message||'球探失敗';}render();return;
 }
 if(b.dataset.sign){openSign(Number(b.dataset.sign));return;}
 if(b.dataset.move||b.dataset.demote){const id=Number(b.dataset.move||b.dataset.demote),to=b.dataset.to||'reserve';if(!confirm('確定將這名球員'+(to==='active'?'升上一軍':'下放二軍')+'？'+(gm()?'GM 測試模式不需要冷卻。':'降二軍後需等待 4 小時才能升回一軍。')))return;try{await apiCall('coach-move',{team_id:ownTeam(),player_id:id,to_level:to});state.roster=await apiCall('roster',{team_id:ownTeam()});state.coach=null;state.notice=gm()?'GM 測試模式：已完成'+(to==='active'?'升一軍':'降二軍')+'，可立即反向操作。':to==='active'?'已升上一軍，可隨時再降二軍。':'已下放二軍，4 小時後可再升一軍。';render();}catch(err){state.notice=err.message;render()}return;}
 const action=b.dataset.action;
 if(action==='gm-check'){if(!gm()||state.gmBusy)return;state.gmBusy=true;try{state.diagnostics=await apiCall('gm-diagnostics');state.notice='已完成 GM 平行聯盟資料健檢';}catch(err){state.notice=err.message||'健檢失敗';}finally{state.gmBusy=false;render();}}
 else if(action==='enter-lineup'){state.lineupDraft=draftForOpponent();state.lineupTab='batting';state.view='lineup';render();}
 else if(action==='exit-lineup'){state.view='';state.lineupDraft=null;state.lineupPicker=null;render();}
 else if(action==='close-picker'){state.lineupPicker=null;render();}
 else if(action==='save-lineup'){const d=state.lineupDraft;try{if(!d||d.order.length!==9||new Set(d.order).size!==9||Object.values(d.defense).some(x=>!x))throw Error('需選滿九棒與九個守備位置');
   const active=state.coach?.players?.filter(x=>x.roster_status==='active')||[];
   const byId=new Map(active.map(x=>[Number(x.master_player_id),x]));
   const values=Object.values(d.defense).map(Number);
   if(new Set(values).size!==9||!values.every(id=>byId.has(id)))throw Error('守備球員不可重複且必須在一軍');
   if(byId.get(Number(d.defense.P))?.players_master?.primary_position!=='P')throw Error('投手位置只能使用投手');
   if(values.filter(id=>id!==Number(d.defense.P)).some(id=>byId.get(id)?.players_master?.primary_position==='P'))throw Error('野手守備位置不能使用投手');
   if(d.order.some(id=>!byId.has(Number(id))||byId.get(Number(id))?.players_master?.primary_position==='P'))throw Error('打擊順序只能安排一軍打者');
   if(values.filter(id=>id!==Number(d.defense.P)).some(id=>!d.order.includes(id)))throw Error('八名守備野手必須列在打擊順序內');await apiCall('coach-save',{team_id:ownTeam(),opponent_team_id:state.selectedOpponent,batting_order:d.order,defense:d.defense});state.coach=await apiCall('coach-config',{team_id:ownTeam()});state.lineupDraft=draftForOpponent();state.notice='先發打線已儲存。';render();}catch(err){state.notice=err.message||'儲存失敗';render();}}
 else if(action==='suggest-lineup'){try{const r=await apiCall('coach-default',{team_id:ownTeam()});const v=r.default_lineup;state.lineupDraft={order:(v.batting_order||[]).map(Number),defense:Object.fromEntries(Object.entries(v.defense||{}).map(([k,id])=>[k,Number(id)])),dirty:true};state.view='lineup';state.lineupTab='batting';state.notice='已載入系統建議；按儲存才會套用。';render();}catch(err){state.notice=err.message;render();}}
 else if(action==='open-opening'){state.openingMode=true;state.openingIds=[...(state.roster?.opening_roster?.player_ids||state.roster?.players?.filter(p=>p.roster_status==='active').map(p=>p.master_player_id)||[])].slice(0,28);state.search='';render();}
 else if(action==='cancel-opening'){state.openingMode=false;state.search='';render();}
 else if(action==='save-opening'){try{await apiCall('first-team-save',{team_id:ownTeam(),player_ids:state.openingIds||[]});state.roster=await apiCall('roster',{team_id:ownTeam()});state.openingMode=false;state.search='';state.notice='新球季一軍名單已提交，開季前仍可修改。';render();}catch(err){state.notice=err.message||'名單提交失敗';render();}}
 else if(action==='logout'){await signOut();state.session=null;state.notice='';render();}
 else if(action==='refresh'){void load();}
 else if(action==='close-modal'){state.modal=null;render();}
 else if(action==='search-roster'){state.search=root.querySelector('#filter-players')?.value.trim()||'';render();}
 else if(action==='search-market'){state.search=root.querySelector('#filter-market')?.value.trim()||'';render();}
 else if(action==='suggest'){try{const r=await apiCall('coach-default',{team_id:ownTeam()});state.notice='建議打線已取得。打序編輯功能仍在整合中。';render();}catch(err){state.notice=err.message;render()}}
});
root.addEventListener('change',e=>{
 if(e.target.id==='trade-target-team'){state.tradeTargetTeam=e.target.value;render();}
 if(e.target.id==='opponent'){state.selectedOpponent=e.target.value;state.lineupDraft=null;render();}
 if(e.target.name==='user'){state.loginUser=e.target.value;}
});
root.addEventListener('submit',async e=>{
 e.preventDefault();
 const f=e.target;
 if(f.id==='login-form'){
  if(state.loading)return;
  const username=f.elements.user.value,pin=f.elements.pin.value;
  state.loginUser=username;state.loading=true;state.notice='';
  try{const result=await signIn(username,pin);state.session=result.status;state.page='home';}
  catch(err){state.notice=err.message||'登入失敗'}
  finally{state.loading=false;render()}
 } else if(f.id==='trade-form'){
  try{
   const offered=Number(f.elements.offered.value),requested=Number(f.elements.requested.value);
   await apiCall('trade-offer',{offered_player_id:offered,requested_player_id:requested});
   state.tradeBoard=await apiCall('trade-board');
   state.notice='交易提案已送出，等待對方球隊經理回覆';
  }catch(err){state.notice=err.message||'提案失敗';}render();
 } else if(f.id==='sign-form'){
  const playerId=Number(f.elements.player.value),salary=Number(f.elements.salary.value),years=Number(f.elements.years.value);
  if(!Number.isSafeInteger(salary)||salary<70000||salary>50000000||years<1||years>5){state.notice='請輸入合法薪資與年限';state.modal=null;render();return;}
  try{
   await apiCall(gm()?'gm-sign':'offer-fa',{team_id:ownTeam(),player_id:playerId,salary_ntd:salary,years});
   state.modal=null;state.notice=gm()?'平行球團簽約已完成':'報價已送出';
   if(gm())state.gmMarket=await apiCall('gm-market');else state.fa=await apiCall('free-agents');
  }catch(err){state.modal=null;state.notice=err.message||'簽約失敗'}
  render();
 }
});
root.innerHTML='<main class="auth"><h1>鑽石王朝</h1><p>連線確認中…</p></main>';
if(getSessionMetadata())apiCall('status').then(status=>{state.session=status;render()}).catch(()=>{state.session=null;render()});
else render();
