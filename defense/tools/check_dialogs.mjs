// Checks the campaign dialogs against the schedule (docs/STORY.md rules). No browser.
//   node defense/tools/check_dialogs.mjs [part 1-4 ...]     (all four parts by default)
import { readFileSync, existsSync } from 'fs';
import { CAST_BY_ID } from '../src/data/cast.js';

const sched = [...JSON.parse(readFileSync(new URL('../docs/dialog_schedule.json', import.meta.url), 'utf8')), ...JSON.parse(readFileSync(new URL('../docs/dialog_schedule2.json', import.meta.url), 'utf8'))];
const parts = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
// parts 1-4: stages 1-80 (20 each); 5-8: stages 81-200 (30 each)
const RANGE = { 1: [1, 20], 2: [21, 40], 3: [41, 60], 4: [61, 80], 5: [81, 110], 6: [111, 140], 7: [141, 170], 8: [171, 200], 9: [201, 225], 10: [226, 250], 11: [251, 275], 12: [276, 300] };
const MOODS = new Set(['angry', 'laugh', 'sad', 'shout', 'fear', 'smug', 'think']);
let bad = 0, total = 0;
const err = (m) => { bad++; if (bad < 60) console.log('  ' + m); };
for (const p of parts) {
  const file = new URL(`../src/data/dialogs/part${p}.js`, import.meta.url);
  if (!existsSync(file)) { err(`part${p}.js missing`); continue; }
  const list = (await import(file.href)).default;
  const [lo, hi] = RANGE[p], want = sched.filter((d) => d.level >= lo && d.level <= hi);
  const got = new Map(list.map((d) => [d.id, d]));
  if (got.size !== list.length) err(`part${p}: duplicate ids`);
  for (const s of want) {
    const d = got.get(s.id);
    if (!d) { err(`${s.id} missing`); continue; }
    total++;
    const L = d.lines || [];
    if (L.length < 2 || L.length > 5) err(`${s.id}: ${L.length} lines`);
    if (L[0]?.[0] !== s.lead) err(`${s.id}: lead ${s.lead} must speak first (got ${L[0]?.[0]})`);
    if (!L.some((l) => l[0] === s.with)) err(`${s.id}: ${s.with} never speaks`);
    const others = new Set(L.map((l) => l[0]).filter((x) => x !== s.lead && x !== s.with));
    if (others.size > 1 || [...others].some((o) => L.filter((l) => l[0] === o).length > 1)) err(`${s.id}: a third hero may add one line only`);
    for (const [who, text, mood] of L) {
      if (!CAST_BY_ID[who]) err(`${s.id}: unknown speaker ${who}`);
      if (typeof text !== 'string' || !text.trim()) err(`${s.id}: empty line`);
      else if (text.length > 180) err(`${s.id}: ${text.length} chars: ${text.slice(0, 50)}...`);
      if (mood !== undefined && !MOODS.has(mood)) err(`${s.id}: mood ${mood}`);
    }
  }
  for (const id of got.keys()) if (!want.some((s) => s.id === id)) err(`part${p}: ${id} is not in this part's schedule`);
}
console.log(`${total} dialogs checked, ${bad} problems`);
process.exitCode = bad ? 1 : 0;
