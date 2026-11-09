import test from 'node:test';
import assert from 'node:assert/strict';
import {MeshBuffer} from '../src/graphics/mesh.js';
import {drawAvatar,generateAvatarProfile} from '../src/graphics/avatar.js';

test('athletes use adult body morphology instead of oversized chibi heads',()=>{
 const body=new MeshBuffer();
 drawAvatar(body,[0,0],{id:'cpbl:model-check',role:'fielder',now:0,profile:generateAvatarProfile('cpbl:model-check')});
 assert(body.p.length>30000,'Detailed 3D body mesh expected');
 assert.equal(body.p.length,body.c.length);
 assert(body.p.every(Number.isFinite));
 const h=body.p.filter((_,i)=>i%3===1);
 assert(Math.max(...h)>1.85,'Adult model should be standing height');
 assert(Math.max(...h)<2.15,'Proportions must not create oversized headgear');
});
