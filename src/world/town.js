// The town of Herrington Hollow: vendors, buildings, props and the dungeon portal.
import { TileMap } from './map.js';
import { RNG, TAU } from '../core/util.js';
import { A } from '../core/assets.js';
import { TW } from '../core/view.js';
import { isoBarrier, isoBarrierProp } from '../gfx/isobarriers.js';
import { extendedTownFloors } from '../gfx/biomeexpansion.js';
import { wallHangingAtBuilding } from '../gfx/wallhangings.js';
import { isoFix } from '../gfx/isofix.js';

export const VENDORS = [
  { id: 'weapons', name: 'Garrick Ironhand', title: 'Weaponsmith', sprite: 'barbarian', pal: { hue: 25, sat: 0.6, light: -0.02 }, sign: 'sword', greet: 'Steel for the slaughter. Pick your poison - edges, hafts or bows.' },
  { id: 'armor', name: 'Stevie the Stronger', title: 'Armorer', sprite: 'lancer', pal: { hue: -25, sat: 0.9 }, sign: 'shield', greet: 'The dead hit hard down there. Wear something thicker than hope.' },
  { id: 'upgrade', name: 'Homunculus the Proud', title: 'Blacksmith · Paladin', sprite: 'dragoon', pal: { hue: 20, sat: 0.7, light: 0.03 }, sign: 'hammer', greet: 'Homunculus the Proud, smith and Paladin of the Light! Hand it over. Hammer and faith will see to the rest.' },
  { id: 'enchant', name: 'Lily Belle the Veiled', title: 'Enchanter', sprite: 'arcane_sorcerer', pal: { hue: 120, sat: 1 }, sign: 'orb', greet: 'Magic is merely a negotiation. Let us renegotiate your equipment.' },
  { id: 'alchemist', name: 'Old Mother Wren', title: 'Alchemist', sprite: 'carrion_witch', pal: { hue: 150, sat: 0.8 }, sign: 'lantern', greet: 'Red for blood, blue for wits, purple for both. Orange... for when you mean it.' },
  { id: 'gems', name: 'Zafir the Lapidary', title: 'Gem Merchant', sprite: 'totem_master', pal: { hue: 200, sat: 0.9 }, sign: 'orb', greet: 'Every stone remembers the light. Three of a kind, and I can make them sing louder.' },
  { id: 'socket', name: 'Jamie the Curator', title: 'Jeweler', sprite: 'wizard', pal: { hue: 60, sat: 0.7 }, sign: 'boots', greet: 'A socket is a promise. I can drill your gear - or pry those gems back out.' },
  { id: 'gamble', name: 'Fortunato', title: 'Gambler', sprite: 'bard', pal: { hue: 180, sat: 1 }, sign: 'bow', greet: 'Fortune favours the foolish! Unidentified treasures - who knows what lurks inside?' },
];

// Ground materials in the pack's transition order; a pair's A side is the earlier one.
const MATS = ['grass', 'gravel', 'dirt', 'mud', 'stone', 'concrete'];
const BS = 1.5; // buildings are the pack's 2 x 2 houses drawn 1.5x: a 3 x 3 tile footprint, walls ~1.3 heroes tall
const ISO_NEIGHBOR_RADIUS = 8;
export const rollTownWeather = (random = Math.random) => random() < 0.25;

/**
 * The town's ground tiles from the town pack: [{img,sx,sy,w,h}]; 0-5 are the MATS bases, then 8 transition shapes
 * per material pair (6 + pair * 8 + shape, pairs in TPAIRS order).
 */
let TPAIRS = null;
export function makeTownTiles() {
  const t = A.town, m = t.meta, tiles = [];
  const ent = ([x, y]) => ({ img: t.ground, sx: x, sy: y, w: m.tile[0], h: m.tile[1] });
  for (const n of MATS) tiles.push(ent(m.floors[n]));
  TPAIRS = Object.keys(m.transitions);
  for (const p of TPAIRS) for (const r of m.transitions[p]) tiles.push(ent(r));
  tiles.push(...extendedTownFloors(t.ground,m));
  return tiles;
}

/** A town-pack object (building, tree, scatter) as a draw rect: {img,sx,sy,w,h,ox,oy} (ox/oy native px from its pivot). */
export function townObject(name) {
  const r = A.town.meta.objects[name], f = r && isoFix('town', name); // re-projected onto the 2:1 grid (gfx/isofix.js)
  return r && (f ? { ...f, name } : { img: A.town.objects, sx: r[0], sy: r[1], w: r[2], h: r[3], ox: r[4], oy: r[5], name });
}

// Buildings: each is the pack's 2 x 2 house drawn BS x (a 3 x 3 footprint). The art puts the door on the +y face, or
// on the +x face for DOOR_X; drawn mirrored (b.flip) the door moves to the other face, so a shop can front any street.
const DOOR_X = new Set(['alchemist', 'gems', 'socket', 'gamble', 'bakery']);
// what lies around each shop's door: [blocking props, small props]
const SHOP_DRESS = {
  weapons: [['tool_rack', 'crate_stack'], ['water_bucket']], armor: [['closed_barrel', 'cloth_crate'], []],
  upgrade: [['anvil_stump', 'cold_forge', 'smith_bellows', 'firewood_stack'], ['tiles_and_bricks']],
  enchant: [['scroll_rack'], ['mushrooms', 'wildflowers']], alchemist: [['potion_jars', 'water_barrel'], ['water_bucket', 'mushrooms']],
  gems: [['market_table'], ['vegetable_basket']], socket: [['crate_stack'], ['rope_and_hook']], gamble: [['closed_barrel', 'water_barrel'], ['rope_and_hook']],
  inn: [['closed_barrel', 'stone_bench'], ['water_bucket']], bakery: [['grain_sacks', 'grain_handmill'], ['vegetable_basket']],
  stables: [['hay_bale', 'horse_trough'], []], cottage: [['firewood_stack'], ['water_bucket', 'wildflowers']],
};
const SOLID = /barrel|crate|rack|anvil|forge|bellows|firewood|table|jars|bench|sacks|handmill|hay|trough|cart|well|workbench|boulder|boundary|fence|log|stump|cluster|wheel|debris/;
const FOREST_TREES = ['t_medium_fir', 't_medium_fir', 't_scots_pine', 't_old_cedar', 't_young_pine', 't_medium_willow', 't_tall_elm', 't_mature_ash', 't_ancient_oak', 't_twin_birch', 't_crooked_oak', 't_wind_juniper'];
const TOWN_TREES = ['t_ancient_willow', 't_young_birch', 't_twin_birch', 't_mature_ash', 't_crooked_oak', 't_young_apple', 't_wind_juniper', 't_medium_willow'];

/**
 * Herrington Hollow, rolled from a seed (each hero has their own, c.townSeed): an irregular plaza with a well and market
 * stalls, meandering roads out into the forest (one of them to the portal), the shops fronting the streets with their
 * wares out front, gravel approaches to every door, and yards around them (gardens, orchard, lumber camp, paddock, ruins).
 * Retries with the next seed if a vendor or the portal can't be reached.
 */
export function generateTown(tileset, seed = 1337) {
  let t = null;
  for (let i = 0; i < 12 && !t; i++) t = rollTown(tileset, (seed + i * 7919) >>> 0, i === 11);
  t.seed = seed;
  return t;
}

function rollTown(tileset, seed, last) {
  const rng = new RNG(seed);
  const W = rng.int(50, 58), H = rng.int(50, 58);
  const map = new TileMap(W, H);
  map.t.fill(1);
  const N = W * H;
  const mat = new Uint8Array(N); // MATS index per tile (0 grass)
  const use = new Uint8Array(N); // 0 open grass, 1 street, 2 building, 3 yard, 4 forest
  const keep = new Uint8Array(N); // 1: keep clear (door fronts, the portal yard): no buildings or blocking props
  const I = (x, y) => y * W + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const R = (a, b) => rng.range(a, b);

  // ---- the forest wall: a ragged band 2-6 tiles deep
  const ph = [R(0, 9), R(0, 9), R(0, 9)];
  const forestAt = (x, y) => {
    const e = Math.min(x, y, W - 1 - x, H - 1 - y);
    const f = 3 + 1.2 * Math.sin(x * 0.5 + ph[0]) + 1.1 * Math.sin(y * 0.43 + ph[1]) + 0.8 * Math.sin((x + y) * 0.29 + ph[2]);
    return e < Math.max(2, Math.min(6, f));
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (forestAt(x, y)) use[I(x, y)] = 4;

  // ---- the plaza: overlapping ellipses of flagstones around the well
  const C = { x: Math.floor(W / 2 + R(-3, 3)), y: Math.floor(H / 2 + R(-3, 3)) };
  const blobs = [[C.x + 0.5, C.y + 0.5, R(4, 5.5), R(4, 5.5)]];
  for (let i = rng.int(2, 4); i > 0; i--) blobs.push([C.x + R(-3.5, 3.5), C.y + R(-3.5, 3.5), R(2.5, 4.5), R(2.5, 4.5)]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (blobs.some(([bx, by, rx, ry]) => ((x + 0.5 - bx) / rx) ** 2 + ((y + 0.5 - by) / ry) ** 2 < 1)) { mat[I(x, y)] = 4; use[I(x, y)] = 1; }
  }
  if (rng.chance(0.6)) for (let y = C.y - 1; y <= C.y + 1; y++) for (let x = C.x - 1; x <= C.x + 1; x++) mat[I(x, y)] = 5; // a paved square under the well

  // ---- roads: meandering lanes from the plaza out into the forest; the first leads to the portal
  const paint = (x, y, r, m, shoulder) => {
    for (let yy = Math.floor(y - r - 1); yy <= y + r + 1; yy++) for (let xx = Math.floor(x - r - 1); xx <= x + r + 1; xx++) {
      if (!inb(xx, yy) || Math.min(xx, yy, W - 1 - xx, H - 1 - yy) < 1) continue;
      const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y), i = I(xx, yy);
      if (d <= r) { if (mat[i] < 4 && !(mat[i] === 3 && m === 2)) mat[i] = m; use[i] = 1; }
      else if (shoulder && d <= r + 0.75 && mat[i] === 0 && use[i] !== 1) mat[i] = 1;
    }
  };
  const lane = (x0, y0, x1, y1, r, m, shoulder, stopAtEdge, RR = R) => {
    let x = x0, y = y0;
    const pts = [], phase = RR(0, TAU), wig = RR(0.25, 0.6);
    for (let k = 0; k < 400; k++) {
      const d = Math.hypot(x1 - x, y1 - y);
      if (d < 0.6) break;
      let a = Math.atan2(y1 - y, x1 - x) + Math.sin(k * 0.09 + phase) * wig * Math.min(1, d / 6);
      x += Math.cos(a) * 0.5; y += Math.sin(a) * 0.5;
      if (stopAtEdge && Math.min(x, y, W - 1 - x, H - 1 - y) < 1.5) break;
      paint(x, y, r, m, shoulder);
      pts.push([x, y]);
    }
    return pts;
  };
  const aP = R(0, TAU);
  const maxD = (a) => { let d = 0; while (d < 40 && Math.min(C.x + Math.cos(a) * d, C.y + Math.sin(a) * d, W - 1 - (C.x + Math.cos(a) * d), H - 1 - (C.y + Math.sin(a) * d)) > 8) d += 0.5; return d; };
  const dP = Math.min(maxD(aP), R(15, 21));
  const portal = { x: Math.floor(C.x + Math.cos(aP) * dP) + 0.5, y: Math.floor(C.y + Math.sin(aP) * dP) + 0.5 };
  const roads = [lane(C.x + 0.5, C.y + 0.5, portal.x, portal.y, 1.5, 2, rng.chance(0.7), false)];
  const nRoads = rng.int(2, 3);
  for (let i = 0; i < nRoads; i++) {
    const a = aP + ((i + 1) * TAU) / (nRoads + 1) + R(-0.45, 0.45);
    roads.push(lane(C.x + 0.5, C.y + 0.5, C.x + 0.5 + Math.cos(a) * 40, C.y + 0.5 + Math.sin(a) * 40, rng.chance(0.5) ? 1.5 : 1.1, rng.chance(0.75) ? 2 : 1, rng.chance(0.5), true));
  }
  // side streets off the roads
  for (let i = rng.int(1, 3); i > 0; i--) {
    const road = rng.pick(roads.slice(1).concat(roads)), at = road[Math.floor(R(0.3, 0.8) * road.length)];
    if (!at) continue;
    const a = R(0, TAU), len = R(6, 11);
    roads.push(lane(at[0], at[1], at[0] + Math.cos(a) * len, at[1] + Math.sin(a) * len, 1, rng.chance(0.5) ? 1 : 2, false, true));
  }
  // the portal yard: gravel, with the portal on a stone pad; nothing gets built around it
  for (let y = Math.floor(portal.y - 5); y <= portal.y + 5; y++) for (let x = Math.floor(portal.x - 5); x <= portal.x + 5; x++) {
    if (!inb(x, y)) continue;
    const d = Math.hypot(x + 0.5 - portal.x, y + 0.5 - portal.y), i = I(x, y);
    if (d < 5) keep[i] = 1;
    if (d < 3.1) { if (use[i] === 4) use[i] = 0; mat[i] = d < 1.2 ? 4 : 1; use[i] = 1; }
  }
  // THE ETERNAL BREACH's purple portal across the plaza from the dungeon portal, on its own road and yard. Rolled from
  // a second generator, so the roads and plaza of every hero's town stay as they were (a building may move aside).
  const brng = new RNG((seed ^ 0x6b7ea5) >>> 0), BR = (a, b) => brng.range(a, b);
  const aB = aP + Math.PI + BR(-0.7, 0.7), dB = Math.min(maxD(aB), BR(13, 18));
  const breach = { x: Math.floor(C.x + Math.cos(aB) * dB) + 0.5, y: Math.floor(C.y + Math.sin(aB) * dB) + 0.5 };
  roads.push(lane(C.x + 0.5, C.y + 0.5, breach.x, breach.y, 1.3, 2, false, false, BR));
  for (let y = Math.floor(breach.y - 4); y <= breach.y + 4; y++) for (let x = Math.floor(breach.x - 4); x <= breach.x + 4; x++) {
    if (!inb(x, y)) continue;
    const d = Math.hypot(x + 0.5 - breach.x, y + 0.5 - breach.y), i = I(x, y);
    if (d < 4.2) keep[i] = 1;
    if (d < 2.8) { mat[i] = d < 1.2 ? 4 : 1; use[i] = 1; }
  }
  // puddles on the dirt
  for (let i = rng.int(3, 7); i > 0; i--) {
    const road = rng.pick(roads), at = road[Math.floor(R(0.2, 0.9) * road.length)];
    if (!at) continue;
    for (let k = rng.int(1, 3); k > 0; k--) { const x = Math.floor(at[0] + R(-1, 1)), y = Math.floor(at[1] + R(-1, 1)); if (inb(x, y) && mat[I(x, y)] === 2) mat[I(x, y)] = 3; }
  }

  // ---- buildings
  const buildings = [], npcs = [], props = [], torches = [], wallHangings = [];
  const k = TW / A.town.meta.tile[0];
  const street = (x, y) => inb(x, y) && use[I(x, y)] === 1;
  // a free 3 x 3 footprint, a tile of open ground or street round it, and two tiles between it and other buildings
  // (the roofs overhang the footprint)
  const fits = (x0, y0) => {
    for (let y = y0 - 2; y <= y0 + 4; y++) for (let x = x0 - 2; x <= x0 + 4; x++) {
      if (!inb(x, y)) return false;
      const u = use[I(x, y)], foot = x >= x0 && y >= y0 && x < x0 + 3 && y < y0 + 3, ring = x >= x0 - 1 && y >= y0 - 1 && x <= x0 + 3 && y <= y0 + 3;
      if (foot ? u !== 0 || keep[I(x, y)] : ring ? u === 2 || u === 4 || u === 3 || keep[I(x, y)] : u === 2) return false;
    }
    return true;
  };
  // a footprint at (x0, y0) whose door (+y face, or +x when sx) fronts tile (fx, fy)
  const frontOf = (x0, y0, sx) => (sx ? [x0 + 3, y0 + 1] : [x0 + 1, y0 + 3]);
  const nearbySide = (x, y) => {
    let side = null;
    for (const b of buildings) {
      const d = Math.hypot(b.cx - x, b.cy - y);
      if (d < ISO_NEIGHBOR_RADIUS) {
        if (side !== null && side !== b.sx) return 'conflict';
        side = b.sx;
      }
    }
    return side;
  };
  const streets = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (use[I(x, y)] === 1 && !keep[I(x, y)]) streets.push([x, y]);
  // A permanent root by the well: every approach joins this protected network.
  const connected = new Uint8Array(N), root = I(C.x, C.y + 3);
  connected[root] = keep[root] = use[root] = 1;
  mat[root] = 4;
  const place = (name, vendor) => {
    const near = vendor ? 15 : 24;
    for (let tries = 0; tries < 160; tries++) {
      const [tx, ty] = rng.pick(streets);
      if (Math.hypot(tx - C.x, ty - C.y) > near + tries / 12) continue;
      let sx = rng.chance(0.5), x0 = sx ? tx - 3 : tx - 1, y0 = sx ? ty - 1 : ty - 3;
      let side = nearbySide(x0 + 1.5, y0 + 1.5);
      if (side === 'conflict') continue;
      if (side !== null) { sx = side; x0 = sx ? tx - 3 : tx - 1; y0 = sx ? ty - 1 : ty - 3; }
      side = nearbySide(x0 + 1.5, y0 + 1.5);
      if (side === 'conflict' || (side !== null && side !== sx)) continue;
      if (fits(x0, y0)) return addBuilding(name, x0, y0, sx, vendor);
    }
    // off the streets: anywhere open, joined to the nearest street by a footpath
    for (let tries = 0; tries < 200; tries++) {
      const x0 = rng.int(5, W - 9), y0 = rng.int(5, H - 9), side = nearbySide(x0 + 1.5, y0 + 1.5);
      if (side === 'conflict') continue;
      const sx = side ?? rng.chance(0.5);
      if (Math.hypot(x0 - C.x, y0 - C.y) > near + 6 || !fits(x0, y0)) continue;
      return addBuilding(name, x0, y0, sx, vendor);
    }
    return null;
  };
  const footpath = (fx, fy) => {
    // Prefer the road network (cost 1) over open ground (cost 4), so door
    // paths join the existing lanes instead of cutting arbitrary shortcuts.
    const start = I(fx, fy), cost = new Int16Array(N).fill(0x3fff), prev = new Int32Array(N).fill(-1), queue = [[start]];
    cost[start] = 0;
    let end = -1;
    for (let c = 0; c < queue.length && end < 0; c++) for (const i of queue[c]) {
      if (cost[i] !== c) continue;
      const x = i % W, y = (i / W) | 0;
      if (connected[i]) { end = i; break; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, j = I(nx, ny);
        if (!inb(nx, ny) || use[j] === 2 || use[j] === 3 || use[j] === 4 || map.block[j] || (nx === C.x && ny === C.y)) continue;
        const next = c + (use[j] === 1 ? 1 : 4);
        if (next >= cost[j]) continue;
        cost[j] = next; prev[j] = i;
        while (queue.length <= next) queue.push([]);
        queue[next].push(j);
      }
    }
    const route = [];
    for (let i = end; i >= 0; i = prev[i]) {
      use[i] = connected[i] = keep[i] = 1;
      if (mat[i] === 0) mat[i] = 1;
      else if (mat[i] === 3) mat[i] = 2;
      route.push([i % W, (i / W) | 0]);
      if (i === start) break;
    }
    return route;
  };
  const addBuilding = (name, x0, y0, sx, vendor) => {
    const spr = townObject('b_' + name), cx = x0 + 1.5, cy = y0 + 1.5;
    const flip = sx !== DOOR_X.has(name); // the art's door face, mirrored to the face we want
    const b = { cx, cy, spr, k: k * BS, depth: cx + cy, vendor: vendor && vendor.id, flip, name, sx, x0, y0 };
    buildings.push(b);
    if (rng.chance(0.62)) wallHangings.push(wallHangingAtBuilding(b, sx, rng.int(0, 49)));
    for (let y = y0; y < y0 + 3; y++) for (let x = x0; x < x0 + 3; x++) { use[I(x, y)] = 2; map.block[I(x, y)] = 1; if (mat[I(x, y)] !== 0) mat[I(x, y)] = 0; }
    const [fx, fy] = frontOf(x0, y0, sx);
    for (const [ex, ey] of sx ? [[fx, fy], [fx, fy - 1], [fx, fy + 1]] : [[fx, fy], [fx - 1, fy], [fx + 1, fy]]) if (inb(ex, ey)) keep[I(ex, ey)] = 1;
    b.approach = footpath(fx, fy);
    // the torch beside the door, lit (the pack's torches are unlit)
    for (const [ox, oy] of A.town.meta.lights['b_' + name] || []) {
      const lx = ox * k * BS * (flip ? -1 : 1), ly = oy * k * BS; // screen offset from the building centre
      const gx = cx + (sx ? 1.62 : 0), gy = cy + (sx ? 0 : 1.62); // a point just off the door wall
      torches.push({ kind: 'flame', x: gx, y: gy, fx: lx - (gx - cx - (gy - cy)) * TW / 2, fy: ly - (gx - cx + gy - cy) * TW / 4, light: 3.4 });
    }
    if (vendor) npcs.push({ vendor, x: sx ? cx + 2.3 : cx + 0.75, y: sx ? cy + 0.75 : cy + 2.3, flip: !sx });
    return b;
  };
  for (const v of shuffle(VENDORS.slice(), rng)) if (!place(v.id, v) && !last) return null;
  const houses = ['inn', 'bakery', 'stables', ...Array(rng.int(2, 5)).fill('cottage')];
  for (const n of houses) place(n, null);

  // ---- props
  const S = (name) => townObject(name);
  const blockAt = (x, y) => { map.block[I(Math.floor(x), Math.floor(y))] = 1; };
  const free = (x, y, solid) => {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (!inb(tx, ty) || map.block[I(tx, ty)] || use[I(tx, ty)] === 2 || use[I(tx, ty)] === 4) return false;
    if (keep[I(tx, ty)]) return false;
    return !props.some((p) => p.kind === 'scatter' && Math.abs(p.x - x) < 0.8 && Math.abs(p.y - y) < 0.8);
  };
  const prop = (name, x, y, opts = {}) => {
    const spr = typeof name === 'string' ? S(name) : name;
    const solid = opts.solid ?? (typeof name === 'string' && SOLID.test(name));
    if (!spr || !free(x, y, solid)) return false;
    const side = nearbySide(x, y);
    props.push({ kind: 'scatter', x, y, spr, k, flip: opts.flip ?? (side === 'conflict' ? rng.chance(0.5) : side ?? rng.chance(0.5)) });
    if (solid) blockAt(x, y);
    return true;
  };
  // the well, benches round it, market stalls on the plaza's rim
  prop('village_well', C.x + 0.5, C.y + 0.5, { flip: false });
  for (let i = rng.int(1, 2), a = R(0, TAU); i > 0; i--, a += R(1.5, 2.6)) prop('stone_bench', C.x + 0.5 + Math.cos(a) * 2.6, C.y + 0.5 + Math.sin(a) * 2.6);
  const ware = ['vegetable_basket', 'crate_stack', 'cloth_crate', 'grain_sacks', 'potion_jars', 'closed_barrel', 'water_bucket'];
  for (let i = rng.int(1, 3), a = R(0, TAU); i > 0; i--, a += R(0.9, 1.8)) {
    const d = R(3.6, 4.6), x = C.x + 0.5 + Math.cos(a) * d, y = C.y + 0.5 + Math.sin(a) * d;
    if (!street(Math.floor(x), Math.floor(y)) || keep[I(Math.floor(x), Math.floor(y))]) continue;
    if (prop('market_table', x, y)) { prop(rng.pick(ware), x + Math.cos(a + 1.6) * 0.9, y + Math.sin(a + 1.6) * 0.9); if (rng.chance(0.5)) prop(rng.pick(ware), x + Math.cos(a) * 0.9, y + Math.sin(a) * 0.9); }
  }
  // each building's wares and clutter beside its door and along its walls
  for (const b of buildings) {
    const [solid, small] = SHOP_DRESS[b.name] || SHOP_DRESS.cottage;
    const spots = b.sx
      ? [[b.x0 + 3.5, b.y0 - 0.4], [b.x0 + 3.5, b.y0 + 3.4], [b.x0 + 3.45, b.y0 + 2.6], [b.x0 - 0.5, b.y0 + 1.5], [b.x0 + 1.5, b.y0 - 0.5]]
      : [[b.x0 - 0.4, b.y0 + 3.5], [b.x0 + 3.4, b.y0 + 3.5], [b.x0 + 2.6, b.y0 + 3.45], [b.x0 + 1.5, b.y0 - 0.5], [b.x0 - 0.5, b.y0 + 1.5]];
    let si = 0;
    if (b.name === 'upgrade') {
      // Homunculus the Proud always has his anvil by the door: the first free wall spot, else the nearest free ground
      let ok = false;
      while (!ok && si < spots.length) ok = prop('anvil_stump', ...spots[si++]);
      for (let r = 2.6; !ok && r < 6; r += 0.5) for (let a = 0; !ok && a < TAU; a += 0.4) ok = prop('anvil_stump', b.cx + Math.cos(a) * r, b.cy + Math.sin(a) * r);
    }
    for (const n of shuffle(solid.filter((n) => b.name !== 'upgrade' || n !== 'anvil_stump'), rng)) while (si < spots.length && !prop(n, ...spots[si++]));
    for (const n of small.slice(0, 1)) if (si < spots.length) prop(n, ...spots[si++], { solid: false });
  }
  // yards: gardens, an orchard, a lumber camp by the trees, a paddock, old ruins
  const yard = (w, h, test) => {
    for (let tries = 0; tries < 150; tries++) {
      const x0 = rng.int(4, W - 4 - w), y0 = rng.int(4, H - 4 - h);
      let ok = true;
      for (let y = y0 - 1; y <= y0 + h && ok; y++) for (let x = x0 - 1; x <= x0 + w && ok; x++) if (!inb(x, y) || use[I(x, y)] !== 0 || keep[I(x, y)]) ok = false;
      if (!ok || (test && !test(x0, y0))) continue;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) use[I(x, y)] = 3;
      return [x0, y0];
    }
    return null;
  };
  const nearForest = (x0, y0) => { for (let d = 1; d < 4; d++) for (const [x, y] of [[x0 - d, y0], [x0, y0 - d], [x0 + 5 + d, y0], [x0, y0 + 4 + d]]) if (inb(x, y) && use[I(x, y)] === 4) return true; return false; };
  // Fence axes are distinct isometric projections. Flipping a single fence
  // sprite (the previous implementation) did NOT rotate it, breaking joins.
  const barrier = (style,axis,x,y,solid=true) => {
    if (!free(x,y,solid)) return false;
    props.push(isoBarrierProp(style,axis,x,y,k));
    if (solid) blockAt(x,y);
    return true;
  };
  const fenceX = (x0, x1, y) => { for(let x=x0;x<x1;x++) barrier('rail','x',x+.5,y); };
  const fenceY = (y0, y1, x) => { for(let y=y0;y<y1;y++) barrier('rail','y',x,y+.5); };
  const yards = shuffle(['garden', 'garden', 'orchard', 'lumber', 'paddock', 'ruins', 'garden', 'glade'], rng).slice(0, rng.int(3, 5));
  for (const kind of yards) {
    if (kind === 'garden') {
      const at = yard(rng.int(4, 6), rng.int(3, 5));
      if (!at) continue;
      const [x0, y0] = at, w = 4 + ((x0 + y0) % 3), h = 3 + (x0 % 2);
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) mat[I(x, y)] = (y - y0) % 2 ? 3 : 2; // furrows
      fenceX(x0, x0 + w, y0 - 0.05); fenceY(y0, y0 + h - 1, x0 - 0.05);
      for (let i = 0; i < 2; i++) prop(rng.pick(['vegetable_basket', 'wildflowers', 'water_bucket', 'hay_bale', 'grain_sacks']), x0 + R(0.5, w - 0.5), y0 + R(0.5, h - 0.5));
    } else if (kind === 'orchard') {
      const at = yard(7, 7);
      if (!at) continue;
      const [x0, y0] = at;
      for (let y = y0 + 1; y < y0 + 7; y += 2) for (let x = x0 + 1; x < x0 + 7; x += 2) prop(rng.pick(['t_orchard_pear', 't_young_apple', 't_orchard_pear']), x + R(-0.2, 0.2), y + R(-0.2, 0.2), { solid: true });
      for (let i = 0; i < 2; i++) prop(rng.pick(['wildflowers', 'vegetable_basket', 'leafy_shrub']), x0 + R(0, 7), y0 + R(0, 7), { solid: false });
    } else if (kind === 'lumber') {
      const at = yard(5, 4, nearForest) || yard(5, 4);
      if (!at) continue;
      const [x0, y0] = at;
      for (let y = y0; y < y0 + 4; y++) for (let x = x0; x < x0 + 5; x++) if (rng.chance(0.7)) mat[I(x, y)] = rng.chance(0.6) ? 2 : 1;
      for (const n of shuffle(['sawn_stump', 'axe_stump', 'firewood_stack', 'fallen_log', 'workbench', 'hollow_stump', 'firewood_stack'], rng)) prop(n, x0 + R(0.5, 4.5), y0 + R(0.5, 3.5));
    } else if (kind === 'paddock') {
      const st = buildings.find((b) => b.name === 'stables');
      let at = null;
      if (st) at = yard(5, 4, (x0, y0) => Math.hypot(x0 + 2.5 - st.cx, y0 + 2 - st.cy) < 8);
      at = at || yard(5, 4);
      if (!at) continue;
      const [x0, y0] = at;
      for (let y = y0; y < y0 + 4; y++) for (let x = x0; x < x0 + 5; x++) mat[I(x, y)] = rng.chance(0.65) ? 3 : 2;
      fenceX(x0, x0 + 5, y0 - 0.05); fenceY(y0, y0 + 3, x0 + 4.95);
      for (const n of ['hay_bale', 'horse_trough', 'handcart', 'hay_bale']) prop(n, x0 + R(0.6, 4.2), y0 + R(0.6, 3.4));
    } else if (kind === 'ruins') {
      const at = yard(5, 5);
      if (!at) continue;
      const [x0, y0] = at;
      for (let y = y0; y < y0 + 5; y++) for (let x = x0; x < x0 + 5; x++) if (rng.chance(0.45)) mat[I(x, y)] = rng.chance(0.5) ? 1 : 4;
      for (let x = x0; x < x0 + 5; x++) if (rng.chance(0.65)) barrier('stone','x',x + 0.5, y0 + 0.2);
      for (let y = y0 + 1; y < y0 + 5; y++) if (rng.chance(0.55)) barrier('stone','y',x0 + 0.2, y + 0.5);
      for (const n of ['tiles_and_bricks', 'broken_wheel', 'cart_debris', 'moss_boulder', 'fieldstone_cluster', 't_dead_oak']) if (rng.chance(0.7)) prop(n, x0 + R(1.2, 4.6), y0 + R(1.2, 4.6));
    } else if (kind === 'glade') {
      const at = yard(4, 4);
      if (!at) continue;
      const [x0, y0] = at;
      prop(rng.pick(['t_ancient_oak', 't_ancient_willow', 't_storm_deadwood']), x0 + 2, y0 + 2, { solid: true });
      for (let i = 0; i < 3; i++) prop(rng.pick(['wildflowers', 'mushrooms', 'leafy_shrub', 'fieldstone_cluster']), x0 + R(0, 4), y0 + R(0, 4));
    }
  }
  // lamps along the roads (none in the portal yard), and travellers' clutter on the verges
  const stand = tileset && tileset.scatter.find((e) => e.name === 'torch_stand');
  const verge = (x, y) => { const tx = Math.floor(x), ty = Math.floor(y); return street(tx, ty) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inb(tx + dx, ty + dy) && use[I(tx + dx, ty + dy)] !== 1); };
  let lamps = 0;
  for (const road of roads) for (let i = 6; i < road.length && lamps < 10; i += rng.int(10, 16)) {
    const [x, y] = road[i], a = rng.chance(0.5) ? 1 : -1, n = road[Math.min(road.length - 1, i + 1)], dir = Math.atan2(n[1] - y, n[0] - x) + a * Math.PI / 2;
    const lx = x + Math.cos(dir) * 1.6, ly = y + Math.sin(dir) * 1.6;
    if (!stand || Math.hypot(lx - portal.x, ly - portal.y) < 7 || Math.hypot(lx - breach.x, ly - breach.y) < 6 || !free(lx, ly, true)) continue;
    props.push({ kind: 'scatter', x: lx, y: ly, spr: stand, k: tileset.k, light: 4.5 });
    blockAt(lx, ly); lamps++;
  }
  const clutter = ['closed_barrel', 'water_barrel', 'crate_stack', 'rope_and_hook', 'handcart', 'broken_wheel', 'cart_debris', 'hay_bale', 'grain_sacks', 'firewood_stack', 'arrow_milestone'];
  for (let i = 0, n = 0; i < 200 && n < rng.int(3, 6); i++) {
    const road = rng.pick(roads), at = road[Math.floor(R(0, 1) * road.length)];
    if (!at) continue;
    const x = at[0] + R(-1.6, 1.6), y = at[1] + R(-1.6, 1.6);
    if (!verge(x, y) || Math.hypot(x - portal.x, y - portal.y) < 6 || Math.hypot(x - breach.x, y - breach.y) < 5 || Math.hypot(x - C.x, y - C.y) < 3) continue;
    if (prop(rng.pick(clutter), x, y)) n++;
  }
  // the forest: varied trees in the ragged band, and copses, single trees and brush on the open grass
  const pine = FOREST_TREES;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = I(x, y);
    if (use[i] !== 4) continue;
    map.block[i] = 1;
    const e = Math.min(x, y, W - 1 - x, H - 1 - y);
    if ((x * 7 + y * 13) % 3 === 0 || (e >= 1 && rng.chance(0.3))) props.push({ kind: 'scatter', x: x + 0.5 + R(-0.3, 0.3), y: y + 0.5 + R(-0.3, 0.3), spr: S(rng.chance(0.06) ? rng.pick(['t_dead_oak', 't_storm_deadwood', 't_dead_thorn']) : rng.pick(pine)), k, flip: rng.chance(0.5) });
  }
  const open = (x, y, r) => {
    for (let yy = Math.floor(y - r); yy <= Math.floor(y + r); yy++) for (let xx = Math.floor(x - r); xx <= Math.floor(x + r); xx++) if (!inb(xx, yy) || use[I(xx, yy)] !== 0 || keep[I(xx, yy)] || map.block[I(xx, yy)]) return false;
    return true;
  };
  const nearKey = (x, y, d) => npcs.some((n) => Math.hypot(n.x - x, n.y - y) < d) || Math.hypot(x - portal.x, y - portal.y) < d + 2 || Math.hypot(x - breach.x, y - breach.y) < d + 2 || Math.hypot(x - C.x, y - C.y) < 6;
  for (let c = rng.int(1, 2); c > 0; c--) { // copses
    const cx = R(6, W - 6), cy = R(6, H - 6);
    for (let i = 0; i < 6; i++) { const x = Math.floor(cx + R(-2, 2)) + 0.5, y = Math.floor(cy + R(-2, 2)) + 0.5; if (open(x, y, 0.6) && !nearKey(x, y, 2.5)) prop(rng.pick(pine), x, y, { solid: true }); }
  }
  for (let i = 0, n = 0; i < 500 && n < rng.int(5, 9); i++) {
    const x = Math.floor(R(4, W - 4)) + 0.5, y = Math.floor(R(4, H - 4)) + 0.5;
    if (!open(x, y, 1) || nearKey(x, y, 2.5)) continue;
    if (prop(rng.pick(TOWN_TREES), x, y, { solid: true })) n++;
  }
  const brush = ['leafy_shrub', 'thorn_bush', 'dry_reeds', 'wildflowers', 'wildflowers', 'wildflowers', 'mushrooms', 'moss_boulder', 'fieldstone_cluster', 'hollow_stump', 'fallen_log', 'sawn_stump'];
  for (let i = 0; i < 45; i++) {
    const x = R(3, W - 3), y = R(3, H - 3);
    if (!open(x, y, 0.4) || nearKey(x, y, 1.5)) continue;
    prop(rng.pick(brush), x, y);
  }

  // Keep the town pack's own readable props; the generic biome monuments
  // (rune stones, obelisks and idols) look out of place in a lived-in village.
  // ---- ground tiles: a tile beside a softer material takes the transition with that material on the shared side(s)
  makeTownTiles();
  const at = (x, y) => mat[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const m = at(x, y), sides = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
    let n = 99;
    for (const s of sides) if (s < m && s < n) n = s;
    let v = m;
    if (n < 99) {
      const [lu, hu, lv, hv] = sides.map((s) => s === n);
      const shape = lu && !hu && !lv && !hv ? 0 : hu && !lu && !lv && !hv ? 1 : lv && !hv && !lu && !hu ? 2 : hv && !lv && !lu && !hu ? 3
        : lu && lv && !hu && !hv ? 4 : hu && hv && !lu && !lv ? 5 : lu && hv && !hu && !lv ? 6 : hu && lv && !lu && !hv ? 7 : -1;
      const pi = TPAIRS.indexOf(MATS[n] + '__' + MATS[m]);
      // The pack has no opposite-edge/three-edge transition. Keep a narrow
      // lane's material in that case, rather than erasing it back to grass.
      v = shape < 0 || pi < 0 ? (use[I(x, y)] === 1 ? m : n) : 6 + pi * 8 + shape;
    }
    map.v[y*W+x]=v;
  }
  props.push(...torches);

  // ---- the start (by the well) and a reachability check from it
  let start = [C.x + 0.5, C.y + 3.5];
  for (let r = 0; r < 6 && !map.walkable(...start); r++) start = map.randomNear(C.x + 0.5, C.y + 2.5, 1.5 + r, rng.fn());
  const seen = new Uint8Array(N), q = [I(Math.floor(start[0]), Math.floor(start[1]))];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = I(x + dx, y + dy); if (map.walkableTile(x + dx, y + dy) && !seen[j]) { seen[j] = 1; q.push(j); } }
  }
  const reach = (x, y) => seen[I(Math.floor(x), Math.floor(y))];
  if (buildings.some((b) => !b.approach.length || b.approach.some(([x, y]) => !reach(x, y)))) {
    if (last) throw new Error('Could not connect every town entrance');
    return null;
  }
  if (!last && (npcs.length < VENDORS.length || !reach(portal.x, portal.y) || !reach(breach.x, breach.y) || npcs.some((n) => !reach(n.x, n.y)))) return null;
  // the Endgame's places (docs/ENDGAME.md): the Abyssal Rift gate on the breach yard's road, short of the purple portal,
  // and the Altar of Heresy at the plaza's edge; both on walkable, reachable, unbuilt ground
  const spot = (fx, fy, r0, r1) => {
    let best = null, bd = 99;
    for (let ty = Math.floor(fy - r1); ty <= fy + r1; ty++) for (let tx = Math.floor(fx - r1); tx <= fx + r1; tx++) {
      if (!inb(tx, ty) || !map.walkableTile(tx, ty) || !seen[I(tx, ty)] || use[I(tx, ty)] === 4) continue;
      const d = Math.hypot(tx + 0.5 - fx, ty + 0.5 - fy);
      if (d < r0 || d >= bd || npcs.some((n) => Math.hypot(n.x - tx - 0.5, n.y - ty - 0.5) < 2.5) || Math.hypot(tx + 0.5 - portal.x, ty + 0.5 - portal.y) < 3.5 || Math.hypot(tx + 0.5 - breach.x, ty + 0.5 - breach.y) < 2.6) continue;
      bd = d; best = { x: tx + 0.5, y: ty + 0.5 };
    }
    return best;
  };
  const toC = Math.atan2(C.y + 0.5 - breach.y, C.x + 0.5 - breach.x);
  const rift = spot(breach.x + Math.cos(toC) * 3.6, breach.y + Math.sin(toC) * 3.6, 0, 2.5) || spot(breach.x, breach.y, 2.7, 4.5);
  const altar = spot(C.x + 0.5 + Math.cos(aB + 1.3) * 5.5, C.y + 0.5 + Math.sin(aB + 1.3) * 5.5, 0, 3) || spot(C.x + 0.5, C.y + 0.5, 4, 7);
  return { map, buildings, npcs, props, torches, wallHangings, portal, breach, rift, altar, center: { x: C.x + 0.5, y: C.y + 0.5 }, start };
}

function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
