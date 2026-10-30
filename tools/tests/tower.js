// THE SERPENTINE TOWER (docs/SERPENTINE_TOWER.md): the skull ("tower") reaches it and it is in the overworld draw;
// every variant generates and its stair is walkable end to end; the warp puts the hero where the 3D stair is and
// picking inverts it; the camera turns as he climbs; drops from the floor above, chargers from behind and grappling-
// hook climbers all arrive; the stairhead door leads to the roof; every scenario's waves, boats and airship arrive and
// its captain lands; the portal opens. Screenshots of each variant on the stair and the roof, then auto-play climbs.
//   node tools/tests/tower.js [variants e.g. 0,2] [scenarios e.g. 0-19|all] [noauto]   (server first: python -m http.server 8123)
// Windows with a GPU: CHROMIUM_ARGS="--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist" (SwiftShader is slow).
const { openGame, report } = require('./harness');
const range = (s, all) => !s || s === 'all' ? all : s === 'none' ? [] : s.includes('-') ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))(s.split('-').map(Number)) : s.split(',').map(Number);
const VARIANTS = range(process.argv[2], [0, 1, 2, 3, 4]);
const SCEN = range(process.argv[3], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
const AUTO = process.argv[4] !== 'noauto';

const step = (page, secs) => page.evaluate(async (secs) => {   // run the game for `secs` at 60 fps, rendering every 4th frame
  const { G, game } = window.VELSCOUR;
  for (let i = 0; i < secs * 60; i++) { G.time += 1 / 60; game.update(1 / 60); if (i % 4 === 3) game.render(); }
  game.render();
}, secs);

(async () => {
  const { browser, page, errors, shot } = await openGame({ width: 1366, height: 820 });
  try {
    await page.evaluate(async () => { await window.VELSCOUR.game.newChar('paladin', 'Climber'); const { G } = window.VELSCOUR; G.char.depth = 8; G.godMode = true; });
    // ------------------------------------------------ the skull and the draw
    await page.waitForTimeout(300);
    await page.click('#velscour-skull');
    await page.fill('#velscour-message', 'tower');
    await page.click('.velscour-contact-dialog button:has-text("Send")');
    await page.waitForFunction(() => window.VELSCOUR.G.world?.biome?.id === 'serpentine_tower' && document.querySelector('#loading').classList.contains('hidden'), null, { timeout: 60000 });
    const draw = await page.evaluate(async () => {
      const { drawBiome, OVERWORLD_BIOME_IDS } = await import('/src/data/biomes.js');
      const c = { biomeBag: [], overworldMisses: 0 }; let n = 0;
      for (let i = 0; i < 4000; i++) { c.overworldMisses = i % 4; const id = drawBiome(c, 10 + (i % 30)); if (id === 'serpentine_tower') n++; c.lastBiome = id; }
      return { drawn: n, overworld: OVERWORLD_BIOME_IDS.includes('serpentine_tower') };
    });
    console.log('draw', JSON.stringify(draw));
    if (!draw.drawn || !draw.overworld) errors.push('[draw] the tower is not in the rotation');

    // ------------------------------------------------ every variant: generation, warp, picking, the climb's arrivals
    for (const vi of VARIANTS) {
      await page.evaluate(async (vi) => {
        const { G, game } = window.VELSCOUR, { BIOME_BY_ID } = await import('/src/data/biomes.js');
        G.towerVariant = vi; G.towerScenario = 0;
        await game.teleportToBiome(BIOME_BY_ID.serpentine_tower);
      }, vi);
      await page.waitForFunction(() => window.VELSCOUR.G.world?.tower && document.querySelector('#loading').classList.contains('hidden'), null, { timeout: 60000 });
      await page.waitForTimeout(600);
      const info = await page.evaluate(async () => {
        const { G } = window.VELSCOUR, w = G.world, tw = w.tower, g = tw.g, m = w.map, bad = [];
        const { camera } = await import('/src/core/view.js');
        // the stair end to end, the roof a disk
        const W = m.w, seen = new Uint8Array(W * m.h), q = [Math.floor(w.player.y) * W + Math.floor(w.player.x)]; seen[q[0]] = 1;
        for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = (y + dy) * W + x + dx; if (!seen[j] && m.walkableTile(x + dx, y + dy)) { seen[j] = 1; q.push(j); } } }
        if (!seen[Math.floor(g.door[1]) * W + Math.floor(g.door[0])]) bad.push('the stairhead door is not reachable from the foot');
        // picking inverts the warp round the hero
        let worst = 0;
        for (let i = 0; i < 40; i++) {
          const x = w.player.x + (Math.random() - 0.5) * 10, y = g.YR + 0.5 + Math.random() * (g.w - 1);
          const wx = tw.raw(x, y, [0, 0], false), [px, py] = tw.pick(wx[0], wx[1]);
          worst = Math.max(worst, Math.hypot(px - x, py - y));
        }
        if (worst > 0.05) bad.push('picking misses by ' + worst.toFixed(3));
        return { bad, v: tw.v.id, L: g.L, turns: g.v.turns, mobs: w.creatures.length, droppers: w.creatures.filter((c) => c.towerDrop).length, alpha: tw.alpha, cam: [camera.x, camera.y] };
      });
      console.log('variant', vi, JSON.stringify(info));
      for (const b of info.bad) errors.push(`[variant ${vi}] ${b}`);
      await step(page, 0.5); await shot(`tower_${vi}_foot`);
      // up the stair: a turn and a half, then three quarters of the way
      for (const f of [0.35, 0.72]) {
        const a = await page.evaluate((f) => {
          const { G } = window.VELSCOUR, w = G.world, g = w.tower.g, p = w.player;
          p.x = g.X1 - g.L * f; p.y = g.YR + g.w / 2; p.path = null; p.moveTarget = null;
          for (const c of w.creatures) if (c !== p && c.team === 'enemy' && Math.abs(c.x - p.x) < 12) { c.x += 30; }
          return w.tower.alpha;
        }, f);
        await step(page, 1.2);
        await shot(`tower_${vi}_stair_${Math.round(f * 100)}`);
      }
      // the climb's arrivals: a drop from the floor above, hooks over the railing, chargers from behind
      const arr = await page.evaluate(async () => {
        const { G } = window.VELSCOUR, w = G.world, g = w.tower.g, p = w.player, run = w.overworldScenario;
        const pack = w.creatures.find((c) => c.team === 'enemy' && !c.awake && g.s(c.x) > g.s(p.x) + g.C * 0.9 && g.s(c.x) < g.s(p.x) + g.C * 1.6);
        if (pack) { pack.towerDrop = true; p.x = pack.x + g.C + 1; }
        run.hookT = 0; run.chargeT = 0; run.dropCd = 0;
        return { pack: !!pack };
      });
      await step(page, 0.9); await shot(`tower_${vi}_drop`);
      await step(page, 1.0); await shot(`tower_${vi}_hooks`);
      const landed = await page.evaluate(() => {
        const { G } = window.VELSCOUR, w = G.world;
        return { entering: w.creatures.filter((c) => c.entering).length, ropes: w.tower.ropes.length, awake: w.creatures.filter((c) => c.team === 'enemy' && c.awake).length };
      });
      console.log('  arrivals', JSON.stringify({ ...arr, ...landed }));
      // the stairhead
      await page.evaluate(() => { const { G } = window.VELSCOUR, w = G.world, g = w.tower.g, p = w.player; for (const c of w.creatures) if (c !== p && c.team === 'enemy') c.hp = 0, c.dead = true; p.x = g.XT + 5; p.y = g.door[1]; });
      await step(page, 0.6); await shot(`tower_${vi}_stairhead`);
      await page.evaluate(() => { const { G } = window.VELSCOUR, w = G.world, g = w.tower.g, p = w.player; p.x = g.XT + 1.5; });
      await step(page, 0.5);
      const top = await page.evaluate(() => { const { G } = window.VELSCOUR, w = G.world; return { roof: w.tower.roof, phase: w.overworldScenario.phase, x: w.player.x, y: w.player.y }; });
      if (!top.roof) errors.push(`[variant ${vi}] the stairhead did not lead to the roof`);
      await step(page, 4); await shot(`tower_${vi}_roof`);
    }

    // ------------------------------------------------ scenarios: waves, boats, the airship and its captain, the portal
    for (const si of SCEN) {
      await page.evaluate(async (si) => {
        const { G, game } = window.VELSCOUR, { BIOME_BY_ID } = await import('/src/data/biomes.js');
        G.towerVariant = si % 5; G.towerScenario = si;
        await game.teleportToBiome(BIOME_BY_ID.serpentine_tower);
      }, si);
      await page.waitForFunction(() => window.VELSCOUR.G.world?.tower && document.querySelector('#loading').classList.contains('hidden'), null, { timeout: 60000 });
      await page.evaluate(async () => {
        const { G } = window.VELSCOUR, w = G.world, g = w.tower.g, p = w.player;
        const { airshipsReady } = await import('/src/gfx/tower3d.js');
        for (let i = 0; i < 100 && !airshipsReady(); i++) await new Promise((r) => setTimeout(r, 100));
        for (const c of w.creatures) if (c !== p && c.team === 'enemy') c.dead = true;
        p.x = g.XT + 1.5; p.y = g.door[1];
      });
      // run the roof until cond holds (or secs pass); kill: strike down whatever has landed every half second
      const until = (cond, secs, kill) => page.evaluate(async ([cond, secs, kill]) => {
        const { G, game } = window.VELSCOUR, w = G.world, run = w.overworldScenario, f = new Function('w', 'run', 'return ' + cond);
        const { kill: slay } = await import('/src/game/combat.js');
        for (let i = 0; i < secs * 60 && !f(w, run); i++) {
          G.time += 1 / 60; game.update(1 / 60);
          (run.steps ||= new Set()).add(run.top?.step);
          if (kill && i % 30 === 0) for (const c of [...w.creatures]) if (c.team === 'enemy' && !c.dead && !c.entering && c.targetable !== false) slay(c, G.player);
          if (i % 8 === 0) game.render();
        }
        game.render();
        return f(w, run);
      }, [cond, secs, kill]);
      const tag = `tower_scn${String(si).padStart(2, '0')}`;
      await until('run.phase === "top" && run.top.step === "wave1"', 10, false);
      // roofs without boats (teleports, drops, climbs) reach the flagship well inside the minute: stop when it sails
      const boat = 'run.top.ships.some((s) => s.state === "docked" && s.ramp >= 1)';
      await until(boat + ' || run.top.sailed', 60, true);
      if (await until(boat, 0, false)) { await until('false', 1.2, false); await shot(tag + '_boarding'); }
      // the flagship sails during wave 3, so it is often moored before the roof is clear (the ship step is then one frame)
      if (await until('run.top.flag && run.top.flag.state === "docked"', 300, true)) await shot(tag + '_airship');
      await until('run.top.step === "final" || run.completed', 300, true);   // the rest of wave 3 (the captain is still boarding)
      if (await until('run.top.final && !run.top.final.entering', 40, false)) await shot(tag + '_captain');
      await until('run.completed', 300, true);
      await until('false', 2.5, false); await shot(tag + '_portal');
      const res = await page.evaluate(() => {
        const { G } = window.VELSCOUR, w = G.world, run = w.overworldScenario, exit = w.portals.find((q) => q.type === 'exit');
        return { done: run.completed, steps: [...(run.steps || [])], exit: exit && [+exit.x.toFixed(1), +exit.y.toFixed(1), exit.active], captain: run.captain, scenario: run.scenario.id,
          final: run.top?.final && { name: run.top.final.name, dead: run.top.final.dead } };
      });
      console.log('scenario', si, JSON.stringify(res));
      if (!res.done) errors.push(`[scenario ${si}] never finished: ${res.steps.join(',')}`);
      if (!res.exit || !res.exit[2]) errors.push(`[scenario ${si}] no open portal`);
    }
    // ------------------------------------------------ auto-play climbs the tower and takes the roof (god mode: this is about the way, not the odds)
    if (AUTO) {
      await page.evaluate(async () => {
        const { G, game } = window.VELSCOUR, { BIOME_BY_ID } = await import('/src/data/biomes.js'), { Auto } = await import('/src/game/autoplay.js');
        G.towerVariant = null; G.towerScenario = null; G.char.depth = 3; G.godMode = true;
        if (G.world) G.world.depth = 3;   // the skull keeps the current depth: a level-1 hero should face depth 3
        await game.teleportToBiome(BIOME_BY_ID.serpentine_tower);
        Auto.toggle(true);
      });
      await page.waitForFunction(() => window.VELSCOUR.G.world?.tower && document.querySelector('#loading').classList.contains('hidden'), null, { timeout: 60000 });
      let last = null;
      for (let min = 1; min <= 20; min++) {
        const r = await page.evaluate(async () => {
          const { G, game } = window.VELSCOUR, { Auto } = await import('/src/game/autoplay.js'), w = G.world, run = w.overworldScenario;
          for (let i = 0; i < 1800 && !run.completed; i++) { G.dt = 1 / 30; G.time += G.dt; G.frame++; game.update(1 / 30); if (i % 300 === 0) await new Promise((r) => setTimeout(r, 0)); }
          game.render();
          const p = G.player;
          return { phase: run.phase, alt: run.altitude, step: run.top?.step, wave: run.wave, done: run.completed, x: +p.x.toFixed(1), y: +p.y.toFixed(1), status: Auto.status, kills: w.kills, v: w.tower.v.id, sc: run.scenario.id };
        });
        console.log(`[auto ${min}m] ${r.v}/${r.sc} ${r.phase} alt=${r.alt}% step=${r.step || '-'} wave=${r.wave} kills=${r.kills} at ${r.x},${r.y} | ${r.status}`);
        if (r.phase !== (last && last.phase) || min % 4 === 0) await shot(`tower_auto_m${min}`);
        last = r;
        if (r.done) break;
      }
      if (!last.done) errors.push(`[auto] auto-play did not take the tower: ${JSON.stringify(last)}`);
      else {
        const left = await page.evaluate(async () => {
          const { G, game } = window.VELSCOUR, w = G.world;
          for (let i = 0; i < 1800 && G.world === w; i++) { G.dt = 1 / 30; G.time += G.dt; G.frame++; game.update(1 / 30); if (i % 300 === 0) await new Promise((r) => setTimeout(r, 0)); }
          return G.world !== w || !!document.querySelector('.dialog-box');
        });
        if (!left) errors.push('[auto] auto-play never used the roof portal');
      }
    }
  } catch (e) { errors.push('[test] ' + e.stack); }
  report(errors);
  await browser.close();
})();
