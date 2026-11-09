import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const d=JSON.parse(readFileSync(new URL('../assets/player-avatar-catalog.json',import.meta.url),'utf8'));
assert(d.players.length>=548,'Expected all initial 2024 + 2025/2026 athletes');
assert.equal(new Set(d.players.map(x=>x.id)).size,d.players.length,'Duplicate model keys');
assert(d.players.every(p=>p.model_status==='procedural_unverified'),'No unlicensed real likeness claims');
assert(d.players.every(p=>p.profile && p.profile.height_scale>.7 && p.profile.head_width>.7));
console.log('Avatar profiles verified:',d.players.length);
