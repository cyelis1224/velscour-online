// Replay stages with a dumped Commander save (balance.mjs DUMP_AT=day): wins, % destroyed, what leaks on which road.
//   node defense/tests/diag_save.mjs out/save_casual_80.json 276,277,278 [tries=4]
import './node_env.mjs';
import { readFileSync } from 'fs';
import { startStage } from '../src/meta/progress.js';
import { STEP } from '../src/battle/sim.js';
import { autoBattle } from '../src/battle/autoplay.js';
import { unitDef } from '../src/meta/power.js';
import { stageMapRef, MAPS } from '../src/data/maps.js';
const save = JSON.parse(readFileSync(new URL(process.argv[2], import.meta.url))), ns = process.argv[3].split(',').map(Number), tries = +(process.argv[4] || 4);
console.log('frontier', save.frontier, 'squad', save.squad.slice(0, 12).map((id) => `${id}:${unitDef(id, save).cls}`).join(' '));
for (const n of ns) for (let k = 0; k < tries; k++) {
  save.progress[n] = { ...(save.progress[n] || {}), losses: 0 };
  const b = startStage(save, n, { noSeal: true, seed: 'diag:' + n + ':' + k }), leaks = {};
  const ev = b.ev.bind(b); b.ev = (e) => { if (e.type === 'leak') { const key = e.m.role + (e.m.air ? '(air)' : '') + '@' + b.map.routes.indexOf(e.m.route); leaks[key] = (leaks[key] || 0) + e.d; } ev(e); };
  let st = 0; while (!b.done && st < 60 * 60 * 40) { autoBattle(b, STEP * 2); b.step(STEP * 2); b.events.length = 0; st++; }
  const r = stageMapRef(n);
  console.log(n, MAPS[r.map].name, r.tf, b.won ? 'WON ' : 'LOST', 'pct', (b.pct * 100).toFixed(0), 'wave', b.waveI + '/' + b.waves.length, 'heart', b.heart + '/' + b.heartMax, 'units', b.units.length, 'leaks', JSON.stringify(leaks));
}
