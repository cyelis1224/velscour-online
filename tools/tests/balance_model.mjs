// Node-only balance model (no browser): a "typical" hero geared at each monster level vs that level's monsters.
// Prints time-to-kill and hits-to-die for normals, champions, guardians and raid bosses, so curve changes in
// monsterBase / rollItem / player stats can be compared at a glance.
//   node tools/tests/balance_model.mjs [class]
//   MARKS_LIFE=24.8 node tools/tests/balance_model.mjs paladin   # Infernal Marks' life % (game/marks.js) in the life pool,
//                                                               # beside fortitude; adds the depths 700 / 1000 / 1200
const U = new URL('../../src/', import.meta.url);
const { rollItem, itemStats, itemDmg, itemArmor, SLOTS } = await import(new URL('data/items.js', U));
const { CLASSES } = await import(new URL('data/classes.js', U));
const { skillBaseDamage } = await import(new URL('data/skills.js', U));
const { masteryMul } = await import(new URL('game/augments.js', U));
const { depthLevel, armorDiv, fortitude, toughness, danger, densityXp } = await import(new URL('data/depth.js', U));
const src = (await import('node:fs')).readFileSync(new URL('game/monster.js', U), 'utf8');
const mb = src.match(/export function monsterBase\(level\) \{[\s\S]*?\n\}/)[0].replace('export ', '');
const monsterBase = new Function('clamp', 'toughness', 'danger', 'densityXp', mb + '; return monsterBase;')((v, a, b) => Math.max(a, Math.min(b, v)), toughness, danger, densityXp);
const cls = process.argv[2] || 'paladin', C = CLASSES[cls];
const MARKS_LIFE = +(process.env.MARKS_LIFE || 0);   // % life from Infernal Marks, added to gear's life % like Player.recompute
const avg = (f, n = 400) => { let s = 0; for (let i = 0; i < n; i++) s += f(); return s / n; };

function hero(L, ilvl) {
  // gear: rare-ish (rarity 2, sometimes 3) in every slot at ilvl, +3 upgrades; attributes 60% primary / 40% vit
  const add = {}; let armor = 0, wdmg = 0;
  const N = 60;
  for (let k = 0; k < N; k++) for (const slot of SLOTS) {
    const s = slot.startsWith('ring') ? 'ring' : slot;
    const it = rollItem(ilvl, { slot: s, rarity: k % 3 === 0 ? 3 : 2, generic: true });
    it.upg = 3;
    for (const [st, v] of itemStats(it)) add[st] = (add[st] || 0) + v / N;
    armor += itemArmor(it) / N;
    if (s === 'weapon') { const d = itemDmg(it); wdmg += (d[0] + d[1]) / 2 / N; }
  }
  const pts = (L - 1) * 5, prim = C.primary;
  const a = { ...C.base }; a[prim] += pts * 0.6; a.vit += pts * 0.4;
  const at = (k) => a[k] + (add[k] || 0) + (add.allAttr || 0);
  const vit = at('vit'), str = at('str'), primary = at(prim);
  const hp = (C.life + (L - 1) * C.lifeLvl + vit * 3 + (add.life || 0)) * (1 + ((add.lifePct || 0) + MARKS_LIFE) / 100) * fortitude(L);
  const arm = (armor + (add.armor || 0) + str) * (1 + (add.armorPct || 0) / 100);
  const res = Math.min(75, (add.resAll || 0) + (add.resFire || 0));
  return { hp, arm, res, wdmg, add, primary, regen: 0.6 + L * 0.12 + vit * 0.05 + (add.lifeRegen || 0), ls: add.lifeSteal || 0 };
}
const sk = { row: 6, m: {}, kind: 'proj' };
if (MARKS_LIFE) console.log(`Infernal Marks: +${MARKS_LIFE}% life in the life pool`);
console.log(`class ${cls}: depth -> mlvl | hero hp armor%  hitN hitN%  | dps  ttk(norm) ttk(champ) ttk(boss) | hits to die (norm/champ/boss)`);
console.log('(rough: DPS here over-counts; the in-browser numbers come from balance.js. Hits to die is the number to watch.)');
for (const depth of [5, 20, 40, 60, 80, 100, 120, 140, 150, 160, 180, 200, 250, 300, 400, 500, ...(MARKS_LIFE ? [700, 1000, 1200] : [])]) {
  const L = depthLevel(depth), h = hero(Math.min(3000, L + 2), L);
  const B = monsterBase(L);
  const mit = 1 - h.arm / (h.arm + armorDiv(L));
  const sL = Math.min(26, 1 + L * 0.3);
  const M = Math.min(1000, 20 + depth * 2.2); // mastery of the main skill, rough
  const base = skillBaseDamage(sk, sL);
  const mult = (1 + ((h.add.dmgPct || 0) + h.primary + (h.add.firePct || 0) + (h.add.physPct || 0) / 2) / 100) * (1 + 0.03 * 30) * masteryMul(M);
  const hitD = (base + h.wdmg * 0.6) * mult * (1 + 0.15 * 0.5);
  const dps = hitD * 1.6;
  const mhit = B.dmg * mit, ehit = B.dmg * (1 - h.res / 100);
  const f = (x) => x.toFixed(1).padStart(6);
  console.log(`${String(depth).padStart(4)} -> ${String(L).padStart(3)} | ${String(Math.round(h.hp)).padStart(6)} ${f(100 * (1 - mit))} ${f(mhit)} ${f(100 * mhit / h.hp)}% | ${String(Math.round(dps)).padStart(7)} ${f(B.hp / dps)} ${f(B.hp * 3 / dps)} ${f(B.hp * (10 + Math.min(depth, 120) / 10) * 2 / dps)} | ${f(h.hp / mhit)} ${f(h.hp / (mhit * 1.4))} ${f(h.hp / (mhit * 1.9 * 2))}`);
}
