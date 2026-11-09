import test from 'node:test';
import assert from 'node:assert/strict';
import {renderLivePanel,safe} from '../src/ui/live-view.js';
test('user-provided text is escaped',()=>assert.equal(safe('<script>'), '&lt;script&gt;'));
test('match cards render safely and never allow early manual entry',()=>{
 const t=renderLivePanel({games:[{id:'aaaa',home_team_id:'brothers',away_team_id:'TSG',scheduled_at:'2099-11-10T00:00:00Z',phase:'scheduled'}]});
 assert.match(t,/data-live-select/);assert.doesNotMatch(t,/data-live-join/);
});
test('coach control shows tactical actions and reserves',()=>{
 const g={id:'123',home_team_id:'brothers',away_team_id:'rakuten',home_score:1,away_score:2,phase:'live'};
 const panel=renderLivePanel({selection:'123',teamId:'brothers',gameData:{game:g,session:{state:{inning:3,half:'top',outs:1,home_score:1,away_score:2,bases:[null,null,null],home_lineup:{batting_order:[1,2,3,4,5,6,7,8,9],defense:{P:14}}}},controls:[{team_id:'brothers',active_mode:'coach'}],events:[]},players:[{master_player_id:21,roster_status:'active',players_master:{primary_position:'P',full_name:'新投手'}},{master_player_id:20,roster_status:'active',players_master:{primary_position:'OF',full_name:'代打'}}]});
 assert.match(panel,/data-live-cmd="change_pitcher"/);assert.match(panel,/data-live-cmd="pinch_hitter"/);assert.match(panel,/新投手/);assert.match(panel,/本隊控制/);
});
