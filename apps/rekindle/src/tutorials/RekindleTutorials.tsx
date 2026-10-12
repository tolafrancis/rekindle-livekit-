// Wires the shared tutorial engine into the Rekindle app shell: which
// tutorials this user can see, how copy is translated, and the pieces of UI
// around the engine (welcome screen, Help menu, tutorial library).
import React, { useCallback } from 'react';
import { TutorialProvider } from '@rekindle/features/tutorial/TutorialProvider';
import type { TutorialAvailability, TutorialDefinition, TutorialNav } from '@rekindle/features/tutorial/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUserEntitlements } from '@/hooks/useUserEntitlements';
import { INTRO_TUTORIAL_ID, REKINDLE_TUTORIALS } from './definitions';

/** Tutorials about a module the admin can switch off (AppLayout NAV_GROUPS ids). */
const NAV_GROUP_FOR: Record<string, string> = {
  'getting-around': 'the-word',
  'devotional-series': 'the-word',
  'reading-plan': 'the-word',
  'scripture-memory': 'the-word',
  'books': 'the-word',
  'prayer-library': 'prayer',
  'prayer-journal': 'prayer',
  'prayer-wall': 'prayer',
  'community': 'community',
  'challenges': 'community',
  'music': 'community',
  'ministries': 'ministries',
  'live-broadcasts': 'live-channels',
  'meetings': 'live-channels',
  'my-channels': 'live-channels',
};

interface Props {
  userId: string | null | undefined;
  currentPage: string;
  navigate: (nav: TutorialNav) => void;
  suspended: boolean;
  isNavGroupOn: (navId: string) => boolean;
  isCounsellor: boolean;
  children: React.ReactNode;
}

export const RekindleTutorialProvider: React.FC<Props> = ({
  userId, currentPage, navigate, suspended, isNavGroupOn, isCounsellor, children,
}) => {
  const entitlements = useUserEntitlements();
  const { t } = useLanguage();
  const translate = useCallback((key: string, fallback: string) => t('tutorials', key, fallback), [t]);
  const availability = useCallback((tutorial: TutorialDefinition): TutorialAvailability => {
    const group = NAV_GROUP_FOR[tutorial.id];
    if (group && !isNavGroupOn(group)) return 'hidden';
    if (tutorial.id === 'counsellor-dashboard' && !isCounsellor) return 'hidden';
    // Plan-gated features are explained, never hidden or unlocked.
    if (tutorial.id === 'books' && !entitlements.isLoading && !entitlements.canAccessBookSummaries) return 'gated';
    if (tutorial.id === 'my-channels' && !entitlements.isLoading && !entitlements.canCreateLiveChannel) return 'gated';
    return 'available';
  }, [isNavGroupOn, isCounsellor, entitlements.isLoading, entitlements.canAccessBookSummaries, entitlements.canCreateLiveChannel]);

  return (
    <TutorialProvider
      userId={userId}
      tutorials={REKINDLE_TUTORIALS}
      currentPage={currentPage}
      navigate={navigate}
      availability={availability}
      translate={translate}
      suspended={suspended}
      introTutorialId={INTRO_TUTORIAL_ID}
    >
      {children}
    </TutorialProvider>
  );
};
