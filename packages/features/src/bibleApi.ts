// =============================================================================
// Bible API helper — single source for "Load scripture" buttons across the app
// Folder: src/lib/
// -----------------------------------------------------------------------------
// Wraps bible-api.com (free, no key, CORS) — the same service already used in
// ScriptureMemory, the devotional/prayer managers, etc. Centralised here so
// every scripture-reference field fetches identically.
//
// Note: bible-api.com serves public-domain translations only (KJV, WEB, ...).
// Copyrighted versions like NKJV are not available; fields stay editable.
// =============================================================================

export interface BibleVersion {
  id: string;
  name: string;
}

/** Translations supported by bible-api.com (the set used across the app). */
export const BIBLE_VERSIONS: BibleVersion[] = [
  { id: 'kjv', name: 'King James Version (KJV)' },
  { id: 'web', name: 'World English Bible (WEB)' },
  { id: 'oeb-us', name: 'Open English Bible (US)' },
  { id: 'clementine', name: 'Clementine Latin Vulgate' },
  { id: 'almeida', name: 'Almeida (Portuguese)' },
  { id: 'rccv', name: 'Romanian Cornilescu' },
];

/**
 * Fetch the full text for a scripture reference (e.g. "John 3:16",
 * "Romans 8:1-11"). Throws on empty reference or a failed lookup so callers can
 * surface a toast. 'web' is bible-api.com's default (no translation param).
 */
export async function fetchScripture(reference: string, version = 'kjv'): Promise<string> {
  const ref = (reference || '').trim();
  if (!ref) throw new Error('Please enter a scripture reference first');

  const url = version && version !== 'web'
    ? `https://bible-api.com/${encodeURIComponent(ref)}?translation=${version}`
    : `https://bible-api.com/${encodeURIComponent(ref)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Scripture not found — check the reference format (e.g. "John 3:16")');

  const data = await res.json();
  const text = data?.text
    || (Array.isArray(data?.verses) ? data.verses.map((v: any) => v.text).join(' ') : '');
  const clean = (text || '').trim();
  if (!clean) throw new Error('No text returned for that reference');
  return clean;
}
