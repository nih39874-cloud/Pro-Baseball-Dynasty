import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {parseGlbGeometry,appendGlbActor} from '../src/graphics/glb-geometry.js';
import {MeshBuffer} from '../src/graphics/mesh.js';

const assets=[
 ['player','assets/models/player_base.glb'],
 ['stadium','assets/models/stadium_base.glb']
];

for(const [name,path] of assets){
 test(`Blender-exported ${name} GLB parses into game triangles`,()=>{
  assert(existsSync(path),`Required Blender asset missing: ${path}`);
  const bytes=readFileSync(path);
  const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const model=parseGlbGeometry(buffer);
  assert(model.triangleCount>100,`Expected >100 triangles for ${name}`);
  assert.equal(model.positions.length%9,0);
  assert(model.positions.every(Number.isFinite),`Invalid vertex in ${name}`);
  assert(model.colors.every(Number.isFinite),`Invalid material in ${name}`);
  const mesh=new MeshBuffer();
  appendGlbActor(mesh,model,0,0,[.3,.5,.7],1);
  assert.equal(mesh.p.length,mesh.c.length);
  const ys=[];
  for(let i=1;i<mesh.p.length;i+=3)ys.push(mesh.p[i]);
  assert(Math.max(...ys.slice(0,Math.min(ys.length,8000)))>=0);
 });
}
