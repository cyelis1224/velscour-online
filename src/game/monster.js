// Monsters and minions: one AI for both teams.
import { G } from '../state.js';
import { net } from '../net/network.js';
import { rand, chance, TAU, clamp, angleTo, angleDiff, dist, pick, randi, shuffle } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { addEffect, Telegraph, Slash, Ring, Bolt, Column, burst, spawn, sparkle, elem, floatText, smoke, addLight } from '../gfx/vfx.js';
import { shiftPalette } from '../gfx/pixelart.js';
import { Creature } from './creature.js';
import { hit, aoe, chainHit, leechHeal } from './combat.js';
import { Projectile, Delayed, NovaWave, Area, Fissure, explode, lineTargets, coneTargets } from './hazards.js';
import { ARCH, ARCH_MOVES, ELITE_AFFIXES, bossName, uniqueName } from '../data/enemies.js';
import { SUMMONS } from '../data/summons.js';
import { turretMuzzle } from '../gfx/gunner3d.js';
import { bodyR } from '../world/map.js';
import { toughness, danger, densityXp } from '../data/depth.js';
import { attachSlime, slimeUpdate, courtDef } from './slimecourt.js';
import { ART_BY_ID, REVIVED, greaterSwap, rollLooks, uniqueSwap } from '../data/bestiary.js';

const LEASH = 10; // minions fight what's within this many tiles of the hero
const CHASE = 1.3, CHASE_MAX = 4.6; // monsters' pursuit pace: x1.3, up to 4.6 tiles/s (the hero runs 4.2) unless faster already
const PROJ_FX = { fire: 'fireball', cold: 'shard', light: 'spark', poison: 'blob', shadow: 'skull', arcane: 'orb', holy: 'bolt', blood: 'blob', acid: 'blob', phys: 'rock' };
const POOL_FX = { fire: 'fire', cold: 'frost', poison: 'poison', acid: 'slime', shadow: 'void', arcane: 'void', blood: 'blood', light: 'storm', holy: 'holy', phys: 'poison' };

// When each special move (data/enemies.js ARCH_MOVES) can be used: (monster, target, distance, line of sight), and its
// cooldown in seconds.
const MOVES = {
  lunge: { cd: 5, ok: (m, t, d, los) => d > 2 && d < 4.5 && los },
  whirl: { cd: 6, ok: (m, t, d) => d < 1.4 + m.r + t.r },
  combo: { cd: 4.5, ok: (m, t, d) => d <= m.atkRange(t) + 0.2 },
  quake: { cd: 7, ok: (m, t, d, los) => d > 1.4 && d < 6 && los },
  hook: { cd: 7, ok: (m, t, d, los) => d > 2.5 && d < 6.5 && los },
  fan: { cd: 5, ok: (m, t, d, los) => d < (m.range || 7) && los },
  burst: { cd: 5, ok: (m, t, d, los) => d < (m.range || 7) + 1 && los },
  lob: { cd: 6, ok: (m, t, d, los) => d > 1.5 && d < 7 && los },
  snipe: { cd: 8, ok: (m, t, d, los) => d > 3 && d < 11 && los },
  blink: { cd: 6, ok: (m, t, d) => d < 2.6 },
  runes: { cd: 7, ok: (m, t, d, los) => d < 8 && los },
  orbs: { cd: 8, ok: (m, t, d) => d < 6 },
  sweep: { cd: 7, ok: (m, t, d, los) => d < (m.range || 7) && los },
  web: { cd: 6, ok: (m, t, d, los) => d < 6.5 && los },
  // bullet patterns and odd ways in (game/mayhem.js traits)
  spiral: { cd: 8, ok: (m, t, d) => d < 8 },
  cross: { cd: 8, ok: (m, t, d) => d < 8 },
  rings: { cd: 7, ok: (m, t, d) => d < 7 },
  wall: { cd: 6, ok: (m, t, d, los) => d > 2 && d < 9 && los },
  rain: { cd: 8, ok: (m, t, d) => d < 10 },
  homing: { cd: 7, ok: (m, t, d, los) => d < 10 && los },
  phase: { cd: 6, ok: (m, t, d) => d > 3 && d < 14 },
  burrow: { cd: 7, ok: (m, t, d) => d > 3 && d < 12 && !m.fly },
};

/** A monster's special moves: one of its archetype's for a normal (more often deeper), two for a greater breed, all for elites. */
function rollMoves(arch, rank, variant, depth) {
  const all = (ARCH_MOVES[arch] || []).slice();
  if (!all.length) return null;
  if (rank !== 'normal') return all;
  const n = (chance(Math.min(0.9, 0.45 + depth * 0.012)) ? 1 : 0) + variant;
  return n ? shuffle(all).slice(0, n) : null;
}

/** Demon Lord Velscour's life in normal monsters of his level: ~3x the last BOSS ROOM boss (~3 minutes of hero damage). */
export const VELSCOUR_HP = 60;
export function monsterBase(level) {
  return {
    // toughness (data/depth.js) sizes life to the heroes' damage at that level: a few seconds a normal monster
    hp: 30 * Math.pow(1.068, level - 1) * toughness(level),
    // damage keeps its 1.058 a level to level 60, then grows slower (1.04, then 1.006 past 140): hero life and
    // armor only grow with levels and gear, and at 1.058 a normal hit took ~45% of a geared hero's life by depth 160;
    // past 140 hero life grows ~0.6% a level (tools/tests/endgame.js), and 1.016 had normal hits at 35-60% by depth 500;
    // danger (data/depth.js) softens it where hero life lags, now that fights last long enough for every monster to hit
    dmg: 1.2 * (4.4 + Math.min(level, 10) * 0.24) * Math.pow(1.058, Math.min(level, 60) - 1) * Math.pow(1.04, clamp(level - 60, 0, 80)) * Math.pow(1.006, Math.max(0, level - 140)) * danger(level),
    xp: 4 * Math.pow(level, 1.5) * densityXp(level), // fewer monsters a level than before (data/depth.js density)
  };
}

export class Monster extends Creature {
  constructor(o) {
    super(o);
    this.cd = rand(0.4, 1.4);
    this.state = 'idle';
    this.stateT = 0;
    this.wanderT = rand(1, 3);
    this.strafe = chance(0.5) ? 1 : -1;
    this.home = [this.x, this.y];
    this.aggroRange = this.aggroRange || 8.5;
    this.lifeT = 0;
    this.bossT = 2;
    this.patternQ = [];
    this.phase = 1;
  }

  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }

  /** All damage a monster deals goes through here (vampiric / thorns curse). */
  deal(target, amount, el, o = {}) {
    const d = hit(this, target, amount, el, o);
    if (d > 0) {
      if (this.affixes && this.affixes.includes('vampiric')) this.heal(d * 0.3);
      const th = this.curses.thorns;
      if (th && th.t > 0) hit(th.src, this, d * th.amt / 100, 'phys', { dot: true, crit: false });
      if (this.leech && this.owner) leechHeal(this.owner, target, d, this.leech * 0.15);
    }
    return d;
  }

  onDamaged(src) {
    if (!this.affixes) return;
    if (this.affixes.includes('shocking') && (this.shockCd || 0) <= 0) {
      this.shockCd = 1.2;
      for (let i = 0; i < 5; i++) this.world.addHazard(new Projectile({ world: this.world, src: this, x: this.x, y: this.y, ang: rand(TAU), speed: 5, range: 5, fx: 'spark', el: 'light', dmg: [this.dmg * 0.4, this.dmg * 0.6] }));
    }
    // thorns strike back at most twice a second: a hail of projectiles used to mean a hail of thorns, which outpaced any leech
    if (this.affixes.includes('thorns') && src && !src.dead && src.isPlayer && (this.thornCd || 0) <= 0) {
      this.thornCd = 0.5;
      hit(this, src, this.dmg * 0.25, 'phys', { dot: true, crit: false });
    }
  }

  // ---------------------------------------------------------------- targeting
  pickTarget() {
    const w = this.world;
    if (this.curses.confuse && this.curses.confuse.t > 0) {
      const others = w.query(this.x, this.y, 8, (c) => c !== this && c.team === this.team && !c.isPlayer);
      if (others.length) return others[0];
    }
    if (this.summon) {
      if (!this.static && this.owner) return this.pickFoe();
      const range = (this.atk && this.atk.range) || 8;
      if (this.aggro && !this.aggro.dead && this.aggro.team !== this.team && dist(this.x, this.y, this.aggro.x, this.aggro.y) < range + 2) return this.aggro;
      return w.nearestHostile(this.team, this.x, this.y, range, true);
    }
    // monsters: taunting totems first, then whatever hits them, then the closest of player/minions
    const taunt = w.taunters && w.query(this.x, this.y, 6, (c) => c.taunt && c.team !== this.team)[0]; // most levels have none
    if (taunt) return taunt;
    if (this.aggro && !this.aggro.dead && this.aggro.team !== this.team && dist(this.x, this.y, this.aggro.x, this.aggro.y) < 14) return this.aggro;
    const near = w.nearestHostile(this.team, this.x, this.y, this.awake ? 30 : this.aggroRange, !this.awake);
    if (!near && (this.hunter || (this.gaze && this.awake)) && w.player && !w.player.dead && this.team === 'enemy') return w.player; // hunters (and, once awake, Velscour's Gaze: game/heresies.js) track the hero anywhere
    return near;
  }

  // ---------------------------------------------------------------- main update
  update(dt) {
    const w = this.world;
    this.animT += dt;
    this.lifeT += dt;
    if (this.shockCd > 0) this.shockCd -= dt;
    if (this.thornCd > 0) this.thornCd -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    const canAct = this.tickStatus(dt, (k, amount, src) => hit(src, this, amount, k === 'burn' ? 'fire' : k === 'poison' ? 'poison' : k === 'bleed' ? 'blood' : 'shadow', { dot: true, crit: false }));
    if (this.dead) return;
    if (this.entering) { this.entering(dt); return; } // ambush arrivals (game/mayhem.js)
    if (this.life && this.lifeT > this.life) { this.dead = true; burst(this.x, this.y, 20, this.el || 'arcane', 10, 2); return; }
    // charm wears off
    const ch = this.curses.charm;
    if (ch && ch.t <= 0 && ch.team) { this.team = ch.team; ch.team = null; this.aggro = null; }
    if (this.partyBuff && (this.partyBuff.t -= dt) <= 0) this.partyBuff = null;
    if (this.affixes && this.affixes.includes('regen')) this.heal(this.maxHp * 0.02 * dt);
    if (this.affixes && this.affixes.includes('frozen') && w.player) {
      const p = w.player;
      if (dist(this.x, this.y, p.x, p.y) < 3) p.status.chill = { t: 0.5, amt: 0.3 };
      if (chance(dt * 6)) spawn({ type: 'dot', x: this.x + rand(-1.5, 1.5), y: this.y + rand(-1.5, 1.5), z: rand(5, 40), vz: -8, life: 1, size: 1.5, color: '#c8f0ff' });
    }
    if (this.aura) addLight(this.x, this.y, 2.5, 0.5);
    if (this.defAura && chance(dt * 2)) aoe(w, this, this.x, this.y, this.defAura.r, this.dmg * 0.3, this.defAura.el, { dot: true });
    if (!canAct) { this.moving = false; return; }
    if (this.wardTick) return this.wardTick(dt); // raid warding crystals (game/raid.js)
    this.cd -= dt * (this.partyBuff && this.partyBuff.stats.as ? 1 + this.partyBuff.stats.as / 100 : 1);
    if (this.spell && (this.spellCd -= dt) <= 0) this.castSpell();

    // fear: run away
    if (this.status.fear && this.status.fear.t > 0) {
      const t = w.nearestHostile(this.team, this.x, this.y, 10);
      if (t) { const a = angleTo(t.x, t.y, this.x, this.y); this.moveToward(this.x + Math.cos(a) * 2, this.y + Math.sin(a) * 2, dt, this.speed * 0.8); }
      return;
    }
    if (this.state === 'windup' || this.state === 'act') { this.runAction(dt); return; }
    if (this.slime) return slimeUpdate(this, dt); // the Slime Lord's court (game/slimecourt.js)

    if (this.ai === 'boss') return this.bossUpdate(dt);
    if (this.ai === 'raid') return this.raid.update(dt);
    const target = this.pickTarget();
    this.target = target;
    if (!target) return this.idle(dt);
    if (!this.summon && !this.awake) { this.awake = true; this.alertPack(); }
    const d = dist(this.x, this.y, target.x, target.y);
    this.trackTarget(target, dt);
    if (this.moves) {
      if (!this.frenzy && this.hp < this.maxHp * 0.4 && this.moves.includes('frenzy')) this.goFrenzy();
      if ((this.moveCd -= dt) <= 0 && this.trySpecial(target, d)) return;
    }
    switch (this.ai) {
      case 'melee': case 'brute': return this.aiMelee(dt, target, d);
      case 'ranged': case 'caster': return this.aiRanged(dt, target, d);
      case 'charger': return this.aiCharger(dt, target, d);
      case 'swarm': return this.aiSwarm(dt, target, d);
      case 'nova': return this.aiNova(dt, target, d);
      case 'beamer': return this.aiBeamer(dt, target, d);
      case 'exploder': return this.aiExploder(dt, target, d);
      case 'turret': return this.aiTurret(dt, target, d);
      case 'aura': return this.aiAura(dt, target, d);
      case 'follow': return this.aiFollow(dt, target, d);
      default: return this.aiMelee(dt, target, d);
    }
  }

  alertPack() {
    for (const c of this.world.query(this.x, this.y, 6, (c) => c.team === this.team && !c.summon)) c.awake = true;
  }

  idle(dt) {
    this.moving = false;
    if (this.summon) return this.followOwner(dt);
    if (this.ai === 'aura' || this.static) return;
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = rand(2, 5);
      this.wander = chance(0.5) ? this.world.map.randomNear(this.home[0], this.home[1], 2.5) : null;
    }
    if (this.wander) {
      const r = this.moveToward(this.wander[0], this.wander[1], dt, this.speed * 0.35);
      if (r < 0.1) this.wander = null;
    }
  }

  // ---------------------------------------------------------------- minions: foes, paths, following
  /**
   * A mobile minion's foe: a hostile near the hero that it can walk to (the flow field holds walking distances from
   * the hero). Closest first, with the hero's attackers, its own attacker and its current foe preferred, and melee
   * minions spread over the pack. Re-picked a few times a second, or at once when the foe is gone or too far.
   */
  pickFoe() {
    const w = this.world, o = this.owner, map = w.map;
    const f = this.foe, live = (e) => e && !e.dead && e.team !== this.team && e.targetable !== false;
    if (dist(this.x, this.y, o.x, o.y) > LEASH + 6) return (this.foe = null); // strayed too far: go back first
    if (live(f) && w.time < this.foeT && dist(o.x, o.y, f.x, f.y) < LEASH + 4) return f;
    this.foeT = w.time + rand(0.35, 0.55);
    const flow = map.flowAt(o.x, o.y) === 0; // the field is centred on this hero
    const melee = this.ai !== 'ranged' && !this.cast;
    let hunt = null;
    if (melee) {
      hunt = new Map();
      for (const c of w.creatures) if (c !== this && c.summon && c.owner === o && c.foe && !c.dead && c.ai !== 'ranged' && !c.cast) hunt.set(c.foe, (hunt.get(c.foe) || 0) + 1);
    }
    let best = null, bs = Infinity;
    const reach = melee ? 0 : this.range || (this.atk && this.atk.range) || 7;
    for (const e of w.hostiles(this.team, o.x, o.y, LEASH)) {
      // a foe it can't walk to (or only the long way round) is only worth it to a shooter that already has a shot
      const walk = flow ? map.flowAt(e.x, e.y) : -1;
      if ((walk < 0 || walk > LEASH * 1.6) && !(dist(this.x, this.y, e.x, e.y) < reach && map.los(this.x, this.y, e.x, e.y))) {
        if (flow || !map.los(o.x, o.y, e.x, e.y)) continue;
      }
      let sc = dist(this.x, this.y, e.x, e.y) + 0.4 * dist(o.x, o.y, e.x, e.y);
      if (!map.los(this.x, this.y, e.x, e.y)) sc += 3;
      if (e.target === o) sc -= 2.5;
      if (e === this.aggro) sc -= 2;
      if (e === f) sc -= 1.5;
      if (hunt) sc += 1.2 * (hunt.get(e) || 0);
      if (sc < bs) { bs = sc; best = e; }
    }
    return (this.foe = best);
  }

  /**
   * Walk to (gx,gy) around walls: straight while the body fits the way, else along a path, re-planned as the goal
   * moves. `flow`: the goal is the hero (or beside them), so the path runs down the flow field, which costs nothing;
   * otherwise it is an A* search (a few per frame for everyone, w.pathBudget). Blocked for a while: re-plan, then
   * sidestep. Returns the distance left.
   */
  navTo(gx, gy, dt, speed = this.speed, flow = false) {
    const w = this.world, map = w.map;
    const d = dist(this.x, this.y, gx, gy);
    if (this.ghost) { this.moveToward(gx, gy, dt, speed); return d; }
    const N = this.nav || (this.nav = { t: 0, path: null, part: false, gx, gy, cx: this.x, cy: this.y, ct: 0, last: 0, stuck: 0, side: 0, sa: 0, force: false });
    const r = bodyR(this) + 0.03;
    // progress check: no headway for half a second means stuck
    if (w.time - N.last > 0.2) { N.ct = 0; N.cx = this.x; N.cy = this.y; }
    N.last = w.time;
    if ((N.ct += dt) >= 0.5) {
      if (d > 0.6 && dist(this.x, this.y, N.cx, N.cy) < Math.min(0.3, speed * this.speedMul() * 0.15)) {
        N.stuck++; N.force = true; N.t = 0;
        if (N.stuck >= 2) { N.side = rand(0.25, 0.45); N.sa = angleTo(this.x, this.y, gx, gy) + (chance(0.5) ? 1.57 : -1.57); }
      } else N.stuck = 0;
      N.ct = 0; N.cx = this.x; N.cy = this.y;
    }
    if (N.side > 0) {
      N.side -= dt;
      if (!map.move(this, Math.cos(N.sa) * speed * dt, Math.sin(N.sa) * speed * dt)) N.sa += Math.PI;
      this.moving = true; this.face(N.sa);
      return d;
    }
    N.t -= dt;
    // Hunters far beyond the hero's flow field (big overworld maps) need long searches: allow more nodes, re-plan less.
    const far = this.hunter && d > 24;
    if (N.t <= 0 || Math.abs(gx - N.gx) + Math.abs(gy - N.gy) > (far ? 6 : 2)) {
      N.gx = gx; N.gy = gy; N.t = far ? rand(1.2, 2) : flow ? rand(0.2, 0.35) : rand(0.3, 0.5);
      N.part = false; N.none = false;
      if (!N.force && map.losWide(this.x, this.y, gx, gy, r)) N.path = null;
      else if (flow && (N.path = map.flowPath(this.x, this.y, r))) { N.part = true; N.force = false; }
      else if (w.pathBudget > 0) {
        w.pathBudget--; N.path = map.findPath(this.x, this.y, gx, gy, far ? 12000 : 2500, r); N.force = false;
        if (!N.path) N.t = rand(1.5, 2.5); // no way there (a sealed boss room...): don't search again for a while
        N.none = !N.path;
      } else N.t = 0; // out of searches this frame: keep the old path and try again next frame
    }
    if (N.none && !N.path && !N.part) { this.moving = false; return d; } // unreachable: wait rather than walk into a wall
    let tx = gx, ty = gy;
    if (N.path) {
      // a flow path is only the first stretch of the way: walk all of it, then plan the next
      const keep = N.part ? 0 : 1;
      while (N.path.length > keep && dist(this.x, this.y, N.path[0][0], N.path[0][1]) < 0.3) N.path.shift();
      if (N.path.length > keep) { tx = N.path[0][0]; ty = N.path[0][1]; } else if (N.part) N.t = 0;
    }
    this.moveToward(tx, ty, dt, speed);
    return d;
  }

  /**
   * No foe: stay with the hero. Walk (around walls) to a slot in a loose formation behind the way they are heading,
   * run to catch up when they move off, and potter about near them while they stand still.
   */
  followOwner(dt) {
    const o = this.owner, w = this.world;
    if (!o || this.static) { this.moving = false; return; }
    const d = dist(this.x, this.y, o.x, o.y);
    const F = this.fol || (this.fol = { ox: o.x, oy: o.y, hd: o.facing || 0, still: 0, at: false, go: false, wx: 0, wy: 0, wt: rand(0.5, 2), i: 0, n: 1, iT: 0 });
    const mx = o.x - F.ox, my = o.y - F.oy;
    if (mx * mx + my * my > 0.002) { F.hd = Math.atan2(my, mx); F.ox = o.x; F.oy = o.y; F.still = 0; F.go = false; } else F.still += dt;
    // left far behind, or wedged for good: rejoin the hero
    if (d > LEASH + 8 || (this.nav && this.nav.stuck >= 5 && d > 4)) return this.rejoin();
    if (F.still > 1.5 && (F.go || (d < 4.5 && w.map.los(this.x, this.y, o.x, o.y)))) return this.potter(dt, F, o); // only once it has caught up
    const [sx, sy] = this.slot(F, o) || [o.x, o.y];
    const ds = dist(this.x, this.y, sx, sy), home = sx === o.x && sy === o.y ? 1.6 : 0.3;
    if (F.still > 0.3 && (ds < home || (F.at && ds < 1.2))) { F.at = true; this.moving = false; return; }
    F.at = false;
    // keep pace with the hero, sprint when left behind
    const sp = Math.max(this.speed * 1.1, (o.speed || 4) * (d > 4 ? 1.2 : d > 2.5 ? 1 : 0.85));
    if (this.navTo(sx, sy, dt, sp) < home) this.moving = false;
  }

  /** This minion's spot in the formation: rings of 6, 10, 14 in an arc behind the hero, wherever there's floor. */
  slot(F, o) {
    const w = this.world, map = w.map, r = bodyR(this) + 0.03;
    if (w.time > F.iT) {
      let i = 0, n = 0;
      for (const c of w.creatures) if (c.summon && c.owner === o && !c.dead && !c.static && !c.ghost) { if (c === this) i = n; n++; }
      F.i = i; F.n = n; F.iT = w.time + 1;
    }
    const ring = F.i < 6 ? 0 : F.i < 16 ? 1 : 2, k = F.i - [0, 6, 16][ring];
    const per = Math.min([6, 10, 14][ring], F.n - [0, 6, 16][ring]);
    const base = F.hd + Math.PI + ((k + 0.5) / per - 0.5) * Math.min(per * 0.55, ring ? 4 : 3.2);
    for (const rad of [1.6 + ring * 0.9, 1.1 + ring * 0.5]) {
      for (const da of [0, 0.5, -0.5, 1, -1]) {
        const x = o.x + Math.cos(base + da) * rad, y = o.y + Math.sin(base + da) * rad;
        if (map.circleFree(x, y, r) && map.losWide(o.x, o.y, x, y, r)) return [x, y];
      }
    }
    return null;
  }

  /** The hero is standing still with nothing to fight: amble to spots nearby (in sight of them), pause, look about. */
  potter(dt, F, o) {
    const map = this.world.map, r = bodyR(this) + 0.03;
    if (F.go) {
      if (this.navTo(F.wx, F.wy, dt, this.speed * 0.45) < 0.25 || (this.nav && this.nav.stuck >= 2)) { F.go = false; F.wt = rand(1.5, 4); this.moving = false; }
      return;
    }
    this.moving = false;
    if ((F.wt -= dt) > 0) return;
    F.wt = rand(1.5, 4);
    if (chance(0.25)) { this.face(rand(TAU)); return; }
    for (let i = 0; i < 8; i++) {
      const a = rand(TAU), rr = rand(1.3, 3.6), x = o.x + Math.cos(a) * rr, y = o.y + Math.sin(a) * rr;
      if (dist(x, y, this.x, this.y) < 0.8 || !map.circleFree(x, y, r) || !map.losWide(o.x, o.y, x, y, r)) continue;
      F.wx = x; F.wy = y; F.go = true;
      if (this.nav) this.nav.stuck = 0;
      return;
    }
  }

  /** Blink back to the hero's side. */
  rejoin() {
    const o = this.owner, map = this.world.map;
    sparkle(this.x, this.y, 10, '#80c0ff', 8, 0.4);
    const [x, y] = map.randomNear(o.x, o.y, 1.5);
    this.x = x; this.y = y; this.moving = false;
    this.nav = null; this.foe = null; this.aggro = null;
    sparkle(x, y, 10, '#80c0ff', 8, 0.4);
  }

  /**
   * Go after a target round walls and props: minions by A*, monsters down the flow field when it is the hero.
   * Monsters run harder in pursuit (CHASE, up to about the hero's own pace), so a kiting hero can't outrun them forever.
   */
  chase(dt, t, speed = this.speed) {
    if (this.static) return;
    const w = this.world, p = w.player;
    if (this.summon) { this.navTo(t.x, t.y, dt, speed); return; }
    if (this.team === 'enemy') speed = Math.max(speed, Math.min(speed * CHASE, CHASE_MAX));
    // the flow field leads to the hero: follow it to them, and to anything at their side
    const flow = p && !p.dead && (t === p || dist(t.x, t.y, p.x, p.y) < 3) && w.map.flowAt(p.x, p.y) === 0;
    this.navTo(t.x, t.y, dt, speed, flow);
  }

  atkRange(t) { return this.r + t.r + (this.atkReach || 0.55); }

  startAction(kind, windup, data = {}) {
    this.state = 'windup';
    this.action = { kind, t: 0, windup, ...data };
    this.moving = false;
  }

  // ------------------------------------------------------------------ AIs
  aiMelee(dt, t, d) {
    if (d <= this.atkRange(t)) {
      this.face(angleTo(this.x, this.y, t.x, t.y));
      this.moving = false;
      if (this.cd <= 0) {
        const brute = this.ai === 'brute' && chance(0.45);
        this.startAction(brute ? 'slam' : 'melee', brute ? 0.6 : (this.summon ? 0.15 : 0.32), { target: t });
        if (brute) addEffect(new Telegraph({ kind: 'circle', x: this.x + Math.cos(this.facing) * 0.8, y: this.y + Math.sin(this.facing) * 0.8, r: 1.6 * this.scale, dur: 0.6, color: this.team === 'enemy' ? '#ff2a10' : '#40ff60' }), 'ground');
      }
    } else this.approach(dt, t, d);
  }

  /**
   * Melee closing in: once others crowd the target, go round to a free side of it (each monster has its own
   * bearing) instead of queueing behind the pack, so a mob surrounds the hero.
   */
  approach(dt, t, d) {
    const w = this.world;
    if (!this.summon && d < 4 && d > this.atkRange(t)) {
      let n = 0;
      for (const c of w.query(t.x, t.y, 1.7)) if (c !== this && c.team === this.team && c !== t) n++;
      if (n >= 2) {
        const a = this.id * 2.39996, rr = Math.max(0.6, this.atkRange(t) - 0.15), br = bodyR(this) + 0.03;
        const gx = t.x + Math.cos(a) * rr, gy = t.y + Math.sin(a) * rr;
        if (w.map.circleFree(gx, gy, br) && w.map.losWide(t.x, t.y, gx, gy, br)) { this.navTo(gx, gy, dt, this.speed, t === w.player); return; }
      }
    }
    this.chase(dt, t);
  }

  aiRanged(dt, t, d) {
    const range = this.range || 7;
    const los = this.world.map.los(this.x, this.y, t.x, t.y);
    if (d < range && los) {
      this.face(angleTo(this.x, this.y, t.x, t.y));
      if (this.cd <= 0) {
        if (this.summoner && chance(0.35) && !this.summon) this.startAction('summonMinions', 0.8);
        else if (this.aoeCaster && chance(0.6)) this.startAction('aoeCast', 0.4, { tx: t.x, ty: t.y });
        else if (this.cast) this.startAction('cast', 0.12, { target: t });
        else this.startAction('shoot', this.summon ? 0.1 : 0.3, { target: t });
        return;
      }
      // kite / strafe
      if (d < (this.summon ? 2.5 : 3.5) && !this.static) {
        const a = angleTo(t.x, t.y, this.x, this.y);
        this.moveToward(this.x + Math.cos(a), this.y + Math.sin(a), dt, this.speed * 0.8);
      } else if (!this.static) {
        const a = angleTo(t.x, t.y, this.x, this.y) + this.strafe * 1.57;
        if (!this.world.map.move(this, Math.cos(a) * this.speed * 0.4 * dt, Math.sin(a) * this.speed * 0.4 * dt)) this.strafe *= -1;
        this.moving = true;
        if (chance(dt * 0.5)) this.strafe *= -1;
      }
    } else this.chase(dt, t);
  }

  aiCharger(dt, t, d) {
    const los = this.world.map.los(this.x, this.y, t.x, t.y);
    if (d > 2.2 && d < 7 && los && this.cd <= 0 && chance(0.6)) {
      const ang = angleTo(this.x, this.y, t.x, t.y);
      this.startAction('charge', 0.55, { ang, len: Math.min(8, d + 1.5) });
      addEffect(new Telegraph({ kind: 'line', x: this.x, y: this.y, ang, len: Math.min(8, d + 1.5), w: 0.7, dur: 0.55 }), 'ground');
      return;
    }
    this.aiMelee(dt, t, d);
  }

  aiSwarm(dt, t, d) {
    if (d <= this.atkRange(t) && this.cd <= 0) { this.startAction('melee', 0.15, { target: t }); return; }
    if (d > 3 && !this.world.map.losWide(this.x, this.y, t.x, t.y, bodyR(this) + 0.03)) { this.chase(dt, t); return; }
    const a = angleTo(t.x, t.y, this.x, this.y) + Math.sin(this.animT * 2 + this.id) * 1.3;
    const rr = this.cd > 0 ? 2.2 : 0.3;
    this.moveToward(t.x + Math.cos(a) * rr, t.y + Math.sin(a) * rr, dt, this.speed);
  }

  aiNova(dt, t, d) {
    const range = this.range || 4;
    if (d < range && this.cd <= 0 && this.world.map.los(this.x, this.y, t.x, t.y)) {
      this.startAction('nova', 0.65);
      addEffect(new Telegraph({ kind: 'circle', x: this.x, y: this.y, r: 2.4, dur: 0.65 }), 'ground');
      return;
    }
    if (d > range * 0.7) this.chase(dt, t, this.speed);
    else this.moving = false;
  }

  aiBeamer(dt, t, d) {
    const range = this.range || 7;
    if (d < range && this.cd <= 0 && this.world.map.los(this.x, this.y, t.x, t.y)) {
      const ang = angleTo(this.x, this.y, t.x, t.y);
      this.startAction('beam', 0.75, { ang });
      addEffect(new Telegraph({ kind: 'line', x: this.x, y: this.y, ang, len: range, w: 0.5, dur: 0.75, color: '#ff40ff' }), 'ground');
      return;
    }
    if (d > range * 0.8) this.chase(dt, t); else this.aiRanged(dt, t, d);
  }

  aiExploder(dt, t, d) {
    if (d < this.r + t.r + 0.5) { this.startAction('explode', 0.4); return; }
    this.chase(dt, t, this.speed);
  }

  aiTurret(dt, t, d) {
    this.moving = false;
    if (!this.static) this.followOwner(dt);
    const range = (this.atk && this.atk.range) || 7;
    if (d < range && this.cd <= 0) {
      this.face(angleTo(this.x, this.y, t.x, t.y));
      this.summonAttack(t);
    }
  }

  aiAura(dt) {
    this.moving = false;
    if (!this.static) this.followOwner(dt);
    if (this.cd <= 0) this.summonAttack(this.target);
  }

  aiFollow(dt, t, d) {
    const o = this.owner;
    if (o) {
      const tx = o.x - 1.2, ty = o.y - 1.2;
      if (dist(this.x, this.y, tx, ty) > 0.5) this.moveToward(tx, ty, dt, this.speed);
    }
    if (t && d < (this.atk.range || 7) && this.cd <= 0) this.summonAttack(t);
  }

  // ------------------------------------------------------------------ actions
  runAction(dt) {
    const a = this.action;
    a.t += dt;
    if (this.state === 'windup') {
      if (a.kind === 'explode' && Math.floor(a.t * 12) % 2) this.flash = 0.05;
      if (a.target && !a.target.dead) this.face(angleTo(this.x, this.y, a.target.x, a.target.y));
      if (a.t < a.windup) return;
      this.state = 'act'; a.t = 0;
      this.perform(a);
      if (this.state === 'act' && !a.ongoing) this.state = 'idle';
      return;
    }
    // ongoing actions (charge)
    if (a.kind === 'charge') {
      const step = 13 * dt;
      const moved = this.world.map.move(this, Math.cos(a.ang) * step, Math.sin(a.ang) * step, this.ghost);
      a.len -= step;
      this.moving = true;
      spawn({ type: 'glow', x: this.x, y: this.y, z: 20, life: 0.25, size: 6, size1: 0, color: '#ff8040', add: true });
      const t = this.world.hostiles(this.team, this.x, this.y, this.r + 0.4)[0];
      if (t && !a.hit) { a.hit = true; this.deal(t, this.dmg * 1.4, this.el || 'phys', { knock: 1, ang: a.ang, melee: true }); }
      if (a.len <= 0 || !moved) { this.state = 'idle'; this.cd = this.atkCd; }
    } else if (a.kind.startsWith('mv_')) this.moveTick(a, dt);
    else if (a.kind.startsWith('raid_') && this.raid) this.raid.tick(a, dt);
    else this.state = 'idle';
  }

  perform(a) {
    const w = this.world;
    const el = this.el || 'phys';
    this.lunge = 1;
    switch (a.kind) {
      case 'melee': {
        const t = a.target;
        if (t && !t.dead && dist(this.x, this.y, t.x, t.y) <= this.atkRange(t) + 0.5) {
          const o = { melee: true, ang: this.facing };
          if (this.atk) { o.slow = this.atk.slow; o.freeze = this.atk.freeze; o.stun = this.atk.stun; o.bleed = this.atk.bleed; o.burn = this.atk.burn; }
          if (this.poison) o.poison = true;
          if (this.affixes && this.affixes.includes('fiery')) o.burn = true;
          if (this.atk && this.atk.aoe) aoe(w, this, t.x, t.y, this.atk.aoe, this.dmg, this.summonEl || 'phys', o);
          else this.deal(t, this.dmg, this.summonEl || (this.atk ? this.el : 'phys') || 'phys', o);
          if (this.atk && this.atk.chain) chainHit(w, this, t.x, t.y, w.hostiles(this.team, t.x, t.y, 5).find((c) => c !== t), this.atk.chain, this.dmg * 0.6, this.el || 'light', elem(this.el || 'light').glow);
        }
        addEffect(new Slash(this.x, this.y, this.facing, 1.8, 0.9 * this.scale, 0.18, this.team === 'enemy' ? '#ffd0c0' : '#c0ffd0', { width: 6 }));
        if (!this.summon || chance(0.3)) sfx('swing', 0.5);
        this.cd = this.atkCd;
        break;
      }
      case 'slam': {
        const x = this.x + Math.cos(this.facing) * 0.8, y = this.y + Math.sin(this.facing) * 0.8;
        explode(w, this, x, y, 1.6 * this.scale, this.dmg * 1.6, 'phys', { knock: 1, sound: true }, 'eruption');
        sfx('thud');
        this.cd = this.atkCd * 1.4;
        break;
      }
      case 'shoot': {
        const t = a.target;
        if (!t || t.dead) break;
        const shots = this.affixes && this.affixes.includes('multishot') ? 3 : 1;
        const base = angleTo(this.x, this.y, t.x, t.y);
        const P = this.proj || { fx: PROJ_FX[el], speed: 7 };
        for (let i = 0; i < shots; i++) {
          const ang = base + (shots > 1 ? (i - 1) * 0.25 : 0) + rand(-0.04, 0.04);
          w.addHazard(new Projectile({ world: w, src: this, x: this.x, y: this.y, ang, speed: P.speed || 7, range: (this.range || 7) + 2, fx: P.fx, el, dmg: [this.dmg * 0.85, this.dmg * 1.15], lob: P.lob, tx: t.x, ty: t.y, exp: P.lob ? 0.9 : 0, o: { poison: el === 'poison' } }));
        }
        sfx(P.fx === 'arrow' ? 'bow' : elem(el).sfx, 0.5);
        this.cd = this.atkCd;
        break;
      }
      case 'cast':
        if (a.target && !a.target.dead) this.summonAttack(a.target);
        break;
      case 'aoeCast': {
        w.addHazard(new Delayed({ world: w, src: this, x: a.tx, y: a.ty, r: 1.4, delay: 1.0, fx: el === 'fire' ? 'explosion' : 'explosion', el, dmg: [this.dmg * 1.1, this.dmg * 1.4] }));
        sfx(elem(el).sfx, 0.5);
        this.cd = this.atkCd * 1.3;
        break;
      }
      case 'summonMinions': {
        for (let i = 0; i < 2; i++) {
          const [x, y] = w.map.randomNear(this.x, this.y, 1.5);
          const m = makeMonster(w, 'skeleton', w.biome, this.level, 'normal', x, y);
          m.awake = true;
          w.add(m);
          sparkle(x, y, 10, '#b040ff', 10, 0.4);
        }
        sfx('summon');
        this.cd = this.atkCd * 2;
        break;
      }
      case 'nova': {
        if (this.arch === 'shroom') {
          w.addHazard(new Area({ world: w, src: this, x: this.x, y: this.y, r: 2.2, dur: 3, tick: 0.5, dmg: [this.dmg * 0.25, this.dmg * 0.35], el: 'poison', fx: 'poison' }));
        } else {
          const n = 10;
          for (let i = 0; i < n; i++) w.addHazard(new Projectile({ world: w, src: this, x: this.x, y: this.y, ang: (i / n) * TAU + rand(0.3), speed: 5.5, range: 6, fx: PROJ_FX[el], el, dmg: [this.dmg * 0.6, this.dmg * 0.8] }));
        }
        sfx(elem(el).sfx);
        this.cd = this.atkCd * 1.6;
        break;
      }
      case 'beam': {
        const len = this.range || 7;
        const L = w.map.rayLength(this.x, this.y, a.ang, len);
        const ex = this.x + Math.cos(a.ang) * L, ey = this.y + Math.sin(a.ang) * L;
        for (const c of lineTargets(w, this.team, this.x, this.y, ex, ey, 0.45)) this.deal(c, this.dmg * 1.4, el, {});
        addEffect(new (Bolt)(this.x, this.y, 30, ex, ey, 20, elem(el).glow, 0.3, 4));
        sfx(elem(el).sfx);
        this.cd = this.atkCd * 1.5;
        break;
      }
      case 'charge':
        this.state = 'act'; a.ongoing = true; sfx('roar', 0.6);
        return;
      case 'explode':
        explode(w, this, this.x, this.y, 1.7 * this.scale, this.dmg * 1.6, el === 'phys' ? 'fire' : el, {}, 'explosion');
        this.hp = 0; this.dead = true;
        if (!this.summon) { this.world.kills++; }
        break;
      default:
        if (a.kind.startsWith('boss_')) this.bossPerform(a);
        else if (a.kind.startsWith('mv_')) this.movePerform(a);
        else if (a.kind.startsWith('raid_') && this.raid) this.raid.perform(a);
    }
  }

  /** A minion's second ability (def.spell), on its own cooldown; waits for a target in range when it needs one. */
  castSpell() {
    const A = this.spell, t = this.target && !this.target.dead ? this.target : null;
    if (['proj', 'chain', 'strike', 'beam'].includes(A.type) && (!t || dist(this.x, this.y, t.x, t.y) > (A.range || 7))) { this.spellCd = 0.5; return; }
    this.spellCd = A.cd || 3;
    this.lunge = 1;
    this.summonAttack(t, A);
  }

  /** Minion attacks driven by the summon definition (A = def.atk, or def.spell). */
  summonAttack(t, A = this.atk) {
    const w = this.world, el = this.el || 'phys', E = elem(el);
    this.attackAnimT = 0.32;
    if (A === this.atk) this.cd = A.cd || 1;
    const dmg = [this.dmg * 0.85, this.dmg * 1.15];
    switch (A.type) {
      case 'proj': {
        if (!t) return;
        const n = A.n || 1;
        for (let i = 0; i < n; i++) {
          const ang = angleTo(this.x, this.y, t.x, t.y) + (n > 1 ? (i - (n - 1) / 2) * 0.2 : 0), mz = turretMuzzle(this, ang); // 3D turrets fire from the barrel
          w.addHazard(new Projectile({ world: w, src: this, x: mz ? mz.x : this.x, y: mz ? mz.y : this.y, z: mz ? mz.z : this.fly ? 40 : 26, ang, speed: A.spd || 9, range: (A.range || 7) + 2, fx: A.fx || PROJ_FX[el], el, dmg, home: A.home ? 1 : 0, exp: A.exp || 0, pierce: A.pierce ? 99 : 0, heal: A.heal, o: { slow: A.slow, poison: A.poison } }));
        }
        if (chance(0.4)) sfx(A.fx === 'bullet' ? 'shoot' : A.fx === 'arrow' ? 'bow' : E.sfx, 0.35);
        break;
      }
      case 'chain':
        if (!t) return;
        chainHit(w, this, this.x, this.y, t, A.n || 2, rand(dmg[0], dmg[1]), el, E.glow);
        sfx('light', 0.35);
        break;
      case 'strike':
        if (!t) return;
        if (A.fx === 'meteor') w.addHazard(new Delayed({ world: w, src: this, x: t.x, y: t.y, r: 1.3, delay: 0.6, fx: 'meteor', el, dmg, showRing: false }));
        else {
          addEffect(new Bolt(t.x - 0.6, t.y - 0.6, 300, t.x, t.y, 0, E.glow, 0.25, 3));
          if (A.fx === 'pillar') addEffect(new Column(t.x, t.y, E.glow, 0.4, 20, 240));
          aoe(w, this, t.x, t.y, 0.9, rand(dmg[0], dmg[1]), el, {});
          sfx(E.sfx, 0.4);
        }
        break;
      case 'beam': {
        if (!t) return;
        const ang = angleTo(this.x, this.y, t.x, t.y), mz = turretMuzzle(this, ang); // 3D turrets fire from the barrel
        if (A.cone) {
          for (const c of coneTargets(w, this.team, this.x, this.y, ang, A.range || 4, 0.5)) hit(this, c, rand(dmg[0], dmg[1]), el, {});
          for (let i = 0; i < 14; i++) { const aa = ang + rand(-0.45, 0.45), sp = rand(5, 8); spawn({ type: 'glow', x: mz ? mz.x : this.x, y: mz ? mz.y : this.y, z: mz ? mz.z : this.fly ? 40 : 22, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, drag: 1.5, life: 0.5, size: 4, size1: 8, color: chance(0.5) ? E.glow : E.core, add: true }); }
        } else {
          const L = w.map.rayLength(this.x, this.y, ang, A.range || 7);
          const ex = this.x + Math.cos(ang) * L, ey = this.y + Math.sin(ang) * L;
          for (const c of lineTargets(w, this.team, this.x, this.y, ex, ey, 0.5)) hit(this, c, rand(dmg[0], dmg[1]), el, { freeze: A.freeze });
          addEffect(new Bolt(mz ? mz.x : this.x, mz ? mz.y : this.y, mz ? mz.z : 30, ex, ey, 20, E.glow, 0.2, 3));
        }
        sfx(E.sfx, 0.35);
        break;
      }
      case 'nova':
        w.addHazard(new NovaWave({ world: w, src: this, x: this.x, y: this.y, r: A.r || 2.5, dmg, el, fx: el === 'phys' ? 'shock' : 'nova' }));
        if (A.buff) this.buffAllies(A.buff, A.amt, (A.r || 2.5) + 1);
        break;
      case 'heal': {
        const r = A.r || 5;
        for (const c of w.alliesOf(this.team, this.x, this.y, r)) {
          if (c.isPlayer) c.heal(c.maxHp * (A.amt || 2) / 100 * (A.cd || 1) * 2, true);
          else c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.04);
        }
        addEffect(new Ring(this.x, this.y, 0.2, r, 0.6, '#80ff80', 2));
        break;
      }
      case 'buff':
        this.buffAllies(A.stat, A.amt, A.r || 5, A);
        addEffect(new Ring(this.x, this.y, 0.2, A.r || 5, 0.8, E.glow, 1.5));
        break;
      case 'curse': {
        for (const c of w.hostiles(this.team, this.x, this.y, A.r || 4)) {
          if (A.curse === 'fear' && c.rank !== 'boss') c.status.fear = { t: 1.5 };
          else if (A.curse === 'slow') c.curses.slow = { t: 1.2, amt: 0.45 };
          else c.curses[A.curse] = { t: 1.2, amt: 30, src: this.owner };
        }
        addEffect(new Ring(this.x, this.y, 0.2, A.r || 4, 0.7, E.glow, 1.5));
        break;
      }
      case 'spawn': {
        const kids = w.creatures.filter((c) => c.parentId === this.id && !c.dead).length;
        if (kids < (A.max || 6)) {
          const def = SUMMONS[A.what];
          const m = buildSummon(this.owner, def, A.what, this.x + rand(-1, 1), this.y + rand(-1, 1), this.dmg * 0.5, this.maxHp * 0.15, 12);
          m.parentId = this.id;
          w.add(m);
        }
        break;
      }
      case 'melee':
        if (t && dist(this.x, this.y, t.x, t.y) <= this.atkRange(t)) this.startAction('melee', 0.1, { target: t });
        break;
    }
  }

  buffAllies(stat, amt, r, A = {}) {
    const p = this.owner;
    if (p && dist(this.x, this.y, p.x, p.y) < r) {
      const stats = { [stat]: amt };
      if (A.as) stats.as = A.as;
      if (A.regen) stats.regen = A.regen * 10;
      p.addBuff({ id: 'aura_' + this.skillId, name: this.name, el: this.el || 'holy', stats, t: 1.5, max: 1.5, hidden: false, aura: true });
    }
    for (const c of this.world.alliesOf(this.team, this.x, this.y, r)) if (c.summon) c.partyBuff = { stats: { [stat]: amt, ...(A.as ? { as: A.as } : null) }, t: 1.5 };
  }


  // ------------------------------------------------------------------ special moves (MOVES, ARCH_MOVES)
  /** Keep an estimate of the target's velocity, so shots can lead it. */
  trackTarget(t, dt) {
    const T = this.tv || (this.tv = { t: null, x: 0, y: 0, vx: 0, vy: 0 });
    if (T.t === t && dt > 0) {
      const k = Math.min(1, dt * 6);
      T.vx += ((t.x - T.x) / dt - T.vx) * k; T.vy += ((t.y - T.y) / dt - T.vy) * k;
    } else { T.vx = T.vy = 0; T.t = t; }
    T.x = t.x; T.y = t.y;
  }
  /** Angle to shoot at t with a projectile of this speed, aimed where it will be (up to 3 tiles ahead). */
  leadAng(t, speed) {
    const T = this.tv;
    if (!T || T.t !== t) return angleTo(this.x, this.y, t.x, t.y);
    const k = dist(this.x, this.y, t.x, t.y) / speed;
    let lx = T.vx * k, ly = T.vy * k;
    const L = Math.hypot(lx, ly);
    if (L > 3) { lx *= 3 / L; ly *= 3 / L; }
    const ax = t.x + lx, ay = t.y + ly;
    return this.world.map.los(this.x, this.y, ax, ay) ? angleTo(this.x, this.y, ax, ay) : angleTo(this.x, this.y, t.x, t.y);
  }

  goFrenzy() {
    this.frenzy = true;
    this.speed *= 1.35; this.atkCd *= 0.7; this.dmg *= 1.15;
    this.aura = this.aura || '#ff2010';
    floatText(this.x, this.y, 60, 'Frenzy!', '#ff5030', 13, { life: 1.2 });
    sfx('roar', 0.5);
  }

  trySpecial(t, d) {
    const los = this.world.map.los(this.x, this.y, t.x, t.y);
    const ok = this.moves.filter((k) => MOVES[k] && MOVES[k].ok(this, t, d, los));
    if (!ok.length) { this.moveCd = 0.4; return false; }
    const k = pick(ok);
    this.moveCd = MOVES[k].cd * rand(0.8, 1.25) * (this.rank === 'normal' ? 1 : 0.75);
    this.face(angleTo(this.x, this.y, t.x, t.y));
    return this.beginMove(k, t, d) !== false;
  }

  /** Wind-up and telegraph of a special move; movePerform runs it. Returns false if it can't be done from here. */
  beginMove(k, t, d) {
    const w = this.world, map = w.map, ang = angleTo(this.x, this.y, t.x, t.y), big = Math.sqrt(this.scale);
    const tele = (o) => addEffect(new Telegraph(o), 'ground');
    switch (k) {
      case 'lunge': {
        const L = Math.max(0, d - 0.7), tx = this.x + Math.cos(ang) * L, ty = this.y + Math.sin(ang) * L;
        if (!map.losWide(this.x, this.y, tx, ty, bodyR(this) + 0.03)) return false;
        tele({ kind: 'circle', x: tx, y: ty, r: 1.1 * big, dur: 0.45 });
        this.startAction('mv_lunge', 0.45, { tx, ty, ang });
        break;
      }
      case 'whirl':
        tele({ kind: 'circle', x: this.x, y: this.y, r: 1.8 * big, dur: 0.55 });
        this.startAction('mv_whirl', 0.55);
        break;
      case 'combo':
        this.startAction('mv_combo', 0.2, { target: t, n: 3 });
        break;
      case 'quake':
        tele({ kind: 'line', x: this.x, y: this.y, ang, len: 6.5, w: 1, dur: 0.6 });
        this.startAction('mv_quake', 0.6, { ang });
        break;
      case 'hook': {
        const len = Math.min(7, d + 0.5);
        tele({ kind: 'line', x: this.x, y: this.y, ang, len, w: 0.5, dur: 0.5, color: '#d0a040' });
        this.startAction('mv_hook', 0.5, { ang, len });
        break;
      }
      case 'fan': case 'web':
        this.startAction('mv_' + k, 0.35, { target: t });
        break;
      case 'burst':
        this.startAction('mv_burst', 0.25, { target: t, n: this.rank === 'normal' ? 3 : 5 });
        break;
      case 'lob':
        tele({ kind: 'circle', x: t.x, y: t.y, r: 1.2, dur: 0.35 + 0.35 + d * 0.06 });
        this.startAction('mv_lob', 0.35, { tx: t.x, ty: t.y });
        break;
      case 'snipe':
        tele({ kind: 'line', x: this.x, y: this.y, ang, len: 12, w: 0.4, dur: 0.9, color: '#ffe040' });
        this.startAction('mv_snipe', 0.9, { ang });
        break;
      case 'blink': {
        for (let i = 0; i < 12; i++) {
          const a = angleTo(t.x, t.y, this.x, this.y) + rand(-1.4, 1.4), rr = rand(4, 6);
          const x = t.x + Math.cos(a) * rr, y = t.y + Math.sin(a) * rr;
          if (!map.circleFree(x, y, bodyR(this) + 0.05) || !map.los(x, y, t.x, t.y) || map.flowAt(x, y) < 0) continue;
          sparkle(this.x, this.y, 20, elem(this.el || 'arcane').glow, 10, 0.4);
          this.x = x; this.y = y; this.nav = null;
          sparkle(x, y, 20, elem(this.el || 'arcane').glow, 10, 0.4);
          sfx('arcane', 0.4);
          this.cd = Math.min(this.cd, 0.35);
          return true;
        }
        return false;
      }
      case 'runes':
        this.startAction('mv_runes', 0.3, { tx: t.x, ty: t.y, ang });
        break;
      case 'orbs':
        tele({ kind: 'circle', x: this.x, y: this.y, r: 1, dur: 0.5 });
        this.startAction('mv_orbs', 0.5);
        break;
      case 'sweep': {
        const dir = chance(0.5) ? 1 : -1, a0 = ang - dir * 0.9, len = this.range || 7;
        tele({ kind: 'line', x: this.x, y: this.y, ang: a0, len, w: 0.5, dur: 0.6, color: '#ff40ff' });
        this.startAction('mv_sweep', 0.6, { a: a0, dir, left: 1.8, len, hits: new Map() });
        break;
      }
      case 'spiral': case 'cross': case 'rings':
        tele({ kind: 'circle', x: this.x, y: this.y, r: 1.3 * big, dur: 0.5, color: '#ff40c0' });
        this.startAction('mv_' + k, 0.5, { a0: ang, dir: chance(0.5) ? 1 : -1 });
        break;
      case 'wall':
        this.startAction('mv_wall', 0.45, { ang });
        break;
      case 'rain':
        this.startAction('mv_rain', 0.35, { tx: t.x, ty: t.y });
        break;
      case 'homing':
        tele({ kind: 'circle', x: this.x, y: this.y, r: 0.9, dur: 0.4, color: '#c060ff' });
        this.startAction('mv_homing', 0.4);
        break;
      case 'phase': {
        for (let i = 0; i < 12; i++) {
          const a = rand(TAU), rr = rand(1.3, 2.2), x = t.x + Math.cos(a) * rr, y = t.y + Math.sin(a) * rr;
          if (!map.circleFree(x, y, bodyR(this) + 0.05) || map.flowAt(x, y) < 0) continue;
          const g = elem(this.el || 'arcane').glow;
          sparkle(this.x, this.y, 30, g, 24, 0.5); addEffect(new Ring(this.x, this.y, 0.2, 1.4, 0.35, g, 3));
          this.x = x; this.y = y; this.nav = null; this.alpha = 0.3;
          sparkle(x, y, 30, g, 24, 0.5); addEffect(new Ring(x, y, 1.6, 0.2, 0.35, g, 3));
          sfx('arcane', 0.5);
          tele({ kind: 'circle', x, y, r: 1.6 * big, dur: 0.55 });
          this.startAction('mv_phase', 0.55);
          return true;
        }
        return false;
      }
      case 'burrow':
        smoke(this.x, this.y, 5, '#4a3a2a', 8, 12); burst(this.x, this.y, 5, 'phys', 14, 3);
        sfx('thud', 0.5);
        this.targetable = false;
        this.state = 'act'; this.action = { kind: 'mv_burrow', t: 0, ongoing: true, target: t, stage: 0 };
        break;
      default: return false;
    }
    return true;
  }

  movePerform(a) {
    const w = this.world, el = this.el || 'phys', E = elem(el), dmg = this.dmg, big = Math.sqrt(this.scale);
    const P = this.proj || { fx: PROJ_FX[el], speed: 7 };
    const shot = (ang, o) => w.addHazard(new Projectile({ world: w, src: this, x: this.x, y: this.y, ang, speed: P.speed || 7, range: (this.range || 7) + 2, fx: P.fx, el, dmg: [dmg * 0.75, dmg], ...o }));
    switch (a.kind) {
      case 'mv_lunge': case 'mv_combo': case 'mv_burst': case 'mv_sweep': case 'mv_spiral': case 'mv_cross': case 'mv_rings':
        this.state = 'act'; a.ongoing = true; a.t = 0; a.k = 0; a.sx = this.x; a.sy = this.y;
        if (a.kind === 'mv_lunge') sfx('swing', 0.6);
        return;
      case 'mv_whirl':
        aoe(w, this, this.x, this.y, 1.8 * big, dmg * 1.3, el === 'phys' ? 'phys' : el, { melee: true, knock: 0.8 });
        for (let i = 0; i < 4; i++) addEffect(new Slash(this.x, this.y, this.facing + i * 1.57, 2.2, 1.6 * big, 0.25, this.team === 'enemy' ? '#ffd0c0' : '#c0ffd0', { width: 8 }));
        sfx('swing'); sfx('phys', 0.5);
        break;
      case 'mv_quake':
        w.addHazard(new Fissure({ world: w, src: this, x: this.x, y: this.y, ang: a.ang, len: 6.5, dmg: [dmg * 0.9, dmg * 1.2], el, fx: el === 'fire' ? 'fire' : el === 'cold' ? 'ice' : 'earth', o: { knock: 0.5 } }));
        sfx('thud');
        break;
      case 'mv_hook':
        w.addHazard(new Projectile({ world: w, src: this, x: this.x, y: this.y, ang: a.ang, speed: 14, range: a.len, fx: 'chain', el: 'phys', dmg: [dmg * 0.6, dmg * 0.8], o: { pull: true } }));
        sfx('swing');
        break;
      case 'mv_fan': {
        const base = a.target && !a.target.dead ? angleTo(this.x, this.y, a.target.x, a.target.y) : this.facing;
        for (let i = 0; i < 5; i++) shot(base + (i - 2) * 0.2);
        sfx(P.fx === 'arrow' ? 'bow' : E.sfx, 0.5);
        break;
      }
      case 'mv_web':
        if (a.target && !a.target.dead) shot(this.leadAng(a.target, 8), { speed: 8, fx: 'blob', el: el === 'phys' ? 'poison' : el, o: { slow: true }, size: 1.3 });
        sfx('acid', 0.4);
        break;
      case 'mv_lob': {
        const pel = el === 'phys' ? 'poison' : el;
        w.addHazard(new Projectile({ world: w, src: this, x: this.x, y: this.y, lob: true, tx: a.tx, ty: a.ty, range: 8, fx: 'blob', el: pel, dmg: [dmg * 0.8, dmg], exp: 1.1, size: 1.3,
          onLand: (x, y) => w.addHazard(new Area({ world: w, src: this, x, y, r: 1.2, dur: 3.5, tick: 0.5, dmg: [dmg * 0.22, dmg * 0.3], el: pel, fx: POOL_FX[pel] || 'poison' })) }));
        sfx(elem(pel).sfx, 0.4);
        break;
      }
      case 'mv_snipe':
        w.addHazard(new Projectile({ world: w, src: this, x: this.x, y: this.y, ang: a.ang, speed: 17, range: 13, fx: P.fx || 'arrow', el, dmg: [dmg * 1.8, dmg * 2.2], size: 1.4, pierce: 99 }));
        sfx(P.fx === 'arrow' ? 'bow' : E.sfx, 0.7);
        break;
      case 'mv_runes': {
        const pts = [[a.tx, a.ty]];
        for (const off of [2.1, -2.1]) pts.push([a.tx + Math.cos(a.ang + off) * 1.6, a.ty + Math.sin(a.ang + off) * 1.6]);
        pts.forEach(([x, y], i) => { if (w.map.isFloor(x, y)) w.addHazard(new Delayed({ world: w, src: this, x, y, r: 1.1, delay: 0.9 + i * 0.25, fx: 'explosion', el, dmg: [dmg * 1, dmg * 1.3] })); });
        sfx(E.sfx, 0.5);
        break;
      }
      case 'mv_wall': {
        const px = -Math.sin(a.ang), py = Math.cos(a.ang);
        for (let i = -3; i <= 3; i++) shot(a.ang, { x: this.x + px * i * 0.55, y: this.y + py * i * 0.55, speed: 5, range: 10, size: 1.2 });
        sfx(E.sfx, 0.5);
        break;
      }
      case 'mv_rain': {
        const g = E.glow;
        for (let i = 0; i < 7; i++) {
          const r = i ? rand(0.8, 3) : 0, an = rand(TAU), x = a.tx + Math.cos(an) * r, y = a.ty + Math.sin(an) * r;
          if (!w.map.isFloor(x, y)) continue;
          w.addHazard(new Delayed({ world: w, src: this, x, y, r: 1, delay: 0.8 + i * 0.18, fx: el === 'phys' ? 'meteor' : 'explosion', el, dmg: [dmg * 0.8, dmg * 1.1] }));
        }
        addEffect(new Column(this.x, this.y, g, 0.5, 14, 200));
        sfx(E.sfx, 0.6);
        break;
      }
      case 'mv_homing':
        for (let i = 0; i < 3; i++) w.addHazard(new Projectile({ world: w, src: this, x: this.x, y: this.y, ang: this.facing + (i - 1) * 1.1, speed: 3.6, range: 13, home: 0.45, fx: PROJ_FX[el] === 'rock' ? 'orb' : PROJ_FX[el], el, dmg: [dmg * 0.7, dmg * 0.9], size: 1.4 }));
        sfx('arcane', 0.5);
        break;
      case 'mv_phase':
        this.alpha = undefined;
        aoe(w, this, this.x, this.y, 1.6 * big, dmg * 1.25, el, { melee: true, knock: 0.6 });
        for (let i = 0; i < 3; i++) addEffect(new Slash(this.x, this.y, this.facing + i * 2.1, 2, 1.4 * big, 0.25, elem(el === 'phys' ? 'arcane' : el).glow, { width: 7 }));
        sfx('swing'); sfx(E.sfx, 0.4);
        break;
      case 'mv_orbs': {
        const a0 = rand(TAU);
        for (let i = 0; i < 8; i++) w.addHazard(new Projectile({ world: w, src: this, x: this.x, y: this.y, ang: a0 + (i / 8) * TAU, speed: 3.2, range: 7, fx: PROJ_FX[el] === 'rock' ? 'orb' : PROJ_FX[el], el, dmg: [dmg * 0.7, dmg * 0.9], size: 1.3 }));
        sfx(E.sfx, 0.5);
        break;
      }
    }
    this.cd = this.atkCd;
  }

  /** Special moves that play out over time. */
  moveTick(a, dt) {
    const w = this.world, el = this.el || 'phys', dmg = this.dmg, big = Math.sqrt(this.scale);
    const done = () => { this.state = 'idle'; this.cd = this.atkCd; this.z = 0; };
    switch (a.kind) {
      case 'mv_lunge': {
        const k = Math.min(1, a.t / 0.35);
        const want = dist(this.x, this.y, a.tx, a.ty), step = Math.min(want, dist(a.sx, a.sy, a.tx, a.ty) / 0.35 * dt);
        if (want > 0.01) w.map.move(this, (a.tx - this.x) / want * step, (a.ty - this.y) / want * step, this.ghost);
        this.z = 50 * 4 * k * (1 - k); this.moving = true;
        if (k >= 1) {
          explode(w, this, this.x, this.y, 1.1 * big, dmg * 1.3, el, { knock: 0.6, melee: true }, 'eruption');
          sfx('thud', 0.6);
          done();
        }
        break;
      }
      case 'mv_combo': {
        if (a.t < a.k * 0.22) break;
        const t = a.target;
        if (t && !t.dead) {
          this.face(angleTo(this.x, this.y, t.x, t.y));
          if (dist(this.x, this.y, t.x, t.y) <= this.atkRange(t) + 0.6) this.deal(t, dmg * 0.7, this.atk ? el : 'phys', { melee: true, ang: this.facing, bleed: a.k === 2 && chance(0.4) });
        }
        this.lunge = 1;
        addEffect(new Slash(this.x, this.y, this.facing, 1.8, 0.9 * this.scale, 0.15, '#ffd0c0', { width: 6, flip: a.k % 2 === 1 }));
        sfx('swing', 0.4);
        if (++a.k >= a.n) done();
        break;
      }
      case 'mv_burst': {
        if (a.t < a.k * 0.14) break;
        const t = a.target, P = this.proj || { fx: PROJ_FX[el], speed: 7 };
        if (t && !t.dead) {
          w.addHazard(new Projectile({ world: w, src: this, x: this.x, y: this.y, ang: this.leadAng(t, P.speed || 7) + rand(-0.05, 0.05), speed: P.speed || 7, range: (this.range || 7) + 2, fx: P.fx, el, dmg: [dmg * 0.6, dmg * 0.8] }));
          this.face(angleTo(this.x, this.y, t.x, t.y));
          if (a.k % 2 === 0) sfx(P.fx === 'arrow' ? 'bow' : elem(el).sfx, 0.35);
        }
        if (++a.k >= a.n) done();
        break;
      }
      case 'mv_sweep': {
        const turn = 2 * dt;
        a.a += a.dir * turn; a.left -= turn;
        this.face(a.a);
        const L = w.map.rayLength(this.x, this.y, a.a, a.len), ex = this.x + Math.cos(a.a) * L, ey = this.y + Math.sin(a.a) * L;
        for (const c of lineTargets(w, this.team, this.x, this.y, ex, ey, 0.4)) {
          if ((a.hits.get(c) || 0) > w.time) continue;
          a.hits.set(c, w.time + 0.35);
          this.deal(c, dmg * 0.8, el, {});
        }
        if ((a.fx = (a.fx || 0) - dt) <= 0) { a.fx = 0.04; addEffect(new Bolt(this.x, this.y, 30, ex, ey, 20, elem(el).glow, 0.08, 3)); }
        if (a.left <= 0) done();
        break;
      }
      case 'mv_spiral': case 'mv_cross': case 'mv_rings': {
        const P = this.proj || { fx: PROJ_FX[el], speed: 7 }, fx = P.fx === 'arrow' || P.fx === 'rock' ? 'orb' : P.fx || 'orb';
        const fire = (ang, sp) => w.addHazard(new Projectile({ world: w, src: this, x: this.x, y: this.y, ang, speed: sp, range: 9, fx, el, dmg: [dmg * 0.45, dmg * 0.6], size: 1.1 }));
        const spec = a.kind === 'mv_spiral' ? [0.07, 1.8, 2] : a.kind === 'mv_cross' ? [0.13, 1.7, 4] : [0.32, 1.0, 14];
        if (a.t < a.k * spec[0]) break;
        if (a.kind === 'mv_rings') { for (let i = 0; i < spec[2]; i++) fire(a.a0 + (i + (a.k % 2) * 0.5) / spec[2] * TAU, 3.4); sfx(elem(el).sfx, 0.35); }
        else {
          const base = a.a0 + a.dir * a.t * (a.kind === 'mv_spiral' ? 4.2 : 1.3);
          for (let i = 0; i < spec[2]; i++) fire(base + i / spec[2] * TAU, a.kind === 'mv_spiral' ? 4.2 : 5);
          if (a.k % 4 === 0) sfx(elem(el).sfx, 0.2);
        }
        a.k++;
        if (a.t >= spec[1]) done();
        break;
      }
      case 'mv_burrow': {
        // 0: underground, tunnelling to the target; 1: telegraph under it; 2: erupt
        const t = a.target;
        if (a.stage === 0) {
          this.alpha = Math.max(0, 1 - a.t * 4); this.z = -a.t * 40;
          if (a.t > 0.25 && t && !t.dead) {
            const want = dist(this.x, this.y, t.x, t.y), step = Math.min(want, 7 * dt);
            if (want > 0.3) w.map.move(this, (t.x - this.x) / want * step, (t.y - this.y) / want * step, false);
            if (chance(dt * 30)) spawn({ type: 'dot', x: this.x + rand(-0.3, 0.3), y: this.y + rand(-0.3, 0.3), z: 2, vz: rand(20, 50), g: 200, life: 0.5, size: rand(2, 3.5), color: '#5a4630' });
          }
          if (a.t > 2 || (t && dist(this.x, this.y, t.x, t.y) < 0.6) || !t || t.dead) {
            a.stage = 1; a.t = 0;
            addEffect(new Telegraph({ kind: 'circle', x: this.x, y: this.y, r: 1.5 * big, dur: 0.5 }), 'ground');
          }
        } else if (a.stage === 1) {
          if (chance(dt * 40)) spawn({ type: 'dot', x: this.x + rand(-0.8, 0.8), y: this.y + rand(-0.8, 0.8), z: 2, vz: rand(30, 70), g: 200, life: 0.5, size: rand(2, 4), color: '#6a5438' });
          if (a.t > 0.5) {
            this.alpha = undefined; this.z = 0; this.targetable = true;
            explode(w, this, this.x, this.y, 1.5 * big, dmg * 1.4, el, { knock: 0.8, melee: true }, 'eruption');
            smoke(this.x, this.y, 5, '#4a3a2a', 10, 14);
            sfx('thud', 0.8);
            done();
          }
        }
        break;
      }
      default: done();
    }
  }

  // ------------------------------------------------------------------ bosses
  bossUpdate(dt) {
    if (this.vel && this.vel.holdBoss()) return; // Velscour hovering, hidden or bound (game/velscour.js)
    const w = this.world, p = w.player;
    if (!p || p.dead) return this.idle(dt);
    const t = this.pickTarget() || p;
    const d = dist(this.x, this.y, t.x, t.y);
    if (!this.awake) {
      if (d > 9 || !w.map.los(this.x, this.y, t.x, t.y)) return this.idle(dt);
      this.awake = true;
      this.alertPack();
      if (w.onBossAwake) w.onBossAwake(this);
    }
    if (this.phase === 1 && this.hp < this.maxHp * 0.5) {
      this.phase = 2;
      this.speed *= 1.2; this.atkCd *= 0.75;
      floatText(this.x, this.y, 90, 'ENRAGED!', '#ff4020', 22, { life: 1.5 });
      addEffect(new Ring(this.x, this.y, 0.2, 4, 0.8, '#ff3010', 6));
      sfx('roar'); sfx('boss');
      this.patternQ = ['summon', ...this.patternQ];
    }
    this.bossT -= dt;
    if (this.bossT <= 0) {
      if (!this.patternQ.length) this.patternQ = shuffle(this.patterns.slice());
      const pat = this.patternQ.shift();
      this.bossT = rand(2.6, 4.2) * (this.phase === 2 ? 0.7 : 1);
      return this.bossPattern(pat, t);
    }
    // between patterns: special moves, chase and melee
    if (this.moves && (this.moveCd -= dt) <= 0 && this.trySpecial(t, d)) return;
    if (d <= this.atkRange(t) + 0.3) {
      this.face(angleTo(this.x, this.y, t.x, t.y));
      if (this.cd <= 0) this.startAction('melee', 0.35, { target: t });
      this.moving = false;
    } else this.chase(dt, t);
  }

  bossPattern(pat, t) {
    const w = this.world;
    const tele = (o) => addEffect(new Telegraph(o), 'ground');
    switch (pat) {
      case 'slam':
        this.startAction('boss_slam', 0.9);
        tele({ kind: 'circle', x: this.x, y: this.y, r: 3.2 * (this.scale / 1.6), dur: 0.9 });
        break;
      case 'nova':
        this.startAction('boss_nova', 0.7);
        tele({ kind: 'circle', x: this.x, y: this.y, r: 1.5, dur: 0.7 });
        break;
      case 'volley':
        this.startAction('boss_volley', 0.5, { target: t });
        break;
      case 'charge': {
        const ang = angleTo(this.x, this.y, t.x, t.y), len = Math.min(10, dist(this.x, this.y, t.x, t.y) + 2);
        this.startAction('charge', 0.8, { ang, len });
        tele({ kind: 'line', x: this.x, y: this.y, ang, len, w: 1.2, dur: 0.8 });
        break;
      }
      case 'summon':
        this.startAction('boss_summon', 1.0);
        break;
      case 'meteor':
        this.startAction('boss_meteor', 0.4, { target: t });
        break;
      case 'spiral':
        this.startAction('boss_spiral', 0.6);
        break;
      case 'beam': {
        const ang = angleTo(this.x, this.y, t.x, t.y);
        this.startAction('boss_beam', 1.0, { ang });
        tele({ kind: 'line', x: this.x, y: this.y, ang, len: 11, w: 0.8, dur: 1.0, color: '#ff40ff' });
        break;
      }
    }
  }

  bossPerform(a) {
    const w = this.world, el = this.el || 'fire', E = elem(el);
    const dmg = this.dmg;
    switch (a.kind) {
      case 'boss_slam':
        explode(w, this, this.x, this.y, 3.2 * (this.scale / 1.6), dmg * 1.8, 'phys', { knock: 1.5 }, 'eruption');
        sfx('thud'); sfx('explode');
        break;
      case 'boss_nova': {
        const n = this.isVelscour ? 28 : 18;
        for (let ring = 0; ring < (this.phase === 2 ? 2 : 1); ring++) {
          for (let i = 0; i < n; i++) {
            const ang = (i / n) * TAU + ring * (Math.PI / n);
            const pr = new Projectile({ world: w, src: this, x: this.x, y: this.y, ang, speed: 4.5 + ring * 1.5, range: 11, fx: PROJ_FX[el], el, dmg: [dmg * 0.7, dmg * 0.9], size: 1.2 });
            w.addHazard(pr);
          }
        }
        sfx(E.sfx);
        break;
      }
      case 'boss_volley': {
        const t = a.target || w.player;
        const base = angleTo(this.x, this.y, t.x, t.y);
        const n = this.isVelscour ? 9 : 5;
        for (let i = 0; i < n; i++) w.addHazard(new Projectile({ world: w, src: this, x: this.x, y: this.y, ang: base + (i - (n - 1) / 2) * 0.16, speed: 8, range: 12, fx: PROJ_FX[el], el, dmg: [dmg * 0.8, dmg], size: 1.1 }));
        sfx(E.sfx);
        break;
      }
      case 'boss_summon': {
        const roster = this.isVelscour ? ['demon', 'imp', 'gargoyle', 'knight'] : w.biome.roster;
        const n = this.isVelscour ? 5 : 3 + (this.phase === 2 ? 2 : 0);
        for (let i = 0; i < n; i++) {
          const [x, y] = w.map.randomNear(this.x, this.y, 3);
          const m = makeMonster(w, pick(roster.filter((r) => r !== 'abomination')), w.biome, this.level, 'normal', x, y);
          m.awake = true;
          w.add(m);
          addEffect(new Ring(x, y, 0.1, 1, 0.5, '#ff2020', 3));
          smoke(x, y, 0, '#200808', 4, 8);
        }
        sfx('summon'); sfx('roar');
        break;
      }
      case 'boss_meteor': {
        const p = w.player;
        const n = this.isVelscour ? 7 : 4;
        for (let i = 0; i < n; i++) {
          const x = p.x + (i ? rand(-3, 3) : 0), y = p.y + (i ? rand(-3, 3) : 0);
          if (!w.map.isFloor(x, y)) continue;
          w.addHazard(new Delayed({ world: w, src: this, x, y, r: 1.5, delay: 1.1 + i * 0.12, fx: 'meteor', el: el === 'phys' ? 'fire' : el, dmg: [dmg * 1.2, dmg * 1.5] }));
        }
        sfx('boss');
        break;
      }
      case 'boss_spiral': {
        let k = 0;
        const total = this.isVelscour ? 60 : 36;
        const fire = () => {
          if (this.dead || k >= total) return;
          for (let arm = 0; arm < (this.isVelscour ? 4 : 3); arm++) {
            const ang = k * 0.32 + (arm * TAU) / (this.isVelscour ? 4 : 3);
            w.addHazard(new Projectile({ world: w, src: this, x: this.x, y: this.y, ang, speed: 5, range: 11, fx: PROJ_FX[el], el, dmg: [dmg * 0.5, dmg * 0.7] }));
          }
          k++;
          w.addHazard({ t: 0.06, update(dt) { this.t -= dt; if (this.t <= 0) { fire(); return false; } return true; }, draw() {} });
        };
        fire();
        sfx(E.sfx);
        break;
      }
      case 'boss_beam': {
        const len = 11;
        const L = w.map.rayLength(this.x, this.y, a.ang, len);
        const ex = this.x + Math.cos(a.ang) * L, ey = this.y + Math.sin(a.ang) * L;
        for (const c of lineTargets(w, this.team, this.x, this.y, ex, ey, 0.75)) this.deal(c, dmg * 2, el, {});
        for (let i = 0; i < 3; i++) addEffect(new Bolt(this.x, this.y, 40, ex, ey, 20, i ? E.core : E.glow, 0.45, 6 - i * 2));
        sfx('explode');
        break;
      }
    }
    this.cd = this.atkCd;
  }

  spawnChild() {
    const w = this.world;
    const [x, y] = w.map.randomNear(this.x, this.y, 0.8);
    const c = new Monster({ ...this.cloneProps(), x, y, scale: this.scale * 0.65, maxHp: this.maxHp * 0.35, hp: this.maxHp * 0.35, xp: this.xp * 0.3, rank: 'normal', aura: null, affixes: null, awake: true });
    c.split = this.scale * 0.65 > 0.6;
    if (c.ai === 'boss' || c.ai === 'raid') c.ai = (ARCH[this.arch] && ARCH[this.arch].ai) || 'melee'; // a split guardian's young have no boss patterns
    w.add(c);
  }
  cloneProps() {
    const keys = ['arch', 'art', 'swap', 'artH', 'sprite', 'pal', 'px', 'ai', 'team', 'speed', 'dmg', 'r', 'level', 'el', 'res', 'goreType', 'bloodColor', 'name', 'atkCd', 'range', 'proj', 'undead', 'demon', 'fly', 'atkReach'];
    const o = {};
    for (const k of keys) o[k] = this[k];
    return o;
  }
}

// ======================================================================= factories
const TIERS = [['', 'Greater'], ['Elder', 'Dread'], ['Ancient', 'Nightmare']];

/** Which look a level gives an archetype: its rolled bestiary (rollLooks), made on first use. */
export function lookFor(world, archId, rnd = Math.random) {
  if (!world.looks) world.looks = rollLooks(world.biome || {});
  return world.looks.pick(archId, rnd);
}

/**
 * variant 1 = "greater" breed: own palette and name, tougher. `look` = {art, swap} from the level's bestiary
 * (rollLooks in data/bestiary.js); without one the level picks. Archetypes with no art keep their pixel sprite.
 */
export function makeMonster(world, archId, biome, level, rank = 'normal', x = 0, y = 0, variant = 0, look = undefined, rnd = Math.random) {
  const A = ARCH[archId];
  const B = monsterBase(level);
  const depth = world.depth || 1;
  if (A.seaOfSand && biome.id === 'sea_of_sand') look = { art:'ss_'+archId, swap:null };
  if (look === undefined) look = lookFor(world, archId);
  const art = look && ART_BY_ID[look.art];
  const biomeEl = biome.el && biome.el !== 'phys' ? biome.el : null;
  let el = A.el || 'phys';
  // casters take the biome's element, unless the art shows its own element in its own colours
  if (art && art.el && !look.swap && (!biomeEl || art.el === biomeEl) && A.ai !== 'melee') el = art.el;
  else if (biomeEl && ['ranged', 'caster', 'nova', 'beamer', 'exploder'].includes(A.ai) && archId !== 'archer') el = biomeEl;
  let pal = biome.mon ? shiftPalette(A.pal, biome.mon) : A.pal;
  if (variant) pal = shiftPalette(pal, { hue: 35, sat: 1.2, light: 0.06 });
  const tier = TIERS[Math.min(TIERS.length - 1, Math.floor(depth / 34))][variant ? 1 : 0];
  const tierName = art ? `${tier} ${art.name}`.trim() : A.names[Math.min(A.names.length - 1, Math.floor(depth / 34) + variant)];
  const adj = biome.adj ? biome.adj[(archId.length + depth + variant) % biome.adj.length] : '';
  const res = {};
  if (biomeEl) res[biomeEl] = 0.3;
  const undead = art && art.undead !== undefined ? art.undead : A.undead;
  if (undead) { res.poison = 0.5; res.shadow = 0.3; }
  if (A.ghost) res.phys = 0.3;
  if (A.armor) res.phys = (res.phys || 0) + 0.15;
  if (archId === 'elemental') res[el] = 0.6;
  if (archId === 'slime') res.acid = 0.5;
  const gore = (art && art.gore) || A.gore;
  const m = new Monster({
    arch: archId, sprite: A.sprite, pal, px: A.px || 2.3, r: A.r || 0.33, ai: A.ai, team: 'enemy',
    art: art ? art.id : null, swap: art ? (variant ? greaterSwap(look.swap) : look.swap) : null, artH: art ? art.h : 0,
    level, maxHp: B.hp * A.hp, hp: B.hp * A.hp, dmg: B.dmg * A.dmg, xp: B.xp * (A.xp || 1),
    speed: A.spd * rand(0.92, 1.08), el, res, goreType: gore, bloodColor: gore === 'flesh' ? biome.blood : null,
    name: art ? [tier, look.tint || (!tier && adj), art.name].filter(Boolean).join(' ') : `${adj} ${tierName}`.trim(), atkCd: 1.2, range: A.range, proj: A.proj ? { ...A.proj, fx: archId === 'archer' ? 'arrow' : A.proj.fx === 'blob' ? 'blob' : PROJ_FX[el] || A.proj.fx } : null,
    undead, demon: art && art.demon !== undefined ? art.demon : A.demon, fly: art && art.fly !== undefined ? art.fly : A.fly, ghost: A.ghost, poison: A.poison, split: A.split,
    summoner: A.summoner && chance(A.summoner), aoeCaster: A.aoe, rank: 'normal', x, y,
  });
  if (A.ai === 'brute') m.atkReach = 0.7;
  m.moves = rollMoves(archId, rank, variant, depth);
  m.moveCd = rand(1.5, 4);
  if (variant) { m.maxHp *= 1.4; m.hp = m.maxHp; m.dmg *= 1.2; m.xp *= 1.5; m.scale = 1.08; m.speed *= 1.05; }
  if (art && art.heavenlyFamily) {
    // The sixty Heaven opponents share the project's proven AI controllers
    // but vary their combat stats, elemental defenses and threat profile by
    // individual design. This is gameplay distinction, not just new names.
    const v = art.heavenlyVariant, family = art.heavenlyFamily;
    const elite = ['throne','judgement','warden'].includes(family);
    const quick = ['cherub','beast','griffin','oracle'].includes(family);
    const magical = ['ophanim','luminary','herald','oracle'].includes(family);
    m.maxHp *= (1 + v * .075) * (elite ? 1.18 : 1);
    m.hp = m.maxHp;
    m.dmg *= 1 + v * .055;
    m.speed *= quick ? 1.12 + .025*v : elite ? .85 + .02*v : 1 + .015*v;
    m.xp *= 1 + v * .12;
    m.res.holy = (m.res.holy || 0) + .08 + v*.025;
    if (magical) {
      m.res.arcane = (m.res.arcane || 0) + .10;
      if (m.range) m.range += v*.18;
    }
    if (family === 'ophanim' || family === 'luminary') m.fly = true;
  }
  if(art?.seaOfSand) { // the Sea of Sand's own creatures: tougher by rank, and a little more so away from the dunes
    const rarity=art.nativeVariant%5,foreign=art.homeBiome!==biome.id;
    m.maxHp*=1+rarity*.065+(art.nativeVariant>=45?.22:0);
    m.hp=m.maxHp;
    m.dmg*=1+rarity*.045;
    m.speed*=rarity%2?1.07:.96;
    m.xp*=1+rarity*.07+(foreign?.2:0);
    if(art.el&&art.el!=='phys')
      m.res[art.el]=(m.res[art.el]||0)+(foreign?.12:.20);
    // A traveling native is still visually and mechanically recognizable,
    // but all existing AI, projectiles, rank affixes and drops keep working.
    if(foreign)m.name='Wayward '+m.name;
  }
  if (rank !== 'normal') makeElite(m, rank, depth, world, rnd);
  if (art && art.heavenlyFamily && rank === 'boss') {
    m.name = art.name.toUpperCase();
    m.aura = '#f5d78d';
  }
  return m;
}

export function makeElite(m, rank, depth, world, rnd = Math.random) {
  m.rank = rank;
  const keys = Object.keys(ELITE_AFFIXES).filter((k) => k !== 'multishot' || ['ranged', 'caster'].includes(m.ai));
  if (rank === 'champion') {
    m.maxHp *= 3; m.dmg *= 1.4; m.xp *= 3; m.aura = '#4a8aff'; m.scale = 1.15;
    m.affixes = shuffle(keys, rnd).slice(0, depth > 40 ? 2 : 1);
    m.name = 'Champion ' + m.name;
  } else if (rank === 'unique') {
    m.maxHp *= 5; m.dmg *= 1.6; m.xp *= 6; m.aura = '#ffb030'; m.scale = 1.3;
    m.affixes = shuffle(keys, rnd).slice(0, depth > 50 ? 3 : 2);
    m.name = uniqueName(rnd);
    if (m.art) m.swap = uniqueSwap(rnd);
  } else if (rank === 'boss') {
    const vel = m.arch === 'velscour';
    if (vel) { m.art = 'va_velscour'; m.artH = 94; m.swap = null; }
    // Velscour: the final fight (was 40x, less than a plain depth-500 guardian)
    // a guardian is 10-22 plain normals whatever its build (a brute archetype's own bulk counts only partly)
    m.maxHp *= vel ? VELSCOUR_HP : (10 + Math.min(depth, 120) / 10) / Math.pow(Math.max(1, ARCH[m.arch]?.hp || 1), 0.7); m.dmg *= vel ? 2.8 : 1.9; m.xp *= vel ? 200 : 25;
    m.aura = vel ? '#ff2000' : '#ff4020';
    m.scale = vel ? 1.6 : 1.9; m.r *= vel ? 1 : 1.6;
    m.ai = 'boss';
    m.affixes = depth > 20 && !vel ? shuffle(keys.filter((k) => !['teleport', 'multishot', 'fast'].includes(k)), rnd).slice(0, 1) : [];
    m.name = vel ? 'DEMON LORD VELSCOUR' : (ARCH[m.arch]?.bossName || bossName(rnd));
    m.isVelscour = vel;
    const base = ['slam', 'nova', 'volley', 'charge', 'summon', 'meteor', 'spiral', 'beam'];
    m.patterns = vel ? base : ARCH[m.arch]?.bossPatterns ? ARCH[m.arch].bossPatterns.slice() : shuffle(base.slice(), rnd).slice(0, 3 + Math.min(3, Math.floor(depth / 20)));
    if (!m.patterns.includes('slam')) m.patterns.push('slam');
    m.atkCd = 1.1;
    m.aggroRange = 9;
    if (!m.el || m.el === 'phys') m.el = world.biome.el && world.biome.el !== 'phys' ? world.biome.el : 'fire';
    m.res = { ...m.res, [m.el]: 0.4 };
  }
  if (m.affixes) {
    if (m.affixes.includes('strong')) m.dmg *= 1.5;
    if (m.affixes.includes('fast')) { m.speed *= 1.4; m.atkCd *= 0.75; }
    if (m.affixes.includes('tough')) { m.maxHp *= 1.5; for (const k of ['phys', 'fire', 'cold', 'light', 'poison']) m.res[k] = (m.res[k] || 0) + 0.15; }
    if (m.affixes.includes('fiery')) m.res.fire = (m.res.fire || 0) + 0.4;
    if (m.affixes.includes('frozen')) m.res.cold = (m.res.cold || 0) + 0.4;
  }
  m.hp = m.maxHp;
}

let _summonSeq = 0;
export function nextSummonId(owner) {
  const prefix = (net && net.myId) ? net.myId : (owner && owner.id ? `c${owner.id}` : 'local');
  return `${prefix}_s_${++_summonSeq}`;
}

/** Build a player minion from a summon definition. */
export function buildSummon(owner, def, key, x, y, dmg, hp, life) {
  const look = def.look || { sprite: 'skeleton', pal: {}, px: 2.3 };
  const caster = def.cast ? { cast: true, range: def.atk.range || 7 } : null;
  const m = new Monster({
    team: 'player', owner, summon: true, x, y, ai: def.ai, atk: def.atk, el: def.el || 'phys', summonEl: def.el,
    dmg, maxHp: hp, hp, speed: def.spd || 3, static: !!def.static, fly: !!def.fly, ghost: !!def.ghost,
    targetable: def.targetable !== false, alpha: def.alpha, level: owner.char.level, life: life || 0, taunt: def.taunt,
    atkCd: (def.atk && def.atk.cd) || 1, name: def.name, leech: def.atk && def.atk.leech, r: look.px > 3.5 ? 0.5 : 0.3,
    defAura: def.aura, summonKey: key, awake: true, ...caster,
    spell: def.spell || null, spellCd: def.spell ? rand(0.5, def.spell.cd || 3) : 0, atkReach: def.reach ? 0.55 + def.reach : undefined,
  });
  m.summonId = nextSummonId(owner);
  if (look.cls) { m.classId = look.cls === true ? owner.classId : look.cls; m.classPal = look.pal || null; m.spriteH = 50; }
  else { m.sprite = look.sprite; m.pal = look.pal; m.px = look.px || 2.3; }
  const art = Array.isArray(look.art) ? pick(look.art) : look.art; // pets: a random one of the list
  if (art && ART_BY_ID[art]) {
    m.art = art; m.swap = look.swap || null; m.artH = look.h || ART_BY_ID[art].h; m.artRef = look.ref || 0;
    m.hop = !!look.hop; m.idleArt = look.idle && look.idle[art];
  }
  if (def.slime) attachSlime(m, def);
  return m;
}

export function createSummon(p, sk, L, x, y, dmgRange, corpse) {
  const w = p.world;
  let key = sk.m.sum, def;
  if (SUMMONS[key] && SUMMONS[key].court) [key, def] = courtDef(key, p); // the Slime Lord's rainbow broods
  else { if (SUMMONS[key] && SUMMONS[key].pool) key = pick(SUMMONS[key].pool); def = SUMMONS[key]; } // Grave Warband, Conclave of Bones
  if (!def) return null;
  const sp = 1 + (p.st.summonPct || 0) / 100;
  const avg = (dmgRange[0] + dmgRange[1]) / 2;
  const hp = Math.max(20, p.maxHp * def.hp * (1 + 0.08 * (L - 1)) * sp);
  const m = buildSummon(p, def, key, x, y, avg * def.dmg * sp, hp, sk.m.dur || 0);
  m.skillId = sk.id;
  m.aug = p.augFor ? p.augFor(sk) : null; // ring augments ride on the minion's hits (combat.hit)
  if (p.mastery) { const M = p.mastery(sk); m.scale = (m.scale || 1) * (1 + Math.min(1, (M - 1) / 999) * 0.35); }
  if (corpse) {
    m.sprite = corpse.sprite; m.pal = shiftPalette(corpse.pal || {}, { hue: 120, sat: 0.5, light: 0.05 }); m.px = corpse.px; m.fly = corpse.fly;
    if (corpse.art) { m.art = corpse.art; m.swap = REVIVED; m.artH = corpse.artH; }
    m.name = 'Revived ' + (corpse.art ? ART_BY_ID[corpse.art].name : ARCH[corpse.arch] ? ARCH[corpse.arch].names[0] : 'Monster');
    m.maxHp = m.hp = Math.max(hp, corpse.maxHp * 0.6 / toughness(corpse.level || 1)); // monster life is sized to hero damage, not monster hits
    m.aura = '#40ff80';
  }
  // enforce per-skill maximum and a global cap
  const mine = w.creatures.filter((c) => c.summon && c.skillId === sk.id && !c.dead);
  const max = (sk.m.max || (sk.m.dur ? 99 : (sk.m.n || 1))) + (sk.m.grow ? Math.floor((L - 1) / 5) : 0);
  while (mine.length >= max) { const old = mine.shift(); old.dead = true; burst(old.x, old.y, 20, old.el || 'arcane', 8, 2); }
  if (key.startsWith('kn_')) { // the Lancer's Knight Order: at most 4 knights in the field
    const kn = w.creatures.filter((c) => c.summon && !c.dead && c.owner === p && c.summonKey && c.summonKey.startsWith('kn_'));
    while (kn.length >= 4) { const old = kn.shift(); old.dead = true; burst(old.x, old.y, 20, old.el || 'arcane', 8, 2); }
  }
  const all = w.creatures.filter((c) => c.summon && !c.dead && c.owner === p);
  if (all.length >= 40) all[0].dead = true;
  w.add(m);
  return m;
}
