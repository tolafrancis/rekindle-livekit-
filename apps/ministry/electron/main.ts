import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { promises as fsp } from 'fs';

// Fixed port for Ministry's local renderer server (ReKindle uses 5180 —
// see apps/rekindle/electron/main.ts — kept distinct so both apps can run
// side by side without a port clash).
const PORT = 5181;

let mainWindow: BrowserWindow | null = null;

// ── Single instance lock ────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ── Encrypted local settings store (same shape as apps/desktop's) ──────
const getStoreFilePath = () => path.join(app.getPath('userData'), 'rekindle-ministry-store.enc.json');

const readStore = (): Record<string, string> => {
  try {
    const file = getStoreFilePath();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (err) {
    console.error('[Main] Failed to read store file:', err);
  }
  return {};
};

const writeStore = (data: Record<string, string>) => {
  try {
    const file = getStoreFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Main] Failed to write store file:', err);
  }
};

ipcMain.handle('store:get', (_event, key: string) => {
  const store = readStore();
  const encryptedValue = store[key];
  if (!encryptedValue) return null;
  try {
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(encryptedValue, 'base64'));
    }
    return Buffer.from(encryptedValue, 'base64').toString('utf-8');
  } catch (err) {
    console.error(`[Main] Decrypt failed for key "${key}":`, err);
    return null;
  }
});

ipcMain.handle('store:set', (_event, key: string, value: string) => {
  try {
    const encryptedValue = safeStorage && safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(value).toString('base64')
      : Buffer.from(value, 'utf-8').toString('base64');
    const store = readStore();
    store[key] = encryptedValue;
    writeStore(store);
    return true;
  } catch (err) {
    console.error(`[Main] Encrypt failed for key "${key}":`, err);
    return false;
  }
});

ipcMain.handle('store:delete', (_event, key: string) => {
  const store = readStore();
  if (key in store) {
    delete store[key];
    writeStore(store);
  }
  return true;
});

// ── Window controls IPC ─────────────────────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());
ipcMain.on('app:quit', () => app.quit());

// ── Local static server for the built renderer ──────────────────────────
// Deliberately NOT loaded via file:// — see this app's own capacitor.config.ts
// comment on why getUserMedia()/LiveKit needs a secure context. A real
// http://127.0.0.1 origin also fixes Vite's absolute /assets/... paths, the
// Firebase Cloud Messaging service worker, and the Supabase OAuth redirect
// flow (window.location.origin -> "null" under file://).
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function startStaticServer(rootDir: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        const resolved = path.normalize(path.join(rootDir, urlPath));
        if (!resolved.startsWith(path.normalize(rootDir))) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        let filePath = resolved;
        let stat;
        try {
          stat = await fsp.stat(filePath);
        } catch {
          stat = null;
        }
        if (!stat || stat.isDirectory()) {
          // SPA fallback: any unmatched path serves index.html.
          filePath = path.join(rootDir, 'index.html');
        }
        const data = await fsp.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
      } catch (err) {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });
    server.listen(port, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });
}

// ── Window ───────────────────────────────────────────────────────────────
async function createWindow() {
  const preloadPath = fs.existsSync(path.join(__dirname, 'preload.mjs'))
    ? path.join(__dirname, 'preload.mjs')
    : path.join(__dirname, 'preload.js');

  const iconPath = path.join(__dirname, '../dist/icon-192.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    backgroundColor: '#7c3aed', // ministry purple, matches capacitor.config.ts splash color
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const distDir = path.join(__dirname, '../dist');
    await startStaticServer(distDir, PORT);
    mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
  }
}

app.whenReady().then(() => {
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
