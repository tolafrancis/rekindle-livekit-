// =============================================================================
// useLocalizedScripture — resolve stored (English) scripture refs into the
// reader's language at display time, via an actual published Bible version
// (see src/lib/bibleLocalization.ts). Falls back to the provided English text
// when the language has no version, the reference can't be parsed, or the
// network fails — so the reader never shows an empty passage.
// =============================================================================
import { useState, useEffect } from 'react';
import { useLanguage } from './LanguageContext';
import { fetchLocalizedScripture, isScriptureLocalizable } from './bibleLocalization';

export interface ScriptureInput {
  reference?: string | null;
  text?: string | null;
  version?: string | null;
}

export interface ResolvedScripture {
  reference: string;
  text: string;
  version?: string | null;
  localized: boolean; // true once replaced with a published version's text
}

function toBase(items: ScriptureInput[]): ResolvedScripture[] {
  return items.map((i) => ({
    reference: i.reference || '',
    text: i.text || '',
    version: i.version || undefined,
    localized: false,
  }));
}

/**
 * Resolve a list of scripture references into the current language. Renders the
 * stored English immediately, then upgrades to the published-version text as the
 * (cached) lookups resolve. Order is preserved 1:1 with `items`.
 */
export function useLocalizedScriptures(items: ScriptureInput[]): ResolvedScripture[] {
  const { language } = useLanguage();
  const [resolved, setResolved] = useState<ResolvedScripture[]>(() => toBase(items));

  // Re-run only when the references or language actually change (not on every
  // render / new array identity).
  const key = `${language}|${items.map((i) => i.reference || '').join('¦')}`;

  useEffect(() => {
    const base = toBase(items);
    setResolved(base); // show English first
    if (!isScriptureLocalizable(language)) return;

    let cancelled = false;
    Promise.all(
      items.map((i) => (i.reference ? fetchLocalizedScripture(i.reference, language) : Promise.resolve(null)))
    ).then((results) => {
      if (cancelled) return;
      setResolved(
        items.map((i, idx) => {
          const r = results[idx];
          return r
            ? { reference: r.reference, text: r.text, version: undefined, localized: true }
            : { reference: i.reference || '', text: i.text || '', version: i.version || undefined, localized: false };
        })
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return resolved;
}

/** Single-reference convenience wrapper. */
export function useLocalizedScripture(input: ScriptureInput): ResolvedScripture {
  return useLocalizedScriptures([input])[0];
}
