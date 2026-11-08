import {MeshBuffer,rgb,perspective,lookAt,multiply,deg} from './mesh.js';
import {FIELDERS,TEAMS} from '../config.js';
import {currentRole,isOffense} from '../core/rules.js';
const VERT=`attribute vec3 aPosition;attribute vec3 aColor;uniform mat4 uVP;varying vec3 vColor;void main(){vColor=aColor;gl_Position=uVP*vec4(aPosition,1.);}`;
const FRAG=`precision mediump float;varying vec3 vColor;void main(){vec3 c=pow(vColor,vec3(.91));gl_FragColor=vec4(c,1.);}`;
function shader(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
function buildStatic(){const b=new MeshBuffer();
 b.box(0,-.22,-35,260,.20,255,[.065,.22,.16]);
 for(let z=-140;z<70;z+=13)b.box(0,-.014,z,250,.015,6,((z+140)/13)%2===0?[.09,.32,.22]:[.083,.30,.21]);
 // Infield diamond and home / mound.
 b.quad([0,.008,0],[23,.008,-23],[0,.008,-46],[-23,.008,-23],[.43,.28,.17]);
 b.quad([0,.014,-5],[18,.014,-23],[0,.014,-41],[-18,.014,-23],[.12,.31,.2]);
 b.cylinder(0,0,-18,2.65,.12,[.48,.32,.20],25);b.box(0,.12,-18,1.3,.11,.25,[.95,.93,.87]);
 b.line([0,.06,0],[105,.06,-105],.30,[.97,.95,.85]);b.line([0,.06,0],[-105,.06,-105],.30,[.97,.95,.85]);
 for(const [x,z] of [[0,0],[23,-23],[0,-46],[-23,-23]]){b.box(x,.042,z,1.1,.12,1.1,[.95,.96,.88]);}
 // Batter boxes and backstop
 b.line([-3,.06,1.5],[3,.06,1.5],.12,[.92,.92,.85]);
 for(const x of [-2,2]){b.line([x-1,.05,-1],[x+1,.05,-1],.13,[.92,.92,.85]);b.line([x-1,.05,2.2],[x+1,.05,2.2],.13,[.92,.92,.85]);}
 // Broad curved outfield wall and stands.
 for(let i=0;i<56;i++){const a=(Math.PI*.16)+i*(Math.PI*.68/56),d=(Math.PI*.16)+(i+1)*(Math.PI*.68/56),r=120;const p=[Math.cos(a)*r,0,-Math.sin(a)*r+2],q=[Math.cos(d)*r,0,-Math.sin(d)*r+2];b.box(p[0],0,p[2],2.8,7.2,3.1,[.10,.29,.29]);b.line([p[0],7.2,p[2]],[q[0],7.2,q[2]],1.5,[.76,.69,.44]);
 for(let j=0;j<4;j++){const h=8+j*3.2;const s=[Math.cos(a)*(r+8+j*3),h,-Math.sin(a)*(r+8+j*3)+2];b.box(s[0],h/8,s[2],3.1,2.5,3,[.16+j*.015,.23+j*.01,.29+j*.005]);}}
 // Foul poles and floodlights.
 for(const x of [-90,90]){b.cylinder(x,0,-91,.20,27,[.96,.83,.30],9);b.cylinder(x*1.35,0,-15,.68,30,[.41,.43,.45],12);b.box(x*1.35,29,-15,16,4,1.2,[.91,.93,.82]);}
 // Dugouts and roofs.
 for(const x of [-32,32]){b.box(x,0,5,16,2.4,9,[.19,.28,.34]);b.box(x,2.4,5,18,.65,10,[.08,.15,.19]);b.box(x,.8,5.2,16,.7,.8,[.36,.39,.38]);}
 // Backstop lines and scoreboard at center-field.
 b.box(0,6,-125,24,13,2,[.03,.13,.20]);b.box(0,7,-123.8,21,10,.12,[.11,.26,.27]);
 return b;
}
export class StadiumScene{
 constructor(canvas){this.canvas=canvas;const gl=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});if(!gl){this.gl=null;this.ctx=canvas.getContext('2d');this.software=true;this.staticMesh=buildStatic();this.cameraYaw=0;return;}this.gl=gl;const prog=gl.createProgram();gl.attachShader(prog,shader(gl,gl.VERTEX_SHADER,VERT));gl.attachShader(prog,shader(gl,gl.FRAGMENT_SHADER,FRAG));gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error('WebGL shader link failed');this.program=prog;this.aPos=gl.getAttribLocation(prog,'aPosition');this.aCol=gl.getAttribLocation(prog,'aColor');this.vp=gl.getUniformLocation(prog,'uVP');this.staticMesh=buildStatic();this.cameraYaw=0;}
 render(state,now){const gl=this.gl,canvas=this.canvas;const w=Math.min(2200,Math.max(1,canvas.clientWidth*devicePixelRatio)),h=Math.min(1300,Math.max(1,canvas.clientHeight*devicePixelRatio));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;if(gl)gl.viewport(0,0,w,h)}
 if(gl){gl.clearColor(.055,.12,.16,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);}const b=new MeshBuffer();b.p=this.staticMesh.p.slice();b.c=this.staticMesh.c.slice();
 const defending=state.half==='top'?state.home:state.visitor;const dteam=TEAMS.find(t=>t.id===defending)||TEAMS[0];const ateam=TEAMS.find(t=>t.id!==(state.half==='top'?state.home:state.visitor)&&t.id===(state.half==='top'?state.visitor:state.home))||TEAMS[1];
 FIELDERS.forEach(f=>{const p=state.selectedFielder?.key===f.key&&state.fielderPos?state.fielderPos:f.pos;b.person(p[0],p[1],dteam.color)});
 b.person(1.1,-.9,ateam.color); // batter to side of plate
 for(const [i,x,z] of [[0,23,-23],[1,0,-46],[2,-23,-23]])if(state.bases[i])b.person(x+1.5,z+1.5,ateam.color);
 b.cylinder(.3,.15,0,.055,1.55,[.64,.47,.23],8);
 if(state.ball&&state.ball.visible!==false){const v=state.ball;b.sphere(v.x,v.y,v.z,.16,[.97,.97,.92],9);if(v.trail){for(let i=1;i<=12;i++){const k=i/13;b.sphere(v.x-v.vx*k*.18,Math.max(.14,v.y-v.vy*k*.18),v.z-v.vz*k*.18,.05,[.87,.70,.39],5);}}}
 if(state.mode==='coach'){b.cylinder(state.coachPos.x,0,state.coachPos.z,.25,.05,[.8,.6,.3]);}
 const role=currentRole(state);let eye,target;
 if(role==='coach'){eye=[state.coachPos.x,1.65,state.coachPos.z];target=[eye[0]+Math.sin(this.cameraYaw)*8,1.62,eye[2]-Math.cos(this.cameraYaw)*8];}
 else if(role==='pitcher'){eye=[0,1.7,-16.2];target=[state.aim.x*.2,1.1,0];}
 else if(role==='batter'){eye=[0,1.55,4.3];target=[0,1.0,-20];}
 else if(role==='auto'){eye=[24,16,22];target=[0,0.5,-30];}
 else{eye=[-4,4,4];target=[0,0,-29];}
 if(state.phase==='fielding'&&role!=='coach'&&role!=='auto'){
 if(isOffense(state)){eye=[state.runnerPos?.x||0,1.6,state.runnerPos?.z||1];target=[0,1.3,-25];}
 else{const p=state.fielderPos||state.selectedFielder?.pos||[-8,-30];eye=[p[0],1.7,p[1]+1];target=[state.ball?.x||0,Math.max(.7,state.ball?.y||1),state.ball?.z||-35];}
 }
 const matrix=multiply(perspective(deg(role==='auto'?65:70),w/h,.08,440),lookAt(eye,target));
 if(!gl){this.renderSoftware(b,matrix,w,h,now);return;}
 gl.useProgram(this.program);gl.uniformMatrix4fv(this.vp,false,matrix);
 const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(b.p),gl.DYNAMIC_DRAW);gl.vertexAttribPointer(this.aPos,3,gl.FLOAT,false,0,0);gl.enableVertexAttribArray(this.aPos);
 const color=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,color);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(b.c),gl.DYNAMIC_DRAW);gl.vertexAttribPointer(this.aCol,3,gl.FLOAT,false,0,0);gl.enableVertexAttribArray(this.aCol);
 gl.drawArrays(gl.TRIANGLES,0,b.p.length/3);gl.deleteBuffer(buf);gl.deleteBuffer(color);
 }
 renderSoftware(b,m,w,h,now){
  if(this.lastSoftware&&now-this.lastSoftware<90)return;
  this.lastSoftware=now;
  const ctx=this.ctx;ctx.fillStyle='#102b37';ctx.fillRect(0,0,w,h);
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
