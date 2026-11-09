import test from 'node:test';
import assert from 'node:assert/strict';
import {ballLanding,runnerAnimation,battedBallFrame,LiveReplay,makeLiveSceneState} from '../src/graphics/live-replay.js';
test('spray direction is signed and coordinates remain in baseball fair territory',()=>{
 const l=ballLanding(-30,90),r=ballLanding(30,90);
 assert.ok(l[0]<0&&r[0]>0&&l[1]<0&&r[1]<0);
 assert.equal(ballLanding(0,90)[0],0);
});
test('hit animation maps the correct defense to a moving fielder',()=>{
 const f=battedBallFrame({field_position:'LF',spray_degrees:-22,ball_distance_m:87,result:'2B'},1400);
 assert.ok(f.ball?.y>0);
 assert.ok(f.fielders.LF?.[0]<-10);
 assert.equal(f.phase,'fielding');
 assert.ok(Array.isArray(f.runners));
});
test('runner rounds bases for double and returns home for homer',()=>{
 assert.deepEqual(runnerAnimation('2B',.5),[23,-23]);
 assert.deepEqual(runnerAnimation('HR',1),[0,0]);
});
test('pitch animation does not use unresolved server pitch coordinates',()=>{
 const d={game:{id:'game',away_team_id:'dragons',home_team_id:'brothers'},session:{state:{half:'top'}},events:[{seq:1,type:'pitch_released',payload:{x:999,y:999}}],pitch_state:{pending_pitch:{x:999,y:999}}};
 const rep=new LiveReplay();rep.ingest(d,500);
 const scene=rep.scene('dragons',800);
 assert.equal(scene.ball.x,0);
 assert.ok(scene.ball.z<0&&scene.ball.z>-18.1);
});
test('spectator is AI camera until explicit player or coach control',()=>{
 const data={game:{id:'g',home_team_id:'brothers',away_team_id:'dragons'},session:{state:{half:'top',inning:3,bases:[1,0,0]}},controls:[]};
 assert.equal(makeLiveSceneState(data,'dragons').mode,'auto');
 data.controls=[{team_id:'dragons',active_mode:'player'}];
 assert.equal(makeLiveSceneState(data,'dragons').mode,'field');
});
test('server event sequence is idempotent across repeated polls and resets on new game',()=>{
 const d={game:{id:'g'},events:[{seq:12,type:'live_plate_appearance',payload:{field_position:'CF',ball_distance_m:90,spray_degrees:0}}]};
 const rep=new LiveReplay();rep.ingest(d,100);rep.ingest(d,900);assert.equal(rep.startedAt,100);
 rep.replay(950);assert.equal(rep.startedAt,950);
 rep.ingest({...d,game:{id:'g2'}},1300);assert.equal(rep.startedAt,1300);
});
test('acknowledged fielding intent gives cosmetic movement only to controlled player',()=>{
 const game={id:'g',phase:'live',home_team_id:'brothers',away_team_id:'dragons'};
 const data={game,session:{state:{inning:1,half:'top',away_index:0}},controls:[{team_id:'brothers',active_mode:'player'}],own_motion:{role:'fielder',selected_position:'SS',direction_x:-1,direction_z:0,atbat_key:'1:top:0'}};
 assert.deepEqual(makeLiveSceneState(data,'brothers').liveFielders.SS,[-17,-30]);
 assert.deepEqual(makeLiveSceneState({...data,controls:[]},'brothers').liveFielders,{});
 assert.deepEqual(makeLiveSceneState({...data,own_motion:{...data.own_motion,atbat_key:'1:top:1'}},'brothers').liveFielders,{});
});
