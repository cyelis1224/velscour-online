const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function testInventoryLayout() {
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
  });

  try {
    const shotDir = path.resolve(__dirname, 'out');
    fs.mkdirSync(shotDir, { recursive: true });

    // Test 1: Desktop 1440x900
    console.log('Testing Desktop Inventory layout (1440x900)...');
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => { window.VELSCOUR_TEST_MENU = true; });
    const page = await ctx.newPage();
    await page.goto('http://localhost:8123');

    await page.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('barbarian', 'Conan');
      hero.level = 20;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });
    await sleep(600);

    await page.click('button:has-text("Continue")');
    await page.waitForSelector('button:has-text("Enter World")', { timeout: 10000 });
    await page.click('button:has-text("Enter World")');

    await page.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game', null, { timeout: 15000 });
    await sleep(1000);

    await page.keyboard.press('KeyI');
    await page.waitForSelector('.panel', { timeout: 5000 });
    await sleep(500);

    const layout = await page.evaluate(() => {
      const panel = document.querySelector('.panel');
      const statsGrid = document.querySelector('.stats-grid');
      const cs = (el) => el ? window.getComputedStyle(el).display : null;
      return {
        panelWidth: panel.getBoundingClientRect().width,
        statsGridDisplay: cs(statsGrid),
      };
    });

    console.log('Desktop layout:', layout);
    await page.screenshot({ path: path.join(shotDir, 'test_inventory_desktop.png') });
    await ctx.close();

    // Test 2: Mobile Landscape (844x390)
    console.log('Testing Mobile Landscape Inventory layout (844x390)...');
    const ctxM = await browser.newContext({
      viewport: { width: 844, height: 390 },
      isMobile: true,
      hasTouch: true,
    });
    await ctxM.addInitScript(() => { window.VELSCOUR_TEST_MENU = true; });
    const pageM = await ctxM.newPage();
    await pageM.goto('http://localhost:8123');

    await pageM.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('barbarian', 'Conan');
      hero.level = 20;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });
    await sleep(600);

    await pageM.click('button:has-text("Continue")');
    await pageM.waitForSelector('button:has-text("Enter World")', { timeout: 10000 });
    await pageM.click('button:has-text("Enter World")');

    await pageM.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game', null, { timeout: 15000 });
    await sleep(1000);

    // Click Bag button in top-right HUD
    await pageM.click('button[data-act="inventory"]');
    await pageM.waitForSelector('.panel', { timeout: 5000 });
    await sleep(500);

    await pageM.screenshot({ path: path.join(shotDir, 'test_inventory_mobile_landscape.png') });
    console.log('Mobile Landscape inventory test completed.');
    await ctxM.close();

    console.log('All inventory tests passed!');
  } finally {
    await browser.close();
  }
}

testInventoryLayout().catch((err) => {
  console.error(err);
  process.exit(1);
});
