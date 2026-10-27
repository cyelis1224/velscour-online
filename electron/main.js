// Electron Main Process for VELSCOUR
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const http = require('http');
const { fork } = require('child_process');

let mainWindow = null;
let serverProcess = null;
const PORT = process.env.PORT || 8123;

function isServerRunning(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/`, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function startServerIfNeeded() {
  const running = await isServerRunning(PORT);
  if (running) {
    console.log(`[Electron] Server already running on port ${PORT}`);
    return;
  }

  console.log(`[Electron] Starting embedded server on port ${PORT}...`);
  const serverPath = path.join(__dirname, '../server.js');
  serverProcess = fork(serverPath, [], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT) },
    silent: false,
  });

  serverProcess.on('error', (err) => {
    console.error('[Electron] Server process error:', err);
  });

  // Wait for server to become responsive
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (await isServerRunning(PORT)) {
      console.log(`[Electron] Server is ready on port ${PORT}`);
      break;
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'Velscour',
    backgroundColor: '#050303',
    icon: path.join(__dirname, '../assets/ui/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      spellcheck: false,
    },
  });

  // Completely remove top menu bar ("Game" header)
  Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false);

  // Preserve game keyboard shortcuts without needing a visible menubar
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    } else if ((input.control || input.meta) && input.key.toLowerCase() === 'r') {
      mainWindow.reload();
      event.preventDefault();
    } else if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    } else if ((input.control || input.meta) && input.key.toLowerCase() === 'q') {
      app.quit();
      event.preventDefault();
    }
  });

  // Remove "Electron/..." from User-Agent so Google OAuth does not flag it as an untrusted embedded browser
  const defaultUserAgent = mainWindow.webContents.getUserAgent();
  const cleanUserAgent = defaultUserAgent.replace(/Electron\/\S+\s?/, '');
  mainWindow.webContents.setUserAgent(cleanUserAgent);

  // Handle Firebase Auth & Google Sign-In popups: allow about:blank and OAuth domains, maintain opener bridge, and auto-close
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url === 'about:blank' ||
      url === '' ||
      url.startsWith('about:') ||
      url.includes('firebaseapp.com') ||
      url.includes('accounts.google.com') ||
      url.includes('google.com') ||
      url.includes('googleapis.com')
    ) {
      const bounds = mainWindow.getBounds();
      const popupWidth = 520;
      const popupHeight = 650;
      const x = Math.round(bounds.x + (bounds.width - popupWidth) / 2);
      const y = Math.round(bounds.y + (bounds.height - popupHeight) / 2);

      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          x,
          y,
          width: popupWidth,
          height: popupHeight,
          autoHideMenuBar: true,
          backgroundColor: '#110f0f',
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
          },
        },
      };
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-create-window', (childWindow, details) => {
    try {
      childWindow.setMenuBarVisibility(false);
      childWindow.webContents.setUserAgent(cleanUserAgent);
    } catch (e) {}
  });

  mainWindow.loadURL(`http://localhost:${PORT}/index.html`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await startServerIfNeeded();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (serverProcess) {
    console.log('[Electron] Shutting down embedded server...');
    serverProcess.kill();
    serverProcess = null;
  }
});
