export interface AppSettings {
  deviceKey: string;
  bearerToken: string;
  tokenExpiresAt: string;
  deviceId: string;
  ministryId: string;
  inputDeviceId: string;
  outputDeviceId: string;
  sourceLanguage: string;
  targetLanguage: string;
  isConfigured: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  deviceKey: '',
  bearerToken: '',
  tokenExpiresAt: '',
  deviceId: '',
  ministryId: '',
  inputDeviceId: 'default',
  outputDeviceId: 'default',
  sourceLanguage: 'en',
  targetLanguage: 'vi',
  isConfigured: false,
};

declare global {
  interface Window {
    electronAPI?: {
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
      isElectron?: boolean;
    };
  }
}

const SETTINGS_KEY = 'rekindle_translator_config';

export const secureStore = {
  async getSettings(): Promise<AppSettings> {
    try {
      if (window.electronAPI?.secureStore) {
        const raw = await window.electronAPI.secureStore.get(SETTINGS_KEY);
        if (raw) {
          return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
        }
      } else {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) {
          return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
        }
      }
    } catch (err) {
      console.warn('[SecureStore] Failed to parse settings:', err);
    }
    return DEFAULT_SETTINGS;
  },

  async saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const updated = { ...current, ...settings };

    try {
      const payload = JSON.stringify(updated);
      if (window.electronAPI?.secureStore) {
        await window.electronAPI.secureStore.set(SETTINGS_KEY, payload);
      } else {
        localStorage.setItem(SETTINGS_KEY, payload);
      }
    } catch (err) {
      console.error('[SecureStore] Failed to save settings:', err);
    }

    return updated;
  },

  async clear(): Promise<void> {
    try {
      if (window.electronAPI?.secureStore) {
        await window.electronAPI.secureStore.delete(SETTINGS_KEY);
      } else {
        localStorage.removeItem(SETTINGS_KEY);
      }
    } catch (err) {
      console.error('[SecureStore] Failed to clear settings:', err);
    }
  },
};
