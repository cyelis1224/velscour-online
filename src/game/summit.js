// THE SNOWY SUMMIT (docs/SNOWY_SUMMIT.md): the run. The range (world/summit.js) is drawn in three.js (gfx/alpine3d.js,
// game/alpine.js). It directs the climb:
//  - the ridgelines: one or two things at a time hold them, and once along each ridge a few climb up out of the cloud;
//  - the plateaus: each a fight with a group (SUMMIT_ENCOUNTERS), its far side shut by a frozen iron gate that opens
//    when it is won, with a chest;
//  - the peak: an old shrine, and one of five bosses swapped into the snow (SUMMIT_BOSSES); its fall opens the exit there.
import { G } from '../state.js';
import { UI } from '../ui/ui.js';
import { camera } from '../core/view.js';
import { rand, chance, pick, clamp, shuffle } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { VZ } from '../world/caverns.js';
import { alpineHook } from './alpine.js';
import { makeMonster } from './monster.js';
import { makeRaidBoss, RAID_BOSSES } from './raid.js';
import { depthLevel } from '../data/depth.js';
import { addEffect, Ring, Column, Telegraph, burst, smoke, sparkle } from '../gfx/vfx.js';
import { hit } from './combat.js';
import { enter } from './mayhem.js';
import { dropChest } from './loot.js';
import { ART_BY_ID } from '../data/bestiary.js';

/** The plateaus' fights: [name, what the Quest Log says]. */
export const SUMMIT_ENCOUNTERS = {
  ambush: ['Buried in the Snow', 'Things lie under the snow of the plateau. Survive two waves of them.'],
  camp: ['The Frozen Camp', 'Raiders hold the plateau round their fire. Kill them and their chief.'],
  avalanche: ['Avalanche', 'The slope above lets go. Keep out from under the falling snow, and kill what comes down with it.'],
  cairns: ['The Howling Cairns', 'Three ice cairns howl the dead back up out of the snow. Break them.'],
  pack: ['The Pack of the Heights', 'A champion of the heights and its pack hold the pass.'],
};
const KINDS = Object.keys(SUMMIT_ENCOUNTERS);

export function createSummitRun(world, gen, biome, depth, win) {
  const map = world.map, W = map.w, H = map.h, sm = map.summit, F = gen.alpine.F, lvl = depthLevel(depth || 1), peak = sm.peak;
  world.ambushT = Infinity;   // the summit directs its own fights
  world.biome = { ...world.biome, dark: 0.04 };
  world.darkK = 0; world.night = false; world.raining = false;
  const exit = world.portals.find((q) => q.type === 'exit');
  const exitAt = [exit.x, exit.y];
  exit.x = exit.y = -100;   // the portal opens on the peak when its boss falls
  const regAt = (x, y) => sm.reg[map.tileIdx(x, y)], kindAt = (x, y) => { const r = regAt(x, y); return r >= 0 ? sm.nodes[r].kind : 'ridge'; };
  const zoomOf = (p) => { const k = kindAt(p.x, p.y); return k === 'plateau' || k === 'peak' ? 0.84 : 0.9; };
  const cr = alpineHook(world, gen.alpine, { zoom: zoomOf });
  const gateOf = (n, role) => sm.gates.find((g) => g.node === n.i && g.role === role) || null;
  const plateaus = sm.nodes.filter((n) => n.kind === 'plateau').map((n) => ({
    n, i: n.i, kind: n.enc || 'ambush', name: SUMMIT_ENCOUNTERS[n.enc || 'ambush'][0], x: n.x, y: n.y, r: n.r,
    state: 'idle', t: 0, wave: 0, foes: [], objs: [], gate: gateOf(n, 'out'), gateIn: gateOf(n, 'in'),
  }));
  const peakIn = gateOf(peak, 'in');
  const leaps = (gen.leaps || []).map((l) => ({ ...l, done: false }));
  const alive = (list) => list.filter((m) => !m.dead && world.creatures.includes(m));
  let routeAt = 0;
  const c = G.char;
  c.summitRuns ||= {};
  const kept = c.summitRuns[depth] && c.summitRuns[depth].seed === gen.seed ? c.summitRuns[depth] : (c.summitRuns[depth] = { seed: gen.seed, won: 0 });

  const run = {
    id: 'snowy_summit', type: 'summit', completed: false, failed: false, active: true, markers: [], route: [], stage: 0, escort: null, routeIndex: 0,
    shrine: { x: sm.start.x, y: sm.start.y, reach: 2, label: 'The Snowy Summit', use() {} },
    plateaus, phase: 'climb', boss: null, bossDef: null,
    get title() { return run.completed ? 'The Peak Is Won' : run.phase === 'peak' ? `Defeat ${run.boss ? run.boss.name : 'the master of the peak'}` : 'Climb to the Peak'; },
    get description() {
      if (run.completed) return 'The way on lies open on the peak.';
      const e = current();
      return e ? `${e.name}: ${SUMMIT_ENCOUNTERS[e.kind][1]}` : 'Walk the ridgelines up the range to its peak.';
    },
    get won() { return plateaus.filter((e) => e.state === 'done').length; },
    /** Mid-fight, where the fight needs the hero (autoplay.js): the nearest standing cairn. */
    get duty() {
      const e = current(), p = world.player;
      if (!e || e.kind !== 'cairns' || !p) return null;
      const o = alive(e.objs).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      return o ? { x: o.x, y: o.y, reach: 1.8, label: 'Breaking the Howling Cairns' } : null;
    },
    /** How far up the range the hero is, 0..100 %. */
    get altitude() {
      const p = world.player;
      if (!p) return 0;
      const top = peak.h, h = F.H2(p.x, p.y);
      return Math.round(clamp((h - sm.start.h) / Math.max(1, top - sm.start.h), 0, 1) * 100);
    },
    get objective() {
      if (run.completed) return undefined;
      const p = world.player, e = current();
      if (e && e.state === 'fight') {
        const objs = alive(e.objs);
        if (objs.length) return { x: objs[0].x, y: objs[0].y, reach: 1.5 };
        const f = alive(e.foes).filter((m) => m.targetable !== false);
        if (f.length) { const m = f.reduce((a, b) => (Math.hypot(b.x - p.x, b.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? b : a)); return { x: m.x, y: m.y, reach: 1.5 }; }
        return { x: e.x, y: e.y, reach: 2 };
      }
      if (run.phase === 'peak') { const b = run.boss; return b && !b.dead ? { x: b.x, y: b.y, reach: 1.6 } : { x: peak.x, y: peak.y + 1.5, reach: 2 }; }
      // the next waypoint along the way that isn't behind a shut gate
      const r = sm.route[Math.min(sm.route.length - 1, routeAt + 1)];
      return { x: r.x, y: r.y, reach: 2.2 };
    },
    update(dt) {
      cr.frame(dt);
      const p = world.player;
      if (!p || p.dead) return;
      // the route: the furthest waypoint reached (a gate holds it at its plateau until the fight is won)
      for (let k = Math.min(sm.route.length - 1, routeAt + 3); k > routeAt; k--) {
        const q = sm.route[k];
        if (Math.hypot(q.x - p.x, q.y - p.y) < 3.2) { routeAt = k; break; }
      }
      for (const e of plateaus) {
        if (e.state === 'idle' && regAt(p.x, p.y) === e.i && Math.hypot(p.x - e.x, p.y - e.y) < e.r * 0.9) startEnc(e);
        if (e.state === 'fight') tickEnc(e, dt);
      }
      for (const l of leaps) {
        if (l.done) continue;
        const allPlayers = [p];
        if (G.remotePlayers) {
          for (const rp of G.remotePlayers.values()) {
            if (!rp.dead && (rp.world === world || (rp.worldKind === world.kind && rp.depth === world.depth))) {
              allPlayers.push(rp);
            }
          }
        }
        if (allPlayers.some(pl => Math.hypot(pl.x - l.at[0], pl.y - l.at[1]) < 5.5)) climbUp(l);
      }
      if (run.phase === 'climb' && Math.hypot(p.x - peak.x, p.y - peak.y) < peak.r + 9) startPeak();
      if (run.phase === 'peak' && peakIn && !run.sealed && run.boss && run.boss.awake && regAt(p.x, p.y) === peak.i) { run.sealed = true; shut(peakIn); }
      if (run.phase === 'peak' && run.boss && run.boss.dead && !run.completed) finishPeak();
    },
  };
  world.summitRun = run;
  function current() { return plateaus.find((e) => e.state === 'fight') || null; }
  /** The minimap's marks: the way ahead (a few waypoints), the gates (red shut, blue open), the pinnacle's chest. */
  cr.mapMarks = () => {
    const out = [];
    for (let k = routeAt + 1; k < Math.min(sm.route.length, routeAt + 6); k++) out.push([sm.route[k].x, sm.route[k].y, k === routeAt + 1 ? '#ffe070' : 'rgba(255,224,112,0.55)', k === routeAt + 1 ? 3 : 1.8]);
    for (const g of sm.gates) { const d = g.doors[0]; if (d && map.seen[map.tileIdx(d.x, d.y)]) out.push([d.x, d.y, d.open ? '#60a0ff' : '#ff5040', 2.4]); }
    return out;
  };
  // what each fight shows from the ridge before it starts: the camp's raiders asleep round their fire, the pack, the cairns
  for (const e of plateaus) {
    if (e.kind === 'camp') {
      for (let k = 0; k < 6; k++) { const a = k * 1.05 + 0.3, [x, y] = spotNear(e.x + Math.cos(a) * 2.6, e.y + Math.sin(a) * 2.6, 0, 1.2, onPlateau(e)); if (x != null) dormant(e, foe(e, x, y, { how: null })); }
      const [x, y] = spotNear(e.x, e.y, 1, 2.2, onPlateau(e));
      if (x != null) { const m = foe(e, x, y, { arch: pick(['knight', 'golem', 'cultist']), rank: 'unique', how: null }); if (m) { m.name = `${m.name}, Chief of the Camp`; dormant(e, m); } }
    } else if (e.kind === 'pack') {
      const [x, y] = spotNear(e.x, e.y, 0.5, 2, onPlateau(e));
      if (x != null) dormant(e, foe(e, x, y, { arch: pick(['hound', 'golem', 'gargoyle']), rank: 'unique', how: null }));
      for (let k = 0; k < 5; k++) { const [hx, hy] = spotNear(e.x, e.y, 1.5, 4, onPlateau(e)); if (hx != null) dormant(e, foe(e, hx, hy, { arch: 'hound', how: null })); }
    } else if (e.kind === 'cairns') {
      for (const [x, y] of e.n.cairns || []) {
        const m = makeMonster(world, 'golem', biome, lvl, 'champion', x, y, 0, { art: 'va_crystal', swap: { colorize: [195, 0.5], light: 0.15 }, tint: 'Ice' });
        m.name = 'Howling Cairn'; m.static = true; m.speed = 0; m.raidPriority = 5; m.maxHp *= 0.85; m.hp = m.maxHp; m.scale = (m.scale || 1) * 1.15; m.awake = true; m.xp *= 0.5;   // raidPriority: auto-play breaks them before their brood
        m.wardTick = () => { m.moving = false; };
        world.add(m); e.objs.push(m);
      }
    }
  }
  /** Asleep and slow to notice until its fight starts (so the group is fought on its plateau, not drawn out onto a ridge). */
  function dormant(e, m) { if (!m) return; m.awake = false; m.hunter = false; m.aggroRange = 3; m.static = true; m.targetable = false; m.dormantFor = e; }   // asleep: not to be woken or drawn out from the ridge
  // back after a town trip: the fights already won stay won, their gates open, and the hero arrives at the last of them
  if (kept.won) {
    for (const e of plateaus.slice(0, kept.won)) {
      e.state = 'done';
      for (const m of [...e.foes, ...e.objs]) m.dead = true;
      for (const g of [e.gate, e.gateIn]) if (g) { for (const d of g.doors) { d.open = true; d.locked = false; } for (const i of g.tiles) map.block[i] = 0; }
    }
    const last = plateaus[kept.won - 1], [ax, ay] = map.randomNear(last.x, last.y, 1.5);
    gen.start = [ax, ay];
    const tp = world.portals.find((q) => q.type === 'town');
    if (tp) [tp.x, tp.y] = map.randomNear(ax + 1.5, ay - 0.5, 1.5);
    routeAt = Math.max(0, sm.route.findIndex((q) => q.node === last.i));
  }

  // ---------------------------------------------------------------- monsters
  function spotNear(x0, y0, r0, r1, keep = null) {
    const h0 = map.hgt[map.tileIdx(x0, y0)];
    for (let t = 0; t < 40; t++) {
      const a = rand(0, 6.283), r = rand(r0, r1), x = x0 + Math.cos(a) * r, y = y0 + Math.sin(a) * r, i = map.tileIdx(x, y);
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1 || (keep && !keep(x, y))) continue;
      if (map.t[i] && !map.block[i] && Math.abs(map.hgt[i] - h0) < 8 && map.circleFree(x, y, 0.4)) return [x, y];
    }
    return [null, null];
  }
  function onPlateau(e) { return (x, y) => sm.reg[map.tileIdx(x, y)] === e.i; }
  function foe(e, x, y, { arch = pick(biome.roster), rank = 'normal', how = 'burrow', delay = 0 } = {}) {
    if (G.room && !world._generatingDungeon && !G.game?.isDungeonAuthority(world.depth)) return null;
    const m = makeMonster(world, arch, biome, lvl + (rank === 'normal' ? 0 : 1), rank, x, y, 0, world.looks.pick(arch, Math.random));
    world.add(m); m.hunter = true; m.awake = true;
    if (!how) return e && e.foes.push(m), m;
    if (delay <= 0) enter(m, how);
    else { m.targetable = false; m.alpha = 0; let d = delay; m.entering = (t) => { if ((d -= t) <= 0) enter(m, how); }; }
    if (e) e.foes.push(m);
    return m;
  }
  function wave(e, n, { how = 'burrow', arch = null, rank = null, r0 = 2.5, r1 = 6 } = {}) {
    for (let k = 0; k < n; k++) {
      const [x, y] = spotNear(e.x, e.y, r0, Math.min(r1, e.r * 0.8), onPlateau(e));
      if (x == null) continue;
      foe(e, x, y, { arch: arch || pick(biome.roster), rank: rank || (k === 0 && depth > 6 ? 'champion' : 'normal'), how, delay: k * rand(0.1, 0.28) });
    }
  }
  /** Something climbs up out of the cloud onto a ridge (or leaps down onto it): an arc from below the rim. */
  function climbUp(l) {
    l.done = true;
    if (G.room && !G.game?.isDungeonAuthority(world.depth)) return;
    for (let i = 0; i < l.n; i++) {
      const [x, y] = map.randomNear(l.at[0] + rand(-0.8, 0.8), l.at[1] + rand(-0.8, 0.8), 1.2);
      const arch = pick(biome.roster), m = makeMonster(world, arch, biome, lvl + (i === 0 ? 1 : 0), i === 0 ? 'champion' : 'normal', x, y, 0, world.looks.pick(arch, Math.random));
      m.enteringKind = 'drop';
      world.add(m); m.hunter = true;
      const from = [l.from[0] + rand(-1, 1), l.from[1] + rand(-1, 1)], to = [x, y], h0 = F.H2(from[0], from[1]) - 0.4, h1 = F.H2(x, y), dur = 0.75 + i * 0.12;
      m.x = from[0]; m.y = from[1]; m.targetable = false; m.awake = true; m.moving = true;
      addEffect(new Telegraph({ kind: 'circle', x, y, r: 0.9, dur: dur + 0.1, color: '#c0d8ff' }), 'ground');
      let t = -i * 0.15;
      m.entering = (dt) => {
        t += dt; m.animT = (m.animT || 0) + dt;
        const k = clamp(t / dur, 0, 1);
        m.x = from[0] + (to[0] - from[0]) * k; m.y = from[1] + (to[1] - from[1]) * k;
        m.z = ((h0 + (h1 - h0) * k) - F.H2(m.x, m.y)) * VZ + 60 * Math.sin(Math.PI * k);
        if (k >= 1) {
          m.entering = null; m.targetable = true; m.z = 0; m.x = to[0]; m.y = to[1]; m.moving = false; m.cd = rand(0.2, 0.5);
          smoke(m.x, m.y, 4, '#e8eef4', 8, 12); burst(m.x, m.y, 4, 'phys', 12, 3); camera.shake(2.5); sfx('thud', 0.5);
        }
      };
    }
    sfx('roar', 0.45);
    UI.log('Something claws up over the rim of the ridge!', '#ffc0a0');
  }

  // ---------------------------------------------------------------- the plateaus
  function startEnc(e) {
    e.state = 'fight'; e.t = 0; e.wave = 1;
    UI.centerMsg(e.name.toUpperCase(), SUMMIT_ENCOUNTERS[e.kind][1], 3);
    sfx('roar', 0.6);
    // the way in shuts behind the hero: the plateau is fought on the plateau
    if (e.gateIn) shut(e.gateIn);
    for (const m of alive(e.foes)) { m.awake = true; m.hunter = true; m.aggroRange = 8.5; if (m.dormantFor) { m.static = false; m.targetable = true; m.dormantFor = null; } }
    switch (e.kind) {
      case 'ambush': {
        // the snow heaves where they will come up, then they come
        UI.log('The snow of the plateau heaves...', '#d0e0f0');
        for (let k = 0; k < 5; k++) {
          const [x, y] = spotNear(e.x, e.y, 2.5, e.r * 0.8, onPlateau(e));
          if (x == null) continue;
          addEffect(new Telegraph({ kind: 'circle', x, y, r: 0.9, dur: 1 + k * 0.2, color: '#e0ecff' }), 'ground');
          foe(e, x, y, { how: 'burrow', delay: 1 + k * 0.2, rank: k === 0 && depth > 6 ? 'champion' : 'normal' });
        }
        break;
      }
      case 'avalanche':
        e.fallT = 1.8; e.dropT = 1.2; e.dropped = 0; e.limit = 15;
        UI.log('The slope above groans. Keep moving!', '#d0e0f0'); camera.shake(4); sfx('thud', 0.6);
        break;
      case 'cairns': for (const o of e.objs) { addEffect(new Column(o.x, o.y, '#a8e0ff', 0.6, 20, 200)); burst(o.x, o.y, 12, 'cold', 20, 4); } e.callT = 1.5; break;
      default: break;   // the camp and the pack wait on the plateau already
    }
    if (G.game?.autosave) G.game.autosave();
  }
  function shut(g) {
    for (const d of g.doors) { d.open = false; d.locked = true; }
    for (const i of g.tiles) map.block[i] = 1;
    // anyone standing in the gateway is put through it, onto the near side
    for (const m of world.creatures) if (!m.dead && g.tiles.includes(map.tileIdx(m.x, m.y))) { const [x, y] = map.randomNear(m.x, m.y, 2); m.x = x; m.y = y; }
    map.flowFrom = [-9, -9];
    sfx('gate', 0.5);
  }
  function open(g) {
    for (const d of g.doors) { d.locked = false; d.open = true; }
    for (const i of g.tiles) map.block[i] = 0;
    map.flowFrom = [-9, -9];
  }
  function tickEnc(e, dt) {
    e.t += dt;
    const p = world.player, live = alive(e.foes);
    switch (e.kind) {
      case 'ambush':
        if (!live.length || (e.wave === 1 && e.t > 16)) {
          if (e.wave >= 2) { if (!live.length) finishEnc(e); break; }
          e.wave = 2; wave(e, 6, { how: chance(0.5) ? 'burrow' : 'drop' });
        }
        break;
      case 'avalanche': {
        if (e.t < e.limit) {
          if ((e.fallT -= dt) <= 0) {   // snow and stone come down the slope: telegraphed, they hurt where they land
            e.fallT = rand(0.9, 1.5);
            for (let k = 0; k < 2; k++) {
              const [x, y] = k ? spotNear(p.x, p.y, 1.5, 4.5, onPlateau(e)) : [p.x + rand(-0.6, 0.6), p.y + rand(-0.6, 0.6)];
              if (x == null) continue;
              addEffect(new Telegraph({ kind: 'circle', x, y, r: 1.5, dur: 1.15, color: '#e8f0ff' }), 'ground');
              setTimeout(() => {
                if (world !== G.world) return;
                smoke(x, y, 12, '#eef4fa', 12, 20); burst(x, y, 10, 'cold', 30, 3); sfx('thud', 0.45); camera.shake(2);
                const q = world.player; if (q && !q.dead && Math.hypot(q.x - x, q.y - y) < 1.6) hit(null, q, q.maxHp * 0.1, 'cold');
                for (const m of alive(e.foes)) if (Math.hypot(m.x - x, m.y - y) < 1.6) hit(null, m, m.maxHp * 0.25, 'phys');
              }, 1150);
            }
          }
          if ((e.dropT -= dt) <= 0 && e.dropped < 10) {   // and things ride it down
            e.dropT = rand(1.4, 2.2); e.dropped++;
            const [x, y] = spotNear(p.x, p.y, 2.5, 6, onPlateau(e));
            if (x != null) foe(e, x, y, { how: 'drop', rank: e.dropped === 6 ? 'champion' : 'normal' });
          }
        } else if (!live.length) finishEnc(e);
        break;
      }
      case 'cairns': {
        const objs = alive(e.objs);
        if (objs.length && (e.callT -= dt) <= 0) {   // each cairn howls one up out of the snow, while it stands
          e.callT = 5;
          if (live.length < 6) for (const o of objs) {
            const [x, y] = spotNear(o.x, o.y, 1.2, 3, onPlateau(e));
            if (x != null) { foe(e, x, y, { how: 'burrow' }); addEffect(new Ring(o.x, o.y, 0.2, 2.2, 0.5, '#a8e0ff', 4)); }
          }
        }
        if (!objs.length && !live.length) finishEnc(e);
        break;
      }
      default: if (!live.length && e.t > 1) finishEnc(e);
    }
  }
  function finishEnc(e) {
    e.state = 'done';
    UI.centerMsg(`${e.name.toUpperCase()} WON`, e.gate ? 'The frozen gate grinds open' : 'The way on is clear', 2.6);
    sfx('gate', 0.7);
    const [cx, cy] = map.randomNear(e.x, e.y, 1.6);
    world.chests.push({ x: cx, y: cy, opened: false, reach: 1.3, rare: e.kind === 'camp' || e.kind === 'pack', use() { if (this.opened) return; this.opened = true; sfx('chest'); sfx('gold'); dropChest(world, this, depth); sparkle(this.x, this.y, 20, '#ffd060', 20, 0.5); } });
    if (e.gateIn) open(e.gateIn);
    if (e.gate) {
      open(e.gate);
      const d = e.gate.doors[0];
      if (d) { addEffect(new Ring(d.x, d.y, 0.2, 2.6, 0.7, '#cfe8ff', 5)); burst(d.x, d.y, 14, 'cold', 26, 4); }
    }
    kept.won = plateaus.indexOf(e) + 1;
    if (G.game?.autosave) G.game.autosave();
    UI.refresh();
  }

  // ---------------------------------------------------------------- the peak
  function startPeak() {
    run.phase = 'peak';
    const def = gen.bosses[G.summitBoss ?? (gen.seed >>> 4) % gen.bosses.length];   // G.summitBoss: a test's pick
    run.bossDef = def;
    const tpl0 = RAID_BOSSES.find((b) => b.id === def.tpl) || pick(RAID_BOSSES.filter((b) => !b.sigs));
    const art = ART_BY_ID[def.art], name = art ? art.name : (tpl0 ? tpl0.name : 'The Peak Guardian');
    const tpl = { ...tpl0, name, title: def.title, adds: ['hound', 'gargoyle', 'wraith', 'golem', 'skeleton', 'imp'], ...(def.el ? { el: def.el, fx: def.fx } : null) };
    const arena = { cx: peak.x, cy: peak.y, x: peak.x - peak.r, y: peak.y - peak.r, w: peak.r * 2, h: peak.r * 2, gate: { x: -40, y0: -40, y1: -39 } };
    const m = makeRaidBoss(world, arena, depth, lvl + 3, { tpl, art: art ? def.art : undefined });
    m.scale = 2.5; m.maxHp *= 0.72; m.hp = m.maxHp; m.swap = def.swap;
    m.raid.execT = Infinity;   // no execute timer on the peak: the climb was the clock
    m.raid.label = function () { return this.inter ? `Warded — break the crystals! (${this.wards.filter((q) => !q.dead).length} left)` : `Phase ${this.pi + 1}/${this.phases.length} · ${this.phase.name}${this.enraged ? ' · ENRAGED' : ''}`; };
    world.add(m); world.boss = m; world.raid = m.raid;
    // the arena is the peak itself, not the raid's square (whose corners reach out over the last ridge)
    const inside = m.raid.inside.bind(m.raid);
    m.raid.inside = (q, pad) => (q === world.player ? regAt(q.x, q.y) === peak.i : inside(q, pad));
    // it waits at the back of the arena, before the shrine, and wakes when the hero comes onto the peak (raid.js)
    const [x, y] = map.randomNear(peak.x - peak.r * 0.3, peak.y - peak.r * 0.3, 1.2);
    m.x = x; m.y = y;
    run.boss = m;
    cr.lookAt(m.x, m.y, 2.6);
    UI.centerMsg(name.toUpperCase(), def.title, 3.4);
    UI.log(`<b style="color:#a8e0ff">${name}</b>, ${def.title}, waits on the peak.`, '#d0e8ff');
    sfx('boss'); sfx('roar', 0.8); camera.shake(4);
  }
  function finishPeak() {
    run.completed = true;
    if (peakIn) open(peakIn);
    exit.x = exitAt[0]; exit.y = exitAt[1];
    for (let k = 0; k < 2; k++) {
      const [cx, cy] = map.randomNear(peak.x + (k ? 2 : -2), peak.y + 1, 1.2);
      world.chests.push({ x: cx, y: cy, opened: false, reach: 1.3, rare: true, use() { if (this.opened) return; this.opened = true; sfx('chest'); sfx('gold'); dropChest(world, this, depth); sparkle(this.x, this.y, 20, '#ffd060', 20, 0.5); } });
    }
    addEffect(new Column(peak.x, peak.y, '#cfe8ff', 1, 40, 320));
    UI.centerMsg('THE PEAK IS WON', 'The way on is open', 3.5);
    win();
  }
  return run;
}

/** The Quest Log's steps on the Summit (src/ui/quest.js, through the region registry). */
export function summitQuest(sc, step) {
  let h = step(sc.won > 0 || sc.completed, `Walk the ridgelines up the range <span class="dim">— altitude ${sc.altitude}%</span>.`);
  for (const e of sc.plateaus) h += step(e.state === 'done', `<b>${e.name}</b>${e.state === 'fight' ? ' <span class="dim">— fighting</span>' : e.state === 'idle' ? ' <span class="dim">— a plateau ahead</span>' : ''}`);
  h += step(sc.completed, sc.phase === 'peak' && sc.boss ? `Defeat <b style="color:#a8e0ff">${sc.boss.name}</b> on the peak.` : 'Something waits on the peak.');
  h += step(sc.completed, sc.completed ? 'The exit on the peak is open.' : 'Its fall opens the way on.');
  return h;
}
