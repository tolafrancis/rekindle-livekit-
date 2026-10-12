// Wires the shared tutorial engine into a ministry's space: which tours this
// member can take (only for screens their ministry shows them), the Help (?)
// button in the ministry header, and the "Take the tour" card on its home.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpCircle, PlayCircle, MapPin, Library, ScrollText, Compass, ChevronRight } from 'lucide-react';
import { Button } from '@rekindle/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@rekindle/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@rekindle/ui/dialog';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { TutorialProvider, useTutorials } from '@rekindle/features/tutorial/TutorialProvider';
import { TutorialLibrary } from '@rekindle/features/tutorial/TutorialLibrary';
import type { TutorialDefinition, TutorialNav } from '@rekindle/features/tutorial/types';
import {
  MINISTRY_INTRO_TUTORIAL_ID, MINISTRY_TOUR_GROUP, MINISTRY_TUTORIALS, MINISTRY_TUTORIAL_CATEGORIES,
} from './ministryTourDefinitions';

/** The ministry nav as this member sees it (MinistrySpace GROUPS). */
export interface MinistryTourGroup {
  id: string;
  children?: Array<{ id: string }>;
}

interface ProviderProps {
  userId: string | null | undefined;
  currentPage: string;
  navigate: (nav: TutorialNav) => void;
  suspended: boolean;
  groups: MinistryTourGroup[];
  children: React.ReactNode;
}

const stepChild = (nav: TutorialNav | undefined) =>
  nav?.kind === 'ministry' && typeof nav.child === 'string' ? { group: String(nav.group), child: nav.child } : null;

export const MinistryTutorialProvider: React.FC<ProviderProps> = ({
  userId, currentPage, navigate, suspended, groups, children,
}) => {
  const { t } = useLanguage();
  const translate = useCallback((key: string, fallback: string) => t('tutorials', key, fallback), [t]);

  // Only tours, and steps, for screens this member can open: a group the
  // ministry switched off, or a screen their role or plan doesn't show, is
  // left out rather than pointed at.
  const groupKey = groups.map((g) => `${g.id}:${(g.children ?? []).map((c) => c.id).join('|')}`).join(',');
  const tutorials = useMemo<TutorialDefinition[]>(() => {
    const hasScreen = (group: string, child: string) =>
      !!groups.find((g) => g.id === group)?.children?.some((c) => c.id === child);
    return MINISTRY_TUTORIALS.flatMap((tour) => {
      const group = MINISTRY_TOUR_GROUP[tour.id];
      if (group && !groups.some((g) => g.id === group)) return [];
      const steps = tour.steps.filter((step) => {
        const target = stepChild(step.go);
        return !target || hasScreen(target.group, target.child);
      });
      // A tour left with only its "find it in the menu" step has nothing to show.
      if (group && steps.length < 2) return [];
      return [{ ...tour, steps }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey]);

  // No introTutorialId: the Rekindle welcome screen belongs to the app shell,
  // and finishing this tour must not mark it answered.
  return (
    <TutorialProvider
      userId={userId}
      tutorials={tutorials}
      currentPage={currentPage}
      navigate={navigate}
      translate={translate}
      suspended={suspended}
    >
      {children}
      <TutorialLibrary categories={MINISTRY_TUTORIAL_CATEGORIES} />
    </TutorialProvider>
  );
};

/** The Help (?) button in the ministry header. */
export const MinistryHelpMenu: React.FC<{ className?: string }> = ({ className }) => {
  const { start, tutorialForPage, currentPage, setLibraryOpen, tr } = useTutorials();
  const navigate = useNavigate();
  const h = (key: string, fallback: string) => tr(`ministryHelp.${key}`, fallback);
  const pageTutorial = tutorialForPage(currentPage);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-tour="ministry-help"
          aria-label={h('button', 'Help')}
          title={h('button', 'Help')}
          className={className}
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{h('title', 'Help')}</DropdownMenuLabel>
        <DropdownMenuItem className="gap-2 py-2.5" onClick={() => start(MINISTRY_INTRO_TUTORIAL_ID, { restart: true })}>
          <PlayCircle className="h-4 w-4 text-purple-600" />{h('tour', 'Take the ministry tour')}
        </DropdownMenuItem>
        {pageTutorial && pageTutorial.id !== MINISTRY_INTRO_TUTORIAL_ID && (
          <DropdownMenuItem className="gap-2 py-2.5" onClick={() => start(pageTutorial.id, { restart: true })}>
            <MapPin className="h-4 w-4 text-purple-600" />
            <span className="min-w-0">
              {h('thisPage', 'Learn About This Page')}
              <span className="block truncate text-xs text-gray-500">{tr(`${pageTutorial.id}.title`, pageTutorial.title)}</span>
            </span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="gap-2 py-2.5" onClick={() => setLibraryOpen(true)}>
          <Library className="h-4 w-4 text-purple-600" />{h('browse', 'Browse Tutorials')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2 py-2.5" onClick={() => navigate('/guide')}>
          <ScrollText className="h-4 w-4 text-gray-500" />{h('guide', 'The Rekindle Guide')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// The tour also offers itself in a pop-up on the ministry home: on the first
// visit, then again on later days, up to MAX_TOUR_PROMPTS times in all, until
// the member starts it or says not to. Counted per member on this device.
const MAX_TOUR_PROMPTS = 4;
const TOUR_PROMPT_GAP_MS = 20 * 60 * 60 * 1000;

interface TourPromptState { shown: number; lastAt: number; never?: boolean }

const promptKey = (userId: string) => `rk:ministry-tour-prompt:${userId}`;

function readPrompt(userId: string): TourPromptState {
  try {
    const raw = localStorage.getItem(promptKey(userId));
    if (raw) return { shown: 0, lastAt: 0, ...JSON.parse(raw) };
  } catch { /* storage blocked */ }
  return { shown: 0, lastAt: 0 };
}

function writePrompt(userId: string, state: TourPromptState) {
  try { localStorage.setItem(promptKey(userId), JSON.stringify(state)); } catch { /* storage blocked */ }
}

/** "Take the tour" on the ministry home, until the member finishes or skips it. */
export const MinistryTourCard: React.FC<{ userId?: string | null; suspended?: boolean }> = ({ userId, suspended }) => {
  const { start, statusOf, ready, active, tr } = useTutorials();
  const status = statusOf(MINISTRY_INTRO_TUTORIAL_ID);
  const done = status === 'completed' || status === 'skipped';
  const [promptOpen, setPromptOpen] = useState(false);

  useEffect(() => {
    if (!ready || !userId || suspended || done || active || status === 'in_progress') return;
    const state = readPrompt(userId);
    if (state.never || state.shown >= MAX_TOUR_PROMPTS) return;
    if (state.lastAt && Date.now() - state.lastAt < TOUR_PROMPT_GAP_MS) return;
    // Let the home screen settle first so the tour has real elements to show.
    const id = window.setTimeout(() => {
      writePrompt(userId, { ...state, shown: state.shown + 1, lastAt: Date.now() });
      setPromptOpen(true);
    }, 800);
    return () => window.clearTimeout(id);
  }, [ready, userId, suspended, done, active, status]);

  if (!ready || done) return null;
  const resuming = status === 'in_progress';
  const p = (key: string, fallback: string) => tr(`ministryHelp.prompt.${key}`, fallback);

  const startFromPrompt = () => {
    setPromptOpen(false);
    start(MINISTRY_INTRO_TUTORIAL_ID, { restart: true });
  };
  const never = () => {
    setPromptOpen(false);
    if (userId) writePrompt(userId, { ...readPrompt(userId), never: true });
  };

  return (
    <>
    <Dialog open={promptOpen} onOpenChange={setPromptOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-purple-800">
            <Compass className="h-5 w-5" />{p('title', 'Take a quick tour of your ministry?')}
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-600">
            {p('body', 'We will highlight parts of the real screen and explain them one at a time: the menu, the Word, prayer, community and more. About two minutes, and you can stop whenever you like.')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button onClick={startFromPrompt} className="min-h-[44px] w-full bg-purple-600 hover:bg-purple-700">
            {p('start', 'Start the Tour')}
          </Button>
          <Button variant="outline" onClick={() => setPromptOpen(false)} className="min-h-[44px] w-full">
            {p('later', 'Not Now')}
          </Button>
          <Button variant="ghost" onClick={never} className="min-h-[44px] w-full text-gray-600">
            {p('never', "Don't Show This Again")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <button
      type="button"
      data-tour="ministry-tour-card"
      onClick={() => start(MINISTRY_INTRO_TUTORIAL_ID, resuming ? undefined : { restart: true })}
      className="flex w-full items-center gap-3 rounded-2xl border border-purple-200 bg-purple-50 p-4 text-left shadow-sm transition-shadow hover:shadow-md"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white">
        <Compass className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-900">
          {resuming ? tr('ministryHelp.resumeTour', 'Resume the tour') : tr('ministryHelp.cardTitle', 'New here? Take a quick tour')}
        </span>
        <span className="block text-xs text-gray-600">
          {tr('ministryHelp.cardDesc', 'Two minutes, on the real screens. Skip any time; it stays under Help (?).')}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
    </button>
    </>
  );
};
