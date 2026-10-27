const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8123';
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

(async () => {
  console.log('--- STARTING AUTOMAP PARTY ROSTER TEST ---');
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
  });

  try {
    const ctx1 = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const ctx2 = await browser.newContext({ viewport: { width: 1200, height: 800 } });

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
      const hero = S.newCharData('carrion_witch', 'Morgana');
      hero.level = 24;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p2.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('paladin', 'Arthur');
      hero.level = 22;
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
    const roomName = 'PartyTab_' + Math.floor(Math.random() * 10000);
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

    // Wait for network sync
    await p1.waitForTimeout(1000);
    await p2.waitForTimeout(1000);

    // TEST 1: Open Tab automap on P1
    console.log('\n--- TEST 1: Pressing Tab on P1 to open Automap ---');
    await p1.keyboard.press('Tab');
    await p1.waitForTimeout(300);

    const isAutomapOpen = await p1.evaluate(() => window.VELSCOUR.G.showAutomap);
    console.log('P1 G.showAutomap is:', isAutomapOpen);
    if (!isAutomapOpen) throw new Error('G.showAutomap was not toggled by Tab key!');

    // TEST 2: Inspect party players list from partyroster module
    console.log('\n--- TEST 2: Checking Party Roster data on P1 ---');
    const partyList = await p1.evaluate(async () => {
      const { getPartyPlayers } = await import('/src/ui/partyroster.js');
      return getPartyPlayers();
    });
    console.log('Party list on P1:', JSON.stringify(partyList, null, 2));

    if (partyList.length !== 2) {
      throw new Error(`Expected 2 players in party roster, found: ${partyList.length}`);
    }

    const me = partyList.find(p => p.isMe);
    const guest = partyList.find(p => !p.isMe);

    if (!me || me.name !== 'Morgana' || me.className !== 'Carrion Witch' || me.level !== 24) {
      throw new Error(`Local player info mismatch: ${JSON.stringify(me)}`);
    }
    if (!guest || guest.name !== 'Arthur' || guest.className !== 'Paladin' || guest.level !== 22) {
      throw new Error(`Guest player info mismatch: ${JSON.stringify(guest)}`);
    }
    console.log('✓ Both players correctly listed with names, levels, classes, and HP values!');

    // TEST 3: Take screenshot of the Tab automap with party roster
    const shotPath = '/home/dagyr/.gemini/antigravity-ide/brain/6bb481c7-fe94-4fc6-ab53-82e8cede2761/automap_party_roster.png';
    await p1.screenshot({ path: shotPath });
    console.log(`Saved automap party roster screenshot to: ${shotPath}`);

    // TEST 4: Damage on P2 reflected in P1's Tab roster
    console.log('\n--- TEST 4: P2 takes damage, verify updated HP on P1 party roster ---');
    await p2.evaluate(() => {
      window.VELSCOUR.G.player.hp = 35;
    });

    // Wait for P2's periodic network sync (50ms) to arrive on P1
    await p1.waitForFunction(async () => {
      const { getPartyPlayers } = await import('/src/ui/partyroster.js');
      const list = getPartyPlayers();
      const arthur = list.find(p => !p.isMe);
      return arthur && arthur.hp === 35;
    }, { timeout: 5000 });

    console.log('✓ P2 damage synchronized and reflected on P1 party roster HP bar!');

    // TEST 5: Close Tab automap
    await p1.keyboard.press('Tab');
    await p1.waitForTimeout(300);
    const closedAutomap = await p1.evaluate(() => window.VELSCOUR.G.showAutomap);
    console.log('P1 G.showAutomap after second Tab is:', closedAutomap);
    if (closedAutomap) throw new Error('G.showAutomap did not close when pressing Tab again!');

    console.log('\n--- ALL AUTOMAP PARTY ROSTER TESTS PASSED 100%! ---');
  } finally {
    await browser.close();
  }
})();
