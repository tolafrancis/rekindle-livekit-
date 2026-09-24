import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { readPrefs, writePrefs, type CaptionPrefs, type CaptionSize, type CaptionStatus } from './captionPrefs';
import { ClockOffsetEstimator, HlsCaptionBuffer, type HlsCaptionPayload, type SyncedCaptionLine } from './hlsCaptionSync';

/**
 * On-demand captions for webinar attendees watching over HLS (Phase 2 of
 * agents/captions). They aren't in the LiveKit room, so:
 *   - CC on calls captions-start with { hls: true, webinarId } (checked the
 *     same way watching the webinar is: live, and public or a member), then
 *     heartbeats caption_hls_viewer_heartbeat about every 45 s so the agent
 *     knows someone is still reading. A heartbeat that finds no agent running
 *     calls captions-start again.
 *   - Captions arrive on the Supabase Realtime channel "captions:<room>" and
 *     are held back until playback reaches them (hlsCaptionSync), using the
 *     player's real playback time rather than a fixed offset.
 * Only messages sent after subscribing arrive, so there's no backlog.
 */

interface UseHlsCaptionsOptions {
  webinarId: string;
  roomName: string;
  /** HlsPlayer's getPlaybackDate (via its ref). */
  getPlaybackDate: () => { ms: number; exact: boolean } | null;
}

const HEARTBEAT_MS = 45_000;
const RENDER_TICK_MS = 150;

export function useHlsCaptions({ webinarId, roomName, getPlaybackDate }: UseHlsCaptionsOptions) {
  const [prefs, setPrefs] = useState<CaptionPrefs>(readPrefs);
  const [status, setStatus] = useState<CaptionStatus>('off');
  const [lines, setLines] = useState<SyncedCaptionLine[]>([]);
  const getPlaybackDateRef = useRef(getPlaybackDate);
  getPlaybackDateRef.current = getPlaybackDate;

  const updatePrefs = useCallback((patch: Partial<CaptionPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      writePrefs(next);
      return next;
    });
  }, []);

  const startAgent = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('captions-start', {
      body: { hls: true, webinarId },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not start captions');
  }, [webinarId]);

  useEffect(() => {
    if (!prefs.enabled) {
      setStatus('off');
      setLines([]);
      return;
    }

    let cancelled = false;
    let rendered = false;
    const buffer = new HlsCaptionBuffer();
    const offset = new ClockOffsetEstimator();
    setStatus('starting');

    const channel = supabase
      .channel(`captions:${roomName}`)
      .on('broadcast', { event: 'caption' }, ({ payload }) => {
        const p = payload as HlsCaptionPayload;
        if (!p?.id || typeof p.endTime !== 'number') return;
        offset.observe(p.endTime, Date.now());
        buffer.add(p);
      })
      .subscribe();

    startAgent()
      .then(() => { if (!cancelled && !rendered) setStatus('waiting'); })
      .catch((err) => {
        if (cancelled) return;
        setStatus('error');
        toast({ title: 'Could not start captions', description: (err as Error).message, variant: 'destructive' });
      });

    const heartbeat = setInterval(async () => {
      const { data: running, error } = await supabase.rpc('caption_hls_viewer_heartbeat', { p_webinar_id: webinarId });
      if (!cancelled && !error && running === false) startAgent().catch(() => { /* next heartbeat retries */ });
    }, HEARTBEAT_MS);

    const tick = setInterval(() => {
      const playback = getPlaybackDateRef.current();
      if (!playback) return;
      const agentMs = playback.exact ? playback.ms : offset.toAgentClock(playback.ms);
      if (agentMs === null) return;
      const next = buffer.linesAt(agentMs);
      setLines((prev) => (sameLines(prev, next) ? prev : next));
      if (next.length && !rendered) {
        rendered = true;
        setStatus('live');
      }
    }, RENDER_TICK_MS);

    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      clearInterval(tick);
      supabase.removeChannel(channel);
      buffer.clear();
    };
  }, [prefs.enabled, roomName, webinarId, startAgent]);

  const setEnabled = useCallback((enabled: boolean) => updatePrefs({ enabled }), [updatePrefs]);
  const setSize = useCallback((size: CaptionSize) => updatePrefs({ size }), [updatePrefs]);

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

function sameLines(a: SyncedCaptionLine[], b: SyncedCaptionLine[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].id !== b[i].id || a[i].text !== b[i].text || a[i].final !== b[i].final) return false;
  }
  return true;
}
