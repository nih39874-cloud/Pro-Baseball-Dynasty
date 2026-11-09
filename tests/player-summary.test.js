import test from 'node:test';import assert from 'node:assert/strict';
import {pitchingOuts,summarizeBaseballStats,faDisplayInfo,renderRosterRow,formatFaRegisteredService} from '../src/ui/player-summary.js';
test('Baseball IP 24.1 = 73 outs; rejects invalid thirds',()=>{assert.equal(pitchingOuts(24.1),73);assert.equal(pitchingOuts('0.2'),2);assert.throws(()=>pitchingOuts('4.3'))});
test('2024 hitting slash statistics and aggregate across clubs',()=>{const s=summarizeBaseballStats([{league_level:'first',batting:{PA:100,AB:80,H:20,BB:12,HBP:2,SF:6,TB:34}},{league_level:'first',batting:{PA:100,AB:80,H:24,BB:12,HBP:2,SF:6,TB:36}}]);assert.equal(s.first.AVG,44/160);assert(s.first.OPS>.7)});
test('Pitching ERA uses outs, not decimal baseball IP',()=>{const s=summarizeBaseballStats([{league_level:'first',pitching:{IP:10.2,ER:4,SO:11}}]);assert.equal(s.first.IPOuts,32);assert.equal(s.first.ERA,3.375)});
test('2024 end reported FA differs from 2024 opening estimated FA',()=>{const s=faDisplayInfo({fa_2024_service_reported:'11.004',fa_service_initial_estimate:'10.004',fa_initial_eligible_reported:true});assert.match(s.label,/2024年末/);assert.match(s.detail,/2024開季/)});
test('Roster display escapes names and disclaims unverified face',()=>{const html=renderRosterRow({master_player_id:12,players_master:{full_name:'<script>alert(1)</script>'},fa_usage_min_seasons:2,salary_verified:false,reference_stats:[]});assert(!html.includes('<script>'));assert.match(html,/未核實真人相似度/)});

test('CPBL FA 8.051 is eight seasons and 51 days, not 8.051 years',()=>{assert.equal(formatFaRegisteredService('8.051'),'8 季＋51 登錄日');assert.equal(formatFaRegisteredService('11.004'),'11 季＋4 登錄日')});
