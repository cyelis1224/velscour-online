const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8123';
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

(async () => {
  console.log('--- STARTING PLAYER JOIN NO-PULL TEST ---');
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
      const hero = S.newCharData('paladin', 'ExistingHost');
      hero.level = 20;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p2.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('wizard', 'JoiningGuest');
      hero.level = 15;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p1.waitForTimeout(500);
    await p2.waitForTimeout(500);

    // Enter lobby
    await p1.click('button:has-text("Continue")');
    await p2.click('button:has-text("Continue")');

    await p1.waitForSelector('#d2-lobby');
    await p2.waitForSelector('#d2-lobby');
    console.log('Both players in lobby.');

    // P1 creates room
    await p1.click('button:has-text("CREATE GAME")');
    await p1.waitForTimeout(300);
    const roomName = 'NoPull_' + Math.floor(Math.random() * 10000);
    await p1.fill('#d2-create-name', roomName);
    await p1.click('.d2-create-view button:has-text("CREATE GAME")');

    await p1.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game' && window.VELSCOUR?.G?.world?.kind === 'town');
    console.log('P1 created and entered game in town.');

    // P1 moves away from spawn (to custom location, e.g. stash/well)
    const customPos = await p1.evaluate(() => {
      const { G } = window.VELSCOUR;
      // Move 10 tiles away from current position
      G.player.x += 10;
      G.player.y += 8;
      return { x: G.player.x, y: G.player.y };
    });
    console.log(`P1 moved away from spawn to: x=${customPos.x.toFixed(2)}, y=${customPos.y.toFixed(2)}`);

    // P2 joins room
    console.log('P2 joining room now...');
    await p2.click('button:has-text("JOIN GAME")');
    await p2.waitForTimeout(500);

    const roomSelector = `.d2-game-row:has-text("${roomName}")`;
    await p2.waitForSelector(roomSelector, { timeout: 8000 });
    await p2.click(roomSelector);
    await p2.waitForTimeout(300);
    await p2.click('.d2-join-view button:has-text("JOIN GAME")');

    await p2.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game' && window.VELSCOUR?.G?.world?.kind === 'town');
    console.log('P2 entered game in town.');

    // Wait a moment for network packets
    await p1.waitForTimeout(1000);
    await p2.waitForTimeout(1000);

    // Check P1 position: it MUST NOT have moved back to spawn!
    const p1PosAfter = await p1.evaluate(() => {
      const { G } = window.VELSCOUR;
      return { x: G.player.x, y: G.player.y };
    });
    console.log(`P1 position after P2 joined: x=${p1PosAfter.x.toFixed(2)}, y=${p1PosAfter.y.toFixed(2)}`);

    const dx = Math.abs(p1PosAfter.x - customPos.x);
    const dy = Math.abs(p1PosAfter.y - customPos.y);

    if (dx > 0.01 || dy > 0.01) {
      throw new Error(`P1 was moved when P2 joined! Expected (${customPos.x.toFixed(2)}, ${customPos.y.toFixed(2)}) but got (${p1PosAfter.x.toFixed(2)}, ${p1PosAfter.y.toFixed(2)})`);
    }

    console.log('✓ P1 was NOT pulled or moved when P2 joined!');

    // Verify P1 sees P2 as a remote player
    const p1SeesP2 = await p1.evaluate(() => {
      const { G } = window.VELSCOUR;
      return G.remotePlayers && G.remotePlayers.size > 0;
    });

    if (!p1SeesP2) {
      throw new Error('P1 does not see P2 in remotePlayers!');
    }
    console.log('✓ P1 sees P2 as RemotePlayer.');

    // Verify P2 sees P1 as a remote player at P1's position
    const p2SeesP1 = await p2.evaluate((expected) => {
      const { G } = window.VELSCOUR;
      if (!G.remotePlayers || G.remotePlayers.size === 0) return null;
      const rp = Array.from(G.remotePlayers.values())[0];
      return {
        x: rp.x,
        y: rp.y,
        dx: Math.abs(rp.x - expected.x),
        dy: Math.abs(rp.y - expected.y),
      };
    }, customPos);

    console.log('P2 sees P1 at:', p2SeesP1);
    if (!p2SeesP1 || p2SeesP1.dx > 2.0 || p2SeesP1.dy > 2.0) {
      throw new Error('P2 does not see P1 near P1 actual position!');
    }
    console.log('✓ P2 sees P1 at P1 correct location!');

    console.log('\n--- ALL PLAYER JOIN NO-PULL TESTS PASSED! ---');
  } catch (err) {
    console.error('Test failed with error:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
