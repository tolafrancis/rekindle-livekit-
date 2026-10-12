// TutorialOverlay: dims the screen, cuts a spotlight around the step's real
// element (found by its data-tour id), and shows the step card beside it.
//
// The dim layer never takes clicks, so the app stays usable while a tour runs.
// The card stops pointer and focus events from reaching the document, so an
// open menu or dialog in the app stays open when the user presses Next.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowLeft, ArrowRight, Check, Hand, Play, Info } from 'lucide-react';
import type { TutorialDefinition, TutorialStep, TutorialTranslate } from './types';
import { isInView, placePopover, type Box, type PopoverPosition, type Viewport } from './position';

const FIND_TIMEOUT_MS = 4000;
const FIND_INTERVAL_MS = 150;
const SPOT_PAD = 6;
const Z = 2147483000;

const selectorFor = (id: string) => `[data-tour="${id.replace(/"/g, '\\"')}"]`;

/** The first element marked with this id that is actually showing. The same
 *  control can render twice (desktop rail and mobile strip). */
export function findVisibleTarget(id: string): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(selectorFor(id)));
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
    return el;
  }
  return null;
}

const isDisabled = (el: HTMLElement) =>
  (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true';

function readViewport(): Viewport {
  const vv = window.visualViewport;
  const width = vv?.width ?? window.innerWidth;
  const height = vv?.height ?? window.innerHeight;
  // Fixed headers sit at the top; a sticky header is part of the flow, so
  // only count what actually overlaps the top edge.
  const header = document.querySelector<HTMLElement>('header');
  let insetTop = 0;
  if (header) {
    const pos = window.getComputedStyle(header).position;
    const r = header.getBoundingClientRect();
    if ((pos === 'fixed' || pos === 'sticky') && r.top <= 0 && r.bottom > 0) insetTop = r.bottom;
  }
  return { width, height, insetTop, insetBottom: 0 };
}

const toBox = (r: DOMRect): Box => ({ top: r.top, left: r.left, width: r.width, height: r.height });
const sameBox = (a: Box | null, b: Box | null) =>
  !!a && !!b && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 &&
  Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Radix modals (dialogs, menus) switch off pointer events on <body>. */
const modalLayerOpen = () => document.body.style.pointerEvents === 'none';

interface Props {
  tutorial: TutorialDefinition;
  stepIndex: number;
  paused: boolean;
  tr: TutorialTranslate;
  onNext: () => void;
  onBack: () => void;
  onStop: (how: 'skip' | 'exit') => void;
  onResume: () => void;
  onAction: () => void;
  onShowMe: (step: TutorialStep) => void;
  onRetryNav: (step: TutorialStep) => void;
}

type FindState = 'searching' | 'found' | 'missing' | 'none';

export const TutorialOverlay: React.FC<Props> = ({
  tutorial, stepIndex, paused, tr, onNext, onBack, onStop, onResume, onAction, onShowMe, onRetryNav,
}) => {
  const step = tutorial.steps[stepIndex];
  const total = tutorial.steps.length;
  const isLast = stepIndex === total - 1;
  const k = (field: string) => `${tutorial.id}.${step.id}.${field}`;
  const ui = (key: string, fallback: string) => tr(`ui.${key}`, fallback);

  const [find, setFind] = useState<FindState>('searching');
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [pos, setPos] = useState<PopoverPosition | null>(null);
  const [retry, setRetry] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [announce, setAnnounce] = useState('');

  // ── Find the target (screens are lazy-loaded, so wait a little) ────────
  useEffect(() => {
    setTarget(null);
    setBox(null);
    if (paused) return;
    if (!step.target) { setFind('none'); return; }
    setFind('searching');
    const started = Date.now();
    let timer = 0;
    let scrolled = false;
    const look = () => {
      const el = findVisibleTarget(step.target!);
      if (el) {
        if (!scrolled) {
          scrolled = true;
          const vp = readViewport();
          if (!isInView(toBox(el.getBoundingClientRect()), vp)) {
            el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
          }
        }
        setTarget(el);
        setFind('found');
        return;
      }
      if (Date.now() - started > FIND_TIMEOUT_MS) { setFind('missing'); return; }
      timer = window.setTimeout(look, FIND_INTERVAL_MS);
    };
    look();
    return () => window.clearTimeout(timer);
  }, [step, paused, retry]);

  // ── Follow the target as the page scrolls, resizes or re-renders ───────
  useEffect(() => {
    if (!target) return;
    let raf = 0;
    let last: Box | null = null;
    const tick = () => {
      if (!target.isConnected) {
        // Re-rendered away (e.g. a list reloaded): look for it again.
        setTarget(null);
        setRetry((n) => n + 1);
        return;
      }
      const b = toBox(target.getBoundingClientRect());
      if (!sameBox(b, last)) { last = b; setBox(b); }
      raf = window.requestAnimationFrame(tick);
    };
    tick();
    return () => window.cancelAnimationFrame(raf);
  }, [target]);

  // ── Place the card ──────────────────────────────────────────────────────
  const place = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    const size = { width: card.offsetWidth, height: card.offsetHeight };
    const target = find === 'found' && box ? box : null;
    setPos(placePopover(target, size, readViewport(), find === 'found' ? step.placement : 'center'));
  }, [box, find, step.placement]);

  useLayoutEffect(() => { place(); }, [place, stepIndex]);
  useEffect(() => {
    const onResize = () => place();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    const ro = typeof ResizeObserver !== 'undefined' && cardRef.current ? new ResizeObserver(onResize) : null;
    if (ro && cardRef.current) ro.observe(cardRef.current);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
  }, [place]);

  // ── Practise steps: watch for the expected click ────────────────────────
  // Only matters on practise steps: a disabled button can't be pressed.
  const disabledTarget = !!step.action && !!target && isDisabled(target);
  useEffect(() => {
    if (paused || step.action?.type !== 'click') return;
    const sel = selectorFor(step.action.target);
    let fired = false;
    let timer = 0;
    const fire = () => { if (!fired) { fired = true; onAction(); } };
    const hit = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.(sel) as HTMLElement | null;
      return el && !isDisabled(el) ? el : null;
    };
    const onClick = (e: MouseEvent) => { if (hit(e)) fire(); };
    const onKey = (e: KeyboardEvent) => { if ((e.key === 'Enter' || e.key === ' ') && hit(e)) fire(); };
    // Menu triggers open on pointerdown and then block pointer events, so the
    // click may never arrive: count it once the menu reports itself open.
    const onPointerDown = (e: PointerEvent) => {
      const el = hit(e);
      if (!el || !el.hasAttribute('aria-haspopup')) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (el.getAttribute('aria-expanded') === 'true' || el.getAttribute('data-state') === 'open') fire();
      }, 200);
    };
    // Capture phase: the app's own handler may navigate or unmount the target.
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [step, paused, onAction]);

  // ── Accessibility: announce each step, move focus to the card ──────────
  useEffect(() => {
    if (paused) return;
    const title = tr(k('title'), step.title);
    setAnnounce(`${ui('stepOf', 'Step {n} of {total}').replace('{n}', String(stepIndex + 1)).replace('{total}', String(total))}: ${title}`);
    // Moving focus out of an open menu or dialog would close it.
    if (!modalLayerOpen()) headingRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, tutorial.id, paused]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onStop('exit'); }
    else if (e.key === 'ArrowRight' && !step.action) { e.preventDefault(); onNext(); }
    else if (e.key === 'ArrowLeft' && stepIndex > 0) { e.preventDefault(); onBack(); }
  };

  // Keep the app's open menus/dialogs from treating the card as "outside".
  const shield = {
    onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(),
    onMouseDown: (e: React.SyntheticEvent) => e.stopPropagation(),
    onTouchStart: (e: React.SyntheticEvent) => e.stopPropagation(),
    onFocus: (e: React.SyntheticEvent) => e.stopPropagation(),
    onBlur: (e: React.SyntheticEvent) => e.stopPropagation(),
  };

  // An app dialog opened while the tour runs hides everything else from
  // screen readers (aria-hidden on <body>'s other children), which would hide
  // the tour card too. Keep the tour readable.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reveal = () => {
      if (root.getAttribute('aria-hidden') === 'true') root.removeAttribute('aria-hidden');
    };
    reveal();
    const mo = new MutationObserver(reveal);
    mo.observe(root, { attributes: true, attributeFilter: ['aria-hidden'] });
    return () => mo.disconnect();
  }, [paused]);

  // ── Paused: a small chip instead of the card ────────────────────────────
  if (paused) {
    return createPortal(
      <div ref={rootRef} data-rk-tutorial="">
      <div
        {...shield}
        role="status"
        style={{ zIndex: Z + 2, pointerEvents: 'auto', top: 'calc(env(safe-area-inset-top, 0px) + 4.5rem)' }}
        className="fixed left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full border border-purple-200 bg-white px-3 py-2 shadow-lg text-sm max-w-[calc(100vw-2rem)]"
      >
        <span className="text-gray-700 truncate">{ui('paused', 'Tutorial paused')}</span>
        <button
          type="button"
          onClick={onResume}
          className="min-h-[36px] rounded-full bg-purple-600 px-3 font-semibold text-white hover:bg-purple-700"
        >
          <Play className="inline h-3.5 w-3.5 mr-1" />{ui('resume', 'Resume')}
        </button>
        <button
          type="button"
          onClick={() => onStop('exit')}
          aria-label={ui('exit', 'Exit tutorial')}
          className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      </div>,
      document.body,
    );
  }

  const title = tr(k('title'), step.title);
  const body = tr(k('body'), step.body);
  const instruction = step.instruction ? tr(k('instruction'), step.instruction) : null;
  const missing = find === 'missing';
  const searching = find === 'searching';
  const isPractise = !!step.action && !missing && !disabledTarget;
  const spot = find === 'found' && box ? box : null;
  const titleId = `rk-tour-title-${tutorial.id}`;
  const bodyId = `rk-tour-body-${tutorial.id}`;

  return createPortal(
    <div ref={rootRef} data-rk-tutorial="">
      {/* Dim layer + spotlight. Never takes clicks. */}
      <div aria-hidden="true" className="fixed inset-0" style={{ zIndex: Z, pointerEvents: 'none' }}>
        {spot ? (
          <div
            className="absolute rounded-xl ring-2 ring-purple-400 transition-all duration-200 motion-reduce:transition-none"
            style={{
              top: spot.top - SPOT_PAD,
              left: spot.left - SPOT_PAD,
              width: spot.width + SPOT_PAD * 2,
              height: spot.height + SPOT_PAD * 2,
              boxShadow: '0 0 0 9999px rgba(30, 16, 64, 0.45)',
            }}
          />
        ) : (
          <div className="absolute inset-0" style={{ background: searching ? 'transparent' : 'rgba(30, 16, 64, 0.35)' }} />
        )}
      </div>

      {/* Screen-reader announcement of the step. */}
      <div className="sr-only" aria-live="polite" role="status">{announce}</div>

      <div
        {...shield}
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={onKeyDown}
        className="fixed w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-purple-100 bg-white text-gray-900 shadow-2xl"
        style={{
          zIndex: Z + 1,
          pointerEvents: 'auto',
          top: pos?.top ?? -9999,
          left: pos?.left ?? -9999,
          visibility: pos && !searching ? 'visible' : 'hidden',
        }}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-purple-600">
            {ui('stepOf', 'Step {n} of {total}').replace('{n}', String(stepIndex + 1)).replace('{total}', String(total))}
          </p>
          <button
            type="button"
            onClick={() => onStop('exit')}
            aria-label={ui('exit', 'Exit tutorial')}
            title={ui('exitHint', 'Exit (you can resume later)')}
            className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mx-4 mt-1 h-1 overflow-hidden rounded-full bg-purple-100" aria-hidden="true">
          <div className="h-full rounded-full bg-purple-600 transition-all" style={{ width: `${((stepIndex + 1) / total) * 100}%` }} />
        </div>

        <div className="px-4 pt-3 pb-2">
          <h2 id={titleId} ref={headingRef} tabIndex={-1} className="font-serif text-lg font-bold leading-snug text-gray-900 outline-none">
            {title}
          </h2>
          <div id={bodyId}>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">{body}</p>
            {missing && (
              <p className="mt-2 flex gap-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                {step.missingText
                  ? tr(k('missing'), step.missingText)
                  : ui('missing', "This part of the screen isn't showing right now. You can open it with Show Me, or continue.")}
              </p>
            )}
            {!missing && disabledTarget && (
              <p className="mt-2 flex gap-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                {ui('disabled', "This isn't available on your account right now, so you can skip this part.")}
              </p>
            )}
            {instruction && !missing && !disabledTarget && (
              <p className="mt-2 flex gap-2 text-sm font-semibold text-purple-700">
                {isPractise && <Hand className="h-4 w-4 shrink-0 mt-0.5" />}
                {instruction}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-4 py-3">
          <button
            type="button"
            onClick={() => onStop('skip')}
            className="min-h-[44px] px-1 text-sm font-medium text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline"
          >
            {ui('skipTutorial', 'Skip tutorial')}
          </button>
          <div className="ml-auto flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={onBack}
                className="flex min-h-[44px] items-center rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />{ui('back', 'Back')}
              </button>
            )}
            {missing && step.go && (
              <button
                type="button"
                onClick={() => { onRetryNav(step); setRetry((n) => n + 1); }}
                className="flex min-h-[44px] items-center rounded-lg border border-purple-200 px-3 text-sm font-semibold text-purple-700 hover:bg-purple-50"
              >
                {ui('showMe', 'Show Me')}
              </button>
            )}
            {step.showMe && !missing && (
              <button
                type="button"
                onClick={() => onShowMe(step)}
                className="flex min-h-[44px] items-center rounded-lg border border-purple-200 px-3 text-sm font-semibold text-purple-700 hover:bg-purple-50"
              >
                {step.showMe.label ? tr(k('showMe'), step.showMe.label) : ui('showMe', 'Show Me')}
              </button>
            )}
            {isPractise ? (
              <button
                type="button"
                onClick={onNext}
                className="flex min-h-[44px] items-center rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {ui('skipStep', 'Skip this step')}
              </button>
            ) : (
              <button
                type="button"
                onClick={onNext}
                className="flex min-h-[44px] items-center rounded-lg bg-purple-600 px-4 text-sm font-semibold text-white hover:bg-purple-700"
              >
                {isLast
                  ? (<><Check className="h-4 w-4 mr-1" />{ui('done', 'Done')}</>)
                  : (<>{ui('next', 'Next')}<ArrowRight className="h-4 w-4 ml-1" /></>)}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
