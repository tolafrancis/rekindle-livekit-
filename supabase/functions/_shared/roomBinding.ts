// =============================================================================
// Room binding for the LiveKit edge functions (livekit-token, livekit-
// moderation, livekit-egress, livekit-ingress).
// -----------------------------------------------------------------------------
// Callers send a `context` (which meeting / channel / webinar / counselling
// session they're acting for) AND a `roomName`. Roles and permissions are
// derived from the context, but every LiveKit action runs against roomName.
// Before 2026-10-10 nothing tied the two together, so anyone who is host of
// SOMETHING (e.g. their own personal live channel) could act as host on any
// other room: mint an admin token, delete it, kick people, record or stream
// it elsewhere.
//
// bindRoomContext() returns the part of the context that genuinely owns
// roomName (looked up server-side), or a failure. Callers must use ONLY the
// returned context for role/entitlement decisions. Sending your own channel
// plus someone else's meeting therefore can't mix: only the resource whose
// room matches survives.
// =============================================================================

// deno-lint-ignore no-explicit-any
type Admin = any;

export interface RoomContext {
  kind?: string;
  meetingId?: string;
  channelId?: string;
}

export type BindResult =
  | { ok: true; ctx: RoomContext; bound: boolean }
  | { ok: false; error: 'room_mismatch' };

/** Tables whose rows carry the LiveKit room name for a meeting id, by kind. */
const MEETING_TABLE: Record<string, string> = {
  meeting: 'meetings',
  ministry_meeting: 'ministry_video_meetings',
  channel_meeting: 'live_channel_video_meetings',
  ministry_webinar: 'ministry_webinars',
};

/**
 * @returns ok + the bound context when roomName belongs to the meeting /
 * session / channel in `ctx`; ok + bound:false (empty context) when ctx names
 * nothing at all; room_mismatch when ctx names a resource that doesn't own
 * roomName.
 */
export async function bindRoomContext(
  admin: Admin,
  roomName: string,
  ctx: RoomContext | undefined | null,
): Promise<BindResult> {
  const c = ctx ?? {};
  const kind = c.kind;

  // Counselling session: room is counselling-<sessionId> (or a stored name).
  if (kind === 'counselling' && c.meetingId) {
    if (roomName === `counselling-${c.meetingId}`) return { ok: true, bound: true, ctx: { kind, meetingId: c.meetingId } };
    const { data } = await admin.from('counselling_sessions').select('daily_room_name').eq('id', c.meetingId).maybeSingle();
    if (data?.daily_room_name && data.daily_room_name === roomName) {
      return { ok: true, bound: true, ctx: { kind, meetingId: c.meetingId } };
    }
    return { ok: false, error: 'room_mismatch' };
  }

  // A meeting-type row with its own room_name column.
  const table = c.meetingId ? MEETING_TABLE[kind ?? 'meeting'] : undefined;
  if (c.meetingId && table) {
    const cols = kind === 'channel_meeting' ? 'room_name, channel_id' : 'room_name';
    const { data } = await admin.from(table).select(cols).eq('id', c.meetingId).maybeSingle();
    if (data?.room_name && data.room_name === roomName) {
      const out: RoomContext = { kind: kind ?? 'meeting', meetingId: c.meetingId };
      // A channel meeting's channel owner may still act as host, but only for
      // the channel that actually owns this meeting.
      if (kind === 'channel_meeting' && c.channelId && data.channel_id === c.channelId) out.channelId = c.channelId;
      return { ok: true, bound: true, ctx: out };
    }
  }

  // A live channel's broadcast room: channel-<channelId> (or a stored name).
  if (c.channelId) {
    if (roomName === `channel-${c.channelId}`) return { ok: true, bound: true, ctx: { kind: 'channel', channelId: c.channelId } };
    const { data } = await admin.from('live_channels').select('daily_room_name').eq('id', c.channelId).maybeSingle();
    if (data?.daily_room_name && data.daily_room_name === roomName) {
      return { ok: true, bound: true, ctx: { kind: 'channel', channelId: c.channelId } };
    }
  }

  if (c.meetingId || c.channelId) return { ok: false, error: 'room_mismatch' };
  return { ok: true, bound: false, ctx: {} };
}
