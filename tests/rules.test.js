import test from 'node:test';import assert from 'node:assert/strict';
import {trueStrike,accuracyWindow,walkRunners,advanceRunners,addPitchCall,addOut} from '../src/core/rules.js';
import {createState} from '../src/core/state.js';
// Browser localStorage shim for state initialization
if(!globalThis.localStorage)globalThis.localStorage={getItem(){return null},setItem(){}};
test('ABS 判紅中好球與明顯壞球',()=>{assert.equal(trueStrike(0,.8),true);assert.equal(trueStrike(1.5,.8),false)});
test('邊角的完美跑條比紅中窄',()=>{assert.ok(accuracyWindow(.8,1.2)<accuracyWindow(0,.87))});
test('滿壘保送推進一分',()=>{assert.deepEqual(walkRunners([true,true,true]),{bases:[true,true,true],runs:1})});
test('安打壘包推進',()=>{assert.deepEqual(advanceRunners([true,false,true],1),{bases:[true,true,false],runs:1})});
test('打席三振出局正確重置',()=>{const s=createState();s.strikes=2;assert.equal(addPitchCall(s,true),'三振出局');assert.equal(s.outs,1);assert.equal(s.strikes,0)});
test('三出局換上下半局',()=>{const s=createState();s.outs=2;addOut(s);assert.equal(s.half,'bottom');assert.equal(s.outs,0)});
