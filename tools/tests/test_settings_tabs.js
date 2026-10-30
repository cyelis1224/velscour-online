const assert = require('node:assert/strict');
const path = require('node:path');
const { openGame, report, OUT_DIR } = require('./harness');

(async () => {
  for (const mobile of [false, true]) {
    console.log(`Testing Settings tabs (${mobile ? 'Mobile' : 'Desktop'})...`);
    const { browser, page, errors } = await openGame({
      width: mobile ? 412 : 1280,
      height: mobile ? 915 : 720,
      mobile,
    });

    try {
      // 1. Open settings dialog
      await page.evaluate(async () => {
        const { settingsDialog } = await import('/src/ui/screens.js');
        settingsDialog();
      });

      // 2. Verify all 5 tab buttons exist
      const tabs = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('.settings-tab-btn')];
        return btns.map(b => ({
          text: b.textContent.trim(),
          tab: b.dataset.tab,
          active: b.classList.contains('active'),
        }));
      });

      assert.equal(tabs.length, 5, 'Found 5 settings tab buttons');
      assert.deepEqual(
        tabs.map(t => t.tab),
        ['general', 'audio', 'graphics', 'hud', 'autoplay'],
        'Tab identifiers match expected list'
      );
      assert.equal(tabs[0].active, true, 'General tab is active by default');

      // Screenshot default General tab
      await page.screenshot({ path: path.join(OUT_DIR, `settings_tab_general_${mobile ? 'mobile' : 'desktop'}.png`) });

      // 3. Click Audio tab
      await page.click('.settings-tab-btn[data-tab="audio"]');
      await page.waitForSelector('.settings-tab-pane[data-pane="audio"].active');
      const audioActive = await page.evaluate(() => {
        const btn = document.querySelector('.settings-tab-btn[data-tab="audio"]');
        const pane = document.querySelector('.settings-tab-pane[data-pane="audio"]');
        const sfxSlider = document.querySelector('.settings-tab-pane[data-pane="audio"] [data-k="sfx"]');
        return {
          btnActive: btn.classList.contains('active'),
          paneActive: pane.classList.contains('active'),
          paneDisplay: window.getComputedStyle(pane).display,
          hasSfxSlider: !!sfxSlider,
        };
      });
      assert.equal(audioActive.btnActive, true, 'Audio tab button marked active');
      assert.equal(audioActive.paneActive, true, 'Audio tab pane marked active');
      assert.notEqual(audioActive.paneDisplay, 'none', 'Audio pane visible');
      assert.equal(audioActive.hasSfxSlider, true, 'Audio pane contains SFX slider');

      // Screenshot Audio tab
      await page.waitForTimeout(50);
      await page.screenshot({ path: path.join(OUT_DIR, `settings_tab_audio_${mobile ? 'mobile' : 'desktop'}.png`) });

      // 4. Click Graphics tab
      await page.click('.settings-tab-btn[data-tab="graphics"]');
      await page.waitForSelector('.settings-tab-pane[data-pane="graphics"].active');
      const graphicsActive = await page.evaluate(() => {
        const btn = document.querySelector('.settings-tab-btn[data-tab="graphics"]');
        const pane = document.querySelector('.settings-tab-pane[data-pane="graphics"]');
        const zoomSlider = document.querySelector('.settings-tab-pane[data-pane="graphics"] [data-k="zoom"]');
        return {
          btnActive: btn.classList.contains('active'),
          paneActive: pane.classList.contains('active'),
          paneDisplay: window.getComputedStyle(pane).display,
          hasZoomSlider: !!zoomSlider,
        };
      });
      assert.equal(graphicsActive.btnActive, true, 'Graphics tab button marked active');
      assert.equal(graphicsActive.paneActive, true, 'Graphics tab pane marked active');
      assert.notEqual(graphicsActive.paneDisplay, 'none', 'Graphics pane visible');
      assert.equal(graphicsActive.hasZoomSlider, true, 'Graphics pane contains zoom slider');

      // Screenshot Graphics tab
      await page.waitForTimeout(50);
      await page.screenshot({ path: path.join(OUT_DIR, `settings_tab_graphics_${mobile ? 'mobile' : 'desktop'}.png`) });

      // 5. Click HUD tab
      await page.click('.settings-tab-btn[data-tab="hud"]');
      await page.waitForSelector('.settings-tab-pane[data-pane="hud"].active');
      const hudActive = await page.evaluate(() => {
        const btn = document.querySelector('.settings-tab-btn[data-tab="hud"]');
        const pane = document.querySelector('.settings-tab-pane[data-pane="hud"]');
        const dmgNumbers = document.querySelector('.settings-tab-pane[data-pane="hud"] [data-k="dmgNumbers"]');
        return {
          btnActive: btn.classList.contains('active'),
          paneActive: pane.classList.contains('active'),
          paneDisplay: window.getComputedStyle(pane).display,
          hasDmgNumbers: !!dmgNumbers,
        };
      });
      assert.equal(hudActive.btnActive, true, 'HUD tab button marked active');
      assert.equal(hudActive.paneActive, true, 'HUD tab pane marked active');
      assert.notEqual(hudActive.paneDisplay, 'none', 'HUD pane visible');
      assert.equal(hudActive.hasDmgNumbers, true, 'HUD pane contains damage numbers setting');

      // Screenshot HUD tab
      await page.waitForTimeout(50);
      await page.screenshot({ path: path.join(OUT_DIR, `settings_tab_hud_${mobile ? 'mobile' : 'desktop'}.png`) });

      // 6. Click Auto-Play tab
      await page.click('.settings-tab-btn[data-tab="autoplay"]');
      await page.waitForSelector('.settings-tab-pane[data-pane="autoplay"].active');
      const autoplayActive = await page.evaluate(() => {
        const btn = document.querySelector('.settings-tab-btn[data-tab="autoplay"]');
        const pane = document.querySelector('.settings-tab-pane[data-pane="autoplay"]');
        const autoLoot = document.querySelector('.settings-tab-pane[data-pane="autoplay"] [data-k="autoLoot"]');
        const lootFilterBtn = document.querySelector('.settings-tab-pane[data-pane="autoplay"] [data-loot-filter]');
        return {
          btnActive: btn.classList.contains('active'),
          paneActive: pane.classList.contains('active'),
          paneDisplay: window.getComputedStyle(pane).display,
          hasAutoLoot: !!autoLoot,
          hasLootFilterBtn: !!lootFilterBtn,
        };
      });
      assert.equal(autoplayActive.btnActive, true, 'Auto-Play tab button marked active');
      assert.equal(autoplayActive.paneActive, true, 'Auto-Play tab pane marked active');
      assert.notEqual(autoplayActive.paneDisplay, 'none', 'Auto-Play pane visible');
      assert.equal(autoplayActive.hasAutoLoot, true, 'Auto-Play pane contains auto-loot setting');
      assert.equal(autoplayActive.hasLootFilterBtn, true, 'Auto-Play pane contains loot filter button');

      // Screenshot Auto-Play tab
      await page.waitForTimeout(50);
      await page.screenshot({ path: path.join(OUT_DIR, `settings_tab_autoplay_${mobile ? 'mobile' : 'desktop'}.png`) });

      // 7. Click Done to close settings
      await page.click('.dialog-box .row button');
      const dialogGone = await page.evaluate(() => !document.querySelector('.settings-dialog'));
      assert.equal(dialogGone, true, 'Settings dialog closed cleanly');

      console.log(`Settings tabs passed on ${mobile ? 'Mobile' : 'Desktop'}!`);
      await browser.close();
    } catch (e) {
      await browser.close();
      throw e;
    }
  }
  console.log('ALL SETTINGS TABS TESTS PASSED SUCCESSFULLY!');
})();
