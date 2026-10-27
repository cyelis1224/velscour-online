const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8123';
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

async function run() {
  console.log('--- STARTING MULTIPLAYER GOLD DROP & PICKUP TEST ---');

  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
  });

  try {
    const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });

    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    await p1.addInitScript(() => { window.VELSCOUR_TEST_MENU = true; });
    await p2.addInitScript(() => { window.VELSCOUR_TEST_MENU = true; });

    console.log('1. Loading both players...');
    await Promise.all([
      p1.goto(`${BASE_URL}/index.html`),
      p2.goto(`${BASE_URL}/index.html`),
    ]);

    await Promise.all([
      p1.waitForFunction(() => window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden')),
      p2.waitForFunction(() => window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden')),
    ]);

    // Setup characters with gold
    await p1.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('paladin', 'MidasHost');
      hero.level = 20;
      hero.gold = 5000;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p2.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('wizard', 'MidasGuest');
      hero.level = 15;
      hero.gold = 100;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p1.waitForTimeout(500);
    await p2.waitForTimeout(500);

    // Enter lobby
    console.log('2. Entering lobby...');
    await p1.click('button:has-text("Continue")');
    await p2.click('button:has-text("Continue")');

    await p1.waitForSelector('#d2-lobby');
    await p2.waitForSelector('#d2-lobby');
    console.log('Both players in lobby.');

    // P1 creates room
    await p1.click('button:has-text("CREATE GAME")');
    await p1.waitForTimeout(300);
    const roomName = 'GoldDrop_' + Math.floor(Math.random() * 10000);
    await p1.fill('#d2-create-name', roomName);
    await p1.click('.d2-create-view button:has-text("CREATE GAME")');

    await p1.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game' && window.VELSCOUR?.G?.world?.kind === 'town');
    console.log('P1 created and entered game in town.');

    // P2 joins room
    console.log('3. P2 joining room...');
    await p2.click('button:has-text("JOIN GAME")');
    await p2.waitForTimeout(500);

    const roomSelector = `.d2-game-row:has-text("${roomName}")`;
    await p2.waitForSelector(roomSelector, { timeout: 8000 });
    await p2.click(roomSelector);
    await p2.waitForTimeout(300);
    await p2.click('.d2-join-view button:has-text("JOIN GAME")');

    await p2.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game' && window.VELSCOUR?.G?.world?.kind === 'town');
    console.log('P2 entered game in town.');

    await p1.waitForTimeout(800);
    await p2.waitForTimeout(800);

    // 4. Test P1 opening inventory and clicking gold
    console.log('4. P1 opening inventory and clicking gold icon...');
    await p1.evaluate(async () => {
      const { toggleInventory } = await import('/src/ui/inventory.js');
      toggleInventory();
    });

    await p1.waitForSelector('#inv-gold-display', { state: 'visible', timeout: 5000 });
    const goldDisplayInfo = await p1.evaluate(() => {
      const el = document.getElementById('inv-gold-display');
      return {
        text: el ? el.innerText.trim() : null,
        cursor: window.getComputedStyle(el).cursor,
      };
    });
    console.log('P1 inventory gold display info:', goldDisplayInfo);
    if (!goldDisplayInfo.text || !goldDisplayInfo.text.includes('5,000')) {
      throw new Error('Gold display does not show 5,000 gold');
    }

    // Click the gold icon to open Drop Gold modal
    await p1.click('#inv-gold-display');
    await p1.waitForSelector('#drop-gold-input', { state: 'visible', timeout: 5000 });
    console.log('✓ Drop Gold Modal successfully opened!');

    // Capture screenshot of the Drop Gold modal dialog
    await p1.screenshot({ path: '/home/dagyr/.gemini/antigravity-ide/brain/6bb481c7-fe94-4fc6-ab53-82e8cede2761/drop_gold_modal_dialog.png' });

    // Test shortcut buttons in modal (click "50%")
    console.log('Testing 50% shortcut button...');
    await p1.click('button[data-pct="50"]');
    const val50 = await p1.inputValue('#drop-gold-input');
    console.log('Value after 50% click:', val50);
    if (val50 !== '2500') throw new Error(`Expected 2500, got ${val50}`);

    // Set custom value: 750 gold
    await p1.fill('#drop-gold-input', '750');

    // Click Drop button
    console.log('Dropping 750 gold...');
    await p1.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.dialog-box button'));
      const dropBtn = btns.find(b => b.innerText.trim() === 'Drop');
      if (dropBtn) dropBtn.click();
    });

    // Verify P1 gold decreased to 4250
    const p1RemainingGold = await p1.evaluate(() => window.VELSCOUR.G.char.gold);
    console.log('P1 remaining gold:', p1RemainingGold);
    if (p1RemainingGold !== 4250) {
      throw new Error(`Expected P1 to have 4250 gold, got ${p1RemainingGold}`);
    }
    console.log('✓ P1 gold correctly deducted to 4250!');

    // Verify gold item appeared on the floor for P1
    const p1GoldLoot = await p1.evaluate(() => {
      const l = window.VELSCOUR.G.world.loot.find(item => item.kind === 'gold' && item.amount === 750);
      return l ? { amount: l.amount, lootId: l.lootId, x: l.x, y: l.y } : null;
    });
    console.log('P1 sees gold on ground:', p1GoldLoot);
    if (!p1GoldLoot) throw new Error('Gold pile not found in P1 world.loot');

    // 5. Verify P2 sees the 750 gold pile in their world!
    console.log('5. Checking if P2 sees the 750 gold pile...');
    await p2.waitForFunction(() => {
      const loot = window.VELSCOUR?.G?.world?.loot || [];
      return loot.some(l => l.kind === 'gold' && l.amount === 750);
    }, { timeout: 6000 });

    const p2GoldLoot = await p2.evaluate(() => {
      const l = window.VELSCOUR.G.world.loot.find(item => item.kind === 'gold' && item.amount === 750);
      return l ? { amount: l.amount, lootId: l.lootId, x: l.x, y: l.y } : null;
    });
    console.log('✓ P2 sees gold on ground across network:', p2GoldLoot);
    if (!p2GoldLoot || p2GoldLoot.amount !== 750) throw new Error('P2 failed to receive synced gold drop');

    // Capture screenshot of dropped gold in multiplayer
    await p2.screenshot({ path: '/home/dagyr/.gemini/antigravity-ide/brain/6bb481c7-fe94-4fc6-ab53-82e8cede2761/drop_gold_on_floor_multiplayer.png' });

    // 6. P2 walks over / picks up the 750 gold!
    console.log('6. P2 picking up the 750 gold...');
    await p2.evaluate(() => {
      const G = window.VELSCOUR.G;
      const goldItem = G.world.loot.find(l => l.kind === 'gold' && l.amount === 750);
      if (goldItem) {
        G.player.x = goldItem.x;
        G.player.y = goldItem.y;
        G.player.pickup(goldItem);
      }
    });

    // Verify P2 gold increased by 750 (100 + 750 = 850)
    const p2GoldAfterPickup = await p2.evaluate(() => window.VELSCOUR.G.char.gold);
    console.log('P2 gold after pickup:', p2GoldAfterPickup);
    if (p2GoldAfterPickup !== 850) {
      throw new Error(`Expected P2 to have 850 gold, got ${p2GoldAfterPickup}`);
    }
    console.log('✓ P2 successfully picked up 750 gold (+750 added to balance)!');

    // 7. Verify the gold pile disappears for P1 and P2!
    console.log('7. Verifying gold disappears for both players...');
    await p1.waitForFunction(() => {
      const loot = window.VELSCOUR?.G?.world?.loot || [];
      return !loot.some(l => l.kind === 'gold' && l.amount === 750);
    }, { timeout: 6000 });

    const p1HasGoldPile = await p1.evaluate(() => {
      return (window.VELSCOUR?.G?.world?.loot || []).some(l => l.kind === 'gold' && l.amount === 750);
    });
    console.log('P1 still has 750 gold pile on ground (expected false):', p1HasGoldPile);
    if (p1HasGoldPile) throw new Error('Gold pile did not disappear from P1 screen after P2 picked it up');

    console.log('✓ Gold pile successfully disappeared for both players!');
    console.log('--- ALL MULTIPLAYER GOLD DROP & PICKUP TESTS PASSED! ---');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
