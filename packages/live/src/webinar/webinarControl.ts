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
  | 'draft' | 'scheduled' | 'registration_open' | 'starting_soon' | 'backstage'
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
  /** Caption (speech-to-text) language for on-demand captions — migration 0372. */
  source_language?: string;
  status: WebinarStatus;
  hls_playback_url: string | null;
  recording_status: string | null;
  recording_url: string | null;
  recording_duration_seconds: number | null;
  recording_started_at: string | null;
  recording_ended_at: string | null;
  recording_visibility: 'public' | 'private';
  attendee_count: number;
  started_at: string | null;
  ended_at: string | null;
  /** Set when the host opens the webinar into its private backstage
   *  (migration 0375). */
  backstage_started_at?: string | null;
  /** Written only by the webinar-auto-end sweep. */
  host_absent_since?: string | null;
  ended_reason?: string | null;
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
    .in('status', ['backstage', 'live']);
  if ((liveCount ?? 0) >= FREE_TIER_MEETING_LIMITS.maxConcurrentActive) {
    return { allowed: false, used, limit: limitMinutes };
  }

  return { allowed: true, used, limit: limitMinutes };
}

export async function updateWebinarStatus(webinarId: string, status: WebinarStatus): Promise<void> {
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === 'backstage') patch.backstage_started_at = new Date().toISOString();
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
/** Stops any live translation/captions session(s) still running in this
 *  webinar's room (2026-09-23, real cost-leak flagged in a captions
 *  pipeline review: MinistryInteractiveMeetings.tsx already has this exact
 *  helper wired into its own end-meeting flow — webinars had no equivalent,
 *  so ending a webinar left any active bot session, and its STT/translate/
 *  TTS billing, running until someone manually stopped it or the bot's own
 *  multi-hour self-healing eventually caught it). Best-effort: a failed
 *  stop_bot_session call is logged, not thrown — it must never block the
 *  webinar from actually ending. */
async function stopTranslationForRoom(roomName: string): Promise<void> {
  try {
    const { data } = await supabase
      .from('translation_sessions')
      .select('id')
      .eq('livekit_room_name', roomName)
      .in('status', ['initialising', 'joining', 'active', 'paused']);
    if (!data || data.length === 0) return;
    await Promise.all(
      data.map((s: { id: string }) =>
        supabase.rpc('stop_bot_session', { p_session_id: s.id }).then(({ error }) => {
          if (error) console.error(`[webinarControl] stop_bot_session failed for session ${s.id}:`, error.message);
        }),
      ),
    );
  } catch (err) {
    console.error('[webinarControl] stopTranslationForRoom failed:', err);
  }
}

export async function stopWebinarBroadcast(webinarId: string, roomName: string): Promise<void> {
  await updateWebinarStatus(webinarId, 'ending');
  await stopMeetingBroadcast(webinarId, roomName, 'ministry_webinar');
  await stopTranslationForRoom(roomName);
  await finalizeWebinarEngagement(webinarId);
  await updateWebinarStatus(webinarId, 'ended');
}

/** Inserts the pre-assigned speaker row and, when invited by email, fires
 *  off the invite email (best-effort — a failed send doesn't roll back the
 *  row; the host can re-send from the Speakers manage panel). The email
 *  itself carries a /webinar-invite/:token link (see migration 0365 +
 *  WebinarSpeakerInvitePage.tsx) that lets the invitee claim the row once
 *  signed in, without which the row was previously a permanent dead end. */
export async function createWebinarSpeaker(params: {
  webinarId: string;
  userId?: string | null;
  invitedEmail?: string | null;
  invitedName?: string | null;
  role?: WebinarSpeakerRole;
}): Promise<void> {
  const { data, error } = await supabase.from('webinar_speakers').insert({
    webinar_id: params.webinarId,
    user_id: params.userId ?? null,
    invited_email: params.invitedEmail ?? null,
    invited_name: params.invitedName ?? null,
    role: params.role ?? 'speaker',
  }).select('id').single();
  if (error) { console.error('[webinarControl] createWebinarSpeaker failed:', error.message); return; }

  if (params.invitedEmail && data?.id) {
    const { error: sendErr } = await supabase.functions.invoke('send-webinar-speaker-invite', {
      body: { speakerId: data.id },
    });
    if (sendErr) console.error('[webinarControl] send-webinar-speaker-invite failed:', sendErr.message);
  }
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

/** Host action: open the webinar into its private backstage — shared by
 *  WebinarLobby's own button and WebinarDashboard's "Manage Webinar" confirm
 *  dialog. Host, co-hosts and confirmed speakers join the LiveKit room
 *  (WebinarJoinPage mounts WebinarStage for 'backstage' as well as 'live'),
 *  but no Egress starts and attendees stay on the waiting screen until
 *  someone presses Go live (goLiveWebinar). Only moves a webinar that
 *  hasn't started yet — one already backstage/live is left alone, and one
 *  that's over is never reopened. */
export async function openWebinarBackstage(webinarId: string): Promise<void> {
  await seatConfirmedWebinarSpeakers(webinarId);
  const { error } = await supabase
    .from('ministry_webinars')
    .update({
      status: 'backstage',
      backstage_started_at: new Date().toISOString(),
      host_absent_since: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', webinarId)
    .in('status', ['draft', 'scheduled', 'registration_open', 'starting_soon']);
  if (error) {
    console.error('[webinarControl] openWebinarBackstage failed:', error.message);
    throw error;
  }
}

/** Host action: Go live. The caller has already started the HLS Egress
 *  (WebinarStage does that, since it's the component that knows the host is
 *  in the room); flipping status to 'live' is what lets attendees in. */
export async function goLiveWebinar(webinarId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('ministry_webinars')
    .update({ status: 'live', started_at: now, host_absent_since: null, updated_at: now })
    .eq('id', webinarId)
    .eq('status', 'backstage');
  if (error) {
    console.error('[webinarControl] goLiveWebinar failed:', error.message);
    throw error;
  }
}

/** The viewer's role as the database sees it right now. Used both when the
 *  join page loads and, while on stage, to notice a mid-webinar change (made
 *  co-host, sent back to the audience). Client-side only picks the UI;
 *  livekit-token's resolveRole is the real boundary for publish rights. */
export async function resolveWebinarRole(
  webinarId: string, hostId: string, userId: string,
): Promise<'host' | 'co-host' | 'speaker' | 'attendee'> {
  if (hostId === userId) return 'host';

  const { data: speaker } = await supabase
    .from('webinar_speakers').select('role')
    .eq('webinar_id', webinarId).eq('user_id', userId).eq('status', 'confirmed')
    .maybeSingle();
  if (speaker) return (speaker as { role: WebinarSpeakerRole }).role;

  const { data: request } = await supabase
    .from('webinar_speaker_requests').select('status')
    .eq('webinar_id', webinarId).eq('user_id', userId).eq('status', 'accepted')
    .maybeSingle();
  if (request) return 'speaker';

  return 'attendee';
}

/** Server-enforced LiveKit moderation for a webinar room (livekit-moderation
 *  authorizes the caller as the webinar's host or a confirmed co-host). */
async function moderateWebinar(
  webinarId: string, roomName: string, action: string, extra: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('livekit-moderation', {
    body: { action, roomName, context: { kind: 'ministry_webinar', meetingId: webinarId }, ...extra },
  });
  if (error || data?.error) throw new Error(data?.error || error?.message || `${action} failed`);
}

/** Host action: make someone on stage a co-host, or back to a plain speaker.
 *  The webinar_speakers row is what makes it stick (RLS via
 *  is_webinar_manager, livekit-token's role on reconnect); the LiveKit
 *  set-role makes it take effect in the room right away. */
export async function setWebinarCoHost(params: {
  webinarId: string; roomName: string; userId: string; userName: string | null; coHost: boolean;
}): Promise<void> {
  const role: WebinarSpeakerRole = params.coHost ? 'co-host' : 'speaker';
  const { data: existing } = await supabase
    .from('webinar_speakers').select('id')
    .eq('webinar_id', params.webinarId).eq('user_id', params.userId)
    .maybeSingle();
  const now = new Date().toISOString();
  const { error } = existing
    ? await supabase.from('webinar_speakers')
      .update({ role, status: 'confirmed', responded_at: now })
      .eq('id', (existing as { id: string }).id)
    : await supabase.from('webinar_speakers').insert({
      webinar_id: params.webinarId, user_id: params.userId, invited_name: params.userName,
      role, status: 'confirmed', responded_at: now,
    });
  if (error) throw new Error(error.message);

  await supabase.from('meeting_presenters')
    .update({ role })
    .eq('meeting_id', params.webinarId).eq('user_id', params.userId);

  await moderateWebinar(params.webinarId, params.roomName, 'set-role', { identity: params.userId, role });
}

/** Host action: send someone on stage back to the audience. Covers both a
 *  pre-assigned speaker (webinar_speakers) and one promoted live
 *  (webinar_speaker_requests). Their own WebinarStage notices the role change
 *  and swaps back to the viewer; set-role drops their publish grant at the
 *  SFU immediately in case their client doesn't cooperate. */
export async function moveWebinarSpeakerToAudience(params: {
  webinarId: string; roomName: string; userId: string;
}): Promise<void> {
  await supabase.from('meeting_presenters').delete()
    .eq('meeting_id', params.webinarId).eq('user_id', params.userId);
  await supabase.from('webinar_speakers').update({ status: 'removed' })
    .eq('webinar_id', params.webinarId).eq('user_id', params.userId);
  await supabase.from('webinar_speaker_requests').update({ status: 'revoked' })
    .eq('webinar_id', params.webinarId).eq('user_id', params.userId);
  try {
    await moderateWebinar(params.webinarId, params.roomName, 'set-role', { identity: params.userId, role: 'attendee' });
  } catch (err) {
    // Already gone from the room — the DB changes above are what matter.
    console.warn('[webinarControl] set-role attendee failed:', err);
  }
}
