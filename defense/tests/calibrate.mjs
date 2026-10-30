// Fits the horde's strength to a calendar. A dedicated simulated Commander (tests/commander.mjs: 60 battles a day, Rift
// Seals refilling in real time, the daily login, bounty, quests and free pack, packs bought with earned shards, a third
// of the gold on the Works, the side modes, the squad upgraded) lives through the weeks on schedule: by the end of day d it has
// cleared the stages SCHEDULE says, and spends the rest of each day farming with its Seals. Each time it first reaches a
// stage, the biggest horde multiplier its squad still beats solidly (90% destroyed, auto-play) is measured; the stage's
// target is SHARE of that. The targets split into a smooth rising CURVE (every wave stronger than the last) and a
// per-stage TERRAIN factor: each map's own difficulty (the same for any squad) in full, the rest of a stage's quirk only
// a little (another roster finds other stages hard). Writes defense/src/data/curve.js and the raw margins to
// tests/margins.json, so the fit can be redone from them without the battles:
//   node defense/tests/calibrate.mjs [share=0.9] [--refit]
import { writeFileSync, readFileSync } from 'fs';
import { Commander, LEVELS } from './commander.mjs';
import { startStage } from '../src/meta/progress.js';
import { STEP } from '../src/battle/sim.js';
import { autoBattle } from '../src/battle/autoplay.js';
import { TUNE } from '../src/data/waves.js';
import { upgradeCharacters } from '../src/meta/autopilot.js';
import { stageMapRef } from '../src/data/maps.js';
import { clamp } from '../src/core/util.js';

const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--')), REFIT = process.argv.includes('--refit');
const SHARE = +(ARGS[0] || 0.9), MFILE = new URL('./margins.json', import.meta.url);
// [day, stages cleared by the end of it]: a long, quick run at first (Act I in under a week, Act II in two), then
// slower and slower; the Demon Lord after about four months
export const SCHEDULE = [[1, 40], [3, 70], [7, 100], [14, 130], [28, 165], [42, 195], [56, 225], [70, 250], [90, 275], [120, 300]];
export const targetFrontier = (d) => {
  for (let i = 1; i < SCHEDULE.length; i++) { const [d0, f0] = SCHEDULE[i - 1], [d1, f1] = SCHEDULE[i]; if (d <= d1) return Math.round(f0 + (f1 - f0) * Math.max(0, d - d0) / (d1 - d0)); }
  return 300;
};
if (process.argv[1] && process.argv[1].endsWith('calibrate.mjs')) {
  const c = new Commander('dedicated', 'calibrate');
  const margin = (n) => {
    let logSum = 0, k = 0;   // two seeds, their geometric mean: one battle near the margin is a coin toss
    for (const seed of ['a', 'b']) {
      let lo = 0.05, hi = 2000;
      for (let it = 0; it < 9; it++) {
        const mid = Math.sqrt(lo * hi);
        TUNE.flat = mid; TUNE.terrain = 1;
        const b = startStage(c.save, n, { seed: 'cal:' + seed + n, noSeal: true });
        let steps = 0;
        while (!b.done && steps < 60 * 60 * 40) { autoBattle(b, STEP * 2); b.step(STEP * 2); b.events.length = 0; steps++; }
        if (b.won && b.pct >= 0.9) lo = mid; else hi = mid;
      }
      logSum += Math.log(lo); k++;
    }
    TUNE.flat = 0; TUNE.terrain = 0;
    return Math.exp(logSum / k);
  };
  let M = [];
  const t0 = Date.now();
  if (REFIT) M = JSON.parse(readFileSync(MFILE, 'utf8'));
  else while (c.save.frontier <= LEVELS.length && c.day < 130) {
    c.morning();
    const target = targetFrontier(c.day);
    while (c.save.frontier <= Math.min(target, LEVELS.length)) {
      const n = c.save.frontier;
      upgradeCharacters(c.save);
      M[n] = margin(n);
      c.fakeWin(n);
    }
    while (!c.dayOver() && c.seals > 0) { c.fakeWin(Math.max(1, c.save.frontier - 1)); upgradeCharacters(c.save); }
    if (c.day % 7 === 0) console.log(`day ${c.day}: frontier ${c.save.frontier}, levels ${c.save.squad.map((id) => c.save.cards['h:' + id].lvl + '/' + c.save.cards['h:' + id].stars + '*').join(',')}, essence ${c.save.essence}, gold ${Math.round(c.save.gold / 1000)}k, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  if (!REFIT) writeFileSync(MFILE, JSON.stringify(M.map((v) => (v == null ? null : +v.toFixed(4)))));
  // each stage's target, easier for the first few, building to each region's boss
  // (the first six a fresh squad wins outright, then a long easy run that firms up by stage 50: the quick start)
  const tutorial = (n) => [0.5, 0.6, 0.7, 0.75, 0.75, 0.75][n - 1] ?? Math.min(1, 0.75 + 0.25 * (n - 6) / 44);
  const saw = (n) => (0.95 + 0.1 * ((n - 1) % 10) / 9) * (n % 10 === 0 ? 0.88 : n % 5 === 0 ? 0.94 : 1);
  const T = LEVELS.map((L) => M[L.n] * SHARE * saw(L.n) * tutorial(L.n));
  // a smooth, always rising curve: a 9-stage weighted geometric average, then at least +0.6% a stage
  const smooth = (A) => {
    const lg = A.map(Math.log), out = lg.map((_, i) => { let s = 0, w = 0; for (let k = -4; k <= 4; k++) { const j = Math.min(A.length - 1, Math.max(0, i + k)), wk = 5 - Math.abs(k); s += lg[j] * wk; w += wk; } return Math.exp(s / w); });
    for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] * 1.006);
    return out;
  };
  // a map's own difficulty, from every stage fought on it (geometric mean), is the same for any squad: it applies in
  // full, and the curve is smoothed without it; what is left of a stage's quirk is mostly this squad's, so a little
  const mapOf = (i) => stageMapRef(i + 1).map, logs = {};
  let sm = smooth(T);
  T.forEach((v, i) => (logs[mapOf(i)] ||= []).push(Math.log(clamp(v / sm[i], 0.25, 3))));
  const mapK = Object.fromEntries(Object.entries(logs).map(([m, a]) => [m, Math.exp(a.reduce((x, y) => x + y, 0) / a.length)]));
  sm = smooth(T.map((v, i) => v / mapK[mapOf(i)]));
  const end = sm[sm.length - 1] * 1.02;
  const terrain = T.map((v, i) => mapK[mapOf(i)] * Math.pow(clamp(v / sm[i] / mapK[mapOf(i)], 0.4, 2), 0.35) * 0.96);
  console.log('map factors', Object.entries(mapK).sort((a, b) => a[1] - b[1]).map(([m, k]) => m + ':' + k.toFixed(2)).join(' '));
  writeFileSync(new URL('../src/data/curve.js', import.meta.url),
    `// Generated by defense/tests/calibrate.mjs (share ${SHARE}, the calendar in its SCHEDULE): CURVE is the horde's health\n` +
    `// multiplier at the first wave of each of the 300 stages (waves.js eases between them, so every wave is a little stronger\n` +
    `// than the last); TERRAIN evens out how easy each stage's map is.\n` +
    `export const CURVE = [${sm.map((v) => v.toFixed(3)).join(', ')}, ${end.toFixed(3)}];\n` +
    `export const TERRAIN = [${terrain.map((v) => v.toFixed(3)).join(', ')}];\n`);
  const row = (a, f) => a.map((v, i) => (i % 20 === 0 ? '\n' + String(i + 1).padStart(3) + ': ' : '') + f(v)).join(' ');
  console.log('margin', row(M.slice(1), (v) => v.toFixed(0)));
  console.log('curve', row(sm, (v) => v.toFixed(1)));
  console.log('done in', REFIT ? 'a refit,' : c.day + ' days,', ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
