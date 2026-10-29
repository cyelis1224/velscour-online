const { chromium } = require('playwright');
const fs = require('fs');

const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  console.log('--- STARTING ONLINE NO-PAUSE VERIFICATION TEST ---');
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

    console.log('1. Loading P1 & P2 into game...');
    await p1.goto('http://localhost:8123');
    await p2.goto('http://localhost:8123');

    await p1.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('barbarian', 'Conan');
      hero.level = 20;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });
    await p2.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('paladin', 'Uther');
      hero.level = 20;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });
    await sleep(500);

    // Enter lobby on both
    await p1.click('button:has-text("Continue")');
    await p1.waitForSelector('button:has-text("Enter Lobby")');
    await p1.click('button:has-text("Enter Lobby")');

    await p2.click('button:has-text("Continue")');
    await p2.waitForSelector('button:has-text("Enter Lobby")');
    await p2.click('button:has-text("Enter Lobby")');

    await p1.waitForSelector('#d2-lobby');
    await p2.waitForSelector('#d2-lobby');

    // P1 creates room
    const roomName = 'NoPause_' + Math.floor(Math.random() * 10000);
    console.log(`P1 creating room ${roomName}...`);
    await p1.click('button:has-text("CREATE GAME")');
    await p1.waitForSelector('#d2-create-name');
    await p1.fill('#d2-create-name', roomName);
    await p1.click('.d2-create-view button:has-text("CREATE GAME")');

    await p1.waitForFunction(() => window.VELSCOUR.G.mode === 'game' && window.VELSCOUR.G.world?.kind === 'town');
    console.log('P1 created room and entered town.');

    // P2 joins room
    const roomSelector = `.d2-game-row:has-text("${roomName}")`;
    await p2.waitForSelector(roomSelector, { timeout: 8000 });
    await p2.click(roomSelector);
    await p2.waitForTimeout(300);
    await p2.click('.d2-join-view button:has-text("JOIN GAME")');

    await p2.waitForFunction(() => window.VELSCOUR.G.mode === 'game' && window.VELSCOUR.G.world?.kind === 'town');
    console.log('P2 joined room and entered town.');
    await sleep(1000);

    // Both players enter dungeon depth 1
    console.log('2. Entering dungeon depth 1 with both players...');
    await p1.evaluate(() => window.VELSCOUR.game.enterDungeon());
    await p2.evaluate(() => window.VELSCOUR.game.enterDungeon());

    await p1.waitForFunction(() => window.VELSCOUR?.G?.world?.kind === 'dungeon', { timeout: 10000 });
    await p2.waitForFunction(() => window.VELSCOUR?.G?.world?.kind === 'dungeon', { timeout: 10000 });

    const initialStates = await Promise.all([
      p1.evaluate(() => ({
        isRoom: !!window.VELSCOUR.G.room,
        isPaused: window.VELSCOUR.G.paused,
      })),
      p2.evaluate(() => ({
        isRoom: !!window.VELSCOUR.G.room,
        isPaused: window.VELSCOUR.G.paused,
      }))
    ]);

    console.log('Initial online states:', initialStates);
    if (!initialStates[0].isRoom || !initialStates[1].isRoom) throw new Error('Not in an online room!');
    if (initialStates[0].isPaused || initialStates[1].isPaused) throw new Error('Initial state is paused!');

    // TEST 1: Open Pause Menu on P1 in dungeon
    console.log('\n--- TEST 1: Opening Pause Menu on P1 in Dungeon ---');
    await p1.evaluate(async () => {
      const { pauseMenu } = await import('/src/ui/screens.js');
      pauseMenu();
    });

    const p1MenuState = await p1.evaluate(() => ({
      hasModal: window.VELSCOUR.UI.modal,
      isPaused: window.VELSCOUR.G.paused,
      dialogTitle: document.querySelector('.dialog-box h2')?.textContent
    }));
    console.log('P1 menu state:', p1MenuState);

    if (!p1MenuState.hasModal) throw new Error('Pause menu modal dialog did not open on P1!');
    if (p1MenuState.isPaused) throw new Error('G.paused was TRUE when pause menu opened on P1 in online play!');
    console.log('✓ G.paused is correctly FALSE on P1 with pause menu open!');

    // Move P2 while P1 has the menu open, and verify P1 sees P2 moving
    console.log('Moving P2 while P1 is in Pause Menu...');
    const p2StartPos = await p2.evaluate(() => ({ x: window.VELSCOUR.G.player.x, y: window.VELSCOUR.G.player.y }));
    await p2.evaluate(() => {
      window.VELSCOUR.G.player.x += 4;
      window.VELSCOUR.G.player.y += 4;
    });

    // Wait for network update on P1
    await sleep(600);

    const p1SawP2Pos = await p1.evaluate(() => {
      const rp = [...window.VELSCOUR.G.remotePlayers.values()][0];
      return rp ? { x: rp.x, y: rp.y } : null;
    });
    console.log('P1 saw remote player position while in menu:', p1SawP2Pos);
    if (!p1SawP2Pos) throw new Error('P1 lost track of remote player while pause menu was open!');
    if (Math.abs(p1SawP2Pos.x - p2StartPos.x) < 1) {
      throw new Error('P1 did not update remote player position while pause menu was open (simulation paused)!');
    }
    console.log('✓ P1 continuously receives and interpolates remote players while in Pause Menu!');

    // Close pause menu
    await p1.evaluate(() => window.VELSCOUR.UI.closeAll());

    // TEST 2: Opening Inventory on P1
    console.log('\n--- TEST 2: Opening Inventory on P1 in Dungeon ---');
    await p1.evaluate(async () => {
      const { toggleInventory } = await import('/src/ui/inventory.js');
      toggleInventory();
    });

    const p1InvState = await p1.evaluate(() => ({
      anyOpen: window.VELSCOUR.UI.anyOpen(),
      isPaused: window.VELSCOUR.G.paused
    }));
    console.log('P1 inventory state:', p1InvState);
    if (!p1InvState.anyOpen) throw new Error('Inventory was not opened!');
    if (p1InvState.isPaused) throw new Error('G.paused was TRUE with inventory open in dungeon!');
    console.log('✓ G.paused is FALSE while inventory is open in dungeon!');

    // Close inventory
    await p1.evaluate(() => window.VELSCOUR.UI.closeAll());

    // TEST 3: G.hitStop does not freeze simulation in online play
    console.log('\n--- TEST 3: Testing hitStop non-freezing in online play ---');
    await p1.evaluate(() => {
      window.VELSCOUR.G.hitStop = 0.5; // Simulate a heavy hit
    });
    await sleep(100);
    const hitStopState = await p1.evaluate(() => ({
      hitStop: window.VELSCOUR.G.hitStop,
      isPaused: window.VELSCOUR.G.paused
    }));
    console.log('P1 hitStop state:', hitStopState);
    if (hitStopState.isPaused) throw new Error('hitStop caused G.paused to be true!');
    if (hitStopState.hitStop >= 0.5) throw new Error('hitStop was not ticking down in online play!');
    console.log('✓ hitStop decrements without pausing the world tick!');

    console.log('\n========================================');
    console.log('ALL ONLINE NO-PAUSE TESTS PASSED 100%!');
    console.log('========================================');
  } finally {
    await browser.close();
  }
})();
