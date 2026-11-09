import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGlbGeometry,appendGlbActor} from '../src/graphics/glb-geometry.js';
import {MeshBuffer} from '../src/graphics/mesh.js';

test('import Blender-compatible GLB triangle data and place actor in field',()=>{
 const json={
  asset:{version:'2.0'},scenes:[{nodes:[0]}],scene:0,
  nodes:[{mesh:0,translation:[1,0,0]}],
  meshes:[{primitives:[{attributes:{POSITION:0},indices:1,material:0}]}],
  materials:[{name:'jersey_fabric',pbrMetallicRoughness:{baseColorFactor:[.2,.3,.5,1]}}],
  accessors:[
   {bufferView:0,componentType:5126,type:'VEC3',count:3},
   {bufferView:1,componentType:5123,type:'SCALAR',count:3}],
  bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:6}],
  buffers:[{byteLength:44}]
 };
 const bin=new ArrayBuffer(44),d=new DataView(bin);
 [0,0,0,1,0,0,0,1,0].forEach((v,i)=>d.setFloat32(i*4,v,true));
 [0,1,2].forEach((v,i)=>d.setUint16(36+i*2,v,true));
 const raw=new TextEncoder().encode(JSON.stringify(json));
 const jsonBytes=Math.ceil(raw.length/4)*4;
 const size=12+8+jsonBytes+8+bin.byteLength;
 const glb=new ArrayBuffer(size),g=new DataView(glb);
 g.setUint32(0,0x46546c67,true);g.setUint32(4,2,true);g.setUint32(8,size,true);
 g.setUint32(12,jsonBytes,true);g.setUint32(16,0x4e4f534a,true);
 const bytes=new Uint8Array(glb,20,jsonBytes);bytes.fill(32);bytes.set(raw);
 const at=20+jsonBytes;g.setUint32(at,bin.byteLength,true);g.setUint32(at+4,0x004e4942,true);
 new Uint8Array(glb,at+8).set(new Uint8Array(bin));
 const model=parseGlbGeometry(glb);
 assert.equal(model.triangleCount,1);
 assert.deepEqual(Array.from(model.positions),[1,0,0,2,0,0,1,1,0]);
 const mesh=new MeshBuffer();
 appendGlbActor(mesh,model,20,-30,[.9,.2,.1],1);
 assert.equal(mesh.p.length,9);
 assert.equal(mesh.c.length,9);
 assert.equal(mesh.p[0],21);
 assert.equal(mesh.p[2],-30);
 assert(mesh.c[0]>.7);
});
