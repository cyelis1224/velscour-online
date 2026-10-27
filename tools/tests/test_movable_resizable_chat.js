const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8123';
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

async function run() {
  console.log('--- Testing Movable & Resizable Game Chat ---');
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

    // Start game / char
    await page.evaluate(async () => {
      const { game } = await import('/src/game/game.js');
      const S = await import('/src/game/save.js');
      const hero = S.newCharData('paladin', 'PaladinTest');
      game.startChar(hero, false);
    });

    await page.waitForSelector('#game-chat', { state: 'visible', timeout: 5000 });
    console.log('GameChat initialized and visible.');

    // 1. Check visual resize handle indicator
    const handleInfo = await page.evaluate(() => {
      const handle = document.getElementById('gc-resize-handle');
      if (!handle) return null;
      const svg = handle.querySelector('svg');
      const lines = svg ? svg.querySelectorAll('line').length : 0;
      const style = window.getComputedStyle(handle);
      return {
        hasSvg: !!svg,
        lines,
        cursor: style.cursor,
        userSelect: style.userSelect
      };
    });

    console.log('Resize handle info:', handleInfo);
    if (!handleInfo || !handleInfo.hasSvg || handleInfo.lines < 3) {
      throw new Error('Resize handle visual indicator SVG is missing or invalid');
    }

    // 2. Check user-select on buttons, tabs, dropdowns
    const userSelectChecks = await page.evaluate(() => {
      const tab = document.querySelector('.gc-tab');
      const channelBtn = document.getElementById('gc-channel-btn');
      const sendBtn = document.getElementById('gc-send-btn');
      const header = document.querySelector('.gc-header');
      return {
        tabUserSelect: window.getComputedStyle(tab).userSelect,
        channelBtnUserSelect: window.getComputedStyle(channelBtn).userSelect,
        sendBtnUserSelect: window.getComputedStyle(sendBtn).userSelect,
        headerUserSelect: window.getComputedStyle(header).userSelect,
      };
    });
    console.log('User select rules:', userSelectChecks);
    if (userSelectChecks.tabUserSelect !== 'none' ||
        userSelectChecks.channelBtnUserSelect !== 'none' ||
        userSelectChecks.sendBtnUserSelect !== 'none' ||
        userSelectChecks.headerUserSelect !== 'none') {
      throw new Error('One or more buttons/tabs still allow text selection!');
    }

    // 3. Test Dragging on the blank space in header
    const initialRect = await page.evaluate(() => {
      const rect = document.getElementById('game-chat').getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    });
    console.log('Initial chat rect:', initialRect);

    const dragHandlePos = await page.evaluate(() => {
      const el = document.querySelector('.gc-drag-handle');
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });

    console.log('Dragging from header blank spacer:', dragHandlePos);
    await page.mouse.move(dragHandlePos.x, dragHandlePos.y);
    await page.mouse.down();
    await page.mouse.move(dragHandlePos.x + 80, dragHandlePos.y - 60, { steps: 5 });
    await page.mouse.up();

    const movedRect = await page.evaluate(() => {
      const rect = document.getElementById('game-chat').getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    });
    console.log('Moved chat rect:', movedRect);

    if (Math.abs((movedRect.left - initialRect.left) - 80) > 4 ||
        Math.abs((movedRect.top - initialRect.top) - (-60)) > 4) {
      throw new Error(`Chat did not move as expected: initial=${JSON.stringify(initialRect)}, moved=${JSON.stringify(movedRect)}`);
    }
    console.log('Dragging test PASSED successfully!');

    // 4. Test Resizing from bottom-right corner
    const resizePos = await page.evaluate(() => {
      const handle = document.getElementById('gc-resize-handle');
      const r = handle.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    console.log('Resizing from bottom right handle:', resizePos);

    await page.mouse.move(resizePos.x, resizePos.y);
    await page.mouse.down();
    await page.mouse.move(resizePos.x + 70, resizePos.y + 50, { steps: 5 });
    await page.mouse.up();

    const resizedRect = await page.evaluate(() => {
      const rect = document.getElementById('game-chat').getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    });
    console.log('Resized chat rect:', resizedRect);

    if (resizedRect.width < movedRect.width + 50 || resizedRect.height < movedRect.height + 35) {
      throw new Error(`Chat did not resize properly: before=${JSON.stringify(movedRect)}, after=${JSON.stringify(resizedRect)}`);
    }
    console.log('Resizing test PASSED successfully!');

    // Add some sample chat messages to make the screenshot look great
    await page.evaluate(async () => {
      const { G } = await import('/src/state.js');
      const chat = G.gameChat;
      chat.addMessage({ tab: 'party', channel: 'party', from: 'Kaelen', text: 'Ready to enter the catacombs!' });
      chat.addMessage({ tab: 'whisper', channel: 'whisper', from: 'Morgath', text: 'Hey, bring some antidotes.', isWhisper: true });
      chat.addMessage({ tab: 'system', text: 'Party member Kaelen reached level 12!', color: '#ffd34a' });
    });

    const screenshotPath = '/home/dagyr/.gemini/antigravity-ide/brain/6bb481c7-fe94-4fc6-ab53-82e8cede2761/modern_game_chat_moved_resized.png';
    await page.screenshot({ path: screenshotPath });
    console.log('Screenshot saved to:', screenshotPath);

    console.log('ALL TESTS PASSED!');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
