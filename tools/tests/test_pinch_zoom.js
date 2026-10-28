// Test mobile pinch-to-zoom in and out gestures.
const assert = require('node:assert/strict');
const { openGame, report } = require('./harness');

(async () => {
  const { browser, page, errors } = await openGame({
    width: 844, height: 390, mobile: true,
  });

  try {
    await page.evaluate(async () => {
      const { game, G } = window.VELSCOUR;
      const { newCharData } = await import('/src/game/save.js');
      await game.loadClassPack('paladin');
      game.startChar(newCharData('paladin', 'Pinch Test'), false);
    });

    const initial = await page.evaluate(async () => {
      const { camera } = await import('/src/core/view.js');
      return { zoom: camera.zoom, setting: window.VELSCOUR.G.settings.zoom || 1 };
    });

    // Simulate multi-touch pinch to zoom IN (spread fingers)
    await page.evaluate(async () => {
      const canvas = document.getElementById('game');
      // Touch 1 at (200, 200)
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 10, pointerType: 'touch', clientX: 200, clientY: 200, bubbles: true
      }));
      // Touch 2 at (300, 200) -> initial distance = 100px
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 11, pointerType: 'touch', clientX: 300, clientY: 200, bubbles: true
      }));
      // Move Touch 2 to (450, 200) -> distance = 250px (2.5x spread)
      canvas.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 11, pointerType: 'touch', clientX: 450, clientY: 200, bubbles: true
      }));
    });

    const zoomedIn = await page.evaluate(async () => {
      const { camera } = await import('/src/core/view.js');
      const { input } = await import('/src/core/input.js');
      return {
        zoom: camera.zoom,
        setting: window.VELSCOUR.G.settings.zoom,
        isPinching: input.isPinching,
      };
    });

    assert.ok(zoomedIn.isPinching, 'input.isPinching should be true during multi-touch pinch');
    assert.ok(zoomedIn.setting > initial.setting, `Zoom setting should increase on spread (was ${initial.setting}, now ${zoomedIn.setting})`);
    assert.ok(zoomedIn.zoom > initial.zoom, `Camera zoom should increase on spread (was ${initial.zoom}, now ${zoomedIn.zoom})`);

    // Simulate pinching OUT (bring fingers closer)
    await page.evaluate(async () => {
      const canvas = document.getElementById('game');
      // Move Touch 2 inward to (260, 200) -> distance = 60px (smaller than initial 100px)
      canvas.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 11, pointerType: 'touch', clientX: 260, clientY: 200, bubbles: true
      }));
    });

    const zoomedOut = await page.evaluate(async () => {
      const { camera } = await import('/src/core/view.js');
      return {
        zoom: camera.zoom,
        setting: window.VELSCOUR.G.settings.zoom,
      };
    });

    assert.ok(zoomedOut.setting < zoomedIn.setting, `Zoom setting should decrease on pinch in (was ${zoomedIn.setting}, now ${zoomedOut.setting})`);
    assert.ok(zoomedOut.zoom < zoomedIn.zoom, `Camera zoom should decrease on pinch in (was ${zoomedIn.zoom}, now ${zoomedOut.zoom})`);

    // Release fingers
    await page.evaluate(async () => {
      const canvas = document.getElementById('game');
      canvas.dispatchEvent(new PointerEvent('pointerup', {
        pointerId: 10, pointerType: 'touch', clientX: 200, clientY: 200, bubbles: true
      }));
      canvas.dispatchEvent(new PointerEvent('pointerup', {
        pointerId: 11, pointerType: 'touch', clientX: 260, clientY: 200, bubbles: true
      }));
    });

    // Wait a brief moment for debounce save
    await page.waitForTimeout(400);

    const ended = await page.evaluate(async () => {
      const { input } = await import('/src/core/input.js');
      const saved = JSON.parse(localStorage.getItem('velscour_settings_v1') || '{}').zoom;
      return {
        isPinching: input.isPinching,
        touchCount: input.activeTouches.size,
        saved,
        currentSetting: window.VELSCOUR.G.settings.zoom,
      };
    });

    assert.equal(ended.isPinching, false, 'isPinching should be false after releasing fingers');
    assert.equal(ended.touchCount, 0, 'activeTouches should be empty');
    assert.equal(ended.saved, ended.currentSetting, 'Settings should be persisted to localStorage');

    console.log('Mobile pinch-to-zoom test PASS');
    report(errors);
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
