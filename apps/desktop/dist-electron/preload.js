import { contextBridge as n, ipcRenderer as e } from "electron";
const t = {
  secureStore: {
    get: (i) => e.invoke("store:get", i),
    set: (i, o) => e.invoke("store:set", i, o),
    delete: (i) => e.invoke("store:delete", i)
  },
  windowControls: {
    minimize: () => e.send("window:minimize"),
    maximize: () => e.send("window:maximize"),
    close: () => e.send("window:close"),
    quit: () => e.send("app:quit")
  },
  isElectron: !0
};
n.exposeInMainWorld("electronAPI", t);
