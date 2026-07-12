// useSwipe.ts — reusable touch swipe hook
// Usage:
//   const swipeHandlers = useSwipe({ onSwipeLeft: goNext, onSwipeRight: goPrev });
//   <div {...swipeHandlers}>...</div>

import { useRef, useCallback } from 'react';

interface UseSwipeOptions {
  onSwipeLeft?:  () => void; // swipe left  → next
  onSwipeRight?: () => void; // swipe right → prev
  onSwipeUp?:    () => void;
  onSwipeDown?:  () => void;
  threshold?:    number;     // min px to count as swipe (default 50)
  disabled?:     boolean;
}

export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  threshold = 50,
  disabled  = false,
}: UseSwipeOptions) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }, [disabled]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (disabled || !touchStart.current) return;

    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;

    // Only trigger if horizontal movement dominates
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) >= threshold) {
      if (dx < 0) onSwipeLeft?.();
      else        onSwipeRight?.();
    } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) >= threshold) {
      if (dy < 0) onSwipeUp?.();
      else        onSwipeDown?.();
    }
  }, [disabled, threshold, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown]);

  return { onTouchStart, onTouchEnd };
}
