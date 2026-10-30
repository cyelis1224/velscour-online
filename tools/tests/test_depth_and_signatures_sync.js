const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8123';
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

(async () => {
  console.log('--- STARTING DEPTH PROGRESSION & SIGNATURES SYNC TEST ---');
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
  });

  try {
    const ctx1 = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const ctx2 = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const ctx3 = await browser.newContext({ viewport: { width: 1024, height: 768 } });

    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();
    const p3 = await ctx3.newPage();

    p1.on('console', m => console.log('[P1 browser]', m.text()));
    p1.on('pageerror', err => console.log('[P1 pageerror]', err));
    p2.on('console', m => console.log('[P2 browser]', m.text()));
    p2.on('pageerror', err => console.log('[P2 pageerror]', err));

    for (const p of [p1, p2, p3]) {
      await p.addInitScript(() => { window.VELSCOUR_TEST_MENU = true; });
    }

    console.log('Navigating players to game...');
    await p1.goto(BASE_URL + '/index.html');
    await p2.goto(BASE_URL + '/index.html');
    await p3.goto(BASE_URL + '/index.html');

    await p1.waitForFunction(() => window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden'));
    await p2.waitForFunction(() => window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden'));
    await p3.waitForFunction(() => window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden'));

    // Inject saves: P1 is Ranger, P2 is Death Knight (runeknight), P3 is observer
    await p1.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('ranger', 'HawkHost');
      hero.level = 20;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p2.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('death_knight', 'BladeGuest');
      hero.level = 20;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p3.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('paladin', 'LobbyWatcher');
      hero.level = 20;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p1.waitForTimeout(500);
    await p2.waitForTimeout(500);
    await p3.waitForTimeout(500);

    // Enter lobby on all 3
    for (const p of [p1, p2, p3]) {
      await p.click('button:has-text("Continue")');
      const enterBtn = p.locator('button:has-text("Enter Lobby")');
      if (await enterBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await enterBtn.click();
      }
    }

    await p1.waitForSelector('#d2-lobby');
    await p2.waitForSelector('#d2-lobby');
    await p3.waitForSelector('#d2-lobby');
    console.log('All 3 players in lobby.');

    // Host creates room
    await p1.click('button:has-text("CREATE GAME")');
    await p1.waitForTimeout(300);
    const roomName = 'DepthRoom_' + Math.floor(Math.random() * 10000);
    await p1.fill('#d2-create-name', roomName);
    await p1.click('.d2-create-view button:has-text("CREATE GAME")');

    // Wait for P1 to be in town
    await p1.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game' && window.VELSCOUR?.G?.world?.kind === 'town');
    console.log('P1 entered town as host.');

    // P2 joins room
    await p2.click('button:has-text("JOIN GAME")');
    await p2.waitForTimeout(500);
    const roomSelector = `.d2-game-row:has-text("${roomName}")`;
    await p2.waitForSelector(roomSelector, { timeout: 8000 });
    await p2.click(roomSelector);
    await p2.waitForTimeout(300);
    await p2.click('.d2-join-view button:has-text("JOIN GAME")');

    await p2.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game' && window.VELSCOUR?.G?.world?.kind === 'town');
    console.log('P2 entered town as guest.');

    // Verify remote player linked on both clients
    await p1.waitForFunction(() => window.VELSCOUR.G.remotePlayers && window.VELSCOUR.G.remotePlayers.size > 0);
    await p2.waitForFunction(() => window.VELSCOUR.G.remotePlayers && window.VELSCOUR.G.remotePlayers.size > 0);
    console.log('Both players see each other in town.');

    // --- VERIFY SIGNATURES IN TOWN ---
    console.log('\n--- VERIFYING SIGNATURES IN TOWN ---');
    const p1SigState = await p1.evaluate(() => {
      const G = window.VELSCOUR.G;
      const rp = Array.from(G.remotePlayers.values())[0];
      return {
        localClass: G.player.classId,
        localHasSig: !!G.player.sig,
        localSigCls: G.player.sig?.cls,
        remoteClass: rp?.classId,
        remoteHasSig: !!rp?.sig,
        remoteSigCls: rp?.sig?.cls,
        remoteSigTop: !!rp?._sigTop,
      };
    });
    console.log('P1 view of signatures in town:', p1SigState);

    const p2SigState = await p2.evaluate(() => {
      const G = window.VELSCOUR.G;
      const rp = Array.from(G.remotePlayers.values())[0];
      return {
        localClass: G.player.classId,
        localHasSig: !!G.player.sig,
        localSigCls: G.player.sig?.cls,
        remoteClass: rp?.classId,
        remoteHasSig: !!rp?.sig,
        remoteSigCls: rp?.sig?.cls,
        remoteSigTop: !!rp?._sigTop,
      };
    });
    console.log('P2 view of signatures in town:', p2SigState);

    if (!p1SigState.localHasSig || p1SigState.localSigCls !== 'ranger') {
      throw new Error(`P1 Ranger expected ranger signature, got: ${p1SigState.localSigCls}`);
    }
    if (!p1SigState.remoteHasSig || p1SigState.remoteSigCls !== 'death_knight') {
      throw new Error(`P1 seeing P2 expected death_knight signature, got: ${p1SigState.remoteSigCls}`);
    }
    if (!p2SigState.localHasSig || p2SigState.localSigCls !== 'death_knight') {
      throw new Error(`P2 Death Knight expected death_knight signature, got: ${p2SigState.localSigCls}`);
    }
    if (!p2SigState.remoteHasSig || p2SigState.remoteSigCls !== 'ranger') {
      throw new Error(`P2 seeing P1 expected ranger signature, got: ${p2SigState.remoteSigCls}`);
    }
    console.log('✓ Class signatures verified for both local and remote players in town!');

    await p1.screenshot({ path: '/home/dagyr/.gemini/antigravity-ide/brain/6bb481c7-fe94-4fc6-ab53-82e8cede2761/town_signatures_sync.png' });
    console.log('Saved town signatures screenshot.');

    // Check Town Portal label in town
    const townPortalLabel = await p1.evaluate(() => {
      const portal = window.VELSCOUR.G.world.portals.find(p => !p.breach);
      return portal ? portal.label : null;
    });
    console.log('Town portal label at start:', townPortalLabel);
    if (!townPortalLabel.includes('Depth 1')) {
      throw new Error(`Expected Town Portal label to say Depth 1, got ${townPortalLabel}`);
    }

    // Check LobbyWatcher (P3) sees [Depth 1]
    const p3LobbyBadgeInitial = await p3.evaluate((rName) => {
      const row = Array.from(document.querySelectorAll('.d2-game-row')).find(el => el.textContent.includes(rName));
      return row ? row.querySelector('.d2-room-depth')?.textContent : null;
    }, roomName);
    console.log('Lobby watcher initial depth badge:', p3LobbyBadgeInitial);
    if (p3LobbyBadgeInitial !== '[Depth 1]') {
      throw new Error(`Expected Lobby watcher to see [Depth 1], got ${p3LobbyBadgeInitial}`);
    }

    // --- ENTER DUNGEON DEPTH 1 ---
    console.log('\n--- ENTERING DUNGEON DEPTH 1 ---');
    // Move both players to the town portal
    await p1.evaluate(() => {
      const portal = window.VELSCOUR.G.world.portals.find(p => !p.breach);
      window.VELSCOUR.G.player.x = portal.x;
      window.VELSCOUR.G.player.y = portal.y;
    });
    await p2.evaluate(() => {
      const portal = window.VELSCOUR.G.world.portals.find(p => !p.breach);
      window.VELSCOUR.G.player.x = portal.x;
      window.VELSCOUR.G.player.y = portal.y;
    });
    await p1.waitForTimeout(500);

    // P1 enters dungeon, P2 enters dungeon
    await p1.evaluate(() => {
      window.VELSCOUR.G.game.enterDungeon();
    });
    await p2.waitForTimeout(600);
    await p2.evaluate(() => {
      window.VELSCOUR.G.game.enterDungeon();
    });

    await p1.waitForFunction(() => window.VELSCOUR?.G?.world?.kind === 'dungeon' && document.querySelector('#loading').classList.contains('hidden'), { timeout: 15000 });
    await p2.waitForFunction(() => window.VELSCOUR?.G?.world?.kind === 'dungeon' && document.querySelector('#loading').classList.contains('hidden'), { timeout: 15000 });

    const p1DungeonDepth = await p1.evaluate(() => window.VELSCOUR.G.world.depth);
    const p2DungeonDepth = await p2.evaluate(() => window.VELSCOUR.G.world.depth);
    console.log(`Both players entered dungeon: P1 depth=${p1DungeonDepth}, P2 depth=${p2DungeonDepth}`);
    if (p1DungeonDepth !== 1 || p2DungeonDepth !== 1) {
      throw new Error(`Expected depth 1, got P1=${p1DungeonDepth}, P2=${p2DungeonDepth}`);
    }

    // --- ADVANCE TO DEPTH 2 VIA PORTAL CHOICE ---
    console.log('\n--- ADVANCING TO DEPTH 2 VIA PORTAL CHOICE ---');
    await p1.evaluate(() => {
      // simulate reaching exit portal
      const G = window.VELSCOUR.G;
      G.game.portalChoice(G.world);
    });

    await p1.waitForTimeout(500);
    // Click Descend to Depth 2 for P1
    await p1.evaluate(() => {
      const descendBtn = Array.from(document.querySelectorAll('.portal-choice button')).find(b => b.textContent.includes('Descend'));
      if (descendBtn) descendBtn.click();
      else throw new Error('Descend button not found in portal choice dialog');
    });

    // P2 also selects to descend with the party
    await p2.waitForTimeout(600);
    await p2.evaluate(() => {
      const G = window.VELSCOUR.G;
      G.game.portalChoice(G.world);
    });
    await p2.waitForTimeout(400);
    await p2.evaluate(() => {
      const descendBtn = Array.from(document.querySelectorAll('.portal-choice button')).find(b => b.textContent.includes('Descend'));
      if (descendBtn) descendBtn.click();
    });

    await p1.waitForFunction(() => window.VELSCOUR?.G?.world?.depth === 2 && document.querySelector('#loading').classList.contains('hidden'), { timeout: 15000 });
    await p2.waitForFunction(() => window.VELSCOUR?.G?.world?.depth === 2 && document.querySelector('#loading').classList.contains('hidden'), { timeout: 15000 });

    const p1Depth2 = await p1.evaluate(() => window.VELSCOUR.G.world.depth);
    const p2Depth2 = await p2.evaluate(() => window.VELSCOUR.G.world.depth);
    const p1RoomDepth2 = await p1.evaluate(() => window.VELSCOUR.G.room.depth);
    console.log(`Players at Depth 2: P1 world.depth=${p1Depth2}, room.depth=${p1RoomDepth2}; P2 world.depth=${p2Depth2}`);

    if (p1Depth2 !== 2 || p2Depth2 !== 2 || p1RoomDepth2 !== 2) {
      throw new Error(`Depth did not advance to 2! P1 world=${p1Depth2}, room=${p1RoomDepth2}; P2 world=${p2Depth2}`);
    }

    // Verify Lobby watcher updated to [Depth 2]
    await p3.waitForFunction((rName) => {
      const row = Array.from(document.querySelectorAll('.d2-game-row')).find(el => el.textContent.includes(rName));
      return row && row.querySelector('.d2-room-depth')?.textContent === '[Depth 2]';
    }, roomName, { timeout: 5000 });
    console.log('✓ Lobby screen successfully updated to [Depth 2]!');

    // --- ADVANCE TO DEPTH 3 VIA PORTAL CHOICE ---
    console.log('\n--- ADVANCING TO DEPTH 3 VIA PORTAL CHOICE ---');
    await p1.evaluate(() => {
      const G = window.VELSCOUR.G;
      G.game.portalChoice(G.world);
    });

    await p1.waitForTimeout(500);
    await p1.evaluate(() => {
      const descendBtn = Array.from(document.querySelectorAll('.portal-choice button')).find(b => b.textContent.includes('Descend'));
      if (descendBtn) descendBtn.click();
      else throw new Error('Descend button not found');
    });

    await p2.waitForTimeout(600);
    await p2.evaluate(() => {
      const G = window.VELSCOUR.G;
      G.game.portalChoice(G.world);
    });
    await p2.waitForTimeout(400);
    await p2.evaluate(() => {
      const descendBtn = Array.from(document.querySelectorAll('.portal-choice button')).find(b => b.textContent.includes('Descend'));
      if (descendBtn) descendBtn.click();
    });

    await p1.waitForFunction(() => window.VELSCOUR?.G?.world?.depth === 3 && document.querySelector('#loading').classList.contains('hidden'), { timeout: 15000 });
    await p2.waitForFunction(() => window.VELSCOUR?.G?.world?.depth === 3 && document.querySelector('#loading').classList.contains('hidden'), { timeout: 15000 });

    const p1Depth3 = await p1.evaluate(() => window.VELSCOUR.G.world.depth);
    const p2Depth3 = await p2.evaluate(() => window.VELSCOUR.G.world.depth);
    const p1RoomDepth3 = await p1.evaluate(() => window.VELSCOUR.G.room.depth);
    console.log(`Players at Depth 3: P1 world.depth=${p1Depth3}, room.depth=${p1RoomDepth3}; P2 world.depth=${p2Depth3}`);

    if (p1Depth3 !== 3 || p2Depth3 !== 3 || p1RoomDepth3 !== 3) {
      throw new Error(`Depth did not advance to 3! P1 world=${p1Depth3}, room=${p1RoomDepth3}; P2 world=${p2Depth3}`);
    }

    // Verify Lobby watcher updated to [Depth 3]
    await p3.waitForFunction((rName) => {
      const row = Array.from(document.querySelectorAll('.d2-game-row')).find(el => el.textContent.includes(rName));
      return row && row.querySelector('.d2-room-depth')?.textContent === '[Depth 3]';
    }, roomName, { timeout: 5000 });
    console.log('✓ Lobby screen successfully updated to [Depth 3]!');

    // --- RETURN TO TOWN FROM DEPTH 3 ---
    console.log('\n--- RETURNING TO TOWN FROM DEPTH 3 ---');
    await p1.evaluate(() => {
      window.VELSCOUR.G.game.useTownPortal();
    });
    await p1.waitForTimeout(300);
    await p1.evaluate(() => {
      const returnBtn = Array.from(document.querySelectorAll('.dialog-box button')).find(b => b.textContent === 'Return');
      if (returnBtn) returnBtn.click();
    });

    await p2.evaluate(() => {
      window.VELSCOUR.G.game.useTownPortal();
    });
    await p2.waitForTimeout(300);
    await p2.evaluate(() => {
      const returnBtn = Array.from(document.querySelectorAll('.dialog-box button')).find(b => b.textContent === 'Return');
      if (returnBtn) returnBtn.click();
    });

    await p1.waitForFunction(() => window.VELSCOUR?.G?.world?.kind === 'town', { timeout: 10000 });
    await p2.waitForFunction(() => window.VELSCOUR?.G?.world?.kind === 'town', { timeout: 10000 });
    console.log('Both players returned to town.');

    // Check Town Portal label on both clients
    const p1TownPortalLabel = await p1.evaluate(() => {
      const portal = window.VELSCOUR.G.world.portals.find(p => !p.breach);
      return portal ? portal.label : null;
    });
    const p2TownPortalLabel = await p2.evaluate(() => {
      const portal = window.VELSCOUR.G.world.portals.find(p => !p.breach);
      return portal ? portal.label : null;
    });

    console.log('P1 Town Portal label:', p1TownPortalLabel);
    console.log('P2 Town Portal label:', p2TownPortalLabel);

    if (p1TownPortalLabel !== 'Portal — Depth 3' || p2TownPortalLabel !== 'Portal — Depth 3') {
      throw new Error(`Town portal label mismatch! P1: ${p1TownPortalLabel}, P2: ${p2TownPortalLabel}`);
    }
    console.log('✓ Town portal labels accurately reflect Depth 3 on both players!');

    // Check Lobby watcher still sees [Depth 3]
    const p3LobbyBadgeTown = await p3.evaluate((rName) => {
      const row = Array.from(document.querySelectorAll('.d2-game-row')).find(el => el.textContent.includes(rName));
      return row ? row.querySelector('.d2-room-depth')?.textContent : null;
    }, roomName);
    console.log('Lobby watcher depth badge after returning to town:', p3LobbyBadgeTown);
    if (p3LobbyBadgeTown !== '[Depth 3]') {
      throw new Error(`Expected Lobby watcher to see [Depth 3], got ${p3LobbyBadgeTown}`);
    }
    console.log('✓ Lobby screen displays [Depth 3] while players are in town!');

    // Take screenshot of lobby watcher
    await p3.screenshot({ path: '/home/dagyr/.gemini/antigravity-ide/brain/6bb481c7-fe94-4fc6-ab53-82e8cede2761/lobby_depth_sync.png' });
    console.log('Saved lobby screenshot.');

    console.log('\n--- ALL DEPTH & SIGNATURES VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
  } catch (err) {
    console.error('TEST ERROR:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
