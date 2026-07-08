import { supabase } from '@/lib/supabase';
import { isLiveKitBackend } from '@/lib/videoBackend';

export interface MuxProvision {
  uid: string;
  streamKey: string;
  serverUrl: string;     // OBS "Server" field (rtmps://global-live.mux.com:443/app)
  rtmpUrl: string;       // full ingest for Daily.startLiveStreaming (serverUrl + key)
  playbackUrl: string;   // HLS .m3u8 viewers watch
  playbackId: string | null;
  status: string;
}

async function call(
  action: 'create' | 'ingest' | 'delete' | 'stop' | 'recordings',
  scope: { meetingId?: string; channelId?: string },
  extra: Record<string, unknown> = {},
): Promise<MuxProvision | null> {
  try {
    const { data, error } = await supabase.functions.invoke('manage-stream-input', {
      body: { action, ...scope, ...extra },
    });
    if (error || !data || (action !== 'delete' && action !== 'stop' && !data.rtmpUrl)) return null;
    return data as MuxProvision;
  } catch {
    return null;
  }
}

const channelRoom = (channelId: string) => `channel-${channelId}`;

/** OBS/encoder ingest creds. On LiveKit (§6B) this is a LiveKit Ingress
 *  (serverUrl + streamKey); on Daily/Mux it's the Mux live stream. Same shape. */
async function ingress(action: 'create' | 'get' | 'delete', channelId: string, record = true): Promise<MuxProvision | null> {
  const { data, error } = await supabase.functions.invoke('livekit-ingress', {
    body: { action, channelId, roomName: channelRoom(channelId) },
  });
  if (error || !data) return null;
  if (action === 'delete') return data as MuxProvision;
  const serverUrl = data.serverUrl ?? '';
  const streamKey = data.streamKey ?? '';
  return {
    uid: data.ingressId ?? channelId,
    streamKey,
    serverUrl,
    rtmpUrl: streamKey ? `${serverUrl}/${streamKey}` : serverUrl,
    playbackUrl: '', // playback comes from the broadcast HLS Egress, not ingress
    playbackId: null,
    status: data.ingressId ? 'active' : 'idle',
  };
}

/** Create (or reuse) the channel's ingest (LiveKit Ingress / Mux live stream). */
export const provisionChannelStream = (channelId: string, record = true) =>
  isLiveKitBackend() ? ingress('create', channelId, record) : call('create', { channelId }, { record, latency: 'low' });
/** Re-fetch current ingest credentials for the channel. */
export const getChannelStreamCreds = (channelId: string) =>
  isLiveKitBackend() ? ingress('get', channelId) : call('ingest', { channelId });
/** Tear down the channel's ingest. */
export const deleteChannelStream = (channelId: string) =>
  isLiveKitBackend() ? ingress('delete', channelId) : call('delete', { channelId });

/** §6A — start the channel's live broadcast: composite the room → HLS via Egress
 *  and publish the playback URL. On Daily/Mux the bridge in LiveChannelBroadcast
 *  does the RTMP push instead, so this is a no-op there. */
export async function startChannelBroadcast(channelId: string): Promise<{ playbackUrl: string } | null> {
  if (!isLiveKitBackend()) return null;
  const { data, error } = await supabase.functions.invoke('livekit-egress', {
    body: { action: 'start-hls', roomName: channelRoom(channelId), channelId, context: { kind: 'channel', channelId } },
  });
  if (error || !data?.playbackUrl) return null;
  return { playbackUrl: data.playbackUrl };
}

/** §6A — stop the channel's broadcast HLS Egress. */
export async function stopChannelBroadcast(channelId: string): Promise<void> {
  if (!isLiveKitBackend()) return;
  await supabase.functions.invoke('livekit-egress', {
    body: { action: 'stop-hls', channelId, context: { kind: 'channel', channelId } },
  }).catch(() => {});
}
/** Change recording on/off after the channel exists (delete + re-create). */
export async function reprovisionChannelStream(channelId: string, record: boolean) {
  await deleteChannelStream(channelId);
  return provisionChannelStream(channelId, record);
}

export interface MuxRecording {
  uid: string;
  created: string;
  duration: number;
  hls: string;
  thumbnail: string;
  /** Direct MP4 download URL, when the server provides one. */
  download?: string | null;
}

/**
 * Best-effort direct-download (MP4) URL for a Mux recording, derived from its
 * HLS playback URL (`https://stream.mux.com/<PLAYBACK_ID>.m3u8`). Uses Mux static
 * renditions plus the `?download=` param so the browser saves the file with a
 * friendly name. Requires the Mux asset to have static renditions (mp4_support)
 * enabled; returns null if the playback id can't be parsed.
 */
export function muxDownloadUrl(hls?: string | null, filename = 'recording'): string | null {
  if (!hls) return null;
  const m = hls.match(/stream\.mux\.com\/([^/.?#]+)\.m3u8/i);
  if (!m) return null;
  const safe = filename.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'recording';
  return `https://stream.mux.com/${m[1]}/capped-1080p.mp4?download=${encodeURIComponent(safe)}`;
}

/** List a channel's recorded broadcasts. On LiveKit these are Egress outputs
 *  (§12), listed from livekit_recordings; on Daily/Mux they're ready Mux assets.
 *  Both return the same MuxRecording shape so the VOD viewer is unchanged. */
export async function getChannelRecordings(channelId: string): Promise<MuxRecording[]> {
  try {
    const fn = isLiveKitBackend() ? 'livekit-egress' : 'manage-stream-input';
    const action = isLiveKitBackend() ? 'list-recordings' : 'recordings';
    const { data, error } = await supabase.functions.invoke(fn, {
      body: { action, channelId },
    });
    if (error || !data?.recordings) return [];
    return data.recordings as MuxRecording[];
  } catch {
    return [];
  }
}

// ============================================================
// Simulcast (restream) targets — push the channel's Mux live stream to
// YouTube Live / Facebook Live. Handled by a SEPARATE `channel-simulcast` edge
// function (isolated from `manage-stream-input` so it can never affect meetings).
// Stream keys are write-only: the server never returns them, only `hasKey`.
// ============================================================

const SIMULCAST_FN = 'channel-simulcast';

export type SimulcastPlatform = 'youtube' | 'facebook';

export interface SimulcastTarget {
  id: string;
  channel_id: string;
  platform: SimulcastPlatform;
  server_url: string;
  mux_target_id: string | null;
  enabled: boolean;
  source: string;            // 'manual' | 'oauth' (Phase 2)
  status: 'idle' | 'active' | 'error';
  last_error: string | null;
  hasKey: boolean;           // server-side substitute for the secret stream_key
  created_at?: string;
  updated_at?: string;
}

export interface SimulcastResult<T> {
  ok: boolean;
  data: T | null;
  error: string | null;     // machine code, e.g. 'stream_active'
  message: string | null;   // human-readable
}

/** Invoke a simulcast action and normalise its result (these responses don't carry rtmpUrl). */
async function callSimulcast<T>(action: string, payload: Record<string, unknown>): Promise<SimulcastResult<T>> {
  try {
    // §6C — on LiveKit, simulcast is one RTMP Egress per destination (livekit-egress);
    // on Daily/Mux it's a Mux simulcast-target (channel-simulcast). Same result shape.
    const fn = isLiveKitBackend() ? 'livekit-egress' : SIMULCAST_FN;
    const { data, error } = await supabase.functions.invoke(fn, {
      body: { action, ...payload },
    });
    if (error) {
      // supabase-js surfaces non-2xx as a FunctionsHttpError; the JSON body is on context.
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

/** Attach (or replace) a simulcast target for a platform. On LiveKit the RTMP
 *  Egress needs the combined destination URL + the channel room. */
export const addSimulcastTarget = (channelId: string, platform: SimulcastPlatform, serverUrl: string, streamKey: string) =>
  callSimulcast<{ success: true; target: SimulcastTarget }>('add-simulcast',
    isLiveKitBackend()
      ? { channelId, platform, roomName: channelRoom(channelId), rtmpUrl: `${serverUrl}/${streamKey}` }
      : { channelId, platform, serverUrl, streamKey });

/** Detach a platform's simulcast target and delete its row. */
export const removeSimulcastTarget = (channelId: string, platform: SimulcastPlatform) =>
  callSimulcast<{ success: true; platform: SimulcastPlatform }>('remove-simulcast', { channelId, platform });

/** List a channel's simulcast targets (stream keys omitted; `hasKey` instead). */
export const listSimulcastTargets = (channelId: string) =>
  callSimulcast<{ success: true; targets: SimulcastTarget[] }>('list-simulcast', { channelId });
