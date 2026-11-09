import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/core/state.js';
import {GameEngine} from '../src/core/engine.js';

function setup(){
 const state=createState();
 Object.assign(state,{mode:'field',team:'dragons',home:'dragons',visitor:'brothers',half:'top',phase:'ready'});
 const game=new GameEngine(state);
 game.ballInPlay(.72,{strong:false,bunt:false,aim:{x:0,y:0}});
 return {game,state};
}
test('manual defense always offers fielder selection and retains a visible baseball',()=>{
 const {state}=setup();
 assert.equal(state.phase,'fielderChoice');
 assert(state.fieldChoice.candidates.length>=1);
 assert.equal(state.ball.visible,true);
 assert(state.landing&&Number.isFinite(state.landing.x));
});
test('choosing fielder resumes flight and joystick commands move controlled athlete',()=>{
 const {game,state}=setup();
 const key=state.fieldChoice.candidates[0].key;
 game.chooseFielder(key);
 assert.equal(state.phase,'fielding');
 assert.equal(state.phaseTime,0);
 assert.equal(state.selectedFielder.key,key);
 const start=state.fielderPos.x;
 state.fieldMove={x:1,y:0};
 game.update(.05);
 assert(state.fielderPos.x>start,'Manual fielder should advance while joystick is held');
 assert(state.ball&&Number.isFinite(state.ball.x));
});
test('fielding timeout selects closest defender and resets the flight clock',()=>{
 const {game,state}=setup();
 game.update(.05);
 state.fieldChoice.timeLeft=0.01;
 game.update(.05);
 assert.equal(state.phase,'fielding');
 assert.equal(state.phaseTime,0);
 assert(state.fielderPos);
});
test('catching requires player near the live baseball',()=>{
 const {game,state}=setup();
 game.chooseFielder(state.fieldChoice.candidates[0].key);
 state.fielderPos={x:state.ball.x,z:state.ball.z};
 state.ball.y=1;
 game.catchBall();
 assert.equal(state.phase,'ready');
 assert.equal(state.ball,null);
});
