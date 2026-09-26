import { supabase } from '@rekindle/supabase';

/**
 * How many OTHER real people are connected to a LiveKit room right now
 * (excludes the caller, screen-share shadows, translation bots and recording
 * participants — see livekit-token's `room-occupancy` action).
 *
 * The meetings tables' participant_count / is_active are client-maintained
 * and drift, so this is what decides "is the meeting actually over?".
 * Returns null when it can't be determined (network error, function
 * unavailable) — callers must treat null as "unknown", never as "empty".
 */
export async function getRoomOccupancy(roomName: string): Promise<number | null> {
  if (!roomName) return null;
  try {
    const { data, error } = await supabase.functions.invoke('livekit-token', {
      body: { action: 'room-occupancy', roomName },
    });
    if (error || typeof data?.occupants !== 'number') return null;
    return data.occupants;
  } catch {
    return null;
  }
}

/**
 * The DB update for a participant leaving an interactive meeting.
 *
 * Previously each client wrote `snapshotCount - 1` from the meeting row it
 * loaded when it joined, and marked the meeting ended when that hit 0. The
 * snapshot is stale by the time anyone leaves, so a participant dropping out
 * could write 0 while the host was still live — ending the meeting for
 * everyone and telling them "the host has ended this meeting".
 *
 * Now the meeting is only marked ended if LiveKit says nobody else is still
 * in the room; the stored count is corrected to the real head count. Only
 * when LiveKit can't be reached does it fall back to the (freshly read)
 * count, so stale meetings still get closed out.
 */
export async function leavePatch(
  table: 'live_channel_video_meetings' | 'ministry_video_meetings',
  meeting: { id: string; room_name: string; participant_count: number },
): Promise<Record<string, unknown>> {
  const { data: fresh } = await supabase
    .from(table)
    .select('participant_count')
    .eq('id', meeting.id)
    .maybeSingle();
  const freshCount = (fresh as { participant_count?: number } | null)?.participant_count ?? meeting.participant_count;
  const countAfterLeave = Math.max(0, freshCount - 1);

  const others = await getRoomOccupancy(meeting.room_name);
  const roomEmpty = others === null ? countAfterLeave === 0 : others === 0;

  const patch: Record<string, unknown> = { participant_count: others ?? countAfterLeave };
  if (roomEmpty) {
    patch.is_active = false;
    patch.ended_at = new Date().toISOString();
  }
  return patch;
}
