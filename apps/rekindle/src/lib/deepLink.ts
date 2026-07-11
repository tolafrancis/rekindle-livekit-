// Deep-link bridge for shared content URLs (e.g. /devotional-series/:id).
//
// Shared links route to the SPA shell, which can only render tabs. We stash the
// target (type + id) here so the relevant screen can open the exact item once it
// mounts, then clear it so it fires only once.

const KEY = 'rk_deep_link';

export interface DeepLink {
  type: string;   // e.g. 'devotional-series' | 'prayer-series' | 'books'
  id: string;
  extra?: string; // optional secondary segment (e.g. prayer-watch time slot)
  ref?: string;   // referral code from a ?ref= share link
}

/** Which app tab a shared path segment maps to. */
export const DEEP_LINK_TAB: Record<string, string> = {
  'devotional-series': 'devotional-library',
  'daily-devotional': 'home',
  'ministry-devotional': 'home',
  'prayer-series': 'prayer-library',
  'prayer-topics': 'prayer-library',
  'prayer-watch': 'prayer-library',
  'ministry-prayer': 'ministries',
  'books': 'books',
};

export function setDeepLink(dl: DeepLink): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(dl));
  } catch {
    /* ignore storage failures */
  }
}

/** Peek without consuming (rarely needed). */
export function peekDeepLink(): DeepLink | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DeepLink) : null;
  } catch {
    return null;
  }
}

/**
 * Return and clear the pending deep link if it matches `type`. Screens call this
 * on mount so a shared link opens the intended item exactly once.
 */
export function consumeDeepLink(type: string): DeepLink | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const dl = JSON.parse(raw) as DeepLink;
    if (dl.type !== type) return null;
    sessionStorage.removeItem(KEY);
    return dl;
  } catch {
    return null;
  }
}
