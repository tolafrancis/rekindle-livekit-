import { supabase } from '@rekindle/supabase';

// Live-channel streaming, backed by self-hosted LiveKit (Ingress + Egress).

export interface IngressCredentials {
  uid: string;
  streamKey: string;
  serverUrl: string;     // OBS "Server" field
  rtmpUrl: string;       // full ingest (serverUrl + key)
  playbackUrl: string;   // HLS .m3u8 viewers watch
  playbackId: string | null;
  status: string;
}

const channelRoom = (channelId: string) => `channel-${channelId}`;

export interface StreamContext {
  kind: 'channel' | 'meeting' | 'ministry_meeting' | 'channel_meeting';
  id: string;
  roomName?: string;
}

function resolveStreamContext(idOrContext: string | StreamContext): StreamContext {
  if (typeof idOrContext === 'string') {
    return { kind: 'channel', id: idOrContext, roomName: `channel-${idOrContext}` };
  }
  return {
    ...idOrContext,
    roomName: idOrContext.roomName ?? (idOrContext.kind === 'channel' ? `channel-${idOrContext.id}` : idOrContext.id),
  };
}

/** OBS/encoder ingest creds via a LiveKit Ingress (serverUrl + streamKey). */
async function ingress(action: 'create' | 'get' | 'delete', ctxInput: string | StreamContext): Promise<IngressCredentials | null> {
  const ctx = resolveStreamContext(ctxInput);
  const isMeeting = ctx.kind !== 'channel'; // covers meeting / ministry_meeting / channel_meeting
  const body: any = {
    action,
    context: { kind: ctx.kind, [isMeeting ? 'meetingId' : 'channelId']: ctx.id },
    [isMeeting ? 'meetingId' : 'channelId']: ctx.id,
    roomName: ctx.roomName,
  };
  const { data, error } = await supabase.functions.invoke('livekit-ingress', { body });
  if (error || !data) return null;
  if (action === 'delete') return data as IngressCredentials;
  const serverUrl = data.serverUrl ?? '';
  const streamKey = data.streamKey ?? '';
  return {
    uid: data.ingressId ?? ctx.id,
    streamKey,
    serverUrl,
    rtmpUrl: streamKey ? `${serverUrl}/${streamKey}` : serverUrl,
    playbackUrl: '', // playback comes from the broadcast HLS Egress, not ingress
    playbackId: null,
    status: data.ingressId ? 'active' : 'idle',
  };
}

/** Create (or reuse) the channel or meeting's LiveKit Ingress. */
export const provisionChannelStream = (ctxInput: string | StreamContext, _record = true) => ingress('create', ctxInput);
/** Re-fetch current ingest credentials for the channel or meeting. */
export const getChannelStreamCreds = (ctxInput: string | StreamContext) => ingress('get', ctxInput);
/** Tear down the channel or meeting's ingest. */
export const deleteChannelStream = (ctxInput: string | StreamContext) => ingress('delete', ctxInput);

/** §6A — start the channel's live broadcast: composite the room → HLS via Egress
 *  and publish the playback URL. `expectVideo` tells the server whether this is
 *  a video broadcast — Track Composite Egress locks onto whatever tracks exist
 *  at the moment it starts and never picks up a later one, so if a video track
 *  is expected but not found yet, the server retries and, failing that, falls
 *  back to Room Composite rather than starting a call that can never show video. */
export async function startChannelBroadcast(channelId: string, expectVideo = false): Promise<{ playbackUrl: string } | null> {
  const { data, error } = await supabase.functions.invoke('livekit-egress', {
    body: { action: 'start-hls', roomName: channelRoom(channelId), channelId, expectVideo, context: { kind: 'channel', channelId } },
  });
  if (error || !data?.playbackUrl) return null;
  return { playbackUrl: data.playbackUrl };
}

/** §6A — stop the channel's broadcast HLS Egress. */
export async function stopChannelBroadcast(channelId: string): Promise<void> {
  await supabase.functions.invoke('livekit-egress', {
    body: { action: 'stop-hls', channelId, context: { kind: 'channel', channelId } },
  }).catch(() => {});
}

/** Change recording on/off after the channel exists (delete + re-create). */
export async function reprovisionChannelStream(channelId: string, record: boolean) {
  await deleteChannelStream(channelId);
  return provisionChannelStream(channelId, record);
}

export interface ChannelRecording {
  uid: string;
  created: string;
  duration: number;
  hls: string;
  thumbnail: string;
  /** Direct MP4 download URL, when the server provides one. */
  download?: string | null;
}

/**
 * Legacy direct-download helper. LiveKit Egress recordings expose their own
 * `download` URL on each recording row, so this returns null for non-Mux URLs and
 * is kept only so existing call sites (which already handle null) keep compiling.
 */
export function muxDownloadUrl(hls?: string | null, filename = 'recording'): string | null {
  if (!hls) return null;
  const m = hls.match(/stream\.mux\.com\/([^/.?#]+)\.m3u8/i);
  if (!m) return null;
  const safe = filename.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'recording';
  return `https://stream.mux.com/${m[1]}/capped-1080p.mp4?download=${encodeURIComponent(safe)}`;
}

/** List a channel's recorded broadcasts — LiveKit Egress outputs from
 *  livekit_recordings, in the shared ChannelRecording shape. */
export async function getChannelRecordings(channelId: string): Promise<ChannelRecording[]> {
  try {
    const { data, error } = await supabase.functions.invoke('livekit-egress', {
      body: { action: 'list-recordings', channelId },
    });
    if (error || !data?.recordings) return [];
    return data.recordings as ChannelRecording[];
  } catch {
    return [];
  }
}

// ============================================================
// Simulcast (restream) targets — YouTube Live / Facebook Live. On LiveKit each is
// one RTMP Egress per destination (livekit-egress). Stream keys are write-only:
// the server never returns them, only `hasKey`.
// ============================================================

export type SimulcastPlatform = 'youtube' | 'facebook';

export interface SimulcastTarget {
  id: string;
  channel_id: string;
  platform: SimulcastPlatform;
  server_url: string;
  mux_target_id: string | null;
  enabled: boolean;
  source: string;
  status: 'idle' | 'active' | 'error';
  last_error: string | null;
  hasKey: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SimulcastResult<T> {
  ok: boolean;
  data: T | null;
  error: string | null;
  message: string | null;
}

/** Invoke a simulcast action (LiveKit RTMP Egress) and normalise its result. */
async function callSimulcast<T>(action: string, payload: Record<string, unknown>): Promise<SimulcastResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke('livekit-egress', {
      body: { action, ...payload },
    });
    if (error) {
      let body: any = null;
      try { body = await (error as any).context?.json?.(); } catch { /* ignore */ }
      return { ok: false, data: null, error: body?.error ?? 'request_failed', message: body?.message ?? error.message };
    }
    if (!data?.success) {
      return { ok: false, data: null, error: data?.error ?? 'request_failed', message: data?.message ?? null };
    }
    return { ok: true, data: data as T, error: null, message: null };
  } catch (e: any) {
    return { ok: false, data: null, error: 'request_failed', message: e?.message ?? 'Network error' };
  }
}

/** Attach (or replace) a simulcast target for a platform (RTMP Egress destination). */
export const addSimulcastTarget = (ctxInput: string | StreamContext, platform: SimulcastPlatform, serverUrl: string, streamKey: string) => {
  const ctx = resolveStreamContext(ctxInput);
  const isMeeting = ctx.kind === 'meeting';
  return callSimulcast<{ success: true; target: SimulcastTarget }>('add-simulcast', {
    context: { kind: ctx.kind, [isMeeting ? 'meetingId' : 'channelId']: ctx.id },
    [isMeeting ? 'meetingId' : 'channelId']: ctx.id,
    platform,
    roomName: ctx.roomName,
    rtmpUrl: `${serverUrl}/${streamKey}`,
  });
};

/** Detach a platform's simulcast target and delete its row. */
export const removeSimulcastTarget = (ctxInput: string | StreamContext, platform: SimulcastPlatform) => {
  const ctx = resolveStreamContext(ctxInput);
  const isMeeting = ctx.kind === 'meeting';
  return callSimulcast<{ success: true; platform: SimulcastPlatform }>('remove-simulcast', {
    context: { kind: ctx.kind, [isMeeting ? 'meetingId' : 'channelId']: ctx.id },
    [isMeeting ? 'meetingId' : 'channelId']: ctx.id,
    platform,
  });
};

/** List a channel or meeting's simulcast targets (stream keys omitted; `hasKey` instead). */
export const listSimulcastTargets = (ctxInput: string | StreamContext) => {
  const ctx = resolveStreamContext(ctxInput);
  const isMeeting = ctx.kind === 'meeting';
  return callSimulcast<{ success: true; targets: SimulcastTarget[] }>('list-simulcast', {
    context: { kind: ctx.kind, [isMeeting ? 'meetingId' : 'channelId']: ctx.id },
    [isMeeting ? 'meetingId' : 'channelId']: ctx.id,
  });
};
