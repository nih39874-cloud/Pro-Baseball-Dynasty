import {rgb} from './mesh.js';

/**
 * Per-player, fully 3D procedural model renderer. Morph parameters come from the
 * individual player catalog. These are not yet artist-reviewed real-person scans.
 * All geometry is generated locally; no external likeness/texture assets required.
 */
const SKINS=['#b78363','#c19073','#cf9b76','#d1aa89','#a97b61','#cba17d'];
const HAIR=['#18171a','#222229','#30261e','#42322a','#191d22'];
const BASE={height_scale:1,shoulder_width:1,head_width:1,head_height:1,cheek_width:1,body_width:1,skin_tone:2,hair_tone:1,stance:'standard',handedness:'R',throw_hand:'R',helmet_style:'cap',face_provenance:'procedural_unverified'};
export function hashName(key){let hash=2166136261>>>0;for(const c of String(key))hash=Math.imul(hash^c.codePointAt(0),16777619)>>>0;return hash>>>0;}
const hpart=(h,k)=>((h>>>k)&255)/255;
export function generateAvatarProfile(key,handedness='R',throwHand='R'){
 const h=hashName(key),pick=(v,a,b)=>Math.round((a+(b-a)*v)*1000)/1000;
 return {height_scale:pick(hpart(h,0),.94,1.07),shoulder_width:pick(hpart(h,6),.88,1.13),
  head_width:pick(hpart(h,12),.90,1.13),head_height:pick(hpart(h,18),.93,1.12),
  cheek_width:pick(hpart(h,10),.88,1.17),body_width:pick(hpart(h,16),.85,1.19),
  skin_tone:Math.min(5,Math.floor(hpart(h,5)*6)),hair_tone:Math.min(4,Math.floor(hpart(h,13)*5)),
  stance:['upright','compact','wide','standard'][h%4],handedness:handedness==='L'?'L':'R',
  throw_hand:throwHand==='L'?'L':'R',helmet_style:hpart(h,9)>.4?'helmet':'cap',
  face_provenance:'procedural_unverified'};
}
export function validateAvatarProfile(value){
 if(!value||typeof value!=='object')return null;
 for(const k of ['height_scale','shoulder_width','head_width','head_height','cheek_width','body_width'])
  if(typeof value[k]!=='number'||!Number.isFinite(value[k])||value[k]<.7||value[k]>1.4)return null;
 return {...BASE,...value};
}
const dark=[.085,.105,.14],white=[.91,.91,.87],black=[.045,.055,.07],leather=[.29,.17,.105];
const blend=(a,b,t)=>a.map((v,i)=>v*(1-t)+b[i]*t);
export function drawAvatar(mesh,position,{id='unknown',color='#e2b544',profile=null,role='fielder',phase='ready',now=0,detail=1,positionKey=null}={}){
 const p=validateAvatarProfile(profile)||generateAvatarProfile(id),seed=hashName(id);
 const x=Number(position?.x??position?.[0]??0),z=Number(position?.z??position?.[1]??0);
 const h=p.height_scale,w=p.body_width,shoulders=.405*p.shoulder_width,hip=.29*w,headY=1.64*h;
 const skin=rgb(SKINS[(p.skin_tone|0)%SKINS.length]||SKINS[2]),hair=rgb(HAIR[(p.hair_tone|0)%HAIR.length]||HAIR[1]);
 const jersey=rgb(color),trim=blend(jersey,white,.45),pants=blend(white,jersey,.09),boots=[.11,.14,.19];
 const isCatcher=positionKey==='C',isBatter=role==='batter',isRunner=role==='runner',isPitcher=role==='pitcher';
 const hand=p.throw_hand==='L'?-1:1,batHand=p.handedness==='L'?-1:1;
 const t=now*.001, stride=(isRunner?.23:.10)*Math.sin(t*(isRunner?11:3.2)+(seed%11));
 const playing=phase==='pitching'||phase==='swinging',motion=isPitcher&&playing?Math.sin(t*8)*.38:isBatter&&playing?Math.sin(t*11)*.30:0;
 const crouch=isCatcher?.22:isBatter?.085:p.stance==='compact'?.045:0;
 const feet=p.stance==='wide'?.20:.115;
 // Footwear, pants, socks and articulated knees; each athlete keeps unique proportions.
 for(const side of [-1,1]){
  const thigh=[x+side*hip*.6,.84*h-crouch,z];
  const knee=[x+side*(hip*.62),.49*h-crouch*.55,z+side*stride*.48];
  const shoe=[x+side*(hip*.70+feet),.095,z+side*stride*.9+(isBatter?side*.11:0)];
  mesh.limb(thigh,knee,.122*w,pants,8);mesh.limb(knee,shoe,.090*w,pants,8);
  mesh.limb([shoe[0],.13,shoe[2]],[shoe[0],.31,shoe[2]],.091,jersey,7);
  mesh.ellipsoid(shoe[0],.095,shoe[2]-.08,.145,.089,.248,boots,8);
  mesh.box(shoe[0],.112,shoe[2]-.26,.13,.018,.075,white);
 }
 // Tailored uniform: torso, belt, shoulder and vertical chest piping.
 mesh.ellipsoid(x,1.02*h-crouch,z,.345*w,.424*h,.245*w,jersey,12);
 mesh.box(x,.83*h-crouch,z,.60*w,.055,.41*w,dark);
 mesh.box(x,1.115*h-crouch,z-.245*w,.023,.47*h,.017,trim);
 mesh.box(x,1.17*h-crouch,z-.252*w,.20,.033,.024,trim);
 mesh.cylinder(x,1.33*h-crouch,z,.115,.17*h,skin,10);
 // Personalized face volume: jaw, cheekbones, chin, ears, eyes, mouth, brows and nose.
 const hw=.265*p.head_width,hd=.250*p.cheek_width,hh=.33*p.head_height;
 mesh.ellipsoid(x,headY-crouch,z,hw,hh,hd,skin,14);
 mesh.ellipsoid(x,headY-hh*.65-crouch,z-.038,hw*.80,hh*.43,hd*.84,skin,10);
 for(const side of [-1,1]){
  mesh.ellipsoid(x+side*hw*.87,headY-.028-crouch,z,.049,.083,.064,skin,8);
  mesh.ellipsoid(x+side*hw*.40,headY+.067-crouch,z-hd*.92,.054,.032,.028,white,7);
  mesh.ellipsoid(x+side*hw*.41,headY+.070-crouch,z-hd*.946,.023,.026,.018,[.12,.15,.18],7);
  mesh.box(x+side*hw*.40,headY+.129-crouch,z-hd*.90,.106,.016,.026,hair);
  mesh.ellipsoid(x+side*hw*.44,headY-.086-crouch,z-hd*.79,hw*.32,.075,.035,blend(skin,[.65,.33,.28],.13),7);
 }
 mesh.ellipsoid(x,headY-.035-crouch,z-hd*.97,.053,.103,.078,skin,8);
 mesh.ellipsoid(x,headY-.167-crouch,z-hd*.90,.091,.011,.014,blend(skin,black,.45),7);
 // Individual hairline and ears remain visible below fielding cap.
 mesh.ellipsoid(x,headY+hh*.69-crouch,z+.014,hw*.96,.145,hd*.98,hair,12);
 const helmet=isBatter||p.helmet_style==='helmet'&&isRunner;
 const headgear=helmet?dark:jersey;
 mesh.ellipsoid(x,headY+hh*.82-crouch,z,hw*1.09,.108,hd*1.12,headgear,12);
 mesh.box(x,headY+hh*.86-crouch,z-hd*.92,hw*1.76,.051,.22,headgear);
 if(helmet)mesh.ellipsoid(x+batHand*hw*.98,headY+.006-crouch,z,.048,.16,.12,headgear,8);
 // Arm rig, sleeves and gloves respond to the role and throw/bat handedness.
 for(const side of [-1,1]){
  const shoulder=[x+side*shoulders,1.23*h-crouch,z];
  const elbow=[x+side*(shoulders+.155),.975*h-crouch+Math.abs(motion)*.28,z-side*motion*.23];
  const wrist=[x+side*(shoulders+.083),.745*h-crouch+Math.abs(motion)*.45,z-side*motion*.38];
  mesh.ellipsoid(shoulder[0],shoulder[1]-.06,shoulder[2],.153*w,.18,.142*w,jersey,9);
  mesh.limb(shoulder,elbow,.108*w,jersey,8);
  mesh.limb(elbow,wrist,.076*w,skin,8);
  mesh.ellipsoid(wrist[0],wrist[1]-.045,wrist[2]-.015,.075,.085,.075,skin,7);
  if((isPitcher||role==='fielder')&&side===-hand){
   mesh.ellipsoid(wrist[0],wrist[1]-.045,wrist[2]-.125,.135,.16,.175,leather,9);
   for(let i=-2;i<=2;i++)mesh.limb([wrist[0]+i*.04,wrist[1]+.015,wrist[2]-.14],[wrist[0]+i*.048,wrist[1]+.16,wrist[2]-.18],.018,leather,5);
  }
 }
 if(isBatter){
  const grip=[x+batHand*.29,1.16*h-crouch,z-.25];
  const swing=playing?Math.sin(t*11)*.55:0;
  const tip=[grip[0]-batHand*(.54+swing),grip[1]+.96-Math.abs(swing)*.25,grip[2]-.13-Math.abs(swing)*.38];
  mesh.limb(grip,tip,.041,[.59,.38,.22],9);
  mesh.ellipsoid(tip[0],tip[1],tip[2],.050,.065,.05,[.75,.52,.29],7);
 }
 if(isCatcher){
  mesh.ellipsoid(x,1.045*h-crouch,z-.248*w,.29*w,.355*h,.075,dark,10);
  for(let i=0;i<3;i++)mesh.box(x,.90*h+i*.12-crouch,z-.322*w,.49*w,.025,.035,trim);
  mesh.ellipsoid(x,headY-crouch,z-hd*1.05,hw*1.01,hh*.93,.068,dark,10);
  for(let i=-1;i<=1;i++)mesh.box(x+i*.11,headY-.01-crouch,z-hd*1.17,.014,.44,.018,white);
  mesh.box(x,headY-.06-crouch,z-hd*1.21,.43,.021,.017,white);
 }
}
