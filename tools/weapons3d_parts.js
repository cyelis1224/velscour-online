// Shared parts for the procedural weapons and off-hands (tools/weapons3d.js): seeded randomness, the material kit of a
// rarity (plain iron and wood at Common up to void metal and living light at Mythic), jewels, rune inlays, floating
// shards and halos, and markers. Every material carries userData.region ('metal' | 'trim' | 'grip' | 'glow' | 'gem' |
// 'other') for the palette mask; markers (empty Object3Ds with userData.kind) tell the bake where gem sockets ('slot')
// and effects ('head' with r, 'tip', 'l0'/'l1' a line, 'orbit' with r) sit, and survive every pose and flip.
import * as THREE from 'three';
import { mat, shape, extrude } from './handheld3d.js';

export const RARITY = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];
export { HELD_PER as PER } from '../src/data/held.js'; // designs of each rarity per set: 50
// the game's element keys (src/gfx/vfx.js ELEM; 'light' is lightning)
export const ELEMENT = {
  holy: 0xffd860, fire: 0xff6a20, cold: 0x7ad0ff, light: 0xb4c8ff, poison: 0x8aff50, shadow: 0xa070ff,
  arcane: 0x4aa8ff, acid: 0x50ff90, blood: 0xff3040, astral: 0xd8e0ff,
};
export const ELEMENTS = Object.keys(ELEMENT);
const JEWELS = [0xff3040, 0x3a7aff, 0x40e070, 0xb050ff, 0xffc020, 0xf0f4ff, 0xff7a20];

// ------------------------------------------------------------------ randomness
export function rng(seed) {
  let s = seed | 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hash = (...a) => a.join('|').split('').reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
export const range = (r, a, b) => a + (b - a) * r();
export const pick = (r, a) => a[Math.floor(r() * a.length)];
export const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));
export const chance = (r, p) => r() < p;

// ------------------------------------------------------------------ materials
export const tag = (m, region) => { m.userData.region = region; return m; };
export const solid = (c, metal = 0, rough = 0.6, env = 1, region = 'other') => tag(new THREE.MeshStandardMaterial({ color: c, metalness: metal, roughness: rough, envMapIntensity: env }), region);
export const glow = (c, i = 0.9) => tag(new THREE.MeshStandardMaterial({ color: new THREE.Color(c).multiplyScalar(0.3), emissive: c, emissiveIntensity: Math.min(1, i), roughness: 0.35, metalness: 0, envMapIntensity: 0.3 }), 'glow');
export const gemM = (c, i = 1.1) => tag(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.08, metalness: 0.2, envMapIntensity: 1.6 }), 'gem');
const T = (id, o, region) => () => tag(mat(id, o), region);

const METALS = [
  [T('MET-02', { tile: 10, metal: 0.7, rough: 0.55, color: 0xb0aca4 }, 'metal'), T('MET-01', { tile: 10, metal: 0.7, rough: 0.55, color: 0xa4a09a }, 'metal')],
  [T('MET-06', { tile: 12, metal: 0.85, rough: 0.35, color: 0xcfd3db }, 'metal'), T('MET-01', { tile: 12, metal: 0.85, rough: 0.35, color: 0xc4c4cc }, 'metal')],
  [T('MET-06', { tile: 14, metal: 0.9, rough: 0.25, color: 0xe4e8f0 }, 'metal'), T('MET-06', { tile: 14, metal: 0.9, rough: 0.25, color: 0xc8d4f0 }, 'metal')],
  [T('MET-06', { tile: 16, metal: 0.9, rough: 0.2, color: 0xd0dcf8 }, 'metal'), T('MET-01', { tile: 16, metal: 0.9, rough: 0.22, color: 0xb4b4cc }, 'metal'), T('MET-06', { tile: 16, metal: 0.95, rough: 0.18, color: 0xf0f0f8 }, 'metal')],
  [T('GOLD-05', { tile: 14, metal: 0.9, rough: 0.3, color: 0xd8c8b8 }, 'metal'), T('MET-10', { tile: 14, metal: 0.85, rough: 0.25, color: 0xe8d8ff }, 'metal'), T('MET-06', { tile: 16, metal: 1, rough: 0.14, color: 0xf8f8ff }, 'metal')],
  [() => solid(0x2c2838, 0.9, 0.22, 1.2, 'metal'), () => solid(0xb0a8d0, 0.9, 0.22, 1, 'metal'), T('MET-10', { tile: 12, metal: 0.9, rough: 0.2, color: 0xffd8ff }, 'metal')],
];
const TRIMS = [
  [T('MET-04', { tile: 8, metal: 0.7, rough: 0.5, color: 0x9a7a5a }, 'trim'), T('MET-02', { tile: 8, metal: 0.7, rough: 0.5, color: 0x807c78 }, 'trim')],
  [T('MET-04', { tile: 8, metal: 0.85, rough: 0.4 }, 'trim'), T('MET-09', { tile: 8, metal: 0.85, rough: 0.35 }, 'trim')],
  [T('GOLD-01', { tile: 8, metal: 0.9, rough: 0.32 }, 'trim')],
  [T('GOLD-04', { tile: 8, metal: 0.92, rough: 0.28 }, 'trim'), T('GOLD-01', { tile: 8, metal: 0.92, rough: 0.28 }, 'trim')],
  [T('GOLD-02', { tile: 8, metal: 0.95, rough: 0.24 }, 'trim'), T('GOLD-04', { tile: 8, metal: 0.95, rough: 0.24 }, 'trim')],
  [T('GOLD-02', { tile: 8, metal: 1, rough: 0.18, color: 0xfff0c8 }, 'trim'), T('GOLD-04', { tile: 8, metal: 1, rough: 0.18 }, 'trim')],
];
const WOODS = [
  [T('WOOD-04', { rep: [1, 6], metal: 0, rough: 0.75, color: 0xb89070 }, 'grip'), T('WOOD-01', { rep: [1, 6], metal: 0, rough: 0.8, color: 0xa88868 }, 'grip')],
  [T('WOOD-03', { rep: [1, 6], metal: 0, rough: 0.7, color: 0xc09070 }, 'grip'), T('SHIP-05', { rep: [1, 6], metal: 0, rough: 0.6, color: 0xc08060 }, 'grip')],
  [T('SHIP-05', { rep: [1, 6], metal: 0, rough: 0.5, color: 0xb87050 }, 'grip'), T('WOOD-02', { rep: [1, 6], metal: 0, rough: 0.5, color: 0x9a8070 }, 'grip')],
  [T('WOOD-05', { rep: [1, 6], metal: 0, rough: 0.45, color: 0xa890a0 }, 'grip'), T('WOOD-02', { rep: [1, 6], metal: 0, rough: 0.45, color: 0x8a7468 }, 'grip')],
  [T('WOOD-05', { rep: [1, 6], metal: 0.1, rough: 0.4, color: 0x9a80a8 }, 'grip'), T('WOOD-02', { rep: [1, 6], metal: 0.1, rough: 0.4, color: 0x706058 }, 'grip')],
  [T('WOOD-05', { rep: [1, 6], metal: 0.2, rough: 0.35, color: 0x8070a0 }, 'grip'), () => solid(0x241c28, 0.3, 0.4, 1, 'grip')],
];
// blades: clean steel (a texture is only grain at one art px per unit), mid-dark so a bright edge (M.edge) frames them,
// duller to finer, darker metals higher up
const BLADES = [
  [[0x6c6c6a, 0.75, 0.5]], [[0x7a7e84, 0.8, 0.42], [0x74767c, 0.8, 0.45]], [[0x868c96, 0.85, 0.36], [0x7e8898, 0.85, 0.36]],
  [[0x8a94a8, 0.88, 0.32], [0x52526a, 0.88, 0.32], [0x8a8e9c, 0.88, 0.3]], [[0x9098a8, 0.9, 0.28], [0x44365a, 0.88, 0.3], [0x96784e, 0.9, 0.3]],
  [[0x2a2636, 0.9, 0.26], [0x6e6694, 0.9, 0.26], [0x6a2232, 0.85, 0.32], [0x7e90a4, 0.9, 0.24]],
];
const WRAPS = [[0x6a4a30, 0x5a4232], [0x7a5038, 0x4a3a5a, 0x3a4a32], [0x8a2a2a, 0x2a3a7a, 0x2a5a3a, 0x5a2a6a], [0x9a1e24, 0x1e2e8a, 0x5a1a7a, 0x1a1a22], [0x2a0e3a, 0x7a1010, 0x0e2a5a, 0x101014], [0x14101c, 0x3a0a4a, 0x0a1a3a]];

/** The materials of one design: rarity R, element E. */
export function kitFor(r, R, E) {
  const e = ELEMENT[E] ?? ELEMENT.arcane;
  return {
    R, E, e,
    blade: ((b) => solid(b[0], b[1], b[2], 0.55, 'metal'))(pick(r, BLADES[R])), edge: solid([0xb0b0ac, 0xc4c8cc, 0xd4d8e0, 0xdce2ee, 0xe4e8f2, 0xe8e4f4][R], 0.85, 0.3, 0.6, 'metal'),
    metal: pick(r, METALS[R])(), metal2: pick(r, METALS[Math.max(0, R - 1)])(), trim: pick(r, TRIMS[R])(), wood: pick(r, WOODS[R])(),
    grip: tag(mat('CLOTH-02', { rep: [1, 1], metal: 0, rough: 0.9, color: pick(r, WRAPS[R]) }), 'grip'),
    dark: solid(0x1e1820, 0.4, 0.5, 1, 'other'), bone: solid(R >= 4 ? 0xd8d0c0 : 0xb0a488, 0, 0.5, 0.9, 'other'),
    glow: glow(e, 0.8 + R * 0.04), glow2: glow(new THREE.Color(e).lerp(new THREE.Color(0xffffff), 0.35).getHex(), 0.95),
    gem: gemM(R >= 3 && chance(r, 0.6) ? e : pick(r, JEWELS), 1 + R * 0.15),
  };
}

// ------------------------------------------------------------------ shapes
export const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
export const put = (o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); return o; };
export const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
export const tube = (pts, r, m, seg = 24, rs = 6) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => V(...p))), seg, r, rs, false), m);
/** A flat part: the outline extruded `depth` along Z, centred on z. */
export function slab(pts, depth, m, bevel = 0.3, z = 0) { const g = extrude(shape(pts), depth, bevel); g.translate(0, 0, z - depth / 2); return new THREE.Mesh(g, m); }
export const down = (o) => { o.rotation.x = Math.PI; return o; };
export function torus(R, t, m, seg = 24) { return new THREE.Mesh(new THREE.TorusGeometry(R, t, 6, seg), m); }
/** A solid of revolution round Y through profile points [r, y] (bottom to top). */
export function lathe(pts, m, seg = 16) { return new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(Math.max(0.001, x), y)), seg), m); }
export const oct = (r, m) => new THREE.Mesh(new THREE.OctahedronGeometry(r, 0), m);
export const ico = (r, m, d = 0) => new THREE.Mesh(new THREE.IcosahedronGeometry(r, d), m);
/** A marker for the bake: kind 'slot' | 'head' | 'tip' | 'l0' | 'l1' | 'orbit', with a radius where it has one. */
export function mark(g, kind, x, y, z = 0, r = 0) { const o = new THREE.Object3D(); o.position.set(x, y, z); o.userData = { kind, r }; g.add(o); return o; }

// ------------------------------------------------------------------ decoration
/** A gem in a bezel at p facing `face` (a unit vector); a socket marker on it. */
export function jewel(g, M, p, s = 1, face = [0, 0, 1], cut = 'oct') {
  const at = V(...p), n = V(...face).normalize();
  const bez = torus(s * 1.05, s * 0.28, M.trim, 14); bez.quaternion.setFromUnitVectors(V(0, 0, 1), n); bez.position.copy(at);
  const gm = cut === 'ball' ? new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), M.gem) : oct(s * 1.1, M.gem);
  gm.scale.set(1, 1, 0.65); gm.quaternion.setFromUnitVectors(V(0, 0, 1), n); gm.position.copy(at).addScaledVector(n, s * 0.2);
  g.add(bez, gm); mark(g, 'slot', at.x + n.x * s, at.y + n.y * s, at.z + n.z * s);
}
/** A glowing rune strip on both faces of a flat part from (x, y0) to (x, y1), w wide, the faces at +-z; a line marker. */
export function runes(g, M, x, y0, y1, w, z, notch = 5) {
  for (const s of [1, -1]) {
    g.add(put(box(w * 0.4, y1 - y0, 0.15, M.glow), x, (y0 + y1) / 2, s * z));
    for (let y = y0 + notch * 0.6; y < y1 - 1; y += notch) g.add(put(box(w, 0.5, 0.15, M.glow), x, y, s * z));
  }
  mark(g, 'l0', x, y0, 0); mark(g, 'l1', x, y1, 0);
}
/** Mythic: glowing shards drifting round a centre (radius rad, in the XY plane); an orbit marker. */
export function shards(g, M, c, rad, n, r, size = 1) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.6, s = oct(size * range(r, 0.6, 1.1), i % 2 ? M.glow2 : M.glow);
    s.scale.y = 1.8; s.rotation.z = a; g.add(put(s, c[0] + Math.cos(a) * rad, c[1] + Math.sin(a) * rad * 0.8, (c[2] || 0) + Math.sin(a * 2) * rad * 0.3));
  }
  mark(g, 'orbit', c[0], c[1], c[2] || 0, rad);
}
/** A ring round a point, tilted: gold with a glowing inner line. */
export function halo(g, M, c, rad, rx = 1.2, rz = 0) {
  const a = torus(rad, rad * 0.07 + 0.25, M.trim, 32), b = torus(rad * 0.93, rad * 0.04 + 0.12, M.glow, 32);
  for (const t of [a, b]) { t.rotation.set(rx, 0, rz); g.add(put(t, ...c)); }
}
/** Studs (little domes) at points facing +Z. */
export function studs(g, m, pts, s = 0.55) { for (const [x, y, z = 0] of pts) { const b = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), m); b.rotation.x = Math.PI / 2; g.add(put(b, x, y, z)); } }

// ------------------------------------------------------------------ names
const PRE = ['Dawn', 'Grave', 'Storm', 'Ember', 'Frost', 'Star', 'Void', 'Soul', 'Blood', 'Sun', 'Moon', 'Thorn', 'Wyrm', 'Ash', 'Night', 'Doom', 'Glory', 'Rune', 'Gloom', 'Hallow', 'Wraith', 'Oath', 'Dusk', 'Bone', 'Sky'];
const SUF = ['breaker', 'fall', 'song', 'bane', 'reaver', 'heart', 'ward', 'fang', 'crown', 'brand', 'caller', 'eye', 'maw', 'light', 'shard', 'warden', 'weaver', 'bloom', 'spire', 'shroud'];
const TIER = [['Iron', 'Plain', 'Worn', 'Rough', 'Simple'], ['Steel', 'Sturdy', 'Fine', 'Banded', 'Tempered'], ['Gilded', 'Runed', 'Jeweled', 'Engraved', 'Noble'], ['Exalted', 'Sigiled', 'Masterwork', 'Arcane', 'Royal']];
/** A design's name: tier word + form for Common to Epic, a forged name for Legendary and Mythic. */
export function nameOf(r, R, form) {
  if (R < 4) return `${pick(r, TIER[R])} ${form}`;
  const n = pick(r, PRE) + pick(r, SUF);
  return R === 5 ? `${n}, the ${pick(r, ['Undying', 'Eternal', 'Unbound', 'Last Light', 'World-Ender', 'Starborn', 'First Flame', 'Worldsong'])}` : `${n} ${form}`;
}
