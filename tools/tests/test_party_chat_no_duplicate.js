const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8123';
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

(async () => {
  console.log('--- STARTING PARTY CHAT NO DUPLICATE TEST ---');
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

    console.log('Navigating players...');
    await p1.goto(BASE_URL + '/index.html');
    await p2.goto(BASE_URL + '/index.html');

    await p1.waitForFunction(() => window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden'));
    await p2.waitForFunction(() => window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden'));

    // Inject saves: P1 is Paladin, P2 is Ranger
    await p1.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('paladin', 'ChatHost');
      hero.level = 10;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p2.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('ranger', 'ChatGuest');
      hero.level = 10;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p1.waitForTimeout(500);
    await p2.waitForTimeout(500);

    // Enter lobby on both
    await p1.click('button:has-text("Continue")');
    await p2.click('button:has-text("Continue")');

    await p1.waitForSelector('#d2-lobby');
    await p2.waitForSelector('#d2-lobby');
    console.log('Both players in lobby.');

    // Host creates room
    await p1.click('button:has-text("CREATE GAME")');
    await p1.waitForTimeout(300);
    const roomName = 'ChatTest_' + Math.floor(Math.random() * 10000);
    await p1.fill('#d2-create-name', roomName);
    await p1.click('.d2-create-view button:has-text("CREATE GAME")');

    // Wait for P1 to be in game
    await p1.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game' && window.VELSCOUR?.G?.world?.kind === 'town');
    console.log('P1 in town.');

    // P2 joins room
    await p2.click('button:has-text("JOIN GAME")');
    await p2.waitForTimeout(500);
    const roomSelector = `.d2-game-row:has-text("${roomName}")`;
    await p2.waitForSelector(roomSelector, { timeout: 8000 });
    await p2.click(roomSelector);
    await p2.waitForTimeout(300);
    await p2.click('.d2-join-view button:has-text("JOIN GAME")');

    await p2.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game' && window.VELSCOUR?.G?.world?.kind === 'town');
    console.log('P2 in town.');

    await p1.waitForFunction(() => window.VELSCOUR.G.remotePlayers && window.VELSCOUR.G.remotePlayers.size > 0);
    await p2.waitForFunction(() => window.VELSCOUR.G.remotePlayers && window.VELSCOUR.G.remotePlayers.size > 0);
    console.log('Both players connected in room.');

    // Now P1 sends a party chat message
    const testMsg = 'Hello party members! UniqueCode_' + Math.floor(Math.random() * 100000);
    console.log(`Sending party chat message from P1: "${testMsg}"`);

    // Press Enter to open party chat dialog on P1
    await p1.keyboard.press('Enter');
    await p1.waitForSelector('#party-chat-input', { timeout: 3000 });
    await p1.fill('#party-chat-input', testMsg);
    // Press Enter to submit
    await p1.keyboard.press('Enter');

    // Wait a moment for network roundtrip
    await p1.waitForTimeout(1000);

    // Count occurrences of testMsg in P1's chat
    const p1Occurrences = await p1.evaluate((msg) => {
      const chatBox = document.getElementById('game-chat') || document.getElementById('log');
      if (!chatBox) return 0;
      const text = chatBox.innerHTML;
      const matches = text.split(msg).length - 1;
      return matches;
    }, testMsg);

    console.log(`Occurrences of message in P1's log: ${p1Occurrences}`);
    if (p1Occurrences !== 1) {
      throw new Error(`Expected message to appear exactly 1 time in P1's log, but found ${p1Occurrences} times!`);
    }

    // Count occurrences in P2's chat
    const p2Occurrences = await p2.evaluate((msg) => {
      const chatBox = document.getElementById('game-chat') || document.getElementById('log');
      if (!chatBox) return 0;
      const text = chatBox.innerHTML;
      const matches = text.split(msg).length - 1;
      return matches;
    }, testMsg);

    console.log(`Occurrences of message in P2's log: ${p2Occurrences}`);
    if (p2Occurrences !== 1) {
      throw new Error(`Expected message to appear exactly 1 time in P2's log, but found ${p2Occurrences} times!`);
    }

    // Check P1 local chatBubble
    const p1Bubble = await p1.evaluate(() => window.VELSCOUR.G.player?.chatBubble);
    console.log(`P1 local chat bubble: "${p1Bubble}"`);
    if (p1Bubble !== testMsg) {
      throw new Error(`Expected P1 chatBubble to be "${testMsg}", got "${p1Bubble}"`);
    }

    // Check P2 sees chatBubble on remote player P1
    const p2RemoteBubble = await p2.evaluate(() => {
      const G = window.VELSCOUR.G;
      const rp = Array.from(G.remotePlayers.values())[0];
      return rp ? rp.chatBubble : null;
    });
    console.log(`P2 remote player chat bubble: "${p2RemoteBubble}"`);
    if (p2RemoteBubble !== testMsg) {
      throw new Error(`Expected P2 remote player chatBubble to be "${testMsg}", got "${p2RemoteBubble}"`);
    }

    // Also test P2 sending message to P1 by clicking Send button
    const testMsg2 = 'P2 says hi! UniqueCode_' + Math.floor(Math.random() * 100000);
    console.log(`Sending party chat message from P2 via Send button: "${testMsg2}"`);

    await p2.keyboard.press('Enter');
    await p2.waitForSelector('#party-chat-input', { timeout: 3000 });
    await p2.fill('#party-chat-input', testMsg2);
    // Click Send button
    await p2.click('#gc-send-btn');

    await p2.waitForTimeout(1000);

    const p2Occurrences2 = await p2.evaluate((msg) => {
      const chatBox = document.getElementById('game-chat') || document.getElementById('log');
      if (!chatBox) return 0;
      return chatBox.innerHTML.split(msg).length - 1;
    }, testMsg2);

    const p1Occurrences2 = await p1.evaluate((msg) => {
      const chatBox = document.getElementById('game-chat') || document.getElementById('log');
      if (!chatBox) return 0;
      return chatBox.innerHTML.split(msg).length - 1;
    }, testMsg2);

    console.log(`Occurrences of P2's message in P2's log: ${p2Occurrences2}, in P1's log: ${p1Occurrences2}`);
    if (p2Occurrences2 !== 1) {
      throw new Error(`Expected P2's message to appear 1 time in P2's log, got ${p2Occurrences2}`);
    }
    if (p1Occurrences2 !== 1) {
      throw new Error(`Expected P2's message to appear 1 time in P1's log, got ${p1Occurrences2}`);
    }

    console.log('✓ TEST PASSED: Own messages appear exactly once, and remote player sees speech bubble!');
  } catch (err) {
    console.error('TEST ERROR:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
