// MOBA-style left joystick / right action cluster for bounded server intents.
const pos=['P','C','1B','2B','3B','SS','LF','CF','RF'];
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderMotionPanel({batting=false,fieldPos='CF',motion={dx:0,dz:0},accepted=null}={}){
 const role=batting?'runner':'fielder';
 const actions=batting?[['run','前進'],['hold','停壘'],['slide','滑壘'],['return','回壘']]:
 [['move','移動'],['catch','接球'],['dive','撲接'],['jump','跳接'],['throw','傳球']];
 return `<div class="live-motion-panel"><h3>${batting?'跑壘控制':'守備控制'} · 左手方向、右手動作</h3>
 <div class="live-motion-layout"><div class="live-motion-pad" data-live-motion-pad role="group" aria-label="左手方向搖桿">
 <span class="live-motion-crosshair"></span><span class="live-motion-knob" style="left:${50+Number(motion.dx||0)*33}%;top:${50+Number(motion.dz||0)*33}%"></span>
 </div><div class="live-motion-actions">
 ${!batting?`<label>操作野手<select id="liveFieldPosition">${pos.map(x=>`<option value="${x}" ${x===fieldPos?'selected':''}>${x}</option>`).join('')}</select></label>`:''}
 ${actions.map(([kind,label])=>`<button class="btn" data-live-motion="${kind}">${label}</button>`).join('')}
 </div></div><small>指令在下一次相關擊球事件判定；不代表已完成逐影格真人碰撞模擬。</small>
 ${accepted?`<p class="caption">已提交：${safe(accepted.action)} · ${safe(accepted.selected_position||role)}</p>`:''}</div>`;
}
