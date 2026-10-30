// Test Mobile Portrait UI Layout & Bottom Docked Chat
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.join(__dirname, 'out');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

async function runTest() {
  console.log('Testing Mobile Portrait UI Layout & Bottom Docked Chat...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
  });

  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Error') || text.includes('error')) {
      console.log(`[Browser Console] ${text}`);
    }
  });

  try {
    await page.goto('http://localhost:8123/?touch=1&autostart=1', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1500);

    // Ensure we are in game / town
    await page.evaluate(async () => {
      const { G, game } = window.VELSCOUR;
      const { newCharData } = await import('/src/game/save.js');
      const { GameChat } = await import('/src/ui/chat.js');
      const { TouchUI } = await import('/src/ui/touch.js');

      // Start game as level 33 death knight with skills
      if (!G.char) {
        G.char = newCharData('death_knight', 'PortraitTester');
        G.char.level = 33;
        G.char.bar = [
          'death_knight.0.0', 'death_knight.0.1', 'death_knight.0.2', 'death_knight.1.0',
          'death_knight.1.1', 'death_knight.1.2', 'death_knight.2.0', 'death_knight.2.1',
          'death_knight.2.2', 'death_knight.3.0', 'death_knight.3.1', 'death_knight.3.2',
          'death_knight.4.0', 'death_knight.4.1', 'death_knight.4.2'
        ];
      }
      G.touch = true;
      document.body.classList.add('touch', 'portrait');

      if (!G.game.map) {
        await G.game.startSinglePlayer(G.char, false);
      }
      const { HUD } = await import('/src/ui/hud.js');
      GameChat.init();
      TouchUI.init();
      TouchUI.show(true);
      HUD.layoutMobile();
      TouchUI.layout();
    });

    await page.waitForTimeout(800);

    // Measure positions in collapsed state
    const collapsedData = await page.evaluate(() => {
      const chat = document.getElementById('game-chat');
      const chatRect = chat.getBoundingClientRect();
      const hudBar = document.getElementById('hud-bar');
      const hudBarRect = hudBar.getBoundingClientRect();
      const minimap = document.getElementById('minimap-wrap');
      const minimapRect = minimap.getBoundingClientRect();
      const skull = document.getElementById('velscour-skull');
      const skullRect = skull.getBoundingClientRect();
      const greed = document.getElementById('hud-dials');
      const greedRect = greed.getBoundingClientRect();
      const madness = document.getElementById('madness-btn');
      const madnessRect = madness ? madness.getBoundingClientRect() : null;
      const smite = document.getElementById('smite-btn');
      const smiteRect = smite ? smite.getBoundingClientRect() : null;
      const atkBtn = document.querySelector('#touch-buttons .tbtn:not(.portrait-tile)');
      const atkRect = atkBtn ? atkBtn.getBoundingClientRect() : null;
      const skillTray = document.querySelector('#touch-buttons .portrait-tile');
      const trayRect = skillTray ? skillTray.getBoundingClientRect() : null;

      return {
        chatHeight: chatRect.height,
        chatBottom: window.innerHeight - chatRect.bottom,
        chatLeft: chatRect.left,
        chatWidth: chatRect.width,
        hudBarBottom: window.innerHeight - hudBarRect.bottom,
        minimapWidth: minimapRect.width,
        minimapTop: minimapRect.top,
        minimapRight: window.innerWidth - minimapRect.right,
        skullTop: skullRect.top,
        skullRight: window.innerWidth - skullRect.right,
        greedTop: greedRect.top,
        madnessLeft: madnessRect ? madnessRect.left : 0,
        smiteLeft: smiteRect ? smiteRect.left : 0,
        atkLeft: atkRect ? atkRect.left : 0,
        atkTop: atkRect ? atkRect.top : 0,
        isChatMinimized: chat.classList.contains('minimized'),
      };
    });

    console.log('Collapsed state metrics:', collapsedData);

    // Save screenshot of collapsed portrait view
    await page.screenshot({ path: path.join(outDir, 'portrait_collapsed.png') });

    // Open/expand chat
    await page.evaluate(() => {
      const toggle = document.getElementById('gc-btn-toggle');
      if (toggle) toggle.click();
    });

    await page.waitForTimeout(500);

    // Measure positions in expanded state
    const expandedData = await page.evaluate(() => {
      const chat = document.getElementById('game-chat');
      const chatRect = chat.getBoundingClientRect();
      const hudBar = document.getElementById('hud-bar');
      const hudBarRect = hudBar.getBoundingClientRect();
      const atkBtn = document.querySelector('#touch-buttons .tbtn:not(.portrait-tile)');
      const atkRect = atkBtn ? atkBtn.getBoundingClientRect() : null;

      return {
        chatHeight: chatRect.height,
        hudBarBottom: window.innerHeight - hudBarRect.bottom,
        atkTop: atkRect ? atkRect.top : 0,
        isChatMinimized: chat.classList.contains('minimized'),
      };
    });

    console.log('Expanded state metrics:', expandedData);

    // Save screenshot of expanded portrait view
    await page.screenshot({ path: path.join(outDir, 'portrait_expanded.png') });

    // Verify expectations
    if (collapsedData.chatBottom > 2) throw new Error(`Chat is not at bottom! chatBottom=${collapsedData.chatBottom}`);
    if (collapsedData.chatHeight > 45) throw new Error(`Chat is not collapsed! height=${collapsedData.chatHeight}`);
    if (collapsedData.minimapWidth < 90) throw new Error(`Minimap was not resized! width=${collapsedData.minimapWidth}`);
    if (collapsedData.skullTop <= collapsedData.minimapTop) throw new Error('Skull was not moved below minimap!');
    if (!expandedData.isChatMinimized && expandedData.hudBarBottom < 100) {
      throw new Error(`HUD bar did not move up when chat opened! hudBarBottom=${expandedData.hudBarBottom}`);
    }

    console.log('--- ALL MOBILE PORTRAIT UI TESTS PASSED! ---');
  } finally {
    await browser.close();
  }
}

runTest().catch(err => {
  console.error('Test FAILED:', err);
  process.exit(1);
});
