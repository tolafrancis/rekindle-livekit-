import { supabase } from '@rekindle/supabase';

// ============================================================
// Webinar-meeting live streaming, backed by self-hosted LiveKit (HLS Egress).
// A webinar host publishes into the room and an HLS Egress composites it —
// there is no RTMP ingest to provision, so the ingest-shaped functions below
// (createMeetingStream, getMeetingIngest, etc.) are null no-ops kept only so
// the webinar components that import them keep compiling.
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
 *  and which host_id proves you may start the Egress). 'ministry_webinar' is the new,
 *  separate Webinar meeting type (ministry_webinars table) — see packages/live/src/webinar. */
export type MeetingKind = 'channel_meeting' | 'ministry_meeting' | 'meeting' | 'ministry_webinar';

/** Start the webinar's HLS Egress. Returns the playback URL (also written to the meeting row).
 *  `expectVideo` (2026-09-21, 'ministry_webinar' kind only — see livekit-egress's
 *  start-hls handler): whether this broadcast is expected to have video, same flag
 *  channel broadcasts already send. Without it, Track Composite Egress's
 *  video-required fallback-to-Room-Composite check is bypassed entirely and a host
 *  whose camera isn't on yet when this fires locks the broadcast to audio-only
 *  forever (Track Composite never picks up a track published after it starts) —
 *  the exact bug channel broadcasts already hit and fixed. */
export async function startMeetingBroadcast(
  meetingId: string,
  roomName: string,
  kind: MeetingKind,
  channelId?: string,
  expectVideo?: boolean,
): Promise<{ playbackUrl: string } | null> {
  const { data, error } = await supabase.functions.invoke('livekit-egress', {
    body: {
      action: 'start-hls',
      roomName,
      channelId,
      expectVideo,
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
  /** Direct MP4 download URL, when the server provides one. */
  download?: string | null;
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

export interface MeetingParticipant {
  userId: string;
  userName: string;
  isGuest: boolean;
  joinedAt: string;
  leftAt: string | null;
  isActive: boolean;
}

/** Self-report this browser joining/leaving a meeting, for the host's later
 *  attendance analytics (getMeetingParticipants). Best-effort — a failure here
 *  shouldn't interrupt the call. */
export async function trackMeetingParticipant(
  meetingId: string,
  participantId: string,
  participantName: string,
  isGuest: boolean,
  event: 'join' | 'leave',
  kind: MeetingKind = 'ministry_meeting',
): Promise<void> {
  try {
    await supabase.functions.invoke('livekit-egress', {
      body: {
        action: 'track-participant',
        event,
        meetingId,
        participantId,
        participantName,
        isGuest,
        context: { kind },
      },
    });
  } catch {
    /* best-effort */
  }
}

/** Host-only: total participant count + who/when for a meeting. */
export async function getMeetingParticipants(
  meetingId: string,
  kind: MeetingKind = 'ministry_meeting',
): Promise<{ participants: MeetingParticipant[]; totalCount: number; error?: string }> {
  try {
    // Real bug found live (2026-09-23): context was missing meetingId, but
    // livekit-egress's isDbHost() reads the host check from context.meetingId
    // specifically (top-level meetingId is only used by list-participants'
    // own query, not the auth gate) — every other action here (start-hls/
    // stop-hls) already includes it. Without it, isDbHost's
    // `if (c.meetingId && table)` was always false, so list-participants
    // 403'd for EVERY caller, including the real host.
    const { data, error } = await supabase.functions.invoke('livekit-egress', {
      body: { action: 'list-participants', meetingId, context: { kind, meetingId } },
    });
    // Distinguish a genuine failure from genuinely-zero attendance — the
    // 403 above used to collapse into this same empty shape, which is
    // exactly what let it hide as "No attendance recorded" instead of
    // surfacing as an error worth investigating.
    if (error || (data as { error?: string } | null)?.error) {
      return { participants: [], totalCount: 0, error: (data as { error?: string } | null)?.error || error?.message || 'Could not load participants' };
    }
    if (!data?.participants) return { participants: [], totalCount: 0 };
    return { participants: data.participants as MeetingParticipant[], totalCount: data.totalCount ?? 0 };
  } catch (err: any) {
    return { participants: [], totalCount: 0, error: err?.message || 'Could not load participants' };
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
