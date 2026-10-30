// Runtime objects spawned by skills and monster attacks.
import { G } from '../state.js';
import { rand, chance, TAU, clamp, angleTo, angleDiff, dist, randi } from '../core/util.js';
import { isoX, isoY, HW, HH } from '../core/view.js';
import { sfx } from '../core/audio.js';
import { spawn, burst, addEffect, Ring, Bolt, Beam, Slash, Telegraph, elem, glowSprite, addLight, smoke, addDecal, sparkle, gibs } from '../gfx/vfx.js';
import { emitWhirlCyclone, captureWhirlGibs, drawWhirlCyclone } from '../gfx/barbarianwhirl.js';
import { drawShape, trail, explosionFx, hitSpark } from '../gfx/shapes.js';
import { bardProjInit, bardProjUpdate, bardProjHit, bardProjDraw, bardOrbitDraw, bardRainDraw, bardBeamDraw } from './bard.js';
import { drawLancerOrbitShield, drawThrownShield } from '../gfx/lancershields.js';
import { drawCosmicBeam } from '../gfx/cosmos.js';
import { drawFlyingRang, drawRang3D, rangSkin, groundHeading } from '../gfx/boomerang3d.js';
import { screenAngle } from '../gfx/vfx.js';
import { hit, aoe, chainHit, leechHeal } from './combat.js';

const roll = (d) => rand(d[0], d[1]);

/** Instant explosion that damages hostiles of src.team. */
export function explode(world, src, x, y, r, dmg, el, o = {}, fx = 'explosion') {
  explosionFx(x, y, r, el, fx, { sound: o.sound, shakeMul: src && src.team === 'enemy' ? 0.5 : 1 });
  return aoe(world, src, x, y, r, typeof dmg === 'number' ? dmg : roll(dmg), el, { ...o, team: src ? src.team : o.team });
}

/** Hostiles whose centre is near the segment (x0,y0)-(x1,y1). */
export function lineTargets(world, team, x0, y0, x1, y1, w) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, len = dist(x0, y0, x1, y1);
  const out = [];
  const dx = (x1 - x0) / (len || 1), dy = (y1 - y0) / (len || 1);
  for (const c of world.hostiles(team, mx, my, len / 2 + w + 1)) {
    const t = clamp((c.x - x0) * dx + (c.y - y0) * dy, 0, len);
    const px = x0 + dx * t, py = y0 + dy * t;
    if (dist(px, py, c.x, c.y) <= w + c.r) out.push(c);
  }
  return out;
}
export function coneTargets(world, team, x, y, ang, range, half) {
  return world.hostiles(team, x, y, range).filter((c) => Math.abs(angleDiff(ang, angleTo(x, y, c.x, c.y))) <= half || dist(x, y, c.x, c.y) < 0.6);
}

// ===================================================================== Projectile
/** Shield Throw: its finale blast deals this share of a strike's damage to everything in it (data/skills.js describe). */
export const BLAST_DMG = 0.75;
/** The Death Knight's own art: his frost skull for Death Coil, his 3D Runeblade for every sword he throws, rains or orbits. */
const dkFx = (src, fx) => (src && src.classId === 'death_knight' ? (fx === 'skull' ? 'dkskull' : fx === 'blade' ? 'dkblade' : fx) : fx);
/** n of his 3D Runeblades circling (x, y) at radius r tiles, z px up, edge first (whirls and cyclones). */
function dkBlades(ctx, x, y, r, t, n, z, E, k) {
  ctx.globalAlpha = k;
  for (let i = 0; i < n; i++) { const a = t * 11 + (i * TAU) / n; drawShape(ctx, 'dkblade', isoX(x + Math.cos(a) * r, y + Math.sin(a) * r), isoY(x + Math.cos(a) * r, y + Math.sin(a) * r) - z - i * 10, screenAngle(a + Math.PI / 2), 1, E, t); }
  ctx.globalAlpha = 1;
}
export class Projectile {
  constructor(o) {
    Object.assign(this, {
      speed: 9, range: 10, r: 0.3, fx: 'bolt', el: 'phys', z: 26, pierce: 0, bounce: 0, home: 0, split: false, ret: false,
      lob: false, exp: 0, chain: 0, spray: false, pull: false, size: 1, child: false, o: {}, t: 0, dead: false, ricochet: 0, blast: 0,
    }, o);
    this.E = elem(this.el);
    this.hitSet = new Set();
    this.vx = Math.cos(this.ang) * this.speed;
    this.vy = Math.sin(this.ang) * this.speed;
    this.life = this.dur || this.range / this.speed;
    this.turnAt = this.life * 0.5; // a boomerang turns for home halfway out
    this.sx = this.x; this.sy = this.y;
    this.team = this.src ? this.src.team : this.team;
    this.fx = dkFx(this.src, this.fx);
    if (this.lob) {
      const d = Math.max(0.5, Math.min(this.range, dist(this.x, this.y, this.tx, this.ty)));
      const a = angleTo(this.x, this.y, this.tx, this.ty);
      this.tx = this.x + Math.cos(a) * d; this.ty = this.y + Math.sin(a) * d;
      this.flight = 0.35 + d * 0.06;
      this.arcH = 40 + d * 8;
    }
    this.sprayT = 0;
    this.sprayN = 0;
    if (typeof this.fx === 'string' && this.fx.startsWith('n_')) bardProjInit(this); // a Bard note: staff trail + note behaviours
    if (this.fx === 'starmissile' || this.fx === 'stardust') { this.weave = rand(5, 9); this.seed = rand(TAU); } // the Astronomer's stars dart and weave
  }
  get depth() { return this.x + this.y + (this.ricochet ? 1.2 : 0.3); } // Shield Throw shows in front of the foe it strikes
  update(dt) {
    const w = this.world;
    this.t += dt;
    if (this.note) bardProjUpdate(this, dt);
    if (this.lob) {
      const k = Math.min(1, this.t / this.flight);
      this.x = this.sx + (this.tx - this.sx) * k; this.y = this.sy + (this.ty - this.sy) * k;
      this.z = 10 + this.arcH * 4 * k * (1 - k);
      if (!this.note) trail(this.fx, this.x, this.y, this.z, this.E, dt, this.size);
      if (k >= 1) { this.land(); return false; }
      return true;
    }
    // homing
    if (this.home) {
      if (!this.target || this.target.dead || this.t % 0.3 < dt) this.target = w.nearestHostile(this.team, this.x, this.y, 8);
      if (this.target) {
        const want = angleTo(this.x, this.y, this.target.x, this.target.y);
        const cur = Math.atan2(this.vy, this.vx);
        const turn = clamp(angleDiff(cur, want), -dt * 6 * this.home, dt * 6 * this.home);
        const sp = Math.hypot(this.vx, this.vy);
        this.vx = Math.cos(cur + turn) * sp; this.vy = Math.sin(cur + turn) * sp;
      }
    }
    if (this.ricochet && this.seek) { // Shield Throw: fly straight at the foe it ricochets to, wherever it walks
      if (this.seek.dead) this.seek = this.nextFoe(this.x, this.y);
      if (this.seek) {
        const a = angleTo(this.x, this.y, this.seek.x, this.seek.y), sp = Math.hypot(this.vx, this.vy);
        this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
      }
    }
    if (this.weave && !this.returning) {
      const turn = Math.cos(this.t * this.weave + this.seed) * 7 * dt * Math.max(0.25, 1 - this.t * 1.2), c = Math.cos(turn), s = Math.sin(turn), vx = this.vx;
      this.vx = vx * c - this.vy * s; this.vy = vx * s + this.vy * c;
    }
    if (this.wander) { // Charged Bolt / Spark: crackling, erratic flight
      const turn = rand(-1, 1) * this.wander * 9 * dt, c = Math.cos(turn), s = Math.sin(turn), vx = this.vx;
      this.vx = vx * c - this.vy * s; this.vy = vx * s + this.vy * c;
    }
    // boomerang return: home to the thrower's hand wherever he has moved, over walls, hitting all again on the way
    if (this.ret && !this.returning && (this.t > this.turnAt || this.t > 12)) this.turnBack();
    if (this.returning) {
      const s = this.src && !this.src.dead ? this.src : { x: this.sx, y: this.sy }, d = dist(this.x, this.y, s.x, s.y);
      if (d < 0.55 || this.t - this.retT > 8) { this.caught(s); return false; }
      const a = angleTo(this.x, this.y, s.x, s.y), sp = Math.min(this.speed * 1.1, d / dt);
      this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
    }
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    if (this.returning) { this.x = nx; this.y = ny; }
    else if (!w.map.isFloor(nx, ny)) {
      if (this.bounce > 0) {
        if (!w.map.isFloor(nx, this.y)) this.vx = -this.vx;
        if (!w.map.isFloor(this.x, ny)) this.vy = -this.vy;
        this.bounce--; this.hitSet.clear();
      } else if (this.ret) {
        this.turnBack();
      } else {
        this.impact();
        return false;
      }
    } else { this.x = nx; this.y = ny; }
    // frozen-orb style spray
    if (this.spray) {
      this.sprayT += dt;
      while (this.sprayT > 0.07) {
        this.sprayT -= 0.07;
        const a = this.t * 9 + this.sprayN++ * 2.4;
        w.addHazard(new Projectile({ world: w, src: this.src, team: this.team, x: this.x, y: this.y, ang: a, speed: 8, range: 3.5, fx: this.note ? 'n_s' : 'shard', el: this.el, dmg: [this.dmg[0] * 0.35, this.dmg[1] * 0.35], o: this.o, size: 0.7, child: true, tier: this.tier }));
      }
    }
    if (this.pull) {
      for (const c of w.hostiles(this.team, this.x, this.y, 2.6)) {
        if (c.static || c.rank === 'boss') continue;
        const a = angleTo(c.x, c.y, this.x, this.y);
        w.map.move(c, Math.cos(a) * 3 * dt, Math.sin(a) * 3 * dt, c.ghost);
      }
    }
    // collisions
    const hits = w.hostiles(this.team, this.x, this.y, this.r * this.size);
    for (const c of hits) {
      if (this.hitSet.has(c.id) || (c.fly && this.lowOnly)) continue;
      this.onHit(c);
      if (this.dead) return false;
    }
    if (!this.note) trail(this.fx, this.x, this.y, this.z, this.E, dt, this.size);
    if (this.light) addLight(this.x, this.y, 2.5, 0.8, 20, this.E.glow);
    if (this.t > this.life && !this.ret) { if (this.exp || this.blast) this.impact(); return false; }
    return !this.dead;
  }
  turnBack() { this.returning = true; this.retT = this.t; this.hitSet.clear(); }
  caught(s) { if (this.src && this.src.classId && !this.child) sparkle(s.x, s.y, 30, this.E.glow, 2, 0.2); }
  onHit(c) {
    const w = this.world;
    this.hitSet.add(c.id);
    const d = roll(this.dmg);
    hit(this.src, c, d, this.el, { ...this.o, ang: Math.atan2(this.vy, this.vx) });
    if (this.note) bardProjHit(this, c, d);
    if (this.heal && this.src && this.src.owner) leechHeal(this.src.owner, c, d, 0.2);
    if (this.ricochet) return this.ricochetFrom(c);
    if (this.chain > 0) chainHit(w, this.src, c.x, c.y, w.hostiles(this.team, c.x, c.y, 5).find((x) => x !== c), this.chain - 1, d * 0.7, this.el, this.E.glow);
    if (this.exp) explode(w, this.src, c.x, c.y, this.exp, this.dmg.map((v) => v * 0.6), this.el, { ...this.o, sound: true, exclude: new Set([c.id]) }, this.fx === 'rocket' || this.fx === 'bomb' ? 'explosion' : 'explosion');
    if (this.split && !this.child) {
      this.split = false;
      const base = Math.atan2(this.vy, this.vx);
      for (const off of [-0.45, 0, 0.45]) {
        w.addHazard(new Projectile({ world: w, src: this.src, team: this.team, x: c.x, y: c.y, ang: base + off, speed: this.speed, range: this.range * 0.6, fx: this.fx, el: this.el, dmg: this.dmg.map((v) => v * 0.55), o: this.o, size: this.size * 0.8, child: true, pierce: 0, ret: this.ret, skin: this.skin }));
      }
      this.hitSet.add(c.id);
    }
    if (this.returning) return; // on its way home it cuts through everything
    // bounce to a fresh enemy first, then pierce (Chainlink's bounces and pierces stack)
    if (this.bounce > 0) {
      const n = w.hostiles(this.team, c.x, c.y, 6).filter((x) => !this.hitSet.has(x.id))[0];
      if (n) {
        this.bounce--;
        const a = angleTo(this.x, this.y, n.x, n.y), sp = Math.hypot(this.vx, this.vy);
        this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
        this.life = Math.max(this.life, this.t + 1.2); this.turnAt = this.t + 0.8; this.bounced = true;
        return;
      }
    }
    if (this.pierce > 0) { this.pierce--; return; }
    if (this.ret) { if (this.bounced) this.turnBack(); return; } // boomerangs keep going; a spent ricochet flies home
    if (!this.exp) hitSpark(this.x, this.y, this.z, this.el);
    this.dead = true;
  }
  /** The nearest foe within 5 tiles of (x, y) it has not struck yet, in sight. */
  nextFoe(x, y) {
    const w = this.world;
    let best = null, bd = 1e9;
    for (const c of w.hostiles(this.team, x, y, 5)) {
      if (this.hitSet.has(c.id) || c.targetable === false) continue;
      const d = dist(x, y, c.x, c.y);
      if (d < bd && w.map.los(x, y, c.x, c.y)) { bd = d; best = c; }
    }
    return best;
  }
  /** Shield Throw struck c: on to the next foe, or after the last one (or with none in reach) the blast. */
  ricochetFrom(c) {
    this.struck = (this.struck || 0) + 1;
    sfx('block', 0.55); sparkle(c.x, c.y, 30, this.E.glow, 6, 0.25);
    addEffect(new Ring(c.x, c.y, 0.1, 0.7, 0.22, this.E.glow, 3));
    this.seek = this.struck < this.ricochet ? this.nextFoe(c.x, c.y) : null;
    if (this.seek) { this.life = this.t + 2; this.x = c.x; this.y = c.y; return; }
    this.x = c.x; this.y = c.y;
    this.impact();
  }
  impact() {
    if (this.blast) { // Shield Throw's finale: the shield bursts into holy light
      explode(this.world, this.src, this.x, this.y, this.blast, this.dmg.map((v) => v * BLAST_DMG), this.el, { ...this.o, sound: true }, 'holy');
      addEffect(new Ring(this.x, this.y, 0.2, this.blast * 1.15, 0.4, this.E.glow, 6, { fill: true }));
      sparkle(this.x, this.y, 26, '#ffffff', 18, 0.5);
      this.dead = true;
      return;
    }
    if (this.exp) explode(this.world, this.src, this.x, this.y, this.exp, this.dmg.map((v) => v * 0.7), this.el, { ...this.o, exclude: new Set(this.hitSet) });
    else burst(this.x, this.y, this.z, this.el, 6, 1.5, { size: 0.8 });
    this.dead = true;
  }
  land() {
    const w = this.world;
    if (this.exp) explode(w, this.src, this.x, this.y, this.exp, this.dmg, this.el, this.o, this.fx === 'rock' ? 'eruption' : 'explosion');
    else aoe(w, this.src, this.x, this.y, 0.8, roll(this.dmg), this.el, this.o);
    if (this.split && !this.child) {
      for (let i = 0; i < 4; i++) {
        const a = rand(TAU);
        w.addHazard(new Projectile({ world: w, src: this.src, team: this.team, x: this.x, y: this.y, lob: true, tx: this.x + Math.cos(a) * rand(1, 2.5), ty: this.y + Math.sin(a) * rand(1, 2.5), range: 3, fx: this.fx, el: this.el, dmg: this.dmg.map((v) => v * 0.5), exp: Math.max(0.8, this.exp * 0.6), o: this.o, size: 0.7, child: true }));
      }
    }
    if (this.onLand) this.onLand(this.x, this.y);
  }
  draw(ctx) {
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y) - this.z;
    if (this.lob) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(px, isoY(this.x, this.y), 5, 2.5, 0, 0, TAU); ctx.fill();
    }
    if (this.note) return bardProjDraw(ctx, this, px, py);
    if ((this.fx === 'rang' || this.fx === 'chakram') && drawFlyingRang(ctx, this)) return; // the 3D boomerang
    if (this.fx === 'pshield' && drawThrownShield(ctx, this)) return; // the Paladin's thrown 3D shield
    const a = screenAngle(Math.atan2(this.vy, this.vx));
    drawShape(ctx, this.fx === 'pshield' ? 'disc' : this.fx, px, py, a, this.size, this.E, this.t); // a disc while the shield model loads
    if (this.fx === 'chain' && this.src) {
      const sx = isoX(this.src.x, this.src.y), sy = isoY(this.src.x, this.src.y) - 26;
      ctx.strokeStyle = '#8a8a9a'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(px, py); ctx.stroke(); ctx.setLineDash([]);
    }
  }
}

// ===================================================================== Delayed blast (meteor / telegraphed)
export class Delayed {
  constructor(o) {
    Object.assign(this, { delay: 1, t: 0, r: 1.5, fx: 'meteor', z: 0, ground: true }, o);
    this.E = elem(this.el);
    this.team = this.src ? this.src.team : this.team;
    this.tele = this.team === 'enemy' || this.showRing !== false;
  }
  update(dt) {
    this.t += dt;
    if (this.t >= this.delay) {
      explode(this.world, this.src, this.x, this.y, this.r, this.dmg, this.el, this.o || {}, this.fx === 'meteor' ? 'meteor' : this.fx);
      if (this.fx === 'meteor' && this.o && this.o.burn) this.world.addHazard(new Area({ world: this.world, src: this.src, x: this.x, y: this.y, r: this.r * 0.7, dur: 3, tick: 0.5, dmg: this.dmg.map((v) => v * 0.15), el: this.el, fx: 'fire' }));
      return false;
    }
    if (this.fx === 'meteor' && chance(dt * 40)) {
      const k = this.t / this.delay;
      spawn({ type: 'glow', x: this.x - (1 - k) * 2.5, y: this.y - (1 - k) * 2.5, z: (1 - k) * 320 + 10, vz: 20, life: 0.4, size: 4 * this.r, size1: 0, color: this.E.glow, add: true });
    }
    return true;
  }
  draw(ctx) {
    const k = this.t / this.delay;
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y);
    const col = this.team === 'enemy' ? '#ff2a10' : this.E.glow;
    ctx.globalAlpha = 0.45 + 0.35 * k;
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(px, py, this.r * HW * 1.41, this.r * HH * 1.41, 0, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.15 + 0.2 * k; ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(px, py, this.r * HW * 1.41 * k, this.r * HH * 1.41 * k, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    if (this.fx === 'meteor') {
      const mx = isoX(this.x - (1 - k) * 2.5, this.y - (1 - k) * 2.5), my = isoY(this.x - (1 - k) * 2.5, this.y - (1 - k) * 2.5) - (1 - k) * 320;
      drawShape(ctx, 'meteor', mx, my, 0.8, 0.8 + this.r * 0.5, this.E, this.t);
    }
  }
}

// ===================================================================== Area (zones, cyclones, wall segments, blizzards)
export class Area {
  constructor(o) {
    Object.assign(this, { r: 1.5, dur: 4, tick: 0.5, t: 0, tickT: 0, fx: 'fire', follow: null, mode: 'zone', vx: 0, vy: 0, o: {}, ground: true }, o);
    this.E = elem(this.el);
    this.team = this.src ? this.src.team : this.team;
    this.hitSet = new Map();
    this.ground = this.mode !== 'cyclone';
    if (this.mode === 'cyclone') { this.wander = rand(TAU); this.fx = dkFx(this.src, this.fx); }
  }
  get depth() { return this.x + this.y; }
  update(dt) {
    const w = this.world;
    this.t += dt;
    if (this.t > this.dur) {
      if (this.blockTiles) for (const i of this.blockTiles) w.map.block[i] = 0;
      return false;
    }
    if (this.follow) { if (this.follow.dead) return false; this.x = this.follow.x; this.y = this.follow.y; }
    if (this.mode === 'cyclone') {
      this.wander += rand(-3, 3) * dt;
      const sp = this.speed || 2.6;
      const tx = this.vx * sp + Math.cos(this.wander) * 1.2, ty = this.vy * sp + Math.sin(this.wander) * 1.2;
      const nx = this.x + tx * dt, ny = this.y + ty * dt;
      if (w.map.isFloor(nx, ny)) { this.x = nx; this.y = ny; } else { this.vx = -this.vx; this.vy = -this.vy; }
      // pull small things in
      for (const c of w.hostiles(this.team, this.x, this.y, this.r * 1.5)) {
        if (c.static || c.rank === 'boss') continue;
        const a = angleTo(c.x, c.y, this.x, this.y);
        w.map.move(c, Math.cos(a) * 1.5 * dt, Math.sin(a) * 1.5 * dt, c.ghost);
      }
    }
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = this.tick;
      if (this.dmg && this.dmg[1] > 0) {
        for (const c of w.hostiles(this.team, this.x, this.y, this.r)) {
          hit(this.src, c, roll(this.dmg), this.el, { ...this.o, dot: this.mode === 'zone', silent: false });
          if (this.slow) c.status.slow = { t: 0.8, amt: 0.4 };
          if (this.pullIn && !c.static && c.rank !== 'boss') { const a = angleTo(c.x, c.y, this.x, this.y); c.kbx += Math.cos(a) * 3; c.kby += Math.sin(a) * 3; }
        }
      }
      if (this.heal) {
        for (const c of w.alliesOf(this.team, this.x, this.y, this.r)) c.heal ? c.heal(c.maxHp * 0.03, false) : (c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.03));
      }
      if (this.onTick) this.onTick(this);
    }
    this.visual(dt);
    return true;
  }
  visual(dt) {
    const E = this.E, r = this.r;
    const n = this.mode === 'cyclone' ? 3 : Math.min(6, r * r * 1.5);
    if (Math.random() < dt * 30 * n / 3) {
      const a = rand(TAU), d = Math.sqrt(Math.random()) * r;
      const x = this.x + Math.cos(a) * d, y = this.y + Math.sin(a) * d;
      switch (this.fx) {
        case 'fire': spawn({ type: 'glow', x, y, z: rand(0, 6), vz: rand(30, 70), life: rand(0.35, 0.7), size: rand(3, 6), size1: 0.5, color: chance(0.5) ? '#ff6010' : '#ffd040', add: true }); break;
        case 'frost': case 'ice': spawn({ type: 'shard', x, y, z: rand(0, 20), vz: rand(-5, 15), life: 0.8, size: rand(2, 4), color: '#d0f4ff', rot: rand(TAU) }); break;
        case 'poison': case 'plague': case 'spore': smoke(x, y, 2, chance(0.5) ? '#3a6a10' : '#5a8a20', 1, 9); break;
        case 'void': smoke(x, y, 4, '#2a0a40', 1, 8); if (chance(0.3)) spawn({ type: 'glow', x, y, z: 4, vz: 20, life: 0.6, size: 2, color: E.glow, add: true }); break;
        case 'slime': spawn({ type: 'glow', x, y, z: 0, vz: rand(5, 20), life: 0.8, size: 2, size1: 3.5, color: E.glow, add: true }); break;
        case 'storm': if (chance(0.25)) addEffect(new Bolt(x, y, 0, x + rand(-0.5, 0.5), y + rand(-0.5, 0.5), 30, E.glow, 0.12, 1.5)); break;
        case 'blood': spawn({ type: 'blood', x, y, z: 30, vz: 0, g: 260, life: 1, size: 2, color: '#8a0000' }); break;
        case 'thorn': case 'spike': spawn({ type: 'shard', x, y, z: 0, vz: 25, g: 80, life: 0.5, size: 3, color: this.fx === 'thorn' ? '#4a6a20' : '#9a9aa0', rot: rand(-0.3, 0.3) }); break;
        case 'note': spawn({ type: 'glow', x, y, z: rand(10, 30), vz: 25, life: 0.8, size: 2.5, size1: 0, color: E.glow, add: true }); break;
        default: spawn({ type: 'glow', x, y, z: rand(0, 10), vz: rand(10, 40), life: 0.6, size: 3, size1: 0, color: E.glow, add: true });
      }
    }
    if (this.mode === 'cyclone') {
      for (let i = 0; i < 2; i++) {
        const a = this.t * 14 + i * Math.PI, h = rand(0, 60);
        const rr = (0.2 + h / 60 * 0.7) * r;
        spawn({ type: this.fx === 'locust' || this.fx === 'crow' ? 'dot' : 'glow', x: this.x + Math.cos(a) * rr, y: this.y + Math.sin(a) * rr, z: h, vz: 30, life: 0.3, size: this.fx === 'crow' ? 3 : 2.2, size1: 0.6, color: this.fx === 'crow' ? '#140c18' : this.fx === 'locust' ? '#3a4010' : chance(0.5) ? E.glow : E.core, add: !(this.fx === 'crow' || this.fx === 'locust') });
      }
    }
    addLight(this.x, this.y, r * 1.6, 0.5, 20, this.E && this.E.glow);
  }
  draw(ctx) {
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y);
    const k = Math.min(1, this.t * 4) * Math.min(1, (this.dur - this.t) * 2);
    if (this.mode === 'cyclone') {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const h = i * 10, rr = (0.25 + i / 7 * 0.75) * this.r * HW * 1.2;
        ctx.globalAlpha = 0.18 * k;
        ctx.strokeStyle = i % 2 ? this.E.glow : this.E.core;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(px + Math.sin(this.t * 6 + i) * 3, py - h, rr, rr * 0.4, 0, this.t * 10 + i, this.t * 10 + i + 4.5); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      if (this.fx === 'dkblade') dkBlades(ctx, this.x, this.y, this.r * 0.6, this.t, 2, 24, this.E, k); // Runeblade Storm: his swords whirl in it
      return;
    }
    if (this.mode === 'wallseg') return; // particles only
    const rx = this.r * HW * 1.41, ry = this.r * HH * 1.41;
    ctx.globalAlpha = 0.22 * k;
    const col = this.fx === 'void' ? '#200030' : this.fx === 'poison' || this.fx === 'plague' ? '#3a7010' : this.E.glow;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(px, py, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.5 * k; ctx.strokeStyle = this.E.glow; ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]); ctx.lineDashOffset = -this.t * 20;
    ctx.beginPath(); ctx.ellipse(px, py, rx, ry, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
}

/** Build a wall of Area segments perpendicular to `ang` centred at (x,y). */
export function makeWall(world, src, x, y, ang, len, o) {
  const perp = ang + Math.PI / 2;
  const segs = Math.max(3, Math.round(len / 0.7));
  const out = [];
  for (let i = 0; i < segs; i++) {
    const t = (i / (segs - 1) - 0.5) * len;
    let sx = x + Math.cos(perp) * t, sy = y + Math.sin(perp) * t;
    if (o.ring) { const a = (i / segs) * TAU; sx = x + Math.cos(a) * o.ring; sy = y + Math.sin(a) * o.ring; }
    if (!world.map.isFloor(sx, sy)) continue;
    const a = new Area({ world, src, x: sx, y: sy, r: 0.6, dur: o.dur, tick: 0.4, dmg: o.dmg, el: o.el, fx: o.fx, mode: 'wallseg', slow: o.slow, o: o.o });
    a.ground = false;
    a.pillar = ['ice', 'bone', 'earth', 'spike', 'thorn', 'holy', 'storm'].includes(o.fx) ? o.fx : null;
    a.draw = drawWallSeg;
    if (o.block) {
      const tx = Math.floor(sx), ty = Math.floor(sy);
      const p = world.player;
      if (!(p && Math.floor(p.x) === tx && Math.floor(p.y) === ty) && world.map.walkableTile(tx, ty)) {
        const idx = ty * world.map.w + tx;
        world.map.block[idx] = 1; a.blockTiles = [idx];
      }
    }
    out.push(world.addHazard(a));
  }
  return out;
}
function drawWallSeg(ctx) {
  const px = isoX(this.x, this.y), py = isoY(this.x, this.y);
  const k = Math.min(1, this.t * 5) * Math.min(1, (this.dur - this.t) * 2);
  if (!this.pillar) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.7 * k;
    const h = 30 + Math.sin(this.t * 10 + this.x * 3) * 6;
    ctx.drawImage(glowSprite(this.E.glow), px - 14, py - h, 28, h + 6);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    return;
  }
  const h = 26 * k;
  const col = { ice: '#b8e8ff', bone: '#e8dcc0', earth: '#7a6a58', spike: '#9a9aa0', thorn: '#3a5a20', holy: '#ffe890', storm: '#a0c8ff' }[this.pillar];
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(px, py, 10, 5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = col; ctx.strokeStyle = '#101010'; ctx.lineWidth = 1;
  for (let i = -1; i <= 1; i++) {
    const hh = h * (i === 0 ? 1 : 0.7);
    ctx.beginPath(); ctx.moveTo(px + i * 6 - 5, py); ctx.lineTo(px + i * 6, py - hh); ctx.lineTo(px + i * 6 + 5, py); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (this.pillar === 'storm' || this.pillar === 'holy') {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6 * k;
    ctx.drawImage(glowSprite(this.E.glow), px - 12, py - h - 12, 24, 24);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
}

// ===================================================================== Orbit (swirling blades / spinning hammers)
export class Orbit {
  constructor(o) {
    Object.assign(this, { n: 3, radius: 1.6, dur: 5, t: 0, spiral: false, fx: 'blade', speed: 4, size: 1, o: {} }, o);
    this.fx = dkFx(this.src, this.fx);
    this.E = elem(this.el);
    this.team = this.src.team;
    this.cd = new Map();
    this.base = rand(TAU);
    this.pos = [];
  }
  get depth() { return this.src.x + this.src.y + 0.5; }
  update(dt) {
    if (this.src.dead) return false;
    this.t += dt;
    if (this.t > this.dur) return false;
    const w = this.world;
    const rad = this.rad = this.spiral ? Math.min(this.radius * 2.2, 0.4 + this.t * 2.1) : this.radius * Math.min(1, this.t * 4);
    this.pos.length = 0;
    for (let i = 0; i < this.n; i++) {
      const a = this.base + this.t * this.speed + (i * TAU) / this.n;
      const x = this.src.x + Math.cos(a) * rad, y = this.src.y + Math.sin(a) * rad;
      this.pos.push([x, y, a]);
      for (const c of w.hostiles(this.team, x, y, 0.42 * this.size)) {
        const k = c.id * 100 + i;
        if ((this.cd.get(c.id) || 0) > this.t) continue;
        this.cd.set(c.id, this.t + 0.33);
        hit(this.src, c, roll(this.dmg), this.el, { ...this.o, ang: a + Math.PI / 2 });
        void k;
      }
      if (chance(dt * 10)) trail(this.fx, x, y, 24, this.E, dt, this.size);
    }
    return true;
  }
  drawShield(ctx, index) {
    return drawLancerOrbitShield(ctx, this, this.pos[index]);
  }
  draw(ctx) {
    // Normal orbit weapons render as before. Each shield is primarily drawn
    // in the global depth-sorted pass via drawShield(ctx,index).
    if (this.shieldVariant) {
      for (let i=0;i<this.pos.length;i++) this.drawShield(ctx,i);
      return;
    }
    if (this.fx?.startsWith('n_')) bardOrbitDraw(ctx, this);
    if (this.fx === 'rang' || this.fx === 'chakram') { // 3D boomerangs skimming round him, near flat
      const sk = this.skinObj || (this.skinObj = rangSkin(this.skin, this.fx, this.el));
      for (const [x, y, a] of this.pos) drawRang3D(ctx, isoX(x, y), isoY(x, y) - 26, { skin: sk, size: this.size, spin: this.t * 15, head: groundHeading(-Math.sin(a), Math.cos(a)), bank: 0.3, lift: 26 });
      return;
    }
    const each = this.fx === 'planet' || this.fx === 'zodiac' || this.fx === 'accretion'; // the Astronomer's orbiters differ one by one
    this.pos.forEach(([x, y, a], i) => drawShape(ctx, this.fx, isoX(x, y), isoY(x, y) - 24, screenAngle(a + Math.PI / 2), this.size, this.E, this.t, each ? { i } : this.o));
  }
}

// ===================================================================== Whirlwind (caster spins toward a point)
export class Whirl {
  constructor(o) {
    Object.assign(this, { dur: 2, t: 0, r: 1.3, speed: 4.2, tick: 0.22, tickT: 0, o: {} }, o);
    this.E = elem(this.el);
    this.fx = dkFx(this.src, this.fx);
    this.team = this.src.team;
    this.src.channel = this;
    this.slashT = 0;
    this.lightningT = 0.9;
    this.tornadoT = 1.4;
    this.cycloneT = 0;
    this.gibT = 0;
  }
  get depth() { return this.src.x + this.src.y + 0.1; }
  update(dt) {
    const s = this.src;
    if (s.dead || s.channel !== this) return false;
    this.t += dt;
    if (this.t > this.dur) { s.channel = null; return false; }
    // The Barbarian's full 100 Rage lasts ten seconds while spinning.
    if (this.rage) {
      s.rage = Math.max(0, (s.rage || 0) - 10 * dt);
      if (s.char) s.char.rage = s.rage;
      if (s.rage <= 0 && !s.isRemotePlayer) { s.channel = null; return false; }
    }
    // While spinning, honor the normal autopilot waypoint / manual movement vector.
    // Never drive straight at an old target through a room's walls.
    if (s.isPlayer && s.aim) { this.tx = s.aim[0]; this.ty = s.aim[1]; }
    const [vx, vy] = s.moveVec || [0, 0], moving = Math.hypot(vx, vy);
    if (this.rage && moving > 0.01) {
      s.moving = this.world.map.move(s, vx / moving * this.speed * s.speedMul() * dt,
        vy / moving * this.speed * s.speedMul() * dt, s.ghost);
      if (s.moving) s.face(Math.atan2(vy, vx));
    } else if (this.rage && s.moveTarget && !s.whirlAuto) {
      s.walkTo(s.moveTarget[0], s.moveTarget[1], dt);
    } else {
      const d = dist(s.x, s.y, this.tx, this.ty);
      const closeEnemy = this.world.hostiles(this.team, s.x, s.y, 7).some((c) =>
        this.world.map.los(s.x, s.y, c.x, c.y));
      if (d > 0.3 && (!s.whirlAuto || closeEnemy) &&
        this.world.map.losWide(s.x, s.y, this.tx, this.ty)) s.moveToward(this.tx, this.ty, dt, this.speed);
      else s.moving = false;
    }
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = this.tick;
      for (const c of this.world.hostiles(this.team, s.x, s.y, this.r)) {
        hit(s, c, roll(this.dmg), this.el, { ...this.o, ang: angleTo(s.x, s.y, c.x, c.y) });
        if (this.rage && !c.dead && this.gibT <= 0 && G.settings.gore > 0 &&
          !['spark', 'ecto', 'rock'].includes(c.goreType)) {
          this.gibT = 0.45;
          const set = c.goreType === 'bone' ? ['bone'] : c.demon ? ['demon'] : ['flesh', 'limb'];
          gibs(c.x, c.y, 15, G.touch ? 1 : 3, '#9e2022', '#ddd5c5', 0.72, set, { loose: true });   // no skulls off the living
        }
        // Pull normal enemies toward the eye of the storm, but never through a wall.
        if (this.pull && !c.dead && c.rank !== 'boss') {
          const d = dist(c.x, c.y, s.x, s.y);
          if (d > 0.45) {
            const step = Math.min(d - 0.45, this.pull * dt * 5);
            const nx = c.x + (s.x - c.x) / d * step, ny = c.y + (s.y - c.y) / d * step;
            if (this.world.map.walkable(nx, ny)) { c.x = nx; c.y = ny; }
          }
        }
      }
    }
    if (this.rage) {
      this.gibT -= dt;
      this.cycloneT -= dt;
      if (this.cycloneT <= 0) {
        this.cycloneT += G.touch ? 0.11 : 0.075;
        emitWhirlCyclone(s, this.t, this.r);
      }
      captureWhirlGibs(s, this.r);
    }
    this.slashT -= dt;
    if (this.slashT <= 0) {
      this.slashT = 0.12;
      addEffect(new Slash(s.x, s.y, this.t * 20, 4, this.r * 1.05, 0.2, this.E.glow, { z: 20, width: this.rage ? 9 : 6 }));
      if (this.rage) addEffect(new Slash(s.x, s.y, this.t * 20 + Math.PI, 4, this.r * 0.85, 0.22, '#c8e0ff', { z: 23, width: 7 }));
      if (this.fx === 'fire') burst(s.x, s.y, 20, 'fire', 4, 3);
      sfx('swing', 0.5);
    }
    if (this.rage && this.lightning) {
      this.lightningT -= dt;
      if (this.lightningT <= 0) {
        this.lightningT += 0.9;
        aoe(this.world, s, s.x, s.y, this.r * 1.35, roll(this.dmg) * 0.6, 'light', this.o);
        sparkle(s.x, s.y, 32, '#9fdcff', 16, 0.3);
      }
    }
    if (this.rage && this.tornadoes) {
      this.tornadoT -= dt;
      if (this.tornadoT <= 0) {
        this.tornadoT += 1.4;
        for (let i = 0; i < Math.min(3, this.tornadoes); i++) {
          const a = this.t * 5 + i * TAU / Math.min(3, this.tornadoes);
          this.world.addHazard(new Area({ mode: 'cyclone', world: this.world, src: s,
            x: s.x + Math.cos(a) * 0.7, y: s.y + Math.sin(a) * 0.7,
            vx: Math.cos(a), vy: Math.sin(a), r: 0.55, dur: 2.3,
            tick: 0.3, dmg: this.dmg.map(v => v * 0.32), el: 'phys', fx: 'wind',
            o: this.o, speed: 2.2 }));
        }
      }
    }
    return true;
  }
  draw(ctx) {
    if (this.rage) drawWhirlCyclone(ctx, this.src, this.t, this.r);
    if (this.fx === 'dkblade') dkBlades(ctx, this.src.x, this.src.y, 0.95, this.t, 2, 30, this.E, 1); // his swords spin round him
  }
}

// ===================================================================== Leap
export class Leap {
  constructor(o) {
    Object.assign(this, { t: 0, dur: 0.48, r: 1.6, o: {} }, o);
    this.E = elem(this.el);
    this.src.channel = this;
    this.sx = this.src.x; this.sy = this.src.y;
    const d = dist(this.sx, this.sy, this.tx, this.ty);
    // clamp landing to floor along the path
    const a = angleTo(this.sx, this.sy, this.tx, this.ty);
    let best = 0;
    for (let s = 0; s <= d; s += 0.2) if (this.world.map.walkable(this.sx + Math.cos(a) * s, this.sy + Math.sin(a) * s)) best = s;
    this.tx = this.sx + Math.cos(a) * best; this.ty = this.sy + Math.sin(a) * best;
    this.src.face(a);
    this.src.invuln = this.dur;
  }
  update(dt) {
    const s = this.src;
    if (s.dead) return false;
    this.t += dt;
    const k = (this.k = Math.min(1, this.t / this.dur));
    s.x = this.sx + (this.tx - this.sx) * k; s.y = this.sy + (this.ty - this.sy) * k;
    s.z = 4 * (this.fx === 'dragon' || this.fx === 'meteor' ? 120 : 70) * k * (1 - k);
    if (!this.lance && chance(dt * 30)) trail(this.fx === 'dragon' || this.fx === 'meteor' ? 'fireball' : 'bolt', s.x, s.y, s.z + 20, this.E, dt);
    if (k >= 1) {
      s.z = 0; s.channel = null; this.done = true;
      explode(this.world, s, s.x, s.y, this.r, this.dmg, this.el, { ...this.o, knock: this.o.knock || 0.6 }, this.fx === 'meteor' || this.fx === 'dragon' ? 'meteor' : this.fx === 'holy' ? 'holy' : 'eruption');
      sfx('thud');
      addDecal(s.x, s.y, 'rgba(10,6,4,0.6)', this.r * 0.5, 'scorch', 0.7);
      if (this.nova) this.world.addHazard(new NovaWave({ world: this.world, src: s, x: s.x, y: s.y, r: this.r * 1.6, dmg: this.dmg.map((v) => v * 0.5), el: this.el, fx: this.fx }));
      return false;
    }
    return true;
  }
  draw() {}
}

// ===================================================================== Dash
export class Dash {
  constructor(o) {
    Object.assign(this, { t: 0, speed: 16, w: 0.9, n: 1, o: {} }, o);
    this.E = elem(this.el);
    this.src.channel = this;
    this.hitSet = new Set();
    this.start(this.ang, this.len);
  }
  start(ang, len) {
    this.ang = ang; this.left = len; this.src.face(ang);
    this.src.invuln = Math.max(this.src.invuln || 0, len / this.speed + 0.05);
  }
  update(dt) {
    const s = this.src;
    if (s.dead) return false;
    this.t += dt;
    const step = Math.min(this.left, this.speed * dt);
    const moved = this.world.map.move(s, Math.cos(this.ang) * step, Math.sin(this.ang) * step, false);
    this.left -= step;
    s.moving = true;
    spawn({ type: 'glow', x: s.x, y: s.y, z: 24, life: 0.3, size: 7, size1: 0, color: this.E.glow, add: true });
    if (this.fx === 'fire') burst(s.x, s.y, 10, 'fire', 2, 1);
    for (const c of this.world.hostiles(s.team, s.x, s.y, this.w)) {
      if (this.hitSet.has(c.id)) continue;
      this.hitSet.add(c.id);
      hit(s, c, roll(this.dmg), this.el, { ...this.o, ang: this.ang });
      addEffect(new Slash(c.x, c.y, this.ang, 1.4, 0.8, 0.18, this.E.glow, { width: 7 }));
    }
    if (this.left <= 0.01 || !moved) {
      if (this.exp) explode(this.world, s, s.x, s.y, 1.5, this.dmg, this.el, this.o, 'explosion');
      if (--this.n > 0) {
        const t = this.world.nearestHostile(s.team, s.x, s.y, 6);
        const a = t ? angleTo(s.x, s.y, t.x, t.y) : this.ang + rand(-2, 2);
        this.hitSet.clear();
        this.start(a, t ? Math.min(6, dist(s.x, s.y, t.x, t.y) + 1.2) : 3);
        return true;
      }
      s.channel = null;
      return false;
    }
    return true;
  }
  draw() {}
}

// ===================================================================== Nova wave (expanding ring that damages once)
export class NovaWave {
  constructor(o) {
    Object.assign(this, { t: 0, dur: 0.38, r: 3, o: {}, fx: 'nova', ground: true, arcN: 0 }, o);
    this.E = elem(this.el);
    this.team = this.src ? this.src.team : this.team;
    this.hitSet = new Set();
    addEffect(new Ring(this.x, this.y, 0.2, this.r, this.dur + 0.1, this.E.glow, 6, { fill: true }));
    addEffect(new Ring(this.x, this.y, 0.1, this.r * 0.9, this.dur + 0.2, this.E.core, 2));
    // radial particles flavoured by fx
    const n = Math.min(160, Math.round(14 + this.r * 8));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, sp = this.r / this.dur * rand(0.8, 1.05);
      const type = ['frost', 'shard', 'spike', 'earth', 'bone', 'thorn'].includes(this.fx) ? 'shard' : this.fx === 'crow' ? 'dot' : 'glow';
      spawn({ type, x: this.x, y: this.y, z: 12, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: this.dur * 1.05, size: type === 'shard' ? 3 : 3.5, size1: 1, color: this.fx === 'crow' ? '#140c18' : this.fx === 'bone' ? '#e8dcc0' : i % 2 ? this.E.glow : this.E.core, add: type === 'glow', rot: a });
    }
    if (this.fx === 'lightning' || this.fx === 'storm') for (let i = 0; i < 6; i++) { const a = rand(TAU); addEffect(new Bolt(this.x, this.y, 20, this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r, 10, this.E.glow, 0.25, 2)); }
    sfx(this.E.sfx);
    addLight(this.x, this.y, this.r * 1.5, 1.2, 20, this.E && this.E.glow);
  }
  update(dt) {
    this.t += dt;
    const rr = this.r * Math.min(1, this.t / this.dur);
    for (const c of this.world.hostiles(this.team, this.x, this.y, rr)) {
      if (this.hitSet.has(c.id)) continue;
      this.hitSet.add(c.id);
      hit(this.src, c, roll(this.dmg), this.el, { ...this.o, ang: angleTo(this.x, this.y, c.x, c.y), aoe: true });
      if (this.staticPct && !c.dead) {
        // Static Field: a share of current life, never below a floor (bosses lose less and keep more)
        const boss = c.rank === 'boss', cut = Math.min(c.hp * this.staticPct / 100 * (boss ? 0.4 : 1), c.hp - c.maxHp * (boss ? 0.5 : 0.25));
        if (cut > 0) hit(this.src, c, cut, this.el, { dot: true, crit: false, noArc: true, sk: this.o.sk });
      }
      if (this.arcs && this.arcN < 4 && !c.dead) {
        // Lightning Nova: the first few struck throw off arcs
        this.arcN++;
        const next = this.world.hostiles(this.team, c.x, c.y, 4).find((x) => x !== c && !this.hitSet.has(x.id));
        if (next) chainHit(this.world, this.src, c.x, c.y, next, this.arcs - 1, roll(this.dmg) * 0.25, this.el, this.E.glow, { sk: this.o.sk });
      }
      if (this.pullIn && !c.static) { const a = angleTo(c.x, c.y, this.x, this.y); c.kbx += Math.cos(a) * 8; c.kby += Math.sin(a) * 8; }
    }
    if (this.heal && this.t < dt * 1.5) for (const c of this.world.alliesOf(this.team, this.x, this.y, this.r)) c.heal ? c.heal(c.maxHp * 0.06) : (c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.06));
    return this.t < this.dur;
  }
  draw() {}
}

// ===================================================================== Channelled / instant beams and breath cones
export class BeamCh {
  constructor(o) {
    Object.assign(this, { t: 0, dur: 0, len: 8, width: 0.55, tick: 0.13, tickT: 0, cone: false, fx: 'laser', o: {}, n: 1 }, o);
    this.E = elem(this.el);
    this.team = this.src.team;
    if (this.dur > 0) this.src.channel = this;
    this.ends = [];
    this.instant = !(this.dur > 0);
    if (this.instant) { this.dur = 0.3; this.fire(true); }
    sfx(this.cone ? 'fire' : this.E.sfx);
  }
  get depth() { return this.src.x + this.src.y + 0.6; }
  aimAngle() {
    const s = this.src;
    if (s.isPlayer && s.aim && !this.instant) return angleTo(s.x, s.y, s.aim[0], s.aim[1]);
    return this.ang;
  }
  fire(first) {
    const s = this.src, w = this.world;
    const base = this.aimAngle();
    this.ang = base;
    this.ends.length = 0;
    const beams = this.n || 1;
    for (let b = 0; b < beams; b++) {
      const a = base + (beams > 1 ? (b - (beams - 1) / 2) * 0.35 : 0);
      if (this.cone) {
        const targets = coneTargets(w, this.team, s.x, s.y, a, this.len, 0.5);
        for (const c of targets) hit(s, c, roll(this.dmg) * (this.instant ? 1 : 1), this.el, { ...this.o, dot: !this.instant && !first, ang: a });
        this.ends.push([s.x + Math.cos(a) * this.len, s.y + Math.sin(a) * this.len, a]);
      } else {
        const L = w.map.rayLength(s.x, s.y, a, this.len);
        const ex = s.x + Math.cos(a) * L, ey = s.y + Math.sin(a) * L;
        for (const c of lineTargets(w, this.team, s.x, s.y, ex, ey, this.width)) {
          hit(s, c, roll(this.dmg), this.el, { ...this.o, dot: !this.instant && !first, ang: a });
          if (this.o.leech) leechHeal(s, c, roll(this.dmg), 0.05);
        }
        this.ends.push([ex, ey, a]);
        if (this.instant) {
          if (this.fx === 'lightning') addEffect(new Bolt(s.x, s.y, 26, ex, ey, 20, this.E.glow, 0.3, 3));
          else addEffect(new Beam(s.x, s.y, ex, ey, this.E.glow, this.fx === 'laser' ? 9 : 6, 0.32, { core: this.E.core }));
          burst(ex, ey, 20, this.el, 8, 2);
        }
      }
    }
  }
  update(dt) {
    const s = this.src;
    if (s.dead || (!this.instant && s.channel !== this)) return false;
    this.t += dt;
    if (this.t > this.dur) { if (s.channel === this) s.channel = null; return false; }
    if (!this.instant) {
      this.tickT -= dt;
      if (this.tickT <= 0) { this.tickT = this.tick; this.fire(false); }
      else { const a = this.aimAngle(); this.ang = a; }
      if (s.face) s.face(this.ang);
      // visuals
      for (const [ex, ey, a] of this.ends) {
        if (this.cone) {
          for (let i = 0; i < 3; i++) {
            const aa = a + rand(-0.45, 0.45), sp = rand(5, 9);
            spawn({ type: this.el === 'poison' || this.el === 'acid' ? 'dot' : 'glow', x: s.x + Math.cos(a) * 0.4, y: s.y + Math.sin(a) * 0.4, z: 22, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, drag: 1.5, life: this.len / sp * 0.9, size: rand(3, 6), size1: 9, color: chance(0.5) ? this.E.glow : this.E.core, add: true });
          }
        } else {
          spawn({ type: 'glow', x: ex, y: ey, z: 16, vz: rand(10, 40), life: 0.3, size: 5, size1: 0, color: this.E.glow, add: true });
          addLight(ex, ey, 2.5, 1);
        }
      }
    }
    return true;
  }
  draw(ctx) {
    if (this.instant || this.cone) return;
    const s = this.src;
    for (const [ex, ey] of this.ends) {
      const ax = isoX(s.x, s.y), ay = isoY(s.x, s.y) - 26;
      const bx = isoX(ex, ey), by = isoY(ex, ey) - 16;
      if (this.fx?.startsWith('n_')) { bardBeamDraw(ctx, this, ax, ay, bx, by); continue; }
      if (drawCosmicBeam(ctx, this.fx, ax, ay, bx, by, this.t)) continue;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      if (this.fx === 'lightning' || this.fx === 'storm') {
        const n = 10;
        for (let pass = 0; pass < 2; pass++) {
          ctx.strokeStyle = pass ? '#fff' : this.E.glow; ctx.lineWidth = pass ? 1.5 : 4;
          ctx.beginPath(); ctx.moveTo(ax, ay);
          for (let i = 1; i < n; i++) ctx.lineTo(ax + (bx - ax) * i / n + rand(-8, 8), ay + (by - ay) * i / n + rand(-8, 8));
          ctx.lineTo(bx, by); ctx.stroke();
        }
      } else {
        const wv = (this.fx === 'laser' ? 10 : 7) * (1 + Math.sin(this.t * 50) * 0.15);
        ctx.globalAlpha = 0.35; ctx.strokeStyle = this.E.glow; ctx.lineWidth = wv * 2.4;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.globalAlpha = 0.9; ctx.lineWidth = wv;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.strokeStyle = this.fx === 'drain' ? '#ff6060' : this.E.core; ctx.lineWidth = wv * 0.35;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}

// ===================================================================== Trap
export class Trap {
  constructor(o) {
    Object.assign(this, { t: 0, arm: 0.5, life: 25, trig: 1.2, r: 1.5, fx: 'spike', o: {}, ground: true }, o);
    this.E = elem(this.el);
    this.team = this.src.team;
  }
  update(dt) {
    this.t += dt;
    if (this.t > this.life) return false;
    if (this.t < this.arm) return true;
    const w = this.world;
    const t = w.hostiles(this.team, this.x, this.y, this.trig)[0];
    if (!t) return true;
    if (this.pull) for (const c of w.hostiles(this.team, this.x, this.y, 3.5)) { if (!c.static) { const a = angleTo(c.x, c.y, this.x, this.y); c.kbx += Math.cos(a) * 7; c.kby += Math.sin(a) * 7; } }
    switch (this.fx) {
      case 'spike': case 'bear':
        hit(this.src, t, roll(this.dmg) * 1.3, this.el, { ...this.o, bleed: true, stun: this.fx === 'bear' });
        for (let i = 0; i < 6; i++) spawn({ type: 'shard', x: t.x + rand(-0.3, 0.3), y: t.y + rand(-0.3, 0.3), z: 0, vz: 90, g: 300, life: 0.4, size: 3, color: '#b0b0b8', rot: rand(-0.4, 0.4) });
        sfx('hit');
        break;
      case 'frost':
        this.world.addHazard(new NovaWave({ world: w, src: this.src, x: this.x, y: this.y, r: 2, dmg: this.dmg, el: 'cold', fx: 'frost', o: { ...this.o, freeze: true } }));
        break;
      case 'fire':
        explode(w, this.src, this.x, this.y, this.r, this.dmg, this.el, { ...this.o, burn: true });
        w.addHazard(new Area({ world: w, src: this.src, x: this.x, y: this.y, r: 1.2, dur: 3, tick: 0.5, dmg: this.dmg.map((v) => v * 0.2), el: 'fire', fx: 'fire' }));
        break;
      case 'rune':
        explode(w, this.src, this.x, this.y, this.r, this.dmg, this.el, this.o, 'holy');
        break;
      default:
        explode(w, this.src, this.x, this.y, this.r, this.dmg, this.el, this.o, 'explosion');
    }
    return false;
  }
  draw(ctx) {
    const px = isoX(this.x, this.y), py = isoY(this.x, this.y);
    const armed = this.t >= this.arm;
    ctx.globalAlpha = armed ? 1 : 0.5;
    switch (this.fx) {
      case 'mine': case 'bomb':
        ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.ellipse(px, py, 7, 3.5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = Math.floor(this.t * 4) % 2 ? '#ff2020' : '#400000'; ctx.fillRect(px - 1.5, py - 3, 3, 2);
        break;
      case 'rune': case 'frost': case 'fire':
        ctx.strokeStyle = this.E.glow; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(px, py, 12, 6, 0, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px - 8, py); ctx.lineTo(px + 8, py); ctx.moveTo(px, py - 4); ctx.lineTo(px, py + 4); ctx.stroke();
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4 + Math.sin(this.t * 5) * 0.2;
        ctx.drawImage(glowSprite(this.E.glow), px - 14, py - 8, 28, 16);
        ctx.globalCompositeOperation = 'source-over';
        break;
      default:
        ctx.fillStyle = '#5a5a60'; ctx.beginPath(); ctx.ellipse(px, py, 10, 5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#c0c0c8';
        for (let i = -2; i <= 2; i++) ctx.fillRect(px + i * 3.5 - 0.5, py - 3 - (i % 2 ? 1 : 0), 1.5, 3);
    }
    ctx.globalAlpha = 1;
  }
}

// ===================================================================== Rain (many falling projectiles over an area)
export class Rain {
  constructor(o) {
    Object.assign(this, { t: 0, dur: 1.2, n: 12, r: 2, fx: 'arrow', o: {}, impactR: 0.8 }, o);
    this.fx = dkFx(this.src, this.fx);
    this.E = elem(this.el);
    this.team = this.src.team;
    this.spawned = 0;
    this.fallers = [];
    if (this.fx === 'meteor' || this.fx === 'rocket' || this.fx === 'fireball') this.impactR = 1.1;
  }
  get depth() { return this.x + this.y + 1; }
  update(dt) {
    this.t += dt;
    const want = Math.min(this.n, Math.floor((this.t / this.dur) * this.n) + 1);
    while (this.spawned < want) {
      this.spawned++;
      const a = rand(TAU), d = Math.sqrt(Math.random()) * this.r;
      const x = this.x + Math.cos(a) * d, y = this.y + Math.sin(a) * d;
      if (this.world.map.isFloor(x, y)) this.fallers.push({ x, y, z: 240 + rand(0, 60), vz: -(500 + rand(0, 200)), ox: rand(-1.4, -0.8) });
    }
    for (let i = this.fallers.length - 1; i >= 0; i--) {
      const f = this.fallers[i];
      f.z += f.vz * dt;
      if (f.z <= 0) {
        this.fallers.splice(i, 1);
        if (this.impactR >= 1) explode(this.world, this.src, f.x, f.y, this.impactR, this.dmg, this.el, { ...this.o, sound: chance(0.4) }, this.fx === 'meteor' ? 'meteor' : 'explosion');
        else {
          aoe(this.world, this.src, f.x, f.y, this.impactR, roll(this.dmg), this.el, this.o);
          burst(f.x, f.y, 2, this.el, 5, 1.5, { size: 0.8 });
          if (chance(0.3)) sfx(this.E.sfx, 0.4);
        }
      }
    }
    return this.spawned < this.n || this.fallers.length > 0;
  }
  draw(ctx) {
    for (const f of this.fallers) {
      const k = f.z / 300;
      const x = f.x + f.ox * k * 0.5, y = f.y + f.ox * k * 0.5;
      if (this.fx?.startsWith('n_')) bardRainDraw(ctx, this, f, x, y);
      drawShape(ctx, this.fx === 'ice' ? 'shard' : this.fx === 'acid' ? 'blob' : this.fx, isoX(x, y), isoY(x, y) - f.z, Math.PI / 2 + 0.25, this.fx === 'meteor' ? 0.9 : 1, this.E, this.t, this.o);
    }
  }
}

// ===================================================================== Fissure (line of eruptions)
export class Fissure {
  constructor(o) {
    Object.assign(this, { t: 0, len: 7, step: 0.65, interval: 0.045, w: 0.85, fx: 'earth', o: {}, ground: true }, o);
    this.E = elem(this.el);
    this.team = this.src.team;
    this.hitSet = new Set();
    this.d = 0.6;
    this.acc = 0;
  }
  update(dt) {
    this.t += dt;
    this.acc += dt;
    while (this.acc >= this.interval) {
      this.acc -= this.interval;
      const x = this.x + Math.cos(this.ang) * this.d, y = this.y + Math.sin(this.ang) * this.d;
      if (!this.world.map.isFloor(x, y) || this.d > this.len) return false;
      for (const c of this.world.hostiles(this.team, x, y, this.w)) {
        if (this.hitSet.has(c.id)) continue;
        this.hitSet.add(c.id);
        hit(this.src, c, roll(this.dmg), this.el, { ...this.o, ang: this.ang });
      }
      this.erupt(x, y);
      this.d += this.step;
    }
    return true;
  }
  erupt(x, y) {
    const E = this.E;
    const shardCol = { earth: '#7a6a58', ice: '#c8f0ff', bone: '#e8dcc0', thorn: '#4a6a20', slime: E.glow, shadow: '#3a1050', holy: '#fff0a0' }[this.fx];
    if (shardCol) {
      for (let i = 0; i < 4; i++) spawn({ type: 'shard', x: x + rand(-0.25, 0.25), y: y + rand(-0.25, 0.25), z: 0, vz: rand(80, 140), g: 420, life: 0.5, size: rand(3, 5), color: shardCol, rot: rand(-0.3, 0.3) });
    }
    if (this.fx === 'fire' || this.fx === 'explosion') { burst(x, y, 4, 'fire', 8, 2, { up: 2 }); if (this.fx === 'explosion') explosionFx(x, y, 0.9, this.el, 'explosion', { sound: chance(0.3), shakeMul: 0.3 }); }
    else if (this.fx === 'sonic' || this.fx === 'wind' || this.fx === 'shock') addEffect(new Ring(x, y, 0.1, 0.8, 0.25, E.glow, 3));
    else burst(x, y, 4, this.el, 4, 1.5, { size: 0.8 });
    if (this.fx === 'holy') addEffect(new Ring(x, y, 0.1, 0.7, 0.3, E.glow, 3, { fill: true }));
    addDecal(x, y, 'rgba(12,8,6,0.5)', 0.35, 'scorch', 0.6);
    if (chance(0.3)) sfx(this.fx === 'earth' ? 'thud' : E.sfx, 0.4);
  }
  draw() {}
}

// ===================================================================== Buff aura visual / pulse
export class AuraFx {
  constructor(o) { Object.assign(this, { t: 0, ground: true }, o); this.E = elem(this.el); }
  update(dt) {
    this.t += dt;
    const b = this.buff;
    return !(this.src.dead || !b || b.t <= 0);
  }
  draw(ctx) {
    const s = this.src;
    const px = isoX(s.x, s.y), py = isoY(s.x, s.y);
    const r = this.transform ? 26 : 20;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = this.E.glow; ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]); ctx.lineDashOffset = this.t * 30;
    ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.5, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.25 + Math.sin(this.t * 4) * 0.1;
    ctx.drawImage(glowSprite(this.E.glow), px - r * 1.2, py - r * 0.6, r * 2.4, r * 1.2);
    ctx.restore();
  }
}

export { roll, randi, sparkle, Telegraph };
