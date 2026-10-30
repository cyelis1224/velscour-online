const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8123';
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

(async () => {
  console.log('--- STARTING BARD MULTIPLAYER MUSIC & TAB SYNC TEST ---');
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
  });

  try {
    const ctx1 = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const ctx2 = await browser.newContext({ viewport: { width: 1024, height: 768 } });

    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    p1.on('console', m => {
      const txt = m.text();
      if (!txt.includes('AudioContext') && !txt.includes('WebGL')) {
        console.log('[P1]', txt);
      }
    });
    p2.on('console', m => {
      const txt = m.text();
      if (!txt.includes('AudioContext') && !txt.includes('WebGL')) {
        console.log('[P2]', txt);
      }
    });

    for (const p of [p1, p2]) {
      await p.addInitScript(() => { window.VELSCOUR_TEST_MENU = true; });
    }

    console.log('Loading game on P1 and P2...');
    await p1.goto(BASE_URL + '/index.html');
    await p2.goto(BASE_URL + '/index.html');

    await p1.waitForFunction(() => window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden'));
    await p2.waitForFunction(() => window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden'));

    // P1: Bard character
    await p1.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('bard', 'MasterBard');
      hero.level = 10;
      hero.depth = 1;
      hero.skills = { 'bard.0.0': 5, 'bard.0.1': 5, 'bard.1.0': 5 };
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    // P2: Paladin character
    await p2.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('paladin', 'ListenerKnight');
      hero.level = 10;
      hero.depth = 1;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p1.waitForTimeout(400);
    await p2.waitForTimeout(400);

    // Continue past title and enter lobby
    await p1.click('button:has-text("Continue")');
    await p1.waitForSelector('button:has-text("Enter Lobby")');
    await p1.click('button:has-text("Enter Lobby")');

    await p2.click('button:has-text("Continue")');
    await p2.waitForSelector('button:has-text("Enter Lobby")');
    await p2.click('button:has-text("Enter Lobby")');

    await p1.waitForSelector('#d2-lobby');
    await p2.waitForSelector('#d2-lobby');
    console.log('Both players in lobby.');

    const roomName = 'BardJam_' + Math.floor(Math.random() * 10000);
    console.log(`Creating multiplayer room "${roomName}"...`);

    // P1 creates room
    await p1.click('button:has-text("CREATE GAME")');
    await p1.waitForTimeout(300);
    await p1.fill('#d2-create-name', roomName);
    await p1.click('.d2-create-view button:has-text("CREATE GAME")');

    await p1.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game' && window.VELSCOUR?.G?.world?.kind === 'town');
    console.log('P1 created and entered game in town.');

    // P2 joins room
    await p2.waitForTimeout(800);
    await p2.click('button:has-text("JOIN GAME")');
    await p2.waitForTimeout(600);

    const roomSelector = `.d2-game-row:has-text("${roomName}")`;
    await p2.waitForSelector(roomSelector, { timeout: 5000 });
    await p2.click(roomSelector);
    await p2.waitForTimeout(300);
    await p2.click('.d2-join-view button:has-text("JOIN GAME")');

    await p2.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game' && window.VELSCOUR?.G?.world?.kind === 'town');
    console.log('P2 successfully joined room and entered town.');

    // Both enter dungeon depth 1 so Bard music and notation are active
    console.log('Transitioning party to dungeon depth 1...');
    await p1.evaluate(() => {
      const portal = window.VELSCOUR.G.world.portals[0];
      window.VELSCOUR.G.player.x = portal.x;
      window.VELSCOUR.G.player.y = portal.y;
      window.VELSCOUR.G.char.nextBiome = 'catacombs';
    });
    await p2.evaluate(() => {
      const portal = window.VELSCOUR.G.world.portals[0];
      window.VELSCOUR.G.player.x = portal.x;
      window.VELSCOUR.G.player.y = portal.y;
    });

    await p1.evaluate(() => window.VELSCOUR.game.enterDungeon());
    await p2.waitForFunction(() => window.VELSCOUR.G.room?.biome === 'catacombs', null, { timeout: 5000 });
    await p2.evaluate(() => window.VELSCOUR.game.enterDungeon());

    await p1.waitForFunction(() => window.VELSCOUR.G.world?.kind === 'dungeon' && !document.querySelector('#loading:not(.hidden)'), null, { timeout: 15000 });
    await p2.waitForFunction(() => window.VELSCOUR.G.world?.kind === 'dungeon' && !document.querySelector('#loading:not(.hidden)'), null, { timeout: 15000 });
    console.log('Both players in dungeon Depth 1.');

    // Ensure P2 sees P1 as a remote player
    await p2.waitForFunction(() => {
      const G = window.VELSCOUR.G;
      return G.remotePlayers && G.remotePlayers.size >= 1;
    }, { timeout: 5000 });
    console.log('P2 registered remote player for P1.');

    // Attach note tapping hook on P2
    await p2.evaluate(async () => {
      const { setNoteTap } = await import('/src/core/sampler.js');
      window.__tappedNotes = [];
      setNoteTap((note) => {
        window.__tappedNotes.push(note);
      });
    });

    // P1 writes and loads a custom Tab: "Ode to Joy"
    console.log('P1 loading custom music sheet into Tab 1...');
    await p1.evaluate(async () => {
      const G = window.VELSCOUR.G;
      const { loadTab } = await import('/src/ui/sheets.js');
      const tabText = `
e|-------------------|
B|-------------------|
G|--0--2--4--5-------|
D|-------------------|
A|-------------------|
E|-------------------|
`;
      G.char.bag[0] = {
        uid: 'test_sheet_ode',
        type: 'sheet',
        title: 'Ode to Joy',
        text: tabText,
        inked: true,
        bpm: 140,
      };
      loadTab(0, 0);
    });

    // Wait for P2 to receive P1's custom bard sheet
    console.log('Checking that P2 received P1\'s custom sheet and song data...');
    await p2.waitForFunction(() => {
      const G = window.VELSCOUR.G;
      const rp = Array.from(G.remotePlayers.values())[0];
      return rp && rp.char?.tabs && rp.char.tabs[0] && rp.char.tabs[0].title === 'Ode to Joy';
    }, { timeout: 6000 });

    const remoteSongInfo = await p2.evaluate(() => {
      const G = window.VELSCOUR.G;
      const rp = Array.from(G.remotePlayers.values())[0];
      return {
        tabTitle: rp.char.tabs[0].title,
        songName: rp.score?.song?.name,
        bpm: rp.score?.song?.tempo,
      };
    });
    console.log('P2 remote player song info:', remoteSongInfo);
    if (remoteSongInfo.tabTitle !== 'Ode to Joy') {
      throw new Error(`Expected tabTitle 'Ode to Joy', got: ${remoteSongInfo.tabTitle}`);
    }

    // Now P1 plays a note skill (e.g. bard basic attack bard.0.0)
    console.log('P1 casting note skills to play the sheet...');
    const castDebug = await p1.evaluate(() => {
      const G = window.VELSCOUR.G;
      if (!G.char.skills) G.char.skills = {};
      G.char.skills['bard.0.0'] = 5;
      if (G.player.char) {
        if (!G.player.char.skills) G.player.char.skills = {};
        G.player.char.skills['bard.0.0'] = 5;
      }
      G.player.castLock = 0;
      const { SKILLS } = window.VELSCOUR;
      const sk = SKILLS ? SKILLS['bard.0.0'] : 'bard.0.0';
      const before = {
        dead: G.player.dead,
        castLock: G.player.castLock,
        level: G.player.skillLevel(sk),
        mana: G.player.mana,
      };
      const ok = G.player.tryUseSkill('bard.0.0', G.player.x + 2, G.player.y);
      return { before, ok };
    });
    console.log('P1 tryUseSkill debug:', castDebug);

    // Wait for P2 to hear P1's note played over the audio sampler tap
    await p2.waitForFunction(() => window.__tappedNotes && window.__tappedNotes.length > 0, { timeout: 6000 });

    const audioTaps = await p2.evaluate(() => window.__tappedNotes);
    console.log(`P2 intercepted ${audioTaps.length} audio notes played by remote Bard:`, audioTaps[0]);

    if (!audioTaps || audioTaps.length === 0) {
      throw new Error('P2 failed to hear the note played by P1!');
    }
    if (typeof audioTaps[0].vel !== 'number' || audioTaps[0].vel <= 0) {
      throw new Error(`Invalid velocity on heard note: ${audioTaps[0].vel}`);
    }

    // Verify ScoreFx is actively rendering over the remote Bard on P2
    const scoreFxActive = await p2.evaluate(async () => {
      const G = window.VELSCOUR.G;
      const { effects } = await import('/src/gfx/vfx.js');
      const { ScoreFx } = await import('/src/gfx/notation.js');
      const rp = Array.from(G.remotePlayers.values())[0];
      return effects.some(e => e instanceof ScoreFx && e.p === rp);
    });
    console.log('ScoreFx active over remote Bard on P2 client:', scoreFxActive);
    if (!scoreFxActive) {
      throw new Error('ScoreFx was not created/active for remote Bard on P2 client!');
    }

    // P1 continues casting to trigger a Cadence
    console.log('P1 casting remaining beats to trigger a Cadence...');
    await p1.evaluate(() => {
      const G = window.VELSCOUR.G;
      for (let i = 0; i < 4; i++) {
        G.player.cooldowns['bard.0.0'] = 0;
        G.player.castLock = 0;
        G.player.tryUseSkill('bard.0.0', G.player.x + 2, G.player.y);
      }
    });

    await p2.waitForFunction(() => window.__tappedNotes && window.__tappedNotes.length >= 3, { timeout: 6000 });

    const finalNotesCount = await p2.evaluate(() => window.__tappedNotes.length);
    console.log(`Total notes heard by P2 after cadence progression: ${finalNotesCount}`);

    console.log('--- TEST PASSED: BARD MULTIPLAYER MUSIC & TAB SYNC CONFIRMED! ---');
  } catch (err) {
    console.error('TEST FAILED:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
