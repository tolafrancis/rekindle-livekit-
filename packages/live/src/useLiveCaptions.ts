import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import type { LiveCaptionSegment } from '@rekindle/types/videoRoom';
import { updateCaptionPrefs, useCaptionPrefs, type CaptionSize, type CaptionStatus } from './captionPrefs';

/**
 * On-demand source-language captions (agents/captions) — separate from Live
 * Translation's "Show Captions". Any participant can turn CC on; no host
 * action is needed.
 *
 * Turning CC on:
 *   1. sets this participant's LiveKit attribute captions=on (the agent keeps
 *      running while anyone has it on, and stops 3 minutes after nobody does)
 *   2. calls the captions-start edge function with this participant's own
 *      room token, which starts the room's agent if it isn't running yet —
 *      idempotent, so everyone tapping at once still starts just one.
 * Turning CC off (or leaving) sets captions=off.
 *
 * Captions arrive as LiveKit transcription events from the room's hidden
 * caption agent. Nothing is stored server-side, so a late joiner only sees
 * captions from the moment they turn CC on.
 */

/** DailyVideoCall lifts this out of useDailyRoom (see onCaptionsBridgeChange). */
export interface LiveCaptionsBridge {
  setLocalAttributes: (attributes: Record<string, string>) => Promise<void>;
  getAccessToken: () => string | null;
  /** Returns an unsubscribe function. */
  subscribe: (listener: (segments: LiveCaptionSegment[]) => void) => () => void;
}

export type { CaptionSize, CaptionStatus } from './captionPrefs';

/** A segment as the overlay renders it: `final` false = still being spoken. */
export type CaptionLine = LiveCaptionSegment;

const MAX_LINES = 6;
// Re-ensure the agent periodically while CC is on — recovers on its own if
// the agent was restarted or stopped by its no-speech guard. Idempotent and
// cheap; jittered so a full room doesn't call in lockstep.
const ENSURE_INTERVAL_MS = 5 * 60_000;

interface UseLiveCaptionsOptions {
  roomName: string;
  kind: 'ministry_meeting' | 'ministry_webinar' | 'channel';
}

export function useLiveCaptions(bridge: LiveCaptionsBridge | null, { roomName, kind }: UseLiveCaptionsOptions) {
  const prefs = useCaptionPrefs();
  const [status, setStatus] = useState<CaptionStatus>('off');
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const receivedRef = useRef(false);

  const ensureAgent = useCallback(async (b: LiveCaptionsBridge): Promise<boolean> => {
    const livekitToken = b.getAccessToken();
    if (!livekitToken) return false;
    const { data, error } = await supabase.functions.invoke('captions-start', {
      body: { roomName, livekitToken, context: { kind } },
    });
    if (error || data?.error) {
      throw new Error(data?.error || error?.message || 'Could not start captions');
    }
    return true;
  }, [roomName, kind]);

  // Activate / deactivate whenever the preference or the connection changes.
  useEffect(() => {
    if (!bridge) {
      setStatus(prefs.enabled ? 'starting' : 'off');
      return;
    }
    if (!prefs.enabled) {
      setStatus('off');
      setLines([]);
      bridge.setLocalAttributes({ captions: 'off' }).catch(() => {});
      return;
    }

    let cancelled = false;
    receivedRef.current = false;
    setStatus('starting');

    const start = async () => {
      try {
        await bridge.setLocalAttributes({ captions: 'on' });
        await ensureAgent(bridge);
        if (!cancelled && !receivedRef.current) setStatus('waiting');
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        toast({
          title: 'Could not start captions',
          description: (err as Error).message,
          variant: 'destructive',
        });
      }
    };
    void start();

    const interval = setInterval(() => {
      ensureAgent(bridge).catch(() => { /* next tick retries */ });
    }, ENSURE_INTERVAL_MS + Math.floor(Math.random() * 30_000));

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [bridge, prefs.enabled, ensureAgent]);

  // Leaving the meeting disconnects the participant (which drops the
  // attribute server-side anyway); this covers unmounting while still joined.
  useEffect(() => {
    if (!bridge) return;
    return () => {
      bridge.setLocalAttributes({ captions: 'off' }).catch(() => {});
    };
  }, [bridge]);

  // Incoming segments: interim updates replace their line in place (same
  // id); an empty final removes it. Only the most recent lines are kept.
  useEffect(() => {
    if (!bridge || !prefs.enabled) return;
    return bridge.subscribe((segments) => {
      receivedRef.current = true;
      setStatus('live');
      setLines((prev) => {
        let next = prev;
        for (const seg of segments) {
          const idx = next.findIndex((l) => l.id === seg.id);
          if (!seg.text) {
            if (idx !== -1) next = next.filter((l) => l.id !== seg.id);
            continue;
          }
          if (idx !== -1) {
            // Never let a late interim overwrite a line that's already final.
            if (next[idx].final && !seg.final) continue;
            next = next.slice();
            next[idx] = seg;
          } else {
            next = [...next, seg];
          }
        }
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
    });
  }, [bridge, prefs.enabled]);

  const setEnabled = useCallback((enabled: boolean) => updateCaptionPrefs({ enabled }), []);
  const setSize = useCallback((size: CaptionSize) => updateCaptionPrefs({ size }), []);

  return {
    enabled: prefs.enabled,
    size: prefs.size,
    status,
    lines,
    setEnabled,
    setSize,
    toggle: () => setEnabled(!prefs.enabled),
  };
}
