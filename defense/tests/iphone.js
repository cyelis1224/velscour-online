// VELSCOUR DEFENSE on an iPhone-sized screen, portrait (390x844) and landscape (844x390), touch: every menu, a briefing,
// the hero sheet, a gear card, trophies, the Modes, a battle (pinch zoom), a result, a 3D pack and the card inspector.
// Each view is checked for anything wider or taller than the screen that can't be scrolled to; shots in tests/out/.
// Serve the repo root first (python -m http.server 8317), then:
//   NODE_PATH=<global node_modules> node defense/tests/iphone.js [portrait|landscape]
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:8317';
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const want = process.argv.slice(2);
const ORIENT = { portrait: { width: 390, height: 844 }, landscape: { width: 844, height: 390 } };

// anything off-screen in a container that doesn't scroll is a layout bug
const overflow = () => {
  const W = innerWidth, H = innerHeight, bad = [];
  const scrolls = (e) => { for (let p = e.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX + s.overflowY) && (p.scrollWidth > p.clientWidth + 1 || p.scrollHeight > p.clientHeight + 1)) return true; } return false; };
  for (const e of document.querySelectorAll('#ui *, #pack3d *, #dlg *')) {
    let r = e.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(e).visibility === 'hidden') continue;
    // what an ancestor clips (overflow hidden) is not on screen: measure the visible part
    let [l, t, rt, bt] = [r.left, r.top, r.right, r.bottom];
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { if (getComputedStyle(p).overflow === 'visible') continue; const q = p.getBoundingClientRect(); l = Math.max(l, q.left); t = Math.max(t, q.top); rt = Math.min(rt, q.right); bt = Math.min(bt, q.bottom); }
    if (rt - l < 1 || bt - t < 1) continue;
    r = { left: l, top: t, right: rt, bottom: bt, width: rt - l, height: bt - t };
    if ((r.right > W + 2 || r.left < -2 || r.bottom > H + 2 || r.top < -2) && !scrolls(e)) bad.push(`${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  if (document.documentElement.scrollWidth > W + 1) bad.push('page scrolls sideways: ' + document.documentElement.scrollWidth);
  return bad.slice(0, 8);
};

(async () => {
  const browser = await chromium.launch({ args: (process.env.CHROMIUM_ARGS || '').split(' ').filter(Boolean) });
  let problems = 0;
  for (const [name, vp] of Object.entries(ORIENT)) {
    if (want.length && !want.includes(name)) continue;
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
    const shot = (n) => page.screenshot({ path: path.join(OUT, `iphone_${name}_${n}.png`) });
    const check = async (n, wait = 700) => {
      await page.waitForTimeout(wait); await shot(n);
      const bad = await page.evaluate(overflow);
      console.log(bad.length ? 'FIT ' : 'ok  ', name, n, bad.length ? '\n       ' + bad.join('\n       ') : '');
      problems += bad.length ? 1 : 0;
    };
    await page.addInitScript(() => { try { localStorage.removeItem('velscour_defense_v1'); } catch { /* */ } });
    await page.goto(BASE + '/defense/index.html');
    await page.waitForFunction(() => window.VDEF && !document.getElementById('loading'), null, { timeout: 30000 });
    // a Commander some weeks in: stage 60, gold and shards, a few packs of cards
    await page.evaluate(async () => {
      const { D } = window.VDEF, g = await import('/defense/src/meta/gacha.js');
      Object.assign(D.save, { frontier: 60, gold: 250000, shards: 20000, essence: 3000 });
      for (const id of ['heroes', 'heroes', 'armory', 'forge', 'reliquary', 'bestiary', 'bestiary']) g.openPack(D.save, g.PACK_BY_ID[id], id === 'heroes');
    });
    for (const s of ['hub', 'campaign', 'squad', 'summon', 'modes', 'works', 'rewards', 'settings']) {
      await page.evaluate((s) => window.VDEF.show(s), s); await check(s, s === 'summon' ? 1500 : 800);
    }
    await page.evaluate(() => window.VDEF.show('collection')); await check('cards', 1800);
    await page.click('.tabs .tab:nth-child(7)'); await check('trophies', 1800);
    await page.evaluate(() => window.VDEF.show('hero', { id: 'corwin' })); await check('hero_sheet', 1500);
    await page.evaluate(() => { const s = document.querySelector('.screen'); s.scrollTop = s.scrollHeight; }); await check('hero_sheet_bottom', 400);
    await page.click('.card-slot'); await check('gear_picker', 1500);
    await page.evaluate(() => document.querySelector('.modal-bg')?.remove());
    await page.evaluate(() => window.VDEF.show('collection')); await page.waitForTimeout(400);
    await page.click('.tabs .tab:nth-child(2)'); await page.waitForTimeout(900);
    await page.click('.cards .cardv'); await check('gear_card', 1200);
    await page.evaluate(() => document.querySelector('.modal-bg')?.remove());
    await page.evaluate(async () => { const c = await import('/defense/src/ui/campaign.js'); window.VDEF.show('campaign'); await c.brief(50); }); await check('briefing', 1400);
    await page.evaluate(() => document.querySelector('.modal-bg')?.remove());
    // a battle: the HUD, a pinch, the pause menu, the result
    await page.evaluate(async () => { window.VDEF.D.save.settings.autoBattle = true; const b = await import('/defense/src/ui/battle.js'); b.playMode('siege'); });
    await page.waitForSelector('.bhud-top', { timeout: 30000 });
    await page.evaluate(() => { const c = window.VDEF.ctl(); c.speed = 3; });
    await check('battle', 6000);
    const z = await page.evaluate(() => { const v = window.VDEF.ctl().view, z0 = v.zoom; v.zoomBy(1.8, innerWidth / 2, innerHeight / 2); return [z0, v.zoom]; });
    await check('battle_zoomed', 600);
    console.log('      zoom', z.map((v) => v.toFixed(2)).join(' -> '));
    await page.evaluate(() => window.VDEF.ctl().view.resetView());
    await page.click('[data-k=pause]'); await check('pause', 500);
    await page.click('.modal .btn.red');
    await page.waitForSelector('.result', { timeout: 20000 }); await check('result', 600);
    await page.evaluate(async () => { const b = await import('/defense/src/ui/battle.js'); b.leaveBattle(); window.VDEF.show('hub'); });
    // the 3D pack and the inspector
    await page.evaluate(async () => {
      const g = await import('/defense/src/meta/gacha.js'), p = await import('/defense/src/cards/pack3d.js');
      const pack = g.PACK_BY_ID.armory; p.openPack3D(pack, g.openPack(window.VDEF.D.save, pack, false));
    });
    await page.waitForSelector('#pack3d canvas', { timeout: 30000 }); await check('pack', 1800);
    for (let i = 0; i < 3; i++) { await page.mouse.click(vp.width / 2, vp.height * 0.45); await page.waitForTimeout(2200); }
    await check('pack_reveal', 300);
    await page.click('#pack3d [data-k=skip]');
    await page.waitForSelector('#pack3d .btn.green', { timeout: 30000 }); await check('pack_all', 1200);
    await page.click('#pack3d .btn.green'); await page.waitForTimeout(400);
    await page.evaluate(async () => { const p = await import('/defense/src/cards/pack3d.js'), c = await import('/defense/src/data/cards.js'); p.inspectCard(c.CARDS['h:varric'], { lvl: 40, stars: 3, foil: true }); });
    await page.waitForSelector('#pack3d canvas', { timeout: 30000 }); await check('inspect', 2200);
    await page.click('#pack3d [data-k=close]');
    console.log(errors.length ? errors.slice(0, 10).join('\n') : `${name}: no errors`);
    problems += errors.length;
    await ctx.close();
  }
  process.exitCode = problems ? 1 : 0;
  await browser.close();
})();
