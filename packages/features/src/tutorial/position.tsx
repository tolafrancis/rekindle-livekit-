// Popover placement for the tutorial overlay. Pure functions: given the
// highlighted element's box, the popover's size and the viewport, pick a side
// that doesn't cover the target and keep the card fully on screen.
import type { TutorialPlacement } from './types';

export interface Box { top: number; left: number; width: number; height: number }
export interface Size { width: number; height: number }
export interface Viewport { width: number; height: number; insetTop: number; insetBottom: number }

export type ResolvedSide = 'top' | 'bottom' | 'left' | 'right' | 'center' | 'dock-top' | 'dock-bottom';

export interface PopoverPosition { top: number; left: number; side: ResolvedSide }

const GAP = 12; // between target and card
const MARGIN = 12; // from the viewport edge

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, Math.max(min, max)));

/** Space on each side of the target that the card could use. */
function room(target: Box, vp: Viewport) {
  return {
    top: target.top - vp.insetTop - GAP - MARGIN,
    bottom: vp.height - vp.insetBottom - (target.top + target.height) - GAP - MARGIN,
    left: target.left - GAP - MARGIN,
    right: vp.width - (target.left + target.width) - GAP - MARGIN,
  };
}

export function placePopover(
  target: Box | null,
  card: Size,
  vp: Viewport,
  preferred: TutorialPlacement = 'auto',
): PopoverPosition {
  const minTop = vp.insetTop + MARGIN;
  const maxTop = vp.height - vp.insetBottom - card.height - MARGIN;
  const maxLeft = vp.width - card.width - MARGIN;

  const centred = (): PopoverPosition => ({
    side: 'center',
    top: clamp((vp.height - card.height) / 2, minTop, maxTop),
    left: clamp((vp.width - card.width) / 2, MARGIN, maxLeft),
  });

  if (!target || preferred === 'center') return centred();

  // Dock to the screen edge farthest from the target. Used when asked for, and
  // as the fallback when no side has room (small phones, very large targets).
  const dock = (): PopoverPosition => {
    const targetMid = target.top + target.height / 2;
    const toTop = targetMid > vp.height / 2;
    return {
      side: toTop ? 'dock-top' : 'dock-bottom',
      top: toTop ? minTop : clamp(maxTop, minTop, maxTop),
      left: clamp((vp.width - card.width) / 2, MARGIN, maxLeft),
    };
  };
  if (preferred === 'dock') return dock();

  // A target bigger than most of the screen (a whole page) can't have a card
  // above or below it. A tall but narrow one (a side menu) can still have it
  // beside it; anything else docks instead of covering half the target.
  const tall = target.height > vp.height * 0.6;
  if (tall && target.width > vp.width * 0.6) return dock();

  const r = room(target, vp);
  const fits = {
    bottom: !tall && r.bottom >= card.height,
    top: !tall && r.top >= card.height,
    right: r.right >= card.width,
    left: r.left >= card.width,
  };
  const order: Array<'bottom' | 'top' | 'right' | 'left'> =
    preferred !== 'auto'
      ? [preferred, 'bottom', 'top', 'right', 'left']
      : ['bottom', 'top', 'right', 'left'];
  const side = order.find((s) => fits[s]);
  if (!side) return dock();

  const midX = target.left + target.width / 2 - card.width / 2;
  const midY = target.top + target.height / 2 - card.height / 2;
  switch (side) {
    case 'bottom':
      return { side, top: target.top + target.height + GAP, left: clamp(midX, MARGIN, maxLeft) };
    case 'top':
      return { side, top: target.top - GAP - card.height, left: clamp(midX, MARGIN, maxLeft) };
    case 'right':
      return { side, top: clamp(midY, minTop, maxTop), left: target.left + target.width + GAP };
    case 'left':
      return { side, top: clamp(midY, minTop, maxTop), left: target.left - GAP - card.width };
  }
}

/** True when the box is fully inside the usable part of the viewport. */
export function isInView(target: Box, vp: Viewport): boolean {
  return (
    target.top >= vp.insetTop &&
    target.top + target.height <= vp.height - vp.insetBottom &&
    target.left >= 0 &&
    target.left + target.width <= vp.width
  );
}
