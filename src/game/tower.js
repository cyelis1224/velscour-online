// THE SERPENTINE TOWER (docs/SERPENTINE_TOWER.md): the run. The stair is a strip of tiles (world/tower.js); this file
// lays it onto the helix every frame (view.js setWarp) with the camera turned to keep the hero's stretch running
// up-left, draws the 3D tower behind it all (gfx/tower3d.js) and directs the climb: packs wait on the floors above and
// some drop down onto the stair when the hero passes beneath, others charge up from behind out of the cutaway, and Air
// Pirates throw grappling hooks onto the railing and climb over it. The stairhead door leads onto the roof, where one of
// SCENARIOS plays out: three waves of bosses, then the last boss flies in on an airship. Its fall opens a portal.
import { G } from '../state.js';
import { UI } from '../ui/ui.js';
import { HUD } from '../ui/hud.js';
import { camera, setWarp, warpMoved, isoX, isoY, HW, HH } from '../core/view.js';
import { rand, chance, pick, clamp, TAU, shuffle, fmtInt } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { VZ, CUT_N, CUT_C, upCut } from '../world/tower.js';
import { drawTower3D, drawTowerFront, tickTower3D, buildTower3D, disposeTower3D, spawnShip, loadAirships, airshipsReady } from '../gfx/tower3d.js';
import { makeMonster, monsterBase } from './monster.js';
import { makeRaidBoss, RAID_BOSSES } from './raid.js';
import { depthLevel } from '../data/depth.js';
import { addEffect, Ring, Column, Telegraph, burst, smoke, floatText, addLight, clearVfx, sparkle } from '../gfx/vfx.js';
import { explode, Area, Orbit, Whirl, AuraFx } from './hazards.js';
import { enter } from './mayhem.js';
import { AIR_ART } from '../data/airpirates.js';
import { SWAPS } from '../data/bestiary.js';
import { dropChest } from './loot.js';

const GRAV = 1400;               // px/s^2 for falls

// ------------------------------------------------------------------ the 20 roof scenarios
// waves: how each of the three boss waves arrives (drop: out of the sky, climb: up the parapet on hooks, skiff: down a
// pirate boat's ramp, stairs: out of the stairhead turret, teleport). pirates: the share of adds that are Air Pirates.
// ev: events per minute while the roof fight is on. captain/tpl/ship: the last boss, the raid template its fight uses
// (game/raid.js) and the airship it comes on.
export const SCENARIOS = [
  { id: 'black_sail', name: 'The Black Sail', intro: 'A black sail rises out of the clouds. The Admiral is coming for the tower.',
    waves: ['drop', 'climb', 'skiff'], pirates: 0.4, ev: { boarders: 0.6 }, captain: 'admiral_veyl', tpl: 'warlord', ship: 'galleon' },
  { id: 'storm_widow', name: 'Storm Widow', intro: 'Thunder rolls over the battlements. Captain Sable Vane rides the storm.',
    waves: ['teleport', 'drop', 'climb'], pirates: 0.3, ev: { storm: 3 }, captain: 'captain_sable_vane', tpl: 'stormdrake', ship: 'ironclad' },
  { id: 'hollow_fleet', name: 'The Hollow Fleet', intro: 'Pale ships drift out of the mist, crewed by the drowned.',
    waves: ['skiff', 'climb', 'skiff'], pirates: 0.7, ghost: true, dark: 0.5, ev: { boarders: 0.8 }, captain: 'the_hollow_commodore', tpl: 'reaper', ship: 'galleon' },
  { id: 'glass_gale', name: 'Glass Gale', intro: 'The wind screams across the roof. Madam Stormglass steers it.',
    waves: ['drop', 'skiff', 'teleport'], pirates: 0.4, ev: { gust: 3 }, captain: 'madam_stormglass', tpl: 'oracle', ship: 'galleon' },
  { id: 'gallows_siege', name: 'Gallows Siege', intro: 'Hooks bite the parapet all around. The Gallows King wants the tower hanged.',
    waves: ['climb', 'climb', 'climb'], pirates: 0.6, ev: { hooks: 2.5 }, captain: 'the_gallows_king', tpl: 'bailiff', ship: 'ironclad' },
  { id: 'rookery_duel', name: 'Rookery Duel', intro: 'Brass-Beak has challenged the climber to a duel, and brought seconds.',
    waves: ['stairs', 'skiff', 'drop'], pirates: 0.8, ev: { boarders: 0.5 }, captain: 'brass_beak', tpl: 'mantis', ship: 'galleon' },
  { id: 'red_gale', name: 'Red Gale', intro: 'Cinderbombs rain from a red-sailed corsair. The roof will burn.',
    waves: ['drop', 'skiff', 'climb'], pirates: 0.5, ev: { fire: 2.5 }, captain: 'red_gale_corsair', tpl: 'pyre', ship: 'galleon' },
  { id: 'warden_cage', name: "The Warden's Cage", intro: 'The Warden of the Rookery collects prisoners. Grapple haulers close in.',
    waves: ['skiff', 'skiff', 'climb'], pirates: 0.7, ev: { boarders: 1, hooks: 0.8 }, captain: 'warden_of_the_rookery', tpl: 'colossus', ship: 'ironclad' },
  { id: 'thundershroud', name: 'Thundershroud', intro: 'Lord Thundershroud brings the storm and his guns with it.',
    waves: ['teleport', 'climb', 'drop'], pirates: 0.4, ev: { storm: 2, cannon: 2 }, captain: 'lord_thundershroud', tpl: 'carapace', ship: 'ironclad' },
  { id: 'last_boarding', name: 'The Last Boarding', intro: 'The Last Boarding Saint has never lost a deck. Tonight it is a roof.',
    waves: ['stairs', 'drop', 'skiff'], pirates: 0.6, ev: { boarders: 0.6 }, captain: 'the_last_boarding_saint', tpl: 'pontiff', ship: 'galleon', escorts: 1 },
  { id: 'broadside', name: 'Broadside', intro: 'An ironclad hangs off the tower and runs out its guns.',
    waves: ['drop', 'climb', 'teleport'], pirates: 0.3, ev: { cannon: 3 }, early: 'ironclad', ship: 'ironclad' },
  { id: 'pincer', name: 'Pincer', intro: 'Boats on both sides at once. They mean to take the roof between them.',
    waves: ['skiff', 'skiff2', 'skiff2'], pirates: 0.7, ev: {}, ship: 'galleon' },
  { id: 'stairhead_ambush', name: 'Ambush at the Stairhead', intro: 'They were waiting for you on the roof.',
    waves: ['climb', 'drop', 'skiff'], pirates: 0.6, ambush: 5, ev: { hooks: 0.6 }, ship: 'galleon' },
  { id: 'powder_roof', name: 'Powder Roof', intro: 'Powder kegs roll off the pirate boats. Keep moving.',
    waves: ['skiff', 'drop', 'skiff'], pirates: 0.6, kegs: true, ev: { cannon: 1.2, boarders: 0.5 }, ship: 'ironclad' },
  { id: 'eclipse', name: 'Eclipse', intro: 'The moon goes black. Only the braziers burn.',
    waves: ['teleport', 'drop', 'climb'], pirates: 0.2, dark: 0.82, ev: { hooks: 0.8 }, ship: 'galleon' },
  { id: 'armada', name: 'Armada', intro: 'Every boat in the sky is coming. Hold the roof.',
    waves: ['skiff', 'climb', 'skiff2'], pirates: 0.6, ev: { boarders: 1.2 }, ship: 'galleon', escorts: 3 },
  { id: 'two_flags', name: 'Two Flags', intro: 'Two captains, two ships, one tower. They will settle it on your corpse.',
    waves: ['drop', 'skiff', 'climb'], pirates: 0.5, ev: { boarders: 0.5 }, ship: 'galleon', second: 'ironclad' },
  { id: 'death_from_above', name: 'Death from Above', intro: 'Ships pass overhead and their cargo falls on you.',
    waves: ['drop', 'drop', 'drop'], pirates: 0.4, flyby: true, ev: { fire: 1, cannon: 1 }, ship: 'ironclad' },
  { id: 'treasure_barge', name: 'The Treasure Barge', intro: 'A fat barge of plunder follows the fleet. Win, and it is yours.',
    waves: ['drop', 'skiff', 'climb'], pirates: 0.5, ev: { boarders: 0.5 }, ship: 'galleon', treasure: true },
  { id: 'mutiny', name: 'Mutiny on the Wind', intro: 'Pirates only, every one of them, and their captain in a rage.',
    waves: ['skiff', 'climb', 'skiff2'], pirates: 1, ev: { boarders: 0.8, hooks: 0.8 }, ship: 'galleon', enraged: true },
];
// The Air Pirates are the Sky Battle's (data/airpirates.js); captains go by their ids without the 'ap_', each with the
// raid template its fight uses
const CAPTAIN_TPL = { admiral_veyl: 'warlord', captain_sable_vane: 'stormdrake', the_hollow_commodore: 'reaper', madam_stormglass: 'oracle', the_gallows_king: 'bailiff',
  brass_beak: 'mantis', red_gale_corsair: 'pyre', warden_of_the_rookery: 'colossus', lord_thundershroud: 'carapace', the_last_boarding_saint: 'pontiff' };
const PIRATE_IDS = AIR_ART.map((a) => a.id);
const CLIMBERS = new Set(['ap_chainhook_climber', 'ap_hook_leg_veteran', 'ap_gallows_rope_snarer', 'ap_tarred_sail_ripper']);   // hooks and ropes in hand
// where ships dock, as camera-frame angles round the roof: the flagship up-left, its hull running across the screen like
// the airship viewer's ships; boats on the left, the right and the far side. Never the near half: they'd hide the roof.
const FLAG = Math.PI, FAR = -Math.PI * 0.75, LEFT = Math.PI * 0.75, RIGHT = -Math.PI * 0.25;

/** Turn the warp on for a tower level, off for any other (game.js setWorld). */
export function useTower(world) {
  const tw = world && world.tower;
  setWarp(tw ? tw.warp : null, tw ? tw.pick : null);
  if (!tw) { camera.leadX = camera.leadY = 0; if (camera.zoomK !== 1) { camera.zoomK = 1; camera.computeZoom(); } disposeTower3D(); return; }
  tw.frame(0);
}

// ------------------------------------------------------------------ the run
export function createTowerRun(world, gen, biome, onSuccess) {
  const g = gen.tower, v = gen.variant, map = world.map, depth = world.depth || 1, lvl = depthLevel(depth);
  const sc = G.towerScenario != null ? SCENARIOS[G.towerScenario % SCENARIOS.length] : pick(SCENARIOS);
  const captain = sc.captain || pick(Object.keys(CAPTAIN_TPL));
  world.ambushT = Infinity;   // the tower directs its own ambushes
  const exit = world.portals.find((q) => q.type === 'exit');
  if (exit) { exit.x = exit.y = -100; }   // the portal opens on the roof when the last boss falls
  // the Air Pirates' sheets load with the level's looks
  if (world.looks) { const ids = world.looks.ids.bind(world.looks); world.looks.ids = () => [...ids(), ...PIRATE_IDS]; }

  // ---- the warp: tile positions onto the helix (or the roof), seen by the camera turned to alpha
  const tw = world.tower = {
    g, v, alpha: g.theta(g.s(gen.start[0])) + Math.PI / 2, roof: false, focus: [0, 0, 0], dt: 0, ropes: [],
    raw(x, y, out, clip) {
      let cx, cy, z;
      if (x < g.XR) { cx = x - g.AX; cy = y - g.AY; z = g.roofZ; }
      else {
        const s = g.X1 - x, t = g.theta0 - s / g.rc - tw.alpha, r = g.rWall - (y - g.YR);
        cx = r * Math.cos(t); cy = r * Math.sin(t); z = g.z(s);
        if (clip && (cx * CUT_N[0] + cy * CUT_N[1] < -CUT_C || upCut(cx, cy, z, tw.focus) < 0)) { out[0] = out[1] = 1e7; return out; }   // in the cutaway
      }
      out[0] = (cx - cy) * HW; out[1] = (cx + cy) * HH - z * VZ;
      return out;
    },
    warp: (x, y, out) => tw.raw(x, y, out, !tw.roof),
    /** World px back to the tile position shown there: Newton steps from the flat inverse round the hero. */
    pick(wx, wy) {
      const p = world.player, a = [0, 0], b = [0, 0], c = [0, 0];
      let x = p ? p.x : gen.start[0], y = p ? p.y : gen.start[1];
      tw.raw(x, y, a, false);
      const dx = wx - a[0], dy = wy - a[1];
      x += (dx / HW + dy / HH) / 2; y += (dy / HH - dx / HW) / 2;
      for (let i = 0; i < 6; i++) {
        tw.raw(x, y, a, false);
        const fx = a[0] - wx, fy = a[1] - wy;
        if (fx * fx + fy * fy < 0.04) break;
        tw.raw(x + 0.05, y, b, false); tw.raw(x, y + 0.05, c, false);
        const j11 = (b[0] - a[0]) / 0.05, j12 = (c[0] - a[0]) / 0.05, j21 = (b[1] - a[1]) / 0.05, j22 = (c[1] - a[1]) / 0.05, det = j11 * j22 - j12 * j21;
        if (Math.abs(det) < 1e-6) break;
        let sx = (j22 * fx - j12 * fy) / det, sy = (j11 * fy - j21 * fx) / det;
        const l = Math.hypot(sx, sy); if (l > 6) { sx *= 6 / l; sy *= 6 / l; }
        x -= sx; y -= sy;
      }
      return [x, y];
    },
    /** Camera turn and framing: the hero's stretch of stair runs up-left, the stair ahead and the floor above in view. */
    frame(dt) {
      const p = world.player;
      if (!p) return;
      if (!tw.roof && p.x >= g.XR) {
        // eased while walking; a blink or a teleport turns it at once (a lagging turn would leave him in the cutaway)
        const target = g.theta(g.s(p.x)) + Math.PI / 2;
        tw.alpha = dt && Math.abs(target - tw.alpha) < 0.5 ? tw.alpha + (target - tw.alpha) * (1 - Math.pow(0.00002, dt)) : target;
        camera.leadX = -G.W / camera.zoom * (G.touch ? 0.1 : 0.17); camera.leadY = -G.H / camera.zoom * 0.1;   // the touch buttons sit on the right
      } else {
        // the roof: pulled back, leaning toward its centre and the far side where the ships dock, or toward tw.look
        tw.alpha = g.alphaTop;
        const [qx, qy, k] = tw.look || [g.AX, g.AY, 0.35], ox = (qx - p.x) * k, oy = (qy - p.y) * k;
        camera.leadX = (ox - oy) * HW; camera.leadY = (ox + oy) * HH - (tw.look ? 40 : 90);
      }
      const zk = tw.roof ? 0.82 : 1;
      if (camera.zoomK !== zk) { camera.zoomK = zk; camera.computeZoom(); }
      // the hero in the camera frame (three.js axes): the lanterns nearest him get the lights; the upper cut holds on him
      let cx, cy, z;
      if (p.x < g.XR) { cx = p.x - g.AX; cy = p.y - g.AY; z = g.roofZ; }
      else { const s = g.s(p.x), t = g.theta(s) - tw.alpha, r = g.r(p.y); cx = r * Math.cos(t); cy = r * Math.sin(t); z = g.z(s); }
      tw.focus[0] = cx; tw.focus[1] = z; tw.focus[2] = cy;
      warpMoved();
    },
    draw(ctx) { drawTower3D(ctx, tw); },
    /** Over the sprites: the railings and chandeliers, then whoever hangs in the well in front of them (render.js). */
    front(ctx) { drawTowerFront(ctx); for (const c of world.creatures) if (c.towerFront && !c.dead) c.draw(ctx); },
    minimap: (c, W, H, big) => minimap(world, tw, c, W, H, big),
  };
  void buildTower3D(g).catch((e) => console.warn(e));
  void loadAirships().catch((e) => console.warn('Airships unavailable', e));

  // ---- the stair's packs: some will drop from the floor above when the hero passes beneath them
  for (const m of world.creatures) {
    if (m.team !== 'enemy') continue;
    const s = g.s(m.x);
    if (s > g.C * 0.7 && chance(0.4)) m.towerDrop = true;
  }

  const run = {
    id: 'serpentine_tower', type: 'tower', completed: false, failed: false, active: true, markers: [], route: [], stage: 0, escort: null, routeIndex: 0,
    shrine: { x: g.door[0], y: g.door[1], reach: 2, label: 'Stairhead', use() {} },
    scenario: sc, variant: v, captain, phase: 'climb', wave: 0, waves: sc.waves.length,
    chargeT: rand(14, 22), hookT: rand(8, 14), chargeS: 0, hookS: 0, dropCd: 0, top: null, hud: null,
    get title() { return run.completed ? 'The Tower Is Taken' : run.phase === 'climb' ? 'Climb the Stair' : run.top?.final ? `Defeat ${capName(captain)}` : `Hold the Roof — ${sc.name}`; },
    get description() {
      if (run.completed) return 'A portal burns on the roof. The way on is open.';
      if (run.phase === 'climb') return `Climb the stair to the stairhead door, ${run.altitude}% of the way up.`;
      if (run.top?.final) return `${capName(captain)} has come aboard. End it.`;
      return `${sc.intro} Wave ${Math.min(run.wave, 3)} of 3.`;
    },
    get altitude() { const p = world.player; return run.phase !== 'climb' ? 100 : p ? Math.round(clamp(g.s(p.x) / g.sEnd, 0, 1) * 100) : 0; },
    get objective() {
      if (run.completed) return undefined;
      // a few tiles ahead up the middle of the stair (the door straight on would leave him in whatever lane a fight did)
      if (run.phase === 'climb') { const p = world.player; return { x: Math.max(g.XT + 1, (p ? p.x : g.X1) - 5), y: g.door[1], reach: 0.8 }; }
      return run.top && (run.top.idle || run.top.step === 'ship') ? { x: g.AX, y: g.AY + 2, reach: 3 } : null;
    },
    update(dt) {
      const p = world.player;
      tw.dt = dt;
      if (!p) return;
      tw.frame(dt);
      tickTower3D(dt, tw);
      tickRopes(world, tw, dt);
      if (run.phase === 'climb') climb(dt);
      else if (run.phase === 'top') roof(dt);
      // the lanterns and braziers light the 2D sprites too
      if (run.phase === 'climb') {
        const s0 = g.s(p.x);
        for (let s = 4 + Math.round((s0 - 20 - 4) / 8.5) * 8.5; s < s0 + 22; s += 8.5) if (s > 0 && s < g.sEnd) addLight(g.X1 - s, g.YR + 0.15, 5.5, 0.75, 2.5 * VZ, '#' + v.lantern.toString(16).padStart(6, '0'));
        addLight(g.door[0], g.door[1], 6, 1, 70, '#ff8040');
      } else {
        for (const ca of [0, Math.PI / 2, Math.PI]) addLight(g.AX + Math.cos(ca) * g.RT * 0.68, g.AY + Math.sin(ca) * g.RT * 0.68, 7, 1, 80, '#ff9a50');
      }
    },
  };

  // ---------------------------------------------------------------- the climb
  function climb(dt) {
    const p = world.player, sH = g.s(p.x);
    if (p.dead) return;
    // packs above drop down as the hero passes beneath them
    run.dropCd -= dt;
    if (run.dropCd <= 0) for (const m of world.creatures) {
      if (!m.towerDrop || m.dead || m.awake || m.entering) continue;
      const below = g.s(m.x) - g.C;
      if (sH > below - 3 && sH < below + 2) {
        const pack = world.creatures.filter((o) => o.towerDrop && !o.dead && !o.awake && Math.abs(o.x - m.x) < 3 && Math.abs(o.y - m.y) < 4);
        pack.forEach((o, i) => dropDown(world, tw, o, i * rand(0.15, 0.35)));
        floatText(p.x, p.y, 90, 'From the floor above!', '#ff9060', 14, { life: 1.6 });
        run.dropCd = 4;
        break;
      }
    }
    // a pack charges up the stair from behind, out of the cutaway
    // (each needs a stretch of stair climbed since the last: a slow climb isn't buried, and nothing farms them)
    if ((run.chargeT -= dt) <= 0 && sH > run.chargeS + 24) {
      run.chargeT = rand(26, 40) * Math.max(0.6, 1 - depth * 0.004);
      if (sH > 12 && world.hostiles('player', p.x, p.y, 8).length < 6) { chargers(world, tw, biome, lvl, depth); run.chargeS = sH; }
    }
    // grappling hooks over the railing
    if ((run.hookT -= dt) <= 0 && sH > run.hookS + 14) {
      run.hookT = rand(16, 28) * Math.max(0.6, 1 - depth * 0.004);
      if (sH > 6 && sH < g.sEnd - 8) {
        run.hookS = sH;
        const n = 1 + (chance(0.5) ? 1 : 0) + (depth > 30 && chance(0.4) ? 1 : 0);
        for (let i = 0; i < n; i++) grapple(world, tw, clamp(p.x + rand(-7, 4), g.X0 + 2, g.X1 - 1), lvl, depth, i * 0.5);
        floatText(p.x, p.y, 90, 'Grappling hooks!', '#ffb060', 14, { life: 1.6 });
        sfx('door', 0.6);
      }
    }
    // the stairhead
    if (p.x < g.XT + 2.8 && !p.dead) toRoof();   // through the stairhead door
  }

  function toRoof() {
    const p = world.player;
    G.flash = 1; sfx('portal'); camera.shake(4);
    const pets = world.creatures.filter((c) => c !== p && c.team === 'player' && !c.dead);
    // the stair's drops come up (there's no way back down for them), but its gold goes straight into the purse and the
    // log says where the rest came from: a pile waiting on the roof looked like items left over from an earlier visit
    let gold = 0;
    const loot = world.loot.filter((l) => {
      if (l.x < g.XR) return false;
      if (l.kind === 'gold' && l.amount > 0) { gold += l.amount; return false; }
      return true;
    });
    world.loot = world.loot.filter((l) => l.x < g.XR || loot.includes(l));
    if (gold) { G.char.gold += gold; UI.log(`You gather ${fmtInt(gold)} gold left on the stair.`, '#ffd34a'); }
    const items = loot.filter((l) => l.kind === 'item').length;
    if (items) UI.log(`${items} item${items > 1 ? 's' : ''} you left on the stair ${items > 1 ? 'were' : 'was'} carried up to the roof.`, '#c8b890');
    world.creatures = world.creatures.filter((c) => c === p || pets.includes(c));
    // the hero's own effects that ride with him (orbits, whirls, auras, zones that follow) come up; the rest stay below,
    // and the rope layer is made again on the roof for its climbers
    world.hazards = world.hazards.filter((h) => h.src && h.src.team === 'player' && !h.src.dead && (h.follow || h instanceof Orbit || h instanceof Whirl || h instanceof AuraFx));
    world.towerRopeLayer = null; world.corpses.length = 0; tw.ropes.length = 0;
    clearVfx();
    tw.roof = true; run.phase = 'top';
    [p.x, p.y] = g.roofDoor; p.path = null; p.moveTarget = null; p.attackTarget = null; p.interact = null; p.lootTarget = null;
    for (const s of pets) { [s.x, s.y] = map.randomNear(p.x, p.y, 1.6); s.aggro = null; s.foe = null; s.nav = null; s.fol = null; }
    loot.forEach((l, i) => { [l.x, l.y] = map.randomNear(g.roofDoor[0] + 1, g.roofDoor[1] + 2, 1.5 + Math.min(3.5, i * 0.08)); });
    for (const ch of world.chests) if (ch.x >= g.XR && !ch.opened && g.s(ch.x) > g.sEnd - 6) [ch.x, ch.y] = map.randomNear(g.roofDoor[0] - 2.5, g.roofDoor[1] + 1, 1.5);
    map.flowFrom = [-9, -9];
    tw.frame(0);
    camera.follow(p.x, p.y, 0, true);
    map.reveal(p.x, p.y, 30);
    startRoof();
  }

  // ---------------------------------------------------------------- the roof
  function startRoof() {
    const T = run.top = { step: 'intro', t: 0, idle: true, mobs: [], ships: [], ev: {}, final: null, boss2: null, flag: null, early: null };
    UI.centerMsg(v.name.toUpperCase() + ' — THE ROOF', sc.name, 3.2);
    UI.log(`<b style="color:#ffc070">${sc.name}.</b> ${sc.intro}`, '#ffe2a0');
    sfx('boss', 0.5);
    if (sc.dark) { world.darkK = sc.dark; world.night = true; }
    if (sc.ambush) {
      for (let i = 0; i < sc.ambush; i++) {
        const [x, y] = roofSpot(4, 9);
        const m = pirate(x, y, i === 0 ? 'champion' : 'normal');
        m.awake = true; m.hunter = true; T.mobs.push(m);
      }
      floatText(world.player.x, world.player.y, 90, 'Ambush!', '#ff7050', 16, { life: 1.8 });
    }
    if (sc.early && airshipsReady()) T.early = spawnShip(sc.early, FLAG, g, { dur: 7 });
  }
  function roof(dt) {
    const T = run.top, p = world.player;
    if (!T || p.dead) return;
    T.t += dt;
    T.mobs = T.mobs.filter((m) => !m.dead && world.creatures.includes(m));
    // nothing on the roof to fight: whatever is on its way hurries (boats, ramps, gangplanks, climbers), so the hero
    // never stands about waiting for the next foe
    T.calm = world.creatures.some((m) => m.team === 'enemy' && !m.dead && m.targetable !== false) ? 0 : (T.calm || 0) + dt;
    T.hurry = T.calm > 0.05;
    if (T.hurry) for (const s of [...T.ships, ...(T.step === 'ship' ? [T.flag, T.flag2] : [])]) if (s) s.rush = true;
    const busy = T.step.startsWith('wave') || T.step === 'final';
    // events while the fight is on
    if (busy || T.step === 'ship') for (const [k, rate] of Object.entries(sc.ev)) {
      T.ev[k] ??= rand(4, 60 / rate);
      if ((T.ev[k] -= dt) <= 0) { T.ev[k] = (60 / rate) * rand(0.7, 1.3); EVENTS[k]?.(); }
    }
    if (T.step === 'intro') { if (T.t > 0.1 && !T.mobs.length) next('wave1'); return; }
    if (T.step.startsWith('wave')) {
      const k = +T.step[4];
      if (!T.spawned) { T.spawned = true; spawnWave(k); }
      // the flagship sets sail once the last wave is on the roof, so it is alongside when the roof is clear
      if (k === 3 && !T.sailed && T.t > 2.5 && !held(FLAG) && !held(LEFT) && !(sc.second && held(FAR))) sail();
      // the next wave is called while the last two of this one still stand (on the roof), so it is on its way in time
      const left = T.mobs.filter((m) => m.waveMob === k);
      if (T.t > 0.5 && left.length <= 2 && left.every((m) => m.targetable !== false)) { T.spawned = false; next(k < 3 ? 'rest' + (k + 1) : 'ship'); }
      return;
    }
    if (T.step.startsWith('rest')) { T.idle = true; if (T.t > 0.1) next('wave' + T.step[4]); return; }
    if (T.step === 'ship') { arrival(dt); return; }
    if (T.step === 'final') {
      if (tw.look && T.final && !T.final.entering) tw.look = null;
      const alive = [T.final, T.boss2].filter((m) => m && !m.dead);
      if (!alive.length) win();
      return;
    }
    if (T.step === 'won' && sc.treasure && !T.barge && T.t > 4) treasure();
  }
  function next(step) { const T = run.top; T.step = step; T.t = 0; T.idle = step.startsWith('rest') || step === 'intro'; area(); }
  /** A wave's boat still coming in to (or moored at) the dock at angle a. */
  const held = (a) => run.top.ships.some((s) => (s.state === 'in' || s.state === 'docked') && Math.abs(Math.atan2(Math.sin(s.phi - a), Math.cos(s.phi - a))) < 0.6);
  const area = () => HUD.setArea(`Depth ${depth}`, `${v.name} · ${run.title}`);

  // ---- waves
  function spawnWave(k) {
    const T = run.top, how = sc.waves[k - 1];
    run.wave = k; T.idle = false;
    UI.centerMsg(`WAVE ${k} OF 3`, ['The tower\'s wardens come for you', 'They will not stop', 'The last of them, and the worst'][k - 1], 2.4);
    sfx('roar', 0.6);
    const nb = k === 2 ? 2 : 1, na = 2 + k * 2 + Math.min(4, Math.floor(depth / 25)), list = [];
    for (let i = 0; i < nb; i++) {
      const b = world.looks && world.looks.boss(biome.roster);
      const usePirate = k === 3 && sc.pirates >= 0.5;
      const m = usePirate ? pirate(0, 0, 'boss', pick(AIR_ART.filter((a) => a.boss && a.id !== 'ap_' + captain)))
        : makeMonster(world, b ? b.arch : pick(biome.roster), biome, lvl + 2, 'boss', 0, 0, 0, b ? b.look : undefined);
      if (!usePirate) world.add(m);
      list.push(m);
      if (i === 0) world.boss = m;
    }
    for (let i = 0; i < na; i++) {
      const rank = i === 0 && k > 1 ? 'champion' : 'normal';
      if (chance(sc.pirates)) list.push(pirate(0, 0, rank));
      else { const arch = pick(world.roster || biome.roster), m = makeMonster(world, arch, biome, lvl + (rank === 'normal' ? 0 : 1), rank, 0, 0, 0); world.add(m); list.push(m); }
    }
    if (sc.kegs) for (let i = 0; i < 2 + k; i++) list.push(pirate(0, 0, 'normal', AIR_ART.find((a) => a.id === 'ap_powder_keg_runner')));
    for (const m of list) { m.waveMob = k; m.awake = true; m.hunter = true; T.mobs.push(m); }
    arrive(list, how);
  }
  /** Bring monsters onto the roof the way the wave says. */
  function arrive(list, how) {
    if (how === 'drop' && sc.flyby && airshipsReady()) {   // a boat sweeps past the roof and its cargo jumps
      const a = freeDock(), sh = a == null ? null : spawnShip(pick(['gasbag', 'hauler']), a, g, { dur: 3 });
      if (sh) world.addHazard({ ground: true, draw() {}, update: () => { if (sh.state === 'docked') { sh.leave(); return false; } return sh.state !== 'gone'; } });
    }
    if ((how === 'skiff' || how === 'skiff2') && airshipsReady()) {
      const n = how === 'skiff2' ? 2 : 1;
      const parts = n === 1 ? [list] : [list.filter((_, i) => i % 2 === 0), list.filter((_, i) => i % 2 === 1)];
      parts.forEach((ms) => boatIn(pick(['gasbag', 'cutter', 'hauler']), freeDock(), ms));
      return;
    }
    list.forEach((m, i) => {
      if (how === 'climb') { const a = nearAngle(); roofClimb(m, a + (i - list.length / 2) * 0.22, i * 0.25); }
      else if (how === 'stairs') stairsOut(m, i * 0.45);
      else {
        const [x, y] = roofSpot(2.5, g.RT - 1.5);
        m.x = x; m.y = y;
        const kind = how === 'teleport' ? 'teleport' : 'drop';
        if (i === 0) enter(m, kind); else { m.targetable = false; m.alpha = 0; let d = i * rand(0.12, 0.3); m.entering = (dt) => { if ((d -= dt) <= 0) enter(m, kind); }; }
      }
    });
  }
  // the near half of the parapet (the bottom of the screen), where a climber hangs in plain sight
  const nearAngle = () => rand(-0.6, 2.2);
  function roofSpot(r0, r1) {
    const p = world.player;
    for (let i = 0; i < 40; i++) {
      const a = rand(TAU), r = rand(r0, r1), x = g.AX + Math.cos(a) * r, y = g.AY + Math.sin(a) * r;
      if (map.circleFree(x, y, 0.4) && Math.hypot(x - p.x, y - p.y) > 3.5) return [x, y];
    }
    return map.randomNear(g.AX, g.AY, 4);
  }
  function pirate(x, y, rank = 'normal', art = null) {
    const a = art || pick(AIR_ART.filter((q) => !q.boss)), swap = sc.ghost ? SWAPS.pale : null;
    const m = makeMonster(world, a.arch, biome, lvl + (rank === 'normal' ? 0 : rank === 'boss' ? 2 : 1), rank, x, y, 0, { art: a.id, swap });
    if (sc.ghost) { m.undead = true; m.name = 'Drowned ' + m.name; }
    world.add(m); m.x = x; m.y = y;
    return m;
  }
  function stairsOut(m, delay) {
    const [x0, y0] = [g.AX, g.AY - g.rc + 2.4];
    m.x = x0; m.y = y0; m.targetable = false; m.alpha = 0;
    let t = -delay;
    const [tx, ty] = roofSpot(3, 7);
    m.entering = (dt) => {
      t += dt; if (t < 0) return;
      m.alpha = Math.min(1, t * 3); m.animT += dt; m.moving = true;
      const k = Math.min(1, t / 0.9); m.x = x0 + (tx - x0) * k * 0.4; m.y = y0 + (ty - y0) * k * 0.4;
      if (k >= 1) { m.entering = null; m.targetable = true; m.alpha = undefined; m.moving = false; }
    };
  }
  /** Up the outside of the parapet on a rope, then over it. a: camera-frame angle round the roof. */
  function roofClimb(m, a, delay) {
    const out = g.RT + 1.9, land = g.RT - 0.9, top = 1.15 * VZ;
    const hx = g.AX + Math.cos(a) * (g.RT + 1.1), hy = g.AY + Math.sin(a) * (g.RT + 1.1);
    m.x = g.AX + Math.cos(a) * out; m.y = g.AY + Math.sin(a) * out; m.z = -260; m.alpha = 0; m.targetable = false;
    const rope = { x: hx, y: hy, z: top, m, t: -delay, phase: 'throw', from: [m.x, m.y, -360] };
    tw.ropes.push(rope);
    let t = -delay, fast = 0;
    m.entering = (dt) => {
      // the hero has nothing to fight: the rest of the climb takes half a second (the rope keeps pace)
      if (!fast && run.top?.hurry) fast = Math.max(1, (2.45 - t) / 0.5);
      if (fast > 1) rope.t += dt * (fast - 1);
      t += dt * (fast || 1); m.animT += dt;
      if (t < 0.7) return;
      m.alpha = undefined; m.moving = true;
      if (t < 2.1) { const k = (t - 0.7) / 1.4; m.z = -260 + (top + 260) * k; rope.phase = 'climb'; }
      else if (t < 2.45) {
        const k = (t - 2.1) / 0.35; m.x = g.AX + Math.cos(a) * (out + (land - out) * k); m.y = g.AY + Math.sin(a) * (out + (land - out) * k);
        m.z = top * (1 - k) + Math.sin(k * Math.PI) * 20; rope.phase = 'hang';
      } else { m.entering = null; m.targetable = true; m.z = 0; m.moving = false; m.cd = rand(0.2, 0.5); sfx('thud', 0.4); smoke(m.x, m.y, 4, '#5a4a3a', 4, 8); }
    };
    sfx('swing', 0.4);
  }
  /** A dock no ship holds (the left one is under the flagship's stern while it is here), or null. */
  function freeDock() {
    const held = [run.top.flag, run.top.flag2, run.top.early, ...run.top.ships].filter((s) => s && s.state !== 'gone' && s.state !== 'sink');
    const free = shuffle([LEFT, RIGHT, FAR]).filter((a) => !held.some((s) => Math.abs(Math.atan2(Math.sin(s.phi - a), Math.cos(s.phi - a))) < 0.6 || (s.big && a === LEFT)));
    return free.length ? free[0] : null;
  }
  /** A pirate boat docks at angle phi and its crew comes down the ramp (with no free dock, they jump from above). */
  function boatIn(kind, phi, crew) {
    const sh = phi == null ? null : spawnShip(kind, phi, g, { dur: 5, tint: sc.ghost ? 0x9fd8c0 : null, ghost: sc.ghost });
    if (!sh) { crew.forEach((m) => { const [x, y] = roofSpot(3, 8); m.x = x; m.y = y; enter(m, 'drop'); }); return; }
    run.top.ships.push(sh);
    crew.forEach((m) => { m.targetable = false; m.alpha = 0; m.x = -50; m.y = -50; m.entering = () => {}; });
    let t = 0, sent = 0, lastT = -1;   // the first of the crew steps off as soon as the ramp is down
    const tick = {
      ground: true, draw() {},
      update(dt) {
        if (sh.state !== 'in' && sh.state !== 'docked') {
          for (const m of crew.slice(sent)) {
            if (run.completed) { const i = world.creatures.indexOf(m); if (i >= 0) world.creatures.splice(i, 1); continue; }
            const [x, y] = roofSpot(3, 8); m.x = x; m.y = y; m.z = 0; enter(m, 'drop');
          }
          return false;
        }
        if (!sh.ready) return true;
        t += dt;
        if (sent < crew.length && t - lastT > (run.top.hurry ? 0.15 : 0.55)) { walkOff(crew[sent], sh.board(sent % 3, 3), 2.6); sent++; lastT = t; }
        if (sent >= crew.length && t - lastT > 4) { sh.leave(); return false; }
        return true;
      },
    };
    world.addHazard(tick);
  }
  /** Walk a monster along a boarding path ([camera-frame x, z, height] points) onto the roof. */
  function walkOff(m, path, speed, done) {
    const pts = path.map(([x, y, h]) => [g.AX + x, g.AY + y, (h - g.roofZ) * VZ]);
    const seg = (j) => Math.max(0.01, Math.hypot(pts[j + 1][0] - pts[j][0], pts[j + 1][1] - pts[j][1]) + Math.abs(pts[j + 1][2] - pts[j][2]) / VZ);
    let i = 0, f = 0, fast = 0;
    m.alpha = undefined; m.targetable = false; m.awake = true;
    [m.x, m.y, m.z] = pts[0];
    m.entering = (dt) => {
      m.animT += dt; m.moving = true;
      const a = pts[i], b = pts[i + 1], len = seg(i);
      // the hero has nothing to fight: the rest of the way takes half a second
      if (!fast && run.top?.hurry) { let left = len * (1 - f); for (let j = i + 1; j < pts.length - 1; j++) left += seg(j); fast = Math.max(speed, left / 0.5); }
      f += (fast || speed) * dt / len;
      if (f >= 1) { f = 0; i++; if (i >= pts.length - 1) { [m.x, m.y] = map.nudge(b[0], b[1], 0.4); m.z = 0; m.entering = null; m.targetable = true; m.moving = false; m.cd = rand(0.2, 0.5); if (done) done(); return; } }
      const A = pts[i], Bp = pts[i + 1];
      m.x = A[0] + (Bp[0] - A[0]) * f; m.y = A[1] + (Bp[1] - A[1]) * f; m.z = A[2] + (Bp[2] - A[2]) * f;
      m.face?.(Math.atan2(Bp[1] - A[1], Bp[0] - A[0]));
    };
  }

  // ---- the last boss on its airship
  function sail() {
    const T = run.top;
    T.sailed = true;
    UI.centerMsg('A SAIL ON THE WIND', `${capName(captain)} comes for the tower`, 3.2);
    sfx('boss');
    const ship = T.early && T.early.state !== 'gone' ? null : sc.ship;
    T.flag = ship && airshipsReady() ? spawnShip(ship, FLAG, g, { dur: 8, tint: sc.ghost ? 0x9fd8c0 : null, ghost: sc.ghost }) : T.early;
    if (sc.second && airshipsReady()) T.flag2 = spawnShip(sc.second, FAR, g, { dur: 9, from: -1 });
  }
  function arrival(dt) {
    const T = run.top;
    if (!T.boarding) {
      T.boarding = true; T.idle = false;
      if (!T.sailed) sail();
      for (let i = 0; i < (sc.escorts || 0); i++) boatIn(pick(['gasbag', 'cutter', 'hauler']), freeDock(), Array.from({ length: 3 }, () => { const m = pirate(0, 0); m.awake = true; m.hunter = true; T.mobs.push(m); return m; }));
      T.wait = 0;
    }
    T.wait += dt;
    const ready = (!T.flag || T.flag.ready) && (!T.flag2 || T.flag2.ready) || T.wait > 16;
    if (T.flag) tw.look = [g.AX + Math.cos(FLAG) * (g.RT + 4), g.AY + Math.sin(FLAG) * (g.RT + 4), 0.6];
    if (!ready || T.final) return;
    T.final = finalBoss(captain, sc.tpl || CAPTAIN_TPL[captain], T.flag);
    if (T.flag2) {
      const other = pick(Object.keys(CAPTAIN_TPL).filter((k) => k !== captain));
      const m = pirate(0, 0, 'boss', AIR_ART.find((a) => a.id === 'ap_' + other));
      m.name = capName(other).toUpperCase(); m.scale = 1.45; m.maxHp *= 3; m.hp = m.maxHp; m.awake = true;
      walkOff(m, T.flag2.board(0, 1), 2.2);
      T.boss2 = m;
    }
    next('final');
  }
  function finalBoss(cap, tplId, ship) {
    const tpl = RAID_BOSSES.find((b) => b.id === tplId) || pick(RAID_BOSSES.filter((b) => !b.sigs));
    const arena = { cx: g.AX, cy: g.AY, x: g.AX - g.RT, y: g.AY - g.RT, w: g.RT * 2, h: g.RT * 2, gate: { x: -40, y0: -40, y1: -39 } };
    const m = makeRaidBoss(world, arena, depth, lvl + 3, { tpl: { ...tpl, name: capName(cap), title: titleOf(cap) || tpl.title }, art: 'ap_' + cap });
    m.scale = 1.75; m.maxHp *= sc.enraged ? 0.75 : 0.6; m.hp = m.maxHp;
    if (sc.enraged) { m.dmg *= 1.25; m.speed *= 1.15; }
    m.raid.execT = Infinity;   // no execute timer on the roof: the climb was the clock
    m.raid.label = function () { return this.inter ? `Warded — break the crystals! (${this.wards.filter((c) => !c.dead).length} left)` : `Phase ${this.pi + 1}/${this.phases.length} · ${this.phase.name}${this.enraged ? ' · ENRAGED' : ''}`; };
    world.add(m);
    world.boss = m; world.raid = m.raid;
    if (ship && ship.state !== 'gone') walkOff(m, ship.board(0, 1), 2.2);
    else { const [x, y] = roofSpot(3, 6); m.x = x; m.y = y; enter(m, 'drop'); }
    UI.log(`<b style="color:#ff8050">${capName(cap)}</b>, ${titleOf(cap) || ''}, steps onto the roof.`, '#ffc0a0');
    return m;
  }
  function win() {
    const T = run.top;
    tw.look = null;
    next('won');
    run.completed = true;
    for (const s of [T.flag, T.flag2, T.early]) if (s && s.state !== 'gone') s.sink();
    for (const s of T.ships) s.leave();
    UI.centerMsg('THE TOWER IS TAKEN', 'A portal opens on the roof', 3.5);
    sfx('gate');
    if (exit) { exit.x = g.AX; exit.y = g.AY; addEffect(new Column(exit.x, exit.y, '#40a0ff', 1.2, 40, 400)); burst(exit.x, exit.y, 30, 'arcane', 30, 5); }
    world.raid = null;
    onSuccess();
    UI.refresh();
  }
  function treasure() {
    const T = run.top;
    T.barge = airshipsReady() ? spawnShip('hauler', LEFT, g, { dur: 6 }) : null;
    UI.log('The treasure barge drops its ramp. The plunder is yours.', '#ffd870');
    let k = 0;
    world.addHazard({ ground: true, draw() {}, update: () => {
      if (T.barge && !T.barge.ready && T.barge.state !== 'gone') return true;
      if (k++ > 0) return false;
      for (let i = 0; i < 3; i++) {
        const [x, y] = map.randomNear(g.AX + Math.cos(LEFT) * (g.RT - 3), g.AY + Math.sin(LEFT) * (g.RT - 3), 2.5);
        const ch = { x, y, opened: false, reach: 1.3, rich: true, use() { if (this.opened) return; this.opened = true; sfx('chest'); sfx('gold'); dropChest(world, this, depth); sparkle(this.x, this.y, 20, '#ffd060', 20, 0.5); } };
        world.chests.push(ch);
      }
      setTimeout(() => T.barge && T.barge.leave(), 9000);
      return false;
    } });
  }

  // ---- events while the roof fight is on
  const EVENTS = {
    boarders() { if (airshipsReady() && run.top.ships.filter((s) => s.state !== 'gone').length < 2) {
      const crew = Array.from({ length: 2 + (chance(0.5) ? 1 : 0) + Math.floor(depth / 40) }, () => { const m = pirate(0, 0); m.awake = true; m.hunter = true; run.top.mobs.push(m); return m; });
      boatIn(pick(['gasbag', 'cutter', 'hauler']), freeDock(), crew);
      UI.log('A pirate boat comes alongside!', '#ffb080');
    } },
    hooks() {
      const n = 2 + (chance(0.4) ? 1 : 0), a = nearAngle();
      for (let i = 0; i < n; i++) { const m = pirate(0, 0); m.awake = true; m.hunter = true; run.top.mobs.push(m); roofClimb(m, a + i * 0.35, i * 0.3); }
    },
    cannon() {
      const sh = [run.top.flag, run.top.early, run.top.flag2].find((s) => s && s.state === 'docked');
      if (!sh) return;
      UI.log('Broadside!', '#ff9060');
      const p = world.player, n = 4 + Math.floor(depth / 30);
      for (let i = 0; i < n; i++) {
        const f = rand(0.15, 0.85), gp = sh.gun(f), from = [g.AX + gp[0], g.AY + gp[2], (gp[1] - g.roofZ) * VZ];
        let [x, y] = i === 0 ? [p.x, p.y] : [p.x + rand(-4, 4), p.y + rand(-4, 4)];
        if (!map.isFloor(x, y)) [x, y] = roofSpot(1, g.RT - 1);
        setTimeout(() => { if (world !== G.world) return; sh.flash(f); sfx('explode', 0.4); world.addHazard(new Cannonball(world, from, [x, y], 1.3 + i * 0.12, lvl)); }, i * 220);
      }
    },
    storm() {
      const p = world.player;
      for (let i = 0; i < 3 + Math.floor(depth / 40); i++) {
        const [x, y] = i === 0 ? [p.x + rand(-1, 1), p.y + rand(-1, 1)] : roofSpot(0, g.RT - 1);
        world.addHazard(new Strike(world, x, y, 1.2 + i * 0.25, lvl));
      }
      sfx('light', 0.7);
    },
    gust() {
      const a = rand(TAU), dx = Math.cos(a), dy = Math.sin(a);
      UI.log('The wind howls across the roof!', '#c0e0ff');
      floatText(world.player.x, world.player.y, 90, 'Gale!', '#c0e8ff', 16, { life: 1.4 });
      let t = 0;
      world.addHazard({ ground: true, draw() {}, update(dt) {
        t += dt;
        if (t > 0.5 && t < 2.1) for (const c of world.creatures) if (!c.dead && !c.entering && !c.isRaid) map.move(c, dx * 2.8 * dt, dy * 2.8 * dt);
        if (Math.random() < dt * 40) { const [x, y] = roofSpot(0, g.RT); smokeStreak(x, y, dx, dy); }
        return t < 2.2;
      } });
    },
    fire() {
      const p = world.player;
      for (let i = 0; i < 3; i++) {
        const [x, y] = i === 0 ? [p.x + rand(-2, 2), p.y + rand(-2, 2)] : roofSpot(1, g.RT - 1);
        if (!map.isFloor(x, y)) continue;
        world.addHazard(new Cannonball(world, [x - 6, y - 6, 420], [x, y], 1.1 + i * 0.2, lvl, true));
      }
    },
  };
  const smokeStreak = (x, y, dx, dy) => { smoke(x, y, 12, '#c8d8e8', 1, 5); };

  world.overworldScenario = run;
  return run;
}

const capName = (cap) => { const a = AIR_ART.find((q) => q.id === 'ap_' + cap); return a ? a.name : cap; };
const titleOf = (cap) => AIR_ART.find((q) => q.id === 'ap_' + cap)?.title;

// ------------------------------------------------------------------ the climb's arrivals
/** Over the railing of the floor above, a fall down the well, and over the railing below onto the stair. */
function dropDown(world, tw, m, delay) {
  const g = tw.g, x0 = m.x, y0 = m.y, edge = g.YR + g.w + 0.5, xl = m.x + g.C, ly = g.YR + g.w - rand(0.9, 2.2);
  const H0 = g.v.pitch * VZ, fall = Math.sqrt(2 * H0 / GRAV);
  m.targetable = false; m.awake = true; m.hunter = true; m.towerDrop = false;
  let t = -delay, warned = false;
  m.entering = (dt) => {
    t += dt; if (t < 0) return;
    m.animT += dt; m.moving = true;
    m.towerFront = t > 0.25;   // over the rail and down the well: in front of the railings
    if (t < 0.4) { const k = t / 0.4; m.x = x0; m.y = y0 + (edge - y0) * k; m.z = Math.sin(k * Math.PI) * 30 + 10 * k; return; }
    if (!warned) { warned = true; addEffect(new Telegraph({ kind: 'circle', x: xl, y: ly, r: 1.2, dur: fall + 0.25 }), 'ground'); sfx('swing', 0.5); }
    const tf = t - 0.4;
    if (tf < fall) { m.x = xl; m.y = edge; m.z = Math.max(0, H0 + 10 - 0.5 * GRAV * tf * tf); return; }
    const k = Math.min(1, (tf - fall) / 0.25);
    m.y = edge + (ly - edge) * k; m.z = Math.sin(k * Math.PI) * 24;
    if (k >= 1) {
      m.entering = null; m.targetable = true; m.z = 0; m.moving = false; m.cd = rand(0.3, 0.6); m.towerFront = false;
      addEffect(new Ring(m.x, m.y, 0.2, 2, 0.4, '#d8c8a8', 5)); smoke(m.x, m.y, 4, '#5a4a3a', 8, 12); burst(m.x, m.y, 6, 'phys', 12, 4);
      camera.shake(4); sfx('thud', 0.8);
    }
  };
}
/** A pack out of sight behind the hero, already running. */
function chargers(world, tw, biome, lvl, depth) {
  const g = tw.g, p = world.player, arch = pick(world.roster || biome.roster), n = 2 + Math.floor(rand(0, 3)) + Math.floor(depth / 40);
  // the nearest stretch of stair behind him that the cutaway hides (none near the foot: then no pack this time)
  let x = null;
  for (let k = 12; k <= 34 && x == null; k += 2) { const q = p.x + k; if (q < g.XB - 1.5 && tw.raw(q, g.YR + g.w / 2, [0, 0], true)[0] > 1e6 && tw.raw(q + 2.5, g.YR + 1, [0, 0], true)[0] > 1e6) x = q; }
  if (x == null) return;
  for (let i = 0; i < n; i++) {
    const y = g.YR + rand(0.8, g.w - 0.8), rank = i === 0 && chance(0.25) ? 'champion' : 'normal';
    const m = makeMonster(world, arch, biome, lvl + (rank === 'normal' ? 0 : 1), rank, x + rand(0, 2.5), y, 0);
    world.add(m); m.awake = true; m.hunter = true;
  }
  floatText(p.x, p.y, 90, 'Footsteps on the stair behind!', '#ff9060', 13, { life: 1.8 });
  sfx('roar', 0.45);
}
/** A grappling hook flies up out of the well onto the railing; an Air Pirate climbs the rope and vaults over. */
function grapple(world, tw, x, lvl, depth, delay) {
  const g = tw.g, rail = g.YR + g.w - 0.06, out = g.YR + g.w + 0.6, land = g.YR + g.w - rand(0.9, 1.9), top = 1.3 * VZ;   // the handrail, on its curb
  const a = pick(AIR_ART.filter((q) => !q.boss && (CLIMBERS.has(q.id) || chance(0.4))));
  const rank = chance(0.15 + depth * 0.003) ? 'champion' : 'normal';
  const m = makeMonster(world, a.arch, world.biome, lvl + (rank === 'normal' ? 0 : 1), rank, x, land, 0, { art: a.id, swap: null });
  world.add(m);
  m.x = x; m.y = out; m.z = -320; m.alpha = 0; m.targetable = false; m.awake = true; m.hunter = true;
  const rope = { x, y: rail, z: top, m, t: -delay, phase: 'throw', from: [x, out, -420] };
  tw.ropes.push(rope);
  let t = -delay;
  m.entering = (dt) => {
    t += dt; m.animT += dt;
    if (t < 0.75) return;
    m.alpha = undefined; m.moving = true; m.towerFront = t < 2.4;
    if (t < 2.25) { const k = (t - 0.75) / 1.5; m.z = -320 + (top + 320) * k; rope.phase = 'climb'; }
    else if (t < 2.6) { const k = (t - 2.25) / 0.35; m.y = out + (land - out) * k; m.z = top * (1 - k) + Math.sin(k * Math.PI) * 22; rope.phase = 'hang'; }
    else { m.entering = null; m.targetable = true; m.z = 0; m.moving = false; m.cd = rand(0.2, 0.5); m.towerFront = false; sfx('thud', 0.4); }
  };
  sfx('swing', 0.4);
}

// ------------------------------------------------------------------ hooks and ropes (drawn over the 3D, among the sprites)
function tickRopes(world, tw, dt) {
  for (let i = tw.ropes.length - 1; i >= 0; i--) {
    const r = tw.ropes[i];
    r.t += dt;
    if (r.phase === 'hang') r.hang = (r.hang || 0) + dt;
    if (r.hang > 3.5 || r.m.dead && r.t > 1) tw.ropes.splice(i, 1);
  }
  if (!world.towerRopeLayer) world.addHazard(world.towerRopeLayer = new RopeLayer(world, tw));
}
class RopeLayer {
  constructor(world, tw) { this.world = world; this.tw = tw; this.depth = -1e9; }
  update() { if (this.world.tower !== this.tw) return false; this.depth = this.world.player ? this.world.player.x + this.world.player.y + 0.5 : 0; return true; }
  draw(ctx) {
    for (const r of this.tw.ropes) {
      if (r.t < 0) continue;
      const hx = isoX(r.x, r.y), hy = isoY(r.x, r.y) - r.z;
      if (hx > 1e6) continue;
      let ex, ey;
      if (r.phase === 'throw') {   // the hook in flight, rising out of the well
        const k = clamp(r.t / 0.75, 0, 1), fx = isoX(r.from[0], r.from[1]), fy = isoY(r.from[0], r.from[1]) - r.from[2];
        const x = fx + (hx - fx) * k, y = fy + (hy - fy) * k - Math.sin(k * Math.PI) * 40;
        drawHook(ctx, x, y, k * 9);
        ex = fx; ey = fy + 120; ctx.strokeStyle = '#2a1e16'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
        continue;
      }
      drawHook(ctx, hx, hy, 0);
      const m = r.m;
      if (r.phase === 'climb' && !m.dead) { ex = isoX(m.x, m.y); ey = isoY(m.x, m.y) - m.z - 34; }
      else { const sway = Math.sin((r.hang || 0) * 3) * 4; ex = hx + sway; ey = hy + 160; }
      ctx.strokeStyle = '#1e140c'; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(hx, hy + 3);
      ctx.quadraticCurveTo((hx + ex) / 2 + 3, (hy + ey) / 2, ex, ey); ctx.stroke();
      ctx.strokeStyle = '#b89870'; ctx.lineWidth = 1.4; ctx.stroke();
    }
  }
}
function drawHook(ctx, x, y, spin) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(spin);
  ctx.strokeStyle = '#1a1614'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 4); ctx.stroke();
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, 4); ctx.quadraticCurveTo(s * 7, 4, s * 6, -3); ctx.stroke(); }
  ctx.strokeStyle = '#9a8f84'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 3); ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------ roof hazards
/** A cannonball (or a lit cinderbomb) arcing from a ship onto the roof, with a warning ring where it will land. */
class Cannonball {
  constructor(world, from, to, dur, lvl, fire = false) {
    Object.assign(this, { world, from, to, dur, t: 0, fire, dmg: monsterBase(lvl).dmg * (fire ? 1.6 : 2.4), r: fire ? 1.4 : 1.5 });
    addEffect(new Telegraph({ kind: 'circle', x: to[0], y: to[1], r: this.r, dur }), 'ground');
    this.depth = to[0] + to[1];
  }
  update(dt) {
    this.t += dt;
    if (this.t < this.dur) return true;
    const [x, y] = this.to;
    explode(this.world, null, x, y, this.r, [this.dmg * 0.8, this.dmg * 1.2], 'fire', { team: 'enemy', knock: 0.6 });
    camera.shake(5);
    if (this.fire) this.world.addHazard(new Area({ world: this.world, src: null, team: 'enemy', x, y, r: 1.2, dur: 4, tick: 0.5, dmg: [this.dmg * 0.12, this.dmg * 0.18], el: 'fire', fx: 'fire' }));
    return false;
  }
  draw(ctx) {
    const k = this.t / this.dur, [fx, fy, fz] = this.from, [tx, ty] = this.to;
    const x = fx + (tx - fx) * k, y = fy + (ty - fy) * k, z = fz * (1 - k) + Math.sin(k * Math.PI) * 180;
    const px = isoX(x, y), py = isoY(x, y) - z;
    if (px > 1e6) return;
    ctx.fillStyle = this.fire ? '#ff7a30' : '#141210';
    ctx.beginPath(); ctx.arc(px, py, this.fire ? 5 : 6, 0, TAU); ctx.fill();
    ctx.fillStyle = this.fire ? '#fff0a0' : 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(px - 2, py - 2, 2, 0, TAU); ctx.fill();
  }
}
/** A lightning strike: a ring that tightens, then the bolt. */
class Strike {
  constructor(world, x, y, dur, lvl) {
    Object.assign(this, { world, x, y, dur, t: 0, dmg: monsterBase(lvl).dmg * 2.2, ground: true });
    addEffect(new Telegraph({ kind: 'circle', x, y, r: 1.3, dur, color: '#80c8ff' }), 'ground');
  }
  update(dt) {
    this.t += dt;
    if (this.t < this.dur) return true;
    addEffect(new Column(this.x, this.y, '#c8e8ff', 0.35, 14, 600));
    explode(this.world, null, this.x, this.y, 1.3, [this.dmg * 0.8, this.dmg * 1.2], 'light', { team: 'enemy' }, 'spark');
    G.flash = Math.max(G.flash || 0, 0.25); sfx('light', 0.8);
    return false;
  }
  draw() {}
}

// ------------------------------------------------------------------ minimap: the tower from above
function minimap(world, tw, c, W, H, big) {
  const g = tw.g, p = world.player, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.42, k = R / (g.rWall + 2);
  c.strokeStyle = 'rgba(200,180,140,0.55)'; c.lineWidth = big ? 3 : 2;
  c.beginPath(); c.arc(cx, cy, g.rWall * k, 0, TAU); c.stroke();
  if (!tw.roof) {
    c.beginPath(); c.arc(cx, cy, g.rIn * k, 0, TAU); c.stroke();
    // the stair climbed so far, as an arc that wraps once per turn
    const s = clamp(g.s(p.x), 0, g.sEnd), turns = s / g.C;
    c.strokeStyle = 'rgba(255,200,110,0.8)'; c.lineWidth = (g.w * k) * 0.5;
    const a0 = -Math.PI / 2, rr = g.rc * k;
    c.beginPath(); c.arc(cx, cy, rr, a0, a0 + (turns % 1) * TAU); c.stroke();
    c.fillStyle = '#ffe2a0'; c.font = `${big ? 20 : 11}px Cinzel, Georgia, serif`; c.textAlign = 'center';
    c.fillText(`Turn ${Math.min(Math.floor(turns) + 1, Math.ceil(g.v.turns))}/${Math.ceil(g.v.turns)}`, cx, cy + 4);
    const dot = (x, y, col, r) => { const a = a0 + ((g.s(x) / g.C) % 1) * TAU, q = g.r(y) * k; c.fillStyle = col; c.beginPath(); c.arc(cx + Math.cos(a) * q, cy + Math.sin(a) * q, r, 0, TAU); c.fill(); };
    for (const m of world.creatures) {
      if (m.dead || m === p || m.x < g.XR || Math.abs(g.s(m.x) - s) > 30) continue;
      dot(m.x, m.y, m.team === 'enemy' ? (m.rank !== 'normal' ? '#ffb040' : '#ff3030') : '#40ff60', 2);
    }
    dot(g.door[0], g.door[1], '#ff8040', big ? 6 : 3.5);
    dot(p.x, p.y, '#ffffff', big ? 5 : 3.2);
    return;
  }
  const dot = (x, y, col, r) => { const dx = x - g.AX, dy = y - g.AY; c.fillStyle = col; c.beginPath(); c.arc(cx + (dx - dy) * k * 0.72, cy + (dx + dy) * k * 0.36, r, 0, TAU); c.fill(); };
  for (const po of world.portals) if (po.x < g.XR && po.x > 0) dot(po.x, po.y, po.active ? po.color : '#888', big ? 6 : 4);
  for (const m of world.creatures) if (!m.dead && m !== p && m.x < g.XR && m.x > -30) dot(m.x, m.y, m.team === 'enemy' ? (m.rank === 'boss' ? '#ff8000' : '#ff3030') : '#40ff60', m.rank === 'boss' ? 4 : 2);
  dot(p.x, p.y, '#ffffff', big ? 5 : 3.2);
}
