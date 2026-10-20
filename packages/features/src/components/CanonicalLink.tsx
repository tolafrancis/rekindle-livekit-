import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Search engines treat rekindlebc.com as the main site. Both apps are
// single-page apps that serve one index.html for every path, so the canonical
// tag has to follow the route instead of naming the homepage everywhere.
//   ministry app (rekindlebc.com)     → every page is canonical on rekindlebc.com
//   consumer app (app.rekindlebc.com) → its landing, privacy and terms pages
//     duplicate the rekindlebc.com ones, so they point there; everything else
//     is its own page.
const MINISTRY_APP_URL = (import.meta.env.VITE_MINISTRY_APP_URL || 'https://rekindlebc.com').replace(/\/+$/, '');
const CONSUMER_APP_URL = (import.meta.env.VITE_CONSUMER_APP_URL || 'https://app.rekindlebc.com').replace(/\/+$/, '');

export function canonicalUrlFor(pathname: string, appContext: 'consumer' | 'ministry'): string {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (appContext === 'ministry') return `${MINISTRY_APP_URL}${path === '/' ? '/' : path}`;
  if (path === '/' || path === '/landing') return `${MINISTRY_APP_URL}/`;
  // The ministry app serves the same privacy and terms pages.
  if (path === '/privacy' || path === '/terms') return `${MINISTRY_APP_URL}${path}`;
  // /tutorial renders the same page as /guide.
  if (path === '/tutorial') return `${CONSUMER_APP_URL}/guide`;
  return `${CONSUMER_APP_URL}${path}`;
}

export const CanonicalLink: React.FC<{ appContext: 'consumer' | 'ministry' }> = ({ appContext }) => {
  const { pathname } = useLocation();
  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    const href = canonicalUrlFor(pathname, appContext);
    link.href = href;
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', href);
  }, [pathname, appContext]);
  return null;
};

export default CanonicalLink;
