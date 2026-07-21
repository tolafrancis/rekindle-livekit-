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
  return !isNativeApp();
}
