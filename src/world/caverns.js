// DEPTH'S EDGE CAVERNS (docs/DEPTHS_EDGE.md): narrow passages that open into great caverns and close again, an
// underground lake under a tall waterfall, a passage at the waterfall's foot into a shaft whose ledge spirals up its
// walls, a long climb, and the top of the falls where the bosses wait. The whole level is one smooth height field,
// drawn live in three.js (gfx/cave3d.js) behind the 2D sprites; game/caverns.js runs it.
//
// Layout is planned in screen-aligned axes: `a` runs to the right of the screen, `b` toward the camera (down the
// screen), both in tiles; (x, y) = ((a + b) / sqrt 2, (b - a) / sqrt 2), translated into the grid at the end. The
// plateau (the top of the falls) stands behind the lake (higher ground behind lower never hides it), the shaft to its
// right, the main caves below them. The shaft can only be entered at its foot through rock, so the passage at the
// waterfall's foot moves the party there (game/caverns.js); everything else is one connected cave.
//
// Heights are tiles (one three.js unit; VZ world px on screen). The vertex grid is CAVE_S vertices a tile. Rock rises
// from the floor's edge to the region's wall height, but never so high that it hides walkable ground or water behind
// it on screen (the cap below): walls in front of a passage are cut down like Diablo's, walls behind stand tall.
import { TileMap } from './map.js';
import { RNG } from '../core/util.js';
import { DEPTHS_EDGE } from '../data/depthsedge.js';
import { SWAPS } from '../data/bestiary.js';

export const VZ = 32 * Math.SQRT2 * Math.cos(Math.PI / 6);   // 39.19 px: one tile of height in the 2:1 iso view
export const CAVE_S = 2;                                      // height-field vertices per tile edge
const KS = 16 / VZ;                                           // 0.408: rise per tile of depth (x + y) seen edge-on
const LV = VZ / 4;                                            // map levels (gfx/terrain.js HS = 4 px) per tile of height
const R2 = Math.SQRT1_2;

// the six variants: texture picks from the pack (assets/tiles/depths_edge/) and their palette swap (core/util.js
// recolor), the water's three blues and the falls' particle blues, torch light, the creatures' swap (bestiary SWAPS)
export const CAVE_VARIANTS = [
  { id: 'chalk', name: "The Depth's Edge Caverns", epithet: 'chalk and moonlit limestone over a black lake',
    swap: { light: 0.02 }, floors: ['DEC-01', 'DEC-05'], walls: ['DEC-11', 'DEC-12'], hd: 'DEC-HD01', water: 'DEC-WS01',
    deep: '#06162e', mid: '#1f5d9a', hi: '#8fd8ff', blues: ['#9fe4ff', '#4aa8ff', '#2d6dff', '#dff6ff'], mist: '#cfe6ff',
    torch: '#ffb060', ambient: '#4a4c58', fog: '#050509', crystal: '#b8a0ff', mon: null, HP: 14 },
  { id: 'moonwell', name: 'The Moonwell Deep', epithet: 'blue dolomite and quartz over a sapphire lake',
    swap: { colorize: [218, 0.28], light: -0.02, contrast: 1.05 }, floors: ['DEC-02', 'DEC-06'], walls: ['DEC-15', 'DEC-18'], hd: 'DEC-HD02', water: 'DEC-WS05',
    deep: '#030a24', mid: '#1b3f9a', hi: '#7ab0ff', blues: ['#7ab0ff', '#3d62ff', '#a9d2ff', '#5ae0ff'], mist: '#c8d8ff',
    torch: '#9ccaff', ambient: '#3c4460', fog: '#03040c', crystal: '#7ae0ff', mon: 'storm', HP: 15 },
  { id: 'rustvein', name: 'The Rustvein Hollows', epithet: 'iron-red stone, ember torches and a cold teal falls',
    swap: { colorize: [16, 0.36], light: -0.04, contrast: 1.08 }, floors: ['DEC-03', 'DEC-10'], walls: ['DEC-17', 'DEC-20'], hd: 'DEC-HD07', water: 'DEC-WS02',
    deep: '#04161c', mid: '#1a6a78', hi: '#86e8f0', blues: ['#6fe0ff', '#2fb4d8', '#9af0ff', '#3c8cff'], mist: '#d0ecf0',
    torch: '#ff8a3a', ambient: '#52403a', fog: '#070404', crystal: '#ff9a60', mon: 'rust', HP: 13 },
  { id: 'verdigris', name: 'The Verdigris Grotto', epithet: 'copper-green karst over turquoise water',
    swap: { colorize: [158, 0.24], light: -0.03, contrast: 1.06 }, floors: ['DEC-07', 'DEC-04'], walls: ['DEC-16', 'DEC-14'], hd: 'DEC-HD06', water: 'DEC-WS04',
    deep: '#031a1c', mid: '#127a7a', hi: '#7cf2dc', blues: ['#5af0e0', '#2ab8d8', '#a8fff0', '#3a9cff'], mist: '#c8f0e8',
    torch: '#ffc070', ambient: '#3a4a46', fog: '#030806', crystal: '#7affc8', mon: 'verdigris', HP: 14 },
  { id: 'amethyst', name: 'The Amethyst Throat', epithet: 'violet slate and geodes over an indigo falls',
    swap: { colorize: [272, 0.26], light: -0.05, contrast: 1.1 }, floors: ['DEC-08', 'DEC-09'], walls: ['DEC-13', 'DEC-19'], hd: 'DEC-HD08', water: 'DEC-WS03',
    deep: '#0a0628', mid: '#3a3aa8', hi: '#b4a8ff', blues: ['#8a9cff', '#5a5cff', '#c0b8ff', '#4ad0ff'], mist: '#d8d0ff',
    torch: '#c890ff', ambient: '#44385a', fog: '#05030a', crystal: '#d070ff', mon: 'amethyst', HP: 16 },
  { id: 'rimebone', name: 'The Rimebone Abyss', epithet: 'frost-white bone stone over an ice-blue falls',
    swap: { colorize: [200, 0.14], light: 0.08, contrast: 1.05 }, floors: ['DEC-06', 'DEC-09'], walls: ['DEC-12', 'DEC-15'], hd: 'DEC-HD05', water: 'DEC-WS01',
    deep: '#04142a', mid: '#2a7ab8', hi: '#c8f4ff', blues: ['#c8f4ff', '#7ad0ff', '#4a90ff', '#ffffff'], mist: '#e8f6ff',
    torch: '#80e8ff', ambient: '#465262', fog: '#04060a', crystal: '#a0f0ff', mon: 'rime', HP: 15 },
];
export const caveVariant = (seed, force) => CAVE_VARIANTS[force != null ? ((force % 6) + 6) % 6 : (seed >>> 5) % CAVE_VARIANTS.length];

/** The AI archetypes the caverns' packs play (every one has Depth's Edge creatures to play it). */
export const CAVE_ROSTER = ['hound', 'ghoul', 'spider', 'worm', 'scorpion', 'abomination', 'zombie', 'golem', 'cultist', 'shroom', 'beetle', 'gargoyle'];
/**
 * A cave's bestiary (the shape of bestiary.js rollLooks): only the Depth's Edge creatures, up to 4 per archetype, most
 * of them in the variant's palette swap and named after it ("Storm Pressure Widow"). Anything asking for an archetype
 * none of them plays (a cultist's summons, an ambush) gets one of them anyway.
 */
export function caveLooks(v, rnd = Math.random) {
  const sw = v.mon ? SWAPS[v.mon] : null, tint = v.mon ? v.mon[0].toUpperCase() + v.mon.slice(1) : null;
  const mons = DEPTHS_EDGE.filter((a) => !a.boss), bosses = DEPTHS_EDGE.filter((a) => a.boss);
  const can = (a, arch) => a.arch === arch || (a.also && a.also.includes(arch));
  const chosen = new Map(), used = new Set();
  const lookOf = (a) => (sw && rnd() < 0.8 ? { art: a.id, swap: sw, tint } : { art: a.id, swap: null });
  const looksFor = (arch) => {
    if (chosen.has(arch)) return chosen.get(arch);
    const pool = mons.filter((a) => can(a, arch)), p = (pool.length ? pool : mons).slice(), list = [];
    for (let i = 0; i < 4 && p.length; i++) { const a = p.splice(Math.floor(rnd() * p.length), 1)[0]; list.push(lookOf(a)); used.add(a.id); }
    chosen.set(arch, list);
    return list;
  };
  return {
    pick(arch, r = rnd) { const l = looksFor(arch); return l[Math.floor(r() * l.length)]; },
    boss(roster, r = rnd) { const a = bosses[Math.floor(r() * bosses.length)]; used.add(a.id); return { arch: a.arch, look: lookOf(a) }; },
    ids() { return [...used, ...bosses.map((a) => a.id)]; },   // the bosses' sheet loads with the level: they come at the end
  };
}

// regions (the wall height above their floor, `vis`, is how much rock shows before it fades into the dark)
export const REG = { rock: 0, passage: 1, cavern: 2, lake: 3, plateau: 4, shaft: 5, gallery: 6, notch: 7 };
const VIS = [4, 3.4, 6.5, 17, 6, 4.5, 4, 4];
const CAVERN_NAMES = ['The Echo Vault', 'The Chalk Shelf', 'The Silt Gallery', 'The Hollow of Bells', 'The Fossil Nave', 'The Drip Hall',
  'The Moonmilk Chamber', 'The Breathing Hall', 'The Bone Garden', 'The Karst Cathedral', 'The Whispering Dome', 'The Pale Orchard'];

// ------------------------------------------------------------------ noise
function hashN(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth value noise in 0..1. */
export function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hashN(xi, yi, s), b = hashN(xi + 1, yi, s), c = hashN(xi, yi + 1, s), d = hashN(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, s) => vnoise(x, y, s) * 0.55 + vnoise(x * 2.1, y * 2.1, s + 7) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 13) * 0.15;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** A Catmull-Rom curve through pts ([a, b]), sampled every ~0.5 tile: [[a, b, t 0..1], ...]. */
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

// ------------------------------------------------------------------ the level
export function generateCaverns(depth, biome, seed, force = null) {
  const v = caveVariant(seed, force), rng = new RNG(seed), ns = (seed % 9973) + 11;
  const J = (r) => rng.range(-r, r);
  const HP = v.HP;

  // ---------------------------------------------------------------- the plan, in (a, b)
  const plat = [-30 + J(2), 70 + J(2)], Rp = 10.5 + rng.range(0, 1.2);
  const cliffB = plat[1] + Rp + 1.6;                         // the cliff's foot (b) under the plateau
  const lip = [plat[0] + J(1.2), cliffB - 0.35];              // where the river spills: a spur of the plateau out to the cliff's face
  const lake = [lip[0] + J(2.5), lip[1] + 11 + rng.range(0, 1.5)], LA = 11.5 + rng.range(0, 2), LB = 6.2 + rng.range(0, 1);
  const cavL = [lake[0] + 1.5, lake[1] + 2.5], CLA = LA + 11, CLB = LB + 8;
  const notch = [lip[0] + 8 + rng.range(0, 1.5), cliffB + 0.4];
  // the shaft, to the right of the plateau; its ledge spirals down from the gallery to the pool at its foot
  const r0 = 7, P = 7, w = 4.6, h0 = -0.8;
  const shaftDir = rng.range(0.04, 0.2);                     // the gallery's heading from the plateau, a little toward the camera
  const turnsMin = 2.9;
  const phiPlat = Math.PI + shaftDir;                        // from the shaft centre back toward the plateau (a, b angle)
  // it starts on the far side (straight up the screen from the centre), under a cave mouth, and turns anticlockwise
  const dir = -1, phi0b = -Math.PI / 2;                      // (a, b) angle of the start: straight up the screen
  let N = turnsMin; { const frac = ((phi0b - phiPlat) / (2 * Math.PI) % 1 + 1) % 1; N = Math.floor(turnsMin) + frac; if (N < turnsMin) N += 1; }
  const rEnd = r0 + P * N, rRim = rEnd + w / 2 + 2.2;
  const gal = 11 + rng.range(0, 3);
  const shaft = [plat[0] + Math.cos(shaftDir) * (Rp + gal + rRim), plat[1] + Math.sin(shaftDir) * (Rp + gal + rRim)];
  // the main caves, below: the start, three caverns, the lake cavern's entry
  const caverns = [];
  const start = [32 + J(4), shaft[1] + rRim + 100 + J(3)];
  caverns.push({ c: [26 + J(5), start[1] - 36 + J(3)], R: 15.5 + rng.range(0, 3), h: 1.6 + J(0.4) });
  caverns.push({ c: [-44 + J(5), start[1] - 54 + J(3)], R: 17 + rng.range(0, 3), h: -0.3 + J(0.3) });
  caverns.push({ c: [lake[0] + 31 + J(4), shaft[1] + rRim + 21 + rng.range(0, 3)], R: 14.5 + rng.range(0, 2.5), h: 2.1 + J(0.4) });
  const entry = [cavL[0] + CLA * 0.62, cavL[1] + CLB * 0.62];
  caverns.forEach((cv, i) => { cv.name = CAVERN_NAMES[(seed + i * 5) % CAVERN_NAMES.length]; });

  // ---------------------------------------------------------------- the grid
  const ext = [[plat, Rp + 8], [lake, LA + 12], [shaft, rRim + 7], [start, 9], ...caverns.map((c) => [c.c, c.R + 19])];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [[a, b], r] of ext) { const x = (a + b) * R2, y = (b - a) * R2; x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); }
  const OX = 3 - x0, OY = 3 - y0, W = Math.ceil(x1 - x0 + 6), H = Math.ceil(y1 - y0 + 6), NT = W * H;
  const XY = ([a, b]) => [(a + b) * R2 + OX, (b - a) * R2 + OY];
  const AB = (x, y) => [((x - OX) - (y - OY)) * R2, ((x - OX) + (y - OY)) * R2];
  const walk = new Uint8Array(NT), wet = new Uint8Array(NT), reg = new Uint8Array(NT), zone = new Int8Array(NT).fill(-1);
  const F = new Float32Array(NT), lvl = new Float32Array(NT).fill(NaN);   // floor / bed height; water level
  const I = (x, y) => y * W + x;
  const each = (cx, cy, r, fn) => {
    for (let y = Math.max(0, Math.floor(cy - r - 1)); y <= Math.min(H - 1, Math.ceil(cy + r + 1)); y++)
      for (let x = Math.max(0, Math.floor(cx - r - 1)); x <= Math.min(W - 1, Math.ceil(cx + r + 1)); x++) fn(x, y, I(x, y));
  };
  const floor = (i, r, h, z = -1) => { walk[i] = 1; reg[i] = r; F[i] = h; zone[i] = z; wet[i] = 0; lvl[i] = NaN; };

  // the main caves: caverns (noisy blobs), passages between them (winding curves, floor heights ramped along them)
  const cavernTiles = (cv, k) => {
    const [cx, cy] = XY(cv.c);
    each(cx, cy, cv.R * 1.35, (x, y, i) => {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, ang = Math.atan2(dy, dx);
      const r = cv.R * (0.82 + 0.36 * fbm(Math.cos(ang) * 1.6 + k * 9, Math.sin(ang) * 1.6, ns + 3)) * (1 + 0.12 * Math.sin(ang * 2 + k));
      if (Math.hypot(dx * 1.08, dy * 0.94) < r) floor(i, REG.cavern, cv.h, k);
    });
  };
  const passage = (from, to, h0p, h1p, wid = 1.9, wig = 7) => {
    const pts = [from], n = Math.max(2, Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]) / 13));
    for (let k = 1; k < n; k++) {
      const t = k / n, nx = -(to[1] - from[1]), ny = to[0] - from[0], l = Math.hypot(nx, ny) || 1, o = J(wig);
      pts.push([from[0] + (to[0] - from[0]) * t + (nx / l) * o, from[1] + (to[1] - from[1]) * t + (ny / l) * o]);
    }
    pts.push(to);
    const c = curve(pts), line = [];
    for (const [a, b, t] of c) {
      const [x, y] = XY([a, b]), r = wid * (0.78 + 0.44 * vnoise(t * 22, 3, ns + 5));
      line.push([x, y]);
      each(x, y, r, (tx, ty, i) => {
        if (Math.hypot(tx + 0.5 - x, ty + 0.5 - y) > r || walk[i] || wet[i]) return;
        floor(i, REG.passage, h0p + (h1p - h0p) * t);
      });
    }
    return line;
  };
  caverns.forEach(cavernTiles);
  // the lake cavern and its lake
  const [lx, ly] = XY(cavL), [kx, ky] = XY(lake), [px, py] = XY(plat);
  const ell = (x, y, c, A, B) => { const [a, b] = AB(x + 0.5, y + 0.5); return Math.hypot((a - c[0]) / A, (b - c[1]) / B); };
  each(lx, ly, CLA + 3, (x, y, i) => {
    const [a, b] = AB(x + 0.5, y + 0.5), ang = Math.atan2(b - cavL[1], a - cavL[0]);
    const e = ell(x, y, cavL, CLA * (0.9 + 0.2 * fbm(Math.cos(ang) * 2, Math.sin(ang) * 2, ns + 21)), CLB);
    if (e > 1 || b < cliffB) return;
    floor(i, REG.lake, 0.25 * (fbm(a * 0.15, b * 0.15, ns + 23) - 0.5));
  });
  const WL = -1.1, plunge = [lip[0], lip[1] + 2.4];
  const segD = (a, b, p, q) => { const dx = q[0] - p[0], dy = q[1] - p[1], t = Math.max(0, Math.min(1, ((a - p[0]) * dx + (b - p[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(a - p[0] - dx * t, b - p[1] - dy * t); };
  each(kx, ky, LA + 3, (x, y, i) => {
    if (reg[i] !== REG.lake) return;
    const [a, b] = AB(x + 0.5, y + 0.5), ang = Math.atan2(b - lake[1], a - lake[0]);
    let e = ell(x, y, lake, LA * (0.92 + 0.16 * fbm(Math.cos(ang) * 2.4, Math.sin(ang) * 2.4, ns + 31)), LB);
    e = Math.min(e, Math.hypot(a - plunge[0], b - plunge[1]) / 3.6, segD(a, b, plunge, lake) / 2.6);   // the plunge pool under the falls, and its run into the lake
    if (e < 0.84) { walk[i] = 0; wet[i] = 2; lvl[i] = WL; F[i] = WL - 0.6 - 2.6 * smooth(0.84, 0.2, e); }
    else if (e < 1) { wet[i] = 1; lvl[i] = WL; F[i] = WL - 0.06 - 0.14 * smooth(1, 0.84, e); }
    else if (e < 1.5) F[i] = Math.min(F[i], WL + 0.15 + (e - 1) * 1.6);   // the beach
  });
  // the plateau and the river across it to the lip
  each(px, py, Rp * 1.35 + 2, (x, y, i) => {
    const [a, b] = AB(x + 0.5, y + 0.5), ang = Math.atan2(b - plat[1], a - plat[0]);
    const r = Rp * (0.86 + 0.24 * fbm(Math.cos(ang) * 1.8, Math.sin(ang) * 1.8, ns + 41));
    if (Math.hypot(a - plat[0], b - plat[1]) < r || (Math.abs(a - lip[0]) < 2.6 + (lip[1] - b) * 0.25 && b > plat[1] && b < lip[1] + 0.3))
      floor(i, REG.plateau, HP + 0.3 * (fbm(a * 0.2, b * 0.2, ns + 43) - 0.5));
  });
  const spring = [plat[0] + J(2), plat[1] - Rp + 0.8];
  const river = curve([spring, [plat[0] + J(3), plat[1] - Rp * 0.3], [plat[0] + J(2.5), plat[1] + Rp * 0.35], lip]);
  for (const [a, b, t] of river) {
    const [x, y] = XY([a, b]), r = 1.3 + t * 0.9;
    each(x, y, r, (tx, ty, i) => { if (reg[i] === REG.plateau && Math.hypot(tx + 0.5 - x, ty + 0.5 - y) < r) { wet[i] = 1; lvl[i] = HP + 0.05; F[i] = HP - 0.22; } });
  }
  // the notch at the cliff's foot, where the passage into the rock begins
  const notchIn = [notch[0], cliffB - 2.2];
  for (const [a, b] of curve([[notch[0], notch[1] + 1.2], notch, notchIn])) {
    const [x, y] = XY([a, b]);
    each(x, y, 1.35, (tx, ty, i) => { if (Math.hypot(tx + 0.5 - x, ty + 0.5 - y) < 1.35 && !wet[i]) floor(i, REG.notch, 0.05); });
  }
  // the main caves' passages, the side alcoves (a chest each) and the run to the lake cavern
  const lines = [];
  lines.push(passage(start, caverns[0].c, 0, caverns[0].h, 1.9, 6));
  lines.push(passage(caverns[0].c, caverns[1].c, caverns[0].h, caverns[1].h, 1.8, 8));
  lines.push(passage(caverns[1].c, caverns[2].c, caverns[1].h, caverns[2].h, 1.8, 8));
  lines.push(passage(caverns[2].c, entry, caverns[2].h, 0.1, 1.9, 5));
  each(...XY(start), 4.2, (x, y, i) => { const [sx, sy] = XY(start); if (Math.hypot(x + 0.5 - sx, y + 0.5 - sy) < 4.2 && !walk[i]) floor(i, REG.passage, 0); });
  const alcoves = [];
  for (const [k, side] of [[0, 1], [1, -1]]) {
    const cv = caverns[k], ang = side > 0 ? rng.range(-0.6, 0.4) : Math.PI + rng.range(-0.4, 0.6);
    const end = [cv.c[0] + Math.cos(ang) * (cv.R + 13), cv.c[1] + Math.sin(ang) * (cv.R + 13)];
    passage(cv.c, end, cv.h, cv.h + J(0.6), 1.5, 3);
    const [ex, ey] = XY(end);
    each(ex, ey, 4.5, (x, y, i) => { if (Math.hypot(x + 0.5 - ex, y + 0.5 - ey) < 3.6 + vnoise(x, y, ns) && !walk[i]) floor(i, REG.cavern, cv.h, k); });
    alcoves.push([ex, ey]);
  }
  // the shaft: a ledge spiralling down its walls to a pool; heights exact along the spiral (a, b angles)
  const [sx, sy] = XY(shaft), thEnd = 2 * Math.PI * N;
  const spiral = (th) => { const r = r0 + (P * th) / (2 * Math.PI), ph = phi0b + dir * th; return { a: shaft[0] + Math.cos(ph) * r, b: shaft[1] + Math.sin(ph) * r, r, ph, h: h0 + ((HP - h0) * th) / thEnd }; };
  each(sx, sy, rRim + 1, (x, y, i) => {
    const [a, b] = AB(x + 0.5, y + 0.5), da = a - shaft[0], db = b - shaft[1], r = Math.hypot(da, db), ph = Math.atan2(db, da);
    if (r < r0 - w / 2 - 0.3) { walk[i] = 0; wet[i] = 2; reg[i] = REG.shaft; lvl[i] = h0 - 0.55; F[i] = h0 - 1.2 - 1.5 * smooth(r0 - w / 2, 0, r); return; }
    const base = (((dir * (ph - phi0b)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    for (let k = 0; k <= Math.ceil(N); k++) {
      const th = base + 2 * Math.PI * k;
      if (th > thEnd + 0.02) break;
      const s = spiral(th);
      if (Math.abs(r - s.r) <= w / 2) { floor(i, REG.shaft, s.h); break; }
    }
  });
  // where the ledge starts: a landing, and the cave mouth the party comes out of in the wall above it
  const s0 = spiral(0.12), arrive = XY([s0.a, s0.b]);
  const ms = spiral(0.05), mr = ms.r + w / 2 + 0.15, mouth = XY([shaft[0] + Math.cos(ms.ph) * mr, shaft[1] + Math.sin(ms.ph) * mr]);
  const mouthDir = [(-Math.cos(ms.ph) - Math.sin(ms.ph)) * R2, (-Math.sin(ms.ph) + Math.cos(ms.ph)) * R2];   // it faces the shaft's middle
  // the gallery from the ledge's top out to the plateau
  const sE = spiral(thEnd), galEnd = [plat[0] + Math.cos(shaftDir) * (Rp - 1.5), plat[1] + Math.sin(shaftDir) * (Rp - 1.5)];
  for (const [a, b] of curve([[sE.a, sE.b], [(sE.a + galEnd[0]) / 2 + J(1), (sE.b + galEnd[1]) / 2 + J(1)], galEnd])) {
    const [x, y] = XY([a, b]);
    each(x, y, 2.1, (tx, ty, i) => { if (Math.hypot(tx + 0.5 - x, ty + 0.5 - y) < 2.1 && reg[i] !== REG.plateau && !(reg[i] === REG.shaft && walk[i])) floor(i, REG.gallery, HP); });
  }

  // the plateau and the gallery stand far above everything round them: rock between, never a walkable seam
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = I(x, y);
    if (!walk[i] || reg[i] === REG.plateau || reg[i] === REG.gallery || reg[i] === REG.shaft) continue;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const j = I(x + ox, y + oy);
      if (walk[j] && (reg[j] === REG.plateau || reg[j] === REG.gallery)) { walk[i] = 0; reg[i] = REG.rock; wet[i] = 0; lvl[i] = NaN; }
    }
  }
  // where the gallery runs close by, that seam eats the notch's far end (about one seed in a hundred): the passage
  // then ends at its last open tile on the way in, so the route ends on floor and the shaft is entered there
  for (let k = 0; k < 30; k++) {
    const [x, y] = XY(notchIn);
    if (walk[I(Math.floor(x), Math.floor(y))]) break;
    notchIn[0] += (notch[0] - notchIn[0]) * 0.12; notchIn[1] += (notch[1] - notchIn[1]) * 0.12;
  }

  // ---------------------------------------------------------------- floor relief in the main caves
  // caverns: a mound or two, maybe a pool; every walkable tile then smoothed and held under the climb limit
  const pools = [];
  caverns.forEach((cv, k) => {
    const [cx, cy] = XY(cv.c);
    const bumps = [];
    for (let n = 0; n < 2; n++) { const a = rng.range(0, 6.28), r = rng.range(0.3, 0.7) * cv.R; bumps.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, rng.range(4, 6.5), J(1.3)]); }
    let pool = null;
    if (k !== 2 || rng.chance(0.5)) for (let t = 0; t < 14 && !pool; t++) {   // off the way through
      const a = rng.range(0, 6.28), r = rng.range(0.4, 0.62) * cv.R, pr = rng.range(2.6, 3.6), q = [cx + Math.cos(a) * r, cy + Math.sin(a) * r, pr];
      if (!lines.some((l) => l.some(([x, y]) => Math.hypot(x - q[0], y - q[1]) < pr + 3))) pool = q;
    }
    each(cx, cy, cv.R * 1.4, (x, y, i) => {
      if (!walk[i] || zone[i] !== k) return;
      let h = cv.h + 0.6 * (fbm(x * 0.12, y * 0.12, ns + 51 + k) - 0.5);
      for (const [bx, by, s, amp] of bumps) h += amp * Math.exp(-((x + 0.5 - bx) ** 2 + (y + 0.5 - by) ** 2) / (s * s));
      F[i] = h;
      if (pool) {
        const d = Math.hypot(x + 0.5 - pool[0], y + 0.5 - pool[1]) / pool[2];
        if (d < 1.6) F[i] -= 1.6 * Math.exp(-d * d * 1.4);
      }
    });
    if (pool) pools.push({ x: pool[0], y: pool[1], r: pool[2], zone: k });
  });
  const isFixed = (i) => reg[i] === REG.shaft || reg[i] === REG.plateau || reg[i] === REG.gallery || reg[i] === REG.lake || reg[i] === REG.notch;
  const nb4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let it = 0; it < 24; it++) {
    const G2 = F.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = I(x, y);
      if (!walk[i] || isFixed(i)) continue;
      let s = F[i] * 2, n = 2;
      for (const [ox, oy] of nb4) { const j = I(x + ox, y + oy); if (walk[j]) { s += F[j]; n++; } }
      G2[i] = s / n;
    }
    F.set(G2);
  }
  // pools in the caverns: deep middles under water, shallow rims
  for (const pl of pools) {
    const c = I(Math.floor(pl.x), Math.floor(pl.y));
    if (!walk[c]) continue;
    let ring = Infinity;   // never above the dry floor round it
    each(pl.x, pl.y, pl.r * 1.7, (x, y, i) => { const d = Math.hypot(x + 0.5 - pl.x, y + 0.5 - pl.y); if (walk[i] && zone[i] === pl.zone && d > pl.r * 1.2 && d < pl.r * 1.7) ring = Math.min(ring, F[i]); });
    pl.level = Math.min(F[c] + 0.5, ring - 0.08);
    each(pl.x, pl.y, pl.r * 1.3, (x, y, i) => {
      if (!walk[i] || zone[i] !== pl.zone || F[i] > pl.level - 0.02 || Math.hypot(x + 0.5 - pl.x, y + 0.5 - pl.y) > pl.r * 1.25) return;
      lvl[i] = pl.level;
      if (F[i] < pl.level - 0.3) { walk[i] = 0; wet[i] = 2; } else wet[i] = 1;
    });
  }
  // the climb limit: a step between walkable neighbours stays under 0.33 tiles (3 levels; a hop is 4). The shaft, the
  // plateau, the gallery and the notch hold their heights; everything else gives way to them.
  const held = (i) => reg[i] === REG.shaft || reg[i] === REG.plateau || reg[i] === REG.gallery || reg[i] === REG.notch;
  for (let it = 0; it < 80; it++) {
    let moved = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = I(x, y);
      if (!walk[i]) continue;
      for (const [ox, oy] of nb4) {
        const j = I(x + ox, y + oy);
        if (!walk[j]) continue;
        const d = F[i] - F[j] - 0.33;
        if (d <= 0 || d > 1.2) continue;   // a cliff is a cliff, not a ramp to be smoothed
        if (held(i) && held(j)) continue;
        if (held(i)) F[j] += d; else if (held(j)) F[i] -= d; else { F[i] -= d / 2; F[j] += d / 2; }
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
  const S = CAVE_S, VW = W * S + 1, VH = H * S + 1, NV = VW * VH;
  const hv = new Float32Array(NV), ceil = new Float32Array(NV), cls = new Uint8Array(NV), surf = new Float32Array(NV).fill(NaN), vreg = new Uint8Array(NV);
  const tileAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : I(x, y));
  for (let j = 0; j < VH; j++) for (let i = 0; i < VW; i++) {
    const k = j * VW + i, fx = i / S, fy = j / S;
    // the tiles this vertex touches (1 at a centre, 2 on an edge, 4 at a corner)
    const xs = i % S === 0 ? [fx - 1, fx] : [Math.floor(fx)], ys = j % S === 0 ? [fy - 1, fy] : [Math.floor(fy)];
    let sw = 0, nw = 0, swt = 0, nwt = 0, sl = 0, nl = 0, r = 0;
    for (const ty of ys) for (const tx of xs) {
      const t = tileAt(tx, ty);
      if (t < 0) continue;
      if (walk[t]) { sw += F[t]; nw++; r = reg[t]; }
      else if (wet[t] === 2) { swt += F[t]; nwt++; r = r || reg[t]; }
      if (!Number.isNaN(lvl[t])) { sl += lvl[t]; nl++; }
    }
    if (nw) { cls[k] = 1; hv[k] = sw / nw; } else if (nwt) { cls[k] = 2; hv[k] = swt / nwt; }
    if (nl) surf[k] = sl / nl;
    vreg[k] = r;
  }
  // the nearest floor or water vertex of every rock vertex (two raster passes carrying the source: an 8SSEDT)
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
  // the highest floor within 1.5 tiles: a wall beside a ledge stands at least a lip above it (the spiral's parapets)
  const fmax = new Float32Array(NT).fill(-1e9);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let m = -1e9;
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) { const t = tileAt(x + ox, y + oy); if (t >= 0 && walk[t] && ox * ox + oy * oy <= 4.5) m = Math.max(m, F[t]); }
    fmax[I(x, y)] = m;
  }
  for (let k = 0; k < NV; k++) {
    const s = src[k], fr = s >= 0 ? vreg[s] : 0, vis = VIS[fr] ?? 4;
    if (cls[k]) { ceil[k] = (cls[k] === 2 ? (Number.isNaN(surf[k]) ? hv[k] : surf[k]) : hv[k]) + vis; continue; }
    const i = k % VW, j = (k / VW) | 0, d = Math.sqrt(dd[k]) / S, Fn = s >= 0 ? (cls[s] === 2 && !Number.isNaN(surf[s]) ? surf[s] : hv[s]) : 0;
    // the wall leans back more the taller it is, bulges in and out along its foot, and is banded with ledges
    const span = 1.4 + Math.min(2.8, vis * 0.16), dn = d + (fbm(i * 0.17, j * 0.17, ns + 81) - 0.5) * 1.6 * Math.min(1, d * 2);
    const t = Math.max(0, dn) / span, band = 0.05 * Math.sin(t * 13 + fbm(i * 0.08, j * 0.08, ns + 83) * 9) * Math.min(1, t * 2);
    const bump = (fbm(i * 0.21, j * 0.21, ns + 61) - 0.5) * 1.4 * Math.min(1, d);
    let R = Fn + (vis + 1.4) * (Math.pow(smooth(0, 1, t), 0.75) + band) + bump;
    const tx = Math.min(W - 1, Math.floor(i / S)), ty = Math.min(H - 1, Math.floor(j / S)), fm = fmax[I(tx, ty)];
    if (fm > -1e8) R = Math.max(R, Math.min(fm + 0.45, Fn + (vis + 1.4)));
    hv[k] = R; ceil[k] = Fn + vis;
  }
  // the cap: no rock may hide walkable ground or water behind it (same screen column, smaller x + y) on screen
  {
    const NC = VW + VH, M = new Float32Array(NC).fill(1e9), vy = (k) => (cls[k] === 2 && !Number.isNaN(surf[k]) ? surf[k] : hv[k]);
    for (let dsum = 0; dsum < VW + VH - 1; dsum++) {
      const iA = Math.max(0, dsum - (VH - 1)), iB = Math.min(VW - 1, dsum);
      const dv = dsum / S;
      for (let i = iA; i <= iB; i++) {
        const j = dsum - i, k = j * VW + i;
        if (cls[k]) continue;
        const c = i - j + VH;
        let m = 1e9;
        for (let o = -2; o <= 2; o++) { const q = c + o; if (q >= 0 && q < NC && M[q] < m) m = M[q]; }
        if (m > 1e8) continue;
        const cap = m + (dv - 0.5) * KS, s = src[k], Fn = s >= 0 ? vy(s) : 0;
        if (hv[k] > cap) hv[k] = Math.max(cap, Fn - 0.3);
      }
      for (let i = iA; i <= iB; i++) {
        const j = dsum - i, k = j * VW + i;
        if (!cls[k]) continue;
        const c = i - j + VH, val = vy(k) - dv * KS;
        if (val < M[c]) M[c] = val;
      }
    }
  }
  // per-vertex material: floor texture mix, wall texture mix, wetness, crevice darkening (gfx/cave3d.js)
  const mat = new Uint8Array(NV * 4);
  for (let k = 0; k < NV; k++) {
    const i = k % VW, j = (k / VW) | 0, s = src[k];
    const near = s >= 0 && !Number.isNaN(surf[s]) ? 1 - smooth(0, 3 * S, Math.sqrt(Math.min(dd[k], 1e6))) : 0;
    const wetK = Number.isNaN(surf[k]) ? near * 0.6 : 1;
    const spray = Math.max(0, 1 - Math.hypot(i / S - XY(plunge)[0], j / S - XY(plunge)[1]) / 16);
    mat[k * 4] = 255 * smooth(0.36, 0.64, fbm(i * 0.035, j * 0.035, ns + 71));
    mat[k * 4 + 1] = 255 * smooth(0.38, 0.62, fbm(i * 0.05, j * 0.05, ns + 73));
    mat[k * 4 + 2] = 255 * Math.min(1, Math.max(wetK, spray * 0.8));
    mat[k * 4 + 3] = 204;
  }
  // floor vertices near a wall are darker (crevices); measured as distance to the nearest rock vertex
  {
    const rd = new Float32Array(NV).fill(1e9), q = new Int32Array(NV);
    let qh = 0, qt = 0;
    for (let k = 0; k < NV; k++) if (!cls[k]) { rd[k] = 0; q[qt++] = k; }
    while (qh < qt) {
      const k = q[qh++], i = k % VW, j = (k / VW) | 0;
      for (const [ox, oy] of nb4) {
        const ii = i + ox, jj = j + oy;
        if (ii < 0 || jj < 0 || ii >= VW || jj >= VH) continue;
        const n = jj * VW + ii;
        if (rd[n] > rd[k] + 1) { rd[n] = rd[k] + 1; q[qt++] = n; }
      }
    }
    for (let k = 0; k < NV; k++) if (cls[k] === 1) mat[k * 4 + 3] = 255 * (0.55 + 0.45 * smooth(0, 2.2 * S, rd[k]));
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
  map.losRise = Math.round(2.2 * LV);   // a mound in a cavern hides nothing; the shaft's ledges and the plateau's cliff do

  // ---------------------------------------------------------------- dressing
  const H2 = (x, y) => { // height of the field at tile position (x, y), bilinear
    const fx = Math.min(VW - 1.001, Math.max(0, x * S)), fy = Math.min(VH - 1.001, Math.max(0, y * S)), i = Math.floor(fx), j = Math.floor(fy), u = fx - i, t = fy - j, k = j * VW + i;
    return (hv[k] * (1 - u) + hv[k + 1] * u) * (1 - t) + (hv[k + VW] * (1 - u) + hv[k + VW + 1] * u) * t;
  };
  // the route the party takes (auto-play walks it; props keep clear of it)
  const route = [XY(start), ...lines.flatMap((l) => l.filter((_, n) => n % 6 === 0)), XY(entry), XY([notch[0], notch[1] + 1]), XY(notchIn)].filter(([x, y]) => walk[I(Math.floor(x), Math.floor(y))]);
  const climbRoute = [];
  for (let th = 0.12; th < thEnd; th += 0.22) { const s = spiral(th); climbRoute.push(XY([s.a, s.b])); }
  climbRoute.push(XY([sE.a, sE.b]), XY(galEnd), XY(plat));
  const clear = new Uint8Array(NT);
  for (const [rx, ry] of [...route, ...climbRoute]) each(rx, ry, 2.6, (x, y, i) => { if (Math.hypot(x + 0.5 - rx, y + 0.5 - ry) < 2.6) clear[i] = 1; });
  // distance from every walkable tile to the nearest rock tile (for props and torches)
  const toRock = new Float32Array(NT).fill(99);
  {
    const q = new Int32Array(NT); let qh = 0, qt = 0;
    for (let i = 0; i < NT; i++) if (!walk[i] && !wet[i]) { toRock[i] = 0; q[qt++] = i; }
    while (qh < qt) { const i = q[qh++], x = i % W, y = (i / W) | 0; for (const [ox, oy] of nb4) { const t = tileAt(x + ox, y + oy); if (t >= 0 && toRock[t] > toRock[i] + 1) { toRock[t] = toRock[i] + 1; q[qt++] = t; } } }
  }
  // torches on walls that face the camera and stand tall enough to hang one: rock up-screen of a floor tile
  const torches = [], wallStal = [], props = [];
  const torchOk = (x, y) => {
    const i = I(x, y);
    if (!walk[i] || wet[i]) return null;
    for (const [ox, oy] of [[-1, 0], [0, -1]]) {
      const t = tileAt(x + ox, y + oy);
      if (t < 0 || walk[t] || wet[t]) continue;
      const mx = x + 0.5 + ox * 0.5, my = y + 0.5 + oy * 0.5, wh = H2(x + 0.5 + ox * 1.5, y + 0.5 + oy * 1.5);
      if (wh - F[i] > 2.6) return { x: mx - ox * 0.12, y: my - oy * 0.12, h: F[i] + 1.55, nx: -ox, ny: -oy, reg: reg[i] };
    }
    return null;
  };
  const near = (list, x, y, d) => list.some((o) => (o.x - x) ** 2 + (o.y - y) ** 2 < d * d);
  for (const [rx, ry] of [...route, ...climbRoute]) {
    for (let n = 0; n < 6; n++) {
      const x = Math.floor(rx + J(4)), y = Math.floor(ry + J(4));
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      const t = torchOk(x, y);
      if (t && !near(torches, t.x, t.y, t.reg === REG.shaft ? 6 : 7.5)) torches.push(t);
    }
  }
  for (let n = 0; n < 900; n++) {   // more along the lake cavern's and the plateau's walls
    const x = rng.int(1, W - 2), y = rng.int(1, H - 2), i = I(x, y);
    if (reg[i] !== REG.lake && reg[i] !== REG.plateau && reg[i] !== REG.cavern) continue;
    const t = torchOk(x, y);
    if (t && !near(torches, t.x, t.y, 8.5)) torches.push(t);
  }
  // stalactites hanging in front of the tall walls of the caverns, the lake cavern and the shaft (live 3D)
  for (let n = 0; n < 14000 && wallStal.length < 700; n++) {
    const x = rng.int(1, W - 2), y = rng.int(1, H - 2), i = I(x, y);
    if (!walk[i] && !wet[i]) continue;
    const r = reg[i];
    if (r !== REG.cavern && r !== REG.lake && r !== REG.shaft && r !== REG.plateau && !(r === REG.passage && rng.chance(0.35))) continue;
    for (const [ox, oy] of [[-1, 0], [0, -1], [-1, -1]]) {
      const t = tileAt(x + ox, y + oy);
      if (t < 0 || walk[t] || wet[t]) continue;
      const vis = VIS[r], base = Number.isNaN(lvl[i]) ? F[i] : lvl[i], wh = H2(x + 0.5 + ox * 2.4, y + 0.5 + oy * 2.4);
      if (wh - base < vis * 0.72) continue;
      const top = base + vis * rng.range(0.78, 0.98), len = Math.min(top - base - 1.6, rng.range(0.8, 1) * (r === REG.lake ? rng.range(2, 5.5) : rng.range(1, 3)));
      if (len < 0.6) continue;
      wallStal.push({ x: x + 0.5 + ox * rng.range(0.35, 0.6) + J(0.3), y: y + 0.5 + oy * rng.range(0.35, 0.6) + J(0.3), top, len, r: len * rng.range(0.12, 0.2), m: rng.int(0, 5) });
      break;
    }
  }
  // free-standing stalagmites, clusters, columns and hanging stalactites over the caverns (baked 3D sprites)
  const blockTile = (x, y) => { const i = I(x, y); if (walk[i] && !clear[i]) map.block[i] = 1; };
  for (let n = 0; n < 9000; n++) {
    const x = rng.int(2, W - 3), y = rng.int(2, H - 3), i = I(x, y);
    if (!walk[i] || wet[i] || clear[i] || map.block[i]) continue;
    const r = reg[i];
    const dens = r === REG.cavern ? 0.16 : r === REG.lake ? 0.08 : r === REG.passage ? 0.025 : r === REG.shaft ? 0.02 : 0;
    if (!rng.chance(dens * (toRock[i] <= 2 ? 2.2 : 1))) continue;
    if (near(props, x + 0.5, y + 0.5, 1.6)) continue;
    const big = r === REG.cavern && toRock[i] > 3.5 && rng.chance(0.12);
    if (big) {
      if ([[0, 0], [1, 0], [0, 1], [1, 1]].some(([ox, oy]) => { const t = I(x + ox, y + oy); return !walk[t] || clear[t] || wet[t]; })) continue;
      props.push({ x: x + 1, y: y + 1, caveProp: 'column', h: VIS[REG.cavern] + 0.6, m: rng.int(0, 2), flip: rng.chance(0.5) });
      blockTile(x, y); blockTile(x + 1, y); blockTile(x, y + 1); blockTile(x + 1, y + 1);
    } else {
      const kind = rng.chance(0.35) ? 'cluster' : rng.chance(0.15) ? 'boulder' : 'mite';
      props.push({ x: x + 0.5 + J(0.15), y: y + 0.5 + J(0.15), caveProp: kind, m: rng.int(0, kind === 'mite' ? 7 : 3), flip: rng.chance(0.5), s: rng.range(0.75, 1.25) });
      blockTile(x, y);
    }
  }
  for (let n = 0; n < 4000; n++) {   // hanging over open floor: drawn as sprites so whoever walks behind one is hidden by it
    const x = rng.int(2, W - 3), y = rng.int(2, H - 3), i = I(x, y);
    if (!(walk[i] || wet[i]) || (reg[i] !== REG.cavern && reg[i] !== REG.lake) || !rng.chance(reg[i] === REG.lake ? 0.04 : 0.05)) continue;
    if (near(props, x + 0.5, y + 0.5, 2.4)) continue;
    const base = Number.isNaN(lvl[i]) ? F[i] : lvl[i], vis = VIS[reg[i]], len = reg[i] === REG.lake ? rng.range(2.5, 6) : rng.range(1.5, 3.2);
    props.push({ x: x + 0.5, y: y + 0.5, caveProp: 'tite', z: (base + Math.min(vis, 12) + rng.range(-0.4, 0.6) - H2(x + 0.5, y + 0.5)) * VZ, len, m: rng.int(0, 5), flip: rng.chance(0.5) });
  }
  // nothing may cut the way: the route must still join start to notch and the ledge's foot to the plateau
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
  const okMain = reach(XY(start), XY(notchIn)) && !reach(XY(start), XY(plat)), okClimb = reach(arrive, XY(plat));   // and no way up but the climb

  // ---------------------------------------------------------------- spawns and chests
  const spawns = [], chests = [];
  let n = 0;
  for (const line of lines) for (let k = 10 + rng.int(0, 6); k < line.length - 4; k += rng.int(30, 40)) {
    const [x, y] = line[k], i = map.tileIdx(x, y);
    if (!walk[i] || Math.hypot(x - XY(start)[0], y - XY(start)[1]) < 14) continue;
    spawns.push({ x, y, n: rng.int(2, 3 + Math.min(3, Math.floor(depth / 30))), rank: n % 9 === 8 ? 'unique' : n % 4 === 3 ? 'champion' : 'normal', zone: 'delve' });
    n++;
  }
  caverns.forEach((cv, k) => {
    for (let m = 0; m < 1 + (k === 1 ? 1 : 0) + (depth > 20 ? 1 : 0); m++) {
      for (let tries = 0; tries < 30; tries++) {
        const [cx, cy] = XY(cv.c), a = rng.range(0, 6.28), r = rng.range(0, cv.R * 0.75), x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, i = map.tileIdx(x, y);
        if (!walk[i] || map.block[i]) continue;
        spawns.push({ x, y, n: rng.int(3, 4 + Math.min(3, Math.floor(depth / 25))), rank: m === 0 ? 'champion' : n % 3 === 2 ? 'unique' : 'normal', zone: 'delve' });
        n++; break;
      }
    }
  });
  for (let th = 2.2; th < thEnd - 0.6; th += rng.range(1.15, 1.6)) {   // up the ledge; some will leap down when the party passes under them
    const s = spiral(th), [x, y] = XY([s.a, s.b]);
    if (!walk[map.tileIdx(x, y)]) continue;
    spawns.push({ x, y, n: rng.int(2, 3 + Math.min(2, Math.floor(depth / 35))), rank: n % 5 === 4 ? 'champion' : n % 9 === 8 ? 'unique' : 'normal', zone: 'climb', th });
    n++;
  }
  const looks = caveLooks(v, rng.fn());
  for (const sp of spawns) { sp.arch = rng.pick(CAVE_ROSTER); sp.look = looks.pick(sp.arch); }
  const chestAt = (x, y, rich = false) => { const i = map.tileIdx(x, y); if (walk[i]) chests.push({ x, y, rich }); };
  for (const [ax, ay] of alcoves) chestAt(ax, ay, true);
  for (const cv of caverns) { const [cx, cy] = XY(cv.c); for (let t = 0; t < 20; t++) { const [x, y] = [cx + J(cv.R * 0.7), cy + J(cv.R * 0.7)], i = map.tileIdx(x, y); if (walk[i] && !map.block[i] && toRock[i] > 1.5 && toRock[i] < 4 && !clear[i]) { chests.push({ x, y }); break; } } }
  { const s = spiral(thEnd * 0.52); chestAt(...XY([s.a + Math.cos(s.ph) * 1.2, s.b + Math.sin(s.ph) * 1.2])); }

  const cave = {
    W, H, S, VW, VH, hv, ceil, cls, surf, mat, vreg, vd: Float32Array.from(dd, (q) => Math.sqrt(Math.min(q, 1e6)) / S), HP, WL, v, seed, XY, AB, H2,
    plateau: { x: px, y: py, r: Rp }, lip: XY(lip), plunge: XY(plunge), lake: { x: kx, y: ky, A: LA, B: LB }, spring: XY(spring), river: river.map(([a, b]) => XY([a, b])),
    notch: XY(notch), notchIn: XY(notchIn), arrive, mouth, mouthH: ms.h + 0.05, mouthDir,
    shaft: { x: sx, y: sy, r0, P, N, w, h0, phi0b, dir, thEnd, rRim, pool: h0 - 0.55 }, spiral: (th) => { const s = spiral(th); const [x, y] = XY([s.a, s.b]); return { x, y, h: s.h }; },
    /** How far along the ledge (radians of spiral from its foot) tile position (x, y) is: the nearest winding. */
    thetaAt(x, y) {
      const [a, b] = AB(x, y), da = a - shaft[0], db = b - shaft[1], r = Math.hypot(da, db), ph = Math.atan2(db, da);
      const base = (((dir * (ph - phi0b)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), k = Math.round((r - r0) / P - base / (2 * Math.PI));
      return Math.max(0, Math.min(thEnd, base + 2 * Math.PI * Math.max(0, k)));
    },
    galEnd: XY(galEnd), caverns: caverns.map((cv) => ({ x: XY(cv.c)[0], y: XY(cv.c)[1], R: cv.R, name: cv.name })), lakeCave: { x: lx, y: ly, A: CLA, B: CLB },
    entry: XY(entry), pools, torches, wallStal, route, climbRoute, reg, zone, walk, wet, lvl, F, okMain, okClimb,
  };
  map.cave = cave;
  return {
    map, props, buildings: [], wallHangings: [], torches: [], spawns, chests, looks,
    start: XY(start), exit: [px, py], cave, variant: v, seed,
  };
}
