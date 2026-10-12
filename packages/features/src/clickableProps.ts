import type { KeyboardEvent } from 'react';

/**
 * Props that make a non-button element (a clickable Card or div) reachable
 * and operable from the keyboard / screen readers: role="button",
 * tabIndex 0, and Enter/Space activation. Spread next to the element's
 * existing onClick so the mouse behaviour stays unchanged:
 *
 *   <Card onClick={open} {...clickableProps(open)}>
 *
 * Key presses that originate inside a nested control (a share button in
 * the card, for instance) are ignored so that control keeps its own
 * behaviour.
 */
export function clickableProps(onActivate: () => void, disabled = false) {
  return {
    role: 'button' as const,
    tabIndex: disabled ? -1 : 0,
    'aria-disabled': disabled || undefined,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (disabled || e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
