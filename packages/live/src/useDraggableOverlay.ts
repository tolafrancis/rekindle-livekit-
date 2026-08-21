import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react';

export interface UseDraggableOverlayOptions {
  /**
   * Changing this value snaps the overlay back to its default (0,0) drag
   * offset. Callers should pass something that changes exactly on a fresh
   * "off" → non-off toggle (e.g. `captionMode`) so every time captions turn
   * on, they start at the default position again — no cross-session
   * persistence, deliberately (see the plan this implements).
   */
  resetKey?: unknown;
  /** Minimum px kept on-screen on every edge when clamping. Default 8. */
  margin?: number;
  /**
   * A `transform` value applied before the drag offset — e.g.
   * `'translateX(-50%)'` for an overlay whose default position is
   * horizontally centered via `left: 50%`. Translations commute, so this
   * composes safely with the drag offset regardless of order. Default ''.
   */
  baseTransform?: string;
}

export interface UseDraggableOverlayResult {
  /** Attach to the element being dragged — its own rect drives clamping, so
   *  this must land on the actual positioned/transformed element, not a
   *  wrapper around it. */
  ref: RefObject<HTMLDivElement>;
  /** transform (base + drag offset) and touchAction — spread into the same
   *  element's `style`. */
  style: CSSProperties;
  /** true while a drag is in progress — for cursor/affordance styling only. */
  isDragging: boolean;
  /** Spread onto the drag surface (the card body, not e.g. a close button
   *  inside it — pointer capture doesn't intercept that child's own click). */
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

const clampValue = (value: number, a: number, b: number): number => {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return Math.min(Math.max(value, lo), hi);
};

/**
 * Shared drag behavior for the Live Translate caption overlay
 * (FloatingTranslationButton.tsx + BroadcastTranslationButton.tsx),
 * 2026-08-22. Adapted from MinistryInteractiveMeetings.tsx's stage-panel
 * drag (proven Pointer Events pattern — mouse/touch/pen unified, already
 * mobile-safe via setPointerCapture + touchAction:'none') plus two things
 * that corner-anchored panel never needed but a screen-spanning caption
 * overlay does:
 *   - viewport clamping, so dragging can never leave the overlay partially
 *     or fully inaccessible off-screen;
 *   - a resize/orientation listener, so a position that was fine before a
 *     desktop window resize or a mobile rotation gets re-clamped rather
 *     than left stranded outside the new viewport.
 */
export function useDraggableOverlay({
  resetKey,
  margin = 8,
  baseTransform = '',
}: UseDraggableOverlayOptions = {}): UseDraggableOverlayResult {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  // getBoundingClientRect always reflects whatever offset was *last applied*
  // — clamp() needs the CURRENT offset (not a stale closure over it) to back
  // out the element's untransformed ("natural") position on every call.
  const posRef = useRef(pos);
  posRef.current = pos;
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const clamp = useCallback((x: number, y: number) => {
    const el = ref.current;
    if (!el) return { x, y };
    const rect = el.getBoundingClientRect();
    const naturalLeft = rect.left - posRef.current.x;
    const naturalTop = rect.top - posRef.current.y;
    const minX = margin - naturalLeft;
    const maxX = window.innerWidth - margin - naturalLeft - rect.width;
    const minY = margin - naturalTop;
    const maxY = window.innerHeight - margin - naturalTop - rect.height;
    // clampValue sorts its own bounds, so an overlay wider/taller than the
    // viewport (minus margins) collapses to a single valid point instead of
    // producing an inverted, unsatisfiable range.
    return { x: clampValue(x, minX, maxX), y: clampValue(y, minY, maxY) };
  }, [margin]);

  useEffect(() => {
    setPos({ x: 0, y: 0 });
  }, [resetKey]);

  useEffect(() => {
    const reclamp = () => setPos((prev) => clamp(prev.x, prev.y));
    window.addEventListener('resize', reclamp);
    window.addEventListener('orientationchange', reclamp);
    return () => {
      window.removeEventListener('resize', reclamp);
      window.removeEventListener('orientationchange', reclamp);
    };
  }, [clamp]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    dragStart.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: posRef.current.x,
      originY: posRef.current.y,
    };
    setIsDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    const { startX, startY, originX, originY } = dragStart.current;
    setPos(clamp(originX + (e.clientX - startX), originY + (e.clientY - startY)));
  }, [clamp]);

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    dragStart.current = null;
    setIsDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }, []);

  const style: CSSProperties = {
    transform: [baseTransform, `translate(${pos.x}px, ${pos.y}px)`].filter(Boolean).join(' '),
    touchAction: 'none',
  };

  return { ref, style, isDragging, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
}
