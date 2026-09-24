/** On-demand caption preferences, shared by the in-room (useLiveCaptions)
 *  and HLS (useHlsCaptions) caption hooks, so CC on/off and text size follow
 *  the viewer between meetings and webinars. Stored per device. */

export type CaptionSize = 'sm' | 'md' | 'lg';
export type CaptionStatus = 'off' | 'starting' | 'waiting' | 'live' | 'error';

export interface CaptionPrefs {
  enabled: boolean;
  size: CaptionSize;
}

const PREFS_KEY = 'rekindle.captions.prefs';
const DEFAULT_PREFS: CaptionPrefs = { enabled: false, size: 'md' };

export function readPrefs(): CaptionPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<CaptionPrefs>;
    return {
      enabled: parsed.enabled === true,
      size: parsed.size === 'sm' || parsed.size === 'lg' ? parsed.size : 'md',
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
