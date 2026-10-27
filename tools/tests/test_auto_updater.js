const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');

const BASE_URL = 'http://localhost:8123';
const CHROMIUM_PATH = fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, headers: res.headers, raw: data }); }
      });
    }).on('error', reject);
  });
}

function fetchHeaders(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'GET',
      headers,
    }, (res) => {
      let length = 0;
      res.on('data', chunk => length += chunk.length);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, length }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('--- Testing Auto-Updater & Client Distribution System ---');

  // 1. Verify /api/version
  console.log('1. Checking GET /api/version...');
  const verRes = await fetchJson(`${BASE_URL}/api/version`);
  if (verRes.status !== 200 || !verRes.body || !verRes.body.version) {
    throw new Error(`Failed /api/version test. Status: ${verRes.status}`);
  }
  console.log('✓ /api/version response:', {
    version: verRes.body.version,
    downloads: {
      android: verRes.body.downloads?.android?.available,
      windows: verRes.body.downloads?.windows?.available,
      linux: verRes.body.downloads?.linux?.available,
    }
  });

  // 2. Verify /download portal page
  console.log('2. Checking GET /download portal...');
  const portalRes = await fetchHeaders(`${BASE_URL}/download`);
  if (portalRes.status !== 200 || !portalRes.headers['content-type'].includes('text/html')) {
    throw new Error(`/download portal failed with status ${portalRes.status}`);
  }
  console.log('✓ /download portal returned 200 OK HTML');

  // 3. Verify /download/android streaming with Range requests
  console.log('3. Checking GET /download/android with Range header...');
  const rangeRes = await fetchHeaders(`${BASE_URL}/download/android`, { Range: 'bytes=0-1024' });
  if (rangeRes.status !== 206) {
    throw new Error(`/download/android range request failed: status ${rangeRes.status}`);
  }
  if (!rangeRes.headers['content-disposition'] || !rangeRes.headers['content-disposition'].includes('Velscour.apk')) {
    throw new Error('Missing Content-Disposition for APK');
  }
  console.log('✓ Range download for Android APK verified: HTTP 206 Partial Content, Content-Range:', rangeRes.headers['content-range']);

  // 4. Launch browser to test In-Game Title Screen Update Button & Dialog
  console.log('4. Launching browser to test in-game UI...');
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
  });

  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();

    await page.addInitScript(() => { window.VELSCOUR_TEST_MENU = true; });
    await page.goto(`${BASE_URL}/index.html`);
    await page.waitForFunction(() => window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden'));

    // A) Verify button is hidden when client is on latest version
    const initiallyHidden = await page.evaluate(() => {
      const btn = document.getElementById('title-update-btn');
      return !btn || btn.classList.contains('hidden') || window.getComputedStyle(btn).display === 'none';
    });
    console.log('✓ Title update button initially hidden when up to date:', initiallyHidden);
    if (!initiallyHidden) throw new Error('Update button should be hidden when client is on latest version');

    // B) Simulate update available
    console.log('Simulating update available...');
    await page.evaluate(async () => {
      window.VELSCOUR_TEST_UPDATE = true;
      const { checkForUpdates } = await import('/src/ui/updater.js');
      await checkForUpdates({ force: true });
    });

    await page.waitForSelector('#title-update-btn:not(.hidden)', { state: 'visible', timeout: 5000 });
    console.log('✓ Title update button revealed with update pulse animation');

    // Capture title screen screenshot with update button
    await page.screenshot({ path: '/home/dagyr/.gemini/antigravity-ide/brain/6bb481c7-fe94-4fc6-ab53-82e8cede2761/updater_title_screen_button.png' });

    // C) Click update button to open dialog
    console.log('Clicking title update button...');
    await page.click('#title-update-btn');

    await page.waitForSelector('.update-dialog-content', { state: 'visible', timeout: 5000 });
    const modalInfo = await page.evaluate(() => {
      const modal = document.querySelector('.update-dialog-content');
      if (!modal) return null;
      const title = modal.querySelector('div[style*="font-family"]')?.innerText;
      const updateBtn = modal.querySelector('[data-update]');
      return {
        title,
        hasUpdateBtn: !!updateBtn,
        updateBtnText: updateBtn ? updateBtn.innerText.trim() : null,
      };
    });

    console.log('✓ Velscour Updater Modal verified:', modalInfo);
    if (!modalInfo || !modalInfo.hasUpdateBtn) {
      throw new Error('Update dialog missing action button');
    }

    // Capture modal screenshot
    await page.screenshot({ path: '/home/dagyr/.gemini/antigravity-ide/brain/6bb481c7-fe94-4fc6-ab53-82e8cede2761/updater_modal_dialog.png' });

    // Close modal
    await page.click('.update-dialog-content [data-cancel]');
    await page.waitForSelector('.update-dialog-content', { state: 'detached', timeout: 5000 });
    console.log('✓ Modal dismissed successfully');

    // D) Test Settings Screen "Check for Updates"
    console.log('Testing Settings dialog updater row...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.title-menu button'));
      const settingsBtn = btns.find(b => b.innerText.includes('Settings'));
      if (settingsBtn) settingsBtn.click();
    });

    await page.waitForSelector('.settings-grid [data-check-update]', { state: 'visible', timeout: 5000 });
    const versionLabel = await page.evaluate(() => {
      const ub = document.querySelector('[data-check-update]');
      const container = ub?.parentElement;
      return container ? container.innerText.trim() : null;
    });
    console.log('✓ Settings version row verified:', versionLabel);

    // Capture settings screen screenshot
    await page.screenshot({ path: '/home/dagyr/.gemini/antigravity-ide/brain/6bb481c7-fe94-4fc6-ab53-82e8cede2761/updater_settings_screen.png' });

    console.log('ALL AUTO-UPDATER & CLIENT DISTRIBUTION TESTS PASSED!');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
