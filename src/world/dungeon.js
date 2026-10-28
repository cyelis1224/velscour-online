// Procedural dungeon generation: a maze of rooms laid out on a chunk grid.
import { TileMap } from './map.js';
import { RNG, clamp } from '../core/util.js';
import { ARCH } from '../data/enemies.js';
import { rollLooks } from '../data/bestiary.js';
import { isoBarrier } from '../gfx/isobarriers.js';
import { wallHangingAtWallSegment, wallHangingCount } from '../gfx/wallhangings.js';
import { CASTLE_KEEP_LAYOUTS } from '../data/castlekeeplayouts.js';
import { THEMES, TAGS, BIOME_ROOMS } from '../data/biomerooms.js';

const S = 11; // chunk size in tiles

// Level layouts (data/biomes.js `style`): the share of built rooms and caves (the rest are small rooms), the shapes a
// built room takes, how often a corridor is 3 wide, how many extra loops the maze gets, whether rooms fill their chunk
// (big) and whether corridors are ragged (rough).
const STYLES = {
  crypt: { room: 0.62, cave: 0.18, shapes: ['rect', 'rect', 'octagon', 'round', 'cross', 'pillars', 'cloister', 'octagon', 'pillars'], wide: 0.25, loops: 0.1 },
  hall: { room: 0.86, cave: 0, big: true, shapes: ['rect', 'pillars', 'pillars', 'cross', 'cloister', 'octagon', 'rect'], wide: 0.65, loops: 0.18 },
  cave: { room: 0.22, cave: 0.66, shapes: ['round', 'octagon', 'round', 'rect'], wide: 0.55, loops: 0.14, rough: true },
  maze: { room: 0.46, cave: 0.04, shapes: ['rect', 'cross', 'octagon', 'pillars', 'rect'], wide: 0.04, loops: 0.03 },
  channel: { room: 0.62, cave: 0.06, shapes: ['rect', 'pillars', 'cloister', 'rect', 'cross'], wide: 0.9, loops: 0.22 },
  ruin: { room: 0.52, cave: 0.3, shapes: ['octagon', 'cross', 'round', 'rect', 'pillars', 'cloister'], wide: 0.35, loops: 0.12, rough: true },
};

/** A level's deck of room themes for its biome (data/biomerooms.js): draws cycle through the shuffled list, built
 * rooms and cave chambers separately, so a level repeats no theme until it has shown them all. */
function themeDeck(biome, rng) {
  const all = BIOME_ROOMS[biome.id] || [];
  const decks = { built: [], cave: [] };
  return (cave) => {
    const k = cave ? 'cave' : 'built';
    if (!decks[k].length) decks[k] = shuffleWith(all.filter(([t]) => !!THEMES[t].cave === cave), rng);
    const e = decks[k].pop();
    return e ? { theme: e[0], title: e[1] } : null;
  };
}

function nextHangingDesign(rng, bag, count = 50) {
  if (!bag.length) {
    for (let i = 0; i < count; i++) bag.push(i);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return bag.pop();
}

/**
 * Torches and wall hangings for a level. Both go only on the room side of back walls (a front wall shows its
 * outer face to the camera), in the middle of a straight run at least three edges long (never at a corner), at
 * least two tiles from an arch or a door, and spaced apart: torches 3 tiles, hangings 2.5 tiles from any mount.
 * `torchRate(s)` / `hangRate` are the per-edge chances.
 */
function wallMounts(map, rng, biome, torchRate, hangRate, count) {
  const edges = new Set(map.segments.map((s) => s.dir + s.mx + ',' + s.my + (s.front ? 'f' : '')));
  const along = (s, d) => s.dir === 'f' ? s.dir + s.mx + ',' + (s.my + d) : s.dir + (s.mx + d) + ',' + s.my;
  const midRun = (s) => [-1, 1].every((d) => edges.has(along(s, d)));
  const gaps = map.walls.filter((w) => w.kind === 'arch' || w.kind === 'door');
  const clearOfGaps = (s) => gaps.every((g) => Math.abs(g.x - s.mx) + Math.abs(g.y - s.my) > 2.2);
  const spots = map.segments.filter((s) => !s.front && midRun(s) && clearOfGaps(s));
  const taken = [];
  const free = (s, d) => taken.every(([x, y]) => Math.hypot(x - s.mx, y - s.my) >= d);
  const torches = [], wallHangings = [], designs = [];
  for (const s of spots) {
    if (rng.next() > torchRate(s) || !free(s, 3)) continue;
    torches.push(torchAtWallSegment(s)); taken.push([s.mx, s.my]);
  }
  for (const s of spots) {
    if (rng.next() > hangRate || !free(s, 2.5)) continue;
    // cycle a shuffled catalog so a level repeats no motif until every design has appeared
    wallHangings.push(wallHangingAtWallSegment(s, nextHangingDesign(rng, designs, count))); taken.push([s.mx, s.my]);
  }
  return { torches, wallHangings };
}

/** Attach a torch to the true edge midpoint, not a freestanding prop.
 * The authored holder faces into the adjacent walkable side of the wall.
 * The light/particles are offset towards the cup, not the mounting plate.
 */
export function torchAtWallSegment(s) {
  const cupRight=s.dir==='f'?!s.front:s.front;
  const screenOffset=cupRight?18:-18;
  return {
    x:s.mx+screenOffset/64, y:s.my-screenOffset/64,
    mountX:s.mx, mountY:s.my, dir:s.dir, front:!!s.front,
    depth:s.depth+(s.front?0.57:-0.34), flameZ:60,
  };
}

/** Every fifth depth (but the throne at FINAL_DEPTH) ends in a BOSS ROOM with a raid boss (game/raid.js). */
import { isRaidDepth, FINAL_DEPTH, density } from '../data/depth.js';
import { throneSprite, THRONE_ART } from '../gfx/velscourthrone.js';
export { isRaidDepth };

// the boss room: an arena east of the maze, reached by a corridor from its far end
const ARENA_W = 30, ARENA_H = 26, ARENA_GAP = 6;

/** Build one of Castle Keep's authored room/corridor configurations. */
function generateCastleKeepLayout(depth, biome, tileset, seed, layout) {
  const rng = new RNG(seed), W = layout.width, H = layout.height;
  const map = new TileMap(W, H);
  const carve = (x, y, w, h) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++)
      if (xx > 0 && yy > 0 && xx < W - 1 && yy < H - 1) map.t[yy * W + xx] = 1;
  };
  const rooms = layout.rooms.map((r, idx) => ({ ...r, idx, type: 'room',
    mx: r.x + r.w / 2, my: r.y + r.h / 2 }));
  for (const r of rooms) carve(r.x, r.y, r.w, r.h);
  for (const [x, y, w, h] of layout.corridors) carve(x, y, w, h);
  const nearestRoom = (point) => rooms.reduce((best, r) => {
    const distance = Math.hypot(r.mx - point[0], r.my - point[1]);
    return !best || distance < best.distance ? { room: r, distance } : best;
  }, null).room;
  const startRoom = nearestRoom(layout.start), guardianRoom = nearestRoom(layout.guardian);
  // the keep's own room themes (throne room, armory, barracks...: data/biomerooms.js)
  const nextTheme = themeDeck(biome, rng);
  for (const r of rooms) if (r !== startRoom && Math.min(r.w, r.h) >= 5) Object.assign(r, nextTheme(false));
  const exitRoom = guardianRoom;
  if (!map.walkable(layout.start[0], layout.start[1]) ||
      !map.walkable(layout.guardian[0], layout.guardian[1]) ||
      !map.walkable(layout.exit[0], layout.exit[1]))
    throw new Error(`Castle Keep layout has a marker outside its floor: ${layout.id}`);

  finishMap(map, tileset, rng, null, rooms);
  const eligibleRooms = rooms.filter((r) => r !== startRoom && r !== guardianRoom && r.w * r.h >= 16);
  const props = placeObstacles(map, eligibleRooms, tileset, rng, startRoom);
  const looks = rollLooks(biome, () => rng.next()), roster = biome.roster;
  const pickArch = () => roster[Math.floor(Math.pow(rng.next(), 1.35) * roster.length)];
  const roomSpot = (r) => {
    for (let i = 0; i < 30; i++) {
      const x = r.x + rng.range(0.6, r.w - 0.6), y = r.y + rng.range(0.6, r.h - 0.6);
      if (map.walkable(x, y)) return [x, y];
    }
    return [r.mx, r.my];
  };
  const spawns = [], packRooms = eligibleRooms.length ? eligibleRooms : [guardianRoom];
  for (const r of packRooms) {
    const [x, y] = roomSpot(r), arch = pickArch(), A = ARCH[arch];
    spawns.push({ x, y, arch, n: rng.int(A.pack[0], A.pack[1]), rank: 'normal', look: looks.pick(arch) });
  }
  const nonGuard = rooms.filter((r) => r !== startRoom && r !== guardianRoom);
  const champs = 1 + Math.floor(Math.min(depth, 120) / 18);
  for (let i = 0; i < champs; i++) {
    const r = rng.pick(nonGuard.length ? nonGuard : packRooms), [x, y] = roomSpot(r), arch = pickArch();
    spawns.push({ x, y, arch, n: rng.int(2, 4), rank: 'champion', look: looks.pick(arch) });
  }
  const uniques = 1 + Math.floor(Math.min(depth, 120) / 35);
  for (let i = 0; i < uniques; i++) {
    const r = rng.pick(nonGuard.length ? nonGuard : packRooms), [x, y] = roomSpot(r), arch = pickArch();
    spawns.push({ x, y, arch, n: rng.int(2, 3), rank: 'unique', look: looks.pick(arch) });
  }
  const guardian = looks.boss(roster);
  spawns.push(guardian
    ? { x: layout.guardian[0], y: layout.guardian[1], n: 1, rank: 'boss', arch: guardian.arch, look: guardian.look }
    : { x: layout.guardian[0], y: layout.guardian[1], n: 1, rank: 'boss', arch: pickArch() });

  const chests = [], chestRooms = nonGuard.length ? shuffleWith(nonGuard.slice(), rng) : [];
  const chestCount = Math.min(2, Math.max(1, Math.floor(chestRooms.length / 3)));
  for (const r of chestRooms.slice(0, chestCount)) chests.push({ x: r.mx, y: r.my, rare: rng.chance(0.15) });
  const { torches, wallHangings } = wallMounts(map, rng, biome, () => 0.35, 0.3, wallHangingCount(biome));
  return {
    map, rooms, spawns, props, chests, torches, wallHangings, looks,
    start: layout.start.slice(), exit: layout.exit.slice(), bossRoom: guardianRoom,
    raid: null, layoutId: layout.id, layoutName: layout.name,
  };
}

/** opts.raid: a BOSS ROOM arena whatever the depth; opts.small: a 4 x 4 chunk maze (Abyssal Rifts, docs/ENDGAME.md). */
export function generateDungeon(depth, biome, tileset, seed, opts = {}) {
  if (depth === FINAL_DEPTH || biome.id === 'throne') return generateThrone(biome, tileset, seed); // the throne at any depth: "final boss" practice
  const raid = opts.raid ?? isRaidDepth(depth);
  if (biome.id === 'castle_keep' && !raid) {
    const layout = CASTLE_KEEP_LAYOUTS[Math.abs((depth - 1) % CASTLE_KEEP_LAYOUTS.length)];
    return generateCastleKeepLayout(depth, biome, tileset, seed, layout);
  }
  const rng = new RNG(seed);
  // a raid level's maze is a little smaller: the boss fight takes the time
  const style = STYLES[biome.style] || STYLES.crypt, nextTheme = themeDeck(biome, rng);
  const CW = opts.small ? 4 : clamp(4 + Math.floor(depth / 14) + rng.int(0, 1) - (raid ? 1 : 0), 4, 8);
  const CH = opts.small ? 4 : clamp(4 + Math.floor(depth / 18) + rng.int(0, 1), 4, 7);
  const W = CW * S + 2 + (raid ? ARENA_GAP + ARENA_W + 2 : 0), H = Math.max(CH * S + 2, raid ? ARENA_H + 6 : 0);
  const map = new TileMap(W, H);
  const ci = (x, y) => y * CW + x;

  // ---- maze over chunks (randomised DFS) + a few loops
  const conn = new Set();
  const ek = (a, b) => (a < b ? a + ',' + b : b + ',' + a);
  const start = { x: 0, y: rng.int(0, CH - 1) };
  if (rng.chance(0.5) && !raid) { start.x = rng.int(0, CW - 1); start.y = rng.chance(0.5) ? 0 : CH - 1; }
  const seen = new Uint8Array(CW * CH);
  const stack = [start];
  seen[ci(start.x, start.y)] = 1;
  while (stack.length) {
    const c = stack[stack.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy }))
      .filter((n) => n.x >= 0 && n.y >= 0 && n.x < CW && n.y < CH && !seen[ci(n.x, n.y)]);
    if (!nb.length) { stack.pop(); continue; }
    const n = rng.pick(nb);
    seen[ci(n.x, n.y)] = 1;
    conn.add(ek(ci(c.x, c.y), ci(n.x, n.y)));
    stack.push(n);
  }
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      if (x + 1 < CW && rng.chance(style.loops)) conn.add(ek(ci(x, y), ci(x + 1, y)));
      if (y + 1 < CH && rng.chance(style.loops)) conn.add(ek(ci(x, y), ci(x, y + 1)));
    }
  }
  const adj = Array.from({ length: CW * CH }, () => []);
  for (const k of conn) { const [a, b] = k.split(',').map(Number); adj[a].push(b); adj[b].push(a); }

  // ---- rooms
  const carve = (x, y) => { if (x > 0 && y > 0 && x < W - 1 && y < H - 1) map.t[y * W + x] = 1; };
  const rooms = [], holesBy = new Map();
  for (let cy = 0; cy < CH; cy++) {
    for (let cx = 0; cx < CW; cx++) {
      const ox = cx * S + 1, oy = cy * S + 1;
      const isStart = cx === start.x && cy === start.y;
      const roll = rng.next();
      let type = roll < style.room ? 'room' : roll < style.room + style.cave ? 'cave' : 'small';
      if (isStart) type = 'room';
      let rw, rh, rx, ry, shape = 'rect';
      const holes = [];
      if (type === 'small') { rw = rng.int(3, 4); rh = rng.int(3, 4); }
      else if (style.big && type === 'room') { rw = rng.int(7, S - 2); rh = rng.int(7, S - 2); }
      else { rw = rng.int(5, S - 2); rh = rng.int(5, S - 2); }
      // the room's theme (an ossuary, an armory...): built rooms of 5 x 5 and up and cave chambers, never the start
      const th = isStart || type === 'small' || (type === 'room' && Math.min(rw, rh) < 5) ? null : nextTheme(type === 'cave');
      rx = ox + rng.int(1, S - rw - 1); ry = oy + rng.int(1, S - rh - 1);
      if (type === 'cave') {
        const ccx = ox + S / 2, ccy = oy + S / 2;
        const blobs = rng.int(3, 6);
        for (let b = 0; b < blobs; b++) {
          const bx = ccx + rng.range(-2.5, 2.5), by = ccy + rng.range(-2.5, 2.5), br = rng.range(1.8, 3.4);
          for (let y = Math.floor(by - br); y <= by + br; y++) for (let x = Math.floor(bx - br); x <= bx + br; x++) {
            if ((x + 0.5 - bx) ** 2 + (y + 0.5 - by) ** 2 <= br * br && x > ox && y > oy && x < ox + S - 1 && y < oy + S - 1) carve(x, y);
          }
        }
        rx = Math.floor(ccx - 2); ry = Math.floor(ccy - 2); rw = 4; rh = 4;
        for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) carve(x, y);
      } else if (type === 'room' && !isStart && rw >= 7 && rh >= 7) {
        // shaped rooms: chamfered, round, cross, pillared halls and cloisters (holes are stamped after the corridors)
        const want = th && THEMES[th.theme].shapes;
        shape = rng.pick(want && rng.chance(0.8) ? want : style.shapes);
        const cc = Math.min(rw, rh) >= 9 ? 3 : 2, mx = rx + rw / 2, my = ry + rh / 2;
        for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) {
          const ex = Math.min(x - rx, rx + rw - 1 - x), ey = Math.min(y - ry, ry + rh - 1 - y);
          if (shape === 'octagon' && ex + ey < cc) continue;
          if (shape === 'round' && ((x + 0.5 - mx) / (rw / 2)) ** 2 + ((y + 0.5 - my) / (rh / 2)) ** 2 > 1.02) continue;
          if (shape === 'cross' && ex < Math.floor(rw / 4) && ey < Math.floor(rh / 4)) continue;
          carve(x, y);
        }
        if (shape === 'pillars' && rw >= 8 && rh >= 8) for (const [px, py] of [[rx + 2, ry + 2], [rx + rw - 4, ry + 2], [rx + 2, ry + rh - 4], [rx + rw - 4, ry + rh - 4]]) holes.push([px, py, 2, 2]);
        else if (shape === 'cloister' && rw >= 8 && rh >= 8) holes.push([rx + 3, ry + 3, rw - 6, rh - 6]);
        else if (shape === 'pillars' || shape === 'cloister') shape = 'octagon';
        if (holes.length) holesBy.set(ci(cx, cy), holes);
      } else {
        for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) carve(x, y);
      }
      rooms.push({ cx, cy, x: rx, y: ry, w: rw, h: rh, type: shape === 'round' ? 'round' : type, shape, mx: rx + rw / 2, my: ry + rh / 2, idx: ci(cx, cy), ...th });
    }
  }

  // ---- corridors along maze edges
  for (const k of conn) {
    const [a, b] = k.split(',').map(Number);
    const A = rooms[a], B = rooms[b];
    const wid = rng.chance(style.wide) ? 3 : 2;
    const ax = Math.floor(A.mx), ay = Math.floor(A.my), bx = Math.floor(B.mx), by = Math.floor(B.my);
    const horizFirst = rng.chance(0.5);
    // rough styles (caves, ruins) bulge their passages here and there
    const lo = wid > 2 ? -2 : -1, hi = wid > 2 ? 2 : 2;
    const bulge = (x, y, dx, dy) => { if (style.rough && rng.chance(0.3)) carve(x + dx, y + dy); };
    const hline = (x0, x1, y) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { for (let w = 0; w < wid; w++) carve(x, y + w - (wid > 2 ? 1 : 0)); bulge(x, y, 0, rng.chance(0.5) ? hi : lo); } };
    const vline = (y0, y1, x) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) { for (let w = 0; w < wid; w++) carve(x + w - (wid > 2 ? 1 : 0), y); bulge(x, y, rng.chance(0.5) ? hi : lo, 0); } };
    if (horizFirst) { hline(ax, bx, ay); vline(ay, by, bx); } else { vline(ay, by, ax); hline(ax, bx, by); }
  }

  // ---- distances: exit = farthest chunk from start
  const dist = new Int16Array(CW * CH).fill(-1);
  const q = [ci(start.x, start.y)]; dist[q[0]] = 0;
  while (q.length) { const c = q.shift(); for (const n of adj[c]) if (dist[n] < 0) { dist[n] = dist[c] + 1; q.push(n); } }
  let exitIdx = raid ? ci(CW - 1, 0) : 0;
  for (let i = 0; i < dist.length; i++) if (dist[i] > dist[exitIdx] && (!raid || i % CW === CW - 1)) exitIdx = i;
  const startRoom = rooms[ci(start.x, start.y)];
  const exitRoom = rooms[exitIdx];
  const arena = raid ? carveArena(map, exitRoom, CW, rng) : null;
  // make sure the boss arena is roomy
  if (!raid && (exitRoom.type !== 'room' || exitRoom.w < 7 || exitRoom.h < 7)) {
    const ox = exitRoom.cx * S + 1, oy = exitRoom.cy * S + 1;
    exitRoom.x = ox + 1; exitRoom.y = oy + 1; exitRoom.w = S - 3; exitRoom.h = S - 3; exitRoom.type = 'room';
    exitRoom.mx = exitRoom.x + exitRoom.w / 2; exitRoom.my = exitRoom.y + exitRoom.h / 2;
    for (let y = exitRoom.y; y < exitRoom.y + exitRoom.h; y++) for (let x = exitRoom.x; x < exitRoom.x + exitRoom.w; x++) carve(x, y);
  }

  // pillars and cloister courts: void blocks inside shaped rooms become real walls (cover, sight lines)
  for (const [idx, hs] of holesBy) {
    const r = rooms[idx];
    if (r === startRoom || r === exitRoom || r.type !== 'room') continue;
    for (const [hx, hy, hw, hh] of hs) for (let y = hy; y < hy + hh; y++) for (let x = hx; x < hx + hw; x++) map.t[y * W + x] = 0;
    r.holes = hs;
  }

  // a mixed level (assets.js mixedTileSet) paves its far chunks, and a few others, with the second biome's floors
  let region = null;
  if (tileset.split) {
    let far = 0;
    for (let i = 0; i < dist.length; i++) far = Math.max(far, dist[i]);
    const alt = new Uint8Array(CW * CH);
    for (let i = 0; i < alt.length; i++) alt[i] = i !== ci(start.x, start.y) && (dist[i] > far * 0.45) !== rng.chance(0.2) ? 1 : 0;
    region = (i) => alt[ci(clamp(Math.floor((i % W - 1) / S), 0, CW - 1), clamp(Math.floor((Math.floor(i / W) - 1) / S), 0, CH - 1))];
  }
  finishMap(map, tileset, rng, region, arena ? [...rooms, arena] : rooms, arena ? [arena.arch] : []);
  // the guardian's room keeps its floor and the exit clear: only its theme's walls and head
  if (!raid) { exitRoom.guardian = true; exitRoom.keep = exitPos(map, exitRoom, startRoom); }
  const obstacles = placeObstacles(map, rooms.filter((r) => r !== startRoom && (raid || r !== exitRoom || r.theme)), tileset, rng, startRoom);

  // ---- spawns
  const spawns = [];
  const roster = biome.roster;
  const rnd = () => rng.next();
  const looks = rollLooks(biome, rnd); // this level's bestiary: which art and palette swap each archetype gets
  const dens = density(depth) * (opts.density || 1); // opts.density: Abyssal Rifts thin the packs (data/rifts.js RIFT_DENSITY)
  const pickArch = () => {
    // earlier roster entries are a bit more common
    const i = Math.floor(Math.pow(rng.next(), 1.35) * roster.length);
    return roster[i];
  };
  const roomFloorSpot = (r) => {
    for (let i = 0; i < 30; i++) {
      const x = r.x + rng.range(0.6, r.w - 0.6), y = r.y + rng.range(0.6, r.h - 0.6);
      if (map.walkable(x, y)) return [x, y];
    }
    return [r.mx, r.my];
  };
  const packRooms = rooms.filter((r) => r !== startRoom && dist[r.idx] >= 0);
  for (const r of packRooms) {
    const area = r.type === 'cave' ? 28 : r.w * r.h;
    let packs = Math.max(r === exitRoom && !raid ? 0 : 1, Math.round((area / 26) * dens * rng.range(0.7, 1.3)));
    if (r.type === 'small') packs = rng.chance(0.5) ? 1 : 0;
    for (let p = 0; p < packs; p++) {
      const arch = pickArch();
      const A = ARCH[arch];
      const [px, py] = roomFloorSpot(r);
      const n = rng.int(A.pack[0], A.pack[1]) + (depth > 30 && rng.chance(0.4) ? 1 : 0);
      spawns.push({ x: px, y: py, arch, n, rank: 'normal', look: looks.pick(arch) });
    }
  }
  // elites
  const champs = 2 + Math.floor(Math.min(depth, 150) / 25), uniques = 1 + Math.floor(Math.min(depth, 150) / 45);
  for (let i = 0; i < champs; i++) {
    const r = rng.pick(packRooms.filter((x) => x !== exitRoom)) || exitRoom;
    const [px, py] = roomFloorSpot(r);
    const arch = pickArch();
    spawns.push({ x: px, y: py, arch, n: rng.int(2, 4), rank: 'champion', look: looks.pick(arch) });
  }
  for (let i = 0; i < uniques; i++) {
    const r = rng.pick(packRooms.filter((x) => x !== exitRoom)) || exitRoom;
    const [px, py] = roomFloorSpot(r);
    const arch = pickArch();
    spawns.push({ x: px, y: py, arch, n: rng.int(3, 5), rank: 'unique', look: looks.pick(arch) });
  }
  // the guardian of the exit, or the raid boss in its arena (game/raid.js picks which)
  const guardian = looks.boss(roster);
  if (arena) spawns.push({ x: arena.cx + 4, y: arena.cy, n: 1, rank: 'raid' });
  else if (guardian) spawns.push({ x: exitRoom.mx, y: exitRoom.my, arch: guardian.arch, n: 1, rank: 'boss', look: guardian.look });
  else spawns.push({ x: exitRoom.mx, y: exitRoom.my, arch: rng.pick(roster.filter((a) => !['bat', 'spider', 'beetle'].includes(a))), n: 1, rank: 'boss' });

  // ---- props, chests, torches
  const props = obstacles;
  if (!tileset.scatter.length) {
    for (const r of rooms) { // placeholder pixel-art decor when the biome has no scatter art
      if (r === startRoom || r === exitRoom || !rng.chance(0.35)) continue;
      const [px, py] = roomFloorSpot(r);
      props.push({ kind: 'decor', x: px, y: py, sprite: rng.pick(['grave', 'rock', 'barrel', 'crate', 'rock']), seed: rng.int(0, 9999) });
    }
  }
  const chests = [];
  const deadEnds = rooms.filter((r) => adj[r.idx].length === 1 && r !== startRoom && r !== exitRoom);
  const nChests = rng.int(1, 3);
  for (let i = 0; i < nChests; i++) {
    const r = deadEnds.length ? deadEnds.splice(rng.int(0, deadEnds.length - 1), 1)[0] : rng.pick(packRooms);
    if (!r) break;
    const [chx, chy] = map.walkable(r.mx, r.my) ? [Math.floor(r.mx) + 0.5, Math.floor(r.my) + 0.5] : roomFloorSpot(r);
    chests.push({ x: chx, y: chy, rare: rng.chance(0.2) });
  }
  const inArena = (s) => arena && s.mx >= arena.x - 0.5 && s.mx <= arena.x + arena.w + 0.5 && s.my >= arena.y - 0.5 && s.my <= arena.y + arena.h + 0.5;
  // the rate counts only the edges that may hold a mount (about half of them)
  const { torches, wallHangings } = wallMounts(map, rng, biome, (s) => inArena(s) ? 0.45 : 0.16, 0.2, wallHangingCount(biome));

  return {
      map, rooms, spawns, props, chests, torches, wallHangings, looks,
    start: [startRoom.mx, startRoom.my],
    exit: arena ? [arena.x + arena.w - 2.5, arena.cy] : exitRoom.keep || exitPos(map, exitRoom, startRoom),
    bossRoom: arena || exitRoom,
    raid: arena,
  };
}

/**
 * The BOSS ROOM: a chamfered ARENA_W x ARENA_H hall east of the maze with four 2x2 stone pillars (real walls, so
 * they block sight and shots: cover from the boss's cataclysm), reached by a 3-wide corridor from the far room of
 * the maze's last column, under an arch. Returns the arena {x, y, w, h, cx, cy, gate, pillars, arch}.
 */
function carveArena(map, from, CW, rng) {
  const W = map.w, H = map.h;
  const set = (x, y, v) => { if (x > 0 && y > 0 && x < W - 1 && y < H - 1) map.t[y * W + x] = v; };
  const ax = CW * S + 1 + ARENA_GAP, ay = clamp(Math.round(from.my - ARENA_H / 2), 2, H - ARENA_H - 2);
  const cut = 5;
  for (let y = 0; y < ARENA_H; y++) {
    for (let x = 0; x < ARENA_W; x++) {
      const ex = Math.min(x, ARENA_W - 1 - x), ey = Math.min(y, ARENA_H - 1 - y);
      if (ex + ey >= cut) set(ax + x, ay + y, 1);
    }
  }
  const cx = ax + ARENA_W / 2, cy = ay + ARENA_H / 2;
  const pillars = [];
  for (const [dx, dy] of [[-7, -5], [7, -5], [-7, 5], [7, 5]]) {
    const px = Math.floor(cx + dx) - 1, py = Math.floor(cy + dy) - 1;
    for (let y = py; y < py + 2; y++) for (let x = px; x < px + 2; x++) set(x, y, 0);
    pillars.push([px + 1, py + 1]);
  }
  // corridor: east out of the room, down the gap to the arena's middle rows, east into the arena
  const gy = clamp(Math.floor(from.my), ay + cut + 2, ay + ARENA_H - cut - 3);
  const fx = Math.floor(from.mx), fy = Math.floor(from.my), mx = CW * S + 3;
  for (let x = fx; x <= mx + 1; x++) for (let w = -1; w <= 1; w++) set(x, fy + w, 1);
  for (let y = Math.min(fy, gy) - 1; y <= Math.max(fy, gy) + 1; y++) for (let w = -1; w <= 1; w++) set(mx + w, y, 1);
  for (let x = mx; x < ax; x++) for (let w = -1; w <= 1; w++) set(x, gy + w, 1);
  const arch = { axis: 'y', line: ax, a0: gy - 1, a1: gy + 2, kind: 'arch', design: null, flip: rng.chance(0.5) };
  return { type: 'arena', x: ax, y: ay, w: ARENA_W, h: ARENA_H, cx, cy, mx: cx, my: cy, pillars, arch, gate: { x: ax, y0: gy - 1, y1: gy + 1 } };
}

/**
 * Scatter terrain from the biome pack. Objects go mostly against walls, some in the open, never next to a corridor
 * mouth or in the room centre (chests), and any blocking placement that would cut a part of the level off from the
 * start is undone. Every prop takes one tile (the pack's footprints are all under one tile); walk-over props
 * (bones, candles, chains...) don't block.
 */
function placeObstacles(map, rooms, tileset, rng, startRoom) {
  const props = [];
  const scat = tileset.scatter;
  if (!scat.length) return props;
  const W = map.w;
  const sx = Math.floor(startRoom.mx), sy = Math.floor(startRoom.my);
  const reachable = () => {
    const seen = new Uint8Array(map.t.length), q = [sy * W + sx];
    seen[q[0]] = 1;
    let n = 0;
    while (q.length) {
      const i = q.pop(); n++;
      const x = i % W, y = (i / W) | 0;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        const jx = j % W, jy = (j / W) | 0;
        if (Math.abs(jx - x) + Math.abs(jy - y) === 1 && !seen[j] && map.walkableTile(jx, jy)) { seen[j] = 1; q.push(j); }
      }
    }
    return n;
  };
  let open = reachable();
  const used = new Set();
  const tryBlock = (x, y) => {
    if (!map.walkableTile(x, y)) return false;
    map.block[y * W + x] = 1;
    if (reachable() === open - 1) { open--; return true; }
    map.block[y * W + x] = 0;
    return false;
  };
  const voidAround = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !map.tile(x + dx, y + dy)).length;
  // a level shows a dozen or so of the pack's props, so rooms look furnished rather than random
  const pool = shuffleWith(scat.slice(), rng).slice(0, rng.int(10, 16));
  for (const r0 of rooms) {
    // a cave chamber spreads over its whole chunk, not just the core it was grown from
    const r = r0.type === 'cave' && r0.cx !== undefined ? { ...r0, x: r0.cx * S + 2, y: r0.cy * S + 2, w: S - 2, h: S - 2 } : r0;
    const inRoom = (x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
    // keep corridor mouths clear: no blocker within two tiles of a floor tile outside the room
    const nearDoor = (x, y) => {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (map.tile(x + dx, y + dy) && !inRoom(x + dx, y + dy)) return true;
      return false;
    };
    // ...and the room centre, where loot chests go
    const ok = (x, y) => inRoom(x, y) && !(r.keep && Math.hypot(x + 0.5 - r.keep[0], y + 0.5 - r.keep[1]) < 2) && map.walkableTile(x, y) && !nearDoor(x, y) && !used.has(y * W + x)
      && (Math.abs(x - Math.floor(r.mx)) > 1 || Math.abs(y - Math.floor(r.my)) > 1);
    const cells = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (ok(x, y)) cells.push([x, y]);
    if (!cells.length) continue;
    const edge = cells.filter(([x, y]) => voidAround(x, y)), mid = cells.filter(([x, y]) => !voidAround(x, y));
    // set pieces: some rooms are dressed to a plan, the rest get loose clutter
    const blockers = pool.filter((e) => e.block && !/_barricade_|_fence_|_boundary_|railing|palisade/.test(e.name)), clutter = pool.filter((e) => !e.block);
    const lit = scat.filter((e) => LIT[e.name]);
    const put = (x, y, e, jit = 0) => {
      if (!e || !ok(x, y)) return false;
      if (e.block && !tryBlock(x, y)) return false;
      used.add(y * W + x);
      props.push({ kind: 'scatter', x: x + 0.5 + (jit ? rng.range(-jit, jit) : 0), y: y + 0.5 + (jit ? rng.range(-jit, jit) : 0), spr: e, k: tileset.k, flip: rng.chance(0.5), light: LIT[e.name] });
      return true;
    };
    const cx = Math.floor(r.mx), cy = Math.floor(r.my);
    const plan = r.theme && THEMES[r.theme] ? 'themed' : r.w >= 6 && r.h >= 6 && rng.chance(0.55) ? rng.pick(['nave', 'shrine', 'rows', 'rubble', 'ring']) : null;
    r0.plan = plan;
    if (plan === 'themed') furnishRoom(r, THEMES[r.theme], { scat, rng, put, ok, cells, edge, cx, cy, map, outer: !!r0.guardian });
    if (r0.guardian) continue;
    else if (plan === 'nave' && blockers.length) {
      // two colonnades of one prop down the long axis, a clear aisle between
      const e = rng.pick(blockers), alongX = r.w >= r.h;
      for (let a = 1; a < (alongX ? r.w : r.h) - 1; a += 2) for (const side of [1, -2]) {
        const off = side > 0 ? 1 : (alongX ? r.h : r.w) + side;
        put(alongX ? r.x + a : r.x + off, alongX ? r.y + off : r.y + a, e);
      }
    } else if (plan === 'shrine') {
      // a burning centrepiece just off centre, ringed by clutter and candles
      const e = rng.pick(lit.length ? lit : blockers.length ? blockers : clutter), c = rng.pick(clutter.length ? clutter : pool);
      const ax = cx + (rng.chance(0.5) ? 2 : -2), ay = cy + (rng.chance(0.5) ? 2 : -2);
      put(ax, ay, e);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) if (rng.chance(0.7)) put(ax + dx, ay + dy, rng.chance(0.5) && lit.length ? rng.pick(lit.filter((l) => !l.block).concat(c)) : c, 0.2);
    } else if (plan === 'rows' && blockers.length) {
      // graves, pews or crates in neat rows filling one half of the room
      const e = rng.pick(blockers), half = rng.chance(0.5);
      for (let y = r.y + 1; y < r.y + r.h - 1; y += 2) for (let x = r.x + 1; x < r.x + r.w - 1; x += 2) if ((x < cx) === half) put(x, y, e);
    } else if (plan === 'rubble' && clutter.length) {
      // collapsed corners: dense drifts of walk-over debris
      for (let k = 0; k < 3; k++) {
        const [bx, by] = rng.pick(edge.length ? edge : cells), e = rng.pick(clutter);
        for (let j = 0; j < 5; j++) put(bx + rng.int(-1, 1), by + rng.int(-1, 1), rng.chance(0.7) ? e : rng.pick(clutter), 0.3);
      }
    } else if (plan === 'ring') {
      // a ring of props around the room's heart (blockers spaced so it stays open)
      const e = rng.pick(lit.length && rng.chance(0.5) ? lit : blockers.length ? blockers : pool), rad = Math.min(r.w, r.h) / 2 - 1.5;
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; put(Math.floor(r.mx + Math.cos(a) * rad), Math.floor(r.my + Math.sin(a) * rad), e); }
    }
    const n = Math.round((cells.length / (plan ? 14 : 7)) * rng.range(0.7, 1.3));
    for (let i = 0, tries = 0; i < n && tries < n * 6; tries++) {
      const cs = edge.length && (rng.chance(0.65) || !mid.length) ? edge : mid;
      const [x, y] = rng.pick(cs);
      const e = rng.pick(pool);
      if (!ok(x, y)) continue;
      if (e.block && !tryBlock(x, y)) continue;
      used.add(y * W + x);
      const j = e.block ? 0.08 : 0.25; // walk-over clutter can sit anywhere in its tile
      const fence=/_barricade_|_fence_|_boundary_|railing|palisade/.test(e.name);
      // A mirrored rail can never become the other projected tile axis.
      // Barricades are now complete 1-tile X/Y isometric edge segments.
      const axis = voidAround(x,y) && !map.tile(x,y-1) ? 'x'
        : voidAround(x,y) && !map.tile(x-1,y) ? 'y'
        : rng.chance(.5)?'x':'y';
      const style=tileset.pack.includes('ice')?'crystal':
        tileset.pack.includes('heaven')?'heavenly':
        tileset.pack.includes('hell')?'hell':
        tileset.pack.includes('astral')?'astral':'stone';
      const spr=fence?isoBarrier(style,axis):e;
      props.push({kind:'scatter',x:x+.5+(fence?0:rng.range(-j,j)),
        y:y+.5+(fence?0:rng.range(-j,j)),spr,k:tileset.k,
        flip:fence?false:rng.chance(.5),light:LIT[e.name]});
      i++;
    }
  }
  return props;
}

/** The props of a tag (data/biomerooms.js TAGS) in this tile set; 'light' is everything that burns. */
function tagged(scat, tag) {
  return tag === 'light' ? scat.filter((e) => LIT[e.name]) : scat.filter((e) => TAGS[tag] && TAGS[tag].test(e.name));
}

/**
 * Furnish a themed room by its recipe (data/biomerooms.js THEMES): a throne or altar at the head of the room (the far
 * end of its long axis, as seen from the camera), braziers flanking it, rows of pews or graves with an aisle down the
 * middle, colonnades, props along the walls, in the corners or in a ring, and loose clutter. A step whose tag has no
 * prop in this biome is skipped. Each step keeps to one prop of its tag so a room reads as a set.
 */
function furnishRoom(r, theme, { scat, rng, put, ok, cells, edge, cx, cy, outer }) {
  const alongX = r.w >= r.h, len = alongX ? r.w : r.h, wid = alongX ? r.h : r.w;
  // (a, b) -> tile: a along the long axis from the head, b across it from the centre line
  const at = (a, b) => alongX ? [r.x + a, cy + b] : [cx + b, r.y + a];
  // 'a|b': the first tag with props in this biome
  const pick = (tags) => { for (const tag of tags.split('|')) { const l = tagged(scat, tag); if (l.length) return rng.pick(l); } return null; };
  const place = (a, b, e, jit = 0) => { const [x, y] = at(a, b); return put(x, y, e, jit); };
  for (const [kind, tag, n] of theme.steps) {
    if (outer && !['head', 'pairs', 'walls', 'corners'].includes(kind)) continue;
    const e = pick(tag);
    if (!e) continue;
    if (kind === 'head') { for (const b of [0, -1, 1]) if (place(1, b, e)) break; }
    else if (kind === 'pairs') { const h = Math.max(2, Math.floor(wid / 2) - 1); place(1, -h, e); place(1, h, e); }
    else if (kind === 'rows') {
      const h = Math.floor(wid / 2) - 1;
      for (let a = 3; a < len - 1; a += 2) for (let b = -h; b <= h; b++) if (Math.abs(b) >= 1) place(a, b, e);
    } else if (kind === 'aisle') {
      const h = Math.max(1, Math.floor(wid / 2) - 1);
      for (let a = 2; a < len - 1; a += 2) { place(a, -h, e); place(a, h, e); }
    } else if (kind === 'walls') {
      const spots = shuffleWith(edge.slice(), rng);
      let k = 0;
      for (const [x, y] of spots) { if (k >= n) break; if (put(x, y, k % 2 && rng.chance(0.4) ? pick(tag) || e : e)) k++; }
    } else if (kind === 'corners') {
      for (const [x, y] of [[r.x, r.y], [r.x + r.w - 1, r.y], [r.x, r.y + r.h - 1], [r.x + r.w - 1, r.y + r.h - 1]]) {
        const c = cells.reduce((best, q) => !best || Math.hypot(q[0] - x, q[1] - y) < Math.hypot(best[0] - x, best[1] - y) ? q : best, null);
        if (c) put(c[0], c[1], e);
      }
    } else if (kind === 'ring') {
      const rad = Math.min(r.w, r.h) / 2 - 1.5;
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; put(Math.floor(r.mx + Math.cos(a) * rad), Math.floor(r.my + Math.sin(a) * rad), e); }
    } else if (kind === 'clutter') {
      for (let k = 0, tries = 0; k < n && tries < n * 5; tries++) { const [x, y] = rng.pick(cells); if (put(x, y, pick(tag), 0.3)) k++; }
    }
  }
}

// light radius (tiles) of the props that burn
const LIT = { grave_lantern: 2.2,
  yellow_cage_lantern: 2.4, dripping_candle_cluster: 2, tall_iron_candelabrum: 2.6, green_fire_brazier: 3.4, green_flame_torch: 3.2, torch_stand: 3.2, incense_brazier: 3, iron_candelabrum: 2.6, vigil_candles: 2, votive_candles: 2,
  wall_brazier: 3.1, keep_candelabrum: 2.8, iron_chandelier: 2.6,
  gold_brazier: 3.6, blue_flame_brazier: 3.8, temple_censer: 2.8, burial_lantern: 2.6, sun_torch: 3.2, royal_censer: 3.0,
  winter_brazier: 3.2, azure_brazier: 3.7, violet_brazier: 3.7, frost_lantern: 2.6,
  icicle_chandelier: 2.6, crystal_heart: 4.1, aurora_shrine: 3.9,
  hellfire_brazier: 4.2, balefire_brazier: 3.9, bloodfire_brazier: 4.0,
  lava_vent: 3.1, lava_pool: 3.0, soul_furnace: 4.1, soul_obelisk: 2.4,
  radiant_brazier: 3.8, azure_altar_flame: 3.7, holy_censer: 3.1,
  blessing_shrine: 4.1, luminous_font: 3.0, cloud_fountain: 3.0,
  sun_disk_dais: 3.8, halo_ring: 3.6, dawn_relic_chest: 2.9,
  starfall_brazier: 3.5, voidflame_brazier: 3.7, aether_lantern: 2.5,
  stellar_conduit: 3.8, nebula_shrine: 4.1, astral_fountain: 3.2,
  convergence_dais: 3.6, singularity_heart: 4.5, portal_anchor: 3.7,
  campfire: 3.4, lantern_stake: 2.4, glowing_crystal: 2.6 };

function shuffleWith(a, rng) {
  for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * Gaps in a rectangular room's wall where a corridor meets it, flanked by wall on both sides.
 * Three in four get an arch (one spanning 3 tiles for a 2-3 wide gap, so a 2-wide gap's arch overlaps the wall by half a
 * tile each side; 5 or 7 tiles for wider gaps when the pack has them) or, in a 2-wide gap, a pair of doors.
 * See TileMap.buildWalls.
 */
export function archesFor(tileset, n) {
  const span = n + (n % 2 ? 0 : 1), sp = tileset.archSpan || {};
  return Object.keys(tileset.arches || {}).filter((d) => (sp[d] || 3) === span);
}

function findOpenings(map, rooms, tileset, rng) {
  const out = [];
  const arches = Object.keys(tileset.arches || {}), doors = Object.keys(tileset.doors || {});
  if (!arches.length) return out;
  const fl = (x, y) => map.tile(x, y) === 1;
  for (const r of rooms) {
    if (r.type === 'cave' || r.type === 'arena') continue; // the arena's gate arch is placed by carveArena
    const sides = [
      { axis: 'x', line: r.y, lo: r.x, hi: r.x + r.w, inT: (a) => [a, r.y], outT: (a) => [a, r.y - 1] },
      { axis: 'x', line: r.y + r.h, lo: r.x, hi: r.x + r.w, inT: (a) => [a, r.y + r.h - 1], outT: (a) => [a, r.y + r.h] },
      { axis: 'y', line: r.x, lo: r.y, hi: r.y + r.h, inT: (a) => [r.x, a], outT: (a) => [r.x - 1, a] },
      { axis: 'y', line: r.x + r.w, lo: r.y, hi: r.y + r.h, inT: (a) => [r.x + r.w - 1, a], outT: (a) => [r.x + r.w, a] },
    ];
    for (const s of sides) {
      const gap = (a) => fl(...s.inT(a)) && fl(...s.outT(a));
      for (let a = s.lo + 1; a < s.hi - 1; a++) {
        if (!gap(a) || gap(a - 1)) continue;
        let b = a;
        while (b < s.hi && gap(b)) b++;
        const n = b - a;
        // flanked by real wall (room floor inside, void outside) on both ends
        const wall = (t) => t >= s.lo && t < s.hi && fl(...s.inT(t)) && !fl(...s.outT(t));
        const fit = archesFor(tileset, n);
        if (fit.length && wall(a - 1) && wall(b) && rng.chance(0.75)) {
          const door = n === 2 && doors.length && rng.chance(0.35);
          out.push({ axis: s.axis, line: s.line, a0: a, a1: b, kind: door ? 'door' : 'arch', design: rng.pick(door ? doors : fit), flip: rng.chance(0.5) });
        }
        a = b;
      }
    }
  }
  return out;
}

function exitPos(map, room, from) {
  // put the exit on the side of the room farthest from where the player came in
  const dx = room.mx - from.mx, dy = room.my - from.my;
  const fx = Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0, fy = fx ? 0 : Math.sign(dy) || 1;
  let x = room.mx + fx * (room.w / 2 - 1.5), y = room.my + fy * (room.h / 2 - 1.5);
  if (!map.walkable(x, y)) { x = room.mx; y = room.my; }
  return [x, y];
}

/**
 * Floors and walls. Floors are paved like Diablo II: each room in one of the pack's self-seamless materials (most
 * rooms share the level's main one), corridors in another, with a scattering of the pack's feature tiles (drains,
 * seals, mosaics, cracks) picked to match the brightness of the paving around them. A mixed set (assets.js
 * mixedTileSet) holds a second palette's floors after `split`; region(i) = 1 paves tile i with those.
 * Walls come from 2-3 of the pack's wall families, one per straight run, the first most often.
 */
function finishMap(map, tileset, rng, region = null, rooms = [], extra = []) {
  const W = map.w;
  const bases = shuffleWith(tileset.bases.slice(), rng);
  const main = bases[0], hall = bases[1 % bases.length];
  const roomBase = new Int16Array(map.t.length).fill(-1), roomOf = new Int16Array(map.t.length).fill(-1);
  rooms.forEach((r, ri) => {
    const b = rng.chance(0.7) ? main : rng.pick(bases);
    if (r.type === 'cave') {
      const ox = r.cx * S + 1, oy = r.cy * S + 1;
      for (let y = oy; y < oy + S; y++) for (let x = ox; x < ox + S; x++) { roomBase[y * W + x] = b; roomOf[y * W + x] = ri; }
    } else for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { roomBase[y * W + x] = b; roomOf[y * W + x] = ri; }
  });
  // a themed room's floor motifs (data/biomerooms.js): feature tiles named for the theme, and a runner down the aisle
  const motifs = new Map(), names = (re) => re ? tileset.features.filter((i) => re.test(tileset.floors[i].name)) : [];
  const motif = (r) => {
    if (!motifs.has(r)) { const T = r.theme && THEMES[r.theme]; motifs.set(r, T ? { T, floor: names(T.floor), runner: names(T.runner) } : null); }
    return motifs.get(r);
  };
  const near = new Map();
  const featuresFor = (b) => {
    if (!near.has(b)) {
      const lum = tileset.floors[b].lum;
      const f = tileset.features.filter((i) => Math.abs(tileset.floors[i].lum - lum) < 0.07);
      near.set(b, f.length >= 4 ? f : tileset.features);
    }
    return near.get(b);
  };
  const sp = tileset.split || 0;
  for (let i = 0; i < map.t.length; i++) {
    if (!map.t[i]) continue;
    const inRoom = roomBase[i] >= 0;
    const b = inRoom ? roomBase[i] : rooms.length ? hall : main;
    let v = b;
    const r = inRoom && roomOf[i] >= 0 ? rooms[roomOf[i]] : null, M = r && motif(r);
    const x = i % W, y = (i / W) | 0;
    if (M && M.runner.length && r.type !== 'cave' && (r.w >= r.h ? y === Math.floor(r.my) && x > r.x : x === Math.floor(r.mx) && y > r.y)) v = M.runner[(r.w >= r.h ? x : y) % 2 ? 0 : M.runner.length - 1];
    else if (M && M.floor.length && rng.chance(M.T.rate || 0.08)) v = rng.pick(M.floor);
    else if (rng.chance(inRoom ? 0.07 : 0.035)) v = rng.pick(featuresFor(b));
    map.v[i] = v + (region && region(i) ? sp : 0);
  }
  const fams = shuffleWith(tileset.families.slice(), rng);
  const families = [[fams[0], 5], [fams[1 % fams.length], 3], [fams[2 % fams.length], 1.5]];
  for (const o of extra) if (o.kind === 'arch' && !o.design) { const fit = archesFor(tileset, o.a1 - o.a0); o.design = fit.length ? rng.pick(fit) : null; }
  map.buildWalls(tileset, () => rng.next(), [...findOpenings(map, rooms, tileset, rng), ...extra.filter((o) => o.design)], families);
}

/** Depth FINAL_DEPTH (500): a gauntlet that ends in the demon lord's arena. */
function generateThrone(biome, tileset, seed) {
  const rng = new RNG(seed);
  const W = 44, H = 80;
  const map = new TileMap(W, H);
  const carveRect = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i > 0 && j > 0 && i < W - 1 && j < H - 1) map.t[j * W + i] = 1; };
  // entrance hall
  carveRect(17, 68, 10, 9);
  // winding gauntlet
  carveRect(20, 56, 4, 13);
  carveRect(8, 52, 28, 6);
  carveRect(8, 40, 5, 13);
  carveRect(31, 40, 5, 13);
  carveRect(8, 36, 28, 5);
  carveRect(20, 30, 4, 7);
  // arena
  const ar = { x: 6, y: 4, w: 32, h: 27 };
  for (let y = ar.y; y < ar.y + ar.h; y++) for (let x = ar.x; x < ar.x + ar.w; x++) {
    const cx = ar.x + ar.w / 2, cy = ar.y + ar.h / 2;
    if (((x + 0.5 - cx) / (ar.w / 2)) ** 2 + ((y + 0.5 - cy) / (ar.h / 2)) ** 2 <= 1) map.t[y * W + x] = 1;
  }
  finishMap(map, tileset, rng);
  const spawns = [
    { x: 14, y: 54, arch: 'demon', n: 3, rank: 'champion' },
    { x: 30, y: 54, arch: 'knight', n: 4, rank: 'normal' },
    { x: 10, y: 45, arch: 'imp', n: 6, rank: 'normal' },
    { x: 33, y: 45, arch: 'gargoyle', n: 4, rank: 'normal' },
    { x: 22, y: 38, arch: 'abomination', n: 2, rank: 'unique' },
    { x: 22, y: 14, arch: 'velscour', n: 1, rank: 'boss' },
  ];
  // The throne remains Velscour's scripted boss arena, but its corridors
  // now also draw gauntlet guards from the FULL biome roster. This allows
  // all 50 registered throne-native look variants (and the existing global
  // bestiary) to be encountered across differently seeded final levels.
  const throneGuards=(biome.roster||[]).filter(a=>a!=='velscour');
  if(throneGuards.length){
    for(const [x,y] of [[22,61],[10,48],[32,48],[12,38],[22,34]]){
      spawns.push({x,y,arch:rng.pick(throneGuards),n:rng.int(1,3),rank:'normal'});
    }
  }
  const { torches, wallHangings } = wallMounts(map, rng, biome, () => 0.25, 0.12, 50);
  const props = [];
  const ob = tileset.scatter.find((e) => e.name === 'funerary_obelisk') || tileset.scatter[0];
  for (const [x, y] of [[12, 10], [32, 10], [12, 24], [32, 24]]) {
    if (ob && map.walkableTile(x, y)) { map.block[y * W + x] = 1; props.push({ kind: 'scatter', x: x + 0.5, y: y + 0.5, spr: ob, k: tileset.k }); }
  }
  // his throne (gfx/velscourthrone.js): the Castle's throne dais in his colours on a 2 x 2 footing, its front corner at
  // (23, 12); he sits on it until the fight begins (game/velscour.js SEAT)
  for (let y = 10; y <= 11; y++) for (let x = 21; x <= 22; x++) map.block[y * W + x] = 1;
  props.push({ kind: 'scatter', x: 23, y: 12, spr: throneSprite(), k: 1 / THRONE_ART.over, throne: true });
  return {
    map, rooms: [{ x: ar.x, y: ar.y, w: ar.w, h: ar.h, mx: 22, my: 17 }], spawns, props, chests: [{ x: 22.5, y: 72.5, rare: true }], torches, wallHangings,
    start: [22, 73], exit: [22, 7], bossRoom: { x: ar.x, y: ar.y, w: ar.w, h: ar.h, mx: 22, my: 17 }, throne: true,
  };
}
