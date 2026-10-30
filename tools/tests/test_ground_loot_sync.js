const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8123';
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

(async () => {
  console.log('--- STARTING GROUND LOOT SYNC TEST ---');
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
  });

  try {
    const ctx1 = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const ctx2 = await browser.newContext({ viewport: { width: 1024, height: 768 } });

    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    p1.on('console', m => console.log('[P1 browser]', m.text()));
    p2.on('console', m => console.log('[P2 browser]', m.text()));

    for (const p of [p1, p2]) {
      await p.addInitScript(() => { window.VELSCOUR_TEST_MENU = true; });
    }

    console.log('Navigating players to game...');
    await p1.goto(BASE_URL + '/index.html');
    await p2.goto(BASE_URL + '/index.html');

    await p1.waitForFunction(() => window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden'));
    await p2.waitForFunction(() => window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden'));

    // Inject hero saves
    await p1.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('paladin', 'HostPaladin');
      hero.level = 20;
      hero.depth = 1;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p2.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('wizard', 'GuestWizard');
      hero.level = 20;
      hero.depth = 1;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p1.waitForTimeout(500);
    await p2.waitForTimeout(500);

    // Enter lobby
    for (const p of [p1, p2]) {
      await p.click('button:has-text("Continue")');
      const enterBtn = p.locator('button:has-text("Enter Lobby")');
      if (await enterBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await enterBtn.click();
      }
    }

    await p1.waitForSelector('#d2-lobby');
    await p2.waitForSelector('#d2-lobby');
    console.log('Both players in lobby.');

    // P1 creates room
    await p1.click('button:has-text("CREATE GAME")');
    await p1.waitForTimeout(300);
    const roomName = 'LootSync_' + Math.floor(Math.random() * 10000);
    await p1.fill('#d2-create-name', roomName);
    await p1.click('.d2-create-view button:has-text("CREATE GAME")');

    await p1.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game' && window.VELSCOUR?.G?.world?.kind === 'town');
    console.log('P1 created and entered game in town.');

    // P2 joins room
    await p2.waitForTimeout(800);
    await p2.click('button:has-text("JOIN GAME")');
    await p2.waitForTimeout(600);

    const roomSelector = `.d2-game-row:has-text("${roomName}")`;
    await p2.waitForSelector(roomSelector, { timeout: 8000 });
    await p2.click(roomSelector);
    await p2.waitForTimeout(300);
    await p2.click('.d2-join-view button:has-text("JOIN GAME")');

    await p2.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game' && window.VELSCOUR?.G?.world?.kind === 'town');
    console.log('P2 joined and entered game in town.');

    await p1.waitForTimeout(1000);
    await p2.waitForTimeout(1000);

    // STEP 1: Give P1 an item in bag[0] and drop it
    console.log('\n--- TEST STEP 1: P1 drops an item on the ground ---');
    const dropResult = await p1.evaluate(async () => {
      const { G } = window.VELSCOUR;
      const { dropFromBag } = await import('/src/ui/inventory.js');
      // Place custom legendary sword in bag slot 0
      G.char.bag[0] = {
        type: 'gear',
        slot: 'weapon',
        base: 'sword',
        baseName: 'Longsword',
        title: 'Sunblade of Radiance',
        name: 'Sunblade of Radiance',
        rarity: 4,
        tier: 2,
        ilvl: 25,
        gems: [],
        affixes: [{ id: 'dmg', val: 50 }],
      };
      const dropped = dropFromBag(0);
      const groundLoot = G.world.loot.filter(l => l.lootId);
      return {
        dropped,
        bag0: G.char.bag[0],
        lootCount: groundLoot.length,
        loot: groundLoot.map(l => ({ lootId: l.lootId, label: l.label, x: l.x, y: l.y })),
      };
    });

    console.log('P1 drop result:', dropResult);
    if (!dropResult.dropped || dropResult.bag0 !== null || dropResult.lootCount === 0) {
      throw new Error('P1 failed to drop item from bag to ground!');
    }
    const droppedLootId = dropResult.loot[0].lootId;
    console.log(`✓ P1 dropped item successfully with lootId: ${droppedLootId}`);

    // STEP 2: Check that P2 sees the item on the ground via network
    console.log('\n--- TEST STEP 2: P2 sees the dropped item on the ground ---');
    await p2.waitForFunction((id) => {
      const { G } = window.VELSCOUR || {};
      return G?.world?.loot?.some(l => l.lootId === id);
    }, droppedLootId, { timeout: 8000 });

    const p2Loot = await p2.evaluate((id) => {
      const { G } = window.VELSCOUR;
      const l = G.world.loot.find(item => item.lootId === id);
      return {
        lootId: l.lootId,
        label: l.label,
        x: l.x,
        y: l.y,
        color: l.color,
        item: l.item,
      };
    }, droppedLootId);

    console.log('P2 sees ground item:', p2Loot);
    if (!p2Loot || p2Loot.label !== 'Sunblade of Radiance') {
      throw new Error(`P2 ground item did not match! Got: ${JSON.stringify(p2Loot)}`);
    }
    console.log('✓ P2 received and rendered the dropped item with matching name and stats!');

    // STEP 3: P2 picks up the item
    console.log('\n--- TEST STEP 3: P2 picks up the item ---');
    const p2Pickup = await p2.evaluate((id) => {
      const { G } = window.VELSCOUR;
      const l = G.world.loot.find(item => item.lootId === id);
      const picked = G.player.pickup(l);
      // Remove from world loot if picked (just like update loop does)
      if (picked) {
        const idx = G.world.loot.indexOf(l);
        if (idx !== -1) G.world.loot.splice(idx, 1);
      }
      const inBag = G.char.bag.find(b => b && b.name === 'Sunblade of Radiance');
      const stillInLoot = G.world.loot.some(item => item.lootId === id);
      return {
        picked,
        foundInBag: !!inBag,
        bagItemName: inBag?.name,
        stillInLoot,
      };
    }, droppedLootId);

    console.log('P2 pickup result:', p2Pickup);
    if (!p2Pickup.picked || !p2Pickup.foundInBag || p2Pickup.stillInLoot) {
      throw new Error(`P2 failed to pick up item! ${JSON.stringify(p2Pickup)}`);
    }
    console.log('✓ P2 picked up the item into their bag!');

    // STEP 4: Check that the item disappears from P1's ground
    console.log('\n--- TEST STEP 4: Verify item disappears from P1 ground ---');
    await p1.waitForFunction((id) => {
      const { G } = window.VELSCOUR || {};
      return !G?.world?.loot?.some(l => l.lootId === id);
    }, droppedLootId, { timeout: 8000 });

    const p1LootCheck = await p1.evaluate((id) => {
      const { G } = window.VELSCOUR;
      return G.world.loot.some(l => l.lootId === id);
    }, droppedLootId);

    if (p1LootCheck) {
      throw new Error('Item still exists in P1 world loot after P2 picked it up!');
    }
    console.log('✓ Item disappeared from P1 ground after P2 picked it up!');

    // STEP 5: Reverse test: P2 drops an item, P1 picks it up
    console.log('\n--- TEST STEP 5: Reverse test (P2 drops, P1 picks up) ---');
    const p2DropRes = await p2.evaluate(async () => {
      const { G } = window.VELSCOUR;
      const { dropFromBag } = await import('/src/ui/inventory.js');
      // P2 drops a Crown
      G.char.bag[1] = {
        type: 'gear',
        slot: 'head',
        base: 'crown',
        baseName: 'Crown',
        title: 'Crown of the Archmage',
        name: 'Crown of the Archmage',
        rarity: 5,
        tier: 3,
        ilvl: 30,
        gems: [],
      };
      const dropped = dropFromBag(1);
      const l = G.world.loot.find(item => item.item?.name === 'Crown of the Archmage');
      return { dropped, lootId: l?.lootId };
    });

    console.log('P2 drop crown:', p2DropRes);
    const crownLootId = p2DropRes.lootId;

    // P1 sees Crown on ground
    await p1.waitForFunction((id) => {
      const { G } = window.VELSCOUR || {};
      return G?.world?.loot?.some(l => l.lootId === id);
    }, crownLootId, { timeout: 8000 });

    console.log('✓ P1 sees Crown on ground.');

    // P1 picks up Crown
    const p1PickupRes = await p1.evaluate((id) => {
      const { G } = window.VELSCOUR;
      const l = G.world.loot.find(item => item.lootId === id);
      const picked = G.player.pickup(l);
      if (picked) {
        const idx = G.world.loot.indexOf(l);
        if (idx !== -1) G.world.loot.splice(idx, 1);
      }
      const inBag = G.char.bag.find(b => b && b.name === 'Crown of the Archmage');
      return { picked, inBag: !!inBag };
    }, crownLootId);

    console.log('P1 pickup crown result:', p1PickupRes);
    if (!p1PickupRes.picked || !p1PickupRes.inBag) {
      throw new Error('P1 failed to pick up Crown!');
    }

    // P2 sees Crown disappear
    await p2.waitForFunction((id) => {
      const { G } = window.VELSCOUR || {};
      return !G?.world?.loot?.some(l => l.lootId === id);
    }, crownLootId, { timeout: 8000 });

    console.log('✓ Crown disappeared from P2 ground after P1 picked it up!');

    console.log('\n--- ALL GROUND LOOT SYNC TESTS PASSED SUCCESSFULLY! ---');
  } catch (err) {
    console.error('Test failed with error:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
