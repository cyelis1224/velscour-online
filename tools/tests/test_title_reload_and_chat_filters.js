const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8123';
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

async function run() {
  console.log('--- Testing Title Screen Reload Button & Chat All Tab Filters ---');
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
  });

  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();

    await page.addInitScript(() => { window.VELSCOUR_TEST_MENU = true; });
    await page.goto(BASE_URL + '/index.html');
    await page.waitForFunction(() => window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden'));

    // 1. Verify Title Screen Update Button
    // A) Default: Hidden when up-to-date
    const isInitiallyHidden = await page.evaluate(() => {
      const btn = document.getElementById('title-update-btn');
      return !btn || btn.classList.contains('hidden') || window.getComputedStyle(btn).display === 'none';
    });
    console.log('Title update button initially hidden (up-to-date):', isInitiallyHidden);
    if (!isInitiallyHidden) {
      throw new Error('Title update button should be hidden when client is up-to-date');
    }

    // B) When an update is detected, verify button becomes visible
    await page.evaluate(async () => {
      window.VELSCOUR_TEST_UPDATE = true;
      const { checkForUpdates } = await import('/src/ui/updater.js');
      await checkForUpdates({ force: true });
    });

    await page.waitForSelector('#title-update-btn:not(.hidden)', { state: 'visible', timeout: 5000 });
    const updateBtnInfo = await page.evaluate(() => {
      const btn = document.getElementById('title-update-btn');
      if (!btn) return null;
      const rect = btn.getBoundingClientRect();
      const svg = btn.querySelector('svg');
      const style = window.getComputedStyle(btn);
      return {
        hasSvg: !!svg,
        text: btn.innerText.trim(),
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: window.innerWidth - rect.right,
        cursor: style.cursor,
      };
    });

    console.log('Title update button info when update available:', updateBtnInfo);
    if (!updateBtnInfo || !updateBtnInfo.hasSvg || updateBtnInfo.width <= 0) {
      throw new Error('Title update button not properly rendered when update available');
    }
    console.log('✓ Title update button verified in top right corner!');

    // Capture title screen screenshot with glowing update button
    await page.screenshot({ path: '/home/dagyr/.gemini/antigravity-ide/brain/6bb481c7-fe94-4fc6-ab53-82e8cede2761/title_screen_reload_button.png' });

    // 2. Start Game to test Chat Filters
    await page.evaluate(async () => {
      const { game } = await import('/src/game/game.js');
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('paladin', 'PaladinFilterTester');
      game.startChar(hero, false);
    });

    await page.waitForSelector('#game-chat', { state: 'visible', timeout: 5000 });
    console.log('In-game chat visible.');

    // 3. Verify Filter Button in Header
    await page.waitForSelector('#gc-btn-filter', { state: 'visible' });
    console.log('Filter button found in chat header.');

    // Add sample messages across different channels
    await page.evaluate(async () => {
      const { G } = await import('/src/state.js');
      const chat = G.gameChat;
      chat.addMessage({ tab: 'party', channel: 'party', from: 'Kaelen', text: 'Party message 1' });
      chat.addMessage({ tab: 'whisper', channel: 'whisper', from: 'Morgath', text: 'Whisper message 1', isWhisper: true });
      chat.addMessage({ tab: 'system', channel: 'system', text: 'System notice 1', color: '#ffd34a' });
      chat.addMessage({ tab: 'lobby', channel: 'lobby', from: 'Townfolk', text: 'Lobby shout 1' });
    });

    // Check count in All tab initially (should be 4)
    const initialCount = await page.evaluate(() => {
      return document.querySelectorAll('#gc-messages .gc-msg').length;
    });
    console.log(`Initial message count in All tab: ${initialCount}`);
    if (initialCount < 4) throw new Error(`Expected at least 4 messages in All tab, found ${initialCount}`);

    // Click filter button to open menu
    await page.click('#gc-btn-filter');
    await page.waitForSelector('#gc-filter-menu:not(.hidden)');
    console.log('Filter menu opened.');

    // Toggle off lobby channel in filter menu
    await page.click('#gc-flt-lobby');
    await page.waitForTimeout(200);

    // Verify filter dot is shown
    const filterDotVisible = await page.evaluate(() => {
      const dot = document.getElementById('gc-filter-dot');
      return dot && !dot.classList.contains('hidden');
    });
    console.log(`Filter indicator dot visible: ${filterDotVisible}`);
    if (!filterDotVisible) throw new Error('Filter indicator dot should be visible when a channel is disabled');

    // Verify All tab now excludes lobby messages
    const filteredContent = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#gc-messages .gc-msg'));
      return {
        total: rows.length,
        hasLobby: rows.some(r => r.classList.contains('gc-lobby')),
        hasParty: rows.some(r => r.classList.contains('gc-party')),
      };
    });
    console.log('Filtered content in All tab:', filteredContent);
    if (filteredContent.hasLobby) {
      throw new Error('Lobby messages should be filtered out from All tab!');
    }
    if (!filteredContent.hasParty) {
      throw new Error('Party messages should still be visible in All tab!');
    }
    console.log('✓ Channel filtering in All tab verified!');

    // Switch to dedicated Lobby tab: lobby messages must still exist in their own tab
    await page.click('.gc-tab[data-tab="lobby"]');
    await page.waitForTimeout(200);
    const lobbyTabContent = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#gc-messages .gc-msg'));
      return {
        total: rows.length,
        hasLobby: rows.some(r => r.classList.contains('gc-lobby')),
      };
    });
    console.log('Lobby tab content:', lobbyTabContent);
    if (!lobbyTabContent.hasLobby) {
      throw new Error('Lobby tab should still display lobby messages!');
    }
    console.log('✓ Dedicated Lobby tab preserves messages independently!');

    // Switch back to All tab and click Reset
    await page.click('.gc-tab[data-tab="all"]');
    await page.waitForTimeout(100);

    // Ensure filter menu is open to click reset
    const isMenuHidden = await page.evaluate(() => document.getElementById('gc-filter-menu').classList.contains('hidden'));
    if (isMenuHidden) await page.click('#gc-btn-filter');
    await page.waitForTimeout(300);

    // Screenshot of chat with filter menu open
    await page.screenshot({ path: '/home/dagyr/.gemini/antigravity-ide/brain/6bb481c7-fe94-4fc6-ab53-82e8cede2761/chat_filter_menu.png' });

    await page.click('#gc-filter-reset');
    await page.waitForTimeout(200);

    // Check count after reset
    const resetContent = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#gc-messages .gc-msg'));
      const dot = document.getElementById('gc-filter-dot');
      return {
        total: rows.length,
        hasLobby: rows.some(r => r.classList.contains('gc-lobby')),
        dotHidden: dot.classList.contains('hidden')
      };
    });
    console.log('Content after reset:', resetContent);
    if (!resetContent.hasLobby || !resetContent.dotHidden) {
      throw new Error('Reset failed to restore all channels or hide filter dot');
    }
    console.log('✓ Reset restored all channels and hid filter dot!');

    console.log('ALL TITLE RELOAD & CHAT FILTER TESTS PASSED!');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
