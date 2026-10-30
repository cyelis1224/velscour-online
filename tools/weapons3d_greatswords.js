// The Death Knight's greatswords (tools/weapons3d.js SETS.greatswords): 50 designs, each its own build. A design's recipe
// (recipeOf) is a blade, a guard, a pommel and a finery. Within a rarity no two designs share a blade or a guard, and no
// two of the 50 share blade + guard + pommel. Plainer forms are open from Common, the strange ones from Rare, and the
// materials (weapons3d_parts.js kitFor) get finer by rarity. Hang pose: the hilt at the origin, the blade up +Y, +Z the
// face. Markers as the other families: sockets ('slot'), 'tip', 'head', 'l0'/'l1' along the blade, 'orbit' at Mythic.
import * as THREE from 'three';
import { cyl, band, ball, cone, spike, extrude } from './handheld3d.js';
import { V, put, box, tube, slab, torus, oct, mark, jewel, runes, shards, halo, range, pick, int, rng, hash } from './weapons3d_parts.js';
import { HELD_PER } from '../src/data/held.js';

const PI = Math.PI;
export const BLADES = ['straight', 'broad', 'tapered', 'leaf', 'falchion', 'zweihander', 'estoc', 'cleaver', 'executioner', 'scimitar', 'serrated', 'flamberge', 'hooked', 'forked', 'windowed', 'bonesaw'];
export const GUARDS = ['bar', 'curved', 'drooped', 'balls', 'quillon', 'ring', 'swept', 'horns', 'winged', 'bat', 'dragon', 'skull'];
export const POMMELS = ['ball', 'disc', 'facet', 'spike', 'ring', 'crescent', 'skull', 'claw', 'crown'];
const FINERY = [['plain', 'fuller', 'twin', 'ridge'], ['fuller', 'twin', 'ridge', 'etched', 'chain'], ['twin', 'ridge', 'etched', 'chain', 'gemline', 'spikes'],
  ['runes', 'etched', 'chain', 'gemline', 'spikes', 'frost'], ['runes', 'gemline', 'spikes', 'frost', 'chain'], ['runes', 'frost', 'gemline', 'spikes']];
const OPEN_BLADES = [11, 13, 16, 16, 16, 16], OPEN_GUARDS = [10, 11, 12, 12, 12, 12];
export const FORM = {
  straight: 'Greatsword', broad: 'Broadsword', tapered: 'Longsword', leaf: 'Leaf Blade', falchion: 'Falchion', zweihander: 'Zweihander',
  estoc: 'Estoc', cleaver: 'Cleaver', executioner: 'Headsman', scimitar: 'Scimitar', serrated: 'Sawblade', flamberge: 'Flamberge',
  hooked: 'Hookblade', forked: 'Forked Blade', windowed: 'Reliquary Blade', bonesaw: 'Bonesaw',
};

function shuffled(r, a) { const o = a.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; }
let RECIPES = null;
/** Every design's recipe { blade, guard, pommel, finery, extra }, index order (Common first). */
export function recipes() {
  if (RECIPES) return RECIPES;
  const r = rng(hash('greatswords', 'recipes')), seen = new Set(), out = [], used = {};
  const fresh = (a) => shuffled(r, a).sort((x, y) => (used[x] || 0) - (used[y] || 0)); // the least used first: every form shows
  HELD_PER.forEach((n, R) => {
    const bl = fresh(BLADES.slice(0, OPEN_BLADES[R])), gu = fresh(GUARDS.slice(0, OPEN_GUARDS[R])), po = fresh(POMMELS);
    for (let j = 0; j < n; j++) {
      let pommel = po[j % po.length], k = 0;
      while (seen.has(`${bl[j]}|${gu[j]}|${pommel}`)) pommel = POMMELS[(POMMELS.indexOf(pommel) + ++k) % POMMELS.length];
      seen.add(`${bl[j]}|${gu[j]}|${pommel}`);
      for (const k of [bl[j], gu[j], pommel]) used[k] = (used[k] || 0) + 1;
      out.push({ blade: bl[j], guard: gu[j], pommel, finery: FINERY[R][(j + R) % FINERY[R].length], extra: R >= 5 ? ['shards', 'halo', 'both'][j % 3] : null });
    }
  });
  return (RECIPES = out);
}
export const recipeOf = (i) => recipes()[i];

/** A flat part from an outline with holes, extruded `depth` along Z, centred on z = 0. */
function plate(pts, holes, depth, m, bevel = 0.25) {
  const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath();
  for (const h of holes) { const p = new THREE.Path(); h.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); s.holes.push(p); }
  const g = extrude(s, depth, bevel); g.translate(0, 0, -depth / 2);
  return new THREE.Mesh(g, m);
}

/** The blade's outline (right edge up, left edge down), its holes, the point and the centre line x(y). */
function bladeShape(type, len, w, y0, r) {
  const N = 40, lft = [], rgt = [], holes = [];
  const bend = type === 'scimitar' ? w * range(r, 1.8, 2.6) : 0, cx = (t) => bend * t * t;
  for (let i = 0; i <= N; i++) {
    const t = i / N, y = y0 + t * len;
    let tipK = t > 0.84 ? Math.max(0.03, (1 - t) / 0.16) : 1, k = 1 - 0.2 * t, l, rr;
    switch (type) {
      case 'broad': k = 1.32 * (1 - 0.1 * t); tipK = t > 0.9 ? Math.max(0.03, (1 - t) / 0.1) : 1; break;
      case 'tapered': k = 1.2 * (1 - 0.7 * t) + 0.05; tipK = t > 0.9 ? Math.max(0.03, (1 - t) / 0.1) : 1; break;
      case 'leaf': k = 0.75 + 0.45 * Math.sin(PI * Math.min(1, t * 1.15)); break;
      case 'zweihander': k = t < 0.15 ? 0.5 : 1 - 0.15 * t; break;
      case 'estoc': k = 0.62 * (1 - 0.25 * t); tipK = t > 0.75 ? Math.max(0.03, (1 - t) / 0.25) : 1; break;
      case 'executioner': k = 1.25; tipK = t > 0.9 ? Math.sqrt(Math.max(0.0, 1 - ((t - 0.9) / 0.1) ** 2)) * 0.9 + 0.1 : 1; break;
      case 'scimitar': k = 0.85 + 0.35 * t; tipK = t > 0.86 ? Math.max(0.03, (1 - t) / 0.14) : 1; break;
      case 'flamberge': k *= 1 + 0.22 * Math.sin(t * 28); break;
      case 'windowed': k = 1.2 * (1 - 0.15 * t); break;
      case 'bonesaw': k = 1.15; break;
      case 'forked': tipK = 1; break;
    }
    l = rr = w * k * tipK;
    if (type === 'falchion') { l *= 0.55; rr *= 1 + 0.6 * Math.sin(PI * t * 0.95); }
    if (type === 'cleaver') { rr = w * (0.9 + 0.4 * t) * (t > 0.92 ? Math.max(0.15, (1 - t) / 0.08) : 1); l = w * 0.7 * tipK; }
    if (type === 'zweihander' && i === 6) { l += w * 1.4; rr += w * 1.4; }             // the parrying lugs over the ricasso
    if (type === 'serrated' && i % 2 && t < 0.84) { l += w * 0.35; rr += w * 0.35; }
    if (type === 'bonesaw' && i % 3 === 1 && t < 0.88) rr += w * 0.95;
    if (type === 'hooked' && i >= 31 && i <= 34) l += w * (i - 30) * 0.45;              // a beak turned back on the spine
    if (type === 'scimitar') { l *= 0.8; }
    lft.push([cx(t) - l, y]); rgt.push([cx(t) + rr, y]);
  }
  let out = [...rgt, ...lft.reverse()], tip = [cx(1), y0 + len];
  if (type === 'forked') { // two tines round a notch
    const top = y0 + len, cut = y0 + len * 0.86, wt = w * 0.8;
    // lft runs top to bottom now (reversed in place above)
    out = [...rgt.filter(([, y]) => y < cut - 1), [wt * 1.05, top - len * 0.04], [wt * 0.6, top], [0, cut], [-wt * 0.6, top], [-wt * 1.05, top - len * 0.04], ...lft.filter(([, y]) => y < cut - 1)];
    tip = [0, top];
  }
  if (type === 'windowed') for (const t of [0.28, 0.48, 0.68]) { const y = y0 + len * t, h = len * 0.07, ww = w * 0.42; holes.push([[0, y - h], [ww, y], [0, y + h], [-ww, y]]); }
  return { out, holes, tip, cx: (y) => cx(Math.max(0, Math.min(1, (y - y0) / len))) };
}

/** One greatsword: recipe from the design index d.i, details from r. */
export function greatsword(r, R, M, d) {
  const rc = recipeOf(d.i), g = new THREE.Group();
  const len = 52 * range(r, 0.93, 1.07) * ({ estoc: 1.06, executioner: 0.92, tapered: 1.04 }[rc.blade] || 1);
  const w = 4.2 * range(r, 0.9, 1.12) * ({ estoc: 0.75, tapered: 0.95, falchion: 0.9 }[rc.blade] || 1), y0 = 6.4;
  const B = bladeShape(rc.blade, len, w, y0, r), depth = 0.9 + w * 0.14, fz = depth / 2;
  g.add(plate(B.out, B.holes, depth, M.blade, 0.25));
  const grow = ([x, y]) => [x * 1.08 + Math.sign(x - B.cx(y)) * 0.3, y + (y > y0 + len * 0.97 ? 0.8 : 0)];
  g.add(plate(B.out.map(grow), B.holes.map((h) => h.map(([x, y]) => [x * 0.92, y])), depth * 0.5, R >= 4 ? M.glow : M.edge, 0)); // the edge
  // the finery down the blade
  const f = rc.finery, at = (t) => [B.cx(y0 + len * t), y0 + len * t];
  const line = (t0, t1) => { mark(g, 'l0', ...at(t0)); mark(g, 'l1', ...at(t1)); };
  const groove = (x, ww, t0, t1, m = M.dark, z = 0.03) => { for (const s of [1, -1]) g.add(put(box(ww, len * (t1 - t0), 0.12, m), x + B.cx(y0 + len * (t0 + t1) / 2), y0 + len * (t0 + t1) / 2, s * (fz + z))); };
  if (f === 'runes') runes(g, M, B.cx(y0 + len * 0.3), y0 + 3, y0 + len * 0.62, w * 0.62, fz + 0.08, int(r, 4, 6));
  else line(0.06, 0.85);
  if (f === 'fuller') groove(0, w * 0.32, 0.04, 0.6);
  if (f === 'twin') for (const x of [-w * 0.32, w * 0.32]) groove(x, w * 0.16, 0.04, 0.55);
  if (f === 'ridge') groove(0, w * 0.18, 0.02, 0.86, M.edge, 0.12);
  if (f === 'etched') for (let t = 0.1; t < 0.7; t += 0.09) for (const s of [1, -1]) { const [x, y] = at(t), e = oct(w * 0.22, R >= 3 ? M.glow : M.dark); e.scale.set(1, 1.6, 0.2); g.add(put(e, x, y, s * fz)); }
  if (f === 'gemline') for (const t of [0.22, 0.36, 0.5]) jewel(g, M, [...at(t), fz + 0.1], 0.6);
  if (f === 'chain') for (let i = 0; i < 6; i++) { const [x, y] = at(0.05 + i * 0.035), k = torus(1.1, 0.3, M.metal2, 10); k.rotation.set(i % 2 ? PI / 2 : 0, 0.6, 0.5); g.add(put(k, x + (i - 2.5) * w * 0.3, y, (i % 2 ? 1 : -1) * fz)); }
  if (f === 'spikes') for (let t = 0.12; t < 0.75; t += 0.14) { const [x, y] = at(t); g.add(spike(0.6, 3.2, M.metal2, [x - w * 0.9, y, 0], [-0.8, 0.6, 0], 5)); }
  if (f === 'frost') for (let i = 0; i < 7; i++) { const [x, y] = at(0.02 + r() * 0.3), c = oct(range(r, 0.7, 1.5), i % 2 ? M.glow2 : M.glow); c.scale.y = range(r, 1.8, 3); c.rotation.z = range(r, -0.8, 0.8); g.add(put(c, x + range(r, -w, w), y, range(r, -1, 1) * fz * 1.4)); }
  // the guard
  const gm = R >= 2 ? M.trim : M.metal2, gw = w * range(r, 2.2, 2.9), G = rc.guard;
  if (G === 'bar' || G === 'balls' || G === 'ring' || G === 'skull') { g.add(put(box(gw * 2, 1.6, 2.2, gm), 0, 5.2)); if (G === 'balls') for (const s of [-1, 1]) g.add(put(ball(1.15, 0, gm, 8), s * gw, 5.2)); }
  if (G === 'curved' || G === 'drooped') { const k = G === 'curved' ? 1 : -1; g.add(tube([[-gw, 5 + k * 3], [-gw * 0.6, 5.2], [0, 5], [gw * 0.6, 5.2], [gw, 5 + k * 3]], 0.8, gm, 20, 6)); }
  if (G === 'quillon') { g.add(tube([[-gw, 8.5], [-gw * 0.9, 5.4], [0, 5], [gw * 0.9, 5.4], [gw, 1.8]], 0.75, gm, 24, 6)); for (const s of [1, -1]) g.add(spike(0.7, 2.4, gm, [0, 5.2, s * 1.1], [0, 0, s], 5)); }
  if (G === 'ring') { const t = torus(2.4, 0.4, gm, 18); t.rotation.y = PI / 2; g.add(put(t, gw * 0.45, 5.2, 0)); }
  if (G === 'swept') { g.add(tube([[-gw, 6.5], [-gw * 0.5, 5.2], [0, 5], [gw * 0.6, 5.2], [gw * 0.9, 3], [gw * 0.7, -1.5], [1.6, -5]], 0.6, gm, 30, 6)); g.add(tube([[-gw * 0.3, 5.1], [-gw * 0.55, 2], [-1.4, -1]], 0.45, gm, 16, 5)); }
  if (G === 'horns') for (const s of [-1, 1]) { g.add(put(box(gw * 0.9, 1.4, 2, gm), s * gw * 0.45, 5.2)); g.add(tube([[s * gw * 0.8, 5.2], [s * gw * 1.15, 7.5], [s * gw * 1.05, 11], [s * gw * 0.75, 13]], 0.7, gm, 16, 6)); }
  if (G === 'winged' || G === 'dragon' || G === 'bat') {
    for (const s of [-1, 1]) {
      const p = G === 'bat' ? [[s * 1.5, 4], [s * gw * 1.3, 6.5], [s * gw * 1.1, 4.4], [s * gw * 0.8, 5.2], [s * gw * 0.55, 3.8], [s * gw * 0.3, 4.8], [s * 1.5, 6.2]]
        : [[s * 1.5, 4], [s * gw, 4.6], [s * gw * 1.25, 8.4], [s * gw * 0.8, 6.8], [s * gw * 0.55, 8], [s * 1.5, 6.4]];
      g.add(slab(s > 0 ? p : p.reverse(), 1.4, gm, 0.3));
    }
    if (G === 'dragon') { g.add(put(ball(1.8, 0, M.metal2, 10), 0, 5.4, 0.4)); for (const x of [-0.7, 0.7]) g.add(put(ball(0.4, 0, M.glow, 6), x, 5.6, 2)); }
  }
  if (G === 'skull') { g.add(put(ball(2.1, 0, M.bone, 12), 0, 5.6, 0.6), put(box(2.2, 1.2, 1.6, M.bone), 0, 3.9, 0.9)); for (const x of [-0.75, 0.75]) g.add(put(ball(0.5, 0, R >= 3 ? M.glow : M.dark, 6), x, 5.9, 2.4)); }
  else g.add(put(box(3.2, 2.2, 2.4, gm), 0, 5.2));
  // grip and pommel
  g.add(cyl(1.05, 1, -4.2, 4, M.grip));
  for (let i = 0, n = Math.min(3, R); i < n; i++) g.add(band(1.2, -4 + (7.8 * i) / Math.max(1, n - 1), gm, 0.7));
  const P = rc.pommel;
  if (P === 'ball') g.add(ball(1.6, -5.8, gm, 10));
  if (P === 'disc') { const k = put(cyl(2, 2, -0.6, 0.6, gm, 14), 0, -6); k.rotation.x = PI / 2; g.add(k); }
  if (P === 'facet') g.add(put(oct(2, gm), 0, -6));
  if (P === 'spike') g.add(ball(1.4, -5.6, gm, 8), spike(0.9, 3.4, gm, [0, -6.6, 0], [0, -1, 0], 6));
  if (P === 'ring') g.add(put(torus(1.7, 0.45, gm, 16), 0, -6.4));
  if (P === 'crescent') g.add(slab([[-2.6, -8], [-1.2, -5.4], [0, -4.6], [1.2, -5.4], [2.6, -8], [1.2, -6.3], [0, -5.9], [-1.2, -6.3]], 1.2, gm, 0.25));
  if (P === 'skull') { g.add(ball(1.7, -6.2, M.bone, 10)); for (const x of [-0.6, 0.6]) g.add(put(ball(0.4, 0, R >= 3 ? M.glow : M.dark, 6), x, -6.1, 1.5)); }
  if (P === 'claw') { g.add(put(ball(1.5, 0, M.gem, 10), 0, -6.4)); for (let i = 0; i < 4; i++) { const a = i * PI / 2 + 0.4; g.add(tube([[0, -4.4, 0], [Math.cos(a) * 1.8, -5.6, Math.sin(a) * 1.8], [Math.cos(a) * 1.2, -7.6, Math.sin(a) * 1.2]], 0.3, gm, 8, 5)); } }
  if (P === 'crown') { g.add(cyl(1.5, 1.8, -7, -4.6, gm, 10)); for (let i = 0; i < 6; i++) { const a = i * PI / 3; g.add(spike(0.35, 1.4, gm, [Math.cos(a) * 1.5, -7, Math.sin(a) * 1.5], [Math.cos(a) * 0.3, -1, Math.sin(a) * 0.3], 4)); } }
  // jewels, and the Mythic's floating finery
  if (R >= 2 && G !== 'skull' && G !== 'dragon') jewel(g, M, [0, 5.2, 1.3], 0.9);
  if (R >= 4 && f !== 'gemline') jewel(g, M, [...at(0.18), fz + 0.2], 0.8, [0, 0, 1], 'ball');
  if (rc.extra === 'shards' || rc.extra === 'both') shards(g, M, [...at(0.5), 0], w * 2.6, rc.extra === 'both' ? 3 : 5, r, 0.8);
  if (rc.extra === 'halo' || rc.extra === 'both') halo(g, M, [...at(0.62), 0], w * 2.2, 1.25, 0.3);
  for (const t of [0.12, 0.3, 0.48]) mark(g, 'slot', ...at(t), fz);
  mark(g, 'slot', 0, -5.8, 1); mark(g, 'tip', ...B.tip); mark(g, 'grip', 0, 0); mark(g, 'guard', 0, 5.2); mark(g, 'head', ...at(0.55), 0, len * 0.5);
  return { g, form: FORM[rc.blade], recipe: rc };
}
