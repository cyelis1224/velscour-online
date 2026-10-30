// Auto-play in each castle variant (src/data/castles.js): from the road it must find its way to the shrine, through the
// drawbridge (raised until the hero walks up to it) when the shrine is inside, and start the scenario; then it plays on.
// A level 30 hero on a cleared level: a level-1 one spends the whole run fighting its way up the road.
//   node tools/tests/castle_variants.js [ids|all] [seconds]
const { openGame, report } = require('./harness');
const arg = process.argv[2] || 'all', secs = +process.argv[3] || 300;
(async () => {
  const { browser, page, errors } = await openGame({ width: 1000, height: 640 });
  try {
    const ids = await page.evaluate(async (arg) => {
      const { CASTLE_VARIANTS } = await import('/src/data/castles.js');
      const { G } = window.VELSCOUR, { Auto } = await import('/src/game/autoplay.js'), { xpToNext } = await import('/src/game/player.js');
      await window.VELSCOUR.game.newChar('paladin', 'Castle Autobot');
      document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll();
      const c = G.char;
      c.level = 30; c.xp = Math.round(xpToNext(30) * 0.3); c.statPoints += 29 * 5; c.skillPoints += 40;
      Auto.spendStats(); Auto.spendSkills(); Auto.arrangeBar(); G.player.recompute();
      return arg === 'all' ? CASTLE_VARIANTS.map((v) => v.id) : arg.split(',');
    }, arg);
    for (const id of ids) {
      const r = await page.evaluate(async ([id, secs]) => {
        const { G, game } = window.VELSCOUR;
        const { Auto } = await import('/src/game/autoplay.js');
        const { BIOME_BY_ID } = await import('/src/data/biomes.js');
        await (await import('/src/gfx/castle.js')).loadCastlePack();
        await (await import('/src/gfx/castle3dart.js')).loadCastle3D(id);
        G.char.depth = 12; G.godMode = true; G.castleVariant = id;
        game.buildDungeon(12, BIOME_BY_ID.castle);
        G.castleVariant = undefined;
        Auto.toggle(true);
        const w = G.world, D = w.map.drawbridge, S = w.overworldScenario;
        w.creatures = w.creatures.filter((c) => c === G.player || c.team === 'player'); w.rebuildGrid?.();
        let t = 0, down = -1, started = -1;
        while (t < secs && G.world === w) {
          for (let i = 0; i < 30; i++) { G.dt = 1 / 30; G.time += G.dt; G.frame++; game.update(1 / 30); t += 1 / 30; }
          if (down < 0 && D.down) down = t;
          if (started < 0 && (S.active || S.completed)) started = t;
          if (started >= 0 && t > started + 20) break;
          await new Promise((res) => setTimeout(res, 0));
        }
        Auto.toggle(false);
        return { id, scenario: S.title, type: S.type, down: +down.toFixed(1), started: +started.toFixed(1), completed: S.completed, t: +t.toFixed(0), hero: [+G.player.x.toFixed(1), +G.player.y.toFixed(1)], status: Auto.status };
      }, [id, secs]);
      console.log(JSON.stringify(r));
      if (r.started < 0) errors.push(`[castle variants ${id}] auto-play never started the scenario (${r.type}); hero at ${r.hero}, ${r.status}`);
    }
  } catch (e) { errors.push('[castle variants] ' + (e.stack || e)); }
  report(errors);
  await browser.close();
})();
