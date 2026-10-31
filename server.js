// VELSCOUR Online - Multiplayer HTTP & WebSocket Server
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = parseInt(process.env.PORT, 10) || 8123;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

function getPackageInfo() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  } catch (e) {
    return { version: '1.2.4' };
  }
}

const serverStartTime = Date.now();

function findBinary(dir, filterFn) {
  try {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir);
    let best = null;
    for (const f of files) {
      if (filterFn(f)) {
        const full = path.join(dir, f);
        const st = fs.statSync(full);
        if (st.isFile()) {
          if (!best || st.mtimeMs > best.mtime) {
            best = { path: full, filename: f, size: st.size, mtime: st.mtimeMs };
          }
        }
      }
    }
    return best;
  } catch (e) { }
  return null;
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

function compareVersions(v1, v2) {
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

function getBuildArtifacts() {
  return {
    android: findBinary(path.join(ROOT, 'android/app/build/outputs/apk/debug'), f => f.endsWith('.apk')),
    windows: findBinary(path.join(ROOT, 'dist/desktop'), f => f.endsWith('.exe')),
    linux: findBinary(path.join(ROOT, 'dist/desktop'), f => f.endsWith('.AppImage')),
    // electron-builder zip names: Velscour-<v>-arm64-mac.zip (Apple Silicon), Velscour-<v>-mac.zip (Intel)
    mac: findBinary(path.join(ROOT, 'dist/desktop'), f => f.endsWith('-arm64-mac.zip')),
    macIntel: findBinary(path.join(ROOT, 'dist/desktop'), f => f.endsWith('-mac.zip') && !f.endsWith('-arm64-mac.zip')),
  };
}

function streamFile(req, res, filePath, downloadFilename, contentType = 'application/octet-stream') {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('File not found');
      return;
    }

    const headers = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    };

    if (downloadFilename) {
      headers['Content-Disposition'] = `attachment; filename="${downloadFilename}"`;
    }

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      if (start >= stats.size || end >= stats.size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${stats.size}` });
        res.end();
        return;
      }
      const chunksize = (end - start) + 1;
      headers['Content-Range'] = `bytes ${start}-${end}/${stats.size}`;
      headers['Content-Length'] = chunksize;
      res.writeHead(206, headers);
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      headers['Content-Length'] = stats.size;
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(res);
    }
  });
}

function renderDownloadPage(artifacts) {
  const pkg = getPackageInfo();
  const android = artifacts.android;
  const windows = artifacts.windows;
  const linux = artifacts.linux;
  const mac = artifacts.mac;
  const macIntel = artifacts.macIntel;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Download VELSCOUR - Dark Fantasy Action RPG</title>
  <link rel="icon" type="image/x-icon" href="/assets/ui/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;900&family=Lora:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090706;
      --card-bg: rgba(22, 16, 12, 0.88);
      --gold: #ffd34a;
      --gold-dim: #c89e38;
      --gold-bright: #fff0a0;
      --text: #dfd3c3;
      --text-dim: #9e8f7a;
      --border: rgba(180, 140, 70, 0.35);
      --border-bright: #ffd34a;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      background-image: 
        radial-gradient(ellipse at 50% 0%, rgba(130, 24, 16, 0.35) 0%, transparent 65%),
        radial-gradient(ellipse at 50% 100%, rgba(30, 16, 8, 0.8) 0%, transparent 70%);
      color: var(--text);
      font-family: 'Lora', serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 30px 20px 60px;
    }
    .header {
      text-align: center;
      max-width: 700px;
      margin-bottom: 35px;
    }
    .logo {
      max-width: 380px;
      width: 90%;
      height: auto;
      filter: drop-shadow(0 6px 18px rgba(0,0,0,0.9));
      margin-bottom: 12px;
    }
    .tagline {
      font-style: italic;
      color: var(--gold-dim);
      font-size: 16px;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .version-badge {
      display: inline-block;
      padding: 4px 14px;
      background: rgba(200, 150, 40, 0.15);
      border: 1px solid var(--border);
      border-radius: 20px;
      color: var(--gold);
      font-family: 'Cinzel', serif;
      font-size: 13px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-top: 6px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 24px;
      max-width: 1000px;
      width: 100%;
      margin-bottom: 40px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      position: relative;
      box-shadow: 0 8px 30px rgba(0,0,0,0.7), inset 0 0 16px rgba(0,0,0,0.5);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      transition: all 0.25s ease;
    }
    .card:hover {
      border-color: var(--border-bright);
      box-shadow: 0 12px 35px rgba(255, 211, 74, 0.18), inset 0 0 20px rgba(255, 211, 74, 0.08);
      transform: translateY(-4px);
    }
    .card-icon {
      width: 52px;
      height: 52px;
      margin-bottom: 14px;
      color: var(--gold);
    }
    .card-title {
      font-family: 'Cinzel', serif;
      font-size: 20px;
      font-weight: 700;
      color: var(--gold-bright);
      margin-bottom: 6px;
      letter-spacing: 1px;
    }
    .card-meta {
      font-size: 13px;
      color: var(--text-dim);
      margin-bottom: 14px;
    }
    .card-desc {
      font-size: 14px;
      line-height: 1.5;
      color: var(--text);
      margin-bottom: 22px;
      flex-grow: 1;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 24px;
      background: linear-gradient(180deg, #3d2a1c 0%, #20140c 100%);
      border: 1px solid var(--gold);
      border-radius: 4px;
      color: var(--gold-bright);
      font-family: 'Cinzel', serif;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 1px;
      text-decoration: none;
      text-transform: uppercase;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5), inset 0 0 8px rgba(255, 211, 74, 0.2);
      transition: all 0.2s ease;
      width: 100%;
    }
    .btn:hover {
      background: linear-gradient(180deg, #593e28 0%, #2e1c10 100%);
      box-shadow: 0 0 16px rgba(255, 211, 74, 0.4);
      color: #fff;
      transform: scale(1.02);
    }
    .btn.disabled {
      opacity: 0.4;
      pointer-events: none;
      border-color: #555;
      color: #777;
    }
    .play-web {
      text-align: center;
      margin-top: 10px;
    }
    .play-web a {
      color: var(--gold);
      text-decoration: none;
      font-family: 'Cinzel', serif;
      font-size: 15px;
      letter-spacing: 1px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: color 0.2s;
    }
    .play-web a:hover {
      color: #fff;
      text-shadow: 0 0 8px var(--gold);
    }
  </style>
</head>
<body>
  <div class="header">
    <a href="/"><img class="logo" src="/assets/ui/logo.webp" alt="VELSCOUR"></a>
    <div class="tagline">A world built upon something that should have stayed dead.</div>
    <div class="version-badge">Version ${pkg.version || '1.0.0'} · Official Game Clients</div>
  </div>

  <div class="grid">
    <!-- Android APK -->
    <div class="card">
      <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
      </svg>
      <div class="card-title">Android APK</div>
      <div class="card-meta">${android ? formatBytes(android.size) : 'Unavailable'} · Android 8.0+</div>
      <div class="card-desc">Full mobile experience with immersive fullscreen touch controls, haptics, and built-in auto-updater.</div>
      <a class="btn ${android ? '' : 'disabled'}" href="/download/android">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download APK
      </a>
    </div>

    <!-- Windows Desktop -->
    <div class="card">
      <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
      <div class="card-title">Windows</div>
      <div class="card-meta">${windows ? formatBytes(windows.size) : 'Unavailable'} · Windows 10/11 64-bit</div>
      <div class="card-desc">Portable standalone executable. Clean frameless display, high refresh rate support, zero install needed.</div>
      <a class="btn ${windows ? '' : 'disabled'}" href="/download/windows">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download .EXE
      </a>
    </div>

    <!-- Linux Desktop -->
    <div class="card">
      <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2a4 4 0 0 0-4 4v4a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4z" />
        <path d="M6 10v2a6 6 0 0 0 12 0v-2" />
        <line x1="12" y1="18" x2="12" y2="22" />
      </svg>
      <div class="card-title">Linux AppImage</div>
      <div class="card-meta">${linux ? formatBytes(linux.size) : 'Unavailable'} · Universal Linux x64</div>
      <div class="card-desc">Universal portable Linux AppImage. Works out-of-the-box on Ubuntu, Debian, Arch, Fedora and Steam Deck.</div>
      <a class="btn ${linux ? '' : 'disabled'}" href="/download/linux">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download AppImage
      </a>
    </div>

    <!-- macOS Desktop -->
    <div class="card">
      <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="12" rx="2" ry="2" />
        <path d="M1 20h22" />
      </svg>
      <div class="card-title">macOS</div>
      <div class="card-meta">${mac ? formatBytes(mac.size) : 'Unavailable'} · macOS 11+</div>
      <div class="card-desc">Unzip and drag Velscour.app to Applications. Unsigned: if macOS says it is damaged, run <code>xattr -cr /Applications/Velscour.app</code> in Terminal, then right-click → Open.</div>
      <a class="btn ${mac ? '' : 'disabled'}" href="/download/mac">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Apple Silicon (M1+)
      </a>
      <a class="btn ${macIntel ? '' : 'disabled'}" href="/download/mac-intel" style="margin-top:8px">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Intel Mac
      </a>
    </div>
  </div>

  <div class="play-web">
    <a href="/">← Return to Web Game Client</a>
  </div>
</body>
</html>`;
}

// ------------------------------------------------------------------ HTTP Server
const server = http.createServer((req, res) => {
  let parsedUrl, pathname;
  try {
    parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    pathname = decodeURIComponent(parsedUrl.pathname);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request');
    return;
  }

  // 1. API: Version & Update metadata
  if (pathname === '/api/version') {
    const pkg = getPackageInfo();
    const artifacts = getBuildArtifacts();
    const mtimes = [
      artifacts.android?.mtime || 0,
      artifacts.windows?.mtime || 0,
      artifacts.linux?.mtime || 0,
      artifacts.mac?.mtime || 0,
      artifacts.macIntel?.mtime || 0,
    ];
    const latestBuild = Math.max(...mtimes, serverStartTime);
    const resData = {
      name: 'Velscour',
      version: pkg.version || '1.0.0',
      serverTime: Date.now(),
      buildTime: latestBuild,
      changelog: [
        "Level Cap 3000 & Uncapped Infernal Marks: hero progression extended to level 3000 across Endless Torment depths up to D6600, with uncapped Infernal Marks (Vitality life multiplier, Precision crit chance & crit damage, Fortune extra drops, Haste rift time)",
        "Skill Macros (R E Y U O & Touch M1-M5): 5 customizable skill macro slots per hero with 'Keep up' automatic buff recast when enemies are nearby and full online party synchronization",
        "Thorns Scaling & Weapon Base Display: endgame thorns scale with hero fortitude and attacker level; normalized weapon damage numbers and added Weapon Base to the Character Sheet",
        "Compact Big-Number Notation & Gold Scaling: added Qa through Dc and scientific notation suffixes along with high-depth logarithmic gold scaling",
        "Velscour Unbound & Sealed Treasure Updates: Unbound prioritizes uncollected Heirlooms + 3 Abyssal items + 20 Infernal Marks; ring augments display calculated hit damage; sealed items blocked from socketing/upgrading/enchanting until unsealed",
        "Mobile portrait mode redesign with upward-expanding bottom-docked chat, flank special action buttons, repositioned ATK button, enlarged 108px minimap, and Android fullSensor dynamic rotation",
        "Organized Settings dialog into 5 clean category tabs (General, Audio, Graphics, HUD & UI, Auto-Play) with instant responsive navigation across desktop and mobile",
        "Multiplayer Bard Music Synchronization: live melodic note playback, rhythm audio, cadences, staff notation, and custom sheet titles replicated to all party members",
        "Vanity Appearance Slots: wear any armor or helmet look while retaining full combat stats, set bonuses, and sockets with 'Hide Helmet' support",
        "Death Knight Flying Sword Outlines: flying greatsword inherits hero's pale-gold rim outline and see-through wall/spell occlusion shaders",
        "Lobby & Paperdoll Vanity + Held Gear: character pedestal previews in the online lobby and hero selection screens now display vanity outfits and held weapons and off-hands",
        "Bard Music Sheets: paste tablature or note names, lock sheets, and load them into 5 Tab slots under paper doll to play songs during combat",
        "Death Knight 3D Flying Greatsword: equipped two-handed blade flies beside hero and rests on back with 50 unique greatsword designs",
        "Fixed castle drawbridges across all maps so lowered bridges rest flush against the stone pier without floating",
        "Hero damage scale: combat and sheet numbers scaled to hero life for clear, readable figures without altering underlying damage mechanics",
        "Auto-play AI evasion: intelligently steps out of Great Sand Wyrm charge paths and ground quakes",
        "Major expansion: Held 3D weapons & off-hands for all classes with 50 unique designs per weapon and elemental particle glows",
        "10 Castle Overworld variants with custom layouts, stones, moats, and story dialogue",
        "10 Sea of Sand Dune variants and massive 3D pyramids with deep burial chamber raid encounters",
        "Integrated VELSCOUR DEFENSE tower defense card campaign behind the town Riftgate",
        "Synchronized multiplayer world generation for Castle and Dune variants to ensure 100% party determinism",
        "Host-authoritative wave triggers and spawn timers preventing multiplayer encounter desynchronization",
        "Mobile pathfinding and typed array mask optimizations for smooth 60 FPS performance",
        "3D bone gibs and gore physics overhaul",
        "Vendored Three.js and custom canvas filter fallback for Safari/iOS compatibility",
        "Fixed multiplayer dungeon progression: exit portal now reliably unseals for all party members when the floor champion/guardian is slain, including remote and late-joining players",
        "Fine-tuned UI styling: experience bar placement, Velscour contact skull positioning, and inventory alignment",
        "Restored missing inventory stats grid, attribute allocation rows, and item rarity styles",
        "Fixed HP and MP numerical text display on life and mana orbs in compact mobile views (portrait & landscape)",
        "Fixed sealed item opening panel styling, responsiveness, and reel animations on mobile & touch displays",
        "Fine-tuned mobile touch controls and UI pointer-events layering",
        "Disabled pausing in online multiplayer across all menus, modals, and hit-stops to eliminate client and server desync",
        "Real-time simulation catch-up and background tab heartbeat to preserve synchronization during window unfocus",
        "Netcode smoothness optimization: TCP_NODELAY, dead-reckoning extrapolation, and 60 FPS monster interpolation",
        "Equipment delta compression reducing continuous player state bandwidth by 85%",
        "Full visual replication for remote player skills, animations, hazards, and Barbarian Leap 3D arc",
        "Persistent killed monsters across late-joining party members entering active dungeon depths",
        "Room capacity capped to 4 players for optimal party performance",
        "Full multiplayer synchronization for champion monsters, affixes, auras, and stats",
        "Synchronized boss awakening across all peers and shared boss HUD health bar",
        "Multiplayer ambush waves targeting any active party member with matching champion spawns",
        "Resolved town ghost characters and duplication bug on room leave and rejoin",
        "Deterministic raid boss generation and modifiers across all peers on raid depths",
        "Shared multiplayer Heresies: portal activator sets party Heresies and biomes for deterministic enemy synchronization",
        "Resolved multiplayer monster authority symmetry and split-monster replication",
        "Enforced version synchronization for Online Multiplayer mode with direct one-click update prompts",
        "Lobby auto-reconnect on foreground resume, WebSocket keepalive heartbeat, and 90-second host room grace period",
        "Endgame expansion: Heresies of the Hollow, Abyssal Rifts, Velscour Unbound, and Infernal Marks",
        "Global Abyssal Rift leaderboard and honour board integration",
        "Interactive mobile pinch-to-zoom gesture support with smooth camera zoom scaling",
        "NPC-style walking bounce animation with organic squash, stretch, stride sway, and idle breathing",
        "Dedicated round buttons for Smite and Madness with procedural canvas artwork and circular SVG charge rings",
        "Streamlined bottom-left special ability action cluster positioned cleanly beside the HP orb",
        "Anti-cache automatic updater delivery for Android APK and desktop platforms"
      ],
      downloads: {
        android: {
          available: !!artifacts.android,
          url: `/download/android?v=${pkg.version || '1.2.4'}`,
          filename: `Velscour-${pkg.version || '1.2.4'}.apk`,
          size: artifacts.android ? artifacts.android.size : 0,
          sizeFormatted: artifacts.android ? formatBytes(artifacts.android.size) : null
        },
        windows: {
          available: !!artifacts.windows,
          url: '/download/windows',
          filename: 'Velscour.exe',
          size: artifacts.windows ? artifacts.windows.size : 0,
          sizeFormatted: artifacts.windows ? formatBytes(artifacts.windows.size) : null
        },
        linux: {
          available: !!artifacts.linux,
          url: '/download/linux',
          filename: 'Velscour.AppImage',
          size: artifacts.linux ? artifacts.linux.size : 0,
          sizeFormatted: artifacts.linux ? formatBytes(artifacts.linux.size) : null
        },
        mac: {
          available: !!artifacts.mac,
          url: '/download/mac',
          filename: 'Velscour-mac-arm64.zip',
          size: artifacts.mac ? artifacts.mac.size : 0,
          sizeFormatted: artifacts.mac ? formatBytes(artifacts.mac.size) : null
        },
        macIntel: {
          available: !!artifacts.macIntel,
          url: '/download/mac-intel',
          filename: 'Velscour-mac-x64.zip',
          size: artifacts.macIntel ? artifacts.macIntel.size : 0,
          sizeFormatted: artifacts.macIntel ? formatBytes(artifacts.macIntel.size) : null
        }
      }
    };
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify(resData, null, 2));
    return;
  }

  // 2. Direct binary download routes
  if (pathname === '/download/android' || pathname === '/download/apk' || pathname.endsWith('.apk')) {
    const pkg = getPackageInfo();
    const artifacts = getBuildArtifacts();
    if (!artifacts.android) {
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('Android APK not found on server.');
      return;
    }
    const dlName = `Velscour-${pkg.version || '1.2.4'}.apk`;
    streamFile(req, res, artifacts.android.path, dlName, 'application/vnd.android.package-archive');
    return;
  }

  if (pathname === '/download/windows' || pathname === '/download/exe') {
    const artifacts = getBuildArtifacts();
    if (!artifacts.windows) {
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('Windows executable not found on server.');
      return;
    }
    streamFile(req, res, artifacts.windows.path, 'Velscour.exe', 'application/octet-stream');
    return;
  }

  if (pathname === '/download/linux' || pathname === '/download/appimage') {
    const artifacts = getBuildArtifacts();
    if (!artifacts.linux) {
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('Linux AppImage not found on server.');
      return;
    }
    streamFile(req, res, artifacts.linux.path, 'Velscour.AppImage', 'application/x-executable');
    return;
  }

  if (pathname === '/download/mac' || pathname === '/download/mac-intel') {
    const intel = pathname === '/download/mac-intel';
    const art = getBuildArtifacts()[intel ? 'macIntel' : 'mac'];
    if (!art) {
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('macOS build not found on server.');
      return;
    }
    streamFile(req, res, art.path, intel ? 'Velscour-mac-x64.zip' : 'Velscour-mac-arm64.zip', 'application/zip');
    return;
  }

  // 3. Download Portal Web Page
  if (pathname === '/download' || pathname === '/downloads' || pathname === '/download/') {
    const artifacts = getBuildArtifacts();
    const html = renderDownloadPage(artifacts);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });
    res.end(html);
    return;
  }

  // 4. Static Game Assets Serving
  if (pathname === '/' || pathname === '') pathname = '/index.html';

  const safePath = path.normalize(path.join(ROOT, pathname));
  if (!safePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isCodeOrMarkup = ext === '.html' || ext === '.js' || ext === '.json' || ext === '.css';
    const headers = {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Access-Control-Allow-Origin': '*',
    };

    if (isCodeOrMarkup || parsedUrl.searchParams.has('_v') || parsedUrl.searchParams.has('_hard') || req.headers['cache-control'] === 'no-cache') {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
    }

    // Range support for audio/media files
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunksize = (end - start) + 1;
      headers['Content-Range'] = `bytes ${start}-${end}/${stats.size}`;
      headers['Accept-Ranges'] = 'bytes';
      headers['Content-Length'] = chunksize;
      res.writeHead(206, headers);
      fs.createReadStream(safePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, headers);
      fs.createReadStream(safePath).pipe(res);
    }
  });
});

// ------------------------------------------------------------------ WebSocket Server
const wss = new WebSocketServer({ server, path: '/ws' });

let clientIdSeq = 1;
const clients = new Map(); // ws -> clientData
const rooms = new Map();   // roomName -> roomData
const DEFAULT_CHANNEL = 'Velscour En-1';
const ROOM_GRACE_PERIOD_MS = 90000; // 90s grace period before tearing down an empty room on unexpected disconnect

function broadcastToChannel(channel, msg, excludeWs = null) {
  const json = typeof msg === 'string' ? msg : JSON.stringify(msg);
  for (const [ws, c] of clients) {
    if (ws !== excludeWs && c.channel === channel && ws.readyState === WebSocket.OPEN) {
      ws.send(json);
    }
  }
}

function broadcastToRoom(roomName, msg, excludeWs = null) {
  const json = typeof msg === 'string' ? msg : JSON.stringify(msg);
  for (const [ws, c] of clients) {
    if (ws !== excludeWs && c.room === roomName && ws.readyState === WebSocket.OPEN) {
      ws.send(json);
    }
  }
}

function getChannelPlayers(channel) {
  const list = [];
  for (const [, c] of clients) {
    if (c.channel === channel && !c.room) {
      list.push({
        id: c.id,
        name: c.name,
        classId: c.classId,
        level: c.level,
        title: c.title,
        gear: c.gear,
      });
    }
  }
  return list;
}

function getRoomList() {
  const list = [];
  const now = Date.now();
  for (const [name, r] of rooms) {
    const activePlayers = r.players.filter(p => !p.disconnected);
    list.push({
      name,
      hasPassword: !!r.password,
      maxPlayers: r.maxPlayers,
      playerCount: r.players.length,
      activeCount: activePlayers.length,
      hostName: r.hostName,
      depth: r.depth,
      biome: r.biome,
      elapsed: Math.floor((now - r.startTime) / 1000),
      isHostAway: activePlayers.length === 0,
      players: r.players.map(p => ({
        name: p.name,
        classId: p.classId,
        level: p.level,
        title: p.title,
        disconnected: !!p.disconnected,
      })),
    });
  }
  return list;
}

function broadcastLobbyUpdate() {
  const channelPlayers = getChannelPlayers(DEFAULT_CHANNEL);
  const roomList = getRoomList();
  const updateMsg = JSON.stringify({
    type: 'lobby_update',
    channel: DEFAULT_CHANNEL,
    players: channelPlayers,
    rooms: roomList,
  });
  broadcastToChannel(DEFAULT_CHANNEL, updateMsg);
}

function handleWhisper(ws, clientData, text) {
  const parts = text.split(' ');
  const targetName = parts[1];
  const whisperText = parts.slice(2).join(' ');
  if (!targetName || !whisperText) {
    ws.send(JSON.stringify({ type: 'chat', kind: 'system', text: 'Usage: /w <playername> <message>', color: '#ff6060', time: Date.now() }));
    return;
  }
  let foundWs = null;
  let foundData = null;
  for (const [otherWs, otherData] of clients) {
    if (otherData.name && otherData.name.toLowerCase() === targetName.toLowerCase()) {
      foundWs = otherWs;
      foundData = otherData;
      break;
    }
  }
  if (foundWs) {
    clientData.lastWhisperTo = foundData.name;
    foundData.lastWhisperFrom = clientData.name;
    const payloadRecipient = {
      type: 'chat',
      kind: 'whisper',
      from: clientData.name,
      fromId: clientData.id,
      to: foundData.name,
      text: whisperText,
      color: '#d870ff',
      time: Date.now(),
    };
    const payloadSender = {
      type: 'chat',
      kind: 'whisper_sent',
      from: clientData.name,
      fromId: clientData.id,
      to: foundData.name,
      text: whisperText,
      color: '#d870ff',
      time: Date.now(),
    };
    foundWs.send(JSON.stringify(payloadRecipient));
    ws.send(JSON.stringify(payloadSender));
  } else {
    ws.send(JSON.stringify({
      type: 'chat',
      kind: 'system',
      text: `Player '${targetName}' is not online.`,
      color: '#ff6060',
      time: Date.now(),
    }));
  }
}

function handleReply(ws, clientData, text) {
  if (!clientData.lastWhisperFrom) {
    ws.send(JSON.stringify({
      type: 'chat',
      kind: 'system',
      text: 'Nobody has whispered you yet to reply to.',
      color: '#ff6060',
      time: Date.now(),
    }));
    return;
  }
  const replyText = text.replace(/^\/(?:r|reply)\s*/, '').trim();
  if (!replyText) {
    ws.send(JSON.stringify({
      type: 'chat',
      kind: 'system',
      text: `Usage: /r <message> (replies to ${clientData.lastWhisperFrom})`,
      color: '#ff6060',
      time: Date.now(),
    }));
    return;
  }
  handleWhisper(ws, clientData, `/w ${clientData.lastWhisperFrom} ${replyText}`);
}

function handlePlayersList(ws, clientData) {
  const online = [];
  for (const [, c] of clients) {
    if (c.name) {
      const loc = c.room ? `[Game: ${c.room}]` : `[Lobby]`;
      online.push(`${c.name} ${loc}`);
    }
  }
  ws.send(JSON.stringify({
    type: 'chat',
    kind: 'system',
    text: `Online Heroes (${online.length}): ${online.join(', ')}`,
    color: '#ffd34a',
    time: Date.now(),
  }));
}

wss.on('connection', (ws) => {
  if (ws._socket && ws._socket.setNoDelay) {
    ws._socket.setNoDelay(true);
  }
  const clientId = 'c_' + (clientIdSeq++);
  const clientData = {
    id: clientId,
    name: 'Adventurer',
    classId: 'paladin',
    level: 1,
    title: 'Wanderer',
    gear: null,
    channel: DEFAULT_CHANNEL,
    room: null,
    gemClicks: 0,
    lastWhisperFrom: null,
    lastWhisperTo: null,
  };
  clients.set(ws, clientData);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    switch (msg.type) {
      case 'ping': {
        clientData.lastSeen = Date.now();
        ws.send(JSON.stringify({ type: 'pong', time: Date.now() }));
        break;
      }

      case 'enter_lobby': {
        if (msg.reconnectId) {
          clientData.id = msg.reconnectId;
        }
        const serverVer = getPackageInfo().version || '1.2.4';
        if (msg.clientVersion && compareVersions(serverVer, msg.clientVersion) > 0) {
          ws.send(JSON.stringify({
            type: 'version_outdated',
            serverVersion: serverVer,
            clientVersion: msg.clientVersion,
            message: `Your client version (v${msg.clientVersion}) is outdated. Please update to v${serverVer} to play online.`
          }));
          ws.close();
          break;
        }

        clientData.name = (msg.name || 'Hero').slice(0, 24);
        clientData.classId = msg.classId || 'paladin';
        clientData.level = parseInt(msg.level, 10) || 1;
        clientData.title = msg.title || (clientData.level >= 50 ? 'Matriarch' : clientData.level >= 20 ? 'Slayer' : 'Hero');
        clientData.gear = msg.gear || null;
        clientData.channel = DEFAULT_CHANNEL;
        clientData.disconnected = false;

        // Check if reconnecting to an existing room still in its grace period
        let reconnectedRoom = null;
        if (msg.reconnectRoom && rooms.has(msg.reconnectRoom)) {
          const room = rooms.get(msg.reconnectRoom);
          if (room) {
            if (room.cleanupTimer) {
              clearTimeout(room.cleanupTimer);
              room.cleanupTimer = null;
            }
            clientData.room = room.name;
            const existingIdx = room.players.findIndex(p => p.id === clientData.id || p.name === clientData.name);
            if (existingIdx >= 0) {
              room.players[existingIdx] = clientData;
            } else {
              room.players.push(clientData);
            }
            if (room.hostId === clientData.id || room.hostName === clientData.name || room.players.length === 1) {
              room.hostId = clientData.id;
              room.hostName = clientData.name;
            }
            reconnectedRoom = room;
          }
        } else {
          clientData.room = null;
        }

        // Send welcome packet
        ws.send(JSON.stringify({
          type: 'lobby_welcome',
          id: clientData.id,
          channel: DEFAULT_CHANNEL,
          players: getChannelPlayers(DEFAULT_CHANNEL),
          rooms: getRoomList(),
          serverVersion: getPackageInfo().version || '1.2.4',
        }));

        if (reconnectedRoom) {
          ws.send(JSON.stringify({
            type: 'room_reconnected',
            room: {
              name: reconnectedRoom.name,
              seed: reconnectedRoom.seed,
              townSeed: reconnectedRoom.townSeed || reconnectedRoom.seed,
              dungeonSeed: reconnectedRoom.dungeonSeed || null,
              depth: reconnectedRoom.depth,
              biome: reconnectedRoom.biome,
              hostId: reconnectedRoom.hostId,
              unsealedDepths: Array.from(reconnectedRoom.unsealedDepths || []),
              players: reconnectedRoom.players.map(p => ({
                id: p.id,
                name: p.name,
                classId: p.classId,
                level: p.level,
                title: p.title,
                gear: p.gear,
              })),
            },
          }));
          broadcastToRoom(reconnectedRoom.name, {
            type: 'player_reconnected',
            playerId: clientData.id,
            playerName: clientData.name,
          }, ws);
        }

        // Send Diablo 2 Battle.net welcome system lines
        const totalOnline = clients.size;
        ws.send(JSON.stringify({
          type: 'chat',
          text: `You have joined channel: ${DEFAULT_CHANNEL}`,
          color: '#3a8aff',
          kind: 'system',
        }));
        ws.send(JSON.stringify({
          type: 'chat',
          text: `There are currently ${totalOnline} heroes journeying across Sanctuary.`,
          color: '#5a9aff',
          kind: 'system',
        }));
        ws.send(JSON.stringify({
          type: 'chat',
          text: `Welcome to VELSCOUR Online. Type /help for chat commands.`,
          color: '#ffd34a',
          kind: 'system',
        }));

        broadcastLobbyUpdate();
        break;
      }

      case 'chat': {
        const text = String(msg.text || '').trim();
        if (!text) break;

        // Commands
        if (text.startsWith('/w ') || text.startsWith('/whisper ')) {
          handleWhisper(ws, clientData, text);
          break;
        }

        if (text.startsWith('/r ') || text.startsWith('/reply ') || text === '/r' || text === '/reply') {
          handleReply(ws, clientData, text);
          break;
        }

        if (text === '/help') {
          ws.send(JSON.stringify({
            type: 'chat',
            kind: 'system',
            text: `Commands: /w <name> <msg> (Whisper), /r <msg> (Reply), /p <msg> (Party), /l <msg> (Lobby), /me <action> (Emote), /players (List players)`,
            color: '#ffd34a',
            time: Date.now(),
          }));
          break;
        }

        if (text === '/players' || text === '/who') {
          handlePlayersList(ws, clientData);
          break;
        }

        if (text.startsWith('/me ')) {
          const action = text.slice(4).trim();
          broadcastToChannel(clientData.channel || DEFAULT_CHANNEL, {
            type: 'chat',
            kind: 'emote',
            text: `* ${clientData.name} ${action}`,
            color: '#ffc040',
            time: Date.now(),
          });
          break;
        }

        if (text.startsWith('/p ') || text.startsWith('/party ')) {
          if (clientData.room) {
            const pText = text.replace(/^\/(?:p|party)\s+/, '').trim();
            broadcastToRoom(clientData.room, {
              type: 'game_party_chat',
              fromId: clientData.id,
              from: clientData.name,
              text: pText,
              time: Date.now(),
            }, ws);
          } else {
            ws.send(JSON.stringify({
              type: 'chat',
              kind: 'system',
              text: 'You are not in a game room.',
              color: '#ff6060',
              time: Date.now(),
            }));
          }
          break;
        }

        // Standard global channel chat
        broadcastToChannel(clientData.channel || DEFAULT_CHANNEL, {
          type: 'chat',
          kind: 'channel',
          from: clientData.name,
          classId: clientData.classId,
          level: clientData.level,
          text: text,
          color: '#e9dcc4',
          time: Date.now(),
        });
        break;
      }

      case 'gem_click': {
        clientData.gemClicks = (clientData.gemClicks || 0) + 1;
        const roll = Math.random();
        let gemText = clientData.gemClicks % 2 === 1 ? 'Gem Activated' : 'Gem Deactivated';
        let gemColor = '#c040ff';

        if (roll < 0.05) {
          gemText = 'Perfect Gem Activated';
          gemColor = '#ff40d0';
        } else if (roll < 0.08) {
          gemText = 'Murloc sounds echo from the abyss...';
          gemColor = '#3ee0e0';
        }

        ws.send(JSON.stringify({
          type: 'chat',
          kind: 'gem',
          text: gemText,
          color: gemColor,
        }));
        break;
      }

      case 'refresh_lobby': {
        ws.send(JSON.stringify({
          type: 'lobby_update',
          channel: clientData.channel || DEFAULT_CHANNEL,
          players: getChannelPlayers(clientData.channel || DEFAULT_CHANNEL),
          rooms: getRoomList(),
        }));
        break;
      }

      case 'create_room': {
        const rawName = String(msg.name || '').trim();
        const roomName = (rawName || `${clientData.name}'s Game`).slice(0, 24);
        const password = String(msg.password || '').trim();
        const maxPlayers = Math.max(2, Math.min(4, parseInt(msg.maxPlayers, 10) || 4));
        const depth = Math.max(1, parseInt(msg.depth, 10) || 1);
        const biome = msg.biome || 'town';
        const seed = parseInt(msg.seed, 10) || (Math.floor(Math.random() * 1e9) + 1);

        if (rooms.has(roomName)) {
          ws.send(JSON.stringify({ type: 'room_error', message: `A game named "${roomName}" already exists.` }));
          break;
        }

        const pool = ['catacombs', 'castle_keep', 'frozen', 'ice_temple', 'molten', 'fungal', 'sunken', 'blood', 'ashen', 'void', 'gilded', 'plague', 'crystal', 'desert', 'shadow', 'forge', 'abyss', 'thorn', 'storm', 'obsidian', 'flesh', 'serpent', 'shattered', 'library', 'sewers', 'necropolis', 'cathedral', 'amber', 'desert_temple', 'hell', 'astral_plane', 'heavenly'];
        const defaultBiome = pool[Math.abs(((seed * 31 + depth * 7919) ^ 0x5bd1e995) | 0) % pool.length];
        const initialBiome = msg.biome || 'town';
        const initialDungeonSeed = (((seed * 31 + depth * 7919) ^ 0x41c64e6d) >>> 0) || 1234567;

        const roomData = {
          name: roomName,
          password,
          maxPlayers,
          depth,
          biome: initialBiome,
          seed,
          townSeed: seed,
          dungeonSeed: initialDungeonSeed,
          heresies: Array.isArray(msg.heresies) ? msg.heresies : [],
          startTime: Date.now(),
          hostId: clientData.id,
          hostName: clientData.name,
          players: [clientData],
          groundLoot: new Map(),
          killedMonsters: new Map(),
          unsealedDepths: new Set(),
        };
        rooms.set(roomName, roomData);
        clientData.room = roomName;

        ws.send(JSON.stringify({
          type: 'room_joined',
          room: {
            name: roomData.name,
            seed: roomData.seed,
            townSeed: roomData.townSeed || roomData.seed,
            dungeonSeed: roomData.dungeonSeed || null,
            depth: roomData.depth,
            biome: roomData.biome,
            hostId: roomData.hostId,
            maxPlayers: roomData.maxPlayers,
            unsealedDepths: Array.from(roomData.unsealedDepths || []),
            players: roomData.players.map(p => ({
              id: p.id,
              name: p.name,
              classId: p.classId,
              level: p.level,
              title: p.title,
              gear: p.gear,
              bardTabs: p.bardTabs || null,
            })),
          },
        }));

        broadcastLobbyUpdate();
        break;
      }

      case 'join_room': {
        const roomName = String(msg.name || '').trim();
        const password = String(msg.password || '').trim();
        const room = rooms.get(roomName);

        if (!room) {
          ws.send(JSON.stringify({ type: 'room_error', message: `Game "${roomName}" does not exist.` }));
          break;
        }
        if (room.players.length >= room.maxPlayers) {
          ws.send(JSON.stringify({ type: 'room_error', message: `Game "${roomName}" is full.` }));
          break;
        }
        if (room.password && room.password !== password) {
          ws.send(JSON.stringify({ type: 'room_error', message: `Incorrect password for game "${roomName}".` }));
          break;
        }

        // Clean up any existing or disconnected instance of this player in the room
        const existingIdx = room.players.findIndex(p => p.id === clientData.id || p.name === clientData.name);
        if (existingIdx >= 0) {
          const oldP = room.players[existingIdx];
          if (oldP.disconnectTimer) clearTimeout(oldP.disconnectTimer);
          room.players.splice(existingIdx, 1);
          broadcastToRoom(roomName, {
            type: 'player_left_room',
            playerId: oldP.id,
            playerName: oldP.name,
          }, ws);
        }

        clientData.room = roomName;
        clientData.disconnected = false;
        if (msg.bardTabs) clientData.bardTabs = msg.bardTabs;
        room.players.push(clientData);

        // Notify room members
        broadcastToRoom(roomName, {
          type: 'player_joined_room',
          player: {
            id: clientData.id,
            name: clientData.name,
            classId: clientData.classId,
            level: clientData.level,
            title: clientData.title,
            gear: clientData.gear,
            bardTabs: clientData.bardTabs || null,
          },
        }, ws);

        // Send room state to joining player
        ws.send(JSON.stringify({
          type: 'room_joined',
          room: {
            name: room.name,
            seed: room.seed,
            townSeed: room.townSeed || room.seed,
            dungeonSeed: room.dungeonSeed || null,
            depth: room.depth,
            biome: room.biome,
            hostId: room.hostId,
            maxPlayers: room.maxPlayers,
            unsealedDepths: Array.from(room.unsealedDepths || []),
            players: room.players.map(p => ({
              id: p.id,
              name: p.name,
              classId: p.classId,
              level: p.level,
              title: p.title,
              gear: p.gear,
              bardTabs: p.bardTabs || null,
            })),
          },
        }));

        broadcastLobbyUpdate();
        break;
      }

      case 'leave_room': {
        if (!clientData.room) break;
        const roomName = clientData.room;
        const room = rooms.get(roomName);
        clientData.room = null;

        if (room) {
          const leaving = room.players.filter(p => p.id === clientData.id || p.name === clientData.name);
          for (const lp of leaving) {
            if (lp.disconnectTimer) clearTimeout(lp.disconnectTimer);
          }
          room.players = room.players.filter(p => p.id !== clientData.id && p.name !== clientData.name);
          broadcastToRoom(roomName, {
            type: 'player_left_room',
            playerId: clientData.id,
            playerName: clientData.name,
          });

          if (room.players.length === 0) {
            if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
            rooms.delete(roomName);
          } else if (room.hostId === clientData.id) {
            const nextHost = room.players.find(p => !p.disconnected) || room.players[0];
            room.hostId = nextHost.id;
            room.hostName = nextHost.name;
            broadcastToRoom(roomName, {
              type: 'host_migrated',
              hostId: room.hostId,
              hostName: room.hostName,
            });
          }
        }

        ws.send(JSON.stringify({
          type: 'left_room',
          channel: DEFAULT_CHANNEL,
          players: getChannelPlayers(DEFAULT_CHANNEL),
          rooms: getRoomList(),
        }));

        broadcastLobbyUpdate();
        break;
      }

      // ------------------------------------------------ In-Game State Relay
      case 'game_player_state': {
        if (msg.gear) clientData.gear = msg.gear;
        if (typeof msg.level === 'number') clientData.level = msg.level;
        if (!clientData.room) break;
        msg.id = clientData.id;
        broadcastToRoom(clientData.room, msg, ws);
        break;
      }

      case 'update_gear': {
        clientData.gear = msg.gear || null;
        if (typeof msg.level === 'number') clientData.level = msg.level;
        if (clientData.room) {
          broadcastToRoom(clientData.room, {
            type: 'game_player_gear',
            id: clientData.id,
            gear: clientData.gear,
            level: clientData.level,
          }, ws);
        }
        broadcastLobbyUpdate();
        break;
      }

      case 'game_skill_cast': {
        if (!clientData.room) break;
        msg.playerId = clientData.id;
        broadcastToRoom(clientData.room, msg, ws);
        break;
      }

      case 'game_bard_tabs': {
        if (!clientData.room) break;
        clientData.bardTabs = {
          tabs: Array.isArray(msg.tabs) ? msg.tabs : [],
          tabAt: Number(msg.tabAt) || 0,
        };
        msg.playerId = clientData.id;
        broadcastToRoom(clientData.room, msg, ws);
        break;
      }

      case 'game_monster_hit': {
        if (!clientData.room) break;
        msg.sourceId = clientData.id;
        const room = rooms.get(clientData.room);
        if (room && msg.killed) {
          if (!room.killedMonsters) room.killedMonsters = new Map();
          const d = msg.depth || room.depth || 1;
          let set = room.killedMonsters.get(d);
          if (!set) { set = new Set(); room.killedMonsters.set(d, set); }
          if (msg.netId) set.add(msg.netId);
          if (msg.monsterIdx != null) set.add(msg.monsterIdx);
          if (msg.isBoss || msg.rank === 'boss' || (msg.netId && (String(msg.netId).startsWith('boss_') || String(msg.netId).startsWith('raid_')))) {
            if (!room.unsealedDepths) room.unsealedDepths = new Set();
            room.unsealedDepths.add(d);
            broadcastToRoom(clientData.room, {
              type: 'game_floor_unsealed',
              depth: d,
              bossId: msg.netId || msg.monsterIdx,
              bossName: '',
              sourcePlayerId: clientData.id,
              sourcePlayerName: clientData.name,
            });
          }
        }
        broadcastToRoom(clientData.room, msg, ws);
        break;
      }

      case 'game_floor_unsealed': {
        if (!clientData.room) break;
        const room = rooms.get(clientData.room);
        const d = msg.depth || (room ? room.depth : 1);
        if (room) {
          if (!room.unsealedDepths) room.unsealedDepths = new Set();
          room.unsealedDepths.add(d);
        }
        broadcastToRoom(clientData.room, {
          type: 'game_floor_unsealed',
          depth: d,
          bossId: msg.bossId || null,
          bossName: msg.bossName || '',
          sourcePlayerId: clientData.id,
          sourcePlayerName: clientData.name,
        });
        break;
      }

      case 'game_monsters_state': {
        if (!clientData.room) break;
        const room = rooms.get(clientData.room);
        if (room && Array.isArray(msg.killed)) {
          if (!room.killedMonsters) room.killedMonsters = new Map();
          const d = msg.depth || room.depth || 1;
          let set = room.killedMonsters.get(d);
          if (!set) { set = new Set(); room.killedMonsters.set(d, set); }
          for (const kid of msg.killed) set.add(kid);
        }
        broadcastToRoom(clientData.room, msg, ws);
        break;
      }

      case 'request_dungeon_state': {
        if (!clientData.room) break;
        const room = rooms.get(clientData.room);
        if (!room) break;
        const d = msg.depth || room.depth || 1;
        const set = room.killedMonsters ? room.killedMonsters.get(d) : null;
        ws.send(JSON.stringify({
          type: 'dungeon_killed_sync',
          depth: d,
          killed: set ? Array.from(set) : [],
          unsealed: room.unsealedDepths ? room.unsealedDepths.has(d) : false,
          unsealedDepths: Array.from(room.unsealedDepths || []),
        }));
        break;
      }

      case 'game_monster_spawn':
      case 'game_ambush_spawn': {
        if (!clientData.room) break;
        broadcastToRoom(clientData.room, msg, ws);
        break;
      }

      case 'game_loot_spawn': {
        if (!clientData.room) break;
        const room = rooms.get(clientData.room);
        if (room) {
          if (!room.groundLoot) room.groundLoot = new Map();
          room.groundLoot.set(msg.lootId, {
            lootId: msg.lootId,
            x: msg.x,
            y: msg.y,
            kind: msg.kind,
            item: msg.item,
            amount: msg.amount,
            droppedBy: msg.droppedBy || clientData.name,
            worldKind: msg.worldKind,
            depth: msg.depth,
          });
        }
        broadcastToRoom(clientData.room, msg, ws);
        break;
      }

      case 'game_loot_pickup': {
        if (!clientData.room) break;
        const room = rooms.get(clientData.room);
        if (room && room.groundLoot) {
          room.groundLoot.delete(msg.lootId);
        }
        msg.pickerId = clientData.id;
        msg.pickerName = clientData.name;
        broadcastToRoom(clientData.room, msg);
        break;
      }

      case 'game_loot_request': {
        if (!clientData.room) break;
        const room = rooms.get(clientData.room);
        if (!room || !room.groundLoot) {
          ws.send(JSON.stringify({ type: 'game_ground_loot_sync', loot: [] }));
          break;
        }
        const relevantLoot = [];
        for (const item of room.groundLoot.values()) {
          if (msg.worldKind && item.worldKind !== msg.worldKind) continue;
          if (msg.worldKind === 'dungeon' && msg.depth != null && item.depth !== msg.depth) continue;
          relevantLoot.push(item);
        }
        ws.send(JSON.stringify({ type: 'game_ground_loot_sync', loot: relevantLoot }));
        break;
      }

      case 'game_chat': {
        const text = String(msg.text || '').trim();
        if (!text) break;

        if (text.startsWith('/w ') || text.startsWith('/whisper ')) {
          handleWhisper(ws, clientData, text);
          break;
        }

        if (text.startsWith('/r ') || text.startsWith('/reply ') || text === '/r' || text === '/reply') {
          handleReply(ws, clientData, text);
          break;
        }

        if (text === '/players' || text === '/who') {
          handlePlayersList(ws, clientData);
          break;
        }

        if (text.startsWith('/l ') || text.startsWith('/all ') || text.startsWith('/global ')) {
          const lMsg = text.replace(/^\/(?:l|all|global)\s+/, '').trim();
          if (lMsg) {
            broadcastToChannel(clientData.channel || DEFAULT_CHANNEL, {
              type: 'chat',
              kind: 'channel',
              from: clientData.name,
              classId: clientData.classId,
              level: clientData.level,
              text: lMsg,
              color: '#e9dcc4',
              time: Date.now(),
            });
          }
          break;
        }

        if (!clientData.room) break;
        const partyText = text.startsWith('/p ') ? text.slice(3).trim() : (text.startsWith('/party ') ? text.slice(7).trim() : text);
        broadcastToRoom(clientData.room, {
          type: 'game_party_chat',
          fromId: clientData.id,
          from: clientData.name,
          text: partyText,
          time: Date.now(),
        }, ws);
        break;
      }

      case 'room_depth_update':
      case 'game_dungeon_transition': {
        if (!clientData.room) break;
        const room = rooms.get(clientData.room);
        if (room && (room.hostId === clientData.id || room.players.some(p => p.id === clientData.id))) {
          if (typeof msg.depth === 'number' && msg.depth > 0) room.depth = msg.depth;
          if (msg.biome) room.biome = msg.biome;
          if (msg.seed && room.dungeonSeed !== msg.seed) {
            room.dungeonSeed = msg.seed;
            room.killedMonsters?.clear();
          }
          if (msg.mixId !== undefined) room.mixId = msg.mixId || null;
          if (Array.isArray(msg.heresies)) room.heresies = msg.heresies;
          broadcastToRoom(clientData.room, {
            type: 'room_depth_sync',
            depth: room.depth,
            biome: room.biome,
            seed: room.dungeonSeed,
            mixId: room.mixId,
            heresies: room.heresies || [],
            killed: Array.from(room.killedMonsters?.get(room.depth) || []),
            unsealed: room.unsealedDepths ? room.unsealedDepths.has(room.depth) : false,
            unsealedDepths: Array.from(room.unsealedDepths || []),
            sourcePlayerId: clientData.id,
            sourcePlayerName: clientData.name,
          });
          broadcastLobbyUpdate();
        }
        break;
      }

      case 'game_town_transition': {
        if (!clientData.room) break;
        const room = rooms.get(clientData.room);
        if (room && (room.hostId === clientData.id || room.players.some(p => p.id === clientData.id))) {
          if (typeof msg.depth === 'number' && msg.depth > 0) {
            room.depth = msg.depth;
          }
          room.biome = 'town';
          broadcastToRoom(clientData.room, {
            type: 'room_depth_sync',
            depth: room.depth,
            biome: room.biome,
            seed: room.dungeonSeed,
            mixId: room.mixId,
            heresies: room.heresies || [],
            unsealed: room.unsealedDepths ? room.unsealedDepths.has(room.depth) : false,
            unsealedDepths: Array.from(room.unsealedDepths || []),
            sourcePlayerId: clientData.id,
            sourcePlayerName: clientData.name,
          });
          broadcastLobbyUpdate();
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (clientData.room) {
      const room = rooms.get(clientData.room);
      if (room) {
        const p = room.players.find(pl => pl.id === clientData.id);
        if (p) {
          p.disconnected = true;
          p.disconnectedAt = Date.now();
          if (p.disconnectTimer) clearTimeout(p.disconnectTimer);
          const roomName = clientData.room;
          p.disconnectTimer = setTimeout(() => {
            const r = rooms.get(roomName);
            if (r) {
              const idx = r.players.findIndex(pl => pl.id === clientData.id);
              if (idx >= 0 && r.players[idx].disconnected) {
                const removed = r.players.splice(idx, 1)[0];
                broadcastToRoom(r.name, {
                  type: 'player_left_room',
                  playerId: removed.id,
                  playerName: removed.name,
                });
                broadcastLobbyUpdate();
              }
            }
          }, 15000);
        }
        const activePlayers = room.players.filter(pl => !pl.disconnected);
        if (activePlayers.length === 0) {
          // Grace period: keep room alive for 90s so minimized host/player can return!
          if (!room.cleanupTimer) {
            const roomName = clientData.room;
            room.cleanupTimer = setTimeout(() => {
              const r = rooms.get(roomName);
              if (r && r.players.every(pl => pl.disconnected)) {
                rooms.delete(roomName);
                broadcastLobbyUpdate();
              }
            }, ROOM_GRACE_PERIOD_MS);
          }
        } else {
          broadcastToRoom(clientData.room, {
            type: 'player_disconnected',
            playerId: clientData.id,
            playerName: clientData.name,
          });
          if (room.hostId === clientData.id) {
            room.hostId = activePlayers[0].id;
            room.hostName = activePlayers[0].name;
            broadcastToRoom(clientData.room, {
              type: 'host_migrated',
              hostId: room.hostId,
              hostName: room.hostName,
            });
          }
        }
      }
    }
    clients.delete(ws);
    broadcastLobbyUpdate();
  });
});

server.listen(PORT, () => {
  console.log(`VELSCOUR Online server running on http://localhost:${PORT}`);
  console.log(`WebSocket server listening on ws://localhost:${PORT}/ws`);
});

process.on('uncaughtException', (err) => {
  console.error('[Server UncaughtException]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server UnhandledRejection]', reason);
});
