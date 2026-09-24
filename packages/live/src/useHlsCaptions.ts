import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { updateCaptionPrefs, useCaptionPrefs, type CaptionSize, type CaptionStatus } from './captionPrefs';
import { ClockOffsetEstimator, HlsCaptionBuffer, type HlsCaptionPayload, type SyncedCaptionLine } from './hlsCaptionSync';

/**
 * On-demand captions for audiences watching over HLS — webinar attendees
 * (Phase 2 of agents/captions) and Live Broadcast viewers (Phase 3). They
 * aren't in the LiveKit room, so:
 *   - CC on calls captions-start with { hls: true, webinarId | channelId }
 *     (checked the same way watching is), then heartbeats about every 45 s
 *     (caption_hls_viewer_heartbeat / caption_channel_viewer_heartbeat) so
 *     the agent knows someone is still reading. A heartbeat that finds no
 *     agent running calls captions-start again.
 *   - Captions arrive on the Supabase Realtime channel "captions:<room>" and
 *     are held back until playback reaches them (hlsCaptionSync), using the
 *     player's real playback time rather than a fixed offset.
 * Only messages sent after subscribing arrive, so there's no backlog.
 */

export type HlsCaptionScope =
  | { kind: 'webinar'; webinarId: string }
  | { kind: 'channel'; channelId: string };

interface UseHlsCaptionsOptions {
  scope: HlsCaptionScope;
  roomName: string;
  /** False while this viewer isn't watching over HLS (e.g. a broadcast
   *  viewer on the WebRTC fallback, captioned by useLiveCaptions instead). */
  active?: boolean;
  /** HlsPlayer's getPlaybackDate (via its ref). */
  getPlaybackDate: () => { ms: number; exact: boolean } | null;
}

const HEARTBEAT_MS = 45_000;
const RENDER_TICK_MS = 150;

export function useHlsCaptions({ scope, roomName, active = true, getPlaybackDate }: UseHlsCaptionsOptions) {
  const prefs = useCaptionPrefs();
  const [status, setStatus] = useState<CaptionStatus>('off');
  const [lines, setLines] = useState<SyncedCaptionLine[]>([]);
  const getPlaybackDateRef = useRef(getPlaybackDate);
  getPlaybackDateRef.current = getPlaybackDate;
  const scopeKind = scope.kind;
  const scopeId = scope.kind === 'webinar' ? scope.webinarId : scope.channelId;

  const startAgent = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('captions-start', {
      body: scopeKind === 'webinar' ? { hls: true, webinarId: scopeId } : { hls: true, channelId: scopeId },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not start captions');
  }, [scopeKind, scopeId]);

  useEffect(() => {
    if (!prefs.enabled || !active) {
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
      const { data: running, error } = scopeKind === 'webinar'
        ? await supabase.rpc('caption_hls_viewer_heartbeat', { p_webinar_id: scopeId })
        : await supabase.rpc('caption_channel_viewer_heartbeat', { p_channel_id: scopeId });
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
  }, [prefs.enabled, active, roomName, scopeKind, scopeId, startAgent]);

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

function sameLines(a: SyncedCaptionLine[], b: SyncedCaptionLine[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].id !== b[i].id || a[i].text !== b[i].text || a[i].final !== b[i].final) return false;
  }
  return true;
}
