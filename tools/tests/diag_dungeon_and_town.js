const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8123';
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

(async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
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

    await p1.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('paladin', 'PlayerOne');
      hero.level = 10;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p2.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('ranger', 'PlayerTwo');
      hero.level = 10;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p1.waitForTimeout(400);
    await p2.waitForTimeout(400);

    await p1.click('button:has-text("Continue")');
    await p2.click('button:has-text("Continue")');

    await p1.waitForSelector('#d2-lobby');
    await p2.waitForSelector('#d2-lobby');

    // Create room
    await p1.click('button:has-text("CREATE GAME")');
    await p1.waitForTimeout(300);
    const roomName = 'DiagRoom_' + Math.floor(Math.random() * 10000);
    await p1.fill('#d2-create-name', roomName);
    await p1.click('.d2-create-view button:has-text("CREATE GAME")');

    await p1.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game');
    console.log('P1 started game. State:');
    const p1Init = await p1.evaluate(() => ({
      mode: window.VELSCOUR.G.mode,
      worldKind: window.VELSCOUR.G.world?.kind,
      depth: window.VELSCOUR.G.world?.depth,
      room: window.VELSCOUR.G.room,
    }));
    console.log('P1 initial:', JSON.stringify(p1Init));

    // P2 joins
    await p2.click('button:has-text("JOIN GAME")');
    await p2.waitForTimeout(500);
    const sel = `.d2-game-row:has-text("${roomName}")`;
    await p2.waitForSelector(sel, { timeout: 8000 });
    await p2.click(sel);
    await p2.waitForTimeout(300);
    await p2.click('.d2-join-view button:has-text("JOIN GAME")');

    await p2.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game');
    console.log('P2 started game. State:');
    const p2Init = await p2.evaluate(() => ({
      mode: window.VELSCOUR.G.mode,
      worldKind: window.VELSCOUR.G.world?.kind,
      depth: window.VELSCOUR.G.world?.depth,
      room: window.VELSCOUR.G.room,
    }));
    console.log('P2 initial:', JSON.stringify(p2Init));

    await p1.waitForTimeout(1000);
    await p2.waitForTimeout(1000);

    // Now P1 clicks portal to enter dungeon
    console.log('\n--- P1 ENTERS DUNGEON VIA PORTAL ---');
    await p1.evaluate(async () => {
      const { game } = await import('/src/game/game.js');
      game.enterDungeon();
    });
    await p1.waitForFunction(() => window.VELSCOUR?.G?.world?.kind === 'dungeon');

    // Now P2 clicks portal to enter dungeon
    console.log('\n--- P2 ENTERS DUNGEON VIA PORTAL ---');
    await p2.evaluate(async () => {
      const { game } = await import('/src/game/game.js');
      game.enterDungeon();
    });
    await p2.waitForFunction(() => window.VELSCOUR?.G?.world?.kind === 'dungeon');

    await p1.waitForTimeout(1000);
    await p2.waitForTimeout(1000);

    const p1Dung = await p1.evaluate(() => ({
      worldKind: window.VELSCOUR.G.world?.kind,
      depth: window.VELSCOUR.G.world?.depth,
      biome: window.VELSCOUR.G.world?.biome?.id,
      mapW: window.VELSCOUR.G.world?.map?.w,
      mapH: window.VELSCOUR.G.world?.map?.h,
      room: window.VELSCOUR.G.room,
      creaturesCount: window.VELSCOUR.G.world?.creatures?.length,
      remotePlayers: [...(window.VELSCOUR.G.remotePlayers?.values() || [])].map(r => ({
        id: r.id, name: r.name, x: r.x, y: r.y, world: !!r.world, inWorld: window.VELSCOUR.G.world?.creatures?.includes(r),
        lastState: r._lastState
      }))
    }));

    const p2Dung = await p2.evaluate(() => ({
      worldKind: window.VELSCOUR.G.world?.kind,
      depth: window.VELSCOUR.G.world?.depth,
      biome: window.VELSCOUR.G.world?.biome?.id,
      mapW: window.VELSCOUR.G.world?.map?.w,
      mapH: window.VELSCOUR.G.world?.map?.h,
      room: window.VELSCOUR.G.room,
      creaturesCount: window.VELSCOUR.G.world?.creatures?.length,
      remotePlayers: [...(window.VELSCOUR.G.remotePlayers?.values() || [])].map(r => ({
        id: r.id, name: r.name, x: r.x, y: r.y, world: !!r.world, inWorld: window.VELSCOUR.G.world?.creatures?.includes(r),
        lastState: r._lastState
      }))
    }));

    console.log('P1 Dungeon:', JSON.stringify(p1Dung, null, 2));
    console.log('P2 Dungeon:', JSON.stringify(p2Dung, null, 2));

    // Now P1 returns to town via blue portal
    console.log('\n--- P1 RETURNS TO TOWN ---');
    await p1.evaluate(async () => {
      const { game } = await import('/src/game/game.js');
      game.enterTown();
    });
    await p1.waitForFunction(() => window.VELSCOUR?.G?.world?.kind === 'town');

    // Now P2 returns to town via blue portal
    console.log('\n--- P2 RETURNS TO TOWN ---');
    await p2.evaluate(async () => {
      const { game } = await import('/src/game/game.js');
      game.enterTown();
    });
    await p2.waitForFunction(() => window.VELSCOUR?.G?.world?.kind === 'town');

    await p1.waitForTimeout(1000);
    await p2.waitForTimeout(1000);

    const p1TownReturn = await p1.evaluate(() => ({
      worldKind: window.VELSCOUR.G.world?.kind,
      townSeed: window.VELSCOUR.G.char?.townSeed,
      roomTownSeed: window.VELSCOUR.G.room?.townSeed,
      mapW: window.VELSCOUR.G.world?.map?.w,
      mapH: window.VELSCOUR.G.world?.map?.h,
      remotePlayers: [...(window.VELSCOUR.G.remotePlayers?.values() || [])].map(r => ({
        id: r.id, name: r.name, x: r.x, y: r.y, world: !!r.world, inWorld: window.VELSCOUR.G.world?.creatures?.includes(r),
        lastState: r._lastState
      }))
    }));

    const p2TownReturn = await p2.evaluate(() => ({
      worldKind: window.VELSCOUR.G.world?.kind,
      townSeed: window.VELSCOUR.G.char?.townSeed,
      roomTownSeed: window.VELSCOUR.G.room?.townSeed,
      mapW: window.VELSCOUR.G.world?.map?.w,
      mapH: window.VELSCOUR.G.world?.map?.h,
      remotePlayers: [...(window.VELSCOUR.G.remotePlayers?.values() || [])].map(r => ({
        id: r.id, name: r.name, x: r.x, y: r.y, world: !!r.world, inWorld: window.VELSCOUR.G.world?.creatures?.includes(r),
        lastState: r._lastState
      }))
    }));

    console.log('P1 Town Return:', JSON.stringify(p1TownReturn, null, 2));
    console.log('P2 Town Return:', JSON.stringify(p2TownReturn, null, 2));

  } finally {
    await browser.close();
  }
})();
