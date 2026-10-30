// Desktop window movement, inventory transfers and mobile panel layout.
// TEST_FROM_DISK=1 CHROMIUM_PATH=/usr/bin/chromium node tools/tests/ui_facelift.js
const { openGame, report } = require('./harness');

(async () => {
  const { browser, page, errors, shot } = await openGame({ width: 1440, height: 900 });
  try {
    await page.evaluate(async () => {
      await window.VELSCOUR.game.newChar('death_knight', 'Window Tester');
      const { rollItem, makeGem } = await import('/src/data/items.js');
      const { addToBag } = await import('/src/game/player.js');
      const { G } = window.VELSCOUR;
      G.char.gold = 50000;
      addToBag(G.char, rollItem(20, { slot: 'weapon', rarity: 3 }));
      addToBag(G.char, makeGem('ruby', 2));
      G.ui.openPanel('inventory', 'Inventory & Character', (await import('/src/ui/inventory.js')).renderInventory);
    });
    await page.locator('[data-panel="inventory"]').waitFor();
    const panel = page.locator('[data-panel="inventory"]');
    const before = await panel.boundingBox();
    const head = await panel.locator('.panel-head').boundingBox();
    await page.mouse.move(head.x + 80, head.y + 20);
    await page.mouse.down();
    await page.mouse.move(head.x + 170, head.y + 75, { steps: 6 });
    await page.mouse.up();
    const after = await panel.boundingBox();
    if (after.x - before.x < 60 || after.y - before.y < 35) throw new Error('Desktop panel did not move');
    await shot('ui_facelift_inventory');
    await page.getByRole('button', { name: 'Character Sheet' }).click();
    if (!await page.locator('.character-card').isVisible()) throw new Error('Character tab missing');
    await shot('ui_facelift_character');
    await page.getByRole('button', { name: 'Inventory & Gear' }).click();

    const transfers = await page.evaluate(async () => {
      const { G } = window.VELSCOUR;
      const { Stash } = await import('/src/ui/stash.js');
      Stash.open();
      const idx = G.char.bag.findIndex(Boolean);
      Stash.store(idx);
      const stored = G.char.stash.filter(Boolean).length;
      Stash.take(G.char.stash.findIndex(Boolean));
      return { stored, back: G.char.stash.filter(Boolean).length, bag: G.char.bag.filter(Boolean).length };
    });
    if (transfers.stored !== 1 || transfers.back !== 0 || transfers.bag < 2) throw new Error('Stash transfer failed: ' + JSON.stringify(transfers));
    await page.evaluate(() => {
      const { G } = window.VELSCOUR;
      G.ui.stash.store(G.char.bag.findIndex((it) => it?.type === 'gem'));
    });
    await page.locator('.storage-search').fill('ruby');
    const visible = await page.locator('.stash-grid .bslot:visible').count();
    if (visible !== 1) throw new Error('Stash search failed');
    await page.locator('.stash-grid .bslot:visible').click();
    if (!await page.getByRole('button', { name: 'Take to backpack' }).isVisible()) throw new Error('Stash item action missing');
    await shot('ui_facelift_stash');
    await page.getByRole('button', { name: 'Take to backpack' }).click();
    if (await page.locator('.stash-grid .bslot:visible').count()) throw new Error('Stash take action failed');
    await page.evaluate(() => window.VELSCOUR.G.ui.vendor.open('weapons'));
    const pair = await page.locator('.vendor-panel, [data-panel="inventory"]').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, right: r.right }; }));
    if (pair[0].right > pair[1].x && pair[1].right > pair[0].x) throw new Error('Paired windows overlap');
    await shot('ui_facelift_vendor');
    await page.evaluate(async () => {
      const { G } = window.VELSCOUR;
      const { Reliquary } = await import('/src/ui/reliquary.js');
      Reliquary.open();
      Reliquary.store(G.char.bag.findIndex((it) => it?.type === 'gear'));
    });
    await page.locator('.rel-grid .bslot').first().click();
    if (!await page.getByRole('button', { name: 'Take to backpack' }).isVisible()) throw new Error('Reliquary item action missing');
    await shot('ui_facelift_reliquary');
    await page.setViewportSize({ width: 1068, height: 658 });
    await page.evaluate(() => window.VELSCOUR.G.ui.vendor.open('armor'));
    const compactPair = await page.locator('.vendor-panel, [data-panel="inventory"]').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, right: r.right }; }));
    if (compactPair[0].right > compactPair[1].x && compactPair[1].right > compactPair[0].x) throw new Error('Compact paired windows overlap');
    await shot('ui_facelift_compact');
    report(errors);
  } finally { await browser.close(); }

  const mobile = await openGame({ width: 844, height: 390, mobile: true });
  try {
    await mobile.page.evaluate(async () => {
      await window.VELSCOUR.game.newChar('paladin', 'Mobile Tester');
      const { G } = window.VELSCOUR;
      G.ui.openPanel('inventory', 'Inventory & Character', (await import('/src/ui/inventory.js')).renderInventory);
    });
    const position = await mobile.page.locator('[data-panel="inventory"]').evaluate((el) => getComputedStyle(el).position);
    if (position === 'absolute') throw new Error('Mobile panel used desktop positioning');
    await mobile.shot('ui_facelift_mobile');
    await mobile.page.evaluate(async () => {
      const { G } = window.VELSCOUR;
      const { addToBag } = await import('/src/game/player.js');
      const { makeGem } = await import('/src/data/items.js');
      const { Stash } = await import('/src/ui/stash.js');
      addToBag(G.char, makeGem('ruby', 1));
      Stash.open();
      Stash.store(G.char.bag.findIndex((it) => it?.type === 'gem'));
    });
    await mobile.page.locator('.stash-grid .bslot').first().tap();
    await mobile.page.getByRole('button', { name: 'Take to backpack' }).tap();
    const returned = await mobile.page.evaluate(() => window.VELSCOUR.G.char.bag.some((it) => it?.gem === 'ruby'));
    if (!returned) throw new Error('Mobile stash tap transfer failed');
    report(mobile.errors);
  } finally { await mobile.browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
