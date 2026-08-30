import { app, ipcMain, safeStorage, BrowserWindow, nativeImage, Tray, Menu } from "electron";
import path from "path";
import fs from "fs";
let mainWindow = null;
let tray = null;
let isQuitting = false;
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}
const getStoreFilePath = () => path.join(app.getPath("userData"), "rekindle-store.enc.json");
const readStore = () => {
  try {
    const file = getStoreFilePath();
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("[Main] Failed to read store file:", err);
  }
  return {};
};
const writeStore = (data) => {
  try {
    const file = getStoreFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[Main] Failed to write store file:", err);
  }
};
ipcMain.handle("store:get", (_event, key) => {
  const store = readStore();
  const encryptedValue = store[key];
  if (!encryptedValue) return null;
  try {
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      const buffer = Buffer.from(encryptedValue, "base64");
      return safeStorage.decryptString(buffer);
    }
    return Buffer.from(encryptedValue, "base64").toString("utf-8");
  } catch (err) {
    console.error(`[Main] Decrypt failed for key "${key}":`, err);
    return null;
  }
});
ipcMain.handle("store:set", (_event, key, value) => {
  try {
    let encryptedValue;
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      const buffer = safeStorage.encryptString(value);
      encryptedValue = buffer.toString("base64");
    } else {
      encryptedValue = Buffer.from(value, "utf-8").toString("base64");
    }
    const store = readStore();
    store[key] = encryptedValue;
    writeStore(store);
    return true;
  } catch (err) {
    console.error(`[Main] Encrypt failed for key "${key}":`, err);
    return false;
  }
});
ipcMain.handle("store:delete", (_event, key) => {
  const store = readStore();
  if (key in store) {
    delete store[key];
    writeStore(store);
  }
  return true;
});
ipcMain.on("window:minimize", () => {
  mainWindow == null ? void 0 : mainWindow.minimize();
});
ipcMain.on("window:maximize", () => {
  if (mainWindow == null ? void 0 : mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow == null ? void 0 : mainWindow.maximize();
  }
});
ipcMain.on("window:close", () => {
  mainWindow == null ? void 0 : mainWindow.hide();
});
ipcMain.on("app:quit", () => {
  isQuitting = true;
  app.quit();
});
function createTray() {
  if (tray) return;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`;
  const icon = nativeImage.createFromBuffer(Buffer.from(svg));
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip("ReKindle Translator — PA Edge Agent");
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open ReKindle Translator",
      click: () => {
        mainWindow == null ? void 0 : mainWindow.show();
        mainWindow == null ? void 0 : mainWindow.focus();
      }
    },
    {
      label: "Status: Idle / Ready",
      enabled: false
    },
    { type: "separator" },
    {
      label: "Quit ReKindle Translator",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => {
    mainWindow == null ? void 0 : mainWindow.show();
    mainWindow == null ? void 0 : mainWindow.focus();
  });
}
function createWindow() {
  const preloadPath = fs.existsSync(path.join(__dirname, "preload.mjs")) ? path.join(__dirname, "preload.mjs") : path.join(__dirname, "preload.js");
  mainWindow = new BrowserWindow({
    width: 920,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    // Frameless for modern dark sound-booth console UI
    backgroundColor: "#090d16",
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow == null ? void 0 : mainWindow.show();
  });
  mainWindow.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow == null ? void 0 : mainWindow.hide();
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}
app.whenReady().then(() => {
  createTray();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("before-quit", () => {
  isQuitting = true;
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && isQuitting) {
    app.quit();
  }
});
