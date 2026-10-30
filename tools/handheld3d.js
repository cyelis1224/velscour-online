// Hand-held gear in 3D (tools/handheld3d.html): small three.js maces and shields in the fists of random Grim Nocturne
// Paladins (armor + helmet + finish composed by the game's own heroLook). The sprite is a flat card standing in the iso
// scene: it writes depth only, so whatever passes behind it is hidden by its opaque pixels, and the gripping fist is a
// second card a few px in front, so the haft goes into the fist and comes out above it. The gear is rendered from the
// sprite's camera (30 degrees down, 2:1 iso) at SS px per art px, box-filtered down to the art grid, outlined, and laid
// over the sprite. Units are art px of the 128x192 frame; hero world: +X the hero's left (screen right), +Y up, +Z
// towards the viewer. Weapon local +Y runs from the grip to the head; shield local +Z is the face normal.
// ATTEMPTS keeps every pose tried while fitting them, so tools/handheld3d_bake.js can redraw any of them.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const TEX = 'assets/source/materials/textures/';
const FILES = {
  'GOLD-01': 'gold/GOLD-01_Beaten_Antique_Gold', 'GOLD-02': 'gold/GOLD-02_Scratched_Gold_Leaf',
  'GOLD-04': 'gold/GOLD-04_Hammered_Reliquary_Gold', 'MET-01': 'metal/MET-01_Hammered_Gunmetal',
  'MET-02': 'metal/MET-02_Riveted_Black_Iron', 'MET-06': 'metal/MET-06_Tarnished_Silver',
  'MET-08': 'metal/MET-08_Scratched_Blue_Steel', 'CLOTH-02': 'sailcloth/CLOTH-02_Stitched_Charcoal',
  'CLOTH-04': 'sailcloth/CLOTH-04_Aged_Cream_Linen', 'WOOD-04': 'wood/WOOD-04_Weathered_Cedar',
  'SHIP-02': 'ship_planks/SHIP-02_Salt_Worn_Oak',
  // for the class kits (tools/handheld3d_kits.js)
  'GOLD-05': 'gold/GOLD-05_Gilded_Charcoal_Alloy', 'MET-04': 'metal/MET-04_Tarnished_Bronze', 'MET-05': 'metal/MET-05_Oxidized_Copper',
  'MET-09': 'metal/MET-09_Oxide_Stained_Brass', 'MET-10': 'metal/MET-10_Amethyst_Corrosion', 'CLOTH-05': 'sailcloth/CLOTH-05_Deep_Plum_Woven_Sail',
  'WOOD-01': 'wood/WOOD-01_End_Grain_Timber', 'WOOD-02': 'wood/WOOD-02_Scroll_Cut_Blackwood', 'WOOD-03': 'wood/WOOD-03_Rootwood_Grain',
  'WOOD-05': 'wood/WOOD-05_Violet_Streak_Blackwood', 'SHIP-05': 'ship_planks/SHIP-05_Red_Mahogany',
};
export const D2R = Math.PI / 180, ELEV = 30;
const W = 128, H = 192;
export const SS = 4; // render px per art px before the box filter

const images = {};
async function loadTextures() {
  const loader = new THREE.TextureLoader();
  await Promise.all(Object.entries(FILES).map(async ([id, f]) => { images[id] = await loader.loadAsync(TEX + f + '.png'); images[id].userData.src = TEX + f + '.png'; })); // src: modelJSON links the file
}
/** A material on texture `id`: one tile per `tile` units, or `rep` repeats for uv 0..1 (cylinders, spheres). */
export function mat(id, { tile = 30, rep = null, metal = 0.6, rough = 0.5, color = 0xffffff, emissive = 0, ei = 1, env = 0.8, flat = false } = {}) {
  const t = images[id].clone();
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (rep) t.repeat.set(...rep); else t.repeat.set(1 / tile, 1 / tile);
  t.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: t, metalness: metal, roughness: rough, color, emissive, emissiveIntensity: ei, envMapIntensity: env, flatShading: flat });
}

// ------------------------------------------------------------------ shape helpers
export const mirror = (half) => [...half, ...half.slice().reverse().map(([x, y]) => [-x, y])]; // half: x >= 0, top to bottom
export function shape(pts) { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return s; }
export function smooth(pts, n = 4) { // Catmull-Rom through a closed outline
  const c = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'centripetal');
  return c.getPoints(pts.length * n).slice(0, -1).map((v) => [v.x, v.y]);
}
export function inset(pts, d) {
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return pts.map(([x, y]) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; return [x - dx / l * d, y - dy / l * d]; });
}
export const extrude = (s, depth, bevel = 0.4) => new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 });
/** Bow a face part back round the shield's curve: z drops with x^2 / kx (+ y^2 / ky for a dome). */
export function bow(g, kx, ky = 0) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - p.getX(i) ** 2 / kx - (ky ? p.getY(i) ** 2 / ky : 0));
  g.computeVertexNormals();
  return g;
}
export function cyl(r0, r1, y0, y1, m, seg = 12) {
  const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg, 1); g.translate(0, (y0 + y1) / 2, 0);
  return new THREE.Mesh(g, m);
}
export const band = (r, y, m, h = 1) => cyl(r, r, y - h / 2, y + h / 2, m);
export function ball(r, y, m, seg = 12) { const s = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.ceil(seg * 0.7)), m); s.position.y = y; return s; }
export function cone(r, h, m, seg = 8) { return new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m); }
/** A cone standing on `at`, pointing along `dir`. */
export function spike(r, h, m, at, dir, seg = 6) {
  const s = cone(r, h, m, seg), d = new THREE.Vector3(...dir).normalize();
  s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  s.position.set(...at).addScaledVector(d, h / 2);
  return s;
}
export function fib(n) { // n directions spread over a sphere
  const out = [], ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) { const y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(1 - y * y); out.push([Math.cos(ga * i) * r, y, Math.sin(ga * i) * r]); }
  return out;
}
/** Grip, pommel and a collar: the lower end every weapon shares. */
export function hilt(g, wrap, metal, top = 4.2) {
  g.add(ball(1.45, -5.4, metal, 10), band(1.2, -4.3, metal, 0.9), cyl(0.95, 0.95, -3.9, top - 0.3, wrap), band(1.2, top, metal, 0.9));
}

// ------------------------------------------------------------------ weapons (one-handed, ~38 art px pommel to tip)
function flanged() {
  const g = new THREE.Group();
  const steel = mat('MET-06', { rep: [1, 2], metal: 0.85, rough: 0.32 }), gold = mat('GOLD-01', { rep: [1, 0.5], metal: 0.9, rough: 0.32 });
  const wrap = mat('CLOTH-02', { rep: [1, 1], metal: 0, rough: 0.9, color: 0x9a6a48 });
  const blade = mat('MET-06', { tile: 8, metal: 0.8, rough: 0.3, color: 0xe4e4ee, flat: true });
  hilt(g, wrap, gold);
  g.add(cyl(0.85, 0.78, 4.6, 21.5, steel), band(1.1, 13, gold, 0.8));
  g.add(cyl(1.6, 1.4, 21, 30.5, mat('MET-01', { rep: [1, 1], metal: 0.8, rough: 0.5, color: 0x8a8890 }), 8));
  const fl = extrude(shape([[1, 20.6], [2.1, 20.6], [4.6, 23.4], [3.6, 25.6], [4.6, 29.2], [2.3, 31.4], [1, 31.2]]), 0.9, 0.25); fl.translate(0, 0, -0.45);
  for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(fl, blade); f.rotation.y = (i / 6) * Math.PI * 2; g.add(f); }
  g.add(band(2.1, 21.2, gold, 1.1));
  const cap = cone(1.6, 2, gold, 8); cap.position.y = 32.2; g.add(cap);
  return g;
}
function morningstar() {
  const g = new THREE.Group();
  const wood = mat('WOOD-04', { rep: [1, 4], metal: 0, rough: 0.7, color: 0xc89870 }), iron = mat('MET-02', { rep: [1, 1], metal: 0.75, rough: 0.45, color: 0xb8b4c0 });
  const steel = mat('MET-06', { tile: 6, metal: 0.85, rough: 0.3 }), wrap = mat('CLOTH-02', { rep: [1, 1], metal: 0, rough: 0.9, color: 0x7a5038 });
  hilt(g, wrap, iron);
  g.add(cyl(1.0, 0.9, 4.6, 21.5, wood), band(1.15, 12, iron, 0.8), band(1.4, 21.2, iron, 1.4));
  g.add(ball(3.7, 25.6, iron, 14));
  for (const d of fib(16)) g.add(spike(0.75, 2.6, steel, [d[0] * 3.3, 25.6 + d[1] * 3.3, d[2] * 3.3], d));
  return g;
}
function warhammer() {
  const g = new THREE.Group();
  const steel = mat('MET-06', { rep: [1, 2], metal: 0.85, rough: 0.32 }), gold = mat('GOLD-04', { rep: [1, 0.5], metal: 0.9, rough: 0.32 });
  const dark = mat('MET-01', { tile: 6, metal: 0.8, rough: 0.45, color: 0xb0aab8, flat: true }), wrap = mat('CLOTH-02', { rep: [1, 1], metal: 0, rough: 0.9, color: 0x6a4a3a });
  hilt(g, wrap, gold);
  g.add(cyl(0.85, 0.8, 4.6, 27, steel), band(1.1, 14, gold, 0.8));
  const head = new THREE.Group(); head.position.y = 24;
  const block = new THREE.Mesh(new THREE.BoxGeometry(5.6, 3.8, 3.8), dark); block.position.x = 2.2; head.add(block);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.1, 1.2, 8), steel); face.rotation.z = Math.PI / 2; face.position.x = 5.4; head.add(face);
  head.add(spike(1.5, 6.2, dark, [-0.4, 0, 0], [-1, -0.28, 0]));
  const collar = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.6, 4.2), gold); head.add(collar);
  g.add(head, spike(0.9, 4.5, steel, [0, 26.2, 0], [0, 1, 0]));
  return g;
}
function scepter() {
  const g = new THREE.Group();
  const gold = mat('GOLD-01', { rep: [1, 1.5], metal: 0.95, rough: 0.28 }), gilt = mat('GOLD-04', { tile: 6, metal: 0.95, rough: 0.3 });
  const wrap = mat('CLOTH-04', { rep: [1, 1], metal: 0, rough: 0.85, color: 0xb03028 });
  hilt(g, wrap, gold);
  g.add(cyl(0.85, 0.75, 4.6, 22, gold), band(1.15, 10, gilt, 0.9), band(1.15, 16, gilt, 0.9), ball(1.6, 22.4, gilt, 10));
  // a sun: a ring of rays round a burning gem, facing local +Z
  const sun = new THREE.Group(); sun.position.y = 27.4;
  sun.add(new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.75, 8, 18), gilt));
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; sun.add(spike(0.85, i % 2 ? 2.2 : 3.6, gold, [Math.sin(a) * 3.6, Math.cos(a) * 3.6, 0], [Math.sin(a), Math.cos(a), 0])); }
  const gem = new THREE.Mesh(new THREE.SphereGeometry(1.9, 12, 9), new THREE.MeshStandardMaterial({ color: 0xfff0b0, emissive: 0xffc040, emissiveIntensity: 1.6, roughness: 0.2 }));
  gem.scale.z = 0.7; sun.add(gem);
  g.add(sun);
  return g;
}
export const WEAPONS = {
  flanged: { label: 'Flanged mace', build: flanged },
  morningstar: { label: 'Morning star', build: morningstar },
  warhammer: { label: 'War hammer', build: warhammer, face: true },
  scepter: { label: 'Sun scepter', build: scepter, face: true },
};

// ------------------------------------------------------------------ shields (face +Z, grip at the origin)
// the attempt's shield finish: 1 linen heater, dark oak round; 2 silver heater, pale oak; 3 enamel heater, cedar;
// 4 ivory enamel on a deeper-curved heater
let look = 1;
export const setLook = (n) => { look = n; };
function heater() {
  const g = new THREE.Group(), K = look >= 4 ? 60 : 120;
  const out = smooth([[-13, 14.5], [0, 15.2], [13, 14.5], [13.2, 5], [11.4, -5], [7.4, -13], [0, -19.5], [-7.4, -13], [-11.4, -5], [-13.2, 5]]);
  const field = look >= 4 ? new THREE.MeshStandardMaterial({ color: 0xc4b9a4, metalness: 0.15, roughness: 0.5, envMapIntensity: 1 })
    : look === 3 ? new THREE.MeshStandardMaterial({ color: 0xe9e3d6, metalness: 0.1, roughness: 0.42, envMapIntensity: 1.2 })
    : look === 2 ? mat('MET-06', { tile: 18, metal: 0.3, rough: 0.32, color: 0xf6f2ea, env: 1.3 })
      : mat('CLOTH-04', { tile: 22, metal: 0.05, rough: 0.7, color: 0xfff4e0, env: 1.1 });
  const wood = mat('SHIP-02', { tile: 26, metal: 0, rough: 0.9 });
  const gold = mat('GOLD-04', { tile: 18, metal: 0.9, rough: 0.3 }), steel = mat('MET-06', { tile: 12, metal: 0.85, rough: 0.3 });
  const body = new THREE.Mesh(bow(extrude(shape(out), 1.4, 0.35), K), [field, wood]); body.position.z = -1.4; g.add(body);
  const rim = shape(out); rim.holes.push(shape(inset(out, 1.8).reverse()));
  const rm = new THREE.Mesh(bow(extrude(rim, 0.8, 0.3), K), gold); rm.position.z = 0.05; g.add(rm);
  const cross = shape([[-1.6, 12], [1.6, 12], [1.6, 4.2], [9.4, 4.2], [9.4, 1.2], [1.6, 1.2], [1.6, -15.4], [-1.6, -15.4], [-1.6, 1.2], [-9.4, 1.2], [-9.4, 4.2], [-1.6, 4.2]]);
  const cm = new THREE.Mesh(bow(extrude(cross, 0.5, 0.3), K), gold); cm.position.z = 0.1; g.add(cm);
  const boss = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel);
  boss.rotation.x = Math.PI / 2; boss.position.set(0, 2.7, 0.5); boss.scale.set(1, 0.6, 1); g.add(boss);
  return { g, grip: [0, 0] };
}
function kite() {
  const g = new THREE.Group(), K = 90;
  const out = smooth([[0, 18.5], [6.6, 17.4], [10.6, 13], [11, 6], [9.4, -4], [6, -13], [0, -24], [-6, -13], [-9.4, -4], [-11, 6], [-10.6, 13], [-6.6, 17.4]]);
  const field = mat('MET-08', { tile: 20, metal: 0.55, rough: 0.45, color: 0x8ca8e0 }), wood = mat('SHIP-02', { tile: 26, metal: 0, rough: 0.9 });
  const gold = mat('GOLD-01', { tile: 16, metal: 0.9, rough: 0.3 });
  const body = new THREE.Mesh(bow(extrude(shape(out), 1.4, 0.35), K), [field, wood]); body.position.z = -1.4; g.add(body);
  const rim = shape(out); rim.holes.push(shape(inset(out, 1.7).reverse()));
  const rm = new THREE.Mesh(bow(extrude(rim, 0.8, 0.3), K), gold); rm.position.z = 0.05; g.add(rm);
  // an eight-pointed gold star over a long gold stripe
  const stripe = new THREE.Mesh(bow(extrude(shape([[-1.2, 15], [1.2, 15], [1.2, -20], [-1.2, -20]]), 0.4, 0.25), K), gold); stripe.position.z = 0.1; g.add(stripe);
  const star = [];
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = i % 2 ? 2.4 : 6.6; star.push([Math.sin(a) * r, 5 + Math.cos(a) * r]); }
  const st = new THREE.Mesh(bow(extrude(shape(star), 0.6, 0.3), K), gold); st.position.z = 0.25; g.add(st);
  return { g, grip: [0, 4] };
}
function round() {
  const g = new THREE.Group(), K = 70, R = 13;
  const out = []; for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; out.push([Math.cos(a) * R, Math.sin(a) * R]); }
  const planks = look >= 3 ? mat('WOOD-04', { tile: 20, metal: 0, rough: 0.75, color: 0xf0d8b8 })
    : mat('SHIP-02', { tile: 24, metal: 0, rough: 0.85, color: look === 2 ? 0xfff0dc : 0xe0c8a8, env: look === 2 ? 1.4 : 1 });
  const iron = mat('MET-02', { tile: 14, metal: 0.8, rough: 0.4, color: look >= 2 ? 0xe8e4f0 : 0xc8c4d0 });
  const steel = mat('MET-06', { tile: 10, metal: 0.85, rough: 0.3 });
  const body = new THREE.Mesh(bow(extrude(shape(out), 1.4, 0.35), K, K), [planks, planks]); body.position.z = -1.4; g.add(body);
  const rim = shape(out); rim.holes.push(shape(inset(out, 1.6).reverse()));
  const rm = new THREE.Mesh(bow(extrude(rim, 0.9, 0.3), K, K), iron); rm.position.z = 0.05; g.add(rm);
  for (const a of [0, 1, 2, 3].map((i) => i * Math.PI / 2 + Math.PI / 4)) { // iron straps out from the boss
    const s = new THREE.Mesh(bow(extrude(shape([[-0.9, 3], [0.9, 3], [0.9, R - 1.2], [-0.9, R - 1.2]]), 0.4, 0.2), K, K), iron);
    s.rotation.z = a; s.position.z = 0.15; g.add(s);
  }
  const boss = new THREE.Mesh(new THREE.SphereGeometry(3.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel);
  boss.rotation.x = Math.PI / 2; boss.position.z = 0.4; boss.scale.set(1, 0.75, 1); g.add(boss);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, r = R - 0.8; const rv = ball(0.45, 0, steel, 6); rv.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.7 - r * r / K * 2); g.add(rv); }
  return { g, grip: [0, 0] };
}
function buckler() {
  const g = new THREE.Group(), K = 30, R = 7.4;
  const out = []; for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2; out.push([Math.cos(a) * R, Math.sin(a) * R]); }
  const steel = mat('MET-06', { tile: 10, metal: 0.85, rough: 0.3 }), gold = mat('GOLD-01', { tile: 10, metal: 0.9, rough: 0.3 });
  const body = new THREE.Mesh(bow(extrude(shape(out), 1, 0.3), K, K), steel); body.position.z = -1; g.add(body);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.6, 6, 32), gold); rim.position.z = -2 * R * R / K + 0.2; g.add(rim);
  g.add(spike(1.6, 3.2, gold, [0, 0, 0.2], [0, 0, 1], 8));
  return { g, grip: [0, 0] };
}
export const SHIELDS = {
  heater: { label: 'Heater shield', build: heater },
  kite: { label: 'Kite shield', build: kite },
  round: { label: 'Round shield', build: round },
  buckler: { label: 'Buckler', build: buckler, fist: true },
};

// ------------------------------------------------------------------ attempts: how the gear sits in the hands
// The Grim Nocturne stance is locked: arms hang at the sides, fists closed at R (the hero's right, screen left) and
// L. fist: [cx, cy, rx, ry] art px. Weapon: dir in hero world (unit-ish), grip depth z, roll about the haft, scale.
// Shield: yaw (face turned out from forward, +X), tilt (top leaning back), lean (top out), face (shield in front of
// the fist along its normal), z, scale; depth 'front' draws it over everything, 'card' lets the sprite hide its back.
export const ATTEMPTS = [
  {
    name: 'Attempt 1', note: 'first fit: mace forward-up-out of the right fist, shield on the left forearm turned 50 degrees out',
    R: [47, 131, 4.5, 5], L: [93, 130, 4.5, 5], fistZ: 3,
    weapon: { dir: [-0.32, 0.78, 0.54], z: 0.5, scale: 1 },
    shield: { yaw: 50, tilt: -8, lean: 0, face: 3, z: 2, scale: 1, depth: 'front' },
  },
  {
    name: 'Attempt 2', note: 'haft raised (less towards the camera) and 15% longer, gear lit from the front too, shields 25-30% bigger and turned 40 out',
    R: [47, 131, 4.5, 5], L: [93, 130, 4.5, 5], fistZ: 3,
    light: { key: 3.4, fill: 1.5, front: 1.4, env: 1.2 },
    weapon: { dir: [-0.42, 0.85, 0.32], z: 0.5, scale: 1.15 },
    shield: { yaw: 40, tilt: -8, lean: 0, face: 3, z: 2, scale: 1.3, depth: 'front' },
    shields: { kite: { scale: 1.2 }, round: { scale: 1.2 }, buckler: { scale: 1.1 } },
  },
  {
    name: 'Attempt 3', note: 'shield turned further out (55) and leaning back, so it reads as strapped on the arm; brighter steel; mace a touch shorter',
    R: [47, 131, 4.5, 5], L: [92, 130, 4.5, 5], fistZ: 3,
    light: { key: 3.8, fill: 1.5, front: 1.4, env: 1.5 },
    weapon: { dir: [-0.42, 0.85, 0.32], z: 0.5, scale: 1.07 },
    shield: { yaw: 55, tilt: -12, lean: 5, face: 3, z: 2, scale: 1.35, depth: 'front' },
    shields: { kite: { scale: 1.25 }, round: { scale: 1.25 }, buckler: { scale: 1.15 } },
  },
  {
    name: 'Attempt 4', note: 'haft swung further out (clear of the forearm) and gripped at the front of the fist, so the pommel shows under the fingers',
    R: [47, 131.5, 4.5, 5], L: [92, 130, 4.5, 5], fistZ: 5,
    light: { key: 3.8, fill: 1.5, front: 1.4, env: 1.5 },
    weapon: { dir: [-0.52, 0.8, 0.3], z: 4, scale: 1.07 },
    shield: { yaw: 55, tilt: -12, lean: 5, face: 3, z: 2, scale: 1.35, depth: 'front' },
    shields: { kite: { scale: 1.25 }, round: { scale: 1.25 }, buckler: { scale: 1.15 } },
  },
  {
    name: 'Attempt 5', note: 'each armor\'s own fists (template-matched, 1-5 px apart): the haft goes into the painted fist on every armor',
    fit: true, R: [48.5, 133.5, 4.5, 4.5], L: [92.5, 132.5], Lnudge: [-0.5, -1], fistZ: 5,
    light: { key: 3.8, fill: 1.5, front: 1.4, env: 1.5 },
    weapon: { dir: [-0.52, 0.8, 0.3], z: 4, scale: 1.07 },
    shield: { yaw: 55, tilt: -12, lean: 5, face: 3, z: 2, scale: 1.35, depth: 'front' },
    shields: { kite: { scale: 1.25 }, round: { scale: 1.25 }, buckler: { scale: 1.15 } },
  },
  {
    name: 'Attempt 6', note: 'the fist is a dome, not a flat card: the haft is hidden in the middle of the hand and comes out over its rim',
    fit: true, R: [48.5, 133.5, 4.5, 4.5], L: [92.5, 132.5], Lnudge: [-0.5, -1], dome: 4.5,
    light: { key: 3.8, fill: 1.5, front: 1.4, env: 1.5 },
    weapon: { dir: [-0.52, 0.8, 0.3], z: 1.5, scale: 1.07 },
    shield: { yaw: 55, tilt: -12, lean: 5, face: 3, z: 2, scale: 1.35, depth: 'front' },
    shields: { kite: { scale: 1.25 }, round: { scale: 1.25 }, buckler: { scale: 1.15 } },
  },
  {
    name: 'Attempt 7', note: 'lit from the front-top as the sprites are painted (the shield face no longer in shadow), white enamel heater, contact shadows on the body',
    fit: true, R: [48.5, 133.5, 4.5, 4.5], L: [92.5, 132.5], Lnudge: [-0.5, -1], dome: 4.5, look: 2,
    light: { key: 3.4, keyAt: [-0.35, 0.9, 1], fill: 1.5, front: 1.0, side: 1.1, env: 1.5 },
    weapon: { dir: [-0.52, 0.8, 0.3], z: 1.5, scale: 1.07, shadow: [1, 1, 0.3] },
    shield: { yaw: 55, tilt: -12, lean: 5, face: 3, z: 2, scale: 1.35, depth: 'front', shadow: [1, 2, 0.42] },
    shields: { kite: { scale: 1.25 }, round: { scale: 1.25 }, buckler: { scale: 1.15 } },
  },
  {
    name: 'Attempt 8', note: 'key light 50 degrees up from the front left in the world (it was nearly overhead), a soft front-right fill, clean enamel heater, cedar round shield',
    fit: true, R: [48.5, 133.5, 4.5, 4.5], L: [92.5, 132.5], Lnudge: [-0.5, -1], dome: 4.5, look: 3,
    light: { key: 3.2, keyAt: [-0.55, 0.45, 0.75], fill: 1.4, front: 0.6, side: 1.2, sideAt: [0.65, 0.35, 0.7], env: 1.4 },
    weapon: { dir: [-0.52, 0.8, 0.3], z: 1.5, scale: 1.07, shadow: [1, 1, 0.3] },
    shield: { yaw: 55, tilt: -12, lean: 5, face: 3, z: 2, scale: 1.35, depth: 'front', shadow: [1, 2, 0.45] },
    shields: { kite: { scale: 1.25 }, round: { scale: 1.25 }, buckler: { scale: 1.15 } },
  },
  {
    name: 'Attempt 9', note: 'ivory enamel instead of paper white, the heater curved twice as deep so its outer edge rolls into shade',
    fit: true, R: [48.5, 133.5, 4.5, 4.5], L: [92.5, 132.5], Lnudge: [-0.5, -1], dome: 4.5, look: 4,
    light: { key: 3.2, keyAt: [-0.55, 0.45, 0.75], fill: 1.4, front: 0.6, side: 1.0, sideAt: [0.65, 0.35, 0.7], env: 1.4 },
    weapon: { dir: [-0.52, 0.8, 0.3], z: 1.5, scale: 1.07, shadow: [1, 1, 0.3] },
    shield: { yaw: 55, tilt: -12, lean: 5, face: 3, z: 2, scale: 1.35, depth: 'front', shadow: [1, 2, 0.45] },
    shields: { kite: { scale: 1.25 }, round: { scale: 1.25 }, buckler: { scale: 1.15 } },
  },
  {
    name: 'Attempt 10', note: 'mace turned round: the head hangs forward and down from the fist, in front of the thigh, the pommel tucked behind the wrist',
    fit: true, R: [48.5, 133.5, 4.5, 4.5], L: [92.5, 132.5], Lnudge: [-0.5, -1], dome: 4.5, look: 4,
    light: { key: 3.2, keyAt: [-0.55, 0.45, 0.75], fill: 1.4, front: 0.6, side: 1.0, sideAt: [0.65, 0.35, 0.7], env: 1.4 },
    weapon: { dir: [0.42, -0.6, 0.68], z: 1.5, scale: 1.07, shadow: [1, 1, 0.3] },
    shield: { yaw: 55, tilt: -12, lean: 5, face: 3, z: 2, scale: 1.35, depth: 'front', shadow: [1, 2, 0.45] },
    shields: { kite: { scale: 1.25 }, round: { scale: 1.25 }, buckler: { scale: 1.15 } },
  },
  {
    name: 'Attempt 11', note: 'mace pointing where the hero faces: the haft level and straight ahead out of the fist, the head towards the viewer',
    fit: true, R: [48.5, 133.5, 4.5, 4.5], L: [92.5, 132.5], Lnudge: [-0.5, -1], dome: 4.5, look: 4,
    light: { key: 3.2, keyAt: [-0.55, 0.45, 0.75], fill: 1.4, front: 0.6, side: 1.0, sideAt: [0.65, 0.35, 0.7], env: 1.4 },
    weapon: { dir: [0, 0, 1], z: 1.5, scale: 1.07, shadow: [1, 1, 0.3] },
    shield: { yaw: 55, tilt: -12, lean: 5, face: 3, z: 2, scale: 1.35, depth: 'front', shadow: [1, 2, 0.45] },
    shields: { kite: { scale: 1.25 }, round: { scale: 1.25 }, buckler: { scale: 1.15 } },
  },
  {
    name: 'Attempt 12', note: 'still level and pointing ahead, but turned 25 degrees out from the body: it runs down-and-out on screen, so it reads as held forward, not hanging',
    fit: true, R: [48.5, 133.5, 4.5, 4.5], L: [92.5, 132.5], Lnudge: [-0.5, -1], dome: 4.5, look: 4,
    light: { key: 3.2, keyAt: [-0.55, 0.45, 0.75], fill: 1.4, front: 0.6, side: 1.0, sideAt: [0.65, 0.35, 0.7], env: 1.4 },
    weapon: { dir: [-0.42, 0, 0.91], z: 1.5, scale: 1.07, shadow: [1, 1, 0.3] },
    shield: { yaw: 55, tilt: -12, lean: 5, face: 3, z: 2, scale: 1.35, depth: 'front', shadow: [1, 2, 0.45] },
    shields: { kite: { scale: 1.25 }, round: { scale: 1.25 }, buckler: { scale: 1.15 } },
  },
  {
    name: 'Attempt 13', note: 'attempt 12 with the scepter\'s sun and the hammer head rolled round the haft to face the viewer (they were edge-on)',
    fit: true, R: [48.5, 133.5, 4.5, 4.5], L: [92.5, 132.5], Lnudge: [-0.5, -1], dome: 4.5, look: 4,
    light: { key: 3.2, keyAt: [-0.55, 0.45, 0.75], fill: 1.4, front: 0.6, side: 1.0, sideAt: [0.65, 0.35, 0.7], env: 1.4 },
    weapon: { dir: [-0.42, 0, 0.91], z: 1.5, scale: 1.07, shadow: [1, 1, 0.3] }, weaponFace: { roll: 'view' },
    shield: { yaw: 55, tilt: -12, lean: 5, face: 3, z: 2, scale: 1.35, depth: 'front', shadow: [1, 2, 0.45] },
    shields: { kite: { scale: 1.25 }, round: { scale: 1.25 }, buckler: { scale: 1.15 } },
  },
  {
    // fitted to the user's drawing over attempt 13: haft up-right at ~32 deg through the fist, head on the belt at
    // (64, 122) ~19 px out, the handle end ~9 px below-left of the fist
    name: 'Attempt 14', note: 'as drawn: held across the front of the body, head up on the belt, fist gripping higher so the handle end shows below-left',
    fit: true, R: [48.5, 133.5, 4.5, 4.5], L: [92.5, 132.5], Lnudge: [-0.5, -1], dome: 4.5, look: 4,
    light: { key: 3.2, keyAt: [-0.55, 0.45, 0.75], fill: 1.4, front: 0.6, side: 1.0, sideAt: [0.65, 0.35, 0.7], env: 1.4 },
    weapon: { dir: [0.66, 0.68, 0.31], z: 1.5, grip: 3.6, scale: 1.07, depth: 'fist', shadow: [1, 1, 0.3] }, weaponFace: { roll: 'view' },
    shield: { yaw: 55, tilt: -12, lean: 5, face: 3, z: 2, scale: 1.35, depth: 'front', shadow: [1, 2, 0.45] },
    shields: { kite: { scale: 1.25 }, round: { scale: 1.25 }, buckler: { scale: 1.15 } },
  },
];

// ------------------------------------------------------------------ where each armor's fists are
// every class's armor-1 fists (pixels; found by matching the Paladin's, the Slime Lord's blue slime hands by colour)
export const HANDS = {
  arcane_sorcerer: { R: [46, 135], L: [90, 135] }, barbarian: { R: [45, 129], L: [92, 131] }, bard: { R: [45, 135], L: [87, 134] },
  boomerang_knight: { R: [44, 134], L: [86, 134] }, carrion_witch: { R: [48, 134], L: [88, 134] }, death_knight: { R: [47, 137], L: [92, 135] },
  dragon_knight: { R: [46, 134], L: [91, 133] }, dragoon: { R: [46, 132], L: [88, 132] }, gunner: { R: [45, 132], L: [89, 131] },
  lancer: { R: [45, 135], L: [92, 135] }, necromancer: { R: [50, 133], L: [91, 132] }, paladin: { R: [48, 133], L: [92, 132] },
  ranger: { R: [46, 134], L: [89, 133] }, slime_lord: { R: [43, 133], L: [88, 132] }, totem_master: { R: [47, 135], L: [93, 134] },
  wizard: { R: [46, 134], L: [91, 133] },
};
export const FIST_R = { slime_lord: 5.5 }; // fist radius (art px) where it is not 4.5
/**
 * Every armor's fists, art px (pixel centres): the class's armor-1 9x9 fist patches matched within a few px on each
 * armor (the stance is locked, but the painted hands sit 1-5 px apart). { [armor]: { R: [x, y], L: [x, y] } }.
 */
export async function findFists(cls = 'paladin') {
  const meta = await fetch(`assets/sprites/gear/${cls}/gear.json`, { cache: 'no-store' }).then((r) => r.json());
  const img = new Image(); img.src = `assets/sprites/gear/${cls}/armor.webp`; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data, [fw, fh] = meta.frame, cols = meta.cols, h = 4;
  const at = (n, X, Y) => ((Math.floor((n - 1) / cols) * fh + Y) * c.width + ((n - 1) % cols) * fw + X) * 4;
  const out = {};
  for (let n = 1; n <= meta.armor.n; n++) out[n] = {};
  for (const [side, [cx, cy]] of Object.entries(HANDS[cls] || HANDS.paladin)) for (let n = 1; n <= meta.armor.n; n++) {
    let best = null;
    for (let dy = -6; dy <= 4; dy++) for (let dx = -5; dx <= 5; dx++) {
      let e = 0, both = 0, miss = 0;
      for (let v = -h; v <= h; v++) for (let u = -h; u <= h; u++) {
        const t = at(1, cx + u, cy + v), p = at(n, cx + dx + u, cy + dy + v), ta = d[t + 3] > 128, pa = d[p + 3] > 128;
        if (ta !== pa) miss++;
        else if (ta) { both++; e += (d[p] - d[t]) ** 2 + (d[p + 1] - d[t + 1]) ** 2 + (d[p + 2] - d[t + 2]) ** 2; }
      }
      e = e / Math.max(1, both) + miss * 400 + (dx * dx + dy * dy) * 30;
      if (!best || e < best[0]) best = [e, dx, dy];
    }
    out[n][side] = [cx + best[1] + 0.5, cy + best[2] + 0.5];
  }
  return out;
}

// ------------------------------------------------------------------ rendering
let R = null;
function rig() {
  if (R) return R;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W * SS, H * SS, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0, 0);
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  // lit as the sprites are painted: a warm key from the upper left front, a cool sky fill, a faint rim from behind right
  const key = new THREE.DirectionalLight(0xfff0d8, 3.2); key.position.set(-0.7, 1, 0.8);
  const fill = new THREE.HemisphereLight(0xd8dcff, 0x40342a, 1.3);
  const rim = new THREE.DirectionalLight(0xffe0b0, 1.0); rim.position.set(0.9, 0.5, -0.6);
  const front = new THREE.DirectionalLight(0xfff4e8, 0); front.position.set(0.1, 0.35, 1);
  const side = new THREE.DirectionalLight(0xfff0e0, 0);
  scene.add(key, fill, rim, front, side);
  const camera = new THREE.OrthographicCamera(0, W, 0, -H, 1, 2000); camera.position.set(0, 0, 1000);
  const plane = new THREE.PlaneGeometry(W, H); plane.translate(W / 2, -H / 2, 0);
  const occluder = () => new THREE.MeshBasicMaterial({ alphaTest: 0.5, colorWrite: false });
  const card = new THREE.Mesh(plane, occluder()); card.renderOrder = -2;
  const fist = new THREE.Mesh(plane, occluder()); fist.renderOrder = -1;
  const bfist = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ colorWrite: false })); bfist.renderOrder = -1; bfist.visible = false; // the bake's plain fist
  scene.add(card, fist, bfist);
  R = { renderer, scene, camera, card, fist, bfist, plane, lights: { key, fill, front, side } };
  return R;
}
/** The fist as a dome (rx, ry, `depth` towards the camera) textured by screen position, so the sprite's fist pixels
 *  stand out of the card round the haft: deepest at the knuckles' middle, flush with the card at the rim. */
function fistDome(f, depth) {
  const g = new THREE.SphereGeometry(1, 16, 12);
  g.scale(f[2], f[3], depth); g.translate(f[0], -f[1], 0);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / W, 1 + p.getY(i) / H);
  return g;
}
/** An attempt's light levels (attempt 1's when it names none). */
function light(A) {
  // light directions are in camera space: +y there is steeply overhead in the world, +z level with the hero's front
  const l = { key: 3.2, keyAt: [-0.7, 1, 0.8], fill: 1.3, front: 0, side: 0, sideAt: [0.7, 0.8, 0.6], env: 1, ...A.light }, { lights, scene } = rig();
  lights.key.intensity = l.key; lights.key.position.set(...l.keyAt);
  lights.fill.intensity = l.fill; lights.front.intensity = l.front; lights.side.intensity = l.side; lights.side.position.set(...l.sideAt);
  scene.environmentIntensity = l.env;
}
/** Free a built item's geometry, materials and texture clones. */
function dispose(o) {
  o.traverse((m) => {
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mt of [].concat(m.material)) { mt.map?.dispose(); mt.dispose(); }
  });
}
const texOf = (c) => { const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; return t; };

/** The sprite's pixels inside the fist ellipse (art px), on an HD canvas the size of the hero. */
function fistMask(hero, f) {
  const c = document.createElement('canvas'); c.width = hero.width; c.height = hero.height;
  const x = c.getContext('2d'), k = hero.width / W;
  x.drawImage(hero, 0, 0); x.globalCompositeOperation = 'destination-in';
  x.beginPath(); x.ellipse(f[0] * k, f[1] * k, f[2] * k, f[3] * k, 0, 0, Math.PI * 2); x.fill();
  return c;
}

/**
 * A weapon in the hand at `f` (art px): grip on the fist centre, haft along `dir` in the hero's world, turned `roll`
 * degrees about the haft ('view': local +Z, a scepter's sun or a hammer's side, turned as far towards the camera as it goes).
 */
export function holdWeapon(obj, f, p, roll) {
  const screen = new THREE.Group(); screen.position.set(f[0], -f[1], p.z);
  const world = new THREE.Group(); world.rotation.x = ELEV * D2R;
  const item = new THREE.Group(), Y = new THREE.Vector3(0, 1, 0);
  const d = new THREE.Vector3(...p.dir).normalize(), q = new THREE.Quaternion().setFromUnitVectors(Y, d);
  if (roll === 'view') {
    const v = new THREE.Vector3(0, Math.sin(ELEV * D2R), Math.cos(ELEV * D2R)); // towards the camera, in the hero's world
    roll = Math.atan2(v.dot(new THREE.Vector3(1, 0, 0).applyQuaternion(q)), v.dot(new THREE.Vector3(0, 0, 1).applyQuaternion(q))) / D2R;
  }
  item.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(Y, roll * D2R));
  // the fist this far up the haft from the model's origin; `plant` (art px): the origin (a staff's foot) stands on that
  // screen row, the fist sliding up the haft to suit this armor's hand
  const down = Math.sin(ELEV * D2R) * d.z - Math.cos(ELEV * D2R) * d.y; // screen px down per haft unit
  obj.position.y = p.plant ? -(p.plant - f[1]) / (-down * (p.scale || 1)) : -(p.grip || 0);
  item.scale.setScalar(p.scale || 1);
  item.add(obj); world.add(item); screen.add(world);
  if (p.flip) screen.scale.x = -1; // mirrored left to right about the fist, as on the screen
  if (p.flipY) screen.scale.y = -1; // and top to bottom
  screen.rotation.z = (p.spin || 0) * D2R; // then turned in the picture about the fist, degrees anticlockwise
  return screen;
}
/** A shield on the forearm at `f`: grip on the fist, face `face` px out along its normal. */
export function holdShield(built, f, p) {
  const screen = new THREE.Group(); screen.position.set(f[0], -f[1], p.z);
  const world = new THREE.Group(); world.rotation.x = ELEV * D2R;
  const item = new THREE.Group(); item.rotation.set(p.tilt * D2R, p.yaw * D2R, -(p.lean || 0) * D2R, 'YXZ');
  item.scale.setScalar(p.scale || 1);
  built.g.position.set(-built.grip[0], -built.grip[1], p.face);
  item.add(built.g); world.add(item); screen.add(world);
  if (p.flip) screen.scale.x = -1; // mirrored left to right about the fist
  if (p.flipY) screen.scale.y = -1; // and top to bottom
  return screen;
}

/** Box-filter the SS render down to the art grid (w x h), snap alpha, and outline it (1 art px, dark). */
function toArt(src, { cut = 0.42, line = [26, 16, 12, 235] } = {}, W = 128, H = 192) {
  const s = document.createElement('canvas'); s.width = W * SS; s.height = H * SS;
  s.getContext('2d').drawImage(src, 0, 0);
  const d = s.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, s.width, s.height).data;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const cx = c.getContext('2d', { willReadFrequently: true }), im = cx.createImageData(W, H), o = im.data, on = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let v = 0; v < SS; v++) for (let u = 0; u < SS; u++) {
      const i = ((y * SS + v) * W * SS + x * SS + u) * 4, al = d[i + 3] / 255;
      r += d[i] * al; g += d[i + 1] * al; b += d[i + 2] * al; a += al;
    }
    if (a / (SS * SS) < cut) continue;
    const i = (y * W + x) * 4; on[y * W + x] = 1;
    o[i] = r / a; o[i + 1] = g / a; o[i + 2] = b / a; o[i + 3] = 255;
  }
  if (line) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (on[i] || !((x > 0 && on[i - 1]) || (x < W - 1 && on[i + 1]) || (y > 0 && on[i - W]) || (y < H - 1 && on[i + W]))) continue;
    o.set(line, i * 4);
  }
  cx.putImageData(im, 0, 0);
  return c;
}

// ------------------------------------------------------------------ baking held gear for the game (tools/weapons3d_render.js)
// Region codes of the palette mask (a material's userData.region): the bake renders them flat (red = code * 40) and keeps
// each art pixel's commonest code; the game recolours metal, trim and grip by the item's finish and tints glow.
export const REGION = { metal: 1, trim: 2, grip: 3, glow: 4, gem: 5, other: 6 };
const regionMats = Object.fromEntries(Object.entries(REGION).map(([k, v]) => [k, new THREE.MeshBasicMaterial({ color: (v * 40) << 16 })]));
const regionOf = (m) => regionMats[m?.userData?.region] || regionMats.other;
/** The region of every on pixel of `art` (w x h) from a flat-coloured SS render: the commonest code among its subpixels. */
function regionArt(src, art, W = 128, H = 192) {
  const s = document.createElement('canvas'); s.width = W * SS; s.height = H * SS;
  s.getContext('2d').drawImage(src, 0, 0);
  const d = s.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, s.width, s.height).data;
  const a = art.getContext('2d').getImageData(0, 0, W, H).data;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const cx = c.getContext('2d'), im = cx.createImageData(W, H), o = im.data, n = new Uint8Array(8);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (a[(y * W + x) * 4 + 3] !== 255) continue; // outline and empty pixels: no region
    n.fill(0);
    for (let v = 0; v < SS; v++) for (let u = 0; u < SS; u++) { const i = ((y * SS + v) * W * SS + x * SS + u) * 4; if (d[i + 3] > 128) n[Math.min(7, Math.round(d[i] / 40))]++; }
    let best = REGION.other, bn = 0;
    for (let k = 1; k < 8; k++) if (n[k] > bn) { bn = n[k]; best = k; }
    const i = (y * W + x) * 4; o[i] = best * 40; o[i + 3] = 255;
  }
  cx.putImageData(im, 0, 0);
  return c;
}
function regionPass(obj, render) {
  const saved = [];
  obj.traverse((m) => { if (m.isMesh) { saved.push([m, m.material]); m.material = Array.isArray(m.material) ? m.material.map(regionOf) : regionOf(m.material); } });
  const out = render();
  for (const [m, mt] of saved) m.material = mt;
  return out;
}
/**
 * One held piece (from weapons3d.js heldItem) rendered alone in the hero frame: no sprite card, a plain dome at the fist
 * hides what passes into it. Returns { art, mask } (128 x 192 canvases, art px) and the markers in art px. Disposes it.
 */
export function bakePiece(it, A) {
  const { renderer, scene, camera, card, fist, bfist, plane } = rig();
  light(A); card.visible = false; fist.visible = false;
  bfist.visible = !!it.dome;
  if (it.dome) bfist.geometry = fistDome(it.hand, it.dome);
  scene.add(it.obj); it.obj.updateMatrixWorld(true);
  const marks = [], v = new THREE.Vector3();
  it.obj.traverse((o) => { if (o.userData?.kind) { o.getWorldPosition(v); marks.push({ kind: o.userData.kind, x: v.x, y: -v.y, r: (o.userData.r || 0) * Math.abs(o.matrixWorld.getMaxScaleOnAxis()) }); } });
  renderer.render(scene, camera);
  const art = toArt(renderer.domElement);
  const mask = regionPass(it.obj, () => { renderer.render(scene, camera); return regionArt(renderer.domElement, art); });
  scene.remove(it.obj); dispose(it.obj);
  if (bfist.geometry !== plane) { bfist.geometry.dispose(); bfist.geometry = plane; }
  bfist.visible = false;
  return { art, mask, marks };
}
/**
 * A design's icon: the piece alone, turned to show itself (haft pieces lying corner to corner), fitted to size x size.
 * Returns { art, mask }. Disposes it.
 */
export function bakeIcon(g, A, { size = 48, diagonal = false, turn = [0.25, 0.5] } = {}) {
  const { renderer, scene, card, fist } = rig();
  light(A); card.visible = false; fist.visible = false;
  const inner = new THREE.Group(), outer = new THREE.Group();
  inner.rotation.set(turn[0], turn[1], 0); inner.add(g); outer.add(inner);
  if (diagonal) outer.rotation.z = -Math.PI / 4;
  scene.add(outer); outer.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(outer), c = box.getCenter(new THREE.Vector3()), e = box.getSize(new THREE.Vector3());
  const half = Math.max(e.x, e.y) * 0.54, cam = new THREE.OrthographicCamera(c.x - half, c.x + half, c.y + half, c.y - half, -2000, 2000);
  cam.position.set(0, 0, 1000);
  renderer.setSize(size * SS, size * SS, false);
  renderer.render(scene, cam);
  const art = toArt(renderer.domElement, {}, size, size);
  const mask = regionPass(outer, () => { renderer.render(scene, cam); return regionArt(renderer.domElement, art, size, size); });
  renderer.setSize(W * SS, H * SS, false);
  scene.remove(outer); dispose(outer);
  return { art, mask };
}

/**
 * A haft piece whole and upright (no fist, the head up), turned a little to show its face, k px per unit: the full
 * piece for the game to draw on its own (the Death Knight's flying sword). Returns { art, mask, marks } with the
 * markers in its px. Leaves g alive (the caller disposes it).
 */
export function bakeFree(g, A, { k = 2, turn = [0.12, 0.42] } = {}) {
  const { renderer, scene, card, fist } = rig();
  light(A); card.visible = false; fist.visible = false;
  const inner = new THREE.Group(); inner.rotation.set(turn[0], turn[1], 0); inner.add(g);
  scene.add(inner); inner.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(inner), x0 = b.min.x - 1, y1 = b.max.y + 1;
  const w = Math.ceil((b.max.x + 1 - x0) * k), h = Math.ceil((y1 - b.min.y + 1) * k);
  const cam = new THREE.OrthographicCamera(x0, x0 + w / k, y1, y1 - h / k, -2000, 2000);
  cam.position.set(0, 0, 1000);
  const marks = [], v = new THREE.Vector3();
  inner.traverse((o) => { if (o.userData?.kind) { o.getWorldPosition(v); marks.push({ kind: o.userData.kind, x: (v.x - x0) * k, y: (y1 - v.y) * k, r: (o.userData.r || 0) * k }); } });
  renderer.setSize(w * SS, h * SS, false);
  renderer.render(scene, cam);
  const art = toArt(renderer.domElement, {}, w, h);
  const mask = regionPass(inner, () => { renderer.render(scene, cam); return regionArt(renderer.domElement, art, w, h); });
  renderer.setSize(W * SS, H * SS, false);
  scene.remove(inner); inner.remove(g);
  return { art, mask, marks };
}
/** A built piece as a three.js JSON object (THREE.ObjectLoader), its textures linked to their files, not inlined. */
export function modelJSON(g) {
  g.updateMatrixWorld(true); // parts placed by position only: their matrices are what the JSON keeps
  const j = g.toJSON(), src = {};
  for (const t of j.textures || []) if (t.userData?.src) src[t.image] = t.userData.src;
  for (const im of j.images || []) if (src[im.uuid]) im.url = src[im.uuid];
  return j;
}

let ready = null;
export const init = () => (ready ||= loadTextures());

/**
 * The hero with his gear: `hero` is heroLook's HD canvas, `kit` { weapon, shield, roll }, `A` an ATTEMPTS entry.
 * Returns an HD canvas the size of the hero.
 */
export function compose(hero, kit, A) {
  look = A.look || 1;
  const w = WEAPONS[kit.weapon], sh = SHIELDS[kit.shield];
  // the fists: the attempt's own, or this armor's found ones (kit.fists) with the attempt's sizes and nudges
  const fit = A.fit && kit.fists, Lo = A.Lnudge || [0, 0];
  const fR = fit ? [...kit.fists.R, A.R[2], A.R[3]] : A.R, fL = fit ? [kit.fists.L[0] + Lo[0], kit.fists.L[1] + Lo[1]] : A.L;
  const wp = { ...A.weapon, ...(w.face ? A.weaponFace : null) };
  return renderKit(hero, [
    // the weapon behind the sprite card and fist card ('fist': only the fist hides it, for a weapon held out from the body)
    { obj: holdWeapon(w.build(), fR, wp, w.face ? (wp.roll ?? 0) : kit.roll), hand: fR, depth: A.weapon.depth === 'fist' ? 'fist' : 'card', dome: A.dome, fistZ: A.fistZ, shadow: A.weapon.shadow },
    // the shield: over everything, or behind the card where it swings back past the body
    { obj: holdShield(sh.build(), fL, { ...A.shield, ...(A.shields?.[kit.shield]) }), depth: A.shield.depth, shadow: A.shield.shadow },
  ], A);
}

/**
 * The hero with held items, each { obj (placed by holdWeapon / holdShield), hand [cx, cy, rx, ry] of the fist round
 * it (none: no fist hides it), dome (the fist's depth) or fistZ (a flat fist card), depth ('card': the sprite hides
 * what passes behind it, else only the fist), shadow [dx, dy, alpha] }. Each is rendered alone with its own
 * occluders, filtered to the art grid and outlined, then laid over the sprite in order. Returns an HD canvas.
 */
export function renderKit(hero, items, A) {
  const { renderer, scene, camera, card, fist } = rig();
  light(A);
  const heroTex = texOf(hero); card.material.map = heroTex; card.material.needsUpdate = true;
  const layers = [];
  for (const it of items) {
    const fistTex = it.hand && (it.dome || it.fistZ) ? texOf(fistMask(hero, it.hand)) : null;
    fist.visible = !!fistTex;
    if (fistTex) {
      fist.material.map = fistTex; fist.material.needsUpdate = true;
      if (it.dome) { fist.geometry = fistDome(it.hand, it.dome); fist.position.z = 0; } else { fist.geometry = R.plane; fist.position.z = it.fistZ; }
    }
    card.visible = it.depth === 'card';
    scene.add(it.obj); it.obj.updateMatrixWorld(true);
    // markers (tools/weapons3d_parts.js mark) to art px: sockets and effect points
    it.marks = []; const v = new THREE.Vector3();
    it.obj.traverse((o) => { if (o.userData?.kind) { o.getWorldPosition(v); it.marks.push({ kind: o.userData.kind, x: v.x, y: -v.y, r: (o.userData.r || 0) * Math.abs(o.matrixWorld.getMaxScaleOnAxis()) }); } });
    renderer.render(scene, camera); layers.push([toArt(renderer.domElement), it.shadow]); scene.remove(it.obj);
    dispose(it.obj); fistTex?.dispose();
    if (fist.geometry !== R.plane) { fist.geometry.dispose(); fist.geometry = R.plane; }
  }
  heroTex.dispose();
  const c = document.createElement('canvas'); c.width = hero.width; c.height = hero.height;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  x.drawImage(hero, 0, 0);
  // contact shadows [dx, dy, alpha] (art px): the gear's silhouette, offset, darkening only the sprite under it
  const s = document.createElement('canvas'); s.width = W; s.height = H;
  const sx = s.getContext('2d');
  for (const [l, sh] of layers) if (sh) { sx.globalAlpha = sh[2]; sx.drawImage(l, sh[0], sh[1]); }
  sx.globalAlpha = 1; sx.globalCompositeOperation = 'source-in'; sx.fillStyle = '#0c0806'; sx.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'source-atop'; x.drawImage(s, 0, 0, c.width, c.height); x.globalCompositeOperation = 'source-over';
  for (const [l] of layers) x.drawImage(l, 0, 0, c.width, c.height);
  return c;
}
