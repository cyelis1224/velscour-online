// Visual test for VELSCOUR Mobile Lobby
const { openGame, report } = require('./harness');

(async () => {
  const { browser, page, errors } = await openGame({ width: 844, height: 390, mobile: true });

  try {
    // Inject a hero save
    await page.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('carrion_witch', 'MsButtcheeks');
      hero.level = 31;
      hero.lastPlayed = Date.now();
      S.writeSave(hero);
    });

    // Go to title and click Continue
    await page.evaluate(async () => {
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelector('.title-screen')?.classList.add('title-ready'));

    // Tap Continue
    await page.tap('button:has-text("Continue")');
    await page.waitForTimeout(1000);

    // Verify pedestal is collapsed by default on mobile
    const isCollapsed = await page.evaluate(() => {
      const p = document.querySelector('.d2-pedestal-wrap');
      return p && p.classList.contains('collapsed');
    });
    console.log('Mobile pedestal is collapsed by default:', isCollapsed);

    await page.screenshot({ path: 'tools/tests/out/mobile_lobby_collapsed.png' });

    // Tap toggle arrow to expand
    await page.tap('.d2-pedestal-toggle');
    await page.waitForTimeout(400);

    const isExpanded = await page.evaluate(() => {
      const p = document.querySelector('.d2-pedestal-wrap');
      return p && !p.classList.contains('collapsed');
    });
    console.log('Mobile pedestal expanded on arrow tap:', isExpanded);

    await page.screenshot({ path: 'tools/tests/out/mobile_lobby_expanded.png' });

  } catch (err) {
    errors.push(err.message);
    console.error(err);
  } finally {
    await browser.close();
    report(errors);
  }
})();
