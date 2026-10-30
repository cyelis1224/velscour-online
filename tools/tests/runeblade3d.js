// The Death Knight's Runeblade as a 3D model (src/gfx/runeblade3d.js), in all five skins and the placeholder: each
// mesh builds, draws through WebGL at every turn, face-on covers more than edge-on, the rune slots sit on the blade's
// centre line; the look follows his level (a skin every 10 levels, a palette every 50: 30 looks over levels 1-300)
// and a new band reforges the blade; the hovering sword in play; RUNIC OBLITERATION swings the same model scaled up.
//   node tools/tests/runeblade3d.js
// Shots: runeblade3d_turntable.png (every skin, 12 turns), runeblade3d_looks.png (all 30 level looks: palette rows x
//        skin columns), runeblade3d_skins.png (levels 1, 10, 60, 120, 170, 220, 290 in play, 6 runes),
//        runeblade3d_hover.png (0 / 3 / 6 runes, mid-twirl), runeblade3d_obliteration.png (the swing, 4 moments)
const fs = require('fs'), path = require('path');
if (!process.env.CHROMIUM_ARGS) process.env.CHROMIUM_ARGS = '--enable-unsafe-swiftshader';   // WebGL in headless
const { openGame, report, OUT_DIR } = require('./harness');

(async () => {
  const { browser, page, errors } = await openGame({ width: 1280, height: 720 });
  const ok = (c, msg) => console.log(`  ${c ? 'ok  ' : 'FAIL'} ${msg}`) || (c || (process.exitCode = 1));
  const save = (name, url) => fs.writeFileSync(path.join(OUT_DIR, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
  try {
    const r = await page.evaluate(async () => {
      const { G, game } = window.VELSCOUR;
      await game.newChar('death_knight', 'Rime');
      document.querySelectorAll('.screen').forEach((s) => s.remove());
      G.ui.modalCount = 0;
      const { BIOME_BY_ID } = await import('/src/data/biomes.js');
      game.buildDungeon(6, BIOME_BY_ID.catacombs);
      G.godMode = true; G.settings.zoom = 2; G.settings.gore = 0; G.paused = false;
      (await import('/src/core/view.js')).camera.computeZoom();
      document.getElementById('center-msg').style.display = 'none';
      for (const c of G.world.creatures) if (!c.isPlayer) c.dead = true;
      const R3 = await import('/src/gfx/runeblade3d.js');
      const ids = [...R3.RUNEBLADE_SKINS.map((k) => k.id), 'placeholder'];
      for (const id of ids) R3.preloadRuneblade(id);
      for (let i = 0; i < 100 && ids.some((id) => !R3.runebladeModel(id).ready && !R3.runebladeModel(id).error); i++) await new Promise((r) => setTimeout(r, 50));
      const out = { skins: {}, problems: [] };
      const c = document.createElement('canvas'); c.width = c.height = 400;
      const g = c.getContext('2d', { willReadFrequently: true });
      for (const skin of ids) {
        const m = R3.runebladeModel(skin);
        if (!m.ready) { out.problems.push(skin + ' not loaded: ' + m.error); continue; }
        // coverage at 16 turns: draws every time, and face-on covers more than edge-on
        const cover = (spin) => {
          g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 400, 400);
          const v = R3.drawRuneblade3D(g, 200, 90, Math.PI / 2, 260, { skin, spin });
          const d = g.getImageData(0, 0, 400, 400).data; let n = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
          return { n, v };
        };
        const covers = [];
        for (let i = 0; i < 16; i++) { const { n, v } = cover(i * Math.PI / 8); covers.push(n); if (!v || !n) out.problems.push(`${skin}: nothing drawn at turn ${i}`); }
        if (!(covers[0] > covers[4] * 2 && covers[8] > covers[4] * 2)) out.problems.push(skin + ': face-on does not cover more than edge-on');
        const { v } = cover(0);
        if (v.slots.length !== 6 || v.slots.some(([x, y], i) => Math.abs(x - 200) > 2 || y <= 90 || y >= 350 || (i && y <= v.slots[i - 1][1]))) out.problems.push(skin + ': rune slots off the blade ' + JSON.stringify(v.slots));
        if (cover(Math.PI).v.face < 0.99) out.problems.push(skin + ': back face not square-on at spin pi');
        out.skins[skin] = { tris: m.mesh.count / 3, slabs: m.mesh.slabs, w: m.mesh.maxX - m.mesh.minX, t: m.mesh.maxT };
      }
      // the turntable shot: every skin, 12 turns, tipped a little toward the viewer
      const T = document.createElement('canvas'); T.width = 12 * 120 + 150; T.height = ids.length * 300;
      const t2 = T.getContext('2d'); t2.fillStyle = '#26242e'; t2.fillRect(0, 0, T.width, T.height);
      t2.fillStyle = '#e8e0c8'; t2.font = '14px monospace';
      ids.forEach((skin, j) => {
        t2.fillText(skin, 8, 30 + j * 300);
        for (let i = 0; i < 12; i++) R3.drawRuneblade3D(t2, 210 + i * 120, 70 + j * 300, Math.PI / 2, 200, { skin, spin: i * Math.PI / 6, tilt: 0.2, glowAmt: 0.2 });
      });
      out.turntable = T.toDataURL();
      // the 30 looks by level: a skin every 10 levels, a palette every 50
      const want = [[1, 'reliquary_sliver', 'rime'], [9, 'reliquary_sliver', 'rime'], [10, 'funeral_sash', 'rime'], [49, 'blank_epitaph', 'rime'],
        [50, 'reliquary_sliver', 'grave_jade'], [120, 'frozen_sand', 'wraith_violet'], [250, 'reliquary_sliver', 'gilded_oath'], [300, 'blank_epitaph', 'gilded_oath']];
      out.badLooks = want.filter(([l, k, pal]) => { const L = R3.runebladeLook(l); return L.skin !== k || L.palette !== pal; }).map((w) => w[0]);
      const seen = new Set(); for (let l = 1; l <= 300; l++) { const L = R3.runebladeLook(l); seen.add(L.skin + '/' + L.palette); }
      out.looks = seen.size;
      const P = R3.RUNEBLADE_PALETTES, S = R3.RUNEBLADE_SKINS;
      const Lc = document.createElement('canvas'); Lc.width = 150 + S.length * 175; Lc.height = 40 + P.length * 260;
      const l2 = Lc.getContext('2d'); l2.fillStyle = '#26242e'; l2.fillRect(0, 0, Lc.width, Lc.height);
      l2.fillStyle = '#e8e0c8'; l2.font = '13px monospace';
      S.forEach((k, i) => l2.fillText(k.name, 160 + i * 175, 22));
      P.forEach((pal, j) => {
        l2.fillText(pal.name, 8, 60 + j * 260); l2.fillText(`levels ${j * 50 || 1}-${j * 50 + 49 + (j === P.length - 1 ? 1 : 0)}`, 8, 78 + j * 260);
        S.forEach((k, i) => R3.drawRuneblade3D(l2, 235 + i * 175, 90 + j * 260, Math.PI / 2, 165, { skin: k.id, palette: pal.id, spin: 0.35, tilt: 0.15, glow: pal.glow, glowAmt: 0.25 }));
      });
      out.lookSheet = Lc.toDataURL();
      return out;
    });
    for (const [k, s] of Object.entries(r.skins)) console.log(`       ${k.padEnd(17)} ${s.tris} triangles, ${s.slabs} slabs, ${s.w} x ${s.t * 2} art px (width x thickness)`);
    ok(Object.keys(r.skins).length === 6, 'all five skins and the placeholder load');
    ok(!r.problems.length, r.problems.length ? r.problems.join('; ') : 'every skin draws at all 16 turns; face-on > edge-on; rune slots on the centre line');
    ok(!r.badLooks.length && r.looks === 30, r.badLooks.length ? 'wrong look at levels ' + r.badLooks : `by level: a skin every 10 levels, a palette every 50, ${r.looks} looks over 1-300`);
    save('runeblade3d_turntable', r.turntable); save('runeblade3d_looks', r.lookSheet);

    // in play: the hovering sword
    const frame = (n, runes, flash, level) => page.evaluate(({ n, runes, flash, level }) => {
      const { G, game } = window.VELSCOUR, p = G.player;
      if (level) G.char.level = level;
      for (let i = 0; i < n; i++) G.world.update(1 / 30);
      G.settings.dkBlade = 'runeblade'; // (the default flies his equipped sword: tools/tests/dkblade.js)
      if (p.sig) { p.sig.s.runes = runes.slice(); p.sig.s.flash = flash; p.sig.s.wait = 99; p.sig.s.idle = 0; p.sig.s.rest = 0; }
      game.render();
      return !!p.sig;
    }, { n, runes, flash, level });
    const crop = () => page.screenshot({ clip: { x: 640 - 120, y: 360 - 220, width: 240, height: 260 } });
    const six = ['frost', 'frost', 'unholy', 'blood', 'blood', 'frost'];
    ok(await frame(10, [], 0, 1), 'Death Knight has his signature');
    // reaching level 10 reforges the blade: a new band, a twirl and the announcement
    const reforge = await page.evaluate(() => {
      const { G } = window.VELSCOUR, p = G.player, s = p.sig.s, b0 = s.band;
      G.char.level = 10; G.world.update(1 / 30);
      return { b0, b1: s.band, twirl: s.flash > 0 };
    });
    ok(reforge.b0 === 0 && reforge.b1 === 1 && reforge.twirl, 'level 10 reforges the blade ' + JSON.stringify(reforge));
    const skinShots = [];
    for (const lv of [1, 10, 60, 120, 170, 220, 290]) { await frame(1, six, 0, lv); await page.waitForTimeout(80); await frame(0, six, 0, lv); skinShots.push(await crop()); }
    const shots = [];
    await frame(1, [], 0, 1); shots.push(await crop());
    await frame(1, ['frost', 'unholy', 'blood'], 0); shots.push(await crop());
    await frame(1, six, 0); shots.push(await crop());
    await frame(1, ['frost', 'unholy'], 0.3); shots.push(await crop());
    // RUNIC OBLITERATION: the same model, scaled up, swung
    const swing = [];
    await page.evaluate(async () => {
      const { G } = window.VELSCOUR, p = G.player, s = p.sig.s;
      const M = (await import('/src/game/sigs/deathknight.js')).default;
      s.runes = ['frost', 'frost', 'frost', 'unholy', 'blood', 'frost'];
      p.facing = 0.4; M.fire(p, s);
    });
    for (const n of [3, 4, 3, 5]) {
      await page.evaluate((n) => { const { G, game } = window.VELSCOUR; for (let i = 0; i < n; i++) G.world.update(1 / 30); game.render(); }, n);
      swing.push(await page.screenshot({ clip: { x: 640 - 260, y: 360 - 300, width: 520, height: 420 } }));
    }
    const strip = (list, w, h) => page.evaluate(async ({ list, w, h }) => {
      const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + u; });
      const c = document.createElement('canvas'); c.width = w * list.length; c.height = h; const g = c.getContext('2d');
      for (let i = 0; i < list.length; i++) g.drawImage(await load(list[i]), i * w, 0);
      return c.toDataURL();
    }, { list: list.map((s) => s.toString('base64')), w, h });
    save('runeblade3d_skins', await strip(skinShots, 240, 260));
    save('runeblade3d_hover', await strip(shots, 240, 260));
    save('runeblade3d_obliteration', await strip(swing, 520, 420));
    console.log('  shots: runeblade3d_turntable.png, runeblade3d_skins.png, runeblade3d_hover.png, runeblade3d_obliteration.png');
  } finally {
    report(errors);
    await browser.close();
  }
})();
