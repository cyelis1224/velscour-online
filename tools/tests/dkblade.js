// The Death Knight's flying sword is his equipped sword (src/game/sigs/deathknight.js): the whole design as a 2D sprite
// (heldFree / drawHeldFree, src/gfx/heldart.js) or its three.js model (src/gfx/heldmodel3d.js, G.settings.dkBlade
// 'model'), with its finish, element, gems, enchantment effects and lit runes. It rests across his back out of a fight
// and in town, flies off when he strikes, and swings in RUNIC OBLITERATION. A level 350 hero with a Mythic +10
// greatsword (full enchant, every socket filled; deathgift.js bestItem) is shot in both looks, side by side.
//   node tools/tests/dkblade.js [design 0-49 (default 46)]
// Shots: dkblade_compare.png (rows 2D / 3D: hovering, a rune twirl, six runes, flying to his back, resting on it facing
//        each way, in town, mid-Obliteration), dkblade_designs.png (all 50 greatswords: the 2D sprite beside the model)
const fs = require('fs'), path = require('path');
if (!process.env.CHROMIUM_ARGS) process.env.CHROMIUM_ARGS = '--enable-unsafe-swiftshader';   // WebGL in headless
const { openGame, report, OUT_DIR } = require('./harness');
const DESIGN = +(process.argv[2] ?? 46);

(async () => {
  const { browser, page, errors } = await openGame({ width: 1280, height: 720 });
  const ok = (c, msg) => console.log(`  ${c ? 'ok  ' : 'FAIL'} ${msg}`) || (c || (process.exitCode = 1));
  const save = (name, url) => fs.writeFileSync(path.join(OUT_DIR, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
  try {
    const info = await page.evaluate(async (D) => {
      const { G, game } = window.VELSCOUR;
      await game.newChar('death_knight', 'Rime');
      document.querySelectorAll('.screen').forEach((s) => s.remove());
      G.ui.modalCount = 0;
      const { CLASSES } = await import('/src/data/classes.js');
      const { bestItem } = await import('/src/game/deathgift.js');
      const { HELD_PER, HELD_START } = await import('/src/data/held.js');
      const { PALETTES } = await import('/src/data/gear.js');
      const { loadHeld, heldFree } = await import('/src/gfx/heldart.js');
      const M3 = await import('/src/gfx/heldmodel3d.js');
      // the sword: Mythic +10, a full enchant, every socket a gem; design D, a Mythic-tier finish
      const R = HELD_PER.findIndex((n, r) => D < HELD_START[r] + n), it = bestItem(CLASSES.death_knight, 'weapon', 'sword', 351, 'crit', ['classgem', 'chainlink', 'prism', 'bloodstone', 'jade', 'amethyst']);
      it.rarity = R; it.look = [D - HELD_START[R], PALETTES.findIndex((p) => p.tier === 5 && p.ramps) || 0, -1, 2];
      G.char.equip.weapon = it; G.char.level = 350; G.player.applyGrants?.();
      await loadHeld('death_knight', G.char);
      for (let i = 0; i < 200 && !M3.heldModel3DReady(it, 'death_knight'); i++) await new Promise((r) => setTimeout(r, 50));
      window._dk = { it };
      return { name: heldFree(it, 'death_knight')?.name, free: !!heldFree(it, 'death_knight'), model: M3.heldModel3DReady(it, 'death_knight'), gems: it.gems.length, upg: it.upg, affixes: it.affixes.length, R };
    }, DESIGN);
    ok(info.free, `the whole 2D sprite of design ${DESIGN} loads (${info.name})`);
    ok(info.model, 'its three.js model loads');
    ok(info.gems >= 3 && info.upg === 10 && info.affixes >= 5, `Mythic +${info.upg}, ${info.gems} gems, ${info.affixes} affixes`);

    // the dungeon, no monsters, close up
    await page.evaluate(async () => {
      const { G, game } = window.VELSCOUR;
      const { BIOME_BY_ID } = await import('/src/data/biomes.js');
      game.buildDungeon(6, BIOME_BY_ID.catacombs);
      G.godMode = true; G.settings.zoom = 2.2; G.settings.gore = 0; G.paused = false;
      (await import('/src/core/view.js')).camera.computeZoom();
      document.getElementById('center-msg').style.display = 'none';
      for (const c of G.world.creatures) if (!c.isPlayer) c.dead = true;
    });
    const six = ['frost', 'frost', 'unholy', 'blood', 'blood', 'frost'];
    // n world steps, then the sword's state as given, then a frame
    const frame = (mode, n, o) => page.evaluate(({ mode, n, o }) => {
      const { G, game } = window.VELSCOUR, p = G.player;
      G.settings.dkBlade = mode;
      for (let i = 0; i < n; i++) { G.time += 1 / 30; G.world.update(1 / 30); }
      Object.assign(p.sig.s, { wait: 99, flash: 0, runes: [] }, o.s);
      if (o.flip !== undefined) p.flip = o.flip;
      game.render(); game.render(); // twice: the back layer notes the pose the flight uses in the same frame
      return { rest: p.sig.s.rest, back: !!p._bladeBack };
    }, { mode, n, o });
    const clip = { x: 640 - 110, y: 360 - 190, width: 220, height: 230 }, big = { x: 640 - 220, y: 360 - 360, width: 440, height: 460 };
    const shots = {}, labels = ['hovering', 'taking a rune', 'six runes', 'flying to his back', 'on his back', 'facing left', 'in town', 'Obliteration'];
    for (const mode of ['sprite', 'model']) {
      const row = [];
      await frame(mode, 2, { s: { idle: 0, rest: 0 }, flip: false }); row.push(await page.screenshot({ clip }));
      await frame(mode, 0, { s: { idle: 0, rest: 0, runes: six.slice(0, 2), flash: 0.3 } }); row.push(await page.screenshot({ clip }));
      await frame(mode, 0, { s: { idle: 0, rest: 0, runes: six } }); row.push(await page.screenshot({ clip }));
      await frame(mode, 0, { s: { idle: 99, rest: 0.55, runes: six.slice(0, 3) } }); row.push(await page.screenshot({ clip }));
      const st = await frame(mode, 0, { s: { idle: 99, rest: 1, runes: six.slice(0, 3) } }); row.push(await page.screenshot({ clip }));
      ok(st.back, `${mode}: the back pose is noted`);
      await frame(mode, 0, { s: { idle: 99, rest: 1, runes: six.slice(0, 3) }, flip: true }); row.push(await page.screenshot({ clip }));
      shots[mode] = row;
      // the fight brings it off his back
      const fly = await page.evaluate(() => {
        const { G } = window.VELSCOUR, p = G.player, s = p.sig.s;
        s.idle = 99; s.rest = 1; p.flip = false;
        import('/src/game/sigs/deathknight.js').then((m) => m.default.hit(p, s, p, 10, 'cold', {}));
        return null;
      });
      await page.waitForTimeout(50);
      const off = await page.evaluate(() => { const { G } = window.VELSCOUR, s = G.player.sig.s; for (let i = 0; i < 20; i++) G.world.update(1 / 30); return s.rest; });
      ok(off === 0, `${mode}: a blow brings it off his back (rest ${off})`);
      const back = await page.evaluate(() => { const { G } = window.VELSCOUR, s = G.player.sig.s; for (let i = 0; i < 30 * 4; i++) G.world.update(1 / 30); return s.rest; });
      ok(back === 1, `${mode}: 3 s out of a fight it is back on his back (rest ${back})`);
    }
    // RUNIC OBLITERATION, both looks
    for (const mode of ['sprite', 'model']) {
      await page.evaluate(async (mode) => {
        const { G } = window.VELSCOUR, p = G.player, s = p.sig.s;
        G.settings.dkBlade = mode;
        const M = (await import('/src/game/sigs/deathknight.js')).default;
        s.runes = ['frost', 'frost', 'frost', 'unholy', 'blood', 'frost']; s.swing = 0; p.facing = 0.4; M.fire(p, s);
        for (let i = 0; i < 9; i++) G.world.update(1 / 30);
        window.VELSCOUR.game.render();
      }, mode);
      shots[mode].push(await page.screenshot({ clip: big }));
      await page.evaluate(() => { const { G } = window.VELSCOUR; for (let i = 0; i < 40; i++) G.world.update(1 / 30); });
    }
    // in town: always on his back
    await page.evaluate(async () => {
      const { G, game } = window.VELSCOUR;
      await game.enterTown();
      document.querySelectorAll('.screen').forEach((s) => s.remove());
      G.ui.modalCount = 0; G.paused = false;
      document.getElementById('center-msg').style.display = 'none';
    });
    await page.waitForTimeout(400);
    for (const mode of ['sprite', 'model']) {
      const st = await frame(mode, 3, { s: { idle: 0, rest: 0 }, flip: false });
      ok(st.back, `${mode}: in town it rests on his back even mid-"fight"`);
      shots[mode].splice(6, 0, await page.screenshot({ clip }));
    }
    const sheet = await page.evaluate(async ({ rows, labels }) => {
      const load = (b) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b; });
      const W = 440, H = 460, c = document.createElement('canvas'); c.width = 110 + W * labels.length; c.height = 30 + rows.length * (H + 10);
      const g = c.getContext('2d'); g.fillStyle = '#1c1a22'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingEnabled = false;
      g.fillStyle = '#f0d890'; g.font = 'bold 15px monospace';
      labels.forEach((l, i) => g.fillText(l, 110 + i * W + 8, 20));
      for (const [j, [name, row]] of rows.entries()) {
        g.fillText(name, 10, 30 + j * (H + 10) + H / 2);
        for (const [i, b] of row.entries()) { const im = await load(b), z = im.width < W ? 2 : 1; g.drawImage(im, 110 + i * W, 30 + j * (H + 10), im.width * z, im.height * z); } // close-ups at 2x
      }
      return c.toDataURL();
    }, { rows: [['2D sprite', shots.sprite.map((b) => b.toString('base64'))], ['3D model', shots.model.map((b) => b.toString('base64'))]], labels });
    save('dkblade_compare', sheet);

    // all 50 designs: the 2D sprite beside the 3D model
    const designs = await page.evaluate(async () => {
      const { HELD_PER, HELD_START } = await import('/src/data/held.js');
      const { heldFree, drawHeldFree } = await import('/src/gfx/heldart.js');
      const M3 = await import('/src/gfx/heldmodel3d.js');
      const items = [];
      HELD_PER.forEach((n, R) => { for (let j = 0; j < n; j++) items.push({ type: 'gear', slot: 'weapon', base: 'sword', rarity: R, look: [j, 0, -1, 2], gems: [], affixes: [] }); });
      for (let i = 0; i < 300 && items.some((it) => !M3.heldModel3DReady(it, 'death_knight') || !heldFree(it, 'death_knight')); i++) await new Promise((r) => setTimeout(r, 50));
      const cw = 128, ch = 250, c = document.createElement('canvas'); c.width = 10 * cw; c.height = 5 * ch;
      const g = c.getContext('2d'); g.fillStyle = '#24222b'; g.fillRect(0, 0, c.width, c.height);
      g.font = '10px monospace'; g.fillStyle = '#d8d0b8';
      let drawn = 0;
      items.forEach((it, i) => {
        const x = (i % 10) * cw, y = Math.floor(i / 10) * ch, f = heldFree(it, 'death_knight');
        if (f && drawHeldFree(g, f, x + 36, y + 196, -Math.PI / 2, 150, 0)) drawn++;
        if (M3.drawHeldModel3D(g, it, 'death_knight', x + 92, y + 196, -Math.PI / 2, 150, { spin: 0.4, tilt: 0.1 })) drawn++;
        g.fillStyle = '#d8d0b8'; g.fillText(String(i).padStart(2, '0') + ' ' + (f?.name || '').slice(0, 18), x + 4, y + ch - 8);
      });
      return { url: c.toDataURL(), drawn };
    });
    ok(designs.drawn === 100, `all 50 designs draw in both looks (${designs.drawn}/100)`);
    save('dkblade_designs', designs.url);
    console.log('  shots: dkblade_compare.png, dkblade_designs.png');
  } finally {
    report(errors);
    await browser.close();
  }
})();
