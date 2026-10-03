import { getPlatformSetting, setPlatformSetting } from './platformSettings';

// Store / download links shown on the landing page, editable by platform
// admins (Platform Admin → Settings → App download links). Stored as one JSON
// value in platform_settings under APP_DOWNLOAD_LINKS_KEY. An empty field
// hides that button. Before an admin saves anything, the landing page falls
// back to DEFAULT_APP_DOWNLOAD_LINKS (both apps' Google Play listings, plus
// any VITE_* release URLs the build sets).

export const APP_DOWNLOAD_LINKS_KEY = 'app_download_links';

export interface AppDownloadLinks {
  /** ReKindle BC (consumer app) on Google Play. */
  consumerPlayStore: string;
  /** ReKindle BC Ministry on Google Play. */
  ministryPlayStore: string;
  /** ReKindle BC on the Apple App Store. */
  consumerAppStore: string;
  /** ReKindle BC Ministry on the Apple App Store. */
  ministryAppStore: string;
  /** Direct Android APK download. */
  androidApk: string;
  /** Windows installer. */
  windowsInstaller: string;
}

export const DEFAULT_APP_DOWNLOAD_LINKS: AppDownloadLinks = {
  consumerPlayStore: import.meta.env.VITE_PLAY_STORE_APP_URL || 'https://play.google.com/store/apps/details?id=com.rekindlebc.app',
  ministryPlayStore: import.meta.env.VITE_PLAY_STORE_MINISTRY_URL || 'https://play.google.com/store/apps/details?id=com.rekindlebc.ministry',
  consumerAppStore: '',
  ministryAppStore: '',
  androidApk: import.meta.env.VITE_ANDROID_APK_URL || '',
  windowsInstaller: import.meta.env.VITE_WINDOWS_INSTALLER_URL || '',
};

export const APP_DOWNLOAD_LINK_FIELDS: Array<{ key: keyof AppDownloadLinks; label: string; placeholder: string }> = [
  { key: 'consumerPlayStore', label: 'ReKindle BC on Google Play', placeholder: 'https://play.google.com/store/apps/details?id=…' },
  { key: 'ministryPlayStore', label: 'ReKindle BC Ministry on Google Play', placeholder: 'https://play.google.com/store/apps/details?id=…' },
  { key: 'consumerAppStore', label: 'ReKindle BC on the App Store', placeholder: 'https://apps.apple.com/app/…' },
  { key: 'ministryAppStore', label: 'ReKindle BC Ministry on the App Store', placeholder: 'https://apps.apple.com/app/…' },
  { key: 'androidApk', label: 'Android APK (direct download)', placeholder: 'https://…/rekindle.apk' },
  { key: 'windowsInstaller', label: 'Windows installer', placeholder: 'https://…/ReKindle-Setup.exe' },
];

export async function loadAppDownloadLinks(): Promise<AppDownloadLinks> {
  const saved = await getPlatformSetting<Partial<AppDownloadLinks> | null>(APP_DOWNLOAD_LINKS_KEY, null);
  if (!saved || typeof saved !== 'object') return DEFAULT_APP_DOWNLOAD_LINKS;
  // Once saved, an empty field means "hide it", so don't refill from defaults.
  const out = { ...DEFAULT_APP_DOWNLOAD_LINKS };
  for (const f of APP_DOWNLOAD_LINK_FIELDS) {
    if (typeof saved[f.key] === 'string') out[f.key] = (saved[f.key] as string).trim();
  }
  return out;
}

export async function saveAppDownloadLinks(links: AppDownloadLinks): Promise<{ error?: string }> {
  return setPlatformSetting(APP_DOWNLOAD_LINKS_KEY, JSON.stringify(links));
}
