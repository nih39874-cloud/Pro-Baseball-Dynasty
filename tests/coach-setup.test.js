import test from 'node:test';
import assert from 'node:assert/strict';
import {FIELDING_POSITIONS,validateCoachSelection,cooldownRemainingSeconds,renderCoachSetup} from '../src/ui/coach-setup.js';
const players=Array.from({length:11},(_,i)=>({master_player_id:i+1,roster_status:i===10?'reserve':'active',players_master:{full_name:`球員${i+1}`,primary_position:i===9?'P':'C'}}));
const defense=Object.fromEntries(FIELDING_POSITIONS.map((s,i)=>[s,s==='P'?10:i]));
const batting=[1,2,3,4,5,6,7,8,9];
test('valid DH lineup has nine distinct batters plus a non-batting pitcher',()=>assert.equal(validateCoachSelection(batting,defense,players),null));
test('duplicate bats rejected',()=>assert.match(validateCoachSelection([1,1,...batting.slice(2)],defense,players),/不重複/));
test('demoted batter rejected',()=>assert.match(validateCoachSelection([...batting.slice(0,8),11],defense,players),/一軍/));
test('pitcher batting rejected',()=>assert.match(validateCoachSelection([1,2,3,4,5,6,7,8,10],defense,players),/投手/));
test('missing fielding position rejected',()=>assert.match(validateCoachSelection(batting,{C:1},players),/九個/));
test('4h wall-clock cooldown is positive immediately and zero at expiry',()=>{
 const t=Date.parse('2026-11-09T08:00:00Z');assert.equal(cooldownRemainingSeconds('2026-11-09T12:00:00Z',t),14400);assert.equal(cooldownRemainingSeconds('2026-11-09T12:00:00Z',t+14400000),0);
});
test('five opponent selectors can be rendered without markup injection',()=>{
 const teams=Array.from({length:6},(_,i)=>({id:`t${i}`,name:`球隊${i}`}));
 const html=renderCoachSetup({teamId:'t0',opponentId:'t1',teams,players,lineups:[]});
 assert.equal((html.match(/data-coach-opponent=/g)||[]).length,5);
 assert.equal((html.match(/data-coach-bat=/g)||[]).length,9);
 assert.equal((html.match(/data-coach-position=/g)||[]).length,9);
});
