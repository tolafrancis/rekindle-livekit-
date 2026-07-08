// Lightweight offline read-through cache for content (devotionals, prayers, …).
//
// The service worker deliberately skips Supabase API calls (see public/sw.js),
// so read responses won't survive offline on their own. This helper transparently
// caches successful Supabase reads in localStorage and serves them back when the
// device is offline or a request fails — making content "accessible offline".
//
// It also provides a tiny pending-write queue so progress saved while offline is
// flushed to Supabase automatically once connectivity returns.

const CACHE_PREFIX = 'rk_offline_cache_';
const PENDING_PROGRESS_KEY = 'rk_offline_pending_progress';

const isOffline = (): boolean =>
  typeof navigator !== 'undefined' && navigator.onLine === false;

export function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (raw == null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data));
  } catch (err) {
    // Quota errors etc. are non-fatal — offline cache is best-effort.
    console.warn('[offlineCache] Failed to write cache for', key, err);
  }
}

/**
 * Read-through cache. When offline, returns cached data immediately if present.
 * Otherwise fetches fresh data, caches it, and returns it. If the fetch fails
 * (e.g. flaky connection), falls back to any cached copy before throwing.
 */
export async function cachedRead<T>(
  key: string,
  fetcher: () => Promise<T>
): Promise<{ data: T; fromCache: boolean }> {
  if (isOffline()) {
    const cached = readCache<T>(key);
    if (cached !== null) return { data: cached, fromCache: true };
  }

  try {
    const data = await fetcher();
    writeCache(key, data);
    return { data, fromCache: false };
  } catch (err) {
    const cached = readCache<T>(key);
    if (cached !== null) return { data: cached, fromCache: true };
    throw err;
  }
}

// ── Pending progress queue ───────────────────────────────────────────────────

interface PendingProgress {
  table: string;
  data: Record<string, any>;
  onConflict: string;
}

function readPending(): PendingProgress[] {
  try {
    const raw = localStorage.getItem(PENDING_PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as PendingProgress[]) : [];
  } catch {
    return [];
  }
}

function writePending(items: PendingProgress[]): void {
  try {
    localStorage.setItem(PENDING_PROGRESS_KEY, JSON.stringify(items));
  } catch (err) {
    console.warn('[offlineCache] Failed to persist pending progress', err);
  }
}

/** Queue a progress upsert to be flushed to Supabase when back online. */
export function queuePendingProgress(item: PendingProgress): void {
  const items = readPending();
  // De-dupe by table + the unique-conflict key values so repeated saves of the
  // same record collapse into the latest one.
  const keyOf = (p: PendingProgress) =>
    p.table + '|' + p.onConflict.split(',').map((k) => p.data[k.trim()]).join('|');
  const next = items.filter((p) => keyOf(p) !== keyOf(item));
  next.push(item);
  writePending(next);
}

/**
 * Flush any queued progress upserts. Accepts the supabase client to avoid a
 * hard import cycle. Safe to call repeatedly; clears items that succeed.
 */
export async function flushPendingProgress(supabase: any): Promise<void> {
  if (isOffline()) return;
  const items = readPending();
  if (items.length === 0) return;

  const remaining: PendingProgress[] = [];
  for (const item of items) {
    try {
      const { error } = await supabase
        .from(item.table)
        .upsert(item.data, { onConflict: item.onConflict });
      if (error) remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }
  writePending(remaining);
}
