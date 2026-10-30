// Who leads (and who answers) each of the campaign's 320 dialogs: 80 stages x (2 at the beginning + 2 at the end).
// Every hero leads exactly 20: 2 per region, 4 in the two regions that feature them (campaign.js REGIONS.featured).
//   node defense/tools/dialog_schedule.mjs          prints the table (docs/STORY.md) and writes docs/dialog_schedule.json
import { writeFileSync } from 'fs';
import { CAST } from '../src/data/cast.js';
import { REGIONS, LEVELS } from '../src/data/campaign.js';

const AFF = { 'corwin|varric': 3, 'cassius|ismene': 3, 'halvard|kestrel': 3, 'kestrel|ysolde': 3, 'nkemi|wren': 3, 'maudlin|mortimer': 3,
  'brakka|gloop': 3, 'jasper|selene': 3, 'flint|selene': 2, 'flint|ismene': 2, 'corwin|halvard': 2, 'mortimer|varric': 1.5, 'brakka|wren': 1.5,
  'maudlin|wren': 1, 'brakka|ysolde': 1.5, 'cassius|nkemi': 2, 'gloop|mortimer': 1, 'corwin|jasper': 1.5, 'halvard|varric': 2, 'cassius|flint': 1,
  'maudlin|nkemi': 2, 'gloop|ysolde': 1, 'ismene|ysolde': 1.5, 'corwin|wren': 1, 'jasper|maudlin': 1, 'gloop|jasper': 1, 'kestrel|wren': 1 };
const aff = (a, b) => AFF[[a, b].sort().join('|')] || 0;

export function schedule() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const ids = CAST.map((c) => c.id), slots = [], pairUse = {}, partnerUse = Object.fromEntries(ids.map((i) => [i, 0]));
  REGIONS.filter((R) => R.act === 1).forEach((R, ri) => {
    const leads = ids.flatMap((id) => Array(R.featured.includes(id) ? 4 : 2).fill(id));
    // 10 stages x 4 slots, no hero leading twice in a stage: deal the most frequent first, to the emptiest stage
    const stages = Array.from({ length: 10 }, () => []);
    const order = [...new Set(leads)].sort((a, b) => leads.filter((x) => x === b).length - leads.filter((x) => x === a).length || rnd() - 0.5);
    for (const id of order) {
      const n = leads.filter((x) => x === id).length;
      const free = stages.map((s, i) => i).filter((i) => !stages[i].includes(id) && stages[i].length < 4);
      free.sort((a, b) => stages[a].length - stages[b].length || rnd() - 0.5);
      // spread a hero's dialogs through the region: take every k-th free stage
      const pickIdx = free.slice(0, n).sort((a, b) => a - b);
      for (const i of pickIdx) stages[i].push(id);
    }
    stages.forEach((st, k) => {
      st.sort(() => rnd() - 0.5);
      const L = LEVELS[ri * 10 + k];
      st.forEach((lead, j) => {
        let best = null, bs = -1e9;
        for (const p of ids) {
          if (p === lead) continue;
          const key = [lead, p].sort().join('|');
          const s = aff(lead, p) * 1.2 + (R.featured.includes(p) ? 1 : 0) - (pairUse[key] || 0) * 1.6 - partnerUse[p] * 0.08
            - (st.includes(p) ? 0.4 : 0) + rnd() * 0.9;
          if (s > bs) { bs = s; best = p; }
        }
        const key = [lead, best].sort().join('|');
        pairUse[key] = (pairUse[key] || 0) + 1; partnerUse[best]++;
        slots.push({ id: `L${String(L.n).padStart(2, '0')}${j < 2 ? 'b' : 'e'}${(j % 2) + 1}`, level: L.n, at: j < 2 ? 'begin' : 'end', lead, with: best });
      });
    });
  });
  return slots;
}

/** Acts II and III: a dialog at the beginning of every stage, and at the end of every lieutenant and boss stage. */
export function schedule2() {
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const ids = CAST.map((c) => c.id), slots = [], leads = Object.fromEntries(ids.map((i) => [i, 0])), pairUse = {};
  REGIONS.filter((R) => R.act > 1).forEach((R) => {
    const ri = REGIONS.indexOf(R), want = [];
    for (let k = 0; k < 10; k++) { want.push([k, 'begin']); if (k === 4 || k === 9) want.push([k, 'end']); }
    // the region's featured heroes lead two each, the least used of the rest fill the other four
    const pool = [...R.featured, ...R.featured, ...ids.filter((i) => !R.featured.includes(i)).sort((a, b) => leads[a] - leads[b] || rnd() - 0.5).slice(0, 4)];
    pool.sort(() => rnd() - 0.5);
    want.forEach(([k, at], j) => {
      const L = LEVELS[ri * 10 + k], lead = pool[j];
      leads[lead]++;
      let best = null, bs = -1e9;
      for (const p of ids) {
        if (p === lead) continue;
        const key = [lead, p].sort().join('|');
        const sc = aff(lead, p) * 1.1 + (R.featured.includes(p) ? 1 : 0) - (pairUse[key] || 0) * 1.4 + rnd() * 1.2;
        if (sc > bs) { bs = sc; best = p; }
      }
      pairUse[[lead, best].sort().join('|')] = (pairUse[[lead, best].sort().join('|')] || 0) + 1;
      slots.push({ id: `L${String(L.n).padStart(3, '0')}${at === 'begin' ? 'b' : 'e'}1`, level: L.n, at, lead, with: best });
    });
  });
  return slots;
}

if (process.argv[1] && process.argv[1].endsWith('dialog_schedule.mjs')) {
  const s2 = schedule2();
  writeFileSync(new URL('../docs/dialog_schedule2.json', import.meta.url), JSON.stringify(s2, null, 0).replace(/\},\{/g, '},\n{'));
  const l2 = {}; for (const d of s2) l2[d.lead] = (l2[d.lead] || 0) + 1;
  console.log('Acts II-III:', s2.length, 'dialogs;', Object.entries(l2).map(([k, v]) => k + ' ' + v).join(', '));
  const s = schedule();
  writeFileSync(new URL('../docs/dialog_schedule.json', import.meta.url), JSON.stringify(s, null, 0).replace(/\},\{/g, '},\n{'));
  const leads = {}, partners = {};
  for (const d of s) { leads[d.lead] = (leads[d.lead] || 0) + 1; (partners[d.lead] ||= new Set()).add(d.with); }
  console.log(s.length, 'dialogs');
  console.log(Object.entries(leads).map(([k, v]) => `${k} ${v} (${partners[k].size} partners)`).join('\n'));
}
