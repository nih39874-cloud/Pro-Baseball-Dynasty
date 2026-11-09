// Independent coach management UI: five opponent-specific lineups + first/farm roster.
// The server, not the PWA, is authoritative for all roster and lineup mutations.
export const FIELDING_POSITIONS=['P','C','1B','2B','3B','SS','LF','CF','RF'];
const POSITION_NAMES={P:'投手',C:'捕手','1B':'一壘手','2B':'二壘手','3B':'三壘手',SS:'游擊手',LF:'左外野手',CF:'中外野手',RF:'右外野手'};
export const escapeCoachHtml=(t)=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const cooldownRemainingSeconds=(availableAt,now=Date.now())=>availableAt?Math.max(0,Math.ceil((Date.parse(availableAt)-now)/1000)):0;
export function validateCoachSelection(batters,defense,players){
 const batting=batters.map(Number);
 if(batting.length!==9||batting.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(batting).size!==9) return '打序必須是九名不重複球員';
 if(!defense||FIELDING_POSITIONS.some(k=>!Number.isSafeInteger(Number(defense[k]))||Number(defense[k])<=0)||Object.keys(defense).length!==9) return '九個守備位置都必須指定球員';
 const ids=FIELDING_POSITIONS.map(pos=>Number(defense[pos]));
 if(new Set(ids).size!==9)return '守備位置不能重複使用同一名球員';
 const eligible=new Set(players.filter(p=>p.roster_status==='active').map(p=>Number(p.master_player_id)));
 if([...batting,...ids].some(id=>!eligible.has(id))) return '打序與守備必須全部來自目前一軍28人';
 if(batting.includes(Number(defense.P)))return '指定打擊制：投手不得列入九棒打序';
 if(FIELDING_POSITIONS.filter(pos=>pos!=='P').some(pos=>!batting.includes(Number(defense[pos]))))return '八名非投手守備員必須列入打序；其餘一名為指定打擊';
 return null;
}
function positionsLabel(player){const list=(player.fielding_positions||[]).filter(x=>x.games>0);const byPos=new Map();for(const a of list)byPos.set(a.position,(byPos.get(a.position)||0)+Number(a.games||0));const sorted=[...byPos].sort((a,b)=>b[1]-a[1]);return sorted.length?sorted.slice(0,3).map(([pos,g])=>`${pos} ${g}場`).join('、'):(player.players_master?.primary_position||'位置待核對');}
function playerName(p){return escapeCoachHtml(p.players_master?.full_name||String(p.master_player_id));}
function playerOption(p){return `${playerName(p)}｜${escapeCoachHtml(p.players_master?.primary_position||'未定')}｜${positionsLabel(p)}`;}
function options(players,selected,{pitcher=false}={}){
 const candidates=players.filter(p=>p.roster_status==='active'&&(pitcher?p.players_master?.primary_position==='P':p.players_master?.primary_position!=='P'));
 const exists=candidates.some(p=>Number(p.master_player_id)===Number(selected));
 return `<option value="" ${!exists?'selected':''}>${!exists?'請重新指定球員':'請選擇球員'}</option>`+
 candidates.map(p=>`<option value="${p.master_player_id}" ${Number(p.master_player_id)===Number(selected)?'selected':''}>${playerOption(p)}</option>`).join('');
}
function rosterPlayerRow(p){
 const remaining=cooldownRemainingSeconds(p.promotion_available_at);
 const name=playerName(p),active=p.roster_status==='active',base=p.players_master?.primary_position||'--';
 const cool=remaining?`<span class="coach-cooldown">冷卻 ${Math.floor(remaining/3600)}小時${Math.ceil((remaining%3600)/60)}分鐘</span>`:'';
 return `<div class="coach-roster-row"><div><strong>${name}</strong><small>${escapeCoachHtml(base)} · ${positionsLabel(p)} · 打擊${Math.round(Number(p.batting_rating||50))} / 投球${Math.round(Number(p.pitching_rating||50))}</small>${cool}</div>
 <button type="button" class="btn ${active?'danger':'ghost'}" data-coach-move="${active?'reserve':'active'}" data-coach-player="${p.master_player_id}" ${!active&&remaining?'disabled title="下放後未滿4小時"':''}>${active?'降二軍':'升一軍'}</button></div>`;
}
/** Real roster data only; this does not fabricate player eligibility. */
export function renderCoachSetup({teamId,opponentId,teams,players,lineups,draft=null}){
 const own=(teams||[]).find(t=>t.id===teamId),opps=(teams||[]).filter(t=>t.id!==teamId);
 const target=opps.some(t=>t.id===opponentId)?opponentId:opps[0]?.id;
 const preset=(lineups||[]).find(p=>p.opponent_team_id===target);
 const current=draft||preset||{batting_order:[],defense:{},needs_review:true};
 const first=players.filter(p=>p.roster_status==='active');const farm=players.filter(p=>p.roster_status==='reserve');
 const tabs=opps.map(t=>`<button type="button" class="coach-opponent-tab ${t.id===target?'current':''}" data-coach-opponent="${t.id}">${escapeCoachHtml(t.name)}${lineups?.find(p=>p.opponent_team_id===t.id)?.needs_review?' • 需更新':''}</button>`).join('');
 const batting=Array.from({length:9},(_,i)=>`<label class="coach-entry"><span>${i+1} 棒</span><select data-coach-bat="${i}">${options(players,current.batting_order?.[i])}</select></label>`).join('');
 const defense=FIELDING_POSITIONS.map(pos=>`<label class="coach-entry"><span>${POSITION_NAMES[pos]}</span><select data-coach-position="${pos}">${options(players,current.defense?.[pos],{pitcher:pos==='P'})}</select></label>`).join('');
 return `<section class="coach-setup" aria-label="總教練陣容調整">
 <div class="coach-headline"><h3>${escapeCoachHtml(own?.name||teamId)} · 先發打序與守備</h3><span>一軍 ${first.length}/28｜二軍 ${farm.length} 人</span></div>
 <div class="coach-tabs">${tabs}</div>
 <div class="notice">對戰五隊各有一套獨立設定；投手不列入九棒打序，需另設捕手、內外野八人及指定打擊。${current.needs_review?'目前陣容含已下二軍球員或尚未審核，請重新指定並保存。':''}</div>
 <div class="coach-lineup-columns"><div class="coach-panel"><h3>先發九棒</h3>${batting}</div><div class="coach-panel"><h3>九個守備位置</h3>${defense}</div></div>
 <div class="modal-actions coach-actions"><button type="button" class="btn accent" data-coach-save>保存對 ${escapeCoachHtml(opps.find(t=>t.id===target)?.name||target)} 陣容</button><button type="button" class="btn" data-coach-autofill>重新自動排陣</button></div>
 <div class="coach-headline"><h3>一、二軍升降</h3><small>下二軍後，須經過現實時間 4 小時才能升回；一軍上限28人</small></div>
 <div class="coach-roster-columns"><div class="coach-panel"><h3>一軍登錄（${first.length}人）</h3><div class="coach-roster-list">${first.map(rosterPlayerRow).join('')||'<p>目前無一軍球員</p>'}</div></div>
 <div class="coach-panel"><h3>二軍／預備（${farm.length}人）</h3><div class="coach-roster-list">${farm.map(rosterPlayerRow).join('')||'<p>目前無二軍球員</p>'}</div></div></div>
 <p class="coach-footnote">名單、冷卻及打序由 Supabase 伺服器核定。賽前依對手自動選用對應打序；若球員下二軍，該套陣容會提示重新調整。</p>
 <div class="modal-actions"><button class="btn" data-refresh>重新同步</button><button class="btn" data-nav="dashboard">返回管理</button></div></section>`;
}
