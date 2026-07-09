import { supabase } from '@/lib/supabase';

// ============================================================
// Webinar-meeting live streaming, backed by Mux via the `manage-stream-input`
// edge function (the same function muxStream.ts uses for live channels). The
// platform mints one Mux live stream per meeting and stores its HLS playback URL
// on the meeting row — hosts never see or paste any credentials.
//
// The deployed `manage-stream-input` ALWAYS mints the Mux stream with
// `latency_mode: 'low'` (Mux's lowest tier) regardless of the request body, so
// meeting streams are low-latency by default. The `latency: 'low'` arg below is
// belt-and-suspenders — a no-op today, correct if the edge fn ever reads it.
// Residual host-ahead / audience "reconnecting" blips are client-side (see
// HlsPlayer.tsx) + Daily's RTMP push delay, NOT the Mux latency mode.
// ============================================================

export interface StreamProvision {
  rtmpUrl: string;
  playbackUrl: string;
  uid: string;
}

async function callStreamFn(
  action: 'create' | 'ingest' | 'delete' | 'stop',
  meetingId: string,
  extra: Record<string, unknown> = {},
): Promise<StreamProvision | null> {
  try {
    const { data, error } = await supabase.functions.invoke('manage-stream-input', {
      body: { action, meetingId, ...extra },
    });
    if (error || !data || (action !== 'delete' && action !== 'stop' && !data.rtmpUrl)) return null;
    return data as StreamProvision;
  } catch {
    return null;
  }
}

/** Provision (or reuse) a low-latency Mux live stream for a webinar. Call when the meeting is created. */
export function createMeetingStream(meetingId: string, record = true): Promise<StreamProvision | null> {
  return callStreamFn('create', meetingId, { record, latency: 'low' });
}

// ── LiveKit webinar broadcast (§6A) ─────────────────────────────────────────
// On LiveKit there is no RTMP push: the host publishes into the room and an HLS
// Egress composites it. The edge fn writes the playback URL onto the meeting row,
// which the audience picks up via the existing realtime subscription.

/** Which meetings table holds this webinar (decides where hls_playback_url is written
 *  and which host_id proves you may start the Egress). */
export type MeetingKind = 'channel_meeting' | 'ministry_meeting' | 'meeting';

/** Start the webinar's HLS Egress. Returns the playback URL (also written to the meeting row). */
export async function startMeetingBroadcast(
  meetingId: string,
  roomName: string,
  kind: MeetingKind,
  channelId?: string,
): Promise<{ playbackUrl: string } | null> {
  const { data, error } = await supabase.functions.invoke('livekit-egress', {
    body: {
      action: 'start-hls',
      roomName,
      context: { kind, meetingId, channelId },
    },
  });
  if (error || !data?.playbackUrl) return null;
  return { playbackUrl: data.playbackUrl };
}

/** Stop the webinar's HLS Egress (no orphaned egress — it bills until stopped). */
export async function stopMeetingBroadcast(
  meetingId: string,
  roomName: string,
  kind: MeetingKind,
  channelId?: string,
): Promise<void> {
  await supabase.functions.invoke('livekit-egress', {
    body: {
      action: 'stop-hls',
      roomName,
      context: { kind, meetingId, channelId },
    },
  }).catch(() => {});
}

/** Fetch fresh ingest credentials for the host going live. */
export function getMeetingIngest(meetingId: string): Promise<StreamProvision | null> {
  return callStreamFn('ingest', meetingId);
}

/** Tear down the live stream when the meeting ends. */
export function deleteMeetingStream(meetingId: string): Promise<StreamProvision | null> {
  return callStreamFn('delete', meetingId);
}

export interface MeetingRecording {
  uid: string;
  created: string;
  duration: number;
  thumbnail: string;
  iframe?: string;
  hls?: string;
}

/** List Mux recordings (automatic VOD captures) for a webinar meeting. */
export async function getMeetingRecordings(meetingId: string): Promise<MeetingRecording[]> {
  try {
    const { data, error } = await supabase.functions.invoke('manage-stream-input', {
      body: { action: 'recordings', meetingId },
    });
    if (error || !data?.recordings) return [];
    return data.recordings as MeetingRecording[];
  } catch {
    return [];
  }
}

/** Pause a webinar (keeps the live stream + playback URL for restart). */
export function stopMeetingStream(meetingId: string): Promise<StreamProvision | null> {
  return callStreamFn('stop', meetingId);
}

/**
 * Re-provision a meeting's live stream (delete the existing one, then create a
 * fresh low-latency one with the new recording setting). Mux can't toggle
 * recording on an existing live stream, so this mints a new stream key +
 * playback URL. Only safe to call before the meeting goes live.
 */
export async function reprovisionMeetingStream(meetingId: string, record = true): Promise<StreamProvision | null> {
  await callStreamFn('delete', meetingId);
  return callStreamFn('create', meetingId, { record, latency: 'low' });
}
