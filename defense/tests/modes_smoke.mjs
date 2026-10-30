// Every side mode builds and plays out headless with auto-battle; prints waves held and the payout.
import './node_env.mjs';
import { freshSave } from '../src/state.js';
import { MODES, startMode, finishMode, entriesLeft } from '../src/meta/modes.js';
import { pickSquad, upgradeCharacters } from '../src/meta/autopilot.js';
import { autoBattle } from '../src/battle/autoplay.js';
import { STEP } from '../src/battle/sim.js';
import { Commander } from './commander.mjs';
// a dedicated Commander lives N days of the campaign first, then tries every mode once
const days = +(process.argv[2] || 3), C = new Commander('dedicated', 'modes');
for (let d = 0; d < days; d++) { C.morning(); C.playDay(); }
const s = C.save; s.seals.n = 40; s.seals.t = Date.now();
console.log('day', days, 'frontier', s.frontier);
for (const m of MODES) {
  const r = startMode(s, m.id); if (!r) { console.log(m.id, 'no entries'); continue; }
  const { b } = r;
  let t = 0; while (!b.done && t < 60 * 60) { autoBattle(b, STEP); b.step(STEP); t += STEP; if (b.events.length > 500) b.events.length = 0; }
  if (!b.done) b.finish(false);
  const out = finishMode(s, m, b);
  console.log(m.id.padEnd(11), 'ref', r.n, b.won ? 'WON ' : 'lost', 'held', out.held, 'muts', b.mutations, JSON.stringify({ g: out.gold, s: out.shards, e: out.essence, t: out.tickets, L: out.legend, tr: out.trophies.length }), 'left', entriesLeft(s, m.id));
}
