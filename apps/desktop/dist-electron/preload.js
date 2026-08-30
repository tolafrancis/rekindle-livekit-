import { contextBridge, ipcRenderer } from "electron";
const api = {
  secureStore: {
    get: (key) => ipcRenderer.invoke("store:get", key),
    set: (key, value) => ipcRenderer.invoke("store:set", key, value),
    delete: (key) => ipcRenderer.invoke("store:delete", key)
  },
  windowControls: {
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close"),
    quit: () => ipcRenderer.send("app:quit")
  },
  isElectron: true
};
contextBridge.exposeInMainWorld("electronAPI", api);
