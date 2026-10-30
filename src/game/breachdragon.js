// The Ethereal Wyrm (docs/ETERNAL_BREACH.md): every floor of the Eternal Breach has one, a long wingless parade
// dragon of glowing scales (violet, the Breach's own, or red, black, jade, gold, silver or white; data/breach.js
// WYRM_VARIANTS), longer, faster and deadlier floor by floor (wyrmStats). Drawn by gfx/breachdragon.js.
//  - away:     it swims deep in the void under the islands, faint between them, for 20-70 s
//  - approach: it rises out of sight and lines up on the hero (most often while he crosses a walkway)
//  - pass:     it sweeps straight through him at body height, a line warning on the ground first; every segment that
//              touches him bites (unhittable: it is still ethereal). It bends round and comes back for 2-5 passes,
//              breathing on the later floors, then
//  - leave:    climbs away and sinks back into the void.
//  - fight:    once two thirds of the shrines are won, the next time it comes for the hero standing on an island it
//              stays: the walkways off that island are warded, and it coils round the island at body height, diving
//              across it, biting, breathing, raining void orbs and calling its brood at 2/3 and 1/3 life. Its body is
//              solid now: the hero strikes whichever part of it is nearest (a hidden boss monster, the hitbox, rides
//              along the body). The Breach Heart answers only once it is slain; its hoard is an Epic or better.
// The fight speaks the run's scenario shape (title, foes, objective...) so the HUD, the wards and auto-play follow it.
import { G } from '../state.js';
import { UI } from '../ui/ui.js';
import { RNG, rand, chance, TAU, clamp, angleDiff, pick } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { elevationAt, camera } from '../core/view.js';
import { makeMonster } from './monster.js';
import { hit } from './combat.js';
import { Delayed, Area } from './hazards.js';
import { GroundItem } from './loot.js';
import { rollItem, rarityAt, RARITY, goldLvl } from '../data/items.js';
import { ARCH } from '../data/enemies.js';
import { wyrmVariant, wyrmStats, WYRM_NAMES, breachReward } from '../data/breach.js';
import { addEffect, Ring, Telegraph, sparkle, spawn, floatText, addLight, Column, elem } from '../gfx/vfx.js';
import { preloadWyrm, wyrmR, WYRM_TILE } from '../gfx/breachdragon.js';

const POOL = { arcane: 'void', fire: 'fire', shadow: 'void', poison: 'poison', holy: 'holy', light: 'storm', cold: 'frost' };
const STEP = 0.07;                        // tiles between trail samples

/**
 * The floor's wyrm. h: { world, gen, floor, lvl, rng, islands, own, islandAt, lock(o, on), arrive(o, kind, n, opts),
 * run() (the run, for won/others/active) }. Returns { w (what gfx draws), S (its fight, a scenario for the run), update }.
 */
export function createWyrm(h) {
  const { world, floor, lvl, rng } = h, map = world.map, W = map.w;
  const v = wyrmVariant(floor, rng.fn()), st = wyrmStats(floor);
  const name = `${WYRM_NAMES[Math.floor(rng.next() * WYRM_NAMES.length)]}, the ${v.name} Wyrm`;
  preloadWyrm();
  const n = st.segs, R = wyrmR() * st.scale, sp = (R * 0.78) / WYRM_TILE;   // segment spacing in tiles
  const w = {
    layer: 'void', variant: v, name, head: v.heads[Math.floor(rng.next() * v.heads.length)], claw: v.claw, scale: st.scale,
    alpha: 0.5, x: 0, y: 0, alt: 0, ang: rng.next() * TAU, segs: [], claws: [], dissolve: 0, flash: 0, rage: 0, charge: 0, bite: 0,
  };
  for (const f of [0.16, 0.5]) for (const side of [1, -1]) w.claws.push({ i: Math.round(n * f), side });
  // where it starts: far off in the void from the start island
  const P0 = h.islands[h.gen.startIsland];
  w.x = clamp(P0.cx + Math.cos(w.ang) * 30, 4, W - 4); w.y = clamp(P0.cy + Math.sin(w.ang) * 30, 4, map.h - 4);
  w.alt = elevationAt(P0.cx, P0.cy) - 240;
  const trail = [];   // head positions, newest first, every STEP tiles
  for (let k = 0; k <= n * sp / STEP + 4; k++) trail.push({ x: w.x - Math.cos(w.ang) * k * STEP, y: w.y - Math.sin(w.ang) * k * STEP, alt: w.alt });
  let moved = 0;
  /** Put the head at (x, y) with the body laid out straight behind it. */
  const place = (x, y, alt = w.alt) => { w.x = x; w.y = y; w.alt = alt; trail.length = 0; for (let k = 0; k <= n * sp / STEP + 4; k++) trail.push({ x: x - Math.cos(w.ang) * k * STEP, y: y - Math.sin(w.ang) * k * STEP, alt }); };

  // ---------------------------------------------------------------- the hitbox: a hidden boss riding the body
  const look = world.looks.boss(0);
  const m = makeMonster(world, look.arch, world.biome, lvl + 2, 'boss', w.x, w.y, 0, look.look);
  const A = ARCH[look.arch] || { hp: 1, dmg: 1 };
  m.maxHp = m.hp = (m.maxHp / (A.hp || 1)) * st.hpMul; m.dmg = (m.dmg / (A.dmg || 1)) * st.dmgMul; m.xp *= 3;
  Object.assign(m, { name, breach: true, breachBoss: true, wyrm: true, static: true, fly: true, r: 0.75, artH: 70, goreType: 'ecto', el: w.variant.el, invuln: Infinity, targetable: false, awake: true });
  m.affixes = [];
  m.wardTick = () => { m.moving = false; };
  m.draw = () => {}; m.drawOverhead = () => {};
  m.onDamaged = () => { w.flash = 0.12; };
  m.onDeath = () => { m.sprite = null; m.art = null; };   // (no corpse: it comes apart into light)

  // ---------------------------------------------------------------- its fight, as the run's scenario
  const S = { type: 'wyrm', wyrm: true, title: name, description: `${name} coils round the island. Strike whatever part of it comes near; its brood answers its cries.`,
    o: null, C: [0, 0], active: false, completed: false, failed: false, stage: 0, goal: 3, seconds: 0, timer: 0, foes: [], markers: [], extras: [], locks: [], boss: true,
    objective: undefined, onIsland: () => true, busy: () => false, update: () => {}, start: () => {}, progress: () => `${name.split(',')[0]} · life ${Math.ceil(100 * m.hp / m.maxHp)}%` };

  let state = 'away', T = rand(st.away[0] * 0.5, st.away[1] * 0.6), passes = 0, aim = null, goal = [w.x, w.y], altGoal = w.alt, speed = 2.5, turn = 1;
  let hitCd = 0, breathed = false, atkT = 0, atk = null, lastPhase = 0, slain = false, dieT = 0;
  const P = () => world.player;
  const ground = () => { const p = P(); return p ? elevationAt(p.x, p.y) : 0; };
  const heroOn = () => { const p = P(); return p ? h.islandAt(p.x, p.y) : -1; };
  const onWalkway = () => { const p = P(); return p && heroOn() < 0 && map.breach.bridgeOf[map.tileIdx(p.x, p.y)] >= 0; };
  const due = () => !slain && h.run().won >= Math.ceil(h.run().others * 2 / 3);
  const dist = (x, y) => Math.hypot(w.x - x, w.y - y);
  const roar = (vol = 0.8) => { sfx('roar', vol); camera.shake(4); };
  const go = (s, t = 0) => { state = s; T = t; };

  // ---------------------------------------------------------------- motion: the head steers, the body follows its trail
  function steer(dt) {
    const want = Math.atan2(goal[1] - w.y, goal[0] - w.x);
    w.ang += clamp(angleDiff(w.ang, want), -turn * dt, turn * dt);
    w.x += Math.cos(w.ang) * speed * dt; w.y += Math.sin(w.ang) * speed * dt;
    w.alt += clamp(altGoal - w.alt, -160 * dt, 160 * dt);
    moved += speed * dt;
    while (moved >= STEP) { moved -= STEP; trail.unshift({ x: w.x, y: w.y, alt: w.alt }); }
    trail.length = Math.min(trail.length, Math.ceil(n * sp / STEP) + 6);
    // the segments along the trail, bobbing like a parade dragon's poles
    const t = G.time;
    for (let i = 0; i < n; i++) {
      const k = Math.min(trail.length - 2, ((i + 1) * sp) / STEP), a = Math.floor(k), f = k - a, p = trail[a], q = trail[a + 1];
      const s = w.segs[i] || (w.segs[i] = { x: 0, y: 0, alt: 0, ang: 0, s: 1, g: null });
      s.x = p.x + (q.x - p.x) * f; s.y = p.y + (q.y - p.y) * f;
      s.alt = p.alt + (q.alt - p.alt) * f + Math.sin(t * 3 - i * 0.45) * R * 0.45;
      const prev = i ? w.segs[i - 1] : w;
      s.ang = Math.atan2(prev.y - s.y, prev.x - s.x);
      s.s = i === n - 1 ? 0.8 : i < 3 ? 0.82 + i * 0.06 : 1 - 0.5 * Math.max(0, (i / n - 0.55) / 0.45);
      s.g = w.layer === 'top' && i % 2 === 0 && map.isFloor(s.x, s.y) ? elevationAt(s.x, s.y) : null;
    }
  }
  /** A segment (or the head) over the hero at body height. */
  function touching(p, reach = 0.75) {
    const g = elevationAt(p.x, p.y) + 24;
    if (Math.hypot(w.x - p.x, w.y - p.y) < reach * st.scale * 0.9 && Math.abs(w.alt - g) < 60) return true;
    for (let i = 0; i < n; i += 2) { const s = w.segs[i]; if (Math.hypot(s.x - p.x, s.y - p.y) < reach * st.scale * s.s && Math.abs(s.alt - g) < 60) return true; }
    return false;
  }
  function contact(dt, mul = 1) {
    const p = P();
    if ((hitCd -= dt) > 0 || !p || p.dead) return;
    if (!touching(p)) return;
    hitCd = 0.9;
    hit(m, p, m.dmg * 1.1 * mul, w.variant.el, { knock: 0.6, ang: w.ang });
    sparkle(p.x, p.y, 30, w.variant.glow, 14, 0.6);
  }
  // particles shed from the body: motes in the glow colour, at the body's own height over whatever is below it
  function shed(dt) {
    const k = w.layer === 'top' ? 34 : 8;
    for (let j = 0; j < 3; j++) {
      if (!chance(dt * k / 3)) continue;
      const s = w.segs[Math.floor(Math.random() * n)];
      if (!s) continue;
      spawn({ type: 'glow', x: s.x + rand(-0.3, 0.3), y: s.y + rand(-0.3, 0.3), z: s.alt - elevationAt(s.x, s.y) + rand(-8, 12), vz: rand(6, 22), vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), life: rand(0.6, 1.3), size: rand(2, 4.5) * st.scale, size1: 0, color: w.variant.glow, add: true });
    }
    const tl = w.segs[n - 1];
    if (tl && w.layer === 'top' && chance(dt * 8)) spawn({ type: 'glow', x: tl.x, y: tl.y, z: tl.alt - elevationAt(tl.x, tl.y), vx: -Math.cos(tl.ang) * 1.5, vy: -Math.sin(tl.ang) * 1.5, vz: rand(-4, 8), life: 0.7, size: 3 * st.scale, size1: 0, color: w.variant.glow, add: true });
    if (w.layer === 'top' && (G.frame & 3) === 0 && Math.hypot(w.x - (P()?.x || 0), w.y - (P()?.y || 0)) < 16) addLight(w.x, w.y, 4.5, 0.9, w.alt - elevationAt(w.x, w.y), w.variant.glow);
  }

  // ---------------------------------------------------------------- the passes
  function lineUp() {
    const p = P(), a = rng.next() * TAU;
    aim = [p.x + Math.cos(a) * 15, p.y + Math.sin(a) * 15];
    goal = aim; altGoal = ground() + 120; speed = st.speed * 1.2; turn = st.turn;
    if (w.layer !== 'top') { w.layer = 'top'; w.alpha = 0.95; }
    go('approach', 7);
  }
  function startPass() {
    const p = P(), lead = 0.5, ax = p.x + (p.vx || 0) * lead, ay = p.y + (p.vy || 0) * lead;
    const a = Math.atan2(ay - w.y, ax - w.x);
    goal = [ax + Math.cos(a) * 13, ay + Math.sin(a) * 13]; altGoal = ground() + 26; speed = st.speed; turn = st.turn * 1.15;
    addEffect(new Telegraph({ kind: 'line', x: ax - Math.cos(a) * 5, y: ay - Math.sin(a) * 5, ang: a, len: 10, w: 0.75 * st.scale, dur: 1.1, color: w.variant.glow }), 'ground');
    roar(0.6); breathed = !st.breath;
    go('pass', 5);
  }
  function breathAt(p, len = 6.5, half = 0.42, mul = 1) {
    const mx = w.x + Math.cos(w.ang) * 0.6, my = w.y + Math.sin(w.ang) * 0.6, a = Math.atan2(p.y - my, p.x - mx);
    addEffect(new Telegraph({ kind: 'cone', x: mx, y: my, ang: a, half, len, dur: 0.75, color: w.variant.glow }), 'ground');
    w.charge = 0.01;
    world.addHazard({ t: 0, dead: false, update(dt) {
      this.t += dt; w.charge = Math.min(1, this.t / 0.75);
      if (this.t < 0.75) return true;
      if (!this.fired) {
        this.fired = true; w.charge = 0; sfx('fire', 0.7);
        const q = P();
        if (q && !q.dead) { const d = Math.hypot(q.x - mx, q.y - my), da = Math.abs(angleDiff(a, Math.atan2(q.y - my, q.x - mx))); if (d < len && da < half) hit(m, q, m.dmg * 1.25 * mul, w.variant.el, {}); }
        for (let k = 0; k < 3; k++) { const d = 2 + k * 1.8, x = mx + Math.cos(a) * d, y = my + Math.sin(a) * d; if (map.isFloor(x, y)) world.addHazard(new Area({ world, src: m, team: 'enemy', x, y, r: 0.9, dur: 3, tick: 0.5, dmg: [m.dmg * 0.12, m.dmg * 0.16], el: w.variant.el, fx: POOL[w.variant.el] || 'void' })); }
      }
      // the breath itself: a stream of glowing motes down the cone
      const E = elem(w.variant.el), z0 = w.alt - elevationAt(mx, my);
      for (let k = 0; k < 6; k++) { const aa = a + rand(-half, half), s = rand(5, 10); spawn({ type: 'glow', x: mx, y: my, z: z0, vx: Math.cos(aa) * s, vy: Math.sin(aa) * s, vz: -z0 * 1.2, drag: 1.5, life: 0.55, size: rand(4, 8), size1: 1, color: k & 1 ? w.variant.glow : E.glow, add: true }); }
      return this.t < 1.35;
    }, draw() {} });
  }
  function orbs(k = 6) {
    const p = P();
    for (let i = 0; i < k; i++) {
      const a = rng.next() * TAU, d = i ? rand(1, 4.5) : 0, x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (!map.isFloor(x, y)) continue;
      world.addHazard(new Delayed({ world, src: m, team: 'enemy', x, y, r: 1.1, delay: 1.1 + i * 0.12, dmg: [m.dmg * 0.6, m.dmg * 0.8], el: w.variant.el, fx: 'meteor' }));
    }
  }

  // ---------------------------------------------------------------- the fight
  function startFight(o) {
    S.o = o; S.C = [o.cx, o.cy]; S.active = true; S.seconds = 0; S.stage = 1;
    S.locks = h.lock(o, true);
    m.invuln = 0; m.targetable = true; m.x = P().x; m.y = P().y;
    world.add(m); world.boss = m; S.foes = [m];
    w.layer = 'top'; w.alpha = 1;
    UI.centerMsg(name.toUpperCase(), 'The wyrm comes down to fight · the walkways are sealed', 3.4);
    UI.log(`<b style="color:${w.variant.glow}">${name}</b> coils round the island. Its body is solid now: strike it!`, w.variant.glow);
    sfx('boss'); roar(1);
    go('coil'); atkT = 2.5;
  }
  /** The point of the body nearest the hero over this island's walkable ground: where the hitbox rides. */
  function placeHitbox() {
    const p = P(), o = S.o;
    let best = null, bd = Infinity;
    const test = (x, y, alt) => {
      const i = map.tileIdx(x, y);
      if (h.own[i] !== o.idx || !map.walkableTile(Math.floor(x), Math.floor(y)) || Math.abs(alt - elevationAt(x, y) - 30) > 90) return;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < bd) { bd = d; best = [x, y]; }
    };
    test(w.x, w.y, w.alt);
    for (let i = 1; i < n; i += 2) test(w.segs[i].x, w.segs[i].y, w.segs[i].alt);
    if (best) { m.x = best[0]; m.y = best[1]; m.targetable = true; } else m.targetable = false;
  }
  function fightTick(dt) {
    const p = P(), o = S.o, k = m.hp / m.maxHp;
    S.seconds += dt;
    // phases: the brood at 2/3 and 1/3, faster and angrier each time
    const ph = k < 1 / 3 ? 2 : k < 2 / 3 ? 1 : 0;
    if (ph > lastPhase) {
      lastPhase = ph; S.stage = ph + 1; w.rage = ph / 2;
      roar(1); UI.centerMsg(ph === 1 ? 'THE WYRM CALLS ITS BROOD' : 'THE WYRM RAGES', name, 2.4);
      if (st.brood || ph === 2) for (const mm of h.arrive(o, 'coalesce', 2 + Math.floor(floor / 5) + ph, { near: p })) S.foes.push(mm);
    }
    const haste = 1 + w.rage * 0.35;
    const coilR = Math.max(3, o.r - 1.2);
    const around = (dirSign = 1) => {
      const a = Math.atan2(w.y - o.cy, w.x - o.cx) + 0.7 * dirSign;
      goal = [o.cx + Math.cos(a) * coilR, o.cy + Math.sin(a) * coilR];
    };
    const g = ground();
    if (!atk) {
      around(); altGoal = g + 30; speed = st.speed * 0.6 * haste; turn = st.turn * 1.3;
      if ((atkT -= dt) <= 0) {
        const pool = ['dive', 'bite', 'bite'];
        if (st.breath) pool.push('breath', 'breath');
        if (st.orbs) pool.push('orbs');
        if (st.coil || w.rage > 0.4) pool.push('coil');
        atk = { kind: pick(pool), t: 0 };
        if (atk.kind === 'dive') { const a = Math.atan2(p.y - w.y, p.x - w.x); atk.goal = [p.x + Math.cos(a) * (coilR + 3), p.y + Math.sin(a) * (coilR + 3)]; addEffect(new Telegraph({ kind: 'line', x: p.x - Math.cos(a) * 4, y: p.y - Math.sin(a) * 4, ang: a, len: 8, w: 0.75 * st.scale, dur: 0.9, color: w.variant.glow }), 'ground'); roar(0.5); }
        if (atk.kind === 'orbs') { orbs(5 + Math.floor(floor / 4)); roar(0.4); }
      }
    } else {
      atk.t += dt;
      const A2 = atk;
      if (A2.kind === 'dive') { goal = A2.goal; altGoal = g + 22; speed = st.speed * 1.05 * haste; turn = st.turn * 1.4; contact(dt, 1.2); if (dist(...A2.goal) < 1.5 || A2.t > 4) atk = null; }
      else if (A2.kind === 'bite') {
        // the head comes in low next to the hero, hangs there (the moment to hit it) and snaps
        const a = Math.atan2(w.y - p.y, w.x - p.x);
        goal = [p.x + Math.cos(a) * 1.6, p.y + Math.sin(a) * 1.6]; altGoal = g + 20;
        speed = dist(...goal) > 1.2 ? st.speed * 0.8 : 0.6; turn = 3;
        if (A2.t > 1.4 && !A2.tele) { A2.tele = true; addEffect(new Telegraph({ kind: 'cone', x: w.x, y: w.y, ang: w.ang, half: 0.7, len: 2.8, dur: 0.6, color: w.variant.glow }), 'ground'); }
        w.bite = A2.t > 1.4 ? Math.min(1, (A2.t - 1.4) / 0.6) : 0;
        if (A2.t > 2 && !A2.done) {
          A2.done = true; w.bite = -0.6; sfx('roar', 0.5);
          const d = Math.hypot(p.x - w.x, p.y - w.y), da = Math.abs(angleDiff(w.ang, Math.atan2(p.y - w.y, p.x - w.x)));
          if (d < 2.8 && da < 0.8) hit(m, p, m.dmg * 1.4, 'phys', { knock: 1 });
          sparkle(w.x, w.y, 20, w.variant.glow, 18, 0.8);
        }
        if (A2.t > 2.6) { atk = null; w.bite = 0; }
      } else if (A2.kind === 'breath') {
        around(); altGoal = g + 40; speed = st.speed * 0.35; turn = st.turn;
        if (!A2.done) { A2.done = true; breathAt(p, 7, 0.5, 1); }
        if (A2.t > 1.6) atk = null;
      } else if (A2.kind === 'coil') {
        // tight round the hero: every coil that touches him bites
        const a = Math.atan2(w.y - p.y, w.x - p.x) + 0.9;
        goal = [p.x + Math.cos(a) * 2.6, p.y + Math.sin(a) * 2.6]; altGoal = g + 24; speed = st.speed * 0.9 * haste; turn = 3.2;
        contact(dt, 0.8);
        if (A2.t > 4.5) atk = null;
      } else atk = null;
      if (!atk) atkT = st.attackCd / haste * rand(0.8, 1.2);
    }
    if (!atk || atk.kind !== 'dive') contact(dt, 0.7);
    placeHitbox();
    if (m.dead) wyrmSlain();
  }
  function wyrmSlain() {
    if (slain) return;
    slain = true; S.completed = true; S.active = false;
    h.lock(S.o, false);
    if (world.boss === m) world.boss = null;
    const il = lvl + 2, rar = rarityAt(il, breachReward(Math.max(4, floor), true));
    const p = P(), x = clamp(m.x, 1, W - 2), y = m.y;
    world.addLoot(new GroundItem(x, y, 'item', { item: rollItem(il, { rarity: rar }) }));
    for (let k = 0; k < 4; k++) world.addLoot(new GroundItem(x + rand(-1, 1), y + rand(-1, 1), 'gold', { amount: Math.round(30 * Math.pow(1.06, goldLvl(il)) * rand(0.8, 1.3)) }));
    UI.centerMsg('THE WYRM IS SLAIN', `${name} · a ${RARITY[rar].name} from its hoard`, 4);
    UI.log(`<b style="color:${w.variant.glow}">${name}</b> comes apart into light. The Breach Heart can be faced once every shrine is won.`, w.variant.glow);
    addEffect(new Column(x, y, w.variant.glow, 1, 30, 360));
    addEffect(new Ring(x, y, 0.3, 5, 1, w.variant.glow, 6));
    sfx('gate');
    if (p) camera.shake(8);
    go('die'); dieT = 0;
    UI.refresh();
    if (G.game?.autosave) G.game.autosave();
  }

  // ---------------------------------------------------------------- the director
  function update(dt) {
    const p = P();
    if (!p || G.world !== world || w.gone) return;
    w.flash = Math.max(0, w.flash - dt);
    if (state === 'die') {
      dieT += dt; w.dissolve = Math.min(1, dieT / 2.4); speed = 1.2; altGoal = w.alt + 20; goal = [w.x + Math.cos(w.ang) * 5, w.y + Math.sin(w.ang) * 5];
      steer(dt);
      const i = Math.max(0, Math.ceil(n * (1 - w.dissolve)) - 1), s = w.segs[i];
      if (s) for (let k = 0; k < 4; k++) spawn({ type: 'glow', x: s.x, y: s.y, z: s.alt - elevationAt(s.x, s.y), vx: rand(-2, 2), vy: rand(-2, 2), vz: rand(10, 60), life: rand(0.8, 1.6), size: rand(3, 7), size1: 0, color: k & 1 ? w.variant.glow : w.variant.accent, add: true });
      if (w.dissolve >= 1) w.gone = true;
      return;
    }
    const run = h.run(), busy = run.active && !S.active;
    T -= dt;
    if (state === 'away') {
      // deep under the islands, wandering
      if (dist(...goal) < 3 || T % 9 < dt) { const a = rng.next() * TAU, d = rand(14, 30); goal = [clamp(p.x + Math.cos(a) * d, 3, W - 3), clamp(p.y + Math.sin(a) * d, 3, map.h - 3)]; }
      altGoal = ground() - 150 + Math.sin(G.time * 0.4) * 50; speed = 3.2; turn = 0.9;
      w.alpha = 0.55;
      const here = heroOn(), room = here >= 0 && h.islands[here].kind !== 'small';
      if (due()) T = Math.min(T, 6);
      if (busy) T = Math.max(T, 5);   // (not while a shrine's fight is on)
      const bridgeCall = onWalkway() && T < st.away[1] * 0.6 && chance(dt * 0.5);
      if (!p.dead && (T <= 0 || bridgeCall)) {
        if (due() && room) { w.fightNext = true; lineUp(); }
        else if (due() && !bridgeCall && !onWalkway()) T = 3;   // its fight waits for an island with room
        else { w.fightNext = false; passes = st.passes; lineUp(); }
      }
    } else if (state === 'approach') {
      if (dist(...goal) < 3 || T <= 0) {
        if (w.fightNext) { const here = heroOn(); if (here >= 0 && h.islands[here].kind !== 'small' && !run.active) startFight(h.islands[here]); else { passes = st.passes; startPass(); } }
        else startPass();
      }
    } else if (state === 'pass') {
      contact(dt);
      if (!breathed && Math.hypot(w.x - p.x, w.y - p.y) < 6.5 && Math.abs(angleDiff(w.ang, Math.atan2(p.y - w.y, p.x - w.x))) < 0.5) { breathed = true; breathAt(p, 6, 0.4, 0.8); }
      if (dist(...goal) < 2 || T <= 0) {
        if (--passes > 0 && !p.dead && !busy) startPass();
        else { const a = w.ang; goal = [w.x + Math.cos(a) * 30, w.y + Math.sin(a) * 30]; altGoal = ground() + 200; speed = st.speed * 1.1; turn = 0.8; go('leave', 6); }
      }
    } else if (state === 'leave') {
      if (T <= 0 || dist(p.x, p.y) > 18) { w.layer = 'void'; place(w.x, w.y, ground() - 150); go('away', rand(...st.away)); }
    } else if (state === 'pose') { shed(dt); return;
    } else if (state === 'coil') {
      if (p.dead) return;
      fightTick(dt);
    }
    steer(dt);
    shed(dt);
  }

  // tests: force a pass now, or the fight on the hero's island
  const force = {
    pass() { passes = st.passes; w.fightNext = false; const p = P(); w.ang = rng.next() * TAU; place(p.x - Math.cos(w.ang) * 9, p.y - Math.sin(w.ang) * 9, ground() + 60); w.layer = 'top'; w.alpha = 0.95; startPass(); },
    /** Lay it out near the hero (screenshots): at (dx, dy) tiles off him, heading ang, at alt px over his ground. */
    pose(dx, dy, ang, alt = 40, curl = 1.3) {
      const p = P(), g = ground() + alt;
      w.ang = ang; place(p.x, p.y, g);
      speed = 5; turn = 2.6; altGoal = g;
      for (let k = 0; k < 150; k++) { const a = ang + curl * Math.sin(k / 24); goal = [w.x + Math.cos(a) * 4, w.y + Math.sin(a) * 4]; steer(1 / 30); }
      const ox = p.x + dx - w.x, oy = p.y + dy - w.y;
      w.x += ox; w.y += oy; for (const q of trail) { q.x += ox; q.y += oy; }
      w.layer = 'top'; w.alpha = 0.95; go('pose'); speed = 0; steer(0);
    },
    fight() { const here = heroOn(); if (here >= 0) { w.layer = 'top'; startFight(h.islands[here]); } return here >= 0; },
    get state() { return state; },
  };
  S.update = () => {};   // the director drives the fight
  return { w, S, m, update, force, get slain() { return slain; } };
}
