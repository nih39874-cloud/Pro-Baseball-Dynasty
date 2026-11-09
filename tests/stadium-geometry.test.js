import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStatic} from '../src/graphics/scene.js';

test('stadium includes detailed static 3D geometry without invalid coordinates',()=>{
 const stadium=buildStatic();
 assert(stadium.p.length>100000,'Expect full 3D stadium seating, architecture, and field');
 assert.equal(stadium.p.length,stadium.c.length);
 assert.equal(stadium.p.length%9,0);
 assert(stadium.p.every(Number.isFinite));
 assert(stadium.c.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
 const ys=stadium.p.filter((_,i)=>i%3===1);
 assert(Math.max(...ys.slice(0,10000))>=0);
 assert(ys.some(y=>y>28),'Floodlights and higher levels must have geometry');
});
