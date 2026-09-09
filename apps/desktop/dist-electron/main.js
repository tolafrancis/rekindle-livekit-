import { app as o, ipcMain as l, safeStorage as c, BrowserWindow as y, nativeImage as S, Tray as v, Menu as w } from "electron";
import i from "path";
import u from "fs";
import { fileURLToPath as x } from "url";
const R = x(import.meta.url), h = i.dirname(R);
let e = null, f = null, d = !1;
const _ = o.requestSingleInstanceLock();
_ ? o.on("second-instance", () => {
  e && (e.isMinimized() && e.restore(), e.show(), e.focus());
}) : o.quit();
const m = () => i.join(o.getPath("userData"), "rekindle-store.enc.json"), p = () => {
  try {
    const r = m();
    if (u.existsSync(r)) {
      const t = u.readFileSync(r, "utf-8");
      return JSON.parse(t);
    }
  } catch (r) {
    console.error("[Main] Failed to read store file:", r);
  }
  return {};
}, b = (r) => {
  try {
    const t = m();
    u.mkdirSync(i.dirname(t), { recursive: !0 }), u.writeFileSync(t, JSON.stringify(r, null, 2), "utf-8");
  } catch (t) {
    console.error("[Main] Failed to write store file:", t);
  }
};
l.handle("store:get", (r, t) => {
  const s = p()[t];
  if (!s) return null;
  try {
    if (c && c.isEncryptionAvailable()) {
      const a = Buffer.from(s, "base64");
      return c.decryptString(a);
    }
    return Buffer.from(s, "base64").toString("utf-8");
  } catch (a) {
    return console.error(`[Main] Decrypt failed for key "${t}":`, a), null;
  }
});
l.handle("store:set", (r, t, n) => {
  try {
    let s;
    c && c.isEncryptionAvailable() ? s = c.encryptString(n).toString("base64") : s = Buffer.from(n, "utf-8").toString("base64");
    const a = p();
    return a[t] = s, b(a), !0;
  } catch (s) {
    return console.error(`[Main] Encrypt failed for key "${t}":`, s), !1;
  }
});
l.handle("store:delete", (r, t) => {
  const n = p();
  return t in n && (delete n[t], b(n)), !0;
});
l.on("window:minimize", () => {
  e == null || e.minimize();
});
l.on("window:maximize", () => {
  e != null && e.isMaximized() ? e.unmaximize() : e == null || e.maximize();
});
l.on("window:close", () => {
  e == null || e.hide();
});
l.on("app:quit", () => {
  d = !0, o.quit();
});
function E() {
  if (f) return;
  const t = S.createFromBuffer(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>'));
  f = new v(t.resize({ width: 16, height: 16 })), f.setToolTip("ReKindle Translator — PA Edge Agent");
  const n = w.buildFromTemplate([
    {
      label: "Open ReKindle Translator",
      click: () => {
        e == null || e.show(), e == null || e.focus();
      }
    },
    {
      label: "Status: Idle / Ready",
      enabled: !1
    },
    { type: "separator" },
    {
      label: "Quit ReKindle Translator",
      click: () => {
        d = !0, o.quit();
      }
    }
  ]);
  f.setContextMenu(n), f.on("double-click", () => {
    e == null || e.show(), e == null || e.focus();
  });
}
function g() {
  const r = u.existsSync(i.join(h, "preload.mjs")) ? i.join(h, "preload.mjs") : i.join(h, "preload.js");
  e = new y({
    width: 920,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    frame: !1,
    // Frameless for modern dark sound-booth console UI
    backgroundColor: "#090d16",
    show: !1,
    webPreferences: {
      preload: r,
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !1
    }
  }), e.once("ready-to-show", () => {
    e == null || e.show();
  }), e.on("close", (t) => {
    d || (t.preventDefault(), e == null || e.hide());
  }), process.env.VITE_DEV_SERVER_URL ? e.loadURL(process.env.VITE_DEV_SERVER_URL) : e.loadFile(i.join(h, "../dist/index.html"));
}
o.whenReady().then(() => {
  E(), g(), o.on("activate", () => {
    y.getAllWindows().length === 0 && g();
  });
});
o.on("before-quit", () => {
  d = !0;
});
o.on("window-all-closed", () => {
  process.platform !== "darwin" && d && o.quit();
});
