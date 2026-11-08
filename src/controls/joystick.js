import {currentRole,isOffense,clamp} from '../core/rules.js';
export function setupJoystick(engine,scene){const outer=document.getElementById('joystick'),knob=document.getElementById('stick-knob');let active=null,start={x:0,y:0};
 outer.addEventListener('pointerdown',e=>{e.preventDefault();active=e.pointerId;outer.setPointerCapture(active);const r=outer.getBoundingClientRect();start={x:r.x+r.width/2,y:r.y+r.height/2};move(e);});
 function move(e){if(e.pointerId!==active)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;const length=Math.hypot(dx,dy)||1,s=Math.min(1,length/53),x=dx/length*s,y=dy/length*s;knob.style.transform=`translate(${x*49}px,${y*49}px)`;const st=engine.s,role=currentRole(st);
 if(role==='coach'){const fx=-Math.sin(scene.cameraYaw),fz=Math.cos(scene.cameraYaw);st.coachPos.x=clamp(st.coachPos.x+(x*Math.cos(scene.cameraYaw)+y*fx)*.65,-32,-16);st.coachPos.z=clamp(st.coachPos.z+(x*Math.sin(scene.cameraYaw)+y*fz)*.65,3,12);}
 else if(role==='pitcher'||role==='batter'){engine.setAim(clamp(st.aim.x+x*.06,-1.25,1.25),clamp(st.aim.y-y*.06,-1.25,1.25));}
 else if(st.phase==='fielding'){st.fieldMove={x,y};}
 }
 outer.addEventListener('pointermove',move);
 const end=e=>{if(e.pointerId!==active)return;active=null;knob.style.transform='translate(0,0)';engine.s.fieldMove={x:0,y:0};};outer.addEventListener('pointerup',end);outer.addEventListener('pointercancel',end);
 let camId=null,oldX=0;const field=document.getElementById('field');field.addEventListener('pointerdown',e=>{if(currentRole(engine.s)!=='coach')return;camId=e.pointerId;oldX=e.clientX;field.setPointerCapture(e.pointerId)});field.addEventListener('pointermove',e=>{if(e.pointerId!==camId)return;scene.cameraYaw+=(e.clientX-oldX)*.006;oldX=e.clientX});field.addEventListener('pointerup',()=>camId=null);
 document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select'))return;const k=e.key.toLowerCase();if(k===' '){e.preventDefault();document.getElementById('mainAction')?.click();}if(k==='a'||k==='arrowleft')engine.setAim(engine.s.aim.x-.10,engine.s.aim.y);if(k==='d'||k==='arrowright')engine.setAim(engine.s.aim.x+.10,engine.s.aim.y);if(k==='w'||k==='arrowup')engine.setAim(engine.s.aim.x,engine.s.aim.y+.10);if(k==='s'||k==='arrowdown')engine.setAim(engine.s.aim.x,engine.s.aim.y-.10);});
}
