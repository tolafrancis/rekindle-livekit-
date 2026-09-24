import { useEffect, useMemo, useState } from 'react';
import type { CaptionLine, CaptionSize } from '../useLiveCaptions';

/**
 * Shared on-demand caption overlay (agents/captions). Used by the meeting
 * view today; built to be reused by the HLS webinar/broadcast viewers, which
 * pass in lines they've already time-aligned to playback.
 *
 * - At most 2 lines are visible; older text scrolls off the top.
 * - A line still being spoken (interim) is replaced in place when its final
 *   version arrives — same segment id, so nothing jumps or duplicates.
 * - Fades out after a few seconds of silence.
 * - Screen readers hear only FINAL text, via a polite live region; the
 *   visual text is aria-hidden so interim churn isn't announced.
 * - Padded clear of device safe areas (notches, home indicator).
 */

interface CaptionOverlayProps {
  lines: CaptionLine[];
  size: CaptionSize;
  /** Distance from the bottom of the parent, e.g. to sit above a control bar. */
  bottomOffsetClassName?: string;
  /** Shown while CC is on but nothing has been said yet. */
  placeholder?: string | null;
}

const FADE_AFTER_MS = 4_000;

const SIZE_CLASS: Record<CaptionSize, string> = {
  sm: 'text-sm sm:text-base',
  md: 'text-base sm:text-xl',
  lg: 'text-xl sm:text-3xl',
};

// Two lines at leading-snug (1.375) — the tail of the text stays visible and
// anything older is clipped off the top.
const TWO_LINES_EM = '2.75em';

export function CaptionOverlay({
  lines,
  size,
  bottomOffsetClassName = 'bottom-40 sm:bottom-44',
  placeholder = null,
}: CaptionOverlayProps) {
  const [visible, setVisible] = useState(false);
  const lastUpdateKey = lines.length ? `${lines[lines.length - 1].id}:${lines[lines.length - 1].text}` : '';

  useEffect(() => {
    if (!lastUpdateKey) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), FADE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [lastUpdateKey]);

  // Speaker label only when the speaker changes, so a monologue reads as
  // plain running text.
  const rendered = useMemo(() => lines.map((line, i) => ({
    ...line,
    label: i === 0 || lines[i - 1].speakerIdentity !== line.speakerIdentity ? line.speakerName : null,
  })), [lines]);

  const lastFinal = useMemo(() => {
    for (let i = lines.length - 1; i >= 0; i -= 1) if (lines[i].final) return lines[i];
    return null;
  }, [lines]);

  const showPlaceholder = !lines.length && !!placeholder;

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 z-40 flex justify-center px-[max(1rem,env(safe-area-inset-left))] pb-[env(safe-area-inset-bottom)] ${bottomOffsetClassName}`}
    >
      {/* Screen readers: final text only, announced politely. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {lastFinal ? `${lastFinal.speakerName}: ${lastFinal.text}` : ''}
      </div>

      <div
        aria-hidden="true"
        className={`max-w-3xl rounded-lg bg-black/75 px-3 py-1.5 text-white shadow-lg transition-opacity duration-500 ${
          (visible && lines.length) || showPlaceholder ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div
          className={`flex flex-col justify-end overflow-hidden leading-snug ${SIZE_CLASS[size]}`}
          style={{ maxHeight: TWO_LINES_EM }}
        >
          <p className="text-center">
            {showPlaceholder && <span className="text-white/70">{placeholder}</span>}
            {rendered.map((line) => (
              <span key={line.id} className={line.final ? undefined : 'text-white/85'}>
                {line.label && <span className="font-semibold text-indigo-200">{line.label}: </span>}
                {line.text}{' '}
              </span>
            ))}
          </p>
        </div>
      </div>
    </div>
  );
}

export default CaptionOverlay;
