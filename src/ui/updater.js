// VELSCOUR Client Auto-Updater & Client Distribution Module
import { UI } from './ui.js';
import { sfx } from '../core/audio.js';

export const CURRENT_BUILD_VERSION = '1.2.3';

/**
 * Returns the effective client version.
 * Supports URL param override (?client_version=1.0.0) or localStorage for testing.
 */
export function getClientVersion() {
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      const forced = params.get('client_version');
      if (forced) return forced;
    } catch (e) {}
    try {
      const saved = localStorage.getItem('velscour_installed_version');
      if (saved) {
        if (compareVersions(saved, CURRENT_BUILD_VERSION) > 0) {
          return saved;
        } else {
          // Running build is newer than or equal to saved version: clean up stale localStorage
          localStorage.setItem('velscour_installed_version', CURRENT_BUILD_VERSION);
        }
      }
    } catch (e) {}
  }
  return CURRENT_BUILD_VERSION;
}

export const CLIENT_VERSION = CURRENT_BUILD_VERSION;

let cachedUpdateInfo = null;
let updateCheckPromise = null;
const updateListeners = new Set();

/**
 * Returns whether string v1 is newer than v2 using semantic versioning.
 * e.g. '1.0.1' > '1.0.0' => 1, '1.0.0' < '1.0.1' => -1, equal => 0.
 */
export function compareVersions(v1, v2) {
  if (!v1 || !v2) return 0;
  const p1 = String(v1).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const p2 = String(v2).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

/**
 * Resolves the appropriate HTTP base URL for server API calls and binary downloads.
 */
export function getServerBaseUrl() {
  if (typeof window === 'undefined') return 'http://localhost:8123';

  // If page is served from HTTP(S) and not a capacitor/local file wrapper
  const loc = window.location;
  if (loc.protocol.startsWith('http') && loc.host && !loc.host.startsWith('localhost') && !loc.host.startsWith('127.0.0.1')) {
    return loc.origin;
  }

  // Check custom lobby server setting from localStorage or query params
  try {
    const params = new URLSearchParams(loc.search);
    const configured = params.get('server') || localStorage.getItem('velscour_lobby_server');
    if (configured) {
      if (configured.startsWith('velscour.dagyr.me')) return 'https://velscour.dagyr.me';
      const proto = loc.protocol === 'https:' ? 'https:' : 'http:';
      return `${proto}//${configured}`;
    }
  } catch (e) {}

  // If running locally in dev browser
  if (loc.host === 'localhost:8123' || loc.host === '127.0.0.1:8123') {
    return loc.origin;
  }

  // Default production tunnel for desktop and native mobile clients
  return 'https://velscour.dagyr.me';
}

/**
 * Hard reload the game assets by clearing browser caches, unregistering service workers,
 * and performing a cache-busting reload.
 */
export async function hardReload(targetVersion = null) {
  if (typeof window === 'undefined') return;
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (e) {}
  }
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    } catch (e) {}
  }
  try {
    await fetch(window.location.origin + window.location.pathname + '?_hard=' + Date.now(), {
      cache: 'reload',
      mode: 'no-cors'
    });
  } catch (e) {}
  const u = new URL(window.location.href);
  u.searchParams.set('_v', Date.now().toString());
  u.searchParams.delete('client_version');
  u.searchParams.delete('test_update');
  if (targetVersion) {
    try { localStorage.setItem('velscour_installed_version', targetVersion); } catch (e) {}
  }
  window.location.replace(u.href);
}

/**
 * Checks the server for a newer game version.
 * Returns an object with update status and metadata.
 */
export async function checkForUpdates({ force = false } = {}) {
  if (!force && cachedUpdateInfo) {
    return cachedUpdateInfo;
  }
  if (updateCheckPromise && !force) {
    return updateCheckPromise;
  }

  updateCheckPromise = (async () => {
    // Testing override flags
    let forceTestUpdate = false;
    if (typeof window !== 'undefined') {
      if (window.VELSCOUR_TEST_UPDATE) forceTestUpdate = true;
      try {
        if (new URLSearchParams(window.location.search).has('test_update')) forceTestUpdate = true;
      } catch (e) {}
    }

    const baseUrl = getServerBaseUrl();
    const url = `${baseUrl}/api/version?_t=${Date.now()}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      let res = null;
      try {
        res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      } catch (e) {}
      clearTimeout(timeoutId);

      // If local server has no /api/version (e.g. running static file server like python -m http.server),
      // fall back to official production API so local players still get version updates and changelogs
      if (!res || !res.ok) {
        if (baseUrl !== 'https://velscour.dagyr.me') {
          try {
            const fallbackRes = await fetch(`https://velscour.dagyr.me/api/version?_t=${Date.now()}`, { cache: 'no-store' });
            if (fallbackRes && fallbackRes.ok) {
              res = fallbackRes;
            }
          } catch (e) {}
        }
      }

      if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : 'offline'}`);
      const data = await res.json();

      const currentVer = getClientVersion();
      let hasUpdate = compareVersions(data.version, currentVer) > 0;
      if (forceTestUpdate) hasUpdate = true;

      cachedUpdateInfo = {
        hasUpdate,
        serverVersion: data.version || CURRENT_BUILD_VERSION,
        clientVersion: currentVer,
        data,
        baseUrl,
      };

      if (hasUpdate) {
        notifyListeners(cachedUpdateInfo);
      }
      return cachedUpdateInfo;
    } catch (err) {
      console.warn('[Updater] Could not reach server version API:', err.message);
      const currentVer = getClientVersion();
      const fallback = {
        hasUpdate: forceTestUpdate,
        serverVersion: forceTestUpdate ? '1.2.3' : currentVer,
        clientVersion: currentVer,
        offline: true,
        baseUrl,
        data: {
          version: forceTestUpdate ? '1.2.3' : currentVer,
          changelog: [
            'Bard Music Sheets: paste tablature or note names, lock sheets, and load them into 5 Tab slots under paper doll to play songs during combat',
            'Death Knight 3D Flying Greatsword: equipped two-handed blade flies beside hero and rests on back with 50 unique greatsword designs',
            'Fixed castle drawbridges across all maps so lowered bridges rest flush against the stone pier without floating',
            'Hero damage scale: combat and sheet numbers scaled to hero life for clear, readable figures without altering underlying damage mechanics',
            'Auto-play AI evasion: intelligently steps out of Great Sand Wyrm charge paths and ground quakes',
            'Major expansion: Held 3D weapons & off-hands for all classes with 50 unique designs per weapon and elemental particle glows',
            '10 Castle Overworld variants with custom layouts, stones, moats, and story dialogue',
            '10 Sea of Sand Dune variants and massive 3D pyramids with deep burial chamber raid encounters',
            'Integrated VELSCOUR DEFENSE tower defense card campaign behind the town Riftgate',
            'Synchronized multiplayer world generation for Castle and Dune variants to ensure 100% party determinism',
            'Host-authoritative wave triggers and spawn timers preventing multiplayer encounter desynchronization',
            'Mobile pathfinding and typed array mask optimizations for smooth 60 FPS performance',
            '3D bone gibs and gore physics overhaul',
            'Vendored Three.js and custom canvas filter fallback for Safari/iOS compatibility',
            'Fixed multiplayer dungeon progression: exit portal now reliably unseals for all party members when the floor champion/guardian is slain, including remote and late-joining players',
            'Fine-tuned UI styling: experience bar placement, Velscour contact skull positioning, and inventory alignment',
            'Restored missing inventory stats grid, attribute allocation rows, and item rarity styles',
            'Fixed HP and MP numerical text display on life and mana orbs in compact mobile views (portrait & landscape)',
            'Fixed sealed item opening panel styling, responsiveness, and reel animations on mobile & touch displays',
            'Fine-tuned mobile touch controls and UI pointer-events layering',
            'Disabled pausing in online multiplayer across all menus, modals, and hit-stops to eliminate client and server desync',
            'Real-time simulation catch-up and background tab heartbeat to preserve synchronization during window unfocus',
            'Netcode smoothness optimization: TCP_NODELAY, dead-reckoning extrapolation, and 60 FPS monster interpolation',
            'Equipment delta compression reducing continuous player state bandwidth by 85%',
            'Full visual replication for remote player skills, animations, hazards, and Barbarian Leap 3D arc',
            'Persistent killed monsters across late-joining party members entering active dungeon depths',
            'Room capacity capped to 4 players for optimal party performance',
            'Shared multiplayer Heresies: portal activator sets party Heresies and biomes for deterministic enemy synchronization',
            'Resolved multiplayer monster authority symmetry and split-monster replication',
            'Enforced version synchronization for Online Multiplayer mode with direct one-click update prompts',
            'Lobby auto-reconnect on foreground resume, WebSocket keepalive heartbeat, and 90-second host room grace period',
            'Built-in automatic updater with in-game download & installation',
            'Immersive fullscreen Android display with hidden status bars',
            'Seamless Google Account sign-in on Desktop and Android',
            'Multiplayer Dungeon Crawling & Diablo-inspired Battle.net Lobby',
          ],
          downloads: {
            android: { available: true, url: '/download/android', filename: 'Velscour.apk', sizeFormatted: '1.28 GB' },
            windows: { available: true, url: '/download/windows', filename: 'Velscour.exe', sizeFormatted: '1.29 GB' },
            linux: { available: true, url: '/download/linux', filename: 'Velscour.AppImage', sizeFormatted: '1.38 GB' },
          }
        }
      };
      cachedUpdateInfo = fallback;
      if (forceTestUpdate) notifyListeners(cachedUpdateInfo);
      return fallback;
    } finally {
      updateCheckPromise = null;
    }
  })();

  return updateCheckPromise;
}

/**
 * Register a callback to be notified when an update is found.
 */
export function onUpdateAvailable(fn) {
  updateListeners.add(fn);
  if (cachedUpdateInfo && cachedUpdateInfo.hasUpdate) {
    try { fn(cachedUpdateInfo); } catch (e) {}
  }
  return () => updateListeners.delete(fn);
}

function notifyListeners(info) {
  for (const fn of updateListeners) {
    try { fn(info); } catch (e) { console.error('[Updater] Listener error', e); }
  }
}

/**
 * Triggers the appropriate platform download or hot-reload.
 */
export function triggerUpdate(updateInfo) {
  const isAndroid = !!(window.Capacitor?.isNativePlatform?.() || /Android/i.test(navigator.userAgent));
  const isElectron = /Electron/i.test(navigator.userAgent) || !!(window.process && window.process.type);
  const isWindows = /Windows|Win32/i.test(navigator.userAgent);
  const baseUrl = updateInfo?.baseUrl || getServerBaseUrl();

  if (isAndroid) {
    const downloadUrl = `${baseUrl}/download/android`;
    try {
      window.open(downloadUrl, '_system');
    } catch (e) {
      window.location.href = downloadUrl;
    }
    return {
      type: 'android',
      url: downloadUrl,
      msg: 'Downloading Velscour.apk in browser... When finished, tap the notification or download to install.'
    };
  }

  if (isElectron) {
    const route = isWindows ? '/download/windows' : '/download/linux';
    const downloadUrl = `${baseUrl}${route}`;
    const filename = isWindows ? 'Velscour.exe' : 'Velscour.AppImage';
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return {
      type: isWindows ? 'windows' : 'linux',
      url: downloadUrl,
      msg: `Downloading ${filename}... Save and run the new executable to launch the updated game.`
    };
  }

  // Web Browser client -> persist target version and hard reload fresh assets
  if (updateInfo?.serverVersion) {
    try { localStorage.setItem('velscour_installed_version', updateInfo.serverVersion); } catch (e) {}
  }
  hardReload(updateInfo?.serverVersion);
  return { type: 'web', msg: 'Updating and refreshing client assets...' };
}

/**
 * Displays the Gothic Update Dialog with version comparison, changelog, and 1-click update action.
 */
export function showUpdateDialog(updateInfo) {
  const currentVer = getClientVersion();
  const info = updateInfo || cachedUpdateInfo || {
    serverVersion: CURRENT_BUILD_VERSION,
    clientVersion: currentVer,
    data: { changelog: ['New features and stability enhancements.'] }
  };

  const isAndroid = !!(window.Capacitor?.isNativePlatform?.() || /Android/i.test(navigator.userAgent));
  const isElectron = /Electron/i.test(navigator.userAgent) || !!(window.process && window.process.type);
  const isWindows = /Windows|Win32/i.test(navigator.userAgent);

  let platformName = 'Web Client';
  let actionBtnText = 'Update & Refresh';
  let actionHint = 'Clears browser cache and loads the newest client version immediately.';
  let downloadSize = '';

  const dls = info.data?.downloads || {};
  if (isAndroid) {
    platformName = 'Android Client';
    downloadSize = dls.android?.sizeFormatted ? ` (${dls.android.sizeFormatted})` : '';
    actionBtnText = `Download APK${downloadSize}`;
    actionHint = 'Downloads the updated APK. Once downloaded, tap it from your Android notifications to install.';
  } else if (isElectron) {
    if (isWindows) {
      platformName = 'Windows Desktop';
      downloadSize = dls.windows?.sizeFormatted ? ` (${dls.windows.sizeFormatted})` : '';
      actionBtnText = `Download Windows .EXE${downloadSize}`;
    } else {
      platformName = 'Linux Desktop';
      downloadSize = dls.linux?.sizeFormatted ? ` (${dls.linux.sizeFormatted})` : '';
      actionBtnText = `Download AppImage${downloadSize}`;
    }
    actionHint = 'Downloads the updated standalone game client from the server.';
  }

  const changelogItems = (info.data?.changelog || [
    'Built-in automatic updater with in-game download & installation',
    'Immersive fullscreen Android display with hidden status bars',
    'Seamless Google Account sign-in on Desktop and Android',
    'Multiplayer Dungeon Crawling & Diablo-inspired Battle.net Lobby',
  ]).map(item => `<li style="margin-bottom:6px;color:#dfd3c3;font-size:13px;line-height:1.4;">${item}</li>`).join('');

  const html = `
    <div class="update-dialog-content" style="max-width:440px;text-align:left;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid rgba(180,140,70,0.3);">
        <div style="width:40px;height:40px;border-radius:4px;background:rgba(255,211,74,0.15);border:1px solid #ffd34a;display:flex;align-items:center;justify-content:center;color:#ffd860;flex-shrink:0;">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>
        <div>
          <div style="font-family:var(--font-head);font-size:16px;color:#fff0a0;font-weight:700;letter-spacing:1px;">New Version Available</div>
          <div style="font-size:12px;color:#a8977c;">Platform: <span style="color:#ffd860;">${platformName}</span></div>
        </div>
      </div>

      <div style="background:rgba(12,8,6,0.7);padding:10px 14px;border:1px solid rgba(160,120,60,0.3);border-radius:4px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <span style="font-size:11px;color:#8a7762;display:block;text-transform:uppercase;letter-spacing:1px;">Installed Version</span>
          <span style="font-family:var(--font-head);color:#a8977c;font-size:14px;font-weight:700;">v${info.clientVersion}</span>
        </div>
        <div style="color:#ffd34a;font-size:18px;">➔</div>
        <div style="text-align:right;">
          <span style="font-size:11px;color:#ffd34a;display:block;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Server Version</span>
          <span style="font-family:var(--font-head);color:#ffd860;font-size:15px;font-weight:700;">v${info.serverVersion}</span>
        </div>
      </div>

      <div style="margin-bottom:14px;">
        <div style="font-family:var(--font-head);font-size:12px;color:#c89e38;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">What's New</div>
        <ul style="padding-left:18px;margin:0;">
          ${changelogItems}
        </ul>
      </div>

      <div id="update-action-status" style="display:none;font-size:12px;color:#ffd34a;background:rgba(255,211,74,0.1);padding:8px 12px;border-radius:4px;margin-bottom:12px;line-height:1.4;"></div>

      <p style="font-size:12px;color:#8a7762;margin:0 0 16px;line-height:1.4;">${actionHint}</p>

      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn" data-cancel style="padding:8px 16px;font-size:12px;">Dismiss</button>
        <button class="btn big" data-update style="padding:10px 20px;font-size:13px;background:linear-gradient(180deg,#593e28 0%,#2e1c10 100%);color:#fff0a0;border-color:#ffd34a;box-shadow:0 0 12px rgba(255,211,74,0.35);">
          ${actionBtnText}
        </button>
      </div>
    </div>
  `;

  const d = UI.dialog({
    title: 'Velscour Updater',
    html,
    buttons: []
  });

  const cancelBtn = d.box.querySelector('[data-cancel]');
  const updateBtn = d.box.querySelector('[data-update]');
  const statusEl = d.box.querySelector('#update-action-status');

  if (cancelBtn) {
    cancelBtn.onclick = () => {
      sfx('ui');
      d.box.remove();
    };
  }

  if (updateBtn) {
    updateBtn.onclick = () => {
      sfx('ui');
      const res = triggerUpdate(info);
      if (res && res.msg && statusEl) {
        statusEl.textContent = res.msg;
        statusEl.style.display = 'block';
        updateBtn.disabled = true;
        updateBtn.style.opacity = '0.6';
      }
    };
  }
}

/**
 * Initializes the title screen update button.
 * The button is initially hidden, and only becomes visible if an update is available.
 */
export function initTitleUpdater(btnEl) {
  if (!btnEl) return;

  const showButton = (info) => {
    btnEl.classList.remove('hidden');
    btnEl.title = `Update available: v${info.serverVersion} (Installed: v${info.clientVersion})`;
    btnEl.onclick = (e) => {
      e.stopPropagation();
      sfx('ui');
      showUpdateDialog(info);
    };
  };

  // Listen for background update notifications
  onUpdateAvailable((info) => {
    if (btnEl.isConnected) showButton(info);
  });

  // Run initial asynchronous update check
  checkForUpdates().then((info) => {
    if (info && info.hasUpdate && btnEl.isConnected) {
      showButton(info);
    }
  }).catch(() => {});
}
