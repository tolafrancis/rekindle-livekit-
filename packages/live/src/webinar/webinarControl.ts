import { supabase } from '@rekindle/supabase';
import { FREE_TIER_MEETING_LIMITS } from '@rekindle/auth/subscriptionEnforcement';
import { stopMeetingBroadcast } from '../meetingStreamControl';

// Data layer for the Webinar meeting type (packages/live/src/webinar) — a
// wholly separate table (ministry_webinars) from Interactive Meetings'
// ministry_video_meetings, per the approved Phase 1 plan. Live broadcast/
// recording reuse startMeetingBroadcast/stopMeetingBroadcast unchanged
// (MeetingKind widened to include 'ministry_webinar' — see
// meetingStreamControl.ts) since a webinar's HLS Egress IS its recording,
// same as Interactive Meetings' existing webinar mode. startMeetingBroadcast
// itself is now called directly from WebinarStage.tsx, not from here — see
// its useEffect and the comment in WebinarLobby.handleStart for why.

export type WebinarStatus =
  | 'draft' | 'scheduled' | 'registration_open' | 'starting_soon'
  | 'live' | 'ending' | 'ended' | 'recording_processing' | 'completed' | 'cancelled';

export type WebinarSpeakerRole = 'host' | 'co-host' | 'speaker';
export type WebinarSpeakerStatus = 'invited' | 'confirmed' | 'declined' | 'removed';

export interface MinistryWebinar {
  id: string;
  ministry_id: string;
  host_id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  scheduled_start_at: string | null;
  timezone: string | null;
  duration_minutes: number;
  room_name: string;
  max_attendees: number;
  registration_required: boolean;
  is_public: boolean;
  access_level: 'public' | 'members' | 'invite_only';
  enable_recording: boolean;
  enable_chat: boolean;
  enable_qa: boolean;
  enable_polls: boolean;
  enable_reactions: boolean;
  enable_captions: boolean;
  enable_translation: boolean;
  default_language: string;
  status: WebinarStatus;
  hls_playback_url: string | null;
  recording_status: string | null;
  recording_url: string | null;
  recording_duration_seconds: number | null;
  recording_started_at: string | null;
  recording_ended_at: string | null;
  attendee_count: number;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebinarSpeaker {
  id: string;
  webinar_id: string;
  user_id: string | null;
  invited_email: string | null;
  invited_name: string | null;
  role: WebinarSpeakerRole;
  status: WebinarSpeakerStatus;
  invited_at: string;
  responded_at: string | null;
}

export async function getWebinar(webinarId: string): Promise<MinistryWebinar | null> {
  const { data, error } = await supabase.from('ministry_webinars').select('*').eq('id', webinarId).maybeSingle();
  if (error) { console.error('[webinarControl] getWebinar failed:', error.message); return null; }
  return data as MinistryWebinar | null;
}

export async function listMinistryWebinars(ministryId: string): Promise<MinistryWebinar[]> {
  const { data, error } = await supabase
    .from('ministry_webinars')
    .select('*')
    .eq('ministry_id', ministryId)
    .order('scheduled_start_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) { console.error('[webinarControl] listMinistryWebinars failed:', error.message); return []; }
  return (data ?? []) as MinistryWebinar[];
}

export async function listWebinarSpeakers(webinarId: string): Promise<WebinarSpeaker[]> {
  const { data, error } = await supabase
    .from('webinar_speakers').select('*').eq('webinar_id', webinarId).order('invited_at', { ascending: true });
  if (error) { console.error('[webinarControl] listWebinarSpeakers failed:', error.message); return []; }
  return (data ?? []) as WebinarSpeaker[];
}

/** Same shape as checkMinistryMeetingQuota (packages/auth/src/ministryEntitlements.ts)
 *  but against ministry_webinars, which has no is_active column — 'live' status is
 *  the equivalent "currently running" signal there. Kept as its own function rather
 *  than widening the shared one, since that function's type is a closed union other
 *  callers rely on and its is_active-based query wouldn't apply here unmodified. */
export async function checkWebinarQuota(ministryId: string): Promise<{ allowed: boolean; used: number; limit: number }> {
  const limitMinutes = FREE_TIER_MEETING_LIMITS.monthlyHours * 60;
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('ministry_webinars')
    .select('duration_minutes')
    .eq('ministry_id', ministryId)
    .gte('created_at', startOfMonth.toISOString());
  const used = (data ?? []).reduce((sum: number, r: { duration_minutes?: number }) => sum + (r.duration_minutes ?? 0), 0);
  if (used >= limitMinutes) return { allowed: false, used, limit: limitMinutes };

  const { count: liveCount } = await supabase
    .from('ministry_webinars')
    .select('id', { count: 'exact', head: true })
    .eq('ministry_id', ministryId)
    .eq('status', 'live');
  if ((liveCount ?? 0) >= FREE_TIER_MEETING_LIMITS.maxConcurrentActive) {
    return { allowed: false, used, limit: limitMinutes };
  }

  return { allowed: true, used, limit: limitMinutes };
}

export async function updateWebinarStatus(webinarId: string, status: WebinarStatus): Promise<void> {
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === 'live') patch.started_at = new Date().toISOString();
  if (status === 'ended') patch.ended_at = new Date().toISOString();
  const { error } = await supabase.from('ministry_webinars').update(patch).eq('id', webinarId);
  if (error) console.error('[webinarControl] updateWebinarStatus failed:', error.message);
}

/** Ending finalization: locks in final poll results so a viewer looking back
 *  at analytics/history never sees a poll stuck "open" forever. Pending Q&A
 *  questions are deliberately left as-is — Q&A has no equivalent "must be
 *  closed" lifecycle the way a poll's vote count does, and they still show up
 *  in WebinarAnalytics' engagement counts regardless of status. */
async function finalizeWebinarEngagement(webinarId: string): Promise<void> {
  const { error } = await supabase
    .from('webinar_polls')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('webinar_id', webinarId)
    .eq('status', 'open');
  if (error) console.error('[webinarControl] finalizeWebinarEngagement failed:', error.message);
}

/** Host action: end for everyone. Stops the Egress and moves through the ending
 *  states — 'recording_processing'/'completed' are set later by whatever polls the
 *  livekit_recordings row's own status (the webhook has already fired by the time a
 *  human clicks through the confirmation dialog in most cases, but not guaranteed). */
export async function stopWebinarBroadcast(webinarId: string, roomName: string): Promise<void> {
  await updateWebinarStatus(webinarId, 'ending');
  await stopMeetingBroadcast(webinarId, roomName, 'ministry_webinar');
  await finalizeWebinarEngagement(webinarId);
  await updateWebinarStatus(webinarId, 'ended');
}

export async function createWebinarSpeaker(params: {
  webinarId: string;
  userId?: string | null;
  invitedEmail?: string | null;
  invitedName?: string | null;
  role?: WebinarSpeakerRole;
}): Promise<void> {
  const { error } = await supabase.from('webinar_speakers').insert({
    webinar_id: params.webinarId,
    user_id: params.userId ?? null,
    invited_email: params.invitedEmail ?? null,
    invited_name: params.invitedName ?? null,
    role: params.role ?? 'speaker',
  });
  if (error) console.error('[webinarControl] createWebinarSpeaker failed:', error.message);
}

/** Bulk-seats every confirmed pre-assigned speaker directly into
 *  meeting_presenters (the existing, reused "stage" table) — called once,
 *  when the host starts the webinar. Confirmed speakers skip the live
 *  request/accept handshake entirely (they already agreed when invited). */
export async function seatConfirmedWebinarSpeakers(webinarId: string): Promise<void> {
  const speakers = await listWebinarSpeakers(webinarId);
  const confirmed = speakers.filter((s) => s.status === 'confirmed' && s.user_id);
  if (confirmed.length === 0) return;
  const rows = confirmed.map((s) => ({
    meeting_id: webinarId,
    user_id: s.user_id as string,
    user_name: s.invited_name,
    role: s.role === 'host' ? 'host' : s.role === 'co-host' ? 'co-host' : 'speaker',
  }));
  const { error } = await supabase.from('meeting_presenters').upsert(rows, { onConflict: 'meeting_id,user_id' });
  if (error) console.error('[webinarControl] seatConfirmedWebinarSpeakers failed:', error.message);
}

/** Host action: go live — shared by WebinarLobby's own "Start Webinar" button
 *  and WebinarDashboard's "Manage Webinar" confirm dialog (2026-09-21), so
 *  confirming there actually starts the webinar instead of just navigating to
 *  a page with yet another separate Start button to click. Only flips status
 *  (mounts WebinarStage/DailyVideoCall, which is where the Egress itself
 *  starts — see the comment in WebinarLobby.tsx for why it can't start here). */
export async function startWebinarNow(webinarId: string): Promise<void> {
  await seatConfirmedWebinarSpeakers(webinarId);
  await updateWebinarStatus(webinarId, 'live');
}
