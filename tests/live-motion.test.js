import test from 'node:test';
import assert from 'node:assert/strict';
import {motionFromPointer,motionRoleFromGame} from '../src/ui/live-motion.js';
import {renderMotionPanel} from '../src/ui/live-motion-panel.js';
const game={phase:'live',home_team_id:'brothers',away_team_id:'dragons'};
const controls=[{team_id:'brothers',active_mode:'player'},{team_id:'dragons',active_mode:'player'}];
test('joystick center and diagonal are bounded',()=>{
 assert.deepEqual(motionFromPointer(50,50,{left:0,top:0,width:100,height:100}),{dx:0,dz:0});
 const v=motionFromPointer(200,200,{left:0,top:0,width:100,height:100});
 assert.ok(Math.hypot(v.dx,v.dz)<=1.002);
});
test('role changes with batting half and requires player control',()=>{
 const data={game,session:{state:{half:'top'}},controls};
 assert.equal(motionRoleFromGame(data,'dragons'),'runner');
 assert.equal(motionRoleFromGame(data,'brothers'),'fielder');
 assert.equal(motionRoleFromGame(data,'rakuten'),null);
 assert.equal(motionRoleFromGame({...data,controls:[]},'dragons'),null);
 data.session.state.half='bottom';
 assert.equal(motionRoleFromGame(data,'dragons'),'fielder');
});
test('MOBA touch controls expose fielder and runner actions',()=>{
 const field=renderMotionPanel({batting:false,fieldPos:'SS'});
 assert.match(field,/data-live-motion-pad/);
 assert.match(field,/data-live-motion="dive"/);
 assert.match(field,/data-live-motion="throw"/);
 assert.match(field,/option value="SS" selected/);
 const runner=renderMotionPanel({batting:true});
 assert.match(runner,/data-live-motion="slide"/);
 assert.match(runner,/data-live-motion="return"/);
 assert.doesNotMatch(runner,/liveFieldPosition/);
});
