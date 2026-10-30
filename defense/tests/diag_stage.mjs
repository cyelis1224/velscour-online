// Why can't stage n be won? A maxed squad against a very weak horde (TUNE.flat), what leaks and why.
import './node_env.mjs';
import { freshSave } from '../src/state.js';
import { CARDS, POOLS } from '../src/data/cards.js';
import { startStage } from '../src/meta/progress.js';
import { pickSquad } from '../src/meta/autopilot.js';
import { TUNE } from '../src/data/waves.js';
import { STEP } from '../src/battle/sim.js';
import { autoBattle } from '../src/battle/autoplay.js';
const ns = (process.argv[2] || '289').split(',').map(Number), flat = +(process.argv[3] || 0.05);
const s = freshSave();
for (const c of POOLS.hero) s.cards[c.id] = { n: 1, lvl: 90, stars: 5, equip: {} };
s.frontier = 300; pickSquad(s);
for (const n of ns) {
  TUNE.flat = flat; TUNE.terrain = 1;
  const b = startStage(s, n, { noSeal: true, seed: 'diag' + n }), leaks = {};
  b.ev = (e) => { if (e.type === 'leak') { const k = e.m.role + (e.m.air ? '(air)' : '') + '@' + b.map.routes.indexOf(e.m.route); leaks[k] = (leaks[k] || 0) + e.d; } };
  let st = 0; while (!b.done && st < 60 * 60 * 40) { autoBattle(b, STEP * 2); b.step(STEP * 2); st++; }
  console.log(n, b.won ? 'WON' : 'LOST', 'pct', (b.pct * 100).toFixed(0), 'heart', b.heart + '/' + b.heartMax, 'units', b.units.length, 'deployLimit', b.deployLimit, 'routes', b.map.routes.map((r) => r.len.toFixed(0)).join('/'), 'leaks', JSON.stringify(leaks), 't', b.t.toFixed(0));
}
