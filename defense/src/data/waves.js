// The horde: monster roles, each stage's roster (painted Velscour monsters, spread over the whole campaign so all of
// them march somewhere) and the 3,000 waves on one rising curve (global wave g = 1..3000).
import { RNG, clamp } from '../core/util.js';
import { ART } from '../core/assets.js';
import { LEVELS, REGIONS } from './campaign.js';
import { CURVE, TERRAIN } from './curve.js';

// hp/def/res/speed are wave-1 values; leak = cracks dealt to the Heart; from = first stage it marches in
export const ROLES = {
  grunt: { name: 'Grunt', hp: 100, def: 8, res: 0.1, speed: 0.9, leak: 1, from: 1, arches: ['skeleton', 'zombie', 'ghoul', 'cultist'], h: 1 },
  runner: { name: 'Runner', hp: 52, def: 0, res: 0, speed: 1.6, leak: 1, from: 2, arches: ['hound', 'spider', 'imp', 'scorpion', 'beetle'], h: 0.8 },
  flyer: { name: 'Flyer', hp: 80, def: 4, res: 0.15, speed: 1.15, leak: 1, from: 4, air: true, arches: ['bat', 'gargoyle', 'eye'], h: 0.9 },
  brute: { name: 'Brute', hp: 270, def: 30, res: 0.1, speed: 0.72, leak: 2, from: 6, arches: ['knight', 'abomination', 'demon'], h: 1.15 },
  shaman: { name: 'Shaman', hp: 140, def: 6, res: 0.3, speed: 0.8, leak: 1, from: 11, heal: 0.05, arches: ['cultist', 'shroom'], h: 1 },
  tank: { name: 'Juggernaut', hp: 420, def: 75, res: 0.05, speed: 0.55, leak: 3, from: 15, arches: ['golem', 'knight'], h: 1.25 },
  warded: { name: 'Warded', hp: 190, def: 4, res: 0.6, speed: 0.85, leak: 1, from: 21, arches: ['wraith', 'elemental', 'slime'], h: 1 },
  hexer: { name: 'Hexer', hp: 150, def: 8, res: 0.35, speed: 0.8, leak: 1, from: 25, hex: 7, arches: ['cultist', 'eye', 'wraith', 'archer'], h: 1 },
  splitter: { name: 'Splitter', hp: 170, def: 10, res: 0.2, speed: 0.8, leak: 1, from: 33, split: 2, arches: ['slime', 'worm', 'beetle'], h: 1.05 },
  shieldbearer: { name: 'Shieldbearer', hp: 240, def: 40, res: 0.2, speed: 0.7, leak: 2, from: 45, shield: 0.3, arches: ['knight', 'golem', 'abomination', 'archer'], h: 1.15 },
  blinker: { name: 'Blinker', hp: 130, def: 6, res: 0.25, speed: 0.95, leak: 1, from: 62, blink: 5, arches: ['imp', 'wraith', 'eye', 'demon', 'elemental'], h: 0.95 },
  burrower: { name: 'Burrower', hp: 200, def: 22, res: 0.15, speed: 0.85, leak: 1, from: 81, burrow: 6, arches: ['worm', 'scorpion', 'beetle', 'spider'], h: 0.95 },
  // the named ones: painted bosses as captains (a rally that hurries the horde), giants as warlords, lieutenants, bosses
  captain: { name: 'Captain', hp: 700, def: 30, res: 0.25, speed: 0.7, leak: 3, from: 20, rally: 0.25, h: 1.3 },
  warlord: { name: 'Warlord', hp: 2600, def: 40, res: 0.3, speed: 0.48, leak: 6, from: 81, roar: 11, h: 1.7 },
  lieutenant: { name: 'Lieutenant', hp: 1500, def: 35, res: 0.25, speed: 0.5, leak: 5, from: 5, roar: 10, h: 1.6 },
  boss: { name: 'Boss', hp: 4200, def: 45, res: 0.3, speed: 0.42, leak: 10, from: 10, roar: 9, summon: 12, h: 1.9 },
};
const ROLE_W = { grunt: 5, runner: 3, flyer: 2.2, brute: 2.2, shaman: 1.2, tank: 1.5, warded: 1.8, hexer: 1.1, splitter: 1.4, shieldbearer: 1.2, blinker: 1.3, burrower: 1.3 };
const HORDE = Object.keys(ROLE_W);

// what each region's horde looks like: preferred arches, elements and flags
const TASTE = {
  outskirts: { arches: ['hound', 'skeleton', 'zombie', 'ghoul', 'imp', 'bat', 'beetle', 'spider', 'knight', 'golem'] },
  catacombs: { undead: true, arches: ['skeleton', 'zombie', 'ghoul', 'spider', 'worm', 'wraith', 'bat'] },
  cathedral: { els: ['holy', 'shadow', 'fire'], arches: ['cultist', 'wraith', 'knight', 'skeleton', 'gargoyle'] },
  frostfang: { els: ['cold'], arches: ['hound', 'golem', 'knight', 'wraith', 'elemental'] },
  sand: { els: ['fire', 'light'], arches: ['scorpion', 'beetle', 'worm', 'golem', 'demon'] },
  forest: { els: ['poison'], arches: ['shroom', 'spider', 'hound', 'slime', 'beetle'] },
  ironcrown: { arches: ['knight', 'golem', 'demon', 'archer', 'abomination'] },
  rift: { els: ['shadow', 'fire', 'blood'], demon: true, arches: ['demon', 'wraith', 'eye', 'elemental', 'imp'] },
  sewers: { els: ['poison', 'cold'], arches: ['slime', 'worm', 'zombie', 'ghoul', 'spider', 'abomination'] },
  glasswind: { els: ['fire', 'light', 'holy'], arches: ['scorpion', 'beetle', 'elemental', 'golem', 'cultist'] },
  boneorchard: { undead: true, arches: ['skeleton', 'ghoul', 'shroom', 'gargoyle', 'zombie'] },
  hoarfrost: { els: ['cold'], arches: ['knight', 'golem', 'wraith', 'hound', 'skeleton'] },
  sunken: { els: ['cold', 'arcane'], arches: ['worm', 'slime', 'elemental', 'scorpion', 'cultist'] },
  caldera: { els: ['fire'], arches: ['demon', 'golem', 'imp', 'elemental', 'beetle'] },
  veilscar: { els: ['shadow', 'arcane'], arches: ['wraith', 'hound', 'eye', 'cultist', 'shroom'] },
  abbey: { els: ['holy', 'shadow'], arches: ['cultist', 'gargoyle', 'knight', 'wraith', 'skeleton'] },
  mirefen: { els: ['poison'], arches: ['shroom', 'slime', 'worm', 'spider', 'abomination'] },
  foundry: { els: ['fire', 'light'], arches: ['golem', 'knight', 'archer', 'spider', 'abomination'] },
  breach: { els: ['shadow', 'arcane', 'blood'], demon: true, arches: ['demon', 'eye', 'wraith', 'abomination', 'imp'] },
  throne: { els: ['shadow', 'fire', 'blood'], demon: true, arches: ['demon', 'knight', 'golem', 'wraith', 'gargoyle'] },
  ashroad: { els: ['fire'], arches: ['demon', 'golem', 'skeleton', 'imp', 'elemental'] },
  deeps: { arches: ['worm', 'spider', 'beetle', 'golem', 'ghoul', 'bat'] },
  crystal: { els: ['light', 'arcane', 'cold'], arches: ['golem', 'elemental', 'eye', 'spider', 'scorpion'] },
  drowned: { els: ['cold'], undead: true, arches: ['zombie', 'skeleton', 'worm', 'slime', 'knight'] },
  morrow: { undead: true, arches: ['skeleton', 'knight', 'wraith', 'ghoul', 'archer'] },
  teeth: { els: ['blood'], demon: true, arches: ['demon', 'hound', 'abomination', 'knight', 'imp'] },
  archive: { els: ['fire', 'arcane'], arches: ['cultist', 'elemental', 'eye', 'gargoyle', 'golem'] },
  hooks: { els: ['poison', 'shadow'], arches: ['spider', 'shroom', 'wraith', 'abomination', 'hound'] },
  rampart: { els: ['cold'], arches: ['golem', 'knight', 'archer', 'gargoyle', 'abomination'] },
  hall: { els: ['shadow', 'fire', 'blood'], demon: true, arches: ['demon', 'wraith', 'knight', 'eye', 'abomination'] },
};

/**
 * Monster health at global wave g (1..3000): the fitted curve (data/curve.js, tests/calibrate.mjs) eased across each
 * stage's waves, so every wave is a little harder than the one before. DIFFICULTY scales the whole campaign.
 */
export const DIFFICULTY = 1;
const stageOfWave = [];
for (const L of LEVELS) for (let i = 0; i < L.waves; i++) stageOfWave.push(L);
export const TUNE = { flat: 0, terrain: 0 };   // tests/calibrate.mjs: one fixed multiplier for every wave, terrain off
/** How much a stage's map eases or stiffens the horde (fitted with the curve). */
export const terrainK = (n) => TUNE.terrain || TERRAIN[n - 1] || 1;
const curveAt = (i) => (i < CURVE.length ? CURVE[i] : CURVE[CURVE.length - 1] * Math.pow(1.025, i - CURVE.length + 1));
export function hpMul(g) {
  if (TUNE.flat) return TUNE.flat;
  const L = stageOfWave[Math.max(0, Math.min(stageOfWave.length - 1, g - 1))], f = (g - 1 - L.wave0) / L.waves;
  return DIFFICULTY * (curveAt(L.n - 1) + (curveAt(L.n) - curveAt(L.n - 1)) * f);
}
// armour: steep through Act I (waves 1-1000), then slow (+1x a thousand waves), or physical heroes would scratch the late
// horde for a few percent while magic ones (resistances never scale) did full damage
export const defMul = (g) => (g <= 1000 ? 1 + (g - 1) / 120 : 1 + 999 / 120 + (g - 1000) / 1000);

/**
 * Every stage's roster, worked out once for the whole campaign in stage order: for each role the region's taste picks
 * among the monsters of fitting arches, but each time a monster is used it counts against it, so over 200 stages the
 * campaign marches out (nearly) every painted monster VELSCOUR has, not the same favourites again and again.
 */
let rosters = null;
function buildRosters() {
  const rng = new RNG('rosters'), uses = new Map(), use = (m) => uses.set(m.id, (uses.get(m.id) || 0) + 1), used = (m) => uses.get(m.id) || 0;
  const regular = ART.monsters.filter((m) => !m.lone && !m.boss), captains = ART.monsters.filter((m) => m.boss && !m.lone), giants = ART.monsters.filter((m) => m.lone);
  const named = (name) => ART.monsters.find((m) => m.name === name);
  const out = [];
  for (const L of LEVELS) {
    const R = REGIONS.find((r) => r.id === L.region), taste = TASTE[L.region] || {}, roster = {}, inStage = new Set();
    const score = (m) => ((taste.arches || []).includes(m.arch) ? 2 : 0) + (taste.els && taste.els.includes(m.el) ? 1.2 : 0)
      + (taste.undead && m.undead ? 0.8 : 0) + (taste.demon && m.demon ? 0.8 : 0) + rng.next() * 1.5 - used(m) * 1.6;
    const per = L.n <= 10 ? 2 : L.n <= 80 ? 3 : L.n <= 200 ? 4 : 5;
    for (const role of HORDE) {
      const def = ROLES[role];
      const cands = regular.filter((m) => !inStage.has(m.id) && (def.arches.includes(m.arch) || (role === 'flyer' && m.fly)));
      cands.sort((a, b) => score(b) - score(a));
      roster[role] = cands.slice(0, per).map((m) => { if (def.from <= L.n) { use(m); inStage.add(m.id); } return m.id; });
    }
    const pickFrom = (pool, k) => { const c = pool.filter((m) => !inStage.has(m.id)).sort((a, b) => score(b) - score(a)).slice(0, k); c.forEach((m) => { use(m); inStage.add(m.id); }); return c.map((m) => m.id); };
    roster.captain = L.n >= ROLES.captain.from ? pickFrom(captains, L.n >= 200 ? 4 : L.n >= 120 ? 3 : L.n >= 60 ? 2 : 1) : [];
    const giant = (name) => { const m = (name && named(name)) || giants.slice().sort((a, b) => used(a) - used(b) || rng.next() - 0.5)[0]; use(m); return m.id; };
    roster.lieutenant = [giant(R.lieutenant)];
    roster.boss = [giant(R.boss)];
    // a warlord: the region's own at its 8th stage; from stage 61 a giant at the end of every other ordinary stage too
    roster.warlord = L.warlord ? [giant(R.warlord)] : L.n >= 61 && !L.boss && !L.lieutenant ? [giant('')] : [];
    out.push(roster);
  }
  return out;
}
/** Which painted monsters play each role in stage n. */
export function stageRoster(n) {
  if (!rosters) rosters = buildRosters();
  return rosters[n - 1];
}
/** Every monster id that marches somewhere in stages 1..n (the Bestiary pack draws from these). */
export function monstersUpTo(n) {
  if (!rosters) rosters = buildRosters();
  const s = new Set();
  for (let i = 0; i < Math.min(n, rosters.length); i++) for (const [role, ids] of Object.entries(rosters[i])) if ((ROLES[role].from || 1) <= i + 1 || role === 'lieutenant' || role === 'boss') ids.forEach((id) => s.add(id));
  return s;
}

/**
 * Stage n's waves: [{ g, groups: [{ role, art, count, gap, route, elite }] , big }]. routes = number of routes.
 * Pure data; the battle sim turns it into spawns.
 */
export function stageWaves(n, routes = 1) {
  const L = LEVELS[n - 1], rng = new RNG('waves:' + n), roster = stageRoster(n), waves = [];
  const roles = HORDE.filter((r) => ROLES[r].from <= n), turn = {};
  const art = (role) => { const list = roster[role]; turn[role] = (turn[role] || 0) + 1; return list[(turn[role] + rng.int(0, 1)) % list.length]; };
  for (let i = 0; i < L.waves; i++) {
    const g = L.wave0 + i + 1, last = i === L.waves - 1;
    let count = Math.round(4 + 3 * Math.log2(1 + g / 40) + (last ? 3 : 0));
    const groups = [], kinds = Math.min(roles.length, 1 + rng.int(0, Math.min(n >= 81 ? 3 : 2, Math.floor(n / 6))));
    const chosen = [];
    while (chosen.length < kinds) {
      const r = rng.weighted(roles.map((k) => [k, ROLE_W[k] * (chosen.includes(k) ? 0 : 1) + 0.0001]));
      if (!chosen.includes(r)) chosen.push(r);
    }
    const eliteP = clamp((g - 25) / 900, 0, 0.3);
    chosen.forEach((role, k) => {
      const c = k === chosen.length - 1 ? count : Math.max(2, Math.round(count / (chosen.length - k) * rng.range(0.7, 1.2)));
      count -= c;
      if (c <= 0) return;
      const fast = role === 'runner' ? 0.45 : 0.85;
      groups.push({ role, art: art(role), count: c, gap: clamp(fast - g / 3000, 0.3, 1), route: rng.int(0, routes - 1), elite: eliteP, delay: k * rng.range(1.5, 3) });
    });
    // captains lead the last wave from stage 20, and every fourth wave from stage 60
    if (roster.captain.length && (last || (n >= 60 && i % 4 === 3))) groups.push({ role: 'captain', art: art('captain'), count: 1, gap: 1, route: rng.int(0, routes - 1), delay: 2 });
    if (last && roster.warlord.length) groups.push({ role: 'warlord', art: roster.warlord[0], count: 1, gap: 1, route: 0, delay: 3 });
    if (last && L.lieutenant) groups.push({ role: 'lieutenant', art: roster.lieutenant[0], count: 1, gap: 1, route: 0, delay: 4 });
    if (last && L.boss) groups.push({ role: 'boss', art: roster.boss[0], count: 1, gap: 1, route: 0, delay: 5 });
    waves.push({ g, groups, big: last });
  }
  return waves;
}

/** Deploy Limit (heroes on the field at once) and the Heart's cracks for stage n, before Bastion research. */
export const deployLimit = (n) => Math.min(10, 3 + Math.floor(Math.sqrt(n) * 0.62));
export const heartBase = (n) => Math.min(40, 12 + Math.floor(n / 10) * 2);
