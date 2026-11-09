/** Minimal GLB v2 triangle importer for the existing WebGL baseball renderer.
 * Reads embedded Blender-exported geometry and material base colors.
 * Does not yet support skeletal animation or physically based shading.
 */
export async function loadGlbGeometry(url){
 const r=await fetch(url);
 if(!r.ok)throw Error('GLB unavailable: '+r.status);
 return parseGlbGeometry(await r.arrayBuffer());
}
export function parseGlbGeometry(buffer){
 const dv=new DataView(buffer);
 if(dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2)throw Error('Expected glTF 2.0 binary GLB');
 const total=dv.getUint32(8,true);if(total>buffer.byteLength)throw Error('Incomplete GLB');
 let json=null,bin=null,off=12;
 while(off+8<=total){
  const n=dv.getUint32(off,true),type=dv.getUint32(off+4,true);off+=8;
  if(n<0||off+n>total)throw Error('Invalid GLB chunk size');
  if(type===0x4e4f534a)json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,off,n)).trim());
  if(type===0x004e4942)bin=new DataView(buffer,off,n);
  off+=n;
 }
 if(!json||!bin)throw Error('GLB requires JSON and BIN chunks');
 const components={5120:{size:1,get:(d,p)=>d.getInt8(p)},5121:{size:1,get:(d,p)=>d.getUint8(p)},5122:{size:2,get:(d,p)=>d.getInt16(p,true)},5123:{size:2,get:(d,p)=>d.getUint16(p,true)},5125:{size:4,get:(d,p)=>d.getUint32(p,true)},5126:{size:4,get:(d,p)=>d.getFloat32(p,true)}};
 const dimensions={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
 function accessor(index){
  const a=json.accessors[index],view=json.bufferViews[a.bufferView],kind=components[a.componentType];
  if(!kind||a.sparse)throw Error('Unsupported accessor encoding');
  const length=dimensions[a.type],stride=view.byteStride||kind.size*length;
  const start=(view.byteOffset||0)+(a.byteOffset||0);
  return i=>{if(i<0||i>=a.count)throw Error('Accessor index out of range');
   const result=[];for(let j=0;j<length;j++)result.push(kind.get(bin,start+i*stride+j*kind.size));return result;
  };
 }
 const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
 const product=(a,b)=>{const m=Array(16).fill(0);for(let j=0;j<4;j++)for(let i=0;i<4;i++)for(let k=0;k<4;k++)m[j*4+i]+=a[k*4+i]*b[j*4+k];return m};
 function local(node){
  if(node.matrix)return node.matrix;
  const [x,y,z,w]=node.rotation||[0,0,0,1],s=node.scale||[1,1,1],t=node.translation||[0,0,0];
  const q=[1-2*(y*y+z*z),2*(x*y+z*w),2*(x*z-y*w),0,
           2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w),0,
           2*(x*z+y*w),2*(y*z-x*w),1-2*(x*x+y*y),0,t[0],t[1],t[2],1];
  for(let j=0;j<3;j++)for(let i=0;i<3;i++)q[j*4+i]*=s[j];
  return q;
 }
 const points=[],colors=[],normals=[];
 function walk(index,parent){
  const node=json.nodes[index],matrix=product(parent,local(node));
  if(node.mesh!==undefined){
   for(const primitive of json.meshes[node.mesh].primitives){
    if(primitive.mode!==undefined&&primitive.mode!==4)continue;
    const pAccessor=json.accessors[primitive.attributes.POSITION];
    if(!pAccessor)continue;
    const pos=accessor(primitive.attributes.POSITION);
    const normal=primitive.attributes.NORMAL!==undefined?accessor(primitive.attributes.NORMAL):null;
    const idx=primitive.indices!==undefined?accessor(primitive.indices):null;
    const count=idx?json.accessors[primitive.indices].count:pAccessor.count;
    const mat=json.materials?.[primitive.material],base=mat?.pbrMetallicRoughness?.baseColorFactor||[.7,.72,.75,1];
    const isJersey=/^(jersey_fabric|uniform_fabric|team_sleeve)$/i.test(mat?.name||'');
    for(let i=0;i<count;i++){
     const j=idx?idx(i)[0]:i,v=pos(j);
     const xyz=[matrix[0]*v[0]+matrix[4]*v[1]+matrix[8]*v[2]+matrix[12],
                matrix[1]*v[0]+matrix[5]*v[1]+matrix[9]*v[2]+matrix[13],
                matrix[2]*v[0]+matrix[6]*v[1]+matrix[10]*v[2]+matrix[14]];
     if(!xyz.every(Number.isFinite))throw Error('Non-finite model vertex');
     points.push(...xyz);colors.push(base[0],base[1],base[2],isJersey?1:0);
     if(normal){
      const n=normal(j);
      // Inverse-transpose of the node transform, preserving Blender smooth vertex normals.
      const a=matrix[0],b=matrix[4],c=matrix[8],d=matrix[1],e=matrix[5],f=matrix[9],g=matrix[2],h=matrix[6],k=matrix[10];
      const nx=(e*k-f*h)*n[0]+(f*g-d*k)*n[1]+(d*h-e*g)*n[2];
      const ny=(c*h-b*k)*n[0]+(a*k-c*g)*n[1]+(b*g-a*h)*n[2];
      const nz=(b*f-c*e)*n[0]+(c*d-a*f)*n[1]+(a*e-b*d)*n[2];
      const length=Math.hypot(nx,ny,nz)||1;
      normals.push(nx/length,ny/length,nz/length);
     }else normals.push(0,0,0);
    }
   }
  }
  for(const child of node.children||[])walk(child,matrix);
 }
 const scene=json.scenes?.[json.scene||0]||{nodes:json.nodes.map((_,i)=>i)};
 for(const node of scene.nodes||[])walk(node,identity);
 if(!points.length)throw Error('GLB contains no triangles');
 return {positions:new Float32Array(points),colors:new Float32Array(colors),normals:new Float32Array(normals),triangleCount:points.length/9};
}
export function appendGlbActor(mesh,asset,x,z,teamColor=[.25,.3,.35],scale=1){
 const p=asset.positions,c=asset.colors;
 for(let i=0;i<p.length;i+=3){
  mesh.p.push(x+p[i]*scale,p[i+1]*scale,z+p[i+2]*scale);
  const k=i/3*4;
  const isUniform=c[k+3]>.5;
  if(isUniform)mesh.c.push(teamColor[0]*.85,teamColor[1]*.85,teamColor[2]*.85);
  else mesh.c.push(c[k],c[k+1],c[k+2]);
 }
}
