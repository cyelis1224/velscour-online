const assert = require('node:assert/strict');
const path = require('node:path');
const { openGame, report, OUT_DIR } = require('./harness');

(async () => {
  console.log('Testing Lobby Vanity Gear Preview...');
  const { browser, page, errors } = await openGame({
    width: 1280,
    height: 720,
    mobile: false,
  });

  try {
    const res = await page.evaluate(async () => {
      const { G, game } = window.VELSCOUR;
      const { newCharData } = await import('/src/game/save.js');
      const { rollItem, shownEquip } = await import('/src/data/items.js');
      const { openLobby } = await import('/src/ui/lobby.js');

      // Create a character
      const char = newCharData('paladin', 'VanityLobbyHero');
      
      // Equip basic real gear
      const realHelm = rollItem(1, { slot: 'head', rarity: 0 });
      const realArmor = rollItem(1, { slot: 'body', rarity: 0 });
      char.equip.head = realHelm;
      char.equip.body = realArmor;

      // Equip weapon and offhand
      const weapon = rollItem(60, { slot: 'weapon', rarity: 5 });
      const offhand = rollItem(60, { slot: 'offhand', rarity: 5 });
      char.equip.weapon = weapon;
      char.equip.offhand = offhand;

      // Equip vanity items with distinct looks
      const vanityHelm = rollItem(60, { slot: 'head', rarity: 5 });
      const vanityArmor = rollItem(60, { slot: 'body', rarity: 5 });
      char.vanity = {
        head: vanityHelm,
        body: vanityArmor,
      };

      // Verify shownEquip
      const shown = shownEquip(char);
      const vanityMatches = shown.head === vanityHelm && shown.body === vanityArmor;
      const realDiffers = shown.head !== realHelm && shown.body !== realArmor;
      const holdsWeapon = shown.weapon === weapon && shown.offhand === offhand;

      // Open the lobby with this character
      G.char = char;
      openLobby(char);

      // Wait for pedestal rail and gear art preview
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 100));
        const c = document.querySelector('.d2-player-pod.is-me canvas.d2-player-canvas');
        if (c && c.width > 0) break;
      }
      await new Promise(r => setTimeout(r, 800));

      const myPod = document.querySelector('.d2-player-pod.is-me');
      const canvas = myPod?.querySelector('canvas.d2-player-canvas');

      return {
        hasMyPod: !!myPod,
        hasCanvas: !!canvas,
        vanityMatches,
        realDiffers,
        holdsWeapon,
        weaponBase: weapon.base,
        offhandBase: offhand.base,
        vanityHeadBase: vanityHelm.base,
        vanityBodyBase: vanityArmor.base,
      };
    });

    assert.equal(res.hasMyPod, true, 'Local player pod exists in lobby');
    assert.equal(res.hasCanvas, true, 'Player canvas exists');
    assert.equal(res.vanityMatches, true, 'shownEquip picks vanity gear');
    assert.equal(res.realDiffers, true, 'shownEquip differs from actual gear');

    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT_DIR, 'lobby_vanity_preview.png') });

    console.log('Lobby Vanity Gear Preview Test PASSED!');
    await browser.close();
  } catch (e) {
    await browser.close();
    throw e;
  }
})();
