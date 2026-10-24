// "Get the app" block on the ministry join flow's finish screens (the
// registration success/pending screen and "You're already a member"), for
// people who joined on the web. Android and computers get the Google Play
// button. On iPhone/iPad there's no App Store listing yet, so it says the iOS
// app is coming soon and shows how to keep using Rekindle in Safari, added to
// the Home Screen. Once an admin saves an App Store link (Platform Admin >
// Settings > App download links) iOS gets that button instead. Never shown
// inside the native or desktop apps.

import React, { useEffect, useState } from 'react';
import { Smartphone, Share } from 'lucide-react';
import { Button } from '@rekindle/ui/button';
import { isNativeApp, isDesktopApp } from '../platform';
import { DEFAULT_APP_DOWNLOAD_LINKS, loadAppDownloadLinks, type AppDownloadLinks } from '../appDownloadLinks';
import { deviceOs, isMinistryApp } from './GetTheAppCard';

export const JoinGetTheApp: React.FC = () => {
  const hidden = isNativeApp() || isDesktopApp();
  const [links, setLinks] = useState<AppDownloadLinks>(DEFAULT_APP_DOWNLOAD_LINKS);

  useEffect(() => {
    if (hidden) return;
    loadAppDownloadLinks().then(setLinks).catch(() => {});
  }, [hidden]);

  if (hidden) return null;

  const ministry = isMinistryApp();
  const appName = ministry ? 'ReKindle BC Ministry' : 'ReKindle BC';
  const playStore = ministry ? links.ministryPlayStore : links.consumerPlayStore;
  const appStore = ministry ? links.ministryAppStore : links.consumerAppStore;
  const os = deviceOs();
  const showPlay = os !== 'ios' && !!playStore;
  const showAppStore = os !== 'android' && !!appStore;
  const showIosSoon = os !== 'android' && !appStore;
  if (!showPlay && !showAppStore && !showIosSoon) return null;

  return (
    <div className="mt-5 rounded-lg border bg-purple-50 p-4 text-left">
      <div className="flex items-center gap-1.5 text-purple-800 mb-1">
        <Smartphone className="h-4 w-4" aria-hidden="true" />
        <span className="text-sm font-medium">Get the {appName} app</span>
      </div>
      <p className="text-xs text-gray-600 mb-3">
        Stay connected with your ministry: devotionals, prayer, live services and meetings on your phone.
      </p>
      <div className="flex flex-col gap-2">
        {showPlay && (
          <Button asChild className="w-full min-h-[44px]">
            <a href={playStore} target="_blank" rel="noopener noreferrer">Get it on Google Play</a>
          </Button>
        )}
        {showAppStore && (
          <Button asChild className="w-full min-h-[44px]">
            <a href={appStore} target="_blank" rel="noopener noreferrer">Download on the App Store</a>
          </Button>
        )}
      </div>
      {showIosSoon && (
        <div className={showPlay ? 'mt-3 border-t border-purple-100 pt-3' : ''}>
          <p className="text-sm font-medium text-gray-900">iPhone app coming soon</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-600">
            {os === 'ios' ? 'You can use Rekindle on your iPhone right now' : 'On an iPhone you can use Rekindle right now'} in Safari.
            For an app-like icon, tap <Share className="inline h-3.5 w-3.5 -mt-0.5" aria-label="Share" /> <strong>Share</strong>,
            then <strong>Add to Home Screen</strong>.
          </p>
        </div>
      )}
    </div>
  );
};

export default JoinGetTheApp;
