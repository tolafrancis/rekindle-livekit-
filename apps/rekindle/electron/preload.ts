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
