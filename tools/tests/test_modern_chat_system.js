const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8123';
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

(async () => {
  console.log('--- STARTING MODERN GAME CHAT SYSTEM TEST ---');
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

    // Inject saves: P1 is Paladin (HostP1), P2 is Ranger (GuestP2), P3 is Necromancer (LobbyP3)
    await p1.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('paladin', 'HostP1');
      hero.level = 15;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p2.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('ranger', 'GuestP2');
      hero.level = 15;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p3.evaluate(async () => {
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('necromancer', 'LobbyP3');
      hero.level = 15;
      S.writeSave(hero);
      const { titleScreen } = await import('/src/ui/screens.js');
      titleScreen();
    });

    await p1.waitForTimeout(400);
    await p2.waitForTimeout(400);
    await p3.waitForTimeout(400);

    // Enter lobby on all 3
    await p1.click('button:has-text("Continue")');
    await p2.click('button:has-text("Continue")');
    await p3.click('button:has-text("Continue")');

    await p1.waitForSelector('#d2-lobby');
    await p2.waitForSelector('#d2-lobby');
    await p3.waitForSelector('#d2-lobby');
    console.log('All 3 players in lobby.');

    // Host (P1) creates game room
    await p1.click('button:has-text("CREATE GAME")');
    await p1.waitForTimeout(300);
    const roomName = 'ChatRoom_' + Math.floor(Math.random() * 10000);
    await p1.fill('#d2-create-name', roomName);
    await p1.click('.d2-create-view button:has-text("CREATE GAME")');

    // Wait for P1 to be in game
    await p1.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game' && window.VELSCOUR?.G?.world?.kind === 'town');
    console.log('P1 in game room as host.');

    // P2 joins game room
    await p2.click('button:has-text("JOIN GAME")');
    await p2.waitForTimeout(500);
    const roomSelector = `.d2-game-row:has-text("${roomName}")`;
    await p2.waitForSelector(roomSelector, { timeout: 8000 });
    await p2.click(roomSelector);
    await p2.waitForTimeout(300);
    await p2.click('.d2-join-view button:has-text("JOIN GAME")');

    await p2.waitForFunction(() => window.VELSCOUR?.G?.mode === 'game' && window.VELSCOUR?.G?.world?.kind === 'town');
    console.log('P2 in game room as guest.');

    // P3 stays in lobby!
    console.log('P3 remains in Lobby.');

    await p1.waitForSelector('#game-chat');
    await p2.waitForSelector('#game-chat');
    console.log('Modern game chat interface mounted on in-game clients.');

    // --- TEST 1: Party Chat In-Game ---
    console.log('\n--- TEST 1: Party Chat In-Game ---');
    const partyMsg = 'Party greeting ' + Math.floor(Math.random() * 10000);
    await p1.keyboard.press('Enter');
    await p1.waitForSelector('#party-chat-input:focus', { timeout: 3000 });
    await p1.fill('#party-chat-input', `/p ${partyMsg}`);
    await p1.keyboard.press('Enter');

    await p1.waitForTimeout(800);

    // Verify P1 has the message once in party tab
    const p1PartyCount = await p1.evaluate((msg) => {
      const msgs = Array.from(document.querySelectorAll('#gc-messages .gc-party'));
      return msgs.filter(m => m.textContent.includes(msg)).length;
    }, partyMsg);
    console.log(`Party message count in P1 game chat: ${p1PartyCount}`);
    if (p1PartyCount !== 1) throw new Error(`Expected P1 to have message 1 time, got ${p1PartyCount}`);

    // Verify P2 has the message once in party tab
    const p2PartyCount = await p2.evaluate((msg) => {
      const msgs = Array.from(document.querySelectorAll('#gc-messages .gc-party'));
      return msgs.filter(m => m.textContent.includes(msg)).length;
    }, partyMsg);
    console.log(`Party message count in P2 game chat: ${p2PartyCount}`);
    if (p2PartyCount !== 1) throw new Error(`Expected P2 to have message 1 time, got ${p2PartyCount}`);

    // --- TEST 2: In-Game Whisper & /r Reply Between Room Players ---
    console.log('\n--- TEST 2: In-Game Whisper & /r Reply ---');
    const whisperMsg1 = 'Secret whisper ' + Math.floor(Math.random() * 10000);
    await p1.keyboard.press('Enter');
    await p1.fill('#party-chat-input', `/w GuestP2 ${whisperMsg1}`);
    await p1.keyboard.press('Enter');

    await p2.waitForTimeout(800);

    // Verify P2 received whisper in whisper tab or all
    const p2WhisperReceived = await p2.evaluate((msg) => {
      const chat = window.VELSCOUR.G.gameChat;
      const found = chat.messages.find(m => m.tab === 'whisper' && m.text.includes(msg));
      return { found: !!found, from: found?.from, lastWhisperFrom: chat.lastWhisperFrom };
    }, whisperMsg1);
    console.log('P2 whisper received state:', p2WhisperReceived);
    if (!p2WhisperReceived.found || p2WhisperReceived.lastWhisperFrom !== 'HostP1') {
      throw new Error(`P2 whisper not received properly!`);
    }

    // Now P2 replies using /r
    const replyMsg1 = 'Reply via /r ' + Math.floor(Math.random() * 10000);
    await p2.keyboard.press('Enter');
    await p2.fill('#party-chat-input', `/r ${replyMsg1}`);
    await p2.keyboard.press('Enter');

    await p1.waitForTimeout(800);

    const p1ReplyReceived = await p1.evaluate((msg) => {
      const chat = window.VELSCOUR.G.gameChat;
      const found = chat.messages.find(m => m.tab === 'whisper' && m.text.includes(msg));
      return { found: !!found, from: found?.from, lastWhisperFrom: chat.lastWhisperFrom };
    }, replyMsg1);
    console.log('P1 received reply state:', p1ReplyReceived);
    if (!p1ReplyReceived.found || p1ReplyReceived.lastWhisperFrom !== 'GuestP2') {
      throw new Error(`P1 did not receive reply via /r!`);
    }
    console.log('✓ In-game whisper and /r reply between players passed!');

    // --- TEST 3: Cross-Room Whisper (Lobby to In-Game & Reply) ---
    console.log('\n--- TEST 3: Cross-Room Whisper (Lobby to In-Game) ---');
    const lobbyWhisper = 'Hello from lobby ' + Math.floor(Math.random() * 10000);
    // P3 in lobby whispers HostP1 in game room
    await p3.fill('.d2-chat-input-bar input', `/w HostP1 ${lobbyWhisper}`);
    await p3.click('.d2-chat-input-bar button:has-text("SEND")');

    await p1.waitForTimeout(800);

    const p1LobbyWhisperReceived = await p1.evaluate((msg) => {
      const chat = window.VELSCOUR.G.gameChat;
      const found = chat.messages.find(m => m.tab === 'whisper' && m.text.includes(msg));
      return { found: !!found, from: found?.from, lastWhisperFrom: chat.lastWhisperFrom };
    }, lobbyWhisper);
    console.log('P1 received whisper from LobbyP3:', p1LobbyWhisperReceived);
    if (!p1LobbyWhisperReceived.found || p1LobbyWhisperReceived.lastWhisperFrom !== 'LobbyP3') {
      throw new Error(`P1 in game did not receive whisper from P3 in lobby!`);
    }

    // P1 replies to LobbyP3 using /r
    const inGameReplyToLobby = 'Reply from dungeon ' + Math.floor(Math.random() * 10000);
    await p1.keyboard.press('Enter');
    await p1.fill('#party-chat-input', `/r ${inGameReplyToLobby}`);
    await p1.keyboard.press('Enter');

    await p3.waitForTimeout(800);

    const p3LobbyReceivedReply = await p3.evaluate((msg) => {
      const msgs = Array.from(document.querySelectorAll('.d2-chat-msg.whisper'));
      return msgs.some(m => m.textContent.includes(msg));
    }, inGameReplyToLobby);
    console.log('P3 in lobby received reply from P1 in game:', p3LobbyReceivedReply);
    if (!p3LobbyReceivedReply) {
      throw new Error(`P3 in lobby did not receive reply from in-game player!`);
    }
    console.log('✓ Cross-boundary whisper between lobby and game room passed!');

    // --- TEST 4: Chat Tabs & Filtering & Scroll History ---
    console.log('\n--- TEST 4: Tabs Filtering & Scroll History ---');
    // Switch P1 chat to 'whisper' tab
    await p1.click('.gc-tab[data-tab="whisper"]');
    await p1.waitForTimeout(300);

    const p1WhisperTabContent = await p1.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#gc-messages .gc-msg'));
      const hasParty = rows.some(r => r.classList.contains('gc-party'));
      const hasWhisper = rows.some(r => r.classList.contains('gc-whisper'));
      return { rowCount: rows.length, hasParty, hasWhisper };
    });
    console.log('P1 Whisper Tab content:', p1WhisperTabContent);
    if (p1WhisperTabContent.hasParty || !p1WhisperTabContent.hasWhisper) {
      throw new Error(`Whisper tab should only show whispers, but got party=${p1WhisperTabContent.hasParty}`);
    }

    // Switch P1 chat back to 'all' tab
    await p1.click('.gc-tab[data-tab="all"]');
    await p1.waitForTimeout(300);
    const p1AllTabContent = await p1.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#gc-messages .gc-msg'));
      const hasParty = rows.some(r => r.classList.contains('gc-party'));
      const hasWhisper = rows.some(r => r.classList.contains('gc-whisper'));
      return { rowCount: rows.length, hasParty, hasWhisper };
    });
    console.log('P1 All Tab content:', p1AllTabContent);
    if (!p1AllTabContent.hasParty || !p1AllTabContent.hasWhisper) {
      throw new Error(`All tab should show both party and whispers!`);
    }
    console.log('✓ Tabs filtering verified!');

    // Take screenshot of modern in-game chat interface
    await p1.screenshot({ path: '/home/dagyr/.gemini/antigravity-ide/brain/6bb481c7-fe94-4fc6-ab53-82e8cede2761/modern_game_chat_ui.png' });
    console.log('Saved screenshot of modern game chat.');

    console.log('\n--- ALL MODERN GAME CHAT TESTS PASSED! ---');
  } catch (err) {
    console.error('TEST ERROR:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
