// Wires the shared tutorial engine into a ministry's space: which tours this
// member can take (only for screens their ministry shows them), the Help (?)
// button in the ministry header, and the "Take the tour" card on its home.
import React, { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpCircle, PlayCircle, MapPin, Library, ScrollText, Compass, ChevronRight } from 'lucide-react';
import { Button } from '@rekindle/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@rekindle/ui/dropdown-menu';
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

/** "Take the tour" on the ministry home, until the member finishes or skips it. */
export const MinistryTourCard: React.FC = () => {
  const { start, statusOf, ready, tr } = useTutorials();
  const status = statusOf(MINISTRY_INTRO_TUTORIAL_ID);
  if (!ready || status === 'completed' || status === 'skipped') return null;
  const resuming = status === 'in_progress';
  return (
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
  );
};
