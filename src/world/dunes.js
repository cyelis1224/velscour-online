// THE SEA OF SAND'S DUNES (docs/SEA_OF_SAND_DUNES.md): rolling dunes on one smooth height field, a caravan route
// across them through the checkpoints (camps), oases, high dune ridges, and a great pyramid in the far corner; inside
// it, a tomb that spirals down round the pyramid's heart, room by room, to the burial chamber. Drawn live in three.js
// (gfx/dunes3d.js) behind the 2D sprites; game/dunes.js runs it. The same field contract as the Depth's Edge Caverns
// (world/caverns.js): heights in tiles (one three.js unit), CAVE_S vertices a tile edge, rock rising from the floor's
// edge, map.hgt in levels for the climb rules.
//
// The grid holds two regions side by side: the dunes (x < E) and the tomb (x >= OXI), with a gap of rock between them.
// They can share screen space, so the run keeps creatures, props and picking to the region the hero is in, and the
// renderer draws one region's scene at a time (game/dunes.js, gfx/dunes3d.js).
//
// The pyramid stands in the corner of the dunes farthest from the camera, so nothing walkable is ever behind it: the
// ground is open only in front of its two faces the camera sees (x or y past its base). Its door is at the foot of
// the face toward +y. Inside, twelve cells round a 4 x 4 grid, each a room or a landing a step lower than the last,
// spiral round to the burial chamber in the middle, the deepest of all.
import { TileMap } from './map.js';
import { RNG } from '../core/util.js';
import { VZ, CAVE_S, vnoise } from './caverns.js';
import { DUNE_VARIANTS, DUNE_ROSTER } from '../data/dunes.js';
import { ART_BY_ID } from '../data/bestiary.js';
import { seaOfSandObject } from '../gfx/seaofsand.js';
import { SAND_H } from './overworld.js';

const S = CAVE_S, LV = VZ / 4, KS = 16 / VZ, NV_ = DUNE_VARIANTS.length;
export const duneVariant = (seed, force) => DUNE_VARIANTS[force != null ? ((force % NV_) + NV_) % NV_ : (seed >>> 5) % NV_];
export const DREG = { rock: 0, sand: 1, camp: 2, plaza: 3, oasis: 4, hall: 5, corridor: 6, chamber: 7, landing: 8 };
const VIS_IN = { [DREG.hall]: 5.2, [DREG.corridor]: 3.6, [DREG.chamber]: 8.5, [DREG.landing]: 4.2 };
export const TOMB_SIZE = 112, TOMB_GAP = 26;

const fbm = (x, y, s) => vnoise(x, y, s) * 0.55 + vnoise(x * 2.1, y * 2.1, s + 7) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 13) * 0.15;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** A Catmull-Rom curve through pts ([x, y]), sampled every ~0.5 tile: [[x, y, t 0..1], ...]. */
function curve(pts) {
  const out = [], seg = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(l); total += l; }
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)], n = Math.max(2, Math.ceil(seg[i] * 2));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const c = (q) => 0.5 * (2 * p1[q] + (-p0[q] + p2[q]) * t + (2 * p0[q] - 5 * p1[q] + 4 * p2[q] - p3[q]) * t2 + (-p0[q] + 3 * p1[q] - 3 * p2[q] + p3[q]) * t3);
      out.push([c(0), c(1), (acc + seg[i] * t) / total]);
    }
    acc += seg[i];
  }
  out.push([pts[pts.length - 1][0], pts[pts.length - 1][1], 1]);
  return out;
}

/**
 * A variant's bestiary (the shape of bestiary.js rollLooks): the variant's hand-picked art for each archetype, up to 3
 * per archetype, most of them in its sand palette and named after it ("Gilded Dune Stalker").
 */
export function duneLooks(v, rnd = Math.random) {
  const chosen = new Map(), used = new Set();
  const lookOf = (id) => (rnd() < 0.8 ? { art: id, swap: v.swap, tint: v.tint } : { art: id, swap: null });
  const looksFor = (arch) => {
    if (chosen.has(arch)) return chosen.get(arch);
    const pool = (v.roster[arch] || v.roster.skeleton).filter((id) => ART_BY_ID[id]), list = [];
    for (let i = 0; i < 3 && pool.length; i++) { const id = pool.splice(Math.floor(rnd() * pool.length), 1)[0]; list.push(lookOf(id)); used.add(id); }
    chosen.set(arch, list);
    return list;
  };
  return {
    pick(arch, r = rnd) { const l = looksFor(DUNE_ROSTER.includes(arch) ? arch : 'skeleton'); return l[Math.floor(r() * l.length)]; },
    boss(i = 0) { const [id] = v.bosses[i % v.bosses.length]; used.add(id); return { arch: ART_BY_ID[id]?.arch || 'golem', look: { art: id, swap: v.swap, tint: v.tint } }; },
    ids() { return [...used, ...v.bosses.map((b) => b[0])]; },
  };
}

// ------------------------------------------------------------------ the level
export function generateDunes(depth, biome, seed, force = null) {
  const v = duneVariant(seed, force), D = v.dune, PY = v.pyramid, rng = new RNG(seed), ns = (seed % 9973) + 17;
  const J = (r) => rng.range(-r, r);
  const E = D.size, IS = TOMB_SIZE, OXI = E + TOMB_GAP, OYI = (E - IS) >> 1, W = OXI + IS, H = E, NT = W * H;
  const I = (x, y) => y * W + x;
  const each = (cx, cy, r, fn) => {
    for (let y = Math.max(0, Math.floor(cy - r - 1)); y <= Math.min(H - 1, Math.ceil(cy + r + 1)); y++)
      for (let x = Math.max(0, Math.floor(cx - r - 1)); x <= Math.min(W - 1, Math.ceil(cx + r + 1)); x++) fn(x, y, I(x, y));
  };
  const walk = new Uint8Array(NT), wet = new Uint8Array(NT), reg = new Uint8Array(NT), zone = new Int16Array(NT).fill(-1);
  const F = new Float32Array(NT), lvl = new Float32Array(NT).fill(NaN), RH = new Float32Array(NT), pyr = new Uint8Array(NT);
  const inside = (x) => x >= OXI - 2;

  // ---------------------------------------------------------------- the plan of the dunes
  const half = PY.half, pc = half + 13, hp = 0.6;   // the pyramid's middle and half-width (tiles), the ground under it
  const front = (x, y) => x >= pc + half + 1 || y >= pc + half + 1;   // open ground: in front of a face the camera sees
  const door = [pc + 0.5, pc + half + 0.2], doorStep = [pc + 0.5, pc + half + 1.8], plaza = { x0: pc - 12, x1: pc + 13, y0: pc + half + 1, y1: pc + half + 15 };
  const plazaC = [pc + 0.5, pc + half + 9];
  const start = [E - 16 + J(2), E - 16 + J(2)];
  const camps = [];
  const dxs = plazaC[0] - start[0], dys = plazaC[1] - start[1];
  for (let i = 1; i <= D.camps; i++) {
    const t = i / (D.camps + 1), side = i % 2 ? 1 : -1, lat = side * Math.sin(Math.PI * t) * rng.range(0.13, 0.2) * E;
    let x = start[0] + dxs * t + lat * Math.SQRT1_2 + J(3), y = start[1] + dys * t - lat * Math.SQRT1_2 + J(3);
    x = clamp(x, 18, E - 18); y = clamp(y, 18, E - 18);
    if (!(x >= pc + half + 13 || y >= pc + half + 13)) { if (x < y) y = pc + half + 13; else x = pc + half + 13; }
    camps.push({ x, y, r: 8.5 + rng.range(0, 1.6), i: i - 1, name: v.camps[(i - 1) % v.camps.length] });
  }
  // the caravan route: start, every camp in turn, the plaza; a bend between each
  const pts = [start];
  for (const c of [...camps, { x: plazaC[0], y: plazaC[1] }]) {
    const [px, py] = pts[pts.length - 1], mx = (px + c.x) / 2, my = (py + c.y) / 2, l = Math.hypot(c.x - px, c.y - py) || 1;
    pts.push([clamp(mx + (-(c.y - py) / l) * J(6), 14, E - 14), clamp(my + ((c.x - px) / l) * J(6), 14, E - 14)], [c.x, c.y]);
  }
  for (const p of pts) if (!front(p[0], p[1])) { if (p[0] < p[1]) p[1] = pc + half + 6; else p[0] = pc + half + 6; }
  const route = curve(pts).map(([x, y]) => [x, y]);
  const routeD = new Float32Array(NT).fill(99);
  for (const [rx, ry] of route) each(rx, ry, 14, (x, y, i) => { if (x < E) { const d = Math.hypot(x + 0.5 - rx, y + 0.5 - ry); if (d < routeD[i]) routeD[i] = d; } });
  const campD = (x, y) => Math.min(...camps.map((c) => Math.hypot(x - c.x, y - c.y) - c.r));
  const nearPlaza = (x, y) => x > plaza.x0 - 9 && x < plaza.x1 + 9 && y > plaza.y0 - 4 && y < plaza.y1 + 10;

  // ---------------------------------------------------------------- the dunes' ground
  const wa = D.wind, ca = Math.cos(wa), sa = Math.sin(wa);
  const dune = (x, y) => {
    const s = x * ca + y * sa, c = -x * sa + y * ca;
    const warp = (vnoise(c * 0.045, s * 0.02, ns + 3) - 0.5) * 2.4 + (vnoise(c * 0.11, s * 0.05, ns + 5) - 0.5) * 0.7;
    const f = ((s / D.wave + warp) % 1 + 1) % 1;
    const prof = f < 0.72 ? Math.pow(f / 0.72, 1.35) : Math.pow(1 - (f - 0.72) / 0.28, 0.85);   // long windward rise, short slip face
    const crest = 0.5 + 0.5 * vnoise(c * 0.05, s * 0.012, ns + 7);
    return D.amp * prof * crest + 2.4 * (fbm(x * 0.017, y * 0.017, ns + 11) - 0.5) * 2;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < E; x++) {
    const i = I(x, y), edge = Math.min(x, y, E - 1 - x, E - 1 - y), far = Math.min(x, y) <= edge + 0.5;
    if (x >= pc - half && x <= pc + half && y >= pc - half && y <= pc + half) { pyr[i] = 1; RH[i] = 0; F[i] = hp; continue; }
    if (edge < 7 + 3 * vnoise(x * 0.09, y * 0.09, ns + 21)) { RH[i] = far ? 6.5 + 4 * fbm(x * 0.05, y * 0.05, ns + 23) : 1.6 + vnoise(x * 0.1, y * 0.1, ns + 25); F[i] = dune(x, y); continue; }
    if (!front(x, y)) { RH[i] = 3 + 2.5 * fbm(x * 0.06, y * 0.06, ns + 27); F[i] = dune(x, y); continue; }
    walk[i] = 1; reg[i] = DREG.sand; F[i] = dune(x, y);
  }
  // high dune ridges across the wind, gapped where the route crosses them
  for (let k = 0; k < D.ridges; k++) {
    let cx = 0, cy = 0;
    for (let t = 0; t < 30; t++) { cx = rng.range(20, E - 20); cy = rng.range(20, E - 20); if (front(cx, cy) && Math.hypot(cx - start[0], cy - start[1]) > 22 && campD(cx, cy) > 10) break; }
    const len = rng.range(28, 58), dirX = -sa + J(0.35), dirY = ca + J(0.35), dl = Math.hypot(dirX, dirY), ux = dirX / dl, uy = dirY / dl;
    const line = curve([[cx - ux * len / 2, cy - uy * len / 2], [cx + J(6), cy + J(6)], [cx + ux * len / 2, cy + uy * len / 2]]);
    const top = rng.range(3.4, 5.6);
    for (const [lx, ly, t] of line) {
      const rr = 1.5 + 1.2 * Math.sin(Math.PI * t) + vnoise(t * 9, k, ns + 31) * 0.8;
      each(lx, ly, rr, (x, y, i) => {
        if (x >= E || !walk[i] || Math.hypot(x + 0.5 - lx, y + 0.5 - ly) > rr || routeD[i] < 7.5 || campD(x + 0.5, y + 0.5) < 5 || nearPlaza(x, y)) return;
        walk[i] = 0; reg[i] = DREG.rock; RH[i] = Math.max(RH[i], top * (0.55 + 0.45 * Math.sin(Math.PI * t)));
      });
    }
  }
  // oases: pools beside the route, palms round them
  const oases = [];
  for (let k = 0, t = 0; k < D.oases && t < 400; t++) {
    const x = rng.range(24, E - 24), y = rng.range(24, E - 24), i = I(Math.floor(x), Math.floor(y)), r = rng.range(3.2, 4.8);
    if (!walk[i] || routeD[i] < 9 || routeD[i] > 18 || campD(x, y) < 8 || nearPlaza(x, y) || oases.some((o) => Math.hypot(o.x - x, o.y - y) < 30)) continue;
    let ok = true;
    each(x, y, r + 3, (xx, yy, j) => { if (Math.hypot(xx + 0.5 - x, yy + 0.5 - y) < r + 2.5 && !walk[j]) ok = false; });
    if (!ok) continue;
    oases.push({ x, y, r }); k++;
  }
  // the camps and the plaza are level ground; the route is smoothed; an oasis sinks into its hollow
  const level = (cx, cy, r, h, rg) => each(cx, cy, r + 5, (x, y, i) => {
    if (!walk[i]) return;
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy), k = smooth(r + 5, r, d);
    F[i] += (h - F[i]) * k;
    if (d < r && rg) reg[i] = rg;
  });
  for (const c of camps) { c.h = dune(c.x, c.y); level(c.x, c.y, c.r, c.h, DREG.camp); each(c.x, c.y, c.r, (x, y, i) => { if (walk[i] && Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) < c.r) zone[i] = c.i; }); }
  for (let y = plaza.y0; y <= plaza.y1; y++) for (let x = plaza.x0; x <= plaza.x1; x++) { const i = I(x, y); if (walk[i]) { F[i] = hp; reg[i] = DREG.plaza; } }
  each(plazaC[0], plazaC[1], 22, (x, y, i) => { if (walk[i] && reg[i] !== DREG.plaza) { const d = Math.max(0, Math.max(plaza.x0 - x, x - plaza.x1, plaza.y0 - y, y - plaza.y1)); F[i] += (hp - F[i]) * smooth(9, 0, d); } });
  for (let it = 0; it < 6; it++) {
    const G2 = F.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < E - 1; x++) {
      const i = I(x, y);
      if (!walk[i] || routeD[i] > 4 || reg[i] === DREG.plaza) continue;
      G2[i] = (F[i] * 2 + F[i - 1] + F[i + 1] + F[i - W] + F[i + W]) / 6;
    }
    F.set(G2);
  }
  for (const o of oases) {
    o.level = Math.min(...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => F[I(Math.floor(o.x + a * (o.r + 2)), Math.floor(o.y + b * (o.r + 2)))])) - 0.25;
    each(o.x, o.y, o.r + 3, (x, y, i) => {
      if (!walk[i]) return;
      const d = Math.hypot(x + 0.5 - o.x, y + 0.5 - o.y) / o.r;
      if (d < 1.6) F[i] = Math.min(F[i], o.level + 0.1 + (d - 1) * 0.6);
      if (d < 0.78) { walk[i] = 0; wet[i] = 2; reg[i] = DREG.oasis; lvl[i] = o.level; F[i] = o.level - 0.4 - 1.2 * smooth(0.78, 0.1, d); }
      else if (d < 1) { wet[i] = 1; reg[i] = DREG.oasis; lvl[i] = o.level; F[i] = o.level - 0.08; }
    });
  }

  // ---------------------------------------------------------------- the tomb
  const C4 = 4, cs = Math.floor((IS - 6) / C4), cellX = (i) => OXI + 3 + i * cs, cellY = (j) => OYI + 3 + j * cs;
  const RING = [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [0, 3], [0, 2], [0, 1]];
  const ROOMS = new Set([0, 2, 4, 6, 8, 10, 11]);   // the rest are landings on the way down
  const STEP = 1.55;
  const rooms = RING.map(([ci, cj], k) => {
    const room = ROOMS.has(k), w = room ? Math.round(cs * rng.range(0.56, 0.72)) : 8, hh = room ? Math.round(cs * rng.range(0.56, 0.72)) : 8;
    const cx = cellX(ci) + cs / 2 + (room ? J(1.5) : 0), cy = cellY(cj) + cs / 2 + (room ? J(1.5) : 0);
    const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - hh / 2);
    return { k, room, x0, y0, x1: x0 + w - 1, y1: y0 + hh - 1, cx: x0 + w / 2, cy: y0 + hh / 2, h: -k * STEP, ci, cj, name: null };
  });
  { let ri = (seed >>> 4) % 3; for (const rm of rooms) if (rm.room) rm.name = rm.k === 0 ? 'The Entrance Hall' : v.rooms[ri++ % v.rooms.length]; }
  const chH = rooms[11].h - 2.2, CC = [cellX(2), cellY(2)], CR = 15;
  const chamber = { x0: CC[0] - CR, y0: CC[1] - CR, x1: CC[0] + CR - 1, y1: CC[1] + CR - 1, cx: CC[0], cy: CC[1], h: chH, name: 'The Burial Chamber' };
  const floorT = (i, r, h, z) => { walk[i] = 1; reg[i] = r; F[i] = h; zone[i] = z; };
  rooms.forEach((rm, k) => { for (let y = rm.y0; y <= rm.y1; y++) for (let x = rm.x0; x <= rm.x1; x++) floorT(I(x, y), rm.room ? DREG.hall : DREG.landing, rm.h, 100 + k); });
  for (let y = chamber.y0; y <= chamber.y1; y++) for (let x = chamber.x0; x <= chamber.x1; x++) floorT(I(x, y), DREG.chamber, chH, 200);
  // corridors: three tiles wide from each room's middle to the next one's (a dog-leg if they don't line up), ramped
  const corridors = [];
  const corridor = (A, B, k) => {
    const a = [Math.floor(A.cx), Math.floor(A.cy)], b = [Math.floor(B.cx), Math.floor(B.cy)], tiles = [];
    const legs = a[0] === b[0] || a[1] === b[1] ? [[a, b]] : Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]) ? [[a, [b[0], a[1]]], [[b[0], a[1]], b]] : [[a, [a[0], b[1]]], [[a[0], b[1]], b]];
    const len = legs.reduce((s, [p, q]) => s + Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]), 0);
    let run = 0;
    for (const [p, q] of legs) {
      const n = Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]), sx = Math.sign(q[0] - p[0]), sy = Math.sign(q[1] - p[1]);
      for (let s = 0; s <= n; s++) {
        const x = p[0] + sx * s, y = p[1] + sy * s, t = (run + s) / len;
        for (let o = -1; o <= 1; o++) {
          const tx = sy ? x + o : x, ty = sx ? y + o : y, i = I(tx, ty);
          if (walk[i]) continue;
          floorT(i, DREG.corridor, A.h + (B.h - A.h) * smooth(0, 1, t), 300 + k); tiles.push(i);
        }
      }
      run += n;
    }
    corridors.push({ k, tiles, from: A, to: B });
  };
  for (let k = 0; k < 11; k++) corridor(rooms[k], rooms[k + 1], k);
  corridor(rooms[11], chamber, 11);
  // a treasury off the far landing, behind a short passage
  const tr = rooms[7], treasury = { x0: Math.round(tr.cx) - 4, y0: Math.round(tr.cy) - 16, x1: Math.round(tr.cx) + 4, y1: Math.round(tr.cy) - 9, h: tr.h + 0.6, name: 'The Treasury' };
  treasury.cx = (treasury.x0 + treasury.x1 + 1) / 2; treasury.cy = (treasury.y0 + treasury.y1 + 1) / 2;
  if (treasury.y0 > chamber.y1 + 3) {
    for (let y = treasury.y0; y <= treasury.y1; y++) for (let x = treasury.x0; x <= treasury.x1; x++) floorT(I(x, y), DREG.hall, treasury.h, 150);
    corridor(tr, treasury, 12);
  }
  // the seals: a stone slab across each fighting room's way on, lowered when the room is won (game/dunes.js)
  const seals = [];
  rooms.forEach((rm, k) => {
    if (!rm.room) return;
    const cor = corridors.find((c) => c.k === k);
    if (!cor) return;
    const out = cor.tiles.filter((i) => { const x = i % W, y = (i / W) | 0; return x < rm.x0 || x > rm.x1 || y < rm.y0 || y > rm.y1; });
    const first = out.filter((i) => { const x = i % W, y = (i / W) | 0; return Math.min(Math.abs(x - rm.x0 + 1), Math.abs(x - rm.x1 - 1), Math.abs(y - rm.y0 + 1), Math.abs(y - rm.y1 - 1)) === 0; });
    if (!first.length) return;
    const xs = first.map((i) => i % W), ys = first.map((i) => (i / W) | 0);
    seals.push({ k, tiles: first, x: (Math.min(...xs) + Math.max(...xs) + 1) / 2, y: (Math.min(...ys) + Math.max(...ys) + 1) / 2, axis: Math.max(...xs) - Math.min(...xs) > Math.max(...ys) - Math.min(...ys) ? 'x' : 'y', h: rm.h });
  });
  // the climb limit: a step between walkable neighbours stays under 0.33 tiles (3 levels; a hop is 4)
  const nb4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let it = 0; it < 80; it++) {
    let moved = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = I(x, y);
      if (!walk[i]) continue;
      for (const [ox, oy] of nb4) {
        const j = I(x + ox, y + oy);
        if (!walk[j]) continue;
        const d = F[i] - F[j] - 0.33;
        if (d <= 0 || d > 2) continue;
        const fixed = (q) => reg[q] === DREG.plaza || reg[q] === DREG.hall || reg[q] === DREG.chamber || reg[q] === DREG.landing;
        if (fixed(i) && fixed(j)) continue;
        if (fixed(i)) F[j] += d; else if (fixed(j)) F[i] -= d; else { F[i] -= d / 2; F[j] += d / 2; }
        moved++;
      }
    }
    if (!moved) break;
  }

  // ---------------------------------------------------------------- the map
  const map = new TileMap(W, H);
  for (let i = 0; i < NT; i++) map.t[i] = walk[i];
  map.wet = wet;

  // ---------------------------------------------------------------- the height field (vertices)
  const VW = W * S + 1, VH = H * S + 1, NV = VW * VH;
  const hv = new Float32Array(NV), ceil = new Float32Array(NV), cls = new Uint8Array(NV), surf = new Float32Array(NV).fill(NaN), vreg = new Uint8Array(NV);
  const tileAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : I(x, y));
  for (let j = 0; j < VH; j++) for (let i = 0; i < VW; i++) {
    const k = j * VW + i, fx = i / S, fy = j / S;
    const xs = i % S === 0 ? [fx - 1, fx] : [Math.floor(fx)], ys = j % S === 0 ? [fy - 1, fy] : [Math.floor(fy)];
    let sw = 0, nw = 0, swt = 0, nwt = 0, sl = 0, nl = 0, r = 0;
    for (const ty of ys) for (const tx of xs) {
      const t = tileAt(tx, ty);
      if (t < 0) continue;
      if (walk[t]) { sw += F[t]; nw++; r = reg[t]; } else if (wet[t] === 2) { swt += F[t]; nwt++; r = r || reg[t]; }
      if (!Number.isNaN(lvl[t])) { sl += lvl[t]; nl++; }
    }
    if (nw) { cls[k] = 1; hv[k] = sw / nw; } else if (nwt) { cls[k] = 2; hv[k] = swt / nwt; }
    if (nl) surf[k] = sl / nl;
    vreg[k] = r;
  }
  // the nearest floor or water vertex of every rock vertex (an 8SSEDT)
  const src = new Int32Array(NV).fill(-1), dd = new Float32Array(NV).fill(1e9);
  for (let k = 0; k < NV; k++) if (cls[k]) { src[k] = k; dd[k] = 0; }
  const relax = (k, n) => {
    const s = src[n];
    if (s < 0) return;
    const dx = (k % VW) - (s % VW), dy = ((k / VW) | 0) - ((s / VW) | 0), d = dx * dx + dy * dy;
    if (d < dd[k]) { dd[k] = d; src[k] = s; }
  };
  for (let j = 0; j < VH; j++) {
    for (let i = 0; i < VW; i++) { const k = j * VW + i; if (i > 0) relax(k, k - 1); if (j > 0) { relax(k, k - VW); if (i > 0) relax(k, k - VW - 1); if (i < VW - 1) relax(k, k - VW + 1); } }
    for (let i = VW - 1; i >= 0; i--) { const k = j * VW + i; if (i < VW - 1) relax(k, k + 1); }
  }
  for (let j = VH - 1; j >= 0; j--) {
    for (let i = VW - 1; i >= 0; i--) { const k = j * VW + i; if (i < VW - 1) relax(k, k + 1); if (j < VH - 1) { relax(k, k + VW); if (i < VW - 1) relax(k, k + VW + 1); if (i > 0) relax(k, k + VW - 1); } }
    for (let i = 0; i < VW; i++) { const k = j * VW + i; if (i > 0) relax(k, k - 1); }
  }
  const vin = new Uint8Array(NV);   // which region a vertex belongs to (1: the tomb), by its nearest floor
  for (let k = 0; k < NV; k++) { const s = src[k] >= 0 ? src[k] : k; vin[k] = inside((s % VW) / S) ? 1 : 0; }
  for (let k = 0; k < NV; k++) {
    const i = k % VW, j = (k / VW) | 0, s = src[k], tx = Math.min(W - 1, Math.floor(i / S)), ty = Math.min(H - 1, Math.floor(j / S)), t = I(tx, ty);
    const Fn = s >= 0 ? (cls[s] === 2 && !Number.isNaN(surf[s]) ? surf[s] : hv[s]) : 0, d = Math.sqrt(dd[k]) / S;
    if (vin[k]) {
      const fr = s >= 0 ? vreg[s] : DREG.hall, vis = VIS_IN[fr] ?? 4.5;
      if (cls[k]) { ceil[k] = hv[k] + vis; continue; }
      // masonry: straight up from the floor's edge, a course or two of plinth
      const tt = (d - 0.12) / 0.5, R = Fn + (vis + 1.4) * smooth(0, 1, tt) + 0.12 * smooth(0, 0.3, d);
      hv[k] = R; ceil[k] = Fn + vis;
      continue;
    }
    if (cls[k]) { ceil[k] = hv[k] + 200; continue; }
    if (pyr[t]) { hv[k] = hp; ceil[k] = hp + 200; continue; }
    // a dune: rises from the floor's edge to its crest, rounded, with the wind's ripple on its flank
    const Hr = RH[t] || 1.2, span = Hr > 5 ? 7 : 4.5, q = Math.min(1, d / span);
    hv[k] = Fn + Hr * (1 - (1 - q) * (1 - q)) + (fbm(i * 0.11, j * 0.11, ns + 41) - 0.5) * 0.5 * q;
    ceil[k] = hv[k] + 200;
  }
  // the tomb's cap: no masonry may hide the tomb's floor behind it (same screen column, smaller x + y) on screen
  {
    const NC = VW + VH, M = new Float32Array(NC).fill(1e9), vy = (k) => (cls[k] === 2 && !Number.isNaN(surf[k]) ? surf[k] : hv[k]);
    for (let dsum = 0; dsum < VW + VH - 1; dsum++) {
      const iA = Math.max(0, dsum - (VH - 1)), iB = Math.min(VW - 1, dsum), dv = dsum / S;
      for (let i = iA; i <= iB; i++) {
        const j = dsum - i, k = j * VW + i;
        if (cls[k] || !vin[k]) continue;
        const c = i - j + VH;
        let m = 1e9;
        for (let o = -2; o <= 2; o++) { const qq = c + o; if (qq >= 0 && qq < NC && M[qq] < m) m = M[qq]; }
        if (m > 1e8) continue;
        const cap = m + (dv - 0.5) * KS, s = src[k], Fn = s >= 0 ? vy(s) : 0;
        if (hv[k] > cap) hv[k] = Math.max(cap, Fn - 0.3);
      }
      for (let i = iA; i <= iB; i++) {
        const j = dsum - i, k = j * VW + i;
        if (!cls[k] || !vin[k]) continue;
        const c = i - j + VH, val = vy(k) - dv * KS;
        if (val < M[c]) M[c] = val;
      }
    }
  }
  // per-vertex material: (dunes) sand mix, the trail, wet, shade; (tomb) floor mix, carved courses, -, crevice
  const mat = new Uint8Array(NV * 4);
  const rd = new Float32Array(NV).fill(1e9);
  {
    const q = new Int32Array(NV); let qh = 0, qt = 0;
    for (let k = 0; k < NV; k++) if (!cls[k]) { rd[k] = 0; q[qt++] = k; }
    while (qh < qt) {
      const k = q[qh++], i = k % VW, j = (k / VW) | 0;
      for (const [ox, oy] of nb4) { const ii = i + ox, jj = j + oy; if (ii < 0 || jj < 0 || ii >= VW || jj >= VH) continue; const n = jj * VW + ii; if (rd[n] > rd[k] + 1) { rd[n] = rd[k] + 1; q[qt++] = n; } }
    }
  }
  for (let k = 0; k < NV; k++) {
    const i = k % VW, j = (k / VW) | 0, tx = Math.min(W - 1, Math.floor(i / S)), ty = Math.min(H - 1, Math.floor(j / S)), t = I(tx, ty);
    if (vin[k]) {
      mat[k * 4] = 255 * smooth(0.35, 0.65, fbm(i * 0.04, j * 0.04, ns + 71));
      mat[k * 4 + 1] = 255 * smooth(0.4, 0.6, fbm(i * 0.06, j * 0.06, ns + 73));
      mat[k * 4 + 2] = 0;
      mat[k * 4 + 3] = cls[k] === 1 ? 255 * (0.5 + 0.5 * smooth(0, 1.6 * S, rd[k])) : 220;
      continue;
    }
    const s = src[k], near = s >= 0 && !Number.isNaN(surf[s]) ? 1 - smooth(0, 2.5 * S, Math.sqrt(Math.min(dd[k], 1e6))) : 0;
    mat[k * 4] = 255 * smooth(0.3, 0.7, fbm(i * 0.03, j * 0.03, ns + 61));
    mat[k * 4 + 1] = 255 * (reg[t] === DREG.plaza ? 1 : (1 - smooth(1.4, 2.8, routeD[t])) * 0.85);
    mat[k * 4 + 2] = 255 * Math.max(Number.isNaN(surf[k]) ? 0 : 1, near * 0.7);
    mat[k * 4 + 3] = 255 * (0.82 + 0.18 * smooth(0.2, 0.8, fbm(i * 0.02, j * 0.02, ns + 63)));
  }

  // ---------------------------------------------------------------- map heights
  const hgt = new Int16Array(NT);
  let lo = Infinity, hi = -Infinity;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = I(x, y), k = (y * S + (S >> 1)) * VW + x * S + (S >> 1);
    hgt[i] = Math.round((walk[i] ? F[i] : hv[k]) * LV);
    if (walk[i]) { lo = Math.min(lo, hgt[i]); hi = Math.max(hi, hgt[i]); }
  }
  map.hgt = hgt; map.climb = 4; map.drop = 10; map.minLevel = lo; map.maxLevel = hi; map.baseLevel = lo - 40; map.smoothField = true;
  map.losRise = Math.round(2.6 * LV);

  // ---------------------------------------------------------------- dressing
  const H2 = (x, y) => {
    const fx = Math.min(VW - 1.001, Math.max(0, x * S)), fy = Math.min(VH - 1.001, Math.max(0, y * S)), i = Math.floor(fx), j = Math.floor(fy), u = fx - i, t = fy - j, k = j * VW + i;
    return (hv[k] * (1 - u) + hv[k + 1] * u) * (1 - t) + (hv[k + VW] * (1 - u) + hv[k + VW + 1] * u) * t;
  };
  const props = [], torches = [];
  const clear = new Uint8Array(NT);
  for (const [rx, ry] of route) each(rx, ry, 3, (x, y, i) => { if (Math.hypot(x + 0.5 - rx, y + 0.5 - ry) < 3) clear[i] = 1; });
  for (const c of camps) each(c.x, c.y, 4, (x, y, i) => { if (Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) < 4) clear[i] = 1; });
  for (let y = plaza.y0 - 1; y <= plaza.y1 + 2; y++) for (let x = plaza.x0 - 2; x <= plaza.x1 + 2; x++) clear[I(x, y)] = 1;   // the plaza stays open
  const nearP = (x, y, d) => props.some((o) => (o.x - x) ** 2 + (o.y - y) ** 2 < d * d);
  // a sprite is only placed where nothing in front of it on screen rises over its foot (the 2D sprites draw over the 3D)
  const inView = (x, y, h = 0) => {
    const base = (x + y) * 16 - H2(x, y) * VZ;
    for (let s = 0.5; s < 14; s += 0.5) { const g = H2(x + s, y + s), py = (x + y + 2 * s) * 16 - g * VZ; if (py < base - 6 - h * 0.15) return false; }
    return true;
  };
  const sprite = (name, x, y, o = {}) => {
    const spr = seaOfSandObject(name, o.tree ? 'tree' : undefined);
    if (!spr) return false;
    const h = (SAND_H[name] || o.h || 40) * rng.range(0.9, 1.1);
    if (!inView(x, y, h)) return false;
    props.push({ x, y, caveProp: 'sprite', spr, k: h / (spr.h * (spr.pixelScale || 1)), flip: rng.chance(0.4), light: o.light || 0 });
    if (o.solid) map.block[I(Math.floor(x), Math.floor(y))] = 1;
    return true;
  };
  const freeT = (x, y) => { const i = I(Math.floor(x), Math.floor(y)); return walk[i] && !wet[i] && !map.block[i] && !clear[i]; };
  // camps: an obelisk, braziers, and ruins round them
  for (const c of camps) {
    props.push({ x: c.x, y: c.y - c.r * 0.35, caveProp: 'obelisk', m: c.i % 2, flip: false });
    map.block[I(Math.floor(c.x), Math.floor(c.y - c.r * 0.35))] = 1;
    c.marker = [c.x, c.y - c.r * 0.35];
    for (const s of [-1, 1]) { const bx = c.x + s * 2.4, by = c.y - c.r * 0.35 + 1.2; if (freeT(bx, by) || true) torches.push({ x: bx, y: by, h: H2(bx, by), stand: true }); }
    for (let n = 0, t = 0; n < 5 && t < 40; t++) {
      const a = rng.range(0, 6.283), r = rng.range(c.r * 0.6, c.r + 3), x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r;
      if (!freeT(x, y) || nearP(x, y, 2)) continue;
      if (sprite(rng.pick(['toppled_column', 'obelisk_fragment', 'buried_statue_head', 'carved_standing_stone', 'broken_pottery', 'clay_water_jar', 'desert_cairn']), x, y, { solid: true })) n++;
    }
  }
  // the plaza: obelisks either side of the door's approach, braziers at the door
  for (const s of [-1, 1]) {
    const ox = door[0] + s * 7, oy = door[1] + 6;
    props.push({ x: ox, y: oy, caveProp: 'obelisk', m: 2, flip: false }); map.block[I(Math.floor(ox), Math.floor(oy))] = 1;
    torches.push({ x: door[0] + s * 3, y: door[1] + 1.6, h: hp, stand: true });
  }
  // oases: palms and reeds round the water
  for (const o of oases) for (let n = 0, t = 0; n < 9 && t < 60; t++) {
    const a = rng.range(0, 6.283), r = o.r + rng.range(0.8, 3.5), x = o.x + Math.cos(a) * r, y = o.y + Math.sin(a) * r;
    if (!freeT(x, y) || nearP(x, y, 1.6)) continue;
    if (sprite(n < 6 ? rng.pick(['date_palm', 'doum_palm', 'tall_slender_palm', 'twin_palms', 'fruiting_oasis_palm']) : 'reed_bundle', x, y, { tree: n < 6, solid: n < 6 })) n++;
  }
  // the open dunes: scrub, acacias, snags, boulders and the bones of something huge; waymarkers by the route
  for (let n = 0, t = 0; n < Math.round(E * E / 260) && t < 9000; t++) {
    const x = rng.int(8, E - 9) + 0.5 + J(0.3), y = rng.int(8, E - 9) + 0.5 + J(0.3);
    if (!freeT(x, y) || nearP(x, y, 2.4) || routeD[I(Math.floor(x), Math.floor(y))] < 3.5) continue;
    const nm = rng.pick(['dry_scrub', 'dry_scrub', 'spiny_aloe', 'thorn_acacia', 'dead_snag', 'wind_carved_boulder', 'basalt_shards', 'fossil_ribcage', 'giant_skull', 'desert_cairn', 'umbrella_acacia', 'dead_thorn_snag']);
    if (sprite(nm, x, y, { tree: /acacia|snag/.test(nm), solid: !/scrub|aloe/.test(nm) })) n++;
  }
  for (let s = 20; s < route.length - 20; s += rng.int(26, 40)) {
    const [px, py] = route[s], [qx, qy] = route[s + 1], l = Math.hypot(qx - px, qy - py) || 1, side = rng.chance(0.5) ? 1 : -1;
    const x = px - (qy - py) / l * 3.6 * side, y = py + (qx - px) / l * 3.6 * side;
    if (freeT(x, y)) sprite(rng.pick(['sand_swept_milestone', 'desert_cairn', 'broken_cart_wheel', 'pack_saddle']), x, y, { solid: true });
  }
  // the tomb: torches on the walls the camera sees, columns in the halls, jars along the walls, the sarcophagus
  const torchOk = (x, y) => {
    const i = I(x, y);
    if (!walk[i]) return null;
    for (const [ox, oy] of [[-1, 0], [0, -1]]) {
      const t = tileAt(x + ox, y + oy);
      if (t < 0 || walk[t]) continue;
      const mx = x + 0.5 + ox * 0.5, my = y + 0.5 + oy * 0.5, wh = H2(x + 0.5 + ox * 1.5, y + 0.5 + oy * 1.5);
      if (wh - F[i] > 2.6) return { x: mx - ox * 0.12, y: my - oy * 0.12, h: F[i] + 1.7, nx: -ox, ny: -oy };
    }
    return null;
  };
  for (let n = 0; n < 6000; n++) {
    const x = rng.int(OXI, W - 2), y = rng.int(OYI, Math.min(H - 2, OYI + IS)), t = torchOk(x, y);
    if (t && !torches.some((o) => !o.stand && (o.x - t.x) ** 2 + (o.y - t.y) ** 2 < 36)) torches.push(t);
  }
  const blockT = (x, y) => { const i = I(Math.floor(x), Math.floor(y)); if (walk[i]) map.block[i] = 1; };
  const tombProps = (rm, kind) => {
    const w = rm.x1 - rm.x0 + 1, h = rm.y1 - rm.y0 + 1;
    if (kind === 'columns' && w > 11 && h > 11) {
      for (const fy of [0.3, 0.7]) for (let fx = 0.2; fx <= 0.81; fx += 0.2) {
        const x = Math.floor(rm.x0 + w * fx), y = Math.floor(rm.y0 + h * fy);
        props.push({ x: x + 1, y: y + 1, caveProp: 'pillar', m: 0, flip: false, h: VIS_IN[DREG.hall] });
        blockT(x, y); blockT(x + 1, y); blockT(x, y + 1); blockT(x + 1, y + 1);
      }
    }
    for (let n = 0; n < Math.round((w + h) / 4); n++) {   // jars and urns along the walls
      const side = rng.int(0, 3), along = rng.range(1.5, (side % 2 ? h : w) - 1.5);
      const x = side === 0 ? rm.x0 + along : side === 1 ? rm.x0 + 0.8 : side === 2 ? rm.x0 + along : rm.x1 + 0.2, y = side === 0 ? rm.y0 + 0.8 : side === 1 ? rm.y0 + along : side === 2 ? rm.y1 + 0.2 : rm.y0 + along;
      if (!map.block[I(Math.floor(x), Math.floor(y))] && !nearP(x, y, 1.4)) { props.push({ x, y, caveProp: 'urn', m: rng.int(0, 2), flip: rng.chance(0.5) }); blockT(x, y); }
    }
  };
  rooms.forEach((rm, k) => { if (rm.room && k) tombProps(rm, rng.chance(0.55) ? 'columns' : 'plain'); });
  tombProps(chamber, 'columns');
  props.push({ x: chamber.cx, y: chamber.cy, caveProp: 'sarcophagus', m: 0, flip: false });
  for (const [ox, oy] of [[-1, -1], [0, -1], [-1, 0], [0, 0], [-1, 1], [0, 1]]) blockT(chamber.cx + ox, chamber.cy + oy);
  for (const s of [-1, 1]) torches.push({ x: chamber.cx + s * 5, y: chamber.cy + 4, h: chH, stand: true }, { x: chamber.cx + s * 5, y: chamber.cy - 4, h: chH, stand: true });
  for (const s of [-1, 1]) torches.push({ x: treasury.cx + s * 2.5, y: treasury.cy, h: treasury.h, stand: true });

  // ---------------------------------------------------------------- spawns and chests
  const spawns = [], chests = [];
  let n = 0;
  for (let s = 26; s < route.length - 10; s += rng.int(22, 32)) {
    const [x, y] = route[s], i = I(Math.floor(x), Math.floor(y));
    if (!walk[i] || Math.hypot(x - start[0], y - start[1]) < 18 || campD(x, y) < 8) continue;
    spawns.push({ x: x + J(2), y: y + J(2), n: rng.int(2, 3 + Math.min(3, Math.floor(depth / 30))), rank: n % 9 === 8 ? 'unique' : n % 4 === 3 ? 'champion' : 'normal', zone: 'trek' });
    n++;
  }
  for (const o of oases) spawns.push({ x: o.x + o.r + 2.5, y: o.y, n: rng.int(3, 4), rank: 'champion', zone: 'trek' });
  for (let k = 0, t = 0; k < Math.round(E / 30) && t < 400; t++) {   // out among the dunes, off the route
    const x = rng.range(14, E - 14), y = rng.range(14, E - 14), i = I(Math.floor(x), Math.floor(y));
    if (!walk[i] || map.block[i] || routeD[i] < 8 || routeD[i] > 30 || campD(x, y) < 8 || Math.hypot(x - start[0], y - start[1]) < 24) continue;
    spawns.push({ x, y, n: rng.int(2, 4), rank: k % 3 === 2 ? 'champion' : 'normal', zone: 'trek' }); k++;
  }
  rooms.forEach((rm, k) => { if (!rm.room && k) spawns.push({ x: rm.cx, y: rm.cy, n: rng.int(2, 4), rank: k % 3 === 2 ? 'champion' : 'normal', zone: 'tomb' }); });
  const looks = duneLooks(v, rng.fn());
  for (const sp of spawns) { sp.arch = rng.pick(DUNE_ROSTER); sp.look = looks.pick(sp.arch); }
  for (const o of oases) { const x = o.x - o.r - 1.6, y = o.y + 0.5; if (walk[I(Math.floor(x), Math.floor(y))]) chests.push({ x, y }); }
  for (let t = 0; t < 3; t++) chests.push({ x: treasury.x0 + 1.5 + t * 3, y: treasury.y0 + 1.5, rich: t === 1 });

  // nothing may cut the way: start to plaza and on through the tomb, the seals open
  const reach = (from, to) => {
    const seen = new Uint8Array(NT), q = [I(Math.floor(from[0]), Math.floor(from[1]))], goal = I(Math.floor(to[0]), Math.floor(to[1]));
    seen[q[0]] = 1;
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      if (i === goal) return true;
      const x = i % W, y = (i / W) | 0;
      for (const [ox, oy] of nb4) {
        const t = tileAt(x + ox, y + oy);
        if (t < 0 || seen[t] || !walk[t] || map.block[t] || Math.abs(hgt[t] - hgt[i]) > 4) continue;
        seen[t] = 1; q.push(t);
      }
    }
    return false;
  };
  const arrive = [rooms[0].cx, rooms[0].y0 + 2.5];
  const cut = [doorStep, ...camps.map((c) => [c.x, c.y])].filter((p) => !reach(start, p)).map((p) => p.map((q) => q.toFixed(1)).join(','));
  const okTrek = !cut.length, okTomb = reach(arrive, [chamber.cx + 4, chamber.cy + 4]);

  const dv = {
    W, H, S, VW, VH, hv, ceil, cls, surf, mat, vreg, vin, vd: Float32Array.from(dd, (q) => Math.sqrt(Math.min(q, 1e6)) / S), v, seed, H2,
    E, OXI, OYI, IS, inside: (x) => x >= OXI - 2, reg, zone, walk, wet, lvl, F,
    start, camps, route, oases, pyramid: { pc, half, top: half * PY.rise, base: hp, door, doorStep, plaza, plazaC, steps: PY.steps },
    rooms, chamber, treasury, corridors, seals, arrive, torches, okTrek, okTomb, cut,
  };
  map.dunes = dv;
  return { map, props, buildings: [], wallHangings: [], torches: [], spawns, chests, looks, start, exit: [chamber.cx, chamber.cy + 6], dunes: dv, variant: v, seed };
}
