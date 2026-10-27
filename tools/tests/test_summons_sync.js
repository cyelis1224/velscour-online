const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8123';
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

(async () => {
  console.log('--- STARTING SUMMONS SYNCHRONIZATION TEST ---');
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
  });

  try {
    const ctx1 = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const ctx2 = await browser.newContext({ viewport: { width: 1024, height: 768 } });

    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    p1.on('console', m => console.log('[P1 browser]', m.text()));
    p1.on('pageerror', err => console.log('[P1 pageerror]', err));
    p2.on('console', m => console.log('[P2 browser]', m.text()));
    p2.on('pageerror', err => console.log('[P2 pageerror]', err));

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
      const hero = S.newCharData('carrion_witch', 'WitchHost');
      hero.level = 20;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p2.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('paladin', 'PaladinGuest');
      hero.level = 20;
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

    // Host creates room
    await p1.click('button:has-text("CREATE GAME")');
    await p1.waitForTimeout(300);
    const roomName = 'SummonTest_' + Math.floor(Math.random() * 10000);
    await p1.fill('#d2-create-name', roomName);
    await p1.click('.d2-create-view button:has-text("CREATE GAME")');

    // Wait for P1 to be in game
    await p1.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game' && window.VELSCOUR?.G?.world?.kind === 'town');
    console.log('P1 entered town as host.');

    // P2 finds room and joins
    await p2.click('button:has-text("JOIN GAME")');
    await p2.waitForTimeout(500);

    const roomSelector = `.d2-game-row:has-text("${roomName}")`;
    await p2.waitForSelector(roomSelector, { timeout: 8000 });
    await p2.click(roomSelector);
    await p2.waitForTimeout(300);
    await p2.click('.d2-join-view button:has-text("JOIN GAME")');

    await p2.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game' && window.VELSCOUR?.G?.world?.kind === 'town');
    console.log('P2 entered town as guest.');

    // Verify remote player exists
    await p2.waitForFunction(() => {
      const G = window.VELSCOUR.G;
      return G.remotePlayers && G.remotePlayers.size > 0;
    });
    console.log('P2 registered P1 as remote player.');

    // TEST 1: Spawn Witch Raven on P1
    console.log('\n--- TEST 1: Spawning Witch Raven on P1 ---');
    const ravenInfo = await p1.evaluate(async () => {
      const { G } = await import('/src/state.js');
      const { buildSummon } = await import('/src/game/monster.js');
      const { SUMMONS } = await import('/src/data/summons.js');

      const raven = buildSummon(G.player, SUMMONS['raven'], 'raven', G.player.x + 1, G.player.y + 1, 20, 100, 0);
      G.world.add(raven);
      return { id: raven.summonId, key: raven.summonKey, x: raven.x, y: raven.y };
    });
    console.log('P1 spawned raven:', ravenInfo);

    // Wait for P2 to receive and spawn raven
    await p2.waitForFunction((id) => {
      const G = window.VELSCOUR.G;
      if (!G.world || !G.world.creatures) return false;
      return G.world.creatures.some(c => c.summonId === id && c.isRemoteSummon && !c.dead);
    }, ravenInfo.id, { timeout: 5000 });

    const p2Raven = await p2.evaluate((id) => {
      const G = window.VELSCOUR.G;
      const c = G.world.creatures.find(c => c.summonId === id);
      return {
        id: c.summonId,
        key: c.summonKey,
        isRemoteSummon: !!c.isRemoteSummon,
        team: c.team,
        fly: !!c.fly,
        x: c.x,
        y: c.y,
      };
    }, ravenInfo.id);
    console.log('P2 successfully received raven:', p2Raven);

    if (p2Raven.key !== 'raven' || p2Raven.team !== 'player' || !p2Raven.isRemoteSummon) {
      throw new Error(`Raven properties mismatch on P2: ${JSON.stringify(p2Raven)}`);
    }

    // TEST 2: Spawn Scarecrow, Totem, Slime, and Skeleton
    console.log('\n--- TEST 2: Spawning Scarecrow, Totem, Court Slime, and Skeleton ---');
    const multiSummons = await p1.evaluate(async () => {
      const { G } = await import('/src/state.js');
      const { buildSummon } = await import('/src/game/monster.js');
      const { SUMMONS } = await import('/src/data/summons.js');

      const scarecrow = buildSummon(G.player, SUMMONS['scarecrow'], 'scarecrow', G.player.x + 2, G.player.y, 10, 150, 0);
      const totem = buildSummon(G.player, SUMMONS['totem_fire'], 'totem_fire', G.player.x - 2, G.player.y, 30, 80, 0);
      const slime = buildSummon(G.player, SUMMONS['sl_pouncer'], 'sl_pouncer', G.player.x, G.player.y + 2, 25, 120, 0);
      const skel = buildSummon(G.player, SUMMONS['skeleton'], 'skeleton', G.player.x - 1, G.player.y - 1, 15, 90, 0);

      G.world.add(scarecrow);
      G.world.add(totem);
      G.world.add(slime);
      G.world.add(skel);

      return [
        { id: scarecrow.summonId, key: 'scarecrow' },
        { id: totem.summonId, key: 'totem_fire' },
        { id: slime.summonId, key: 'sl_pouncer' },
        { id: skel.summonId, key: 'skeleton' },
      ];
    });

    console.log('P1 spawned 4 diverse summons.');

    // Wait for all 4 summons to appear on P2
    for (const s of multiSummons) {
      await p2.waitForFunction((id) => {
        const G = window.VELSCOUR.G;
        return G.world.creatures.some(c => c.summonId === id && c.isRemoteSummon && !c.dead);
      }, s.id, { timeout: 5000 });
      console.log(`P2 verified summon ${s.key} (${s.id})`);
    }

    // Check P2 drawing without errors
    const drawCheck = await p2.evaluate(() => {
      const G = window.VELSCOUR.G;
      const remoteSummons = G.world.creatures.filter(c => c.isRemoteSummon && !c.dead);
      // Dummy canvas context to test draw()
      const canvas = document.createElement('canvas');
      canvas.width = 400; canvas.height = 400;
      const ctx = canvas.getContext('2d');
      for (const rs of remoteSummons) {
        rs.draw(ctx);
      }
      return { count: remoteSummons.length, ok: true };
    });
    console.log(`P2 verified draw() on all ${drawCheck.count} remote summons successfully.`);

    // TEST 3: Despawn/Kill summons on P1 and verify cleanup on P2
    console.log('\n--- TEST 3: Despawn/Kill summons on P1 ---');
    await p1.evaluate((ravenId) => {
      const G = window.VELSCOUR.G;
      const r = G.world.creatures.find(c => c.summonId === ravenId);
      if (r) r.dead = true;
    }, ravenInfo.id);

    // Wait for P2 to clean up the dead raven
    await p2.waitForFunction((ravenId) => {
      const G = window.VELSCOUR.G;
      const c = G.world.creatures.find(c => c.summonId === ravenId);
      return !c || c.dead;
    }, ravenInfo.id, { timeout: 5000 });
    console.log('P2 cleanly removed the dead raven.');

    console.log('\nALL SUMMON TESTS PASSED WITH 100% SUCCESS!');
  } finally {
    await browser.close();
  }
})();
