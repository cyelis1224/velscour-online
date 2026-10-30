// THE DARK FOREST (docs/DARK_FOREST.md): 40 seeded forests (every glade, gate, chest and the Heart reachable; tree,
// wall and gate counts; no tree on a walkable tile), a bot that plays all twelve glade trials and the Heart to the
// end, frame cost in the woods, and screenshots: entry, trail, labyrinth gate and corridors, the Heart, every glade
// trial live, canopy fade over the hero, and the phone layout.
//   node tools/tests/dark_forest.js [shots|noshots] [auto|noauto]      (start the server first: python3 -m http.server 8123)
const { openGame, report } = require('./harness');
const SHOTS = process.argv[2] !== 'noshots';

(async () => {
  const { browser, page, errors, shot } = await openGame({ width: 1366, height: 860 });
  try {
    const gen = await page.evaluate(async () => {
      const { G, game } = window.VELSCOUR;
      const { BIOME_BY_ID } = await import('/src/data/biomes.js');
      const { generateDarkForest } = await import('/src/world/darkforest.js');
      const biome = BIOME_BY_ID.dark_forest;
      await game.loadLevelArt(biome);
      const { biomeTileSet } = await import('/src/core/assets.js');
      const ts = biomeTileSet(biome), bad = [], stats = [];
      if (ts.pack !== 'dark_forest') bad.push('tile set is ' + ts.pack);
      let ms = 0, retries = 0;
      for (let n = 1; n <= 40; n++) {
        const seed = n * 7717 + 3, t0 = performance.now();
        let g;
        try { g = generateDarkForest(7, biome, ts, seed); } catch (e) { bad.push(`seed ${seed}: ${e.message}`); continue; }
        ms = Math.max(ms, performance.now() - t0);
        if (g.layoutSeed !== seed) retries++;
        const m = g.map, I = (x, y) => y * m.w + x, seen = new Uint8Array(m.w * m.h), q = [I(Math.floor(g.start[0]), Math.floor(g.start[1]))];
        seen[q[0]] = 1;
        for (let h = 0; h < q.length; h++) { const i = q[h], x = i % m.w, y = (i / m.w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = I(x + dx, y + dy); if (m.walkableTile(x + dx, y + dy) && !seen[j]) { seen[j] = 1; q.push(j); } } }
        const must = [g.exit, g.heart.shrine, ...g.glades.map((v) => v.shrine), ...g.glades.flatMap((v) => v.sites), ...g.chests.map((c) => [c.x, c.y]), ...g.heart.sites];
        const lost = must.filter(([x, y]) => !seen[I(Math.floor(x), Math.floor(y))]);
        if (lost.length) bad.push(`seed ${seed}: ${lost.length} objectives unreachable`);
        const trees = g.trees, onPath = trees.filter((p) => !p.elder && m.walkable(p.x, p.y)).length;
        if (onPath) bad.push(`seed ${seed}: ${onPath} trees on walkable tiles`);
        if (trees.length < 12000) bad.push(`seed ${seed}: only ${trees.length} trees`);
        if (new Set(g.glades.map((v) => v.type)).size !== 5) bad.push(`seed ${seed}: repeated glade trials`);
        const arches = m.walls.filter((w) => w.kind === 'arch').length, doors = m.doors.length;
        if (g.labyrinths.length < 3) bad.push(`seed ${seed}: ${g.labyrinths.length} labyrinths`);
        if (!arches) bad.push(`seed ${seed}: no arch gates`);
        if (g.glades.some((v) => v.type === 'palisade') && !doors) bad.push(`seed ${seed}: stockade without a gate`);
        const open = seen.reduce((a, b) => a + b, 0);
        stats.push({ seed, trees: trees.length, walls: m.walls.length, arches: arches / 6, doors, open, spawns: g.spawns.length, chests: g.chests.length });
      }
      const avg = (k) => Math.round(stats.reduce((a, s) => a + s[k], 0) / stats.length);
      return { bad, maxMs: Math.round(ms), retries, avg: { trees: avg('trees'), walls: avg('walls'), arches: avg('arches'), open: avg('open'), spawns: avg('spawns'), chests: avg('chests') } };
    });
    console.log('generation', JSON.stringify(gen));
    for (const b of gen.bad) errors.push('[gen] ' + b);

    // ------------------------------------------------ the bot plays every trial
    const play = await page.evaluate(async () => {
      const { G, game } = window.VELSCOUR;
      const { BIOME_BY_ID } = await import('/src/data/biomes.js');
      const { createDarkForestTrial } = await import('/src/game/darkforest.js');
      const { generateDarkForest } = await import('/src/world/darkforest.js');
      const { DF_GLADE_TYPES } = await import('/src/data/darkforest.js');
      const { hit } = await import('/src/game/combat.js');
      const biome = BIOME_BY_ID.dark_forest, out = [], bad = [], dt = 1 / 15;
      await game.newChar('paladin', 'Forest Bot'); G.char.depth = 11; G.godMode = true;
      await game.loadLevelArt(biome);
      const step = (W, P, S, st) => {
        const foes = S.foes.filter((m) => !m.dead);
        for (const m of foes) if (Math.hypot(m.x - P.x, m.y - P.y) < 2.2) hit(P, m, 1e12, 'phys', { crit: false });
        let goal = null, use = null;
        const near = foes.filter((m) => Math.hypot(m.x - P.x, m.y - P.y) < 6);
        const o = S.objective;
        if (o && !near.length) { goal = [o.x, o.y]; if (Math.hypot(o.x - P.x, o.y - P.y) < (o.reach || 1.4)) use = o; }
        else if (!near.length && S.markers.length) {
          if (!st.sticky || !S.markers.includes(st.sticky)) st.sticky = S.markers.reduce((a, b) => Math.hypot(a.x - P.x, a.y - P.y) < Math.hypot(b.x - P.x, b.y - P.y) ? a : b);
          goal = [st.sticky.x, st.sticky.y]; if (Math.hypot(goal[0] - P.x, goal[1] - P.y) < 1.5) use = st.sticky;
        }
        if (!goal && foes.length) { const m = foes.reduce((a, b) => Math.hypot(a.x - P.x, a.y - P.y) < Math.hypot(b.x - P.x, b.y - P.y) ? a : b); goal = [m.x, m.y]; }
        if (use && use.use) use.use();
        if (near.length || use) { st.maxIdle = Math.max(st.maxIdle, st.idle); st.idle = 0; } else st.idle += dt;
        if (goal && Math.hypot(goal[0] - P.x, goal[1] - P.y) > 0.6) {
          if ((st.repath -= dt) <= 0 || !st.path?.length) { st.path = W.map.findPath(P.x, P.y, goal[0], goal[1], 60000, 0.28) || []; st.repath = 0.4; }
          while (st.path.length && Math.hypot(st.path[0][0] - P.x, st.path[0][1] - P.y) < 0.3) st.path.shift();
          if (st.path.length) { const [tx, ty] = st.path[0], d = Math.hypot(tx - P.x, ty - P.y), k = Math.min(1, dt * 4.5 / d); P.x += (tx - P.x) * k; P.y += (ty - P.y) * k; }
        }
      };
      for (const type of [...DF_GLADE_TYPES, 'heart']) {
        G.char.darkForestRuns = {};
        game.buildDungeon(11, biome);
        const W = G.world, P = G.player, run = W.overworldScenario;
        const g = generateDarkForest(11, biome, W.tileset, G.char.darkForestRuns[11].seed);
        // quiet the forest's own packs so the bot measures the trial
        for (const m of W.creatures) if (m.team === 'enemy') m.dead = true;
        W.portals = W.portals.filter((p) => p.type !== 'shrine');
        const glade = type === 'heart' ? { index: 'heart', center: g.heart.center, shrine: g.heart.shrine, sites: g.heart.sites, hideouts: [] } : { ...g.glades[0], type };
        const S = createDarkForestTrial(W, g, biome, glade, type, () => {});
        P.x = glade.shrine[0] + 0.5; P.y = glade.shrine[1] + 1;
        if (!W.map.walkable(P.x, P.y)) [P.x, P.y] = W.map.randomNear(glade.shrine[0], glade.shrine[1], 2);
        S.start();
        const st = { idle: 0, maxIdle: 0, repath: 0, path: null, sticky: null }; let t = 0;
        while (t < 420 && !S.completed && !S.failed) { t += dt; W.update(dt); S.update(dt); step(W, P, S, st); }
        st.maxIdle = Math.max(st.maxIdle, st.idle);
        const line = `${type} — ${S.title}: ${S.completed ? 'done' : S.failed ? 'FAILED' : 'STUCK (' + (S.progress() || '') + ')'} in ${t.toFixed(0)}s, longest wait ${st.maxIdle.toFixed(1)}s`;
        out.push(line);
        // the lost children are a long walk: waiting is the point there
        if (!S.completed || (st.maxIdle > 25 && type !== 'lostchildren')) bad.push(line);
        if (!S.completed && !S.failed) S.fail('test');
        void run;
      }
      return { out, bad };
    });
    console.log(play.out.join('\n'));
    for (const b of play.bad) errors.push('[trial] ' + b);

    // ------------------------------------------------ frame cost and screenshots in a live forest
    const live = await page.evaluate(async () => {
      const { G, game } = window.VELSCOUR;
      const { BIOME_BY_ID } = await import('/src/data/biomes.js');
      const { generateDarkForest } = await import('/src/world/darkforest.js');
      const biome = BIOME_BY_ID.dark_forest;
      G.char.darkForestRuns = {};
      game.buildDungeon(9, biome);
      const W = G.world, g = generateDarkForest(9, biome, W.tileset, G.char.darkForestRuns[9].seed);
      for (const m of W.creatures) if (m.team === 'enemy' && Math.hypot(m.x - g.start[0], m.y - g.start[1]) < 30) m.dead = true;
      window.__df = g;
      const frames = [];
      let last = performance.now();
      await new Promise((res) => { let n = 0; const f = () => { const t = performance.now(); frames.push(t - last); last = t; if (++n < 120) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
      frames.sort((a, b) => a - b);
      return { median: +frames[60].toFixed(1), p95: +frames[114].toFixed(1), hud: W.overworldScenario.hud, props: W.props.length, trees: g.trees.length, monsters: W.creatures.filter((m) => m.team === 'enemy' && !m.dead).length };
    });
    console.log('live forest', JSON.stringify(live));
    if (live.median > 40) errors.push('[perf] median frame ' + live.median + ' ms');

    if (SHOTS) {
      const go = async (name, js) => {
        await page.evaluate(js);
        await page.waitForTimeout(900);
        await shot('dark_forest_' + name);
      };
      const tp = (expr) => `(() => { const {G} = window.VELSCOUR, g = window.__df, P = G.player, p = ${expr}; const q = G.world.map.walkable(p[0], p[1]) ? p : G.world.map.randomNear(p[0], p[1], 3); P.x = q[0]; P.y = q[1]; })()`;
      await go('entry', tp('g.start'));
      await go('heart_gate', tp('[g.heart.gate[0], g.heart.gate[1] + 1.5]'));
      await go('heart', tp('[g.heart.center[0] + 1, g.heart.center[1] + 3.5]'));
      await go('labyrinth', tp('g.labyrinths[1].center'));
      await go('labyrinth_corridor', tp('[g.labyrinths[1].rect[0] + 2.5, g.labyrinths[1].rect[1] + 2.5]'));
      await go('landmark', tp('g.landmarks[0].at'));
      // the hero just behind a big tree: its canopy and trunk fade
      await go('canopy_fade', `(() => { const {G} = window.VELSCOUR, W = G.world, P = G.player;
        const t = W.map.treeCells.cells.flat().find((p) => !p.elder && Math.hypot(p.x - W.overworldScenario.trials[0].glade.center[0], p.y - W.overworldScenario.trials[0].glade.center[1]) < 12 && W.map.walkable(p.x - 1, p.y - 1));
        if (t) { P.x = t.x - 1; P.y = t.y - 1; } })()`);
      // every glade, with its trial running
      const n = await page.evaluate(() => window.VELSCOUR.G.world.overworldScenario.trials.length);
      for (let i = 0; i < n; i++) {
        await go('glade_' + i, `(() => { const {G} = window.VELSCOUR, run = G.world.overworldScenario, S = run.trials[${i}];
          for (const o of run.trials) if (o.active) o.fail('next shot');
          const P = G.player; P.x = S.glade.center[0] + 1.5; P.y = S.glade.center[1] + 2.5; S.start(); run.update(0.5); })()`);
      }
      await page.setViewportSize({ width: 844, height: 390 });
      await go('mobile', tp('[g.glades[0].center[0] - 3, g.glades[0].center[1] + 3]'));
    }
    // ------------------------------------------------ auto-play finds its way to the Heart and wins it
    if (process.argv[3] !== 'noauto') {
      await page.setViewportSize({ width: 1366, height: 860 });
      await page.evaluate(async () => {
        const { G, game } = window.VELSCOUR;
        const { BIOME_BY_ID } = await import('/src/data/biomes.js');
        const { Auto } = await import('/src/game/autoplay.js');
        G.char.darkForestRuns = {}; G.char.depth = 4; G.godMode = true;
        game.buildDungeon(4, BIOME_BY_ID.dark_forest);
        document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0;
        if (!Auto.on) Auto.toggle(true);
      });
      let res;
      for (let min = 1; min <= 30; min++) {
        res = await page.evaluate(async () => {
          const { G, game } = window.VELSCOUR, { Auto } = await import('/src/game/autoplay.js');
          const t0 = performance.now(), w0 = G.world; let sim = 0;
          while (sim < 60 && G.world === w0) {
            for (let i = 0; i < 15 && G.world === w0; i++) { G.dt = 1 / 30; G.time += G.dt; G.frame++; game.update(1 / 30); sim += 1 / 30; }
            await new Promise((r) => setTimeout(r, 0));
            if (performance.now() - t0 > 60000) break;
          }
          const run = w0.overworldScenario;
          return { left: G.world !== w0, glades: run.cleared, heart: run.heart.completed, status: Auto.status, at: [Math.round(G.player.x), Math.round(G.player.y)], heartAt: run.heart.glade.center.map(Math.round) };
        });
        console.log(`[auto ${min}m] glades ${res.glades}/5 heart ${res.heart} ${res.left ? 'LEFT THE FOREST' : ''} at ${res.at} (heart ${res.heartAt}) | ${res.status}`);
        if (res.left || res.heart && min > 1) break;
      }
      if (!res.heart) errors.push('[auto] auto-play did not win the Heart of the Forest in 30 game minutes');
      await shot('dark_forest_auto_end');
    }
  } catch (e) { errors.push('[dark_forest] ' + (e.stack || e)); }
  report(errors);
  await browser.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
