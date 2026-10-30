// Procedural held gear: 50 seeded designs per set across the six rarities (10 Common, 10 Uncommon, 9 Rare, 8 Epic,
// 7 Legendary, 6 Mythic), plainer to fancier, built by tools/weapons3d_families.js. A set is one kind of held piece in
// one class's style (the Paladin's maces, the Wizard's tomes); the game picks the set from an item's base and the
// wearer's class (SET_OF) and a design of the item's rarity. Poses are the class kits' (tools/handheld3d_kits.js POSE):
// the right hand holds 'R' pieces, the left 'L' ones, mirrored. tools/weapons3d_bake.js renders every design into
// assets/sprites/held/<set>/ (the held sprite, its palette mask, the icon, its sockets and effect points).
import * as THREE from 'three';
import { holdWeapon, holdShield, setLook } from './handheld3d.js';
import { POSE } from './handheld3d_kits.js';
import { RARITY, PER, ELEMENTS, rng, hash, pick, chance, kitFor, nameOf } from './weapons3d_parts.js';
import * as F from './weapons3d_families.js';

const HOLY = { heater: 1.35, kite: 1.25, round: 1.5, buckler: 1.15, tower: 1.3, oval: 1.3, pavise: 1.3, spiked: 1.4, targe: 1.3 };
const TOWER = { tower: 1.6, pavise: 1.6, kite: 1.5, oval: 1.5 };
const DRAGON = { heater: 1.4, kite: 1.3, round: 1.5, spiked: 1.5 };
const BUCK = { buckler: 1.15, spiked: 1, targe: 1.05 };
const shieldScale = (map) => (d) => map[d.key] || 1.3;
const hang = (p = {}) => ({ pose: 'hang', p: { dir: [-0.24, -0.9, 0.36], ...p } });

/**
 * The sets. build(r, R, M) -> { g, form, grip? }; hand 'R' | 'L'; pose (+ p tweaks, or a function of the design for
 * per-form sizes); element: the class element its glows default to; slot 'weapon' | 'offhand'.
 */
export const SETS = {
  // main hands
  maces: { cls: 'paladin', slot: 'weapon', hand: 'R', element: 'holy', build: (r, R, M) => F.mace(r, R, M), pose: 'across', p: { scale: 1.07 } },
  slimemaces: { cls: 'slime_lord', slot: 'weapon', hand: 'R', element: 'acid', build: (r, R, M) => F.mace(r, R, M, { slime: true }), pose: 'across', p: { grip: 0, dome: 5.5, scale: 1.25 } },
  greatswords: { cls: 'death_knight', slot: 'weapon', hand: 'R', element: 'cold', build: (r, R, M) => F.sword(r, R, M, { L: 52, W: 4.2 }), ...hang() },
  swords: { cls: 'dragon_knight', slot: 'weapon', hand: 'R', element: 'fire', build: (r, R, M) => F.sword(r, R, M, { L: 44, W: 3.2 }), ...hang() },
  daggers: { cls: null, slot: 'weapon', hand: 'R', element: 'shadow', build: (r, R, M) => F.dagger(r, R, M), ...hang({ scale: 1.2 }) },
  greataxes: { cls: 'barbarian', slot: 'weapon', hand: 'R', element: 'blood', build: (r, R, M) => F.axe(r, R, M), pose: 'planted' },
  handaxes: { cls: 'barbarian', slot: 'offhand', hand: 'L', element: 'blood', build: (r, R, M) => F.axe(r, R, M, { len: 24, k: 0.8, planted: false }), pose: 'hang', p: { grip: -3, flip: true, flipY: true, spin: -30 } },
  spears: { cls: 'dragoon', slot: 'weapon', hand: 'R', element: 'fire', build: (r, R, M) => F.spear(r, R, M), pose: 'planted' },
  lances: { cls: 'lancer', slot: 'weapon', hand: 'R', element: 'light', build: (r, R, M) => F.lance(r, R, M), pose: 'planted' },
  scythes: { cls: null, slot: 'weapon', hand: 'R', element: 'shadow', build: (r, R, M) => F.scythe(r, R, M), pose: 'planted' },
  firestaves: { cls: 'wizard', slot: 'weapon', hand: 'R', element: 'fire', build: (r, R, M) => F.staff(r, R, M, 'wizard'), pose: 'planted' },
  totemstaves: { cls: 'totem_master', slot: 'weapon', hand: 'R', element: 'light', build: (r, R, M) => F.staff(r, R, M, 'totem'), pose: 'planted' },
  crooks: { cls: 'carrion_witch', slot: 'weapon', hand: 'R', element: 'poison', build: (r, R, M) => F.staff(r, R, M, 'witch'), pose: 'planted' },
  bonewands: { cls: 'necromancer', slot: 'weapon', hand: 'R', element: 'shadow', build: (r, R, M) => F.wand(r, R, M, 'necro'), pose: 'across', p: { grip: 0, scale: 1.15 } },
  starwands: { cls: 'arcane_sorcerer', slot: 'weapon', hand: 'R', element: 'arcane', build: (r, R, M) => F.wand(r, R, M, 'astro'), pose: 'across', p: { grip: 0, scale: 1.15 } },
  bows: { cls: 'ranger', slot: 'weapon', hand: 'L', element: null, build: (r, R, M) => F.longbow(r, R, M), pose: 'clutch', p: { yaw: -8, tilt: -28, lean: -10 } },
  crossbows: { cls: null, slot: 'weapon', hand: 'R', element: null, build: (r, R, M) => F.crossbow(r, R, M), ...hang({ scale: 1.1 }) },
  pistols: { cls: 'gunner', slot: 'weapon', hand: 'R', element: 'fire', build: (r, R, M) => F.pistol(r, R, M), pose: 'hang', p: { scale: 1.4, flip: true } },
  boomerangs: { cls: 'boomerang_knight', slot: 'weapon', hand: 'R', element: null, build: (r, R, M) => F.boomerang(r, R, M), pose: 'clutch', p: { yaw: -15, tilt: -30, lean: 85, scale: 1.1, flip: true, flipY: true } },
  lutes: { cls: 'bard', slot: 'weapon', hand: 'R', element: 'arcane', build: (r, R, M) => F.lute(r, R, M), pose: 'hang', p: { scale: 1.5 } },
  // off hands
  holyshields: { cls: 'paladin', slot: 'offhand', hand: 'L', element: 'holy', build: (r, R, M) => F.shield(r, R, M, 'holy'), pose: 'strap', p: shieldScale(HOLY) },
  dragonshields: { cls: 'dragon_knight', slot: 'offhand', hand: 'L', element: 'fire', build: (r, R, M) => F.shield(r, R, M, 'dragon'), pose: 'strap', p: shieldScale(DRAGON) },
  towershields: { cls: 'lancer', slot: 'offhand', hand: 'L', element: 'light', build: (r, R, M) => F.shield(r, R, M, 'tower'), pose: 'strap', p: shieldScale(TOWER) },
  bucklers: { cls: 'dragoon', slot: 'offhand', hand: 'L', element: 'fire', build: (r, R, M) => F.shield(r, R, M, 'buckler'), pose: 'strap', p: (d) => ({ face: 2.4, scale: BUCK[d.key] || 1.1 }) },
  darkorbs: { cls: 'necromancer', slot: 'offhand', hand: 'L', element: 'shadow', build: (r, R, M) => F.orb(r, R, M, 'necro'), pose: 'palm', p: { scale: 1.3 } },
  starorbs: { cls: 'arcane_sorcerer', slot: 'offhand', hand: 'L', element: 'arcane', build: (r, R, M) => F.orb(r, R, M, 'astro'), pose: 'palm', p: { scale: 1.3 } },
  tomes: { cls: 'wizard', slot: 'offhand', hand: 'L', element: 'fire', build: (r, R, M) => F.tome(r, R, M), pose: 'clutch', p: { yaw: -40, tilt: -10, face: 1.5, scale: 1.4 } },
  frostskulls: { cls: 'death_knight', slot: 'offhand', hand: 'L', element: 'cold', build: (r, R, M) => F.skull(r, R, M), pose: 'palm', p: { scale: 1.6 } },
  idols: { cls: 'totem_master', slot: 'offhand', hand: 'L', element: 'light', build: (r, R, M) => F.idol(r, R, M), pose: 'clutch', p: { yaw: -15, tilt: -20, scale: 1.5 } },
  lanterns: { cls: 'carrion_witch', slot: 'offhand', hand: 'L', element: 'poison', build: (r, R, M) => F.lantern(r, R, M), pose: 'clutch', p: { yaw: -25, tilt: 0 } },
  jars: { cls: 'slime_lord', slot: 'offhand', hand: 'L', element: 'acid', build: (r, R, M) => F.jar(r, R, M), pose: 'palm', p: { scale: 1.25 } },
  bombs: { cls: 'gunner', slot: 'offhand', hand: 'L', element: 'fire', build: (r, R, M) => F.bomb(r, R, M), pose: 'palm', p: { scale: 1.4 } },
  drums: { cls: 'bard', slot: 'offhand', hand: 'L', element: 'arcane', build: (r, R, M) => F.percussion(r, R, M), pose: 'clutch', p: { yaw: -55, tilt: -15, scale: 1.3 } },
  quivers: { cls: 'ranger', slot: 'offhand', hand: 'R', element: null, build: (r, R, M) => F.arrow(r, R, M), pose: 'hang', p: { grip: -5, scale: 1.55 } },
  rangs: { cls: 'boomerang_knight', slot: 'offhand', hand: 'L', element: null, build: (r, R, M) => F.boomerang(r, R, M), pose: 'clutch', p: { yaw: -15, tilt: -30, lean: 85, scale: 0.75 } },
};
/** Each class's own main-hand and off-hand set. */
export const CLASS_SETS = {};
for (const [k, s] of Object.entries(SETS)) if (s.cls) (CLASS_SETS[s.cls] ||= {})[s.slot === 'weapon' && !(s.cls === 'barbarian' && s.slot === 'offhand') ? 'main' : 'off'] = k;

export { heldSetOf as setOf } from '../src/data/held.js';

// ------------------------------------------------------------------ designs
const PHYS = ['fire', 'cold', 'light', 'blood', 'poison'];
/** The 50 designs of a set: { set, i, rarity, seed, element } (index order: Common first). */
export function designs(set) {
  const S = SETS[set], out = [];
  let i = 0;
  PER.forEach((n, R) => {
    for (let j = 0; j < n; j++, i++) {
      const seed = hash(set, R, j), r = rng(seed ^ 0x51ed);
      const base = S.element || pick(r, PHYS);
      const element = R >= 2 && chance(r, 0.45) ? pick(r, ELEMENTS) : base;
      out.push({ set, i, rarity: R, seed, element });
    }
  });
  return out;
}
/** Build a design: { g, grip?, form, name, key } (key: the family's form key, for per-form poses). */
export function buildDesign(d) {
  const r = rng(d.seed), M = kitFor(r, d.rarity, d.element);
  setLook(4);
  const out = SETS[d.set].build(r, d.rarity, M);
  out.name = nameOf(rng(d.seed ^ 0x9e37), d.rarity, out.form);
  out.key = Object.entries({ heater: 'Heater', kite: 'Kite', round: 'Round', buckler: 'Buckler', tower: 'Tower', oval: 'Oval', pavise: 'Pavise', spiked: 'Spiked', targe: 'Targe' }).find(([, v]) => out.form?.startsWith(v))?.[0] || out.form;
  return out;
}

const mirrorL = (p) => ({ ...p, dir: p.dir && [-p.dir[0], p.dir[1], p.dir[2]], yaw: -(p.yaw || 0), lean: -(p.lean || 0), roll: typeof p.roll === 'number' ? -p.roll : p.roll });
/** The pose of a design: POSE + the set's tweaks (mirrored for the left hand). */
export function poseOf(d, built) {
  const S = SETS[d.set], tweak = typeof S.p === 'function' ? S.p(built) : S.p;
  const p = { ...POSE[S.pose], ...tweak };
  return S.hand === 'L' ? mirrorL(p) : p;
}
/** A built design placed in the hand at fist [cx, cy, r, r] (art px), as renderKit wants it. */
export function heldItem(d, fist) {
  const built = buildDesign(d), p = poseOf(d, built);
  const obj = p.how === 'euler' ? holdShield(built, fist, p) : holdWeapon(built.g, fist, p, p.roll ?? 0);
  return { obj, hand: p.dome ? fist : null, dome: p.dome, depth: p.depth, shadow: p.shadow, label: built.name, rarity: d.rarity, element: d.element, design: d };
}
export { RARITY, PER, THREE };
