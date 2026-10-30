// The castles on an emulated phone (touch, DPR 2, 844x390 landscape or 390x844 portrait, CPU throttled 4x): for each
// castle variant (src/data/castles.js) its baked art (download, decoded size, decode time), the level build, the
// browser's memory with it loaded (Windows: every Chromium process), frame cost while auto-play walks it, the name card
// and the herald's lines on screen, and the joystick walking the hero over the drawbridge into the castle.
// Shots: tools/tests/out/castle_phone_[portrait_]<id>_<view>.png. Real phones (and Safari) are not covered.
//   node tools/tests/castle_phone.js [ids|all] [portrait] [throttle]
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { openGame, report } = require('./harness');
const arg = process.argv[2] || 'all', portrait = process.argv.includes('portrait');
const rate = +(process.argv.find((a) => /^\d+$/.test(a)) || 4);
const W = portrait ? 390 : 844, H = portrait ? 844 : 390;
const root = path.resolve(__dirname, '../..');

// the private memory of the test browser's processes (browser, renderer, GPU: CDP SystemInfo), MiB; null off Windows
async function browserMiB(bcdp) {
  if (process.platform !== 'win32') return null;
  const ids = (await bcdp.send('SystemInfo.getProcessInfo')).processInfo.map((p) => p.id).filter(Boolean);
  const out = execSync(`powershell -NoProfile -Command "(Get-Process -Id ${ids.join(',')} -ErrorAction SilentlyContinue | Measure-Object PrivateMemorySize64 -Sum).Sum"`).toString();
  return Math.round(+out / 2 ** 20);
}

(async () => {
  const { browser, ctx, page, errors, shot } = await openGame({ width: W, height: H, mobile: true });
  const bcdp = await browser.newBrowserCDPSession();
  const cdp = await ctx.newCDPSession(page);
  const tag = (id, v) => 'castle_phone_' + (portrait ? 'portrait_' : '') + id + '_' + v;
  const rows = [];
  try {
    const ids = await page.evaluate(async (arg) => {
      const { CASTLE_VARIANTS } = await import('/src/data/castles.js');
      const { G, game } = window.VELSCOUR;
      await game.newChar('paladin', 'Castle Phone');
      document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll();
      await (await import('/src/gfx/castle.js')).loadCastlePack();
      await (await import('/src/gfx/darkforest.js')).loadDarkForestTrees();
      return arg === 'all' ? CASTLE_VARIANTS.map((v) => v.id) : arg.split(',');
    }, arg);
    const mem0 = await browserMiB(bcdp);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    for (const id of ids) {
      const { dir, pages } = await page.evaluate(async (id) => {
        const { castleVariant } = await import('/src/data/castles.js'), V = castleVariant(id), dir = 'assets/tiles/castle3d/' + (V.look?.dir ? V.look.dir + '/' : '');
        return { dir, pages: (await (await fetch(dir + 'index.json')).json()).pages };
      }, id);
      const download = pages.reduce((s, p) => s + fs.statSync(path.join(root, dir, p)).size, 0) / 1e6;
      // load (and decode) the bake, then build the level, as game.loadLevelArt + buildDungeon do
      const r = await page.evaluate(async (id) => {
        const { G, game } = window.VELSCOUR, art = await import('/src/gfx/castle3dart.js');
        art.releaseCastle3D();
        let t = performance.now();
        const st = await art.loadCastle3D(id), loadMs = performance.now() - t;
        G.char.depth = 12; G.godMode = true; G.castleVariant = id;
        const { BIOME_BY_ID } = await import('/src/data/biomes.js');
        t = performance.now(); game.buildDungeon(12, BIOME_BY_ID.castle); const buildMs = performance.now() - t;
        G.castleVariant = undefined;
        const { camera } = await import('/src/core/view.js'), msg = G.ui.msgEl?.getBoundingClientRect?.() || document.querySelector('#center-msg')?.getBoundingClientRect();
        return { loadMs: Math.round(loadMs), buildMs: Math.round(buildMs), mpx: +(st.imgs.reduce((s, im) => s + im.naturalWidth * im.naturalHeight, 0) / 1e6).toFixed(1),
          devPerBaked: +(camera.zoom * G.dpr / st.S).toFixed(2), dpr: +G.dpr.toFixed(2), name: G.world.map.castleVariant,
          card: msg ? [Math.round(msg.left), Math.round(msg.right), innerWidth] : null };
      }, id);
      await page.waitForTimeout(700); await shot(tag(id, 'arrive'));
      await cdp.send('HeapProfiler.collectGarbage');
      const mem = await browserMiB(bcdp);
      // the herald by the road says the first of the story's lines
      const herald = await page.evaluate(async () => {
        const { G } = window.VELSCOUR, w = G.world, h = w.npcs.find((n) => n.storyLines);
        if (!h) return null;
        G.player.x = h.x + 1.5; G.player.y = h.y + 1.5;
        for (let k = 0; k < 12; k++) w.update(0.05);
        return h.talkText || '';
      });
      await page.waitForTimeout(500); await shot(tag(id, 'herald'));
      // the joystick (CDP touches on the left of the screen) walks the hero north from the causeway, over the
      // drawbridge (it comes down as the hero nears it) and through the gate tunnel into the ward
      const g = await page.evaluate(() => {
        const { G } = window.VELSCOUR, w = G.world, m = w.map, D = m.drawbridge;
        w.creatures = w.creatures.filter((c) => c === G.player || c.team === 'player'); w.npcs.length = 0; w.rebuildGrid();
        G.player.x = (D.x0 + D.x1) / 2; G.player.y = D.y1 + 12;
        return { inside: D.hinge - 6, y0: G.player.y };
      });
      await page.waitForTimeout(400);
      const sx = W * 0.22, sy = H * 0.72, d = 46;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
      for (let k = 1; k <= 6; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + 2 * d / Math.sqrt(5) * k / 6, y: sy - d / Math.sqrt(5) * k / 6 }] }); await page.waitForTimeout(30); }
      let walk = null; const t0 = Date.now();
      while (Date.now() - t0 < 30000) {
        walk = await page.evaluate(() => { const { G } = window.VELSCOUR, D = G.world.map.drawbridge; return { y: +G.player.y.toFixed(1), x: +G.player.x.toFixed(1), down: D.down }; });
        if (walk.y < g.inside) break;
        await page.waitForTimeout(250);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      walk.secs = +((Date.now() - t0) / 1000).toFixed(1); walk.inside = walk.y < g.inside;
      await shot(tag(id, 'gate'));
      // frame cost while auto-play walks the castle
      const f = await page.evaluate(() => new Promise(async (res) => {
        const { G, game } = window.VELSCOUR, { Auto } = await import('/src/game/autoplay.js');
        Auto.toggle(true);
        const u = game.update, rd = game.render, s = { u: 0, r: 0, n: 0, worst: 0 };
        game.update = function (dt) { const t = performance.now(); u.call(this, dt); s.u += performance.now() - t; };
        game.render = function () { const t = performance.now(); rd.call(this); const e = performance.now() - t; s.r += e; s.worst = Math.max(s.worst, e); s.n++; };
        const t0 = performance.now();
        setTimeout(() => { game.update = u; game.render = rd; Auto.toggle(false);
          res({ fps: +(s.n / ((performance.now() - t0) / 1000)).toFixed(1), update: +(s.u / s.n).toFixed(1), render: +(s.r / s.n).toFixed(1), worst: Math.round(s.worst), resScale: +(G.resScale || 1).toFixed(2) }); }, 8000);
      }));
      await shot(tag(id, 'walk'));
      const row = { id, download: +download.toFixed(1), ...r, memMiB: mem, herald: herald ? herald.length : -1, walk, ...f };
      console.log(JSON.stringify(row)); rows.push(row);
      if (r.name !== id) errors.push(`[castle phone ${id}] built ${r.name}`);
      if (r.card && (r.card[0] < 0 || r.card[1] > r.card[2])) errors.push(`[castle phone ${id}] the name card runs off the screen: ${r.card}`);
      if (!herald) errors.push(`[castle phone ${id}] the herald said nothing`);
      if (!walk.inside) errors.push(`[castle phone ${id}] the joystick did not take the hero over the drawbridge: ${JSON.stringify(walk)}`);
    }
    await page.evaluate(async () => (await import('/src/gfx/castle3dart.js')).releaseCastle3D());
    await cdp.send('HeapProfiler.collectGarbage');
    console.log('browser memory MiB: before the castles', mem0, ' after releasing the last', await browserMiB(bcdp));
  } catch (e) { errors.push('[castle phone] ' + (e.stack || e)); }
  report(errors);
  await browser.close();
})();
