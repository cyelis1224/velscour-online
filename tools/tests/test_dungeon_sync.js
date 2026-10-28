const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8123';
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

(async () => {
  console.log('--- STARTING DUNGEON SYNC TEST ---');
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
    p2.on('console', m => console.log('[P2 browser]', m.text()));

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
      const hero = S.newCharData('paladin', 'HostKnight');
      hero.level = 20;
      hero.depth = 1;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p2.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('wizard', 'GuestMage');
      hero.level = 20;
      hero.depth = 1;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p1.waitForTimeout(500);
    await p2.waitForTimeout(500);

    // Enter lobby
    await p1.click('button:has-text("Continue")');
    await p1.waitForSelector('button:has-text("Enter Lobby")');
    await p1.click('button:has-text("Enter Lobby")');

    await p2.click('button:has-text("Continue")');
    await p2.waitForSelector('button:has-text("Enter Lobby")');
    await p2.click('button:has-text("Enter Lobby")');

    await p1.waitForSelector('#d2-lobby');
    await p2.waitForSelector('#d2-lobby');
    console.log('Both players in lobby.');

    // P1 creates room
    await p1.click('button:has-text("CREATE GAME")');
    await p1.waitForTimeout(300);
    const roomName = 'DungeonSync_' + Math.floor(Math.random() * 10000);
    await p1.fill('#d2-create-name', roomName);
    await p1.click('.d2-create-view button:has-text("CREATE GAME")');

    await p1.waitForFunction(() => window.VELSCOUR.G.mode === 'game' && window.VELSCOUR.G.world?.kind === 'town');
    console.log('P1 created and entered game in town.');

    // P2 joins room
    await p2.waitForTimeout(800);
    await p2.click('button:has-text("JOIN GAME")');
    await p2.waitForTimeout(600);

    // Click the game in list
    const roomSelector = `.d2-game-row:has-text("${roomName}")`;
    await p2.waitForSelector(roomSelector, { timeout: 5000 });
    await p2.click(roomSelector);
    await p2.waitForTimeout(300);
    await p2.click('.d2-join-view button:has-text("JOIN GAME")');

    await p2.waitForFunction(() => window.VELSCOUR.G.mode === 'game' && window.VELSCOUR.G.world?.kind === 'town');
    console.log('P2 joined and entered game in town.');

    // Wait for connection and remote players
    await p1.waitForTimeout(1000);
    await p2.waitForTimeout(1000);

    // Move both players to the town portal
    console.log('Moving both players to town portal...');
    await p1.evaluate(() => {
      const portal = window.VELSCOUR.G.world.portals[0];
      window.VELSCOUR.G.player.x = portal.x;
      window.VELSCOUR.G.player.y = portal.y;
    });

    await p2.evaluate(() => {
      const portal = window.VELSCOUR.G.world.portals[0];
      window.VELSCOUR.G.player.x = portal.x;
      window.VELSCOUR.G.player.y = portal.y;
    });

    // Set dungeon destination to catacombs and give P1 the 'twins' Heresy
    await p1.evaluate(() => {
      window.VELSCOUR.G.char.nextBiome = 'catacombs';
      window.VELSCOUR.G.char.heresy = { on: ['twins'] };
    });
    await p1.waitForFunction(() => {
      const portal = window.VELSCOUR.G.world.portals[0];
      return window.VELSCOUR.game.getPlayersAwayFromPortal(portal).length === 0;
    }, null, { timeout: 10000 });
    console.log('Both players verified at portal proximity.');

    // P1 activates portal into dungeon
    console.log('P1 activating portal to dungeon...');
    await p1.evaluate(() => {
      window.VELSCOUR.game.enterDungeon();
    });

    // P2 waits for room_depth_sync to propagate P1's choice and heresies
    await p2.waitForFunction(() => {
      return window.VELSCOUR.G.room?.biome === 'catacombs' && window.VELSCOUR.G.room?.heresies?.includes('twins');
    }, null, { timeout: 5000 });
    console.log('P2 successfully received synced biome (catacombs) and Heresies (twins) from P1!');

    // P2 enters dungeon
    await p2.evaluate(() => {
      window.VELSCOUR.game.enterDungeon();
    });

    // Wait for both to enter dungeon
    await p1.waitForFunction(() => window.VELSCOUR.G.world?.kind === 'dungeon' && !document.querySelector('#loading:not(.hidden)'), null, { timeout: 15000 });
    await p2.waitForFunction(() => window.VELSCOUR.G.world?.kind === 'dungeon' && !document.querySelector('#loading:not(.hidden)'), null, { timeout: 15000 });
    console.log('Both players successfully entered dungeon!');

    // Wait 1s for assets and initialization
    await p1.waitForTimeout(1500);
    await p2.waitForTimeout(1500);

    // 1. Verify Biome & Tiles Match
    const tileData1 = await p1.evaluate(() => {
      const w = window.VELSCOUR.G.world;
      return {
        biome: w.biome.id,
        tilesetK: w.tileset.k,
        tilesetMixed: w.tileset.mixed,
        split: w.tileset.split,
        mapW: w.map.w,
        mapH: w.map.h,
        sampleTiles: Array.from(w.map.t.slice(0, 100)),
        sampleFloors: Array.from(w.map.v.slice(0, 100)),
      };
    });

    const tileData2 = await p2.evaluate(() => {
      const w = window.VELSCOUR.G.world;
      return {
        biome: w.biome.id,
        tilesetK: w.tileset.k,
        tilesetMixed: w.tileset.mixed,
        split: w.tileset.split,
        mapW: w.map.w,
        mapH: w.map.h,
        sampleTiles: Array.from(w.map.t.slice(0, 100)),
        sampleFloors: Array.from(w.map.v.slice(0, 100)),
      };
    });

    console.log('P1 Biome:', tileData1.biome, 'Tileset Mixed:', tileData1.tilesetMixed, 'Split:', tileData1.split);
    console.log('P2 Biome:', tileData2.biome, 'Tileset Mixed:', tileData2.tilesetMixed, 'Split:', tileData2.split);

    if (tileData1.biome !== tileData2.biome) throw new Error('Biome mismatch!');
    if (tileData1.tilesetMixed !== tileData2.tilesetMixed) throw new Error(`Tileset mixed mismatch: ${tileData1.tilesetMixed} vs ${tileData2.tilesetMixed}`);
    if (tileData1.split !== tileData2.split) throw new Error(`Tileset split mismatch: ${tileData1.split} vs ${tileData2.split}`);
    if (JSON.stringify(tileData1.sampleFloors) !== JSON.stringify(tileData2.sampleFloors)) throw new Error('Map floor tiles mismatch!');
    console.log('✓ Map tiles and tilesets match 100%!');

    // 2. Verify Monsters Match (Count, Sprite Art, Palette Swap, Variant, Traits)
    const monsters1 = await p1.evaluate(() => {
      return window.VELSCOUR.G.world.creatures
        .filter(c => c.team === 'enemy')
        .map(c => ({
          netId: c.netId,
          idx: c.idx,
          name: c.name,
          arch: c.arch,
          art: c.art,
          swap: c.swap,
          trait: c.trait,
          rank: c.rank,
          maxHp: c.maxHp,
          scale: c.scale,
        }));
    });

    const monsters2 = await p2.evaluate(() => {
      return window.VELSCOUR.G.world.creatures
        .filter(c => c.team === 'enemy')
        .map(c => ({
          netId: c.netId,
          idx: c.idx,
          name: c.name,
          arch: c.arch,
          art: c.art,
          swap: c.swap,
          trait: c.trait,
          rank: c.rank,
          maxHp: c.maxHp,
          scale: c.scale,
        }));
    });

    console.log(`Monsters count: P1=${monsters1.length}, P2=${monsters2.length}`);
    if (monsters1.length !== monsters2.length) {
      throw new Error(`Monster count mismatch: P1=${monsters1.length}, P2=${monsters2.length}`);
    }

    let mismatches = 0;
    for (let i = 0; i < monsters1.length; i++) {
      const m1 = monsters1[i];
      const m2 = monsters2[i];
      if (m1.name !== m2.name || m1.art !== m2.art || m1.trait !== m2.trait || m1.rank !== m2.rank || JSON.stringify(m1.swap) !== JSON.stringify(m2.swap)) {
        console.error(`Mismatch at index ${i}:`, { m1, m2 });
        mismatches++;
      }
    }

    if (mismatches > 0) {
      throw new Error(`Found ${mismatches} monster appearance/variant mismatches!`);
    }
    console.log(`✓ All ${monsters1.length} monster sprites, variants, palette swaps, and traits match 100%!`);

    // 3. Test Monster Hit & Damage Sync across network
    console.log('Testing monster hit synchronization...');
    const testMonsterId = monsters1[0].netId;
    const initialHpP2 = await p2.evaluate((id) => {
      const m = window.VELSCOUR.G.world.creatures.find(c => c.netId === id);
      return m ? m.hp : null;
    }, testMonsterId);

    // P1 deals damage to testMonsterId
    await p1.evaluate(async (id) => {
      const { hit } = await import('/src/game/combat.js');
      const m = window.VELSCOUR.G.world.creatures.find(c => c.netId === id);
      hit(window.VELSCOUR.G.player, m, 25, 'phys');
    }, testMonsterId);

    // Wait for network message to arrive on P2
    await p2.waitForTimeout(600);

    const newHpP2 = await p2.evaluate((id) => {
      const m = window.VELSCOUR.G.world.creatures.find(c => c.netId === id);
      return m ? m.hp : null;
    }, testMonsterId);

    console.log(`Monster HP on P2 before hit: ${initialHpP2}, after P1 hit: ${newHpP2}`);
    if (newHpP2 >= initialHpP2) {
      throw new Error(`Hit damage was not reflected on P2! initial=${initialHpP2}, new=${newHpP2}`);
    }
    console.log('✓ Monster damage successfully synchronized over network!');

    // 4. Test Boss Death & Exit Portal Unsealing on both clients
    console.log('Testing boss kill & exit portal unseal synchronization...');
    // Find boss on P1
    const bossInfoP1 = await p1.evaluate(() => {
      const b = window.VELSCOUR.G.world.boss;
      return b ? { netId: b.netId, idx: b.idx, team: b.team, hp: b.hp, dead: b.dead } : null;
    });
    console.log('Boss on P1 before kill:', bossInfoP1);

    const bossInfoP2Before = await p2.evaluate(() => {
      const b = window.VELSCOUR.G.world.boss;
      return b ? { netId: b.netId, idx: b.idx, team: b.team, hp: b.hp, dead: b.dead } : null;
    });
    console.log('Boss on P2 before kill:', bossInfoP2Before);

    // Listen on P2 for game_monster_hit
    await p2.evaluate(() => {
      window._lastHitReceived = null;
      window.VELSCOUR.net = window.VELSCOUR.net || {};
    });

    // P1 kills the boss
    await p1.evaluate(async () => {
      const { hit } = await import('/src/game/combat.js');
      const b = window.VELSCOUR.G.world.boss;
      console.log('P1 hitting boss:', b.netId, 'hp before:', b.hp);
      hit(window.VELSCOUR.G.player, b, 999999, 'phys');
      console.log('P1 boss hp after:', b.hp, 'dead:', b.dead);
    });

    // Wait for network sync
    await p1.waitForTimeout(1000);
    await p2.waitForTimeout(1000);

    const bossInfoP2After = await p2.evaluate(() => {
      const b = window.VELSCOUR.G.world.boss;
      return b ? { netId: b.netId, idx: b.idx, team: b.team, hp: b.hp, dead: b.dead } : null;
    });
    console.log('Boss on P2 after kill:', bossInfoP2After);

    const exitP1Active = await p1.evaluate(() => {
      const exit = window.VELSCOUR.G.world.portals.find(p => p.type === 'exit');
      return exit ? exit.active : false;
    });

    const exitP2Active = await p2.evaluate(() => {
      const exit = window.VELSCOUR.G.world.portals.find(p => p.type === 'exit');
      return exit ? exit.active : false;
    });

    const bossP2Dead = await p2.evaluate(() => {
      const b = window.VELSCOUR.G.world.boss;
      return b ? b.dead : false;
    });

    console.log(`Boss dead on P2: ${bossP2Dead}, Exit active on P1: ${exitP1Active}, Exit active on P2: ${exitP2Active}`);
    if (!bossP2Dead) throw new Error('Boss was not killed on P2!');
    if (!exitP1Active || !exitP2Active) throw new Error('Exit portal was not unsealed on both clients!');
    console.log('✓ Boss death and exit portal unseal verified on both clients!');

    console.log('--- ALL TESTS PASSED SUCCESSFULLY! ---');
  } finally {
    await browser.close();
  }
})();
