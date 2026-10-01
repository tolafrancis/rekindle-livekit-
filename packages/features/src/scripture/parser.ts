// Rule-based Bible reference parser for live transcripts (Live Scripture,
// phase 1). Pure and synchronous: no network, no AI. It only ever returns a
// *reference* — the verse text always comes from a BibleProvider.
//
// Handles written forms ("John 3:16", "Romans 8:28-30", "1 Cor 13:4") and
// spoken ones as speech-to-text writes them ("John three sixteen", "Romans
// eight twenty eight", "Second Timothy chapter one verse seven"), plus a
// short rolling context so "turn to John chapter 3 ... verse sixteen"
// resolves to John 3:16.
//
// Extension points for later phases (quote matching, other spoken
// languages) hang off ScriptureDetector.scan(): add another pass there;
// nothing else needs to change.

import { BIBLE_BOOKS, type BibleBook } from './books';

export interface ScriptureReference {
  /** USFM code, e.g. JHN */
  bookId: string;
  /** Display name, e.g. John */
  book: string;
  chapter: number;
  /** Absent for a whole-chapter reference like Psalm 23. */
  startVerse?: number;
  endVerse?: number;
}

export type DetectionKind =
  | 'explicit' // book + chapter + verse in the same breath
  | 'context' // "verse 16" resolved against a recently named book + chapter
  | 'chapter'; // book + chapter only, e.g. Psalm 23

export interface ScriptureDetection {
  reference: ScriptureReference;
  /** confirmed: safe to show. suggest: offer to the operator, never auto-show. */
  status: 'confirmed' | 'suggest';
  kind: DetectionKind;
}

// ---------------------------------------------------------------------------
// Book lookup
// ---------------------------------------------------------------------------

// Abbreviations for the numbered books' base names ("1 Cor 13:4").
const BASE_ABBREVIATIONS: Record<string, string[]> = {
  samuel: ['sam', 'sa'],
  kings: ['kgs', 'ki', 'king'],
  chronicles: ['chron', 'chr', 'chronicle'],
  corinthians: ['cor', 'corinthian'],
  thessalonians: ['thess', 'thes', 'th', 'thessalonian'],
  timothy: ['tim'],
  peter: ['pet', 'pt'],
  john: ['jn', 'jhn'],
};

// Book names that are also everyday words or first names ("John said",
// "Mark my words", "Job 5 days"). A bare chapter number after one of these
// is too weak even to suggest: it needs the word "chapter" too.
const COMMON_WORD_BOOKS = new Set([
  'JOB', 'MRK', 'ACT', 'NUM', 'JDG', 'JAS', 'JHN', 'RUT', 'AMO', 'JUD',
  'TIT', 'JOL', 'JON', 'DAN', 'EST', 'MAL', 'LUK', 'MAT', 'SNG', 'LAM',
]);

interface BookEntry { tokens: string[]; book: BibleBook; abbrev: boolean }

// Unnumbered names (and aliases), longest first so "song of solomon" wins
// over "song".
const PLAIN_NAMES: BookEntry[] = [];
// Numbered books keyed by base name/abbreviation → [book for 1, 2, 3].
const NUMBERED: Map<string, (BibleBook | undefined)[]> = new Map();
// Short abbreviations ("mic", "col", "1 cor") only count with an explicit
// verse ("Mic 6:8", "Col chapter 3 verse 16"): in speech "mic 2" is far more
// likely a microphone than Micah.
const isAbbrev = (key: string, fullName: string) => key !== fullName && key.length <= 4;
const NUMBERED_ABBREVS = new Set<string>();

for (const book of BIBLE_BOOKS) {
  const m = /^([123]) (.+)$/.exec(book.name);
  if (m) {
    const n = Number(m[1]);
    const base = m[2].toLowerCase();
    for (const key of [base, ...(BASE_ABBREVIATIONS[base] || []), ...book.aliases]) {
      if (isAbbrev(key, base)) NUMBERED_ABBREVS.add(key);
      const slot = NUMBERED.get(key) || [];
      slot[n - 1] = book;
      NUMBERED.set(key, slot);
    }
  } else {
    for (const name of [book.name.toLowerCase(), ...book.aliases]) {
      PLAIN_NAMES.push({ tokens: name.split(' '), book, abbrev: isAbbrev(name, book.name.toLowerCase()) });
    }
  }
}
PLAIN_NAMES.sort((a, b) => b.tokens.length - a.tokens.length);

export const bookById = (id: string): BibleBook | undefined => BIBLE_BOOKS.find(b => b.id === id);

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

type Token =
  | { t: 'num'; v: number; spoken: boolean }
  | { t: 'ord'; v: number } // first / 2nd / iii — only meaningful before a book
  | { t: 'word'; w: string }
  | { t: ':' }
  | { t: '-' };

const UNITS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
};
const TEENS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const ORDINALS: Record<string, number> = {
  first: 1, '1st': 1, ii: 2, second: 2, '2nd': 2, iii: 3, third: 3, '3rd': 3,
};

const isNumberWord = (w: string) => w in UNITS || w in TEENS || w in TENS || w === 'hundred';

// Reads one spoken number starting at words[i]: "twenty eight", "one hundred
// and nineteen", "a hundred". Consecutive spoken numbers stay separate, which
// is what makes "three sixteen" → 3, 16 and "eight twenty eight" → 8, 28.
function readSpokenNumber(words: string[], i: number): { v: number; next: number } | null {
  const below100 = (j: number): { v: number; next: number } | null => {
    const w = words[j];
    if (w in TENS) {
      const u = words[j + 1];
      return u in UNITS ? { v: TENS[w] + UNITS[u], next: j + 2 } : { v: TENS[w], next: j + 1 };
    }
    if (w in TEENS) return { v: TEENS[w], next: j + 1 };
    if (w in UNITS) return { v: UNITS[w], next: j + 1 };
    return null;
  };
  const w = words[i];
  if ((w in UNITS || w === 'a') && words[i + 1] === 'hundred') {
    let v = (w === 'a' ? 1 : UNITS[w]) * 100;
    let j = i + 2;
    if (words[j] === 'and' && words[j + 1] && isNumberWord(words[j + 1])) j++;
    const rest = below100(j);
    if (rest) { v += rest.v; j = rest.next; }
    return { v, next: j };
  }
  return below100(i);
}

function tokenize(text: string): Token[] {
  const words = text
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[–—]/g, '-')
    // keep "3:16" and "16-18" as separate tokens
    .replace(/(\d)\s*([:.])\s*(\d)/g, '$1 : $3')
    .replace(/(\d)\s*-\s*(\d)/g, '$1 - $2')
    .replace(/([a-z])-([a-z])/g, '$1 $2') // "twenty-eight"
    .replace(/[^a-z0-9:\- ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const out: Token[] = [];
  for (let i = 0; i < words.length;) {
    const w = words[i];
    if (w === ':' || w === '-') { out.push({ t: w }); i++; continue; }
    if (w in ORDINALS) { out.push({ t: 'ord', v: ORDINALS[w] }); i++; continue; }
    if (/^\d+$/.test(w)) { out.push({ t: 'num', v: Number(w), spoken: false }); i++; continue; }
    const spoken = readSpokenNumber(words, i);
    if (spoken) { out.push({ t: 'num', v: spoken.v, spoken: true }); i = spoken.next; continue; }
    out.push({ t: 'word', w });
    i++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const isWord = (tok: Token | undefined, ...ws: string[]) => !!tok && tok.t === 'word' && ws.includes(tok.w);
const numAt = (toks: Token[], i: number) => {
  const tok = toks[i];
  return tok && tok.t === 'num' ? tok.v : null;
};

// Matches a book name at toks[i]; returns the book and the index after it.
function matchBook(toks: Token[], i: number): { book: BibleBook; next: number; abbrev: boolean } | null {
  const tok = toks[i];
  if (!tok) return null;

  // "1 John", "First Corinthians", "II Timothy", "two Timothy"
  const n = tok.t === 'ord' ? tok.v : tok.t === 'num' && tok.v >= 1 && tok.v <= 3 ? tok.v : null;
  const after = toks[i + 1];
  if (n !== null && after && after.t === 'word') {
    const slot = NUMBERED.get(after.w);
    const book = slot?.[n - 1];
    if (book) return { book, next: i + 2, abbrev: NUMBERED_ABBREVS.has(after.w) };
  }

  if (tok.t !== 'word') return null;
  for (const entry of PLAIN_NAMES) {
    if (entry.tokens.every((w, k) => isWord(toks[i + k], w))) {
      return { book: entry.book, next: i + entry.tokens.length, abbrev: entry.abbrev };
    }
  }
  return null;
}

// "16-18", "16 to 18", "sixteen through eighteen", "16 and 17" (and only when
// consecutive — "verse 16 and 20 minutes later" is not a range).
function readRange(toks: Token[], i: number, start: number): { end: number; next: number } {
  const tok = toks[i];
  if (tok && (tok.t === '-' || isWord(tok, 'to', 'through', 'thru', 'till', 'until'))) {
    const end = numAt(toks, i + 1);
    if (end !== null && end > start) return { end, next: i + 2 };
  }
  if (isWord(tok, 'and')) {
    const end = numAt(toks, i + 1);
    if (end === start + 1) return { end, next: i + 2 };
  }
  return { end: start, next: i };
}

const valid = (book: BibleBook, chapter: number, start?: number, end?: number) => {
  const count = book.verses[chapter - 1];
  if (!count) return false;
  if (start === undefined) return true;
  return start >= 1 && start <= count && (end ?? start) >= start && (end ?? start) <= count;
};

const ref = (book: BibleBook, chapter: number, startVerse?: number, endVerse?: number): ScriptureReference => ({
  bookId: book.id,
  book: book.name,
  chapter,
  ...(startVerse !== undefined ? { startVerse, endVerse: endVerse ?? startVerse } : {}),
});

// chapter 0 = the speaker named a book at the very end of a caption line
// ("…turn with me to Second Corinthians") and the chapter and verse arrived
// in the next line ("chapter one verse two"). Only "chapter N …" resolves
// against it, and only for a short while (BOOK_ONLY_CONTEXT_MS).
interface Context { book: BibleBook; chapter: number; at: number }
const BOOK_ONLY_CONTEXT_MS = 20_000;

function parse(text: string, ctx: Context | null): { found: ScriptureDetection[]; ctx: Context | null } {
  const toks = tokenize(text);
  const found: ScriptureDetection[] = [];
  let context = ctx;

  for (let i = 0; i < toks.length;) {
    const hit = matchBook(toks, i);
    if (hit) {
      const { book } = hit;
      let j = hit.next;
      const chapterKw = isWord(toks[j], 'chapter', 'chapters', 'ch', 'chap');
      if (chapterKw) j++;
      const chapter = numAt(toks, j);
      if (chapter === null) {
        // A book name alone is never a reference, but one that ends the line
        // may get its chapter in the next caption line.
        if (hit.next >= toks.length && !hit.abbrev) context = { book, chapter: 0, at: 0 };
        i = hit.next;
        continue;
      }
      j++;

      let verse: number | null = null;
      if (toks[j]?.t === ':' || isWord(toks[j], 'verse', 'verses', 'vs', 'v', 'vv')) {
        verse = numAt(toks, j + 1);
        if (verse !== null) j += 2;
      } else if (numAt(toks, j) !== null && !hit.abbrev) {
        // spoken "John three sixteen"
        verse = numAt(toks, j);
        j++;
      }

      if (verse !== null) {
        const range = readRange(toks, j, verse);
        if (valid(book, chapter, verse, range.end)) {
          found.push({ reference: ref(book, chapter, verse, range.end), status: 'confirmed', kind: 'explicit' });
          context = { book, chapter, at: 0 };
          i = range.next;
          continue;
        }
      } else if (valid(book, chapter) && (chapterKw || (!hit.abbrev && !COMMON_WORD_BOOKS.has(book.id)))) {
        found.push({ reference: ref(book, chapter), status: 'suggest', kind: 'chapter' });
        context = { book, chapter, at: 0 };
        i = j;
        continue;
      }
      i = hit.next;
      continue;
    }

    // No book here: "verse sixteen" or "chapter 4" against the book (and
    // chapter) the speaker named a moment ago.
    if (context && isWord(toks[i], 'verse', 'verses', 'vs', 'vv')) {
      const verse = numAt(toks, i + 1);
      if (verse !== null) {
        const range = readRange(toks, i + 2, verse);
        if (valid(context.book, context.chapter, verse, range.end)) {
          found.push({ reference: ref(context.book, context.chapter, verse, range.end), status: 'confirmed', kind: 'context' });
          context = { ...context, at: 0 }; // still reading here: keep the context alive
          i = range.next;
          continue;
        }
      }
    }
    if (context && isWord(toks[i], 'chapter')) {
      const chapter = numAt(toks, i + 1);
      if (chapter !== null && valid(context.book, chapter)) {
        const verseKw = isWord(toks[i + 2], 'verse', 'verses') || toks[i + 2]?.t === ':';
        const verse = verseKw ? numAt(toks, i + 3) : null;
        if (verse !== null) {
          const range = readRange(toks, i + 4, verse);
          if (valid(context.book, chapter, verse, range.end)) {
            found.push({ reference: ref(context.book, chapter, verse, range.end), status: 'confirmed', kind: 'context' });
            context = { book: context.book, chapter, at: 0 };
            i = range.next;
            continue;
          }
        } else {
          found.push({ reference: ref(context.book, chapter), status: 'suggest', kind: 'chapter' });
          context = { book: context.book, chapter, at: 0 };
          i += 2;
          continue;
        }
      }
    }
    i++;
  }
  return { found, ctx: context };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses one typed or spoken reference, e.g. from the operator's manual
 * entry box. Returns null when the text doesn't name a real passage.
 */
export function parseReference(text: string): ScriptureReference | null {
  const { found } = parse(text, null);
  if (found.length) return found[0].reference;
  // Operators type book + chapter for common-word books too ("John 3").
  const toks = tokenize(text);
  const hit = matchBook(toks, 0);
  const chapter = hit ? numAt(toks, hit.next) : null;
  return hit && chapter !== null && valid(hit.book, chapter) ? ref(hit.book, chapter) : null;
}

/** "John 3:16", "Romans 8:28-30", "Psalm 23" */
export function formatReference(r: ScriptureReference): string {
  const name = r.bookId === 'PSA' ? 'Psalm' : r.book;
  if (r.startVerse === undefined) return `${name} ${r.chapter}`;
  const range = r.endVerse && r.endVerse !== r.startVerse ? `-${r.endVerse}` : '';
  return `${name} ${r.chapter}:${r.startVerse}${range}`;
}

export const sameReference = (a: ScriptureReference | null | undefined, b: ScriptureReference | null | undefined) =>
  !!a && !!b && a.bookId === b.bookId && a.chapter === b.chapter && a.startVerse === b.startVerse && a.endVerse === b.endVerse;

export interface ScriptureDetectorOptions {
  /** How long a named book + chapter keeps resolving later "verse N" (ms). */
  contextMs?: number;
}

/**
 * Stateful scanner for one live session. Feed it each finished caption line;
 * it remembers the last book + chapter for `contextMs` (90 s by default).
 */
export class ScriptureDetector {
  private ctx: Context | null = null;
  private readonly contextMs: number;

  constructor(opts: ScriptureDetectorOptions = {}) {
    this.contextMs = opts.contextMs ?? 90_000;
  }

  /**
   * Scans the original transcript first and falls back to the translation,
   * which can garble a reference but occasionally keeps one the original
   * lost. Returns every reference found in the line, in speaking order.
   */
  scan(sourceText: string, translatedText?: string | null, now: number = Date.now()): ScriptureDetection[] {
    const ttl = this.ctx?.chapter === 0 ? BOOK_ONLY_CONTEXT_MS : this.contextMs;
    if (this.ctx && now - this.ctx.at > ttl) this.ctx = null;

    let result = parse(sourceText || '', this.ctx);
    if (!result.found.length && translatedText && translatedText !== sourceText) {
      result = parse(translatedText, this.ctx);
    }
    if (result.ctx && result.ctx !== this.ctx) this.ctx = { ...result.ctx, at: now };
    return result.found;
  }

  reset() {
    this.ctx = null;
  }
}
