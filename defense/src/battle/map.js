// A battle map from its ASCII layout (data/maps.js): heights, roads, routes from each rift to the Heart, posts.
// Pure (no DOM): the balance tests build maps in Node.
import { MAPS, stageMapRef } from '../data/maps.js';
import { RNG, clamp } from '../core/util.js';
import { deployLimit } from '../data/waves.js';

export const K = { GROUND: 0, PATH: 1, WATER: 2, POST: 3, PROP: 4 };

function transform(rows, tf) {
  let g = rows.map((r) => r.split(''));
  const w = Math.max(...g.map((r) => r.length));
  g = g.map((r) => { while (r.length < w) r.push('.'); return r; });
  if (tf.includes('T')) g = g[0].map((_, x) => g.map((r) => r[x]));
  if (tf.includes('F')) g = g.map((r) => r.reverse());
  if (tf.includes('V')) g = g.reverse();
  return g;
}

/** Smooth seeded value noise in [0,1]. */
function noise2(rng, w, h, cell) {
  const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2, v = Array.from({ length: gw * gh }, () => rng.next());
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
    const a = v[iy * gw + ix], b = v[iy * gw + ix + 1], c = v[(iy + 1) * gw + ix], d = v[(iy + 1) * gw + ix + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
}

/** Build stage n's map (or map index mi with transform tf). */
export function buildMap(n, override) {
  const ref = { ...(override || stageMapRef(n)) }, M = MAPS[ref.map], g = transform(M.rows, ref.tf);
  ref.minPosts ??= deployLimit(n) + 3;
  const h = g.length, w = g[0].length, N = w * h, rng = new RNG('map:' + n + ':' + ref.map + ref.tf);
  const kind = new Uint8Array(N), hgt = new Int8Array(N), ch = (x, y) => g[y][x], I = (x, y) => y * w + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const isPath = (c) => c === '#' || c === '=' || c === 'S' || c === 'H';
  const spawns = [], posts = [], props = [];
  let heart = null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = ch(x, y);
    if (isPath(c)) kind[I(x, y)] = K.PATH;
    else if (c === 'w') kind[I(x, y)] = K.WATER;
    else if (c === 'o' || c === 'O') { kind[I(x, y)] = K.POST; posts.push({ x, y, raised: c === 'O' }); }
    else if (c === 'T' || c === 'r') { kind[I(x, y)] = K.PROP; props.push({ x, y, big: c === 'T' }); }
    if (c === 'S') spawns.push([x, y]);
    if (c === 'H') heart = [x, y];
  }
  if (!heart || !spawns.length) throw new Error(`map ${M.name}: needs S and H`);
  // road distance from the Heart, and the road's height: the rift end low, rising `climb` levels to the Heart
  const dH = new Int16Array(N).fill(-1), q = [heart];
  dH[I(...heart)] = 0;
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (inb(nx, ny) && kind[I(nx, ny)] === K.PATH && dH[I(nx, ny)] < 0) { dH[I(nx, ny)] = dH[I(x, y)] + 1; q.push([nx, ny]); }
    }
  }
  let maxD = 1;
  for (let i = 0; i < N; i++) if (kind[i] === K.PATH) { if (dH[i] < 0) throw new Error(`map ${M.name}: road cut off at ${i % w},${Math.floor(i / w)}`); maxD = Math.max(maxD, dH[i]); }
  for (let i = 0; i < N; i++) if (kind[i] === K.PATH) hgt[i] = Math.round(M.climb * (1 - dH[i] / maxD));
  // ground: the nearest road's height, plus rolling terraces that grow away from the road
  const near = new Int16Array(N).fill(999), nearH = new Int8Array(N), bq = [];
  for (let i = 0; i < N; i++) if (kind[i] === K.PATH) { near[i] = 0; nearH[i] = hgt[i]; bq.push(i); }
  for (let qi = 0; qi < bq.length; qi++) {
    const i = bq[qi], x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, j = I(nx, ny);
      if (inb(nx, ny) && near[j] > near[i] + 1) { near[j] = near[i] + 1; nearH[j] = nearH[i]; bq.push(j); }
    }
  }
  const nz = noise2(rng, w, h, 3.2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = I(x, y);
    if (kind[i] === K.PATH) continue;
    if (kind[i] === K.WATER) { hgt[i] = 0; continue; }
    const rise = near[i] <= 1 ? (M.hills >= 3 && nz(x, y) > 0.6 ? 1 : 0) : Math.floor(nz(x, y) * (M.hills + 0.6) * clamp((near[i] - 1) / 2, 0, 1));
    hgt[i] = nearH[i] + rise + (ch(x, y) === '^' ? 2 : 0);
  }
  const roadDist = (x, y) => { let d = 99; for (let j = 0; j < N; j++) if (kind[j] === K.PATH) d = Math.min(d, Math.hypot(j % w - x, ((j / w) | 0) - y)); return d; };
  // top up the posts to the stage's need with ones beside the road, as far from the others as possible
  const need = Math.min(14, (ref.minPosts || 0)), isNear = (p) => p.dist <= 2.3;
  for (const p of posts) p.dist = roadDist(p.x, p.y);
  while (posts.filter(isNear).length < need) {
    let best = null, bs = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (kind[I(x, y)] !== K.GROUND || ch(x, y) === '^') continue;
      const d = roadDist(x, y);
      if (d > 1.5) continue;
      const sep = Math.min(99, ...posts.map((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y))));
      if (sep < 2) continue;
      const s = sep + (d <= 1 ? 0.5 : 0) + rng.next() * 0.3;
      if (s > bs) { bs = s; best = { x, y, raised: rng.chance(0.3), dist: d, auto: true }; }
    }
    if (!best) break;
    kind[I(best.x, best.y)] = K.POST; posts.push(best);
  }
  for (const p of posts) { const i = I(p.x, p.y); if (p.raised) hgt[i] += 1; p.h = hgt[i]; }
  posts.forEach((p, i) => { p.id = i; });
  // every route from each rift to the Heart (depth-first over the road, simple paths only, a few per rift)
  const routes = [];
  for (const s of spawns) {
    const found = [], seen = new Uint8Array(N), path = [];
    const dfs = (x, y) => {
      if (found.length >= 4) return;
      path.push([x, y]); seen[I(x, y)] = 1;
      if (x === heart[0] && y === heart[1]) found.push(path.slice());
      else {
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy])
          .filter(([nx, ny]) => inb(nx, ny) && kind[I(nx, ny)] === K.PATH && !seen[I(nx, ny)])
          .sort((a, b) => dH[I(...a)] - dH[I(...b)]);
        for (const [nx, ny] of nb) dfs(nx, ny);
      }
      path.pop(); seen[I(x, y)] = 0;
    };
    dfs(s[0], s[1]);
    for (const f of found) routes.push(makeRoute(f.map(([x, y]) => [x + 0.5, y + 0.5, hgt[I(x, y)]]), s));
  }
  return { n, name: M.name, ref, w, h, kind, hgt, chars: g, spawns, heart, posts, props, routes, I, inb,
    isRoad: (x, y) => inb(x, y) && kind[I(x, y)] === K.PATH, H: (x, y) => (inb(x, y) ? hgt[I(x, y)] : 0) };
}

function makeRoute(pts, spawn) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1], spawn };
}

/** The point s tiles along a route: [x, y, z] (z eases between tiles, so stairs read as a climb). */
export function routeAt(r, s, out = [0, 0, 0]) {
  s = clamp(s, 0, r.len);
  let lo = 0, hi = r.cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.cum[m] <= s) lo = m; else hi = m; }
  const a = r.pts[lo], b = r.pts[hi] || a, seg = r.cum[hi] - r.cum[lo] || 1, t = (s - r.cum[lo]) / seg;
  out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t;
  const zt = clamp((t - 0.3) / 0.4, 0, 1);
  out[2] = a[2] + (b[2] - a[2]) * zt;
  return out;
}
