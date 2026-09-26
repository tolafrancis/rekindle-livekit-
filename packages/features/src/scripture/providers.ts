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

interface KjvFile { books: string[][][] }

let kjvPromise: Promise<KjvFile> | null = null;
const loadKjv = () => {
  if (!kjvPromise) {
    kjvPromise = fetch('/scripture/kjv.json')
      .then(res => {
        if (!res.ok) throw new Error(`KJV text unavailable (${res.status})`);
        return res.json() as Promise<KjvFile>;
      })
      .catch(err => {
        kjvPromise = null; // let the operator's retry fetch again
        throw err;
      });
  }
  return kjvPromise;
};

const joinVerses = (verses: Array<{ n: number; text: string }>) =>
  verses.length === 1 ? verses[0].text : verses.map(v => `${v.n} ${v.text}`).join(' ');

export const kjvProvider: BibleProvider = {
  async getPassage(_version, bookId, chapter, startVerse, endVerse) {
    const bookIndex = BIBLE_BOOKS.findIndex(b => b.id === bookId);
    const book = BIBLE_BOOKS[bookIndex];
    if (!book) throw new Error(`Unknown book ${bookId}`);
    const kjv = await loadKjv();
    const verses = kjv.books[bookIndex]?.[chapter - 1];
    if (!verses) throw new Error('Passage not found');
    const from = startVerse ?? 1;
    const to = startVerse === undefined ? verses.length : (endVerse ?? startVerse);
    const picked = verses.slice(from - 1, to).map((text, i) => ({ n: from + i, text }));
    if (!picked.length) throw new Error('Passage not found');
    return {
      reference: formatReference({ bookId, book: book.name, chapter, startVerse, endVerse }),
      versionLabel: 'KJV',
      text: joinVerses(picked),
    };
  },
};

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

export const createApiBibleProvider = (ministryId: string): BibleProvider => ({
  async getPassage(version, bookId, chapter, startVerse, endVerse) {
    const bibleId = version.replace(/^apibible:/, '');
    const book = bookById(bookId);
    if (!book) throw new Error(`Unknown book ${bookId}`);
    const reference: ScriptureReference = { bookId, book: book.name, chapter, startVerse, endVerse };
    const { data, error } = await supabase.functions.invoke('scripture-passage', {
      body: { action: 'passage', ministryId, bibleId, passageId: apiBiblePassageId(reference) },
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
export const providerFor = (version: string, ministryId: string): BibleProvider =>
  version.startsWith('apibible:') ? createApiBibleProvider(ministryId) : kjvProvider;

export const fetchPassage = (version: string, ministryId: string, r: ScriptureReference) =>
  providerFor(version, ministryId).getPassage(version, r.bookId, r.chapter, r.startVerse, r.endVerse);
