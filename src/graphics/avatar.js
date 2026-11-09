import {rgb} from './mesh.js';

/**
 * Procedural 3D body rig. No real-person facial likeness is claimed or assumed.
 * `profile` is a licensed/artist-review upgrade slot; basic profiles remain unverified.
 * All model meshes are authored from geometry (no photos or likeness assets bundled).
 */
const SKINS=['#b78363','#c19073','#cf9b76','#d1aa89','#a97b61','#cba17d'];
const HAIR=['#18171a','#222229','#30261e','#42322a','#191d22'];
const neutral={height_scale:1,shoulder_width:1,head_width:1,head_height:1,cheek_width:1,body_width:1,skin_tone:2,hair_tone:1,stance:'standard',handedness:'R',throw_hand:'R',helmet_style:'cap',face_provenance:'procedural_unverified'};
export function hashName(key){let hash=2166136261>>>0;for(const c of String(key)){hash=Math.imul(hash^c.codePointAt(0),16777619)>>>0;}return hash>>>0;}
const hpart=(h,k)=>((h>>k)&0xff)/255;
export function generateAvatarProfile(key,handedness='R',throwHand='R'){
 const h=hashName(key);
 const pick=(v,a,b)=>a+(b-a)*v;
 return {
  height_scale:Math.round(pick(hpart(h,0),.94,1.07)*1000)/1000,
  shoulder_width:Math.round(pick(hpart(h,6),.88,1.13)*1000)/1000,
  head_width:Math.round(pick(hpart(h,12),.90,1.13)*1000)/1000,
  head_height:Math.round(pick(hpart(h,18),.93,1.12)*1000)/1000,
  cheek_width:Math.round(pick(hpart(h,10),.88,1.17)*1000)/1000,
  body_width:Math.round(pick(hpart(h,16),.85,1.19)*1000)/1000,
  skin_tone:Math.min(5,Math.floor(hpart(h,5)*6)),hair_tone:Math.min(4,Math.floor(hpart(h,13)*5)),
  stance:['upright','compact','wide','standard'][h%4],
  handedness:handedness==='L'?'L':'R',throw_hand:throwHand==='L'?'L':'R',
  helmet_style:Math.floor(hpart(h,9)*3)===1?'helmet':'cap',
  face_provenance:'procedural_unverified',
 };
}
export function validateAvatarProfile(value){if(!value||typeof value!=='object')return null;
 for(const k of ['height_scale','shoulder_width','head_width','head_height','cheek_width','body_width']){
  if(typeof value[k]!=='number'||!Number.isFinite(value[k])||value[k]<.7||value[k]>1.4)return null;
 }
 return {...neutral,...value};}
export function drawAvatar(mesh,position,{id='unknown',color='#e2b544',profile=null,role='fielder',phase='ready',now=0,detail=1}={}){
 const p=validateAvatarProfile(profile)||generateAvatarProfile(id);
 const x=position[0],z=position[1],height=p.height_scale,width=p.body_width,skin=rgb(SKINS[p.skin_tone%SKINS.length]),hair=rgb(HAIR[p.hair_tone%HAIR.length]),shirt=rgb(color);
 const pants=[.80,.82,.85],shoes=[.12,.15,.21],glove=[.28,.19,.12];
 const shoulder=.41*p.shoulder_width,hip=.29*width,headY=1.64*height;
 const speed=role==='runner'?6:2,walk=.10*Math.sin(now/220*speed+hashName(id)%9);
 const crouch=role==='batter'?.10:role==='fielder'?.05:0;
 const footSplay=p.stance==='wide'?.17:.09;
 // Shoes, calves and trousers (two bones each).
 for(const side of [-1,1]){
  const knee=[x+side*(hip*.68),.51*height-crouch/2,z+walk*side*.20];
  const foot=[x+side*(hip*.8+footSplay),.12,z+(role==='batter'?side*.13:walk*side*.7)];
  mesh.limb([x+side*hip*.62,.82*height-crouch,z],knee,.105*width,pants,8);
  mesh.limb(knee,foot,.09*width,pants,8);
  mesh.ellipsoid(foot[0],.08,foot[2]+.11,.14,.085,.24,shoes,7);
 }
 // Jersey torso, neck, head (per-avatar proportions, not actual face geometry).
 mesh.ellipsoid(x,1.02*height-crouch,z,.35*width,.43*height,.235*width,shirt,12);
 mesh.cylinder(x,1.33*height-crouch,z,.115*width,.16*height,skin,10);
 mesh.ellipsoid(x,headY-crouch,z,.27*p.head_width,.34*p.head_height,.255*p.cheek_width,skin,12);
 mesh.ellipsoid(x,headY+.225*height-crouch,z,.25*p.head_width,.18,.24*p.cheek_width,hair,11);
 // Cap/head protection; brim orientation toward the mound (-Z).
 mesh.cylinder(x,headY+.25*height-crouch,z,.28*p.head_width,.09,role==='batter'?shoes:shirt,12);
 mesh.box(x,headY+.25*height-crouch,z-.27,.44,.052,.22,role==='batter'?shoes:shirt);
 if(detail>=1){
  // Eyes, eyebrows, nose and ears: shape varies but no purported photographic likeness.
  for(const side of [-1,1]){
   mesh.ellipsoid(x+side*.108*p.head_width,headY+.055-crouch,z-.233*p.cheek_width,.042,.030,.025,[.11,.12,.13],7);
   mesh.box(x+side*.11,headY+.11-crouch,z-.241,.085,.018,.014,hair);
   mesh.ellipsoid(x+side*.257*p.head_width,headY-.028-crouch,z,.045,.092,.060,skin,7);
  }
  mesh.ellipsoid(x,headY-.036-crouch,z-.263*p.cheek_width,.048,.095,.071,skin,7);
  mesh.box(x,headY-.18-crouch,z-.249*p.cheek_width,.098,.012,.012,[.35,.20,.18]);
 }
 // Throwing arm, glove and controllable batting silhouette.
 const throwSide=p.throw_hand==='L'?-1:1;
 let action=0;
 if(role==='pitcher'&&phase==='pitching') action=.9*Math.sin(now/185);
 if(role==='batter'&&phase==='pitching') action=.1;
 if(role==='batter'&&phase==='swinging')action=.8*Math.sin(now/130);
 for(const side of [-1,1]){
  const shoulderPos=[x+side*shoulder,.1+1.17*height-crouch,z];
  const elbow=[x+side*(shoulder+.14),.86*height-crouch+Math.abs(action)*.18,z+side*action*.11];
  const hand=[x+side*(shoulder+.08),.70*height-crouch+Math.abs(action)*.41,z+side*action*.20];
  mesh.limb(shoulderPos,elbow,.102*width,shirt,8);
  mesh.limb(elbow,hand,.079*width,skin,7);
  if(role==='batter'&&side===throwSide){
   const grip=[x+side*(shoulder+.05),.83*height-crouch,z-.25],tip=[grip[0]-side*.32,grip[1]+.98,grip[2]-.17];
   mesh.limb(grip,tip,.043,[.58,.39,.24],8);
  } else if((role==='fielder'||role==='pitcher')&&side===-throwSide){
   mesh.ellipsoid(hand[0],hand[1]-.01,hand[2]-.10,.115,.135,.16,glove,8);
  }
 }
}
