// Visual test for VELSCOUR Diablo II Lobby
const { openGame, report } = require('./harness');

(async () => {
  const { browser, page, errors, shot } = await openGame({ width: 1280, height: 720 });

  try {
    // Inject a hero save
    await page.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('paladin', 'Cyelis');
      hero.level = 65;
      hero.lastPlayed = Date.now();
      S.writeSave(hero);
    });

    // Go to title and click Continue
    await page.evaluate(async () => {
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelector('.title-screen')?.classList.add('title-ready'));

    // Click Continue to enter lobby
    await page.click('button:has-text("Continue")');
    await page.waitForTimeout(1000);

    // Verify lobby opened
    const inLobby = await page.evaluate(() => !!document.getElementById('d2-lobby'));
    console.log('Is in lobby:', inLobby);

    // Take screenshot of the lobby
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'tools/tests/out/lobby_screen.png' });
    console.log('Saved lobby screenshot to tools/tests/out/lobby_screen.png');

    // Test creating a game
    await page.click('button:has-text("CREATE GAME")');
    await page.waitForTimeout(400);

    // Click create
    await page.click('.d2-create-view button:has-text("CREATE GAME")');
    await page.waitForTimeout(1500);

    // Verify in game world
    const inGame = await page.evaluate(() => window.VELSCOUR.G.mode === 'game');
    console.log('Is in game world:', inGame);
    await page.screenshot({ path: 'tools/tests/out/multiplayer_town.png' });

    // Test Save & Quit in menu -> should return to lobby!
    await page.evaluate(async () => {
      const { pauseMenu } = await import('/src/ui/screens.js');
      pauseMenu();
    });
    await page.waitForTimeout(300);
    await page.click('button:has-text("Save & Quit")');
    await page.waitForTimeout(1200);

    const backInLobby = await page.evaluate(() => !!document.getElementById('d2-lobby'));
    console.log('Back in lobby after Save & Quit:', backInLobby);
    await page.screenshot({ path: 'tools/tests/out/back_in_lobby.png' });

  } catch (err) {
    errors.push(err.message);
    console.error(err);
  } finally {
    await browser.close();
    report(errors);
  }
})();
