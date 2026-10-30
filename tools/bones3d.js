// Bone gibs in three.js: the skulls, rib cages, ribs, femurs and other bones a monster bursts into (gibs() in
// src/gfx/vfx.js). tools/bones3d.html shows them and bakes them (tools/bones3d_bake.js) into the data sheet the game
// paints in the gib's colours (src/gfx/bonegibs.js); the game never runs three.js.
//
// Units are cm, y up, each bone in its anatomical pose (front +z, the body's left +x), true to size against the others
// (a femur is 45 cm, a skull 21) apart from `k` (the small ones are blown up a little to read on the floor). Each bone
// is one merged geometry, centred, with an `albedo` attribute (dark eye sockets, bright teeth).
//   axis    the line the half-blooded look splits along (the bone's long axis unless given)
//   spin    the axis it tumbles about in flight; `face`: a skull keeps its face (+z) to the camera, give or take
//   rest    base poses it lies in on the floor (Euler xyz), each turned through yaws in the bake
//   w       how often it turns up in a burst; `once`: at most one per burst, with that chance
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const H = Math.PI / 2;

function tag(g, albedo) {
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.setAttribute('albedo', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(albedo), 1));
  return g;
}
const turn = (g, rot) => (rot ? g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot))) : g);
/** An ellipsoid: centre, radii (or one radius), albedo, Euler turn before it is placed. */
function ball(c, r, a = 1, rot = null) {
  const g = new THREE.SphereGeometry(1, 16, 12);
  g.scale(...(Array.isArray(r) ? r : [r, r, r]));
  return tag(turn(g, rot).translate(...c), a);
}
function box(c, s, a = 1, rot = null) { return tag(turn(new THREE.BoxGeometry(...s), rot).translate(...c), a); }

/** A tube through `pts` (Catmull-Rom), radius r(t) (or a number), its section an ellipse flattened by [along up,
 *  across]; `up` steers the section, ends capped unless closed. Normals are analytic, so winding doesn't matter. */
function sweep(pts, r, a = 1, { segs = 28, radial = 10, flat = [1, 1], closed = false, up = V(0, 1, 0) } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts, closed, 'centripetal'), R = typeof r === 'number' ? () => r : r;
  const pos = [], nor = [], idx = [], n = closed ? segs : segs + 1;
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), P = new THREE.Vector3(), Q = new THREE.Vector3();
  const ends = [];
  for (let i = 0; i < n; i++) {
    const t = i / segs;
    curve.getPointAt(t, P); curve.getTangentAt(t, T);
    const u = Math.abs(T.dot(up)) > 0.96 ? V(1, 0, 0) : up;
    B.crossVectors(T, u).normalize(); N.crossVectors(B, T).normalize();
    const rr = R(t);
    for (let j = 0; j < radial; j++) {
      const th = (j / radial) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      Q.copy(P).addScaledVector(N, c * rr * flat[0]).addScaledVector(B, s * rr * flat[1]);
      pos.push(Q.x, Q.y, Q.z);
      Q.set(0, 0, 0).addScaledVector(N, c / flat[0]).addScaledVector(B, s / flat[1]).normalize();
      nor.push(Q.x, Q.y, Q.z);
    }
    if (i === 0 || i === n - 1) ends.push({ P: P.clone(), T: T.clone() });
  }
  for (let i = 0; i < segs; i++) {
    const i1 = (i + 1) % n;
    for (let j = 0; j < radial; j++) {
      const j1 = (j + 1) % radial, a0 = i * radial + j, a1 = i * radial + j1, b0 = i1 * radial + j, b1 = i1 * radial + j1;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
  }
  if (!closed) ends.forEach((e, k) => {   // flat caps: their own ring and a centre, facing out along the curve
    const ring = k ? (n - 1) * radial : 0, base = pos.length / 3, d = k ? 1 : -1;
    for (let j = 0; j < radial; j++) { pos.push(pos[(ring + j) * 3], pos[(ring + j) * 3 + 1], pos[(ring + j) * 3 + 2]); nor.push(e.T.x * d, e.T.y * d, e.T.z * d); }
    pos.push(e.P.x, e.P.y, e.P.z); nor.push(e.T.x * d, e.T.y * d, e.T.z * d);
    for (let j = 0; j < radial; j++) idx.push(base + radial, base + j, base + (j + 1) % radial);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return tag(g, a);
}

// ------------------------------------------------------------------ bones
function skull() {
  const P = [
    ball([0, 5.2, -1], [6.9, 6.8, 9.2]),            // cranium
    ball([0, 1.0, 4.6], [5.0, 4.4, 4.2]),           // face
    ball([0, 3.6, 6.4], [5.6, 1.5, 1.8]),           // brow ridge
    ball([0, 7.4, -7.6], [5.2, 4.6, 2.6]),          // occiput
    ball([0, -0.5, 8.2], [1.15, 1.6, 0.9], 0),       // nose
    // the upper teeth on their ridge
    sweep([-0.95, -0.5, 0, 0.5, 0.95].map((f) => V(3.5 * Math.sin(f), -2.2, 4.5 + 3.5 * Math.cos(f))), 0.75),
  ];
  for (const s of [-1, 1]) {
    P.push(ball([s * 5.4, 1.4, 3.2], [1.5, 1.3, 3.2]));               // cheekbones
    P.push(ball([s * 6.4, 2.2, -1.6], [1.0, 1.6, 2.6]));              // temples
    P.push(ball([s * 2.5, 2.0, 7.3], [2.25, 2.05, 1.45], 0));        // eye sockets
  }
  for (let i = 0; i < 8; i++) {
    const f = -0.95 + (i + 0.5) * (1.9 / 8);
    P.push(box([3.45 * Math.sin(f), -3.1, 4.5 + 3.45 * Math.cos(f)], [0.72, 1.3, 0.62], 1.12, [0, f, 0]));
  }
  return P;
}

/** Rib i of the cage (0 top .. 6 floating), side s: head at the spine round to the sternum. */
function ribPts(i, s) {
  const y = 25 - i * 3.5, rx = [7.4, 9.8, 11.6, 12.6, 13.1, 12.9, 12.0][i];
  const p = [V(s * 1.8, y, -6.6), V(s * 4.2, y + 0.3, -8.4), V(s * rx * 0.74, y - 0.3, -7.0), V(s * rx, y - 1.8, -0.5), V(s * rx * 0.8, y - 3.8, 5.4)];
  if (i < 5) p.push(V(s * 1.9, y - 5.6 - i * 0.2, 8.8));
  else if (i === 5) p.push(V(s * rx * 0.48, y - 5.4, 7.6));
  return p;
}
const RIB = { flat: [1.3, 0.62], up: V(0, 1, 0) };
function ribcage() {
  const P = [
    ball([0, 13.6, 9.1], [1.7, 6.6, 0.7]),          // sternum
    ball([0, 20.0, 8.8], [2.7, 1.9, 0.8]),          // manubrium
    ball([0, 6.6, 8.6], [0.8, 1.4, 0.5]),           // xiphoid
  ];
  for (let k = 0; k < 10; k++) {                    // the thoracic spine, growing downward, each with its spinous process
    const y = 27.4 - k * 2.85, r = 1.35 + k * 0.07;
    P.push(tag(new THREE.CylinderGeometry(r, r, 2.2, 12).translate(0, y, -6.9), 1));
    P.push(ball([0, y - 0.9, -10.0], [0.45, 0.85, 1.7], 1, [0.6, 0, 0]));
  }
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) P.push(sweep(ribPts(i, s), (t) => 0.62 + 0.18 * Math.sin(t * Math.PI), 1, RIB));
  return P;
}
function rib() { return [sweep(ribPts(3, 1), (t) => 0.62 + 0.18 * Math.sin(t * Math.PI), 1, RIB), ball([1.8, 14, -6.6], 0.85)]; }

function femur() {
  const z = { up: V(0, 0, 1) };
  return [
    sweep([V(0, 3.5, -0.4), V(0.2, 12, 0.3), V(0.3, 22, 0.8), V(0, 32, 0.4), V(-0.5, 39, 0)], (t) => 1.35 + 0.95 * Math.pow(1 - t, 4) + 0.55 * Math.pow(t, 5), 1, z),
    sweep([V(-0.6, 38.4, 0.1), V(-2.8, 41.2, 0.4), V(-4.3, 42.6, 0.6)], 1.35, 1, z),   // neck
    ball([-5.0, 43.1, 0.7], 2.35),                   // head
    ball([1.6, 40.6, -0.6], [1.7, 2.8, 1.8]),       // greater trochanter
    ball([-1.3, 36.4, -1.2], [0.9, 1.1, 0.9]),      // lesser trochanter
    ball([-2.1, 2.3, -0.5], [2.0, 2.3, 2.9]),       // condyles
    ball([2.1, 2.3, -0.5], [2.0, 2.3, 2.9]),
    ball([0, 3.4, 1.2], [2.2, 1.8, 1.3]),           // the knee's groove
  ];
}
function humerus() {
  const z = { up: V(0, 0, 1) };
  return [
    sweep([V(0, 2.8, 0), V(0.15, 10, -0.2), V(0, 20, 0), V(-0.25, 27.6, 0.1)], (t) => 1.0 + 0.95 * Math.pow(1 - t, 4) + 0.5 * Math.pow(t, 5), 1, { ...z, flat: [0.85, 1.15] }),
    ball([-1.0, 30.0, -0.8], 2.4),                   // head
    ball([1.3, 29.6, 0.8], [1.2, 1.5, 1.2]),        // greater tubercle
    ball([0, 1.5, 0.4], [2.9, 1.4, 1.5]),           // trochlea
    ball([-3.3, 2.6, -0.2], [0.9, 1.0, 0.8]),       // epicondyles
    ball([3.3, 2.6, -0.2], [0.9, 1.0, 0.8]),
  ];
}
function pelvis() {
  const P = [ball([0, 2.5, -5.5], [3.6, 5.2, 1.7], 1, [-0.45, 0, 0])];   // sacrum, tipped back
  for (const s of [-1, 1]) {
    P.push(ball([s * 7.6, 5.4, -1.4], [5.6, 6.0, 1.1], 1, [0, s * 0.7, s * 0.45]));   // iliac wing, flaring out and forward
    P.push(ball([s * 4.6, 4.8, -4.6], [2.6, 2.4, 1.2], 1, [0, s * 0.5, 0]));          // where it meets the sacrum
    P.push(sweep([V(s * 6.4, 0.4, 0.4), V(s * 7.0, -3.6, 1.6), V(s * 5.4, -6.8, 2.2), V(s * 2.8, -6.2, 4.4), V(s * 1.3, -3.4, 6.0), V(s * 4.0, -1.4, 4.0)],
      1.05, 1, { closed: true, up: V(1, 0, 0) }));                                     // ischium and pubis round the obturator hole
    P.push(ball([s * 7.2, -1.2, 1.6], 1.9));                                           // hip socket's rim
    P.push(ball([s * 8.4, -1.2, 2.0], [1.3, 1.3, 0.8], 0.14, [0, s * 1.2, 0]));       // the socket
  }
  return P;
}
function vertebra() {
  const P = [
    tag(new THREE.CylinderGeometry(2.1, 2.25, 2.6, 16).translate(0, 0, 1.2), 1),   // body
    sweep([V(-1.6, 0.4, -0.3), V(-1.5, 0.5, -2.4), V(0, 0.6, -3.4), V(1.5, 0.5, -2.4), V(1.6, 0.4, -0.3)], 0.62),   // arch round the canal
    sweep([V(0, 0.6, -3.2), V(0, -0.4, -5.6), V(0, -1.3, -6.8)], (t) => 0.75 - 0.25 * t, 1, { flat: [1.6, 0.6] }),   // spinous process
  ];
  for (const s of [-1, 1]) {
    P.push(sweep([V(s * 1.5, 0.6, -2.2), V(s * 3.6, 0.8, -2.6), V(s * 4.9, 0.6, -2.4)], 0.55));   // transverse processes
    P.push(ball([s * 1.3, 1.5, -2.1], 0.6), ball([s * 1.3, -0.5, -2.5], 0.55));                 // facets
  }
  return P;
}
function jaw() {
  const arch = [V(-4.6, 4.0, -2.6), V(-4.7, 0.6, -2.0), V(-4.0, -0.4, 1.6), V(-2.4, -0.8, 4.8), V(0, -1.0, 6.0), V(2.4, -0.8, 4.8), V(4.0, -0.4, 1.6), V(4.7, 0.6, -2.0), V(4.6, 4.0, -2.6)];
  const P = [sweep(arch, (t) => 0.75 + 0.15 * Math.sin(t * Math.PI), 1, { segs: 40, flat: [1.7, 0.7] }), ball([0, -1.4, 5.6], [1.6, 1.1, 0.9])];
  for (const s of [-1, 1]) {
    P.push(ball([s * 4.6, 4.6, -2.7], [0.9, 0.6, 0.8]));                                      // condyles
    P.push(sweep([V(s * 4.3, 0.6, -0.6), V(s * 4.2, 2.4, 0), V(s * 4.0, 3.7, 0.3)], (t) => 0.55 - 0.3 * t));   // coronoid
  }
  for (let i = 0; i < 10; i++) {
    const f = -1.25 + (i + 0.5) * (2.5 / 10), x = 3.7 * Math.sin(f), z = 1.0 + 4.6 * Math.cos(f);
    P.push(box([x, 0.85, z], [0.62, 1.25, 0.55], 1.12, [0, f, 0]));
  }
  return P;
}

export const BONES = {
  skull: { build: skull, k: 1.25, axis: V(0, -0.7, 0.7), spin: V(0.6, -0.5, -0.6), face: 1.2, rest: [[-0.45, 0, 0], [-0.35, 0, 1.0]], once: 0.6 },
  ribcage: { build: ribcage, k: 1, axis: V(0.8, -0.6, 0), spin: V(0.4, 0.3, 1), rest: [[-H, 0, 0], [0, 0, H]], once: 0.45 },
  pelvis: { build: pelvis, k: 1, axis: V(1, 0, 0), spin: V(1, 0.4, 0.2), rest: [[-H, 0, 0], [H, 0, 0]], once: 0.3 },
  jaw: { build: jaw, k: 1.15, axis: V(1, 0, 0), spin: V(0.3, 1, 0.4), rest: [[0, 0, 0], [Math.PI, 0, 0]], once: 0.35 },
  femur: { build: femur, k: 1, spin: V(0.2, 0.15, 1), rest: [[0, 0, H]], w: 2 },
  humerus: { build: humerus, k: 1, spin: V(1, 0.2, 0.3), rest: [[0, 0, H]], w: 2 },
  rib: { build: rib, k: 1, spin: V(0.5, 1, 0.3), rest: [[0, 0, 0], [Math.PI, 0, 0]], w: 5 },
  vertebra: { build: vertebra, k: 1.4, axis: V(0, 0, 1), spin: V(1, 0.7, 0.4), rest: [[0, 0, 0], [0, 0, H]], w: 3 },
};

/** One bone as a centred, merged geometry, with its blood axis (unit), centre and half length along it (cm). */
export function buildBone(kind) {
  const def = BONES[kind], g = mergeGeometries(def.build());
  g.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z); g.computeBoundingBox(); g.computeBoundingSphere();
  const size = g.boundingBox.getSize(new THREE.Vector3());
  const axis = (def.axis || (size.x >= size.y && size.x >= size.z ? V(1, 0, 0) : size.y >= size.z ? V(0, 1, 0) : V(0, 0, 1))).clone().normalize();
  const p = g.attributes.position;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < p.count; i++) { const d = p.getX(i) * axis.x + p.getY(i) * axis.y + p.getZ(i) * axis.z; lo = Math.min(lo, d); hi = Math.max(hi, d); }
  return { geometry: g, axis, mid: (lo + hi) / 2, len: (hi - lo) / 2, size };
}
