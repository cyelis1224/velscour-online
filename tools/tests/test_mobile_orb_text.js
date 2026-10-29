const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function testMobileOrbText() {
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
  });
  try {
    // ----------------------------------------------------
    // Test 1: Mobile Portrait (390x844)
    // ----------------------------------------------------
    console.log('Testing Mobile Portrait (390x844)...');
    const contextP = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await contextP.addInitScript(() => { window.VELSCOUR_TEST_MENU = true; });
    const pageP = await contextP.newPage();
    await pageP.goto('http://localhost:8123');

    await pageP.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('barbarian', 'Conan');
      hero.level = 20;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });
    await sleep(600);

    await pageP.click('button:has-text("Continue")');
    await pageP.waitForSelector('button:has-text("Enter World")', { timeout: 10000 });
    await pageP.click('button:has-text("Enter World")');

    await pageP.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game', null, { timeout: 15000 });
    await sleep(1000);

    const lifeValP = await pageP.locator('#life-text').textContent();
    const manaValP = await pageP.locator('#mana-text').textContent();
    console.log(`Portrait HP text: "${lifeValP}", MP text: "${manaValP}"`);

    const pStyles = await pageP.evaluate(() => {
      const lt = document.getElementById('life-text');
      const mt = document.getElementById('mana-text');
      const frame = document.querySelector('.mobile-orb-frame');
      const cover = document.getElementById('life-cover');
      const cs = (el) => {
        if (!el) return null;
        const s = window.getComputedStyle(el);
        return {
          display: s.display,
          visibility: s.visibility,
          opacity: s.opacity,
          zIndex: s.zIndex,
          color: s.color,
          fontSize: s.fontSize,
          rect: { x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height },
        };
      };
      return {
        lifeText: cs(lt),
        manaText: cs(mt),
        frame: cs(frame),
        cover: cs(cover),
      };
    });

    console.log('Portrait computed styles:', JSON.stringify(pStyles, null, 2));

    if (!lifeValP || !manaValP) {
      throw new Error(`HP or MP text is empty in mobile portrait view! (${lifeValP}, ${manaValP})`);
    }
    if (parseInt(pStyles.lifeText.zIndex) < parseInt(pStyles.frame?.zIndex || 0)) {
      throw new Error('lifeText z-index is lower than orb frame in portrait!');
    }

    // Save screenshot
    const shotDir = path.resolve(__dirname, 'out');
    fs.mkdirSync(shotDir, { recursive: true });
    const shotPathP = path.join(shotDir, 'test_mobile_portrait_hud.png');
    await pageP.screenshot({ path: shotPathP });
    console.log(`Saved portrait screenshot to ${shotPathP}`);
    await contextP.close();

    // ----------------------------------------------------
    // Test 2: Mobile Landscape (844x390)
    // ----------------------------------------------------
    console.log('\nTesting Mobile Landscape (844x390)...');
    const contextL = await browser.newContext({
      viewport: { width: 844, height: 390 },
      isMobile: true,
      hasTouch: true,
    });
    await contextL.addInitScript(() => { window.VELSCOUR_TEST_MENU = true; });
    const pageL = await contextL.newPage();
    await pageL.goto('http://localhost:8123');

    await pageL.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('barbarian', 'Conan');
      hero.level = 20;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });
    await sleep(600);

    await pageL.click('button:has-text("Continue")');
    await pageL.waitForSelector('button:has-text("Enter World")', { timeout: 10000 });
    await pageL.click('button:has-text("Enter World")');

    await pageL.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game', null, { timeout: 15000 });
    await sleep(1000);

    const lifeValL = await pageL.locator('#life-text').textContent();
    const manaValL = await pageL.locator('#mana-text').textContent();
    console.log(`Landscape HP text: "${lifeValL}", MP text: "${manaValL}"`);

    const lStyles = await pageL.evaluate(() => {
      const lt = document.getElementById('life-text');
      const mt = document.getElementById('mana-text');
      const frame = document.querySelector('.mobile-orb-frame');
      const cover = document.getElementById('life-cover');
      const cs = (el) => {
        if (!el) return null;
        const s = window.getComputedStyle(el);
        return {
          display: s.display,
          visibility: s.visibility,
          opacity: s.opacity,
          zIndex: s.zIndex,
          color: s.color,
          fontSize: s.fontSize,
          rect: { x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height },
        };
      };
      return {
        lifeText: cs(lt),
        manaText: cs(mt),
        frame: cs(frame),
        cover: cs(cover),
      };
    });

    console.log('Landscape computed styles:', JSON.stringify(lStyles, null, 2));

    if (!lifeValL || !manaValL) {
      throw new Error(`HP or MP text is empty in mobile landscape view! (${lifeValL}, ${manaValL})`);
    }
    if (parseInt(lStyles.lifeText.zIndex) < parseInt(lStyles.frame?.zIndex || 0)) {
      throw new Error('lifeText z-index is lower than orb frame in landscape!');
    }

    const shotPathL = path.join(shotDir, 'test_mobile_landscape_hud.png');
    await pageL.screenshot({ path: shotPathL });
    console.log(`Saved landscape screenshot to ${shotPathL}`);
    await contextL.close();

    console.log('\nAll mobile orb text tests PASSED successfully!');
  } finally {
    await browser.close();
  }
}

testMobileOrbText().catch((err) => {
  console.error(err);
  process.exit(1);
});
