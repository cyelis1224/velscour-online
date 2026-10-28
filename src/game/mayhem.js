// Monster traits (hunters, tanks, bullet-hell casters, phasers, burrowers), ambush waves that arrive mid-level
// (dropping from the sky, teleporting in, crawling out of the ground or out of the walls), and the MADNESS meter.
import { G } from '../state.js';
import { net } from '../net/network.js';
import { rand, chance, TAU, pick, shuffle, clamp } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { camera } from '../core/view.js';
import { addEffect, Ring, Column, Telegraph, burst, sparkle, smoke, floatText, elem, spawn } from '../gfx/vfx.js';
import { aoe } from './combat.js';
import { makeMonster } from './monster.js';
import { depthLevel } from '../data/depth.js';

// ---------------------------------------------------------------- traits
// name prefix, the extra special moves it brings, and how it changes the monster
export const TRAITS = {
  hunter: { name: 'Hunting', moves: [], fn: (m) => { m.hunter = true; m.awake = true; m.speed *= 1.15; m.aggroRange = 30; } },
  tank: { name: 'Hulking', moves: [], fn: (m) => { m.maxHp *= 4.5; m.dmg *= 1.3; m.xp *= 3.5; m.scale = (m.scale || 1) * 1.35; m.r *= 1.2; m.speed *= 0.72; m.res = { ...m.res, phys: (m.res.phys || 0) + 0.25 }; m.tank = true; } },
  gunner: { name: 'Hexfire', moves: ['spiral', 'cross', 'rings', 'wall', 'rain', 'homing'], n: 3, fn: (m) => { m.xp *= 1.6; m.aura = m.aura || '#c040ff'; } },
  phaser: { name: 'Phasing', moves: ['phase'], fn: (m) => { m.xp *= 1.4; } },
  burrower: { name: 'Burrowing', moves: ['burrow'], ok: (m) => !m.fly, fn: (m) => { m.xp *= 1.4; } },
};

/** Give a monster a trait (keeps elites' own names; the prefix only goes on normal ones). */
export function applyTrait(m, key) {
  const T = TRAITS[key];
  if (!T || (T.ok && !T.ok(m))) return m;
  m.trait = key;
  T.fn(m);
  if (T.moves.length) {
    const add = T.n ? shuffle(T.moves.slice()).slice(0, T.n) : T.moves;
    m.moves = [...new Set([...(m.moves || []), ...add])];
    m.moveCd = Math.min(m.moveCd || 2, rand(1, 2.5));
  }
  m.hp = m.maxHp;
  if (m.rank === 'normal') m.name = `${T.name} ${m.name}`;
  return m;
}

/** A pack's trait (or null): more often deeper. Hunters are capped per level. */
export function rollTrait(world, depth, force = false, rnd = Math.random) {
  if (!force && rnd() >= Math.min(0.55, 0.22 + depth * 0.004)) return null;
  const list = ['hunter', 'tank', 'tank', 'gunner', 'gunner', 'phaser', 'burrower'];
  const k = list[Math.floor(rnd() * list.length)];
  if (k === 'hunter') { if ((world.hunters = (world.hunters || 0) + 1) > 2) return 'tank'; }
  return k;
}

// ---------------------------------------------------------------- ambush arrivals
const ENTRY = ['drop', 'teleport', 'burrow', 'wall'];

/** Floor spot near (x, y) the hero can reach, `r0..r1` tiles away. */
function spotNear(w, x, y, r0, r1, rr) {
  for (let i = 0; i < 30; i++) {
    const a = rand(TAU), r = rand(r0, r1), sx = x + Math.cos(a) * r, sy = y + Math.sin(a) * r;
    if (w.map.circleFree(sx, sy, rr) && w.map.flowAt(sx, sy) >= 0) return [sx, sy];
  }
  return null;
}

/** A floor tile next to a wall near the hero, with the wall side: monsters claw their way out of it. */
function wallSpot(w, x, y) {
  const map = w.map;
  for (let i = 0; i < 40; i++) {
    const a = rand(TAU), r = rand(3, 7), tx = Math.floor(x + Math.cos(a) * r), ty = Math.floor(y + Math.sin(a) * r);
    const cx = tx + 0.5, cy = ty + 0.5;
    if (!map.circleFree(cx, cy, 0.35) || map.flowAt(cx, cy) < 0) continue;
    for (const [dx, dy] of shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]])) if (!map.isFloor(cx + dx, cy + dy)) return [cx, cy, cx + dx * 0.7, cy + dy * 0.7];
  }
  return null;
}

/** Start a monster's entrance: it can't act or be hit until it lands / forms / surfaces. */
export function enter(m, kind, from) {
  const w = m.world, g = elem(m.el && m.el !== 'phys' ? m.el : 'arcane').glow, tx = m.x, ty = m.y, big = Math.sqrt(m.scale || 1);
  let t = 0;
  m.targetable = false; m.awake = true; m.moving = false;
  const finish = () => { m.entering = null; m.targetable = true; m.alpha = undefined; m.z = 0; m.x = tx; m.y = ty; m.cd = rand(0.2, 0.6); };
  if (kind === 'drop') {
    // falls from above the top of the screen, a shadow growing under it, and lands with a shockwave
    const dur = rand(0.9, 1.3);
    addEffect(new Telegraph({ kind: 'circle', x: tx, y: ty, r: 1.3 * big, dur }), 'ground');
    m.z = 520;
    m.entering = (dt) => {
      t += dt; m.animT += dt;
      const k = Math.min(1, t / dur);
      m.z = 520 * (1 - k * k);
      if (chance(dt * 30)) spawn({ type: 'glow', x: tx + rand(-0.2, 0.2), y: ty + rand(-0.2, 0.2), z: m.z + 20, vz: 60, life: 0.3, size: 4, size1: 0, color: g, add: true });
      if (k >= 1) {
        finish();
        aoe(w, m, tx, ty, 1.3 * big, m.dmg * 0.8, 'phys', { knock: 0.7 });
        addEffect(new Ring(tx, ty, 0.2, 2.2 * big, 0.45, '#d8c8a8', 5));
        smoke(tx, ty, 4, '#5a4a3a', 10, 14); burst(tx, ty, 6, 'phys', 16, 4);
        camera.shake(m.tank ? 7 : 4); sfx('thud', 0.8);
      }
    };
    sfx('swing', 0.5);
  } else if (kind === 'teleport') {
    // a rift opens, a column of light, the monster fades in
    const dur = 0.9;
    m.alpha = 0;
    addEffect(new Ring(tx, ty, 2, 0.2, dur, g, 4));
    m.entering = (dt) => {
      t += dt; m.animT += dt;
      m.alpha = Math.min(1, t / dur) * (0.6 + 0.4 * Math.sin(t * 40));
      if (chance(dt * 40)) sparkle(tx + rand(-0.6, 0.6), ty + rand(-0.6, 0.6), rand(5, 60), g, 1, 0.2);
      if (t >= dur) { finish(); addEffect(new Column(tx, ty, g, 0.4, 20, 240)); addEffect(new Ring(tx, ty, 0.2, 1.8, 0.35, g, 4)); sfx('arcane', 0.6); }
    };
    sfx('portal', 0.35);
  } else if (kind === 'burrow') {
    // the ground heaves, then it claws up out of the dirt
    const dur = 1.2;
    m.alpha = 0; m.z = -60;
    addEffect(new Telegraph({ kind: 'circle', x: tx, y: ty, r: 1.1 * big, dur: 0.6, color: '#c08040' }), 'ground');
    m.entering = (dt) => {
      t += dt; m.animT += dt;
      const k = Math.min(1, t / dur);
      m.alpha = clamp(k * 2 - 0.2, 0, 1); m.z = -60 * (1 - k); m.moving = true;
      if (chance(dt * 35)) spawn({ type: 'dot', x: tx + rand(-0.6, 0.6), y: ty + rand(-0.6, 0.6), z: 2, vz: rand(30, 80), g: 220, life: 0.6, size: rand(2, 4), color: chance(0.5) ? '#5a4630' : '#3a2e22' });
      if (t > 0.5 && t - dt <= 0.5) { smoke(tx, ty, 2, '#4a3a2a', 6, 12); sfx('thud', 0.5); }
      if (k >= 1) finish();
    };
  } else if (kind === 'wall') {
    // it tears itself out of the wall: stone chips fly as it slides onto the floor
    const dur = 1.0, [wx, wy] = from;
    m.x = wx; m.y = wy; m.alpha = 0.2;
    m.entering = (dt) => {
      t += dt; m.animT += dt;
      const k = Math.min(1, t / dur);
      m.x = wx + (tx - wx) * k; m.y = wy + (ty - wy) * k; m.alpha = 0.2 + 0.8 * k; m.moving = true;
      if (chance(dt * 30)) spawn({ type: 'dot', x: wx + rand(-0.3, 0.3), y: wy + rand(-0.3, 0.3), z: rand(10, 50), vx: (tx - wx) * rand(1, 3), vy: (ty - wy) * rand(1, 3), vz: rand(20, 60), g: 220, life: 0.7, size: rand(2, 3.5), color: chance(0.5) ? '#7a7068' : '#4a4440' });
      if (k >= 1) { finish(); smoke(tx, ty, 10, '#6a6058', 5, 10); sfx('thud', 0.5); }
    };
    sfx('thud', 0.4);
  }
}

/**
 * The ambush director: every so often a wave of the level's monsters arrives round the hero, hunting from the
 * first moment. Not in BOSS ROOMs or Velscour's arena, and never while a guardian fight is on.
 */
export function ambushTick(w, dt) {
  if (G.room && !G.game?.isDungeonAuthority(w.depth)) return;
  const p = w.player;
  if (w.kind !== 'dungeon' || w.raid || w.breach || !p || p.dead || !w.roster || !w.roster.length) return;
  if (w.boss && w.boss.awake && !w.boss.dead) return;
  if (w.ambushT === undefined) w.ambushT = rand(25, 40) / (w.heresyAmbush || 1);
  if ((w.ambushT -= dt) > 0) return;
  w.ambushT = rand(30, 55) * Math.max(0.6, 1 - w.depth * 0.004) / (w.heresyAmbush || 1); // Ambush Weather (game/heresies.js): three times as often
  // not on top of a fight that is already big
  if (w.hostiles('player', p.x, p.y, 9).length > 8) { w.ambushT = 8; return; }
  ambush(w);
}

export function ambush(w, kind = pick(ENTRY), n = 0) {
  const p = w.player, depth = w.depth || 1, lvl = depthLevel(depth);
  const arch = pick(w.roster);
  n = n || Math.min(7, 2 + Math.floor(rand(0, 3) + depth / 25));
  const trait = chance(0.45) ? pick(['tank', 'gunner', 'phaser', 'burrower']) : null;
  const batchId = Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
  const batch = [];
  let made = 0;
  for (let i = 0; i < n; i++) {
    let x, y, from = null;
    if (kind === 'wall') {
      const s = wallSpot(w, p.x, p.y);
      if (!s) { kind = 'burrow'; i--; continue; }
      [x, y] = s; from = [s[2], s[3]];
    } else {
      const s = spotNear(w, p.x, p.y, kind === 'drop' ? 2.5 : 3, kind === 'drop' ? 6 : 7, 0.4);
      if (!s) continue;
      [x, y] = s;
    }
    const rank = i === 0 && chance(0.2 + depth * 0.003) ? 'champion' : 'normal';
    const m = makeMonster(w, arch, w.biome, lvl + (rank === 'normal' ? 0 : 1), rank, x, y, 0);
    m.netId = `ambush_${batchId}_${i}`;
    m.enteringKind = kind;
    m.enteringFrom = from;
    if (i === 0 && trait) applyTrait(m, trait);
    m.awake = true; m.hunter = true; m.ambusher = true;
    w.add(m);
    const delay = i * rand(0.12, 0.3);
    if (delay > 0) { m.targetable = false; m.alpha = 0; let d = delay; m.entering = (dt) => { if ((d -= dt) <= 0) enter(m, kind, from); }; }
    else enter(m, kind, from);
    batch.push({
      netId: m.netId,
      idx: m.idx,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      from,
      arch,
      lvl: m.level,
      rank,
      trait: i === 0 ? trait : null,
      delay,
    });
    made++;
  }
  if (made) {
    const msg = { drop: 'They fall from above!', teleport: 'Something tears through the veil!', burrow: 'The ground splits open!', wall: 'The walls come alive!' }[kind];
    floatText(p.x, p.y, 90, msg, '#ff8060', 14, { life: 1.8 });
    sfx('roar', 0.5);
    if (G.room && net.connected && G.game?.isDungeonAuthority(w.depth)) {
      net.sendAmbushSpawn({
        kind,
        depth: w.depth || 0,
        monsters: batch,
      });
    }
  }
  return made;
}

// ---------------------------------------------------------------- MADNESS
export const MADNESS_FILL = 420; // seconds in the dungeon to fill the meter
export const MADNESS_DUR = 30;

/** Fills in the dungeon, drains while it burns. */
export function madnessTick(dt) {
  const c = G.char, w = G.world;
  if (!c) return;
  if (c.madT > 0) {
    c.madT = Math.max(0, c.madT - dt);
    c.madness = c.madT / MADNESS_DUR;
    const p = G.player;
    if (p && chance(dt * 30)) spawn({ type: 'glow', x: p.x + rand(-0.4, 0.4), y: p.y + rand(-0.4, 0.4), z: rand(5, 60), vz: rand(20, 50), life: 0.5, size: rand(2, 4), size1: 0, color: chance(0.5) ? '#ff2050' : '#c020ff', add: true });
    if (c.madT === 0) { c.madness = 0; floatText(p.x, p.y, 80, 'The madness fades', '#c080ff', 13, { life: 1.4 }); }
    return;
  }
  if (w && w.kind === 'dungeon' && G.player && !G.player.dead) c.madness = Math.min(1, (c.madness || 0) + dt / MADNESS_FILL);
}

export const madnessReady = () => !!G.char && (G.char.madness || 0) >= 1 && !(G.char.madT > 0) && G.world && G.world.kind === 'dungeon';
export const madnessOn = () => !!G.char && G.char.madT > 0;

/** Only ever called from the hero's own input (the MADNESS button / G key), never by auto-play. */
export function unleashMadness() {
  if (!madnessReady()) return false;
  const c = G.char, p = G.player;
  c.madT = MADNESS_DUR;
  addEffect(new Ring(p.x, p.y, 0.2, 6, 0.6, '#ff2050', 8));
  addEffect(new Column(p.x, p.y, '#c020ff', 0.6, 30, 300));
  burst(p.x, p.y, 30, 'blood', 30, 6);
  camera.shake(8);
  G.flash = 0.6;
  floatText(p.x, p.y, 100, 'MADNESS!', '#ff2050', 24, { life: 2 });
  sfx('roar', 0.9); sfx('boss', 0.5);
  return true;
}
