const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8123';
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

(async () => {
  console.log('--- STARTING LEAVE & REJOIN DUPLICATION TEST ---');
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
  });

  try {
    const ctx1 = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const ctx2 = await browser.newContext({ viewport: { width: 1024, height: 768 } });

    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

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
      const hero = S.newCharData('paladin', 'HostKnight');
      hero.level = 20;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p2.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('wizard', 'GuestMage');
      hero.level = 20;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p1.waitForTimeout(500);
    await p2.waitForTimeout(500);

    // Enter lobby
    await p1.click('button:has-text("Continue")');
    await p1.waitForSelector('button:has-text("Enter Lobby")');
    await p1.click('button:has-text("Enter Lobby")');

    await p2.click('button:has-text("Continue")');
    await p2.waitForSelector('button:has-text("Enter Lobby")');
    await p2.click('button:has-text("Enter Lobby")');

    await p1.waitForSelector('#d2-lobby');
    await p2.waitForSelector('#d2-lobby');

    // P1 creates room
    await p1.click('button:has-text("CREATE GAME")');
    await p1.waitForTimeout(300);
    const roomName = 'LeaveRejoinTest_' + Math.floor(Math.random() * 10000);
    await p1.fill('#d2-create-name', roomName);
    await p1.click('.d2-create-view button:has-text("CREATE GAME")');

    await p1.waitForFunction(() => window.VELSCOUR.G.mode === 'game' && window.VELSCOUR.G.world?.kind === 'town');
    console.log('P1 created room and entered town.');

    // P2 joins room
    await p2.waitForTimeout(800);
    await p2.click('button:has-text("JOIN GAME")');
    await p2.waitForTimeout(600);

    const roomSelector = `.d2-game-row:has-text("${roomName}")`;
    await p2.waitForSelector(roomSelector, { timeout: 5000 });
    await p2.click(roomSelector);
    await p2.waitForTimeout(300);
    await p2.click('.d2-join-view button:has-text("JOIN GAME")');

    await p2.waitForFunction(() => window.VELSCOUR.G.mode === 'game' && window.VELSCOUR.G.world?.kind === 'town');
    console.log('P2 joined room and entered town.');

    // Verify P1 sees 1 remote player
    await p1.waitForFunction(() => window.VELSCOUR.G.remotePlayers && window.VELSCOUR.G.remotePlayers.size === 1);
    const countInitialP1 = await p1.evaluate(() => {
      const rpCount = window.VELSCOUR.G.remotePlayers?.size || 0;
      const creatureCount = window.VELSCOUR.G.world.creatures.filter(c => c.isRemotePlayer).length;
      return { rpCount, creatureCount };
    });
    console.log('P1 remote players after initial join:', countInitialP1);
    if (countInitialP1.rpCount !== 1 || countInitialP1.creatureCount !== 1) {
      throw new Error(`Expected exactly 1 remote player, got ${JSON.stringify(countInitialP1)}`);
    }

    // -------------------------------------------------------------
    // STEP 1: P2 leaves game room via Save & Quit
    // -------------------------------------------------------------
    console.log('\nP2 leaving room (Save & Quit to lobby)...');
    await p2.evaluate(() => {
      window.VELSCOUR.game.quitToTitle(true);
    });

    // P2 should be in lobby
    await p2.waitForSelector('#d2-lobby', { timeout: 5000 });
    console.log('P2 is back in lobby.');

    // P1 should see P2 removed completely (0 remote players)
    await p1.waitForFunction(() => {
      const rpCount = window.VELSCOUR.G.remotePlayers?.size || 0;
      const creatureCount = window.VELSCOUR.G.world?.creatures?.filter(c => c.isRemotePlayer).length || 0;
      return rpCount === 0 && creatureCount === 0;
    }, null, { timeout: 6000 });

    const countAfterLeave = await p1.evaluate(() => {
      const rpCount = window.VELSCOUR.G.remotePlayers?.size || 0;
      const creatureCount = window.VELSCOUR.G.world.creatures.filter(c => c.isRemotePlayer).length;
      return { rpCount, creatureCount };
    });
    console.log('P1 remote players after P2 left:', countAfterLeave);
    console.log('✓ Remote player was cleanly removed from town when leaving! No ghost remaining.');

    // -------------------------------------------------------------
    // STEP 2: P2 rejoins the same room
    // -------------------------------------------------------------
    console.log('\nP2 rejoining room...');
    await p2.waitForTimeout(600);
    await p2.click('button:has-text("JOIN GAME")');
    await p2.waitForTimeout(600);

    await p2.waitForSelector(roomSelector, { timeout: 5000 });
    await p2.click(roomSelector);
    await p2.waitForTimeout(300);
    await p2.click('.d2-join-view button:has-text("JOIN GAME")');

    await p2.waitForFunction(() => window.VELSCOUR.G.mode === 'game' && window.VELSCOUR.G.world?.kind === 'town');
    console.log('P2 rejoined room and entered town.');

    // P1 should now see EXACTLY 1 remote player, NOT 2!
    await p1.waitForFunction(() => window.VELSCOUR.G.remotePlayers && window.VELSCOUR.G.remotePlayers.size === 1);
    await p1.waitForTimeout(1000);

    const countAfterRejoin = await p1.evaluate(() => {
      const rpCount = window.VELSCOUR.G.remotePlayers?.size || 0;
      const creatures = window.VELSCOUR.G.world.creatures.filter(c => c.isRemotePlayer).map(c => ({
        id: c.id,
        name: c.name,
      }));
      return { rpCount, creatures };
    });
    console.log('P1 remote players after P2 rejoined:', countAfterRejoin);

    if (countAfterRejoin.rpCount !== 1) {
      throw new Error(`Expected exactly 1 remote player in G.remotePlayers, but found ${countAfterRejoin.rpCount}!`);
    }
    if (countAfterRejoin.creatures.length !== 1) {
      throw new Error(`Expected exactly 1 remote player creature in world, but found ${countAfterRejoin.creatures.length}! Duplicate character bug!`);
    }

    console.log('✓ Rejoin verified: strictly 1 character in town, NO DUPLICATES!');

    // -------------------------------------------------------------
    // STEP 3: P2 leaves and rejoins AGAIN to guarantee idempotence
    // -------------------------------------------------------------
    console.log('\nTesting second leave and rejoin cycle...');
    await p2.evaluate(() => {
      window.VELSCOUR.game.quitToTitle(true);
    });
    await p2.waitForSelector('#d2-lobby', { timeout: 5000 });
    await p1.waitForFunction(() => {
      return (window.VELSCOUR.G.remotePlayers?.size || 0) === 0 &&
             (window.VELSCOUR.G.world?.creatures?.filter(c => c.isRemotePlayer).length || 0) === 0;
    }, null, { timeout: 6000 });

    await p2.waitForTimeout(600);
    await p2.click('button:has-text("JOIN GAME")');
    await p2.waitForTimeout(600);
    await p2.waitForSelector(roomSelector, { timeout: 5000 });
    await p2.click(roomSelector);
    await p2.waitForTimeout(300);
    await p2.click('.d2-join-view button:has-text("JOIN GAME")');
    await p2.waitForFunction(() => window.VELSCOUR.G.mode === 'game' && window.VELSCOUR.G.world?.kind === 'town');

    await p1.waitForFunction(() => window.VELSCOUR.G.remotePlayers && window.VELSCOUR.G.remotePlayers.size === 1);
    await p1.waitForTimeout(1000);

    const countSecondCycle = await p1.evaluate(() => {
      const rpCount = window.VELSCOUR.G.remotePlayers?.size || 0;
      const creatures = window.VELSCOUR.G.world.creatures.filter(c => c.isRemotePlayer).map(c => ({
        id: c.id,
        name: c.name,
      }));
      return { rpCount, creatures };
    });
    console.log('P1 remote players after second rejoin:', countSecondCycle);

    if (countSecondCycle.rpCount !== 1 || countSecondCycle.creatures.length !== 1) {
      throw new Error(`Duplicate character bug reproduced on second cycle!`);
    }

    console.log('✓ Second leave/rejoin cycle verified cleanly!');
    console.log('\n========================================');
    console.log('ALL LEAVE & REJOIN TESTS PASSED!');
    console.log('========================================');
  } finally {
    await browser.close();
  }
})();
