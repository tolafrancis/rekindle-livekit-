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
  /** ReKindle BC desktop app for Windows (installer). */
  consumerWindows: string;
  /** ReKindle BC Ministry desktop app for Windows (installer). */
  ministryWindows: string;
  /** ReKindle Translator desktop app for Windows (apps/desktop). */
  translatorWindows: string;
  /** ReKindle BC desktop app for Mac. */
  consumerMac: string;
  /** ReKindle BC Ministry desktop app for Mac. */
  ministryMac: string;
  /** ReKindle Translator desktop app for Mac. */
  translatorMac: string;
  /** Direct Android APK download. */
  androidApk: string;
}

export const DEFAULT_APP_DOWNLOAD_LINKS: AppDownloadLinks = {
  consumerPlayStore: import.meta.env.VITE_PLAY_STORE_APP_URL || 'https://play.google.com/store/apps/details?id=com.rekindlebc.app',
  ministryPlayStore: import.meta.env.VITE_PLAY_STORE_MINISTRY_URL || 'https://play.google.com/store/apps/details?id=com.rekindlebc.ministry',
  consumerAppStore: '',
  ministryAppStore: '',
  // Each app's build used to set its own VITE_WINDOWS_INSTALLER_URL; keep
  // honouring it for whichever app this bundle is until an admin saves links.
  consumerWindows: import.meta.env.VITE_APP_TYPE === 'ministry' ? '' : (import.meta.env.VITE_WINDOWS_INSTALLER_URL || ''),
  ministryWindows: import.meta.env.VITE_APP_TYPE === 'ministry' ? (import.meta.env.VITE_WINDOWS_INSTALLER_URL || '') : '',
  translatorWindows: '',
  consumerMac: '',
  ministryMac: '',
  translatorMac: '',
  androidApk: import.meta.env.VITE_ANDROID_APK_URL || '',
};

export const APP_DOWNLOAD_LINK_FIELDS: Array<{ key: keyof AppDownloadLinks; label: string; placeholder: string }> = [
  { key: 'consumerPlayStore', label: 'ReKindle BC on Google Play', placeholder: 'https://play.google.com/store/apps/details?id=…' },
  { key: 'ministryPlayStore', label: 'ReKindle BC Ministry on Google Play', placeholder: 'https://play.google.com/store/apps/details?id=…' },
  { key: 'consumerAppStore', label: 'ReKindle BC on the App Store', placeholder: 'https://apps.apple.com/app/…' },
  { key: 'ministryAppStore', label: 'ReKindle BC Ministry on the App Store', placeholder: 'https://apps.apple.com/app/…' },
  { key: 'consumerWindows', label: 'ReKindle BC for Windows (desktop)', placeholder: 'https://…/ReKindle-Setup.exe' },
  { key: 'ministryWindows', label: 'ReKindle BC Ministry for Windows (desktop)', placeholder: 'https://…/Rekindle-Ministry-Setup.exe' },
  { key: 'translatorWindows', label: 'ReKindle Translator for Windows (desktop)', placeholder: 'https://…/ReKindle-Translator-Setup.exe' },
  { key: 'consumerMac', label: 'ReKindle BC for Mac (desktop)', placeholder: 'https://…/ReKindle.dmg or Mac App Store link' },
  { key: 'ministryMac', label: 'ReKindle BC Ministry for Mac (desktop)', placeholder: 'https://…/Rekindle-Ministry.dmg or Mac App Store link' },
  { key: 'translatorMac', label: 'ReKindle Translator for Mac (desktop)', placeholder: 'https://…/ReKindle-Translator.dmg' },
  { key: 'androidApk', label: 'Android APK (direct download)', placeholder: 'https://…/rekindle.apk' },
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
