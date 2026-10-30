// Castle ground dressing (docs/CASTLE_OVERWORLD.md): soft, dithered edges where one floor material meets another,
// the far banks of the river and moat as faces dropping into the water, baked ground particles (grass tufts, pebbles,
// leaves, reeds) at the seams, and flowing water drawn live over the baked floor.
// Everything here reads map.castleMat (src/world/castleworld.js); floors are baked into chunks by render.js, so the
// edge overlays and particles cost nothing once a chunk is built.
import { makeCanvas, recolor } from '../core/util.js';
import { HW, HH, TW, TH } from '../core/view.js';
import { hiddenBehind, HS } from './terrain.js';
// Material classes of map.castleMat, written by the generator (src/world/castleworld.js).
export const MAT=Object.freeze({meadow:1,lush:2,forest:3,dirt:4,road:5,mud:6,field:7,sand:8,cobble:9,pave:10,dark:11,
  moss:12,plank:13,water:14,hall:15,grave:16,bright:17,wall:18,mid:19,rampart:20});

// Which material spills over which at a seam: grass creeps over paths, paths over paving, nothing over water or halls.
const RANK = { [MAT.water]: 0, [MAT.wall]: 0, [MAT.hall]: 0, [MAT.dark]: 1, [MAT.plank]: 1, [MAT.pave]: 2, [MAT.cobble]: 2,
  [MAT.moss]: 3, [MAT.sand]: 3, [MAT.road]: 4, [MAT.dirt]: 4, [MAT.mud]: 4, [MAT.field]: 4, [MAT.grave]: 5, [MAT.meadow]: 6,
  [MAT.bright]: 6, [MAT.mid]: 6, [MAT.lush]: 7, [MAT.forest]: 8 };
const hash = (x, y, s = 0) => { let h = Math.imul(x ^ 0x45d9f3b, 0x45d9f3b) ^ Math.imul(y ^ s, 0x27d4eb2d); h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); return (h ^ (h >>> 13)) >>> 0; };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// ---------------------------------------------------------------- edge masks
// Native 160 x 80 tile masks, one per edge (0 -y, 1 +x, 2 +y, 3 -x) and variant: opaque at the edge, a ragged
// ordered-dither falloff a third of the way in, in 4 px blocks so it reads as pixel art at game scale.
const MW = 160, MH = 80, VARIANTS = 3;
let masks = null;
function edgeMasks() {
  if (masks) return masks;
  masks = [];
  // edges 0..3, then corners 4..7 (top, right, bottom, left: the tile's corner towards a diagonal neighbour)
  for (let d = 0; d < 8; d++) for (let v = 0; v < VARIANTS; v++) {
    const c = makeCanvas(MW, MH), g = c.getContext('2d'), img = g.createImageData(MW, MH), p = img.data;
    for (let by = 0; by < MH; by += 4) for (let bx = 0; bx < MW; bx += 4) {
      const X = bx + 2, Y = by + 2, u = ((X - 80) / 80 + Y / 40) / 2, w = (Y / 40 - (X - 80) / 80) / 2;
      if (u < -0.05 || w < -0.05 || u > 1.05 || w > 1.05) continue;
      const CU = [0, 1, 1, 0][d - 4], CW = [0, 0, 1, 1][d - 4];
      const dist = d === 0 ? w : d === 1 ? 1 - u : d === 2 ? 1 - w : d === 3 ? u : Math.hypot(u - CU, w - CW) * 0.85, along = d === 0 || d === 2 ? u : d < 4 ? w : Math.atan2(w - CW, u - CU);
      const wob = Math.sin(along * 9.4 + v * 2.1) * 0.08 + Math.sin(along * 23 + v * 5.3) * 0.045 + ((hash(bx, by, v + d * 7) & 255) / 255 - 0.5) * 0.1;
      const a = Math.max(0, Math.min(1, ((d < 4 ? 0.46 : 0.4) + wob - dist) / 0.26));
      if (a * 16 <= BAYER[((by >> 2) & 3) * 4 + ((bx >> 2) & 3)]) continue;
      for (let yy = by; yy < by + 4; yy++) for (let xx = bx; xx < bx + 4; xx++) p[(yy * MW + xx) * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    masks.push(c);
  }
  return masks;
}
// per floor image (a castle variant recolours its floors: src/data/castles.js), then per floor, edge and variant
const masked = new WeakMap();
function maskedTile(f, key, d, v) {
  const k = key + '|' + d + '|' + v;
  let byImg = masked.get(f.img);
  if (!byImg) masked.set(f.img, byImg = new Map());
  let c = byImg.get(k);
  if (!c) {
    c = makeCanvas(MW, MH);
    const g = c.getContext('2d');
    g.drawImage(f.img, f.sx, f.sy, f.w, f.h, 0, 0, MW, MH);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(edgeMasks()[d * VARIANTS + v], 0, 0);
    byImg.set(k, c);
  }
  return c;
}

// ---------------------------------------------------------------- bank faces
// A far bank (land on a water tile's -x or -y edge) shows as an earth or masonry face dropping to the waterline.
const BANK_H = 9;
let bankArt = null;
function banks() {
  if (bankArt) return bankArt;
  bankArt = {};
  for (const [name, top, mid, low] of [['earth', '#5b4a2e', '#3f3220', '#1d1a12'], ['stone', '#8a8676', '#5d5a4f', '#2a2a26']]) {
    // a 32 x (16 + BANK_H) strip under one tile edge, sheared to the edge's slope (two: -x edge falls left, -y right)
    for (const side of [0, 1]) {
      const c = makeCanvas(HW, HH + BANK_H), g = c.getContext('2d');
      for (let x = 0; x < HW; x++) {
        const y0 = side ? x / 2 : HH - x / 2;   // the edge line across this column
        for (let y = 0; y < BANK_H; y++) {
          const t = y / BANK_H, n = hash(x, y, side * 31 + name.length) & 15;
          g.fillStyle = t < 0.18 ? top : t < 0.7 ? (n < 4 ? low : mid) : low;
          if (name === 'stone' && (y === 3 || y === 6 || (y < 3 ? (x + 1) % 8 : (x + 5) % 8) === 0)) g.fillStyle = low;
          g.fillRect(x, Math.round(y0 + y), 1, 1);
        }
        g.fillStyle = 'rgba(200,230,230,0.55)';
        g.fillRect(x, Math.round(y0 + BANK_H), 1, 1);   // the wet line where the face meets the water
      }
      bankArt[name + side] = c;
    }
  }
  return bankArt;
}

/** Called by render.js for each floor tile it bakes: edge overlays from higher-ranked neighbours, and bank faces. */
export function castleTileDressing(ctx, world, tx, ty, px, py, floorEntry) {
  const map = world.map, mat = map.castleMat, W = map.w, i = ty * W + tx, m = mat[i], r = RANK[m] ?? 0, v = map.v[i];
  if (m === MAT.water) {
    // depth: open water darkens away from the banks, the shallows lighten
    const land = (dx, dy) => { const nx = tx + dx, ny = ty + dy; return nx >= 0 && ny >= 0 && nx < W && ny < map.h && mat[ny * W + nx] !== MAT.water; };
    const shore = land(1, 0) || land(-1, 0) || land(0, 1) || land(0, -1), near2 = shore || land(2, 0) || land(-2, 0) || land(0, 2) || land(0, -2);
    if (map.castleWater?.tint) {   // a variant's water (src/data/castles.js): bog, blood, ice, a witch's mere
      ctx.fillStyle = map.castleWater.tint;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + HW, py + HH); ctx.lineTo(px, py + TH); ctx.lineTo(px - HW, py + HH); ctx.fill();
    }
    ctx.fillStyle = shore ? 'rgba(120,170,150,0.14)' : near2 ? 'rgba(0,18,26,0.12)' : 'rgba(0,14,24,0.26)';
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + HW, py + HH); ctx.lineTo(px, py + TH); ctx.lineTo(px - HW, py + HH); ctx.fill();
    if (map.hgt) return;   // a height map drops the banks to the water as real faces (terrain.js)
    // far banks: land on the -x (upper left) or -y (upper right) edge
    const art = banks();
    if (tx > 0 && mat[i - 1] !== MAT.water) ctx.drawImage(art[(mat[i - 1] === MAT.wall || mat[i - 1] === MAT.dark || mat[i - 1] === MAT.pave ? 'stone' : 'earth') + '0'], px - HW, py);
    if (ty > 0 && mat[i - W] !== MAT.water) ctx.drawImage(art[(mat[i - W] === MAT.wall || mat[i - W] === MAT.dark || mat[i - W] === MAT.pave ? 'stone' : 'earth') + '1'], px, py);
    return;
  }
  if (!r) return;
  // edge neighbours, then diagonal ones (their corner masks fill the notch in a stair-stepped boundary)
  const N = [[0, -1], [1, 0], [0, 1], [-1, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let d = 0; d < 8; d++) {
    const nx = tx + N[d][0], ny = ty + N[d][1];
    if (nx < 0 || ny < 0 || nx >= W || ny >= map.h) continue;
    const j = ny * W + nx, nm = mat[j], nr = RANK[nm] ?? 0, nv = map.v[j];
    if (nv === v || nr < r || (nr === r && nv < v) || !nr) continue;
    if (map.hgt && map.hgt[j] !== map.hgt[i]) continue;   // no blending up or down a wall
    const f = floorEntry(world, nv);
    ctx.drawImage(maskedTile(f, nv, d, hash(tx, ty, d) % VARIANTS), px - HW, py, TW, TH);
  }
}

// ---------------------------------------------------------------- ground particles
// Small sprites baked into the floor: tufts where grass meets a path or paving, pebbles and dirt on stone, leaves and
// twigs under the trees, reeds and stones along the water. Built once per map, bucketed by floor chunk.
let sprites = null;
const tinted = new Map();
/** The particle sprites, in a castle variant's ground palette when it has one (map.castleGround). */
function particleSprites(palette = null) {
  if (!palette) return baseSprites();
  const key = JSON.stringify(palette);
  if (!tinted.has(key)) tinted.set(key, Object.fromEntries(Object.entries(baseSprites()).map(([k, list]) => [k, list.map((c) => recolor(c, palette))])));
  return tinted.get(key);
}
function baseSprites() {
  if (sprites) return sprites;
  sprites = { tuft: [], pebble: [], leaf: [], reed: [], speck: [], flower: [] };
  const px = (g, x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
  for (let k = 0; k < 8; k++) {
    // grass tuft: 3-6 blades fanning from a dark root
    let c = makeCanvas(9, 8), g = c.getContext('2d');
    const greens = [['#4f6b2a', '#79933b', '#a6b85a'], ['#3e5a26', '#62802f', '#8ea64a'], ['#5e6a2c', '#8c9440', '#b9b766']][k % 3];
    for (let b = 0; b < 3 + (k % 4); b++) {
      const x0 = 3 + ((b * 5 + k) % 4) - 1, lean = ((b + k) % 3) - 1, h = 4 + ((b * 3 + k) % 4);
      for (let y = 0; y < h; y++) px(g, x0 + Math.round(lean * y / h * 2), 7 - y, greens[y < 2 ? 0 : y < h - 1 ? 1 : 2]);
    }
    sprites.tuft.push(c);
    // pebbles: 1-3 stones with a lit top
    c = makeCanvas(7, 5); g = c.getContext('2d');
    for (let s = 0; s < 1 + (k % 3); s++) {
      const x = 1 + ((s * 3 + k) % 4), y = 1 + ((s + k) % 2), w = 2 + (s + k) % 2;
      g.fillStyle = ['#6f6a5e', '#857e6c', '#5b584f'][(s + k) % 3]; g.fillRect(x, y + 1, w, 2);
      g.fillStyle = '#a7a08b'; g.fillRect(x, y, w - 1, 1);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y + 3, w, 1);
    }
    sprites.pebble.push(c);
    // fallen leaf / twig
    c = makeCanvas(5, 4); g = c.getContext('2d');
    const lc = ['#7a4a1e', '#94612a', '#5d3a1a', '#8a7a2a'][k % 4];
    if (k % 3 === 2) { for (let x = 0; x < 5; x++) px(g, x, 1 + (x > 2 ? 1 : 0), '#4a3520'); }
    else { g.fillStyle = lc; g.fillRect(1, 1, 3, 2); px(g, 0, 2, lc); px(g, 4, 1, lc); px(g, 2, 0, '#b0803a'); }
    sprites.leaf.push(c);
    // reeds: tall thin stalks with a seed head
    c = makeCanvas(7, 12); g = c.getContext('2d');
    for (let b = 0; b < 3; b++) {
      const x0 = 1 + b * 2, h = 7 + ((b + k) % 4);
      for (let y = 0; y < h; y++) px(g, x0 + (y > h - 3 && (b + k) % 2 ? 1 : 0), 11 - y, y < 3 ? '#3e4a22' : '#6a7a34');
      if ((b + k) % 2) { px(g, x0, 11 - h, '#7a5a2a'); px(g, x0, 12 - h, '#7a5a2a'); }
    }
    sprites.reed.push(c);
    // dirt speck
    c = makeCanvas(3, 2); g = c.getContext('2d');
    g.fillStyle = ['#6b5235', '#7d6544', '#55402a'][k % 3]; g.fillRect(0, 0, 2 + (k % 2), 2);
    sprites.speck.push(c);
    // wildflower
    c = makeCanvas(3, 4); g = c.getContext('2d');
    px(g, 1, 2, '#4f6b2a'); px(g, 1, 3, '#4f6b2a');
    g.fillStyle = ['#d8d0a0', '#c86a8a', '#e0c04a', '#9a8ad8'][k % 4]; g.fillRect(0, 0, 3, 2);
    sprites.flower.push(c);
  }
  return sprites;
}
const GRASSY = new Set([MAT.meadow, MAT.bright, MAT.mid, MAT.lush, MAT.forest, MAT.grave]);
const STONY = new Set([MAT.pave, MAT.cobble, MAT.dark, MAT.moss]);
const EARTHY = new Set([MAT.dirt, MAT.road, MAT.mud, MAT.field, MAT.sand]);
export const PARTICLE_CHUNK = 384;
function buildParticles(world) {
  const map = world.map, mat = map.castleMat, W = map.w, H = map.h, buckets = new Map();
  const put = (kind, x, y, h) => {
    if (map.hgt && hiddenBehind(map, x, y)) return;   // behind a wall
    const wx = (x - y) * HW, wy = (x + y) * HH - (map.hgt ? map.hgt[map.tileIdx(x, y)] * HS : 0), key = Math.floor(wx / PARTICLE_CHUNK) + ',' + Math.floor(wy / PARTICLE_CHUNK);
    let b = buckets.get(key); if (!b) buckets.set(key, b = []);
    b.push({ kind, v: ((h % 8) + 8) % 8, x: wx, y: wy });
  };
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, m = mat[i];
    if (m === MAT.hall || m === MAT.wall || m === MAT.rampart || map.castleRoomWalls?.[i]) continue;
    const h = hash(x, y, 0x5c);
    const nb = [mat[i - 1], mat[i + 1], mat[i - W], mat[i + W]];
    const nearGrass = nb.some((n) => GRASSY.has(n)), nearWater = nb.some((n) => n === MAT.water), nearEarth = nb.some((n) => EARTHY.has(n));
    const r = (k) => ((hash(x, y, k) & 1023) / 1023);
    const at = (k) => [x + 0.15 + r(k) * 0.7, y + 0.15 + r(k + 1) * 0.7];
    if (m === MAT.water) continue;
    if (nearWater) {   // banks: reeds in the soft ground, pebbles on stone
      for (let k = 0; k < 2; k++) if (r(10 + k) < 0.55) { const [px, py] = at(20 + k * 3); put(STONY.has(m) ? 'pebble' : r(30 + k) < 0.6 ? 'reed' : 'pebble', px, py, h >> k); }
    }
    if ((STONY.has(m) || EARTHY.has(m)) && nearGrass) {   // grass creeping onto paths and paving
      for (let k = 0; k < 3; k++) if (r(40 + k) < 0.5) { const [px, py] = at(50 + k * 3); put('tuft', px, py, h >> (k + 2)); }
    }
    if (STONY.has(m) && nearEarth) for (let k = 0; k < 2; k++) if (r(60 + k) < 0.6) { const [px, py] = at(70 + k * 3); put('speck', px, py, h >> k); }
    if (GRASSY.has(m) && nearEarth) for (let k = 0; k < 2; k++) if (r(80 + k) < 0.45) { const [px, py] = at(90 + k * 3); put('pebble', px, py, h >> (k + 3)); }
    // the open ground's own detail, sparse
    if (m === MAT.forest || m === MAT.lush && r(100) < 0.3) { if (r(101) < 0.5) { const [px, py] = at(102); put('leaf', px, py, h); } }
    else if (m === MAT.meadow || m === MAT.bright || m === MAT.mid) { const q = r(110); if (q < 0.16) { const [px, py] = at(111); put(q < 0.04 ? 'flower' : 'tuft', px, py, h >> 3); } }
    else if (m === MAT.road || m === MAT.dirt || m === MAT.mud) { if (r(120) < 0.22) { const [px, py] = at(121); put(r(122) < 0.5 ? 'pebble' : 'speck', px, py, h >> 2); } }
    else if (m === MAT.grave && r(130) < 0.2) { const [px, py] = at(131); put(r(132) < 0.3 ? 'flower' : 'tuft', px, py, h); }
  }
  return buckets;
}
/** Draw the baked particles of one floor chunk (world px origin wx, wy). */
export function drawCastleParticles(g, world, wx, wy) {
  const buckets = world.castleParticles || (world.castleParticles = buildParticles(world));
  const spr = particleSprites(world.map.castleGround), key0x = Math.floor(wx / PARTICLE_CHUNK), key0y = Math.floor(wy / PARTICLE_CHUNK);
  // a chunk draws its own bucket and the neighbours' particles that overhang its edge
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const b = buckets.get((key0x + dx) + ',' + (key0y + dy));
    if (!b) continue;
    for (const p of b) {
      if (p.x < wx - 12 || p.x > wx + PARTICLE_CHUNK + 12 || p.y < wy - 12 || p.y > wy + PARTICLE_CHUNK + 12) continue;
      const s = spr[p.kind][p.v];
      g.drawImage(s, Math.round(p.x - s.width / 2), Math.round(p.y - s.height + 1));
    }
  }
}

// ---------------------------------------------------------------- flowing water
// A flow field over the river and moat (downhill from the outflow), then light streaks drifting along it, foam
// bobbing at the banks and the odd glint, drawn each frame over the baked floor.
function buildFlow(map) {
  const mat = map.castleMat, W = map.w, H = map.h, N = W * H, D = new Int32Array(N).fill(-1), q = [];
  // sinks: water on the map's east edge (the river's outflow)
  for (let y = 0; y < H; y++) for (const x of [W - 1, W - 2]) { const i = y * W + x; if (mat[i] === MAT.water) { D[i] = 0; q.push(i); } }
  for (let a = 0; a < q.length; a++) {
    const i = q[a], x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx; if (D[j] < 0 && mat[j] === MAT.water) { D[j] = D[i] + 1; q.push(j); }
    }
  }
  const fx = new Float32Array(N), fy = new Float32Array(N), shore = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (D[i] < 0) continue;
    const x = i % W, y = (i / W) | 0;
    let vx = 0, vy = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (D[j] >= 0) { vx += dx * (D[i] - D[j]); vy += dy * (D[i] - D[j]); } else shore[i] |= dx > 0 ? 2 : dx < 0 ? 8 : dy > 0 ? 4 : 1;
    }
    fx[i] = vx; fy[i] = vy;
  }
  // smooth twice so the current bends round corners instead of zig-zagging along the BFS wavefront
  for (let pass = 0; pass < 3; pass++) {
    const ax = fx.slice(), ay = fy.slice();
    for (let i = 0; i < N; i++) {
      if (D[i] < 0) continue;
      const x = i % W, y = (i / W) | 0; let sx = ax[i] * 2, sy = ay[i] * 2;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (D[j] >= 0) { sx += ax[j]; sy += ay[j]; } }
      const l = Math.hypot(sx, sy) || 1; fx[i] = sx / l; fy[i] = sy / l;
    }
  }
  // water hidden under a bridge or the near bank (a sunken moat) gets no ripples
  if (map.hgt) for (let i = 0; i < N; i++) if (D[i] >= 0 && hiddenBehind(map, i % W + 0.5, ((i / W) | 0) + 0.5)) D[i] = -1;
  return { fx, fy, shore, D };
}
const FOAM = [[1, HW / 2, -HH / 2, HW, HH, -0.45, 0.9], [2, HW / 2, HH / 2, -HW, HH, -0.45, -0.9], [4, -HW / 2, HH / 2, -HW, -HH, 0.45, -0.9], [8, -HW / 2, -HH / 2, HW, -HH, 0.45, 0.9]];
export function drawCastleWater(ctx, world, vr, time, touch) {
  const map = world.map, W = map.w;
  const flow = world.castleFlow || (world.castleFlow = buildFlow(map));
  const corners = [[vr.x0, vr.y0], [vr.x1, vr.y0], [vr.x0, vr.y1], [vr.x1, vr.y1]].map(([wx, wy]) => [(wx / HW + wy / HH) / 2, (wy / HH - wx / HW) / 2]);
  const tx0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0])))), tx1 = Math.min(W - 1, Math.ceil(Math.max(...corners.map((c) => c[0]))));
  const ty0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1])))), ty1 = Math.min(map.h - 1, Math.ceil(Math.max(...corners.map((c) => c[1]))));
  const streaks = [new Path2D(), new Path2D(), new Path2D()], foam = [new Path2D(), new Path2D()], glints = new Path2D();
  let any = false;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const i = ty * W + tx;
    if (flow.D[i] < 0) continue;
    const cx = (tx - ty) * HW, cy = (tx + ty) * HH + HH - (map.hgt ? map.hgt[i] * HS : 0);
    if (cx < vr.x0 - TW || cx > vr.x1 + TW || cy < vr.y0 - TH || cy > vr.y1 + TH) continue;
    any = true;
    const h = hash(tx, ty, 0x77), fx = flow.fx[i], fy = flow.fy[i];
    const moat = flow.shore[i] === 0 && (h & 3) === 0;
    // the current in screen space
    const sx = (fx - fy) * HW, sy = (fx + fy) * HH, sl = Math.hypot(sx, sy) || 1, ux = sx / sl, uy = sy / sl;
    const n = touch ? 1 : 2;
    for (let k = 0; k < n; k++) {
      const hk = h >>> (k * 7), life = 2.4 + (hk & 7) * 0.25, ph = ((hk >>> 3) & 63) / 64;
      const s = (time / life + ph) % 1, a = Math.sin(s * Math.PI);
      const ox = ((hk >>> 9) & 31) / 31 - 0.5, oy = ((hk >>> 14) & 31) / 31 - 0.5;
      const bx = cx + ox * HW * 1.2 + ux * (s - 0.5) * 30, by = cy + oy * HH * 1.2 + uy * (s - 0.5) * 30;
      const len = 4 + (hk & 7) * 1.6;
      const p = streaks[a > 0.75 ? 2 : a > 0.4 ? 1 : 0];
      p.moveTo(bx, by); p.lineTo(bx + ux * len, by + uy * len * 0.9);
    }
    if (moat && !touch) {   // a slow swirl in open water
      const s = (time * 0.35 + (h & 255) / 255) % 1, r = 2 + s * 5;
      streaks[0].moveTo(cx + r, cy); streaks[0].ellipse(cx, cy, r, r * 0.45, 0, 0, 1.4);
    }
    const sh = flow.shore[i];
    if (sh) {   // foam lapping at the banks: [edge bit, edge midpoint, direction along the edge, inward normal]
      for (const [bit, mx, my, ax, ay, nx, ny] of FOAM) {
        if (!(sh & bit)) continue;
        for (let k = 0; k < 3; k++) {
          const t = ((h >>> (k * 5)) & 31) / 31 - 0.5, in_ = 2 + Math.sin(time * 1.6 + k * 2.1 + (h & 15)) * 1.5;
          foam[(k + (h & 1)) & 1].rect(Math.round(cx + mx + ax * t + nx * in_), Math.round(cy + my + ay * t + ny * in_), 2, 1);
        }
      }
    }
    if ((h % 29) === 0) {   // a glint of sky
      const g = Math.sin(time * 2.3 + (h & 63)) ** 12;
      if (g > 0.05) { const x = cx + ((h >>> 6) & 15) - 8, y = cy + ((h >>> 10) & 7) - 4; glints.rect(x - 1, y, 3, 1); glints.rect(x, y - 1, 1, 3); }
    }
  }
  if (!any) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.1;
  const [sr, sg, sb] = map.castleWater?.streak || [176, 226, 226];
  for (let k = 0; k < 3; k++) { ctx.strokeStyle = `rgba(${sr},${sg},${sb},${0.1 + k * 0.12})`; ctx.stroke(streaks[k]); }
  ctx.fillStyle = 'rgba(225,245,240,0.55)'; ctx.fill(foam[0]);
  ctx.fillStyle = 'rgba(190,225,225,0.35)'; ctx.fill(foam[1]);
  ctx.fillStyle = 'rgba(255,255,240,0.8)'; ctx.fill(glints);
  ctx.restore();
}
