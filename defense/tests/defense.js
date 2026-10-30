// VELSCOUR DEFENSE in a real browser: boot, every menu, a stage played on auto (dialogs, HUD, combat, result), stages
// from all five acts, the side modes, wheel zoom, a pack opened in 3D, the card inspector, the hero sheet, and the phone layout. Screenshots in defense/tests/out/.
// Serve the repo root first (python -m http.server 8317), then:
//   NODE_PATH=<global node_modules> node defense/tests/defense.js [mobile]
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:8317';
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const mobile = process.argv.includes('mobile');

(async () => {
  const args = (process.env.CHROMIUM_ARGS || '--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist').split(' ').filter(Boolean);
  const browser = await chromium.launch({ args });
  const ctx = await browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`[http ${r.status()}] ${r.url()}`); });
  const shot = (n) => page.screenshot({ path: path.join(OUT, (mobile ? 'm_' : '') + n + '.png') });
  const step = async (name, fn) => { const t = Date.now(); try { await fn(); console.log('ok  ', name, Date.now() - t + 'ms'); } catch (e) { console.log('FAIL', name, e.message); errors.push(name + ': ' + e.message); } };

  await page.addInitScript(() => { try { localStorage.removeItem('velscour_defense_v1'); } catch { /* */ } });
  await page.goto(BASE + '/defense/index.html');
  await page.waitForFunction(() => window.VDEF && !document.getElementById('loading'), null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  await step('hub', async () => { await shot('hub'); });
  await step('menus', async () => {
    for (const s of ['campaign', 'squad', 'collection', 'modes', 'works', 'rewards', 'summon', 'settings']) {
      await page.evaluate((s) => window.VDEF.show(s), s); await page.waitForTimeout(s === 'summon' || s === 'collection' ? 1800 : 600); await shot('menu_' + s);
    }
  });
  await step('hero sheet', async () => { await page.evaluate(() => window.VDEF.show('hero', { id: 'corwin' })); await page.waitForTimeout(1500); await shot('hero_corwin'); });
  await step('briefing', async () => {
    await page.evaluate(async () => { const c = await import('/defense/src/ui/campaign.js'); window.VDEF.show('campaign'); await c.brief(10); });
    await page.waitForTimeout(1200); await shot('brief_10');
  });
  // a stage on auto: the opening scene, the battle, the end
  await step('stage 1 dialog', async () => {
    await page.evaluate(async () => { const b = await import('/defense/src/ui/battle.js'); document.querySelector('.modal-bg')?.remove(); b.playStage(1); });
    await page.waitForSelector('.dlg .actor', { timeout: 20000 }); await page.waitForTimeout(1500); await shot('dialog_begin');
    await page.click('.dlg [data-k=skip]');
  });
  await step('stage 1 battle', async () => {
    await page.waitForSelector('.bhud-top', { timeout: 10000 });
    await page.evaluate(() => { const c = window.VDEF.ctl(); c.auto = true; c.speed = 3; });
    await page.waitForTimeout(9000); await shot('battle_early');
    await page.waitForTimeout(9000); await shot('battle_mid');
    const st = await page.evaluate(() => { const b = window.VDEF.ctl().b; return { units: b.units.length, monsters: b.monsters.length, kills: b.kills, wave: b.waveI, shots: b.shots.length }; });
    console.log('     ', JSON.stringify(st));
    if (!st.units) throw new Error('auto-play deployed nobody');
  });
  await step('stage 1 result', async () => {
    await page.evaluate(() => { const c = window.VDEF.ctl(); c.speed = 3; });
    await page.waitForFunction(() => !!document.querySelector('.dlg .actor') || !!document.querySelector('.result'), null, { timeout: 180000 });
    if (await page.$('.dlg')) { await shot('dialog_end'); await page.click('.dlg [data-k=skip]'); }
    await page.waitForSelector('.result', { timeout: 10000 }); await page.waitForTimeout(600); await shot('result');
    const s = await page.evaluate(() => ({ frontier: window.VDEF.D.save.frontier, gold: window.VDEF.D.save.gold, shards: window.VDEF.D.save.shards }));
    console.log('     ', JSON.stringify(s));
    if (s.frontier < 2) throw new Error('stage 1 not won on auto');
  });
  // a later region's look: a boss stage with the region's tiles
  for (const n of [24, 56, 80, 125, 190, 240, 300]) {
    await step('stage ' + n + ' look', async () => {
      await page.evaluate(async (n) => { const b = await import('/defense/src/ui/battle.js'); b.leaveBattle(); window.VDEF.D.save.settings.skipDialogs = true; window.VDEF.D.save.frontier = Math.max(window.VDEF.D.save.frontier, n); b.playStage(n); }, n);
      await page.waitForSelector('.bhud-top', { timeout: 30000 });
      await page.evaluate(() => { const c = window.VDEF.ctl(); c.auto = true; c.speed = 3; });
      await page.waitForTimeout(n > 80 ? 6000 : n % 10 === 0 ? 26000 : 12000); await shot('stage_' + n);
    });
  }
  // the side modes: an endless run and a challenge, the mouse wheel zooms the field
  for (const id of ['bossrush', 'shifting', 'vault']) {
    await step('mode ' + id, async () => {
      await page.evaluate(async (id) => { const b = await import('/defense/src/ui/battle.js'); b.leaveBattle(); window.VDEF.D.save.frontier = Math.max(window.VDEF.D.save.frontier, 120); window.VDEF.D.save.settings.autoBattle = true; b.playMode(id); }, id);
      await page.waitForSelector('.bhud-top', { timeout: 30000 });
      await page.evaluate(() => { const c = window.VDEF.ctl(); c.speed = 3; });
      await page.waitForTimeout(12000);
      const z0 = await page.evaluate(() => window.VDEF.ctl().view.zoom);
      await page.mouse.move(mobile ? 422 : 800, mobile ? 195 : 450); await page.mouse.wheel(0, -400); await page.waitForTimeout(400);
      const z1 = await page.evaluate(() => window.VDEF.ctl().view.zoom);
      await shot('mode_' + id);
      console.log('      zoom', z0.toFixed(2), '->', z1.toFixed(2), await page.$eval('[data-k=wave]', (e) => e.textContent));
      if (!(z1 > z0)) throw new Error('the wheel did not zoom');
      await page.evaluate(() => { const b = window.VDEF.ctl().b; b.heart = 0; b.finish(false); });
      await page.waitForSelector('.result', { timeout: 20000 }); await page.waitForTimeout(500); await shot('mode_' + id + '_result');
    });
  }
  await page.evaluate(async () => { const b = await import('/defense/src/ui/battle.js'); b.leaveBattle(); window.VDEF.show('hub'); });
  // the gacha: shards in, a hero ten-summon and an armory pack in 3D
  await step('pack 3D', async () => {
    await page.evaluate(() => { window.VDEF.D.save.shards = 5000; window.VDEF.show('summon'); });
    await page.waitForTimeout(1200);
    await page.evaluate(async () => {
      const g = await import('/defense/src/meta/gacha.js'), p = await import('/defense/src/cards/pack3d.js');
      const pack = g.PACK_BY_ID.armory, res = g.openPack(window.VDEF.D.save, pack, false);
      window.__pack = p.openPack3D(pack, res);
    });
    await page.waitForSelector('#pack3d canvas', { timeout: 30000 }); await page.waitForTimeout(1800); await shot('pack_closed');
    const tap = () => page.mouse.click(mobile ? 422 : 800, mobile ? 200 : 450);
    await tap(); await page.waitForTimeout(1500); await shot('pack_torn');
    for (let i = 0; i < 5; i++) { await tap(); await page.waitForTimeout(i === 4 ? 1800 : 1300); if (i === 0) await shot('pack_reveal1'); }
    await shot('pack_all');
    await page.click('#pack3d .btn.green'); await page.waitForTimeout(500);
  });
  await step('hero summon x10', async () => {
    await page.evaluate(async () => {
      const g = await import('/defense/src/meta/gacha.js'), p = await import('/defense/src/cards/pack3d.js');
      const pack = g.PACK_BY_ID.heroes, res = g.openPack(window.VDEF.D.save, pack, true);
      p.openPack3D(pack, res);
    });
    await page.waitForSelector('#pack3d canvas', { timeout: 30000 }); await page.waitForTimeout(1500);
    await page.click('#pack3d [data-k=skip]'); await page.waitForTimeout(4500); await shot('summon10');
    await page.click('#pack3d .btn.green'); await page.waitForTimeout(500);
  });
  await step('inspect 3D', async () => {
    await page.evaluate(async () => { const p = await import('/defense/src/cards/pack3d.js'), c = await import('/defense/src/data/cards.js'); p.inspectCard(c.CARDS['h:varric'], { lvl: 40, stars: 3, foil: true }); });
    await page.waitForSelector('#pack3d canvas', { timeout: 30000 }); await page.waitForTimeout(2200); await shot('inspect');
    await page.click('#pack3d [data-k=close]');
  });
  await step('collection after packs', async () => { await page.evaluate(() => window.VDEF.show('collection')); await page.waitForTimeout(2000); await shot('collection_after'); });
  console.log(errors.length ? errors.slice(0, 30).join('\n') : 'NO ERRORS');
  process.exitCode = errors.length ? 1 : 0;
  await browser.close();
})();
