// Overworld scenarios played for real: a bot walks map paths to each objective (enemy, marker, capture zone, caravan),
// anything within reach dies, and every scenario must finish. Covers all 26 Forsaken Wilds scenarios, all 35 Castle
// scenarios (rampart and keep fights included) and a chained Sea of Sand route, where each next area must start on
// its own. Flags scenarios that stall, fail, or leave the hero with nothing to fight for too long. The Castle
// scenarios rotate through the castle variants (src/data/castles.js); name castles to play all 35 in each.
//   node tools/tests/scenarios.js [types|-] [castle ids|all]   (start the server first: python3 -m http.server 8123)
const { openGame, report } = require('./harness');

(async () => {
  const { browser, page, errors } = await openGame({ width: 1000, height: 640 });
  if (process.argv[2] && process.argv[2] !== '-') await page.evaluate((t) => { window.SCENARIO_ONLY = t.split(','); }, process.argv[2]); // node scenarios.js merchants,brew
  if (process.argv[3]) await page.evaluate((t) => { window.SCENARIO_CASTLES = t; }, process.argv[3]);
  const res = await page.evaluate(async () => {
    const { G, game } = window.VELSCOUR;
    await game.newChar('paladin', 'Scenario Bot');
    G.char.depth = 19; G.godMode = true;
    const { BIOME_BY_ID } = await import('/src/data/biomes.js');
    const { generateOverworld } = await import('/src/world/overworld.js');
    const { createOverworldScenario, SCENARIOS, WILD_SCENARIOS } = await import('/src/game/overworld.js');
    const { hit } = await import('/src/game/combat.js');
    const { castle3dTick } = await import('/src/game/castle3d.js');   // the drawbridge comes down as the bot nears it
    await (await import('/src/gfx/castle.js')).loadCastlePack();
    await (await import('/src/gfx/darkforest.js')).loadDarkForestTrees();
    await (await import('/src/gfx/seaofsand.js')).loadSeaOfSandPack();
    const castleIds = (await import('/src/data/castles.js')).CASTLE_VARIANTS.map((v) => v.id);
    const castles = window.SCENARIO_CASTLES === 'all' ? castleIds : window.SCENARIO_CASTLES ? window.SCENARIO_CASTLES.split(',') : null;
    const dt = 1 / 15, out = [], bad = [];
    // One bot step: kill what is in reach, pick the objective a player would head for, walk the map path to it.
    const step = (W, P, S, st) => {
      const foes = S.foes.filter((m) => !m.dead);
      for (const m of foes) if (Math.hypot(m.x - P.x, m.y - P.y) < 2.2) hit(P, m, 1e12, 'phys', { crit: false });
      let goal = null, use = null;
      if (S.type === 'escort' && S.escort) goal = [S.escort.x, S.escort.y];
      else if (S.type === 'zones' && S.route?.[S.stage] && !foes.some((m) => Math.hypot(m.x - S.route[S.stage][0], m.y - S.route[S.stage][1]) < 4.5)) goal = S.route[S.stage];
      if (!goal && S.markers.length) {
        if (!st.sticky || !S.markers.includes(st.sticky)) st.sticky = S.markers.reduce((a, b) => Math.hypot(a.x - P.x, a.y - P.y) < Math.hypot(b.x - P.x, b.y - P.y) ? a : b);
        goal = [st.sticky.x, st.sticky.y]; if (Math.hypot(goal[0] - P.x, goal[1] - P.y) < 1.5) use = st.sticky;
      }
      if (!goal && foes.length) { const m = foes.reduce((a, b) => Math.hypot(a.x - P.x, a.y - P.y) < Math.hypot(b.x - P.x, b.y - P.y) ? a : b); goal = [m.x, m.y]; }
      if (use) use.use();
      if (foes.some((m) => Math.hypot(m.x - P.x, m.y - P.y) < 9) || use) { st.maxIdle = Math.max(st.maxIdle, st.idle); st.idle = 0; } else st.idle += dt;
      if (goal && Math.hypot(goal[0] - P.x, goal[1] - P.y) > 1.2 && !(S.type === 'escort' && Math.hypot(goal[0] - P.x, goal[1] - P.y) < 3)) {
        if ((st.repath -= dt) <= 0 || !st.path?.length) {
          st.path = W.map.findPath(P.x, P.y, goal[0], goal[1], 40000, 0.28) || [];
          // the Castle's raised drawbridge stands between: walk up to it (it comes down) as auto-play would
          const D = W.map.drawbridge;
          if (!st.path.length && D && !D.down) st.path = W.map.findPath(P.x, P.y, (D.x0 + D.x1) / 2, D.y1 + 3, 40000, 0.28) || W.map.findPath(P.x, P.y, (D.x0 + D.x1) / 2, D.hinge - 3, 40000, 0.28) || [];
          st.repath = 0.5;
        }
        while (st.path.length && Math.hypot(st.path[0][0] - P.x, st.path[0][1] - P.y) < 0.3) st.path.shift();
        if (st.path.length) { const [tx, ty] = st.path[0], d = Math.hypot(tx - P.x, ty - P.y), k = Math.min(1, dt * 4.5 / d); P.x += (tx - P.x) * k; P.y += (ty - P.y) * k; }
      }
    };
    const only = window.SCENARIO_ONLY;
    const castleRuns = (castles || [null]).flatMap((c) => Array.from({ length: 35 }, (_, i) => [i, c || castleIds[i % castleIds.length]]));
    for (const [biomeId, ids, seed] of [['overworld', WILD_SCENARIOS.map((i) => [i, null]), 777], ['castle', castleRuns, 4242]]) {
      const biome = BIOME_BY_ID[biomeId];
      for (const [id, castle] of ids) {
        if (only && !only.includes(SCENARIOS[id][1])) continue;
        game.buildDungeon(19, biome);
        // the Castle places its shrine and sites by scenario (world/castleworld.js): use a seed that rolls this one
        const W = G.world, P = G.player, gen = generateOverworld(19, biome, biomeId === 'castle' ? ((35 * seed + id) ^ 19) >>> 0 : seed, castle);
        W.map = gen.map; W.creatures = W.creatures.filter((c) => c === P || c.team === 'player');
        W.portals = W.portals.slice(0, 2); W.npcs = []; W.overworldScenario = null; W.rebuildGrid?.();
        P.x = gen.shrine[0] + 1; P.y = gen.shrine[1] + 1;
        if (!W.map.walkable(P.x, P.y)) [P.x, P.y] = gen.shrine;
        const S = createOverworldScenario(W, { ...gen, scenarioId: id }, biome, () => {}); S.start();
        const st = { idle: 0, maxIdle: 0, repath: 0, path: null, sticky: null }; let t = 0;
        while (t < 360 && !S.completed && !S.failed) { t += dt; W.update(dt); S.update(dt); if (W.map.c3struct) castle3dTick(W, dt); step(W, P, S, st); }
        st.maxIdle = Math.max(st.maxIdle, st.idle);
        const line = `${biomeId}${castle ? ':' + castle : ''} ${id} ${SCENARIOS[id][0]} (${S.type}): ${S.completed ? 'done' : S.failed ? 'FAILED' : 'STUCK'} in ${t.toFixed(0)}s, longest wait ${st.maxIdle.toFixed(1)}s`;
        // a stall says what is left and whether the hero can walk to it
        const left = !S.completed && !S.failed ? ' left: ' + [...S.markers.map((m) => ['marker', m.x, m.y]), ...S.foes.filter((m) => !m.dead).map((m) => [m.arch || 'foe', m.x, m.y])]
          .map(([k, x, y]) => `${k}@${x.toFixed(1)},${y.toFixed(1)}${W.map.findPath(P.x, P.y, x, y, 60000, 0.28) ? '' : '(no path)'}`).slice(0, 8).join(' ') : '';
        out.push(line + left);
        if (!S.completed || st.maxIdle > 20) bad.push(line + left);
        if (!S.completed && !S.failed) S.fail('test');
      }
    }
    // Sea of Sand: each secured area must start the next one at once.
    for (let trial = 0; trial < 3; trial++) {
      G.char.seaOfSandRuns = {};
      game.buildDungeon(23 + trial, BIOME_BY_ID.sea_of_sand);
      const W = G.world, P = G.player, run = W.overworldScenario;
      run.current.start();
      const st = { idle: 0, maxIdle: 0, repath: 0, path: null, sticky: null }; let t = 0, beat = run.beat;
      while (t < 900 && !run.completed) {
        t += dt; W.update(dt); run.update(dt);
        const S = run.current; if (!S || S.failed) break;
        if (run.beat !== beat) { beat = run.beat; if (!S.active) bad.push(`sea of sand area ${beat + 1} did not start on its own`); }
        step(W, P, S, st);
      }
      const line = `sea_of_sand route ${trial}: ${run.total} areas, ${run.completed ? 'done' : 'NOT done'} in ${t.toFixed(0)}s` + (run.completed ? '' : ` (area ${run.beat + 1}: ${run.current?.title} ${run.current?.type}, ${run.current?.failed ? 'failed' : 'running'}, foes ${run.current?.foes.filter((m) => !m.dead).length}, markers ${run.current?.markers.length})`);
      out.push(line); if (!run.completed) bad.push(line);
    }
    return { out, bad };
  });
  console.log(res.out.join('\n'));
  if (res.bad.length) { console.log('PROBLEMS:\n' + res.bad.join('\n')); process.exitCode = 1; }
  report(errors);
  await browser.close();
})();
