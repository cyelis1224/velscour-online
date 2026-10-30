// THE ETERNAL BREACH's floor run (docs/ETERNAL_BREACH.md). The islands (world/breach.js) hold shrines: each medium
// island a scenario, each large one a boss fight, and the Breach Heart (the large island farthest out) the floor's
// final boss, who only answers once every other shrine is won. A walkway leading on from a shrine island stays warded
// until that shrine is won; while a shrine's fight is on, every walkway off its island is warded against the hero.
// Monsters reach the fights in twelve ways (ARRIVALS): up out of the ground, over the islands' edges, down from the
// sky, dropped off by a carrier beast that flies on, and the Breach's own eight: rift tears, breachstone meteors,
// marching in over the walkways, docking rock shards, lowered on chains, coalescing out of motes, bursting out of
// coffins, and stepping through doorways that open in the air. Only the Breach's own creatures (data/breach.js).
// The run speaks the overworld scenario API (active/completed/shrine/markers/objective/hud/...) for the HUD, the
// Quest Log and auto-play.
import { G } from '../state.js';
import { UI } from '../ui/ui.js';
import { RNG, rand, chance, TAU, pick, clamp } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { camera, isoX, isoY, HH, elevationAt } from '../core/view.js';
import { makeMonster, monsterBase } from './monster.js';
import { aoe } from './combat.js';
import { Delayed } from './hazards.js';
import { GroundItem, dropChest } from './loot.js';
import { rollItem, rarityAt, RARITY, goldLvl } from '../data/items.js';
import { breachLevel, breachDepth, breachReward, finalBossIndex, breachArch, BREACH_CARRIERS, BREACH_BOSSES, BREACH_MONSTERS } from '../data/breach.js';
import { addEffect, Ring, Column, Telegraph, sparkle, smoke, burst, spawn, floatText, addLight, glowSprite } from '../gfx/vfx.js';
import { drawWard, drawCarrier } from '../gfx/breach.js';
import { enemyImage } from '../core/enemyart.js';
import { createWyrm } from './breachdragon.js';

/** A monster of the Breach: no regenerating elites (the floors are thick with pools to dodge, and a champion healing
 * to full while the hero side-steps them made fights endless). */
export function breachMonster(m) {
  m.breach = true;
  if (m.affixes && m.affixes.includes('regen')) m.affixes = m.affixes.filter((a) => a !== 'regen');
  return m;
}

export const ARRIVALS = ['rise', 'climb', 'sky', 'ride', 'rift', 'meteor', 'march', 'shard', 'chain', 'coalesce', 'coffin', 'doorway'];
export const ARRIVAL_NAMES = {
  rise: 'They claw up out of the ground!', climb: 'They climb over the edge!', sky: 'They fly in from the void!',
  ride: 'A carrier drops its riders!', rift: 'The air tears open!', meteor: 'Breachstone falls from the sky!',
  march: 'They march in over the walkways!', shard: 'A rock shard docks against the island!', chain: 'They are lowered on violet chains!',
  coalesce: 'Motes of the void take shape!', coffin: 'The coffins burst open!', doorway: 'Doorways open in the empty air!',
};
const VIOLET = '#b060ff';
/** Is tile (x, y) within `m` world px of the screen? (A floor's wards and lamps are spread over the whole map.) */
const inView = (x, y, m) => { const r = camera.viewRect(m), px = isoX(x, y), py = isoY(x, y); return px > r.x0 && px < r.x1 && py > r.y0 && py < r.y1; };

// ======================================================================= things drawn in the world (hazards)
/** A short-lived drawn thing in the depth-sorted pass: `paint(ctx, fx)` draws, `step(dt, fx)` returns false when done. */
class Fx {
  constructor(o) { Object.assign(this, { t: 0, depth: 0 }, o); this.depth = this.x + this.y + (this.lift || 0); }
  update(dt) { this.t += dt; this.depth = this.x + this.y + (this.lift || 0); return this.step ? this.step(dt, this) !== false : this.t < (this.dur || 1); }
  draw(ctx) { if (this.paint) this.paint(ctx, this); }
}

// ======================================================================= the run
export function createBreachRun(world, gen, biome, floor, onWin) {
  const c = G.char, map = world.map, W = map.w, isl = gen.islands, bridges = gen.bridges;
  const own = map.breach.own, bridgeOf = map.breach.bridgeOf;
  const rng = new RNG((gen.seed ^ 0x5eedb7) >>> 0), lvl = breachLevel(floor), depth = breachDepth(floor);
  const tileOf = (x, y) => map.tileIdx(x, y);
  const islandAt = (x, y) => own[tileOf(x, y)];

  // ---------------------------------------------------------------- wards
  const blockGate = (b, on) => { for (const i of b.gate) map.block[i] = on ? 1 : 0; map.flowFrom = [-999, -999]; map.blockKey = (map.blockKey || 0) + 1; };
  const axisOf = (b) => (Math.abs(b.p1[0] - b.p0[0]) > Math.abs(b.p1[1] - b.p0[1]) ? 'y' : 'x');
  const gateNear = (b, o) => {
    const p = b.a === o.idx ? b.p0 : b.p1;
    const tiles = b.tiles.filter((i) => Math.hypot((i % W) + 0.5 - p[0], ((i / W) | 0) + 0.5 - p[1]) < 1.9);
    const at = tiles.length ? [tiles.reduce((s, i) => s + (i % W) + 0.5, 0) / tiles.length, tiles.reduce((s, i) => s + ((i / W) | 0) + 0.5, 0) / tiles.length] : p;
    return { tiles, at };
  };
  const makeWard = (b, at, kind) => {
    const w = new Fx({ x: at[0], y: at[1], axis: axisOf(b), open: 0, closed: true, kind, b, lift: 0.3,
      step(dt, f) { f.open = clamp(f.open + (f.closed ? -dt : dt) * 1.4, 0, 1); if (!f.closed && f.open >= 1 && f.kind === 'lock') return false; if (f.closed && inView(f.x, f.y, 200)) addLight(f.x, f.y, 3, 0.7, 30, VIOLET); return true; },
      paint(ctx, f) { drawWard(ctx, f); } });
    world.addHazard(w);
    return w;
  };
  const wards = bridges.filter((b) => b.ward >= 0).map((b) => { blockGate(b, true); return makeWard(b, b.gateAt, 'ward'); });
  const openWards = (o) => {
    for (const w of wards) if (w.closed && w.b.ward === o.idx) { w.closed = false; blockGate(w.b, false); addEffect(new Ring(w.x, w.y, 0.2, 2.5, 0.6, VIOLET, 4)); }
  };
  // which islands the hero can walk to now (wards closed bar the way; scenario locks don't count)
  const reachable = (from) => {
    const seen = new Set([from]), q = [from];
    for (let k = 0; k < q.length; k++) for (const bi of isl[q[k]].bridges) {
      const b = bridges[bi], other = b.a === q[k] ? b.b : b.a;
      if (seen.has(other) || wards.some((w) => w.closed && w.b === b)) continue;
      seen.add(other); q.push(other);
    }
    return seen;
  };

  // ---------------------------------------------------------------- scenarios on the shrine islands
  const shrineIsl = isl.filter((o) => o.shrine);
  const others = shrineIsl.filter((o) => !o.heart);
  const deck = shuffleR(Object.keys(SCENARIOS).filter((k) => !SCENARIOS[k].boss && k !== 'heart'), rng), bossDeck = shuffleR(Object.keys(SCENARIOS).filter((k) => SCENARIOS[k].boss), rng);
  const usedBoss = new Set([finalBossIndex(floor)]);
  const bossIndex = () => { let i; do i = rng.int(0, BREACH_BOSSES.length - 1); while (usedBoss.has(i) && usedBoss.size < BREACH_BOSSES.length); usedBoss.add(i); return i; };
  const record = c.breach || (c.breach = { best: 0, cleared: {} });
  const all = [];
  // G.breachTypes (tests): the scenarios to hand out, in island order
  for (const o of others) all.push(makeScenario(o, G.breachTypes?.length ? G.breachTypes.shift() : o.kind === 'large' ? bossDeck.shift() || 'duel' : deck.shift() || 'surge'));
  const heart = makeScenario(isl[gen.heart], 'heart');
  all.push(heart);
  // the floor's Ethereal Wyrm (game/breachdragon.js): passes over the hero, then a fight two thirds of the way through
  const islandLocks = new Map();
  const wyrm = world.wyrmOff ? null : createWyrm({ world, gen, floor, lvl, rng: new RNG((gen.seed ^ 0x77a1d) >>> 0), islands: isl, own, islandAt,
    lock: (o, on) => { if (on) islandLocks.set(o.idx, o.bridges.map((bi) => makeWard(bridges[bi], gateNear(bridges[bi], o).at, 'lock'))); else for (const l of islandLocks.get(o.idx) || []) l.closed = false; return islandLocks.get(o.idx) || []; },
    arrive: (o, kind, n, opts) => arrive(world, o, kind, n, { ...opts, lvl }),
    run: () => ({ won: run.won, others: others.length, active: run.active }) });
  if (wyrm) { all.push(wyrm.S); world.wyrm = wyrm.w; }

  const run = {
    id: 'eternal_breach', floor, completed: false, failed: false, scenarios: all, heart, wards, islands: isl, wyrm,
    get current() { return all.find((S) => S.active) || null; },
    get active() { return !!run.current; },
    get won() { return all.filter((S) => S.completed && S !== heart && !S.wyrm).length; },
    get title() { return run.current?.title || (run.completed ? 'The Breach Heart Is Sealed' : run.won === others.length ? 'Face the Breach Heart' : 'Win the Shrines of the Breach'); },
    get type() { return 'breach'; },
    get markers() { return run.current?.markers || []; },
    get route() { return []; }, get stage() { return run.current?.stage || 0; },
    get escort() { return null; }, get routeIndex() { return 0; },
    get remaining() { return run.current?.markers.length || 0; },
    get description() { return run.current?.description || (run.completed ? 'The exit portal on the Heart island is open.' : 'Activate the shrines on the medium and large islands. Each one won lifts the wards on the walkways leading on.'); },
    /** The shrine to go for: the nearest unwon one the hero can walk to; the Heart once the rest are won. */
    get target() {
      const cur = run.current;
      if (cur) return cur;
      if (run.completed) return null;
      const p = world.player, here = p ? islandAt(p.x, p.y) : gen.startIsland;
      const can = reachable(here >= 0 ? here : nearestIsland(p));
      for (const k of reachable(gen.startIsland)) can.add(k); // and everything the open wards allow from the start
      const left = all.filter((S) => !S.completed && S !== heart && !S.wyrm);
      if (!left.length) return heart;
      let open = left.filter((S) => can.has(S.o.idx));
      if (!open.length) open = left; // (never expected: the nearest unwon shrine rather than standing at the Heart)
      if (run.aim && open.includes(run.aim)) return run.aim;
      return (run.aim = open.sort((a, b) => Math.hypot(a.C[0] - p.x, a.C[1] - p.y) - Math.hypot(b.C[0] - p.x, b.C[1] - p.y))[0]);
    },
    get shrine() { return run.target?.shrine || heart.shrine; },
    get objective() {
      const S = run.current;
      if (!S) return undefined;
      if (S.objective) return S.objective;
      // nothing to do but fight: go to the nearest of the fight's foes (stragglers too), else the shrine
      const p = world.player, f = p && S.foes.filter((m) => !m.dead && m.targetable !== false).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      return f ? { x: f.x, y: f.y, reach: 2 } : { x: S.C[0], y: S.C[1] + 1.5, reach: 3.5 };
    },
    get hud() {
      const S = run.current, won = run.won;
      if (!S) return { title: run.completed ? 'The Breach Heart is sealed' : won === others.length ? 'Face the Breach Heart' : 'Win the shrines', beat: won, total: others.length,
        timer: '', progress: run.completed ? 'The exit portal is open' : wyrm && !wyrm.slain && won >= Math.ceil(others.length * 2 / 3) ? `Shrines won ${won}/${others.length} · ${wyrm.w.name.split(',')[0]} hunts you` : won === others.length ? 'Every ward is down: the Heart awaits' : `Shrines won ${won}/${others.length} · then the Heart` };
      const left = S.timer > 0 ? Math.max(0, Math.ceil(S.timer - S.seconds)) : 0;
      return { title: S.title, beat: won, total: others.length, timer: left ? left + 's' : '', progress: S.progress() };
    },
    update(dt) {
      for (const S of all) if (S.active) S.update(dt);
      if (wyrm) wyrm.update(dt);
      holdLocks();
      ambient(dt);
      stranded(dt);
    },
    /** Tests: start a shrine's fight now (the hero is moved there). */
    force(S) {   // (the nearest walkable tile of its island to the spot below the shrine: one on a basin saw nothing land)
      const p = world.player, [x0, y0] = [S.C[0], S.C[1] + 1.6];
      let at = [x0, y0], bd = Infinity;
      for (const i of S.o.tiles) { const x = (i % W) + 0.5, y = ((i / W) | 0) + 0.5, d = Math.hypot(x - x0, y - y0); if (d < bd && map.circleFree(x, y, 0.35)) { bd = d; at = [x, y]; } }
      p.x = at[0]; p.y = at[1]; S.start(true);
    },
  };
  for (const S of all) S.busy = () => all.some((o) => o !== S && o.active);

  function nearestIsland(p) {
    let best = gen.startIsland, bd = Infinity;
    if (p) for (const o of isl) { const d = Math.hypot(o.cx - p.x, o.cy - p.y) - o.r; if (d < bd) { bd = d; best = o.idx; } }
    return best;
  }

  // ---------------------------------------------------------------- the wards hold the hero
  // Walking, the closed wards' blocked tiles stop him; this catches blinks, leaps and dashes: wherever the hero ends
  // up must be somewhere the open wards allow (while a fight is on, its island alone), else he is put back.
  let lastSafe = null, lockMsgT = 0, legalKey = '', legalIsl = null;
  const nearSide = new Map(bridges.map((b) => [b.idx, new Set(b.nearTiles || [])]));
  function legal(i, S) {
    if (S) return own[i] === S.o.idx;
    const key = wards.map((w) => (w.closed ? 1 : 0)).join('');
    if (key !== legalKey) { legalKey = key; legalIsl = reachable(gen.startIsland); }
    if (own[i] >= 0) return legalIsl.has(own[i]);
    const b = bridges[bridgeOf[i]];
    if (!b) return false;
    if (wards.some((w) => w.closed && w.b === b)) return legalIsl.has(b.near) && nearSide.get(b.idx).has(i);
    return legalIsl.has(b.a) || legalIsl.has(b.b);
  }
  function holdLocks() {
    const S = run.current, p = world.player;
    if (!p || p.dead || G.world !== world) { lastSafe = null; return; } // (never once he has left the Breach)
    const i = tileOf(p.x, p.y);
    if (legal(i, S)) { lastSafe = [p.x, p.y]; return; }
    if (!lastSafe) return;
    p.x = lastSafe[0]; p.y = lastSafe[1]; p.path = null; p.moveTarget = null;
    if (world.time > lockMsgT) { lockMsgT = world.time + 1.5; floatText(p.x, p.y, 70, S ? 'The ward holds until the fight is won!' : 'A ward bars the way: win its shrine first!', VIOLET, 13, { life: 1.4 }); sfx('error', 0.5); }
  }

  // ---------------------------------------------------------------- monsters the hero can't reach
  // A monster up on a ledge the hero can't climb (dropped there, or kiting up a crag) would hold a fight up for good:
  // a few seconds stranded and the Breach tears it back down next to him.
  let strandT = 0;
  function stranded(dt) {
    const p = world.player;
    if (!p || p.dead || (strandT -= dt) > 0) return;
    strandT = 1;
    map.buildFlow(p.x, p.y, map.flowRange || 64);
    const here = islandAt(p.x, p.y), S = run.current;
    for (const m of world.hostiles('player', p.x, p.y, 16)) {
      if (!m.breach || m.dead || m.entering || m.static || m.targetable === false || !m.awake) continue;
      const foe = S && S.foes.includes(m);
      if (own[tileOf(m.x, m.y)] !== here && !foe) continue; // (not a pack across a ward)
      // the hero is held on the fight's island: one of its foes out on a walkway (a caster that marched in and stopped
      // at range) can't be reached either
      const out = foe && (own[tileOf(m.x, m.y)] !== S.o.idx || !S.onIsland(m.x, m.y));
      if (reachOk(map, m.x, m.y) && !out) { m.strandT = 0; continue; }
      if ((m.strandT = (m.strandT || 0) + 1) < (out ? 7 : 4) || here < 0) continue;   // (marchers walk in from up to 14 tiles out)
      const at = landing(world, isl[here], 'rift', p, new RNG((Math.random() * 1e9) >>> 0));
      if (!at) continue;
      m.strandT = 0;
      sparkle(m.x, m.y, 20, VIOLET, 14, 0.5);
      bringOne(world, isl[here], m, 'rift', [at.x, at.y]);
    }
  }

  // ---------------------------------------------------------------- monsters arriving while no shrine is active
  let ambT = rand(35, 55);
  function ambient(dt) {
    const p = world.player;
    if (!p || p.dead || run.active || run.completed) return;
    if ((ambT -= dt) > 0) return;
    ambT = rand(40, 70);
    const here = islandAt(p.x, p.y);
    if (here < 0 || isl[here].start || world.hostiles('player', p.x, p.y, 9).length > 6) { ambT = 12; return; }
    const kind = pick(ARRIVALS);
    const n = arrive(world, isl[here], kind, 2 + Math.floor(rand(0, 2) + floor / 6), { near: p });
    if (n.length) floatText(p.x, p.y, 90, ARRIVAL_NAMES[kind], '#d8a0ff', 14, { life: 1.8 });
  }

  // ---------------------------------------------------------------- one shrine's scenario
  function makeScenario(o, type) {
    const T = SCENARIOS[type];
    const C = o.shrinePos;
    const S = { type, title: T.title, description: T.desc, o, C, active: false, completed: false, failed: false, stage: 0, goal: 0, seconds: 0, timer: 0,
      foes: [], markers: [], extras: [], locks: [], objective: undefined, boss: !!T.boss || type === 'heart' };
    const report = (s, col = '#d8b0ff') => UI.log('[' + S.title + '] ' + s, col);
    const live = () => S.foes.some((m) => !m.dead);
    /** Nothing of the fight left to hit but its boss and nests: the next wave comes now, not on its timer. */
    const calm = () => !S.foes.some((m) => !m.dead && !m.static && !m.breachBoss);
    const track = (m) => {
      const prev = m.onDeath;
      m.onDeath = (src) => { if (prev) prev.call(m, src); if (S.onFoeDeath) S.onFoeDeath(m); };
      S.foes.push(m);
      return m;
    };
    // In a fight the walkways are locked to the hero, so what he can reach is what he can walk to without leaving this
    // island: a few rim tiles and ledges (about 1 shrine island in 80) are reached only by a walkway's far end, and a
    // grapple or resonator put there made the fight unwinnable.
    let isle = null, isleAt = -2, isleKey = -1;
    const onIsland = (qx, qy) => {
      const P = world.player, s0 = P ? tileOf(P.x, P.y) : -1;
      if (s0 < 0 || own[s0] !== o.idx) return true;   // (not on it: the general reach rule decides)
      if (s0 !== isleAt || isleKey !== map.blockKey) {
        isleAt = s0; isleKey = map.blockKey; isle = new Set([s0]);
        const q = [s0];
        for (let k = 0; k < q.length; k++) {
          const i = q[k], tx = i % W, ty = (i / W) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const j = (ty + dy) * W + tx + dx;
            if (isle.has(j) || own[j] !== o.idx || !map.walkableTile(tx + dx, ty + dy) || (map.hgt && !map.stepOk(i, j))) continue;
            isle.add(j); q.push(j);
          }
        }
      }
      return isle.has(tileOf(qx, qy));
    };
    const fightReach = (qx, qy) => reachOk(map, qx, qy) && onIsland(qx, qy);
    S.onIsland = onIsland;
    const spot = (r0 = 2, r1 = 7, from = C) => {
      for (let k = 0; k < 40; k++) {
        const i = o.tiles[Math.floor(rng.next() * o.tiles.length)], x = (i % W) + 0.5, y = ((i / W) | 0) + 0.5, d = Math.hypot(x - from[0], y - from[1]);
        if (d >= r0 && d <= r1 && map.circleFree(x, y, 0.35) && fightReach(x, y)) return [x, y];
      }
      return map.randomNear(C[0], C[1], 3, rng.fn());
    };
    /** A spot on this island the hero can reach, as near `p` as can be (a hatchling beside its nest, a shard on the
     *  Heart's ring): one dropped where p happens to be (a crag top, past the edge) could never be reached. */
    const landAt = (p, r = 1.6) => {
      const ok = (q) => own[tileOf(q[0], q[1])] === o.idx && map.circleFree(q[0], q[1], 0.35) && fightReach(q[0], q[1]);
      if (ok(p)) return p;
      for (let k = 0; k < 24; k++) { const a = rng.next() * TAU, d = 0.5 + rng.next() * r, q = [p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d]; if (ok(q)) return q; }
      return spot(0, 5, p);
    };
    /** The island's rim tiles the hero can walk to (a resonator or grapple on a ledge he can't climb made the fight
     *  unwinnable, and the Heart needs every shrine). */
    const rims = () => {
      const walk = o.rimTiles.filter((i) => map.walkableTile(i % W, (i / W) | 0)), ok = walk.filter((i) => fightReach((i % W) + 0.5, ((i / W) | 0) + 0.5));
      return ok.length >= 4 ? ok : walk;
    };
    const mark = (label, p, cb, color = '#d090ff', reach = 1.7) => {
      const mk = { x: p[0], y: p[1], type: 'objective', active: true, reach, color, label, use: () => { if (S.active) cb(mk); } };
      world.portals.push(mk); S.markers.push(mk);
      return mk;
    };
    const unmark = (mk) => { let i = world.portals.indexOf(mk); if (i >= 0) world.portals.splice(i, 1); i = S.markers.indexOf(mk); if (i >= 0) S.markers.splice(i, 1); };
    const prop = (name, p, o2 = {}) => {
      const s = world.tileset.scatter.find((q) => q.name === name);
      if (!s) return null;
      const pr = { kind: 'scatter', x: p[0], y: p[1], spr: s, k: world.tileset.k * (o2.scale || 1), flip: !!o2.flip, light: o2.light || 0, lightColor: o2.lightColor };
      world.props.push(pr); S.extras.push(pr);
      return pr;
    };
    const dropProp = (pr) => { const i = world.props.indexOf(pr); if (i >= 0) world.props.splice(i, 1); };
    const flash = (p, color = VIOLET, r = 2) => { addEffect(new Ring(p[0], p[1], 0.2, r, 0.7, color, 4)); sparkle(p[0], p[1], 10, color, 24, 0.5); };
    const lv = (rank) => lvl + (rank === 'boss' ? 2 : rank === 'champion' ? 1 : 0);
    const monster = (arch, p, rank = 'normal', look) => {
      const m = makeMonster(world, arch, biome, lv(rank), rank, p[0], p[1], 0, look ?? world.looks.pick(arch));
      m.awake = true; m.hunter = true; breachMonster(m);
      return m;
    };
    /** Bring n of the floor's monsters to this island by `kind` (ARRIVALS); they join the fight. */
    const wave = (kind, n, o2 = {}) => arrive(world, o, kind, n, { ...o2, near: o2.near || world.player, rng, onMake: track, lvl, champ: o2.champ });
    const boss = (index, kind = 'climb', p = spot(3, 6)) => {
      const b = world.looks.boss(index);
      const m = monster(b.arch, p, 'boss', b.look);
      m.name = b.art.name;
      m.breachBoss = true;
      track(m);
      world.add(m);
      world.boss = m;
      bringOne(world, o, m, kind, p, { rng });
      UI.centerMsg(m.name.toUpperCase(), type === 'heart' ? 'The Breach Heart opens' : 'A sovereign of the Breach', 3.2);
      sfx('boss');
      return m;
    };
    const phases = (list, then) => { S.phaseList = list; S.phaseThen = then; S.goal = list.length; S.stage = 1; list[0](); };
    const trackPhases = () => {
      if (!S.phaseList || live()) return;
      if (S.stage < S.phaseList.length) { S.stage++; S.foes = S.foes.filter((m) => !m.dead); S.phaseList[S.stage - 1](); }
      else { const t = S.phaseThen; S.phaseList = null; t(); }
    };
    const lockIsland = (on) => {
      if (on) {
        S.locks = o.bridges.map((bi) => {
          const b = bridges[bi], g = gateNear(b, o);
          return makeWard(b, g.at, 'lock');
        });
      } else for (const l of S.locks) l.closed = false;
    };
    const finish = () => {
      if (S.completed) return;
      S.completed = true; S.active = false; S.objective = undefined;
      for (const mk of S.markers.slice()) unmark(mk);
      if (S.cleanup) S.cleanup(true);
      lockIsland(false);
      if (world.boss && world.boss.dead) world.boss = null;
      S.shrine.color = '#5a4a6a';
      flash(C, '#e0b0ff', 4);
      addEffect(new Column(C[0], C[1], VIOLET, 0.8, 26, 320));
      sfx('gate');
      if (type === 'heart') heartWon();
      else {
        openWards(o);
        // a sealed reliquary for the winner
        world.chests.push(chestAt(world, C[0] + 1.4, C[1] + 0.6, true, depth));
        UI.centerMsg('SHRINE WON', `${S.title} · ${run.won}/${others.length} shrines${wards.some((w) => w.b.ward === o.idx) ? ' · the wards fall' : ''}`, 3);
        report('Won. The wards on the walkways leading on from this island fall.', '#e0c0ff');
      }
      UI.refresh();
      if (G.game?.autosave) G.game.autosave();
    };
    Object.assign(S, { finish });
    S.progress = () => (S.goal ? `Progress ${Math.min(S.stage, S.goal)}/${S.goal}` : '');
    const x = { S, world, map, o, C, rng, floor, lvl, spot, landAt, rims, mark, unmark, prop, dropProp, flash, monster, wave, boss, phases, trackPhases, live, calm, report, finish, track, bossIndex };
    const start = (forced) => {
      if (S.active || S.completed) return;
      if (S.busy()) { report('Another shrine already burns. Finish its fight first.', '#ffb070'); return; }
      if (type === 'heart' && run.won < others.length) {
        const left = others.length - run.won;
        floatText(C[0], C[1], 80, `${left} shrine${left > 1 ? 's' : ''} still bar${left > 1 ? '' : 's'} the Heart`, '#ff80c0', 14, { life: 2 });
        report(`The Heart answers only when every other shrine of this floor is won (${run.won}/${others.length}).`, '#ffb0d0');
        sfx('error'); return;
      }
      if (type === 'heart' && wyrm && !wyrm.slain) {
        floatText(C[0], C[1], 80, 'The wyrm still circles this floor', wyrm.w.variant.glow, 14, { life: 2 });
        report(`The Heart answers only once ${wyrm.w.name} is slain. It comes down to fight when you stand on an island.`, '#ffb0d0');
        sfx('error'); return;
      }
      Object.assign(S, { active: true, failed: false, stage: 0, goal: 0, seconds: 0, timer: 0, phaseList: null, objective: undefined, onFoeDeath: null, cleanup: null });
      S.foes = S.foes.filter((m) => !m.dead);
      S.progress = () => (S.goal ? `Progress ${Math.min(S.stage, S.goal)}/${S.goal}` : '');
      lockIsland(true);
      if (world.player) map.buildFlow(world.player.x, world.player.y, map.flowRange || 64);
      report(S.description); UI.centerMsg(S.title.toUpperCase(), S.description, 3.2);
      sfx('portal');
      flash(C, '#ff70e0', 3);
      T.start(x);
      void forced;
    };
    S.start = start;
    S.update = (dt) => {
      S.seconds += dt;
      // stragglers: when nothing has fallen for a while, the last few far from the hero sink back into the void
      const alive = S.foes.filter((m) => !m.dead);
      if (alive.length !== S.lastAlive) { S.lastAlive = alive.length; S.calmT = 0; } else S.calmT = (S.calmT || 0) + dt;
      if (S.calmT > 30 && alive.length && alive.length <= 4) {
        const p = world.player;
        for (const m of alive) if (!p || Math.hypot(m.x - p.x, m.y - p.y) > 9 || !reachOk(map, m.x, m.y)) { m.dead = true; sparkle(m.x, m.y, 30, VIOLET, 14, 0.6); smoke(m.x, m.y, 10, '#2a1a3a', 4, 10); }
        S.calmT = 0;
      }
      T.update(x, dt);
      if (S.phaseList) trackPhases();
      addLight(C[0], C[1], 4, 0.8, 30, type === 'heart' ? '#ff40c0' : VIOLET);
    };
    S.shrine = { x: C[0], y: C[1] + 0.9, type: 'shrine', reach: 1.9, active: true, color: type === 'heart' ? '#ff50d0' : '#b070ff',
      get label() { return S.completed ? 'Shrine Won' : S.active ? S.title : (type === 'heart' ? 'The Breach Heart' : 'Shrine: ' + S.title); },
      use: () => { if (!S.completed && !S.active) start(); else if (S.active) report(S.description); } };
    world.portals.push(S.shrine);
    return S;
  }

  function heartWon() {
    run.completed = true;
    const first = !(record.cleared[floor] > 0);
    record.cleared[floor] = (record.cleared[floor] || 0) + 1;
    record.best = Math.max(record.best || 0, floor);
    const r = breachReward(floor, first), il = lvl + 2, rar = rarityAt(il, r);
    const [hx, hy] = heart.C;
    world.addLoot(new GroundItem(hx + 0.8, hy + 1.6, 'item', { item: rollItem(il, { rarity: rar }) }));
    for (let k = 0; k < 3; k++) world.addLoot(new GroundItem(hx + rand(-1.2, 1.2), hy + 1 + rand(0, 1.2), 'gold', { amount: Math.round(40 * Math.pow(1.06, goldLvl(il)) * rand(0.8, 1.3)) }));
    UI.centerMsg('THE BREACH HEART IS SEALED', `Floor ${floor} conquered${first ? ' for the first time' : ''} · a ${RARITY[rar].name} prize`, 4);
    UI.log(`The Heart of Floor ${floor} gives up a <b style="color:${RARITY[rar].color}">${RARITY[rar].name}</b> treasure.${first ? '' : ' (Its first-clear prize was claimed before.)'}`, RARITY[rar].color);
    onWin(run, first);
  }
  return run;
}

function shuffleR(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** A chest like the levels' own (game.js buildDungeon). */
export function chestAt(world, x, y, rare, depth) {
  return { x, y, rare, opened: false, reach: 1.3, use() { if (this.opened) return; this.opened = true; sfx('chest'); sfx('gold'); dropChest(world, this, depth); sparkle(this.x, this.y, 20, '#ffd060', 20, 0.5); } };
}

// ======================================================================= arrivals
/** Where on island `o` a monster arriving by `kind` lands: near the hero (or the island's middle), on its rim, or out
 * on one of its walkways; with the extra the arrival needs (the void-side direction, the walkway's far end). */
function landing(world, o, kind, near, rng) {
  const map = world.map, W = map.w, own = map.breach.own, bridgeOf = map.breach.bridgeOf;
  const R = () => rng.next();
  if (kind === 'climb' || kind === 'shard') {
    const rims = o.rimTiles.filter((i) => map.walkableTile(i % W, (i / W) | 0) && reachOk(map, (i % W) + 0.5, ((i / W) | 0) + 0.5));
    const sorted = near ? rims.filter((i) => Math.hypot((i % W) + 0.5 - near.x, ((i / W) | 0) + 0.5 - near.y) < 9) : rims;
    const list = sorted.length ? sorted : rims;
    if (!list.length) return null;
    const i = list[Math.floor(R() * list.length)], x = i % W, y = (i / W) | 0;
    let vx = 0, vy = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = (y + dy) * W + x + dx; if (own[j] !== o.idx && bridgeOf[j] < 0) { vx += dx; vy += dy; } }
    const l = Math.hypot(vx, vy) || 1;
    return { x: x + 0.5, y: y + 0.5, vx: vx / l, vy: vy / l };
  }
  if (kind === 'march') {
    // out on a walkway, between the island and the first closed ward on it
    const outs = [];
    for (const bi of o.bridges) {
      const tiles = world.breachBridges[bi].tiles.slice().sort((a, b) => {
        const p = world.breachBridges[bi].a === o.idx ? world.breachBridges[bi].p0 : world.breachBridges[bi].p1;
        return Math.hypot((a % W) + 0.5 - p[0], ((a / W) | 0) + 0.5 - p[1]) - Math.hypot((b % W) + 0.5 - p[0], ((b / W) | 0) + 0.5 - p[1]);
      });
      for (let k = 0; k < tiles.length && k < 14; k++) { if (map.block[tiles[k]]) break; if (k >= 4) outs.push(tiles[k]); }
    }
    if (!outs.length) return landing(world, o, 'rise', near, rng);
    const i = outs[Math.floor(R() * outs.length)];
    return { x: (i % W) + 0.5, y: ((i / W) | 0) + 0.5 };
  }
  const c = near && own[map.tileIdx(near.x, near.y)] === o.idx ? [near.x, near.y] : [o.cx, o.cy];
  for (let k = 0; k < 40; k++) {
    const a = R() * TAU, r = 2.5 + R() * 4.5, x = c[0] + Math.cos(a) * r, y = c[1] + Math.sin(a) * r;
    if (own[map.tileIdx(x, y)] === o.idx && map.circleFree(x, y, 0.4) && reachOk(map, x, y)) return { x, y };
  }
  return null;
}

/**
 * Bring n monsters of the floor to island `o` by `kind`: they can't act or be hit until they've arrived. opts: near
 * (who they come for), rng, onMake(m) (a scenario tracks them), lvl, champ (the first is a champion), arch.
 */
export function arrive(world, o, kind, n, opts = {}) {
  const rng = opts.rng || new RNG((Math.random() * 1e9) >>> 0), out = [], P = world.player;
  if (P) world.map.buildFlow(P.x, P.y, world.map.flowRange || 64); // where the hero can walk (reachOk)
  const lvl = opts.lvl ?? breachLevel(world.breach.floor);
  const made = [];
  for (let k = 0; k < n; k++) {
    const at = landing(world, o, kind, opts.near, rng);
    if (!at) continue;
    const arch = opts.arch || breachArch(rng.fn());
    const rank = (opts.champ && k === 0) || (!opts.champ && rng.next() < 0.08 + world.breach.floor * 0.008) ? 'champion' : 'normal';
    const m = makeMonster(world, arch, world.biome, lvl + (rank === 'normal' ? 0 : 1), rank, at.x, at.y, 0, world.looks.pick(arch, rng.fn()));
    m.awake = true; m.hunter = true; breachMonster(m);
    world.add(m);
    if (opts.onMake) opts.onMake(m);
    made.push([m, at]);
    out.push(m);
  }
  // carriers and shards bring a squad together; the others each arrive on their own, a beat apart
  if (kind === 'ride' && made.length) carrier(world, o, made, rng);
  else if (kind === 'shard' && made.length) shard(world, o, made, rng);
  else made.forEach(([m, at], k) => {
    const delay = k * (0.06 + rng.next() * 0.12);
    if (delay > 0) { hide(m); let d = delay; m.entering = (dt) => { if ((d -= dt) <= 0) bringOne(world, o, m, kind, [at.x, at.y], { rng, at }); }; }
    else bringOne(world, o, m, kind, [at.x, at.y], { rng, at });
  });
  if (out.length) sfx('roar', 0.45);
  return out;
}

/**
 * Can the hero and a monster there reach each other: the monsters' flow field (built round the hero) leads from it to
 * the hero, and the hero can walk to it too (not a ledge a monster can drop from but the hero can't climb).
 */
const reachOk = (map, x, y) => map.flowAt(x, y) >= 0 && heroReach(map)[map.tileIdx(x, y)] === map._hrStamp;
/** The tiles the hero can walk to from where he stands (stamped map._hrStamp), kept until he changes tile. */
function heroReach(map) {
  const P = G.world?.player, W = map.w;
  if (!map._hr) { map._hr = new Int32Array(map.w * map.h); map._hrQ = new Int32Array(map.w * map.h); map._hrStamp = 0; map._hrAt = -1; }
  const s = P ? map.tileIdx(P.x, P.y) : -1;
  if (s === map._hrAt && map._hrKey === map.blockKey) return map._hr;
  map._hrAt = s; map._hrKey = map.blockKey;
  const f = map._hr, q = map._hrQ, st = ++map._hrStamp;
  if (s < 0 || !map.walkableTile(s % W, (s / W) | 0)) return f;
  let qh = 0, qt = 0;
  q[qt++] = s; f[s] = st;
  while (qh < qt) {
    const i = q[qh++], x = i % W, y = (i / W) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0), ni = ny * W + nx;
      if (!map.walkableTile(nx, ny) || f[ni] === st || (map.hgt && !map.stepOk(i, ni))) continue;
      f[ni] = st; q[qt++] = ni;
    }
  }
  return f;
}
const hide = (m) => { m.targetable = false; m.alpha = 0; };
function done(m, x, y) { m.entering = null; m.targetable = true; m.alpha = undefined; m.z = 0; m.x = x; m.y = y; m.cd = rand(0.2, 0.6); }

/** One monster's arrival by `kind` at p (it is already in the world). Bosses use it too. */
export function bringOne(world, o, m, kind, p, opts = {}) {
  const rng = opts.rng || new RNG(1), map = world.map, [tx, ty] = p, big = Math.sqrt(m.scale || 1);
  let at = opts.at;
  if (!at && (kind === 'climb' || kind === 'shard')) at = landing(world, o, 'climb', { x: tx, y: ty }, rng);
  let t = 0;
  m.targetable = false; m.awake = true; m.moving = false;
  const land = (x, y, shake = 3) => {
    done(m, x, y);
    aoe(world, m, x, y, 1.2 * big, m.dmg * 0.6, 'arcane', { knock: 0.6 });
    addEffect(new Ring(x, y, 0.2, 2 * big, 0.45, VIOLET, 5));
    smoke(x, y, 4, '#3a2a4a', 8, 12);
    camera.shake(m.rank === 'boss' ? 9 : shake); sfx('thud', 0.7);
  };
  if (kind === 'rise') {
    // the ground heaves, then it claws up out of the rock
    const dur = 0.8;
    m.alpha = 0; m.z = -60;
    addEffect(new Telegraph({ kind: 'circle', x: tx, y: ty, r: 1.1 * big, dur: 0.4, color: '#a060e0' }), 'ground');
    m.entering = (dt) => {
      t += dt; m.animT += dt;
      const k = Math.min(1, t / dur);
      m.alpha = clamp(k * 2 - 0.2, 0, 1); m.z = -60 * (1 - k); m.moving = true;
      if (chance(dt * 35)) spawn({ type: 'dot', x: tx + rand(-0.6, 0.6), y: ty + rand(-0.6, 0.6), z: 2, vz: rand(30, 80), g: 220, life: 0.6, size: rand(2, 4), color: chance(0.5) ? '#3a2e44' : '#5a4660' });
      if (t > 0.35 && t - dt <= 0.35) { smoke(tx, ty, 2, '#2a2034', 6, 12); sfx('thud', 0.5); }
      if (k >= 1) done(m, tx, ty);
    };
  } else if (kind === 'climb') {
    // hauls itself up the island's edge from the void below and over the lip
    const vx = at?.vx || 0, vy = at?.vy || 1, sx = (at?.x ?? tx) + vx * 0.55, sy0 = (at?.y ?? ty) + vy * 0.55, ex = at?.x ?? tx, ey = at?.y ?? ty;
    const dur = 1.0 + (m.rank === 'boss' ? 0.6 : 0), drop = m.rank === 'boss' ? 160 : 90;
    m.x = sx; m.y = sy0; m.z = -drop; m.alpha = 1;
    m.entering = (dt) => {
      t += dt; m.animT += dt * 1.6; m.moving = true;
      const k = Math.min(1, t / dur);
      if (k < 0.7) { m.z = -drop * (1 - k / 0.7) + Math.sin(t * 14) * 3; }
      else { const q = (k - 0.7) / 0.3; m.z = Math.sin(q * Math.PI) * 10; m.x = sx + (ex - sx) * q; m.y = sy0 + (ey - sy0) * q; }
      if (chance(dt * 20)) spawn({ type: 'dot', x: sx + rand(-0.3, 0.3), y: sy0 + rand(-0.3, 0.3), z: m.z + rand(0, 20), vz: -rand(10, 40), g: 200, life: 0.8, size: rand(1.5, 3), color: '#4a3a52' });
      if (k >= 1) { done(m, ex, ey); smoke(ex, ey, 3, '#3a2a4a', 6, 10); sfx('thud', 0.5); if (m.rank === 'boss') camera.shake(8); }
    };
    sfx('swing', 0.4);
  } else if (kind === 'sky') {
    // swoops in from the void, high up, and lands
    const a = rng.next() * TAU, fx = tx + Math.cos(a) * 7, fy = ty + Math.sin(a) * 7, dur = 1.0, H = 360;
    m.x = fx; m.y = fy; m.z = H; m.alpha = 1;
    addEffect(new Telegraph({ kind: 'circle', x: tx, y: ty, r: 1.2 * big, dur, color: '#c070ff' }), 'ground');
    m.entering = (dt) => {
      t += dt; m.animT += dt;
      const k = Math.min(1, t / dur), e = 1 - (1 - k) * (1 - k);
      m.x = fx + (tx - fx) * e; m.y = fy + (ty - fy) * e; m.z = H * (1 - k) * (1 - k);
      if (chance(dt * 40)) spawn({ type: 'glow', x: m.x, y: m.y, z: m.z + 20, vz: 10, life: 0.5, size: 3, size1: 0, color: VIOLET, add: true });
      if (k >= 1) land(tx, ty);
    };
    sfx('swing', 0.6);
  } else if (kind === 'rift') {
    // a violet tear opens upright in the air; it steps out of it
    const dur = 0.7;
    m.alpha = 0;
    world.addHazard(new Fx({ x: tx, y: ty, dur: 2, lift: -0.1, paint: paintTear }));
    m.entering = (dt) => {
      t += dt; m.animT += dt;
      m.alpha = clamp((t - 0.3) / 0.4, 0, 1);
      if (chance(dt * 30)) sparkle(tx + rand(-0.3, 0.3), ty + rand(-0.3, 0.3), rand(10, 70), '#e0a0ff', 1, 0.2);
      if (t >= dur) { done(m, tx, ty); addEffect(new Ring(tx, ty, 0.2, 1.6, 0.35, VIOLET, 4)); sfx('arcane', 0.5); }
    };
    sfx('portal', 0.35);
  } else if (kind === 'meteor') {
    // inside a breachstone that falls burning violet; it climbs out of the crater
    const dur = 0.9;
    hide(m);
    world.addHazard(new Delayed({ world, src: m, x: tx, y: ty, r: 1.3, delay: dur, dmg: [m.dmg * 0.5, m.dmg * 0.8], el: 'arcane', fx: 'meteor' }));
    m.entering = (dt) => {
      t += dt;
      if (t < dur) return;
      m.alpha = clamp((t - dur) / 0.3, 0, 1); m.z = -20 * (1 - m.alpha); m.moving = true; m.animT += dt;
      if (t >= dur + 0.3) { done(m, tx, ty); smoke(tx, ty, 4, '#2a1a34', 10, 14); }
    };
  } else if (kind === 'march') {
    // comes running in over the walkway, out of the haze
    m.alpha = 0;
    m.entering = (dt) => { t += dt; m.alpha = Math.min(1, t / 0.4); if (t >= 0.4) done(m, tx, ty); };
  } else if (kind === 'chain') {
    // lowered from far above on a violet chain, which then draws back up
    const dur = 1.2, H = 300;
    m.z = H; m.alpha = 1;
    const ch = world.addHazard(new Fx({ x: tx, y: ty, m, lift: 0.4, up: 0, paint: paintChain, step(dt2, f) { if (!m.entering) f.up += dt2; return f.up < 0.6 && !m.dead; } }));
    m.entering = (dt) => {
      t += dt; m.animT += dt * 0.3;
      const k = Math.min(1, t / dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      m.z = H * (1 - e) + Math.sin(t * 5) * 4 * (1 - k);
      if (k >= 1) { done(m, tx, ty); smoke(tx, ty, 2, '#2a2034', 4, 8); sfx('thud', 0.4); }
    };
    void ch;
    sfx('swing', 0.3);
  } else if (kind === 'coalesce') {
    // motes of the void stream in from all round and take its shape
    const dur = 0.8;
    m.alpha = 0;
    m.entering = (dt) => {
      t += dt; m.animT += dt;
      for (let k = 0; k < 3; k++) if (chance(dt * 30)) {
        const a = rand(TAU), r = rand(1.6, 2.6);
        spawn({ type: 'glow', x: tx + Math.cos(a) * r, y: ty + Math.sin(a) * r, z: rand(10, 60), vx: -Math.cos(a) * r / 0.6, vy: -Math.sin(a) * r / 0.6, life: 0.6, size: rand(2, 3.5), size1: 0.5, color: chance(0.5) ? '#d090ff' : '#ff80e0', add: true });
      }
      m.alpha = clamp((t - 0.4) / 0.4, 0, 1);
      if (t >= dur) { done(m, tx, ty); addEffect(new Ring(tx, ty, 1.8, 0.2, 0.3, '#e0b0ff', 3)); sfx('arcane', 0.45); }
    };
  } else if (kind === 'coffin') {
    // a coffin that wasn't there a moment ago rattles, bursts, and it climbs out
    const ts = world.tileset, sc = (n) => ts.scatter.find((s) => s.name === n);
    const pr = { kind: 'scatter', x: tx, y: ty + 0.05, spr: sc('sealed_wood_coffin') || sc('breached_open_coffin'), k: ts.k, flip: rng.next() < 0.5, light: 0 };
    if (pr.spr) world.props.push(pr);
    hide(m);
    const dur = 0.8;
    m.entering = (dt) => {
      t += dt;
      if (t < dur) { pr.x = tx + Math.sin(t * 40) * 0.03 * (t / dur); return; }
      if (!pr.burst) {
        pr.burst = true; pr.x = tx; const open = sc('breached_open_coffin'); if (open) pr.spr = open;
        burst(tx, ty, 10, 'phys', 14, 3); smoke(tx, ty, 6, '#3a2a2a', 6, 10); sfx('thud', 0.6);
      }
      m.alpha = clamp((t - dur) / 0.5, 0, 1); m.z = -24 * (1 - m.alpha); m.moving = true; m.animT += dt;
      if (t >= dur + 0.5) {
        const fy = world.map.walkable(tx, ty + 0.6) && reachOk(world.map, tx, ty + 0.6) ? ty + 0.6 : ty;   // it steps out of the coffin, if there's ground
        done(m, tx, fy);
        let left = 20;   // the burst coffin lies there 20 s of game time
        world.addHazard({ update: (dt2) => { if ((left -= dt2) > 0) return true; const i = world.props.indexOf(pr); if (i >= 0) world.props.splice(i, 1); return false; }, draw() {} });
      }
    };
  } else if (kind === 'doorway') {
    // a door of the Breach's ruins stands up out of nothing, swings open, and it walks through
    const dir = pick(['SW', 'SE']), designs = Object.keys(world.tileset.doors || {});
    const art = designs.length ? world.tileset.doors[pick(designs)][dir] : null;
    const fx = world.addHazard(new Fx({ x: tx, y: ty, art, dur: 2.6, lift: -0.2, paint: paintDoor }));
    m.alpha = 0;
    let bx = dir === 'SW' ? 0 : 0.7, by = dir === 'SW' ? 0.7 : 0;
    if (!world.map.walkable(tx + bx, ty + by)) bx = by = 0; // a doorway at the island's edge: it steps out where it stands
    m.entering = (dt) => {
      t += dt;
      if (t < 0.5) return;
      const k = clamp((t - 0.5) / 0.5, 0, 1);
      m.alpha = k; m.x = tx + bx * k; m.y = ty + by * k; m.moving = true; m.animT += dt;
      if (k >= 1) done(m, tx + bx, ty + by);
    };
    void fx;
    sfx('door', 0.7);
  } else {
    // falls from straight above (a carrier's rider, a shard's leaper) — opts.from: [x, y, z]
    const [fx, fy, fz] = opts.from || [tx, ty, 300], dur = opts.dur || 0.7;
    m.x = fx; m.y = fy; m.z = fz; m.alpha = 1;
    m.entering = (dt) => {
      t += dt; m.animT += dt;
      const k = Math.min(1, t / dur);
      m.x = fx + (tx - fx) * k; m.y = fy + (ty - fy) * k; m.z = fz * (1 - k * k) + (opts.arc || 0) * Math.sin(k * Math.PI);
      if (k >= 1) land(tx, ty, 2);
    };
  }
}

/** A great flier of the Breach sweeps in over the void with a squad clinging under it, drops them and flies on. */
function carrier(world, o, made, rng) {
  const mx = made.reduce((s, [, a]) => s + a.x, 0) / made.length, my = made.reduce((s, [, a]) => s + a.y, 0) / made.length;
  const a = rng.next() * TAU, dist = 10, dx = Math.cos(a), dy = Math.sin(a);
  const art = BREACH_CARRIERS[Math.floor(rng.next() * BREACH_CARRIERS.length)];
  const base = elevationAt(mx, my), Z = 150;
  for (const [m] of made) hide(m);
  const riders = made.map(([m, at], k) => ({ art: m.art, swap: m.swap, artH: m.artH, ox: (k - (made.length - 1) / 2) * 16, oy: (k % 2) * 6, m, at }));
  const c = new Fx({ x: mx - dx * dist, y: my - dy * dist, z: Z, art, h: 150, seed: rng.next() * 9, flip: dx < 0, riders, base, lift: 1.5, phase: 0,
    step(dt, f) {
      const sp = 13 * dt;
      if (f.phase === 0) {
        const d = Math.hypot(mx - f.x, my - f.y);
        if (d <= sp) { f.x = mx; f.y = my; f.phase = 1; f.hold = 0.4; }
        else { f.x += dx * sp; f.y += dy * sp; }
      } else if (f.phase === 1) {
        f.hold -= dt;
        const k = Math.floor((0.4 - f.hold) / 0.4 * riders.length);
        riders.forEach((r, i) => {
          if (r.dropped || i > k) return;
          r.dropped = true;
          bringOne(world, o, r.m, 'drop', [r.at.x, r.at.y], { from: [f.x, f.y, f.z - 30], dur: 0.6 });
        });
        if (f.hold <= 0) { f.phase = 2; sfx('roar', 0.4); }
      } else { f.x += dx * sp * 1.3; f.y += dy * sp * 1.3; f.z += dt * 90; f.out = (f.out || 0) + dt; if (f.out > 2.5) return false; }
      f.ground = world.map.isFloor(f.x, f.y);
      if (chance(dt * 12)) spawn({ type: 'glow', x: f.x, y: f.y, z: f.z + 40, vz: -20, life: 0.6, size: 4, size1: 0, color: VIOLET, add: true });
      return true;
    },
    paint(ctx, f) { drawCarrier(ctx, f); } });
  world.addHazard(c);
}

/** A broken-off rock shard drifts in out of the void, docks against the island's edge, and its passengers leap off. */
function shard(world, o, made, rng) {
  const [m0, at] = made[0];
  void m0;
  const vx = at.vx || 0, vy = at.vy || 1;
  const dock = [at.x + vx * 2.2, at.y + vy * 2.2], from = [at.x + vx * 12, at.y + vy * 12];
  const base = elevationAt(at.x, at.y);
  for (const [m] of made) hide(m);
  const riders = made.map(([m, a], k) => ({ art: m.art, swap: m.swap, artH: m.artH, ox: (k - (made.length - 1) / 2) * 14, oy: 0, m, at: a }));
  const s = new Fx({ x: from[0], y: from[1], base, riders, seed: rng.next() * 9, phase: 0, lift: 0.8, w: 1.4 + made.length * 0.25,
    step(dt, f) {
      if (f.phase === 0) {
        const k = Math.min(1, f.t / 1.3), e = 1 - Math.pow(1 - k, 3);
        f.x = from[0] + (dock[0] - from[0]) * e; f.y = from[1] + (dock[1] - from[1]) * e;
        if (k >= 1) { f.phase = 1; f.t0 = f.t; sfx('thud', 0.5); camera.shake(2); }
      } else if (f.phase === 1) {
        riders.forEach((r, i) => {
          if (r.dropped || f.t - f.t0 < i * 0.12) return;
          r.dropped = true;
          // the island under the passengers is level with the shard: they leap across in an arc
          bringOne(world, o, r.m, 'drop', [r.at.x, r.at.y], { from: [f.x, f.y, 0], dur: 0.55, arc: 40 });
        });
        if (riders.every((r) => r.dropped) && f.t - f.t0 > 1.2) f.phase = 2;
      } else { f.x += vx * dt * 2; f.y += vy * dt * 2; f.fade = (f.fade || 0) + dt; if (f.fade > 2) return false; }
      return true;
    },
    paint: paintShard });
  world.addHazard(s);
}

// ======================================================================= painters
function paintTear(ctx, f) {
  const x = isoX(f.x, f.y), y = isoY(f.x, f.y), k = f.t < 0.5 ? f.t / 0.5 : f.t > 1.5 ? Math.max(0, (2 - f.t) / 0.5) : 1;
  if (k <= 0) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.8 * k; ctx.drawImage(glowSprite(VIOLET), x - 40, y - 100, 80, 110);
  ctx.fillStyle = '#f0d0ff'; ctx.beginPath(); ctx.ellipse(x, y - 40, 5 * k, 38 * k, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.6 * k; ctx.strokeStyle = '#ff70e0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y - 40, 9 * k, 44 * k, 0, 0, TAU); ctx.stroke();
  ctx.restore();
}
function paintChain(ctx, f) {
  const m = f.m;
  if (!m || m.dead) return;
  const x = isoX(m.x, m.y), y = isoY(m.x, m.y) - (m.z || 0) - (m.artH || 50) * (m.scale || 1) * 0.9, top = y - 600 + f.up * 1000;
  if (top >= y) return;
  ctx.save();
  ctx.strokeStyle = '#3a2a48'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, y); ctx.stroke();
  ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(200,120,255,0.6)'; ctx.lineWidth = 1;
  for (let yy = y; yy > top; yy -= 9) { ctx.beginPath(); ctx.ellipse(x, yy, 2.5, 4, 0, 0, TAU); ctx.stroke(); }
  ctx.restore();
}
function paintDoor(ctx, f) {
  const a = f.t < 0.4 ? f.t / 0.4 : f.t > 2 ? Math.max(0, (2.6 - f.t) / 0.6) : 1, art = f.art;
  if (!art || a <= 0) return;
  const k = G.world?.tileset?.k || 0.4, x = isoX(f.x, f.y), y = isoY(f.x, f.y);
  const sl = f.t < 0.5 ? art.closed : art.open;
  ctx.save(); ctx.globalAlpha = a;
  ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glowSprite(VIOLET), x - 50, y - 110, 100, 120);
  ctx.globalCompositeOperation = 'source-over';
  for (const r of sl || []) ctx.drawImage(r.img, r.sx, r.sy, r.w, r.h, x + r.ox * k, y + r.oy * k, r.w * k, r.h * k);
  ctx.restore();
}
function paintShard(ctx, f) {
  const a = f.fade ? Math.max(0, 1 - f.fade / 2) : Math.min(1, f.t / 0.5);
  const x = isoX(f.x, f.y), bob = Math.sin(G.time * 2 + f.seed) * 4, y = (f.x + f.y) * HH - f.base + bob, w = f.w * 32;
  ctx.save(); ctx.globalAlpha = a;
  // the top: a ragged diamond of island ground, its underside a jagged cone
  ctx.fillStyle = '#1a1024';
  ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(x - w * 0.3, y + w * 0.5); ctx.lineTo(x, y + w * 1.4); ctx.lineTo(x + w * 0.35, y + w * 0.55); ctx.lineTo(x + w, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3a2c40';
  ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(x, y - w * 0.5); ctx.lineTo(x + w, y); ctx.lineTo(x, y + w * 0.5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(190,110,255,0.7)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * 0.5; ctx.drawImage(glowSprite(VIOLET), x - 16, y + w * 1.1, 32, 32);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
  for (const r of f.riders) {
    if (r.dropped) continue;
    const img = enemyImage(r.art, r.swap);
    if (!img) continue;
    const h = r.artH || 50, ww = h * img.width / img.height;
    ctx.drawImage(img, x + r.ox - ww / 2, y - h + 4, ww, h);
  }
  ctx.restore();
}
/** Draws a ward wherever the hazards are drawn (exported for the tests' screenshots). */
export { drawWard };

// ======================================================================= the scenarios
// Each: title, desc, start(x), update(x, dt); `boss` ones are the large islands' fights. x is the scenario context
// (makeScenario): S, world, o, C, spot, mark, unmark, prop, flash, monster, wave, boss, phases, live, report, finish...
const any = (x, list) => list[Math.floor(x.rng.next() * list.length)];
export const SCENARIOS = {
  // Four waves, each arriving a different way.
  surge: {
    title: 'Breach Surge', desc: 'The Breach pours its brood onto this island. Break four waves, each come a different way.',
    start(x) {
      const kinds = shuffleR(ARRIVALS.slice(), x.rng).slice(0, 4);
      x.phases(kinds.map((k, i) => () => { x.wave(k, 2 + i + Math.floor(x.floor / 8), { champ: i === 3 }); floatText(x.C[0], x.C[1], 90, ARRIVAL_NAMES[k], '#e0b0ff', 14, { life: 1.6 }); }), () => x.finish());
    },
    update() {},
  },
  // Three anchor stones; stand by each until it's anchored, while climbers come over the edges.
  anchor: {
    title: 'Anchor the Island', desc: 'The island is tearing loose. Stand by each of the three anchor stones until it binds, while the brood climbs over the edges.',
    start(x) {
      const { S } = x;
      S.goal = 3; S.stage = 0; x.anchors = [0, 1, 2].map((k) => {
        const a = (k / 3) * TAU + x.rng.next(), p = x.spot(3.5, 7, [x.C[0] + Math.cos(a) * 5, x.C[1] + Math.sin(a) * 5]);
        return { p, prog: 0, pr: x.prop('rift_chain_and_shackle', p) || x.prop('chain_and_shackle', p) };
      });
      x.cur = 0; x.waveT = 2;
      S.progress = () => `Anchors bound ${S.stage}/3${x.anchors[x.cur] ? ` · ${Math.floor(x.anchors[x.cur].prog)}%` : ''}`;
      const goal = { autoGoal: () => (x.anchors[x.cur] ? { x: x.anchors[x.cur].p[0], y: x.anchors[x.cur].p[1], r: 1.3 } : null), dead: false, update: () => !goal.dead, draw() {} };
      x.world.addHazard(goal); x.goal = goal;
      S.cleanup = () => { goal.dead = true; };
    },
    update(x, dt) {
      const { S, world } = x, p = world.player, A = x.anchors[x.cur];
      if (!A) { if (!x.live()) x.finish(); return; }
      S.objective = { x: A.p[0], y: A.p[1], reach: 1 };
      addEffect(new Ring(A.p[0], A.p[1], 1.2, 1.25, 0.05, '#e0a0ff', 2), 'ground');
      if (Math.hypot(p.x - A.p[0], p.y - A.p[1]) < 1.4) A.prog = Math.min(100, A.prog + dt * 100 / 9);
      if (A.prog >= 100) { x.flash(A.p, '#ffe0ff', 2.6); S.stage++; x.cur++; x.report(`Anchor ${S.stage} binds.`); if (x.cur >= 3) S.objective = undefined; }
      if ((x.waveT -= dt) <= 0 || x.calm()) { x.waveT = 9; if (S.foes.filter((m) => !m.dead).length < 8) x.wave('climb', 2 + Math.floor(x.floor / 10)); }
    },
  },
  // Carriers bring squad after squad; then their master lands.
  ferry: {
    title: "The Ferryman's Flock", desc: 'Carrier beasts ferry the brood across the void. Survive four drops, then slay the Ferryman when it lands.',
    start(x) { x.S.goal = 5; x.S.stage = 0; x.dropT = 1; },
    update(x, dt) {
      const { S } = x;
      if (S.stage < 4) { if ((x.dropT -= dt) <= 0 || x.calm()) { x.dropT = 9; S.stage++; x.wave('ride', 3 + Math.floor(x.floor / 8)); } return; }
      if (!x.master && !x.live()) {
        S.stage = 5;
        const arch = x.world.looks.pick('bat') ? 'bat' : 'gargoyle';
        x.master = x.track(x.monster(arch, x.spot(2, 5), 'champion', x.world.looks.pick(arch)));
        x.master.name = 'The Ferryman'; x.master.maxHp *= 2.5; x.master.hp = x.master.maxHp; x.master.scale = 1.6;
        x.world.add(x.master);
        bringOne(x.world, x.o, x.master, 'sky', [x.master.x, x.master.y], { rng: x.rng });
      }
      if (x.master && x.master.dead && !x.live()) x.finish();
    },
  },
  // Coffins appear and rattle; seal each before it bursts.
  coffins: {
    title: 'The Coffin Choir', desc: 'Six coffins sing on the island. Seal each before it bursts: stand by it while the seal takes; the choir answers every seal.',
    start(x) {
      const { S } = x;
      S.goal = 6; S.stage = 0; x.left = 6;
      x.cofs = [0, 1, 2, 3, 4, 5].map((k) => {
        const p = x.spot(2.5, 7.5), pr = x.prop('sealed_wood_coffin', p, { flip: k % 2 === 0, scale: 1.3 });
        const cf = { p, pr, t: 12 + k * 4 };
        // sealing takes 2 s beside the coffin, and the choir answers with a few of the brood
        cf.mk = x.mark('Seal the Coffin', p, () => { if (cf.seal === undefined) { cf.seal = 0; if (!cf.called) { cf.called = true; x.wave('coalesce', 1 + Math.floor(x.floor / 8), { near: { x: p[0], y: p[1] } }); sfx('arcane', 0.4); } } }, '#e0c080');
        return cf;
      });
      S.progress = () => `Coffins dealt with ${S.stage}/6`;
    },
    update(x, dt) {
      const { S } = x, P = x.world.player;
      for (const cf of x.cofs) {
        if (cf.done) continue;
        if (cf.seal !== undefined) {
          if (Math.hypot(P.x - cf.p[0], P.y - cf.p[1]) < 1.9) cf.seal += dt; else cf.seal = undefined;
          if (cf.seal >= 2) { x.unmark(cf.mk); cf.done = true; S.stage++; x.flash(cf.p, '#ffe0a0', 1.6); sfx('gate', 0.4); continue; }
          addEffect(new Ring(cf.p[0], cf.p[1], 1.2, 1.2 * (1 - cf.seal / 2) + 0.05, 0.05, '#ffe0a0', 2), 'ground');
        }
        cf.t -= dt;
        if (cf.pr) cf.pr.x = cf.p[0] + (cf.t < 4 ? Math.sin(x.S.seconds * 40) * 0.03 : 0);
        if (cf.t <= 0) {
          cf.done = true; x.unmark(cf.mk); S.stage++;
          const open = x.world.tileset.scatter.find((s) => s.name === 'breached_open_coffin'); if (open && cf.pr) cf.pr.spr = open;
          burst(cf.p[0], cf.p[1], 10, 'phys', 14, 3);
          for (let k = 0; k < 2 + Math.floor(x.floor / 8); k++) { const m = x.track(x.monster(breachArch(x.rng.fn()), cf.p)); x.world.add(m); bringOne(x.world, x.o, m, 'rise', x.landAt([cf.p[0] + rand(-0.8, 0.8), cf.p[1] + rand(0.3, 1)], 1.2), { rng: x.rng }); }
          x.report('A coffin bursts!', '#ffb080');
        }
      }
      const next = x.cofs.filter((cf) => !cf.done).sort((a, b) => (b.seal ?? -1) - (a.seal ?? -1) || a.t - b.t)[0];
      S.objective = next && (!x.live() || next.seal !== undefined) ? { x: next.p[0], y: next.p[1], reach: 1.2, use: () => next.mk.use() } : undefined;
      if (S.stage >= 6 && !x.live()) x.finish();
    },
  },
  // Doorways stand open in the air, letting the brood through; close them.
  doors: {
    title: 'Doorways from Nowhere', desc: 'Four doors stand open in the empty air and the brood walks through them. Close every door.',
    start(x) {
      const { S } = x;
      S.goal = 4; S.stage = 0;
      x.doors = [0, 1, 2, 3].map(() => {
        const p = x.spot(3, 7.5), d = { p, t: 1 + x.rng.next() * 2 };
        d.fx = new Fx({ x: p[0], y: p[1], art: doorArt(x.world, x.rng), lift: -0.2, open: true, paint: paintStandingDoor, step: () => !d.shut });
        x.world.addHazard(d.fx);
        d.mk = x.mark('Close the Door', [p[0] + 0.6, p[1] + 0.6], () => {
          x.unmark(d.mk); d.shut = true; S.stage++; x.flash(p, '#e0b0ff', 2);
          const g = x.track(x.monster(breachArch(x.rng.fn()), p, x.floor >= 4 ? 'champion' : 'normal')); x.world.add(g); bringOne(x.world, x.o, g, 'rift', p, { rng: x.rng });
        });
        return d;
      });
      S.progress = () => `Doors closed ${S.stage}/4`;
      S.cleanup = () => { for (const d of x.doors) d.shut = true; };
    },
    update(x, dt) {
      const { S } = x;
      for (const d of x.doors) {
        if (d.shut) continue;
        if ((d.t -= dt) <= 0 || x.calm()) { d.t = 11; if (x.S.foes.filter((m) => !m.dead).length < 7) { const m = x.track(x.monster(breachArch(x.rng.fn()), d.p)); x.world.add(m); bringOne(x.world, x.o, m, 'march', x.landAt([d.p[0] + 0.5, d.p[1] + 0.5], 1.2), { rng: x.rng }); } }
      }
      const open = x.doors.filter((d) => !d.shut), p = x.world.player;
      const near = open.sort((a, b) => Math.hypot(a.p[0] - p.x, a.p[1] - p.y) - Math.hypot(b.p[0] - p.x, b.p[1] - p.y))[0];
      S.objective = near ? { x: near.mk.x, y: near.mk.y, reach: 1.4, use: () => near.mk.use() } : undefined;
      if (S.stage >= 4 && !x.live()) x.finish();
    },
  },
  // Breachstone rains down; survive until the sky clears.
  starfall: {
    title: 'Starfall', desc: 'The Breach throws stones of the void at the island. Survive the starfall; some of the stones are hatching.',
    start(x) { x.S.timer = 40; x.fallT = 0.5; x.hatchT = 3; x.S.progress = () => `The sky clears in ${Math.max(0, Math.ceil(x.S.timer - x.S.seconds))}s`; },
    update(x, dt) {
      const { S, world } = x, p = world.player;
      if (S.seconds >= S.timer) { if (!x.live()) x.finish(); else S.progress = () => 'The sky is clear: finish the hatchlings'; return; }
      if ((x.fallT -= dt) <= 0) {
        x.fallT = Math.max(0.5, 1.2 - x.floor * 0.02);
        const a = rand(TAU), r = rand(0.5, 3.5), tx = p.x + Math.cos(a) * r, ty = p.y + Math.sin(a) * r;
        if (world.map.isFloor(tx, ty)) world.addHazard(new Delayed({ world, team: 'enemy', src: null, x: tx, y: ty, r: 1.2, delay: 1.3, dmg: starDmg(x), el: 'arcane', fx: 'meteor' }));
      }
      if ((x.hatchT -= dt) <= 0 || x.calm()) { x.hatchT = 7; x.wave('meteor', 2 + Math.floor(x.floor / 9)); }
    },
  },
  // Wave after wave lowered on chains.
  chains: {
    title: 'The Hanging Host', desc: 'Something far above lowers its host on violet chains. Cut down four descents.',
    start(x) { x.phases([0, 1, 2, 3].map((i) => () => x.wave('chain', 3 + i + Math.floor(x.floor / 8), { champ: i >= 2 })), () => x.finish()); },
    update() {},
  },
  // The shrine pulls everything toward it; shatter the resonators.
  gravity: {
    title: 'The Gravity Well', desc: 'The shrine has become a well that drags you to it. Shatter the three resonators on the island\'s edge.',
    start(x) {
      const { S } = x;
      S.goal = 3; S.stage = 0;
      const rims = x.rims();
      x.res = [0, 1, 2].map((k) => {
        const i = rims[Math.floor((k + x.rng.next() * 0.5) / 3 * rims.length) % rims.length], W = x.map.w;
        const p = [(i % W) + 0.5, ((i / W) | 0) + 0.5], pr = x.prop('violet_shard_cluster', p, { light: 3, lightColor: '#d070ff' }) || x.prop('violet_quartz_boulder', p);
        const r = { p, pr };
        r.mk = x.mark('Shatter the Resonator', p, () => { x.unmark(r.mk); r.done = true; x.dropProp(r.pr); S.stage++; x.flash(p, '#ff90ff', 2.4); burst(p[0], p[1], 20, 'arcane', 20, 4); x.wave('coalesce', 2 + Math.floor(x.floor / 9)); }, '#ff80ff', 1.9);
        return r;
      });
      x.wave('coalesce', 3);
      S.progress = () => `Resonators shattered ${S.stage}/3`;
    },
    update(x, dt) {
      const { S, world, C } = x, p = world.player;
      if (S.stage < 3) {
        // the pull: gentle near the well, strongest at mid range, never into a wall
        const d = Math.hypot(C[0] - p.x, C[1] - p.y);
        if (d > 1.5) world.map.move(p, (C[0] - p.x) / d * dt * 1.15, (C[1] - p.y) / d * dt * 1.15);
        if (x.rng.next() < dt * 6) spawn({ type: 'glow', x: C[0] + rand(-3, 3), y: C[1] + rand(-3, 3), z: rand(5, 40), vx: 0, vy: 0, life: 0.6, size: 2, size1: 0, color: '#c080ff', add: true });
        const left = x.res.filter((r) => !r.done).sort((a, b) => Math.hypot(a.p[0] - p.x, a.p[1] - p.y) - Math.hypot(b.p[0] - p.x, b.p[1] - p.y))[0];
        S.objective = left ? { x: left.p[0], y: left.p[1], reach: 1.6, use: () => left.mk.use() } : undefined;
        if ((x.addT = (x.addT ?? 6) - dt) <= 0 || x.calm()) { x.addT = 10; if (S.foes.filter((m) => !m.dead).length < 8) x.wave('coalesce', 2); }
      } else { S.objective = undefined; if (!x.live()) x.finish(); }
    },
  },
  // Rebuild the broken walkway: gather the drifting stones.
  stones: {
    title: 'Walkway Stones', desc: 'Three keystones of the walkways drift loose over the island. Gather them and set them in the shrine while the brood marches in.',
    start(x) {
      const { S } = x;
      S.goal = 3; S.stage = 0; x.carry = 0; x.marchT = 2;
      x.stones = [0, 1, 2].map(() => ({ p: x.spot(4, 8), ph: x.rng.next() * 6 }));
      x.stones.forEach((s) => { s.mk = x.mark('Keystone', s.p, () => { x.unmark(s.mk); s.got = true; x.carry++; x.flash(s.p, '#f0d0ff', 1.4); sfx('gold', 0.5); }, '#f0c0ff', 1.5); });
      x.socket = x.mark('Set the Keystones', [x.C[0] - 0.8, x.C[1] + 0.8], () => {
        if (!x.carry) { floatText(x.C[0], x.C[1], 70, 'Bring the keystones here', '#e0c0ff', 12, { life: 1.2 }); return; }
        S.stage += x.carry; x.carry = 0; x.flash(x.C, '#ffe0ff', 3); sfx('gate', 0.5);
        if (S.stage >= 3) x.unmark(x.socket);
      }, '#ffe0ff', 1.8);
      S.progress = () => `Keystones set ${S.stage}/3${x.carry ? ` · carrying ${x.carry}` : ''}`;
    },
    update(x, dt) {
      const { S, world } = x, p = world.player;
      for (const s of x.stones) {
        if (s.got) continue;
        // drift in slow circles round where they fell
        const nx = s.p[0] + Math.cos(S.seconds * 0.4 + s.ph) * 0.8, ny = s.p[1] + Math.sin(S.seconds * 0.4 + s.ph) * 0.8;
        if (world.map.walkable(nx, ny) && reachOk(world.map, nx, ny)) { s.mk.x = nx; s.mk.y = ny; }
      }
      if (S.stage < 3 && ((x.marchT -= dt) <= 0 || x.calm()) && S.foes.filter((m) => !m.dead).length < 8) { x.marchT = 9; x.wave(x.rng.next() < 0.6 ? 'march' : 'climb', 2 + Math.floor(x.floor / 9)); }
      if (S.stage >= 3) { S.objective = undefined; if (!x.live()) x.finish(); return; }
      const loose = x.stones.filter((s) => !s.got).sort((a, b) => Math.hypot(a.mk.x - p.x, a.mk.y - p.y) - Math.hypot(b.mk.x - p.x, b.mk.y - p.y))[0];
      const to = loose && !(x.carry && x.carry + S.stage >= 3) ? loose.mk : x.socket;
      S.objective = { x: to.x, y: to.y, reach: 1.3, use: () => to.use() };
    },
  },
  // The brood climbs over every edge until its root grapples are cut.
  grapples: {
    title: 'The Rising Tide', desc: 'Root grapples hold the island while the brood swarms up its edges. Cut all four grapples.',
    start(x) {
      const { S } = x;
      S.goal = 4; S.stage = 0; x.climbT = 1;
      const rims = x.rims(), W = x.map.w;
      x.grap = [0, 1, 2, 3].map((k) => {
        const i = rims[Math.floor(((k + 0.5) / 4) * rims.length) % rims.length], p = [(i % W) + 0.5, ((i / W) | 0) + 0.5];
        const g = { p, pr: x.prop('petrified_root_coil', p) || x.prop('dead_tree_root_cluster', p) };
        g.mk = x.mark('Cut the Grapple', p, () => { x.unmark(g.mk); g.done = true; x.dropProp(g.pr); S.stage++; x.flash(p, '#c0ff90', 2); sfx('swing', 0.6); }, '#c0e080', 1.9);
        return g;
      });
      S.progress = () => `Grapples cut ${S.stage}/4`;
    },
    update(x, dt) {
      const { S, world } = x, p = world.player;
      if ((x.climbT -= dt) <= 0 || x.calm()) {
        x.climbT = Math.max(7, 11 - S.stage);
        const g = x.grap.filter((q) => !q.done);
        if (g.length && S.foes.filter((m) => !m.dead).length < 6) x.wave('climb', 2, { near: { x: pick(g).p[0], y: pick(g).p[1] } });
      }
      const near = x.grap.filter((g) => !g.done).sort((a, b) => Math.hypot(a.p[0] - p.x, a.p[1] - p.y) - Math.hypot(b.p[0] - p.x, b.p[1] - p.y))[0];
      S.objective = near ? { x: near.p[0], y: near.p[1], reach: 1.6, use: () => near.mk.use() } : undefined;
      if (S.stage >= 4 && !x.live()) x.finish();
    },
  },
  // Stand in the shrine's circle while everything arrives at once.
  hold: {
    title: 'Hold the Shrine', desc: 'Stand within the shrine\'s circle until it is fully lit (it only fills while you are inside). Everything the Breach has comes for you.',
    start(x) {
      const { S } = x;
      x.prog = 0; x.arrT = 1;
      const goal = { autoGoal: () => (S.active ? { x: x.C[0], y: x.C[1] + 0.8, r: 1.6 } : null), dead: false, update: () => !goal.dead, draw() {} };
      x.world.addHazard(goal);
      S.cleanup = () => { goal.dead = true; };
      S.progress = () => `The shrine is lit ${Math.floor(x.prog)}%`;
    },
    update(x, dt) {
      const { S, world, C } = x, p = world.player;
      const inside = Math.hypot(p.x - C[0], p.y - C[1] - 0.8) < 3.2;
      if (x.prog < 100) {
        if (inside) x.prog = Math.min(100, x.prog + dt * 100 / 35);
        addEffect(new Ring(C[0], C[1] + 0.8, 3.2, 3.25, 0.05, inside ? '#ffd0ff' : '#a060c0', 3), 'ground');
        S.objective = { x: C[0], y: C[1] + 0.8, reach: 1.2 };
        if ((x.arrT -= dt) <= 0 || x.calm()) { x.arrT = 7.5; if (S.foes.filter((m) => !m.dead).length < 9) x.wave(pick(ARRIVALS), 3 + Math.floor(x.floor / 9)); }
      } else { S.objective = undefined; if (!x.live()) x.finish(); }
    },
  },
  // Pulsing nests hatch the brood until they're broken.
  brood: {
    title: 'The Breach Brood', desc: 'Four nests of the void pulse on the island, hatching crawlers. Break every nest.',
    start(x) {
      const { S } = x;
      S.goal = 4; S.stage = 0;
      const nestArt = BREACH_MONSTERS.filter((a) => a.family === 'Bile and Fungal Horrors' || a.family === 'Deep Crawlers and Brood');
      x.nests = [0, 1, 2, 3].map(() => {
        const p = x.spot(3, 7.5), a = nestArt[Math.floor(x.rng.next() * nestArt.length)];
        const m = x.track(x.monster('shroom', p, 'normal', { art: a.id, swap: null }));
        m.static = true; m.speed = 0; m.maxHp *= 4; m.aura = '#ff60c0'; m.scale = 1.25; m.hp = m.maxHp; m.name = 'Breach Nest'; m.nest = true; m.hatchT = 3 + x.rng.next() * 3;
        x.world.add(m); bringOne(x.world, x.o, m, 'rise', p, { rng: x.rng });
        return m;
      });
      S.onFoeDeath = (m) => { if (m.nest) { S.stage++; x.flash([m.x, m.y], '#ff90c0', 2); } };
      S.progress = () => `Nests broken ${S.stage}/4`;
    },
    update(x, dt) {
      const { S } = x;
      for (const n of x.nests) {
        if (n.dead || !n.targetable) continue;
        if (((n.hatchT -= dt) <= 0 || x.calm()) && S.foes.filter((m) => !m.dead).length < 7) {
          n.hatchT = 9;
          for (let k = 0; k < 1 + (x.floor >= 6 ? 1 : 0); k++) { const m = x.track(x.monster(any(x, ['spider', 'scorpion', 'worm', 'ghoul']), [n.x, n.y])); x.world.add(m); bringOne(x.world, x.o, m, 'rise', x.landAt([n.x + rand(-1, 1), n.y + rand(0.5, 1.2)], 1.2), { rng: x.rng }); }
        }
      }
      if (S.stage >= 4 && !x.live()) x.finish();
    },
  },
  // ---- boss fights (the large islands)
  duel: {
    boss: true, title: "A Sovereign's Duel", desc: 'A sovereign of the Breach hauls itself over the island\'s edge. Bring it down; its brood answers its call.',
    start(x) {
      x.b = x.boss(x.bossIndex(), pick(['climb', 'rise', 'chain']));
      x.calls = [0.66, 0.33];
    },
    update(x) {
      const { b } = x;
      if (x.calls.length && b.hp < b.maxHp * x.calls[0]) { x.calls.shift(); x.wave(pick(['rift', 'coalesce', 'climb', 'sky']), 3 + Math.floor(x.floor / 8)); x.report(`${b.name} calls its brood!`, '#ff90c0'); }
      if (b.dead && !x.live()) x.finish();
    },
  },
  courier: {
    boss: true, title: 'The Dread Courier', desc: 'A carrier beast drops a sovereign of the Breach onto the island, and keeps coming back with more.',
    start(x) {
      x.dropT = 2; x.b = null;
      const i = x.bossIndex(), p = x.spot(3, 5);
      const b = x.world.looks.boss(i);
      const m = x.monster(b.arch, p, 'boss', b.look);
      m.name = b.art.name; m.breachBoss = true; x.track(m); x.world.add(m); x.world.boss = m; x.b = m;
      carrier(x.world, x.o, [[m, { x: p[0], y: p[1] }]], x.rng);
      UI.centerMsg(m.name.toUpperCase(), 'Delivered by the Dread Courier', 3);
      sfx('boss');
    },
    update(x, dt) {
      if ((x.dropT -= dt) <= 0 || x.calm()) { x.dropT = 16; if (!x.b.dead && x.S.foes.filter((m) => !m.dead).length < 10) x.wave('ride', 3 + Math.floor(x.floor / 9)); }
      if (x.b.dead && !x.live()) x.finish();
    },
  },
  // ---- the floor's final boss
  heart: {
    title: 'The Breach Heart', desc: 'The Heart of the floor opens. Its keeper rises: twice it will shield itself behind Heart Shards; break them to reach it.',
    start(x) {
      x.b = x.boss(finalBossIndex(x.floor), 'rise', [x.C[0] + 0.5, x.C[1] + 3]);
      x.b.maxHp *= 1.5; x.b.hp = x.b.maxHp;
      x.shields = [0.66, 0.33]; x.shards = [];
      x.S.progress = () => (x.shards.some((s) => !s.dead) ? `Break the Heart Shards ${x.shards.filter((s) => s.dead).length}/${x.shards.length}` : `${x.b.name}: ${Math.ceil(x.b.hp / x.b.maxHp * 100)}%`);
    },
    update(x) {
      const { b } = x;
      if (x.shields.length && b.hp < b.maxHp * x.shields[0] && !b.dead) {
        x.shields.shift();
        b.targetable = false; b.shielded = true;
        x.report(`${b.name} hides behind the Heart Shards!`, '#ff80d0');
        UI.centerMsg('HEART SHARDS', 'Break them to strike the keeper again', 2.4);
        const eyes = BREACH_MONSTERS.filter((a) => a.arch === 'eye' || a.family === 'Breachborn Geometry');
        x.shards = [0, 1, 2].map((k) => {
          const a = (k / 3) * TAU, p = [x.C[0] + Math.cos(a) * 4.5, x.C[1] + Math.sin(a) * 4.5];
          const at = x.landAt(p, 1.5);   // a shard on a crag top held the Heart shut until it sank as a straggler (30 s)
          const m = x.track(x.monster('eye', at, 'champion', { art: eyes[Math.floor(x.rng.next() * eyes.length)].id, swap: null }));
          m.static = true; m.name = 'Heart Shard'; m.maxHp *= 1.4; m.hp = m.maxHp;
          m.netId = `breach_shard_${x.shields.length}_${k}`;
          x.world.add(m); bringOne(x.world, x.o, m, 'rift', at, { rng: x.rng });
          return m;
        });
        x.wave(pick(['ride', 'sky', 'climb', 'doorway']), 3 + Math.floor(x.floor / 8));
      }
      if (b.shielded) {
        addLight(b.x, b.y, 3, 1, 40, '#ff60d0');
        if (Math.random() < 0.3) sparkle(b.x + rand(-0.6, 0.6), b.y + rand(-0.6, 0.6), rand(20, 90), '#ff90e0', 1, 0.2);
        if (x.shards.every((s) => s.dead)) { b.targetable = true; b.shielded = false; x.flash([b.x, b.y], '#ffffff', 3); x.report('The shield shatters!', '#ffe0ff'); }
      }
      if (b.dead && !x.live()) x.finish();
    },
  },
};

const starDmg = (x) => { const d = monsterBase(x.lvl).dmg; return [d * 0.7, d * 1.0]; };
function doorArt(world, rng) {
  const d = world.tileset.doors || {}, k = Object.keys(d);
  return k.length ? d[k[Math.floor(rng.next() * k.length)]][rng.next() < 0.5 ? 'SW' : 'SE'] : null;
}
function paintStandingDoor(ctx, f) {
  const art = f.art;
  if (!art) return;
  const k = G.world?.tileset?.k || 0.4, x = isoX(f.x, f.y), y = isoY(f.x, f.y), a = Math.min(1, f.t / 0.5);
  ctx.save(); ctx.globalAlpha = a;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * (0.5 + 0.2 * Math.sin(G.time * 4 + f.x)); ctx.drawImage(glowSprite(VIOLET), x - 55, y - 120, 110, 130);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
  for (const r of art.open || []) ctx.drawImage(r.img, r.sx, r.sy, r.w, r.h, x + r.ox * k, y + r.oy * k, r.w * k, r.h * k);
  ctx.restore();
}
