// The Riftgate in Herrington Hollow (src/gfx/riftgate.js): it stands across the square from the dungeon portal on open
// ground for every town seed, the dungeon portal stays first (auto-play uses it), its dialog steps through to VELSCOUR
// DEFENSE (defense/index.html), that page's way back returns to the main game with the hero's save untouched, and the
// title screen's blue VELSCOUR DEFENSE button goes there too.
//   node tools/tests/riftgate.js [seeds=12]
const { openGame, report } = require('./harness');

(async () => {
  const seeds = +(process.argv[2] || 12);
  const { browser, page, errors, shot } = await openGame();
  await page.click('text=Heroes'); await page.click('.class-card[data-id="paladin"]'); await page.click('text=Begin');
  await page.waitForTimeout(1200);
  const res = await page.evaluate(async (seeds) => {
    const { G, game } = window.VELSCOUR, out = [];
    for (let i = 0; i < seeds; i++) {
      G.char.townSeed = 1000 + i * 7919; game.enterTown();
      const w = G.world, rg = w.portals.find((p) => p.riftgate), dp = w.portals[0];
      out.push({ seed: G.char.townSeed, ok: !!rg && !dp.riftgate && w.map.walkable(rg.x, rg.y), apart: rg ? Math.hypot(rg.x - dp.x, rg.y - dp.y).toFixed(1) : null });
    }
    return out;
  }, seeds);
  const bad = res.filter((r) => !r.ok);
  console.log(`${res.length - bad.length}/${res.length} towns have the Riftgate on open ground; distances from the dungeon portal: ${res.map((r) => r.apart).join(' ')}`);
  if (bad.length) { console.log('FAIL', JSON.stringify(bad)); process.exitCode = 1; }
  // stand by it and look
  await page.evaluate(() => { const { G } = window.VELSCOUR, rg = G.world.portals.find((p) => p.riftgate); G.player.x = rg.x + 2.2; G.player.y = rg.y + 1.2; });
  await page.waitForTimeout(1500);
  await shot('riftgate_town');
  await page.evaluate(() => { const { G } = window.VELSCOUR, rg = G.world.portals.find((p) => p.riftgate); G.player.x = rg.x - 1; G.player.y = rg.y; G.player.interact = rg; });
  await page.waitForTimeout(900);
  await shot('riftgate_dialog');
  const name = await page.evaluate(() => window.VELSCOUR.G.char.name);
  await Promise.all([page.waitForURL('**/defense/index.html', { timeout: 15000 }), page.click('text=Step through')]);
  await page.waitForFunction(() => window.VDEF && !document.getElementById('loading'), null, { timeout: 30000 });
  await page.waitForTimeout(800);
  await shot('riftgate_defense');
  console.log('stepped through to', await page.evaluate(() => document.title));
  // the way back
  await page.evaluate(() => { location.href = '../index.html'; });
  await page.waitForFunction(() => window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden'), null, { timeout: 30000 });
  const back = await page.evaluate(() => JSON.parse(localStorage.getItem('velscour_saves_v1') || '[]').map?.((s) => s.name) || Object.keys(JSON.parse(localStorage.getItem('velscour_saves_v1') || '{}')));
  console.log('back in VELSCOUR; saves:', JSON.stringify(back).slice(0, 120), 'hero was', name);
  // the title screen's blue button
  await page.waitForSelector('.title-menu .btn.blue'); await page.waitForTimeout(600);
  await shot('riftgate_title');
  await Promise.all([page.waitForURL('**/defense/index.html', { timeout: 15000 }), page.click('.title-menu .btn.blue')]);
  console.log('title button opened', await page.evaluate(() => document.title));
  report(errors);
  await browser.close();
})();
