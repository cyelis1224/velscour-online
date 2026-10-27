// Demon Lord Velscour's last stand (the throne arena, world/dungeon.js generateThrone): five phases, 5-10 minutes.
//   0  He waits seated on his throne (the Castle's throne dais in his colours, gfx/velscourthrone.js) and leaps down.
//   1  The Lord Upon the Throne (100-80%): Hellbrand cleaves, Chains of Velscour drag the hero in, Throne Guard.
//   2  The Four Seals (at 80%, he can't be hurt): four seal crystals, each held by a Seal Warden, while flame walls
//      sweep the floor. Seals left after two minutes make him 15% stronger each for the rest of the fight.
//   3  Crown of Hellfire (80-50%): lava creeps in from the arena's edge and ebbs; meteor spirals, Doom Brand (a lava
//      pool where the hero stood), Mirror of Sin (copies of him), Legion of the Pit (demons from a hellgate; also phase 5).
//   4  Into the Abyss (at 50%, 75 s): the dark falls; three Heart Shards drift round the arena, each broken tears 5% off
//      his life; shades pour in; away from the two Soul Lanterns the dark itself hurts.
//   5  True Form (to 0%): bigger and faster; every 25 s APOCALYPSE hits the whole arena but three glowing circles.
//      At 10% he chains himself to the four obelisks and can't be hurt until they break.
// Pacing: life gates (damage can't carry past a phase threshold) and a damage cap (at most PACE of his life a second,
// banked up to 3 s) keep even an overgeared hero in the fight for about five minutes; at ENRAGE_T (15 min) he executes.
// Measured (tools/tests/velscour_real.js, depth-500 gear, no god mode): paladin/wizard 6-8 min, ranger 8-12, most win.
// Auto-play reads the hazards: danger() (lava, flame walls), safeAt() (APOCALYPSE's circles), autoGoal() (lanterns).
// world.practice ("final boss" in the skull's message box at any depth): the same fight scaled to that depth, without
// the guaranteed relic drops or the victory screen.
import { G } from '../state.js';
import { rand, chance, TAU, clamp, angleTo, angleDiff, dist, pick, hexToRgb } from '../core/util.js';
import { isoX, isoY, HW, HH } from '../core/view.js';
import { sfx } from '../core/audio.js';
import { addEffect, Telegraph, Ring, Bolt, Column, burst, sparkle, floatText, smoke, addLight, glowSprite } from '../gfx/vfx.js';
import { explosionFx } from '../gfx/shapes.js';
import { hit } from './combat.js';
import { Delayed, Area, coneTargets } from './hazards.js';
import { makeMonster, Monster } from './monster.js';
import { UI } from '../ui/ui.js';
import { GroundItem } from './loot.js';
import { makeHeirloom, makeCovenant } from '../data/relics.js';
import { rollSigil, SIGIL_MAX, makeGem } from '../data/items.js';

export const HP_MUL = 2;          // his life on top of a boss's x40 (tuned with tools/tests/velscour.js)
export const DMG_MUL = 0.7;       // his hits: the fight runs ~4x longer than the old one, so each hurts less (tools/tests/balance.js BAL_BIOME=throne)
export const PACE = 1 / 220;      // the most of his life he can lose a second (banked up to 3 s)
export const ENRAGE_T = 15 * 60;  // he executes the hero after fifteen minutes (slow builds: geared rangers took 9-12)
const C = { x: 22, y: 17.5, rx: 16, ry: 13.5 }; // the arena ellipse
// his throne (gfx/velscourthrone.js, tiles 21-22 x 10-11): where he sits, how high the seat is, where he lands
const SEAT = [22.95, 12.2], SEAT_Z = 74, FRONT = [22.5, 15];
const SEALS = [[22, 6.5, 'North'], [35, 17.5, 'East'], [22, 28.5, 'South'], [9, 17.5, 'West']];
const OBELISKS = [[12, 10], [32, 10], [12, 24], [32, 24]];
const LANTERNS = [[13.5, 20], [30.5, 20]];
const GUARDS = [[13, 13], [31, 13]];
const inArena = (x, y, k = 1) => ((x - C.x) / (C.rx * k)) ** 2 + ((y - C.y) / (C.ry * k)) ** 2 <= 1;

export function setupVelscour(world, m, gen) {
  const V = new VelscourFight(world, m, gen);
  m.vel = V; world.velscour = V;
  m.maxHp *= HP_MUL; m.hp = m.maxHp; m.dmg *= DMG_MUL;
  m.onDeath = () => V.onDeath();
  // seated on his throne until the hero comes
  m.x = SEAT[0]; m.y = SEAT[1]; m.z = SEAT_Z; V.seated = true;
  world.addHazard(V);
  return V;
}

class VelscourFight {
  constructor(world, m, gen) {
    Object.assign(this, { world, m, gen, phase: 0, t: 0, ground: true, team: 'enemy', parts: [], hold: false, bank: 0, lastHp: m.maxHp, cd: {}, sealBuff: 0, practice: !!world.practice });
    this.gate = 0.8; // the life fraction this phase can't be pushed below
    this.gateTiles = [];
  }
  get p() { return this.world.player; }
  // ---------------------------------------------------------------- HUD line under the boss bar
  label() {
    if (!this.phase) return '';
    const left = Math.max(0, Math.ceil(ENRAGE_T - this.t)), clock = ` · Execute ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    const live = (k) => this.parts.filter((c) => c.vk === k && !c.dead).length;
    const name = ['', 'The Lord Upon the Throne', 'The Four Seals', 'Crown of Hellfire', 'Into the Abyss', 'True Form', 'Bound to the Obelisks'][this.phase];
    const extra = this.phase === 2 ? ` — break the seals (${live('seal')} left)` : this.phase === 4 ? ` — break the Heart Shards (${live('shard')} left)` : this.phase === 6 ? ` — break the obelisks (${live('obelisk')} left)` : '';
    return `Phase ${Math.min(5, this.phase === 6 ? 5 : this.phase)}/5 · ${name}${extra}${clock}`;
  }

  // ---------------------------------------------------------------- the loop
  update(dt) {
    const m = this.m, p = this.p, w = this.world;
    if (m.dead) return false;
    addLight(22, 11.5, 4.5, 0.9, 50, '#ff5020'); // the throne's own hellish glow
    if (!p) return true;
    if (!this.phase) {
      this.faceHero();
      if (!(inArena(p.x, p.y, 0.92) && dist(p.x, p.y, m.x, m.y) < 15)) { m.awake = false; this.lastHp = m.hp; return true; }
      this.begin();
    }
    if (p.dead) return true;
    this.faceHero();
    this.t += dt;
    this.pace(dt);
    // the clock
    if (this.t > ENRAGE_T && (this.execT || 0) < this.t) {
      this.execT = this.t + 5;
      UI.centerMsg('YOUR TIME IS UP', 'Velscour ends this', 2.5);
      addEffect(new Column(p.x, p.y, '#ff1010', 1.2, 60, 400)); burst(p.x, p.y, 30, 'blood', 50, 6); sfx('thud'); sfx('roar');
      if (!G.godMode) { p.phoenixCd = Math.max(p.phoenixCd || 0, 1); p.hp = 0; p.die(m); return true; }
    }
    const frac = m.hp / m.maxHp;
    switch (this.phase) {
      case 1: this.p1(dt); if (frac <= 0.8 + 1e-6) this.startSeals(); break;
      case 2: this.p2(dt); break;
      case 3: this.p3(dt); if (frac <= 0.5 + 1e-6) this.startAbyss(); break;
      case 4: this.p4(dt); break;
      case 5: this.p5(dt); if (frac <= 0.1 + 1e-6 && !this.bound) this.startChains(); break;
      case 6: this.p5(dt, true); this.p6(dt); break;
    }
    for (const c of this.parts) if (c.vk === 'mirror' && !c.dead && this.t - c.born > 22) { c.dead = true; smoke(c.x, c.y, 0, '#301020', 6, 10); }
    this.parts = this.parts.filter((c) => !c.dead || c.vk === 'seal' || c.vk === 'shard' || c.vk === 'obelisk');
    return true;
  }

  /** The damage cap refills (banked up to 3 s); the gate holds whatever else changed his life (game/combat.js absorb). */
  pace(dt) {
    const m = this.m;
    this.bank = Math.min(m.maxHp * PACE * 3, this.bank + m.maxHp * PACE * dt);
    if (m.hp < m.maxHp * this.gate) m.hp = m.maxHp * this.gate;
    this.lastHp = m.hp;
  }
  /** A hit on him: what of it lands, after the life gate (no carrying past a phase) and the damage cap. */
  absorb(dmg) {
    const m = this.m;
    if (!this.phase) return dmg;
    const room = Math.max(0, m.hp - m.maxHp * this.gate - (this.gate > 0 ? 1 : 0));
    const take = Math.min(dmg, this.bank, room);
    this.bank -= take;
    if (take < dmg * 0.5 && (this.endureT || 0) < this.t) { this.endureT = this.t + 1.2; floatText(m.x, m.y, 150, room <= 0 ? 'THE PHASE TURNS' : 'VELSCOUR ENDURES', '#ff9060', 13, { life: 1 }); }
    return take;
  }

  /** He always turns to the hero (his own AI only turned while walking or swinging, so he cast spells with his back
   *  to them); not mid-charge, and not while the hero is straight above or below him on screen. */
  faceHero() {
    const m = this.m, p = this.p;
    if (!p || (m.state === 'act' && m.action && m.action.kind === 'charge')) return;
    const dx = isoX(p.x, p.y) - isoX(m.x, m.y);
    if (Math.abs(dx) > 10) { m.flip = dx < 0; m.flipAt = -1; m.facing = angleTo(m.x, m.y, p.x, p.y); }
  }
  /** Off the throne: a leap down to the foot of the dais. */
  stand() {
    const m = this.m, w = this.world;
    if (!this.seated) return;
    this.seated = false;
    smoke(m.x, m.y, SEAT_Z, '#140808', 8, 12);
    const [x, y] = w.map.nudge(FRONT[0], FRONT[1], 0.8);
    m.x = x; m.y = y; m.z = 0; m.nav = null;
    explosionFx(x, y, 2.6, 'fire', 'eruption', { shake: 12 });
    sfx('thud');
  }
  begin() {
    const m = this.m, w = this.world;
    this.stand();
    this.phase = 1; this.t = 0; m.awake = true;
    this.lastHp = m.hp;
    m.patterns = ['slam', 'charge', 'volley', 'meteor'];
    m.patternQ = [];
    this.seal();
    if (w.onBossAwake) w.onBossAwake(m);
    UI.centerMsg('DEMON LORD VELSCOUR', this.practice ? 'The last battle (practice)' : 'The last battle', 3.4);
    UI.log('<b style="color:#ff4020">Velscour rises from his throne.</b> Five trials stand between you and the end of him.', '#ffb0a0');
    this.cd = { brand: 3, chain: 9, guard: 20 };
  }

  /** Close the arena's mouth (the corridor at its south end) until he falls. */
  seal() {
    const map = this.world.map;
    for (let x = 18; x <= 26; x++) for (const y of [31, 32]) { const i = y * map.w + x; if (map.t[i] === 1 && !map.block[i]) { map.block[i] = 1; this.gateTiles.push(i); } }
    map.flowFrom = [-9, -9];
    sfx('thud'); sfx('portal', 0.6);
  }
  unseal() {
    const map = this.world.map;
    for (const i of this.gateTiles) map.block[i] = 0;
    this.gateTiles = []; map.flowFrom = [-9, -9];
  }

  // ---------------------------------------------------------------- phase 1: The Lord Upon the Throne
  p1(dt) {
    this.tick('brand', dt, 7, () => this.hellbrand());
    this.tick('chain', dt, 16, () => this.chains());
    this.tick('guard', dt, 30, () => this.throneGuard());
  }
  tick(k, dt, every, fn) { if ((this.cd[k] = (this.cd[k] ?? every) - dt) <= 0) { this.cd[k] = every * rand(0.85, 1.15); fn(); } }
  hellbrand() {
    const m = this.m, p = this.p, w = this.world;
    if (this.hold || dist(m.x, m.y, p.x, p.y) > 9) return;
    const ang = angleTo(m.x, m.y, p.x, p.y), half = 0.55, len = 7.5;
    addEffect(new Telegraph({ kind: 'cone', x: m.x, y: m.y, ang, half, len, dur: 1.0 }), 'ground');
    m.face(ang); m.cd = Math.max(m.cd || 0, 1.1); // he holds the swing a moment
    w.addHazard({ t: 1.0, team: 'enemy', update(dt) { this.t -= dt; if (this.t > 0) return true;
      for (const c of coneTargets(w, m.team, m.x, m.y, ang, len, half)) hit(m, c, m.dmg * 1.8, 'fire', { knock: 1 });
      explosionFx(m.x + Math.cos(ang) * 3, m.y + Math.sin(ang) * 3, 3, 'fire', 'eruption'); sfx('explode'); return false; }, draw() {} });
    floatText(m.x, m.y, 150, 'HELLBRAND', '#ff7040', 15, { life: 1 });
  }
  chains() {
    const m = this.m, p = this.p, w = this.world, V = this;
    if (this.hold) return;
    UI.log('<b style="color:#ffb050">Chains of Velscour</b> bind you to him!', '#ffd0a0');
    sfx('lock_unlock', 0.6);
    w.addHazard({ t: 0, dur: 3.5, team: 'enemy', ground: false,
      update(dt) {
        this.t += dt;
        if (m.dead || p.dead || V.hold) return false;
        const d = dist(m.x, m.y, p.x, p.y);
        if (d > 2.4) { const a = angleTo(p.x, p.y, m.x, m.y), s = 2.6 * dt; w.map.move(p, Math.cos(a) * s, Math.sin(a) * s); }
        if ((this.hurt = (this.hurt || 0) - dt) <= 0) { this.hurt = 1; hit(m, p, m.dmg * 0.25, 'fire', { dot: true }); }
        return this.t < this.dur;
      },
      draw(ctx) {
        ctx.save(); ctx.strokeStyle = '#ffb050'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.moveTo(isoX(m.x, m.y), isoY(m.x, m.y) - 60); ctx.lineTo(isoX(p.x, p.y), isoY(p.x, p.y) - 24); ctx.stroke(); ctx.restore();
      } });
  }
  throneGuard() {
    const m = this.m, w = this.world;
    for (const [x, y] of GUARDS) {
      const g = makeMonster(w, pick(['demon', 'knight', 'gargoyle']), w.biome, m.level - 2, 'normal', x, y);
      g.awake = true; g.aggro = this.p; g.maxHp *= 0.6; g.hp = g.maxHp; g.name = 'Throne Guard';
      w.add(g); addEffect(new Ring(x, y, 0.1, 1.4, 0.5, '#ff3020', 3)); smoke(x, y, 0, '#200808', 4, 8);
    }
    sfx('summon');
  }

  // ---------------------------------------------------------------- phase 2: The Four Seals
  startSeals() {
    const m = this.m, w = this.world;
    this.phase = 2; this.p2t = 0; this.gate = 0.8;
    this.rise();
    UI.centerMsg('THE FOUR SEALS', 'Break the seals before they make him stronger', 3.2);
    this.walls = new FlameWalls(this);
    w.addHazard(this.walls);
    sfx('roar'); sfx('summon');
    if (G.room && !G.game?.isDungeonAuthority(w.depth)) return;
    for (const [x, y, n] of SEALS) {
      const [sx, sy] = w.map.nudge(x, y, 0.45);
      const seal = this.crystal(sx, sy, { vk: 'seal', name: `Seal of the ${n}`, color: '#b080ff', hp: 0.03, h: 54,
        tick: (c, dt) => { if ((c.beamT = (c.beamT || 0) - dt) <= 0) { c.beamT = 0.15; addEffect(new Bolt(c.x, c.y, 50, m.x, m.y, 110, '#b080ff', 0.14, 2)); }
          c.ward = c.warden && !c.warden.dead ? 0.25 : 1; } });
      seal.netId = `vel_seal_${n.toLowerCase()}`;
      const [gx, gy] = w.map.randomNear(sx, sy, 2.2);
      const warden = makeMonster(w, pick(['demon', 'knight', 'gargoyle']), w.biome, m.level, 'unique', gx, gy);
      warden.netId = `vel_warden_${n.toLowerCase()}`;
      warden.awake = true; warden.aggro = this.p; warden.name = `Warden of the ${n}`;
      w.add(warden); seal.warden = warden;
      addEffect(new Ring(sx, sy, 0.2, 2.5, 0.8, '#b080ff', 5));
    }
  }
  p2(dt) {
    this.p2t += dt;
    const left = this.parts.filter((c) => c.vk === 'seal' && !c.dead);
    if (!left.length) return this.endSeals('The seals shatter!');
    if (this.p2t > 120) {
      for (const c of left) { addEffect(new Bolt(c.x, c.y, 50, this.m.x, this.m.y, 110, '#ff4040', 0.5, 5)); c.dead = true; if (c.warden) c.warden.dead = true; }
      this.sealBuff = left.length;
      this.m.dmg *= Math.pow(1.15, left.length);
      this.endSeals(`${left.length} seal${left.length > 1 ? 's pour' : ' pours'} itself into him: +${left.length * 15}% damage!`);
    }
  }
  endSeals(msg) {
    this.walls.dead = true;
    this.land();
    this.phase = 3; this.gate = 0.5;
    this.m.patterns = ['nova', 'spiral', 'meteor', 'beam', 'volley', 'slam'];
    this.cd = { spiral: 6, doom: 10, mirror: 18, brand: 5, legion: 8 };
    this.lava = new LavaRing(this);
    this.world.addHazard(this.lava);
    UI.centerMsg('CROWN OF HELLFIRE', msg, 3);
    UI.log('The floor of the arena begins to melt from the edges in.', '#ffb080');
  }

  // ---------------------------------------------------------------- phase 3: Crown of Hellfire
  p3(dt) {
    this.tick('brand', dt, 8, () => this.hellbrand());
    this.tick('spiral', dt, 12, () => this.meteorSpiral());
    this.tick('doom', dt, 15, () => this.doomBrand());
    this.tick('mirror', dt, 28, () => this.mirror());
    this.tick('legion', dt, 22, () => this.legion());
  }
  /** Legion of the Pit: a hellgate tears open beside him and demons climb out (at most eight of his alive at once). */
  legion() {
    const m = this.m, w = this.world, p = this.p;
    const alive = w.creatures.filter((c) => c.pitSpawn && !c.dead).length;
    const n = Math.min(4, 8 - alive);
    if (n <= 0 || this.hold) return;
    const a = angleTo(m.x, m.y, p.x, p.y) + (Math.random() < 0.5 ? 1.2 : -1.2);
    const [gx, gy] = w.map.nudge(m.x + Math.cos(a) * 3, m.y + Math.sin(a) * 3, 0.6);
    addEffect(new Telegraph({ kind: 'circle', x: gx, y: gy, r: 1.8, dur: 1.2, color: '#ff4010' }), 'ground');
    UI.log('<b style="color:#ff5020">Legion of the Pit</b>: Velscour tears open a hellgate and his demons climb out!', '#ffb090');
    floatText(m.x, m.y, 160, 'RISE, MY LEGION', '#ff5020', 16, { life: 1.6 });
    sfx('roar', 0.7);
    w.addHazard({ t: 1.2, team: 'enemy', update(dt) {
      this.t -= dt; if (this.t > 0) return true;
      explosionFx(gx, gy, 2, 'fire', 'eruption'); addEffect(new Ring(gx, gy, 0.2, 2.2, 0.6, '#ff3010', 5)); sfx('summon');
      for (let i = 0; i < n; i++) {
        const [x, y] = w.map.randomNear(gx, gy, 1.6);
        const d = makeMonster(w, i % 2 ? 'imp' : 'demon', w.biome, m.level - 2, i === 0 ? 'champion' : 'normal', x, y);
        d.awake = true; d.aggro = p; d.maxHp *= 0.55; d.hp = d.maxHp; d.pitSpawn = true; d.name = i % 2 ? 'Pit Imp' : 'Pit Demon';
        w.add(d); smoke(x, y, 0, '#200808', 5, 9);
      }
      return false; }, draw() {} });
  }
  meteorSpiral() {
    const m = this.m, w = this.world;
    for (let i = 0; i < 12; i++) {
      const a = i * 0.9 + rand(0.2), r = 2 + i * 0.95, x = m.x + Math.cos(a) * r, y = m.y + Math.sin(a) * r * 0.85;
      if (!w.map.walkable(x, y)) continue;
      w.addHazard(new Delayed({ world: w, src: m, x, y, r: 1.4, delay: 1.0 + i * 0.13, fx: 'meteor', el: 'fire', dmg: [m.dmg * 1.1, m.dmg * 1.4] }));
    }
    sfx('boss');
  }
  doomBrand() {
    const m = this.m, p = this.p, w = this.world;
    floatText(p.x, p.y, 90, 'DOOM BRAND', '#ff5030', 15, { life: 1.4 });
    w.addHazard({ t: 0, dur: 2.6, team: 'enemy', x: p.x, y: p.y, r: 1.6, ground: true,
      update(dt) { this.t += dt; if (this.t < this.dur - 0.6) { this.x = p.x; this.y = p.y; }
        if (this.t >= this.dur) { explosionFx(this.x, this.y, 1.8, 'fire', 'eruption'); for (const c of w.hostiles(m.team, this.x, this.y, 1.8)) hit(m, c, m.dmg * 1.6, 'fire', {});
          w.addHazard(new Area({ world: w, src: m, x: this.x, y: this.y, r: 1.6, dur: 14, tick: 0.5, dmg: [m.dmg * 0.25, m.dmg * 0.3], el: 'fire', fx: 'fire' })); sfx('explode'); return false; }
        return true; },
      danger(out) { if (this.t >= this.dur - 0.6) out.push({ x: this.x, y: this.y, r: this.r + 0.5 }); },
      draw(ctx) { const k = this.t / this.dur, x = isoX(this.x, this.y), y = isoY(this.x, this.y);
        ctx.save(); ctx.strokeStyle = '#ff3010'; ctx.lineWidth = 2 + k * 3; ctx.globalAlpha = 0.5 + k * 0.5;
        ctx.beginPath(); ctx.ellipse(x, y, this.r * HW * Math.SQRT2, this.r * HH * Math.SQRT2, 0, 0, TAU); ctx.stroke(); ctx.restore(); } });
  }
  mirror() {
    const m = this.m, w = this.world;
    UI.log('<b style="color:#ff70b0">Mirror of Sin</b>: copies of Velscour step out of the flames. Only the real one casts a shadow.', '#ffc0e0');
    for (let i = 0; i < 2; i++) {
      const [x, y] = w.map.randomNear(m.x, m.y, 4);
      const c = makeMonster(w, 'demon', w.biome, m.level, 'champion', x, y);
      Object.assign(c, { art: m.art, artH: m.artH, swap: { tint: [255, 90, 170, 0.35] }, scale: m.scale, name: 'Mirror of Velscour', noShadow: true, alpha: 0.82, aura: '#ff70b0' });
      c.maxHp = m.maxHp * 0.012; c.hp = c.maxHp; c.dmg = m.dmg * 0.3; c.awake = true; c.aggro = this.p; c.vk = 'mirror';
      c.born = this.t; // gone on their own after 22 s (update)
      w.add(c); this.parts.push(c);
      addEffect(new Ring(x, y, 0.2, 2, 0.6, '#ff70b0', 4));
    }
    sfx('summon');
  }

  // ---------------------------------------------------------------- phase 4: Into the Abyss
  startAbyss() {
    const m = this.m, w = this.world;
    this.phase = 4; this.p4t = 0; this.gate = 0.35;
    if (this.lava) this.lava.dead = true;
    for (const c of this.parts) if (c.vk === 'mirror') c.dead = true;
    G.flash = 1; sfx('portal'); sfx('roar');
    this.hide();
    this.dark0 = w.darkK || 0; w.darkK = 0.93; w.night = true;
    UI.centerMsg('INTO THE ABYSS', 'Break the Heart Shards — stay near the lanterns', 3.4);
    UI.log('The floor gives way to the dark. Three <b style="color:#ff3050">Heart Shards</b> drift in it: each one you break tears at Velscour. Stay near a <b style="color:#ffe08a">Soul Lantern</b>: the dark itself hurts.', '#ffc0c0');
    this.cd = { shades: 3 };
    if (G.room && !G.game?.isDungeonAuthority(w.depth)) return;
    for (let i = 0; i < 3; i++) {
      const a0 = (i / 3) * TAU, R = 7;
      const sh = this.crystal(C.x + Math.cos(a0) * R, C.y + Math.sin(a0) * R * 0.8, { vk: 'shard', name: 'Heart Shard', color: '#ff3050', hp: 0.035, h: 40, fly: true,
        tick: (c, dt) => { c.a = (c.a ?? a0) + dt * 0.12; const tx = C.x + Math.cos(c.a) * R, ty = C.y + Math.sin(c.a) * R * 0.8; if (w.map.walkable(tx, ty)) { c.x = tx; c.y = ty; } } });
      sh.netId = `vel_shard_${i}`;
      sh.onDeath = () => { if (m.dead) return; const cut = m.maxHp * 0.05; m.hp = Math.max(m.maxHp * 0.3, m.hp - cut); this.lastHp = m.hp; addEffect(new Column(sh.x, sh.y, '#ff3050', 1, 60, 300)); floatText(sh.x, sh.y, 80, '-5% VELSCOUR', '#ff6080', 16, { life: 1.6 }); sfx('explode'); };
    }
  }
  p4(dt) {
    const w = this.world, p = this.p;
    this.p4t += dt;
    for (const [x, y] of LANTERNS) addLight(x, y, 5, 1, 30, '#ffe08a');
    addLight(p.x, p.y, 2.2, 0.6);
    this.tick('shades', dt, 7, () => {
      if (G.room && !G.game?.isDungeonAuthority(w.depth)) return;
      for (let i = 0; i < 2; i++) { const a = rand(TAU); const [x, y] = w.map.nudge(C.x + Math.cos(a) * 11, C.y + Math.sin(a) * 9, 0.4); if (!w.map.walkable(x, y)) continue;
        const s = makeMonster(w, pick(['wraith', 'wraith', 'imp']), w.biome, this.m.level - 3, 'normal', x, y);
        s.netId = `vel_shade_${Math.floor(this.p4t)}_${i}`;
        s.awake = true; s.aggro = p; s.maxHp *= 0.45; s.hp = s.maxHp; s.name = 'Abyssal Shade'; w.add(s); }
    });
    // the dark: away from a lantern it hurts, more the longer the hero stays out
    const nearL = LANTERNS.some(([x, y]) => dist(p.x, p.y, x, y) < 4.5);
    if (!nearL && this.p4t > 12) { this.dread = (this.dread || 0) + dt; if (this.dread > 0.5) { this.dread = 0; hit(this.m, p, p.maxHp * 0.015, 'shadow', { dot: true, silent: true }); } }
    const left = this.parts.filter((c) => c.vk === 'shard' && !c.dead).length;
    if (!left || this.p4t > 75) this.endAbyss(left);
  }
  /** Auto-play: back to a lantern when the dark has been eating at the hero. */
  autoGoal() {
    if (this.phase !== 4 || this.p4t < 12) return null;
    const p = this.p;
    if (p.hp > p.maxHp * 0.55) return null;
    let best = null, bd = Infinity;
    for (const [x, y] of LANTERNS) { const d = dist(p.x, p.y, x, y); if (d < bd) { bd = d; best = { x, y, r: 3.5 }; } }
    return best;
  }
  endAbyss(left) {
    const m = this.m, w = this.world;
    for (const c of this.parts) if (c.vk === 'shard') c.dead = true;
    w.darkK = this.dark0; G.flash = 1; sfx('portal');
    this.show();
    this.phase = 5; this.gate = 0.1;
    m.scale *= 1.3; m.speed *= 1.2; m.atkCd *= 0.75; m.dmg *= 1.12;
    m.patterns = ['slam', 'nova', 'volley', 'charge', 'summon', 'meteor', 'spiral', 'beam'];
    m.patternQ = [];
    this.cd = { apoc: 8, brand: 5, spiral: 9, doom: 12, legion: 14 };
    UI.centerMsg('TRUE FORM', left ? `${left} shard${left > 1 ? 's' : ''} survived the dark` : 'The heart is broken — he is not', 3);
    UI.log('Velscour sheds his crown. <b>APOCALYPSE</b> will scour the arena: get into a glowing circle when it comes.', '#ffb0a0');
    addEffect(new Ring(m.x, m.y, 0.3, 7, 1, '#ff2000', 8)); sfx('roar'); sfx('boss');
  }

  // ---------------------------------------------------------------- phase 5: True Form (and the obelisks at 10%)
  p5(dt, bound = false) {
    this.tick('apoc', dt, 25, () => this.apocalypse());
    this.tick('legion', dt, bound ? 14 : 26, () => this.legion());
    if (bound) return;
    this.tick('brand', dt, 7, () => this.hellbrand());
    this.tick('spiral', dt, 14, () => this.meteorSpiral());
    this.tick('doom', dt, 16, () => this.doomBrand());
  }
  apocalypse() {
    const m = this.m, w = this.world, V = this;
    const spots = [];
    for (let tries = 0; spots.length < 3 && tries < 200; tries++) {
      const a = rand(TAU), r = rand(3, 10), x = C.x + Math.cos(a) * r, y = C.y + Math.sin(a) * r * 0.8;
      if (w.map.walkable(x, y) && inArena(x, y, 0.8) && spots.every(([u, v]) => dist(u, v, x, y) > 6)) spots.push([x, y]);
    }
    const R = 1.9;
    for (const [x, y] of spots) addEffect(new Telegraph({ kind: 'circle', x, y, r: R, dur: 5, color: '#40ff60' }), 'ground');
    UI.centerMsg('APOCALYPSE', 'Into the light!', 2);
    sfx('boss'); sfx('roar');
    w.addHazard({ t: 0, dur: 5, team: 'enemy', ground: true,
      safeAt: (x, y) => spots.some(([u, v]) => dist(u, v, x, y) < R - 0.35),
      update(dt) {
        this.t += dt;
        if (m.dead) return false;
        if (this.t < this.dur) return true;
        const p = V.p;
        explosionFx(C.x, C.y, 12, 'fire', 'eruption', { shake: 14 });
        for (const [u, v] of spots) addEffect(new Ring(u, v, 0.2, R, 0.6, '#80ff90', 4));
        if (p && !p.dead && !spots.some(([u, v]) => dist(u, v, p.x, p.y) < R)) { hit(m, p, Math.max(m.dmg * 4, p.maxHp * 0.7), 'fire', { force: true }); floatText(p.x, p.y, 90, 'SCOURED', '#ff3010', 18, { life: 1.4 }); }
        for (const c of w.creatures) if (c.team === 'player' && c !== p && !c.dead && !spots.some(([u, v]) => dist(u, v, c.x, c.y) < R)) hit(m, c, c.maxHp * 0.6, 'fire', {});
        G.flash = 0.6; sfx('explode'); sfx('thud');
        return false;
      },
      draw(ctx) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.18 + (this.t / this.dur) * 0.3;
        for (const [u, v] of spots) { const x = isoX(u, v), y = isoY(u, v); ctx.drawImage(glowSprite('#60ff80'), x - R * 64, y - R * 32, R * 128, R * 64); } ctx.restore(); } });
  }
  startChains() {
    const m = this.m, w = this.world;
    this.bound = true; this.phase = 6; this.gate = 0.1;
    this.hold = true; m.invuln = 1e9; m.targetable = false;
    UI.centerMsg('BOUND TO THE OBELISKS', 'Break the four obelisks!', 3);
    UI.log('Velscour chains himself to the four obelisks and drinks their strength. Break them all.', '#ffd0a0');
    if (G.room && !G.game?.isDungeonAuthority(w.depth)) return;
    for (let i = 0; i < OBELISKS.length; i++) {
      const [ox, oy] = OBELISKS[i];
      const [x, y] = w.map.nudge(ox + 0.5 + Math.sign(C.x - ox) * 1.2, oy + 0.5 + Math.sign(C.y - oy) * 1.2, 0.45);
      const ob = this.crystal(x, y, { vk: 'obelisk', name: 'Bound Obelisk', color: '#d0d0d0', hp: 0.02, h: 50,
        tick: (c, dt) => { if ((c.beamT = (c.beamT || 0) - dt) <= 0) { c.beamT = 0.2; addEffect(new Bolt(c.x, c.y, 50, m.x, m.y, 120, '#e0e0e0', 0.2, 2)); } } });
      ob.netId = `vel_obelisk_${i}`;
    }
  }
  p6(dt) {
    if (this.parts.some((c) => c.vk === 'obelisk' && !c.dead)) return;
    this.hold = false; this.m.invuln = 0; this.m.targetable = true; this.gate = 0;
    this.phase = 5;
    UI.centerMsg('FINISH HIM', 'The chains are broken', 2.4);
    addEffect(new Ring(this.m.x, this.m.y, 0.3, 6, 0.8, '#ffffff', 6)); sfx('explode');
  }

  // ---------------------------------------------------------------- helpers
  /** He floats above the throne, beyond harm (phase 2). */
  rise() {
    const m = this.m, w = this.world;
    this.hold = true; m.invuln = 1e9; m.targetable = false; m.state = 'idle'; m.action = null;
    smoke(m.x, m.y, 0, '#140808', 8, 14);
    m.x = SEAT[0]; m.y = SEAT[1]; m.nav = null; m.z = SEAT_Z + 24; m.fly = true; // above his throne
    addEffect(new Ring(FRONT[0], FRONT[1] - 2, 0.3, 4, 1, '#b080ff', 6));
  }
  land() {
    const m = this.m;
    this.hold = false; m.invuln = 0; m.targetable = true; m.fly = false; m.z = 0;
    const [x, y] = this.world.map.nudge(FRONT[0], FRONT[1], 0.8); m.x = x; m.y = y;
    explosionFx(m.x, m.y, 3, 'fire', 'eruption', { shake: 10 });
    sfx('thud'); sfx('roar');
  }
  /** Gone into the dark (phase 4). */
  hide() { const m = this.m; this.hold = true; m.invuln = 1e9; m.targetable = false; m.hiddenT = 1; m.alpha = 0; m.state = 'idle'; m.action = null; }
  show() { const m = this.m; this.hold = false; m.invuln = 0; m.targetable = true; m.alpha = 1; m.hiddenT = 0; const [x, y] = this.world.map.nudge(C.x, C.y - 3, 0.8); m.x = x; m.y = y; }
  /** A seal, shard or obelisk: a still crystal-like target with a share of his life. */
  crystal(x, y, o) {
    const m = this.m, w = this.world;
    const c = new Monster({
      x, y, team: 'enemy', ai: 'ward', static: true, fly: !!o.fly, sprite: 'crystal', art: 'va_crystal', artH: o.h || 42, swap: { tint: [...hexToRgb(o.color), 0.75] }, pal: { a: o.color, c: o.color, w: '#ffffff', m: '#4a4650' }, px: 3, r: 0.45,
      maxHp: m.maxHp * o.hp, hp: m.maxHp * o.hp, level: m.level, dmg: m.dmg * 0.3, xp: m.xp * 0.004, name: o.name, rank: 'champion', aura: o.color, awake: true, el: 'fire', res: {}, goreType: 'spark', atkCd: 3,
    });
    c.vk = o.vk;
    c.wardTick = (dt) => { c.moving = false; if (m.dead) { c.dead = true; return; } if (o.tick) o.tick(c, dt); };
    w.add(c); this.parts.push(c);
    return c;
  }
  /** The bonus of beating him: one relic of each kind and a deep Sigil (none in practice). */
  onDeath() {
    const m = this.m, w = this.world;
    this.unseal();
    if (this.walls) this.walls.dead = true;
    if (this.lava) this.lava.dead = true;
    for (const c of this.parts) c.dead = true;
    w.darkK = this.dark0 ?? w.darkK;
    UI.log(`Velscour falls after ${Math.floor(this.t / 60)}:${String(Math.floor(this.t % 60)).padStart(2, '0')}.`, '#ffd0a0');
    (G.velscourLog || (G.velscourLog = [])).push({ t: this.t, phase: this.phase, practice: this.practice });
    if (this.practice || !w.player) return;
    const lvl = m.level + 2, drop = (it) => it && w.addLoot(new GroundItem(m.x + rand(-1, 1), m.y + rand(-1, 1), 'item', { item: it }));
    drop(makeHeirloom(lvl)); drop(makeCovenant(lvl)); drop(makeGem('sig', Math.min(SIGIL_MAX, 15 + Math.floor(rand(0, 5))))); drop(rollSigil(w.depth, 2));
  }
  /** The boss's own AI pauses while he hovers, hides or is bound (game/monster.js bossUpdate). */
  holdBoss() { const m = this.m; if (!this.hold && !this.seated) return false; m.moving = false; return true; }
  draw() {}
}

/** Phase 2: two flame walls sweep round the arena like the hands of a clock. */
class FlameWalls {
  constructor(V) { Object.assign(this, { V, a: rand(TAU), team: 'enemy', ground: true, immune: 0 }); }
  segs() { const out = []; for (const k of [0, Math.PI]) { const a = this.a + k; out.push([C.x + Math.cos(a) * 2.5, C.y + Math.sin(a) * 2.2, C.x + Math.cos(a) * 17, C.y + Math.sin(a) * 14]); } return out; }
  update(dt) {
    if (this.dead || this.V.m.dead) return false;
    this.a += dt * 0.38;
    this.immune -= dt;
    const p = this.V.p;
    if (p && !p.dead && this.immune <= 0) for (const [x0, y0, x1, y1] of this.segs()) if (segDist(p.x, p.y, x0, y0, x1, y1) < 0.75) { hit(this.V.m, p, this.V.m.dmg * 1.1, 'fire', {}); this.immune = 1.2; burst(p.x, p.y, 20, 'fire', 10, 2); break; }
    return true;
  }
  danger(out) { for (const [x0, y0, x1, y1] of this.segs()) out.push({ line: true, x: x0, y: y0, x1, y1, r: 1.3 }); }
  draw(ctx) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const [x0, y0, x1, y1] of this.segs()) for (const [w, a, c] of [[22, 0.25, '#ff4010'], [10, 0.6, '#ff9040'], [3, 0.9, '#fff0a0']]) {
      ctx.globalAlpha = a + Math.sin(G.time * 12) * 0.05; ctx.strokeStyle = c; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(isoX(x0, y0), isoY(x0, y0)); ctx.lineTo(isoX(x1, y1), isoY(x1, y1)); ctx.stroke();
    }
    ctx.restore();
  }
}

/** Phase 3: lava creeps in from the arena's edge to 80% of it and ebbs, a 20-second tide. */
class LavaRing {
  constructor(V) { Object.assign(this, { V, t: 0, team: 'enemy', ground: true, tick: 0 }); }
  get k() { return 1 - 0.2 * (0.5 - 0.5 * Math.cos((this.t / 20) * TAU)); }
  update(dt) {
    if (this.dead || this.V.m.dead) return false;
    this.t += dt; this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.5;
      const k = this.k * 0.97;
      for (const c of this.V.world.creatures) if (c.team === 'player' && !c.dead && !inArena(c.x, c.y, k)) hit(this.V.m, c, (c.isPlayer ? this.V.m.dmg * 0.3 : c.maxHp * 0.05), 'fire', { dot: true });
    }
    return true;
  }
  danger(out) { const k = this.k * 0.95; out.push({ outside: true, x: C.x, y: C.y, rx: C.rx * k, ry: C.ry * k }); } // outside the oval (game/autoplay.js inDanger)
  draw(ctx) {
    const ring = (k) => { const pts = []; for (let i = 0; i <= 48; i++) { const a = (i / 48) * TAU; pts.push([isoX(C.x + Math.cos(a) * C.rx * k, C.y + Math.sin(a) * C.ry * k), isoY(C.x + Math.cos(a) * C.rx * k, C.y + Math.sin(a) * C.ry * k)]); } return pts; };
    const o = ring(1.05), n = ring(this.k);
    ctx.save();
    ctx.beginPath(); o.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
    n.slice().reverse().forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
    const pulse = 0.55 + Math.sin(G.time * 3) * 0.08;
    ctx.fillStyle = `rgba(255,${80 + Math.round(Math.sin(G.time * 2) * 20)},20,${pulse})`; ctx.fill('evenodd');
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#ffd060'; ctx.lineWidth = 3; ctx.globalAlpha = 0.7;
    ctx.beginPath(); n.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
    ctx.restore();
  }
}

function segDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1);
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
}
export { inArena, angleDiff };
