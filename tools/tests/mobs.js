// Monster pathing: do awake monsters (and the guardian) reach the hero, or get stuck on corners, doors, arches and props?
// For each level: build it, god mode on, put the hero somewhere, wake every monster that can walk to them within 30
// tiles, run 25 game seconds with the hero standing still, then count:
//   engaged  - in attack reach (melee) or in range with a clear shot (ranged), or packed in behind those that are
//   stuck    - not engaged and hasn't moved half a tile in the last 3 s
//   lost     - not engaged but still moving (wandering, or the long way round)
// Then the guardian: hero 15+ walking tiles away, guardian woken; it must reach them.
// Prints per-level numbers and PASS/FAIL (stuck <= 2% and every guardian arrives); mobs_<n>.png of the worst level.
//   node tools/tests/mobs.js [levels=10]
const { openGame, report } = require('./harness');
const LEVELS = +(process.argv[2] || 10);

(async () => {
  const { browser, page, errors, shot } = await openGame({ width: 1280, height: 720 });
  await page.evaluate(async () => {
    const { G, game } = window.VELSCOUR;
    await game.newChar('paladin', 'Bait');
    document.querySelectorAll('.screen').forEach((s) => s.remove());
    G.ui.modalCount = 0;
  });
  const fails = [];
  let tot = { n: 0, engaged: 0, stuck: 0, lost: 0 };
  for (let li = 0; li < LEVELS; li++) {
      if (process.env.MOBS_DEBUG) await page.evaluate(() => { window.MOBS_DEBUG = true; });
    const r = await page.evaluate(async (li) => {
      const { G, game } = window.VELSCOUR;
      const { BIOMES, BIOME_BY_ID } = await import('/src/data/biomes.js');
      const { dist } = await import('/src/core/util.js');
      const list = BIOMES.filter((b) => b.id !== 'throne' && b.id !== 'town');
      const biome = list[(li * 7) % list.length];
      const depth = [3, 12, 24, 38, 55, 71, 88, 7, 15, 44][li % 10] + Math.floor(li / 10);
      G.char.level = Math.min(90, depth + 5); G.player.recompute();
      // each biome's art (outdoor packs, the Dark Forest's trees, the 3D levels' three.js) loads before its generator
      // runs, as enterDungeon does; past the first ten levels every biome comes round (41 levels: all of them)
      G.char.depth = depth;
      await game.loadLevelArt(biome);
      game.buildDungeon(depth, biome);
      const p = G.player, w = G.world, map = w.map;
      G.godMode = true; G.paused = true;
      p.update = function () { this.hp = this.maxHp; }; // the hero just stands there (god mode still lets 1 damage through)
      // a spot in a room far from the start
      let best = null;
      for (const c of w.creatures) if (!c.isPlayer && c.team === 'enemy' && c.rank !== 'boss' && dist(c.x, c.y, p.x, p.y) > 15) { best = c; break; }
      const [hx, hy] = best ? map.randomNear(best.x, best.y, 3) : [p.x, p.y];
      p.x = hx; p.y = hy;
      map.flowFrom = [-9, -9]; map.buildFlow(p.x, p.y, 64);
      const mobs = w.creatures.filter((c) => !c.isPlayer && c.team === 'enemy' && c.rank !== 'boss' && !c.dead);
      const near = mobs.filter((c) => { const f = map.flowAt(c.x, c.y); return f >= 0 && f <= 30; });
      for (const c of near) { c.awake = true; c.aggro = p; }
      const hist = new Map(near.map((c) => [c, []]));
      const N = 25 * 30;
      for (let i = 0; i < N; i++) {
        w.update(1 / 30);
        if (i % 15 === 0) for (const c of near) hist.get(c).push([c.x, c.y]);
      }
      const engagedSet = new Set();
      for (const c of near) {
        if (c.dead) continue;
        const d = dist(c.x, c.y, p.x, p.y);
        const ranged = ['ranged', 'caster', 'beamer', 'nova'].includes(c.ai);
        if (d <= c.r + p.r + 1.4 || (ranged && d < (c.range || 7) + 0.5 && map.los(c.x, c.y, p.x, p.y))) engagedSet.add(c);
      }
      // packed in behind the front line (a crowd in a corridor)
      for (let k = 0; k < 4; k++) for (const c of near) if (!engagedSet.has(c) && !c.dead) for (const e of engagedSet) if (dist(c.x, c.y, e.x, e.y) < c.r + e.r + 0.45) { engagedSet.add(c); break; }
      let stuck = 0, lost = 0;
      const stuckAt = [];
      for (const c of near) {
        if (c.dead || engagedSet.has(c)) continue;
        const h = hist.get(c), a = h[h.length - 7], b = h[h.length - 1];
        if (a && dist(a[0], a[1], b[0], b[1]) < 0.5) {
          stuck++;
          const N = c.nav || {};
          let around = '';
          if (window.MOBS_DEBUG) for (let y = Math.floor(c.y) - 3; y <= Math.floor(c.y) + 3; y++) { around += '|'; for (let x = Math.floor(c.x) - 3; x <= Math.floor(c.x) + 3; x++) around += x === Math.floor(c.x) && y === Math.floor(c.y) ? '@' : !map.tile(x, y) ? '#' : map.block[y * map.w + x] ? 'o' : '.'; }
          stuckAt.push([+c.x.toFixed(1), +c.y.toFixed(1), c.arch, c.ai, map.flowAt(c.x, c.y), c.state, N.stuck, N.path && N.path.length, around]);
        }
        else lost++;
      }
      // the guardian
      const g = w.boss;
      let guard = null;
      if (g) {
        // stand 15-30 walking tiles from it
        map.flowFrom = [-9, -9];
        const cands = [];
        for (const c of w.creatures) if (c.team === 'enemy' && c !== g) c.dead = true;
        w.update(1 / 30);
        map.flowFrom = [-9, -9]; map.buildFlow(g.x, g.y, 64);
        for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) { const f = map.flow[y * map.w + x]; if (f >= 15 && f <= 30 && map.circleFree(x + 0.5, y + 0.5, 0.4)) cands.push([x + 0.5, y + 0.5]); }
        if (cands.length) {
          const [x, y] = cands[Math.floor(Math.random() * cands.length)];
          p.x = x; p.y = y; map.flowFrom = [-9, -9];
          g.awake = true; g.aggro = p; g.bossT = 99; // just walk, no patterns
          let t = 0;
          for (; t < 40 * 30; t++) { w.update(1 / 30); g.bossT = 99; if (dist(g.x, g.y, p.x, p.y) < g.r + p.r + 1.2) break; }
          guard = { arch: g.arch, r: +g.r.toFixed(2), secs: +(t / 30).toFixed(1), arrived: t < 40 * 30, at: [+g.x.toFixed(1), +g.y.toFixed(1)], hero: [x, y] };
        }
      }
      return { biome: biome.id, depth, n: near.length, engaged: engagedSet.size, stuck, lost, stuckAt: stuckAt.slice(0, 6), guard };
    }, li);
    tot.n += r.n; tot.engaged += r.engaged; tot.stuck += r.stuck; tot.lost += r.lost;
    console.log(JSON.stringify(r));
    if (r.guard && !r.guard.arrived) fails.push(`guardian stuck on ${r.biome} depth ${r.depth}`);
    if (r.stuck > 0) await shot('mobs_' + li);
  }
  const pct = (100 * tot.stuck / Math.max(1, tot.n)).toFixed(1);
  console.log(`TOTAL monsters ${tot.n}: engaged ${tot.engaged}, stuck ${tot.stuck} (${pct}%), lost ${tot.lost}`);
  if (tot.stuck / Math.max(1, tot.n) > 0.02) fails.push(`too many stuck monsters: ${pct}%`);
  console.log(fails.length ? 'FAIL\n' + fails.join('\n') : 'PASS');
  if (fails.length) process.exitCode = 1;
  report(errors);
  await browser.close();
})();
