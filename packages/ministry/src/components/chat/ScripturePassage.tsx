import React, { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@rekindle/ui/sheet';
import { Loader2, BookOpen } from 'lucide-react';
import { ScriptureDetector, formatReference, parseReference, type ScriptureReference } from '@rekindle/features/scripture/parser';
import { kjvProvider, DEFAULT_BIBLE_VERSION, type BiblePassage } from '@rekindle/features/scripture/providers';

/** Loads a passage from the bundled KJV (no network call after the first). */
export function usePassage(reference: ScriptureReference | null) {
  const [passage, setPassage] = useState<BiblePassage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const key = reference ? formatReference(reference) : '';

  useEffect(() => {
    if (!reference) { setPassage(null); setError(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    kjvProvider
      .getPassage(DEFAULT_BIBLE_VERSION, reference.bookId, reference.chapter, reference.startVerse, reference.endVerse)
      .then((p) => { if (!cancelled) setPassage(p); })
      .catch(() => { if (!cancelled) { setPassage(null); setError("That passage couldn't be found."); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { passage, error, loading };
}

/** Bottom sheet showing a passage, opened from a reference in a message. */
export const ScripturePassageSheet: React.FC<{
  reference: ScriptureReference | null;
  onOpenChange: (open: boolean) => void;
}> = ({ reference, onOpenChange }) => {
  const { passage, error, loading } = usePassage(reference);
  return (
    <Sheet open={!!reference} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            {reference ? formatReference(reference) : ''}
          </SheetTitle>
          <SheetDescription>{passage?.versionLabel || DEFAULT_BIBLE_VERSION}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 pb-4">
          {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          {error && <p className="text-sm text-muted-foreground">{error}</p>}
          {passage && <p className="text-base leading-relaxed whitespace-pre-wrap">{passage.text}</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
};

type Segment = { text: string; reference?: ScriptureReference };

// Splits message text so references like "John 3:16" become tappable.
function splitReferences(text: string): Segment[] {
  const found = new ScriptureDetector().scan(text).filter((d) => d.status === 'confirmed' && d.kind !== 'context');
  if (!found.length) return [{ text }];
  const segments: Segment[] = [];
  let rest = text;
  for (const d of found) {
    const label = formatReference(d.reference);
    // Find how the reference was written: book name/abbreviation up to the verse numbers.
    const nums = d.reference.startVerse !== undefined ? `${d.reference.chapter}\\s*:\\s*${d.reference.startVerse}(?:\\s*[-–]\\s*\\d+)?` : `${d.reference.chapter}`;
    const re = new RegExp(`((?:[1-3]\\s*)?[A-Za-z][A-Za-z.]*(?:\\s+(?:of\\s+)?[A-Za-z]+)?\\s*${nums})`, 'i');
    const match = re.exec(rest);
    if (!match || !parseReference(match[1])) continue;
    if (match.index > 0) segments.push({ text: rest.slice(0, match.index) });
    segments.push({ text: match[1], reference: d.reference });
    rest = rest.slice(match.index + match[1].length);
    void label;
  }
  if (rest) segments.push({ text: rest });
  return segments.length ? segments : [{ text }];
}

const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/gi;

function linkify(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  text.replace(URL_RE, (url, _g, offset: number) => {
    if (offset > last) out.push(text.slice(last, offset));
    out.push(
      <a key={`${keyPrefix}-u${offset}`} href={url} target="_blank" rel="noopener noreferrer nofollow"
        className="underline underline-offset-2 break-all">
        {url}
      </a>,
    );
    last = offset + url.length;
    return url;
  });
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Message text with tappable Scripture references and clickable links. */
export const RichMessageText: React.FC<{
  text: string;
  onOpenReference: (r: ScriptureReference) => void;
  className?: string;
}> = ({ text, onOpenReference, className }) => {
  const segments = useMemo(() => splitReferences(text), [text]);
  return (
    <p className={className}>
      {segments.map((s, i) =>
        s.reference ? (
          <button
            key={i}
            type="button"
            onClick={() => onOpenReference(s.reference!)}
            className="font-medium underline decoration-dotted underline-offset-2 hover:decoration-solid"
          >
            {s.text}
          </button>
        ) : (
          <React.Fragment key={i}>{linkify(s.text, String(i))}</React.Fragment>
        ),
      )}
    </p>
  );
};
