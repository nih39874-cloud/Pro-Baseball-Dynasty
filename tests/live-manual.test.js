import test from 'node:test';
import assert from 'node:assert/strict';
import {renderLivePanel,renderAimPad,renderAbsAnimation} from '../src/ui/live-view.js';
const game={id:'g',phase:'live',home_team_id:'brothers',away_team_id:'dragons',home_score:0,away_score:0};
const state={half:'top',inning:1,outs:0,bases:[null,null,null]};
const controls=[{team_id:'dragons',active_mode:'player',abs_remaining:2},{team_id:'brothers',active_mode:'player',abs_remaining:2}];
test('manual batter sees a catcher-facing aim with dashed bat and player-mode button',()=>{
 const html=renderLivePanel({games:[game],selection:'g',gameData:{game,session:{state},controls,pitch_state:{pending_pitch:{x:.1,y:.2,pitch_type:'slider'},balls:1,strikes:2}},teamId:'dragons',aim:{x:.4,y:-.2}});
 assert.match(html,/data-live-mode="player"/);
 assert.match(html,/data-live-bat="swing"/);
 assert.match(html,/live-virtual-bat/);
 assert.match(html,/B 1 ／ S 2/);
});
test('manual pitcher sees pitch accuracy bar and pitch type',()=>{
 const html=renderLivePanel({games:[game],gameData:{game,session:{state},controls,pitch_state:{balls:0,strikes:0}},teamId:'brothers',meterRunning:true});
 assert.match(html,/data-live-pitch="1"/);
 assert.match(html,/四縫線/);
 assert.match(html,/running/);
});
test('ABS diagram escapes dangerous text and clamps coordinates',()=>{
 const html=renderAbsAnimation({type:'ABS',overturned:true,corrected_call:'strike',pitch_x:999,pitch_y:-999});
 assert.match(html,/挑戰成功/);
 assert.match(html,/left:100%/);
 assert.match(html,/top:100%/);
});
test('aim pad is one continuous region not a nine-box selector',()=>{
 const html=renderAimPad({x:1,y:-1,batting:true});
 assert.equal((html.match(/data-live-pad/g)||[]).length,1);
 assert.doesNotMatch(html,/九宮格|data-cell/);
});