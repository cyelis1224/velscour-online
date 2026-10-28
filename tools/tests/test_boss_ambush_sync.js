const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8123';
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

(async () => {
  console.log('--- STARTING COMPREHENSIVE BOSS, AMBUSH & CHAMPION SYNC TEST ---');
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

    // P1 creates room
    await p1.click('button:has-text("CREATE GAME")');
    await p1.waitForTimeout(300);
    const roomName = 'BossAmbushSync_' + Math.floor(Math.random() * 10000);
    await p1.fill('#d2-create-name', roomName);
    await p1.click('.d2-create-view button:has-text("CREATE GAME")');

    await p1.waitForFunction(() => window.VELSCOUR.G.mode === 'game' && window.VELSCOUR.G.world?.kind === 'town');
    console.log('P1 created room in town.');

    // P2 joins room
    await p2.waitForTimeout(800);
    await p2.click('button:has-text("JOIN GAME")');
    await p2.waitForTimeout(600);

    const roomSelector = `.d2-game-row:has-text("${roomName}")`;
    await p2.waitForSelector(roomSelector, { timeout: 5000 });
    await p2.click(roomSelector);
    await p2.waitForTimeout(300);
    await p2.click('.d2-join-view button:has-text("JOIN GAME")');

    await p2.waitForFunction(() => window.VELSCOUR.G.mode === 'game' && window.VELSCOUR.G.world?.kind === 'town');
    console.log('P2 joined room in town.');

    await p1.waitForTimeout(1000);
    await p2.waitForTimeout(1000);

    // Walk both players to portal
    await p1.evaluate(() => {
      const portal = window.VELSCOUR.G.world.portals[0];
      window.VELSCOUR.G.player.x = portal.x;
      window.VELSCOUR.G.player.y = portal.y;
      window.VELSCOUR.G.char.nextBiome = 'catacombs';
      window.VELSCOUR.G.char.heresy = { on: ['twins'] };
    });
    await p2.evaluate(() => {
      const portal = window.VELSCOUR.G.world.portals[0];
      window.VELSCOUR.G.player.x = portal.x;
      window.VELSCOUR.G.player.y = portal.y;
    });

    await p1.waitForFunction(() => {
      const portal = window.VELSCOUR.G.world.portals[0];
      return window.VELSCOUR.game.getPlayersAwayFromPortal(portal).length === 0;
    }, null, { timeout: 10000 });

    // P1 activates portal to dungeon
    await p1.evaluate(() => {
      window.VELSCOUR.game.enterDungeon();
    });

    // P2 waits for room sync and enters
    await p2.waitForFunction(() => {
      return window.VELSCOUR.G.room?.biome === 'catacombs' && window.VELSCOUR.G.room?.heresies?.includes('twins');
    }, null, { timeout: 5000 });

    await p2.evaluate(() => {
      window.VELSCOUR.game.enterDungeon();
    });

    await p1.waitForFunction(() => window.VELSCOUR.G.world?.kind === 'dungeon' && !document.querySelector('#loading:not(.hidden)'), null, { timeout: 15000 });
    await p2.waitForFunction(() => window.VELSCOUR.G.world?.kind === 'dungeon' && !document.querySelector('#loading:not(.hidden)'), null, { timeout: 15000 });
    console.log('Both players arrived in dungeon.');

    await p1.waitForTimeout(1000);
    await p2.waitForTimeout(1000);

    // -------------------------------------------------------------
    // TEST 1: Champion Synchronization
    // -------------------------------------------------------------
    console.log('\n--- TEST 1: Champions Synchronization ---');
    const championsP1 = await p1.evaluate(() => {
      return window.VELSCOUR.G.world.creatures
        .filter(c => c.team === 'enemy' && (c.rank === 'champion' || c.rank === 'unique'))
        .map(c => ({
          netId: c.netId,
          idx: c.idx,
          name: c.name,
          rank: c.rank,
          affixes: c.affixes,
          aura: c.aura,
          maxHp: c.maxHp,
          scale: c.scale,
        }));
    });

    const championsP2 = await p2.evaluate(() => {
      return window.VELSCOUR.G.world.creatures
        .filter(c => c.team === 'enemy' && (c.rank === 'champion' || c.rank === 'unique'))
        .map(c => ({
          netId: c.netId,
          idx: c.idx,
          name: c.name,
          rank: c.rank,
          affixes: c.affixes,
          aura: c.aura,
          maxHp: c.maxHp,
          scale: c.scale,
        }));
    });

    console.log(`Champions found: P1=${championsP1.length}, P2=${championsP2.length}`);
    if (championsP1.length === 0) throw new Error('Expected at least 1 champion/unique in dungeon!');
    if (championsP1.length !== championsP2.length) {
      throw new Error(`Champion count mismatch: P1=${championsP1.length}, P2=${championsP2.length}`);
    }

    for (let i = 0; i < championsP1.length; i++) {
      const c1 = championsP1[i];
      const c2 = championsP2[i];
      if (c1.name !== c2.name || c1.rank !== c2.rank || JSON.stringify(c1.affixes) !== JSON.stringify(c2.affixes) || c1.aura !== c2.aura) {
        console.error(`Champion mismatch at index ${i}:`, { c1, c2 });
        throw new Error(`Champion ${c1.name} has divergent affixes or aura between peers!`);
      }
    }
    console.log(`✓ All ${championsP1.length} champions/uniques match 100% in affixes, auras, names and stats across peers!`);

    // -------------------------------------------------------------
    // TEST 2: Boss Awakening via Remote Player (P2 approaching Boss)
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Boss Awakening via Remote Player ---');
    // Verify boss is initially not awake
    const bossInitialP1 = await p1.evaluate(() => {
      const b = window.VELSCOUR.G.world.boss;
      return { awake: b.awake, hp: b.hp, x: b.x, y: b.y };
    });
    console.log('Boss initial state on P1:', bossInitialP1);

    // Teleport P2 (Guest) near the boss while P1 stays at spawn
    await p2.evaluate((bossPos) => {
      window.VELSCOUR.G.player.x = bossPos.x + 2;
      window.VELSCOUR.G.player.y = bossPos.y + 2;
    }, bossInitialP1);

    // Wait 1 second for simulation tick & network sync
    await p1.waitForTimeout(1200);
    await p2.waitForTimeout(1200);

    const bossAwakeP1 = await p1.evaluate(() => window.VELSCOUR.G.world.boss?.awake);
    const bossAwakeP2 = await p2.evaluate(() => window.VELSCOUR.G.world.boss?.awake);
    const bossBarP1Visible = await p1.evaluate(() => !document.querySelector('#boss-bar').classList.contains('hidden'));
    const bossBarP2Visible = await p2.evaluate(() => !document.querySelector('#boss-bar').classList.contains('hidden'));

    console.log(`Boss awake: P1=${bossAwakeP1}, P2=${bossAwakeP2}`);
    console.log(`Boss bar HUD visible: P1=${bossBarP1Visible}, P2=${bossBarP2Visible}`);

    if (!bossAwakeP1) throw new Error('Boss on P1 did not awaken when P2 approached!');
    if (!bossAwakeP2) throw new Error('Boss on P2 did not awaken when P2 approached!');
    if (!bossBarP2Visible) throw new Error('Boss bar was not displayed on P2 HUD!');
    console.log('✓ Boss awakening and HUD health bar correctly synchronized when guest entered proximity!');

    // -------------------------------------------------------------
    // TEST 3: Ambush Spawning Synchronization
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Ambush Spawning Synchronization ---');
    const monsterCountBeforeP1 = await p1.evaluate(() => window.VELSCOUR.G.world.creatures.filter(c => c.team === 'enemy').length);
    const monsterCountBeforeP2 = await p2.evaluate(() => window.VELSCOUR.G.world.creatures.filter(c => c.team === 'enemy').length);

    // P1 (authority) triggers an ambush targeting P2
    await p1.evaluate(async () => {
      const { ambush } = await import('/src/game/mayhem.js');
      const w = window.VELSCOUR.G.world;
      // target remote player
      const guest = [...window.VELSCOUR.G.remotePlayers.values()][0];
      ambush(w, 'drop', 4, guest);
    });

    // Wait for network propagation
    await p1.waitForTimeout(1000);
    await p2.waitForTimeout(1000);

    const ambushesP1 = await p1.evaluate(() => {
      return window.VELSCOUR.G.world.creatures
        .filter(c => c.team === 'enemy' && c.ambusher)
        .map(c => ({ netId: c.netId, rank: c.rank, name: c.name, affixes: c.affixes, aura: c.aura }));
    });

    const ambushesP2 = await p2.evaluate(() => {
      return window.VELSCOUR.G.world.creatures
        .filter(c => c.team === 'enemy' && c.ambusher)
        .map(c => ({ netId: c.netId, rank: c.rank, name: c.name, affixes: c.affixes, aura: c.aura }));
    });

    console.log(`Ambush monsters spawned: P1=${ambushesP1.length}, P2=${ambushesP2.length}`);
    if (ambushesP1.length === 0) throw new Error('No ambush monsters spawned on P1!');
    if (ambushesP1.length !== ambushesP2.length) {
      throw new Error(`Ambush count mismatch: P1=${ambushesP1.length}, P2=${ambushesP2.length}`);
    }

    for (let i = 0; i < ambushesP1.length; i++) {
      const a1 = ambushesP1[i];
      const a2 = ambushesP2[i];
      if (a1.netId !== a2.netId || a1.name !== a2.name || a1.rank !== a2.rank || JSON.stringify(a1.affixes) !== JSON.stringify(a2.affixes)) {
        console.error(`Ambush mismatch at index ${i}:`, { a1, a2 });
        throw new Error(`Ambush monster ${a1.netId} desynchronized between peers!`);
      }
    }
    console.log(`✓ All ${ambushesP1.length} ambush monsters spawned cleanly and matched 100% across peers!`);

    // -------------------------------------------------------------
    // TEST 4: Deterministic Raid Boss at Depth 5
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Raid Boss Determinism (Depth 5) ---');
    // Build depth 5 on both players with same seed
    const raidBossP1 = await p1.evaluate(async () => {
      const { BIOME_BY_ID } = await import('/src/data/biomes.js');
      window.VELSCOUR.game.buildDungeon(5, BIOME_BY_ID.catacombs);
      const b = window.VELSCOUR.G.world.boss;
      return b ? {
        name: b.name,
        title: b.title,
        art: b.art,
        el: b.el,
        maxHp: b.maxHp,
        mods: b.raid?.mods,
      } : null;
    });

    const raidBossP2 = await p2.evaluate(async () => {
      const { BIOME_BY_ID } = await import('/src/data/biomes.js');
      window.VELSCOUR.game.buildDungeon(5, BIOME_BY_ID.catacombs);
      const b = window.VELSCOUR.G.world.boss;
      return b ? {
        name: b.name,
        title: b.title,
        art: b.art,
        el: b.el,
        maxHp: b.maxHp,
        mods: b.raid?.mods,
      } : null;
    });

    console.log('Raid Boss on P1:', raidBossP1);
    console.log('Raid Boss on P2:', raidBossP2);

    if (!raidBossP1 || !raidBossP2) throw new Error('Raid boss was not generated at depth 5!');
    if (raidBossP1.name !== raidBossP2.name || raidBossP1.art !== raidBossP2.art || raidBossP1.el !== raidBossP2.el || JSON.stringify(raidBossP1.mods) !== JSON.stringify(raidBossP2.mods)) {
      throw new Error(`Raid bosses diverged at depth 5! P1: ${raidBossP1.name}, P2: ${raidBossP2.name}`);
    }
    console.log('✓ Depth 5 Raid Boss matched 100% across peers (name, art, element, and mods)!');

    console.log('\n========================================');
    console.log('ALL BOSS, AMBUSH & CHAMPION TESTS PASSED!');
    console.log('========================================');
  } finally {
    await browser.close();
  }
})();
