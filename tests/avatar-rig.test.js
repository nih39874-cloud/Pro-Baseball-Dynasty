import test from 'node:test';
import assert from 'node:assert/strict';
import {MeshBuffer} from '../src/graphics/mesh.js';
import {drawAvatar,generateAvatarProfile,validateAvatarProfile} from '../src/graphics/avatar.js';
test('individual player profiles produce distinct 3D geometry',()=>{
 const a=generateAvatarProfile('player-a'),b=generateAvatarProfile('player-b');
 assert.notDeepEqual(a,b);
 const ma=new MeshBuffer(),mb=new MeshBuffer();
 drawAvatar(ma,[0,0],{id:'player-a',profile:a,color:'#e2b544',role:'batter',now:0});
 drawAvatar(mb,[0,0],{id:'player-b',profile:b,color:'#e2b544',role:'batter',now:0});
 assert(ma.p.length>10000);
 assert.equal(ma.p.length,ma.c.length);
 assert.notDeepEqual(ma.p.slice(0,500),mb.p.slice(0,500));
});
test('catcher gear, batting equipment, and pose produce separate meshes',()=>{
 const basic=new MeshBuffer(),catcher=new MeshBuffer(),batter=new MeshBuffer();
 drawAvatar(basic,[0,0],{id:'athlete',role:'fielder',now:0});
 drawAvatar(catcher,[0,0],{id:'athlete',role:'fielder',positionKey:'C',now:0});
 drawAvatar(batter,[0,0],{id:'athlete',role:'batter',phase:'pitching',now:300});
 assert(catcher.p.length>basic.p.length);
 assert(batter.p.length>basic.p.length);
 assert.equal(catcher.p.length,catcher.c.length);
});
test('invalid morphology falls back safely',()=>{
 assert.equal(validateAvatarProfile({height_scale:99}),null);
 const mesh=new MeshBuffer();
 drawAvatar(mesh,[1,-20],{id:'unknown',profile:{height_scale:99},color:'#123456'});
 assert(mesh.p.every(Number.isFinite));
});
