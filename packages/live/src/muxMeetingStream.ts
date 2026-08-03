import { supabase } from '@rekindle/supabase';

// ============================================================
// Webinar-meeting live streaming, backed by self-hosted LiveKit (HLS Egress).
// (Mux + the `manage-stream-input` edge function were removed once LiveKit was the
// only backend. On LiveKit a webinar host publishes into the room and an HLS Egress
// composites it — there is no RTMP ingest to provision — so the former Mux ingest
// helpers now return null. Exported names are kept because components import them.)
// ============================================================

export interface StreamProvision {
  rtmpUrl: string;
  playbackUrl: string;
  uid: string;
}

/** LiveKit webinars have no RTMP ingest to mint — the host publishes into the room
 *  and go-live is startMeetingBroadcast (HLS Egress). Kept as a null no-op so the
 *  webinar components that import it keep compiling. */
export function createMeetingStream(_meetingId: string, _record = true): Promise<StreamProvision | null> {
  return Promise.resolve(null);
}

// ── LiveKit webinar broadcast (§6A) ─────────────────────────────────────────
// The host publishes into the room and an HLS Egress composites it. The edge fn
// writes the playback URL onto the meeting row, which the audience picks up via
// the existing realtime subscription.

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

/** No RTMP ingest on LiveKit webinars — null no-op (see createMeetingStream). */
export function getMeetingIngest(_meetingId: string): Promise<StreamProvision | null> {
  return Promise.resolve(null);
}

/** No RTMP ingest to tear down on LiveKit — null no-op. */
export function deleteMeetingStream(_meetingId: string): Promise<StreamProvision | null> {
  return Promise.resolve(null);
}

export interface MeetingRecording {
  uid: string;
  created: string;
  duration: number;
  thumbnail: string;
  iframe?: string;
  hls?: string;
}

/** List a webinar's recordings — LiveKit Egress outputs (livekit_recordings),
 *  keyed by the meeting's id. Returns [] when none. */
export async function getMeetingRecordings(meetingId: string): Promise<MeetingRecording[]> {
  try {
    const { data, error } = await supabase.functions.invoke('livekit-egress', {
      body: { action: 'list-recordings', meetingId },
    });
    if (error || !data?.recordings) return [];
    return data.recordings as MeetingRecording[];
  } catch {
    return [];
  }
}

/** No RTMP stream to pause on LiveKit — null no-op. */
export function stopMeetingStream(_meetingId: string): Promise<StreamProvision | null> {
  return Promise.resolve(null);
}

/** No RTMP stream to re-provision on LiveKit — null no-op (recording toggle is a
 *  property of the Egress at start time, not a stream re-mint). */
export function reprovisionMeetingStream(_meetingId: string, _record = true): Promise<StreamProvision | null> {
  return Promise.resolve(null);
}
