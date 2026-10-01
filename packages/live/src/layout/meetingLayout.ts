/**
 * Meeting layout and multi-spotlight: the shared state every participant
 * renders from, and the pure rules that turn it into what's on stage.
 *
 * The state lives in the LiveKit ROOM metadata (under `layout`), written only
 * by the livekit-moderation edge function after it has checked the caller is
 * the host or a co-host. Room metadata reaches everyone, including people who
 * join later, survives the host leaving, and is also what the recording
 * template reads. A data-channel message carries the same state for instant
 * feedback, but room metadata is the source of truth.
 *
 * Everything is keyed by LiveKit identity (== NormalizedParticipant.sessionId).
 *
 * A PIN is not in here: it is local to one viewer and never shared.
 */

export type LayoutMode = 'gallery' | 'speaker' | 'dual' | 'multi' | 'presentation' | 'webinar';
export type ScreenShareMode = 'screen-only' | 'screen-speaker' | 'screen-dual' | 'screen-gallery';
export type RecordingLayout = 'gallery' | 'speaker' | 'dual' | 'screen-speaker' | 'screen-dual';

export interface MeetingLayoutState {
  layoutMode: LayoutMode;
  /** Spotlit identities in display order (left to right in Dual Speaker). */
  spotlightParticipants: string[];
  screenShareMode: ScreenShareMode;
  recordingLayout: RecordingLayout;
  /** Dual Speaker: show the audience strip under the two speakers. */
  showThumbnails: boolean;
  /** Bumped on every change so a stale message can't overwrite a newer one. */
  rev: number;
}

export const MAX_SPOTLIGHT = 9;
export const MAX_DUAL_SPOTLIGHT = 2;
/** Multi-Speaker with nobody spotlit: how many active speakers get a big tile. */
export const MULTI_SPEAKER_TILES = 4;

export const LAYOUT_MODES: LayoutMode[] = ['gallery', 'speaker', 'dual', 'multi', 'presentation', 'webinar'];
export const SCREEN_SHARE_MODES: ScreenShareMode[] = ['screen-only', 'screen-speaker', 'screen-dual', 'screen-gallery'];
export const RECORDING_LAYOUTS: RecordingLayout[] = ['gallery', 'speaker', 'dual', 'screen-speaker', 'screen-dual'];

export const DEFAULT_LAYOUT_STATE: MeetingLayoutState = {
  layoutMode: 'speaker',
  spotlightParticipants: [],
  screenShareMode: 'screen-speaker',
  // Gallery is LiveKit's own built-in recording grid, what every recording
  // used before this; the other layouts use the recording template page.
  recordingLayout: 'gallery',
  showThumbnails: true,
  rev: 0,
};

/** Accept only well-formed state; anything unknown falls back to the default. */
export function sanitizeLayoutState(raw: unknown): MeetingLayoutState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const layoutMode = LAYOUT_MODES.includes(r.layoutMode as LayoutMode) ? (r.layoutMode as LayoutMode) : DEFAULT_LAYOUT_STATE.layoutMode;
  const seen = new Set<string>();
  const spotlightParticipants = (Array.isArray(r.spotlightParticipants) ? r.spotlightParticipants : [])
    .filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128 && !seen.has(id) && !!seen.add(id))
    .slice(0, layoutMode === 'dual' ? MAX_DUAL_SPOTLIGHT : MAX_SPOTLIGHT);
  return {
    layoutMode,
    spotlightParticipants,
    screenShareMode: SCREEN_SHARE_MODES.includes(r.screenShareMode as ScreenShareMode)
      ? (r.screenShareMode as ScreenShareMode) : DEFAULT_LAYOUT_STATE.screenShareMode,
    recordingLayout: RECORDING_LAYOUTS.includes(r.recordingLayout as RecordingLayout)
      ? (r.recordingLayout as RecordingLayout) : DEFAULT_LAYOUT_STATE.recordingLayout,
    showThumbnails: typeof r.showThumbnails === 'boolean' ? r.showThumbnails : DEFAULT_LAYOUT_STATE.showThumbnails,
    rev: typeof r.rev === 'number' && Number.isFinite(r.rev) ? r.rev : 0,
  };
}

/** Parse the room metadata JSON and pull out the layout, if any. */
export function layoutFromRoomMetadata(metadata: string | undefined | null): MeetingLayoutState | null {
  if (!metadata) return null;
  try {
    return sanitizeLayoutState(JSON.parse(metadata)?.layout);
  } catch {
    return null;
  }
}

// ── Host actions. Each returns the next state, or an error to show. ──────────

export type LayoutResult = { state: MeetingLayoutState } | { error: string };

const next = (s: MeetingLayoutState, patch: Partial<MeetingLayoutState>): MeetingLayoutState =>
  ({ ...s, ...patch, rev: s.rev + 1 });

/** "Spotlight for Everyone": this person alone. */
export function spotlightOnly(s: MeetingLayoutState, id: string): MeetingLayoutState {
  return next(s, {
    spotlightParticipants: [id],
    // One spotlit person is a Speaker view; Dual/Multi would only fall back anyway.
    layoutMode: s.layoutMode === 'dual' || s.layoutMode === 'multi' ? s.layoutMode : 'speaker',
  });
}

/** "Add to Spotlight": appended to the end, so existing order never changes. */
export function addSpotlight(s: MeetingLayoutState, id: string): LayoutResult {
  if (s.spotlightParticipants.includes(id)) return { state: s };
  const limit = s.layoutMode === 'dual' ? MAX_DUAL_SPOTLIGHT : MAX_SPOTLIGHT;
  if (s.spotlightParticipants.length >= limit) {
    return {
      error: s.layoutMode === 'dual'
        ? 'Dual Speaker holds two people. Remove one first, or switch to Multi-Speaker.'
        : `You can spotlight up to ${MAX_SPOTLIGHT} people.`,
    };
  }
  return { state: next(s, { spotlightParticipants: [...s.spotlightParticipants, id] }) };
}

/** "Remove from Spotlight": everyone else keeps their place. */
export function removeSpotlight(s: MeetingLayoutState, id: string): MeetingLayoutState {
  if (!s.spotlightParticipants.includes(id)) return s;
  return next(s, { spotlightParticipants: s.spotlightParticipants.filter((x) => x !== id) });
}

export function clearSpotlights(s: MeetingLayoutState): MeetingLayoutState {
  return next(s, { spotlightParticipants: [] });
}

/** "Swap Speakers": reverse the two Dual Speaker slots. */
export function swapSpeakers(s: MeetingLayoutState): MeetingLayoutState {
  const [a, b, ...rest] = s.spotlightParticipants;
  if (!a || !b) return s;
  return next(s, { spotlightParticipants: [b, a, ...rest] });
}

/** Switching to Dual Speaker keeps the first two spotlit people. */
export function setLayoutMode(s: MeetingLayoutState, layoutMode: LayoutMode): MeetingLayoutState {
  return next(s, {
    layoutMode,
    spotlightParticipants: layoutMode === 'dual' ? s.spotlightParticipants.slice(0, MAX_DUAL_SPOTLIGHT) : s.spotlightParticipants,
  });
}

export function setScreenShareMode(s: MeetingLayoutState, screenShareMode: ScreenShareMode): MeetingLayoutState {
  return next(s, { screenShareMode });
}

export function setRecordingLayout(s: MeetingLayoutState, recordingLayout: RecordingLayout): MeetingLayoutState {
  return next(s, { recordingLayout });
}

export function setShowThumbnails(s: MeetingLayoutState, showThumbnails: boolean): MeetingLayoutState {
  return next(s, { showThumbnails });
}

// ── What goes on stage ───────────────────────────────────────────────────────

export interface StageParticipant {
  sessionId: string;
  isLocal?: boolean;
  isSpeaking?: boolean;
  hasScreenShare?: boolean;
}

export type StageKind = 'empty' | 'gallery' | 'speaker' | 'dual' | 'multi' | 'screen';

export interface Stage {
  kind: StageKind;
  /** The large tiles, in order. Speaker: 1. Dual: exactly 2. Multi: 2 to 9. */
  main: string[];
  /** Screen share on stage: whose screen. */
  screenOf?: string;
  /** Screen share: how the camera tiles sit next to it. */
  screenMode?: ScreenShareMode;
  /** Small audience tiles (the filmstrip). */
  thumbnails: string[];
  /** Why the main tiles are there, for the badge. */
  reason: 'pin' | 'spotlight' | 'active' | 'none';
}

export interface ResolveInput {
  state: MeetingLayoutState;
  /** Everyone in the room, local included, in join order. */
  participants: StageParticipant[];
  /** This viewer's own pin. */
  pinnedId?: string | null;
  /** The debounced active speaker (DailyVideoCall's autoSpeakerId). */
  activeSpeakerId?: string | null;
  /** Identities in order of most recent speech, for Multi-Speaker. */
  recentSpeakers?: string[];
  /** For the recording: include the local participant among thumbnails. */
  includeLocalInThumbnails?: boolean;
}

/**
 * Decide the stage. Rules, in order:
 *  1. This viewer's pin wins, for this viewer only (Speaker view of the pin).
 *  2. A live screen share takes the stage in the host's chosen screen mode.
 *  3. Spotlight: 1 → Speaker; 2 with Dual Speaker → Dual; 2+ otherwise →
 *     Multi (all spotlit, equal). Order always follows the spotlight list,
 *     never who is talking.
 *  4. Nobody spotlit → the selected layout (Speaker/Presentation/Dual follow
 *     the active speaker, Multi shows the most recent speakers, Webinar and
 *     Gallery show the grid).
 * Spotlit people who have left are skipped until they return, keeping their slot.
 */
export function resolveStage(input: ResolveInput): Stage {
  const { state, participants, pinnedId, activeSpeakerId, recentSpeakers = [], includeLocalInThumbnails } = input;
  if (participants.length === 0) return { kind: 'empty', main: [], thumbnails: [], reason: 'none' };

  const present = new Set(participants.map((p) => p.sessionId));
  const spot = state.spotlightParticipants.filter((id) => present.has(id));
  const thumbsExcept = (main: string[]) =>
    participants
      .filter((p) => !main.includes(p.sessionId) && (includeLocalInThumbnails || !p.isLocal))
      .map((p) => p.sessionId);
  const noThumbs = state.layoutMode === 'webinar';

  // 1. Local pin.
  if (pinnedId && present.has(pinnedId)) {
    return { kind: 'speaker', main: [pinnedId], thumbnails: thumbsExcept([pinnedId]), reason: 'pin' };
  }

  // 2. Screen share.
  const sharer = participants.find((p) => p.hasScreenShare);
  if (sharer) {
    const mode = state.screenShareMode;
    let main: string[] = [];
    if (mode === 'screen-speaker') {
      main = [spot[0] ?? (activeSpeakerId && present.has(activeSpeakerId) ? activeSpeakerId : sharer.sessionId)];
    } else if (mode === 'screen-dual') {
      main = spot.slice(0, 2);
      // Fewer than two spotlit: fill from the sharer, then the room, in join order.
      for (const id of [sharer.sessionId, ...participants.map((p) => p.sessionId)]) {
        if (main.length >= 2) break;
        if (!main.includes(id)) main.push(id);
      }
    }
    const thumbnails = mode === 'screen-gallery' ? thumbsExcept(main) : [];
    return {
      kind: 'screen', main, screenOf: sharer.sessionId, screenMode: mode, thumbnails,
      reason: spot.length ? 'spotlight' : 'none',
    };
  }

  // 3. Spotlight.
  if (spot.length === 1) {
    return { kind: 'speaker', main: spot, thumbnails: noThumbs ? [] : thumbsExcept(spot), reason: 'spotlight' };
  }
  if (spot.length >= 2) {
    if (state.layoutMode === 'dual') {
      const main = spot.slice(0, 2);
      return { kind: 'dual', main, thumbnails: state.showThumbnails ? thumbsExcept(main) : [], reason: 'spotlight' };
    }
    return { kind: 'multi', main: spot, thumbnails: noThumbs ? [] : thumbsExcept(spot), reason: 'spotlight' };
  }

  // 4. Nobody spotlit.
  const active = activeSpeakerId && present.has(activeSpeakerId) ? activeSpeakerId : null;
  switch (state.layoutMode) {
    case 'speaker':
    case 'presentation':
    case 'dual':
      if (active) return { kind: 'speaker', main: [active], thumbnails: thumbsExcept([active]), reason: 'active' };
      return { kind: 'gallery', main: [], thumbnails: thumbsExcept([]), reason: 'none' };
    case 'multi': {
      const main = recentSpeakers.filter((id) => present.has(id)).slice(0, MULTI_SPEAKER_TILES);
      if (main.length >= 2) return { kind: 'multi', main, thumbnails: thumbsExcept(main), reason: 'active' };
      if (main.length === 1) return { kind: 'speaker', main, thumbnails: thumbsExcept(main), reason: 'active' };
      return { kind: 'gallery', main: [], thumbnails: thumbsExcept([]), reason: 'none' };
    }
    case 'webinar':
    case 'gallery':
    default:
      return { kind: 'gallery', main: [], thumbnails: thumbsExcept([]), reason: 'none' };
  }
}

/**
 * The recording's own layout, independent of anyone's screen: the shared
 * spotlight order with the stage type the host picked for the recording.
 */
export function recordingStageState(s: MeetingLayoutState): MeetingLayoutState {
  switch (s.recordingLayout) {
    case 'gallery':
      return { ...s, layoutMode: 'gallery', spotlightParticipants: [], screenShareMode: 'screen-gallery' };
    case 'dual':
    case 'screen-dual':
      return { ...s, layoutMode: 'dual', spotlightParticipants: s.spotlightParticipants.slice(0, MAX_DUAL_SPOTLIGHT), screenShareMode: 'screen-dual', showThumbnails: false };
    case 'speaker':
    case 'screen-speaker':
    default:
      // One speaker on the recording: the first spotlit person, or whoever talks.
      return { ...s, layoutMode: 'speaker', spotlightParticipants: s.spotlightParticipants.slice(0, 1), screenShareMode: 'screen-speaker' };
  }
}

/** Grid columns for N equal tiles (Multi-Speaker / Gallery). */
export function gridColumns(n: number): number {
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  return 3;
}

export const LAYOUT_LABELS: Record<LayoutMode, string> = {
  gallery: 'Gallery',
  speaker: 'Speaker',
  dual: 'Dual Speaker',
  multi: 'Multi-Speaker',
  presentation: 'Presentation',
  webinar: 'Webinar',
};

export const SCREEN_SHARE_LABELS: Record<ScreenShareMode, string> = {
  'screen-only': 'Screen only',
  'screen-speaker': 'Screen + Speaker',
  'screen-dual': 'Screen + Dual Speakers',
  'screen-gallery': 'Screen + Gallery',
};

export const RECORDING_LABELS: Record<RecordingLayout, string> = {
  gallery: 'Gallery',
  speaker: 'Speaker',
  dual: 'Dual Speaker',
  'screen-speaker': 'Screen + Speaker',
  'screen-dual': 'Screen + Dual Speakers',
};
