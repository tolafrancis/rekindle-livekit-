// =============================================================================
// bibleLocalization.ts — display-time scripture localization by REFERENCE
// Folder: src/lib/
// -----------------------------------------------------------------------------
// Scripture is authored in English (fetched from bible-api.com and frozen into
// the content row). Rather than machine-TRANSLATING the verse text — which would
// produce an AI paraphrase of scripture — we fetch the passage from an actual
// published Bible version in the reader's language, looked up by the stored
// English reference (e.g. "Psalm 130:6").
//
// Source: getbible.net v2 — free, no API key, CORS-open (Access-Control-Allow-
// Origin: *). It returns both the localized verse text AND the localized
// reference name (e.g. "Thi-thiên 130:6"), so the citation itself also localizes.
//
// Coverage is partial: languages without a getbible version (Indonesian, Hindi,
// Malay, Persian, …) return null here, and callers fall back to the machine-
// translated `scripture_text` (if present) or the stored English. English itself
// returns null (the stored text is already English — no fetch needed).
// =============================================================================

// App language code -> getbible translation slug. Only languages with a real
// published version are listed; anything absent is treated as "not localizable"
// and callers fall back. Slugs verified against getbible.net/v2/translations.json.
const LANG_TO_GETBIBLE: Record<string, string> = {
  vi: 'vietnamese',   // Vietnamese (1934)
  zh: 'chiunl',       // 聖經 (文理和合)
  ko: 'korean',       // Korean
  ja: 'japkougo',     // Kougo-yaku (1954/55)
  th: 'thai',         // Thai (from KJV)
  ar: 'arabicsv',     // Smith & Van Dyke
  tl: 'tagalog',      // Ang Dating Biblia (1905)
  he: 'modernhebrew', // Hebrew Modern
  es: 'valera',       // Reina Valera (1909)
  fr: 'ls1910',       // Louis Segond (1910)
  de: 'luther1545',   // Luther (1545)
  pt: 'almeida',      // Almeida Atualizada
  ru: 'synodal',      // Synodal (1876)
  it: 'riveduta',     // Riveduta (1927)
};

// Canonical book name -> getbible book number (1-66). Aliases (abbreviations,
// ordinal spellings, common alternates) all fold to the same number.
const BOOK_TO_NUMBER: Record<string, number> = (() => {
  const canonical: [string, number][] = [
    ['genesis', 1], ['exodus', 2], ['leviticus', 3], ['numbers', 4], ['deuteronomy', 5],
    ['joshua', 6], ['judges', 7], ['ruth', 8], ['1 samuel', 9], ['2 samuel', 10],
    ['1 kings', 11], ['2 kings', 12], ['1 chronicles', 13], ['2 chronicles', 14],
    ['ezra', 15], ['nehemiah', 16], ['esther', 17], ['job', 18], ['psalms', 19],
    ['proverbs', 20], ['ecclesiastes', 21], ['song of solomon', 22], ['isaiah', 23],
    ['jeremiah', 24], ['lamentations', 25], ['ezekiel', 26], ['daniel', 27], ['hosea', 28],
    ['joel', 29], ['amos', 30], ['obadiah', 31], ['jonah', 32], ['micah', 33], ['nahum', 34],
    ['habakkuk', 35], ['zephaniah', 36], ['haggai', 37], ['zechariah', 38], ['malachi', 39],
    ['matthew', 40], ['mark', 41], ['luke', 42], ['john', 43], ['acts', 44], ['romans', 45],
    ['1 corinthians', 46], ['2 corinthians', 47], ['galatians', 48], ['ephesians', 49],
    ['philippians', 50], ['colossians', 51], ['1 thessalonians', 52], ['2 thessalonians', 53],
    ['1 timothy', 54], ['2 timothy', 55], ['titus', 56], ['philemon', 57], ['hebrews', 58],
    ['james', 59], ['1 peter', 60], ['2 peter', 61], ['1 john', 62], ['2 john', 63],
    ['3 john', 64], ['jude', 65], ['revelation', 66],
  ];
  const aliases: [string, number][] = [
    ['psalm', 19], ['song of songs', 22], ['canticles', 22], ['revelations', 66],
    ['gen', 1], ['exo', 2], ['exod', 2], ['lev', 3], ['num', 4], ['deut', 5], ['deu', 5],
    ['josh', 6], ['jos', 6], ['judg', 7], ['jdg', 7], ['1 sam', 9], ['2 sam', 10],
    ['1 kgs', 11], ['2 kgs', 12], ['1 chron', 13], ['2 chron', 14], ['1 chr', 13], ['2 chr', 14],
    ['neh', 16], ['est', 17], ['ps', 19], ['psa', 19], ['prov', 20], ['prv', 20], ['eccl', 21],
    ['song', 22], ['isa', 23], ['jer', 24], ['lam', 25], ['ezek', 26], ['eze', 26], ['dan', 27],
    ['hos', 28], ['obad', 31], ['jon', 32], ['mic', 33], ['nah', 34], ['hab', 35], ['zeph', 36],
    ['hag', 37], ['zech', 38], ['zec', 38], ['mal', 39],
    ['matt', 40], ['mat', 40], ['mrk', 41], ['mk', 41], ['luk', 42], ['lk', 42], ['jhn', 43], ['jn', 43],
    ['rom', 45], ['1 cor', 46], ['2 cor', 47], ['gal', 48], ['eph', 49], ['phil', 50], ['php', 50],
    ['col', 51], ['1 thess', 52], ['2 thess', 53], ['1 thes', 52], ['2 thes', 53],
    ['1 tim', 54], ['2 tim', 55], ['tit', 56], ['phlm', 57], ['heb', 58], ['jas', 59], ['jms', 59],
    ['1 pet', 60], ['2 pet', 61], ['1 jn', 62], ['2 jn', 63], ['3 jn', 64], ['rev', 66],
  ];
  const map: Record<string, number> = {};
  for (const [name, n] of [...canonical, ...aliases]) map[name] = n;
  return map;
})();

export interface LocalizedScripture {
  reference: string; // localized citation, e.g. "Thi-thiên 130:6"
  text: string;      // localized verse text (verses joined by a space)
}

interface ParsedReference {
  book: number;
  chapter: number;
  verseStart: number;
  verseEnd: number;
}

/** Whether scripture can be localized (a published version exists) for a language. */
export function isScriptureLocalizable(language: string): boolean {
  return language !== 'en' && !!LANG_TO_GETBIBLE[language];
}

// Normalize a leading ordinal ("I", "II", "III", "First"/"Second"/"Third",
// "1st") to a plain digit so "II Timothy" / "Second Timothy" match "2 timothy".
function normalizeBookName(raw: string): string {
  let s = raw.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
  s = s
    .replace(/^iii\s+/, '3 ').replace(/^ii\s+/, '2 ').replace(/^i\s+/, '1 ')
    .replace(/^third\s+/, '3 ').replace(/^second\s+/, '2 ').replace(/^first\s+/, '1 ')
    .replace(/^(\d)(st|nd|rd|th)\s+/, '$1 ');
  return s;
}

/**
 * Parse an English reference like "Psalm 130:6", "Romans 8:1-11",
 * "1 Corinthians 13:4-7". Returns null if it can't be confidently parsed
 * (e.g. whole-chapter refs, cross-chapter ranges, unknown book) so callers fall
 * back to the stored text rather than showing the wrong passage.
 */
export function parseReference(reference: string): ParsedReference | null {
  const ref = (reference || '').trim();
  if (!ref) return null;
  // book (optional leading ordinal) + chapter:verse(-verse)
  const m = ref.match(/^\s*([1-3]?\s*[A-Za-z][A-Za-z .]*?)\s+(\d+)\s*:\s*(\d+)(?:\s*-\s*(\d+))?/);
  if (!m) return null;

  const book = BOOK_TO_NUMBER[normalizeBookName(m[1])];
  if (!book) return null;

  const chapter = parseInt(m[2], 10);
  const verseStart = parseInt(m[3], 10);
  const verseEnd = m[4] ? parseInt(m[4], 10) : verseStart;
  if (!chapter || !verseStart || verseEnd < verseStart) return null;

  return { book, chapter, verseStart, verseEnd };
}

// ---- caching -----------------------------------------------------------------
// Chapters are cached in-memory (per session) AND in localStorage (across
// reloads) so a passage is fetched at most once. localStorage is best-effort;
// any failure (quota, private mode) silently degrades to in-memory only.
const CACHE_PREFIX = 'bible_v2_';
const memChapters = new Map<string, any[]>();       // `${slug}/${book}/${chapter}` -> verses[]
const inflight = new Map<string, Promise<any[] | null>>();

async function fetchChapter(slug: string, book: number, chapter: number): Promise<any[] | null> {
  const key = `${slug}/${book}/${chapter}`;
  const mem = memChapters.get(key);
  if (mem) return mem;

  try {
    const ls = localStorage.getItem(CACHE_PREFIX + key);
    if (ls) { const parsed = JSON.parse(ls); memChapters.set(key, parsed); return parsed; }
  } catch { /* ignore */ }

  if (inflight.has(key)) return inflight.get(key)!;

  const p = (async () => {
    try {
      const res = await fetch(`https://api.getbible.net/v2/${slug}/${book}/${chapter}.json`);
      if (!res.ok) return null;
      const data = await res.json();
      const verses = Array.isArray(data?.verses) ? data.verses : null;
      if (!verses) return null;
      memChapters.set(key, verses);
      try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(verses)); } catch { /* ignore */ }
      return verses;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

// Build the {reference, text} result from a fetched chapter's verses array.
function selectVerses(verses: any[], parsed: ParsedReference, reference: string): LocalizedScripture | null {
  const selected = verses.filter(
    (v: any) => v.verse >= parsed.verseStart && v.verse <= parsed.verseEnd
  );
  if (selected.length === 0) return null;

  const text = selected.map((v: any) => (v.text || '').trim()).join(' ').trim();
  if (!text) return null;

  // Localized citation: single verse -> the verse's own `name` ("Thi-thiên 130:6");
  // range -> first verse name with the end verse appended ("Thi-thiên 130:6-8").
  const first = selected[0];
  const localizedRef = parsed.verseEnd > parsed.verseStart
    ? `${first.name}-${parsed.verseEnd}`
    : (first.name || reference);

  return { reference: localizedRef, text };
}

// Synchronous cache read of an already-fetched chapter (memory or localStorage).
// Returns null if not cached — useful in render paths that can't await (e.g.
// building a share message). Triggers no network request.
function chapterFromCache(slug: string, book: number, chapter: number): any[] | null {
  const key = `${slug}/${book}/${chapter}`;
  const mem = memChapters.get(key);
  if (mem) return mem;
  try {
    const ls = localStorage.getItem(CACHE_PREFIX + key);
    if (ls) { const parsed = JSON.parse(ls); memChapters.set(key, parsed); return parsed; }
  } catch { /* ignore */ }
  return null;
}

/**
 * Fetch a scripture reference in the given app language. Returns null when the
 * language has no published version, the reference can't be parsed, the verses
 * aren't found, or the network fails — callers must fall back to stored text.
 */
export async function fetchLocalizedScripture(
  reference: string,
  language: string
): Promise<LocalizedScripture | null> {
  const slug = LANG_TO_GETBIBLE[language];
  if (!slug) return null; // English or an unsupported language

  const parsed = parseReference(reference);
  if (!parsed) return null;

  const verses = await fetchChapter(slug, parsed.book, parsed.chapter);
  if (!verses) return null;

  return selectVerses(verses, parsed, reference);
}

/**
 * Synchronous variant: returns the localized scripture ONLY if the chapter is
 * already cached (from a prior fetchLocalizedScripture). Returns null otherwise
 * — never fetches. For render paths that can't await, with an English fallback.
 */
export function getCachedLocalizedScripture(
  reference: string,
  language: string
): LocalizedScripture | null {
  const slug = LANG_TO_GETBIBLE[language];
  if (!slug) return null;

  const parsed = parseReference(reference);
  if (!parsed) return null;

  const verses = chapterFromCache(slug, parsed.book, parsed.chapter);
  if (!verses) return null;

  return selectVerses(verses, parsed, reference);
}
