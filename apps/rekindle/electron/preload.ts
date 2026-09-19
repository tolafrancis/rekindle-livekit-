import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  secureStore: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<boolean>;
    delete: (key: string) => Promise<boolean>;
  };
  windowControls: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    quit: () => void;
  };
  isElectron: boolean;
}

const api: ElectronAPI = {
  secureStore: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('store:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('store:delete', key),
  },
  windowControls: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    quit: () => ipcRenderer.send('app:quit'),
  },
  isElectron: true,
};

contextBridge.exposeInMainWorld('electronAPI', api);

// Deep link handoff (main.ts's deep-link IPC message, sent from
// setAsDefaultProtocolClient/argv/second-instance handling there) — no
// electronAPI surface needed for this one: contextIsolation separates JS
// globals, not the DOM, so a CustomEvent dispatched here on `window` is the
// SAME window the page's own listeners see. Reuses 'pushNotificationNav'
// (not a new event) so App.tsx's existing PushNotificationNavHandler — built
// for push-notification links — handles this identically, no renderer
// changes needed at all.
ipcRenderer.on('deep-link', (_event, url: string) => {
  window.dispatchEvent(new CustomEvent('pushNotificationNav', { detail: { link: url } }));
});
