import React, { useEffect, useState } from 'react';
import { Languages, X } from 'lucide-react';
import { DOM_CONFLICT_EVENT } from '../domTranslationGuard';

// Browser page translation (Google Translate in Chrome/Android, Safari's
// Translate) rewrites the page's text behind React's back, which can leave
// screens stuck or blank. This shows a one-time, dismissible tip when it
// looks like the browser is translating: Google's markers are visible up
// front, and Safari is caught the moment it trips the DOM guard.
// Deliberately NOT translate="no", so the reader sees it in their language.

const DISMISSED_KEY = 'rk-browser-translation-tip-dismissed';

const googleTranslateActive = () => {
  const html = document.documentElement;
  return html.classList.contains('translated-ltr')
    || html.classList.contains('translated-rtl')
    || !!document.querySelector('font[style*="vertical-align: inherit"]');
};

export const BrowserTranslationTip: React.FC = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try { if (localStorage.getItem(DISMISSED_KEY)) return; } catch { /* show anyway */ }
    let shown = false;
    const reveal = () => { if (!shown) { shown = true; setShow(true); cleanup(); } };

    window.addEventListener(DOM_CONFLICT_EVENT, reveal);
    // The app rewrites <html class> itself (LanguageContext), so poll for
    // Google's markers rather than trusting a single attribute change.
    const timer = window.setInterval(() => { if (googleTranslateActive()) reveal(); }, 3000);
    const cleanup = () => {
      window.removeEventListener(DOM_CONFLICT_EVENT, reveal);
      window.clearInterval(timer);
    };
    return cleanup;
  }, []);

  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch { /* non-fatal */ }
  };

  return (
    <div
      role="note"
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto flex max-w-md items-start gap-3 rounded-xl border bg-background p-3 text-sm shadow-lg sm:bottom-4"
    >
      <Languages className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Your browser is translating this page</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Browser translation can make some screens freeze or go blank. If that happens, turn off
          translation for this site in your browser and choose your language in the app instead.
        </p>
      </div>
      <button type="button" onClick={dismiss} className="shrink-0 rounded p-1 hover:bg-muted" aria-label="Dismiss tip">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default BrowserTranslationTip;
