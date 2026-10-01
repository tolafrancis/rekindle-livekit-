// Bible text providers for Live Scripture. Detection only ever produces a
// reference; every word of Scripture shown comes from one of these.
//
// Versions are identified by a string:
//   'KJV'                  public-domain King James text shipped with the app
//                          (apps/*/public/scripture/kjv.json), fetched once and
//                          then served from the browser's HTTP cache
//   'apibible:<bibleId>'   a licensed version through API.Bible, fetched via
//                          the scripture-passage edge function so the API key
//                          never reaches the browser. Its text is not stored
//                          by the app beyond what is currently on screen.
//
// The listener's language comes from LISTENER_EDITIONS below: public-domain
// editions shipped the same way (apps/*/public/scripture/<edition>.json),
// e.g. the 1926 Vietnamese Bible.
//
// A new source (another API, a licensed local file) is one more provider
// here plus a new version prefix; the detector and the UI don't change.

import { supabase } from '@rekindle/supabase';
import { BIBLE_BOOKS } from './books';
import { bookById, formatReference, type ScriptureReference } from './parser';

export interface BiblePassage {
  /** e.g. "John 3:16-17" */
  reference: string;
  /** Short label shown with the text, e.g. KJV, NIV */
  versionLabel: string;
  /** Verse text. Multi-verse passages keep their verse numbers: "16 For God… 17 For God sent…" */
  text: string;
  /** Copyright line the provider requires to be shown with its text. */
  attribution?: string;
}

export interface BibleProvider {
  getPassage(
    version: string,
    bookId: string,
    chapter: number,
    startVerse?: number,
    endVerse?: number,
  ): Promise<BiblePassage>;
}

export const DEFAULT_BIBLE_VERSION = 'KJV';

// ---------------------------------------------------------------------------
// KJV (public domain, bundled)
// ---------------------------------------------------------------------------

interface BundledFile { books: string[][][] }

// Each bundled file is fetched once per page and then served from memory
// (and the browser's HTTP cache on the next load).
const bundledCache = new Map<string, Promise<BundledFile>>();
const loadBundled = (path: string) => {
  let p = bundledCache.get(path);
  if (!p) {
    p = fetch(path)
      .then(res => {
        if (!res.ok) throw new Error(`Bible text unavailable (${res.status})`);
        return res.json() as Promise<BundledFile>;
      })
      .catch(err => {
        bundledCache.delete(path); // let the operator's retry fetch again
        throw err;
      });
    bundledCache.set(path, p);
  }
  return p;
};

const joinVerses = (verses: Array<{ n: number; text: string }>) =>
  verses.length === 1 ? verses[0].text : verses.map(v => `${v.n} ${v.text}`).join(' ');

/** A public-domain edition shipped as a static file (66 books, KJV versification). */
const bundledProvider = (path: string, versionLabel: string): BibleProvider => ({
  async getPassage(_version, bookId, chapter, startVerse, endVerse) {
    const bookIndex = BIBLE_BOOKS.findIndex(b => b.id === bookId);
    const book = BIBLE_BOOKS[bookIndex];
    if (!book) throw new Error(`Unknown book ${bookId}`);
    const file = await loadBundled(path);
    const verses = file.books[bookIndex]?.[chapter - 1];
    if (!verses) throw new Error('Passage not found');
    const from = startVerse ?? 1;
    const to = startVerse === undefined ? verses.length : (endVerse ?? startVerse);
    const picked = verses.slice(from - 1, to).map((text, i) => ({ n: from + i, text }));
    if (!picked.length) throw new Error('Passage not found');
    return {
      reference: formatReference({ bookId, book: book.name, chapter, startVerse, endVerse }),
      versionLabel,
      text: joinVerses(picked),
    };
  },
});

export const kjvProvider: BibleProvider = bundledProvider('/scripture/kjv.json', 'KJV');

/**
 * Public-domain editions in other languages, by the session's language code,
 * used to show the verse in the listener's language next to the preferred
 * version. Only published translations are ever shown: a language without an
 * entry here simply gets the preferred version alone, never a machine
 * translation.
 */
export const LISTENER_EDITIONS: Record<string, { path: string; label: string; name: string }> = {
  vi: { path: '/scripture/vi1926.json', label: 'VI 1926', name: 'Kinh Thánh 1926 (Bản Truyền Thống)' },
};

const baseLanguage = (code: string | null | undefined) => (code || '').toLowerCase().split(/[-_]/)[0];

/** The listener-language edition for a session's target language, if there is one. */
export const listenerEditionFor = (targetLanguage: string | null | undefined) =>
  LISTENER_EDITIONS[baseLanguage(targetLanguage)] ?? null;

/**
 * The same passage in the listener's language, or null when there's no
 * edition for it (or the target is English, which the preferred version
 * already covers).
 */
export async function fetchListenerPassage(
  targetLanguage: string | null | undefined,
  r: ScriptureReference,
): Promise<(BiblePassage & { language: string }) | null> {
  const edition = listenerEditionFor(targetLanguage);
  if (!edition) return null;
  const passage = await bundledProvider(edition.path, edition.label)
    .getPassage(edition.label, r.bookId, r.chapter, r.startVerse, r.endVerse);
  return { ...passage, language: baseLanguage(targetLanguage) };
}

// ---------------------------------------------------------------------------
// API.Bible (licensed, via edge function)
// ---------------------------------------------------------------------------

export interface ApiBibleVersion {
  id: string;
  abbreviation: string;
  name: string;
  language: string;
}

/** USFM passage id API.Bible expects: JHN.3.16-JHN.3.18, or JHN.3 for a chapter. */
export const apiBiblePassageId = (r: ScriptureReference) => {
  if (r.startVerse === undefined) return `${r.bookId}.${r.chapter}`;
  const start = `${r.bookId}.${r.chapter}.${r.startVerse}`;
  return r.endVerse && r.endVerse !== r.startVerse ? `${start}-${r.bookId}.${r.chapter}.${r.endVerse}` : start;
};

/**
 * Who is asking for licensed text: a signed-in member (the ministry id), or
 * a speaker link, which has no account and proves itself with its token.
 */
export type PassageCaller = string | { sessionId: string; speakerToken: string };
const callerBody = (caller: PassageCaller) => (typeof caller === 'string' ? { ministryId: caller } : caller);

export const createApiBibleProvider = (caller: PassageCaller): BibleProvider => ({
  async getPassage(version, bookId, chapter, startVerse, endVerse) {
    const bibleId = version.replace(/^apibible:/, '');
    const book = bookById(bookId);
    if (!book) throw new Error(`Unknown book ${bookId}`);
    const reference: ScriptureReference = { bookId, book: book.name, chapter, startVerse, endVerse };
    const { data, error } = await supabase.functions.invoke('scripture-passage', {
      body: { action: 'passage', ...callerBody(caller), bibleId, passageId: apiBiblePassageId(reference) },
    });
    if (error || !data?.text) throw new Error(data?.error || error?.message || 'Scripture unavailable');
    return {
      reference: formatReference(reference),
      versionLabel: data.abbreviation || 'API.Bible',
      text: String(data.text),
      attribution: data.copyright || undefined,
    };
  },
});

export async function listApiBibleVersions(ministryId: string): Promise<ApiBibleVersion[]> {
  const { data, error } = await supabase.functions.invoke('scripture-passage', {
    body: { action: 'versions', ministryId },
  });
  if (error) throw error;
  return (data?.versions as ApiBibleVersion[]) || [];
}

/** Picks the provider for a version id; unknown ids fall back to KJV. */
export const providerFor = (version: string, caller: PassageCaller): BibleProvider =>
  version.startsWith('apibible:') ? createApiBibleProvider(caller) : kjvProvider;

export const fetchPassage = (version: string, caller: PassageCaller, r: ScriptureReference) =>
  providerFor(version, caller).getPassage(version, r.bookId, r.chapter, r.startVerse, r.endVerse);
