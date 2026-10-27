const { chromium } = require('playwright');
const fs = require('fs');

const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

async function run() {
  console.log('Testing party chat in bottom-left info log (#log)...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.error('Browser error:', msg.text());
  });

  await page.goto('http://localhost:8123/?test=1&client_version=1.0.1');
  await page.waitForTimeout(2000);

  // Check UI and log
  const logExists = await page.evaluate(() => {
    return !!document.getElementById('log');
  });
  console.log('Log container (#log) exists:', logExists);

  // Test calling UI.logParty directly
  await page.evaluate(() => {
    window.UI.logParty('Valkyrie', 'Watch out for the ambush!');
  });
  await page.waitForTimeout(500);

  const logContent = await page.evaluate(() => {
    const log = document.getElementById('log');
    return log ? log.innerHTML : '';
  });
  console.log('Log HTML after UI.logParty:', logContent);

  if (!logContent.includes('[Party]') || !logContent.includes('Valkyrie') || !logContent.includes('Watch out for the ambush!')) {
    throw new Error('Party chat was not rendered in #log!');
  }
  console.log('SUCCESS: UI.logParty successfully appeared in #log!');

  // Test GameChat sendPartyMessage
  await page.evaluate(() => {
    if (window.GameChat) {
      window.GameChat.sendPartyMessage('Break the warding crystals now!');
    }
  });
  await page.waitForTimeout(500);

  const logContent2 = await page.evaluate(() => {
    const log = document.getElementById('log');
    return log ? log.innerHTML : '';
  });
  console.log('Log HTML after GameChat.sendPartyMessage:', logContent2);

  if (!logContent2.includes('Break the warding crystals now!')) {
    throw new Error('sendPartyMessage did not render to #log!');
  }
  console.log('SUCCESS: GameChat.sendPartyMessage properly rendered to #log!');

  // Test updater detecting 1.0.2 when client is 1.0.1
  const updateAvailable = await page.evaluate(async () => {
    const { checkForUpdates } = await import('./src/ui/updater.js');
    return await checkForUpdates();
  });
  console.log('Update check result (from 1.0.1 to server 1.0.2):', updateAvailable);

  if (!updateAvailable.hasUpdate || updateAvailable.serverVersion !== '1.0.2') {
    throw new Error(`Expected update to 1.0.2, got: ${JSON.stringify(updateAvailable)}`);
  }
  console.log('SUCCESS: Updater correctly detects v1.0.2 update available!');

  await browser.close();
  console.log('All tests passed successfully!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
