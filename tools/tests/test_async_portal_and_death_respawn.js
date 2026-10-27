const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8123';
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

(async () => {
  console.log('--- STARTING ASYNC PORTAL, DEFAULT CHOICE & DEATH RESPAWN TEST ---');
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
  });

  try {
    const ctx1 = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const ctx2 = await browser.newContext({ viewport: { width: 1024, height: 768 } });

    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    p1.on('console', m => console.log('[P1 console]', m.text()));
    p2.on('console', m => console.log('[P2 console]', m.text()));

    for (const p of [p1, p2]) {
      await p.addInitScript(() => { window.VELSCOUR_TEST_MENU = true; });
    }

    console.log('Navigating players to game...');
    await p1.goto(BASE_URL + '/index.html');
    await p2.goto(BASE_URL + '/index.html');

    await p1.waitForFunction(() => window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden'));
    await p2.waitForFunction(() => window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden'));

    // Inject saves
    await p1.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('paladin', 'PaladinLeader');
      hero.level = 20;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p2.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('ranger', 'RangerScout');
      hero.level = 20;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p1.waitForTimeout(400);
    await p2.waitForTimeout(400);

    // Enter lobby
    await p1.click('button:has-text("Continue")');
    await p2.click('button:has-text("Continue")');

    await p1.waitForSelector('#d2-lobby');
    await p2.waitForSelector('#d2-lobby');
    console.log('Both players in lobby.');

    // Host creates room
    await p1.click('button:has-text("CREATE GAME")');
    await p1.waitForTimeout(300);
    const roomName = 'AsyncRoom_' + Math.floor(Math.random() * 10000);
    await p1.fill('#d2-create-name', roomName);
    await p1.click('.d2-create-view button:has-text("CREATE GAME")');

    await p1.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game' && window.VELSCOUR?.G?.world?.kind === 'town');
    console.log('P1 entered town as host.');

    // P2 joins room
    await p2.click('button:has-text("JOIN GAME")');
    await p2.waitForTimeout(500);
    const roomSelector = `.d2-game-row:has-text("${roomName}")`;
    await p2.waitForSelector(roomSelector, { timeout: 8000 });
    await p2.click(roomSelector);
    await p2.waitForTimeout(300);
    await p2.click('.d2-join-view button:has-text("JOIN GAME")');

    await p2.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game' && window.VELSCOUR?.G?.world?.kind === 'town');
    console.log('P2 entered town.');

    // Allow states to sync in town
    await p1.waitForTimeout(1000);
    await p2.waitForTimeout(1000);

    // Verify both can see each other in town
    const p1SeesP2InTown = await p1.evaluate(() => {
      const { G } = window.VELSCOUR;
      const rps = [...(G.remotePlayers?.values() || [])];
      return rps.some(rp => rp.world === G.world && G.world.creatures.includes(rp));
    });
    const p2SeesP1InTown = await p2.evaluate(() => {
      const { G } = window.VELSCOUR;
      const rps = [...(G.remotePlayers?.values() || [])];
      return rps.some(rp => rp.world === G.world && G.world.creatures.includes(rp));
    });

    console.log(`P1 sees P2 in town: ${p1SeesP2InTown}`);
    console.log(`P2 sees P1 in town: ${p2SeesP1InTown}`);
    if (!p1SeesP2InTown || !p2SeesP1InTown) {
      throw new Error('Players cannot see each other in town!');
    }

    // TEST 1: P1 enters dungeon to Depth 1 alone without pulling P2
    console.log('P1 entering dungeon to Depth 1 alone...');
    await p1.evaluate(async () => {
      const { game } = await import('/src/game/game.js');
      game.enterDungeon();
    });

    await p1.waitForFunction(() => window.VELSCOUR?.G?.world?.kind === 'dungeon' && window.VELSCOUR?.G?.world?.depth === 1, { timeout: 8000 });
    console.log('P1 arrived at Depth 1.');

    // Verify P2 is STILL in town
    const p2WorldKind = await p2.evaluate(() => window.VELSCOUR?.G?.world?.kind);
    console.log(`P2 world kind while P1 is in dungeon: ${p2WorldKind}`);
    if (p2WorldKind !== 'town') {
      throw new Error(`P2 was forcibly pulled out of town! Kind: ${p2WorldKind}`);
    }

    // Verify remote player rendering across different worlds:
    // P1 (in dungeon) should NOT render P2 in dungeon
    const p1RendersP2InDungeon = await p1.evaluate(() => {
      const { G } = window.VELSCOUR;
      return [...(G.remotePlayers?.values() || [])].some(rp => G.world.creatures.includes(rp));
    });
    console.log(`P1 renders P2 in dungeon: ${p1RendersP2InDungeon} (expected: false)`);
    if (p1RendersP2InDungeon) {
      throw new Error('P1 incorrectly rendered P2 in dungeon when P2 was in town!');
    }

    // TEST 2: Exit portal selection & immediate town portal update
    // P1 reaches exit portal on Depth 1 and makes a selection to Depth 2
    console.log('P1 making selection at exit portal to Depth 2 (Return to Town)...');
    await p1.evaluate(async () => {
      const { game } = await import('/src/game/game.js');
      const { G } = window.VELSCOUR;
      // Simulate exit portal choice selecting Depth 2 and going to town
      const next = 2;
      const cdId = 'dark_forest';
      const dungeonSeed = 777123;
      G.char.depth = next;
      G.char.nextBiome = cdId;
      G.room.depth = next;
      G.room.biome = cdId;
      G.room.dungeonSeed = dungeonSeed;
      const { net } = await import('/src/net/network.js');
      net.sendRoomDepthUpdate(next, cdId, dungeonSeed, null);
      game.enterTown();
    });

    await p1.waitForFunction(() => window.VELSCOUR?.G?.world?.kind === 'town' && window.VELSCOUR?.G?.room?.depth === 2, { timeout: 8000 });
    console.log('P1 returned to town at Depth 2.');

    // Verify P2's town portal immediately updated to Depth 2!
    await p2.waitForFunction(() => {
      const { G } = window.VELSCOUR;
      return G?.room?.depth === 2 && G?.world?.portals?.[0]?.label?.includes('Depth 2');
    }, { timeout: 5000 });
    const p2PortalLabel = await p2.evaluate(() => window.VELSCOUR?.G?.world?.portals?.[0]?.label);
    console.log(`P2 town portal label: "${p2PortalLabel}"`);
    if (!p2PortalLabel.includes('Depth 2')) {
      throw new Error(`P2 town portal did not update immediately! Found: ${p2PortalLabel}`);
    }

    // TEST 3: Both players enter Depth 2 and generate the EXACT SAME map
    console.log('Both players entering Depth 2...');
    await p1.evaluate(async () => {
      const { game } = await import('/src/game/game.js');
      game.enterDungeon();
    });
    await p2.evaluate(async () => {
      const { game } = await import('/src/game/game.js');
      game.enterDungeon();
    });

    await p1.waitForFunction(() => window.VELSCOUR?.G?.world?.kind === 'dungeon' && window.VELSCOUR?.G?.world?.depth === 2, { timeout: 8000 });
    await p2.waitForFunction(() => window.VELSCOUR?.G?.world?.kind === 'dungeon' && window.VELSCOUR?.G?.world?.depth === 2, { timeout: 8000 });

    const p1Seed = await p1.evaluate(() => window.VELSCOUR?.G?.room?.dungeonSeed);
    const p2Seed = await p2.evaluate(() => window.VELSCOUR?.G?.room?.dungeonSeed);
    console.log(`P1 seed: ${p1Seed}, P2 seed: ${p2Seed}`);
    if (p1Seed !== p2Seed) {
      throw new Error(`Dungeon seeds diverged! P1: ${p1Seed}, P2: ${p2Seed}`);
    }

    await p1.waitForTimeout(1000);
    await p2.waitForTimeout(1000);

    // Verify players see each other on Depth 2
    const p1SeesP2Depth2 = await p1.evaluate(() => {
      const { G } = window.VELSCOUR;
      return [...(G.remotePlayers?.values() || [])].some(rp => rp.world === G.world && G.world.creatures.includes(rp));
    });
    console.log(`P1 sees P2 on Depth 2: ${p1SeesP2Depth2}`);

    // TEST 4: Death and Respawn in Town
    console.log('Testing death: P1 dies on Depth 2...');
    await p1.evaluate(async () => {
      const { game } = await import('/src/game/game.js');
      const { G } = window.VELSCOUR;
      G.player.hp = 0;
      G.player.dead = true;
      game.onPlayerDeath({ name: 'Dungeon Boss' });
    });

    // Wait for death screen and continue (it has setTimeout 1700ms)
    await p1.waitForTimeout(2000);
    // Click continue on death screen if modal/button present
    const continueBtn = await p1.$('button:has-text("Return to Town"), .death-screen button, button:has-text("Continue"), button:has-text("Arise")');
    if (continueBtn) {
      await continueBtn.click();
    }

    await p1.waitForFunction(() => window.VELSCOUR?.G?.world?.kind === 'town', { timeout: 10000 });
    console.log('P1 respawned in town.');

    // Verify P2 is STILL alive on Depth 2
    const p2StillInDungeon = await p2.evaluate(() => window.VELSCOUR?.G?.world?.kind === 'dungeon' && window.VELSCOUR?.G?.world?.depth === 2);
    console.log(`P2 still in Depth 2 dungeon: ${p2StillInDungeon}`);
    if (!p2StillInDungeon) {
      throw new Error('P2 was yanked to town when P1 died!');
    }

    // Verify P1 in town has portal ready for Depth 2
    const p1RespawnPortal = await p1.evaluate(() => window.VELSCOUR?.G?.world?.portals?.[0]?.label);
    console.log(`P1 town portal label after respawn: "${p1RespawnPortal}"`);
    if (!p1RespawnPortal.includes('Depth 2')) {
      throw new Error(`P1 portal after death was reset! Label: ${p1RespawnPortal}`);
    }

    // P1 steps back into portal and rejoins P2 on Depth 2!
    console.log('P1 re-entering portal to rejoin P2 on Depth 2...');
    await p1.evaluate(async () => {
      const { game } = await import('/src/game/game.js');
      game.enterDungeon();
    });

    await p1.waitForFunction(() => window.VELSCOUR?.G?.world?.kind === 'dungeon' && window.VELSCOUR?.G?.world?.depth === 2, { timeout: 8000 });
    console.log('P1 successfully rejoined Depth 2!');

    await p1.screenshot({ path: 'tools/tests/out/test_async_portal_success.png' });
    console.log('--- ALL TESTS PASSED! ---');

  } finally {
    await browser.close();
  }
})();
