// The calendar, checked with real battles: a simulated Commander (tests/commander.mjs) of each profile plays every
// battle of every day on auto (Rift Seals by the clock, the login, bounty, quests, free pack, the side modes, packs
// bought with what it earns, the Works, the squad upgraded), and the frontier is printed against the calendar
// calibrate.mjs fitted. It must not be beaten in a day, take weeks upon weeks, and go a long way before it stalls.
//   node defense/tests/balance.mjs [profiles=casual,dedicated,grinder] [days=120]   (DUMP_AT=day saves that day's save to out/)
import { writeFileSync } from 'fs';
import { Commander, LEVELS } from './commander.mjs';
import { SCHEDULE, targetFrontier } from './calibrate.mjs';

const profiles = (process.argv[2] || 'casual,dedicated,grinder').split(','), DAYS = +(process.argv[3] || 120);
const marks = [1, 2, 3, 5, 7, 10, 14, 21, 28, 35, 42, 56, 70, 84, 100, 120, 150].filter((d) => d <= DAYS);
const t0 = Date.now(), table = {};
for (const p of profiles) {
  const c = new Commander(p, 'balance:' + p), row = {}, stuck = [];
  let lastF = 1, flat = 0, wonAt = null;
  for (let d = 1; d <= DAYS && !wonAt; d++) {
    c.morning();
    c.playDay();
    const f = c.save.frontier;
    if (process.env.DUMP_AT && +process.env.DUMP_AT === d) writeFileSync(new URL(`out/save_${p}_${d}.json`, import.meta.url), JSON.stringify(c.save));
    if (f > LEVELS.length) wonAt = d;
    flat = f === lastF ? flat + 1 : 0; lastF = f;
    if (flat === 3) stuck.push(`stuck at ${f} from day ${d - 3}`);
    if (marks.includes(d) || wonAt) {
      const sq = c.save.squad.slice(0, 10).map((id) => c.save.cards['h:' + id]);
      row[d] = f;
      console.log(`${p.padEnd(9)} day ${String(d).padStart(3)}: frontier ${String(Math.min(f, 300)).padStart(3)} (calendar ${String(targetFrontier(d)).padStart(3)}) · ${c.battles} battles · lv ${Math.min(...sq.map((e) => e.lvl))}-${Math.max(...sq.map((e) => e.lvl))} ★${Math.min(...sq.map((e) => e.stars))}-${Math.max(...sq.map((e) => e.stars))} · ${Object.keys(c.save.cards).filter((k) => k.startsWith('x:')).length} trophies · essence ${c.save.essence} · gold ${Math.round(c.save.gold / 1000)}k · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }
  table[p] = { row, wonAt, stuck };
  console.log(`${p}: ${wonAt ? 'BEAT the Demon Lord on day ' + wonAt : 'not finished in ' + DAYS + ' days'}${stuck.length ? ' · ' + stuck.slice(0, 6).join('; ') : ''}`);
}
console.log('\nday   ' + profiles.map((p) => p.padStart(10)).join('') + '  calendar');
for (const d of marks) console.log(String(d).padStart(3) + '   ' + profiles.map((p) => String(table[p].row[d] ?? '-').padStart(10)).join('') + String(targetFrontier(d)).padStart(10));
console.log('schedule', JSON.stringify(SCHEDULE));
