import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Syncs a component-local "which view is showing" useState with the browser
 * history, so browser Back/Forward step through in-app view changes one at a time
 * instead of skipping them (or exiting the site).
 *
 * How it works
 * - Each view change (via `navigateView`) pushes ONE history entry.
 * - The view is stored in `history.state` under a per-component key (`vh:<id>`),
 *   MERGED with whatever is already there — so nested components (a viewer inside
 *   MinistrySpace inside AppLayout) each keep their own key and compose without
 *   clobbering each other's entries.
 * - On `popstate` (Back/Forward) the view is restored from the entry's state; if
 *   this component's key is absent from the entry we popped to, it falls back to
 *   `initialView` (i.e. we've stepped back past where this view was opened).
 * - On mount the initial view is READ BACK from `history.state` too, so a component
 *   that remounts (e.g. its parent tab was restored by Back) reappears on the view
 *   the user was actually on, not the default.
 *
 * `id` MUST be unique per mounted component instance that uses the hook, so keys
 * don't collide (e.g. 'devotional-library', 'prayer-series-viewer').
 *
 * Companion state (e.g. `selectedSeries`) stays as ordinary useState — keep it in
 * sync alongside `navigateView`; only the discrete "view" needs history.
 */
export function useViewHistory<T extends string>(
  id: string,
  initialView: T,
): [T, (next: T, opts?: { replace?: boolean }) => void] {
  const key = `vh:${id}`;

  const readFromHistory = (): T | undefined => {
    if (typeof window === 'undefined') return undefined;
    const s = window.history.state;
    if (s && typeof s === 'object' && key in (s as Record<string, unknown>)) {
      return (s as Record<string, unknown>)[key] as T;
    }
    return undefined;
  };

  const [view, setViewState] = useState<T>(() => readFromHistory() ?? initialView);

  // Refs so the popstate/navigate callbacks always see current values without
  // re-subscribing (and so navigateView is stable).
  const viewRef = useRef(view);
  viewRef.current = view;
  const initialRef = useRef(initialView);
  initialRef.current = initialView;

  const navigateView = useCallback(
    (next: T, opts?: { replace?: boolean }) => {
      if (next === viewRef.current) return;
      setViewState(next);
      if (typeof window === 'undefined') return;
      const cur = window.history.state;
      const base = cur && typeof cur === 'object' ? { ...(cur as Record<string, unknown>) } : {};
      const merged = { ...base, [key]: next };
      // Preserve the current URL — this is an in-page view change, not a route change.
      const url = window.location.href;
      if (opts?.replace) window.history.replaceState(merged, '', url);
      else window.history.pushState(merged, '', url);
    },
    [key],
  );

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const s = e.state;
      const restored =
        s && typeof s === 'object' && key in (s as Record<string, unknown>)
          ? ((s as Record<string, unknown>)[key] as T)
          : initialRef.current;
      if (restored !== viewRef.current) setViewState(restored);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [key]);

  return [view, navigateView];
}

export default useViewHistory;
