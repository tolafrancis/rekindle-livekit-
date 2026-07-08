// Whether to use the native Web Share sheet (navigator.share).
//
// navigator.share EXISTS on desktop Chrome/Edge, but the desktop OS share panel
// is unreliable — on Windows it commonly opens a blank "Share" dialog that shows
// a spinner then vanishes. On mobile/touch devices the native sheet is excellent.
// So we gate native sharing to mobile devices and let callers fall back to an
// in-app dialog / clipboard on desktop.
export function canNativeShare(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return false;
  }
  const nav = navigator as Navigator & {
    userAgentData?: { mobile?: boolean };
    maxTouchPoints?: number;
  };

  // Most reliable when present (Chromium): trust the platform's own signal.
  if (nav.userAgentData && typeof nav.userAgentData.mobile === 'boolean') {
    return nav.userAgentData.mobile;
  }

  const ua = nav.userAgent || '';
  // iPadOS 13+ reports a desktop ("Macintosh") UA but is a touch device.
  const isIpadOS = /Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1;
  return /Android|iPhone|iPod|iPad|Mobile|Windows Phone/i.test(ua) || isIpadOS;
}
