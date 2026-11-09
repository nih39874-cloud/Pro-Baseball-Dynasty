// Server-backed live coaching overlay. Deliberately distinguishes from local 3D practice mode.
const ESC={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
export const safe=(value)=>String(value??'').replace(/[&<>"']/g,c=>ESC[c]);
const TACTICS=[['normal','一般戰術'],['bunt','觸擊'],['steal','盜壘'],['infield_in','趨前守備'],['intentional_walk','故意四壞']];
const names={brothers:'中信兄弟',dragons:'味全龍',unilions:'統一獅',guardians:'富邦悍將',rakuten:'樂天桃猿',TSG:'台鋼雄鷹'};
const name=id=>safe(names[id]||id);
const localTime=date=>date?new Date(date).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}):'';
function fmtEvent(e){const p=e.payload||{};const txt={BB:'四壞',K:'三振',OUT:'出局','1B':'一壘安打','2B':'二壘安打','3B':'三壘安打',HR:'全壘打',BUNT:'觸擊'}[p.result]||p.result||e.type;
 return `<div class="live-event"><strong>${safe(p.inning||'')} ${p.half==='top'?'上':'下'}</strong><span>${safe(txt)} ${p.runs?`（${Number(p.runs)}分）`:''}</span><small>${name(p.team)}</small></div>`;}
function gameRow(g,selected){const at=new Date(g.scheduled_at).getTime(),now=Date.now();const soon=now>=at-5*60000;
 return `<div class="live-game ${g.id===selected?'selected':''}"><div>${name(g.away_team_id)} <strong>${Number(g.away_score||0)}：${Number(g.home_score||0)}</strong> ${name(g.home_team_id)} <small>${safe(g.phase)} · ${localTime(g.scheduled_at)}</small></div>
 <button class="btn" data-live-select="${safe(g.id)}">觀看</button>${g.phase==='scheduled'&&soon?`<button class="btn accent" data-live-join="${safe(g.id)}">接入比賽</button>`:''}</div>`;}
const option=(p)=>`<option value="${Number(p.master_player_id)}">${safe(p.players_master?.full_name||p.master_player_id)} · ${Math.round(Number(p.pitching_rating||p.batting_rating||50))}</option>`;
export function renderLivePanel({games=[],selection=null,gameData=null,teamId='',players=[]}={}){
 const g=gameData?.game;
 const state=gameData?.session?.state;
 const controls=gameData?.controls||[];
 const c=controls.find(x=>x.team_id===teamId);
 const isCoach=c?.active_mode==='coach';
 const mine=g&&(teamId===g.home_team_id||teamId===g.away_team_id);
 const side=g?(teamId===g.home_team_id?'home':'away'):null;
 const currentPitch=side&&state?(state[`${side}_lineup`]?.defense?.P):null;
 const active=players.filter(p=>p.roster_status==='active');
 const benchPitch=active.filter(p=>p.players_master?.primary_position==='P'&&String(p.master_player_id)!==String(currentPitch));
 const subs=active.filter(p=>p.players_master?.primary_position!=='P'&&!state?.[`${side}_lineup`]?.batting_order?.map(String).includes(String(p.master_player_id)));
 return `<section class="live-overlay"><p class="notice">即時賽事由伺服器逐打席判定；此版可觀戰、總教練換投／代打／下戰術，投打跑守的遠端第一人稱手動同步尚未完成。</p>
 <div class="live-game-list">${games.map(x=>gameRow(x,selection)).join('')||'<p>近期尚無可觀看賽事。</p>'}</div>
 ${!g?'<div class="notice">選擇場次才能查看比分與控制權。</div>':`
 <div class="live-score"><div>${name(g.away_team_id)} <b>${Number(state?.away_score??g.away_score??0)}</b></div><div class="live-center"><strong>${state?`${Number(state.inning)}局${state.half==='top'?'上':'下'}`:(g.phase==='final'?'已結束':'尚未啟動')}</strong><small>${state?`${Number(state.outs)} 出局　壘上${(state.bases||[]).map((b,i)=>b?i+1:'').filter(Boolean).join('、')||'無人'}`:`${localTime(g.scheduled_at)} · ${safe(g.phase)}`}</small></div><div><b>${Number(state?.home_score??g.home_score??0)}</b> ${name(g.home_team_id)}</div></div>
 <div class="live-control"><span>本隊控制：<b>${safe(c?.active_mode||'電腦自動')}</b>${c?.pending_mode?`（下一打席：${safe(c.pending_mode)}）`:''}</span>
 ${mine&&g.phase==='live'?`<button class="btn ${c?.active_mode==='auto'?'accent':''}" data-live-mode="auto">交給 AI</button><button class="btn ${isCoach?'accent':''}" data-live-mode="coach">接任總教練</button>`:''}</div>
 ${isCoach&&g.phase==='live'&&mine?`<div class="live-coach-controls"><h3>總教練臨場戰術</h3><div class="modal-actions">${TACTICS.map(([kind,label])=>`<button class="btn" data-live-cmd="${kind}">${label}</button>`).join('')}</div>
 <div class="formline"><label>換投</label><select id="livePitcher">${benchPitch.map(option).join('')}</select><button class="btn" data-live-cmd="change_pitcher" ${!benchPitch.length?'disabled':''}>確認換投</button></div>
 <div class="formline"><label>代打（下一棒）</label><select id="livePinch">${subs.map(option).join('')}</select><button class="btn" data-live-cmd="pinch_hitter" ${!subs.length?'disabled':''}>確認代打</button></div>
 <p class="caption">操作只在打席間生效；由伺服器確認是否有換人資格。被換下的投手不能重新上場。</p></div>`:''}
 <h3>最近打席</h3><div class="live-events">${(gameData?.events||[]).slice(-10).reverse().map(fmtEvent).join('')||'<p>等待比賽開始。</p>'}</div>
 `}
 <div class="modal-actions"><button class="btn" data-live-refresh>更新資訊</button><button class="btn" data-nav="dashboard">返回管理</button></div></section>`;
}