const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8123';
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

(async () => {
  console.log('=== MULTIPLAYER SYNC REPRODUCTION TEST ===');
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

    await p1.goto(BASE_URL + '/index.html');
    await p2.goto(BASE_URL + '/index.html');

    await p1.waitForFunction(() => window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden'));
    await p2.waitForFunction(() => window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden'));

    // Inject characters
    await p1.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('paladin', 'P1Hero');
      hero.level = 15;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p2.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('ranger', 'P2Hero');
      hero.level = 15;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p1.waitForTimeout(300);
    await p2.waitForTimeout(300);

    await p1.click('button:has-text("Continue")');
    await p2.click('button:has-text("Continue")');

    await p1.waitForSelector('#d2-lobby');
    await p2.waitForSelector('#d2-lobby');
    console.log('1. Both players in lobby.');

    // Host creates room
    const roomName = 'SyncTest_' + Math.floor(Math.random() * 10000);
    await p1.click('button:has-text("CREATE GAME")');
    await p1.waitForTimeout(200);
    await p1.fill('#d2-create-name', roomName);
    await p1.click('.d2-create-view button:has-text("CREATE GAME")');

    await p1.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game');
    console.log('2. P1 created room and entered game. World:', await p1.evaluate(() => window.VELSCOUR.G.world?.kind));

    // P2 joins room
    await p2.click('button:has-text("JOIN GAME")');
    await p2.waitForTimeout(400);
    const roomSelector = `.d2-game-row:has-text("${roomName}")`;
    await p2.waitForSelector(roomSelector, { timeout: 5000 });
    await p2.click(roomSelector);
    await p2.waitForTimeout(200);
    await p2.click('.d2-join-view button:has-text("JOIN GAME")');

    await p2.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game');
    console.log('3. P2 joined room and entered game. World:', await p2.evaluate(() => window.VELSCOUR.G.world?.kind));

    await p1.waitForTimeout(1000);
    await p2.waitForTimeout(1000);

    const checkTownVisibility = async (tag) => {
      const p1World = await p1.evaluate(() => ({
        kind: window.VELSCOUR.G.world?.kind,
        seed: window.VELSCOUR.G.char?.townSeed,
        roomSeed: window.VELSCOUR.G.room?.townSeed,
        remoteCount: window.VELSCOUR.G.world?.creatures?.filter(c => c.isRemotePlayer).length,
      }));
      const p2World = await p2.evaluate(() => ({
        kind: window.VELSCOUR.G.world?.kind,
        seed: window.VELSCOUR.G.char?.townSeed,
        roomSeed: window.VELSCOUR.G.room?.townSeed,
        remoteCount: window.VELSCOUR.G.world?.creatures?.filter(c => c.isRemotePlayer).length,
      }));
      console.log(`[${tag}] P1 in town:`, p1World);
      console.log(`[${tag}] P2 in town:`, p2World);
      return p1World.kind === 'town' && p2World.kind === 'town' && p1World.seed === p2World.seed && p1World.remoteCount >= 1 && p2World.remoteCount >= 1;
    };

    const initialTownOk = await checkTownVisibility('Initial Town');
    console.log('Initial Town Shared & Visible:', initialTownOk);

    // TEST: P1 enters dungeon via portal, P2 enters dungeon via portal
    console.log('\n--- ENTERING DUNGEON FROM TOWN VIA PORTAL ---');
    // Check portal dialog destination for both players BEFORE entering
    const p1Dest = await p1.evaluate(() => {
      const { G } = window.VELSCOUR;
      const c = G.char;
      const depth = (G.room && G.room.depth != null) ? G.room.depth : c.depth;
      return (G.room?.biome && G.room.biome !== 'town') ? G.room.biome : c.nextBiome;
    });
    const p2Dest = await p2.evaluate(() => {
      const { G } = window.VELSCOUR;
      const c = G.char;
      const depth = (G.room && G.room.depth != null) ? G.room.depth : c.depth;
      return (G.room?.biome && G.room.biome !== 'town') ? G.room.biome : c.nextBiome;
    });
    console.log(`P1 portal shows biome: ${p1Dest}`);
    console.log(`P2 portal shows biome: ${p2Dest}`);

    // P1 enters dungeon
    await p1.evaluate(async () => {
      const { game } = await import('/src/game/game.js');
      game.enterDungeon();
    });
    await p1.waitForFunction(() => window.VELSCOUR?.G?.world?.kind === 'dungeon');

    // P2 enters dungeon
    await p2.evaluate(async () => {
      const { game } = await import('/src/game/game.js');
      game.enterDungeon();
    });
    await p2.waitForFunction(() => window.VELSCOUR?.G?.world?.kind === 'dungeon');

    await p1.waitForTimeout(1000);
    await p2.waitForTimeout(1000);

    const checkDungeonMatch = async (tag) => {
      const p1Dung = await p1.evaluate(() => ({
        depth: window.VELSCOUR.G.world?.depth,
        biome: window.VELSCOUR.G.world?.biome?.id,
        seed: window.VELSCOUR.G.room?.dungeonSeed,
        w: window.VELSCOUR.G.world?.map?.w,
        h: window.VELSCOUR.G.world?.map?.h,
        remoteCount: window.VELSCOUR.G.world?.creatures?.filter(c => c.isRemotePlayer).length,
      }));
      const p2Dung = await p2.evaluate(() => ({
        depth: window.VELSCOUR.G.world?.depth,
        biome: window.VELSCOUR.G.world?.biome?.id,
        seed: window.VELSCOUR.G.room?.dungeonSeed,
        w: window.VELSCOUR.G.world?.map?.w,
        h: window.VELSCOUR.G.world?.map?.h,
        remoteCount: window.VELSCOUR.G.world?.creatures?.filter(c => c.isRemotePlayer).length,
      }));
      console.log(`[${tag}] P1 Dungeon:`, p1Dung);
      console.log(`[${tag}] P2 Dungeon:`, p2Dung);
      const same = p1Dung.depth === p2Dung.depth && p1Dung.biome === p2Dung.biome && p1Dung.seed === p2Dung.seed && p1Dung.w === p2Dung.w && p1Dung.h === p2Dung.h;
      return { same, p1Dung, p2Dung };
    };

    const dungMatch = await checkDungeonMatch('Dungeon Depth 1');
    console.log('Both in same dungeon:', dungMatch.same);

    // TEST: Both return to town
    console.log('\n--- BOTH RETURN TO TOWN ---');
    await p1.evaluate(async () => {
      const { game } = await import('/src/game/game.js');
      game.enterTown();
    });
    await p2.evaluate(async () => {
      const { game } = await import('/src/game/game.js');
      game.enterTown();
    });

    await p1.waitForFunction(() => window.VELSCOUR?.G?.world?.kind === 'town');
    await p2.waitForFunction(() => window.VELSCOUR?.G?.world?.kind === 'town');

    await p1.waitForTimeout(1000);
    await p2.waitForTimeout(1000);

    const returnTownOk = await checkTownVisibility('Return to Town');
    console.log('Return to Town Shared & Visible:', returnTownOk);

    // TEST: Leave game and come back
    console.log('\n--- BOTH LEAVE ROOM AND COME BACK ---');
    await p1.evaluate(async () => {
      const { game } = await import('/src/game/game.js');
      game.quitToTitle(true);
    });
    await p2.evaluate(async () => {
      const { game } = await import('/src/game/game.js');
      game.quitToTitle(true);
    });

    await p1.waitForSelector('#d2-lobby', { timeout: 5000 });
    await p2.waitForSelector('#d2-lobby', { timeout: 5000 });
    console.log('Both back in lobby.');

    // P1 recreates/creates room
    const roomName2 = 'RejoinRoom_' + Math.floor(Math.random() * 10000);
    await p1.click('button:has-text("CREATE GAME")');
    await p1.waitForTimeout(200);
    await p1.fill('#d2-create-name', roomName2);
    await p1.click('.d2-create-view button:has-text("CREATE GAME")');

    await p1.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game');
    console.log('P1 in game after recreation. World:', await p1.evaluate(() => window.VELSCOUR.G.world?.kind));

    // P2 joins
    await p2.click('button:has-text("JOIN GAME")');
    await p2.waitForTimeout(400);
    const roomSelector2 = `.d2-game-row:has-text("${roomName2}")`;
    await p2.waitForSelector(roomSelector2, { timeout: 5000 });
    await p2.click(roomSelector2);
    await p2.waitForTimeout(200);
    await p2.click('.d2-join-view button:has-text("JOIN GAME")');

    await p2.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game');
    console.log('P2 in game after joining. World:', await p2.evaluate(() => window.VELSCOUR.G.world?.kind));

    await p1.waitForTimeout(1000);
    await p2.waitForTimeout(1000);

    const rejoinTownOk = await checkTownVisibility('Rejoin Town');
    console.log('Rejoin Town Shared & Visible:', rejoinTownOk);

  } finally {
    await browser.close();
  }
})();
