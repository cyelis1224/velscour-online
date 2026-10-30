// Desktop UI run: skill tree learning (click + double-click), inventory tooltips, socketing a
// gem by drag & drop onto the equipped weapon, gem combining, +1 upgrade, gambling, and the
// town portal dialog.
const { openGame, report } = require('./harness');

(async () => {
  const { browser, page, errors, shot } = await openGame({ width: 1440, height: 810 });
  await page.click('text=Heroes');
  await page.click('.class-card[data-id="necromancer"]');
  await page.click('text=Begin');
  await page.waitForTimeout(200);
  if (await page.locator('text=Enter World').count()) await page.click('text=Enter World');
  await page.waitForTimeout(1200);
  // Give gold, gear and gems.
  await page.evaluate(async () => {
    const { G } = window.VELSCOUR;
    const items = await import('/src/data/items.js');
    const { addToBag } = await import('/src/game/player.js');
    G.char.gold = 50000;
    for (let i = 0; i < 6; i++) addToBag(G.char, items.rollItem(10 + i * 8, { rarity: i % 5 }));
    addToBag(G.char, items.makeGem('ruby', 2)); addToBag(G.char, items.makeGem('prism', 4));
    const g = items.makeGem('sapphire', 0); g.count = 3; addToBag(G.char, g);
    G.char.level = 12; G.char.skillPoints = 8; G.char.statPoints = 10;
    G.player.recompute(); G.ui.refresh();
  });
  await page.keyboard.press('KeyK');
  await page.waitForTimeout(400);
  await page.click('.snode >> nth=1'); await page.dblclick('.snode >> nth=1');
  await page.waitForTimeout(200);
  await page.click('.tab >> nth=1'); await page.waitForTimeout(200);
  await page.dblclick('.snode >> nth=0');
  await page.waitForTimeout(300);
  await page.hover('.snode >> nth=0');
  await page.waitForTimeout(300);
  await shot('ui1_tree');
  await page.keyboard.press('Escape');
  // The game consumes keys on its next frame; I and Escape in one frame close the bag again.
  await page.waitForFunction(() => !window.VELSCOUR.G.ui.anyOpen());
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(400);
  await page.hover('.bslot >> nth=0');
  await page.waitForTimeout(300);
  await shot('ui2_inventory');
  // Drag the ruby (bag slot 6) onto the weapon slot (paper doll column 1, row 2).
  const gb = await (await page.$$('.bslot'))[6].boundingBox();
  const wb = await page.evaluate(() => { const e = [...document.querySelectorAll('.eslot')].find((x) => x.style.gridColumn === '1' && x.style.gridRow === '2'); const r = e.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  await page.mouse.move(gb.x + 20, gb.y + 20); await page.mouse.down();
  await page.mouse.move(gb.x + 40, gb.y + 40, { steps: 5 });
  await page.mouse.move(wb.x + 20, wb.y + 20, { steps: 10 }); await page.mouse.up();
  await page.waitForTimeout(300);
  const sock = await page.evaluate(() => window.VELSCOUR.G.char.equip.weapon.gems.length);
  console.log('weapon gems after drag:', sock);
  if (sock < 1) { console.log('FAIL: gem was not socketed'); process.exitCode = 1; }
  await shot('ui3_socket');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.VELSCOUR.G.ui.anyOpen());
  await page.evaluate(() => window.VELSCOUR.G.ui.vendor.open('gems'));
  await page.waitForTimeout(400);
  await shot('ui4_gems');
  await page.getByRole('button', { name: /^Fuse 3.*Sapphire/ }).click();
  const fused = await page.evaluate(() => window.VELSCOUR.G.char.bag.some((b) => b && b.gem === 'sapphire' && b.tier === 1));
  if (!fused) throw new Error('Gem fusion failed');
  await page.waitForTimeout(200);
  await page.evaluate(() => window.VELSCOUR.G.ui.vendor.open('upgrade'));
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.VELSCOUR.G.ui.selected = { where: 'equip', slot: 'weapon' }; window.VELSCOUR.G.ui.refresh(); });
  await page.click('text=/Upgrade to \\+1/');
  await page.waitForTimeout(200);
  await shot('ui5_upgrade');
  // a sealed treasure takes no socket, gem, upgrade or enchantment until its seal is broken (a player socketed one)
  const seal = await page.evaluate(async () => {
    const { G } = window.VELSCOUR, c = G.char;
    const { rollItem, rollGem } = await import('/src/data/items.js'), { socketGem } = await import('/src/ui/inventory.js');
    const it = rollItem(20, { slot: 'body', rarity: 3 }); it.sealed = true; it.sockets = 1; it.gems = [];
    const gi = c.bag.findIndex((b) => !b), si = c.bag.findIndex((b, i) => !b && i !== gi);
    c.bag[gi] = rollGem(10); c.bag[si] = it; c.gold += 1e6;
    const ok = socketGem(gi, { where: 'bag', idx: si });
    const out = {};
    for (const v of ['socket', 'upgrade', 'enchant']) {
      G.ui.vendor.open(v); G.ui.selected = { where: 'bag', idx: si }; G.ui.refresh();
      const box = document.querySelector('.service-box');
      out[v] = { note: /Break the seal first/.test(box.textContent), buttons: [...box.querySelectorAll('button')].length };
    }
    G.ui.closeAll(); c.bag[gi] = null; c.bag[si] = null; G.ui.selected = null;
    return { ok, gems: it.gems.length, sockets: it.sockets, upg: it.upg || 0, out };
  });
  console.log('sealed:', JSON.stringify(seal));
  if (seal.ok || seal.gems || seal.sockets !== 1 || seal.upg || Object.values(seal.out).some((o) => !o.note || o.buttons)) throw new Error('A sealed treasure took a gem, socket, upgrade or enchantment: ' + JSON.stringify(seal));
  await page.evaluate(() => window.VELSCOUR.G.ui.vendor.open('gamble'));
  await page.click('text=/Weapon/');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({ gold: window.VELSCOUR.G.char.gold, upg: window.VELSCOUR.G.char.equip.weapon.upg, bag: window.VELSCOUR.G.char.bag.filter(Boolean).map((b) => b.type + ':' + (b.gem || b.slot) + ':' + (b.tier ?? b.rarity) + 'x' + (b.count || 1)).join(' ') }));
  console.log(JSON.stringify(after));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.VELSCOUR.G.ui.anyOpen());
  await page.evaluate(() => { window.VELSCOUR.G.world.portals[0].use(); });
  await page.waitForTimeout(300);
  await shot('ui6_portal');
  report(errors, 20);
  await browser.close();
})();
