import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { CaptionLine, CaptionSize } from '../useLiveCaptions';
import { updateCaptionPrefs, useCaptionPrefs, type CaptionBackground, type CaptionColor } from '../captionPrefs';

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
 * - Background, text colour and position follow the viewer's caption prefs
 *   (CaptionsButton's style menu). Dragging the box anywhere over the video
 *   saves a custom position, so it can be moved off a camera tile.
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

const BOX_CLASS: Record<CaptionBackground, string> = {
  solid: 'bg-black shadow-lg',
  semi: 'bg-black/75 shadow-lg',
  outline: '',
  none: '',
};

const COLOR_CLASS: Record<CaptionColor, string> = {
  white: 'text-white',
  yellow: 'text-yellow-300',
  cyan: 'text-cyan-300',
  green: 'text-green-400',
};

// Readable on any video without a box behind it.
const OUTLINE_SHADOW = '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 4px #000';

const clampDrag = (v: number) => Math.min(0.95, Math.max(0.05, v));

// Two lines at leading-snug (1.375) — the tail of the text stays visible and
// anything older is clipped off the top.
const TWO_LINES_EM = '2.75em';

export function CaptionOverlay({
  lines,
  size,
  bottomOffsetClassName = 'bottom-40 sm:bottom-44',
  placeholder = null,
}: CaptionOverlayProps) {
  const prefs = useCaptionPrefs();
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Live position while a drag is in progress; saved to prefs on release.
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
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
  const shown = (visible && lines.length > 0) || showPlaceholder || !!drag;

  // Where inside the box it was grabbed, so the box doesn't jump to centre
  // on the pointer; and whether it actually moved (a tap isn't a drag).
  const grabRef = useRef<{ dx: number; dy: number; startX: number; startY: number; moved: boolean } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;
    const box = e.currentTarget.getBoundingClientRect();
    const centre = {
      x: (box.left + box.width / 2 - rect.left) / rect.width,
      y: (box.top + box.height / 2 - rect.top) / rect.height,
    };
    grabRef.current = {
      dx: (e.clientX - rect.left) / rect.width - centre.x,
      dy: (e.clientY - rect.top) / rect.height - centre.y,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x: clampDrag(centre.x), y: clampDrag(centre.y) });
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const grab = grabRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!grab || !rect || !rect.width || !rect.height) return;
    if (Math.abs(e.clientX - grab.startX) + Math.abs(e.clientY - grab.startY) > 4) grab.moved = true;
    if (!grab.moved) return;
    setDrag({
      x: clampDrag((e.clientX - rect.left) / rect.width - grab.dx),
      y: clampDrag((e.clientY - rect.top) / rect.height - grab.dy),
    });
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const grab = grabRef.current;
    grabRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (grab?.moved && drag) updateCaptionPrefs({ position: 'custom', dragX: drag.x, dragY: drag.y });
    setDrag(null);
  };

  const custom = drag ?? (prefs.position === 'custom' ? { x: prefs.dragX, y: prefs.dragY } : null);
  const placement = custom
    ? ''
    : prefs.position === 'top'
      ? 'inset-x-0 top-16 flex justify-center px-[max(1rem,env(safe-area-inset-left))]'
      : `inset-x-0 flex justify-center px-[max(1rem,env(safe-area-inset-left))] pb-[env(safe-area-inset-bottom)] ${bottomOffsetClassName}`;
  const outlined = prefs.background === 'outline';

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-40">
      {/* Screen readers: final text only, announced politely. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {lastFinal ? `${lastFinal.speakerName}: ${lastFinal.text}` : ''}
      </div>

      <div
        className={`absolute ${placement}`}
        style={custom ? {
          left: `${custom.x * 100}%`,
          top: `${custom.y * 100}%`,
          transform: 'translate(-50%, -50%)',
          width: 'max-content',
          maxWidth: 'min(48rem, 90%)',
        } : undefined}
      >
        <div
          aria-hidden="true"
          title="Drag to move captions"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={`max-w-3xl touch-none select-none rounded-lg px-3 py-1.5 transition-opacity duration-500 ${BOX_CLASS[prefs.background]} ${COLOR_CLASS[prefs.color]} ${
            shown ? 'pointer-events-auto cursor-move opacity-100' : 'opacity-0'
          } ${drag ? 'ring-2 ring-white/60' : ''}`}
          style={outlined ? { textShadow: OUTLINE_SHADOW } : undefined}
        >
          <div
            className={`flex flex-col justify-end overflow-hidden leading-snug ${SIZE_CLASS[size]}`}
            style={{ maxHeight: TWO_LINES_EM }}
          >
            <p className="text-center">
              {showPlaceholder && <span className="opacity-70">{placeholder}</span>}
              {rendered.map((line) => (
                <span key={line.id} className={line.final ? undefined : 'opacity-90'}>
                  {line.label && <span className="font-semibold text-indigo-200">{line.label}: </span>}
                  {line.text}{' '}
                </span>
              ))}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CaptionOverlay;
