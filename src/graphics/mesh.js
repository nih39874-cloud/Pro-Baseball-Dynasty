const R=Math.PI/180;
export function rgb(hex){const s=hex.replace('#','');return [parseInt(s.substring(0,2),16)/255,parseInt(s.substring(2,4),16)/255,parseInt(s.substring(4,6),16)/255]}
export class MeshBuffer{
 constructor(){this.p=[];this.c=[]}
 tri(a,b,c,col){for(const v of [a,b,c]){this.p.push(...v);this.c.push(...col)}}
 quad(a,b,c,d,col){this.tri(a,b,c,col);this.tri(a,c,d,col)}
 box(x,y,z,w,h,d,col){const x0=x-w/2,x1=x+w/2,y0=y,y1=y+h,z0=z-d/2,z1=z+d/2;let p=[ [x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0], [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];for(const q of [[0,1,2,3],[5,4,7,6],[4,0,3,7],[1,5,6,2],[3,2,6,7],[4,5,1,0]])this.quad(...q.map(i=>p[i]),col)}
 cylinder(x,y,z,r,h,col,seg=10){for(let i=0;i<seg;i++){const a=2*Math.PI*i/seg,b=2*Math.PI*(i+1)/seg;const p=[x+Math.cos(a)*r,y,z+Math.sin(a)*r],q=[x+Math.cos(b)*r,y,z+Math.sin(b)*r],u=[p[0],y+h,p[2]],v=[q[0],y+h,q[2]];this.quad(p,q,v,u,col);this.tri([x,y+h,z],u,v,col)}}
 ellipsoid(x,y,z,rx,ry,rz,col,seg=9){for(let i=0;i<seg;i++){const a=Math.PI*i/seg,b=Math.PI*(i+1)/seg;for(let j=0;j<seg*2;j++){const p=2*Math.PI*j/(seg*2),q=2*Math.PI*(j+1)/(seg*2);const v=(t,w)=>[x+rx*Math.sin(t)*Math.cos(w),y+ry*Math.cos(t),z+rz*Math.sin(t)*Math.sin(w)];this.quad(v(a,p),v(b,p),v(b,q),v(a,q),col)}}}
 limb(a,b,r,col,seg=9){let dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dx,dy,dz)||1;dx/=len;dy/=len;dz/=len;let tx,tz,ty=0;if(Math.abs(dy)>.93){tx=1;tz=0;}else{tx=-dz;tz=dx;const l=Math.hypot(tx,tz)||1;tx/=l;tz/=l;}const sx=dy*tz-dz*ty,sy=dz*tx-dx*tz,sz=dx*ty-dy*tx;for(let i=0;i<seg;i++){const k=2*Math.PI*i/seg,n=2*Math.PI*(i+1)/seg;const v=(base,t)=>[base[0]+r*(tx*Math.cos(t)+sx*Math.sin(t)),base[1]+r*(ty*Math.cos(t)+sy*Math.sin(t)),base[2]+r*(tz*Math.cos(t)+sz*Math.sin(t))];this.quad(v(a,k),v(a,n),v(b,n),v(b,k),col);}}
 sphere(x,y,z,r,col,seg=8){for(let i=0;i<seg;i++){const t0=Math.PI*i/seg,t1=Math.PI*(i+1)/seg;for(let j=0;j<seg*2;j++){const p0=2*Math.PI*j/(seg*2),p1=2*Math.PI*(j+1)/(seg*2);const v=(t,p)=>[x+r*Math.sin(t)*Math.cos(p),y+r*Math.cos(t),z+r*Math.sin(t)*Math.sin(p)];this.quad(v(t0,p0),v(t1,p0),v(t1,p1),v(t0,p1),col)}}}
 line(a,b,width,col){const dx=b[0]-a[0],dz=b[2]-a[2],l=Math.hypot(dx,dz)||1,px=-dz/l*width/2,pz=dx/l*width/2;this.quad([a[0]+px,a[1],a[2]+pz],[b[0]+px,b[1],b[2]+pz],[b[0]-px,b[1],b[2]-pz],[a[0]-px,a[1],a[2]-pz],col)}
 person(x,z,shirt='#e2b544',face='#dfaf88',orient=0){let sc=rgb(shirt);this.cylinder(x,.30,z,.37,.74,sc,10);this.sphere(x,1.52,z,.28,rgb(face));this.box(x,1.78,z,.60,.15,.44,rgb(shirt));this.box(x,.08,z-.19,.18,.38,.16,[.14,.19,.24]);this.box(x,.08,z+.19,.18,.38,.16,[.14,.19,.24]);this.cylinder(x-.46,.78,z,.13,.55,rgb(face),7);this.cylinder(x+.46,.78,z,.13,.55,rgb(face),7)}
}
export function multiply(a,b){let o=new Float32Array(16);for(let j=0;j<4;j++)for(let i=0;i<4;i++)o[j*4+i]=a[i]*b[j*4]+a[4+i]*b[j*4+1]+a[8+i]*b[j*4+2]+a[12+i]*b[j*4+3];return o}
export function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0])}
export function lookAt(e,t){let zx=e[0]-t[0],zy=e[1]-t[1],zz=e[2]-t[2];let l=Math.hypot(zx,zy,zz)||1;zx/=l;zy/=l;zz/=l;let xx=zz,xy=0,xz=-zx;l=Math.hypot(xx,xy,xz)||1;xx/=l;xz/=l;const yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;return new Float32Array([xx,yx,zx,0,xy,yy,zy,0,xz,yz,zz,0,-(xx*e[0]+xy*e[1]+xz*e[2]),-(yx*e[0]+yy*e[1]+yz*e[2]),-(zx*e[0]+zy*e[1]+zz*e[2]),1])}
export const deg=n=>n*R;
