import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Live Scripture card default spot (2026-11-21): bottom-center, just above
 * the captions box. Returns the `bottom` (px) that puts an overlay `gap` px
 * above the element in `ref` while `active` (captions on), re-measured as
 * that box grows and shrinks with its lines and on window resize. Returns
 * null while inactive, so the caller can fall back to the captions' own
 * spot. Uses the box's natural CSS bottom, not its dragged position, so a
 * dragged captions box doesn't drag the verse with it.
 */
export function useStackAbove(
  ref: RefObject<HTMLElement>,
  active: boolean,
  remeasureKey?: unknown,
  gap = 8,
): number | null {
  const [bottom, setBottom] = useState<number | null>(null);
  useEffect(() => {
    if (!active) { setBottom(null); return; }
    let ro: ResizeObserver | null = null;
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const base = parseFloat(window.getComputedStyle(el).bottom) || 0;
      setBottom(Math.round(base + el.offsetHeight + gap));
    };
    // The box mounts in the same commit as `active` flips; measure next frame.
    const raf = requestAnimationFrame(() => {
      measure();
      const el = ref.current;
      if (el && typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(measure);
        ro.observe(el);
      }
    });
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref, active, remeasureKey, gap]);
  return bottom;
}
