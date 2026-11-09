/** Live roster presentation: show exact publication vintage and uncertainty. */
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const N=(o,k)=>Number(o?.[k]||0);
const div=(a,b)=>b>0?a/b:0;
export function pitchingOuts(ip){const parts=String(ip??'0').split('.');const innings=Number(parts[0])||0,extra=Number(parts[1]||0);if(!Number.isInteger(extra)||extra<0||extra>2)throw Error('INVALID_BASEBALL_INNINGS');return innings*3+extra;}
export function summarizeBaseballStats(rows=[]){
 const result={first:{G:0,PA:0,AB:0,H:0,BB:0,HBP:0,SF:0,TB:0,IPOuts:0,ER:0,SO:0,BR:0},farm:{G:0,PA:0,AB:0,H:0,BB:0,HBP:0,SF:0,TB:0,IPOuts:0,ER:0,SO:0,BR:0}};
 for(const item of rows){const v=result[item.league_level];if(!v)continue;const b=item.batting||{},p=item.pitching||{};
  for(const k of ['PA','AB','H','BB','HBP','SF','TB'])v[k]+=N(b,k);
  v.G+=Math.max(N(b,'G'),N(p,'G'));v.IPOuts+=pitchingOuts(p.IP||0);v.ER+=N(p,'ER');v.SO+=N(p,'SO');v.BR+=N(p,'BB');}
 for(const v of Object.values(result)){
  v.AVG=div(v.H,v.AB);v.OBP=div(v.H+v.BB+v.HBP,v.AB+v.BB+v.HBP+v.SF);
  v.SLG=div(v.TB,v.AB);v.OPS=v.OBP+v.SLG;v.ERA=v.IPOuts>0?v.ER*27/v.IPOuts:null;
 }
 return result;
}
export function formatFaRegisteredService(value){
 const m=String(value??'').match(/^(\d+)(?:\.(\d{1,3}))?$/);
 if(!m)return '年資待核對';
 return `${Number(m[1])} 季＋${Number((m[2]||'').padEnd(3,'0'))} 登錄日`;
}
export function faDisplayInfo(player){
 if(player.fa_2024_service_reported!==null&&player.fa_2024_service_reported!==undefined){
  return {label:`2024年末 ${formatFaRegisteredService(player.fa_2024_service_reported)}（公布值）`,detail:`2024開季推估 ${formatFaRegisteredService(player.fa_service_initial_estimate??0)}；${player.fa_initial_eligible_reported?'2023年末已有FA公告；':''}實際資格仍須核對登錄日、合約及大學四年條件`};
 }
 if(player.fa_initial_eligible_reported)return {label:'2023年末已公告FA資格',detail:'開季確切服務年資、既有合約與是否曾行使仍待核對'};
 if(player.fa_usage_min_seasons!==null&&player.fa_usage_min_seasons!==undefined)return {label:`2010–2023 出賽年資下限 ${player.fa_usage_min_seasons} 季`,detail:'僅依達80場或80局判定；未含未出賽的一軍登錄日，不能據此斷言沒有FA資格'};
 return {label:'FA 年資尚無核定資料',detail:'新秀自遊戲中的正式登錄開始累積；不強制套用未來真實歷史'};
}
export function renderRosterRow(player,selected=false){
 const m=player.players_master||{},fa=faDisplayInfo(player);
 const sum=summarizeBaseballStats(player.reference_stats||[]),stats=sum.first;
 const bat=stats.PA?`2024一軍 AVG ${stats.AVG.toFixed(3)} · OPS ${stats.OPS.toFixed(3)}`:'';
 const pit=stats.IPOuts?`2024一軍 ERA ${stats.ERA.toFixed(2)} · ${Math.floor(stats.IPOuts/3)}.${stats.IPOuts%3} 局`:'';
 const career=[bat,pit].filter(Boolean).join(' · ')||'2024 二軍或選秀資料（無一軍攻守數據）';
 const salary=player.salary_verified?`${Number(player.monthly_salary_ntd).toLocaleString('zh-TW')} 元/月`:'薪資待核對';
 return `<label class="roster-detail"><input type="checkbox" value="${Number(player.master_player_id)}" data-roster-pick ${selected?'checked':''}/>
  <span class="roster-player-body"><strong>${esc(m.full_name||'未命名')} <small>${esc(m.primary_position||'位置未核對')}</small></strong>
  <span>${esc(career)} · 打 ${Number(player.batting_rating||50).toFixed(0)} / 投 ${Number(player.pitching_rating||50).toFixed(0)}</span>
  <span title="${esc(fa.detail)}">FA：${esc(fa.label)}</span><span>${esc(salary)} · 3D ${player.visual_status==='licensed_likeness'?'已授權真人臉型':'程序化個人外觀（未核實真人相似度）'}</span></span></label>`;
}
