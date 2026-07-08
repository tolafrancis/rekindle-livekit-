import { supabase } from '@/lib/supabase';

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

/** Create (or reuse) the channel's low-latency Mux live stream. */
export const provisionChannelStream = (channelId: string, record = true) => call('create', { channelId }, { record, latency: 'low' });
/** Re-fetch current ingest credentials for the channel. */
export const getChannelStreamCreds = (channelId: string) => call('ingest', { channelId });
/** Tear down the channel's Mux live stream. */
export const deleteChannelStream = (channelId: string) => call('delete', { channelId });
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

/** List a channel's recorded broadcasts (ready Mux assets). */
export async function getChannelRecordings(channelId: string): Promise<MuxRecording[]> {
  try {
    const { data, error } = await supabase.functions.invoke('manage-stream-input', {
      body: { action: 'recordings', channelId },
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
    const { data, error } = await supabase.functions.invoke(SIMULCAST_FN, {
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

/** Attach (or replace) a simulcast target for a platform. */
export const addSimulcastTarget = (channelId: string, platform: SimulcastPlatform, serverUrl: string, streamKey: string) =>
  callSimulcast<{ success: true; target: SimulcastTarget }>('add-simulcast', { channelId, platform, serverUrl, streamKey });

/** Detach a platform's simulcast target and delete its row. */
export const removeSimulcastTarget = (channelId: string, platform: SimulcastPlatform) =>
  callSimulcast<{ success: true; platform: SimulcastPlatform }>('remove-simulcast', { channelId, platform });

/** List a channel's simulcast targets (stream keys omitted; `hasKey` instead). */
export const listSimulcastTargets = (channelId: string) =>
  callSimulcast<{ success: true; targets: SimulcastTarget[] }>('list-simulcast', { channelId });
