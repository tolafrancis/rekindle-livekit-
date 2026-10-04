import { useSyncExternalStore } from 'react';

/** On-demand caption preferences, shared by the in-room (useLiveCaptions)
 *  and HLS (useHlsCaptions) caption hooks, so CC on/off and caption style follow
 *  the viewer between meetings and webinars. Stored per device. */

export type CaptionSize = 'sm' | 'md' | 'lg';
export type CaptionStatus = 'off' | 'starting' | 'waiting' | 'live' | 'error';
/** solid / semi = a box behind the text; outline = no box, outlined text
 *  (stays readable on any video); none = plain text. */
export type CaptionBackground = 'solid' | 'semi' | 'outline' | 'none';
export type CaptionColor = 'white' | 'yellow' | 'cyan' | 'green';
/** 'custom' = wherever the viewer dragged it (dragX/dragY). */
export type CaptionPosition = 'bottom' | 'top' | 'custom';

export interface CaptionPrefs {
  enabled: boolean;
  size: CaptionSize;
  background: CaptionBackground;
  color: CaptionColor;
  position: CaptionPosition;
  /** Centre of the caption box as a fraction (0..1) of the video area,
   *  used when position is 'custom'. */
  dragX: number;
  dragY: number;
}

const PREFS_KEY = 'rekindle.captions.prefs';
const DEFAULT_PREFS: CaptionPrefs = {
  enabled: false, size: 'md', background: 'semi', color: 'white', position: 'bottom', dragX: 0.5, dragY: 0.8,
};

const BACKGROUNDS: CaptionBackground[] = ['solid', 'semi', 'outline', 'none'];
const COLORS: CaptionColor[] = ['white', 'yellow', 'cyan', 'green'];
const POSITIONS: CaptionPosition[] = ['bottom', 'top', 'custom'];
const fraction = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

export function readPrefs(): CaptionPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<CaptionPrefs>;
    return {
      enabled: parsed.enabled === true,
      size: parsed.size === 'sm' || parsed.size === 'lg' ? parsed.size : 'md',
      background: BACKGROUNDS.includes(parsed.background as CaptionBackground) ? parsed.background as CaptionBackground : DEFAULT_PREFS.background,
      color: COLORS.includes(parsed.color as CaptionColor) ? parsed.color as CaptionColor : DEFAULT_PREFS.color,
      position: POSITIONS.includes(parsed.position as CaptionPosition) ? parsed.position as CaptionPosition : DEFAULT_PREFS.position,
      dragX: fraction(parsed.dragX, DEFAULT_PREFS.dragX),
      dragY: fraction(parsed.dragY, DEFAULT_PREFS.dragY),
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writePrefs(prefs: CaptionPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable (private mode) — prefs just won't persist */
  }
}

// ── Shared, live store ────────────────────────────────────────────────────
// Every caption hook on the page reads the same preferences through
// useCaptionPrefs, so e.g. a broadcast viewer switching between the HLS and
// WebRTC paths (two different caption hooks) keeps one consistent CC state.

type Listener = () => void;
const listeners = new Set<Listener>();
let current: CaptionPrefs | null = null;

function snapshot(): CaptionPrefs {
  if (!current) current = readPrefs();
  return current;
}

export function updateCaptionPrefs(patch: Partial<CaptionPrefs>): void {
  current = { ...snapshot(), ...patch };
  writePrefs(current);
  listeners.forEach((listener) => listener());
}

export function useCaptionPrefs(): CaptionPrefs {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    snapshot,
    snapshot,
  );
}
