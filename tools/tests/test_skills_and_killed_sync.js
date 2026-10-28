const { chromium } = require('playwright');
const fs = require('fs');

const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  console.log('--- Testing Skills Visual Sync, Max Players Limit (4), & Killed Monster Persistence ---');
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
      p.on('console', (msg) => {
        const text = msg.text();
        if (text.includes('error') || text.includes('Error')) {
          console.log(`[Browser ${p === p1 ? 'P1' : 'P2'}]:`, text);
        }
      });
    }

    console.log('1. Loading P1 & P2 into game...');
    await p1.goto('http://localhost:8123');
    await p2.goto('http://localhost:8123');

    await p1.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('barbarian', 'Conan');
      hero.level = 20;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });
    await p2.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('paladin', 'Uther');
      hero.level = 20;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });
    await sleep(500);

    // Enter lobby on both
    await p1.click('button:has-text("Continue")');
    await p1.waitForSelector('button:has-text("Enter Lobby")');
    await p1.click('button:has-text("Enter Lobby")');

    await p2.click('button:has-text("Continue")');
    await p2.waitForSelector('button:has-text("Enter Lobby")');
    await p2.click('button:has-text("Enter Lobby")');

    await p1.waitForSelector('#d2-lobby');
    await p2.waitForSelector('#d2-lobby');

    // TEST 1: Check create game max players dropdown
    console.log('2. Testing room max players limit (UI dropdown & network)...');
    await p1.click('button:has-text("CREATE GAME")');
    await p1.waitForSelector('#d2-create-max');

    const maxOptions = await p1.evaluate(() => {
      const sel = document.getElementById('d2-create-max');
      return Array.from(sel.options).map(o => ({ value: o.value, text: o.text }));
    });
    console.log('Lobby Create Game max player options:', maxOptions);
    if (!maxOptions.every(o => parseInt(o.value, 10) <= 4)) {
      throw new Error(`Create game max players dropdown has values > 4: ${JSON.stringify(maxOptions)}`);
    }

    const roomName = 'SkillSyncRoom_' + Math.floor(Math.random() * 10000);
    await p1.fill('#d2-create-name', roomName);
    await p1.click('.d2-create-view button:has-text("CREATE GAME")');

    await p1.waitForFunction(() => window.VELSCOUR.G.mode === 'game' && window.VELSCOUR.G.world?.kind === 'town');
    console.log('P1 created room and entered town.');

    const p1Room = await p1.evaluate(() => window.VELSCOUR.G.room);
    console.log(`P1 room maxPlayers: ${p1Room.maxPlayers}`);
    if (p1Room.maxPlayers > 4) {
      throw new Error(`Expected room.maxPlayers <= 4, got ${p1Room.maxPlayers}`);
    }

    // P2 joins room
    console.log('3. P2 joining room from lobby list...');
    const roomSelector = `.d2-game-row:has-text("${roomName}")`;
    await p2.waitForSelector(roomSelector, { timeout: 5000 });
    await p2.click(roomSelector);
    await p2.waitForTimeout(300);
    await p2.click('.d2-join-view button:has-text("JOIN GAME")');

    await p2.waitForFunction(() => window.VELSCOUR.G.mode === 'game' && window.VELSCOUR.G.world?.kind === 'town');
    console.log('P2 joined room and entered town.');
    await sleep(1500);

    // TEST 2: Skill visual execution and Leap jump arc (in dungeon)
    console.log('4. Entering dungeon with both players to test skills & monster persistence...');
    await p1.evaluate(() => {
      window.VELSCOUR.game.enterDungeon();
    });
    await sleep(1000);
    await p2.evaluate(() => {
      window.VELSCOUR.game.enterDungeon();
    });
    await sleep(3500);

    const p1Id = await p1.evaluate(async () => {
      const { net } = await import('/src/net/network.js');
      return net.myId;
    });

    const p1PosBefore = await p1.evaluate(() => ({ x: window.VELSCOUR.G.player.x, y: window.VELSCOUR.G.player.y }));
    const leapTarget = { x: p1PosBefore.x + 3.5, y: p1PosBefore.y + 2.5 };

    console.log(`P1 casting Leap from (${p1PosBefore.x.toFixed(1)}, ${p1PosBefore.y.toFixed(1)}) toward (${leapTarget.x.toFixed(1)}, ${leapTarget.y.toFixed(1)})...`);

    await p1.evaluate(async (target) => {
      const p = window.VELSCOUR.G.player;
      p.rage = 100;
      const { CLASS_SKILLS } = await import('/src/data/skills.js');
      const leapSk = CLASS_SKILLS.barbarian.find((s) => s.kind === 'leap') || { id: 'barbarian.0.2', kind: 'leap', m: { range: 1 }, el: 'phys', fx: 'leap' };
      p.char.skills[leapSk.id] = 5;
      const used = p.tryUseSkill(leapSk, target.x, target.y);
      console.log('p.tryUseSkill returned:', used);
    }, leapTarget);

    // Monitor P2's remote player instance for P1 to check if rp.z lifts into the air (> 0)
    let maxZSeenOnP2 = 0;
    let channelSeenOnP2 = false;
    for (let step = 0; step < 25; step++) {
      await sleep(30);
      const rpState = await p2.evaluate((id) => {
        const rp = window.VELSCOUR.G.remotePlayers?.get(id);
        if (!rp) return null;
        return {
          z: rp.z,
          x: rp.x,
          y: rp.y,
          hasChannel: !!rp.channel,
          channelName: rp.channel ? rp.channel.constructor.name : null,
        };
      }, p1Id);

      if (rpState) {
        if (rpState.z > maxZSeenOnP2) maxZSeenOnP2 = rpState.z;
        if (rpState.hasChannel) channelSeenOnP2 = true;
      }
    }

    console.log(`P2 saw RemotePlayer Leap: channelActive=${channelSeenOnP2}, maxZ=${maxZSeenOnP2.toFixed(1)}px`);
    if (maxZSeenOnP2 <= 10) {
      throw new Error(`Remote player did not jump into the air! maxZ=${maxZSeenOnP2}`);
    }

    // Wait for landing
    await sleep(500);
    const p2AfterLanding = await p2.evaluate((id) => {
      const rp = window.VELSCOUR.G.remotePlayers?.get(id);
      return { z: rp ? rp.z : 0, channel: !!(rp && rp.channel) };
    }, p1Id);
    console.log(`P2 RemotePlayer after landing: z=${p2AfterLanding.z}, channel=${p2AfterLanding.channel}`);
    if (p2AfterLanding.z > 5) {
      throw new Error(`Remote player remained stuck in the air after landing: z=${p2AfterLanding.z}`);
    }

    // TEST 3: Killed Monsters Persistence on Late Join
    console.log('5. Testing Killed Monsters Persistence on late dungeon entry...');
    // Have P2 return to town first so P1 stays in dungeon and kills monsters
    console.log('P2 returns to town...');
    await p2.evaluate(() => {
      window.VELSCOUR.game.enterTown();
    });
    await sleep(2000);

    const p1DungeonState = await p1.evaluate(() => {
      const w = window.VELSCOUR.G.world;
      const enemies = w.creatures.filter((c) => c.team === 'enemy' && !c.dead);
      return {
        depth: w.depth,
        biome: w.biome.id,
        count: enemies.length,
        firstTwo: enemies.slice(0, 2).map((e) => ({ netId: e.netId, idx: e.idx, name: e.name })),
      };
    });

    console.log(`P1 is in dungeon depth ${p1DungeonState.depth} with ${p1DungeonState.count} enemies.`);
    console.log(`P1 killing first 2 enemies:`, p1DungeonState.firstTwo);

    // P1 kills first 2 enemies
    await p1.evaluate(async (targets) => {
      const w = window.VELSCOUR.G.world;
      const { kill } = await import('/src/game/combat.js');
      for (const t of targets) {
        const m = w.creatures.find((c) => c.team === 'enemy' && (c.netId === t.netId || c.idx === t.idx));
        if (m) kill(m, w.player, { el: 'phys' });
      }
    }, p1DungeonState.firstTwo);

    await sleep(500);
    const p1Remaining = await p1.evaluate(() => window.VELSCOUR.G.world.creatures.filter((c) => c.team === 'enemy' && !c.dead).length);
    console.log(`P1 remaining enemies after kill: ${p1Remaining} (was ${p1DungeonState.count})`);

    // Now P2 enters the dungeon afterwards
    console.log('P2 now re-entering dungeon after monsters have been killed by P1...');
    await p2.evaluate(() => {
      window.VELSCOUR.game.enterDungeon();
    });
    await sleep(3500);

    const p2DungeonState = await p2.evaluate((killedTargets) => {
      const w = window.VELSCOUR.G.world;
      const enemies = w.creatures.filter((c) => c.team === 'enemy' && !c.dead);
      const killedFound = enemies.filter((e) => killedTargets.some((k) => (k.netId && k.netId === e.netId) || (k.idx && k.idx === e.idx)));
      return {
        depth: w.depth,
        count: enemies.length,
        killedFound: killedFound.map((e) => ({ netId: e.netId, idx: e.idx, name: e.name })),
      };
    }, p1DungeonState.firstTwo);

    console.log(`P2 is in dungeon depth ${p2DungeonState.depth} with ${p2DungeonState.count} enemies.`);
    console.log(`P2 enemies matching killed targets:`, p2DungeonState.killedFound);

    if (p2DungeonState.killedFound.length > 0) {
      throw new Error(`Monsters killed by P1 respawned for P2! Found: ${JSON.stringify(p2DungeonState.killedFound)}`);
    }

    console.log(`P2 monster count: ${p2DungeonState.count}, P1 monster count: ${p1Remaining}`);
    if (p2DungeonState.count !== p1Remaining) {
      throw new Error(`Monster count mismatch! P1 has ${p1Remaining}, but P2 has ${p2DungeonState.count}`);
    }

    console.log('SUCCESS: All 3 requirements verified perfectly!');
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
