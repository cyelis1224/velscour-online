// Height-mapped terrain (world/mountain.js, docs/MOUNTAINSIDE.md): every tile is a column `map.hgt[i]` levels tall
// (HS world px a level). The ground drawn here is baked into the floor chunks like any floor: tile tops lifted by their
// height and, wherever the ground in front is lower, rock cliff faces down to it (the two faces the camera sees: SW
// toward +y and SE toward +x). Terrain rises away from the camera, so faces mostly face it; a column that rises toward
// the camera (`occluders`) is drawn again in the depth-sorted pass over anyone standing behind it.
import { G } from '../state.js';
import { HW, HH, TW, TH, setElevation } from '../core/view.js';
import { makeCanvas, clamp } from '../core/util.js';
import { castle3dState, drawPiece, pieceRect } from './castle3dart.js';
import { drawCastleFace } from './castlewalls.js';
import { breachUnderside, UNDERSIDE_HANG } from './breach.js';

export const HS = 4; // world px per height level

const hash = (x, y, s) => {
  let h = Math.imul(x ^ 0x2c1b3c6d, 0x297a2d39) ^ Math.imul(y ^ s, 0x1b873593);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};

// ------------------------------------------------------------------ rock
const rocks = {};
/** Two 64x64 tiling rock faces (lit SW faces, shaded SE faces): broken granite in angular facets, taller than wide,
 * each lit along its top and shadowed at its foot, with thin broken cracks between and a little lichen. */
function rockPatterns(ctx, style = '') {
  let rock = rocks[style];
  if (!rock) {
    const S = 64, pts = [];
    for (let k = 0; k < 26; k++) pts.push([hash(k, 1, 91) * S, hash(k, 2, 91) * S]);
    const make = (dark) => {
      const c = makeCanvas(S, S), g = c.getContext('2d'), d = g.createImageData(S, S), p = d.data;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        let d1 = Infinity, d2 = Infinity, near = 0, vy = 0;
        for (let k = 0; k < pts.length; k++) {
          let dx = x - pts[k][0], dy = y - pts[k][1];
          dx -= S * Math.round(dx / S); dy -= S * Math.round(dy / S);
          const dd = Math.hypot(dx * 1.5, dy * 0.85);
          if (dd < d1) { d2 = d1; d1 = dd; near = k; vy = dy; } else if (dd < d2) d2 = dd;
        }
        const edge = d2 - d1, tone = hash(near, 3, 7);
        // a facet: lit on top, falling into shadow at its foot
        let v = 0.34 + tone * 0.16 - vy * 0.012 + (hash(x, y, 5) - 0.5) * 0.08 + (hash(x >> 1, y >> 1, 9) - 0.5) * 0.05;
        const crack = hash((x + near * 7) >> 2, (y + near * 3) >> 2, 21) > 0.35;
        if (edge < 0.9 && crack) v -= 0.2; else if (edge < 1.8) v -= vy > 0 ? 0.09 : -0.05;
        let r = v * 1.02 + 0.015, gg = v * 0.96 + 0.01, b = v * 0.86;
        if (hash(near, 4, 13) > 0.8 && edge > 2 && hash(x >> 1, y >> 1, 17) > 0.5) { r = r * 0.82 + 0.05; gg = gg * 0.85 + 0.11; b *= 0.72; }
        if (style === 'breach') {
          // the Breach: dark violet-grey basalt, its cracks lit by the rift
          const l = r * 0.3 + gg * 0.59 + b * 0.11;
          r = l * 0.78 + 0.03; gg = l * 0.66; b = l * 0.95 + 0.05;
          if (edge < 0.9 && crack && hash(near, 6, 19) > 0.8) { r = 0.55; gg = 0.25; b = 0.85; }
        }
        if (dark) { r *= 0.7; gg *= 0.72; b *= 0.82; }
        const i = (y * S + x) * 4;
        p[i] = 255 * clamp(r, 0, 1); p[i + 1] = 255 * clamp(gg, 0, 1); p[i + 2] = 255 * clamp(b, 0, 1); p[i + 3] = 255;
      }
      g.putImageData(d, 0, 0);
      return c;
    };
    rock = rocks[style] = { lit: make(false), dark: make(true) };
  }
  if (!rock.pl || rock.ctx !== ctx) { rock.ctx = ctx; rock.pl = ctx.createPattern(rock.lit, 'repeat'); rock.pd = ctx.createPattern(rock.dark, 'repeat'); }
  return rock;
}

/** A floor's earth bank (the face of a step one level high): its own ground, darker, as a 32x16 tile. */
function bankOf(f, dark) {
  const key = dark ? '_bankD' : '_bankL';
  if (!f[key]) {
    const c = makeCanvas(32, 16), g = c.getContext('2d');
    g.drawImage(f.img, f.sx + f.w * 0.3, f.sy + f.h * 0.3, f.w * 0.4, f.h * 0.4, 0, 0, 32, 16);
    g.fillStyle = dark ? 'rgba(14,12,10,0.52)' : 'rgba(14,12,10,0.3)'; g.fillRect(0, 0, 32, 16);
    f[key] = c;
  }
  return f[key];
}

// ------------------------------------------------------------------ per-map cache
/** Draw order, face depths, screen boxes and occluders of a height map (built once). */
export function terrainOf(map) {
  if (map._terr) return map._terr;
  const { w, h, hgt, t } = map, N = w * h, base = map.baseLevel ?? 0, under = map.under;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h || t[y * w + x] !== 1 ? null : hgt[y * w + x]);
  const sw = new Int16Array(N), se = new Int16Array(N), box = new Float32Array(N * 4), order = [], occ = [], covers = [];
  const c3 = map.c3struct && castle3dState(map.castleVariant);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (t[i] !== 1) continue;
    const v = hgt[i], s = at(x, y + 1), e = at(x + 1, y);
    // over the void a face runs down to the column's own underside (the Breach's islands) or the map's base
    const foot = under ? under[i] : base;
    sw[i] = Math.max(0, s === null ? v - foot : v - s);
    se[i] = Math.max(0, e === null ? v - foot : v - e);
    const px = (x - y) * HW, py = (x + y) * HH - v * HS;
    box[i * 4] = px - HW; box[i * 4 + 1] = py; box[i * 4 + 2] = px + HW; box[i * 4 + 3] = py + TH + Math.max(sw[i], se[i]) * HS + (map.voidFace && (s === null || e === null) ? UNDERSIDE_HANG : 0);
    if (map.rounded && map.rounded[i]) { // its fills reach half a tile into the void beside it, with their faces
      box[i * 4] -= HW; box[i * 4 + 2] += HW; box[i * 4 + 1] -= HH; box[i * 4 + 3] = Math.max(box[i * 4 + 3], py + TH + HH + (v - (under ? under[i] : base)) * HS + UNDERSIDE_HANG);
    }
    order.push(i);
    if (c3) {   // the Castle's baked masonry (docs/CASTLE_3D.md): the box is its pieces' own
      const gx = (x - y) * HW, gy = (x + y) * HH;
      for (const id of [c3.base.get(i), c3.over.get(i)]) {
        if (id === undefined) continue;
        const [rx, ry, rw, rh] = pieceRect(id, gx, gy);
        box[i * 4] = Math.min(box[i * 4], rx); box[i * 4 + 1] = Math.min(box[i * 4 + 1], ry);
        box[i * 4 + 2] = Math.max(box[i * 4 + 2], rx + rw); box[i * 4 + 3] = Math.max(box[i * 4 + 3], ry + rh);
      }
      if (c3.over.has(i)) covers.push(i);
    }
    // rises toward the camera over a tile behind it: may hide someone standing there. Walls (the Castle) rise far over
    // the ground behind them, so the window looks back as many rows as the column's height covers.
    let hides = false;
    if (!map.tallOcclusion) {
      const b1 = at(x - 1, y), b2 = at(x, y - 1), b3 = at(x - 1, y - 1);
      hides = (b1 !== null && b1 < v) || (b2 !== null && b2 < v) || (b3 !== null && b3 < v);
    } else if (v > 0) {
      const R = Math.min(14, Math.ceil((v * HS + 40) / HH));
      for (let b = 0; b <= R && !hides; b++) for (let a = 0; a + b <= R && !hides; a++) {
        const u = (a || b) ? at(x - a, y - b) : null;
        if (u !== null && u < v - 2 && (v - u) * HS > (a + b - 1) * HH) hides = true;
      }
    }
    if (map.occStruct && map.c3struct?.[i]) hides = true;   // the Sky Battle's ship: every bulwark, fitting and the bridge
    if (hides && !(map.rounded && map.rounded[i])) occ.push(i); // a walkway's steps (a level or two) hide no one worth a redraw
  }
  order.sort((a, b) => ((a % w) + ((a / w) | 0)) - ((b % w) + ((b / w) | 0)) || a - b);
  // occluders bucketed by 256 world px screen cells, for the props' lookups (occludersOfRect)
  const cells = new Map(), C = 256;
  for (const i of occ) {
    const k = i * 4;
    for (let cy = Math.floor(box[k + 1] / C); cy <= Math.floor(box[k + 3] / C); cy++) for (let cx = Math.floor(box[k] / C); cx <= Math.floor(box[k + 2] / C); cx++) {
      const key = cx * 65536 + cy;
      let l = cells.get(key);
      if (!l) cells.set(key, (l = []));
      l.push(i);
    }
  }
  return (map._terr = { sw, se, box, order, occ, covers, objs: new Map(), cobjs: new Map(), cells, C, chunks: null, w });
}

/**
 * Is ground at (x,y) (tile units) hidden behind a column in front of it? For things drawn flat before the sorted
 * pass (corpses, decals, ground particles, the water's ripples), so the Castle's walls hide what lies behind them.
 */
export function hiddenBehind(map, x, y) {
  if (!map || !map.hgt || !map.tallOcclusion) return false;
  const { w, h, hgt, t } = map, tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= w || ty >= h) return false;
  const T = terrainOf(map), lv = hgt[ty * w + tx];
  // column (a,b) tiles in front: the point sits Y px below the centre of its lifted top; its silhouette is the top
  // diamond (+-HH) and the faces hanging F px under it
  for (let s = 1; s <= 16; s++) for (let a = s >> 1; a <= (s + 1) >> 1; a++) {
    const b = s - a, X = tx + a, Y0 = ty + b;
    if (X >= w || Y0 >= h) continue;
    const j = Y0 * w + X;
    if (t[j] !== 1) continue;
    const Y = (hgt[j] - lv) * HS - s * HH, F = Math.max(T.sw[j], T.se[j]) * HS;
    if (a === b ? Y >= -HH && Y <= HH + F : Y > 0 && Y < F) return true;
  }
  return false;
}

/** The elevation and picking functions for view.js; null clears them (flat maps). */
export function useTerrain(map) {
  CUR = map && map.hgt ? map : null;
  if (!map || !map.hgt) { setElevation(null, null); return; }
  const { w, h, hgt, t } = map;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < w * h; i++) if (t[i] === 1) { lo = Math.min(lo, hgt[i]); hi = Math.max(hi, hgt[i]); }
  const ramp = map.ramp, rt = map.rampTile, W1 = w + 1;
  const elev = (x, y) => {
    const tx = Math.min(w - 1, Math.max(0, Math.floor(x))), ty = Math.min(h - 1, Math.max(0, Math.floor(y))), i = ty * w + tx;
    if (!rt || !rt[i]) return hgt[i] * HS;
    // a ramp (the Breach's walkways): the ground between its four corner heights
    const fx = clamp(x - tx, 0, 1), fy = clamp(y - ty, 0, 1), c = ty * W1 + tx;
    return ((ramp[c] * (1 - fx) + ramp[c + 1] * fx) * (1 - fy) + (ramp[c + W1] * (1 - fx) + ramp[c + W1 + 1] * fx) * fy) * HS;
  };
  // the first lifted column met going into the screen: from the highest level (nearest the camera) down
  const pick = (wx, wy) => {
    for (let k = hi; k >= lo; k--) {
      const yy = wy + k * HS, x = (wx / HW + yy / HH) / 2, y = (yy / HH - wx / HW) / 2;
      const tx = Math.floor(x), ty = Math.floor(y);
      if (tx < 0 || ty < 0 || tx >= w || ty >= h || t[ty * w + tx] !== 1) continue;
      const v = hgt[ty * w + tx];
      if (v === k) return [x, y];
      if (v > k) return [tx + 0.5, ty + 0.5]; // on that column's cliff face
    }
    const yy = wy + lo * HS;
    return [(wx / HW + yy / HH) / 2, (yy / HH - wx / HW) / 2];
  };
  setElevation(elev, pick);
}

let CUR = null;
/** hiddenBehind on the map in play (vfx.js decals). */
export const groundHidden = (x, y) => hiddenBehind(CUR, x, y);

// ------------------------------------------------------------------ drawing
const SOIL = { grass: '#3f5222', moss: '#3c4a22', dirt: '#5a4330', snow: '#d8dde0' };
const pats = new WeakMap();
function bankPattern(ctx, f, dark) {
  const img = bankOf(f, dark);
  let m = pats.get(img);
  if (!m || m.ctx !== ctx) pats.set(img, (m = { ctx, p: ctx.createPattern(img, 'repeat') }));
  return m.p;
}

function quad(ctx, x0, y0, dx, dy, top, bot) {
  ctx.beginPath();
  ctx.moveTo(x0, y0 + top); ctx.lineTo(x0 + dx, y0 + dy + top); ctx.lineTo(x0 + dx, y0 + dy + bot); ctx.lineTo(x0, y0 + bot); ctx.closePath();
}
function face(ctx, R, f, i, x0, y0, dx, dy, depth, dark, deep) {
  const D = depth * HS, soil = f.soil || null, skew = new DOMMatrix([1, dy / dx, 0, 1, 0, 0]);
  // an earth bank under grass, dirt or snow (the whole face of a one-level step), rock below it
  const bank = soil ? Math.min(D, 10) : 0;
  if (bank < D) {
    quad(ctx, x0, y0, dx, dy, bank, D);
    const pat = dark ? R.pd : R.pl;
    pat.setTransform(skew); ctx.fillStyle = pat; ctx.fill();
  }
  if (bank) {
    quad(ctx, x0, y0, dx, dy, 0, bank);
    const pat = bankPattern(ctx, f, dark);
    pat.setTransform(skew); ctx.fillStyle = pat; ctx.fill();
  }
  // darker toward the foot; a skirt over the void fades into the haze below
  quad(ctx, x0, y0, dx, dy, 0, D);
  const gr = ctx.createLinearGradient(0, y0, 0, y0 + D + Math.abs(dy));
  if (deep) { gr.addColorStop(0, 'rgba(10,14,22,0)'); gr.addColorStop(0.3, 'rgba(10,14,22,0.3)'); gr.addColorStop(1, 'rgba(10,14,22,0.95)'); }
  else { gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)'); }
  ctx.fillStyle = gr; ctx.fill();
  // the turf's lip, with a few tufts hanging over
  if (soil) {
    const lip = 2;
    quad(ctx, x0, y0, dx, dy, 0, lip);
    ctx.fillStyle = SOIL[soil]; ctx.fill();
    ctx.fillStyle = soil === 'snow' ? '#eef2f4' : soil === 'dirt' ? '#4a3626' : '#56702c';
    for (let k = 0; k < 6; k++) {
      const u = hash(i, k, dark ? 41 : 43);
      if (u > 0.75) continue;
      const t = 0.08 + 0.84 * hash(i, k, 47);
      ctx.fillRect(Math.round(x0 + dx * t), Math.round(y0 + dy * t + lip - 1), 2, 1 + Math.floor(u * 4));
    }
  }
  ctx.strokeStyle = soil ? 'rgba(20,16,12,0.3)' : 'rgba(20,16,12,0.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0, y0 + 0.5); ctx.lineTo(x0 + dx, y0 + dy + 0.5); ctx.stroke();
}

const soiled = new WeakMap();
function soilOf(f) {
  let s = soiled.get(f);
  if (!s) soiled.set(f, (s = { ...f, soil: 'dirt' }));
  return s;
}

/** One terrain column: its cliff faces, its top and the shadow cast on it by higher ground behind. `dress` adds a
 * map's own ground detail to the top (the Castle's blended seams). The Castle's 3D masonry (map.c3struct) draws its
 * baked pieces instead (gfx/castle3dart.js); `over` draws only what stands over a walkway, after the walkers. */
export function drawColumn(ctx, world, i, floorEntry, dress = null, over = false) {
  const map = world.map, T = terrainOf(map), w = map.w, x = i % w, y = (i / w) | 0, v = map.hgt[i];
  const px = (x - y) * HW, py = (x + y) * HH - v * HS;
  const c3 = map.c3struct && castle3dState(map.castleVariant);
  if (c3) {
    const gx = (x - y) * HW, gy = (x + y) * HH, b = c3.base.get(i), o = c3.over.get(i);
    if (over) { if (o !== undefined) drawPiece(ctx, o, gx, gy); return; }
    if (map.c3only) { if (b !== undefined) drawPiece(ctx, b, gx, gy); return; }   // all baked (the Sky Battle's ship): no ground of its own
    if (map.c3struct[i]) {
      if (map.c3cover?.[i]) {   // a tunnel or doorway: its floor first
        const f = floorEntry(world, map.v[i]);
        ctx.drawImage(f.img, f.sx, f.sy, f.w, f.h, px - HW - 0.6, py - 0.6, TW + 1.2, TH + 1.2);
      }
      if (b !== undefined) drawPiece(ctx, b, gx, gy);
      if (o !== undefined) drawPiece(ctx, o, gx, gy);
      return;
    }
  }
  const R = rockPatterns(ctx, map.voidFace || '');
  const f = floorEntry(world, map.v[i]);
  const art = map.faceArt && map.faceArt[i];
  const fb = art === 5 ? soilOf(f) : f; // the Castle's river banks: earth over rock
  if (map.rounded && map.rounded[i]) return drawRounded(ctx, map, T, R, f, i, x, y, v, px, py);
  const voidSW = y + 1 >= map.h || map.t[i + w] !== 1, voidSE = x + 1 >= w || map.t[i + 1] !== 1;
  if (T.sw[i] && !(art && drawCastleFace(ctx, map, i, px - HW, py + HH, HW, HH, T.sw[i], false, v, HS))) {
    if (voidSW && map.voidFace) breachUnderside(ctx, i, px - HW, py + HH, HW, HH, T.sw[i] * HS, false, quad, R.pl);
    else face(ctx, R, fb, i, px - HW, py + HH, HW, HH, T.sw[i], false, voidSW);
  }
  if (T.se[i] && !(art && drawCastleFace(ctx, map, i, px, py + TH, HW, -HH, T.se[i], true, v, HS))) {
    if (voidSE && map.voidFace) breachUnderside(ctx, i, px, py + TH, HW, -HH, T.se[i] * HS, true, quad, R.pd);
    else face(ctx, R, fb, i, px, py + TH, HW, -HH, T.se[i], true, voidSE);
  }
  if (art && art !== 5 && (T.sw[i] || T.se[i])) {
    // masonry: a lit quoin on the corner between the two faces, dark silhouette edges where a face ends
    ctx.lineWidth = 1;
    const m = Math.min(T.sw[i], T.se[i]) * HS;
    if (m) { ctx.strokeStyle = 'rgba(220,228,240,0.35)'; ctx.beginPath(); ctx.moveTo(px + 0.5, py + TH); ctx.lineTo(px + 0.5, py + TH + m); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(4,5,9,0.6)';
    // a face's end stands clear of the neighbour beside it down to that neighbour's top
    const bare = (j, d) => (j < 0 || map.t[j] !== 1 ? d : Math.min(d, v - map.hgt[j])) * HS;
    let e;
    if (T.sw[i] && x > 0 && (e = bare(i - 1, T.sw[i])) > 0) { ctx.beginPath(); ctx.moveTo(px - HW + 0.5, py + HH); ctx.lineTo(px - HW + 0.5, py + HH + e); ctx.stroke(); }
    if (T.se[i] && y > 0 && (e = bare(i - w, T.se[i])) > 0) { ctx.beginPath(); ctx.moveTo(px + HW - 0.5, py + HH); ctx.lineTo(px + HW - 0.5, py + HH + e); ctx.stroke(); }
  }
  ctx.drawImage(f.img, f.sx, f.sy, f.w, f.h, px - HW - 0.6, py - 0.6, TW + 1.2, TH + 1.2);
  if (dress) dress(ctx, world, x, y, px, py, f);
  if (c3) {   // masonry reaching over a ground tile (a plinth's batter, a doorway's step)
    const b = c3.base.get(i), o = c3.over.get(i), gx = (x - y) * HW, gy = (x + y) * HH;
    if (b !== undefined) drawPiece(ctx, b, gx, gy);
    if (o !== undefined) drawPiece(ctx, o, gx, gy);
  }
  // a higher neighbour behind (NE: y-1, NW: x-1) shades the strip of this top along their shared edge
  const nb = (j) => (j >= 0 && map.t[j] === 1 ? map.hgt[j] - v : 0);
  const ne = y > 0 ? nb(i - w) : 0, nw = x > 0 ? nb(i - 1) : 0;
  if (ne > 0 || nw > 0) {
    ctx.fillStyle = 'rgba(8,10,16,0.2)';
    for (const [d, ax, ay, bx, by] of [[ne, px, py, px + HW, py + HH], [nw, px, py, px - HW, py + HH]]) {
      if (d <= 0) continue;
      const k = Math.min(0.42, 0.14 + d * 0.025);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      ctx.lineTo(bx + (px - bx) * k, by + (py + HH - by) * k + HH * k); ctx.lineTo(ax + (px - ax) * k, ay + HH * k * 2);
      ctx.closePath(); ctx.fill();
    }
  }
  if (art && art !== 5 && map.tallOcclusion) {
    // a wall top's back edge, where it drops away out of sight to lower ground: a dark rim so it reads as a ledge
    const drop = (j) => j >= 0 && map.t[j] === 1 && v - map.hgt[j] > map.climb;
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(6,8,12,0.55)';
    if (y > 0 && drop(i - w)) { ctx.beginPath(); ctx.moveTo(px, py + 1); ctx.lineTo(px + HW, py + HH + 1); ctx.stroke(); }
    if (x > 0 && drop(i - 1)) { ctx.beginPath(); ctx.moveTo(px, py + 1); ctx.lineTo(px - HW, py + HH + 1); ctx.stroke(); }
  }
  if (art && art !== 5) {
    // the lit lip of a top over its faces
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(230,236,248,0.5)';
    if (T.sw[i]) { ctx.beginPath(); ctx.moveTo(px - HW, py + HH + 0.5); ctx.lineTo(px, py + TH + 0.5); ctx.stroke(); }
    if (T.se[i]) { ctx.beginPath(); ctx.moveTo(px, py + TH + 0.5); ctx.lineTo(px + HW, py + HH + 0.5); ctx.stroke(); }
  }
}

// ------------------------------------------------------------------ rounded columns (the Breach's walkways)
// A walkway running across the grid's diagonal is a staircase of diamonds. On `map.rounded` tiles every corner that
// sticks out into the void is cut by a curve, and every notch between two of them is filled by one (drawn by the later
// of the two tiles beside it, at its height, in its paving), so the walkway's edge runs smooth. Collision is unchanged.
const RK = 0.5, RC = 0.45, RS = 7;   // cut along each edge (fraction), the curve's pull toward the corner, samples
// the 2x2 block round each top-diamond vertex (T, R, B, L): the edge neighbour before it, the one after it, the diagonal
const AROUND = [[[-1, 0], [0, -1], [-1, -1]], [[0, -1], [1, 0], [1, -1]], [[1, 0], [0, 1], [1, 1]], [[0, 1], [-1, 0], [-1, 1]]];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
function curve(a, b, v) {
  const c = lerp(lerp(a, b, 0.5), v, RC), out = [];
  for (let k = 1; k < RS; k++) { const t = k / RS, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); }
  return out;
}
/** The face hanging under segment p-q of a shape whose inside is toward `inside`, if the camera sees it. */
function hang(ctx, R, i, k, p, q, inside, D, voidBelow, f) {
  let [a, b] = p[0] <= q[0] ? [p, q] : [q, p];
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (dx < 0.01 || dx * (inside[1] - a[1]) - dy * (inside[0] - a[0]) >= 0) return; // the inside is below: a back face
  const dark = dy < 0;
  if (voidBelow) breachUnderside(ctx, i * 16 + k, a[0], a[1], dx, dy, D, dark, quad, dark ? R.pd : R.pl, dx < HW * 0.6);
  else face(ctx, R, f, i, a[0], a[1], dx, dy, D / HS, dark, false);
}
/** The plane through three lifted points as a y shear of the flat ground: dz = a x + b y + c (flat world px). */
function plane(F, L) {
  const [[x1, y1], [x2, y2], [x3, y3]] = F, [z1, z2, z3] = L;
  const det = x1 * (y2 - y3) - y1 * (x2 - x3) + (x2 * y3 - x3 * y2);
  if (Math.abs(det) < 1e-6) return [0, 0, z1];
  const A = (z1 * (y2 - y3) - y1 * (z2 - z3) + (z2 * y3 - z3 * y2)) / det;
  const B = (x1 * (z2 - z3) - z1 * (x2 - x3) + (x2 * z3 - x3 * z2)) / det;
  return [A, B, z1 - A * x1 - B * y1];
}
function drawRounded(ctx, map, T, R, f, i, x, y, v, px, py) {
  const w = map.w, h = map.h, ix = (xx, yy) => yy * w + xx;
  const floor = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && map.t[ix(xx, yy)] === 1;
  // a ramp tile (the walkways) has its own height at each corner; any other its level all over
  const W1 = w + 1, ramp = map.rampTile && map.rampTile[i] ? map.ramp : null;
  const ch = ramp ? [ramp[y * W1 + x], ramp[y * W1 + x + 1], ramp[(y + 1) * W1 + x + 1], ramp[(y + 1) * W1 + x]] : [v, v, v, v];
  const fy = py + v * HS, F = [[px, fy], [px + HW, fy + HH], [px, fy + TH], [px - HW, fy + HH]];
  const V = F.map((p, k) => [p[0], p[1] - ch[k] * HS]), C = [px, fy + HH - (ch[0] + ch[2]) * HS / 2];
  const deep = (map.under ? v - map.under[i] : Math.max(T.sw[i], T.se[i])) * HS;
  // the top's outline: the diamond, its void corners cut by curves; tag = the edge a segment runs along (-1: a curve)
  const pts = [], tag = [];
  for (let k = 0; k < 4; k++) {
    const [n1, n2, d] = AROUND[k];
    if (!floor(x + n1[0], y + n1[1]) && !floor(x + n2[0], y + n2[1]) && !floor(x + d[0], y + d[1])) {
      const a = lerp(V[k], V[(k + 3) % 4], RK), b = lerp(V[k], V[(k + 1) % 4], RK);
      pts.push(a); tag.push(-1);
      for (const c of curve(a, b, V[k])) { pts.push(c); tag.push(-1); }
      pts.push(b); tag.push(k);
    } else { pts.push(V[k]); tag.push(k); }
  }
  // the notches beside this tile it fills: [void tile offset, the fill's outline, the corner it fills at]
  const fills = [];
  for (let k = 0; k < 4; k++) {
    const [n1, n2, d] = AROUND[k], dx = x + d[0], dy = y + d[1];
    if (!floor(dx, dy)) continue;
    const f1 = floor(x + n1[0], y + n1[1]), f2 = floor(x + n2[0], y + n2[1]);
    if (f1 === f2 || dx + dy > x + y || (dx + dy === x + y && ix(dx, dy) > i)) continue;
    const before = V[(k + 3) % 4], after = V[(k + 1) % 4], P = V[k];
    // the void one's two edges at this vertex: the one it shares with this tile, the one it shares with the diagonal
    const [q, e1, e2] = !f1 ? [n1, before, after] : [n2, after, before];
    const a = lerp(P, e1, RK), b = [P[0] - (e2[0] - P[0]) * RK, P[1] - (e2[1] - P[1]) * RK];
    fills.push([q, [P, a, ...curve(a, b, P), b], k]);
  }
  // faces: the tile's (straight edges at their own depth, curves into the void), then the fills' curves. A ramp is a
  // slab of even thickness: it hangs faces into the void only, its neighbours meet it at its corners.
  const n = pts.length;
  for (let j = 0; j < n; j++) {
    const p = pts[j], q = pts[(j + 1) % n], t = tag[j];
    if (t === 1 || t === 2) {
      const nx = t === 1 ? x + 1 : x, ny = t === 1 ? y : y + 1, open = !floor(nx, ny);
      const D = ramp ? (open ? deep : 0) : (t === 1 ? T.se[i] : T.sw[i]) * HS;
      if (D > 0) hang(ctx, R, i, j, p, q, C, D, open && map.voidFace, f);
    } else if (t === -1 && deep > 0) hang(ctx, R, i, j, p, q, C, deep, map.voidFace, f);
  }
  for (const [, poly] of fills) for (let j = 1; j < poly.length - 1; j++) if (deep > 0) hang(ctx, R, i, 20 + j, poly[j], poly[j + 1], poly[0], deep, map.voidFace, f);
  // the tops: this tile's paving clipped to its outline (a ramp's tilted, a triangle at a time, on the planes through
  // its corners), and moved into each notch it fills
  const path = (poly) => { ctx.beginPath(); ctx.moveTo(poly[0][0], poly[0][1]); for (let j = 1; j < poly.length; j++) ctx.lineTo(poly[j][0], poly[j][1]); ctx.closePath(); };
  const paint = (poly, tri, ox, oy, pl) => {
    ctx.save();
    path(poly); ctx.clip();
    if (tri) { path(tri); ctx.clip(); }
    if (pl) ctx.transform(1, pl[0], 0, 1 + pl[1], 0, pl[2]);
    ctx.drawImage(f.img, f.sx, f.sy, f.w, f.h, px - HW - 0.6 + ox, fy - (pl ? 0 : v * HS) - 0.6 + oy, TW + 1.2, TH + 1.2);
    ctx.restore();
  };
  const planeOf = (a, b, c) => plane([F[a], F[b], F[c]], [-ch[a] * HS, -ch[b] * HS, -ch[c] * HS]);
  const flat = ch.every((c) => c === ch[0]);
  if (flat) paint(pts, null, 0, 0, null);
  else {
    // the two triangles either side of the T-B diagonal, each a little over the line so no seam shows
    const m = 0.6, tT = [V[0][0], V[0][1] - m], tB = [V[2][0], V[2][1] + m];
    paint(pts, [tT, [V[1][0] + 2, V[1][1]], tB], 0, 0, planeOf(0, 1, 2));
    paint(pts, [tT, tB, [V[3][0] - 2, V[3][1]]], 0, 0, planeOf(0, 2, 3));
  }
  for (const [q, poly, k] of fills) {
    const ox = (q[0] - q[1]) * HW, oy = (q[0] + q[1]) * HH;
    if (flat) paint(poly, null, ox, oy, null);
    else paint(poly, null, ox, oy, planeOf((k + 3) % 4, k, (k + 1) % 4));
  }
}

/** Every column overlapping the world px rect, back to front (the floor chunk bake and its fallback). */
export function drawTerrain(ctx, world, x0, y0, x1, y1, floorEntry, dress = null) {
  const T = terrainOf(world.map), b = T.box;
  for (const i of columnsIn(T, x0, y0, x1, y1)) {
    const k = i * 4;
    if (b[k] > x1 || b[k + 2] < x0 || b[k + 1] > y1 || b[k + 3] < y0) continue;
    drawColumn(ctx, world, i, floorEntry, dress);
  }
}
// Columns bucketed (in draw order) by the 384 px floor chunks their boxes touch: a chunk's bake reads one bucket
// instead of scanning the whole map.
const CHUNK = 384;
function columnsIn(T, x0, y0, x1, y1) {
  if (!T.chunks) {
    const m = (T.chunks = new Map()), b = T.box;
    for (const i of T.order) {
      const k = i * 4;
      for (let cy = Math.floor(b[k + 1] / CHUNK); cy <= Math.floor(b[k + 3] / CHUNK); cy++) for (let cx = Math.floor(b[k] / CHUNK); cx <= Math.floor(b[k + 2] / CHUNK); cx++) {
        const key = cx * 65536 + cy;
        let l = m.get(key);
        if (!l) m.set(key, (l = []));
        l.push(i);
      }
    }
  }
  const cx0 = Math.floor(x0 / CHUNK), cx1 = Math.floor((x1 - 0.001) / CHUNK), cy0 = Math.floor(y0 / CHUNK), cy1 = Math.floor((y1 - 0.001) / CHUNK);
  if (cx0 === cx1 && cy0 === cy1) return T.chunks.get(cx0 * 65536 + cy0) || [];
  const set = new Set();
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) for (const i of T.chunks.get(cx * 65536 + cy) || []) set.add(i);
  const w = T.w;
  return [...set].sort((a, b) => ((a % w) + ((a / w) | 0)) - ((b % w) + ((b / w) | 0)) || a - b);
}

/**
 * The sort key of something standing at (x,y) on a height map: its tile's diagonal, nudged by where in the tile it
 * stands, so the column of a tile it stands behind (key tx+ty+0.5) always sorts after it.
 */
export function standKey(x, y) {
  const s = Math.floor(x) + Math.floor(y) + 1;
  return s + (x + y - s) * 0.2;
}

/** Occluding columns in front of someone in `views` (render.js): [[key, obj], ...] to add to the sorted pass; a view
 * hidden by one is stamped `hid` (render.js draws the hero's silhouette over the Castle's walls). */
export function occludersFor(map, vr, views, out) {
  const T = terrainOf(map), b = T.box, w = map.w, H = map.hgt, tall = map.tallOcclusion;
  for (const v of views) v.lv = H[map.tileIdx(v.at[0], v.at[1])];
  for (const i of T.occ) {
    const k = i * 4;
    if (b[k] > vr.x1 || b[k + 2] < vr.x0 || b[k + 1] > vr.y1 || b[k + 3] < vr.y0) continue;
    const key = (i % w) + ((i / w) | 0) + 0.5;
    for (const v of views) {
      if (v.d >= key || v.x + v.hw < b[k] || v.x - v.hw > b[k + 2] || v.y1 < b[k + 1] || v.y0 > b[k + 3]) continue;
      if (tall && H[i] <= v.lv + map.climb) continue; // no higher than the ground under them
      let o = T.objs.get(i);
      if (!o) T.objs.set(i, (o = { ti: i }));
      v.hid = G.frame;
      const cx = Math.max(24, v.hw * 2.8);
      if (o._f === G.frame) { if (tall) clipAdd(o, v.x - cx, v.y0 - 6, v.x + cx, v.y1 + 10); if (!tall) break; continue; }
      o._f = G.frame; o.clip = null;
      if (tall) clipAdd(o, v.x - cx, v.y0 - 6, v.x + cx, v.y1 + 10);
      out.push(key, o);
      if (!tall) break;
    }
  }
  for (const i of T.covers || []) {
    const k = i * 4;
    if (b[k] > vr.x1 || b[k + 2] < vr.x0 || b[k + 1] > vr.y1 || b[k + 3] < vr.y0) continue;
    const key = (i % w) + ((i / w) | 0) + 1.25;
    for (const v of views) {
      if (v.d >= key || v.x + v.hw < b[k] || v.x - v.hw > b[k + 2] || v.y1 < b[k + 1] || v.y0 > b[k + 3]) continue;
      let o = T.cobjs.get(i);
      if (!o) T.cobjs.set(i, (o = { ti: i, over: true }));
      out.push(key, o);
      break;
    }
  }
  return out;
}

/** Occluding columns over a static thing drawn at screen rect r ([x0, y0, x1, y1] world px) standing at sort key
 * `key` on ground level `lv` (props, buildings, chests behind the Castle's walls): indices, computed once per thing. */
export function occludersOfRect(map, r, key, lv) {
  const T = terrainOf(map), b = T.box, w = map.w, H = map.hgt, C = T.C, out = [];
  const seen = new Set();
  for (let cy = Math.floor(r[1] / C); cy <= Math.floor(r[3] / C); cy++) for (let cx = Math.floor(r[0] / C); cx <= Math.floor(r[2] / C); cx++) {
    for (const i of T.cells.get(cx * 65536 + cy) || []) {
      if (seen.has(i)) continue;
      seen.add(i);
      const k = i * 4;
      if (b[k] > r[2] || b[k + 2] < r[0] || b[k + 1] > r[3] || b[k + 3] < r[1]) continue;
      if ((i % w) + ((i / w) | 0) + 0.5 <= key || H[i] <= lv + map.climb) continue;
      out.push(i);
    }
  }
  return out;
}
/** Grow the screen rect a redrawn column is clipped to (the things it is drawn over this frame): drawn whole, a column's
 * faces would spill over its neighbours in front that aren't redrawn. */
export function clipAdd(o, x0, y0, x1, y1) {
  const c = o.clip;
  if (!c) { o.clip = [x0, y0, x1, y1]; return; }
  if (x0 < c[0]) c[0] = x0; if (y0 < c[1]) c[1] = y0; if (x1 > c[2]) c[2] = x1; if (y1 > c[3]) c[3] = y1;
}
/** The column object occludersFor would hand out for tile i (one per tile, stamped per frame). */
export function occluderObj(map, i) {
  const T = terrainOf(map);
  let o = T.objs.get(i);
  if (!o) T.objs.set(i, (o = { ti: i }));
  return o;
}

/** World px a creature's sprite rides above its tile's ground while it hops up or drops down a step (0 at rest). */
export function hopZ(o, map) {
  const ti = map.tileIdx(o.x, o.y), lv = map.hgt[ti];
  if (o._hopMap !== map) { o._hopMap = map; o._lv = lv; o._hop = null; return 0; }
  // on and off a ramp the ground itself carries them (the elevation is smooth there): no hop
  if (map.rampTile && (map.rampTile[ti] || map.rampTile[o._ti ?? ti])) { o._ti = ti; o._lv = lv; o._hop = null; return 0; }
  o._ti = ti;
  const now = (hp) => {
    const t = clamp((G.time - hp.t0) / hp.dur, 0, 1);
    return hp.from * (1 - (hp.up ? 1 - (1 - t) * (1 - t) : t * t)) + hp.arc * Math.sin(Math.PI * t);
  };
  if (lv !== o._lv) {
    const cur = o._hop ? now(o._hop) : 0, dl = o._lv - lv; // dl > 0: dropped down
    // a level or so is just walked; a real step up is hopped, a drop fallen
    const walk = map.walkStep ?? 1; // steps up to this many levels are walked (the Castle's stairs), not hopped
    o._hop = { t0: G.time, from: dl * HS + cur, up: dl < 0, dur: dl < 0 ? (-dl <= walk ? 0.08 + -dl * 0.025 : 0.1 + -dl * 0.035) : 0.06 + dl * 0.02, arc: -dl > walk ? 2 + -dl * 1.8 : dl > 2 ? 2 : 0 };
    o._lv = lv;
  }
  if (!o._hop) return 0;
  if (G.time - o._hop.t0 >= o._hop.dur) { o._hop = null; return 0; }
  return now(o._hop);
}

// ------------------------------------------------------------------ sky
let skyKey = '', skyCanvas = null;
/** The open sky behind a mountain (screen space): a gradient and two ranges of far peaks drifting with the camera. */
export function drawSky(ctx, W, H, camX, camY, night) {
  const key = W + 'x' + H + (night ? 'n' : 'd');
  if (key !== skyKey) {
    skyKey = key;
    skyCanvas = makeCanvas(W, H);
    const g = skyCanvas.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, H);
    if (night) { gr.addColorStop(0, '#0b1426'); gr.addColorStop(0.6, '#1d2a40'); gr.addColorStop(1, '#2a3346'); }
    else { gr.addColorStop(0, '#5f8fc0'); gr.addColorStop(0.55, '#a9c3d6'); gr.addColorStop(1, '#d9dcd2'); }
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  ctx.drawImage(skyCanvas, 0, 0);
  // far ranges: a jagged ridge line per layer, scrolled a little with the camera
  const layers = night ? [['#1a2436', 0.04, 0.5], ['#141c2b', 0.09, 0.62]] : [['#8ea6bb', 0.04, 0.5], ['#71889d', 0.09, 0.62]];
  for (const [col, par, lvl] of layers) {
    const off = camX * par, base = H * lvl - camY * par * 0.5;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0, H);
    const step = Math.max(24, W / 40);
    for (let u = Math.floor(off / step) - 1; u <= Math.ceil((off + W) / step) + 1; u++) {
      const sx = u * step - off, peak = hash(u, 1, (par * 1000) | 0), ridge = Math.sin(u * step * 0.004) * H * 0.06;
      ctx.lineTo(sx, base - ridge - peak * H * 0.12);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }
}

// ------------------------------------------------------------------ minimap
/** Minimap colour of a tile by height (paler higher up). */
export function terrainShade(map, i) {
  const k = clamp((map.hgt[i] - (map.minLevel || 0)) / Math.max(1, (map.maxLevel || 1) - (map.minLevel || 0)), 0, 1);
  return `rgba(${(120 + 110 * k) | 0},${(140 + 85 * k) | 0},${(95 + 120 * k) | 0},0.6)`;
}
