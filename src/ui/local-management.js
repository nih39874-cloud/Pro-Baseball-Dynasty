import {DEFENSE_KEYS,FARM_COOLDOWN_MS} from '../core/local-manager.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const positions={P:'投手',C:'捕手','1B':'一壘', '2B':'二壘','3B':'三壘',SS:'游擊',LF:'左外野',CF:'中外野',RF:'右外野'};
const isP=p=>p.primary_position==='P'||Number(p.pitching_outs_2024||0)>0;
const priority=p=>Number(isP(p)?p.pitching_outs_2024:p.batting_pa_2024)||0;
const getName=(manager,id)=>manager.players.get(String(id))?.name||String(id);
export function localRosterView(manager,teamId){
 const t=manager.team(teamId),active=new Set(t.active),members=manager.members(teamId).slice().sort((a,b)=>Number(active.has(b.id))-Number(active.has(a.id))||priority(b)-priority(a)),now=Date.now();
 const rows=members.map(p=>{
  const main=active.has(p.id),remain=Math.max(0,Number(t.cooldowns[p.id]||0)-now);
  const mins=Math.ceil(remain/60000),info=isP(p)?'投球出局數 '+(p.pitching_outs_2024||0):'打席 '+(p.batting_pa_2024||0);
  return `<div class="rowline"><div><strong>${esc(p.name)}</strong><small> ${esc(p.primary_position||'守位待核實')} · 2024 ${info} · ${main?'一軍':'二軍'}${remain?' · 冷卻 '+Math.floor(mins/60)+'時'+mins%60+'分':''}</small></div><button type="button" class="btn ${main?'ghost':'accent'}" data-local-move="${main?'reserve':'active'}" data-local-player="${esc(p.id)}" ${!main&&remain?'disabled':''}>${main?'降二軍':'升一軍'}</button></div>`;
 }).join('');
 return `<div class="notice">本機經營存檔，不影響 Supabase 正式聯盟。球員資料採現有 2024 來源，無法核實的守位、年資、薪資不會虛構。</div><div class="coach-headline"><h3>一軍 ${active.size}/28 · 二軍 ${members.length-active.size}</h3><small>下二軍後現實時間 4 小時內不得回升</small></div><div class="listLog" style="max-height:52vh;overflow:auto">${rows||'<p>此隊目前無已匯入球員。</p>'}</div><div class="modal-actions"><button class="btn accent" data-nav="coach">五套打序／守備</button><button class="btn" data-nav="dashboard">返回管理</button></div>`;
}
function selectOptions(manager,teamId,current,pitcher=false){
 const players=manager.active(teamId).filter(p=>pitcher?isP(p):!isP(p)).sort((a,b)=>priority(b)-priority(a));
 return `<option value="">選擇球員</option>`+players.map(p=>`<option value="${esc(p.id)}" ${String(p.id)===String(current)?'selected':''}>${esc(p.name)} · ${esc(p.primary_position||'守位待核實')}</option>`).join('');
}
export function localLineupView(manager,teamId,opponentId,teams){
 const others=teams.filter(t=>t.id!==teamId),chosen=others.some(t=>t.id===opponentId)?opponentId:others[0]?.id;
 const saved=manager.getLineup(teamId,chosen);
 const active=manager.active(teamId);
 const hitters=active.filter(p=>!isP(p)).sort((a,b)=>priority(b)-priority(a));
 const pitchers=active.filter(isP).sort((a,b)=>priority(b)-priority(a));
 // A new opponent setup is only a UI proposal; it is not persisted until saved.
 const batting=saved.batting?.length===9?saved.batting:hitters.slice(0,9).map(p=>p.id);
 const defense=saved.defense&&Object.keys(saved.defense).length===9?saved.defense:Object.fromEntries(DEFENSE_KEYS.map((k,i)=>[k,k==='P'?pitchers[0]?.id:hitters[i-1]?.id]));
 const tabs=others.map(t=>`<button class="btn ${t.id===chosen?'accent':'ghost'}" data-local-opponent="${esc(t.id)}">${esc(t.short)} ${manager.team(teamId).lineups[t.id]?.needsReview?'需重排':''}</button>`).join('');
 return `<div class="notice">每個對手各存一套先發陣容；使用指定打擊制。守位不完整的球員資料仍可自行指定，投手需來自投手名單。更動只存於本機。</div><div class="modal-actions">${tabs}</div>
 ${saved.needsReview?'<p>本套陣容尚未確認或球員已下二軍，請重排並儲存。</p>':''}
 <div class="coach-lineup-columns"><div class="coach-panel"><h3>九棒打序</h3>${Array.from({length:9},(_,i)=>`<label class="coach-entry"><span>${i+1} 棒</span><select data-local-bat="${i}">${selectOptions(manager,teamId,batting[i])}</select></label>`).join('')}</div>
 <div class="coach-panel"><h3>九個守備位置</h3>${DEFENSE_KEYS.map(k=>`<label class="coach-entry"><span>${positions[k]}</span><select data-local-defense="${k}">${selectOptions(manager,teamId,defense[k],k==='P')}</select></label>`).join('')}</div></div>
 <div class="modal-actions"><button class="btn accent" data-local-save="${esc(chosen)}">儲存對戰打序與守備</button><button class="btn" data-nav="roster">一二軍球員升降</button><button class="btn" data-nav="dashboard">返回管理</button></div>`;
}
