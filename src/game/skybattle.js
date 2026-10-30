// THE SKY BATTLE (docs/SKY_BATTLE.md): the heroes' ironclad (world/skyship.js) over open sky, and the director that runs
// the fight on its deck. The hero steps out of the portal in the bridge's great door; Air Pirate boats lie alongside to
// port and their crews leap the rail in waves; a captain leads the third; two more waves; then a parley with the next
// captain and two sky-knights sworn to Velscour (data/skytalk.js, 2,000 talks), a truce, and the flagship out of the
// clouds: a cannon duel as she closes, grappling hooks from both ships, two captains over the rail, the last fight. The
// gate turns to the exit and a hoard chest rises on the hatch. Eight variants (data/skybattle.js) change the sky, and in
// six the weather fights too. Cut scenes are game/cinema.js; drawing is gfx/skyship.js.
import { G } from '../state.js';
import { UI } from '../ui/ui.js';
import { camera, isoX, isoY, elevationAt } from '../core/view.js';
import { rand, pick, chance, clamp, makeCanvas } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { makeMonster, monsterBase } from './monster.js';
import { aoe } from './combat.js';
import { makeFolk } from './folk.js';
import { townSprite } from './render.js';
import { TOWN_FRAME_W, TOWN_FRAME_H, townFrameOf } from './townsfolkvisuals.js';
import { Cine } from './cinema.js';
import { GroundItem, dropChest } from './loot.js';
import { addEffect, addLight, Ring, Telegraph, smoke, burst, sparkle, floatText, spawn, glowSprite } from '../gfx/vfx.js';
import { castle3dState } from '../gfx/castle3dart.js';
import { enemyImage } from '../core/enemyart.js';
import { depthLevel } from '../data/depth.js';
import { rollItem, rarityAt } from '../data/items.js';
import { TOWNSFOLK } from '../data/townsfolk.js';
import { AIR_CREW, AIR_CAPTAIN } from '../data/airpirates.js';
import { ART_BY_ID, SWAPS } from '../data/bestiary.js';
import { SKY_VARIANT, SKY_VARIANTS, SKY_STORY_VARIANTS, SKY_WAVES, DOCKS } from '../data/skybattle.js';
import { conversation, twistLine, CAPTAIN_CRIES, FAREWELLS, fillLine, CONVERSATION_COUNT, betrayal, ALLY_CRIES, CHARGE_LINES, HOOK_LINES2 } from '../data/skytalk.js';
import { RUNEBLADE_PALETTES, RUNEBLADE_SKINS, preloadRuneblade, drawRuneblade3D } from '../gfx/runeblade3d.js';
import { OX, OY, LV, FC_H, QD_H, GATE, LANDING, beam, sheer, inner, sAt, zAt } from '../world/skyship.js';

const HS = 4;
const ARRIVE = ['So this is the sky lane. Nice view. Terrible neighbours.', 'Through the gate and onto a warship. Velscour, you shouldn\'t have.',
  'Air Pirates, huh? Let them come.', 'Never look down. Never look down. ...I looked down.', 'Steady deck, strong wind, black sails coming. Perfect.',
  'Every pirate in the sky is coming for this ship. Good. Saves me the walk.', 'Hold the deck. Hold it until there is nobody left to hold it from.'];
const VICTORY = ['And STAY down.', 'That is how you hold a deck.', 'Tell Velscour his fleet needs practice.', 'The sky is ours. For today.', 'Next time, bring a bigger boat.'];
/** The knights' animations for their lines: a townsfolk pose and how the body moves (drawNpc's n.motion). */
export const KNIGHT_ACTS = {
  laugh: ['happy', (t) => ({ dy: Math.abs(Math.sin(t * 16)) * 3 })],
  cry: ['scared', (t) => ({ dx: Math.sin(t * 40) * 1.2, sy: 1 - Math.abs(Math.sin(t * 6)) * 0.04 })],
  rage: ['angry', (t) => ({ dy: Math.max(0, Math.sin(t * 9)) * 7, sx: 1 + Math.abs(Math.sin(t * 9)) * 0.06 })],
  flex: ['excited', (t) => ({ sx: 1 + Math.abs(Math.sin(t * 5)) * 0.12, sy: 1 + Math.abs(Math.sin(t * 5)) * 0.08 })],
  dance: ['cheer', (t) => ({ dx: Math.sin(t * 7) * 5, rot: Math.sin(t * 7) * 0.15, dy: Math.abs(Math.cos(t * 7)) * 4 })],
  spin: ['excited', (t) => ({ flip: Math.floor(t * 10) % 2 === 0, dy: Math.abs(Math.sin(t * 5)) * 6 })],
  salute: ['point', (t) => ({ rot: -0.08, dy: t < 0.4 ? Math.sin(t / 0.4 * Math.PI) * 4 : 0 })],
  swoon: ['love', (t) => ({ rot: Math.sin(t * 2.5) * 0.2, dx: Math.sin(t * 2.5) * 3 })],
  faint: ['dead', (t) => ({ rot: Math.min(1, t * 4) * -1.45 })],
  hop: ['excited', (t) => ({ dy: Math.abs(Math.sin(t * 11)) * 12 })],
  point: ['point', (t) => ({ dx: Math.sin(t * 3) * 1.5 })],
  shrug: ['idle', (t) => ({ sy: 1 + Math.abs(Math.sin(t * 8)) * 0.05, dy: Math.abs(Math.sin(t * 8)) * 2 })],
  bow: ['idle', (t) => ({ rot: Math.min(1, t * 3) * 0.45 * (t < 1.4 ? 1 : 0) })],
  thinking: ['idle', (t) => ({ rot: Math.sin(t * 1.5) * 0.1 })],
  attack: ['attack', (t) => ({ dx: Math.min(1, t * 5) * 6, rot: Math.min(1, t * 5) * 0.12 })],
};

/** Pick a variant: `id`, else (never the one just played) one of the stories the hero hasn't seen 70% of the time
 *  while there are any, else any weather or story. `seen` is G.char.skySeen. */
export function pickVariant(id, last, seen = {}) {
  if (id && SKY_VARIANT[id]) return SKY_VARIANT[id];
  const fresh = SKY_STORY_VARIANTS.filter((v) => v.id !== last && !seen[v.id + ':intro']);
  if (fresh.length && chance(0.7)) return pick(fresh);
  return pick([...SKY_VARIANTS, ...SKY_STORY_VARIANTS].filter((v) => v.id !== last));
}
/** Whose cut scenes these are: each story is its own; the eight weathers share one (the same battle and beats). */
export const skySeenKey = (v) => (v.story ? v.id : 'base');

export function createSkyBattle(world, gen, biome, depth, opts, onSuccess) {
  const map = world.map, st = castle3dState(), A = st.anchors, v = pickVariant(opts.variant, opts.last, opts.seen);
  const lvl = depthLevel(depth), base = monsterBase(lvl);
  // the boarders and the named cast: a story's own (any painted art, palette swapped), else the Air Pirates
  const swapOf = (x) => (typeof x === 'string' ? SWAPS[x] || null : x || null);
  const CREW = v.crew ? v.crew.map((c) => ({ id: c.art, art: c.art, arch: c.arch, h: c.h || ART_BY_ID[c.art]?.h || AIR_CREW.find((a) => a.id === c.art)?.h || 56, swap: swapOf(c.swap), name: c.name }))
    : AIR_CREW.map((a) => ({ ...a, art: a.id, swap: null }));
  const crewFor = (arch) => CREW.filter((a) => a.arch === arch);
  const ARCHS = [...new Set(CREW.map((a) => a.arch))];
  const pickCrew = () => pick(CREW);
  /** A captain, boss or master by key: a story's cast entry, else an Air Pirate captain. */
  const capOf = (key) => { const c = v.cast && v.cast[key]; return c ? { ...c, id: key, art: c.art || key, swap: swapOf(c.swap) } : { ...AIR_CAPTAIN[key], art: key, swap: null }; };
  const L = v.lines || {};   // a story's own lines (docs/SKY_STORIES.md); the weathers draw from data/skytalk.js
  const S = world.sky = { v, boats: [], galleon: null, hooks: [], shots: [], bolts: [], ropes: [], blades: [], flash: 0, gateColor: '#ff5020', gateFlash: 0, windK: 1, fogR: 1 };
  if (v.night) { world.night = true; world.darkK = v.dark; } else if (v.dark) world.darkK = v.dark;
  world.raining = false;
  const p = () => world.player;
  const hero = () => G.char;
  const tileOf = (x, z) => [OX + x, OY + z];
  const lvAt = (x, y) => map.hgt[map.tileIdx(x, y)];
  const walk = (x, y) => map.walkable(x, y);
  const near = (x, y, r = 2) => { if (walk(x, y)) return [x, y]; const q = map.randomNear(x, y, r); return q && walk(q[0], q[1]) ? q : [OX + 0.5, OY + 0.5]; };
  const ctx = () => ({ hero: hero().name, class: classNameOf(), weather: v.weather.toLowerCase(), cap: run.cap?.name || '', captitle: run.cap?.title || '', k1: run.k1?.first || '', k2: run.k2?.first || '' });
  /** Fill a line's tokens: {hero} {class} {k1} {k2} {cap}..., and a story's {@castKey} (that character's name). */
  const fillAll = (t) => fillLine(t.replace(/\{@(\w+)\}/g, (m, k) => (v.cast && v.cast[k] ? v.cast[k].name : m)), ctx());
  const classNameOf = () => { const c = G.char.classId || ''; return c.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ').replace('Arcane Sorcerer', 'Astronomer'); };
  const live = new Set();   // the pirates on the deck this fight brought
  const drop = (arr, x) => { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); };

  // ------------------------------------------------------------------ boats
  const easeOut = (k) => 1 - (1 - k) ** 3;
  /** Where a boat lies to port with its ramp on the rail at ship z = dz: its origin tile and deck level. */
  function dockSpot(kind, dz) {
    const K = A.skiffs[kind], s = sAt(dz), reach = K.rampLen * Math.cos(0.1);
    return { x: OX - (beam(s) - 0.15) - reach - K.ramp[0], y: OY + dz - K.ramp[2], lv: ((sheer(s) + 0.12) - K.ramp[1] + K.rampLen * Math.sin(0.1)) * LV };
  }
  function launchBoat(kind, dz, crew, o = {}) {
    const dock = dockSpot(kind, dz), from = { x: dock.x - 16, y: dock.y + 18, lv: dock.lv + 40 };
    const K = A.skiffs[kind], spots = K.deck.slice().sort(() => Math.random() - 0.5);
    const b = { kind, dz, x: from.x, y: from.y, lv: from.lv, alpha: 0, ramp: 0, phase: Math.floor(rand(0, 4)), st: 'in', t: 0, dock, from, wait: o.wait ?? 0.9, hold: o.hold ?? 2.5, leap: o.leap !== false, wave: o.wave,
      crew: crew.map((c, i) => ({ ...c, x: spots[i % spots.length][0] + rand(-0.15, 0.15), z: spots[i % spots.length][2] + rand(-0.15, 0.15), h: c.h ?? CREW.find((a) => a.art === c.art)?.h ?? 56, flip: false, ph: rand(0, 6) })) };
    S.boats.push(b);
    return b;
  }
  /** Bring a boat still coming in alongside within `s` seconds. */
  const rushBoat = (b, s) => { if (b.st === 'in') b.fast = Math.max(b.fast || 1, (4.5 - b.t) / s); };
  /** An empty boat lying at dock `dz` casts off: another is coming in there. */
  const castOff = (dz) => { for (const b of S.boats) if (b.dz === dz && b.st === 'dock' && !b.crew.length && !b.stay) { b.st = 'out'; b.t = 0; } };
  /** A dock for the next boat: one with no crew alongside or coming in (now that waves overlap), else any. */
  function freeDock() {
    const busy = (d) => S.boats.some((b) => b.dz === d && (b.st === 'in' || (b.st === 'dock' && (b.crew.length || b.stay))));
    const free = DOCKS.filter((d) => !busy(d)), d = pick(free.length ? free : DOCKS);
    castOff(d);
    return d;
  }
  /** A gasbag crossing high over the deck, stern to bow, dropping boarders on ropes as it passes. */
  function flyover(n, wave) {
    const b = { kind: 'gasbag', dz: 0, x: OX - 3, y: OY + 34, lv: 95, alpha: 0, ramp: 0, phase: 0, st: 'fly', t: 0, crew: [], leap: false, drops: n, wave };
    S.boats.push(b);
    return b;
  }
  function boatTick(b, dt) {
    // run.rushing: nothing on the deck to fight, so this one's next boarder comes now (hurry); b.fast: rushing alongside
    const rush = run.rushing === b, sp = b.st === 'in' && b.fast ? b.fast : rush && b.st === 'fly' ? 8 : 1;
    b.t += dt * sp;
    if (b.st === 'fly') {
      b.y -= dt * 5.5 * sp; b.lv = 95 + Math.sin(b.t * 0.8) * 2; b.alpha = clamp(Math.min(b.t / 1.2, (b.y - (OY - 30)) / 6), 0, 1);
      if (b.drops > 0 && b.y < OY + 12 && ((b.dropT = (b.dropT ?? 0) - dt) <= 0 || rush)) {
        b.dropT = 0.45; b.drops--;
        const to = near(b.x + 3 + rand(-2.5, 2.5), b.y + rand(-1, 1));
        spawnPirate(pickCrew().id, chance(0.25) ? 'champion' : 'normal', null, to, b.wave, 'rope', () => [b.x + 0.4, b.y + 0.2, b.lv]);
      }
      if (b.y < OY - 32) b.dead = true;
      return;
    }
    const bob = Math.sin(G.time * 1.3 + b.phase) * 0.8;
    if (b.st === 'in') {
      const k = easeOut(clamp(b.t / 4.5, 0, 1));
      b.x = b.from.x + (b.dock.x - b.from.x) * k; b.y = b.from.y + (b.dock.y - b.from.y) * k; b.lv = b.from.lv + (b.dock.lv - b.from.lv) * k + bob;
      b.alpha = clamp(b.t / 0.8, 0, 1) * (v.fog ? clamp(k * 1.6, 0, 1) : 1);
      if (k >= 1) { b.st = 'dock'; b.t = 0; sfx('thud', 0.6); camera.shake(3); }
    } else if (b.st === 'dock') {
      b.lv = b.dock.lv + bob * 0.4; b.ramp = Math.min(1, Math.max(b.ramp + (rush ? dt * 8 : 0), b.t / 0.5));
      if (b.leap && b.crew.length && b.t > (rush ? Math.min(b.wait, 0.1) : b.wait) && ((b.nextLeap = (b.nextLeap ?? 0) - dt) <= 0 || rush)) { b.nextLeap = 0.32; leapOff(b, b.crew.shift()); }
      if (!b.crew.length && b.t > b.wait + 0.5) { b.holdT = (b.holdT || 0) + dt; if (b.holdT > b.hold && !b.stay) { b.st = 'out'; b.t = 0; } }
    } else if (b.st === 'out') {
      const k = clamp(b.t / 4, 0, 1), e = k * k;
      b.ramp = 0; b.x = b.dock.x + (b.from.x - b.dock.x) * e; b.y = b.dock.y + (b.from.y - b.dock.y) * e; b.lv = b.dock.lv + (b.from.lv - b.dock.lv) * e;
      b.alpha = 1 - k;
      if (k >= 1) b.dead = true;
    }
  }
  /** A boarder (or captain) leaps from a boat's deck onto the ironclad's. */
  function leapOff(b, c) {
    const s = sAt(b.dz), [tx, ty] = near(...tileOf(-(inner(s) - 1.1) + rand(0, 2.6), b.dz + rand(-1.6, 1.6)));
    const from = [b.x + c.x, b.y + c.z, b.lv];
    return c.captain ? spawnCaptain(c.art, from, [tx, ty], c.rank, c.onLand) : spawnPirate(c.art, c.rank || 'normal', from, [tx, ty], c.wave);
  }
  /** Fly a monster from `from` [tile x, tile y, level] to `to` [tile x, tile y] in an arc; it can't act until it lands. */
  function leap(m, from, to, o = {}) {
    const d = Math.hypot(to[0] - from[0], to[1] - from[1]), dur = o.dur ?? 0.55 + d / 11, arc = o.arc ?? 60 + d * 6;
    const lvTo = o.toLv ?? lvAt(to[0], to[1]);
    let t = 0, fast = 0;
    m.targetable = false; m.awake = true; m.moving = true; m.boarding = !!o.board;
    m.entering = (dt) => {
      // a boarder in the air with nothing on the deck to fight (hurry): the rest of the leap takes a quarter second
      if (!fast && o.board && m.rush) fast = Math.max(1, (dur - t) / 0.25);
      t += dt * (fast || 1); m.animT += dt;
      const k = Math.min(1, t / dur);
      m.x = from[0] + (to[0] - from[0]) * k; m.y = from[1] + (to[1] - from[1]) * k;
      m.z = (from[2] * (1 - k) + lvTo * k) * HS + arc * Math.sin(Math.PI * k) - elevationAt(m.x, m.y);
      if (k >= 1) {
        m.boarding = m.rush = false;
        if (o.perch) { m.x = to[0]; m.y = to[1]; m.z = lvTo * HS - elevationAt(m.x, m.y); m.moving = false; m.entering = () => {}; o.perch(m); return; }
        m.entering = null; m.targetable = true; m.z = 0; m.x = to[0]; m.y = to[1]; m.cd = rand(0.2, 0.5); m.moving = false;
        smoke(m.x, m.y, 4, '#6a5a4a', 3, 9); sfx('thud', m.captain ? 1 : 0.4);
        if (m.captain) { addEffect(new Ring(m.x, m.y, 0.2, 2.6, 0.5, '#e8d0a0', 6)); camera.shake(9); if (!G.cine) aoe(world, m, m.x, m.y, 2.2, m.dmg * 0.6, 'phys', { knock: 1 }); }
        if (o.onLand) o.onLand(m);
      }
    };
  }
  /** Swing on a rope from `anchor()` [tile x, tile y, level] across to `to`, low over the deck in between, hitting the
   *  hero's side along the way (a captain's swing; the mid-boss's entrance). */
  function swingAcross(m, anchor, to, o = {}) {
    const from = [m.x, m.y, (m.z + elevationAt(m.x, m.y)) / HS], dur = o.dur ?? 1.5, rope = { a: anchor, m };
    let t = 0; const hit = new Set();
    m.targetable = false; m.awake = true; m.moving = true; S.ropes.push(rope); sfx('swing', 0.8);
    m.entering = (dt) => {
      t += dt; m.animT += dt;
      const k = Math.min(1, t / dur), e = k * k * (3 - 2 * k);
      m.x = from[0] + (to[0] - from[0]) * e; m.y = from[1] + (to[1] - from[1]) * e;
      const ground = lvAt(m.x, m.y), lvl = from[2] * (1 - e) + lvAt(to[0], to[1]) * e;
      m.z = Math.max(ground + 6, lvl - Math.sin(Math.PI * e) * 14 + Math.sin(Math.PI * e) * 30 * (1 - Math.abs(2 * e - 1))) * HS - elevationAt(m.x, m.y);
      if (k > 0.2 && k < 0.85 && !G.cine) for (const c of world.hostiles('enemy', m.x, m.y, 1.2)) if (!hit.has(c)) { hit.add(c); aoe(world, m, c.x, c.y, 0.6, m.dmg * 0.9, 'phys', { knock: 1.2 }); }
      if (k >= 1) {
        drop(S.ropes, rope);
        m.entering = null; m.targetable = true; m.z = 0; m.x = to[0]; m.y = to[1]; m.moving = false; m.cd = rand(0.2, 0.4);
        smoke(m.x, m.y, 4, '#6a5a4a', 4, 10); sfx('thud', 0.8); camera.shake(m.captain ? 7 : 3);
        if (o.onLand) o.onLand(m);
      }
    };
  }
  /** Slide down a rope from high overhead to `to` (boarders dropped from a passing gasbag, or called by a captain). */
  function rappelIn(m, to, anchor) {
    const top = 70 + rand(0, 30); let t = 0;
    const rope = { a: anchor || (() => [to[0] - 0.6, to[1] + 0.4, lvAt(to[0], to[1]) + top + 30]), m };
    m.targetable = false; m.awake = true; m.boarding = true; m.x = to[0]; m.y = to[1]; S.ropes.push(rope);
    const dur = rand(1.0, 1.4);
    let fast = 0;
    m.entering = (dt) => {
      if (!fast && m.rush) fast = Math.max(1, (dur - t) / 0.25);   // hurry: the rest of the slide takes a quarter second
      t += dt * (fast || 1); m.animT += dt;
      const k = Math.min(1, t / dur);
      m.z = top * HS * (1 - k * k) + Math.sin(t * 9) * 2 * (1 - k);
      if (k >= 1) { drop(S.ropes, rope); m.boarding = m.rush = false; m.entering = null; m.targetable = true; m.z = 0; m.cd = rand(0.2, 0.5); smoke(m.x, m.y, 2, '#6a5a4a', 2, 7); sfx('thud', 0.4); }
    };
  }
  function spawnPirate(art, rank, from, to, wave = run.wave, how = 'leap', anchor = null) {
    const a = CREW.find((q) => q.art === art) || pickCrew();
    const m = makeMonster(world, a.arch, biome, lvl + (rank === 'normal' ? 0 : 1), rank, to[0], to[1], 0, { art: a.art, swap: a.swap });
    if (a.shot && m.proj) m.proj = { ...m.proj, fx: a.shot };
    if (v.crew) { m.artH = a.h; m.split = false; if (a.name) m.name = a.name; }   // a story's boarders keep their size; a slime doesn't split into the dungeon's looks
    world.add(m); m.sky = true; m.wave = wave; live.add(m);
    if (how === 'rope') rappelIn(m, to, anchor); else leap(m, from, to, { board: true });
    return m;
  }
  function spawnCaptain(id, from, to, rank = 'boss', onLand, o = {}) {
    const a = capOf(id);
    const m = makeMonster(world, a.arch, biome, lvl + (o.lv ?? 2), rank, to[0], to[1], 0, { art: a.art, swap: a.swap });
    if (a.shot && m.proj) m.proj = { ...m.proj, fx: a.shot };
    m.name = a.name; m.title = a.title; m.captain = a; m.castKey = id; run.castM[id] = m; m.sky = true; m.moveT = rand(5, 8); m.split = false;
    m.scale = 1; m.artH = a.h;   // the boss rank's 1.9 would make a captain three heroes tall: they stand about one and a half (their art's h)
    if (o.hp) { m.maxHp *= o.hp; m.hp = m.maxHp; }
    world.add(m); live.add(m);
    if (o.swing) { m.x = from[0]; m.y = from[1]; m.z = from[2] * HS - elevationAt(m.x, m.y); swingAcross(m, o.swing, to, { dur: 1.7, onLand }); }
    else leap(m, from, to, { arc: 140, onLand, board: true });
    return m;
  }
  /** A boat's worth of boarders for a wave: random archetypes (bruisers rarer), elites first. */
  function crewList(n, champions, uniques, wave) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const heavy = ARCHS.filter((x) => x === 'demon' || x === 'knight'), light = ARCHS.filter((x) => x !== 'demon');
      const arch = heavy.length && chance(0.18) ? pick(heavy) : pick(light.length ? light : ARCHS);
      const a = pick(crewFor(arch));
      out.push({ art: a.art, swap: a.swap, h: a.h, rank: i < uniques ? 'unique' : i < uniques + champions ? 'champion' : 'normal', wave });
    }
    return out;
  }
  const boatKind = () => { const w = Object.entries(v.boats).filter(([, n]) => n > 0); let r = rand(0, w.reduce((s, [, n]) => s + n, 0)); for (const [k, n] of w) if ((r -= n) <= 0) return k; return w[0][0]; };

  // ------------------------------------------------------------------ the knights (palette-swapped townsfolk)
  // Who they are is settled now, so their recoloured sheets are built behind the loading screen (S.warm, game.js's
  // warmLevelArt), not in the middle of the parley. Bright, never clashing: two hues a third to a half of the wheel
  // apart, both lifted and saturated.
  const KNIGHTS = (() => {
    const ks = TOWNSFOLK.filter((q) => q.knight), h1 = rand(0, 360), h2 = (h1 + rand(120, 180)) % 360;
    const pal = (h) => ({ hue: Math.round(h), sat: +rand(1.3, 1.6).toFixed(2), light: +rand(0.05, 0.12).toFixed(2) });
    if (v.knights) return v.knights.map((k, i) => [ks.find((q) => q.name.split(' ')[0] === k.base) || ks[i], pal(k.hue ?? (i ? h2 : h1)), k.name]);   // a story's own two
    const a = pick(ks), b = pick(ks.filter((q) => q !== a));
    return [[a, pal(h1)], [b, pal(h2)]];
  })();
  const bladeSkin = (i) => RUNEBLADE_SKINS[(i * 2 + run.talk) % RUNEBLADE_SKINS.length].id;
  S.warm = () => { for (const [q, palette] of KNIGHTS) townSprite(q.spriteId, palette); preloadRuneblade(bladeSkin(0)); preloadRuneblade(bladeSkin(1)); };
  function makeKnights() {
    const mk = ([q, palette, name], x, z) => {
      const [tx, ty] = tileOf(x, z);
      const n = makeFolk(world, q, tx, ty, { calm: true, still: true, palette });
      n.first = name ? name.replace(/^Sky-Knight /, '') : q.name.split(' ')[0];
      n.name = name || `Sky-Knight ${n.first}`;
      n.lift = 0;   // px over the ground under them (standing on a boat or the flagship)
      n.motion = () => { const a = n.actPose ? n.actPose() : null; return a ? { ...a, dy: (a.dy || 0) + n.lift } : { dy: n.lift }; };
      world.npcs.push(n);
      return n;
    };
    const ks2 = [mk(KNIGHTS[0], -4.2, -1.2), mk(KNIGHTS[1], -4.4, 1.0)];
    ks2.forEach((k, i) => { k.blade = knightBlade(k, i); });
    return ks2;
  }
  /** A knight acts out a line: its pose (townsfolk frame) and a motion for `dur` seconds. */
  function act(n, name, dur = 3) {
    const [emo, fn] = KNIGHT_ACTS[name] || KNIGHT_ACTS.shrug, t0 = G.time;
    n.feel(emo, dur, false);
    n.actPose = () => fn(G.time - t0);
    n.after(dur, () => { if (G.time - t0 >= dur - 0.05) n.actPose = null; });
  }
  // Where the knights are: k.follow() gives [tile x, tile y, level] (a level off the ship's own tiles: a boat, the
  // flagship; undefined on the deck), k.chase walks there instead of standing on it, knightJump carries them between
  // places in an arc. They go wherever their captain goes.
  function place(k, [x, y, lv]) { k.x = x; k.y = y; k.lift = lv === undefined ? 0 : Math.max(0, lv * HS - elevationAt(x, y)); }
  function knightJump(k, to, dur = 0.9, arc = 80, then = null) {
    const fx = k.x, fy = k.y, fl = (k.lift + elevationAt(k.x, k.y)) / HS; let t = 0;
    k.follow = null; k.chase = false; k.hidden = false;
    k.jumping = (dt) => {
      t += dt; const q = Math.min(1, t / dur), [tx, ty, tl] = to(), tlv = tl ?? lvAt(tx, ty);
      k.x = fx + (tx - fx) * q; k.y = fy + (ty - fy) * q;
      k.lift = Math.max(0, (fl * (1 - q) + tlv * q) * HS + arc * Math.sin(Math.PI * q) - elevationAt(k.x, k.y));
      if (q >= 1) { k.jumping = null; k.follow = to; if (then) then(); }
    };
  }
  function knightTick(dt) {
    for (const k of [run.k1, run.k2]) {
      if (!k) continue;
      if (k.onFlagship && !S.galleon) { k.hidden = true; k.follow = null; k.jumping = null; continue; }   // gone with her
      if (k.jumping) k.jumping(dt);
      else if (k.follow && k.chase) {   // trotting after their captain on the deck
        const [tx, ty] = k.follow(), d = Math.hypot(tx - k.x, ty - k.y);
        if (d > 0.3) { const st = Math.min(d, dt * 3.6), nx = k.x + (tx - k.x) / d * st, ny = k.y + (ty - k.y) / d * st; if (walk(nx, ny)) { k.x = nx; k.y = ny; k.walking = true; } k.face(tx, ty); }
        else if (p()) k.face(p().x, p().y);
        k.lift = 0;
      } else if (k.follow) place(k, k.follow());
      if (k.onFlagship) k.alpha = S.galleon ? S.galleon.alpha : 0;
    }
  }
  /** Beside the hero (left or right of them): where a knight goes between fights. */
  const heroSide = (side) => () => { const pl = p(); return pl ? near(pl.x - 0.9, pl.y + side * 1.2, 1.2) : [OX, OY]; };
  // Each knight's Runeblade (the Death Knight's 3D blade, gfx/runeblade3d.js), recoloured to their armour: a palette
  // turned to the hue of their recoloured sheet, its glow their armour's colour. Drawn only for their strikes.
  function knightBlade(k, i) {
    const hue = k.palette.hue, light = 40 + k.palette.light * 200;
    const id = `sky_knight_${i}_${hue}`;
    if (!RUNEBLADE_PALETTES.find((q) => q.id === id)) RUNEBLADE_PALETTES.push({ id, name: k.name, hue: hue - 200, sat: Math.min(1.6, k.palette.sat), lum: 1.08, glow: hslHex(hue, 0.85, light / 100) });
    const skin = bladeSkin(i);
    preloadRuneblade(skin);
    return { palette: id, skin, glow: hslHex(hue, 0.85, light / 100) };
  }
  /** Draw each knight's blade once off screen: its mesh and skin go to the GPU in the parley, not at the first strike. */
  function warmBlades() {
    const x = makeCanvas(96, 96).getContext('2d');
    for (const k of [run.k1, run.k2]) if (k && k.blade) drawRuneblade3D(x, 48, 48, 0, 40, { skin: k.blade.skin, palette: k.blade.palette, glow: k.blade.glow });
  }
  const hslHex = (h, s, l) => { const f = (n) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l), c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(c * 255).toString(16).padStart(2, '0'); }; return '#' + f(0) + f(8) + f(4); };
  /** A knight's strike: a leap at the target and a great sweep of the runeblade (big: the charge into a captain). */
  function strike(k, tgt, big = false) {
    if (!tgt || tgt.dead) return;
    const side = k.x < tgt.x ? -1 : 1, to = near(tgt.x + side * 0.9, tgt.y, 1);
    k.chase = false; k.atkCd = rand(1.3, 1.9) + (big ? 1 : 0);
    act(k, 'attack', 1.0);
    knightJump(k, () => to, big ? 0.7 : 0.4, big ? 110 : 40, () => {
      const a0 = side > 0 ? Math.PI * 1.15 : -Math.PI * 0.15, a1 = side > 0 ? Math.PI * 0.2 : Math.PI * 0.8;
      const blade = { k, x: k.x, y: k.y, t: 0, dur: big ? 0.55 : 0.36, a0, a1, len: big ? 150 : 86, ...k.blade };
      S.blades.push(blade); k.slash = blade;
      sfx('swing', big ? 1 : 0.6);
      run.later(blade.dur * 0.45, () => {
        const dmg = (big ? 0.55 : 0.2) * base.hp * (tgt.captain ? 1.2 : 1);
        aoe(world, null, to[0] - side * 0.5, to[1], big ? 2.0 : 1.4, dmg, 'phys', { team: 'player', knock: big ? 1.4 : 0.6 });
        burst(to[0] - side * 0.6, to[1], 30, 'phys', big ? 18 : 8, big ? 5 : 3);
        if (big) { camera.shake(9); addEffect(new Ring(to[0] - side * 0.5, to[1], 0.2, 2.4, 0.4, blade.glow, 6)); }
      });
      run.later(blade.dur, () => { drop(S.blades, blade); if (k.slash !== blade) return; k.slash = null; if (k.ally && !G.cine) { k.chase = true; k.follow = heroSide(k === run.k1 ? -1 : 1); } });
    });
  }
  /** Before a scene moves them: a knight mid-strike or mid-leap lands where they are and puts the blade away (else the
   *  strike's leap and its return to the hero fight the scene's walk). */
  function settleKnights() {
    for (const k of [run.k1, run.k2]) {
      if (!k) continue;
      if (k.slash) drop(S.blades, k.slash);
      k.jumping = null; k.slash = null; k.chase = false; k.follow = null; k.atkCd = 1;
      const [x, y] = near(k.x, k.y, 2); k.x = x; k.y = y; k.lift = 0;
    }
  }
  /** The knights in a fight: the nearest boarder or captain near the hero, run at it, strike; otherwise stay by the hero. */
  function knightsFight(dt) {
    const pl = p();
    for (const k of [run.k1, run.k2]) {
      if (!k || !k.ally || k.jumping || k.slash) continue;
      k.atkCd = (k.atkCd ?? 1) - dt;
      let tgt = null, td = 8;
      for (const m of world.creatures) if (m.team === 'enemy' && !m.dead && !m.entering && m.targetable !== false && pl && Math.hypot(m.x - pl.x, m.y - pl.y) < 10) { const d = Math.hypot(m.x - k.x, m.y - k.y); if (d < td) { td = d; tgt = m; } }
      if (!tgt) { k.chase = true; k.follow = heroSide(k === run.k1 ? -1 : 1); continue; }
      if (td < 2.4 && k.atkCd <= 0) { strike(k, tgt); continue; }
      k.chase = true; k.follow = () => near(tgt.x + (k.x < tgt.x ? -1 : 1), tgt.y, 1);
      if ((k.cryT = (k.cryT ?? rand(4, 8)) - dt) <= 0) { k.cryT = rand(6, 11); k.say(fillAll(pick(v.story ? ALLY_CRIES.filter((t) => !/black sail/i.test(t)) : ALLY_CRIES)), 2.2); }
    }
  }
  /** A spot along the flagship's rail (her crew's places): [tile x, tile y, level]. */
  let lastRail = [OX - 15, OY, 6];
  const flagRail = (i) => { const g = S.galleon; if (!g) return lastRail; const [x, y, z] = A.galleon.rail[i % A.galleon.rail.length]; return (lastRail = [g.x + x, g.y + z, g.lv + y * LV]); };
  const KNIGHT_TAUNTS = ['Get them, Captain!', 'For the black sail!', 'Left! No, YOUR left!', 'Ooh. That looked like it hurt.', 'Still not joining you!', 'Mind the furnaces, Captain!',
    'Do the spinny thing!', 'I am cheering VERY professionally.', 'Velscour is watching! Probably!', 'This is better than the shanties!'];
  const KNIGHT_GRIEF = ['CAPTAIN!', 'No no no no NO!', 'You will pay for that! Eventually!', 'Captain... I will sing the shanty of you.'];

  // ------------------------------------------------------------------ portraits for the dialogue panel
  let heroImg = null;
  const heroPortrait = (cx, x, y, w, h) => {
    if (!heroImg) { heroImg = new Image(); heroImg.src = `assets/sprites/select/${G.char.classId}.webp`; }
    if (heroImg.complete && heroImg.naturalWidth) { const s = w / heroImg.naturalWidth * 1.6; cx.drawImage(heroImg, x + w / 2 - heroImg.naturalWidth * s / 2, y - 4, heroImg.naturalWidth * s, heroImg.naturalHeight * s); }
  };
  const monsterPortrait = (art, swap = null) => (cx, x, y, w, h, t) => {
    const img = enemyImage(art, swap); if (!img) return;
    const s = w / img.width * 1.5, sh = Math.sin(t * 30) * (t < 0.3 ? 2 : 0);
    cx.drawImage(img, x + w / 2 - img.width * s / 2 + sh, y - h * 0.08, img.width * s, img.height * s);
  };
  const knightPortrait = (n) => (cx, x, y, w, h) => {
    const sheet = townSprite(n.townsfolkSpriteId, n.palette); if (!sheet) return;
    // a fainting knight lies down: the portrait (the top of the frame) would be empty, so it shows them scared
    const f = Math.max(0, townFrameOf(n.townsfolkSpriteId, n.emotion === 'dead' ? 'scared' : n.emotion || 'idle'));
    cx.drawImage(sheet, f * TOWN_FRAME_W + 64, 0, 128, 110, x - w * 0.1, y, w * 1.2, w * 1.2 * 110 / 128);
  };
  const capSpeaker = (a) => ({ name: a.name, color: '#ff9a6a', portrait: monsterPortrait(a.art, a.swap), voice: { pitch: a.voice || 0.7, wave: 'sawtooth' } });
  const speaker = (who) => who === 'hero' ? { name: G.char.name, color: '#9fd0ff', portrait: heroPortrait, voice: { pitch: 1, wave: 'square' } }
    : who === 'cap' ? capSpeaker(run.cap)
      : who === 'k1' || who === 'k2' ? { name: run[who].name, color: who === 'k1' ? '#ffd27a' : '#a8f0c0', portrait: knightPortrait(run[who]), voice: { pitch: who === 'k1' ? 1.15 : 0.9, wave: 'triangle' } }
        : { ...capSpeaker(capOf(who)), color: who === v.gauntlet?.master ? '#d090ff' : '#ff9a6a' };   // a story's cast member
  /** A spoken line as a cut scene step: who says it (the camera frames them: `focus`), the knight's act. */
  function sayStep(line) {
    const sp = speaker(line.who), npc = line.who === 'k1' || line.who === 'k2' ? run[line.who] : null;
    return { say: { ...sp, text: line.text, focus: () => focusOf(line.who),
      onStart: () => {
        if (npc) { act(npc, line.act, 1.4 + line.text.length * 0.045); if (G.char) npc.face(p().x, p().y); }
        const m = line.who === 'cap' ? run.capM : actor(line.who);
        if (m && m.animT !== undefined && !npc) { m.animT += 0.5; if (line.act === 'angry' || line.act === 'laugh') camera.shakeAmt = Math.max(camera.shakeAmt, 2); }
      } } };
  }

  // ------------------------------------------------------------------ the director's camera (game/cinema.js)
  // Every shot is framed on where its subject IS while the shot plays (read each frame), never on where it was when the
  // scene was written: a boat still out in the clouds when a scene starts is picked up there and followed in.
  /** Tile (x, y) at an absolute level, `up` px higher: world px (off the ship's tiles: boats, the flagship, the sky). */
  const flat = (x, y, lv = 0, up = 0) => [(x - y) * 32, (x + y) * 16 - lv * HS - up];
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  /** An actor's face (world px; k of their height up): the hero, a pirate, a knight. */
  const faceOf = (e, k = 0.62) => {
    if (!e) return faceOf(p(), k);
    const h = e.isPlayer ? 60 : e.townsfolkSpriteId ? 57 : (e.artH || 50) * (e.scale || 1);
    return [isoX(e.x, e.y), isoY(e.x, e.y) - (e.z || 0) - (e.lift || 0) - h * k];
  };
  /** Who speaks: the hero, the parley's captain, a knight, or a story's cast member (on the deck, else painted at the
   *  flagship's rail or on a boat). */
  const actor = (who) => {
    if (who === 'hero') return p();
    if (who === 'cap') return run.capM && !run.capM.dead ? run.capM : actor(v.finals[0]);
    if (who === 'k1' || who === 'k2') return run[who];
    const m = [...live].find((q) => q.castKey === who && !q.dead) || run.castM[who];
    return m && world.creatures.includes(m) ? m : null;   // a fallen one is framed where it lies
  };
  /** A painted crew record standing for cast member `key` (the flagship's rail, a boat): [owner, record]. */
  const paintedOf = (key) => { for (const o of [S.galleon, ...S.boats]) { const c = o && o.crew.find((q) => q.cap === key); if (c) return [o, c]; } return null; };
  /** The point a line's shot frames: the speaker's face, wherever they are. */
  const focusOf = (who) => { const a = actor(who); if (a) return faceOf(a); const pc = paintedOf(who === 'cap' ? v.finals[0] : who); return pc ? crewFace(pc[0], pc[1]) : who === 'cap' || v.cast?.[who] ? galleonAt() : faceOf(p()); };
  /** A painted pirate standing on a boat or the flagship (its crew record). */
  const crewFace = (o, c) => flat(o.x + c.x, o.y + c.z, o.lv + (c.y || 0) * LV, c.h * 0.62);
  const boatAt = (b) => flat(b.x, b.y, b.lv, 40);
  const galleonAt = () => { const g = S.galleon; return g ? flat(g.x, g.y, g.lv, 120) : flat(OX - 18, OY + 2, 10, 120); };
  const gateAt = () => flat(OX + 0.5, OY + GATE.z, (FC_H + 1.4) * LV);
  /** Shots: `on` follows a point; `fit` frames several (zoom at most `zoom`); `pace` (world px a second) sets a move's
   *  length from how far it goes, `dur` its longest. */
  const on = (f, zoom = 1, dur = 1, o = {}) => ({ cam: { on: f, zoom, dur, pace: o.pace, ease: o.ease, wait: !!o.wait, push: o.push, drift: o.drift } });
  const fit = (f, zoom = 2, dur = 1, o = {}) => ({ cam: { fit: f, zoom, dur, pace: o.pace, ease: o.ease, wait: !!o.wait, push: o.push, drift: o.drift, margin: o.margin, min: o.min } });
  const backToHero = (dur = 1) => on(() => faceOf(p(), 0.4), 1, dur, { wait: true });
  // close-up zooms: a captain stands a head and a half taller than the hero
  const CLOSE = { hero: 3.0, cap: 2.4, k1: 3.2, k2: 3.2 };
  const closeOf = (who) => CLOSE[who] || clamp(2.4 * 90 / (capOf(who).h || 90), 1.1, 2.6);   // a story's cast: the bigger, the wider
  /** A dialogue shot: close on the speaker, the frame leaning a little toward whoever they talk to, a slow push in. */
  const lineShot = (who, to = null, zoom = closeOf(who), push = 0.025) =>
    on(() => { const a = focusOf(who), b = to && focusOf(to); return b && Math.hypot(b[0] - a[0], b[1] - a[1]) < 420 ? mix(a, b, 0.22) : a; }, zoom, 0.9, { pace: 700, push });   // no lean across to another ship

  // ------------------------------------------------------------------ the run
  const run = {
    id: 'skyship', type: 'skybattle', completed: false, failed: false, active: true, stage: 0, markers: [], route: [], escort: null, routeIndex: 0,
    variant: v, castM: {}, phase: 'intro', wave: -1, talk: Math.floor(rand(0, CONVERSATION_COUNT)), t: 0, cap: null, capM: null, k1: null, k2: null, finals: [],
    get title() { return run.completed ? 'The Sky Is Yours' : `${v.name}`; },
    get description() {
      const ph = run.phase;
      return run.completed ? 'The gate is the way on. The hoard chest waits on the hatch.'
        : ph === 'waves' ? `Hold the deck: boarding wave ${run.wave + 1} of ${SKY_WAVES.length}.`
          : ph === 'mid' ? `Defeat ${capOf(v.mid_boss).name}.`
            : ph === 'gauntlet' || ph === 'gauntlet-next' ? `Defeat ${capOf(v.gauntlet.master).name}'s champions.`
              : ph === 'master' ? `Defeat ${capOf(v.gauntlet.master).name}.`
            : ph === 'flagship' ? 'The flagship closes in. Survive her broadsides.'
              : ph === 'final' ? 'Defeat the two captains on your deck.' : 'Hold the deck.';
    },
    get objective() { return run.completed ? { x: OX + 0.5, y: OY + GATE.z + 0.6, reach: 1.4 } : { x: OX + 0.5, y: OY + 0.5, reach: 7 }; },
    update(dt) { tick(dt); },
  };
  world.skyRun = run;

  // ---- cut scenes a hero has watched once (per story; the weathers share theirs) fast-forward at 20x the next time,
  // unless Settings > "Don't skip cutscenes" (game/cinema.js Cine.fast)
  const seenKey = skySeenKey(v);
  function scene(name, steps, onEnd) {
    const c = G.char, k = `${seenKey}:${name}`, seen = !!(c && c.skySeen && c.skySeen[k]);
    Cine.play([{ do: () => { Cine.fast = seen && !G.settings.noSkipCine; } }, ...steps, { do: () => { Cine.fast = false; if (c) (c.skySeen ||= {})[k] = 1; } }], onEnd);
  }
  const fl = (ln) => ({ ...ln, text: fillAll(ln.text) });
  /** After a scene: the knights back at the hero's side, fighting. */
  const knightsBack = () => { for (const k of [run.k1, run.k2]) if (k) { k.ally = true; k.chase = true; k.follow = heroSide(k === run.k1 ? -1 : 1); } };

  // ---- the arrival: down through the clouds astern, the whole ironclad, along the deck to the bridge, in on the gate;
  // it flares and the hero steps out onto the landing
  function intro() {
    const pl = p(), gate = tileOf(0.5, GATE.z + 0.1), land = tileOf(LANDING[0] + 0.5, LANDING[1]);
    pl.x = gate[0]; pl.y = gate[1]; pl.alpha = 0;
    const landing = () => flat(land[0], land[1], lvAt(...land), 30);   // the hero's chest on the landing
    scene('intro', [
      { do: () => { [camera.x, camera.y] = flat(OX + 9, OY + 26, 60); camera.zoom = Cine.zoom0 * 0.42; S.through = 1; } },
      { card: [v.name.toUpperCase(), `${v.weather} · Depth ${depth}`], dur: 3.4 },
      on(() => flat(OX + 0.5, OY + 1, 10), 0.52, 3.6, { wait: true, ease: 'out', drift: [-6, -3] }),
      on(gateAt, 1.1, 2.4, { wait: true }),
      on(() => mix(gateAt(), landing(), 0.55), 2.0, 1.3, { wait: true, push: 0.03 }),
      { do: () => { S.gateFlash = 1.4; sfx('portal'); sparkle(gate[0], gate[1] + 0.4, 60, '#ffb070', 30, 0.8); } },
      { wait: 0.5 },
      { do: () => { run.walkTo(pl, land, 0.9, true); } },
      { wait: 1.0 },
      lineShot('hero', null, 2.7),
      { say: { name: G.char.name, color: '#9fd0ff', portrait: heroPortrait, text: L.arrive ? fillAll(L.arrive) : pick(ARRIVE), voice: { pitch: 1 }, focus: () => faceOf(p()) } },
      // the deck to hold: from the hero on the landing out over the waist
      { card: ['HOLD THE DECK', v.hazardText || v.blurb], dur: 2.8 },
      on(() => mix(faceOf(p(), 0.4), flat(OX + 0.5, OY + 2, 0), 0.5), 0.8, 1.6, { wait: true, drift: [0, 6] }),
      { wait: 0.9 },
      backToHero(1.0),
    ], () => { run.phase = 'waves'; run.wave = -1; run.t = 2; });
  }
  /** Walk `who` (the hero or a knight) to tile `to` over `dur` seconds (scripted, straight line), facing the way. */
  run.walkTo = (who, to, dur, fadeIn = false, then = null) => {
    const fx = who.x, fy = who.y; let t = 0;
    if (who.isPlayer) who.face(Math.atan2(to[1] - fy, to[0] - fx)); else if (who.face) who.face(to[0], to[1]);
    const tick = (dt) => {
      t += dt; const k = clamp(t / dur, 0, 1);
      who.x = fx + (to[0] - fx) * k; who.y = fy + (to[1] - fy) * k;
      if (fadeIn) who.alpha = k < 1 ? k : undefined;
      if (who.isPlayer) { who.moving = k < 1; who.moveTarget = null; who.path = null; who.attackTarget = null; } else who.walking = k < 1;
      if (k >= 1 && then) then();
      return k < 1;
    };
    run.scripted.push(tick);
  };
  run.scripted = [];
  /** Walk `who` round the ship's fittings to `to` at `speed` tiles a second (down the grand stairs to the parley, a
   *  knight to the rail); `who.going` while on the way. A straight line if no path is found. */
  run.goTo = (who, to, speed, then = null) => {
    const legs = (world.map.findPath(who.x, who.y, to[0], to[1], 20000) || []).slice();
    if (!legs.length || Math.hypot(legs[legs.length - 1][0] - to[0], legs[legs.length - 1][1] - to[1]) > 0.05) legs.push(to);
    who.going = true;
    const next = () => { const q = legs.shift(); if (!q) { who.going = false; if (then) then(); return; } run.walkTo(who, q, Math.max(0.05, Math.hypot(q[0] - who.x, q[1] - who.y) / speed), false, next); };
    next();
  };

  // ---- waves
  function startWave(n, quiet = false) {
    run.wave = n; run.phase = 'waves'; run.t = 0;
    const W = SKY_WAVES[n];
    if (!quiet) UI.centerMsg(`BOARDING WAVE ${n + 1}`, n === SKY_WAVES.length - 1 ? 'The last of them' : `${W.boats} boat${W.boats > 1 ? 's' : ''} alongside`, 2.2);
    sfx('boss', 0.5);
    let champ = W.champion || 0, uniq = W.unique || 0;
    for (let b = 0; b < W.boats; b++) {
      const k = Math.min(champ, 1 + (b === 0 ? 1 : 0)), u = Math.min(uniq, 1);
      champ -= k; uniq -= u;
      run.later(b * 2.2, () => launchBoat(boatKind(), freeDock(), crewList(W.n[b], k, u, n), { wave: n }), n);
    }
    if (n >= 2) run.later(7, () => { flyover(2 + Math.floor(n / 2), n); UI.centerMsg('', 'Boarders on ropes, overhead!', 1.6); }, n);
  }
  run.timers = [];
  /** A timer; `tag` (a wave) marks one that sends boarders, which hurry() may fire early. */
  run.later = (s, fn, tag) => run.timers.push([s, fn, tag]);
  /** Boarders of wave `w` still to come over the rail: not yet set out, on a boat alongside or coming in, under the flyover. */
  const coming = (w) => run.timers.some((q) => q[2] === w) || S.boats.some((b) => b.wave === w && ((b.crew.length && b.leap) || (b.st === 'fly' && b.drops > 0)));
  /** Nothing on the deck to hit: the next foe on its way hurries, one arrival at a time so they don't all land at once:
   *  boarders already in the air, else a docked boat's next leaper, else the boat coming in soonest, else the flyover,
   *  else the next boat (or the flagship's next boarder) sets out now. Returns the boat to rush this frame. */
  function hurry() {
    let air = false;
    for (const m of live) if (!m.dead && m.entering && m.boarding) air = m.rush = true;
    if (air) return null;
    const crewed = S.boats.filter((b) => b.leap && b.crew.length);
    const docked = crewed.find((b) => b.st === 'dock'); if (docked) return docked;
    const inb = crewed.reduce((a, b) => (b.st === 'in' && (!a || b.t > a.t) ? b : a), null); if (inb) { rushBoat(inb, 0.4); return null; }
    const fly = S.boats.find((b) => b.st === 'fly' && b.drops > 0); if (fly) return fly;
    const tm = run.timers.reduce((a, q) => (q[2] !== undefined && (!a || q[0] < a[0]) ? q : a), null); if (tm) tm[0] = 0;
    return null;
  }

  // ---- the mid-boss: a captain and an escort come over from a gasbag
  /** His gasbag sets out while the last of the third wave still stand; captain and escort stay aboard for his scene. */
  function midBoat() {
    if (run.midBoat) return run.midBoat;
    const id = v.mid_boss, a = capOf(id);
    castOff(3);
    const b = run.midBoat = launchBoat('gasbag', 3, [{ art: a.art, swap: a.swap, cap: id, captain: true }, ...crewList(3, 1, 0, 99)], { leap: false, hold: 3 });
    b.crew[0].h = a.h; b.crew[0].x = 0; b.crew[0].z = 0;
    return b;
  }
  function midBoss() {
    run.phase = 'mid';
    const id = v.mid_boss, a = capOf(id), b = midBoat();
    const capFace = () => b.crew[0] && b.crew[0].captain ? crewFace(b, b.crew[0]) : faceOf(run.midM);
    scene('mid', [
      // pick the gasbag up out in the clouds and follow it in (in a second and a half at most: the scene waits on it)
      { do: () => rushBoat(b, 1.5) },
      on(() => boatAt(b), 0.85, 1.3, { pace: 900 }),
      { until: () => b.st === 'dock', max: 8 },
      on(capFace, 2.1, 0.9, { wait: true, push: 0.03 }),
      { card: [a.name.toUpperCase(), a.title], dur: 2.6 },
      { say: { ...capSpeaker(a), text: fillAll(L.mid || pick(CAPTAIN_CRIES)), focus: capFace } },
      { do: () => {
        // he takes a rope from the balloon and swings across the deck
        b.crew.shift();
        const to = near(...tileOf(-1.5, b.dz + 0.5));
        run.midM = spawnCaptain(id, [b.x, b.y, b.lv + 1.5], to, 'boss', null, { swing: () => [b.x - 0.3, b.y - 0.4, b.lv + 6.2 * LV] });
        world.boss = run.midM;
      } },
      fit(() => [faceOf(run.midM, 1.1), faceOf(run.midM, -0.2), faceOf(p(), 0.4)], 1.6, 0.5),
      { until: () => run.midM && !run.midM.entering, max: 4 },
      on(() => faceOf(run.midM), 1.7, 0.4, { push: 0.02 }),
      { wait: 0.7 },
      backToHero(0.8),
    ], () => { b.leap = true; b.wait = 0.3; });
  }

  // ---- the parley, the truce and the twist
  function parley() {
    run.phase = 'parley';
    const id = v.finals[0], a = capOf(id);
    run.cap = a;
    [run.k1, run.k2] = makeKnights();
    // they come over from a gasbag under a white flag, the knights at their captain's side on its deck: the captain
    // stays still (no fighting in a parley)
    castOff(3);
    const b = launchBoat('gasbag', 3, [], { wait: 0.6, hold: 1e9, leap: false }); b.stay = true; run.parleyBoat = b;
    const onBoat = (dx, dz) => () => [b.x + dx, b.y + dz, b.lv];
    run.k1.follow = onBoat(0.7, -1.2); run.k2.follow = onBoat(0.7, 1.4);
    const pl = p(), heroAt = tileOf(-1.2, 0.2), capAt = tileOf(-4.0, 0.0);
    const lines = L.parley ? L.parley.map((ln) => ({ ...ln, text: fillAll(ln.text) })) : conversation(run.talk, ctx());
    const group = (k = 0.62) => [faceOf(pl, k), faceOf(run.capM, k), faceOf(run.k1, k), faceOf(run.k2, k)];
    const steps = [
      // the hero goes to meet them (round the fittings, down the stairs if he's up on a deck) while the gasbag comes in
      { do: () => { b.flag = true; run.goTo(pl, heroAt, 4); warmBlades(); } },
      { card: ['PARLEY', v.parleySub || 'A white flag flies from a gasbag'], dur: 2.6 },
      on(() => boatAt(b), 0.9, 1.4, { pace: 900 }),
      { until: () => b.st === 'dock', max: 8 },
      fit(() => [boatAt(b), flat(b.x, b.y, b.lv, 110), faceOf(pl, 0), faceOf(pl, 1)], 1.4, 1.0, { wait: true }),
      { do: () => {
        // the captain over the rail, frozen in peace; the knights hop down behind
        const m = makeMonster(world, a.arch, biome, lvl + 2, 'boss', capAt[0], capAt[1], 0, { art: a.art, swap: a.swap });
        m.name = a.name; m.title = a.title; m.captain = a; m.sky = true; m.parley = true; m.scale = 1; m.artH = a.h; world.add(m); run.capM = m;
        m.entering = () => {}; m.targetable = false; m.awake = true; m.flip = true;
        m.x = b.x; m.y = b.y; m.z = b.lv * HS - elevationAt(b.x, b.y);
        const fx = b.x, fy = b.y, flv = b.lv; let t = 0;
        m.entering = (dt) => { t += dt; const k = Math.min(1, t / 1.0); m.x = fx + (capAt[0] - fx) * k; m.y = fy + (capAt[1] - fy) * k; m.z = (flv * (1 - k) + lvAt(capAt[0], capAt[1]) * k) * HS + 120 * Math.sin(Math.PI * k) - elevationAt(m.x, m.y); if (k >= 1) { m.entering = () => {}; m.z = 0; camera.shake(6); sfx('thud'); } };
        for (const [k, at, dly] of [[run.k1, tileOf(-4.2, -1.4), 0.4], [run.k2, tileOf(-4.4, 1.3), 0.7]])
          run.later(dly, () => knightJump(k, () => at, 0.8, 70, () => act(k, 'salute', 1.2)));
      } },
      on(() => faceOf(run.capM), 1.5, 0.5),
      { wait: 1.2 },
      // everyone at the table: the hero (round the fittings, still on the way if he started far off) faces them
      { until: () => !pl.going, max: 6 },
      { do: () => { pl.face(Math.atan2(capAt[1] - pl.y, capAt[0] - pl.x)); } },
      fit(() => group(), 1.8, 1.1, { wait: true, push: 0.015 }),
    ];
    // the talk: close on whoever speaks, the frame leaning toward whom they answer; the knights' tale and the double
    // refusal from further out, pushing in slowly
    let prev = 'cap';
    lines.forEach((ln, j) => {
      const to = ln.who === 'hero' ? (prev !== 'hero' ? prev : 'cap') : 'hero';
      if (j === 7 && !L.parley) steps.push(fit(() => [faceOf(run.k1, 0), faceOf(run.k1, 1.1), faceOf(run.k2, 0), faceOf(run.k2, 1.1)], 2.3, 0.8, { pace: 700, push: 0.03 }));
      else if (L.parley) steps.push(lineShot(ln.who, to));
      else if (j !== 8) steps.push(lineShot(ln.who, to, CLOSE[ln.who] * (j === 3 ? 0.8 : 1), j === 3 ? 0.05 : 0.025));
      steps.push(sayStep(ln));
      prev = ln.who;
    });
    // a moment of calm: the five of them on the deck, the open sky to port behind them, the frame drifting out to it
    steps.push(fit(() => group(), 1.3, 1.6, { drift: [-26, -10] }));
    steps.push({ wait: 2.4 });
    // ...the flagship: out of a cloud bank to port, guns already run out
    steps.push({ do: () => { camera.shakeAmt = 10; sfx('boss'); S.flash = 0.4; spawnGalleon(); } });
    steps.push(on(galleonAt, 0.62, 1.1, { ease: 'out', wait: true, push: 0.025 }));
    steps.push({ card: [v.ship || 'THE BLACK MOURNING', v.shipSub || 'The flagship of Velscour\'s sky fleet'], dur: 3 });
    steps.push({ do: () => rangingShots() });
    steps.push({ wait: 2.6 });
    for (const ln of L.twist ? L.twist.map((q) => ({ ...q, text: fillAll(q.text) })) : [twistLine(run.talk, ctx())]) {
      steps.push(lineShot(ln.who, ln.who === 'cap' ? null : 'hero'));
      steps.push(sayStep(ln));
    }
    steps.push({ do: () => {
      // the captain leaps back to the gasbag, which runs for the flagship
      const m = run.capM, fx = m.x, fy = m.y, f0 = lvAt(fx, fy); let t = 0;
      m.entering = (dt) => { t += dt; const k = Math.min(1, t / 0.9); m.x = fx + (b.x - fx) * k; m.y = fy + (b.y - fy) * k; m.z = (f0 * (1 - k) + b.lv * k) * HS + 110 * Math.sin(Math.PI * k) - elevationAt(m.x, m.y); if (k >= 1) { m.dead = true; m.hp = 0; m.noLoot = true; m.removeT = 1; live.delete(m); } };
      b.stay = false; b.hold = 1.6; b.flag = false;
      // ...leaving his knights on the enemy deck under his own fleet's guns
      for (const k of [run.k1, run.k2]) act(k, 'cry', 2);
      const near1 = [run.k1.x + 0.8, run.k1.y + 0.6, lvAt(run.k1.x, run.k1.y)];
      cannon(galleonPort(), near1, () => { burst(near1[0], near1[1], 8, 'fire', 20, 4); smoke(near1[0], near1[1], 8, '#3a3230', 6, 14); camera.shake(9); sfx('explode', 0.7); for (const k of [run.k1, run.k2]) act(k, 'faint', 1.2); }, 1.6);
    } });
    steps.push(fit(() => [faceOf(run.capM, 0.5), boatAt(b)], 1.3, 0.5));
    steps.push({ wait: 0.7 });
    steps.push(fit(() => [faceOf(run.k1, 0), faceOf(run.k1, 1.1), faceOf(run.k2, 0), faceOf(run.k2, 1.1)], 2.0, 0.5, { push: 0.02 }));
    steps.push({ wait: 1.9 });
    for (const ln of L.betrayal ? L.betrayal.map((q) => ({ ...q, text: fillAll(q.text) })) : betrayal(run.talk, ctx())) {
      steps.push(lineShot(ln.who, ln.who === 'hero' ? 'k1' : 'hero'));
      steps.push(sayStep(ln));
    }
    steps.push({ do: () => { for (const k of [run.k1, run.k2]) { k.ally = true; k.follow = heroSide(k === run.k1 ? -1 : 1); k.chase = true; act(k, 'flex', 1.6); } } });
    steps.push(fit(() => [faceOf(pl, 0), faceOf(pl, 1), galleonAt()], 1, 1.2, { wait: true, min: 0.55 }));
    steps.push(backToHero(0.9));
    scene('parley', steps, () => { run.phase = 'flagship'; run.t = 0; run.volleyT = 2.5; run.returnT = 2; run.duelT = 0; });
  }
  /** The flagship's first broadside, falling short: shot bursting in the air off the ironclad's port side. */
  function rangingShots() {
    for (let i = 0; i < 4; i++) run.later(i * 0.28, () => {
      const to = [OX - 9 - rand(0, 3), OY + rand(-10, 12), rand(4, 22)];
      cannon(galleonPort(), to, () => { burst(to[0], to[1], to[2] * HS, 'fire', 12, 4); smoke(to[0], to[1], to[2] * HS, '#4a4038', 6, 16); sfx('explode', 0.35); }, 1.1);
    });
  }

  // ---- the flagship: she closes from far off to port, trading broadsides
  function spawnGalleon() {
    // she waits off the port quarter, a long pan from the deck but in sight of it, inside a cloud bank she pushes out of
    const far = { x: OX - 33, y: OY + 7, lv: 26 }, close = { x: OX - 15.2, y: OY + 0.6, lv: 0.6 * LV };
    S.galleon = { galleon: true, x: far.x, y: far.y, lv: far.lv, alpha: 0, far, close, k: 0, burn: [], crew: [] };
    S.bank = { x: far.x, y: far.y, lv: far.lv, t: 0 };
    // her crew along the starboard rail (painted extras; the captains among them)
    const G0 = A.galleon;
    G0.rail.forEach(([x, y, z], i) => { if (i !== 1 && i !== 3 && !(v.gauntlet && i === 0)) { const c = pickCrew(); S.galleon.crew.push({ art: c.art, swap: c.swap, x, y, z, h: v.crew ? c.h : 56, flip: false, ph: rand(0, 6) }); } });
    // the parley's captain (back aboard) and the second captain stand among them, the two knights beside the first
    const [ida, idb] = v.finals;
    const onRail = (id, i) => { const a = capOf(id), [x, y, z] = G0.rail[i % G0.rail.length]; S.galleon.crew.push({ art: a.art, swap: a.swap, cap: id, x, y, z, h: a.h * 0.95, flip: false, ph: rand(0, 6) }); };
    onRail(ida, 2); onRail(idb, 4);
    if (v.gauntlet) onRail(v.gauntlet.master, 0);   // a story's master watches from her rail until he comes over himself
  }
  function galleonTick(dt) {
    const g = S.galleon; if (!g) return;
    g.alpha = Math.min(1, g.alpha + dt * 0.5);
    if (g.leaving) { g.t2 = (g.t2 || 0) + dt; const k = clamp(g.t2 / 7, 0, 1); g.x = g.close.x - k * k * 40; g.y = g.close.y + k * 30; g.lv = g.close.lv - k * 60; g.alpha = 1 - k; if (k >= 1) S.galleon = null; return; }
    const k = easeOut(clamp(g.k, 0, 1)), bob = Math.sin(G.time * 0.9) * 1.2;
    g.x = g.far.x + (g.close.x - g.far.x) * k; g.y = g.far.y + (g.close.y - g.far.y) * k; g.lv = g.far.lv + (g.close.lv - g.far.lv) * k + bob;
  }
  /** Gun port (world tile + level) of a ship: the galleon's starboard battery or the ironclad's port one. */
  const galleonPort = () => { const g = S.galleon, [x, y, z] = pick(A.galleon.ports); return [g.x + x, g.y + z, g.lv + y * LV]; };
  const shipPort = () => { const ps = A.ship.ports.filter((q) => q[3] < 0), [x, y, z] = pick(ps); return [OX + x, OY + z, y * LV]; };
  /** One cannon shot: an arc from a port to a target, a telegraph where it lands, an explosion. */
  function cannon(from, to, onHit, dur = 1.25) {
    S.shots.push({ from, to, t: 0, dur, arc: 70 + Math.hypot(to[0] - from[0], to[1] - from[1]) * 4, onHit });
    spawn({ type: 'glow', x: from[0], y: from[1], z: from[2] * HS, life: 0.25, size: 26, size1: 4, color: '#ffd080', add: true });
    smoke(from[0], from[1], from[2] * HS, '#9a9088', 3, 10);
    sfx('explode', 0.35);
  }
  function volleyAtDeck(n = 4) {
    const pl = p();
    for (let i = 0; i < n; i++) {
      const tgt = i === 0 && pl ? near(pl.x + rand(-1.5, 1.5), pl.y + rand(-1.5, 1.5)) : near(OX + rand(-5, 5), OY + rand(-9, 15));
      run.later(i * 0.35, () => {
        const to = [tgt[0], tgt[1], lvAt(tgt[0], tgt[1])];
        addEffect(new Telegraph({ kind: 'circle', x: to[0], y: to[1], r: 1.5, dur: 1.4 }), 'ground');
        cannon(S.galleon ? galleonPort() : [OX - 22, OY + rand(-6, 6), 30], to, () => blast(to[0], to[1], 1.5, base.dmg * 2.2, true), 1.4);
      });
    }
  }
  /** An explosion on the deck: hurts both sides (the cannons don't pick), scorches and shakes. */
  function blast(x, y, r, dmg, both) {
    aoe(world, null, x, y, r, dmg, 'fire', { team: 'enemy', knock: 0.8 });
    if (both && !G.cine) aoe(world, null, x, y, r, dmg * 0.7, 'fire', { team: 'player', knock: 0.8 });   // a scene holds him still: a shot already in the air spares him
    burst(x, y, 10, 'fire', 18, 4); smoke(x, y, 8, '#3a3230', 6, 14);
    addEffect(new Ring(x, y, 0.2, r * 1.6, 0.4, '#ffb060', 5));
    camera.shake(6); sfx('explode', 0.6);
  }

  // ---- the hooks, the knights' farewell, the two captains
  function hooks() {
    run.phase = 'hooks';
    settleKnights();
    const g = S.galleon, k1 = run.k1, k2 = run.k2;
    const railOf = (dz) => { const s = sAt(dz); return [OX - beam(s) + 0.1, OY + dz, (sheer(s) + 0.1) * LV]; };
    const gRail = (i) => { const [x, y, z] = A.galleon.railTop[i % A.galleon.railTop.length]; return [g.x + x, g.y + z, g.lv + y * LV]; };
    const throwHook = (from, to) => { const h = { from, to, t: 0, taut: 0 }; S.hooks.push(h); run.scripted.push((dt) => { h.t += dt * 1.6; if (h.t >= 1 && !h.hit) { h.hit = true; sfx('thud', 0.5); sparkle(to[0], to[1], to[2] * HS, '#ffe0a0', 6, 0.3); } return h.t < 1; }); };
    const steps = [
      // the two ships side by side: the ironclad's port rail and the flagship
      fit(() => [flat(OX - 4, OY - 6, 2 * LV), flat(OX - 4, OY + 9, 2 * LV), galleonAt(), faceOf(p(), 0)], 1.0, 1.4, { wait: true, min: 0.5 }),
      { card: ['GRAPPLING HOOKS', 'The ships are lashed together'], dur: 2.4 },
    ];
    // the knights run to the rail and throw first: nobody fires on their truce and sails away
    for (const [k, dz, i] of [[k1, -2.5, 0], [k2, 4.5, 1]]) {
      const ln = L.hooks ? L.hooks[i] : HOOK_LINES2[Math.floor(rand(0, HOOK_LINES2.length))], who = i ? 'k2' : 'k1';
      steps.push({ do: () => { k.chase = false; k.follow = null; run.goTo(k, near(...tileOf(-(inner(sAt(dz)) - 1.0), dz)), 5.5); } });
      steps.push(on(() => faceOf(k), 1.7, 0.7, { pace: 900 }));
      steps.push({ until: () => !k.going, max: 2.5 });
      steps.push(on(() => mix(faceOf(k), flat(...gRail(i)), 0.25), 2.2, 0.5, { pace: 700, push: 0.03 }));
      steps.push(sayStep({ who, text: fillAll(ln[0]), act: ln[1] }));
      steps.push({ do: () => throwHook([OX - inner(sAt(dz)) + 0.6, OY + dz, (sheer(sAt(dz)) + 1.0) * LV], gRail(i)) });
      steps.push(fit(() => [faceOf(k, 0), faceOf(k, 1), flat(...gRail(i))], 1.8, 0.5));
      steps.push({ wait: 0.6 });
    }
    // the flagship's crew answer
    steps.push({ do: () => { for (let i = 0; i < 3; i++) run.later(i * 0.3, () => throwHook(gRail(i + 1), railOf([-6, 1, 9][i]))); } });
    steps.push(fit(() => [flat(...gRail(0)), flat(...gRail(2)), flat(...railOf(-6)), flat(...railOf(9))], 1.3, 0.8));
    steps.push({ wait: 1.4 });
    steps.push({ do: () => { for (const h of S.hooks) h.taut = 1; g.close.x += 1.2; camera.shake(8); sfx('thud'); } });
    steps.push({ wait: 0.8 });
    // the two captains among the flagship's crew at her rail: close on them, the second calls across
    const [ida, idb] = v.finals, a = capOf(ida), bb = capOf(idb);
    const capOnRail = (id) => () => { const c = g.crew.find((q) => q.cap === id); return c ? crewFace(g, c) : galleonAt(); };
    steps.push(fit(() => [capOnRail(ida)(), capOnRail(idb)()], 2.0, 1.0, { wait: true, push: 0.02 }));
    steps.push({ card: [`${a.name.toUpperCase()}  &  ${bb.name.toUpperCase()}`, `${a.title} · ${bb.title}`], dur: 2.8 });
    steps.push(on(capOnRail(idb), 2.1, 0.6, { push: 0.03 }));
    steps.push({ say: { ...capSpeaker(bb), text: fillAll(L.second || pick(CAPTAIN_CRIES)), focus: capOnRail(idb) } });
    steps.push({ do: () => {
      // the captains leave their places on the rail: the first leaps the gap, the second swings over from the mainmast
      const mast = () => [g.x, g.y - 0.8, g.lv + 17 * LV];
      run.finals = [[ida, -1.2, 2, false], [idb, 2.6, 4, true]].map(([id, dz, ri, sw]) => {
        g.crew = g.crew.filter((c) => c.cap !== id);
        return spawnCaptain(id, flagRail(ri), near(...tileOf(-2.2 + (sw ? 1.6 : 0), dz)), 'boss', null, sw ? { swing: mast } : {});
      });
      world.boss = run.finals[0];
    } });
    steps.push(fit(() => [...run.finals.map((m) => faceOf(m)), faceOf(p(), 0.4)], 1.4, 0.6));
    steps.push({ until: () => run.finals.every((m) => !m.entering), max: 5 });
    // the knights leap into the captains, runeblades first
    for (const [k, i] of [[k1, 0], [k2, 1]]) {
      const who = i ? 'k2' : 'k1';
      steps.push(lineShot(who));
      steps.push(sayStep({ who, text: fillAll(L.charge ? L.charge[i] : CHARGE_LINES[(run.talk + i * 2) % CHARGE_LINES.length]), act: 'rage' }));
      steps.push({ do: () => strike(k, run.finals[i], true) });
      steps.push(fit(() => [faceOf(k, 0), faceOf(k, 1.2), faceOf(run.finals[i], 0), faceOf(run.finals[i], 1)], 1.9, 0.4));
      steps.push({ wait: 0.9 });
    }
    steps.push({ until: () => !k1.jumping && !k2.jumping && !k1.slash && !k2.slash, max: 3 });
    steps.push({ do: () => { for (const k of [k1, k2]) { k.ally = true; k.chase = true; k.follow = heroSide(k === k1 ? -1 : 1); } } });
    steps.push(backToHero(0.9));
    scene('hooks', steps, () => { run.phase = 'final'; run.t = 0; UI.centerMsg('THE LAST FIGHT', 'Both captains are on your deck', 2.2); });
  }

  // ---- a story's gauntlet: the master at the flagship's rail sends his champions over wave by wave, then comes himself
  const GA = v.gauntlet;
  function gauntletIntro() {
    run.phase = 'gauntlet'; run.gw = -1; run.gBoss = [];
    settleKnights();
    const mk = GA.master, ma = capOf(mk);
    const steps = [
      fit(() => [focusOf(mk), faceOf(p(), 0.4)], 1.2, 1.2, { wait: true, min: 0.5 }),
      on(() => focusOf(mk), closeOf(mk), 0.8, { wait: true, push: 0.02 }),
      { card: [ma.name.toUpperCase(), ma.title], dur: 2.6 },
    ];
    for (const ln of GA.intro) { steps.push(lineShot(ln.who, ln.who === mk ? null : mk)); steps.push(sayStep(fl(ln))); }
    scene('gauntlet', steps, () => { knightsBack(); nextGauntlet(); });
  }
  /** The next wave's champions (1-2) leap and swing over from her rail; after the last, the master. */
  function nextGauntlet() {
    const wv = GA.waves[++run.gw];
    if (!wv) { masterComes(); return; }
    settleKnights();
    const g = S.galleon, mast = () => (S.galleon ? [S.galleon.x, S.galleon.y - 0.8, S.galleon.lv + 17 * LV] : [OX - 15, OY, 40]);
    const steps = [lineShot(wv.line.who, wv.line.who === 'hero' ? GA.master : 'hero'), sayStep(fl(wv.line)),
      { do: () => {
        run.gBoss = wv.keys.map((key, i) => {
          const sw = i === 1, from = g ? flagRail(i ? 4 : 2) : [OX - 15, OY + i * 3, 6];
          return spawnCaptain(key, from, near(...tileOf(-2.2 + (sw ? 1.6 : 0), i ? 2.6 : -1.2)), 'boss', null, { hp: wv.keys.length > 1 ? 0.55 : 0.75, ...(sw ? { swing: mast } : {}) });
        });
        world.boss = run.gBoss[0];
      } },
      fit(() => [...run.gBoss.map((m) => faceOf(m)), faceOf(p(), 0.4)], 1.4, 0.6),
      { until: () => run.gBoss.every((m) => !m.entering), max: 5 },
    ];
    for (const key of wv.keys) { steps.push(on(() => focusOf(key), closeOf(key), 0.5, { push: 0.02 })); steps.push({ card: [capOf(key).name.toUpperCase(), capOf(key).title], dur: 2.0 }); steps.push({ wait: 1.6 }); }
    steps.push(backToHero(0.8));
    scene('gw' + run.gw, steps, () => { knightsBack(); run.phase = 'gauntlet'; });
  }
  /** The master's last words with everyone, his card, and over the rail he comes. */
  function masterComes() {
    settleKnights();
    const mk = GA.master, ma = capOf(mk), steps = [];
    for (const ln of GA.finale) { steps.push(lineShot(ln.who, ln.who === mk ? 'hero' : mk)); steps.push(sayStep(fl(ln))); }
    steps.push({ do: () => {
      if (S.galleon) S.galleon.crew = S.galleon.crew.filter((c) => c.cap !== mk);
      run.masterM = spawnCaptain(mk, S.galleon ? flagRail(0) : [OX - 15, OY, 6], near(...tileOf(-1.6, 1)), 'boss', null, { hp: 1.6, lv: 3 });
      world.boss = run.masterM;
    } });
    steps.push(fit(() => [faceOf(run.masterM, 1.1), faceOf(run.masterM, -0.1), faceOf(p(), 0.4)], 1.3, 0.6));
    steps.push({ until: () => run.masterM && !run.masterM.entering, max: 5 });
    steps.push(on(() => faceOf(run.masterM), closeOf(mk) * 0.85, 0.5, { push: 0.02 }));
    steps.push({ card: [ma.name.toUpperCase(), ma.title], dur: 2.6 });
    steps.push(backToHero(0.8));
    scene('master', steps, () => { knightsBack(); run.phase = 'master'; UI.centerMsg(ma.name.toUpperCase(), 'The last of them', 2.2); });
  }
  function masterFalls() {
    run.phase = 'masterdead'; world.boss = null;
    settleKnights();
    const steps = [{ wait: 0.8 }];
    for (const ln of GA.death) { steps.push(lineShot(ln.who, ln.who === 'hero' ? GA.master : 'hero')); steps.push(sayStep(fl(ln))); }
    scene('death', steps, () => victory());
  }

  // ---- victory
  function victory() {
    run.phase = 'victory';
    settleKnights();
    for (const k of [run.k1, run.k2]) if (k) { k.chase = true; k.follow = heroSide(k === run.k1 ? -1 : 1); }
    const g = S.galleon;
    const chestAt = () => { const c = run.chest; return c ? flat(c.x, c.y, lvAt(c.x, c.y), 20) : faceOf(p(), 0.3); };
    const steps = [
      { wait: 1.0 },
      // the chains between the ships come off
      fit(() => [faceOf(p(), 0), galleonAt(), ...S.hooks.map((h) => flat(...h.to))], 0.95, 1.4, { wait: true, min: 0.5 }),
      { do: () => { for (const h of S.hooks) { const [x, y, l] = h.to; sparkle(x, y, l * HS, '#ffd080', 10, 0.4); } S.hooks.length = 0; sfx('thud'); camera.shake(5); } },
      { wait: 0.6 },
    ];
    if (run.k1 && g) {
      // still not joining: they leap onto the limping flagship to have words with whoever fired that broadside
      for (const [i, who] of [[0, 'k1'], [1, 'k2']]) {
        const ln = L.farewell ? L.farewell[i] : FAREWELLS[(run.talk + i * 3) % FAREWELLS.length];
        steps.push(lineShot(who, 'hero'));
        steps.push(sayStep({ who, text: fillAll(ln[0]), act: ln[1] }));
      }
      steps.push({ do: () => { for (const [k, i, dly] of [[run.k1, 1, 0], [run.k2, 3, 0.3]]) run.later(dly, () => { k.ally = false; knightJump(k, () => flagRail(i), 1.1, 110, () => { k.onFlagship = true; }); }); } });
      steps.push(fit(() => [faceOf(run.k1), faceOf(run.k2), flat(...flagRail(1)), flat(...flagRail(3))], 1.4, 0.7));
      steps.push({ until: () => !run.k1.jumping && !run.k2.jumping, max: 3 });
      steps.push({ wait: 0.4 });
    }
    // she limps off and sinks away into the clouds below
    steps.push({ do: () => { if (g) g.leaving = true; } });
    steps.push(on(galleonAt, 0.7, 1.2, { pace: 900 }));
    steps.push({ wait: 2.0 });
    steps.push(on(gateAt, 1.6, 1.6, { wait: true, push: 0.02 }));
    steps.push({ do: () => { S.gateColor = '#40a0ff'; S.gateFlash = 1.4; sfx('gate'); addEffect(new Ring(OX + 0.5, OY + GATE.z + 0.8, 0.2, 3, 1, '#40a0ff', 5)); } });
    steps.push({ card: ['VICTORY', 'The gate now leads onward'], dur: 2.6 });
    steps.push({ wait: 1.2 });
    // the hoard chest rises on the hatch
    steps.push(on(() => { const [x, y] = run.hoardAt || [OX + 0.5, OY + 0.5]; return flat(x, y, lvAt(x, y), 20); }, 1.8, 1.4, { wait: true }));
    steps.push({ do: () => spawnHoard() });
    steps.push({ wait: 1.2 });
    steps.push(on(() => mix(faceOf(p()), chestAt(), 0.3), 2.3, 0.8, { pace: 700, push: 0.02 }));
    steps.push({ say: { name: G.char.name, color: '#9fd0ff', portrait: heroPortrait, text: L.victory ? fillAll(L.victory) : pick(VICTORY), voice: { pitch: 1 }, focus: () => faceOf(p()) } });
    steps.push(backToHero(0.9));
    run.hoardAt = near(OX + 0.5, OY + 0.5);
    scene('victory', steps, () => { run.completed = true; run.phase = 'done'; UI.refresh(); onSuccess(); });
  }
  function spawnHoard() {
    const [x, y] = run.hoardAt || near(OX + 0.5, OY + 0.5);
    const chest = {
      x, y, rare: true, sky: true, opened: false, reach: 1.3,
      use() {
        if (this.opened) return;
        this.opened = true; sfx('chest'); sfx('gold');
        dropChest(world, this, depth);
        // the hoard: a better chance at Epic and above than any other chest
        const st0 = G.player ? G.player.st : { magicFind: 0 }, il = lvl + 2;
        world.addLoot(new GroundItem(this.x, this.y + 0.3, 'item', { item: rollItem(il, { mf: st0.magicFind, bonus: 1.6 }) }));
        if (chance(0.35)) world.addLoot(new GroundItem(this.x + 0.3, this.y + 0.2, 'item', { item: rollItem(il, { rarity: rarityAt(il, chance(0.2) ? 4 : 3) }) }));
        sparkle(this.x, this.y, 20, '#ffd060', 30, 0.6);
      },
    };
    world.chests.push(chest);
    addEffect(new Ring(x, y, 0.2, 2.4, 0.8, '#ffd060', 6)); sparkle(x, y, 40, '#ffd060', 40, 0.8); sfx('gold');
    run.chest = chest;
  }

  // ------------------------------------------------------------------ captains' specials and the weather
  function captainMoves(dt) {
    const pl = p(); if (!pl || pl.dead) return;
    for (const m of live) {
      if (!m.captain || m.dead || m.entering || m.parley) continue;
      if ((m.moveT -= dt) > 0) continue;
      m.moveT = rand(7, 10.5);
      const mv = pick([...m.captain.moves, 'climb', 'swing', 'rappel']);
      if (mv === 'crew') {
        const boat = S.boats.find((b) => b.st === 'dock') , from = boat ? [boat.x, boat.y, boat.lv] : S.galleon ? galleonPort() : [OX - 18, OY + rand(-5, 5), 40];
        for (let i = 0; i < 2 + (lvl > 40 ? 1 : 0); i++) run.later(i * 0.4, () => spawnPirate(pickCrew().id, 'normal', from, near(pl.x + rand(-3, 3), pl.y + rand(-3, 3)), 99));
        floatText(m.x, m.y, 80, 'ALL HANDS!', '#ffb070', 16);
      } else if (mv === 'hook') {
        addEffect(new Telegraph({ kind: 'line', x: m.x, y: m.y, ang: Math.atan2(pl.y - m.y, pl.x - m.x), len: Math.hypot(pl.x - m.x, pl.y - m.y), w: 0.5, dur: 0.8, color: '#c0a070' }), 'ground');
        run.later(0.8, () => {
          if (m.dead || pl.dead) return;
          const h = { from: [m.x, m.y, lvAt(m.x, m.y) + 8], to: [pl.x, pl.y, lvAt(pl.x, pl.y) + 6], t: 0, taut: 1 }; S.hooks.push(h);
          let t = 0;
          run.scripted.push((dt) => { t += dt; h.t = Math.min(1, t * 4); h.to = [pl.x, pl.y, lvAt(pl.x, pl.y) + 6]; h.from = [m.x, m.y, lvAt(m.x, m.y) + 8];
            const d = Math.hypot(m.x - pl.x, m.y - pl.y); if (t > 0.25 && d > 1.4) world.map.move(pl, (m.x - pl.x) / d * dt * 9, (m.y - pl.y) / d * dt * 9);
            if (t > 0.75 || m.dead) { drop(S.hooks, h); return false; } return true; });
          aoe(world, m, pl.x, pl.y, 0.8, m.dmg * 0.5, 'phys', {}); sfx('swing');
        });
        floatText(m.x, m.y, 80, 'GET OVER HERE!', '#ffb070', 16);
      } else if (mv === 'leap') {
        const to = near(pl.x, pl.y, 1.5);
        addEffect(new Telegraph({ kind: 'circle', x: to[0], y: to[1], r: 2.2, dur: 1.1 }), 'ground');
        leap(m, [m.x, m.y, lvAt(m.x, m.y)], to, { dur: 1.1, arc: 160 });
      } else if (mv === 'barrage') {
        volleyAtDeck(5); floatText(m.x, m.y, 80, S.galleon ? 'FIRE ALL GUNS!' : 'POWDER! NOW!', '#ffb070', 16);
      } else if (mv === 'storm') {
        for (let i = 0; i < 3; i++) run.later(i * 0.45, () => lightningAt(...(i === 0 ? near(pl.x, pl.y, 1) : near(pl.x + rand(-4, 4), pl.y + rand(-4, 4)))));
        floatText(m.x, m.y, 80, 'STORM, ANSWER ME!', '#c0d8ff', 16);
      } else if (mv === 'climb') {
        // up onto something high, a taunt, then down onto the hero
        const perches = [[0, FC_H + 6.6, -14.9], [-1.95, FC_H + 3.6, -13.5], [1.95, FC_H + 3.6, -13.5], [0, sheer(0) + 0.35, 19.6], [-4.44, QD_H + 1.3, 17.6], [4.44, QD_H + 1.3, 17.6]];
        const [px, py, pz] = perches.reduce((a, b) => Math.hypot(OX + b[0] - m.x, OY + b[2] - m.y) < Math.hypot(OX + a[0] - m.x, OY + a[2] - m.y) ? b : a);
        floatText(m.x, m.y, 80, 'CATCH ME IF YOU CAN!', '#ffb070', 15);
        leap(m, [m.x, m.y, lvAt(m.x, m.y)], [OX + px, OY + pz], { toLv: py * LV, arc: 120, dur: 1.0, perch: (mm) => {
          floatText(mm.x, mm.y, 110 + py * LV * HS / 4, 'UP HERE!', '#ffd090', 18);
          const tgt = near(pl.x, pl.y, 1.2);
          run.later(0.6, () => addEffect(new Telegraph({ kind: 'circle', x: tgt[0], y: tgt[1], r: 2.3, dur: 1.0 }), 'ground'));
          run.later(1.6, () => { if (!mm.dead) leap(mm, [mm.x, mm.y, py * LV], tgt, { dur: 0.75, arc: 50 }); });
        } });
      } else if (mv === 'swing') {
        // a rope off the bridge spire (or the flagship's rigging): a long swing through the hero
        const anchor = S.galleon && chance(0.5) ? () => [S.galleon.x, S.galleon.y - 0.8, S.galleon.lv + 17 * LV] : () => [OX + 0.5, OY - 14.9, (FC_H + 13) * LV];
        const dx = pl.x - m.x, dy = pl.y - m.y, d = Math.hypot(dx, dy) || 1, to = near(pl.x + dx / d * 2.5, pl.y + dy / d * 2.5, 1.5);
        addEffect(new Telegraph({ kind: 'line', x: m.x, y: m.y, ang: Math.atan2(to[1] - m.y, to[0] - m.x), len: Math.hypot(to[0] - m.x, to[1] - m.y), w: 1.2, dur: 0.7, color: '#d0a060' }), 'ground');
        floatText(m.x, m.y, 80, 'ROPE!', '#ffb070', 16);
        run.later(0.7, () => { if (!m.dead && !m.entering) swingAcross(m, anchor, to, { dur: 1.3 }); });
      } else if (mv === 'rappel') {
        // boarders slide down ropes out of the sky around the hero
        floatText(m.x, m.y, 80, 'DROP THE LINES!', '#ffb070', 16);
        for (let i = 0; i < 2 + (lvl > 40 ? 1 : 0); i++) run.later(i * 0.35, () => spawnPirate(pickCrew().id, 'normal', null, near(pl.x + rand(-3, 3), pl.y + rand(-3, 3)), 99, 'rope'));
      } else if (mv === 'smoke') {
        smoke(m.x, m.y, 10, '#2a2a30', 14, 20);
        const to = near(pl.x - (m.x - pl.x) * 0.5, pl.y - (m.y - pl.y) * 0.5, 1.5);
        m.x = to[0]; m.y = to[1]; smoke(m.x, m.y, 10, '#2a2a30', 10, 16); sfx('arcane', 0.5);
      }
    }
  }
  function lightningAt(x, y) {
    addEffect(new Telegraph({ kind: 'circle', x, y, r: 1.3, dur: 1.1, color: '#a8c8ff' }), 'ground');
    run.later(1.1, () => {
      S.bolts.push({ x, y, lv: lvAt(x, y), t: 0, dx: rand(-120, 120), seed: (Math.random() * 1e6) | 0 }); S.flash = Math.max(S.flash, 0.55);
      const dmg = base.dmg * 1.8;
      aoe(world, null, x, y, 1.3, dmg, 'light', { team: 'enemy' }); if (!G.cine) aoe(world, null, x, y, 1.3, dmg, 'light', { team: 'player' });
      burst(x, y, 10, 'light', 16, 4); camera.shake(7); sfx('explode', 0.5);
    });
  }
  function weather(dt) {
    const pl = p(); if (!pl) return;
    run.hz = (run.hz ?? rand(6, 9)) - dt;
    if (v.hazard === 'lightning' && run.hz <= 0) { run.hz = rand(5.5, 8.5); const n = 2 + (chance(0.5) ? 1 : 0); for (let i = 0; i < n; i++) run.later(i * 0.6, () => lightningAt(...(i === 0 ? near(pl.x + rand(-1.5, 1.5), pl.y + rand(-1.5, 1.5)) : near(OX + rand(-5, 5), OY + rand(-10, 14))))); }
    if (v.hazard === 'wind') {
      if (run.hz <= 0) { run.hz = rand(7, 10); run.gust = 3; UI.centerMsg('', 'A gust!', 1); }
      if ((run.gust = (run.gust || 0) - dt) > 0) {
        S.windK = 2.4;
        for (const c of world.creatures) if (!c.dead && !c.entering && !c.static) world.map.move(c, -1.4 * dt, 0.7 * dt);
        for (const n of world.npcs) if (n.calm) { const nx = n.x - 0.5 * dt; if (world.map.walkable(nx, n.y)) n.x = nx; }
      } else S.windK = 1;
    }
    if (v.hazard === 'chill' && run.hz <= 0) {
      run.hz = rand(8, 11);
      const z = rand(-9, 15), x0 = OX - 5.5, y = OY + z;
      addEffect(new Telegraph({ kind: 'line', x: x0, y, ang: 0, len: 11, w: 1.6, dur: 1.4, color: '#a0e0ff' }), 'ground');
      run.later(1.4, () => {
        for (let x = x0; x <= x0 + 11; x += 1.2) { aoe(world, null, x, y, 0.9, base.dmg * 0.8, 'cold', { team: 'enemy' }); if (!G.cine) aoe(world, null, x, y, 0.9, base.dmg * 0.8, 'cold', { team: 'player' }); spawn({ type: 'glow', x, y, z: 10, vz: 30, life: 0.6, size: 10, size1: 0, color: '#d8f4ff', add: true }); }
        sfx('arcane', 0.4);
      });
    }
    if (v.hazard === 'embers' && run.hz <= 0) {
      run.hz = rand(4.5, 7);
      for (let i = 0; i < 3; i++) {
        const [x, y] = i === 0 ? near(pl.x + rand(-2.5, 2.5), pl.y + rand(-2.5, 2.5)) : near(OX + rand(-5, 5), OY + rand(-10, 14));
        addEffect(new Telegraph({ kind: 'circle', x, y, r: 1.1, dur: 1.2, color: '#ff8a30' }), 'ground');
        run.later(1.2, () => world.addHazard(firePatch(x, y)));
      }
    }
  }
  /** A burning patch of deck: hurts whoever stands in it (both sides) for a few seconds. */
  function firePatch(x, y) {
    let t = 0, tick = 0;
    return {
      ground: true, x, y,
      update(dt) {
        t += dt; tick -= dt;
        if (tick <= 0) { tick = 0.5; aoe(world, null, x, y, 1.0, base.dmg * 0.35, 'fire', { team: 'enemy' }); aoe(world, null, x, y, 1.0, base.dmg * 0.35, 'fire', { team: 'player' }); }
        if (chance(dt * 30)) spawn({ type: 'glow', x: x + rand(-0.8, 0.8), y: y + rand(-0.8, 0.8), z: 2, vz: rand(40, 90), life: rand(0.4, 0.8), size: rand(6, 12), size1: 0, color: chance(0.5) ? '#ff7a20' : '#ffc040', add: true });
        if (chance(dt * 5)) smoke(x + rand(-0.5, 0.5), y + rand(-0.5, 0.5), 20, '#2a2220', 1, 10);
        return t < 5;
      },
      draw(ctx) {   // a dark scorch under the flames (the flames themselves are particles)
        const px = isoX(x, y), py = isoY(x, y), k = Math.min(1, t * 3, (5 - t) * 2);
        ctx.globalAlpha = 0.45 * k; ctx.drawImage(glowSprite('#1a0e08'), px - 50, py - 25, 100, 50); ctx.globalAlpha = 1;
      },
    };
  }

  // ------------------------------------------------------------------ every frame
  let started = false;
  function tick(dt) {
    const pl = p();
    if (!started) { started = true; intro(); }
    // scripted motions and timers run in cut scenes too (game.js keeps calling us)
    const sc = run.scripted; run.scripted = [];   // a motion may queue the next one (a walk's next leg) while this runs
    for (const f of sc) if (f(dt) !== false) run.scripted.push(f);
    for (const tm of run.timers.slice()) if ((tm[0] -= dt) <= 0) { drop(run.timers, tm); tm[1](); }
    for (const b of S.boats) boatTick(b, dt);
    S.boats = S.boats.filter((b) => !b.dead);
    run.rushing = null;
    galleonTick(dt);
    knightTick(dt);
    for (const s of S.shots) { s.t += dt; if (s.t >= s.dur && !s.done) { s.done = true; if (s.onHit) s.onHit(); } }
    S.shots = S.shots.filter((s) => !s.done);
    for (const b of S.bolts) b.t += dt;
    S.bolts = S.bolts.filter((b) => b.t < 0.4);
    S.flash = Math.max(0, S.flash - dt * 2.5);
    S.gateFlash = Math.max(0, S.gateFlash - dt * 0.8);
    if (S.through > 0) S.through = Math.max(0, S.through - dt / 2.4);
    if (S.bank && (S.bank.t += dt) > 8) S.bank = null;
    if (v.lightning && chance(dt * 0.12)) S.flash = Math.max(S.flash, 0.25);   // far-off lightning lights the clouds
    lights();
    for (const m of live) if (m.dead) live.delete(m);
    if (G.cine || !pl || pl.dead) return;
    run.t += dt;
    if (run.phase !== 'intro' && run.phase !== 'victory' && run.phase !== 'done') weather(dt);
    captainMoves(dt);
    knightsFight(dt);
    // nothing on the deck to fight: whatever is on its way hurries (hurry), so the hero never stands about waiting
    S.calm = world.creatures.some((m) => m.team === 'enemy' && !m.dead && !m.entering && m.targetable !== false) ? 0 : (S.calm || 0) + dt;
    if (S.calm > 0.05) run.rushing = hurry();
    if (run.phase === 'waves') {
      // the next wave is called once this one is all over the rail and down to its last two, so it is on its way in
      // time; the mid-boss's gasbag sets out then too, but his scene and the parley wait for a clear deck
      const W = SKY_WAVES[run.wave], last = run.wave + 1 >= SKY_WAVES.length, mid = W && W.mid && !run.midDone;
      const left = [...live].filter((m) => !m.dead), over = !coming(run.wave), few = over && left.length <= 2 && left.every((m) => !m.entering);
      if (few && !last && !mid) startWave(run.wave + 1);
      else if (few && mid) midBoat();
      if (over && !left.length && (last || mid) && (run.pause = (run.pause ?? 0.3) - dt) <= 0) { run.pause = undefined; if (last) parley(); else { run.midDone = true; midBoss(); } }
    } else if (run.phase === 'mid') {
      if (run.midM && run.midM.dead && !run.midBoat.crew.length) { UI.centerMsg(`${run.midM.name.toUpperCase()} FALLS`, 'More sails on the wind', 2.4); world.boss = null; startWave(run.wave + 1, true); }
    } else if (run.phase === 'flagship') {
      const g = S.galleon;
      run.duelT += dt * (S.calm > 0.05 ? 6 : 1);   // she closes over about 26 s, faster while nothing is on the deck to fight
      g.k = Math.min(1, run.duelT / 26);
      if ((run.volleyT -= dt) <= 0) { run.volleyT = rand(3.2, 4.4); volleyAtDeck(3 + (g.k > 0.5 ? 1 : 0)); }
      if ((run.returnT -= dt) <= 0) {   // the ironclad's port battery answers
        run.returnT = rand(1.2, 2.2);
        const to = [g.x + rand(-2, 2), g.y + rand(-8, 8), g.lv + rand(0, 1) * LV];
        cannon(shipPort(), to, () => { burst(to[0], to[1], to[2] * HS, 'fire', 14, 4); smoke(to[0], to[1], to[2] * HS, '#3a3230', 5, 16); if (chance(0.4) && g.burn.length < 7) g.burn.push([rand(-3, 3), rand(-1, 1), rand(-12, 12)]); sfx('explode', 0.3); }, 1.0);
      }
      // her boarders come over in threes all the way in (a champion leads every other three), the next three while the
      // last of these still stands
      const fb = [...live].filter((m) => !m.dead && m.wave === 98);
      if (g.k < 1 && fb.length <= 1 && fb.every((m) => !m.entering) && !coming(98)) {
        const lot = run.lots = (run.lots || 0) + 1;
        for (let i = 0; i < 3; i++) run.later(i * 0.4, () => spawnPirate(pickCrew().id, i === 0 && lot % 2 ? 'champion' : 'normal', galleonPort(), near(OX - 3 + rand(-1, 2), OY + rand(-6, 8)), 98), 98);
      }
      if (g.k >= 1 && ![...live].some((m) => !m.dead)) hooks();
    } else if (run.phase === 'final') {

      if (run.finals.length && run.finals.every((m) => m.dead) && ![...live].some((m) => !m.dead)) { world.boss = null; if (GA) gauntletIntro(); else victory(); }
      else if (world.boss && world.boss.dead) world.boss = run.finals.find((m) => !m.dead) || null;
    } else if (run.phase === 'gauntlet') {
      if (run.gBoss.every((m) => m.dead) && ![...live].some((m) => !m.dead)) { world.boss = null; run.phase = 'gauntlet-next'; run.later(0.3, () => nextGauntlet()); }
      else if (world.boss && world.boss.dead) world.boss = run.gBoss.find((m) => !m.dead) || null;
    } else if (run.phase === 'master') {
      if (run.masterM && run.masterM.dead && ![...live].some((m) => !m.dead)) masterFalls();
    }
  }
  /** At night (and in dark weather) the ship's lanterns, braziers, furnaces and the gate light the deck. */
  function lights() {
    if (!world.darkK) return;
    for (const [x, y, z] of A.ship.lamps) addLight(OX + x, OY + z, 3.2, 0.9, y * LV * HS);
    for (const [x, y, z] of A.ship.braziers) addLight(OX + x, OY + z, 3.5, 1, y * LV * HS);
    addLight(OX + 0.5, OY + GATE.z + 0.6, 4.5, 1, (FC_H + 1.2) * LV * HS);
    for (const b of S.boats) if (b.alpha > 0.3) addLight(b.x, b.y, 3, 0.7 * b.alpha, b.lv * HS);
    const g = S.galleon;   // the flagship's lanterns along her rail
    if (g && g.alpha > 0.2) for (let i = 0; i < A.galleon.rail.length; i += 2) { const [x, y, z] = A.galleon.rail[i]; addLight(g.x + x, g.y + z, 3.6, 0.8 * g.alpha, (g.lv + y * LV) * HS + 30); }
  }
  return run;
}
