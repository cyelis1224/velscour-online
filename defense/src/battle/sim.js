// The battle, Fantasica-style: heroes are towers on fixed posts beside the road, the horde walks past to the Bastion
// Heart, Valor (Unit Pts) regenerates and pays for deploying and for in-battle upgrades that end with the battle.
// Pure: no DOM, no timers. step(dt) advances it; the renderer reads it and drains `events`.
import { RNG, clamp, dist } from '../core/util.js';
import { ROLES, hpMul, defMul, terrainK } from '../data/waves.js';
import { routeAt } from './map.js';
import { ART } from '../core/assets.js';

export const STEP = 1 / 60;
// In-battle upgrades, reset every battle: empowering a hero (levels 2-5) and three Bastion works
export const EMPOWER = [0, 0.5, 0.75, 1, 1.25];            // x the hero's deploy cost, to reach level i+1
export const BASTION = {
  drums: { name: 'War Drums', text: '+25% Valor regeneration', costs: [25, 50, 80] },
  ward: { name: 'Heart Ward', text: '+5 Heart', costs: [30, 60] },
  rally: { name: 'Rally Standard', text: '+10% attack for every hero', costs: [40, 80, 130] },
};
const MAX_POISON = 5;

export class Battle {
  /**
   * opt: { map, stage: {n, waves}, waves: stageWaves(), squad: [unit defs], ally: unit def | null,
   *        bonus: { valorCap, valorRate, startValor, heart, deploy } (permanent research), seed,
   *        more: (i) => wave | null (endless: waves never run out), noRally }
   */
  constructor(opt) {
    Object.assign(this, { map: opt.map, stage: opt.stage, waves: opt.waves, squad: opt.squad.slice(), bonus: opt.bonus || {}, sealed: !!opt.sealed });
    if (opt.ally) this.squad.push({ ...opt.ally, ally: true });
    const b = this.bonus;
    this.rng = new RNG(opt.seed || 'battle:' + opt.stage.n);
    this.t = 0; this.valor = 20 + (b.startValor || 0); this.valorCap = 60 + (b.valorCap || 0); this.valorRate = 1 + (b.valorRate || 0);
    this.heartMax = opt.heart + (b.heart || 0); this.heart = this.heartMax;
    this.deployLimit = opt.deployLimit + (b.deploy || 0);
    this.monsters = []; this.units = []; this.shots = []; this.zones = []; this.summons = []; this.events = [];
    this.waveI = 0; this.nextWaveAt = 6; this.queue = []; this.waveDone = true; this.lastSpawn = 0;
    this.total = opt.waves.reduce((a, w) => a + w.groups.reduce((s, g) => s + g.count, 0), 0);
    this.spawned = 0; this.kills = 0; this.leaked = 0; this.splits = 0;
    this.works = { drums: 0, ward: 0, rally: 0 };
    this.cooldown = this.squad.map(() => 0);   // redeploy cooldowns per squad slot
    this.done = false; this.won = false; this.gold = 0; this.valorSpent = 0;
    this.uid = 0; this.drops = []; this.more = opt.more || null; this.noRally = !!opt.noRally; this.mutations = 0;
    this.topUp();
    this.lenK = terrainK(this.stage.n);
  }

  // ------------------------------------------------------------------ the Commander's orders
  deployed(slot) { return this.units.find((u) => u.slot === slot); }
  postFree(id) { return !this.units.some((u) => u.post.id === id); }
  canDeploy(slot, postId) {
    const d = this.squad[slot];
    if (!d || this.done) return 'no hero';
    if (this.deployed(slot)) return 'already on the field';
    if (this.cooldown[slot] > 0) return 'regrouping';
    if (this.units.filter((u) => !u.def.ally).length >= this.deployLimit && !d.ally) return 'Deploy Limit reached';
    if (this.valor < d.cost) return 'not enough Valor';
    if (postId !== undefined && !this.postFree(postId)) return 'post taken';
    return null;
  }
  deploy(slot, postId) {
    if (this.canDeploy(slot, postId)) return null;
    const d = this.squad[slot], p = this.map.posts[postId];
    this.valor -= d.cost; this.valorSpent += d.cost;
    const u = { id: ++this.uid, slot, def: d, post: p, x: p.x + 0.5, y: p.y + 0.5, z: p.h, lvl: 1, cd: 0.4, charge: 0, buffs: [], stun: 0,
      kills: 0, shots: 0, face: 1, anim: 0, cast: 0, spent: d.cost };
    this.units.push(u);
    this.ev({ type: 'deploy', u });
    return u;
  }
  empowerCost(u) { return u.lvl >= 5 ? Infinity : Math.round(u.def.cost * EMPOWER[u.lvl]); }
  empower(u) {
    const c = this.empowerCost(u);
    if (this.valor < c || this.done) return false;
    this.valor -= c; this.valorSpent += c; u.lvl++; u.spent += c; this.empowers = (this.empowers || 0) + 1;
    this.ev({ type: 'empower', u });
    return true;
  }
  retreat(u) {
    const i = this.units.indexOf(u);
    if (i < 0) return;
    this.units.splice(i, 1);
    this.valor = Math.min(this.valorCap, this.valor + Math.floor(u.def.cost * 0.5));
    this.cooldown[u.slot] = 8; this.retreats = (this.retreats || 0) + 1;
    this.ev({ type: 'retreat', u });
  }
  bastionCost(k) { return k === 'rally' && this.noRally ? Infinity : BASTION[k].costs[this.works[k]] ?? Infinity; }
  buyBastion(k) {
    const c = this.bastionCost(k);
    if (this.valor < c || this.done) return false;
    this.valor -= c; this.valorSpent += c; this.works[k]++;
    if (k === 'ward') { this.heartMax += 5; this.heart += 5; }
    this.ev({ type: 'bastion', k });
    return true;
  }
  /** Call the next wave now (only between waves): the seconds saved come back as Valor. */
  callWave() {
    if (!this.waveDone || this.waveI >= this.waves.length || this.done) return 0;
    const saved = Math.max(0, Math.round(this.nextWaveAt - this.t));
    this.nextWaveAt = this.t; this.valor = Math.min(this.valorCap, this.valor + saved);
    return saved;
  }

  // ------------------------------------------------------------------ stats
  atkOf(u) {
    let k = (1 + 0.22 * (u.lvl - 1)) * (1 + 0.1 * this.works.rally) * (1 + (this.bonus.resolve || 0));
    for (const b of u.buffs) k += b.atk || 0;
    for (const o of this.units) if (o !== u && o.def.mods.auraAtk && dist(o.x, o.y, u.x, u.y) <= 2.6) k += o.def.mods.auraAtk;   // heroes who make the others strike harder
    const m = u.def.mods;
    if (m.killStack) k += Math.min(0.4, u.kills * m.killStack);
    return u.def.atk * k;
  }
  rateOf(u) {
    let k = 1 + 0.08 * (u.lvl - 1);
    for (const b of u.buffs) k += b.rate || 0;
    for (const o of this.units) if (o !== u && o.def.kit.aura && dist(o.x, o.y, u.x, u.y) <= 2.6) k += o.def.kit.aura + (o.def.mods.auraP || 0);
    return u.def.rate / k;
  }
  rangeOf(u, m) { return u.def.range + 0.1 * (u.lvl - 1) + (m ? clamp((u.z - m.z) * 0.25, 0, 0.75) : 0); }

  // ------------------------------------------------------------------ the horde
  spawnMonster(gr, g, s0 = 0, parent = null) {
    const R = ROLES[gr.role], route = this.map.routes[gr.route % this.map.routes.length];
    const elite = !parent && gr.elite && this.rng.chance(gr.elite);
    const hp = R.hp * (gr.hpK || 1) * hpMul(g) * (elite ? 2.2 : 1) * (parent ? 0.35 : 1) * this.lenK * clamp(route.len / 27, 0.5, 1.25); // short roads: less to kill
    const m = { id: ++this.uid, role: gr.role, R, art: gr.art, route, s: s0, x: 0, y: 0, z: 0, hp, maxHp: hp, def: R.def * defMul(g) * (gr.defK || 1), res: Math.min(0.8, R.res + (gr.res || 0)),
      speed: R.speed * (1 + g / 4000) * (elite ? 0.95 : 1) * (gr.speedK || 1), air: !!R.air, elite, g, slow: 0, slowT: 0, stun: 0, burn: 0, burnT: 0, poison: [],
      held: null, abil: 2 + this.rng.range(0, 3), summonT: R.summon || 0, enraged: false, face: 1, anim: this.rng.next() * 9, hitT: 0,
      boss: gr.role === 'boss', lt: gr.role === 'lieutenant' || gr.role === 'warlord', child: !!parent, arch: ART.byId?.[gr.art]?.arch || 'skeleton',
      burrowCD: R.burrow ? 2 + this.rng.range(0, R.burrow) : 0, burrowT: 0, warded: !!gr.shieldAll };
    if (gr.blinkAll && !R.blink) m.R = { ...R, blink: 6 };   // a mutated horde: every foe blinks or burrows
    if (gr.burrowAll && !R.burrow && !R.air) { m.R = { ...m.R, burrow: 7 }; m.burrowCD = 2 + this.rng.range(0, 7); }
    routeAt(route, m.s, this.tmp || (this.tmp = [0, 0, 0]));
    [m.x, m.y, m.z] = this.tmp;
    this.monsters.push(m);
    this.ev({ type: 'spawn', m });
    return m;
  }
  startWave() {
    const w = this.waves[this.waveI];
    for (const gr of w.groups) for (let i = 0; i < gr.count; i++) this.queue.push({ at: this.t + (gr.delay || 0) + i * gr.gap, gr, g: w.g });
    this.queue.sort((a, b) => a.at - b.at);
    this.waveDone = false;
    this.mutations = w.muts?.length || 0;
    this.ev({ type: 'wave', i: this.waveI, g: w.g, muts: w.muts, big: w.big, boss: w.groups.some((g) => g.role === 'boss'), lt: w.groups.some((g) => g.role === 'lieutenant') });
    this.waveI++;
    this.topUp();
  }
  /** Endless runs: keep two waves queued past the current one. */
  topUp() {
    while (this.more && this.waves.length < this.waveI + 2) { const w = this.more(this.waves.length); this.waves.push(w); this.total += w.groups.reduce((s, g) => s + g.count, 0); }
  }

  // ------------------------------------------------------------------ the tick
  step(dt = STEP) {
    if (this.done) return;
    this.t += dt;
    this.valor = Math.min(this.valorCap, this.valor + dt * this.valorRate * (1 + 0.25 * this.works.drums));
    for (let i = 0; i < this.cooldown.length; i++) if (this.cooldown[i] > 0) this.cooldown[i] -= dt;
    // waves
    if (this.waveDone && this.waveI < this.waves.length && this.t >= this.nextWaveAt) this.startWave();
    while (this.queue.length && this.queue[0].at <= this.t) { const q = this.queue.shift(); this.spawnMonster(q.gr, q.g); this.spawned++; this.lastSpawn = this.t; }
    if (!this.waveDone && !this.queue.length) { this.waveDone = true; this.nextWaveAt = this.t + 12; }
    if (this.waveDone && !this.monsters.length && this.nextWaveAt > this.t + 2.5 && this.waveI < this.waves.length) this.nextWaveAt = this.t + 2.5;
    this.auras();
    this.updateMonsters(dt);
    this.updateUnits(dt);
    this.updateShots(dt);
    this.updateZones(dt);
    this.updateSummons(dt);
    if (this.heart <= 0) { this.heart = 0; this.finish(false); }
    else if (this.waveI >= this.waves.length && this.waveDone && !this.monsters.length) this.finish(true);
  }
  finish(won) {
    this.done = true; this.won = won;
    this.wavesCleared = won ? this.waves.length : Math.max(0, this.waveI - 1);
    const pct = this.kills / Math.max(1, this.total + this.splits);
    this.pct = clamp(pct, 0, 1);
    this.stars = !won ? 0 : this.leaked === 0 ? 3 : this.pct >= 0.9 ? 2 : 1;
    this.ev({ type: 'end', won, stars: this.stars });
  }
  ev(e) { this.events.push(e); }

  /** Shieldbearers cover the foes around them (30% less damage), captains hurry them (+25% speed). */
  auras() {
    for (const m of this.monsters) { m.shielded = m.warded; m.rallied = false; }
    for (const a of this.monsters) {
      if (!a.R.shield && !a.R.rally) continue;
      for (const o of this.monsters) if (o !== a && Math.abs(o.x - a.x) < 1.8 && Math.abs(o.y - a.y) < 1.8 && dist(o.x, o.y, a.x, a.y) <= 1.7) { if (a.R.shield) o.shielded = true; if (a.R.rally) o.rallied = true; }
    }
  }
  updateMonsters(dt) {
    const tmp = this.tmp;
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];
      m.anim += dt; if (m.hitT > 0) m.hitT -= dt;
      // damage over time
      if (m.burnT > 0) { m.burnT -= dt; this.damage(m, m.burn * dt, null, 'fire', true); }
      if (m.poison.length) {
        for (let k = m.poison.length - 1; k >= 0; k--) { const p = m.poison[k]; p.t -= dt; this.damage(m, p.dps * dt, p.src, 'poison', true); if (p.t <= 0) m.poison.splice(k, 1); }
      }
      if (m.hp <= 0) continue;
      if (m.slowT > 0) m.slowT -= dt; else m.slow = 0;
      if (m.R.burrow) { if (m.burrowT > 0) m.burrowT -= dt; else if ((m.burrowCD -= dt) <= 0) { m.burrowCD = m.R.burrow; m.burrowT = 2; this.ev({ type: 'burrow', m }); } }
      if (m.stun > 0) { m.stun -= dt; continue; }
      // abilities
      if ((m.abil -= dt) <= 0) this.monsterAbility(m);
      if (m.boss && m.R.summon && (m.summonT -= dt) <= 0) {
        m.summonT = m.R.summon;
        for (let k = 0; k < 3; k++) { const c = this.spawnMonster({ role: 'grunt', art: this.waves[this.waveI - 1]?.groups[0]?.art || m.art, route: this.map.routes.indexOf(m.route) }, m.g, Math.max(0, m.s - 0.6 - k * 0.5), m); c.minion = true; this.splits++; }
        this.ev({ type: 'summon', m });
      }
      if (m.boss && !m.enraged && m.hp < m.maxHp * 0.4) { m.enraged = true; this.ev({ type: 'enrage', m }); }
      if (m.held && (m.held.dead || m.held.t <= 0)) m.held = null;
      if (!m.air && !m.held) { // walls and skeletons hold foes on the road
        for (const z of this.zones) if (z.hold && z.holding.size < z.hold && !z.holding.has(m) && m.route === z.route && Math.abs(m.s - z.s) < 0.35 && !m.boss) { z.holding.add(m); m.held = z; break; }
        if (!m.held) for (const sk of this.summons) if (!sk.foe && Math.abs(m.s - sk.s) < 0.4 && m.route === sk.route) { sk.foe = m; m.held = sk; break; }
      }
      if (m.held) {
        if (m.held.hp !== undefined && (m.abil2 = (m.abil2 || 0) - dt) <= 0) { m.abil2 = 1; m.held.hp -= m.maxHp * 0.05 + 4; }
        continue;
      }
      const sp = m.speed * (1 - clamp(m.slow, 0, 0.7)) * (m.enraged ? 1.4 : 1) * (m.rallied ? 1 + 0.25 : 1) * (m.burrowT > 0 ? 1.5 : 1);
      const px = m.x;
      m.s += sp * dt;
      if (m.s >= m.route.len) { this.leak(m, i); continue; }
      routeAt(m.route, m.s, tmp);
      m.x = tmp[0]; m.y = tmp[1]; m.z = tmp[2];
      const sdx = (m.x - px) - (tmp[1] - m.y);
      if (Math.abs(sdx) > 1e-4) m.face = sdx > 0 ? 1 : -1;
    }
  }
  monsterAbility(m) {
    const R = m.R;
    m.abil = 3;
    if (R.blink) { // a blink two tiles down the road
      m.abil = R.blink;
      const from = [m.x, m.y, m.z];
      m.s = Math.min(m.route.len - 0.6, m.s + 2);
      routeAt(m.route, m.s, this.tmp); [m.x, m.y, m.z] = this.tmp;
      this.ev({ type: 'blink', m, from });
      return;
    }
    if (R.heal) {
      m.abil = 2;
      for (const o of this.monsters) if (o !== m && o.hp > 0 && dist(o.x, o.y, m.x, m.y) < 1.8) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * R.heal);
      this.ev({ type: 'heal', m });
    }
    if (R.hex || R.roar) {
      m.abil = R.hex || R.roar;
      const r = R.roar ? (m.boss ? 3 : 2.5) : 2.5, near = this.units.filter((u) => !u.def.mods.steadfast && dist(u.x, u.y, m.x, m.y) <= r);   // the steadfast are never stunned
      if (!near.length) { m.abil = 1; return; }
      const hit = R.hex ? [near[Math.floor(this.rng.next() * near.length)]] : near;
      for (const u of hit) { u.stun = Math.max(u.stun, R.roar ? (m.boss ? 2 : 1.5) : 2); }
      this.ev({ type: R.hex ? 'hex' : 'roar', m, units: hit });
    }
  }
  leak(m, i) {
    this.monsters.splice(i, 1);
    m.dead = true;
    const d = m.R.leak * (m.elite ? 2 : 1);
    this.heart -= d; this.leaked++;
    this.ev({ type: 'leak', m, d });
  }
  /** Deal damage; returns what was dealt. dot: damage over time (no mitigation, already per frame). */
  damage(m, amt, u, el, dot = false, mult = 1) {
    if (m.dead || m.hp <= 0) return 0;
    if (m.burrowT > 0 && !dot) return 0;   // under the ground: only poison and fire reach it
    let d = amt;
    if (!dot) {
      const magic = u ? u.def.kit.dmg === 'magic' : false;
      d = amt * mult * (magic ? 1 - m.res : 100 / (100 + m.def));
      if (u) {
        const mm = u.def.mods;
        if (m.air && u.def.kit.air) d *= u.def.kit.air * (1 + (mm.vsAir || 0));
        if ((m.boss || m.lt) && mm.vsBoss) d *= 1 + mm.vsBoss;
        if (mm.crit && this.rng.chance(mm.crit)) { d *= 2; this.ev({ type: 'crit', m }); }
      }
      if (m.shielded) d *= 0.7;
      const tb = this.bonus.trophy?.[m.arch]; if (tb) d *= 1 + tb;   // trophy cards of this monster's family
      m.hitT = 0.12;
      this.ev({ type: 'hit', m, d, el, u });
    }
    m.hp -= d;
    if (m.hp <= 0) this.kill(m, u);
    return d;
  }
  kill(m, u) {
    const i = this.monsters.indexOf(m);
    if (i >= 0) this.monsters.splice(i, 1);
    m.dead = true; m.hp = 0;
    this.kills++;
    this.valor = Math.min(this.valorCap, this.valor + (m.boss ? 20 : m.lt ? 10 : m.elite ? 2 : m.minion ? 0.5 : 1));
    this.gold += Math.round((m.boss ? 80 : m.lt ? 30 : m.elite ? 5 : m.minion ? 0.5 : 2) * (1 + m.g / 40));
    if (u) { u.kills++; if (u.def.mods.killValor) this.valor = Math.min(this.valorCap, this.valor + u.def.mods.killValor); }
    this.ev({ type: 'kill', m, u });
    if (this.bonus.drops && this.drops.length < 3 && !m.minion) {
      const p = (m.boss ? 0.5 : m.R.name === 'Warlord' ? 0.2 : m.lt ? 0.25 : m.R.rally ? 0.06 : m.elite ? 0.02 : 0.004) * this.bonus.drops;
      if (this.rng.chance(p)) { this.drops.push(m.art); this.ev({ type: 'trophy', m }); }
    }
    if (m.R.split && !m.child) {
      for (let k = 0; k < m.R.split; k++) {
        const c = this.spawnMonster({ role: 'runner', art: m.art, route: this.map.routes.indexOf(m.route) }, m.g, Math.max(0, m.s - 0.25 * k), m);
        c.child = true; this.splits++;
      }
    }
    if (u && u.def.mods.raiseChance && !m.boss && this.rng.chance(u.def.mods.raiseChance)) this.raise(u, m.route, m.s, 1);
    if (m.poison.length && m.poison.some((p) => p.src?.def.mods.spread)) {
      for (const o of this.monsters) if (dist(o.x, o.y, m.x, m.y) < 1.4 && o.poison.length < MAX_POISON) o.poison.push({ ...m.poison[0], t: 3 });
    }
  }

  // ------------------------------------------------------------------ heroes
  inRange(u, m, extra = 0) { return (!m.air || u.def.kit.air) && !(m.burrowT > 0) && dist(u.x, u.y, m.x, m.y) <= this.rangeOf(u, m) + extra; }
  target(u, extra = 0) {
    let best = null, bs = -1;
    for (const m of this.monsters) {
      if (m.hp <= 0 || !this.inRange(u, m, extra)) continue;
      const s = m.s / m.route.len + (m.boss || m.lt ? 0.02 : 0);
      if (s > bs) { bs = s; best = m; }
    }
    return best;
  }
  /** The point with the most foes within r, among foes u can reach. */
  crowd(u, r, extra = 0) {
    let best = null, bn = 0;
    for (const m of this.monsters) {
      if (m.hp <= 0 || !this.inRange(u, m, extra)) continue;
      let n = 0; for (const o of this.monsters) if (dist(o.x, o.y, m.x, m.y) <= r) n += o.boss || o.lt ? 3 : 1;
      if (n > bn) { bn = n; best = m; }
    }
    return best && { m: best, n: bn };
  }
  updateUnits(dt) {
    for (const u of this.units) {
      u.anim += dt;
      if (u.cast > 0) u.cast -= dt;
      for (let k = u.buffs.length - 1; k >= 0; k--) if ((u.buffs[k].t -= dt) <= 0) u.buffs.splice(k, 1);
      if (u.stun > 0) { u.stun -= dt; continue; }
      const m = this.target(u), kit = u.def.kit, mods = u.def.mods;
      // skills charge while a foe is in reach, and fire on their own when full
      if (m) u.charge += dt * (1 + (mods.skillCharge || 0)) * (1 + 0.1 * (u.lvl - 1));
      const full = u.def.skill.charge;
      if (u.charge >= full && m && this.skill(u)) u.charge = 0;
      if ((u.cd -= dt) > 0 || !m) continue;
      u.cd = this.rateOf(u) * (mods.frenzy ? 1 / (1 + mods.frenzy * 0.5) : 1);
      const dx = m.x - u.x, dy = m.y - u.y, sdx = dx - dy;
      if (Math.abs(sdx) > 0.01) u.face = sdx > 0 ? 1 : -1;
      this.attack(u, m);
    }
  }
  /** One attack by class: projectiles, melee arcs, cones, chains. */
  attack(u, m) {
    const kit = u.def.kit, mods = u.def.mods, atk = this.atkOf(u), el = kit.el;
    u.shots++; u.anim = 0;
    this.ev({ type: 'attack', u, m });
    const fx = kit.fx;
    const extraTargets = () => { const n = mods.multishot || 0, out = []; if (!n) return out; for (const o of this.monsters) if (o !== m && this.inRange(u, o) && out.length < n) out.push(o); return out; };
    switch (fx) {
      case 'hammer': case 'cleave': case 'frostslash': case 'slimeslam': {
        this.damage(m, atk, u, el);
        if (fx === 'cleave' || fx === 'hammer') {
          const k = fx === 'cleave' ? (mods.cleaveFull ? 1 : kit.cleave) : 0.45;
          for (const o of this.monsters.slice()) if (o !== m && !o.air && dist(o.x, o.y, m.x, m.y) <= 1.1) this.damage(o, atk * k, u, el);
        }
        if (fx === 'frostslash' && kit.leech) this.slowM(m, 0.25 + (mods.slow || 0), 1.5);
        if (fx === 'slimeslam') this.slowM(m, kit.slow + (mods.slow || 0), 2);
        if (mods.slow && fx !== 'slimeslam' && fx !== 'frostslash') this.slowM(m, mods.slow, 1.5);
        this.ev({ type: 'melee', u, m, fx });
        break;
      }
      case 'thrust': {
        const hits = this.line(u.x, u.y, m.x, m.y, this.rangeOf(u, m) + 0.3, 0.5).slice(0, kit.pierce + (mods.pierce || 0));
        for (const o of hits) this.damage(o, atk, u, el);
        this.ev({ type: 'melee', u, m, fx });
        break;
      }
      case 'breath': {
        const r = this.rangeOf(u, m) + 0.2, a0 = Math.atan2(m.y - u.y, m.x - u.x);
        for (const o of this.monsters.slice()) {
          if (dist(o.x, o.y, u.x, u.y) > r) continue;
          let da = Math.abs(Math.atan2(o.y - u.y, o.x - u.x) - a0); if (da > Math.PI) da = 2 * Math.PI - da;
          if (da < 0.62) { this.damage(o, atk, u, el); this.burnM(o, atk * (kit.burn || 0.3) * (1 + (mods.burnP || 0)), 3); }
        }
        this.ev({ type: 'breath', u, m, r });
        break;
      }
      case 'leap': {
        this.shots.push({ kind: 'leap', u, m, x: m.x, y: m.y, z: m.z, t: 0, dur: 0.38, dmg: atk, el, splash: kit.splash, hits: (mods.multihit || 0) + 1 });
        u.leap = { x: m.x, y: m.y, t: 0, dur: 0.75 };
        break;
      }
      case 'chain': {
        let cur = m; const seen = new Set();
        for (let k = 0; k < (kit.chain || 1) + (mods.chain || 0) && cur; k++) {
          seen.add(cur);
          this.shots.push({ kind: 'bolt', u, m: cur, from: k ? [...seen][k - 1] : null, x: cur.x, y: cur.y, z: cur.z, t: -k * 0.06, dur: 0.05, dmg: atk * (k ? 0.75 : 1), el });
          let nx = null, nd = 2.2;
          for (const o of this.monsters) if (!seen.has(o) && dist(o.x, o.y, cur.x, cur.y) < nd) { nd = dist(o.x, o.y, cur.x, cur.y); nx = o; }
          cur = nx;
        }
        break;
      }
      case 'boomerang': {
        const r = this.rangeOf(u, m) + 0.4, a = Math.atan2(m.y - u.y, m.x - u.x);
        const n = 1 + (mods.multishot || 0);
        for (let k = 0; k < n; k++) {
          const aa = a + (k - (n - 1) / 2) * 0.35;
          this.shots.push({ kind: 'rang', u, x: u.x, y: u.y, z: u.z + 0.6, ex: u.x + Math.cos(aa) * r, ey: u.y + Math.sin(aa) * r, t: 0, dur: 1.1, dmg: atk, el, hit: new Map() });
        }
        break;
      }
      default: { // projectiles: arrow, bullet, fireball, bonespear, crow, note, starfall
        const speed = { arrow: 13, bullet: 22, fireball: 8, bonespear: 12, crow: 7, note: 7.5, starfall: 0 }[fx] ?? 10;
        const targets = [m, ...extraTargets()];
        for (const t of targets) {
          const bomb = mods.bombEvery && u.shots % mods.bombEvery === 0;
          const d = dist(u.x, u.y, t.x, t.y);
          const s = { kind: bomb ? 'bomb' : fx, u, m: t, x: u.x, y: u.y, z: u.z + 1.1, sx: u.x, sy: u.y, sz: u.z + 1.1, t: 0,
            dur: fx === 'starfall' ? 0.55 : bomb ? 0.6 : Math.max(0.06, d / speed), dmg: atk * (bomb ? 2 : 1), el,
            splash: bomb ? 1 : (kit.splash || 0) + (mods.splash || 0), pierce: kit.pierce ? kit.pierce + (mods.pierce || 0) : 0, homing: fx === 'crow' || fx === 'note' };
          this.shots.push(s);
        }
      }
    }
  }
  slowM(m, v, t) { if (m.boss) v *= 0.5; m.slow = Math.max(m.slow, v); m.slowT = Math.max(m.slowT, t); }
  burnM(m, dps, t) { m.burn = Math.max(m.burn, dps); m.burnT = Math.max(m.burnT, t); }
  stunM(m, t) { m.stun = Math.max(m.stun, m.boss ? t * 0.35 : m.lt ? t * 0.6 : t); }
  poisonM(m, dps, src) { if (m.poison.length >= MAX_POISON) m.poison.shift(); m.poison.push({ dps, t: 4, src }); }
  /** Foes within w of the segment from (x0,y0) toward (x1,y1), out to length len, nearest first. */
  line(x0, y0, x1, y1, len, w) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, out = [];
    for (const o of this.monsters) {
      const px = o.x - x0, py = o.y - y0, along = px * ux + py * uy;
      if (along < 0 || along > len) continue;
      if (Math.abs(px * uy - py * ux) <= w) out.push([along, o]);
    }
    return out.sort((a, b) => a[0] - b[0]).map((a) => a[1]);
  }
  splash(x, y, r, dmg, u, el, except) {
    for (const o of this.monsters.slice()) if (o !== except && dist(o.x, o.y, x, y) <= r) this.damage(o, dmg, u, el);
  }

  updateShots(dt) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.t += dt;
      if (s.t < 0) continue;
      const u = s.u, k = s.t / s.dur;
      if (s.kind === 'rang') {
        // out to the far point and back to the thrower, hitting everything it passes (each foe once per 0.5s)
        const f = k < 0.5 ? k * 2 : 2 - k * 2, e = 1 - (1 - f) * (1 - f);
        s.x = u.x + (s.ex - u.x) * e; s.y = u.y + (s.ey - u.y) * e;
        for (const o of this.monsters.slice()) {
          if (dist(o.x, o.y, s.x, s.y) > 0.55) continue;
          if (s.hit.get(o) > s.t - 0.5) continue;
          s.hit.set(o, s.t);
          this.damage(o, s.dmg, u, s.el);
          if (u.def.mods.slow) this.slowM(o, u.def.mods.slow, 1.2);
        }
        if (k >= 1) this.shots.splice(i, 1);
        continue;
      }
      if (s.kind === 'leap') {
        if (k >= 1) {
          for (let h = 0; h < s.hits; h++) {
            if (!s.m.dead) this.damage(s.m, s.dmg, u, s.el);
            this.splash(s.x, s.y, s.splash || 0.7, s.dmg * 0.6, u, s.el, s.m);
          }
          this.ev({ type: 'land', u, x: s.x, y: s.y, z: s.z, r: s.splash || 0.7 });
          this.shots.splice(i, 1);
        }
        continue;
      }
      if (s.kind === 'arrowrain' || s.kind === 'meteor' || s.kind === 'supernova' || s.kind === 'cannon') { // falls from the sky onto a spot
        if (s.kind !== 'arrowrain' && !s.m.dead && s.t < s.dur * 0.6) { s.x = s.m.x; s.y = s.m.y; s.z = s.m.z; }
        if (k >= 1) {
          for (const o of this.monsters.slice()) if (dist(o.x, o.y, s.x, s.y) <= s.splash) {
            this.damage(o, s.dmg, u, s.el);
            if (s.burn && !o.dead) this.burnM(o, s.dmg * 0.12, 4);
          }
          this.ev({ type: 'impact', s, x: s.x, y: s.y, z: s.z, r: s.splash });
          this.shots.splice(i, 1);
        }
        continue;
      }
      if (s.kind === 'bolt') {
        if (!s.done) { s.done = true; if (!s.m.dead) this.damage(s.m, s.dmg, u, s.el); }
        if (s.t > 0.18) this.shots.splice(i, 1);
        continue;
      }
      // projectile toward a foe (homing follows it; the rest aim where it was)
      if (!s.m.dead) { s.tx = s.m.x; s.ty = s.m.y; s.tz = s.m.z + 0.7; }
      else if (s.tx === undefined) { s.tx = s.m.x; s.ty = s.m.y; s.tz = s.m.z; }
      const e = Math.min(1, k);
      s.px = s.x; s.py = s.y;
      s.x = s.sx + (s.tx - s.sx) * e; s.y = s.sy + (s.ty - s.sy) * e;
      s.z = s.sz + (s.tz - s.sz) * e + (s.kind === 'fireball' || s.kind === 'bomb' ? Math.sin(e * Math.PI) * (s.kind === 'bomb' ? 2.2 : 0.6) : 0);
      if (s.pierce) { // a bone spear goes through foes on its way
        s.hitset ||= new Set();
        for (const o of this.monsters.slice()) if (!s.hitset.has(o) && s.hitset.size < s.pierce && dist(o.x, o.y, s.x, s.y) < 0.45) { s.hitset.add(o); this.damage(o, s.dmg, u, s.el); }
      }
      if (k >= 1) {
        this.shots.splice(i, 1);
        if (!s.pierce || !s.hitset?.has(s.m)) if (!s.m.dead && dist(s.m.x, s.m.y, s.tx, s.ty) < 0.8) this.damage(s.m, s.dmg, u, s.el);
        if (s.splash) this.splash(s.tx, s.ty, s.splash, s.dmg * 0.6, u, s.el, s.m);
        const mods = u.def.mods;
        if (s.kind === 'crow') this.poisonM(s.m, s.dmg * u.def.kit.poison * (1 + (mods.poisonP || 0)), u);
        if (mods.burn && !s.m.dead) this.burnM(s.m, s.dmg * mods.burn, 3);
        if (mods.slow && !s.m.dead) this.slowM(s.m, mods.slow, 1.5);
        this.ev({ type: 'impact', s, x: s.tx, y: s.ty, z: s.tz, r: s.splash });
      }
    }
  }

  // ------------------------------------------------------------------ skills
  skill(u) {
    const id = u.def.skill.id, mods = u.def.mods, atk = this.atkOf(u), P = 1 + (mods.skillPower || 0), el = u.def.kit.el;
    const at = (m) => ({ x: m.x, y: m.y, z: m.z });
    let where = null;
    switch (id) {
      case 'dawnbreak': {
        if (!this.monsters.some((m) => !m.air && dist(m.x, m.y, u.x, u.y) < 2)) return false;
        this.splash(u.x, u.y, 1.9, atk * 3 * P, u, 'holy');
        for (const m of this.monsters) if (dist(m.x, m.y, u.x, u.y) < 1.9) this.stunM(m, 1.5 * (1 + (mods.stunP || 0)));
        for (const o of this.units) if (dist(o.x, o.y, u.x, u.y) <= 2.5) o.buffs.push({ atk: 0.25, t: 6 });
        where = { x: u.x, y: u.y, z: u.z, r: 1.9 };
        break;
      }
      case 'volley': {
        const m = this.target(u);
        if (!m) return false;
        for (let k = 0; k < 10; k++) this.shots.push({ kind: 'arrowrain', u, m, x: m.x + this.rng.range(-1, 1), y: m.y + this.rng.range(-1, 1), z: m.z, t: -k * 0.18, dur: 0.35, dmg: atk * 0.9 * P, el, splash: 0.7 });
        where = at(m);
        break;
      }
      case 'meteor': case 'supernova': case 'cannonade': {
        const c = this.crowd(u, 1.6, 0.8);
        if (!c) return false;
        if (id === 'cannonade') {
          const ms = this.monsters.filter((m) => this.inRange(u, m, 0.8)).sort((a, b) => b.s - a.s).slice(0, 5);
          ms.forEach((m, k) => this.shots.push({ kind: 'cannon', u, m, x: m.x, y: m.y, z: m.z, t: -k * 0.22, dur: 0.6, dmg: atk * 2.6 * P, el: 'fire', splash: 1.1 }));
        } else {
          const r = id === 'meteor' ? 1.6 : 2.2;
          if (id === 'supernova') for (const m of this.monsters) if (dist(m.x, m.y, c.m.x, c.m.y) < r + 0.8) this.slowM(m, 0.9, 1);
          const twice = mods.skillTwice ? 2 : 1;
          for (let k = 0; k < twice; k++)
            this.shots.push({ kind: id, u, m: c.m, x: c.m.x, y: c.m.y, z: c.m.z, t: -k * 0.5, dur: id === 'meteor' ? 0.8 : 1.0, dmg: atk * (id === 'meteor' ? 5.2 : 7.6) * P, el, splash: r, burn: id === 'meteor' });
        }
        where = at(c.m);
        break;
      }
      case 'legion': {
        const m = this.target(u);
        if (!m) return false;
        for (let k = 0; k < 2 + (mods.extraSummon || 0); k++) this.raise(u, m.route, Math.max(0.5, m.s + 0.8 + k * 0.6), 1 + (mods.summonP || 0));
        where = at(m);
        break;
      }
      case 'whirlwind': {
        if (!this.monsters.some((m) => !m.air && dist(m.x, m.y, u.x, u.y) < 1.6)) return false;
        this.zones.push({ kind: 'whirl', u, x: u.x, y: u.y, z: u.z, r: 1.6, t: 5, tick: 0, every: 0.25, dmg: atk * 0.7 * P, el, ground: true });
        where = { x: u.x, y: u.y, z: u.z };
        break;
      }
      case 'dive': {
        const c = this.crowd(u, 1.3, 2.1);
        if (!c) return false;
        this.shots.push({ kind: 'leap', u, m: c.m, x: c.m.x, y: c.m.y, z: c.m.z, t: 0, dur: 0.55, dmg: atk * 3.6 * P, el, splash: 1.3, hits: (mods.multihit || 0) + 1, dive: true });
        u.leap = { x: c.m.x, y: c.m.y, t: 0, dur: 1.1, big: true };
        for (const m of this.monsters) if (dist(m.x, m.y, c.m.x, c.m.y) < 1.3) this.stunM(m, 1.2 * (1 + (mods.stunP || 0)));
        where = at(c.m);
        break;
      }
      case 'thundertotem': case 'jellywall': {
        const m = this.target(u, 0.5);
        if (!m || m.air) return false;
        const s = Math.min(m.route.len - 0.5, m.s + 1.2), p = routeAt(m.route, s, [0, 0, 0]);
        if (id === 'thundertotem') this.zones.push({ kind: 'totem', u, route: m.route, s, x: p[0], y: p[1], z: p[2], r: 2, t: 8 + (mods.skillLong || 0), tick: 0, every: 0.5, dmg: atk * 0.6 * P, el: 'light', slow: 0.35 + (mods.slow || 0) });
        else this.zones.push({ kind: 'jelly', u, route: m.route, s, x: p[0], y: p[1], z: p[2], r: 1, t: 6 + (mods.skillLong || 0), hold: 3 + (mods.block || 0) + u.def.kit.block, holding: new Set(), tick: 0, every: 0.5, dmg: atk * 0.3 * P, el: 'acid', slow: 0.4 });
        where = { x: p[0], y: p[1], z: p[2] };
        break;
      }
      case 'obliterate': {
        const m = this.target(u, 0.3);
        if (!m) return false;
        this.damage(m, atk * 4.2 * P, u, 'cold');
        this.splash(m.x, m.y, 1.5, atk * 1.2 * P, u, 'cold', m);
        for (const o of this.monsters) if (dist(o.x, o.y, m.x, m.y) < 1.5) this.stunM(o, 2 * (1 + (mods.stunP || 0)));
        where = at(m);
        break;
      }
      case 'murder': {
        if (!this.target(u)) return false;
        this.zones.push({ kind: 'crows', u, x: u.x, y: u.y, z: u.z, r: this.rangeOf(u) + 0.3, t: 5, tick: 0, every: 0.5, dmg: atk * 0.6 * P, el: 'poison', max: 12 });
        where = { x: u.x, y: u.y, z: u.z };
        break;
      }
      case 'crescendo': {
        if (!this.target(u)) return false;
        const r = 3, heal = mods.skillHeal || 0;
        for (const o of this.units) if (dist(o.x, o.y, u.x, u.y) <= r) o.buffs.push({ atk: 0.45 * P, rate: 0.45 * P, t: 9, song: true });
        for (const m of this.monsters) if (dist(m.x, m.y, u.x, u.y) <= r) { this.stunM(m, 1.5); this.damage(m, atk * 2 * P, u, 'arcane'); }
        where = { x: u.x, y: u.y, z: u.z, r, heal };
        break;
      }
      case 'eclipse': {
        if (!this.target(u)) return false;
        this.zones.push({ kind: 'eclipse', u, x: u.x, y: u.y, z: u.z, r: 2, t: 6 + (mods.skillLong || 0), tick: 0, every: 0.3, dmg: atk * 0.8 * P, el: 'phys', ang: 0 });
        where = { x: u.x, y: u.y, z: u.z };
        break;
      }
      case 'phalanx': {
        const m = this.target(u, 0.5);
        if (!m) return false;
        for (const o of this.monsters.slice()) if (!o.air && dist(o.x, o.y, u.x, u.y) <= 2.6) {
          this.damage(o, atk * 2.8 * P, u, 'light');
          if (!o.dead && !o.boss) { o.s = Math.max(0, o.s - 1.5); routeAt(o.route, o.s, this.tmp); [o.x, o.y, o.z] = this.tmp; }
        }
        where = at(m);
        break;
      }
      case 'wyrmfire': {
        const m = this.target(u, 1.8);
        if (!m) return false;
        const a0 = Math.atan2(m.y - u.y, m.x - u.x), r = 3.5 + (mods.range || 0);
        for (const o of this.monsters.slice()) {
          if (dist(o.x, o.y, u.x, u.y) > r) continue;
          let da = Math.abs(Math.atan2(o.y - u.y, o.x - u.x) - a0); if (da > Math.PI) da = 2 * Math.PI - da;
          if (da < 0.7) { this.damage(o, atk * 3.2 * P, u, 'fire'); this.burnM(o, atk * 0.4 * (1 + (mods.burnP || 0)), 5); }
        }
        where = { x: u.x, y: u.y, z: u.z, ang: a0, r };
        break;
      }
      default: return false;
    }
    u.cast = 0.6; this.skillsCast = (this.skillsCast || 0) + 1;
    this.ev({ type: 'skill', u, id, where });
    return true;
  }
  raise(u, route, s, power) {
    const p = routeAt(route, s, [0, 0, 0]);
    this.summons.push({ u, route, s, x: p[0], y: p[1], z: p[2], hp: this.atkOf(u) * 9 * power, maxHp: this.atkOf(u) * 9 * power, t: 14 * (u.def.mods.summonP ? 2 : 1), atk: this.atkOf(u) * 0.6 * power, cd: 0, foe: null, face: 1 });
    this.ev({ type: 'raise', x: p[0], y: p[1], z: p[2] });
  }
  updateSummons(dt) {
    for (let i = this.summons.length - 1; i >= 0; i--) {
      const sk = this.summons[i];
      sk.t -= dt;
      if (sk.foe && (sk.foe.dead || sk.foe.held !== sk)) sk.foe = null;
      if (sk.foe && (sk.cd -= dt) <= 0) { sk.cd = 1; this.damage(sk.foe, sk.atk, sk.u, 'shadow'); this.ev({ type: 'melee', u: sk, m: sk.foe, fx: 'skeleton' }); }
      if (sk.t <= 0 || sk.hp <= 0) {
        if (sk.foe) sk.foe.held = null;
        sk.dead = true; this.summons.splice(i, 1);
        this.ev({ type: 'unraise', x: sk.x, y: sk.y, z: sk.z });
      }
    }
  }
  updateZones(dt) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.t -= dt;
      if (z.kind === 'whirl') { z.x = z.u.x; z.y = z.u.y; }
      if (z.kind === 'eclipse') z.ang += dt * 4.5;
      if ((z.tick -= dt) <= 0) {
        z.tick = z.every;
        if (z.kind === 'crows') {
          const ts = this.monsters.filter((m) => dist(m.x, m.y, z.x, z.y) <= z.r).slice(0, z.max);
          for (const m of ts) { this.damage(m, z.dmg, z.u, 'poison'); if (!m.dead) this.poisonM(m, z.dmg * 2 * (1 + (z.u.def.mods.poisonP || 0)), z.u); }
          this.ev({ type: 'crows', z, ts });
        } else if (z.kind === 'eclipse') {
          const rx = z.x + Math.cos(z.ang) * z.r, ry = z.y + Math.sin(z.ang) * z.r;
          for (const m of this.monsters.slice()) if (dist(m.x, m.y, rx, ry) < 0.9 || dist(m.x, m.y, z.x, z.y) < 0.7) this.damage(m, z.dmg, z.u, 'phys');
        } else {
          for (const m of this.monsters.slice()) {
            if (z.ground && m.air) continue;
            if (dist(m.x, m.y, z.x, z.y) <= z.r) { this.damage(m, z.dmg, z.u, z.el); if (z.slow && !m.dead) this.slowM(m, z.slow, 0.8); }
          }
        }
      }
      if (z.t <= 0) {
        if (z.holding) for (const m of z.holding) if (m.held === z) m.held = null;
        z.dead = true; this.zones.splice(i, 1);
      }
    }
  }
}
