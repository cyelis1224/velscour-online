// The Sea of Sand's dune variants live (src/data/dunes.js, world/dunes.js, gfx/dunes3d.js, game/dunes.js): each variant
// built through Velscour's skull path, its 3D scenes up, picking on the dunes; a camp's fight starts; the pyramid seen
// from its plaza; the door opens once the camps are won and the party goes in; a tomb room's fight starts and its slab
// sinks when it is won; the burial chamber's master rises, falls, and the portal opens. Shots per stage. 'auto': then
// auto-play takes the first variant's whole level, waystones to portal ('noflow' skips the staged checks).
//   node tools/tests/dunes.js [ids|all] [mobile] [auto] [noflow]
const { openGame, report } = require('./harness');
const arg = process.argv[2] || 'all', mobile = process.argv.includes('mobile'), AUTO = process.argv.includes('auto'), FLOW = !process.argv.includes('noflow');
(async () => {
  const { browser, page, errors, shot } = await openGame(mobile ? { width: 844, height: 390, mobile: true } : { width: 1280, height: 720 });
  try {
    const ids = await page.evaluate(async (arg) => {
      const { DUNE_VARIANTS } = await import('/src/data/dunes.js');
      const { G, game } = window.VELSCOUR;
      await game.newChar('paladin', 'Dune QA');
      document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll();
      return arg === 'all' ? DUNE_VARIANTS.map((v) => v.id) : arg.split(',');
    }, arg);
    const pre = mobile ? 'dunes_mobile_' : 'dunes_';
    const step = (secs) => page.evaluate(async (secs) => {   // the game run forward by hand (30 steps a second)
      const { G, game } = window.VELSCOUR;
      for (let i = 0; i < secs * 30; i++) { G.dt = 1 / 30; G.time += G.dt; G.frame++; game.update(1 / 30); if (i % 30 === 29) await new Promise((r) => setTimeout(r, 0)); }
    }, secs);
    const view = (x, y, zoom) => page.evaluate(async ([x, y, zoom]) => {
      const { G } = window.VELSCOUR, { camera } = await import('/src/core/view.js');
      G.player.x = x; G.player.y = y; G.player.path = null;
      if (zoom) { G.settings.zoom = 1; camera.computeZoom(); G.settings.zoom = zoom / camera.zoom; camera.computeZoom(); }
      camera.follow(x, y, 0, true);
    }, [x, y, zoom]);
    for (const id of FLOW ? ids : []) {
      const info = await page.evaluate(async (id) => {
        const { G, game } = window.VELSCOUR, { DUNE_VARIANTS } = await import('/src/data/dunes.js'), { BIOME_BY_ID } = await import('/src/data/biomes.js');
        G.char.depth = 12; G.godMode = true; G.settings.zoom = 1;
        G.sandVariant = 1 + DUNE_VARIANTS.findIndex((v) => v.id === id);
        await game.teleportToBiome(BIOME_BY_ID.sea_of_sand);
        G.sandVariant = undefined;
        const { dunesScene } = await import('/src/gfx/dunes3d.js');
        for (let t = 0; t < 200 && !dunesScene(); t++) await new Promise((r) => setTimeout(r, 50));
        const w = G.world, run = w.overworldScenario, dv = w.cave && w.cave.dv;
        w.creatures = w.creatures.filter((c) => c === G.player || c.team === 'player'); w.rebuildGrid();
        // picking: the tile under the hero's screen point comes back as the hero's own
        const { isoX, isoY } = await import('/src/core/view.js'), p = G.player;
        const pk = w.cave.pick(isoX(p.x, p.y), isoY(p.x, p.y));
        return { built: dv ? dv.v.id : null, scene: !!dunesScene(), camps: run.camps.length, rooms: run.rooms.filter((e) => e.kind).length, type: run.type, pickErr: +Math.hypot(pk[0] - p.x, pk[1] - p.y).toFixed(2),
          camp: [run.camps[0].x, run.camps[0].y], plaza: dv.pyramid.plazaC, start: dv.start, title: run.title, size: dv.E };
      }, id);
      console.log(id, JSON.stringify(info));
      if (info.built !== id) { errors.push(`[dunes ${id}] built ${info.built}`); continue; }
      if (!info.scene) errors.push(`[dunes ${id}] the 3D scenes did not build`);
      if (info.pickErr > 0.6) errors.push(`[dunes ${id}] picking is off by ${info.pickErr} tiles`);
      await view(info.start[0], info.start[1], 0.9); await page.waitForTimeout(600); await shot(pre + id + '_arrive');
      // a camp's fight
      await view(info.camp[0], info.camp[1] + 2); await step(2);
      const camp = await page.evaluate(() => { const r = window.VELSCOUR.G.world.overworldScenario; return { state: r.camps[0].state, foes: r.camps[0].foes.length + r.camps[0].objs.length + r.camps[0].marks.length, hud: r.hud }; });
      if (camp.state !== 'active') errors.push(`[dunes ${id}] the first camp's fight did not start: ${JSON.stringify(camp)}`);
      await page.waitForTimeout(500); await shot(pre + id + '_camp');
      // the pyramid from the plaza, then its door once the camps are won
      await view(info.plaza[0], info.plaza[1] + 8, 0.55); await page.waitForTimeout(700); await shot(pre + id + '_pyramid');
      await page.evaluate(() => { const { G } = window.VELSCOUR, r = G.world.overworldScenario; G.world.creatures = G.world.creatures.filter((c) => c === G.player || c.team === 'player'); G.world.rebuildGrid(); for (const e of r.camps) e.state = 'done'; });
      await step(3.5);
      const door = await page.evaluate(() => { const { G } = window.VELSCOUR, r = G.world.overworldScenario; return { phase: r.phase, open: r.doorOpen }; });
      if (door.phase !== 'door') errors.push(`[dunes ${id}] the door did not open when the camps were won: ${JSON.stringify(door)}`);
      await page.waitForTimeout(400); await shot(pre + id + '_door');
      // in: the fade to the tomb's entrance hall
      const ds = await page.evaluate(() => window.VELSCOUR.G.world.cave.dv.pyramid.doorStep);
      await view(ds[0], ds[1], 1); await step(2);
      const inside = await page.evaluate(() => { const { G } = window.VELSCOUR, w = G.world; return { phase: w.overworldScenario.phase, inside: w.cave.inside, x: G.player.x, y: G.player.y, dark: w.darkK }; });
      if (inside.phase !== 'tomb' || !inside.inside) errors.push(`[dunes ${id}] the party did not go into the tomb: ${JSON.stringify(inside)}`);
      await page.waitForTimeout(500); await shot(pre + id + '_tomb');
      // a room's fight, won: its slab sinks
      const room = await page.evaluate(() => { const r = window.VELSCOUR.G.world.overworldScenario, e = r.rooms.find((q) => q.kind); return { x: e.x, y: e.y, kind: e.kind }; });
      await view(room.x, room.y); await step(1.5);
      await page.waitForTimeout(400); await shot(pre + id + '_room');
      const rs = await page.evaluate(async () => {
        const { G } = window.VELSCOUR, r = G.world.overworldScenario, e = r.rooms.find((q) => q.kind), { hit } = await import('/src/game/combat.js');
        const was = e.state;
        for (let n = 0; n < 40 && e.state === 'active'; n++) {
          for (const m of [...e.foes, ...e.objs]) { if (!m.dead) { m.targetable = true; m.static = false; m.dormant = false; m.entering = null; hit(null, m, m.maxHp * 10, 'phys', { force: true }); } }
          for (const mk of e.marks) mk.done = true;
          if (e.limit) e.t = e.limit + 1;
          for (let i = 0; i < 30; i++) { G.dt = 1 / 30; G.time += G.dt; G.world.update(1 / 30); r.update(1 / 30); }
          await new Promise((res) => setTimeout(res, 0));
        }
        return { was, now: e.state, kind: e.kind };
      });
      if (rs.was !== 'active' || rs.now !== 'done') errors.push(`[dunes ${id}] the room fight (${rs.kind}) did not start and end: ${JSON.stringify(rs)}`);
      // the burial chamber: its master rises; killed, the portal opens
      const ch = await page.evaluate(async () => {
        const { G } = window.VELSCOUR, w = G.world, r = w.overworldScenario, dv = w.cave.dv, { hit } = await import('/src/game/combat.js');
        for (const e of r.rooms) if (e.state !== 'done') { e.state = 'done'; for (const m of [...e.foes, ...e.objs]) m.dead = true; }
        for (const s of dv.seals) for (const i of s.tiles) w.map.block[i] = 0;
        G.player.x = dv.chamber.cx + 0.5; G.player.y = dv.chamber.cy + 6;
        for (let i = 0; i < 30 * 5; i++) { G.dt = 1 / 30; G.time += G.dt; w.update(1 / 30); r.update(1 / 30); if (i % 30 === 0) await new Promise((res) => setTimeout(res, 0)); }
        const b = r.top && r.top.boss;
        const out = { phase: r.phase, boss: b ? b.name : null, art: b ? b.art : null };
        if (b) { for (let k = 0; k < 20 && !b.dead; k++) { b.targetable = true; b.entering = null; hit(null, b, b.maxHp * 2, 'phys', { force: true }); for (let i = 0; i < 10; i++) w.update(1 / 30); } }
        for (let i = 0; i < 30 * 5; i++) { G.dt = 1 / 30; G.time += G.dt; w.update(1 / 30); r.update(1 / 30); }
        const ex = w.portals.find((q) => q.type === 'exit');
        out.completed = r.completed; out.portal = ex ? [+ex.x.toFixed(1), +ex.y.toFixed(1), ex.active] : null; out.walk = ex ? w.map.walkable(ex.x, ex.y) : false;
        return out;
      });
      console.log('  chamber', JSON.stringify(ch));
      if (!ch.boss) errors.push(`[dunes ${id}] no master rose in the burial chamber: ${JSON.stringify(ch)}`);
      if (!ch.completed || !ch.portal || !ch.portal[2] || !ch.walk) errors.push(`[dunes ${id}] the portal did not open in the burial chamber: ${JSON.stringify(ch)}`);
      const chs = await page.evaluate(() => window.VELSCOUR.G.world.cave.dv.chamber);
      await view(chs.cx + 0.5, chs.cy + 5, 0.75); await page.waitForTimeout(600); await shot(pre + id + '_chamber');
    }
    // ------------------------------------------------ auto-play takes a whole level: the waystones, the door, the tomb, its master
    if (AUTO) {
      const res = await page.evaluate(async (id) => {
        const { G, game } = window.VELSCOUR, { DUNE_VARIANTS } = await import('/src/data/dunes.js'), { BIOME_BY_ID } = await import('/src/data/biomes.js');
        const { Auto } = await import('/src/game/autoplay.js');
        await game.newChar('paladin', 'Dune Walker');   // as in caverns.js: a level-1 paladin at depth 3, never dying
        document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll();
        G.char.depth = 3; G.godMode = true; if (G.world) G.world.depth = 3;
        G.sandVariant = 1 + DUNE_VARIANTS.findIndex((v) => v.id === id);
        await game.teleportToBiome(BIOME_BY_ID.sea_of_sand); G.sandVariant = undefined;
        const w = G.world, run = w.overworldScenario, t0 = performance.now(), log = [];
        if (!run || run.type !== 'dunes') return { log: ['not a dune level'], done: false };
        Auto.toggle(true);
        let last = '';
        for (let s = 0; s < 60 * 90 && G.world === w; s++) {   // up to 90 game minutes
          for (let i = 0; i < 60; i++) { G.time += 1 / 60; game.update(1 / 60); }
          const ph = `${run.phase} camps ${run.campsDone}/${run.camps.length} rooms ${run.roomsDone}/${run.rooms.filter((e) => e.kind).length}` + (run.completed ? ' done' : '');
          if (ph !== last) { log.push(`${(s / 60).toFixed(1)} min: ${ph}`); last = ph; }
          else if (s % 180 === 179) { const c = run.current, o = run.objective; log.push(`  ${(s / 60).toFixed(1)} min at ${G.player.x.toFixed(0)},${G.player.y.toFixed(0)} '${Auto.status}'${c ? ' in ' + c.kind + ' (' + c.state + ')' : ''}${o ? ' -> ' + o.x.toFixed(0) + ',' + o.y.toFixed(0) : ''}`); }
          if (run.completed) break;
          if (s % 30 === 29) await new Promise((r) => setTimeout(r, 0));
        }
        Auto.toggle(false);
        return { log, done: run.completed, phase: run.phase, hero: [+G.player.x.toFixed(1), +G.player.y.toFixed(1)], status: Auto.status, ms: Math.round(performance.now() - t0) };
      }, ids[0]);
      console.log('auto-play', ids[0], JSON.stringify(res, null, 1));
      if (!res.done) errors.push(`[dunes auto-play] did not take ${ids[0]} (phase ${res.phase})`);
      await page.waitForTimeout(500); await shot(pre + ids[0] + '_auto');
    }
  } catch (e) { errors.push('[dunes] ' + (e.stack || e)); }
  report(errors);
  await browser.close();
})();
