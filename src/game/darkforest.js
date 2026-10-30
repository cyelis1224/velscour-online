// THE DARK FOREST's trials (docs/DARK_FOREST.md). Five scenario glades each hold one of twelve forest-only trials,
// optional and paid in Legendary gear; the Heart of the Forest, deep in the mossy labyrinth, holds the Elder
// Heartwood, whose fall opens the exit. One trial runs at a time. Cleared glades and rewards are saved per depth
// (c.darkForestRuns), so a town trip rebuilds the same forest with the same glades already won.
// The run object speaks the overworld scenario API (active/completed/shrine/markers/type/...) for the HUD, the
// Quest Log and auto-play, plus `objective` (where auto-play should go next) and `hud`.
import { makeMonster } from './monster.js';
import { depthLevel } from '../data/depth.js';
import { UI } from '../ui/ui.js';
import { RNG } from '../core/util.js';
import { G } from '../state.js';
import { TOWNSFOLK } from '../data/townsfolk.js';
import { makeFolk } from './folk.js';
import { townFacingFlip } from './townsfolkvisuals.js';
import { DF_TRIALS } from '../data/darkforest.js';
import { GroundItem } from './loot.js';
import { rollItem, rarityAt, RARITY } from '../data/items.js';
import { addEffect, Ring, sparkle, addLight } from '../gfx/vfx.js';
import { Area } from './hazards.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const at = (o) => [o.x, o.y];

export function createDarkForestRun(world, gen, biome, onSuccess) {
  const c = G.char, key = String(world.depth), runs = c.darkForestRuns || (c.darkForestRuns = {});
  const record = runs[key] || (runs[key] = { seed: gen.seed, cleared: [], rewarded: 0, heart: false });
  record.cleared ||= [];
  const trials = gen.glades.map((g) => makeTrial(world, gen, biome, g, g.type, (S) => sideWon(S, g)));
  const heart = makeTrial(world, gen, biome, { index: 'heart', center: gen.heart.center, shrine: gen.heart.shrine, sites: gen.heart.sites, hideouts: [] }, 'heart', () => heartWon());
  const all = [...trials, heart];
  for (const S of trials) if (record.cleared.includes(S.glade.index)) S.restoreWon();
  const run = {
    id: 'dark_forest', completed: false, failed: false, trials, heart,
    get current() { return all.find((S) => S.active) || null; },
    get active() { return !!run.current; },
    get cleared() { return trials.filter((S) => S.completed).length; },
    get title() { return run.current?.title || (heart.completed ? 'The Heart Is Still' : 'Seek the Heart of the Forest'); },
    // the shrine auto-play should head for: a nearby unfinished glade, else the Heart
    // A glade once chosen stays the target until it is won: picked by straight-line distance, the target flipped
    // between a glade and the Heart whenever the winding path to one led out of (or into) the other's 30 tiles, and
    // auto-play walked back and forth on that line for good. Heading for the Heart, a glade passed near still wins.
    get target() {
      const p = world.player, cur = run.current;
      if (cur) return cur;
      if (heart.completed) return null;
      if (run.aim && run.aim !== heart && !run.aim.completed) return run.aim;
      const near = p && trials.filter((S) => !S.completed && dist(at(p), S.glade.center) < 30)
        .sort((a, b) => dist(at(p), a.glade.center) - dist(at(p), b.glade.center))[0];
      return (run.aim = near || heart);
    },
    get shrine() { return run.target?.shrine || heart.shrine; },
    get type() { return run.current?.type || 'forest'; },
    get markers() { return run.current?.markers || []; },
    get route() { return []; }, get stage() { return run.current?.stage || 0; },
    get escort() { return null; }, get routeIndex() { return 0; },
    get objective() { return run.current?.objective ?? undefined; },
    get description() { return run.current?.description || 'Find the Heart of the Forest.'; },
    get hud() {
      const cur = run.current, cl = run.cleared;
      if (!cur) return { title: heart.completed ? 'The Dark Forest' : 'Find the Heart of the Forest', beat: cl, total: trials.length,
        timer: '', progress: heart.completed ? 'The way on is open' : `Glades won ${cl}/${trials.length} · the Heart lies in the north-east` };
      const left = cur.timer > 0 ? Math.max(0, Math.ceil(cur.timer - cur.seconds)) : 0;
      return { title: cur.title, beat: cl, total: trials.length, timer: left ? left + 's' : '', progress: cur.progress() };
    },
    update(dt) { for (const S of all) if (S.active || S.idle) S.update(dt); },
  };
  for (const S of all) S.busy = () => all.some((o) => o !== S && o.active);
  function reward(S, best) {
    const n = record.rewarded || 0, lvl = depthLevel(world.depth) + 2;
    const [x, y] = S.glade.center;
    // an Epic, sometimes Legendary; a Mythic is a rare gift (the Heart's odds are best)
    world.addLoot(new GroundItem(x + 0.6, y + 0.4, 'item', { item: rollItem(lvl, { rarity: rarityAt(lvl, Math.random() < (best ? 0.5 : 0.2) ? 4 : 3) }) }));
    const mythic = best ? 0.08 : Math.min(0.05, 0.01 * (n + 1));
    if (lvl >= RARITY[5].minIlvl && Math.random() < mythic) {
      world.addLoot(new GroundItem(x - 0.6, y + 0.4, 'item', { item: rollItem(lvl, { rarity: 5 }) }));
      UI.log('The forest gives up a Mythic treasure.', '#ff536e');
    }
    record.rewarded = n + 1;
  }
  function sideWon(S, g) {
    if (!record.cleared.includes(g.index)) { record.cleared.push(g.index); reward(S, false); }
    UI.centerMsg('GLADE WON', `${S.title} · ${run.cleared}/${trials.length} glades`, 3);
    UI.refresh();
    if (G.game?.autosave) G.game.autosave();
  }
  function heartWon() {
    if (!record.heart) { record.heart = true; reward(heart, true); }
    run.completed = true;
    UI.centerMsg('THE HEART IS STILL', 'The way out of the forest is open', 3.6);
    onSuccess(run);
  }
  if (record.heart) { heart.restoreWon(); run.completed = true; onSuccess(run); }
  return run;
}

// ------------------------------------------------------------------ one trial (exported for tools/tests/dark_forest.js)
export function createDarkForestTrial(world, gen, biome, glade, type, onWin) { return makeTrial(world, gen, biome, glade, type, onWin); }
function makeTrial(world, gen, biome, glade, type, onWin) {
  const [title, description] = DF_TRIALS[type];
  const rng = new RNG(((gen.layoutSeed || gen.seed) ^ (glade.index === 'heart' ? 0x4ea7 : (glade.index + 1) * 0x9e37)) >>> 0);
  const C = glade.center, sites = glade.sites;
  const S = { title, type, description, glade, active: false, completed: false, failed: false, idle: false,
    stage: 0, goal: 0, kills: 0, seconds: 0, timer: 0, remaining: 0, foes: [], markers: [], civilians: [], extras: [], objective: undefined, busy: () => false };
  const map = world.map, lvl = () => depthLevel(world.depth);
  const report = (s, col = '#b6e39a') => UI.log('[' + title + '] ' + s, col);
  const live = () => S.foes.some((m) => !m.dead);
  const scat = (name) => world.tileset.scatter.find((s) => s.name === name);
  const near = (p, r) => { const q = map.randomNear(p[0], p[1], r, rng.fn()); return map.walkable(q[0], q[1]) ? q : [C[0], C[1]]; };
  const addProp = (name, p, o = {}) => {
    const s = scat(name);
    if (!s) return null;
    const pr = { kind: 'scatter', x: p[0], y: p[1], spr: s, k: world.tileset.k * (o.scale || 1), flip: !!o.flip, light: o.light || 0 };
    world.props.push(pr); S.extras.push(pr);
    return pr;
  };
  const dropProp = (pr) => { const i = world.props.indexOf(pr); if (i >= 0) world.props.splice(i, 1); };
  const spawn = (arch, p, rank = 'normal', n = 1, o = {}) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const q = i ? near(p, Math.min(2.6, 1 + i * 0.6)) : map.walkable(p[0], p[1]) ? p : near(p, 2.5);
      const m = makeMonster(world, arch, biome, lvl() + (rank === 'boss' ? 2 : rank === 'champion' ? 1 : 0), rank, q[0], q[1], 0, world.looks?.pick?.(arch));
      m.awake = true; if (!o.calm) m.hunter = true;
      if (o.name) m.name = o.name;
      const prev = m.onDeath;
      m.onDeath = (src) => { if (prev) prev.call(m, src); S.kills++; if (S.onFoeDeath) S.onFoeDeath(m); };
      world.add(m); S.foes.push(m); out.push(m);
    }
    return out;
  };
  const roster = (pref) => { const r = pref.filter((a) => biome.roster.includes(a)); return rng.pick(r.length ? r : biome.roster); };
  const mark = (label, p, cb, color = '#8de07a', reach = 1.8) => {
    const mk = { x: p[0], y: p[1], type: 'objective', active: true, reach, color, label, use: () => { if (S.active) cb(mk); } };
    world.portals.push(mk); S.markers.push(mk);
    return mk;
  };
  const unmark = (mk) => { let i = world.portals.indexOf(mk); if (i >= 0) world.portals.splice(i, 1); i = S.markers.indexOf(mk); if (i >= 0) S.markers.splice(i, 1); };
  const clearMarkers = () => { for (const mk of S.markers.slice()) unmark(mk); };
  const person = (folk, p) => {
    const n = makeFolk(world, folk, p[0], p[1]);
    world.npcs.push(n); S.civilians.push(n);
    return n;
  };
  const dropPeople = () => { for (const n of S.civilians) { const i = world.npcs.indexOf(n); if (i >= 0) world.npcs.splice(i, 1); } S.civilians = []; };
  const walkTo = (n, target, speed, dt) => {
    if (!n.path || (n.repath -= dt) <= 0) { n.path = map.findPath(n.x, n.y, target[0], target[1], 30000, 0.3); n.repath = 0.8; }
    if (!n.path || !n.path.length) return;
    while (n.path.length > 1 && Math.hypot(n.x - n.path[0][0], n.y - n.path[0][1]) < 0.35) n.path.shift();
    const [tx, ty] = n.path[0], d = Math.hypot(tx - n.x, ty - n.y), k = Math.min(1, dt * speed / Math.max(d, 1e-3));
    const nx = n.x + (tx - n.x) * k, ny = n.y + (ty - n.y) * k;
    if (map.walkable(nx, ny)) { n.flip = townFacingFlip(nx - n.x, ny - n.y, n.flip); n.walking = true; n.walkT += dt; n.x = nx; n.y = ny; } else n.path = null;
  };
  const flash = (p, color, r = 2) => { addEffect(new Ring(p[0], p[1], 0.2, r, 0.8, color, 4)); sparkle(p[0], p[1], 10, color, 30, 0.5); };
  const phases = (list, then) => { S.phaseList = list; S.phaseThen = then; S.goal = list.length; S.stage = 1; list[0](); };
  const trackPhases = () => {
    if (!S.phaseList || live()) return;
    if (S.stage < S.phaseList.length) { S.stage++; S.foes = S.foes.filter((m) => !m.dead); S.phaseList[S.stage - 1](); }
    else { const t = S.phaseThen; S.phaseList = null; t(); }
  };
  const darken = (k) => { if (S.oldDark === undefined) { S.oldDark = world.darkK || 0; S.oldNight = world.night; } world.darkK = Math.max(world.darkK || 0, k); world.night = true; };
  const undarken = () => { if (S.oldDark !== undefined) { world.darkK = S.oldDark; world.night = S.oldNight; S.oldDark = undefined; } };
  const finish = () => {
    if (S.completed) return;
    S.completed = true; S.active = false; S.objective = undefined; clearMarkers(); undarken();
    if (S.cleanup) S.cleanup(true);
    S.shrine.color = '#4a6a48';
    flash(C, '#8dff7a', 4);
    onWin(S);
  };
  const fail = (reason) => {
    if (S.completed || S.failed) return;
    S.failed = true; S.active = false; S.objective = undefined;
    for (const m of S.foes) if (!m.dead) m.dead = true;
    S.foes = []; clearMarkers(); dropPeople(); undarken();
    if (S.cleanup) S.cleanup(false);
    report('FAILED — ' + reason + ' Touch the glade stone to try again.', '#ff9a70');
    UI.centerMsg('TRIAL FAILED', 'Touch the glade stone to try again', 3);
  };
  Object.assign(S, { finish, fail });
  S.progress = () => S.failed ? 'Failed — touch the stone to retry' : S.goal ? `Progress ${Math.min(S.stage, S.goal)}/${S.goal}` : '';
  S.restoreWon = () => { S.completed = true; S.shrine.color = '#4a6a48'; };

  // ---------------------------------------------------------------- the trials
  const T = TRIALS[type];
  const ctx = { S, world, map, rng, C, sites, glade, gen, biome, spawn, roster, mark, unmark, clearMarkers, addProp, dropProp, person, dropPeople, walkTo,
    flash, phases, trackPhases, live, near, report, darken, finish, fail, scat };
  if (T.dress) T.dress(ctx);
  const start = () => {
    if (S.active || S.completed) return;
    if (S.busy()) { report('Another trial already holds the forest. Finish it first.', '#ffb070'); return; }
    for (const m of S.foes) if (!m.dead) m.dead = true;
    dropPeople(); clearMarkers();
    Object.assign(S, { active: true, failed: false, stage: 0, goal: 0, kills: 0, seconds: 0, timer: 0, remaining: 0, foes: [], phaseList: null, objective: undefined, onFoeDeath: null, cleanup: null });
    report(description); UI.centerMsg(title.toUpperCase(), description, 3.2);
    T.start(ctx);
  };
  S.update = (dt) => {
    if (!S.active) return;
    S.seconds += dt;
    if (S.timer > 0 && S.seconds >= S.timer && !T.timerWins) { fail(T.timeout || 'Time ran out.'); return; }
    T.update(ctx, dt);
    if (S.phaseList) trackPhases();
  };
  S.start = start;
  S.shrine = { x: glade.shrine[0], y: glade.shrine[1], type: 'shrine', reach: 1.8, active: true, color: type === 'heart' ? '#7dff9a' : '#55e0b0',
    get label() { return S.completed ? 'Trial Won' : S.failed ? 'Retry: ' + title : S.active ? title : 'Begin: ' + title; },
    use: () => { if (!S.completed && !S.active) start(); else if (S.active) report(description); } };
  world.portals.push(S.shrine);
  return S;
}

// ------------------------------------------------------------------ trial definitions: dress (once), start, update
const TRIALS = {
  // Five wisps, one at a time; each drifts away from the hero and has to be caught.
  wisps: {
    timeout: 'The witch-lights went out.',
    start(x) {
      const { S } = x;
      S.goal = 5; S.timer = 150;
      x.next = () => {
        const p = x.near(x.C, 9);
        x.wisp = x.mark('Witch-Light', p, (mk) => {
          x.unmark(mk); x.wisp = null; S.stage++; x.flash([mk.x, mk.y], '#9fe8ff', 2.2);
          x.spawn(x.roster(['wraith', 'bat']), x.near([mk.x, mk.y], 3), 'normal', 2 + S.stage);
          if (S.stage >= S.goal) S.done = true; else S.wait = 1;
        }, '#9fe8ff', 1.6);
      };
      S.done = false; S.wait = 0; x.next();
    },
    update(x, dt) {
      const { S, world, map } = x, p = world.player, w = x.wisp;
      if (S.done) { if (!x.live()) x.finish(); return; }
      if (!w) { if ((S.wait -= dt) <= 0) x.next(); return; }
      addLight(w.x, w.y, 3.2, 0.9, 30, '#9fe8ff');
      S.objective = { x: w.x, y: w.y, reach: 1.5, use: () => w.use() };
      // flee the hero, wander otherwise; never stray far from the glade
      let dx = w.x - p.x, dy = w.y - p.y, d = Math.hypot(dx, dy);
      const sp = d < 5 ? 1.9 : 0.6;
      if (d >= 5) { const a = S.seconds * 0.7 + w.x; dx = Math.cos(a); dy = Math.sin(a); d = 1; }
      const home = Math.hypot(w.x - x.C[0], w.y - x.C[1]);
      if (home > 13) { dx = x.C[0] - w.x; dy = x.C[1] - w.y; d = home; }
      for (const turn of [0, 0.8, -0.8, 1.6, -1.6]) {
        const a = Math.atan2(dy, dx) + turn, nx = w.x + Math.cos(a) * sp * dt, ny = w.y + Math.sin(a) * sp * dt;
        if (map.circleFree(nx, ny, 0.3)) { w.x = nx; w.y = ny; break; }
      }
    },
  },

  // Burn five egg sacs (each hatches spiders), then the Brood Mother comes.
  nest: {
    dress(x) { x.sacs = [0, 2, 3, 5, 6].map((i) => x.addProp('spider_eggs', x.sites[i])); x.addProp('wrapped_corpse', x.near(x.C, 3)); },
    start(x) {
      const { S } = x;
      S.goal = 6; S.mother = null;
      x.sacs.forEach((pr, i) => {
        if (!pr) return;
        if (x.world.props.indexOf(pr) < 0) x.world.props.push(pr);
        x.mark('Burn the Egg Sac', [pr.x, pr.y], (mk) => {
          x.unmark(mk); x.dropProp(pr); S.stage++; x.flash([pr.x, pr.y], '#ff9040');
          x.spawn('spider', [pr.x, pr.y], 'normal', 3);
        }, '#ff9040');
      });
    },
    update(x, dt) {
      const { S } = x;
      if (!S.mother && S.stage >= 5 && !x.live()) {
        S.mother = x.spawn('spider', x.C, 'boss', 1, { name: 'The Brood Mother' })[0];
        x.report('The Brood Mother crawls out of the dark!', '#ff8060'); S.brood = 6;
      }
      if (S.mother) {
        if (S.mother.dead) { S.stage = 6; x.finish(); return; }
        if ((S.brood -= dt) <= 0) { S.brood = 9; x.spawn('spider', x.near([S.mother.x, S.mother.y], 2), 'normal', 2); }
      }
    },
  },

  // Four effigies; while any hangs, foes slain near a standing effigy may rise again.
  effigies: {
    dress(x) { x.effs = [1, 3, 5, 7].map((i) => x.addProp('hanging_effigy', x.sites[i])); },
    start(x) {
      const { S } = x;
      S.goal = 4;
      const standing = new Set();
      x.effs.forEach((pr) => {
        if (!pr) return;
        if (x.world.props.indexOf(pr) < 0) x.world.props.push(pr);
        standing.add(pr);
        x.spawn(x.roster(['cultist', 'zombie', 'skeleton']), x.near([pr.x, pr.y], 2), 'normal', 3);
        x.mark('Burn the Effigy', [pr.x, pr.y], (mk) => {
          x.unmark(mk); x.dropProp(pr); standing.delete(pr); S.stage++; x.flash([pr.x, pr.y], '#ff7030', 2.6);
        }, '#ff7030');
      });
      S.onFoeDeath = (m) => {
        if (m.risen || !standing.size || Math.random() > 0.6) return;
        if ([...standing].some((pr) => Math.hypot(pr.x - m.x, pr.y - m.y) < 7)) {
          const r = x.spawn('zombie', [m.x, m.y], 'normal', 1)[0];
          r.risen = true; x.flash([m.x, m.y], '#b080ff', 1.2);
        }
      };
    },
    update(x) { if (x.S.stage >= 4 && !x.live()) x.finish(); },
  },

  // The glade goes dark; waves come at the lanterns. Relight the snuffed ones; lose all four at once and fail.
  lanterns: {
    timerWins: true,
    dress(x) { x.lamps = [0, 2, 4, 6].map((i) => x.addProp('lantern_stake', x.sites[i], { light: 4 })); },
    start(x) {
      const { S } = x;
      S.timer = 80; S.goal = 0; S.waveT = 2; S.wave = 0;
      x.lampHp = x.lamps.map(() => 100);
      x.lamps.forEach((pr) => { if (pr) { pr.light = 4; if (x.world.props.indexOf(pr) < 0) x.world.props.push(pr); } });
      x.darken(0.88);
      S.cleanup = () => { x.lamps.forEach((pr) => { if (pr) pr.light = 4; }); };
      S.progress = () => `Lanterns lit ${x.lampHp.filter((h) => h > 0).length}/4 · dawn in ${Math.max(0, Math.ceil(S.timer - S.seconds))}s`;
    },
    update(x, dt) {
      const { S } = x;
      if (S.seconds >= S.timer) { x.finish(); return; }
      if ((S.waveT -= dt) <= 0) {
        S.waveT = 12; S.wave++;
        x.lamps.forEach((pr, i) => { if (pr && (i + S.wave) % 2 === 0) x.spawn(x.roster(['wraith', 'ghoul', 'bat', 'shroom']), x.near([pr.x, pr.y], 1.5), 'normal', 1 + Math.ceil(S.wave / 2)); });
      }
      // nothing left alive between waves: a few come out of the dark at the hero (not the lanterns), so the vigil is never
      // spent standing about
      const p = x.world.player;
      S.quiet = x.live() ? 0 : (S.quiet || 0) + dt;
      if (S.quiet > 0.5 && S.waveT > 1.5 && p) { S.quiet = 0; x.spawn(x.roster(['wraith', 'ghoul', 'bat', 'shroom']), x.near([p.x, p.y], 5), 'normal', 1 + Math.ceil(S.wave / 2)); }
      let lit = 0;
      x.lamps.forEach((pr, i) => {
        if (!pr) return;
        if (x.lampHp[i] > 0) {
          const foes = x.S.foes.filter((m) => !m.dead && Math.hypot(m.x - pr.x, m.y - pr.y) < 2.4).length;
          x.lampHp[i] -= foes * 14 * dt;
          if (x.lampHp[i] <= 0) {
            pr.light = 0; x.report('A lantern gutters out!', '#ffb070');
            const mk = x.mark('Relight the Lantern', [pr.x, pr.y], () => { x.unmark(mk); x.lampHp[i] = 70; pr.light = 4; x.flash([pr.x, pr.y], '#ffd070'); }, '#ffd070');
          } else lit++;
        }
      });
      if (!lit) x.fail('Every lantern went dark.');
    },
  },

  // Simon says, with standing stones: watch the order, then touch them in it. Three rounds (3, 4, 5 stones).
  druids: {
    dress(x) { x.stones = [0, 2, 3, 5, 6].map((i) => { const p = x.sites[i]; x.addProp('druid_stone', p, { light: 1.5 }); return p; }); },
    start(x) {
      const { S } = x;
      S.goal = 3; S.round = 0;
      x.marks = x.stones.map((p, i) => x.mark('Druid Stone ' + 'I II III IV V'.split(' ')[i], [p[0] + 0.6, p[1] + 0.4], () => press(i), '#7affc8', 1.6));
      const press = (i) => {
        if (S.show > 0 || S.punish) return;
        if (i === S.seq[S.pos]) {
          x.flash(x.stones[i], '#7affc8', 1.6); S.pos++;
          if (S.pos >= S.seq.length) {
            S.stage++; x.report(`The circle answers: round ${S.stage}/3.`);
            if (S.stage >= 3) { x.finish(); return; }
            x.spawn(x.roster(['shroom', 'wraith', 'golem']), x.near(x.C, 4), S.stage === 2 ? 'champion' : 'normal', 3);
            newRound();
          }
        } else {
          x.flash(x.stones[i], '#ff5050', 2.4); x.report('Wrong stone! The circle lashes out.', '#ff8070');
          x.spawn(x.roster(['shroom', 'wraith']), x.near(x.stones[i], 2), 'normal', 3);
          S.punish = true; S.pos = 0;
        }
      };
      const newRound = () => { S.round++; S.seq = Array.from({ length: 2 + S.round }, () => x.rng.int(0, 4)); S.pos = 0; S.show = 1.2; S.showI = -1; };
      newRound();
      S.progress = () => S.show > 0 ? `Round ${S.round}/3 · watch the stones` : S.punish ? 'Defeat the circle\'s guardians' : `Round ${S.round}/3 · stone ${S.pos + 1} of ${S.seq.length}`;
    },
    update(x, dt) {
      const { S } = x;
      if (S.punish) { if (!x.live()) { S.punish = false; S.show = 1; S.showI = -1; } S.objective = undefined; return; }
      if (S.show > 0) {
        S.show -= dt;
        S.objective = { x: x.C[0], y: x.C[1] + 1, reach: 3 }; // auto-play waits in the circle
        if (S.show <= 0) {
          S.showI++;
          if (S.showI < S.seq.length) { const p = x.stones[S.seq[S.showI]]; x.flash(p, '#e8fff0', 2.2); addLight(p[0], p[1], 4, 1, 40, '#b0ffd8'); S.show = 0.95; }
          else S.show = 0;
        }
        return;
      }
      const mk = x.marks[S.seq[S.pos]];
      S.objective = mk ? { x: mk.x, y: mk.y, reach: 1.4, use: () => mk.use() } : undefined;
    },
  },

  // The alpha howls every few seconds and the pack answers. Bring it down.
  wolfmoon: {
    start(x) {
      const { S } = x;
      x.darken(0.7);
      S.goal = 1; S.howl = 4;
      S.alpha = x.spawn('hound', x.sites[x.rng.int(0, 7)], 'boss', 1, { name: 'The Moon-Eyed Alpha' })[0];
      x.spawn('hound', x.near(x.C, 5), 'normal', 3);
      S.progress = () => `Slay the alpha · ${S.foes.filter((m) => !m.dead).length} wolves on the hunt`;
    },
    update(x, dt) {
      const { S } = x;
      if (S.alpha.dead) { S.stage = 1; x.finish(); return; }
      if ((S.howl -= dt) <= 0) {
        S.howl = 9;
        if (S.foes.filter((m) => !m.dead).length < 14) {
          x.report('The alpha howls — the pack answers!', '#c8d8ff');
          x.spawn('hound', x.near(x.sites[x.rng.int(0, 7)], 2), 'normal', 3);
        }
      }
    },
  },

  // Three children wandered off into the trails. Find each, then lead them home; a child that gets hurt too much is lost.
  lostchildren: {
    start(x) {
      const { S, rng } = x;
      S.goal = 3;
      const kids = TOWNSFOLK.filter((v) => v.child), spots = (x.glade.hideouts || []).slice();
      while (spots.length < 3) spots.push(x.near(x.C, 24));
      x.kids = spots.slice(0, 3).map((p, i) => {
        const n = x.person(kids[(rng.int(0, kids.length - 1) + i) % kids.length], p);
        n.state = 'lost'; n.hp = 100;
        n.mk = x.mark('Find ' + n.name, [n.x, n.y], () => found(n), '#ffd890', 1.8);
        n.onUse = () => { if (n.state === 'lost') found(n); };
        return n;
      });
      const found = (n) => {
        if (n.state !== 'lost') return;
        n.state = 'follow'; x.unmark(n.mk); n.emotion = 'happy'; n.emotionT = 2;
        x.report(n.name + ' takes your hand. Lead them back to the glade!');
        x.spawn(x.roster(['hound', 'spider', 'ghoul']), x.near([n.x, n.y], 5), 'normal', 3);
      };
      S.progress = () => `Children home ${S.stage}/3` + (x.kids.some((k) => k.state === 'follow') ? ' · lead them to the glade' : '');
    },
    update(x, dt) {
      const { S, world } = x, p = world.player;
      for (const n of x.kids) {
        if (n.state !== 'follow') continue;
        const d = Math.hypot(n.x - p.x, n.y - p.y);
        if (d > 2 && d < 16) x.walkTo(n, [p.x, p.y], d > 5 ? 5.2 : 3.6, dt); // a child left behind runs to catch up
        const hurt = S.foes.filter((m) => !m.dead && Math.hypot(m.x - n.x, m.y - n.y) < 2).length;
        if (hurt) { n.hp -= hurt * 5 * dt; n.emotion = 'scared'; n.emotionT = 0.5; }
        if (n.hp <= 0) { x.fail(n.name + ' was lost to the forest.'); return; }
        if (Math.hypot(n.x - x.C[0], n.y - x.C[1]) < 3.5) { n.state = 'home'; n.emotion = 'cheer'; n.emotionT = 3; S.stage++; x.report(n.name + ' is safe!'); }
      }
      if (S.stage >= 3) { x.finish(); return; }
      // auto-play: fetch a straggler, bring followers home, else find the next child
      // a follower more than 6 tiles back: wait for it; one about to be lost (they follow up to 16): go back for it.
      // (Walking back for every straggler ping-ponged with the walk home on long forest paths.)
      const follow = x.kids.filter((k) => k.state === 'follow'), far = (k) => Math.hypot(k.x - p.x, k.y - p.y);
      const lag = follow.find((k) => far(k) > 12), wait = !lag && follow.some((k) => far(k) > 6);
      // the next child to find stays chosen until found: re-picking the nearest by straight line every frame flipped
      // between children as the path wound through the labyrinth, and the hero wandered between them
      if (!x.seek || x.seek.state !== 'lost') x.seek = x.kids.filter((k) => k.state === 'lost').sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      const lost = x.seek;
      // home means the glade's centre itself: a follower stops 2 tiles from the hero and counts as home within 3.5 of
      // the centre, so a hero waiting 2.5 out (the old reach) could leave a child at 4.5 forever
      S.objective = lag ? { x: lag.x, y: lag.y, reach: 2 } : wait ? { x: p.x, y: p.y, reach: 1 } : follow.length ? { x: x.C[0], y: x.C[1], reach: 1 } : lost ? { x: lost.x, y: lost.y, reach: 1.5, use: () => lost.mk.use() } : undefined;
    },
  },

  // A timber stockade with a gate on every side: its bandits, their lieutenants, then the chief.
  palisade: {
    dress(x) { x.addProp('campfire', x.near(x.C, 1), { light: 5 }); x.addProp('wooden_crate', x.near(x.C, 3)); x.addProp('broken_wagon', x.near(x.C, 4)); x.addProp('bedroll', x.near(x.C, 3)); },
    start(x) {
      const inside = () => x.near(x.C, 3.5);
      x.phases([
        () => { for (let i = 0; i < 6; i++) x.spawn(i % 2 ? 'archer' : x.roster(['cultist', 'knight', 'skeleton']), inside()); x.report('The bandits man the stockade!'); },
        () => { x.spawn('archer', inside(), 'champion', 1); x.spawn('knight', inside(), 'champion', 1); x.spawn('archer', inside(), 'normal', 3); },
        () => { x.spawn('knight', x.C, 'boss', 1, { name: 'Black Tom, the Bandit Chief' }); x.spawn('archer', inside(), 'normal', 2); x.report('The bandit chief draws his blade!', '#ffb070'); },
      ], x.finish);
    },
    update() {},
  },

  // Three rings of mushrooms, one after another: stand in each until it is yours, with the fey coming at you.
  fairyring: {
    start(x) {
      const { S } = x;
      S.goal = 3; S.hold = 0; S.ringT = 32;
      const ring = (p) => {
        S.ringAt = p; S.hold = 0; S.ringT = 32; S.called = false;
        for (const pr of S.rings || []) x.dropProp(pr);
        S.rings = Array.from({ length: 8 }, (_, i) => x.addProp(i % 2 ? 'pale_mushrooms' : 'poison_mushrooms', [p[0] + Math.cos(i * 0.785) * 1.7, p[1] + Math.sin(i * 0.785) * 1.7]));
      };
      S.cleanup = () => { for (const pr of S.rings || []) x.dropProp(pr); };
      x.ring = ring; ring(x.sites[x.rng.int(0, 7)]);
      S.progress = () => `Ring ${S.stage + 1}/3 · ${Math.floor(S.hold)}/6 s held · moves in ${Math.max(0, Math.ceil(S.ringT))}s`;
    },
    update(x, dt) {
      const { S, world } = x, p = world.player, R = S.ringAt;
      S.objective = { x: R[0], y: R[1], reach: 0.9 };
      addLight(R[0], R[1], 2.4, 0.6, 10, '#d0a0ff');
      const inside = Math.hypot(p.x - R[0], p.y - R[1]) < 1.8;
      if (inside && !S.called) { S.called = true; x.spawn(x.roster(['shroom', 'imp', 'slime', 'bat']), x.near(R, 4), 'normal', 3 + S.stage * 2); x.report('The fey swarm the ring!', '#d0a0ff'); }
      if (inside && !S.foes.some((m) => !m.dead && Math.hypot(m.x - R[0], m.y - R[1]) < 2.5)) S.hold += dt; else S.hold = Math.max(0, S.hold - dt * 0.4);
      if (S.hold >= 6) {
        S.stage++; x.flash(R, '#e0b0ff', 2.5); x.report(`The ring is yours: ${S.stage}/3.`);
        if (S.stage >= 3) { x.finish(); return; }
        x.ring(x.sites[(x.sites.indexOf(R) + 3 + x.rng.int(0, 2)) % 8] || x.near(x.C, 5));
      } else if ((S.ringT -= dt) <= 0) { x.report('The ring fades and springs up elsewhere!', '#d0a0ff'); x.ring(x.sites[x.rng.int(0, 7)]); }
    },
  },

  // Open the barrow: the dead rise in two waves, then the Hollow King.
  barrow: {
    dress(x) { x.door = x.addProp('dungeon_marker', [x.C[0] + 0.5, x.C[1] + 1.5], { light: 2 }); x.addProp('stone_cairn', x.near(x.C, 4)); x.addProp('stone_cairn', x.near(x.C, 4)); x.addProp('ancient_bones', x.near(x.C, 3)); },
    start(x) {
      const { S } = x;
      S.goal = 3;
      const mk = x.mark('Open the Barrow', [x.C[0] + 0.5, x.C[1] + 2.4], () => {
        x.unmark(mk); x.flash([x.C[0], x.C[1] + 1.5], '#b0c0ff', 3); x.darken(0.65);
        const graves = () => x.sites[x.rng.int(0, 7)];
        x.phases([
          () => { x.report('The barrow breathes out its dead!'); for (let i = 0; i < 3; i++) x.spawn(x.roster(['skeleton', 'zombie']), graves(), 'normal', 3); },
          () => { for (let i = 0; i < 3; i++) x.spawn(x.roster(['skeleton', 'ghoul', 'wraith']), graves(), i ? 'normal' : 'champion', 3); },
          () => { x.spawn('skeleton', [x.C[0], x.C[1] + 2], 'boss', 1, { name: 'The Hollow King' }); x.spawn('knight', graves(), 'champion', 2); x.report('The Hollow King rises!', '#c0c8ff'); },
        ], x.finish);
      }, '#b0c0ff');
      S.objective = { x: mk.x, y: mk.y, reach: 1.6, use: () => mk.use() };
    },
    update(x) { if (x.S.phaseList) x.S.objective = undefined; },
  },

  // Woodcutters by their fire; four waves of woken trees and their vermin. Keep at least one alive.
  woodcutters: {
    dress(x) { x.addProp('campfire', x.C, { light: 5 }); x.addProp('firewood', [x.C[0] + 1.6, x.C[1] - 0.8]); x.addProp('split_stump', [x.C[0] - 1.8, x.C[1] + 0.6]); x.addProp('fallen_log', [x.C[0] + 0.4, x.C[1] + 2.2]); },
    start(x) {
      const { S, rng } = x;
      const adults = TOWNSFOLK.filter((v) => !v.child && !v.royal && !v.courtier);
      x.cutters = [0, 1, 2].map((i) => { const a = i * 2.1 + 0.4, n = x.person(adults[rng.int(0, adults.length - 1)], [x.C[0] + Math.cos(a) * 1.6, x.C[1] + Math.sin(a) * 1.4]); n.name = n.name.split(' ')[0] + ' the Woodcutter'; return n; });
      let w = 0;
      const wave = () => { w++; for (let i = 0; i < 2; i++) x.spawn(i ? x.roster(['spider', 'shroom']) : 'golem', x.sites[(w * 3 + i * 4) % 8], w === 4 && !i ? 'champion' : 'normal', 1 + w); x.report(`The trees wake: wave ${w}/4!`); };
      x.phases([wave, wave, wave, wave], x.finish);
      S.progress = () => `Wave ${S.stage}/4 · woodcutters standing ${x.cutters.filter((n) => n.hp > 0).length}/3`;
    },
    update(x, dt) {
      const { S } = x;
      for (const n of x.cutters) {
        if (n.hp <= 0) continue;
        const foes = S.foes.filter((m) => !m.dead && Math.hypot(m.x - n.x, m.y - n.y) < 3).length;
        if (foes) { n.hp -= foes * 2.6 * dt; n.emotion = 'scared'; n.emotionT = 0.4; }
        if (n.hp <= 0) { n.emotion = 'dead'; n.emotionT = 999; x.report(n.name + ' has fallen!', '#ff9070'); }
      }
      if (!x.cutters.some((n) => n.hp > 0)) x.fail('The woodcutters were overrun.');
    },
  },

  // Four thorn hearts. While they stand, briars burst out of the ground under the hero.
  thorns: {
    timeout: 'The briars swallowed the glade.',
    dress(x) { x.hearts = [1, 3, 5, 7].map((i) => x.addProp('thorn_bush', x.sites[i], { scale: 1.3 })); },
    start(x) {
      const { S } = x;
      S.goal = 4; S.timer = 140; S.briar = 3;
      x.hearts.forEach((pr) => {
        if (!pr) return;
        if (x.world.props.indexOf(pr) < 0) x.world.props.push(pr);
        x.spawn(x.roster(['shroom', 'spider', 'golem']), x.near([pr.x, pr.y], 2), 'normal', 2);
        x.mark('Uproot the Thorn Heart', [pr.x, pr.y], (mk) => {
          x.unmark(mk); x.dropProp(pr); S.stage++; x.flash([pr.x, pr.y], '#80ff60', 2.4);
          x.spawn(x.roster(['shroom', 'spider']), x.near([pr.x, pr.y], 2), 'normal', 2);
        }, '#80ff60');
      });
    },
    update(x, dt) {
      const { S, world } = x, p = world.player;
      if (S.stage >= 4) { if (!x.live()) x.finish(); return; }
      if ((S.briar -= dt) <= 0 && Math.hypot(p.x - x.C[0], p.y - x.C[1]) < 14) {
        S.briar = Math.max(2.2, 6 - (4 - S.stage) * 0.6);
        const dmg = 6 + depthLevel(world.depth) * 1.6;
        world.addHazard(new Area({ x: p.x + (Math.random() - 0.5) * 1.5, y: p.y + (Math.random() - 0.5) * 1.5, r: 1.3, dur: 6, tick: 0.5, team: 'enemy', fx: 'poison', el: 'poison', dmg: [dmg * 0.7, dmg], slow: true }));
      }
    },
  },

  // The Heart of the Forest: sever four roots, fell the Warden, then hold against the forest's last fury.
  heart: {
    start(x) {
      const { S } = x;
      S.goal = 3; S.stage = 1; S.roots = 4;
      x.darken(0.6);
      [0, 2, 4, 6].forEach((i) => {
        const p = x.sites[i];
        x.spawn(x.roster(['golem', 'shroom', 'wraith', 'spider']), x.near(p, 2), i ? 'normal' : 'champion', 3);
        x.mark('Sever the Root', p, (mk) => { x.unmark(mk); x.flash(p, '#90ff90', 2.6); S.roots--; x.report(`A root is severed — ${S.roots} left.`); }, '#90ff90');
      });
      S.progress = () => S.stage === 1 ? `Sever the roots ${4 - S.roots}/4` : S.stage === 2 ? 'Fell the Heartwood Warden' : 'Hold the Heart';
    },
    update(x) {
      const { S } = x;
      if (S.stage === 1 && S.roots <= 0 && !x.live()) {
        S.stage = 2;
        S.warden = x.spawn('golem', [x.C[0] + 1.5, x.C[1] + 2.5], 'boss', 1, { name: 'The Heartwood Warden' })[0];
        x.spawn('cultist', x.near(x.C, 4), 'champion', 1, { name: 'The Witch of the Wood' });
        x.spawn(x.roster(['wraith', 'shroom']), x.near(x.C, 4), 'normal', 4);
        x.report('The Heartwood Warden tears itself out of the ground!', '#ffb070');
      } else if (S.stage === 2 && S.warden.dead && !x.live()) {
        S.stage = 3; S.final = 1;
        x.spawn('hound', x.sites[1], 'normal', 5); x.spawn('spider', x.sites[5], 'normal', 4); x.report('The whole forest comes for you!');
      } else if (S.stage === 3 && !x.live()) {
        if (S.final === 1) { S.final = 2; x.spawn(x.roster(['wraith', 'golem']), x.sites[3], 'champion', 2); x.spawn('bat', x.sites[7], 'normal', 5); }
        else x.finish();
      }
    },
  },
};
