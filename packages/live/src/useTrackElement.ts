import { useEffect, type RefObject } from 'react';
import type { TrackAttachSource } from '@rekindle/types/videoRoom';

export type AttachTrackFn = (identity: string, source: TrackAttachSource, el: HTMLMediaElement) => (() => void) | null;

/**
 * Plays one participant track in a <video>/<audio> element.
 *
 * Goes through the room's attach() (useDailyRoom's `attachTrack`) whenever it
 * can. With LiveKit's adaptive stream on, a remote video that ISN'T attached
 * counts as not visible and gets paused, so every component that shows remote
 * video must render this way (2026-10-10). Falls back to srcObject when the
 * track can't be attached (no attach function, or the SDK track isn't there
 * yet; the effect re-runs when `track` changes).
 */
export function useTrackElement(
  ref: RefObject<HTMLMediaElement>,
  attach: AttachTrackFn | null | undefined,
  identity: string,
  source: TrackAttachSource,
  track: MediaStreamTrack | undefined,
  enabled = true,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!enabled || !track) {
      el.srcObject = null;
      return;
    }
    const detach = attach?.(identity, source, el);
    if (detach) {
      el.play().catch(() => { /* autoplay may defer until interaction */ });
      return detach;
    }
    if (track.readyState !== 'live') return;
    el.srcObject = new MediaStream([track]);
    el.play().catch(() => { /* autoplay may defer until interaction */ });
    return () => { el.srcObject = null; };
  }, [ref, attach, identity, source, track, enabled]);
}
