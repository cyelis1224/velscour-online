// The 3D Castle (docs/CASTLE_3D.md) in the game, for any castle variant (src/data/castles.js): the hero on the
// wall-walk, on a stair, in the gate tunnel, in the throne room (the keep's roof lifted), outside the keep, at the
// drawbridge, and an overview; walkability checks on the way.
//   node tools/tests/castle3d.js [view,view,...] [--castle=id,id|all]
// Screenshots: tools/tests/out/castle3d_[<id>_]<view>.png (the first castle keeps the old names).
const { openGame, report } = require('./harness');
const castleArg = (process.argv.find((a) => a.startsWith('--castle=')) || '').slice(9);
const only = (process.argv.slice(2).find((a) => !a.startsWith('--')) || '').split(',').filter(Boolean);
(async () => {
  const { browser, page, errors, shot } = await openGame({ width: 1440, height: 900 });
  try {
    const ids = await page.evaluate(async (arg) => {
      const { CASTLE_VARIANTS } = await import('/src/data/castles.js');
      return arg === 'all' ? CASTLE_VARIANTS.map((v) => v.id) : arg ? arg.split(',') : [CASTLE_VARIANTS[0].id];
    }, castleArg);
    await page.evaluate(async () => { await window.VELSCOUR.game.newChar('paladin', 'Castle 3D QA'); });
    // every story line wraps into its teller's three-line bubble at the real font (townspeech.js: 196 px less 24)
    const over = await page.evaluate(async () => {
      const { CASTLE_VARIANTS } = await import('/src/data/castles.js');
      await document.fonts.load('600 11px "Alegreya Sans"');
      const ctx = document.createElement('canvas').getContext('2d'); ctx.font = '600 11px "Alegreya Sans", "Segoe UI", sans-serif';
      const rows = (t) => { let n = 1, line = ''; for (const w of t.split(/\s+/)) { const next = line ? line + ' ' + w : w; if (line && ctx.measureText(next).width > 196 - 24) { n++; line = w; } else line = next; } return n; };
      return CASTLE_VARIANTS.flatMap((v) => ['herald', 'lord'].flatMap((k) => v.story[k].lines.filter((l) => rows(l) > 3).map((l) => `${v.id} ${k}: ${l}`)));
    });
    if (over.length) errors.push('[castle3d] story lines too long for a three-line bubble: ' + over.join(' / '));
    for (const id of ids) {
      const info = await page.evaluate(async (id) => {
        const { G, game } = window.VELSCOUR;
        await (await import('/src/gfx/castle.js')).loadCastlePack();
        await (await import('/src/gfx/castle3dart.js')).loadCastle3D(id);
        G.char.depth = 19; G.godMode = true; G.castleVariant = id;
        const { BIOME_BY_ID } = await import('/src/data/biomes.js');
        game.buildDungeon(19, BIOME_BY_ID.castle);
        G.castleVariant = undefined;
        // the story's herald by the road speaks up when the hero walks up to them (game/castlestory.js)
        const tellers = G.world.npcs.filter((n) => n.storyLines), herald = tellers[0];
        if (herald) { G.player.x = herald.x + 1.2; G.player.y = herald.y + 1.2; for (let k = 0; k < 10; k++) G.world.update(0.05); }
        const story = { tellers: tellers.length, said: herald?.talkText || '', lines: herald?.bubbleLines };
        G.world.creatures = G.world.creatures.filter((c) => c === G.player); G.world.npcs.length = 0; G.world.rebuildGrid();
        const m = G.world.map, L = (await import('/src/world/castle3d.js')).castle3d(id), R0 = L.rings[0], RI = L.rings[L.rings.length - 1], D = m.drawbridge;
        const st = (await import('/src/gfx/castle3dart.js')).castle3dState(id);
        const gx = (D.x0 + D.x1) / 2, s0 = L.stairs[0], top = s0.steps[s0.steps.length - 1], mid = s0.steps[s0.steps.length >> 1];
        const walk = [gx + 12.5, R0.Y1 - 1.5], throne = m.castleRooms.find((r) => r.id === 'throne_hall').rect, cath = m.castleRooms.find((r) => r.id === 'cathedral').rect;
        const door = m.castleDoors.find((d) => d.kind === 'door' && d.bld === 1);
        const at = (x, y) => m.hgt[m.tileIdx(x, y)];
        const p = (a, b) => { const r = m.findPath(a[0], a[1], b[0], b[1]); return r ? r.length : -1; };
        const tc = [(throne[0] + throne[2]) / 2 + 0.5, (throne[1] + throne[3]) / 2 + 2.5];
        return {
          variant: m.castleVariant, keepOff: [L.keep[0] - 130, L.keep[1] - 103], pieces: !!st, story, hgt: !!m.hgt, deck: m.rampartDeck.reduce((a, b) => a + b, 0), posts: m.rampartPosts.length, doors: m.castleDoors.length,
          wall: p([gx + 0.5, R0.Y1 - 12], [top[0] + 0.5, top[1] + (s0.dir === '+x' || s0.dir === '-x' ? 2.5 : 0.5)]), throne: p([door.x, door.y + 2], tc), walkLv: at(...walk), lv: R0.lv,
          views: [
            ['walltop', ...walk, 1.0], ['stair', mid[0] + 0.5, mid[1] + 0.5, 1.1], ['tunnel', gx - 0.4, R0.Y1 - 1.5, 1.1], ['throne', ...tc, 0.9],
            ['keep_front', m.castleKeep.x, L.keep[3] + 7.5, 0.8], ['gate_front', gx, D.hinge + 10, 0.8], ['inner_walk', (RI.X0 + RI.X1) / 2, RI.Y1 - 1.5, 1.0],
            ['cathedral_in', (cath[0] + cath[2]) / 2, (cath[1] + cath[3]) / 2, 0.85], ['door_open', door.x, door.y + 0.2, 1.1],
            ['drawbridge_up', gx, D.hinge + 18, 0.9], ['drawbridge_down', gx, D.hinge + 9.5, 0.9], ['overview', (R0.X0 + R0.X1) / 2, (R0.Y0 + R0.Y1) / 2, 0.24],
          ],
        };
      }, id);
      const { views, keepOff, ...rest } = info;
      console.log('castle', id, JSON.stringify(rest));
      if (!info.pieces) errors.push(`[castle3d ${id}] the bake did not load`);
      if (info.story.tellers !== 2 || !info.story.said || info.story.lines !== 3) errors.push(`[castle3d ${id}] the herald and the lord are missing, or the herald said nothing`);
      if (!info.hgt) errors.push(`[castle3d ${id}] the Castle has no height map`);
      if (info.wall < 0) errors.push(`[castle3d ${id}] no path up a stair onto the outer wall-walk`);
      if (info.throne < 0) errors.push(`[castle3d ${id}] no path into the throne room`);
      if (info.walkLv !== info.lv) errors.push(`[castle3d ${id}] the outer wall-walk is not at level ${info.lv}: ${info.walkLv}`);
      const first = id === 'ironcrown';
      for (const [name, x, y, zoom] of views.filter((v) => !only.length || only.includes(v[0]))) {
        await page.evaluate(async ([x, y, zoom, name]) => {
          const { G } = window.VELSCOUR, { camera } = await import('/src/core/view.js');
          if (name === 'drawbridge_up') { const D = G.world.map.drawbridge; D.down = false; D.lowering = false; for (const i of D.tiles) G.world.map.block[i] = 1; }
          G.player.x = x; G.player.y = y;
          G.settings.zoom = 1; camera.computeZoom(); G.settings.zoom = zoom / camera.zoom; camera.computeZoom();
          G.world.darkK = 0; G.world.night = false; G.world.raining = false; camera.follow(x, y, 0, true);
        }, [x, y, zoom, name]);
        await page.waitForTimeout(name === 'overview' ? 4000 : name === 'drawbridge_down' ? 3600 : 1200);
        await shot('castle3d_' + (first ? '' : id + '_') + name);
        if (name === 'drawbridge_down') {
          const st = await page.evaluate(() => { const { G } = window.VELSCOUR, D = G.world.map.drawbridge; return { down: D.down, open: D.tiles.every((i) => !G.world.map.block[i]) }; });
          if (!st.down || !st.open) errors.push(`[castle3d ${id}] the drawbridge did not come down and open the crossing`);
        }
      }
      // the keep's whole roof fades off as the hero steps inside and back on once the hero leaves (render.js roofFade)
      if (!only.length || only.includes('roof_fade')) {
        const step = (x, y, ms) => page.evaluate(async ([x, y, ms]) => {
          const { G } = window.VELSCOUR, { camera } = await import('/src/core/view.js');
          G.player.x = x; G.player.y = y; G.settings.zoom = 1; camera.computeZoom(); camera.follow(x, y, 0, true);
          if (ms) await new Promise((r) => setTimeout(r, ms));
          else await new Promise((r) => requestAnimationFrame(r));   // one frame into the fade (a frame steps it at most 55%)
          return G.world._roofs?.a[1];
        }, [x, y, ms]);
        const [ox, oy] = keepOff, out0 = await step(167.5 + ox, 142.5 + oy, 900), mid = await step(160.5 + ox, 128.5 + oy, 0);
        await shot('castle3d_' + (first ? '' : id + '_') + 'roof_fading');
        const inside = await step(160.5 + ox, 128.5 + oy, 900), back = await step(167.5 + ox, 142.5 + oy, 900);
        console.log('roof fade', id, JSON.stringify({ out0, mid, inside, back }));
        if (!(out0 === 1 && mid > 0 && mid < 1 && inside === 0 && back === 1)) errors.push(`[castle3d ${id}] the keep roof does not fade off inside and back on outside`);
      }
    }
  } catch (e) { errors.push('[castle3d] ' + e.message); }
  report(errors);
  await browser.close();
})();
