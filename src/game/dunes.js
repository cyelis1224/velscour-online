// THE SEA OF SAND'S DUNES (docs/SEA_OF_SAND_DUNES.md): the run. The level (world/dunes.js) is drawn in three.js behind
// the sprites (gfx/dunes3d.js); this file lifts everything onto its height field, picks through it, hides whoever
// stands behind higher ground, and keeps creatures, props and the mouse to the region the hero is in (the dunes, or the
// tomb inside the pyramid; they share screen space). It directs the level:
//  - the trek: a checkpoint (camp) at each waystone along the caravan route, each its own fight (ENCOUNTERS);
//  - the door: the pyramid's door is sealed by a slab until every camp is won; it sinks, and the party walks in;
//  - the tomb: room after room, each a step down, its way on sealed by a slab until its fight is won; a boss halfway;
//  - the burial chamber: the pyramid's master rises from the sarcophagus; its fall opens a portal there.
import { G } from '../state.js';
import { UI } from '../ui/ui.js';
import { HUD } from '../ui/hud.js';
import { camera, setElevation, HW, HH, isoX, isoY } from '../core/view.js';
import { rand, chance, pick, clamp, shuffle } from '../core/util.js';
import { sfx, setAmbience } from '../core/audio.js';
import { VZ } from '../world/caverns.js';
import { DREG } from '../world/dunes.js';
import { DUNE_ROSTER } from '../data/dunes.js';
import { drawDunes3D, tickDunes3D, buildDunes3D, disposeDunes3D, duneSprite, dunesScene, openSeal } from '../gfx/dunes3d.js';
import { makeMonster } from './monster.js';
import { makeRaidBoss, RAID_BOSSES } from './raid.js';
import { depthLevel } from '../data/depth.js';
import { addEffect, Ring, Column, Telegraph, burst, smoke, floatText, addLight, spawn, sparkle } from '../gfx/vfx.js';
import { hit } from './combat.js';
import { enter } from './mayhem.js';
import { dropChest } from './loot.js';
import { ART_BY_ID } from '../data/bestiary.js';

const K = HH / VZ;   // rise per tile of depth seen edge-on

/** The checkpoints' fights and the tomb's (name, what the quest log says). */
export const ENCOUNTERS = {
  ambush: ['Buried Ambush', 'Things wait under the sand round the waystone. Survive three waves.'],
  raiders: ["Raiders' Camp", 'Tomb raiders hold the waystone. Kill them and their captain.'],
  obelisks: ['The Singing Obelisks', 'Three obelisks sing the dead back to strength. Break them.'],
  storm: ['Sandstorm', 'A sandstorm rolls over the waystone. Hold out, then kill what rides it.'],
  dig: ['The Dig', 'Dig up three buried caches (stand on each marker) while the sands fight back.'],
  nest: ['Scarab Nest', 'Scarab egg sacs spill a swarm. Burst every sac.'],
  duel: ['Champion of the Sands', 'A champion of the sands waits at the waystone with its guard.'],
  oasis: ['Hold the Oasis', 'They come for the water. Kill sixteen of them.'],
  guardians: ['Hall of Guardians', 'The statues in this hall are not statues. They wake two by two.'],
  sealed: ['The Sealed Gallery', 'The slab drops behind you. Hold the gallery through three waves.'],
  sandfall: ['Sandfall', 'The ceiling pours sand. Fight, and keep out from under it.'],
  canopic: ['The Canopic Vault', 'Each canopic jar raises a mummy until it is broken.'],
  swarm: ['Scarab Tide', 'The walls are full of scarabs. They come out all at once.'],
  priests: ['Priests of the Dead', 'The tomb\'s priests still keep it, and their guards with them.'],
  tombboss: ['The Warden of the Tomb', 'Something guards the way down.'],
};
const CAMP_KINDS = ['ambush', 'raiders', 'obelisks', 'storm', 'dig', 'nest', 'duel', 'oasis'];
const ROOM_KINDS = ['guardians', 'sealed', 'sandfall', 'canopic', 'swarm', 'priests'];

/** Lift the ground onto the dunes' height field for a dune level; tear the 3D down for any other (game.js setWorld). */
export function useDunes(world) {
  const cr = world && world.cave;
  if (!cr || !cr.dv) { if (dunesScene()) disposeDunes3D(); return; }
  setElevation(cr.elev, cr.pick);
  cr.frame(0, true);
}

export function createDuneRun(world, gen, biome, onSuccess) {
  const dv = gen.dunes, v = gen.variant, map = world.map, depth = world.depth || 1, lvl = depthLevel(depth), W = map.w, H = map.h;
  world.ambushT = Infinity;   // the dunes direct their own fights
  const exit = world.portals.find((q) => q.type === 'exit');
  if (exit) { exit.x = exit.y = -100; }   // the portal opens in the burial chamber when its master falls
  const floorLo = map.minLevel / (VZ / 4) - 1.5, floorHi = map.maxLevel / (VZ / 4) + 8;
  const surfAt = (x, y) => { const i = map.tileIdx(x, y); return map.t[i] ? null : Number.isNaN(dv.lvl[i]) ? null : dv.lvl[i]; };
  const groundT = (x, y) => { const s = surfAt(x, y), h = dv.H2(x, y); return s != null && s > h ? s : h; };
  const tomb = (x) => x >= dv.OXI - 2;

  const cr = world.cave = {
    dv, v, focus: [0, 0, 0], cut: true, inside: false, zoomK: 1,
    elev: (x, y) => groundT(x, y) * VZ,
    inRegion: (x) => tomb(x) === cr.inside,
    cutAt(x, y, h) {
      const f = cr.focus;
      if (!cr.cut || (x + y) - (f[0] + f[2]) < 0.35 || h < f[1] + 0.75) return false;
      const sx = (x - y) * HW - (f[0] - f[2]) * HW, sy = (x + y) * HH - h * VZ - ((f[0] + f[2]) * HH - f[1] * VZ - 30);
      return (sx / 150) ** 2 + (sy / 120) ** 2 < 0.8;
    },
    /** World px back to the tile position whose ground shows there, in the hero's region (game/caverns.js pick). */
    pick(wx, wy) {
      let rock = null, inRock = false;
      const at = (h) => { const yy = wy + h * VZ; return [(wx / HW + yy / HH) / 2, (yy / HH - wx / HW) / 2]; };
      const open = (x, y) => { const i = map.tileIdx(x, y); return map.t[i] || map.wet[i]; };
      const below = (h) => { const [x, y] = at(h); if (x < 0 || y < 0 || x >= W || y >= H || !cr.inRegion(x)) return false; const g = groundT(x, y); return g >= h && !cr.cutAt(x, y, g); };
      for (let h = floorHi + 6; h >= floorLo; h -= 0.05) {
        if (!below(h)) { inRock = false; continue; }
        const [x, y] = at(h);
        if (inRock) { if (open(x, y)) return [x, y]; continue; }
        let a = h + 0.05, b = h;
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
    /** Where the ground in front of a creature hides it (null: nothing; -Infinity: all of it, or it's in the other region). */
    horizon(o) {
      if (!cr.inRegion(o.x)) return -Infinity;
      if (o === world.player) return null;
      const x = o.x, y = o.y, h0 = groundT(x, y), fy = (x + y) * HH - h0 * VZ - (o.z || 0);
      let top = Infinity;
      for (let s = 0.25, sMax = (floorHi - h0) / (2 * K) + 1; s < sMax; s += s < 2 ? 0.25 : 0.5) {
        const sx = x + s, sy = y + s;
        if (sx >= W || sy >= H || !cr.inRegion(sx)) break;
        const g = groundT(sx, sy), py = (sx + sy) * HH - g * VZ;
        if (py < top && !cr.cutAt(sx, sy, g)) top = py;
      }
      if (top >= fy - 3) return null;
      const hgt = o.viewH || 46 * (o.scale || 1);
      return top <= fy - hgt ? -Infinity : top;
    },
    /** A baked obelisk, column, urn or sarcophagus, or a 2D sprite from the Sea of Sand pack; it fades where it hides someone. */
    drawProp(ctx, o, d, views) {
      if (!cr.inRegion(o.x)) return;
      const spr = o.caveProp === 'sprite' ? o.spr : duneSprite(o.caveProp, o.m);
      if (!spr) return;
      const k = o.caveProp === 'sprite' ? o.k : (o.s || 1), x = isoX(o.x, o.y), y = isoY(o.x, o.y) - (o.z || 0);
      const rx = x + (o.flip ? -spr.ox - spr.w : spr.ox) * k, ry = y + spr.oy * k, rw = spr.w * k, rh = spr.h * k;
      let a = 1;
      for (const vw of views) {
        if (vw.d >= d || vw.x + vw.hw < rx || vw.x - vw.hw > rx + rw || vw.y1 < ry || vw.y0 > ry + rh) continue;
        a = Math.min(a, vw.hero ? 0.3 : 0.6);
      }
      if (a < 1) ctx.globalAlpha = a;
      if (o.flip) { ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1); ctx.drawImage(spr.img, spr.sx || 0, spr.sy || 0, spr.w, spr.h, spr.ox * k, ry, rw, rh); ctx.restore(); }
      else ctx.drawImage(spr.img, spr.sx || 0, spr.sy || 0, spr.w, spr.h, rx, ry, rw, rh);
      if (a < 1) ctx.globalAlpha = 1;
    },
    frame(dt, snap = false) {
      const p = world.player;
      if (!p) return;
      cr.inside = tomb(p.x);
      const h = groundT(p.x, p.y);
      cr.focus[0] = p.x; cr.focus[1] = h; cr.focus[2] = p.y;
      const r = dv.reg[map.tileIdx(p.x, p.y)];
      const zk = !cr.inside ? 0.9 : r === DREG.chamber ? 0.86 : 1;
      if (snap || Math.abs(cr.zoomK - zk) > 0.002) {
        cr.zoomK = snap ? zk : cr.zoomK + (zk - cr.zoomK) * Math.min(1, dt * 1.6);
        camera.zoomK = cr.zoomK; camera.computeZoom();
      }
      if (cr.look && cr.lookT > 0) {
        cr.lookT -= dt;
        const kk = clamp(Math.min(cr.lookT, cr.lookDur - cr.lookT) / 0.8, 0, 1), [lx, ly, lh] = cr.look;
        camera.leadX = (isoX(lx, ly) - isoX(p.x, p.y)) * kk; camera.leadY = (isoY(lx, ly) - lh * VZ - isoY(p.x, p.y)) * kk;
      } else { camera.leadX = 0; camera.leadY = 0; }
    },
    draw(ctx) { drawDunes3D(ctx, cr); },
  };
  void buildDunes3D(dv).catch((e) => console.warn(e));
  world.biome = { ...world.biome, dark: v.sky.night ? 0.42 : 0.06 };   // the Sea of Sand's own darkness (0.58) is for its flat maze: this is daylight
  const lighting = () => {   // the 2D light map: the variant's day or night outside, the dark inside
    world.darkK = cr.inside ? 0.7 : v.sky.night ? 0.5 : 0;
    world.night = cr.inside || !!v.sky.night;
    world.raining = false;
  };
  lighting();

  // ---------------------------------------------------------------- the fights
  const order = (list, n) => { const s = shuffle(list.slice()), out = []; for (let i = 0; i < n; i++) out.push(s[i % s.length]); return out; };
  const campKinds = order(CAMP_KINDS, dv.camps.length);
  const camps = dv.camps.map((c, i) => ({ kind: campKinds[i], label: ENCOUNTERS[campKinds[i]][0], name: c.name, x: c.x, y: c.y, r: c.r, h: c.h, marker: c.marker, i, state: 'idle', t: 0, foes: [], objs: [], marks: [], wave: 0, got: 0, camp: true }));
  const roomKinds = order(ROOM_KINDS, 5);
  const rooms = dv.rooms.map((rm) => {
    if (!rm.room) return null;
    const kind = rm.k === 0 ? null : rm.k === 6 ? 'tombboss' : roomKinds.shift();
    return { kind, label: kind ? ENCOUNTERS[kind][0] : '', name: rm.name, rm, x: rm.cx, y: rm.cy, r: Math.min(rm.x1 - rm.x0, rm.y1 - rm.y0) / 2, h: rm.h, k: rm.k, state: kind ? 'idle' : 'done', t: 0, foes: [], objs: [], marks: [], wave: 0, got: 0 };
  }).filter(Boolean);
  const chamber = dv.chamber;
  for (const s of dv.seals) for (const i of s.tiles) map.block[i] = 1;   // every way on is sealed until its room is won
  if (world.looks) { const ids = world.looks.ids.bind(world.looks); world.looks.ids = () => [...ids(), 'va_crystal', 'eb_m105', 'gold_chalice']; }   // the things to break
  const inRoom = (e, x, y) => x >= e.rm.x0 - 0.2 && x <= e.rm.x1 + 1.2 && y >= e.rm.y0 - 0.2 && y <= e.rm.y1 + 1.2;
  const deepIn = (e, x, y) => x >= e.rm.x0 + 1 && x < e.rm.x1 && y >= e.rm.y0 + 1 && y < e.rm.y1;   // a tile in: clear of the slab's tiles
  const roomIn = (e, x, y) => x >= e.rm.x0 + 0.5 && x <= e.rm.x1 + 0.5 && y >= e.rm.y0 + 0.5 && y <= e.rm.y1 + 0.5;
  const inside = (e) => spotNear(e.x, e.y, 0, Math.max(2, e.r - 1), 60, (x, y) => roomIn(e, x, y));
  const alive = (list) => list.filter((m) => !m.dead && world.creatures.includes(m));

  const run = {
    id: 'sea_of_sand_dunes', type: 'dunes', completed: false, failed: false, active: true, markers: [], route: [], stage: 0, escort: null, routeIndex: 0,
    shrine: { x: dv.start[0], y: dv.start[1], reach: 2, label: v.pyramid.name, use() {} },
    variant: v, phase: 'trek', camps, rooms, top: null, fade: null, doorOpen: false, warnT: 0, nextDoorMsg: 0,
    get campsDone() { return camps.filter((e) => e.state === 'done').length; },
    get roomsDone() { return rooms.filter((e) => e.kind && e.state === 'done').length; },
    get current() { return [...camps, ...rooms].find((e) => e.state === 'active') || null; },
    get title() {
      if (run.completed) return 'The Tomb Is Won';
      const c = run.current;
      if (c) return c.name + ' — ' + ENCOUNTERS[c.kind][0];
      return run.phase === 'trek' ? 'Win the Waystones' : run.phase === 'door' ? 'The Pyramid\'s Door' : run.phase === 'chamber' ? 'The Burial Chamber' : 'Down Into the Tomb';
    },
    get description() {
      if (run.completed) return 'A portal burns in the burial chamber. The way on is open.';
      const c = run.current;
      if (c) return ENCOUNTERS[c.kind][1];
      if (run.phase === 'trek') return `Win every waystone across the dunes (${run.campsDone} of ${camps.length}); then the door of ${v.pyramid.name} opens.`;
      if (run.phase === 'door') return `The door of ${v.pyramid.name} stands open. Go in.`;
      if (run.phase === 'chamber') return run.top && run.top.boss ? 'The master of the pyramid has risen.' : 'The burial chamber lies ahead, at the heart of the pyramid.';
      return `Go down through the tomb, room by room (${run.roomsDone} of ${rooms.filter((e) => e.kind).length} won), to the burial chamber.`;
    },
    get hud() {
      const c = run.current, enc = c && ENCOUNTERS[c.kind];
      const total = cr.inside ? rooms.filter((e) => e.kind).length + 1 : camps.length, beat = cr.inside ? Math.min(total, run.roomsDone + 1) : Math.min(total, run.campsDone + 1);
      let progress = c ? progressOf(c) : run.phase === 'trek' ? `Waystones ${run.campsDone}/${camps.length}` : run.phase === 'door' ? 'The door is open' : run.completed ? 'The way on is open' : `Rooms ${run.roomsDone}/${total - 1}`;
      const timer = c && c.limit ? `${Math.max(0, Math.ceil(c.limit - c.t))}s` : '';
      return { title: enc ? c.name : run.title, beat, total, timer, progress };
    },
    /**
     * Where a fight needs the hero even while it fights (auto-play pushes through to it every few seconds): a cache to
     * stand on (`hold`), the nearest relic to break, or back inside the fight's ring when kiting has drawn him out.
     */
    get duty() {
      const c = run.current, p = world.player;
      if (!c || !p) return null;
      const mk = c.marks.find((m) => !m.done);
      if (mk) return { x: mk.x, y: mk.y, reach: 0.8, hold: true, label: 'Digging up the cache' };
      const o = alive(c.objs).reduce((a, m) => !a || Math.hypot(m.x - p.x, m.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? m : a, null);
      if (o) return { x: o.x, y: o.y, reach: 1.6, label: 'Breaking the ' + o.name };
      return Math.hypot(p.x - c.x, p.y - c.y) > c.r + 5 ? { x: c.x, y: c.y, reach: c.r * 0.5, label: 'Back to ' + c.name } : null;
    },
    /** Where auto-play goes next (game/autoplay.js): the next waystone, the door, the next room, the chamber. */
    get objective() {
      if (run.completed) return undefined;
      const p = world.player, c = run.current;
      if (c) {
        const mk = c.marks.find((m) => !m.done);
        if (mk) return { x: mk.x, y: mk.y, reach: 0.6 };
        const o = alive(c.objs)[0];
        if (o) return { x: o.x, y: o.y, reach: 1.6 };
        // its own foes, nearest first, else hold its ground for the next wave (never off hunting the far dunes)
        const f = alive(c.foes).filter((m) => m.targetable !== false).reduce((a, m) => !a || Math.hypot(m.x - p.x, m.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? m : a, null);
        return f ? { x: f.x, y: f.y, reach: 1.5 } : { x: c.x, y: c.y, reach: Math.max(1.5, c.r * 0.4) };
      }
      if (run.phase === 'trek') { const e = camps.find((q) => q.state !== 'done'); return e ? { x: e.x, y: e.y, reach: 2.5 } : null; }
      if (run.phase === 'door') return { x: dv.pyramid.doorStep[0], y: dv.pyramid.doorStep[1], reach: 0.8, use: () => toTomb() };
      if (run.phase === 'tomb') {
        const e = rooms.find((q) => q.kind && q.state !== 'done');
        if (e) return { x: e.x, y: e.y, reach: 2 };
        return { x: chamber.cx + 0.5, y: chamber.cy + 6, reach: 2 };
      }
      if (run.phase === 'chamber') { const b = run.top && run.top.boss; return b ? (b.dead ? null : { x: b.x, y: b.y, reach: 1.5 }) : { x: chamber.cx + 0.5, y: chamber.cy + 6, reach: 2 }; }
      return null;
    },
    update(dt) {
      const p = world.player;
      if (!p) return;
      cr.frame(dt);
      tickDunes3D(dt, cr);
      if (run.fade) tickFade(dt);
      if (p.dead) return;
      for (const e of [...camps, ...rooms]) if (e.state === 'active') tickEnc(e, dt);
      if (run.phase === 'trek') {
        for (const e of camps) if (e.state === 'idle' && Math.hypot(p.x - e.x, p.y - e.y) < e.r - 1) startEnc(e);
        if (run.campsDone === camps.length) openDoor();
        else if (Math.hypot(p.x - dv.pyramid.doorStep[0], p.y - dv.pyramid.doorStep[1]) < 3 && world.time > run.nextDoorMsg) {
          run.nextDoorMsg = world.time + 6;
          floatText(p.x, p.y, 90, `Sealed — ${camps.length - run.campsDone} waystones still stand against it`, '#ffd080', 13, { life: 2.2 });
        }
      } else if (run.phase === 'door') {
        if (Math.hypot(p.x - dv.pyramid.doorStep[0], p.y - dv.pyramid.doorStep[1]) < 1.3) toTomb();
      } else if (run.phase === 'tomb') {
        for (const e of rooms) if (e.state === 'idle' && deepIn(e, p.x, p.y)) startEnc(e);
        const reg = dv.reg[map.tileIdx(p.x, p.y)];
        if (reg === DREG.chamber) startChamber();
        if (!run.treasury && p.x >= dv.treasury.x0 && p.x <= dv.treasury.x1 + 1 && p.y >= dv.treasury.y0 && p.y <= dv.treasury.y1 + 1) treasury();
      } else if (run.phase === 'chamber') chamberTick(dt);
      dressing(dt);
    },
  };

  // ---------------------------------------------------------------- spawning
  function spotNear(x0, y0, r0, r1, tries = 40, keep = null) {
    for (let t = 0; t < tries; t++) {
      const a = rand(0, 6.283), r = rand(r0, r1), x = x0 + Math.cos(a) * r, y = y0 + Math.sin(a) * r, i = map.tileIdx(x, y);
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1 || !cr.inRegion(x) || (keep && !keep(x, y))) continue;
      if (map.t[i] && !map.block[i] && Math.abs(map.hgt[i] - map.hgt[map.tileIdx(x0, y0)]) < 8 && map.circleFree(x, y, 0.4)) return [x, y];
    }
    return [null, null];
  }
  /** A monster of `arch` (or of the variant's roster) entering by `how` (drop, burrow, teleport, wall) after `delay`. */
  function foe(e, x, y, { arch = pick(DUNE_ROSTER), rank = 'normal', how = 'burrow', delay = 0, look = null, lv = lvl } = {}) {
    if (e && !e.camp && !roomIn(e, x, y)) {   // a room's foes arrive in the room (a radius can reach past its slab)
      const [rx, ry] = inside(e); if (rx == null) return null; x = rx; y = ry;
    }
    const m = makeMonster(world, arch, biome, lv, rank, x, y, 0, look || world.looks.pick(arch));
    world.add(m); m.hunter = true; m.awake = true;
    const from = how === 'wall' ? wallNear(x, y) : null;   // it tears itself out of the nearest wall
    if (how === 'wall' && !from) how = 'burrow';
    if (delay <= 0) enter(m, how, from);
    else { m.targetable = false; m.alpha = 0; let d = delay; m.entering = (t) => { if ((d -= t) <= 0) enter(m, how, from); }; }
    if (e) e.foes.push(m);
    return m;
  }
  function wallNear(x, y) {
    for (let r = 1; r <= 4; r++) for (let a = 0; a < 8; a++) {
      const tx = Math.floor(x + Math.cos(a * 0.785) * r), ty = Math.floor(y + Math.sin(a * 0.785) * r);
      if (tx > 0 && ty > 0 && tx < W - 1 && ty < H - 1 && !map.t[map.tileIdx(tx, ty)] && !map.wet[map.tileIdx(tx, ty)] && cr.inRegion(tx)) return [tx + 0.5, ty + 0.5];
    }
    return null;
  }
  function wave(e, n, { how = 'burrow', r0 = 3, r1 = 8, at = null, arch = null, rank = null } = {}) {
    const p = world.player, [cx, cy] = at || [p.x, p.y];
    for (let k = 0; k < n; k++) {
      const [x, y] = spotNear(cx, cy, r0, r1);
      if (x == null) continue;
      foe(e, x, y, { arch: arch || pick(DUNE_ROSTER), rank: rank || (k === 0 && depth > 8 ? 'champion' : 'normal'), how, delay: k * rand(0.12, 0.3) });
    }
  }
  /** A still object to break (an obelisk, a canopic jar, an egg sac): a monster that never moves, its tick its power. */
  function relic(e, x, y, name, art, tick) {
    const m = makeMonster(world, 'golem', biome, lvl, 'champion', x, y, 0, { art, swap: v.swap, tint: v.tint });
    m.name = name; m.static = true; m.speed = 0; m.maxHp *= 0.9; m.hp = m.maxHp; m.scale = (m.scale || 1) * 1.15; m.awake = true; m.xp *= 0.5;
    m.wardTick = (dt) => { m.moving = false; tick && tick(m, dt); };
    world.add(m); e.objs.push(m);
    burst(x, y, 10, 'arcane', 20, 4);
    return m;
  }
  const progressOf = (e) => {
    switch (e.kind) {
      case 'ambush': case 'sealed': return `Wave ${Math.max(1, e.wave)}/3`;
      case 'obelisks': return `Obelisks ${e.objs.filter((o) => o.dead).length}/${e.objs.length}`;
      case 'canopic': return `Jars ${e.objs.filter((o) => o.dead).length}/${e.objs.length}`;
      case 'nest': return `Egg sacs ${e.objs.filter((o) => o.dead).length}/${e.objs.length}`;
      case 'dig': return `Caches ${e.marks.filter((m) => m.done).length}/${e.marks.length}`;
      case 'oasis': return `Slain ${Math.min(16, e.got)}/16`;
      case 'storm': return e.t < e.limit ? 'Hold out' : 'Kill the storm-rider';
      default: { const n = alive(e.foes).length; return n ? `${n} foes left` : 'Clear'; }
    }
  };

  // ---------------------------------------------------------------- encounters
  function startEnc(e) {
    e.state = 'active'; e.t = 0; e.wave = 0;
    const [nm, desc] = ENCOUNTERS[e.kind];
    UI.centerMsg(e.name.toUpperCase(), nm, 2.6);
    UI.log(`<b style="color:#ffd080">${e.name}</b> — ${desc}`, '#ffe2a0');
    sfx(e.camp ? 'boss' : 'door', 0.5);
    const p = world.player, c = [e.x, e.y], R = e.camp ? e.r : Math.max(4, e.r - 1);
    switch (e.kind) {
      case 'ambush': case 'sealed': e.wave = 1; wave(e, 4 + Math.min(3, depth / 25 | 0), { how: e.kind === 'sealed' ? 'wall' : 'burrow' }); break;
      case 'raiders': {
        for (let k = 0; k < 6 + Math.min(4, depth / 20 | 0); k++) { const [x, y] = spotNear(e.x, e.y, 2, R); if (x != null) foe(e, x, y, { arch: pick(['skeleton', 'archer', 'knight', 'cultist']), how: 'teleport', delay: k * 0.15 }); }
        const [x, y] = spotNear(e.x, e.y, 1, 3); if (x != null) { const cap = foe(e, x, y, { arch: 'knight', rank: 'unique', how: 'drop' }); cap.name = `${v.tint} Raider Captain`; cap.scale = 1.3; }
        break;
      }
      case 'obelisks': for (let k = 0; k < 3; k++) {
        const a = k / 3 * 6.283 + 0.5, [x, y] = spotNear(e.x + Math.cos(a) * R * 0.6, e.y + Math.sin(a) * R * 0.6, 0, 2.5);
        if (x != null) relic(e, x, y, 'Singing Obelisk', 'va_crystal', (o, dt) => {
          if ((o.pulse = (o.pulse || 0) - dt) > 0) return;
          o.pulse = 4;
          for (const m of alive(e.foes)) if (Math.hypot(m.x - o.x, m.y - o.y) < 8) { m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.12); addEffect(new Ring(m.x, m.y, 0.2, 1, 0.4, v.pyramid.glyph, 2)); }
          addEffect(new Ring(o.x, o.y, 0.3, 8, 0.8, v.pyramid.glyph, 3));
        });
      }
        wave(e, 4, { how: 'burrow', at: c, r1: R }); break;
      case 'storm': e.limit = 34; storm(e); break;
      case 'dig': for (let k = 0; k < 3; k++) {
        const a = k / 3 * 6.283 + rand(0, 1), [x, y] = spotNear(e.x + Math.cos(a) * R * 0.55, e.y + Math.sin(a) * R * 0.55, 0, 2);
        if (x != null) e.marks.push({ x, y, t: 0, done: false });
      }
        wave(e, 3, { at: c, r1: R }); break;
      case 'nest': for (let k = 0; k < 3; k++) {
        const a = k / 3 * 6.283, [x, y] = spotNear(e.x + Math.cos(a) * R * 0.5, e.y + Math.sin(a) * R * 0.5, 0, 2);
        if (x != null) relic(e, x, y, 'Scarab Egg Sac', 'eb_m105', (o, dt) => {
          if ((o.brood = (o.brood || 2) - dt) > 0 || alive(e.foes).length > 10) return;
          o.brood = 5;
          const [sx, sy] = spotNear(o.x, o.y, 0.8, 2.5); if (sx != null) foe(e, sx, sy, { arch: 'beetle', how: 'burrow' });
        });
      }
        wave(e, 5, { arch: 'beetle', at: c, r1: R }); break;
      case 'duel': {
        const [x, y] = spotNear(e.x, e.y, 0.5, 2.5);
        if (x != null) { const ch = foe(e, x, y, { arch: pick(['knight', 'golem', 'scorpion', 'hound']), rank: 'unique', how: 'drop', lv: lvl + 2 }); ch.scale = 1.45; ch.name = `${v.tint} Champion of ${e.name.replace(/^The /, '')}`; e.boss = ch; }
        wave(e, 2, { rank: 'champion', at: c, r1: 4, how: 'teleport' }); break;
      }
      case 'oasis': e.got = 0; e.spawnT = 0; break;
      case 'guardians': for (let k = 0; k < 4; k++) {
        const rm = e.rm, x = k % 2 ? rm.x1 - 1.5 : rm.x0 + 2.5, y = k < 2 ? rm.y0 + 2.5 : rm.y1 - 1.5;
        const m = foe(e, x, y, { arch: pick(['golem', 'knight']), rank: 'champion', how: 'teleport', delay: 99 });
        if (m) m.entering = null, m.alpha = 1, m.targetable = false, m.static = true, m.dormant = true, m.awake = false, m.hunter = false, m.swap = { sat: 0.1, light: -0.05 };
      }
        e.nextWake = 1.5; break;
      case 'sandfall': e.wave = 1; wave(e, 5, { how: 'drop' }); e.fallT = 2; break;
      case 'canopic': for (let k = 0; k < 4; k++) {
        const rm = e.rm, x = k % 2 ? rm.x1 - 1 : rm.x0 + 2, y = k < 2 ? rm.y0 + 2 : rm.y1 - 1;
        relic(e, x, y, 'Canopic Jar', 'gold_chalice', (o, dt) => {
          if ((o.raise = (o.raise || 5) - dt) > 0 || alive(e.foes).length > 8) return;
          o.raise = 9;
          const [sx, sy] = spotNear(o.x, o.y, 1, 3); if (sx != null) { const m = foe(e, sx, sy, { arch: 'zombie', how: 'burrow' }); if (m) m.name = 'Risen ' + (m.name || 'Mummy'); }
        });
      }
        wave(e, 3, { arch: 'zombie' }); break;
      case 'swarm': e.wave = 1; wave(e, 10, { arch: 'beetle', how: 'wall', r0: 2, r1: 9 }); break;
      case 'priests': {
        for (let k = 0; k < 3; k++) { const [x, y] = spotNear(e.x, e.y, R * 0.5, R); if (x != null) foe(e, x, y, { arch: 'cultist', rank: 'champion', how: 'teleport', delay: k * 0.3 }); }
        wave(e, 4, { arch: pick(['skeleton', 'zombie']), r0: 2, r1: R });
        break;
      }
      case 'tombboss': tombBoss(e); break;
    }
    if (!e.camp) {   // the slab behind closes too: no running back out of a fight
      e.lock = [];
      for (const cor of dv.corridors) if (cor.k === e.k - 1) for (const i of cor.tiles) { const x = i % W, y = (i / W) | 0; if (!inRoom(e, x + 0.5, y + 0.5) && Math.min(Math.abs(x - e.rm.x0), Math.abs(x - e.rm.x1), Math.abs(y - e.rm.y0), Math.abs(y - e.rm.y1)) <= 1) { e.lock.push(i); map.block[i] = 1; } }
      for (const m of world.creatures) if (m.team === 'player' && !m.dead && e.lock.includes(Math.floor(m.y) * W + Math.floor(m.x))) {   // no one shut out
        const [x, y] = spotNear(e.x, e.y, 0.5, 3); if (x != null) { m.x = x; m.y = y; m.path = null; }
      }
      map.flowFrom = [-9, -9];
    }
    area();
  }
  function tickEnc(e, dt) {
    e.t += dt;
    const p = world.player, live = alive(e.foes), objs = alive(e.objs);
    if (!e.camp) for (const m of live) if (!m.entering && !roomIn(e, m.x, m.y)) { const [x, y] = inside(e); if (x != null) { m.x = x; m.y = y; m.path = null; } }
    switch (e.kind) {
      case 'ambush': case 'sealed':
        if (!live.length || e.t > 26 * e.wave) {
          if (e.wave >= 3) { if (!live.length) return finishEnc(e); break; }
          e.wave++; wave(e, 4 + e.wave + Math.min(3, depth / 25 | 0), { how: e.kind === 'sealed' ? (e.wave === 2 ? 'drop' : 'wall') : e.wave === 2 ? 'drop' : 'burrow' });
        }
        break;
      case 'raiders': case 'priests': case 'swarm':
        if (e.kind === 'swarm' && !live.length && e.wave < 3) { e.wave++; wave(e, 9 + e.wave * 2, { arch: 'beetle', how: e.wave === 2 ? 'drop' : 'wall', r0: 2, r1: 9 }); break; }
        if (!live.length) return finishEnc(e);
        break;
      case 'obelisks': case 'nest': case 'canopic':
        if (e.kind === 'obelisks' && objs.length && (e.spawnT = (e.spawnT ?? 12) - dt) <= 0) { e.spawnT = 12; wave(e, 3, { at: [e.x, e.y], r1: e.r, how: 'drop' }); }
        if (!objs.length && !live.length) return finishEnc(e);
        break;
      case 'storm': {
        if (e.t < e.limit) {
          if (!live.length) e.spawnT = Math.min(e.spawnT ?? 3, 0.6); // nothing left to fight in the storm: the next pair now
          if ((e.spawnT = (e.spawnT ?? 3) - dt) <= 0 && live.length < 9) { e.spawnT = 5; wave(e, 2, { how: 'drop', r0: 3, r1: 7 }); }
        } else if (!e.rider) {
          const [x, y] = spotNear(p.x, p.y, 3, 6);
          if (x != null) { e.rider = foe(e, x, y, { arch: pick(['golem', 'wraith']), rank: 'unique', how: 'drop', lv: lvl + 1 }); e.rider.name = 'Storm-Rider'; e.rider.scale = 1.5; }
        } else if (e.rider.dead && !live.length) { e.storm.end = true; return finishEnc(e); }
        break;
      }
      case 'dig': {
        for (const m of e.marks) {
          if (m.done) continue;
          if (Math.hypot(p.x - m.x, p.y - m.y) < 1.1) {
            m.t += dt;
            if (Math.random() < dt * 8) spawn({ type: 'smoke', x: m.x + rand(-0.4, 0.4), y: m.y + rand(-0.4, 0.4), z: 4, vz: rand(10, 30), life: rand(0.6, 1.2), size: rand(4, 7), size1: 14, color: '#c8a870', alpha: 0.4 });
            if (m.t >= 3.5) { m.done = true; sfx('chest'); sparkle(m.x, m.y, 16, '#ffd060', 16, 0.5); dropChest(world, { x: m.x, y: m.y }, depth); floatText(m.x, m.y, 60, 'Cache unearthed!', '#ffd060', 13); }
          }
        }
        if ((e.spawnT = (e.spawnT ?? 8) - dt) <= 0 && live.length < 7) { e.spawnT = 8; wave(e, 2, { how: 'burrow', r0: 3, r1: 6 }); }
        if (e.marks.every((m) => m.done) && !live.length) return finishEnc(e);
        break;
      }
      case 'duel': if (e.boss && e.boss.dead && !live.length) return finishEnc(e); break;
      case 'oasis': {
        e.got = e.foes.filter((m) => m.dead).length;
        if (!live.length) e.spawnT = Math.min(e.spawnT ?? 0, 0.5);
        if (e.got < 16 && (e.spawnT = (e.spawnT ?? 0) - dt) <= 0 && live.length < 8) { e.spawnT = 3.2; const a = rand(0, 6.283); wave(e, 3, { at: [e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r], r0: 0, r1: 3, how: 'burrow' }); }
        if (e.got >= 16 && !live.length) return finishEnc(e);
        break;
      }
      case 'guardians': {
        const dorm = e.foes.filter((m) => m.dormant && !m.dead);
        if (!live.some((m) => !m.dormant)) e.nextWake = Math.min(e.nextWake, 0.6); // the woken pair cut down: the next stirs at once
        if (dorm.length && (e.nextWake -= dt) <= 0) {
          e.nextWake = 9;
          for (const m of dorm.slice(0, 2)) { m.dormant = false; m.static = false; m.targetable = true; m.awake = true; m.hunter = true; m.swap = null; addEffect(new Ring(m.x, m.y, 0.3, 2.5, 0.6, v.pyramid.glyph, 4)); burst(m.x, m.y, 12, 'arcane', 24, 4); camera.shake(3); sfx('roar', 0.5); }
          wave(e, 2, { how: 'wall' });
        }
        if (!dorm.length && !live.length) return finishEnc(e);
        break;
      }
      case 'sandfall': {
        if ((e.fallT -= dt) <= 0) {
          e.fallT = rand(1.6, 2.6);
          for (let k = 0; k < 2; k++) {
            const [x, y] = k ? spotNear(p.x, p.y, 1.5, 4) : [p.x + rand(-0.6, 0.6), p.y + rand(-0.6, 0.6)];
            if (x == null) continue;
            addEffect(new Telegraph({ kind: 'circle', x, y, r: 1.5, dur: 1.15, color: '#e8c070' }), 'ground');
            setTimeout(() => {
              if (world !== G.world) return;
              smoke(x, y, 10, '#d8b878', 10, 18); burst(x, y, 8, 'phys', 30, 3); sfx('thud', 0.4);
              const q = world.player; if (q && !q.dead && Math.hypot(q.x - x, q.y - y) < 1.6) hit(null, q, q.maxHp * 0.11, 'phys');
              for (const m of alive(e.foes)) if (Math.hypot(m.x - x, m.y - y) < 1.6) hit(null, m, m.maxHp * 0.25, 'phys');
            }, 1150);
          }
        }
        if (!live.length) { if (e.wave >= 3) return finishEnc(e); e.wave++; wave(e, 5 + e.wave, { how: e.wave === 2 ? 'wall' : 'drop' }); }
        break;
      }
      case 'tombboss': if (e.boss && e.boss.dead && !live.length) { world.raid = null; world.boss = null; return finishEnc(e); } break;
    }
  }
  function finishEnc(e) {
    e.state = 'done';
    const where = e.camp ? [e.x, e.y] : [e.x, e.y];
    UI.centerMsg(e.camp ? `${e.name.toUpperCase()} WON` : `${e.name.toUpperCase()}`, e.camp ? `Waystone ${run.campsDone} of ${camps.length}` : 'The slab ahead sinks into the floor', 2.4);
    sfx('gate', 0.6);
    const [cx, cy] = map.randomNear(where[0], where[1], 2);
    world.chests.push({ x: cx, y: cy, opened: false, reach: 1.3, rich: e.kind === 'tombboss' || e.kind === 'duel', use() { if (this.opened) return; this.opened = true; sfx('chest'); sfx('gold'); dropChest(world, this, depth); sparkle(this.x, this.y, 20, '#ffd060', 20, 0.5); } });
    if (e.camp && e.marker) { addEffect(new Column(e.marker[0], e.marker[1], v.pyramid.glyph, 0.8, 30, 260)); burst(e.marker[0], e.marker[1], 18, 'arcane', 24, 5); }
    if (!e.camp) {
      openSeal(e.k);
      const seal = dv.seals.find((s) => s.k === e.k);
      if (seal) setTimeout(() => { for (const i of seal.tiles) map.block[i] = 0; map.flowFrom = [-9, -9]; }, 1500);
      for (const i of e.lock || []) map.block[i] = 0;
    }
    for (const m of alive(e.foes)) m.hunter = true;
    if (G.game?.autosave) G.game.autosave();
    area(); UI.refresh();
  }
  function storm(e) {   // a wall of sand over the waystone: a haze over the view, streaming grit
    e.storm = { t: 0, end: false };
    world.addHazard({ fadeLayer: true, draw(ctx) {
      const s = e.storm, a = clamp(Math.min(s.t / 2, s.end ? 1 - (s.t2 || 0) / 2 : 1), 0, 1) * 0.42, vr = camera.viewRect(200);
      if (a <= 0) return;
      ctx.fillStyle = `rgba(214,176,112,${a})`; ctx.fillRect(vr.x0, vr.y0, vr.x1 - vr.x0, vr.y1 - vr.y0);
    }, update(dt) {
      const s = e.storm; s.t += dt; if (s.end) s.t2 = (s.t2 || 0) + dt;
      const p = world.player;
      if (p && Math.random() < dt * 30) spawn({ type: 'smoke', x: p.x + rand(-9, 3), y: p.y + rand(-9, 3), z: rand(4, 60), vx: 2.2, vy: -0.8, vz: rand(-4, 4), life: rand(0.8, 1.6), size: rand(3, 6), size1: rand(10, 18), color: '#d8b878', alpha: 0.35 });
      return world === G.world && !(s.end && s.t2 > 2);
    } });
    sfx('wind', 0.6);
  }

  // ---------------------------------------------------------------- the door and the tomb
  function openDoor() {
    if (run.doorOpen) return;
    run.doorOpen = true; run.phase = 'door';
    openSeal('door');
    const [dx, dy] = dv.pyramid.doorStep;
    UI.centerMsg(v.pyramid.name.toUpperCase(), 'The last waystone falls silent. The door slab sinks into the sand.', 3.4);
    UI.log(`Every waystone is won. The door of <b style="color:#ffd060">${v.pyramid.name}</b> opens.`, '#ffe2a0');
    cr.look = [dx, dy, dv.pyramid.top * 0.3]; cr.lookT = cr.lookDur = 3.2;
    sfx('gate', 0.8); camera.shake(4);
    area();
  }
  function fadeTo(mid) { run.fade = { t: 0, mid, done: false }; }
  function tickFade(dt) { const f = run.fade; f.t += dt; if (!f.done && f.t >= 0.45) { f.done = true; f.mid(); } if (f.t >= 1.2) run.fade = null; }
  world.addHazard({ keep: true, draw(ctx) {
    const f = run.fade;
    if (!f) return;
    const a = f.t < 0.45 ? f.t / 0.45 : 1 - (f.t - 0.45) / 0.75, vr = camera.viewRect(200);
    ctx.fillStyle = `rgba(0,0,0,${clamp(a, 0, 1)})`; ctx.fillRect(vr.x0, vr.y0, vr.x1 - vr.x0, vr.y1 - vr.y0);
  }, update() { return world === G.world; } });
  function toTomb() {
    if (run.phase !== 'door' || run.fade) return;
    sfx('door', 0.7);
    fadeTo(() => {
      const p = world.player, pets = world.creatures.filter((c) => c !== p && c.team === 'player' && !c.dead);
      [p.x, p.y] = dv.arrive; p.path = null; p.moveTarget = null; p.attackTarget = null; p.interact = null; p.lootTarget = null;
      for (const s of pets) { [s.x, s.y] = map.randomNear(p.x, p.y, 1.6); s.aggro = null; s.foe = null; s.nav = null; s.fol = null; }
      for (const c of world.creatures) if (c.team === 'enemy' && !tomb(c.x)) { c.awake = false; c.aggro = null; c.hunter = false; }
      world.hazards = world.hazards.filter((h) => h.keep || !h.o);
      map.flowFrom = [-9, -9];
      run.phase = 'tomb';
      cr.frame(0, true); lighting();
      camera.follow(p.x, p.y, 0, true);
      map.reveal(p.x, p.y, 16);
      openSeal(0); const s0 = dv.seals.find((s) => s.k === 0); if (s0) for (const i of s0.tiles) map.block[i] = 0;
      UI.centerMsg(v.pyramid.name.toUpperCase(), 'Inside. The way goes down, and round, and down.', 3.2);
      UI.log(`The door closes behind you. Somewhere far below, at the heart of the pyramid, the burial chamber waits.`, '#ffe2a0');
      area();
    });
  }
  function treasury() {
    run.treasury = true;
    const T = dv.treasury;
    UI.centerMsg('THE TREASURY', 'Gold, and something that guards it', 2.4);
    for (let k = 0; k < 2; k++) { const [x, y] = spotNear(T.cx, T.cy, 0.5, 2.5); if (x != null) foe(null, x, y, { arch: pick(['golem', 'knight', 'scorpion']), rank: 'champion', how: 'teleport', delay: k * 0.4 }); }
  }
  function tombBoss(e) {
    const [artId, tplId, title] = v.bosses[1] || v.bosses[0], rm = e.rm;
    const arena = { cx: rm.cx, cy: rm.cy, x: rm.x0, y: rm.y0, w: rm.x1 - rm.x0 + 1, h: rm.y1 - rm.y0 + 1, gate: { x: -40, y0: -40, y1: -39 } };
    const m = boss(arena, artId, tplId, title, 0.5, 2.0);
    e.boss = m; e.foes.push(m);
    UI.log(`<b style="color:#ff8050">${m.name}</b>, ${title}, bars the way down.`, '#ffc0a0');
  }
  function boss(arena, artId, tplId, title, hpK, scale) {
    const tpl = RAID_BOSSES.find((b) => b.id === tplId) || pick(RAID_BOSSES.filter((b) => !b.sigs));
    const name = artName(artId) || tpl.name;
    const m = makeRaidBoss(world, arena, depth, lvl + 3, { tpl: { ...tpl, name, title, adds: DUNE_ROSTER.slice(0, 6) }, art: artId });
    m.scale = scale; m.maxHp *= hpK; m.hp = m.maxHp; m.swap = v.swap;
    m.raid.execT = Infinity;   // no execute timer in the tomb: the descent was the clock
    world.add(m); world.boss = m; world.raid = m.raid;
    [m.x, m.y] = map.randomNear(arena.cx + 0.5, arena.cy + 0.5, 2);
    enter(m, 'burrow');
    UI.centerMsg(name.toUpperCase(), title, 3);
    sfx('roar', 0.7); camera.shake(6);
    return m;
  }
  function artName(id) { return ART_BY_ID[id]?.name || id.replace(/^ss_boss_|^ss_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }

  // ---------------------------------------------------------------- the burial chamber
  function startChamber() {
    if (run.phase === 'chamber') return;
    run.phase = 'chamber';
    run.top = { t: 0, boss: null, adds: [] };
    UI.centerMsg('THE BURIAL CHAMBER', `The heart of ${v.pyramid.name}`, 3.2);
    UI.log(`<b style="color:#ffc070">The burial chamber.</b> The sarcophagus lid grinds aside.`, '#ffe2a0');
    sfx('boss', 0.6);
    area();
  }
  function chamberTick(dt) {
    const T = run.top;
    T.t += dt;
    if (!T.boss && T.t > 2.6) {
      const [artId, tplId, title] = v.bosses[0];
      const arena = { cx: chamber.cx, cy: chamber.cy, x: chamber.x0, y: chamber.y0, w: chamber.x1 - chamber.x0 + 1, h: chamber.y1 - chamber.y0 + 1, gate: { x: -40, y0: -40, y1: -39 } };
      T.boss = boss(arena, artId, tplId, title, 1, 2.6);
      [T.boss.x, T.boss.y] = map.randomNear(chamber.cx + 0.5, chamber.cy + 2.5, 1.5);
      for (let k = 0; k < 3 + Math.min(4, depth / 25 | 0); k++) { const [x, y] = spotNear(chamber.cx, chamber.cy, 4, 12); if (x != null) T.adds.push(foe(null, x, y, { how: 'burrow', delay: 1 + k * 0.3 })); }
      area();
    }
    if (T.boss && T.boss.dead && !run.completed && T.t > 3) win();
  }
  function win() {
    run.completed = true; run.phase = 'done';
    world.raid = null; world.boss = null;
    UI.centerMsg(`${v.pyramid.name.toUpperCase()} IS WON`, 'A portal opens over the sarcophagus', 3.5);
    sfx('gate');
    let [x, y] = [chamber.cx + 0.5, chamber.cy + 5];
    if (!map.walkable(x, y)) [x, y] = map.randomNear(x, y, 3);
    if (exit) { exit.x = x; exit.y = y; addEffect(new Column(x, y, '#40a0ff', 1.2, 40, 400)); burst(x, y, 30, 'arcane', 30, 5); }
    for (let k = 0; k < 3; k++) {
      const [cx, cy] = map.randomNear(chamber.cx + (k - 1) * 4, chamber.cy - 4, 2);
      world.chests.push({ x: cx, y: cy, opened: false, reach: 1.3, rich: true, use() { if (this.opened) return; this.opened = true; sfx('chest'); sfx('gold'); dropChest(world, this, depth); sparkle(this.x, this.y, 20, '#ffd060', 20, 0.5); } });
    }
    onSuccess();
    area();
    UI.refresh();
  }
  const area = () => HUD.setArea(`Depth ${depth}`, `${v.name} · ${run.title}`);

  // ---------------------------------------------------------------- light, dust, sound
  let ambKey = '';
  function dressing(dt) {
    const vr = camera.viewRect(80), p = world.player;
    for (const t of dv.torches) {
      if (tomb(t.x) !== cr.inside) continue;
      const px = isoX(t.x, t.y), py = isoY(t.x, t.y);
      if (px < vr.x0 || px > vr.x1 || py < vr.y0 - 80 || py > vr.y1 + 80) continue;
      const z = (t.h - groundT(t.x, t.y)) * VZ + (t.stand ? 64 : 16);
      if (cr.inside || v.sky.night) addLight(t.x, t.y, t.stand ? 7 : 6 + Math.sin(world.time * 9 + t.x) * 0.3, 0.95, z, cr.inside ? v.pyramid.torch : '#ffb050');
      if (chance(dt * 5)) spawn({ type: 'glow', x: t.x, y: t.y, z, vz: rand(15, 35), life: rand(0.3, 0.6), size: rand(1.5, 3), size1: 0.4, color: chance(0.5) ? v.pyramid.torch : '#fff0a0', add: true });
    }
    if (!cr.inside && chance(dt * 3)) spawn({ type: 'smoke', x: p.x + rand(-12, 6), y: p.y + rand(-12, 6), z: rand(0, 8), vx: Math.cos(v.dune.wind) * 1.4, vy: Math.sin(v.dune.wind) * 1.4, vz: rand(-2, 3), life: rand(1.2, 2.4), size: rand(3, 5), size1: rand(8, 14), color: '#d8c090', alpha: 0.16 });
    const k = cr.inside ? 'sea_of_sand_tomb' : 'sea_of_sand';
    if (k !== ambKey) { ambKey = k; setAmbience(cr.inside ? 'catacombs' : 'sea_of_sand'); }
  }

  world.overworldScenario = run;
  area();
  return run;
}
