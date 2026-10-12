// Shared types for the interactive tutorial engine (TutorialProvider +
// TutorialOverlay). The engine knows nothing about a particular app: each app
// supplies its tutorial definitions, how to navigate to a screen, which
// screen is showing, and how to translate copy.

/** Where a step lives, in the app's own terms. Opaque to the engine: it is
 *  handed back to the app's `navigate` callback unchanged. */
export type TutorialNav = { kind: string; [key: string]: unknown };

export type TutorialPlacement = 'auto' | 'top' | 'bottom' | 'left' | 'right' | 'center' | 'dock';

export type TutorialAction =
  /** The user clicks the element (or anything inside it) marked data-tour=target. */
  | { type: 'click'; target: string }
  /** The app reports this page as the current one. */
  | { type: 'page'; page: string };

export interface TutorialStep {
  id: string;
  title: string;
  /** One or two sentences on what this is. */
  body: string;
  /** What to do, e.g. "Tap The Word to continue." */
  instruction?: string;
  /** data-tour id of the element to highlight. No target = a centred card. */
  target?: string;
  /** Screen this step belongs to. The engine opens it before the step. */
  go?: TutorialNav;
  /** Page id the step expects to be on (matches the app's currentPage). Used
   *  to notice the user wandering off, so the tour pauses instead of pointing
   *  at nothing. */
  page?: string;
  placement?: TutorialPlacement;
  /** Practise step: advances when the user does this. Always skippable. */
  action?: TutorialAction;
  /** Shown instead of the usual copy when the target can't be found. */
  missingText?: string;
  /** Optional "Show Me" button: opens a screen, or starts a fuller tutorial. */
  showMe?: { label?: string; nav?: TutorialNav; tutorial?: string };
}

export type TutorialLevel = 'Beginner' | 'Intermediate';

export type TutorialAvailability = 'available' | 'gated' | 'hidden';

export interface TutorialDefinition {
  id: string;
  category: string;
  title: string;
  description: string;
  /** Rough minutes to complete. */
  minutes: number;
  level?: TutorialLevel;
  /** Pages this tutorial explains (for "Learn about this page"). */
  pages?: string[];
  /** Note shown when availability is 'gated' (e.g. a plan requirement). */
  gatedNote?: string;
  steps: TutorialStep[];
}

export type TutorialStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';

export interface TutorialRecord {
  status: Exclude<TutorialStatus, 'not_started'>;
  /** Index of the step to resume from. */
  step: number;
  updatedAt: string;
  completedAt?: string;
}

export type WelcomeStatus = 'completed' | 'dismissed' | 'later';

export interface WelcomeRecord {
  status: WelcomeStatus;
  /** How many times "Remind me later" was chosen. */
  laterCount?: number;
  /** When a 'later' welcome may show again. */
  remindAt?: string;
  updatedAt: string;
}

export interface TutorialProgressState {
  v: 1;
  welcome?: WelcomeRecord;
  tutorials: Record<string, TutorialRecord>;
}

/** Copy lookup: (key, English fallback) → localized text. */
export type TutorialTranslate = (key: string, fallback: string) => string;
