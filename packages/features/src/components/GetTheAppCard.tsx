// "Get tomorrow's devotional on your phone" — shown on the devotional's
// closing screen to people reading on the web (never inside the native or
// desktop apps). Offers the store link for their device: the ministry app on
// rekindlebc.com, the Rekindle app everywhere else. Links come from Platform
// Admin > Settings > App download links. "Not now" hides it for a week.

import React, { useEffect, useState } from 'react';
import { Smartphone, X } from 'lucide-react';
import { Button } from '@rekindle/ui/button';
import { isNativeApp, isDesktopApp } from '../platform';
import { DEFAULT_APP_DOWNLOAD_LINKS, loadAppDownloadLinks, type AppDownloadLinks } from '../appDownloadLinks';

const SNOOZE_KEY = 'rk_get_app_card_snoozed_until';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function isMinistryApp(): boolean {
  if (import.meta.env.VITE_APP_TYPE === 'ministry') return true;
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  return host === 'rekindlebc.com' || host === 'www.rekindlebc.com';
}

function deviceOs(): 'android' | 'ios' | 'other' {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/android/i.test(ua)) return 'android';
  // iPadOS reports itself as a Mac; touch support tells them apart.
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)) return 'ios';
  return 'other';
}

function isSnoozed(): boolean {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}

export const GetTheAppCard: React.FC = () => {
  const [hidden, setHidden] = useState(() => isNativeApp() || isDesktopApp() || isSnoozed());
  const [links, setLinks] = useState<AppDownloadLinks>(DEFAULT_APP_DOWNLOAD_LINKS);

  useEffect(() => {
    if (hidden) return;
    loadAppDownloadLinks().then(setLinks).catch(() => {});
  }, [hidden]);

  if (hidden) return null;

  const ministry = isMinistryApp();
  const playStore = ministry ? links.ministryPlayStore : links.consumerPlayStore;
  const appStore = ministry ? links.ministryAppStore : links.consumerAppStore;
  const os = deviceOs();
  // One button for the reader's phone; both on a computer.
  const stores = [
    os !== 'ios' && playStore ? { label: 'Get it on Google Play', href: playStore } : null,
    os !== 'android' && appStore ? { label: 'Download on the App Store', href: appStore } : null,
  ].filter(Boolean) as Array<{ label: string; href: string }>;
  if (stores.length === 0) return null;

  const snooze = () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS)); } catch { /* ignore */ }
    setHidden(true);
  };

  return (
    <div className="relative mt-3 mx-auto max-w-md rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 p-4 text-left">
      <button
        onClick={snooze}
        aria-label="Not now"
        className="absolute right-2 top-2 rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <Smartphone className="h-5 w-5 text-amber-300 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-white">Get tomorrow's devotional on your phone</p>
          <p className="mt-1 text-sm leading-relaxed text-white/80">
            {ministry ? 'The ReKindleBC Ministry app' : 'The Rekindle app'} reminds you each morning and reads the devotional aloud wherever you are.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {stores.map((s) => (
          <Button key={s.href} asChild className="w-full bg-white text-purple-900 hover:bg-white/90">
            <a href={s.href} target="_blank" rel="noopener noreferrer">{s.label}</a>
          </Button>
        ))}
        <button onClick={snooze} className="text-xs text-white/60 hover:text-white">Not now</button>
      </div>
    </div>
  );
};

export default GetTheAppCard;
