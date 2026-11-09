import {currentRole,clamp,isOffense} from '../core/rules.js';
export function setupJoystick(engine,scene){
 const outer=document.getElementById('joystick'),knob=document.getElementById('stick-knob');
 let active=null,vector={x:0,y:0},last=performance.now();
 function move(e){
  if(e.pointerId!==active)return;
  const r=outer.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),length=Math.hypot(dx,dy)||1,m=Math.min(1,length/53);
  vector={x:dx/length*m,y:dy/length*m};
  knob.style.transform=`translate(${vector.x*49}px,${vector.y*49}px)`;
  e.preventDefault();
 }
 outer.addEventListener('pointerdown',e=>{
  if(active!==null)return;
  active=e.pointerId;outer.setPointerCapture(e.pointerId);move(e);
 });
 outer.addEventListener('pointermove',move);
 function end(e){if(active!==e.pointerId)return;active=null;vector={x:0,y:0};knob.style.transform='translate(0,0)';engine.s.fieldMove={x:0,y:0};}
 outer.addEventListener('pointerup',end);outer.addEventListener('pointercancel',end);outer.addEventListener('lostpointercapture',end);
 // A held joystick is applied every animation frame, not only on touch-move events.
 function tick(now){
  const dt=Math.min(.05,(now-last)/1000||0);last=now;
  const s=engine.s,role=currentRole(s),manualField=s.mode==='field'&&!isOffense(s)&&(s.phase==='fielding'||s.phase==='fielderChoice');
  if(active!==null){
   if(manualField){s.fieldMove={...vector};}
   else if(role==='coach'){
    const yaw=scene.cameraYaw||0,dx=vector.x*Math.cos(yaw)-vector.y*Math.sin(yaw),
      dz=vector.x*Math.sin(yaw)+vector.y*Math.cos(yaw);
    s.coachPos.x=clamp(s.coachPos.x+dx*dt*6,-32,-16);
    s.coachPos.z=clamp(s.coachPos.z+dz*dt*6,3,12);
   }else if(role==='pitcher'||role==='batter'){
    engine.setAim(s.aim.x+vector.x*dt*1.35,s.aim.y-vector.y*dt*1.35);
   }
  }
  requestAnimationFrame(tick);
 }
 requestAnimationFrame(tick);
 let camId=null,oldX=0;const field=document.getElementById('field');
 field.addEventListener('pointerdown',e=>{if(currentRole(engine.s)!=='coach')return;camId=e.pointerId;oldX=e.clientX;field.setPointerCapture(e.pointerId)});
 field.addEventListener('pointermove',e=>{if(e.pointerId!==camId)return;scene.cameraYaw+=(e.clientX-oldX)*.006;oldX=e.clientX});
 field.addEventListener('pointerup',()=>camId=null);field.addEventListener('pointercancel',()=>camId=null);
 document.addEventListener('keydown',e=>{
  if(e.target.matches('input,textarea,select'))return;
  const k=e.key.toLowerCase(),s=engine.s;
  if(k===' '){e.preventDefault();document.getElementById('mainAction')?.click();}
  if(s.mode==='field'&&!isOffense(s)&&s.phase==='fielding'){
   const v={...s.fieldMove};
   if(k==='a'||k==='arrowleft')v.x=-1;if(k==='d'||k==='arrowright')v.x=1;
   if(k==='w'||k==='arrowup')v.y=-1;if(k==='s'||k==='arrowdown')v.y=1;
   s.fieldMove=v;return;
  }
  if(k==='a'||k==='arrowleft')engine.setAim(s.aim.x-.10,s.aim.y);
  if(k==='d'||k==='arrowright')engine.setAim(s.aim.x+.10,s.aim.y);
  if(k==='w'||k==='arrowup')engine.setAim(s.aim.x,s.aim.y+.10);
  if(k==='s'||k==='arrowdown')engine.setAim(s.aim.x,s.aim.y-.10);
 });
 document.addEventListener('keyup',e=>{
  const k=e.key.toLowerCase(),v=engine.s.fieldMove;
  if(['a','d','arrowleft','arrowright'].includes(k))v.x=0;
  if(['w','s','arrowup','arrowdown'].includes(k))v.y=0;
 });
}
