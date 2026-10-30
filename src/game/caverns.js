// DEPTH'S EDGE CAVERNS (docs/DEPTHS_EDGE.md): the run. The cave (world/caverns.js) is drawn in three.js behind the
// sprites (gfx/cave3d.js); this file lifts everything onto its height field (view.js setElevation, smooth), picks the
// tile under the mouth through it, hides whoever stands behind higher ground (horizon), draws the baked stalagmites,
// and directs the delve: packs through the passages and caverns, things dropping out of the dark, the lake and its
// falls, the passage at the falls' foot into the shaft, the long climb (packs above leap down when the party passes
// under them), and at the top of the falls one to three bosses. The last one's fall opens a portal there.
import { G } from '../state.js';
import { UI } from '../ui/ui.js';
import { HUD } from '../ui/hud.js';
import { camera, setElevation, HW, HH, isoX, isoY } from '../core/view.js';
import { rand, chance, pick, clamp, shuffle } from '../core/util.js';
import { sfx, setAmbience } from '../core/audio.js';
import { VZ, REG, CAVE_ROSTER } from '../world/caverns.js';
import { drawCave3D, tickCave3D, buildCave3D, disposeCave3D, caveSprite, caveScene } from '../gfx/cave3d.js';
import { makeMonster } from './monster.js';
import { makeRaidBoss, RAID_BOSSES } from './raid.js';
import { depthLevel } from '../data/depth.js';
import { addEffect, Ring, Column, burst, smoke, floatText, addLight, spawn, sparkle } from '../gfx/vfx.js';
import { enter } from './mayhem.js';
import { DEPTHS_EDGE, DEPTHS_EDGE_BOSSES } from '../data/depthsedge.js';
import { dropChest } from './loot.js';

const K = HH / VZ;   // 0.408: rise per tile of depth seen edge-on

/** Lift the ground onto the cave's height field for a cave level; tear the 3D down for any other (game.js setWorld). */
export function useCaverns(world) {
  const cr = world && world.cave;
  if (!cr) { if (caveScene()) disposeCave3D(); return; }
  setElevation(cr.elev, cr.pick);
  cr.frame(0, true);
}

export function createCaveRun(world, gen, biome, onSuccess) {
  const cv = gen.cave, v = gen.variant, map = world.map, depth = world.depth || 1, lvl = depthLevel(depth), W = map.w, H = map.h;
  world.ambushT = Infinity;   // the caves direct their own ambushes (delveEvents)
  const exit = world.portals.find((q) => q.type === 'exit');
  if (exit) { exit.x = exit.y = -100; }   // the portal opens at the top of the falls when the last boss falls
  const floorLo = map.minLevel / (VZ / 4) - 1.5, floorHi = map.maxLevel / (VZ / 4) + 1;
  const surfAt = (x, y) => { const i = map.tileIdx(x, y); return map.t[i] ? null : Number.isNaN(cv.lvl[i]) ? null : cv.lvl[i]; };
  const groundT = (x, y) => { const s = surfAt(x, y), h = cv.H2(x, y); return s != null && s > h ? s : h; };

  const cr = world.cave = {
    cv, v, focus: [0, 0, 0], cut: true, region: -1, zoomK: 1,
    elev: (x, y) => groundT(x, y) * VZ,
    /** Is the terrain at (x, y), height h tiles, cut away round the hero (the shader's rule, gfx/cave3d.js)? */
    cutAt(x, y, h) {
      const f = cr.focus;
      if (!cr.cut || (x + y) - (f[0] + f[2]) < 0.35 || h < f[1] + 0.75) return false;
      const sx = (x - y) * HW - (f[0] - f[2]) * HW, sy = (x + y) * HH - h * VZ - ((f[0] + f[2]) * HH - f[1] * VZ - 30);
      return (sx / 150) ** 2 + (sy / 120) ** 2 < 0.8;
    },
    /** World px back to the tile position whose ground shows there: down the view ray from high to low to the first
     * walkable ground or water it meets. Rock never hides those (the cap), so a rock hit only counts when the ray
     * finds neither (a click on a wall). */
    pick(wx, wy) {
      let rock = null, inRock = false;
      const at = (h) => { const yy = wy + h * VZ; return [(wx / HW + yy / HH) / 2, (yy / HH - wx / HW) / 2]; };
      const open = (x, y) => { const i = map.tileIdx(x, y); return map.t[i] || map.wet[i]; };
      const below = (h) => { const [x, y] = at(h); if (x < 0 || y < 0 || x >= W || y >= H) return false; const g = groundT(x, y); return g >= h && !cr.cutAt(x, y, g); };
      for (let h = floorHi + 6; h >= floorLo; h -= 0.05) {
        if (!below(h)) { inRock = false; continue; }
        const [x, y] = at(h);
        if (inRock) { if (open(x, y)) return [x, y]; continue; }   // out of a rock that poked over the ray, onto ground behind
        let a = h + 0.05, b = h;   // the ground crossed the ray in the last step: halve in on it
        for (let k = 0; k < 6; k++) { const m = (a + b) / 2; if (below(m)) b = m; else a = m; }
        const q = at(b);
        if (open(q[0], q[1])) return q;
        if (!rock) rock = q;
        inRock = true;
      }
      if (rock) return rock;
      const p = world.player, h = p ? groundT(p.x, p.y) : 0, yy = wy + h * VZ;
      return [(wx / HW + yy / HH) / 2, (yy / HH - wx / HW) / 2];
    },
    /** Where the terrain in front of a creature hides it: null when nothing does, else the world px y above which it
     * shows (-Infinity: all of it hidden). The cave's walls never hide walkable ground (world/caverns.js caps them);
     * the shaft's ledges and the plateau's edge can, so whoever stands behind them is clipped there. */
    horizon(o) {
      if (o === world.player) return null;
      const x = o.x, y = o.y, h0 = groundT(x, y), fy = (x + y) * HH - h0 * VZ - (o.z || 0);
      let top = Infinity;
      for (let s = 0.25, sMax = (floorHi - h0) / (2 * K) + 1; s < sMax; s += s < 2 ? 0.25 : 0.5) {
        const sx = x + s, sy = y + s;
        if (sx >= W || sy >= H) break;
        const g = groundT(sx, sy), py = (sx + sy) * HH - g * VZ;
        if (py < top && !cr.cutAt(sx, sy, g)) top = py;
      }
      if (top >= fy - 3) return null;
      const hgt = o.viewH || 46 * (o.scale || 1);
      return top <= fy - hgt ? -Infinity : top;
    },
    /** A baked stalagmite, cluster, column, boulder or hanging stalactite; it fades where it hides someone behind it. */
    drawProp(ctx, o, d, views) {
      const spr = caveSprite(o.caveProp, o.m);
      if (!spr) return;
      const k = o.s || 1, x = isoX(o.x, o.y), y = isoY(o.x, o.y) - (o.z || 0);
      const rx = x + (o.flip ? -spr.ox - spr.w : spr.ox) * k, ry = y + spr.oy * k, rw = spr.w * k, rh = spr.h * k;
      let a = 1;
      for (const vw of views) {
        if (vw.d >= d || vw.x + vw.hw < rx || vw.x - vw.hw > rx + rw || vw.y1 < ry || vw.y0 > ry + rh) continue;
        a = Math.min(a, vw.hero ? 0.3 : 0.6);
      }
      if (a < 1) ctx.globalAlpha = a;
      if (o.flip) { ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1); ctx.drawImage(spr.img, 0, 0, spr.w, spr.h, spr.ox * k, ry, rw, rh); ctx.restore(); }
      else ctx.drawImage(spr.img, 0, 0, spr.w, spr.h, rx, ry, rw, rh);
      if (a < 1) ctx.globalAlpha = 1;
    },
    /** The hero's place for the cutaway and the lights, the zoom of the region he's in. */
    frame(dt, snap = false) {
      const p = world.player;
      if (!p) return;
      const h = groundT(p.x, p.y);
      cr.focus[0] = p.x; cr.focus[1] = h; cr.focus[2] = p.y;
      const r = cv.reg[map.tileIdx(p.x, p.y)] || cr.region;
      cr.cut = r === REG.shaft || r === REG.gallery;   // only the shaft's ledges stand over walkable ground
      const zk = r === REG.lake || r === REG.plateau ? 0.82 : r === REG.shaft || r === REG.gallery ? 0.88 : 1;
      if (snap || Math.abs(cr.zoomK - zk) > 0.002) {
        cr.zoomK = snap ? zk : cr.zoomK + (zk - cr.zoomK) * Math.min(1, dt * 1.6);
        camera.zoomK = cr.zoomK; camera.computeZoom();
      }
      // a look elsewhere (the falls, when the lake first opens up): the camera leans there and back
      if (cr.look && cr.lookT > 0) {
        cr.lookT -= dt;
        const k = clamp(Math.min(cr.lookT, cr.lookDur - cr.lookT) / 0.8, 0, 1), [lx, ly, lh] = cr.look;
        camera.leadX = (isoX(lx, ly) - isoX(p.x, p.y)) * k; camera.leadY = (isoY(lx, ly) - lh * VZ - isoY(p.x, p.y)) * k;
      } else { camera.leadX = 0; camera.leadY = 0; }
    },
    draw(ctx) { drawCave3D(ctx, cr); },
  };
  void buildCave3D(cv).catch((e) => console.warn(e));
  for (const m of world.creatures) {   // packs up the ledge: some leap down onto the party passing beneath them
    if (m.team !== 'enemy' || cv.reg[map.tileIdx(m.x, m.y)] !== REG.shaft) continue;
    m.caveTh = cv.thetaAt(m.x, m.y);
    if (m.caveTh > Math.PI * 2.2 && chance(0.45)) m.caveDrop = true;
  }

  const route = cv.route, climb = cv.climbRoute;
  const run = {
    id: 'depths_edge', type: 'cave', completed: false, failed: false, active: true, markers: [], route: [], stage: 0, escort: null, routeIndex: 0,
    shrine: { x: cv.plateau.x, y: cv.plateau.y, reach: 2, label: 'The Top of the Falls', use() {} },
    variant: v, phase: 'delve', wp: 0, cwp: 0, seen: new Set(), lakeSeen: false, ambushT: rand(25, 35), ambushWp: 0, dropCd: 0, top: null, fade: null,
    get title() {
      if (run.completed) return 'The Falls Are Won';
      return run.phase === 'climb' ? 'Climb the Shaft' : run.phase === 'summit' ? 'The Top of the Falls' : run.lakeSeen ? 'The Passage at the Falls' : 'Into the Depths';
    },
    get description() {
      if (run.completed) return 'A portal burns at the top of the falls. The way on is open.';
      if (run.phase === 'climb') return `Climb the ledge round the shaft to the top of the falls, ${run.altitude}% of the way up.`;
      if (run.phase === 'summit') return run.top && run.top.n ? `Boss ${Math.min(run.top.i + 1, run.top.n)} of ${run.top.n} at the top of the falls.` : 'Something stirs at the top of the falls.';
      return run.lakeSeen ? 'A passage opens in the cliff at the foot of the waterfall.' : 'Follow the passages and caverns down to the lake.';
    },
    get altitude() { const p = world.player; if (!p) return 0; return run.phase === 'climb' ? Math.round(clamp(cv.thetaAt(p.x, p.y) / cv.shaft.thEnd, 0, 1) * 100) : run.phase === 'summit' || run.completed ? 100 : 0; },
    get objective() {
      if (run.completed) return undefined;
      if (run.phase === 'delve') {
        const k = Math.min(route.length - 1, run.wp + 3), last = k === route.length - 1;
        return { x: route[k][0], y: route[k][1], reach: last ? 0.7 : 1.6, use: last ? () => toShaft() : undefined };
      }
      if (run.phase === 'climb') { const k = Math.min(climb.length - 1, run.cwp + 3); return { x: climb[k][0], y: climb[k][1], reach: 1.6 }; }
      return run.top && run.top.idle ? { x: cv.plateau.x, y: cv.plateau.y + 1, reach: 3 } : null;
    },
    update(dt) {
      const p = world.player;
      if (!p) return;
      cr.frame(dt);
      tickCave3D(dt, cr);
      if (run.fade) tickFade(dt);
      if (p.dead) return;
      const i = map.tileIdx(p.x, p.y), r = cv.reg[i];
      if (r) cr.region = r;
      // where on the way the hero has got to (auto-play's waypoints)
      const adv = (list, k) => { for (let j = Math.min(list.length - 1, k + 8); j > k; j--) if (Math.hypot(list[j][0] - p.x, list[j][1] - p.y) < 3.2) return j; return k; };
      if (run.phase === 'delve') {
        run.wp = adv(route, run.wp);
        if (r === REG.cavern && cv.zone[i] >= 0 && cv.zone[i] < cv.caverns.length && !run.seen.has(cv.zone[i])) {
          run.seen.add(cv.zone[i]);
          UI.centerMsg(cv.caverns[cv.zone[i]].name.toUpperCase(), `${v.name} · Depth ${depth}`, 2.4);
        }
        if (r === REG.lake && !run.lakeSeen) lakeReveal();
        if (Math.hypot(p.x - cv.notchIn[0], p.y - cv.notchIn[1]) < 1.1 && !run.fade) toShaft();
        delveEvents(dt);
      } else if (run.phase === 'climb') {
        run.cwp = adv(climb, run.cwp);
        climbEvents(dt);
        if ((r === REG.gallery || r === REG.plateau) && Math.hypot(p.x - cv.plateau.x, p.y - cv.plateau.y) < cv.plateau.r + 1) startSummit();
      } else if (run.phase === 'summit') summit(dt);
      dressing(dt);
    },
  };

  // ---------------------------------------------------------------- the delve
  function lakeReveal() {
    run.lakeSeen = true;
    UI.centerMsg('THE UNDERGROUND LAKE', 'A waterfall pours out of the dark far above', 3.2);
    cr.look = [cv.plunge[0], cv.plunge[1], (cv.HP - cv.WL) * 0.45]; cr.lookT = cr.lookDur = 3.4;
    UI.log(`The cave opens on a black lake under a towering waterfall. At its foot, a passage climbs into the cliff.`, '#a8d8ff');
    sfx('cold', 0.6);
    // things rise out of the water to meet the party
    const p = world.player, n = 3 + Math.min(4, Math.floor(depth / 20));
    const shore = [];
    for (let t = 0; t < 300 && shore.length < n; t++) {
      const x = cv.lake.x + rand(-cv.lake.A, cv.lake.A) * 1.2, y = cv.lake.y + rand(-cv.lake.A, cv.lake.A) * 1.2, j = map.tileIdx(x, y);
      if (!map.t[j] || map.block[j] || Math.hypot(x - p.x, y - p.y) < 5 || Math.hypot(x - p.x, y - p.y) > 15) continue;
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => map.wet[map.tileIdx(x + ox * 1.2, y + oy * 1.2)] === 2)) continue;
      shore.push([x, y]);
    }
    shore.forEach(([x, y], k) => {
      const arch = pick(['abomination', 'worm', 'golem', 'scorpion']);
      const m = makeMonster(world, arch, biome, lvl + (k === 0 ? 1 : 0), k === 0 ? 'champion' : 'normal', x, y, 0, world.looks.pick(arch));
      world.add(m); m.hunter = true;
      setTimeout(() => { if (world !== G.world || m.dead) return; enter(m, 'burrow'); burst(x, y, 6, 'cold', 18, 4); smoke(x, y, 6, v.mist, 6, 12); }, k * 380);
      m.targetable = false; m.alpha = 0; m.entering = () => {};
    });
  }
  function delveEvents(dt) {
    const p = world.player;
    // things drop out of the dark above, or claw up out of the floor (each needs fresh ground covered since the last)
    if ((run.ambushT -= dt) > 0 || run.wp < run.ambushWp + 10 || run.wp < 6) return;
    run.ambushT = rand(30, 46) * Math.max(0.6, 1 - depth * 0.004);
    if (world.hostiles('player', p.x, p.y, 9).length >= 5) return;
    run.ambushWp = run.wp;
    const how = chance(0.55) ? 'drop' : 'burrow', n = 3 + (chance(0.5) ? 1 : 0) + Math.min(3, Math.floor(depth / 30));
    const arch = pick(CAVE_ROSTER);
    floatText(p.x, p.y, 90, how === 'drop' ? 'From the dark above!' : 'Something digs up!', '#ff9060', 14, { life: 1.6 });
    for (let k = 0; k < n; k++) {
      const [x, y] = spotNear(p.x, p.y, 2.5, 6);
      if (x == null) continue;
      const m = makeMonster(world, arch, biome, lvl + (k === 0 && depth > 10 ? 1 : 0), k === 0 && depth > 10 ? 'champion' : 'normal', x, y, 0, world.looks.pick(arch));
      world.add(m); m.hunter = true;
      if (k === 0) enter(m, how); else { m.targetable = false; m.alpha = 0; let d = k * rand(0.15, 0.32); m.entering = (t) => { if ((d -= t) <= 0) enter(m, how); }; }
    }
  }
  function spotNear(x0, y0, r0, r1) {
    for (let t = 0; t < 40; t++) {
      const a = rand(0, 6.283), r = rand(r0, r1), x = x0 + Math.cos(a) * r, y = y0 + Math.sin(a) * r, i = map.tileIdx(x, y);
      if (map.t[i] && !map.block[i] && Math.abs(map.hgt[i] - map.hgt[map.tileIdx(x0, y0)]) < 6 && map.circleFree(x, y, 0.4) && map.los(x0, y0, x, y)) return [x, y];
    }
    return [null, null];
  }

  // ---------------------------------------------------------------- the passage at the falls' foot
  function fadeTo(mid) { run.fade = { t: 0, mid, done: false }; }
  function tickFade(dt) {
    const f = run.fade;
    f.t += dt;
    if (!f.done && f.t >= 0.45) { f.done = true; f.mid(); }
    if (f.t >= 1.2) { run.fade = null; }
  }
  world.addHazard({ draw(ctx) {
    const f = run.fade;
    if (!f) return;
    const a = f.t < 0.45 ? f.t / 0.45 : 1 - (f.t - 0.45) / 0.75, vr = camera.viewRect(200);
    ctx.fillStyle = `rgba(0,0,0,${clamp(a, 0, 1)})`; ctx.fillRect(vr.x0, vr.y0, vr.x1 - vr.x0, vr.y1 - vr.y0);
  }, update() { return world === G.world; } });
  function toShaft() {
    if (run.phase !== 'delve' || run.fade) return;
    sfx('door', 0.7);
    fadeTo(() => {
      const p = world.player, pets = world.creatures.filter((c) => c !== p && c.team === 'player' && !c.dead);
      [p.x, p.y] = cv.arrive; p.path = null; p.moveTarget = null; p.attackTarget = null; p.interact = null; p.lootTarget = null;
      for (const s of pets) { [s.x, s.y] = map.randomNear(p.x, p.y, 1.6); s.aggro = null; s.foe = null; s.nav = null; s.fol = null; }
      for (const c of world.creatures) if (c.team === 'enemy' && c.awake && Math.hypot(c.x - cv.notchIn[0], c.y - cv.notchIn[1]) < 14) { c.awake = false; c.aggro = null; }
      world.hazards = world.hazards.filter((h) => h.keep || h.fadeLayer || !h.o);
      map.flowFrom = [-9, -9];
      run.phase = 'climb';
      cr.frame(0, true);
      camera.follow(p.x, p.y, 0, true);
      map.reveal(p.x, p.y, 16);
      UI.centerMsg('THE SHAFT', 'The passage climbs into a great shaft. Its ledge spirals up to the top of the falls.', 3.2);
      UI.log('A ledge winds up the shaft walls, round and round, a long way up. Things wait on the ledges above.', '#ffe2a0');
      area();
    });
  }

  // ---------------------------------------------------------------- the climb
  function climbEvents(dt) {
    const p = world.player, thH = cv.thetaAt(p.x, p.y);
    run.dropCd -= dt;
    if (run.dropCd > 0) return;
    for (const m of world.creatures) {
      if (!m.caveDrop || m.dead || m.awake || m.entering) continue;
      const under = m.caveTh - Math.PI * 2;
      if (thH > under - 0.45 && thH < under + 0.35) {
        const pack = world.creatures.filter((o) => o.caveDrop && !o.dead && !o.awake && !o.entering && Math.hypot(o.x - m.x, o.y - m.y) < 4);
        pack.forEach((o, k) => leapDown(o, k * rand(0.15, 0.35)));
        floatText(p.x, p.y, 90, 'From the ledge above!', '#ff9060', 14, { life: 1.6 });
        run.dropCd = 4;
        break;
      }
    }
  }
  /** Off the ledge above and down onto the hero's, in one arc. */
  function leapDown(m, delay) {
    const p = world.player, [tx, ty] = spotNear(p.x, p.y, 1.5, 3.5);
    if (tx == null) { m.caveDrop = false; return; }
    const x0 = m.x, y0 = m.y, h0 = groundT(x0, y0), h1 = groundT(tx, ty), dur = 0.75 + Math.abs(h0 - h1) * 0.03;
    let t = -delay;
    m.caveDrop = false; m.awake = true; m.hunter = true; m.targetable = false;
    m.entering = (dt) => {
      t += dt; m.animT += dt;
      if (t < 0) return;
      const k = Math.min(1, t / dur);
      m.x = x0 + (tx - x0) * k; m.y = y0 + (ty - y0) * k;
      m.z = (h0 + (h1 - h0) * k * k + Math.sin(Math.PI * k) * 1.4 - groundT(m.x, m.y)) * VZ;
      if (k >= 1) { m.entering = null; m.targetable = true; m.z = 0; m.cd = rand(0.2, 0.5); sfx('thud', 0.5); smoke(tx, ty, 4, '#4a4440', 5, 9); camera.shake(2); }
    };
  }

  // ---------------------------------------------------------------- the top of the falls
  function startSummit() {
    run.phase = 'summit';
    const forced = G.caveBosses;
    const n = forced || (chance(0.45) ? 1 : chance(0.64) ? 2 : 3);
    const ids = shuffle(DEPTHS_EDGE.filter((a) => a.boss).map((a) => a.id)).slice(0, n);
    run.top = { step: 'intro', t: 0, i: 0, n, ids, idle: true, boss: null, mobs: [] };
    UI.centerMsg('THE TOP OF THE FALLS', n === 1 ? 'Something climbs out of the falls' : `${n} of them. They have been waiting.`, 3.2);
    UI.log(`<b style="color:#ffc070">The top of the falls.</b> The river runs to the edge and drops into the dark. ${n === 1 ? 'Something is coming up the falls.' : `${n} things are coming, one after another.`}`, '#ffe2a0');
    sfx('boss', 0.6);
    area();
  }
  const arena = () => { const P = cv.plateau; return { cx: P.x, cy: P.y, x: P.x - P.r, y: P.y - P.r, w: P.r * 2, h: P.r * 2, gate: { x: -40, y0: -40, y1: -39 } }; };
  function summit(dt) {
    const T = run.top, p = world.player;
    if (!T || p.dead) return;
    T.t += dt;
    T.mobs = T.mobs.filter((m) => !m.dead && world.creatures.includes(m));
    // nothing up here to fight: a boss still climbing the falls hurries (climbFalls)
    T.calm = world.creatures.some((m) => m.team === 'enemy' && !m.dead && m.targetable !== false && Math.hypot(m.x - cv.plateau.x, m.y - cv.plateau.y) < cv.plateau.r + 3) ? 0 : (T.calm || 0) + dt;
    T.hurry = T.calm > 0.05;
    // short beats only: the hero never stands about at the top waiting for the next boss
    if (T.step === 'intro') { if (T.t > 0.1) next('boss'); return; }
    if (T.step === 'boss') {
      if (!T.boss) { T.boss = spawnBoss(T.i); T.idle = false; }
      if (T.boss.dead && T.t > 0.5) { T.i++; T.boss = null; next(T.i < T.n ? 'rest' : 'won'); if (T.i >= T.n) win(); }
      return;
    }
    if (T.step === 'rest') { T.idle = true; if (T.t > 0.1) next('boss'); }
  }
  function next(step) { const T = run.top; T.step = step; T.t = 0; T.idle = step === 'rest' || step === 'intro' || step === 'won'; area(); }
  function spawnBoss(i) {
    const T = run.top, id = T.ids[i], art = DEPTHS_EDGE.find((a) => a.id === id), [tplId, title] = DEPTHS_EDGE_BOSSES[id] || ['colossus', ''];
    const tpl = RAID_BOSSES.find((b) => b.id === tplId) || pick(RAID_BOSSES.filter((b) => !b.sigs));
    const last = i === T.n - 1;
    const m = makeRaidBoss(world, arena(), depth, lvl + 3, { tpl: { ...tpl, name: art.name, title, adds: CAVE_ROSTER.slice(0, 6) }, art: id });
    m.scale = last ? 2.6 : 2.0;   // the last of them towers over the rest
    m.maxHp *= T.n === 1 ? 0.8 : last ? 0.62 : T.n === 2 ? 0.48 : 0.38; m.hp = m.maxHp;
    if (v.mon && chance(0.5)) m.swap = null;
    m.raid.execT = Infinity;   // no execute timer at the top of the falls: the climb was the clock
    m.raid.label = function () { return this.inter ? `Warded — break the crystals! (${this.wards.filter((c) => !c.dead).length} left)` : `Phase ${this.pi + 1}/${this.phases.length} · ${this.phase.name}${this.enraged ? ' · ENRAGED' : ''}`; };
    world.add(m);
    world.boss = m; world.raid = m.raid;
    const how = ['falls', 'river', 'drop'][(i + (cv.seed >>> 3)) % 3];
    const P = cv.plateau, p = world.player;
    if (how === 'falls') climbFalls(m);
    else {
      const at = how === 'river' ? cv.river[Math.floor(cv.river.length * 0.3)] : [P.x + rand(-3, 3), P.y + rand(-3, 3)];
      [m.x, m.y] = map.randomNear(at[0], at[1], 1.5);
      if (Math.hypot(m.x - p.x, m.y - p.y) < 3) [m.x, m.y] = map.randomNear(P.x, P.y, 3);
      enter(m, how === 'river' ? 'burrow' : 'drop');
      if (how === 'river') { burst(m.x, m.y, 10, 'cold', 30, 5); smoke(m.x, m.y, 10, v.mist, 10, 16); }
    }
    UI.centerMsg(art.name.toUpperCase(), title, 3);
    UI.log(`<b style="color:#ff8050">${art.name}</b>, ${title}, ${how === 'falls' ? 'hauls itself up over the lip of the falls' : how === 'river' ? 'rises out of the river' : 'drops out of the dark'}.`, '#ffc0a0');
    sfx('roar', 0.7);
    // adds come with it
    const na = 2 + i * 2 + Math.min(4, Math.floor(depth / 25));
    for (let k = 0; k < na; k++) {
      const arch = pick(CAVE_ROSTER), [x, y] = spotNear(P.x, P.y, 2, P.r - 1.5);
      if (x == null) continue;
      const a = makeMonster(world, arch, biome, lvl + (k === 0 ? 1 : 0), k === 0 && i > 0 ? 'champion' : 'normal', x, y, 0, world.looks.pick(arch));
      world.add(a); a.hunter = true; a.awake = true; T.mobs.push(a);
      a.targetable = false; a.alpha = 0; let d = k * rand(0.2, 0.4); a.entering = (t) => { if ((d -= t) <= 0) enter(a, chance(0.5) ? 'drop' : 'burrow'); };
    }
    return m;
  }
  /** Up out of the plunge pool, up the falls and over the lip onto the plateau. */
  function climbFalls(m) {
    const [lx, ly] = cv.lip, [fx, fy] = cv.plunge, land = map.randomNear(lx - 1.6, ly - 1.6, 1.2), hT = cv.HP, hB = cv.WL;
    m.x = fx; m.y = fy; m.targetable = false; m.alpha = 1;
    let t = 0, fast = 0;
    const dur = 2.2;
    m.entering = (dt) => {
      if (!fast && run.top?.hurry) fast = Math.max(1, (dur - t) / 0.5);   // the rest of the climb in half a second
      t += dt * (fast || 1); m.animT += dt; m.moving = true;
      const k = Math.min(1, t / dur), up = Math.min(1, k / 0.8), hop = Math.max(0, (k - 0.8) / 0.2);
      m.x = fx + (lx - fx) * up + (land[0] - lx) * hop; m.y = fy + (ly - fy) * up + (land[1] - ly) * hop;
      m.z = (hB + (hT + 0.6 - hB) * (1 - (1 - up) * (1 - up)) + Math.sin(Math.PI * hop) * 1.2 - groundT(m.x, m.y)) * VZ;
      if (Math.random() < dt * 30) spawn({ type: 'glow', x: m.x, y: m.y, z: (m.z || 0) + 10, vz: rand(-40, 20), life: rand(0.3, 0.7), size: rand(1.5, 3), size1: 0.3, color: pick(v.blues), add: true });
      if (k >= 1) { m.entering = null; m.targetable = true; m.z = 0; m.moving = false; m.cd = rand(0.3, 0.6); sfx('thud', 0.8); camera.shake(6); burst(m.x, m.y, 8, 'cold', 30, 6); smoke(m.x, m.y, 8, v.mist, 10, 14); addEffect(new Ring(m.x, m.y, 0.3, 3.5, 0.7, v.hi, 4)); }
    };
  }
  function win() {
    run.completed = true; run.phase = 'done';
    world.raid = null;
    UI.centerMsg('THE TOP OF THE FALLS IS WON', 'A portal opens above the falls', 3.5);
    sfx('gate');
    const P = cv.plateau;
    let [x, y] = [P.x, P.y];
    if (!map.walkable(x, y) || map.wet[map.tileIdx(x, y)]) [x, y] = map.randomNear(P.x, P.y, 3);
    if (exit) { exit.x = x; exit.y = y; addEffect(new Column(x, y, '#40a0ff', 1.2, 40, 400)); burst(x, y, 30, 'arcane', 30, 5); }
    for (let k = 0; k < 2; k++) {
      const [cx, cy] = map.randomNear(P.x + (k ? 2.5 : -2.5), P.y - 2, 2);
      world.chests.push({ x: cx, y: cy, opened: false, reach: 1.3, rich: true, use() { if (this.opened) return; this.opened = true; sfx('chest'); sfx('gold'); dropChest(world, this, depth); sparkle(this.x, this.y, 20, '#ffd060', 20, 0.5); } });
    }
    onSuccess();
    area();
    UI.refresh();
  }
  const area = () => HUD.setArea(`Depth ${depth}`, `${v.name} · ${run.title}`);

  // ---------------------------------------------------------------- light, mist, sound
  let ambKey = '';
  function dressing(dt) {
    const p = world.player, vr = camera.viewRect(80);
    for (const t of cv.torches) {
      const px = isoX(t.x, t.y), py = isoY(t.x, t.y);
      if (px < vr.x0 || px > vr.x1 || py < vr.y0 - 80 || py > vr.y1 + 80) continue;
      const z = (t.h - groundT(t.x, t.y)) * VZ + 16;
      addLight(t.x, t.y, 6 + Math.sin(world.time * 9 + t.x) * 0.3, 0.95, z, v.torch);
      if (chance(dt * 6)) spawn({ type: 'glow', x: t.x + t.nx * 0.12, y: t.y + t.ny * 0.12, z, vz: rand(15, 35), life: rand(0.3, 0.6), size: rand(1.5, 3), size1: 0.4, color: chance(0.5) ? v.torch : '#fff0a0', add: true });
    }
    // the falls: their glow on the sprites, mist drifting over the shore, spray in the blues
    const [fx, fy] = cv.plunge, dF = Math.hypot(p.x - fx, p.y - fy);
    if (dF < 34) {
      addLight(fx, fy, 9, 0.9, 30, v.hi);
      addLight(cv.lip[0], cv.lip[1], 6, 0.6, 20, v.mid);
      if (dF < 16 && chance(dt * 9)) { const a = rand(0, 6.283), r = rand(0.5, 4.5); spawn({ type: 'smoke', x: fx + Math.cos(a) * r, y: fy + Math.sin(a) * r, z: rand(4, 40), vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), vz: rand(8, 22), life: rand(1.6, 2.8), size: rand(6, 10), size1: rand(22, 34), color: v.mist, alpha: 0.18 }); }
      if (dF < 20 && chance(dt * 14)) spawn({ type: 'glow', x: fx + rand(-2, 2), y: fy + rand(-2, 2), z: rand(0, 30), vx: rand(-0.5, 0.5), vy: rand(-0.5, 0.5), vz: rand(30, 90), g: -60, life: rand(0.5, 1.1), size: rand(1.2, 2.4), size1: 0.2, color: pick(v.blues), add: true });
    }
    if (cr.region === REG.shaft) addLight(cv.shaft.x, cv.shaft.y, 8, 0.7, 20, v.hi);
    const k = dF < 30 || cr.region === REG.plateau || cr.region === REG.gallery ? 'depths_edge_falls' : 'depths_edge';
    if (k !== ambKey) { ambKey = k; setAmbience(k); }
  }

  world.overworldScenario = run;
  return run;
}
