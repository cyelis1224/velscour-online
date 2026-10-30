// Bone gibs: the skulls, rib cages, ribs, femurs, pelvises, jaws and vertebrae a monster bursts into (gibs() in
// vfx.js). They are three.js models (tools/bones3d.js) baked by tools/bones3d_bake.js into assets/sprites/bones.webp,
// a data sheet (R = light, G = the half-blood field, B = the soak field, A = 255 body / 128 outline; see
// tools/bones3d.html) of every bone's 16 tumbling turns and the poses it lies in. Each bone colour + blood colour +
// look gets a canvas the size of the sheet, and each bone in it is painted once, the first time it is drawn (~1 ms).
// Looks: 0 clean, 1 blood on one end, 2 on the other end, 3 soaked.
import { G } from '../state.js';
import { A } from '../core/assets.js';
import { makeCanvas, hexToRgb, mixHex, pick, shuffle, TAU } from '../core/util.js';

let src = null, kinds = null, onceKinds = null;
const paints = new Map(); // `${bone}|${blood}|${look}` -> { c: canvas, done: Set of bones painted, ramps }, oldest first

export const bonesReady = () => !!(A.boneImg && A.boneMeta);

/** The bones one burst of n chunks is made of: now and then one skull, rib cage, pelvis or jaw (BONES[k].once; not
 *  when `loose`, bits off the living), the rest ribs, vertebrae, femurs and arm bones by weight; shuffled. */
export function boneDeck(n, loose = false) {
  const B = A.boneMeta.bones;
  if (!kinds) {
    kinds = []; onceKinds = Object.keys(B).filter((k) => B[k].once);
    for (const [k, b] of Object.entries(B)) for (let i = 0; i < b.w; i++) kinds.push(k);
  }
  const deck = loose ? [] : onceKinds.filter((k) => Math.random() < B[k].once);
  while (deck.length < n) deck.push(pick(kinds));
  return shuffle(deck).slice(0, n);
}

/** A blood look for a bone gib with blood on it to show: clean, either end, or soaked. */
export function boneLook(coat) {
  if (!coat) return 0;
  const r = Math.random();
  return r < 0.3 ? 0 : r < 0.5 ? 1 : r < 0.7 ? 2 : 3;
}

const RAMP = [[0.78, '#1c0f14'], [0.5, '#2a1820'], [0.26, '#3a2826'], [0, '#000000'], [0.4, '#fffaf0']];
const GORE = [[0.75, '#0a0002'], [0.52, '#0a0002'], [0.28, '#0a0002'], [0, '#000000'], [0.5, '#fff0f0']];
const LEVEL = (r) => (r < 70 ? 0 : r < 115 ? 1 : r < 160 ? 2 : r < 215 ? 3 : 4);
function painted(bone, coat, look, kind) {
  const key = bone + '|' + (look ? coat : '') + '|' + look;
  let e = paints.get(key);
  if (e) { paints.delete(key); paints.set(key, e); } // most recently used last
  else {
    // five shades of bone and of blood (the top one of blood a wet sheen); a dark outline in the colour on top
    const bones = RAMP.map(([t, to]) => hexToRgb(mixHex(bone, to, t)));
    e = { c: makeCanvas(A.boneImg.width, A.boneImg.height), done: new Set(), bones, blood: coat ? GORE.map(([t, to]) => hexToRgb(mixHex(coat, to, t))) : bones,
      line: hexToRgb(mixHex(look === 3 ? coat : bone, '#0a0406', look === 3 ? 0.8 : 0.86)) };
    paints.set(key, e);
    if (paints.size > (G.touch ? 12 : 24)) paints.delete(paints.keys().next().value);
  }
  if (e.done.has(kind)) return e.c;
  e.done.add(kind);
  const w = A.boneImg.width, b = A.boneMeta.bones[kind], g = e.c.getContext('2d');
  if (!src) {
    const t = makeCanvas(w, A.boneImg.height), tg = t.getContext('2d', { willReadFrequently: true });
    tg.drawImage(A.boneImg, 0, 0); src = tg.getImageData(0, 0, w, t.height).data;
  }
  for (const [x0, y0, cw, ch] of b.t.concat(b.r)) {
    const out = g.createImageData(cw, ch), d = out.data;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const i = ((y0 + y) * w + x0 + x) * 4, a = src[i + 3];
      if (!a) continue;
      let col = e.line;
      if (a > 200) {
        const half = src[i + 1], soak = src[i + 2];
        const wet = look === 1 ? half >= b.half : look === 2 ? half < b.half : look === 3 ? soak >= b.soak : false;
        // blood thins to a darker, clotted rim where it gives out
        const rim = wet && (look === 1 ? half < b.half + 10 : look === 2 ? half > b.half - 10 : soak < b.soak + 12);
        const lv = LEVEL(src[i]);
        col = wet ? e.blood[Math.max(0, lv - (rim ? 1 : 0))] : e.bones[lv];
      }
      const o = (y * cw + x) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    g.putImageData(out, x0, y0);
  }
  return e.c;
}

/** Draw bone gib `p` (vfx particle: bone, look, color, coat, rot, rest, size) with its floor point at px, py (already
 *  raised by its height): a turn of its tumble in flight, a pose lying on the floor once it has settled. */
export function drawBoneGib(ctx, p, px, py) {
  const M = A.boneMeta, b = M.bones[p.bone];
  const lying = p.z <= 0 && p.vr === 0, k = p.size / M.S;
  const [sx, sy, sw, sh, ax, ay] = lying ? b.r[p.rest % b.r.length] : b.t[Math.floor((((p.rot / TAU) % 1) + 1) % 1 * b.t.length) % b.t.length];
  ctx.drawImage(painted(p.color, p.coat, p.look, p.bone), sx, sy, sw, sh, px - ax * k, py - (lying ? 0 : b.lift * p.size) - ay * k, sw * k, sh * k);
}
