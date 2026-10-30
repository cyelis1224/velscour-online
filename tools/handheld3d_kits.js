// Class kits for the hand-held gear rig (tools/handheld3d.js): a main-hand piece and an off-hand piece for every class,
// built in three.js from the material pack, and how each is held (POSE, set for the right hand and mirrored for the
// left). Units are art px of the 128x192 hero frame. 'haft' pieces: local +Y from the grip towards the head (staves
// and spears: the foot at the origin, planted on the ground row); 'euler' pieces: { g, grip }, local +Z the face.
import * as THREE from 'three';
import { mat, shape, smooth, mirror, inset, extrude, bow, cyl, band, ball, cone, spike, WEAPONS, SHIELDS, holdWeapon, holdShield, FIST_R, setLook } from './handheld3d.js';

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const glow = (c, i = 1.8) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.35, metalness: 0 });
const solid = (c, metal = 0, rough = 0.6, env = 1) => new THREE.MeshStandardMaterial({ color: c, metalness: metal, roughness: rough, envMapIntensity: env });
const wrap = (c = 0x6a4a30) => mat('CLOTH-02', { rep: [1, 1], metal: 0, rough: 0.9, color: c });
const put = (o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); return o; };
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
function tube(pts, r, m, seg = 24, rs = 6) { return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => V(...p))), seg, r, rs, false), m); }
/** A flat part: the outline extruded `depth`, centred on z. */
function slab(pts, depth, m, bevel = 0.3, z = 0) { const g = extrude(shape(pts), depth, bevel); g.translate(0, 0, z - depth / 2); return new THREE.Mesh(g, m); }
const down = (o) => { o.rotation.x = Math.PI; return o; }; // a cone pointing down

// ------------------------------------------------------------------ Ranger: a yew longbow and an arrow
function longbow() {
  const g = new THREE.Group(), yew = mat('WOOD-02', { rep: [1, 8], metal: 0, rough: 0.55, color: 0xc08a5a }), gold = mat('GOLD-01', { tile: 6, metal: 0.9, rough: 0.3 });
  const pts = [];
  for (let i = 0; i <= 16; i++) { const t = -1 + i / 8, a = Math.abs(t); pts.push([-13 * t * t + (a > 0.78 ? (a - 0.78) ** 2 * 84 : 0), t * 55, 0]); }
  g.add(tube(pts, 1.05, yew, 56, 6), cyl(1.5, 1.5, -4.5, 4.5, wrap(0x3a5a30)));
  for (const s of [-1, 1]) g.add(put(ball(1.1, 0, gold, 8), pts[0][0], 55 * s));
  g.add(put(cyl(0.36, 0.36, -55, 55, solid(0xb8ae98, 0, 0.6), 4), pts[0][0]));
  return { g, grip: [0, 0] };
}
function arrow() {
  const g = new THREE.Group(), shaft = mat('WOOD-04', { rep: [1, 4], metal: 0, rough: 0.7, color: 0xe0c090 }), steel = mat('MET-06', { tile: 6, metal: 0.9, rough: 0.25 });
  g.add(cyl(0.65, 0.65, -9, 24, shaft, 6), put(cone(1.9, 5, steel, 4), 0, 26.5), cyl(0.8, 0.8, -9.6, -8.6, steel, 6));
  for (let i = 0; i < 3; i++) {
    const f = slab([[0, -8.6], [2.6, -7.4], [2.6, -2.8], [0, -1.6]], 0.25, solid(i ? 0xb02a22 : 0xc8c0b0, 0, 0.8), 0);
    f.rotation.y = i * 2 * Math.PI / 3; g.add(f);
  }
  return g;
}

// ------------------------------------------------------------------ Wizard: a fire staff and a spellbook
function fireStaff() {
  const g = new THREE.Group(), wood = mat('WOOD-03', { rep: [1, 10], metal: 0, rough: 0.7, color: 0xb88058 });
  const gold = mat('GOLD-04', { tile: 6, metal: 0.9, rough: 0.3 }), iron = mat('MET-02', { tile: 8, metal: 0.8, rough: 0.4 });
  const pts = []; for (let i = 0; i <= 12; i++) pts.push([Math.sin(i * 1.9) * 0.45, 2 + i * 9.4, Math.cos(i * 1.4) * 0.35]);
  g.add(tube(pts, 1.15, wood, 60, 7), put(down(cone(1.25, 2.6, iron, 6)), 0, 1.3), band(1.4, 4, iron, 1.2), put(cyl(1.45, 1.45, -5, 5, wrap(0x6a2a2a)), 0, 60));
  g.add(band(1.6, 113, gold, 1.4), band(1.3, 107, gold, 0.8));
  for (let i = 0; i < 3; i++) {
    const a = i * 2 * Math.PI / 3, c = Math.cos(a), s = Math.sin(a);
    g.add(tube([[c * 0.8, 113, s * 0.8], [c * 3.2, 116, s * 3.2], [c * 3.8, 121, s * 3.8], [c * 1.5, 126, s * 1.5]], 0.55, gold, 14, 5));
  }
  const fire = new THREE.Mesh(new THREE.OctahedronGeometry(2.9, 0), glow(0xff7020, 2.4)); fire.scale.y = 1.55; fire.position.y = 121; g.add(fire);
  return g;
}
function spellbook() {
  const g = new THREE.Group(), w = 10, h = 13, t = 3.4;
  const leather = solid(0xa82c2c, 0, 0.55), pages = solid(0xc8bc9c, 0, 0.9), gold = mat('GOLD-01', { tile: 6, metal: 0.9, rough: 0.3 });
  for (const s of [-1, 1]) g.add(put(box(w, h, 0.7, leather), 0, 0, s * (t / 2 - 0.35)));
  g.add(put(box(1, h, t, leather), -w / 2 + 0.5), put(box(w - 1.4, h - 1.2, t - 1.2, pages), 0.5));
  for (const y of [1, -1]) g.add(put(box(2, 2, 0.4, gold), w / 2 - 1, y * (h / 2 - 1), t / 2 + 0.1));
  g.add(put(box(1.6, 2.6, t + 0.4, gold), w / 2 - 0.3));
  const rune = glow(0xffa040, 2.2);
  g.add(put(new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.4, 6, 24), rune), 0.6, 0.4, t / 2 + 0.15), put(box(0.6, 3.8, 0.3, rune), 0.6, 0.4, t / 2 + 0.2));
  return { g, grip: [-w / 2 + 0.5, h / 2 - 2.5] };
}

// ------------------------------------------------------------------ Necromancer: a bone wand and a dark orb
function boneWand() {
  const g = new THREE.Group(), bone = solid(0x9a8c70, 0, 0.5, 0.8), purple = glow(0xc070ff, 2.6), hole = solid(0x140c18, 0, 0.8);
  g.add(cyl(0.8, 0.65, -5, 15, bone, 8), cyl(1, 1, -3.5, 2.5, wrap(0x2a2030)));
  for (const y of [-5, 4.5, 9.5, 14]) g.add(ball(1.05, y, bone, 8));
  const skull = new THREE.Group(); skull.position.y = 18.2;
  const cr = ball(3, 0, bone, 14); cr.scale.set(1, 1.05, 1.1);
  skull.add(cr, put(box(3.2, 1.8, 2.6, bone), 0, -2.6, 0.6));
  for (const x of [-1.15, 1.15]) skull.add(put(ball(1, 0, hole, 8), x, 0, 2.5), put(ball(0.55, 0, purple, 6), x, 0, 3.2));
  g.add(skull);
  return g;
}
function darkOrb() {
  const g = new THREE.Group(), bone = solid(0x9a8c70, 0, 0.5, 0.8), band = glow(0x9a4ae0, 1.3);
  g.add(new THREE.Mesh(new THREE.SphereGeometry(4.6, 20, 14), new THREE.MeshStandardMaterial({ color: 0x1c0c2c, emissive: 0x3a1060, emissiveIntensity: 0.7, roughness: 0.08, metalness: 0.3, envMapIntensity: 1.5 })));
  for (const [rx, rz] of [[1.2, 0.3], [0.4, 1.1]]) { const r = new THREE.Mesh(new THREE.TorusGeometry(4.7, 0.24, 6, 32), band); r.rotation.set(rx, 0, rz); g.add(r); }
  g.add(put(ball(1.6, 0, glow(0xc080ff, 2.4), 10), -0.6, 0.4, 3.4), put(ball(0.7, 0, glow(0xffffff, 2), 6), -1.8, 1.9, 3.9));
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.4, c = Math.cos(a), s = Math.sin(a);
    g.add(tube([[c * 1.2, -6.2, s * 1.2], [c * 4, -4, s * 4], [c * 4.9, -0.8, s * 4.9], [c * 4, 1.6, s * 4]], 0.55, bone, 12, 5));
  }
  g.add(put(down(cone(1.3, 2.4, bone, 6)), 0, -7));
  return { g, grip: [0, 3] };
}

// ------------------------------------------------------------------ Barbarian: a bearded axe and a hand axe
function beardedAxe(len = 32, k = 1) {
  const g = new THREE.Group(), ash = mat('WOOD-04', { rep: [1, 5], metal: 0, rough: 0.7, color: 0xc89868 });
  const iron = mat('MET-01', { tile: 6, metal: 0.8, rough: 0.45, color: 0xb8b0b8, flat: true }), edge = mat('MET-06', { tile: 6, metal: 0.9, rough: 0.2 });
  g.add(cyl(1.1, 1.0, -6, len + 2, ash, 8), cyl(1.3, 1.3, -5, 3, wrap(0x5a3a28)), band(1.4, -6, iron, 1));
  const y = len - 6;
  g.add(slab([[1, y + 4 * k], [5 * k, y + 6 * k], [10 * k, y + 9 * k], [11.5 * k, y + 3 * k], [11 * k, y - 6 * k], [8 * k, y - 11 * k], [5 * k, y - 5 * k], [1, y - 3 * k]], 1.4, iron, 0.35));
  g.add(tube([[10 * k, y + 9 * k, 0], [11.6 * k, y + 3 * k, 0], [11.1 * k, y - 6 * k, 0], [8 * k, y - 11 * k, 0]], 0.75, edge, 16, 5));
  g.add(spike(1.4 * k, 5 * k, iron, [-0.8, y + 1, 0], [-1, 0.15, 0], 6), put(cyl(1.6, 1.6, -3, 3, iron, 8), 0, y + 1));
  return g;
}
function greatAxe() { // planted: the butt at the origin
  const g = new THREE.Group(), ash = mat('WOOD-04', { rep: [1, 10], metal: 0, rough: 0.7, color: 0xb88a60 });
  const iron = mat('MET-01', { tile: 8, metal: 0.8, rough: 0.45, color: 0xb8b0b8, flat: true }), edge = mat('MET-06', { tile: 8, metal: 0.9, rough: 0.2 }), bone = solid(0xa89a80, 0, 0.5);
  g.add(cyl(1.5, 1.35, 2, 100, ash, 8), put(down(cone(1.5, 3, iron, 6)), 0, 1.5), put(cyl(1.75, 1.75, -6, 6, wrap(0x5a3a28)), 0, 60));
  for (const y of [30, 72, 80]) g.add(band(1.75, y, iron, 1.2));
  const y = 90, k = 1.6;
  g.add(slab([[1.4, y + 4 * k], [5 * k, y + 6 * k], [10 * k, y + 9.5 * k], [11.6 * k, y + 3 * k], [11 * k, y - 6 * k], [8 * k, y - 11.5 * k], [5 * k, y - 5 * k], [1.4, y - 3 * k]], 2, iron, 0.4));
  g.add(tube([[10 * k, y + 9.5 * k, 0], [11.7 * k, y + 3 * k, 0], [11.2 * k, y - 6 * k, 0], [8 * k, y - 11.5 * k, 0]], 1, edge, 16, 5));
  g.add(slab([[-1.4, y + 3], [-6, y + 5], [-9.5, y + 1], [-6, y - 3], [-1.4, y - 2]], 2, iron, 0.4));
  g.add(put(cyl(2.1, 2.1, -6, 6, iron, 8), 0, y + 1), spike(1.4, 6, iron, [0, y + 7, 0], [0, 1, 0], 6));
  for (const [x, yy] of [[-4, y - 6], [-5.4, y - 10]]) g.add(put(cyl(0.6, 0.6, -2.5, 0, bone, 5), x, yy)); // bone charms on thongs
  g.add(put(cyl(0.2, 0.2, -6, 0, solid(0x5a4030), 4), -4.6, y - 1));
  return g;
}

// ------------------------------------------------------------------ Dragoon: a dragon spear and a dragon-eye buckler
function dragonSpear() {
  const g = new THREE.Group(), wood = mat('WOOD-05', { rep: [1, 10], metal: 0, rough: 0.6, color: 0xa88898 }), gold = mat('GOLD-01', { tile: 6, metal: 0.9, rough: 0.3 });
  const steel = mat('MET-08', { tile: 8, metal: 0.85, rough: 0.25, color: 0xd8e4ff }), red = solid(0xc02a20, 0, 0.8);
  g.add(cyl(1.1, 1.05, 3, 108, wood, 8), put(down(cone(1.1, 3, steel, 6)), 0, 1.5), put(cyl(1.5, 1.5, -5, 5, wrap(0x2a3a6a)), 0, 60));
  for (const y of [30, 88, 100]) g.add(band(1.35, y, gold, 1));
  g.add(put(down(cone(2.8, 6.5, red, 10)), 0, 104), cyl(1.6, 1.3, 107, 112, gold, 8));
  g.add(slab(smooth([[0, 111.5], [2.5, 116], [2.7, 122], [0, 134], [-2.7, 122], [-2.5, 116]], 3), 1, steel, 0.3));
  for (const s of [-1, 1]) g.add(slab([[s * 1.2, 111], [s * 6, 113.5], [s * 7.8, 118.6], [s * 5, 116.2], [s * 1.2, 114.6]], 0.9, gold, 0.25));
  return g;
}
function dragonBuckler() {
  const g = new THREE.Group(), K = 34, R = 8.6, out = [];
  for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; out.push([Math.cos(a) * R, Math.sin(a) * R]); }
  const scale = mat('MET-04', { tile: 6, metal: 0.8, rough: 0.35, color: 0xd87050 }), gold = mat('GOLD-01', { tile: 8, metal: 0.9, rough: 0.3 });
  g.add(put(new THREE.Mesh(bow(extrude(shape(out), 1, 0.3), K, K), scale), 0, 0, -1));
  for (const r of [7.9, 5.2]) g.add(put(new THREE.Mesh(new THREE.TorusGeometry(r, 0.45, 6, 36), gold), 0, 0, 0.1 - r * r / K));
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.5, r = 6.5; g.add(spike(0.75, 2.4, gold, [Math.cos(a) * r, Math.sin(a) * r, -r * r / K + 0.2], [0, 0, 1], 5)); }
  const eye = ball(1, 0, glow(0xffa020, 2.4), 12); eye.scale.set(1.7, 2.7, 0.8); eye.position.z = 0.4;
  g.add(eye, put(box(0.55, 3.8, 0.3, solid(0x140a06)), 0, 0, 1.15));
  return { g, grip: [0, 0] };
}

// ------------------------------------------------------------------ Totem Master: a totem staff and a hand idol
function totemStaff() {
  const g = new THREE.Group(), wood = mat('WOOD-01', { rep: [1, 10], metal: 0, rough: 0.75, color: 0xd0a878 }), teal = mat('MET-05', { tile: 6, metal: 0.3, rough: 0.6, color: 0x90f0d8 });
  const red = solid(0xc03a2a, 0, 0.7), eye = glow(0x60ff90, 2.6), white = solid(0xf0e8d8, 0, 0.8);
  g.add(cyl(1.2, 1.1, 0, 101, wood, 8), put(cyl(1.45, 1.45, -5, 5, wrap(0x7a3a20)), 0, 60), band(1.5, 30, red, 1.2), band(1.5, 90, teal, 1.6));
  const t = new THREE.Group(); t.position.y = 106;
  t.add(box(6, 8, 4.4, wood), put(box(6.4, 1.2, 4.8, teal), 0, -3.6), put(box(6.4, 1.2, 4.8, red), 0, 3.4));
  for (const x of [-1.5, 1.5]) t.add(put(box(1.4, 1.2, 0.4, eye), x, 1, 2.3));
  t.add(spike(1.2, 3.6, red, [0, -0.6, 2.2], [0, -0.35, 1], 4));
  for (const s of [-1, 1]) t.add(slab([[s * 3, 2], [s * 9, 6], [s * 10, 2.5], [s * 8, 0.5], [s * 9, -1.6], [s * 3, -2]], 0.8, teal, 0.25));
  t.add(put(box(4, 3.4, 3.4, wood), 0, 5.8), spike(1.6, 4, red, [0, 7.5, 0], [0, 1, 0], 4));
  for (const s of [-1, 1]) for (const k of [0, 1]) {
    const f = slab([[0, 0], [0.9, -1.2], [0.6, -3.8], [0, -4.6], [-0.6, -3.8], [-0.9, -1.2]], 0.25, k ? white : red, 0);
    f.position.set(s * (7 + k * 2), -1.5, 0.3); f.rotation.z = s * 0.12; t.add(f);
  }
  g.add(t);
  return g;
}
function handTotem() {
  const g = new THREE.Group(), wood = mat('WOOD-04', { rep: [1, 1], metal: 0, rough: 0.7, color: 0xb88050 }), teal = mat('MET-05', { tile: 4, metal: 0.3, rough: 0.6, color: 0x60c8b0 });
  const eye = glow(0x60ff90, 2.6), red = solid(0xa83224, 0, 0.7), dark = solid(0x24160c, 0, 0.8);
  g.add(put(box(3.4, 4, 3, wood), 0, -3.4), put(box(4.4, 4.6, 3.4, teal), 0, 0.8), put(box(4, 0.8, 3.6, red), 0, -1.2));
  for (const x of [-1.1, 1.1]) g.add(put(box(1.1, 1, 0.4, eye), x, 1.6, 1.75));
  g.add(put(box(2.4, 0.7, 0.4, dark), 0, -0.2, 1.75));
  const head = new THREE.Group(); head.position.y = 4.8;
  head.add(box(3.6, 3, 3.2, wood), spike(0.9, 2.4, red, [0, -0.2, 1.5], [0, -0.4, 1], 4));
  for (const x of [-0.9, 0.9]) head.add(put(box(0.8, 0.7, 0.3, eye), x, 0.5, 1.65));
  for (const s of [-1, 1]) head.add(slab([[s * 1.6, 0.8], [s * 6, 3], [s * 6.6, 0.8], [s * 5, -0.4], [s * 1.6, -0.8]], 0.6, teal, 0.2));
  g.add(head);
  return { g, grip: [0, -3.6] };
}

// ------------------------------------------------------------------ Death Knight: a runeblade and a frost skull
function runeblade() {
  const g = new THREE.Group(), iron = mat('MET-01', { tile: 6, metal: 0.8, rough: 0.45, color: 0x9a9aa8 }), steel = mat('MET-06', { tile: 14, metal: 0.9, rough: 0.2, color: 0xd8e2f0 });
  const ice = glow(0x60d0ff, 2.6), dark = solid(0x1a2230, 0.6, 0.4);
  g.add(slab([[0, 0], [3, 7], [4.2, 16], [4.4, 44], [5, 50], [-5, 50], [-4.4, 44], [-4.2, 16], [-3, 7]], 1.4, steel, 0.4));
  for (const z of [1.05, -1.05]) {
    g.add(put(box(1.8, 36, 0.2, dark), 0, 28, z), put(box(1, 34, 0.25, ice), 0, 28, z * 1.03));
    for (const y of [14, 21, 28, 35, 42]) g.add(put(box(3.2, 0.9, 0.25, ice), 0, y, z * 1.03));
  }
  g.add(slab([[-13, 53.4], [-9, 50.4], [-3.4, 50.8], [0, 49.8], [3.4, 50.8], [9, 50.4], [13, 53.4], [10.6, 55], [3.8, 53.8], [-3.8, 53.8], [-10.6, 55]], 2.4, iron, 0.4));
  for (const s of [-1, 1]) g.add(spike(1, 5, iron, [s * 12, 53.4, 0], [s, 0.8, 0], 5));
  const skull = ball(2.5, 0, solid(0x8c98a8, 0, 0.45), 12); skull.scale.set(1, 1.05, 0.9);
  g.add(put(skull, 0, 52.6, 0.8));
  for (const x of [-0.9, 0.9]) g.add(put(ball(0.65, 0, ice, 6), x, 52.8, 3));
  g.add(cyl(1.3, 1.3, 54, 67, wrap(0x24242c)), band(1.6, 60.5, iron, 0.8), put(ball(2.2, 0, iron, 10), 0, 69), spike(0.9, 3.4, iron, [0, 70.8, 0], [0, 1, 0], 5));
  return g;
}
function frostSkull() {
  const g = new THREE.Group(), bone = solid(0x7c8c9c, 0, 0.45, 0.9), ice = glow(0x60d0ff, 2.6), hole = solid(0x0c1420, 0, 0.8);
  const crystal = new THREE.MeshStandardMaterial({ color: 0x48a8e0, emissive: 0x1a70c0, emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.1 });
  const cr = ball(3.6, 0.6, bone, 16); cr.scale.set(1, 1, 1.1);
  g.add(cr, put(box(4, 2.2, 3, bone), 0, -2.8, 0.9), put(box(0.8, 1, 0.4, solid(0x101418)), 0, -1.1, 3.7));
  for (const x of [-1.4, 1.4]) g.add(put(ball(1.4, 0, hole, 8), x, 0.4, 2.8), put(ball(0.4, 0, ice, 6), x, 0.4, 4.1));
  for (const [x, y, z, l] of [[0, 5, 0, 6], [2.2, 4, -0.5, 4.6], [-2.2, 3.8, 0.6, 4.2], [3.2, 2.4, 0.5, 3.2]]) {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), crystal); c.scale.set(0.95, l / 2, 0.95); c.position.set(x, y, z); c.rotation.z = -x * 0.25; g.add(c);
  }
  return { g, grip: [0, 3] };
}

// ------------------------------------------------------------------ Astronomer: a star wand and an armillary sphere
function starWand() {
  const g = new THREE.Group(), gold = mat('GOLD-01', { rep: [1, 1], metal: 0.95, rough: 0.25 }), star = glow(0xd0e8ff, 2.8), blue = glow(0x4a8aff, 1.8);
  g.add(cyl(0.9, 0.9, -4, 3.5, wrap(0x1a2a6a)), ball(1.2, -5, gold, 8), cyl(0.6, 0.5, 3.5, 18.5, gold, 8), band(0.9, 4, gold, 0.8), band(0.8, 11, gold, 0.6));
  const moon = [];
  for (let i = 0; i <= 12; i++) { const a = -2.2 + i / 12 * 4.4; moon.push([Math.sin(a) * 4, 22 - Math.cos(a) * 4]); }
  for (let i = 12; i >= 0; i--) { const a = -1.9 + i / 12 * 3.8; moon.push([Math.sin(a) * 3, 23 - Math.cos(a) * 3.2]); }
  const st = []; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, r = i % 2 ? 1.4 : 5.2; st.push([Math.sin(a) * r, 23.5 + Math.cos(a) * r]); }
  g.add(slab(moon, 0.8, gold, 0.2), slab(st, 0.8, star, 0.2, 0.3), ball(0.9, 18.6, blue, 8));
  return g;
}
function armillary() {
  const g = new THREE.Group(), gold = mat('GOLD-04', { tile: 6, metal: 0.95, rough: 0.25 }), star = glow(0xf0f4ff, 3);
  g.add(new THREE.Mesh(new THREE.SphereGeometry(2.1, 16, 12), glow(0x5a9aff, 2.4)), cyl(0.3, 0.3, -5.6, 5.6, gold, 6));
  for (const [rx, ry] of [[Math.PI / 2, 0], [0.5, 0.9], [-0.6, -0.4]]) { const r = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.42, 6, 40), gold); r.rotation.set(rx, ry, 0); g.add(r); }
  const ecl = new THREE.Mesh(new THREE.TorusGeometry(5.3, 0.55, 6, 40), gold); ecl.rotation.set(1.2, 0, 0.35); g.add(ecl);
  for (const [x, y, z] of [[3.6, 2.8, 1.5], [-3, -3.4, 2], [1, 4.4, -2]]) g.add(put(ball(0.55, 0, star, 6), x, y, z));
  return { g, grip: [0, 3] };
}

// ------------------------------------------------------------------ Carrion Witch: a crow-skull crook and a poison lantern
function crowStaff() {
  const g = new THREE.Group(), wood = mat('WOOD-02', { rep: [1, 10], metal: 0, rough: 0.7, color: 0x9a8a80 }), bone = solid(0xd8ccb0, 0, 0.55, 0.8);
  const black = solid(0x1a1620, 0.1, 0.5), green = glow(0x90ff50, 2.4), twine = solid(0x6a5a40, 0, 0.9);
  const pts = []; for (let i = 0; i <= 12; i++) pts.push([Math.sin(i * 2.3) * 0.6 + (i > 9 ? (i - 9) * 1.4 : 0), i * 9.4, Math.cos(i * 1.7) * 0.5]);
  pts.push([7, 116, 0], [8.6, 121, 0], [6.4, 125.5, 0], [2.6, 124, 0], [2.4, 119.5, 0]);
  g.add(tube(pts, 1.1, wood, 90, 7), put(cyl(1.4, 1.4, -5, 5, wrap(0x3a3040)), 0, 60));
  const sk = new THREE.Group(); sk.position.set(5, 111, 0);
  const cr = ball(1.9, 0, bone, 12); cr.scale.set(1, 0.9, 1.1);
  sk.add(cr, spike(0.9, 5.4, bone, [0, -0.6, 1.4], [0.15, -0.55, 1], 6));
  for (const x of [-0.8, 0.8]) sk.add(put(ball(0.55, 0, green, 6), x, 0.4, 1.6));
  g.add(sk);
  for (const [x, l, k] of [[2, 9, 0], [8.2, 13, 1], [6.4, 7, 0]]) {
    g.add(put(cyl(0.2, 0.2, -l, 0, twine, 4), x, 121 - (x > 7 ? 0 : 4)));
    const y = 121 - (x > 7 ? 0 : 4) - l;
    if (k) g.add(put(slab([[0, 0], [1.2, -2], [0.8, -7], [0, -8], [-0.8, -7], [-1.2, -2]], 0.3, black, 0), x, y));
    else g.add(put(cyl(0.45, 0.45, -3, 0, bone, 5), x, y), put(ball(0.7, 0, bone, 6), x, y - 3));
  }
  return g;
}
function poisonLantern() {
  const g = new THREE.Group(), iron = mat('MET-02', { tile: 6, metal: 0.8, rough: 0.4, color: 0x8a8a90 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x6aa04a, emissive: 0x50d020, emissiveIntensity: 1.6, roughness: 0.1 });
  g.add(new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.45, 6, 16), iron));
  for (const y of [-2.4, -4]) { const l = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.3, 5, 10), iron); l.position.y = y; l.rotation.y = y < -3 ? Math.PI / 2 : 0; g.add(l); }
  const roof = cone(3.4, 2.6, iron, 4); roof.rotation.y = Math.PI / 4; g.add(put(roof, 0, -6));
  g.add(put(box(4.4, 0.8, 4.4, iron), 0, -7.4), put(box(4.4, 0.9, 4.4, iron), 0, -15.4), put(box(3.6, 7.2, 3.6, glass), 0, -11.4));
  for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) g.add(put(box(0.6, 8, 0.6, iron), x, -11.4, z));
  g.add(put(down(cone(0.9, 2, iron, 4)), 0, -16.8));
  return { g, grip: [0, 0] };
}

// ------------------------------------------------------------------ Bard: a lute and a tambourine
function lute() { // the hand on the neck by the pegbox; +Y to the body; the soundboard faces +Z
  const g = new THREE.Group(), maple = mat('SHIP-05', { tile: 6, metal: 0, rough: 0.45, color: 0xd09060, env: 1.2 }), spruce = mat('WOOD-04', { tile: 12, metal: 0, rough: 0.6, color: 0xd8b880 });
  const dark = solid(0x24160c, 0, 0.7), gold = mat('GOLD-01', { tile: 4, metal: 0.9, rough: 0.3 });
  // a pear: the bowl's back from two ellipsoids, a flat soundboard on top
  const bowl = ball(1, 0, maple, 18); bowl.scale.set(6.6, 7.4, 3.6); bowl.position.set(0, 22, -2);
  const neckEnd = ball(1, 0, maple, 14); neckEnd.scale.set(3.8, 5.6, 2.4); neckEnd.position.set(0, 15.4, -1);
  const pear = smooth([[0, 29.4], [4.6, 27.6], [6.4, 22.6], [5.6, 17.6], [3.4, 13.6], [1.4, 11.4], [-1.4, 11.4], [-3.4, 13.6], [-5.6, 17.6], [-6.4, 22.6], [-4.6, 27.6]], 4);
  g.add(bowl, neckEnd, put(new THREE.Mesh(new THREE.ShapeGeometry(shape(pear)), spruce), 0, 0, 1.55));
  g.add(put(new THREE.Mesh(new THREE.CircleGeometry(1.9, 18), dark), 0, 20.6, 1.6), put(new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.35, 5, 20), gold), 0, 20.6, 1.65));
  g.add(put(box(4.4, 0.9, 0.7, dark), 0, 26, 1.85), put(box(2.2, 13, 1.4, maple), 0, 5.5, 0.6), put(box(1.9, 12, 0.35, dark), 0, 6, 1.45));
  const peg = put(box(2, 5.4, 1.3, maple), 0, -2.2, -0.8); peg.rotation.x = -0.9; g.add(peg);
  for (const y of [-1, -2.6, -4]) for (const s of [-1, 1]) g.add(put(box(1.7, 0.6, 0.6, dark), s * 1.4, y, -0.5 + y * 0.6));
  return g;
}
function tambourine() {
  const g = new THREE.Group(), R = 6.2, wood = mat('SHIP-05', { tile: 6, metal: 0, rough: 0.5, color: 0xb86a48 }), gold = mat('GOLD-01', { tile: 4, metal: 0.95, rough: 0.25 });
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 2.8, 32, 1, true), wood); rim.material.side = THREE.DoubleSide; rim.rotation.x = Math.PI / 2;
  g.add(rim, put(new THREE.Mesh(new THREE.CircleGeometry(R, 32), solid(0x8a6a48, 0, 0.85)), 0, 0, 1.4), put(new THREE.Mesh(new THREE.TorusGeometry(R, 0.5, 6, 32), wood), 0, 0, 1.4), put(new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.45, 6, 28), solid(0xa02a28, 0, 0.6)), 0, 0, 1.45));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3, j = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 1.4, 10), gold);
    j.position.set(Math.cos(a) * (R + 0.5), Math.sin(a) * (R + 0.5), 0.6); j.rotation.z = a; g.add(j);
  }
  for (const [x, c] of [[-1.2, 0xc0303a], [1.2, 0x3a60c0]]) g.add(put(slab([[0, 0], [0.8, 0], [1.2, -6], [0.2, -7], [0.6, -3]], 0.2, solid(c, 0, 0.8), 0), x, -R + 0.4, 0.4));
  return { g, grip: [0, R] };
}

// ------------------------------------------------------------------ Slime Lord: a slime mace and a jar of slime
const slimeMat = () => new THREE.MeshStandardMaterial({ color: 0x5ad85a, emissive: 0x188a30, emissiveIntensity: 0.9, roughness: 0.12, metalness: 0.05, envMapIntensity: 1.6 });
function blob(r, seed) {
  const g = new THREE.SphereGeometry(r, 18, 14), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.12 * Math.sin(x * 1.7 + seed) * Math.cos(y * 1.9 - seed) + 0.08 * Math.sin(z * 2.3 + seed * 2);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}
function slimeMace() {
  const g = new THREE.Group(), iron = mat('MET-02', { rep: [1, 2], metal: 0.8, rough: 0.4, color: 0xa0a0b0 }), sl = slimeMat(), hi = glow(0xd0ffb0, 1.8);
  g.add(cyl(0.85, 0.8, -6, 20, iron, 8), cyl(1.1, 1.1, -4.5, 3, wrap(0x2a3040)), band(1.3, 4, iron, 0.9), band(1.6, 19.5, iron, 1.2));
  g.add(put(new THREE.Mesh(blob(4.8, 1.3), sl), 0, 25));
  for (const [x, y, z, r] of [[2.6, 19.8, 1.2, 1], [-2.2, 20.5, 1.8, 0.8], [0.4, 19.4, -2.2, 0.9]]) g.add(put(ball(r, 0, sl, 8), x, y, z), spike(r * 0.8, r * 2.2, sl, [x, y - r * 0.4, z], [0, -1, 0], 6));
  for (const [x, y, z] of [[1.2, 26.4, 3.2], [-1.6, 23.2, 3.4]]) g.add(put(ball(0.6, 0, hi, 6), x, y, z));
  return g;
}
function slimeJar() {
  const g = new THREE.Group(), glass = new THREE.MeshStandardMaterial({ color: 0x8ab0c0, roughness: 0.05, metalness: 0.3, envMapIntensity: 1.6 });
  const cork = mat('WOOD-04', { tile: 4, metal: 0, rough: 0.9, color: 0xc89a68 }), goo = glow(0x48c050, 1.1), hi = glow(0xd0ffb0, 1.8);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 7, 20), goo));
  for (const y of [3.4, -3.4]) { const r = new THREE.Mesh(new THREE.TorusGeometry(3.35, 0.38, 6, 24), glass); r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r); }
  g.add(cyl(2.6, 2.2, 3.4, 4.6, glass, 16), cyl(2, 2, 4.6, 6.6, cork, 12), put(box(3.4, 2.6, 0.3, solid(0xb8a880, 0, 0.9)), 0, -0.4, 3.35));
  for (const [x, y] of [[-1.8, 1.8], [-2.4, -2], [2.2, 2.4]]) g.add(put(ball(0.5, 0, hi, 6), x, y, 2.6));
  return { g, grip: [0, 2] };
}

// ------------------------------------------------------------------ Boomerang Knight: a war boomerang and a throwing one
function boomerang(paint = 0x2ab8a0) {
  const g = new THREE.Group(), wood = mat('WOOD-04', { tile: 10, metal: 0, rough: 0.55, color: 0xc89868 }), gold = mat('GOLD-01', { tile: 4, metal: 0.95, rough: 0.25 });
  const c = new THREE.CatmullRomCurve3([V(-15, 11), V(-6, 3.6), V(0, -0.4), V(6, 3.6), V(15, 11)], false, 'centripetal', 0.2), N = 36, rim = [], inn = [], mid = [], midb = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, p = c.getPointAt(t), d = c.getTangentAt(t), n = V(-d.y, d.x), w = 2.5 * (0.6 + 0.4 * Math.sin(Math.PI * t)), m = 1.1 * Math.sin(Math.PI * t) ** 0.5;
    rim.push([p.x + n.x * w, p.y + n.y * w]); inn.push([p.x - n.x * w, p.y - n.y * w]);
    if (t > 0.08 && t < 0.92) { mid.push([p.x + n.x * m, p.y + n.y * m]); midb.push([p.x - n.x * m, p.y - n.y * m]); }
  }
  g.add(slab([...rim, ...inn.reverse()], 1.1, wood, 0.35), slab([...mid, ...midb.reverse()], 0.3, solid(paint, 0.2, 0.45), 0, 0.75));
  for (const t of [0, 1]) { const p = c.getPointAt(t), cap = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.5, 12), gold); cap.rotation.x = Math.PI / 2; g.add(put(cap, p.x, p.y)); }
  return { g, grip: [-13.4, 9.6] };
}

// ------------------------------------------------------------------ Lancer: a lance and a tower shield
function lance() {
  // a jousting lance: a thin handle up to the hand and its vamplate, then one long cone from the vamplate to the point,
  // painted with a spiral. The fist sits ~57 up the haft when planted.
  const g = new THREE.Group(), cedar = mat('WOOD-04', { rep: [1, 4], metal: 0, rough: 0.6, color: 0xc8a078 }), gold = mat('GOLD-01', { rep: [2, 0.5], metal: 0.9, rough: 0.3 });
  const steel = mat('MET-06', { tile: 6, metal: 0.95, rough: 0.2 }), bronze = mat('MET-04', { rep: [2, 0.6], metal: 0.85, rough: 0.4 });
  const sc = document.createElement('canvas'); sc.width = sc.height = 64;
  const sx = sc.getContext('2d');
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { sx.fillStyle = ((x + y) >> 4) % 2 ? '#22387a' : '#c8bc9e'; sx.fillRect(x, y, 1, 1); }
  const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace; st.wrapS = st.wrapT = THREE.RepeatWrapping; st.repeat.set(1, 7);
  const paint = new THREE.MeshStandardMaterial({ map: st, metalness: 0.05, roughness: 0.45, envMapIntensity: 1.1 });
  const V0 = 61, V1 = 69, R0 = 4.2, TIP = 194; // vamplate from V0 to V1, the cone's base radius
  g.add(cyl(1.6, 1.7, 0, 2.5, bronze, 10), cyl(1.25, 1.35, 2.5, V0, cedar, 10), band(1.55, 30, gold, 1.2), put(cyl(1.6, 1.6, -4.5, 4.5, wrap(0x6a5040)), 0, 55));
  const vm = gold.clone(); vm.side = THREE.DoubleSide;
  const vg = new THREE.CylinderGeometry(R0 + 0.3, 8, V1 - V0, 20, 1, true); vg.translate(0, (V0 + V1) / 2, 0);
  g.add(new THREE.Mesh(vg, vm), put(cyl(8.1, 8.1, -0.45, 0.45, bronze, 20), 0, V0), band(R0 + 0.5, V1, gold, 1.2));
  const shaft = new THREE.CylinderGeometry(1, R0, 180 - V1, 16, 1); shaft.translate(0, (V1 + 180) / 2, 0);
  g.add(new THREE.Mesh(shaft, paint), band(1.25, 180, gold, 1));
  const tip = cone(1.2, TIP - 180, steel, 6); g.add(put(tip, 0, (180 + TIP) / 2));
  return g;
}
function towerShield() {
  const g = new THREE.Group(), K = 80;
  const out = smooth([[0, 21], [7, 20], [11, 18.5], [11.4, 6], [11, -12], [9, -19], [0, -21], [-9, -19], [-11, -12], [-11.4, 6], [-11, 18.5], [-7, 20]]);
  const field = mat('MET-06', { tile: 20, metal: 0.75, rough: 0.3, color: 0xe8ecf4 }), back = mat('SHIP-02', { tile: 26, metal: 0, rough: 0.9 }), gold = mat('GOLD-01', { tile: 16, metal: 0.9, rough: 0.3 });
  g.add(put(new THREE.Mesh(bow(extrude(shape(out), 1.6, 0.4), K), [field, back]), 0, 0, -1.6));
  const rim = shape(out); rim.holes.push(shape(inset(out, 1.9).reverse()));
  g.add(put(new THREE.Mesh(bow(extrude(rim, 0.9, 0.3), K), gold), 0, 0, 0.05));
  const sun = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, r = i % 2 ? 3.4 : 6.6; sun.push([Math.sin(a) * r, 8 + Math.cos(a) * r]); }
  g.add(put(new THREE.Mesh(bow(extrude(shape(sun), 0.6, 0.3), K), gold), 0, 0, 0.2));
  g.add(put(new THREE.Mesh(bow(extrude(shape([[-1.2, 1.4], [1.2, 1.4], [1.2, -18.5], [-1.2, -18.5]]), 0.5, 0.25), K), gold), 0, 0, 0.15));
  return { g, grip: [0, 2] };
}

// ------------------------------------------------------------------ Dragon Knight: a flame sword and a dragon shield
function flameSword() {
  const g = new THREE.Group(), dark = mat('MET-01', { tile: 8, metal: 0.85, rough: 0.35, color: 0x8a8088 }), gilt = mat('GOLD-05', { tile: 6, metal: 0.9, rough: 0.35, color: 0xffc080 });
  g.add(cyl(1.05, 1.05, -4.2, 4, wrap(0x5a1a14)), put(ball(1.6, 0, glow(0xff2a20, 1.8), 10), 0, -5.8));
  for (const s of [-1, 1]) {
    const w = [[0, 4], [s * 3, 4.6], [s * 6.5, 6.4], [s * 8.4, 9.2], [s * 6.4, 8], [s * 5.4, 9.4], [s * 3.6, 7.2], [s * 2.2, 8], [0, 6.4]];
    g.add(slab(s > 0 ? w : w.reverse(), 1.4, gilt, 0.3));
  }
  const blade = [[-3, 6.4], [3, 6.4], [3.4, 16], [2.9, 42], [0, 52], [-2.9, 42], [-3.4, 16]];
  g.add(slab(blade, 1.3, glow(0xff6a20, 2.4), 0.25), slab([[-2, 7], [2, 7], [2.4, 16], [1.9, 41], [0, 47], [-1.9, 41], [-2.4, 16]], 1.7, dark, 0.25));
  return g;
}
function dragonShield() {
  const g = new THREE.Group(), K = 110;
  const out = smooth([[-12, 14], [0, 15], [12, 14], [12.2, 4], [10.6, -6], [6.8, -13.5], [0, -19.5], [-6.8, -13.5], [-10.6, -6], [-12.2, 4]]);
  const field = mat('MET-04', { tile: 18, metal: 0.55, rough: 0.4, color: 0xe85a3a }), back = mat('SHIP-02', { tile: 26, metal: 0, rough: 0.9 });
  const gold = mat('GOLD-01', { tile: 14, metal: 0.9, rough: 0.3 }), bone = solid(0xf0e2c0, 0.1, 0.5), ember = glow(0xff6a10, 2.4);
  g.add(put(new THREE.Mesh(bow(extrude(shape(out), 1.4, 0.35), K), [field, back]), 0, 0, -1.4));
  const rim = shape(out); rim.holes.push(shape(inset(out, 1.8).reverse()));
  g.add(put(new THREE.Mesh(bow(extrude(rim, 0.8, 0.3), K), gold), 0, 0, 0.05));
  const relief = (pts, d, m, z) => g.add(put(new THREE.Mesh(bow(extrude(shape(pts.map(([x, y]) => [x * 1.3, y * 1.3 + 1])), d, 0.3), K), m), 0, 0, z));
  relief(mirror([[0, 8], [2.4, 7.4], [4.2, 5.8], [4.8, 3], [3.6, 0.6], [3, -3], [2.2, -7], [1, -9.6], [0.01, -10]]), 1.2, gold, 0.3);
  for (const s of [-1, 1]) { const h = [[s * 2.6, 7.2], [s * 5, 9], [s * 8.4, 13.4], [s * 6.6, 9.2], [s * 4.2, 6]]; relief(s > 0 ? h : h.reverse(), 1, bone, 0.6); }
  relief(mirror([[0, 3.8], [2, 4.2], [4, 3.2], [3.6, 2.2], [1.8, 2.6], [0.01, 2.4]]), 0.6, solid(0x3a1a10, 0.3, 0.5), 1.4);
  for (const x of [-2.9, 2.9]) { const e = ball(1.1, 0, ember, 8); e.scale.set(1.3, 0.6, 0.6); g.add(put(e, x, 3.1, 2)); }
  for (const x of [-1.2, 1.2]) g.add(put(ball(0.6, 0, ember, 6), x, -9.9, 1.7));
  return { g, grip: [0, 0] };
}

// ------------------------------------------------------------------ Gunner: a flintlock pistol and a lit bomb
function flintlock() { // +Y along the barrel, +X the top of the gun; the hand on the grip at the origin; the side faces +Z
  const g = new THREE.Group(), steel = mat('MET-06', { rep: [1, 2], metal: 0.9, rough: 0.25, color: 0xd0d4dc }), brass = mat('MET-09', { tile: 4, metal: 0.9, rough: 0.3 });
  const wood = mat('SHIP-05', { tile: 8, metal: 0, rough: 0.45, color: 0x8a4a30 });
  // the grip ends inside the fist: no butt or pommel showing past the hand
  g.add(slab([[0.8, 8], [1.6, 8], [1.6, 1.6], [0.6, -0.6], [-0.6, -1.6], [-1.8, -1.2], [-1.6, 0.4], [-0.8, 3.4], [0.4, 5]], 1.7, wood, 0.4));
  g.add(put(cyl(1.2, 1.15, 1, 21, steel, 10), 2.5), put(cyl(1.6, 1.4, -0.9, 0.9, brass, 10), 2.5, 20.6), put(cyl(1.4, 1.4, -0.5, 0.5, brass, 10), 2.5, 8.6));
  g.add(put(box(1.4, 3.4, 2.6, steel), 1.8, 1.6), put(box(2.2, 1, 0.8, steel), 3.6, 0.4));
  const guard = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.25, 5, 12, Math.PI), brass); guard.rotation.z = Math.PI / 2; g.add(put(guard, -0.2, 2.4));
  return g;
}
function bomb() {
  const g = new THREE.Group(), iron = mat('MET-02', { tile: 8, metal: 0.6, rough: 0.4, color: 0x60606c }), brass = mat('MET-09', { tile: 4, metal: 0.9, rough: 0.3 });
  const spark = glow(0xffd040, 3.2);
  g.add(ball(4.2, 0, iron, 18), cyl(1.4, 1.5, 3.6, 5.4, brass, 10), band(1.6, 4, brass, 0.4));
  g.add(tube([[0, 5.2, 0], [0.4, 6.8, 0.3], [1.6, 7.8, 0.6], [2.6, 8.2, 0.4]], 0.4, solid(0xd8c090, 0, 0.9), 10, 5));
  g.add(put(new THREE.Mesh(new THREE.OctahedronGeometry(1.3, 0), spark), 2.9, 8.4, 0.4), put(ball(0.75, 0, glow(0xff5a10, 2.6), 6), 2.7, 8.3, 0.4));
  for (const [x, y, z] of [[4.3, 9.6, 0.6], [3.4, 10.3, -0.4], [1.8, 9.9, 1]]) g.add(put(new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), spark), x, y, z));
  return { g, grip: [0, 2.5] };
}

// ------------------------------------------------------------------ how each piece is held (right hand; the left mirrors)
// across: one-handed, across the front of the body (the Paladin's mace as drawn); planted: a staff or spear with its
// foot on the ground row; aimed: pointing ahead and a little out and down; hang: hanging down and forward from the
// fist; strap: a shield on the forearm; palm: held in front of the hand; clutch: gripped in the fist
export const POSE = {
  across: { how: 'haft', dir: [0.66, 0.68, 0.31], grip: 3.6, z: 1.5, depth: 'fist', dome: 4.5, roll: 'view', shadow: [1, 1, 0.3] },
  planted: { how: 'haft', dir: [-0.1, 1, 0.1], plant: 181, z: 1.5, depth: 'fist', dome: 4.5, roll: 'view', shadow: [1, 1, 0.25] },
  aimed: { how: 'haft', dir: [-0.3, -0.3, 0.9], grip: 0, z: 1.5, depth: 'fist', dome: 4.5, roll: 'view', shadow: [1, 1, 0.3] },
  hang: { how: 'haft', dir: [-0.2, -0.88, 0.42], grip: 0, z: 1.5, depth: 'fist', dome: 4.5, roll: 'view', shadow: [1, 1, 0.3] },
  strap: { how: 'euler', yaw: -55, tilt: -12, lean: -5, face: 3, z: 2, depth: 'front', shadow: [1, 2, 0.45] },
  palm: { how: 'euler', yaw: -20, tilt: -15, lean: 0, face: 3.5, z: 2, depth: 'front', shadow: [1, 1, 0.35] },
  clutch: { how: 'euler', yaw: -30, tilt: -15, lean: 0, face: 0, z: 1.5, depth: 'fist', dome: 4.5, shadow: [1, 1, 0.3] },
};
const P_WEAPONS = Object.values(WEAPONS), P_SHIELDS = Object.entries(SHIELDS), P_SCALE = { heater: 1.35, kite: 1.25, round: 1.5, buckler: 1.15 };

/** Every class's main-hand and off-hand pieces: { hand, label, build, pose, p (the pose's tweaks) }; lists cycle per hero. */
export const CLASS_KITS = {
  paladin: {
    main: P_WEAPONS.map((w) => ({ hand: 'R', label: w.label, build: w.build, pose: 'across', p: { scale: 1.07 } })),
    off: P_SHIELDS.map(([id, s]) => ({ hand: 'L', label: s.label, build: s.build, pose: 'strap', p: { scale: P_SCALE[id] } })),
  },
  ranger: {
    main: [{ hand: 'L', label: 'Yew longbow', build: longbow, pose: 'clutch', p: { yaw: -8, tilt: -28, lean: -10 } }],
    off: [{ hand: 'R', label: 'Arrow', build: arrow, pose: 'hang', p: { grip: -5, scale: 1.55 } }],
  },
  wizard: {
    main: [{ hand: 'R', label: 'Fire staff', build: fireStaff, pose: 'planted' }],
    off: [{ hand: 'L', label: 'Spellbook', build: spellbook, pose: 'clutch', p: { yaw: -40, tilt: -10, face: 1.5, scale: 1.4 } }],
  },
  necromancer: {
    main: [{ hand: 'R', label: 'Bone wand', build: boneWand, pose: 'across', p: { grip: 0, scale: 1.15 } }],
    off: [{ hand: 'L', label: 'Dark orb', build: darkOrb, pose: 'palm', p: { scale: 1.3 } }],
  },
  barbarian: {
    main: [{ hand: 'R', label: 'Great axe', build: greatAxe, pose: 'planted' }],
    off: [{ hand: 'L', label: 'Hand axe', build: () => beardedAxe(24, 0.8), pose: 'hang', p: { grip: -3, flip: true, flipY: true, spin: -30 } }],
  },
  dragoon: {
    main: [{ hand: 'R', label: 'Dragon spear', build: dragonSpear, pose: 'planted' }],
    off: [{ hand: 'L', label: 'Dragon-eye buckler', build: dragonBuckler, pose: 'strap', p: { face: 2.4 } }],
  },
  totem_master: {
    main: [{ hand: 'R', label: 'Totem staff', build: totemStaff, pose: 'planted' }],
    off: [{ hand: 'L', label: 'Hand idol', build: handTotem, pose: 'clutch', p: { yaw: -15, tilt: -20, scale: 1.5 } }],
  },
  death_knight: {
    main: [{ hand: 'R', label: 'Rune greatsword', build: runeblade, pose: 'hang', p: { dir: [0.24, 0.9, -0.36], grip: 60.5 } }],
    off: [{ hand: 'L', label: 'Frost skull', build: frostSkull, pose: 'palm', p: { scale: 1.6 } }],
  },
  arcane_sorcerer: {
    main: [{ hand: 'R', label: 'Star wand', build: starWand, pose: 'across', p: { grip: 0, scale: 1.15 } }],
    off: [{ hand: 'L', label: 'Armillary sphere', build: armillary, pose: 'palm', p: { scale: 1.3 } }],
  },
  carrion_witch: {
    main: [{ hand: 'R', label: 'Crow-skull crook', build: crowStaff, pose: 'planted' }],
    off: [{ hand: 'L', label: 'Poison lantern', build: poisonLantern, pose: 'clutch', p: { yaw: -25, tilt: 0 } }],
  },
  bard: {
    main: [{ hand: 'R', label: 'Lute', build: lute, pose: 'hang', p: { scale: 1.5 } }],
    off: [{ hand: 'L', label: 'Tambourine', build: tambourine, pose: 'clutch', p: { yaw: -55, tilt: -15, scale: 1.3 } }],
  },
  slime_lord: {
    main: [{ hand: 'R', label: 'Slime mace', build: slimeMace, pose: 'across', p: { grip: 0, dome: 5.5, scale: 1.25 } }],
    off: [{ hand: 'L', label: 'Jar of slime', build: slimeJar, pose: 'palm', p: { scale: 1.25 } }],
  },
  boomerang_knight: {
    main: [{ hand: 'R', label: 'War boomerang', build: () => boomerang(0x2ab8a0), pose: 'clutch', p: { yaw: -15, tilt: -30, lean: 85, scale: 1.1, flip: true, flipY: true } }],
    off: [{ hand: 'L', label: 'Throwing boomerang', build: () => boomerang(0xc8402a), pose: 'clutch', p: { yaw: -15, tilt: -30, lean: 85, scale: 0.75 } }],
  },
  lancer: {
    main: [{ hand: 'R', label: 'Lance', build: lance, pose: 'planted' }],
    off: [{ hand: 'L', label: 'Tower shield', build: towerShield, pose: 'strap', p: { scale: 1.6 } }],
  },
  dragon_knight: {
    main: [{ hand: 'R', label: 'Flame sword', build: flameSword, pose: 'hang', p: { dir: [-0.24, -0.9, 0.36] } }],
    off: [{ hand: 'L', label: 'Dragon shield', build: dragonShield, pose: 'strap', p: { scale: 1.4 } }],
  },
  gunner: {
    main: [{ hand: 'R', label: 'Flintlock pistol', build: flintlock, pose: 'hang', p: { scale: 1.4, flip: true } }],
    off: [{ hand: 'L', label: 'Lit bomb', build: bomb, pose: 'palm', p: { scale: 1.4 } }],
  },
};
const mirrorL = (p) => ({ ...p, dir: p.dir && [-p.dir[0], p.dir[1], p.dir[2]], yaw: -(p.yaw || 0), lean: -(p.lean || 0), roll: typeof p.roll === 'number' ? -p.roll : p.roll });

/** The items renderKit draws for hero number `i` of a class, in its armor's fists ({ R: [x, y], L: [x, y] }). */
export function kitItems(cls, i, fists) {
  const k = CLASS_KITS[cls], r = FIST_R[cls] || 4.5;
  setLook(4);
  return [k.main[i % k.main.length], k.off[i % k.off.length]].map((e) => {
    let p = { ...POSE[e.pose], ...e.p };
    if (e.hand === 'L') p = mirrorL(p);
    const f = [...fists[e.hand], r, r], b = e.build();
    const obj = p.how === 'euler' ? holdShield(b, f, p) : holdWeapon(b, f, p, p.roll ?? 0);
    return { obj, hand: p.dome ? f : null, dome: p.dome, depth: p.depth, shadow: p.shadow, label: e.label };
  });
}
