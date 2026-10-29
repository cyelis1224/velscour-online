const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8123';
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

(async () => {
  console.log('--- STARTING CHAMPION UNSEAL MULTIPLAYER SYNC TEST ---');
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
      const hero = S.newCharData('paladin', 'ChampionSlayer');
      hero.level = 20;
      hero.depth = 1;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p2.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('wizard', 'DungeonExplorer');
      hero.level = 20;
      hero.depth = 1;
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
    console.log('Both players in lobby.');

    // P1 creates room
    await p1.click('button:has-text("CREATE GAME")');
    await p1.waitForTimeout(300);
    const roomName = 'UnsealSync_' + Math.floor(Math.random() * 10000);
    await p1.fill('#d2-create-name', roomName);
    await p1.click('.d2-create-view button:has-text("CREATE GAME")');

    await p1.waitForFunction(() => window.VELSCOUR.G.mode === 'game' && window.VELSCOUR.G.world?.kind === 'town');
    console.log('P1 created and entered game in town.');

    // P2 joins room
    await p2.waitForTimeout(800);
    await p2.click('button:has-text("JOIN GAME")');
    await p2.waitForTimeout(600);

    // Click the game in list
    const roomSelector = `.d2-game-row:has-text("${roomName}")`;
    await p2.waitForSelector(roomSelector, { timeout: 5000 });
    await p2.click(roomSelector);
    await p2.waitForTimeout(300);
    await p2.click('.d2-join-view button:has-text("JOIN GAME")');

    await p2.waitForFunction(() => window.VELSCOUR.G.mode === 'game' && window.VELSCOUR.G.world?.kind === 'town');
    console.log('P2 successfully joined room and entered town.');

    await p1.waitForTimeout(1000);
    await p2.waitForTimeout(1000);

    // TEST 1: Real-time broadcast when both are in dungeon and P1 kills champion while P2 is far away
    console.log('\n--- TEST 1: Both in dungeon, P1 kills champion far away from P2 ---');
    // Position both players at town portal
    await p1.evaluate(() => {
      const portal = window.VELSCOUR.G.world.portals[0];
      window.VELSCOUR.G.player.x = portal.x;
      window.VELSCOUR.G.player.y = portal.y;
      window.VELSCOUR.G.char.nextBiome = 'catacombs';
    });
    await p2.evaluate(() => {
      const portal = window.VELSCOUR.G.world.portals[0];
      window.VELSCOUR.G.player.x = portal.x;
      window.VELSCOUR.G.player.y = portal.y;
    });

    await p1.evaluate(() => window.VELSCOUR.game.enterDungeon());
    await p2.waitForFunction(() => window.VELSCOUR.G.room?.biome === 'catacombs', null, { timeout: 5000 });
    await p2.evaluate(() => window.VELSCOUR.game.enterDungeon());

    await p1.waitForFunction(() => window.VELSCOUR.G.world?.kind === 'dungeon' && !document.querySelector('#loading:not(.hidden)'), null, { timeout: 15000 });
    await p2.waitForFunction(() => window.VELSCOUR.G.world?.kind === 'dungeon' && !document.querySelector('#loading:not(.hidden)'), null, { timeout: 15000 });
    console.log('Both players entered dungeon Depth 1.');

    // Verify exit portal starts sealed on both
    const p1ExitInitial = await p1.evaluate(() => {
      const exit = window.VELSCOUR.G.world.portals.find(p => p.type === 'exit');
      return { active: exit.active, label: exit.label };
    });
    const p2ExitInitial = await p2.evaluate(() => {
      const exit = window.VELSCOUR.G.world.portals.find(p => p.type === 'exit');
      return { active: exit.active, label: exit.label };
    });
    console.log('Initial exit portal P1:', p1ExitInitial, 'P2:', p2ExitInitial);
    if (p1ExitInitial.active || p2ExitInitial.active) throw new Error('Exit should start sealed!');

    // P2 stays at entrance while P1 slays the boss
    await p1.evaluate(async () => {
      const { hit } = await import('/src/game/combat.js');
      const boss = window.VELSCOUR.G.world.boss;
      console.log('P1 slaying boss:', boss?.name, boss?.netId);
      hit(window.VELSCOUR.G.player, boss, 999999, 'phys');
    });

    // Wait for network propagation
    await p2.waitForFunction(() => {
      const exit = window.VELSCOUR.G.world.portals.find(p => p.type === 'exit');
      return exit && exit.active === true;
    }, null, { timeout: 5000 });

    const p2ExitAfterKill = await p2.evaluate(() => {
      const exit = window.VELSCOUR.G.world.portals.find(p => p.type === 'exit');
      return { active: exit.active, label: exit.label, color: exit.color };
    });
    console.log('P2 exit portal after P1 killed boss:', p2ExitAfterKill);
    if (!p2ExitAfterKill.active) throw new Error('P2 exit portal did not unseal when P1 killed the champion!');
    console.log('✓ TEST 1 PASSED: P2 exit portal unsealed immediately via broadcast!');

    // TEST 2: Late entry / player in town when champion was slain
    console.log('\n--- TEST 2: Player enters floor AFTER champion is already slain ---');
    // P2 returns to town
    await p2.evaluate(() => {
      window.VELSCOUR.game.enterTown();
    });
    await p2.waitForFunction(() => window.VELSCOUR.G.world?.kind === 'town', null, { timeout: 10000 });
    console.log('P2 returned to town.');

    // Now P2 re-enters dungeon Depth 1 from town portal
    await p2.evaluate(() => {
      window.VELSCOUR.game.enterDungeon(1);
    });
    await p2.waitForFunction(() => window.VELSCOUR.G.world?.kind === 'dungeon' && !document.querySelector('#loading:not(.hidden)'), null, { timeout: 15000 });
    console.log('P2 re-entered dungeon Depth 1 after champion was already dead.');

    const p2ExitOnReentry = await p2.evaluate(() => {
      const exit = window.VELSCOUR.G.world.portals.find(p => p.type === 'exit');
      return { active: exit.active, label: exit.label, color: exit.color };
    });
    console.log('P2 exit portal state upon floor entry:', p2ExitOnReentry);
    if (!p2ExitOnReentry.active) {
      throw new Error(`P2 exit portal remained sealed upon entry! ${JSON.stringify(p2ExitOnReentry)}`);
    }
    console.log('✓ TEST 2 PASSED: Exit portal is already unsealed when player enters cleared floor!');

    // TEST 3: Interacting with exit portal works and doesn't get blocked
    console.log('\n--- TEST 3: Interacting with exit portal ---');
    const portalChoiceDialogOpened = await p2.evaluate(() => {
      const exit = window.VELSCOUR.G.world.portals.find(p => p.type === 'exit');
      window.VELSCOUR.game.useExit(window.VELSCOUR.G.world, exit);
      return !!document.querySelector('.portal-choice, .ui-dialog');
    });
    console.log('Portal choice dialog opened:', portalChoiceDialogOpened);
    if (!portalChoiceDialogOpened) {
      throw new Error('useExit did not open choice dialog for unsealed portal!');
    }
    console.log('✓ TEST 3 PASSED: Exit portal is fully functional and can be used!');

    console.log('\n=== ALL CHAMPION UNSEAL MULTIPLAYER TESTS PASSED! ===');
  } finally {
    await browser.close();
  }
})();
