import {MeshBuffer,rgb,perspective,lookAt,multiply,deg} from './mesh.js';
import {FIELDERS,TEAMS} from '../config.js';
import {drawAvatar} from './avatar.js';
import {loadGlbGeometry,appendGlbActor} from './glb-geometry.js';
import {LiveReplay} from './live-replay.js';
import {currentRole,isOffense} from '../core/rules.js';
const VERT=`#version 300 es
in vec3 aPosition;
in vec3 aColor;
uniform mat4 uVP;
out vec3 vColor;
out vec3 vWorld;
void main(){vColor=aColor;vWorld=aPosition;gl_Position=uVP*vec4(aPosition,1.0);}
`;
const FRAG=`#version 300 es
precision highp float;
in vec3 vColor;
in vec3 vWorld;
out vec4 fragColor;
void main(){
 vec3 dx=dFdx(vWorld),dy=dFdy(vWorld);
 vec3 n=normalize(cross(dx,dy));
 vec3 lightDir=normalize(vec3(-.55,.92,.40));
 float lambert=.43+.57*abs(dot(n,lightDir));
 float heightBounce=clamp(vWorld.y*.015,0.0,.12);
 vec3 material=pow(vColor,vec3(.96));
 float noise=fract(sin(dot(floor(vWorld.xz*5.0),vec2(12.9898,78.233)))*43758.5453);
 float isGrass=step(vColor.r*1.7,vColor.g)*step(vColor.b*1.15,vColor.g)*step(vWorld.y,.11);
 float isDirt=step(vColor.g*1.22,vColor.r)*step(vColor.b*1.65,vColor.r)*step(vWorld.y,.16);
 material*=1.0+(noise-.5)*(.21*isGrass+.095*isDirt);
 vec3 shaded=material*(lambert+heightBounce)+vec3(.035,.04,.042);
 float fog=clamp((length(vWorld.xz)-115.0)/260.0,0.0,.22);
 shaded=mix(shaded,vec3(.48,.64,.72),fog);
 fragColor=vec4(clamp(shaded,0.0,1.0),1.0);
}
`;
function shader(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
export function buildStatic(){
 const b=new MeshBuffer();
 const grass=[.083,.275,.143],grassLight=[.105,.325,.173],grassDark=[.072,.242,.127];
 const clay=[.43,.258,.147],track=[.33,.285,.245],concrete=[.32,.36,.39],steel=[.59,.66,.68];
 const seatColors=[[.09,.25,.36],[.11,.28,.40],[.13,.32,.42],[.14,.34,.33]];
 const hash=n=>{const x=Math.sin(n*127.13+4.72)*43758.5453;return x-Math.floor(x)};
 // Field substrate and striped, individually tiled natural-grass appearance.
 b.box(0,-.36,-34,285,.32,276,grassDark);
 for(let x=-134;x<134;x+=11){
  for(let z=-151;z<72;z+=11){
   const stripe=((Math.floor((x+134)/11)+Math.floor((z+151)/11))%2);
   const variation=(hash(x*17+z*91)-.5)*.025;
   const color=(stripe?grassLight:grass).map(v=>v+variation);
   b.box(x+5.5,-.022,z+5.5,11,.025,11,color);
  }
 }
 // Warning track, basepath, infield dirt and finely varied grass cutout.
 b.quad([0,.025,1],[24,.025,-23],[0,.025,-47],[-24,.025,-23],clay);
 b.quad([0,.035,-4.0],[18.7,.035,-23],[0,.035,-42.0],[-18.7,.035,-23],grass);
 for(let i=0;i<24;i++){const a=i*1.618,r=3+Math.sqrt(i)*2.6;b.box(Math.cos(a)*r,.041,-23+Math.sin(a)*r,.36,.01,.27,hash(i*9)>.5?[.29,.18,.12]:[.39,.24,.14]);}
 b.cylinder(0,.03,-18,2.62,.135,clay,30);b.box(0,.17,-18,.92,.07,.19,[.96,.95,.88]);
 for(const [x,z] of [[0,0],[23,-23],[0,-46],[-23,-23]])b.box(x,.058,z,.93,.11,.93,[.94,.94,.90]);
 for(const [x,z] of [[23,-23],[0,-46],[-23,-23]])b.box(x,.045,z,3.6,.015,3.6,clay);
 b.line([0,.075,0],[107,.075,-107],.16,[.97,.96,.92]);
 b.line([0,.075,0],[-107,.075,-107],.16,[.97,.96,.92]);
 for(const side of [-1,1]){
  b.line([side*.90,.085,-1.35],[side*2.95,.085,-1.35],.09,[.94,.94,.89]);
  b.line([side*.90,.085,2.05],[side*2.95,.085,2.05],.09,[.94,.94,.89]);
  b.line([side*2.95,.085,-1.35],[side*2.95,.085,2.05],.09,[.94,.94,.89]);
 }
 // Curved warning-track and calibrated outfield fence.
 const N=76,lo=Math.PI*.15,hi=Math.PI*.85;
 const arc=(angle,r)=>[Math.cos(angle)*r,-Math.sin(angle)*r];
 for(let i=0;i<N;i++){
  const a=lo+(hi-lo)*i/N,d=lo+(hi-lo)*(i+1)/N,[x,z]=arc(a,119),[xx,zz]=arc(d,119);
  b.line([x,.055,z],[xx,.055,zz],4,track);
  const [wx,wz]=arc(a,122),[wnx,wnz]=arc(d,122);
  const wallColor=i%9<3?[.075,.265,.23]:[.07,.235,.225];
  b.box(wx,0,wz,2.5,5.7,2.0,wallColor);
  b.line([wx,5.76,wz],[wnx,5.76,wnz],.32,[.95,.80,.29]);
  b.box(wx,3.1,wz-1.1,2.0,.9,.09,i%8===0?[.94,.57,.16]:[.18,.38,.43]);
  if(i%4===0){
   b.cylinder(wx,5.7,wz,.085,2.5,steel,6);
   b.line([wx,8.1,wz],[wnx,8.1,wnz],.08,steel);
  }
  // Concrete bowl, risers, alternating seat cushions and sparse spectators.
  for(let row=0;row<8;row++){
   const radius=130+row*3.5,height=7.4+row*.98;
   const [sx,sz]=arc(a,radius);
   b.box(sx,height-1.0,sz,2.75,1.12,3.4,concrete);
   b.box(sx,height+.06,sz-.38,2.45,.17,1.3,seatColors[(i+Math.floor(row/2))%seatColors.length]);
   b.box(sx,height+.14,sz+.28,2.4,.60,.21,seatColors[(i+Math.floor(row/2))%seatColors.length]);
   if(row>1 && hash(i*31+row*17)>.48){
    const jacket=hash(i*47+row*11)>.5?[.52,.22,.18]:[.66,.68,.58];
    b.box(sx,height+.26,sz-.25,.49,.51,.31,jacket);
    b.sphere(sx,height+.82,sz-.25,.205,[.66,.46,.32],6);
   }
  }
  if(i%12===0){
   const [px,pz]=arc(a,145);
   b.cylinder(px,7,pz,.13,11,steel,7);
  }
 }
 // Behind-home grandstand, press booths, glass frontage and roof canopy.
 for(const side of [-1,1]){
  for(let row=0;row<7;row++){
   const z=20+row*3.2,y=2.4+row*.85;
   for(let i=0;i<14;i++){
    const x=side*(6+i*3.3);
    b.box(x,y-.65,z,2.85,.90,3.15,concrete);
    b.box(x,y+.15,z-.45,2.55,.13,1.30,seatColors[(i+row)%4]);
    b.box(x,y+.20,z+.25,2.55,.58,.18,seatColors[(i+row)%4]);
    if(hash(i*7+row*51+side*100)>.68){
     b.box(x,y+.33,z-.25,.43,.49,.31,[.26+.25*hash(i),.29,.35]);
     b.sphere(x,y+.88,z-.25,.19,[.70,.48,.34],6);
    }
   }
  }
  const dx=side*28;
  b.box(dx,10.3,45,38,4.9,9,[.13,.21,.27]);
  b.box(dx,12.2,40.35,35.2,1.4,.21,[.28,.44,.50]);
  for(let i=0;i<9;i++)b.box(dx-16+i*4,12.2,40.20,.15,1.45,.26,steel);
  b.box(dx,16,43,44,.55,12,[.16,.19,.21]);
 }
 // Foul poles with yellow mesh and stadium LED floodlights.
 for(const side of [-1,1]){
  const x=side*92;
  b.cylinder(x,.0,-91,.17,30,[.98,.79,.21],9);
  for(let y=3;y<=28;y+=3)b.line([x,y,-91],[x+side*4,y,-91],.07,[.92,.72,.21]);
  const lx=side*146;
  b.cylinder(lx,0,-10,.75,32,[.39,.43,.46],10);
  b.box(lx,31,-10,19,3.5,1.8,[.16,.21,.26]);
  for(let j=0;j<9;j++)b.box(lx-8+j*2,31.5,-10.96,1.65,2.05,.13,[.96,.96,.83]);
 }
 // Bullpens, roofed dugouts and seats with overhead protection.
 for(const side of [-1,1]){
  const x=side*34;
  b.box(x,0,7,20,2.1,10,[.19,.22,.25]);
  b.box(x,2.5,7,22,.68,11,[.16,.19,.22]);
  b.box(x,1.06,5.7,18,.48,.72,[.29,.31,.31]);
  for(let i=0;i<6;i++){
   b.box(x-8+i*3.2,1.08,6.2,1.65,.16,.60,[.16,.31,.35]);
   b.box(x-8+i*3.2,1.18,6.65,1.65,.44,.16,[.16,.31,.35]);
  }
  b.box(x,2.4,2.1,21,.15,.15,steel);
 }
 // Backstop posts and transparent-looking open mesh (only thin rods, never a solid wall).
 for(let i=-14;i<=14;i+=2){
  b.cylinder(i,0,14,.035,8,[.40,.48,.51],5);
 }
 for(let y=1;y<=8;y+=1.4)b.line([-15,y,14],[15,y,14],.026,[.31,.39,.41]);
 // Center-field scoreboard: dark fascia and modular emissive looking LED tiles.
 b.box(0,6,-132,29,15,2.6,[.10,.14,.19]);
 b.box(0,8,-130.51,26.5,11.1,.18,[.025,.055,.075]);
 for(let x=-12;x<=12;x+=1.5){
  for(let y=4;y<=12;y+=1.5){
   if(hash(x*79+y*23)>.86)b.box(x,y,-130.39,1.20,1.05,.045,[.18,.51,.56]);
  }
 }
 b.box(0,20.8,-132,32,1.1,3.0,[.20,.27,.30]);
 return b;
}
export class StadiumScene{
 constructor(canvas){this.canvas=canvas;const gl=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});if(!gl){this.gl=null;this.ctx=canvas.getContext('2d');this.software=true;this.staticMesh=buildStatic();this.cameraYaw=0;this.setupAvatars();return;}this.gl=gl;const prog=gl.createProgram();gl.attachShader(prog,shader(gl,gl.VERTEX_SHADER,VERT));gl.attachShader(prog,shader(gl,gl.FRAGMENT_SHADER,FRAG));gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error('WebGL shader link failed');this.program=prog;this.aPos=gl.getAttribLocation(prog,'aPosition');this.aCol=gl.getAttribLocation(prog,'aColor');this.vp=gl.getUniformLocation(prog,'uVP');this.staticMesh=buildStatic();this.staticGpu=this.uploadMesh(this.staticMesh,gl.STATIC_DRAW);this.cameraYaw=0;this.setupAvatars();}
 uploadMesh(mesh,usage){
  const gl=this.gl,positions=gl.createBuffer(),colors=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,positions);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh.p),usage);
  gl.bindBuffer(gl.ARRAY_BUFFER,colors);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh.c),usage);
  return {positions,colors,count:mesh.p.length/3};
 }
 drawMesh(buffers){
  const gl=this.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER,buffers.positions);
  gl.vertexAttribPointer(this.aPos,3,gl.FLOAT,false,0,0);gl.enableVertexAttribArray(this.aPos);
  gl.bindBuffer(gl.ARRAY_BUFFER,buffers.colors);
  gl.vertexAttribPointer(this.aCol,3,gl.FLOAT,false,0,0);gl.enableVertexAttribArray(this.aCol);
  gl.drawArrays(gl.TRIANGLES,0,buffers.count);
 }
 renderRemote(data,teamId,now){
  if(!this.liveReplay)this.liveReplay=new LiveReplay();
  this.liveReplay.ingest(data,now);
  const frame=this.liveReplay.scene(teamId,now);
  this.render(frame,now);
 }
 setupAvatars(){
  this.avatarTeams=new Map();this.playerGlb=null;this.glbLoadState='loading';
  loadGlbGeometry(new URL('../../assets/models/player_base.glb',import.meta.url))
   .then(asset=>{this.playerGlb=asset;this.glbLoadState='loaded';})
   .catch(()=>{this.glbLoadState='fallback';});
  const assetUrl=new URL('../../assets/player-avatar-catalog.json',import.meta.url);
  fetch(assetUrl).then(r=>{if(!r.ok)throw Error('avatar catalog unavailable');return r.json()}).then(d=>{
   const byTeam=new Map();for(const p of d.players||[]){if(!byTeam.has(p.team_id))byTeam.set(p.team_id,[]);byTeam.get(p.team_id).push(p);}
   for(const [team,players] of byTeam){const pitchers=players.filter(p=>p.primary_position==='P').sort((a,b)=>(b.pitching_outs_2024||0)-(a.pitching_outs_2024||0));
    const batters=players.filter(p=>p.batting_pa_2024>0).sort((a,b)=>(b.batting_pa_2024||0)-(a.batting_pa_2024||0));
    const lineup=[];lineup.push(pitchers[0]||players[0]);
    const available=players.filter(p=>p!==lineup[0]).sort((a,b)=>(b.batting_pa_2024||0)-(a.batting_pa_2024||0));
    for(const f of FIELDERS.slice(1)){
     const samePosition=available.find(p=>p.primary_position===f.key&&!lineup.includes(p));
     const candidate=samePosition||available.find(p=>!lineup.includes(p));
     if(candidate)lineup.push(candidate);
    }
    this.avatarTeams.set(team,{players,lineup,batters});}
  }).catch(()=>{/* Real roster assets are optional in the offline practice scene. */});}
 render(state,now){const gl=this.gl,canvas=this.canvas;const w=Math.min(2200,Math.max(1,canvas.clientWidth*devicePixelRatio)),h=Math.min(1300,Math.max(1,canvas.clientHeight*devicePixelRatio));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;if(gl)gl.viewport(0,0,w,h)}
 if(gl){gl.clearColor(.43,.63,.80,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);}const b=new MeshBuffer();if(!gl){b.p=this.staticMesh.p.slice();b.c=this.staticMesh.c.slice();}
 const battingPOV=currentRole(state)==='batter'&&!['fielding','fielderChoice'].includes(state.phase);
 const defending=state.half==='top'?state.home:state.visitor;const dteam=TEAMS.find(t=>t.id===defending)||TEAMS[0];const ateam=TEAMS.find(t=>t.id!==(state.half==='top'?state.home:state.visitor)&&t.id===(state.half==='top'?state.visitor:state.home))||TEAMS[1];
 FIELDERS.forEach((f,i)=>{if(battingPOV&&f.key==='C')return;const pos=state.liveFielders?.[f.key]||(state.selectedFielder?.key===f.key&&state.fielderPos?state.fielderPos:f.pos);
   const person=this.avatarTeams.get(defending)?.lineup?.[i],key=person?.id||`${defending}:${f.key}`;
   if(this.playerGlb){
    appendGlbActor(b,this.playerGlb,pos.x??pos[0],pos.z??pos[1],rgb(dteam.color),person?.profile?.height_scale||1);
   }else drawAvatar(b,[pos.x??pos[0],pos.z??pos[1]],{id:key,color:dteam.color,profile:person?.profile,role:i===0?'pitcher':'fielder',positionKey:f.key,phase:state.phase,now,detail:i<2?1:0});
 });
 const activeBatter=this.avatarTeams.get(ateam.id)?.batters?.[(state.atBat-1)%Math.max(1,this.avatarTeams.get(ateam.id)?.batters?.length||1)];
 if(!battingPOV){
 if(this.playerGlb)appendGlbActor(b,this.playerGlb,1.1,-.9,rgb(ateam.color),activeBatter?.profile?.height_scale||1);
 else drawAvatar(b,[1.1,-.9],{id:activeBatter?.id||`${ateam.id}:batter`,profile:activeBatter?.profile,color:ateam.color,role:'batter',phase:state.phase,now});
 }
 if(state.liveRunners?.length){
  for(const [i,p] of state.liveRunners.entries())drawAvatar(b,p,{id:`${ateam.id}:live-runner:${i}`,color:ateam.color,role:'runner',phase:'running',now,detail:0});
 }
 for(const [i,x,z] of [[0,23,-23],[1,0,-46],[2,-23,-23]])if(state.bases[i]&&!state.liveRunners?.length){
   const runner=this.avatarTeams.get(ateam.id)?.batters?.[(state.atBat-i-2+Math.max(1,this.avatarTeams.get(ateam.id)?.batters?.length||1))%Math.max(1,this.avatarTeams.get(ateam.id)?.batters?.length||1)];
   if(this.playerGlb)appendGlbActor(b,this.playerGlb,x+1.5,z+1.5,rgb(ateam.color),runner?.profile?.height_scale||1);
   else drawAvatar(b,[x+1.5,z+1.5],{id:runner?.id||`${ateam.id}:runner:${i}`,profile:runner?.profile,color:ateam.color,role:'runner',phase:state.phase,now,detail:0});
 }
 b.cylinder(.3,.15,0,.055,1.55,[.64,.47,.23],8);
 if(state.phase==='fielding'&&state.landing){
  const land=state.landing;
  // Concentric landing marker, tall beacon and ground shadow make the live ball trackable.
  for(const radius of [1.0,2.0,3.1]){
   const steps=28;
   for(let i=0;i<steps;i++){
    const t=i*2*Math.PI/steps,u=(i+1)*2*Math.PI/steps;
    b.line([land.x+Math.cos(t)*radius,.11,land.z+Math.sin(t)*radius],
           [land.x+Math.cos(u)*radius,.11,land.z+Math.sin(u)*radius],.12,[.98,.72,.14]);
   }
  }
  b.cylinder(land.x,.06,land.z,.22,2.6,[.95,.63,.17],10);
 }
 if(state.ball&&state.ball.visible!==false){
  const v=state.ball;
  const highlighted=state.phase==='fielding';
  b.sphere(v.x,v.y,v.z,highlighted?.34:.235,[1,.99,.93],12);
  if(state.phase==='pitching'){
   // Subtle bright perimeter makes the pitch distinguishable from sky/jerseys.
   b.sphere(v.x,v.y,v.z,.255,[.93,.78,.34],9);
  }
  if(highlighted){
   b.sphere(v.x,v.y,v.z,.43,[.94,.70,.24],8);
   b.cylinder(v.x,.08,v.z,.42,.026,[.95,.88,.57],14);
  }
  if(v.trail){
   for(let i=1;i<=12;i++){
    const k=i/13,tail=.17;
    b.sphere(v.x-(v.vx||0)*k*tail,Math.max(.14,v.y-(v.vy||0)*k*tail),v.z-(v.vz||0)*k*tail,
      highlighted?.10:.05,[.95,.75,.32],6);
   }
  }
 }
 if(state.mode==='coach'){b.cylinder(state.coachPos.x,0,state.coachPos.z,.25,.05,[.8,.6,.3]);}
 const role=currentRole(state);let eye,target;
 if(role==='coach'){eye=[state.coachPos.x,1.65,state.coachPos.z];target=[eye[0]+Math.sin(this.cameraYaw)*8,1.62,eye[2]-Math.cos(this.cameraYaw)*8];}
 else if(role==='pitcher'){eye=[.75,1.78,-16.1];target=[state.aim.x*.2,1.12,0];}
 else if(role==='batter'){eye=[0,1.68,2.4];target=[0,1.18,-18.0];}
 else if(role==='auto'){eye=[24,16,22];target=[0,0.5,-30];}
 else{eye=[-4,4,4];target=[0,0,-29];}
 if((state.phase==='fielding'||state.phase==='fielderChoice')&&role!=='coach'&&role!=='auto'){
  if(isOffense(state)){
   eye=[state.runnerPos?.x??12,7,state.runnerPos?.z??14];target=[state.ball?.x??0,Math.max(1,state.ball?.y??1),state.ball?.z??-35];
  }else{
   const p=state.fielderPos||state.selectedFielder?.pos||[0,-30];
   const fx=p.x??p[0],fz=p.z??p[1],land=state.landing||{x:0,z:-35};
   // Third-person chase camera: player, flying ball and landing zone remain in front.
   const focusX=(fx+land.x)*.5,focusZ=(fz+land.z)*.5;
   eye=[fx,9,fz+15];target=[focusX,Math.max(1.1,(state.ball?.y||0)*.55),focusZ];
  }
 }
 const matrix=multiply(perspective(deg(role==='auto'?65:role==='batter'?54:70),w/h,.08,440),lookAt(eye,target));
 if(!gl){this.renderSoftware(b,matrix,w,h,now);return;}
 gl.useProgram(this.program);gl.uniformMatrix4fv(this.vp,false,matrix);
 this.drawMesh(this.staticGpu);
 const dynamic=this.uploadMesh(b,gl.STREAM_DRAW);
 this.drawMesh(dynamic);
 gl.deleteBuffer(dynamic.positions);gl.deleteBuffer(dynamic.colors);
 }
 renderSoftware(b,m,w,h,now){
  if(this.lastSoftware&&now-this.lastSoftware<90)return;
  this.lastSoftware=now;
  const ctx=this.ctx;ctx.fillStyle='#709ebd';ctx.fillRect(0,0,w,h);
  const projected=[];const points=b.p,colors=b.c;
  const proj=(j)=>{const x=points[j],y=points[j+1],z=points[j+2],v=m[3]*x+m[7]*y+m[11]*z+m[15];if(v<.08)return null;const px=(m[0]*x+m[4]*y+m[8]*z+m[12])/v,py=(m[1]*x+m[5]*y+m[9]*z+m[13])/v,d=(m[2]*x+m[6]*y+m[10]*z+m[14])/v;return [(px+1)*w/2,(1-py)*h/2,d]};
  for(let i=0;i<points.length;i+=9){const a=proj(i),bb=proj(i+3),c=proj(i+6);if(!a||!bb||!c)continue;if(a[2]>1&&bb[2]>1&&c[2]>1)continue;
   const cx=(a[0]+bb[0]+c[0])/3,cy=(a[1]+bb[1]+c[1])/3;
   if(cx< -w*.45||cx>w*1.45||cy< -h*.45||cy>h*1.45)continue;
   const area=Math.abs((bb[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(bb[1]-a[1]));if(area<.5)continue;
   const col=colors.slice(i,i+3).map(v=>Math.max(0,Math.min(255,Math.round(255*Math.pow(v,.91)))));
   projected.push({a,b:bb,c,d:(a[2]+bb[2]+c[2])/3,col});}
  projected.sort((a,b)=>b.d-a.d);
  for(const t of projected){ctx.beginPath();ctx.moveTo(t.a[0],t.a[1]);ctx.lineTo(t.b[0],t.b[1]);ctx.lineTo(t.c[0],t.c[1]);ctx.closePath();ctx.fillStyle=`rgb(${t.col.join(',')})`;ctx.fill();}
 }

}
