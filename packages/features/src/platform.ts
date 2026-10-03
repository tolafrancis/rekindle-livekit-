// Runtime platform detection for the native (Capacitor) shells.
//
// Deliberately does NOT import @capacitor/core: this module is consumed by the
// consumer web app too, which has no Capacitor dependency. Capacitor injects a
// `window.Capacitor` global into the native WebView, so a global check gives us
// the same answer with zero build impact on web.

/** True only inside a Capacitor native shell (Android/iOS). False on the web. */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as any).Capacitor;
  if (!cap) return false;
  return typeof cap.isNativePlatform === 'function' ? !!cap.isNativePlatform() : !!cap.isNative;
}

/**
 * True only inside the desktop Electron shell (`rekindle-desktop`, sibling repo).
 * That shell's preload script sets `window.rekindleDesktop` unconditionally — see
 * its `electron/preload.ts`. Deliberately the same shape as isNativeApp() above
 * (a plain runtime global check, zero build-time dependency), and checked
 * alongside it wherever a "don't offer to open the app you're already in" guard
 * is needed (see MeetingJoinPage.tsx's app-handoff banner).
 */
export function isDesktopApp(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).rekindleDesktop?.isDesktop;
}

/** 'android' | 'ios' | 'web' */
export function nativePlatform(): string {
  if (typeof window === 'undefined') return 'web';
  const cap = (window as any).Capacitor;
  if (!cap) return 'web';
  return typeof cap.getPlatform === 'function' ? cap.getPlatform() : 'web';
}

/**
 * Whether in-app purchase/subscription UI may be shown.
 *
 * Phase 0 decision (docs/mobile-app-build-plan.md): the native apps ship with NO
 * purchase surfaces. Showing a Stripe paywall inside the app risks rejection
 * under Apple guideline 3.1.1, and the free tier is fully usable without it.
 * Subscriptions are bought on the web; entitlements still resolve in the app.
 */
export function canShowPurchaseUI(): boolean {
  return nativePlatform() !== 'ios';
}

// ── Public web origin for links other people open ───────────────────────────
//
// Inside the native shells `window.location.origin` is the WebView's private
// origin (https://localhost on Android, capacitor://localhost on iOS,
// http://127.0.0.1:<port> in the Electron build), so any share/invite link built
// from it is dead on every other device. Each app registers its real public
// origin at startup (see apps/*/src/main.tsx); publicWebOrigin() swaps it in only
// when the page is running from one of those private origins. A normal web visit
// (including white-label subdomains and custom domains) keeps its own origin, and
// the Vite dev server keeps localhost so dev links stay local.
let registeredPublicOrigin = '';

/** Called once at app startup with this app's public web origin. */
export function setPublicWebOrigin(origin: string): void {
  registeredPublicOrigin = (origin || '').trim().replace(/\/+$/, '');
}

function isPrivateShellOrigin(origin: string): boolean {
  if (!origin || origin === 'null') return true;
  try {
    const u = new URL(origin);
    if (u.protocol === 'capacitor:' || u.protocol === 'file:') return true;
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  } catch {
    return true;
  }
}

/** Origin to put in links meant to be opened by someone else (share, invite, QR). */
export function publicWebOrigin(): string {
  const own = typeof window !== 'undefined' ? window.location.origin : '';
  if (!registeredPublicOrigin) return own;
  const isDevServer = !!(import.meta as any)?.env?.DEV && !isNativeApp();
  if (isDevServer || !isPrivateShellOrigin(own)) return own;
  return registeredPublicOrigin;
}
