import test from 'node:test';import assert from 'node:assert/strict';
import {drawAvatar,generateAvatarProfile,validateAvatarProfile,hashName} from '../src/graphics/avatar.js';
import {MeshBuffer} from '../src/graphics/mesh.js';
test('Procedural profile deterministic and bounded',()=>{const a=generateAvatarProfile('cpbl:0000000743','L','L'),b=generateAvatarProfile('cpbl:0000000743','L','L');assert.deepEqual(a,b);assert(a.height_scale>=.94&&a.height_scale<=1.07);assert.equal(a.face_provenance,'procedural_unverified');assert.equal(a.handedness,'L');});
test('Invalid profile is rejected',()=>{assert.equal(validateAvatarProfile({...generateAvatarProfile('x'),head_width:6}),null)});
test('Avatar generated non-empty 3D mesh with matching positions and colors',()=>{const b=new MeshBuffer();drawAvatar(b,[0,-20],{id:'cpbl:0000000743',color:'#e2b544',role:'pitcher',phase:'pitching',now:1000});assert(b.p.length>6000);assert.equal(b.p.length,b.c.length);assert.equal(b.p.length%9,0);assert(b.p.every(v=>Number.isFinite(v)));assert(b.c.every(v=>Number.isFinite(v)&&v>=0&&v<=1));});
test('Two athletes use distinct procedural proportions',()=>{assert.notDeepEqual(generateAvatarProfile('player-a'),generateAvatarProfile('player-b'));assert.notEqual(hashName('a'),hashName('b'))});
