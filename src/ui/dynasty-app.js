import {TEAMS} from '../config.js';
import {signIn,signOut,apiCall,getSessionMetadata} from '../backend/auth.js';

const root=document.querySelector('#app');
const teamMap=Object.fromEntries(TEAMS.map(t=>[t.id,t]));
const names=Object.fromEntries(TEAMS.map(t=>[t.id,t.name]));
const state={session:null,page:'home',view:'',modal:null,roster:null,coach:null,fa:null,gmMarket:null,gmHistory:null,observer:null,
  search:'',filter:'all',gameTab:'schedule',selectedOpponent:'brothers',notice:'',loading:false,loginUser:'GM'};
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const fmt=n=>Number(n??0).toLocaleString('zh-TW');
const gm=()=>state.session?.role==='gm';
const ownTeam=()=>gm()?'dragons':state.session?.team_id;
const tname=id=>names[id]||id||'聯盟';
const money=n=>n==null?'—':'$'+fmt(n);
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
 return '<header class="top"><div class="top-brand"><span class="logo">◆</span><div><b>鑽石王朝</b><small>'+escape(club)+'</small></div></div><div class="top-tools"><span>'+escape(state.session?.year||'2024')+' 球季</span><button type="button" data-action="logout" aria-label="登出">⏻</button></div></header>';
}
const navItems=[['home','首頁','⌂'],['roster','球員','▤'],['coach','戰術','⚑'],['season','賽事','◷'],['market','市場','◇']];
function bottom(){return '<nav class="bottom">'+navItems.map(([id,name,icon])=>'<button data-page="'+id+'" class="'+(state.page===id?'on':'')+'"><b>'+icon+'</b><span>'+name+'</span></button>').join('')+'</nav>'}
function home(){
 const s=state.session,f=s.finances?.find(x=>x.team_id===ownTeam()),up=(s.upcoming||[]).find(g=>g.phase!=='final');
 const cash=f?money(f.cash_ntd):'—';
 const heading=gm()?'我的平行球團':tname(ownTeam());
 const upcoming=up?tname(up.away_team_id)+' vs '+tname(up.home_team_id):'尚未排定';
 return '<div class="home-snapshot"><div class="snap-club"><span class="team-mark">'+(gm()?'GM':escape(teamMap[ownTeam()]?.short?.slice(0,2)||'隊'))+'</span><div><small>'+(gm()?'獨立測試宇宙 · 不影響正式六隊':'正式六隊永久聯盟')+'</small><strong>'+escape(heading)+'</strong></div></div><div class="snap-values"><div><small>球團資金</small><b>'+cash+'</b></div><div><small>聯盟狀態</small><b>'+(s.clock_enabled?'運行中':'待開賽')+'</b></div></div><div class="snap-next">下一場：'+escape(gm()?'平行球團自由管理':upcoming)+'</div></div>'+
 '<div class="home-menu">'+btn('球員名單','roster','▤')+btn('戰術設定','coach','⚑')+btn('賽程戰績','season','◷')+btn('自由球員','market','◇')+btn('財務合約','finance','＄')+btn(gm()?'查看正式六隊':'球團資訊',gm()?'observe':'club','▦')+'</div>'+
 '<div class="home-footer"><span class="pulse">●</span> '+(gm()?'平行聯盟 · 隨時簽約':'週一訓練｜週二至五例行賽｜週六季後賽')+'</div>';
}
function roster(){
 if(!state.roster)return empty('球員資料讀取中');
 const all=state.roster.players||[];
 const currentActive=all.filter(p=>p.roster_status==='active').length;
 const selected=all.filter(p=>state.filter==='all'||(state.filter==='active'?p.roster_status==='active':p.roster_status==='reserve'));
 const list=selected.filter(p=>!state.search||String(p.players_master?.full_name||'').includes(state.search));
 const tabs=[['all','全部'],['active','一軍'],['reserve','二軍']];
 const line=p=>{
  const active=p.roster_status==='active',reserve=p.roster_status==='reserve';
  const availableAt=reserve&&p.promotion_available_at?new Date(p.promotion_available_at).getTime():0;
  const cooldown=reserve&&availableAt>Date.now();
  const full=reserve&&currentActive>=28;
  const blocked=cooldown||full;
  const action=active?'下二軍':reserve?'升一軍':null;
  const label=cooldown?'冷卻至 '+new Date(availableAt).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}):full?'一軍已滿':action;
  return '<div class="list-row"><span class="position">'+escape(p.players_master?.primary_position||'—')+'</span><button class="player-name" data-player="'+p.master_player_id+'"><strong>'+escape(p.players_master?.full_name||p.master_player_id)+'</strong><small>'+(active?'一軍':reserve?'二軍／預備':'其他狀態')+'</small></button>'+
  (action?'<button class="mini roster-action" data-move="'+p.master_player_id+'" data-to="'+(active?'reserve':'active')+'" '+(blocked?'disabled':'')+'>'+escape(label)+'</button>':'')+'</div>';
 };
 return '<div class="compact-summary"><div><small>全部球員</small><b>'+all.length+'</b></div><div><small>一軍名單</small><b>'+currentActive+'/28</b></div><div><small>季末上限</small><b>60</b></div></div>'+
 '<div class="switch-tabs">'+tabs.map(([id,label])=>'<button data-filter="'+id+'" class="'+(state.filter===id?'selected':'')+'">'+label+'</button>').join('')+'</div>'+
 '<div class="inline-search"><input id="filter-players" placeholder="搜尋球員姓名" value="'+escape(state.search)+'"><button data-action="search-roster">查詢</button></div>'+
 '<div class="roster-tip">降二軍後 4 小時才能再升一軍；升一軍後可隨時下放。一軍最多 28 人。</div>'+
 '<div class="list-scroller">'+list.map(line).join('')+(list.length?'':empty('沒有符合條件的球員'))+'</div>';
}
function coach(){
 const data=state.coach;if(!data)return empty('戰術資料讀取中');
 const opps=TEAMS.filter(t=>t.id!==ownTeam());
 const opp=opps.some(x=>x.id===state.selectedOpponent)?state.selectedOpponent:opps[0]?.id;
 const saved=(data.lineups||[]).find(x=>x.opponent_team_id===opp);
 const roster=data.players||[],byId=new Map(roster.map(p=>[p.master_player_id,p.players_master?.full_name||String(p.master_player_id)]));
 return box('球隊戰術','<div class="form-row"><label>對戰對手</label><select id="opponent">'+opps.map(t=>'<option value="'+t.id+'" '+(opp===t.id?'selected':'')+'>'+t.name+'</option>').join('')+'</select></div><div class="stack-buttons">'+
 '<button data-action="suggest">產生建議先發打線 <span>›</span></button>'+
 '<button data-view="lineup">查看目前先發打線 <span>›</span></button>'+
 '<button data-view="pitching">投手與牛棚設定 <span>›</span></button>'+
 '<button data-view="roster-moves">一二軍升降 <span>›</span></button></div><p class="quiet">比賽由電腦模擬；球員配置與戰術會影響結果。</p>')+
 (state.view==='lineup'?box('目前打線',saved?'<div class="list-scroller smaller">'+saved.batting_order.map((id,i)=>'<div class="lineup-row">'+(i+1)+' 棒 <b>'+escape(byId.get(id)||id)+'</b></div>').join('')+'</div>':empty('尚未建立正式打序')):state.view==='pitching'?box('投手調度',empty('投手輪值編輯尚未啟用，現有陣容資料不變。')):state.view==='roster-moves'?box('球員升降','<div class="list-scroller smaller">'+roster.filter(p=>p.roster_status==='active').map(p=>'<div class="list-row"><span class="row-main">'+escape(p.players_master?.full_name||p.master_player_id)+'</span><button class="mini" data-demote="'+p.master_player_id+'">下二軍</button></div>').join('')+'</div>'):'');
}
function season(){
 const games=state.session?.upcoming||[],recent=state.session?.recent||[];
 const current=state.gameTab==='schedule'?games:recent;
 return '<div class="switch-tabs"><button data-gametab="schedule" class="'+(state.gameTab==='schedule'?'selected':'')+'">賽程</button><button data-gametab="results" class="'+(state.gameTab==='results'?'selected':'')+'">賽果</button><button data-gametab="rules" class="'+(state.gameTab==='rules'?'selected':'')+'">聯盟時程</button></div>'+
 (state.gameTab==='rules'?box('每週比賽時段','<div class="lineup-row">星期一 <b>訓練日</b></div><div class="lineup-row">星期二至五 <b>08:00–23:00</b></div><div class="lineup-row">星期六 <b>12:00–20:00 季後賽</b></div><div class="lineup-row">其他 <b>非比賽管理時段</b></div>'):
 '<div class="list-scroller">'+current.map(g=>'<div class="game-row"><small>'+toDate(g.scheduled_at)+'</small><div><span>'+escape(tname(g.away_team_id))+'</span><b>'+(g.away_score??'—')+' : '+(g.home_score??'—')+'</b><span>'+escape(tname(g.home_team_id))+'</span></div></div>').join('')+(current.length?'':empty('目前尚無賽程紀錄'))+'</div>');
}
function market(){
 const all=gm()?(state.gmMarket?.players||[]):(state.fa?.players||[]);
 const list=all.filter(p=>!state.search||String(p.players_master?.full_name||'').includes(state.search));
 return '<div class="market-banner">'+(gm()?'GM 專屬平行市場：可即時簽約或續約，只變更 GM 聯盟球員。':'正式六隊自由球員市場：一般報價依聯盟規則結算。')+'</div>'+
 '<div class="inline-search"><input id="filter-market" placeholder="搜尋球員姓名" value="'+escape(state.search)+'"><button data-action="search-market">查詢</button></div>'+
 '<div class="list-scroller">'+list.slice(0,200).map(p=>'<div class="list-row"><span class="position">'+escape(p.players_master?.primary_position||'—')+'</span><span class="row-main"><strong>'+escape(p.players_master?.full_name||p.master_player_id)+'</strong><small>'+escape(gm()?tname(p.team_id)+' · '+(p.team_id===ownTeam()?'可續約':'可簽入'):'自由球員')+'</small></span><button class="mini" data-sign="'+p.master_player_id+'">'+(gm()?'簽約':'報價')+'</button></div>').join('')+(list.length?'':empty('沒有符合條件的球員'))+'</div>';
}
function finance(){
 const f=state.session?.finances?.find(x=>x.team_id===ownTeam());
 return box('球團財務','<div class="financial-row"><span>現有資金</span><b>'+money(f?.cash_ntd)+'</b></div><div class="financial-row"><span>負債</span><b>'+money(f?.debt_ntd)+'</b></div><p class="quiet">球團財務功能持續建置中。GM 平行球團的球員簽約不會修改正式六隊財務。</p>')+btn('前往自由球員市場','market','◇');
}
function club(){
 return box('球團資訊','<div class="financial-row"><span>所屬球隊</span><b>'+escape(gm()?'GM 平行球團':tname(ownTeam()))+'</b></div><div class="financial-row"><span>遊戲球季</span><b>'+escape(state.session?.year)+'</b></div><div class="financial-row"><span>管理模式</span><b>'+(gm()?'獨立模擬':'六隊真人')+'</b></div>');
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
 const master=p.players_master||{};
 state.modal={title:master.full_name||'球員資料',content:'<div class="financial-row"><span>守備位置</span><b>'+escape(master.primary_position||'—')+'</b></div><div class="financial-row"><span>名單狀態</span><b>'+escape(p.roster_status==='active'?'一軍':'二軍')+'</b></div><div class="financial-row"><span>月薪</span><b>'+money(p.monthly_salary_ntd)+'</b></div><div class="financial-row"><span>合約年限</span><b>'+escape(p.contract_years||'—')+'</b></div><p class="quiet">真實能力隱藏，後續提供球探評價與實際年度成績。</p>'};render();
}
function openSign(id){
 const p=(gm()?state.gmMarket?.players:state.fa?.players||[])?.find(x=>x.master_player_id===id);
 if(!p)return;
 state.modal={title:(gm()?'即時簽約／續約：':'自由球員報價：')+(p.players_master?.full_name||id),content:
 '<form id="sign-form"><input type="hidden" name="player" value="'+id+'"><label>月薪（新臺幣）</label><input name="salary" type="number" min="70000" max="50000000" value="'+(p.monthly_salary_ntd||100000)+'" required><label>合約年限</label><select name="years">'+[1,2,3,4,5].map(n=>'<option value="'+n+'">'+n+' 年</option>').join('')+'</select><p class="quiet">'+(gm()?'送出後立即完成平行球團簽約，不影響正式聯盟。':'報價將依正式聯盟規則處理。')+'</p><button class="main-action" type="submit">'+(gm()?'確認立即簽約':'送出報價')+'</button></form>'};render();
}
function render(){
 if(!state.session){root.innerHTML=login();return;}
 const labels={home:'球團總部',roster:'球員名單',coach:'戰術設定',season:'賽程戰績',market:'自由球員',finance:'財務合約',club:'球團資訊',observe:'正式六隊狀況'};
 const body={home,roster,coach,season,market,finance,club,observe}[state.page]();
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
 state.notice='';
 }catch(e){state.notice=e.message||'讀取失敗';}
 render();
}
function goto(page){
 state.page=page;state.view='';state.search='';state.filter='all';state.notice='';
 if(page==='observe'&&!gm()){state.page='home';return render();}
 render();void load();
}
root.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.page){goto(b.dataset.page);return;}
 if(b.dataset.filter){state.filter=b.dataset.filter;render();return;}
 if(b.dataset.gametab){state.gameTab=b.dataset.gametab;render();return;}
 if(b.dataset.view){state.view=state.view===b.dataset.view?'':b.dataset.view;render();return;}
 if(b.dataset.player){openPlayer(Number(b.dataset.player));return;}
 if(b.dataset.sign){openSign(Number(b.dataset.sign));return;}
 if(b.dataset.move||b.dataset.demote){const id=Number(b.dataset.move||b.dataset.demote),to=b.dataset.to||'reserve';if(!confirm('確定將這名球員'+(to==='active'?'升上一軍':'下放二軍')+'？降二軍後需等待 4 小時才能升回一軍。'))return;try{await apiCall('coach-move',{team_id:ownTeam(),player_id:id,to_level:to});state.roster=await apiCall('roster',{team_id:ownTeam()});state.coach=null;state.notice=to==='active'?'已升上一軍，可隨時再降二軍。':'已下放二軍，4 小時後可再升一軍。';render();}catch(err){state.notice=err.message;render()}return;}
 const action=b.dataset.action;
 if(action==='logout'){await signOut();state.session=null;state.notice='';render();}
 else if(action==='refresh'){void load();}
 else if(action==='close-modal'){state.modal=null;render();}
 else if(action==='search-roster'){state.search=root.querySelector('#filter-players')?.value.trim()||'';render();}
 else if(action==='search-market'){state.search=root.querySelector('#filter-market')?.value.trim()||'';render();}
 else if(action==='suggest'){try{const r=await apiCall('coach-default',{team_id:ownTeam()});state.notice='建議打線已取得。打序編輯功能仍在整合中。';render();}catch(err){state.notice=err.message;render()}}
});
root.addEventListener('change',e=>{
 if(e.target.id==='opponent'){state.selectedOpponent=e.target.value;render();}
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
