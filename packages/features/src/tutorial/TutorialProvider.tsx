// TutorialProvider: the state machine behind guided tours. It knows which
// tutorial is running and on which step, saves progress (see progress.tsx),
// and renders the overlay. Apps drive it with their own definitions and tell
// it which page is showing and how to open a screen.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  TutorialAvailability, TutorialDefinition, TutorialNav, TutorialProgressState, TutorialStatus,
  TutorialStep, TutorialTranslate, WelcomeStatus,
} from './types';
import {
  emptyProgress, fetchRemoteProgress, loadLocalProgress, mergeProgress, pushRemoteProgress,
  sameProgress, saveLocalProgress,
} from './progress';
import { TutorialOverlay } from './TutorialOverlay';

const SYNC_DELAY_MS = 1500;
/** How long a navigation the engine (or a practise step) started may take to land. */
const NAV_PENDING_MS = 3000;
/** "Remind me later" brings the welcome back after this long, at most this often. */
const REMIND_LATER_MS = 24 * 60 * 60 * 1000;
export const MAX_REMIND_LATER = 3;

export interface ActiveTutorial {
  tutorial: TutorialDefinition;
  stepIndex: number;
  paused: boolean;
}

export interface TutorialContextValue {
  /** Tutorials this user can see (hidden ones filtered out). */
  tutorials: TutorialDefinition[];
  availabilityOf: (t: TutorialDefinition) => TutorialAvailability;
  statusOf: (id: string) => TutorialStatus;
  savedStepOf: (id: string) => number;
  progress: TutorialProgressState;
  /** True once the server copy has been merged in (or couldn't be read). */
  ready: boolean;
  active: ActiveTutorial | null;
  start: (id: string, opts?: { restart?: boolean }) => void;
  next: () => void;
  back: () => void;
  /** Leave the tutorial. 'skip' marks it skipped; 'exit' keeps it resumable. */
  stop: (how: 'skip' | 'exit') => void;
  resume: () => void;
  setWelcome: (status: WelcomeStatus) => void;
  /** Whether the welcome screen should be offered now. */
  welcomeDue: boolean;
  tutorialForPage: (page: string) => TutorialDefinition | undefined;
  libraryOpen: boolean;
  setLibraryOpen: (open: boolean) => void;
  tr: TutorialTranslate;
  currentPage: string;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

export function useTutorials(): TutorialContextValue {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error('useTutorials must be used inside <TutorialProvider>');
  return ctx;
}

/** Same as useTutorials but returns null outside a provider (optional UI). */
export function useTutorialsOptional(): TutorialContextValue | null {
  return useContext(TutorialContext);
}

interface TutorialProviderProps {
  userId: string | null | undefined;
  tutorials: TutorialDefinition[];
  /** The page the app is showing now (e.g. AppLayout's activeTab). */
  currentPage: string;
  navigate: (nav: TutorialNav) => void;
  availability?: (t: TutorialDefinition) => TutorialAvailability;
  translate?: TutorialTranslate;
  /** Hide the overlay (e.g. while a full-screen workspace is open). */
  suspended?: boolean;
  /** The tutorial the welcome screen starts; completing it completes the welcome. */
  introTutorialId?: string;
  children: React.ReactNode;
}

const identity: TutorialTranslate = (_key, fallback) => fallback;
const now = () => new Date().toISOString();

export const TutorialProvider: React.FC<TutorialProviderProps> = ({
  userId, tutorials: allTutorials, currentPage, navigate, availability, translate = identity,
  suspended = false, introTutorialId, children,
}) => {
  const [progress, setProgress] = useState<TutorialProgressState>(emptyProgress);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<ActiveTutorial | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const progressRef = useRef(progress);
  progressRef.current = progress;
  const syncTimer = useRef<number | null>(null);
  /** A navigation in flight: the page it should land on (undefined = whatever
   *  the next step expects, after a practise click). */
  const pendingNav = useRef<{ page?: string; at: number } | null>(null);
  const prevPage = useRef(currentPage);
  const [recheck, setRecheck] = useState(0);
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const activeRef = useRef(active);
  activeRef.current = active;

  // ── Load: device copy immediately, then merge the server copy ──────────
  useEffect(() => {
    setActive(null);
    setReady(false);
    if (!userId) {
      setProgress(emptyProgress());
      return;
    }
    const local = loadLocalProgress(userId);
    setProgress(local);
    let cancelled = false;
    // Don't hold the welcome screen hostage to a slow network.
    const giveUp = window.setTimeout(() => { if (!cancelled) setReady(true); }, 4000);
    fetchRemoteProgress(userId).then((remote) => {
      if (cancelled) return;
      window.clearTimeout(giveUp);
      if (remote) {
        const merged = mergeProgress(progressRef.current, remote);
        setProgress(merged);
        saveLocalProgress(userId, merged);
        if (!sameProgress(merged, remote)) void pushRemoteProgress(userId, merged);
      }
      setReady(true);
    });
    return () => { cancelled = true; window.clearTimeout(giveUp); };
  }, [userId]);

  // ── Save: device now, server debounced ─────────────────────────────────
  const update = useCallback((fn: (p: TutorialProgressState) => TutorialProgressState) => {
    const next = fn(progressRef.current);
    progressRef.current = next;
    setProgress(next);
    if (!userId) return;
    saveLocalProgress(userId, next);
    if (syncTimer.current) window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => {
      syncTimer.current = null;
      void pushRemoteProgress(userId, progressRef.current);
    }, SYNC_DELAY_MS);
  }, [userId]);

  // Flush a pending save when the user leaves the page.
  useEffect(() => {
    const flush = () => {
      if (syncTimer.current && userId) {
        window.clearTimeout(syncTimer.current);
        syncTimer.current = null;
        void pushRemoteProgress(userId, progressRef.current);
      }
    };
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, [userId]);

  const availabilityOf = useCallback(
    (t: TutorialDefinition): TutorialAvailability => (availability ? availability(t) : 'available'),
    [availability],
  );
  const tutorials = useMemo(
    () => allTutorials.filter((t) => availabilityOf(t) !== 'hidden'),
    [allTutorials, availabilityOf],
  );
  const byId = useCallback((id: string) => tutorials.find((t) => t.id === id), [tutorials]);

  const statusOf = useCallback(
    (id: string): TutorialStatus => progress.tutorials[id]?.status ?? 'not_started',
    [progress],
  );
  const savedStepOf = useCallback((id: string) => progress.tutorials[id]?.step ?? 0, [progress]);

  const record = useCallback((id: string, status: 'in_progress' | 'completed' | 'skipped', step: number) => {
    update((p) => ({
      ...p,
      tutorials: {
        ...p.tutorials,
        [id]: {
          status,
          step,
          updatedAt: now(),
          ...(status === 'completed' ? { completedAt: now() } : p.tutorials[id]?.completedAt ? { completedAt: p.tutorials[id].completedAt } : {}),
        },
      },
    }));
  }, [update]);

  const setWelcome = useCallback((status: WelcomeStatus) => {
    update((p) => {
      const laterCount = (p.welcome?.laterCount ?? 0) + (status === 'later' ? 1 : 0);
      return {
        ...p,
        welcome: {
          status,
          laterCount,
          ...(status === 'later' ? { remindAt: new Date(Date.now() + REMIND_LATER_MS).toISOString() } : {}),
          updatedAt: now(),
        },
      };
    });
  }, [update]);

  // ── Navigation for a step ──────────────────────────────────────────────
  // The app's navigate must be idempotent: it is called even when the screen
  // is already showing, so sub-views (a settings section, a live tab) open too.
  const goTo = useCallback((step: TutorialStep | undefined) => {
    if (!step?.go) return;
    pendingNav.current = { page: step.page, at: Date.now() };
    try { navigateRef.current(step.go); } catch (e) { console.warn('[tutorial] navigate failed', e); }
  }, []);
  const showStep = useCallback((tutorial: TutorialDefinition, stepIndex: number) => {
    setActive({ tutorial, stepIndex, paused: false });
    record(tutorial.id, 'in_progress', stepIndex);
    goTo(tutorial.steps[stepIndex]);
  }, [record, goTo]);

  const start = useCallback((id: string, opts?: { restart?: boolean }) => {
    const tutorial = byId(id);
    if (!tutorial || tutorial.steps.length === 0) return;
    setLibraryOpen(false);
    const saved = progressRef.current.tutorials[id];
    const resumeAt = !opts?.restart && saved?.status === 'in_progress'
      ? Math.min(saved.step, tutorial.steps.length - 1)
      : 0;
    showStep(tutorial, resumeAt);
  }, [byId, showStep]);

  const finish = useCallback((tutorial: TutorialDefinition) => {
    record(tutorial.id, 'completed', tutorial.steps.length - 1);
    if (tutorial.id === introTutorialId) setWelcome('completed');
    setActive(null);
  }, [record, introTutorialId, setWelcome]);

  const next = useCallback(() => {
    const cur = activeRef.current;
    if (!cur) return;
    const nextIndex = cur.stepIndex + 1;
    if (nextIndex >= cur.tutorial.steps.length) finish(cur.tutorial);
    else showStep(cur.tutorial, nextIndex);
  }, [finish, showStep]);

  const back = useCallback(() => {
    const cur = activeRef.current;
    if (!cur || cur.stepIndex === 0) return;
    // Going back always reopens the earlier step's screen.
    const prev = cur.tutorial.steps[cur.stepIndex - 1];
    setActive({ tutorial: cur.tutorial, stepIndex: cur.stepIndex - 1, paused: false });
    record(cur.tutorial.id, 'in_progress', cur.stepIndex - 1);
    goTo(prev);
  }, [record, goTo]);

  const stop = useCallback((how: 'skip' | 'exit') => {
    const cur = activeRef.current;
    if (!cur) return;
    record(cur.tutorial.id, how === 'skip' ? 'skipped' : 'in_progress', cur.stepIndex);
    if (cur.tutorial.id === introTutorialId && !progressRef.current.welcome) setWelcome('dismissed');
    setActive(null);
  }, [record, introTutorialId, setWelcome]);

  const resume = useCallback(() => {
    const cur = activeRef.current;
    if (!cur) return;
    setActive({ ...cur, paused: false });
    goTo(cur.tutorial.steps[cur.stepIndex]);
  }, [goTo]);

  /** Called by the overlay when a practise step's action happened. */
  const onAction = useCallback(() => {
    pendingNav.current = { at: Date.now() };
    next();
  }, [next]);

  // ── Page changes: practise steps advance; wandering off pauses ─────────
  useEffect(() => {
    const pageChanged = prevPage.current !== currentPage;
    prevPage.current = currentPage;
    const cur = activeRef.current;
    if (!cur || cur.paused) return;
    const step = cur.tutorial.steps[cur.stepIndex];
    if (step.action?.type === 'page' && step.action.page === currentPage) {
      onAction();
      return;
    }
    if (!step.page || step.page === currentPage) { pendingNav.current = null; return; }
    const pending = pendingNav.current;
    const inFlight = !!pending && Date.now() - pending.at < NAV_PENDING_MS;
    // Landed somewhere the tour didn't send the user: they wandered off.
    const wandered = pageChanged && !(inFlight && (pending!.page === undefined || pending!.page === currentPage));
    if (!wandered && inFlight) {
      const id = window.setTimeout(() => setRecheck((n) => n + 1), NAV_PENDING_MS);
      return () => window.clearTimeout(id);
    }
    pendingNav.current = null;
    setActive({ ...cur, paused: true });
  }, [currentPage, active?.tutorial.id, active?.stepIndex, active?.paused, recheck, onAction]);

  const tutorialForPage = useCallback(
    (page: string) => tutorials.find((t) => t.id !== introTutorialId && t.pages?.includes(page))
      ?? tutorials.find((t) => t.pages?.includes(page)),
    [tutorials, introTutorialId],
  );

  const welcomeDue = useMemo(() => {
    if (!ready || !userId || active) return false;
    const w = progress.welcome;
    if (!w) return true;
    if (w.status !== 'later') return false;
    if ((w.laterCount ?? 0) >= MAX_REMIND_LATER) return false;
    return !w.remindAt || Date.parse(w.remindAt) <= Date.now();
  }, [ready, userId, active, progress.welcome]);

  const value = useMemo<TutorialContextValue>(() => ({
    tutorials, availabilityOf, statusOf, savedStepOf, progress, ready, active,
    start, next, back, stop, resume, setWelcome, welcomeDue, tutorialForPage,
    libraryOpen, setLibraryOpen, tr: translate, currentPage,
  }), [tutorials, availabilityOf, statusOf, savedStepOf, progress, ready, active, start, next, back,
    stop, resume, setWelcome, welcomeDue, tutorialForPage, libraryOpen, translate, currentPage]);

  return (
    <TutorialContext.Provider value={value}>
      {children}
      {active && !suspended && (
        <TutorialOverlay
          tutorial={active.tutorial}
          stepIndex={active.stepIndex}
          paused={active.paused}
          tr={translate}
          onNext={next}
          onBack={back}
          onStop={stop}
          onResume={resume}
          onAction={onAction}
          onShowMe={(step) => {
            const s = step.showMe;
            if (!s) return;
            if (s.tutorial) { start(s.tutorial); return; }
            if (s.nav) { pendingNav.current = { at: Date.now() }; navigateRef.current(s.nav); }
          }}
          onRetryNav={(step) => goTo(step)}
        />
      )}
    </TutorialContext.Provider>
  );
};
