import { useCallback, useEffect, useRef } from 'react';

type HistoryState = { __viewHistoryId: string; view: string };

/**
 * Syncs a local view-switching useState with browser history so the Android
 * hardware back button (and browser back) steps through views correctly,
 * instead of exiting the app or popping an unrelated parent's history.
 *
 * @param id - unique string identifying this component instance (so multiple 
 *   independent history stacks don't collide, e.g. "devotional-library", 
 *   "prayer-series", "ministry-live-channel")
 * @param currentView - the current view value from your existing useState
 * @param setView - the existing setState setter
 * @param isActive - (optional) pass false to disable this hook's popstate 
 *   listener entirely, e.g. when a PARENT component (like MinistrySpace) 
 *   should own popstate instead — mirrors the ministryWorkspaceActive guard 
 *   pattern we used in AppLayout.tsx
 */
export function useViewHistory(
  id: string,
  currentView: string,
  setView: (v: string) => void,
  isActive: boolean = true
) {
  const mounted = useRef(false);

  const navigateView = useCallback((view: string) => {
    setView(view);
    if (!isActive) return;
    const currentState = (window.history.state && typeof window.history.state === 'object') ? window.history.state : {};
    window.history.pushState({ ...currentState, __viewHistoryId: id, view }, '');
  }, [id, isActive, setView]);

  useEffect(() => {
    if (!isActive) return;
    if (!mounted.current) {
      const currentState = (window.history.state && typeof window.history.state === 'object') ? window.history.state : {};
      window.history.replaceState({ ...currentState, __viewHistoryId: id, view: currentView }, '');
      mounted.current = true;
    }
  }, [id, currentView, isActive]);

  useEffect(() => {
    if (!isActive) return;
    const onPopState = (e: PopStateEvent) => {
      const state = e.state as HistoryState | null;
      if (state?.__viewHistoryId === id && state.view) {
        setView(state.view);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [id, isActive, setView]);

  return { navigateView };
}
