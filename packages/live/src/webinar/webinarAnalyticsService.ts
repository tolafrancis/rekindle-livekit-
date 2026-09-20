import { supabase } from '@rekindle/supabase';
import type { MinistryWebinar } from './webinarControl';

// Mirrors liveChannelAnalyticsService.ts's attendance/engagement/replay shape,
// sourced from ministry_webinars + the two webinar_attendance_summary/
// webinar_registrant_attendance RPCs (meeting_attendance itself has
// service-role-only RLS, so those RPCs are the only client-facing door).

export interface WebinarAttendanceSummary {
  registeredCount: number;
  attendedCount: number;
  noShowCount: number;
  avgDurationMinutes: number | null;
}

export interface WebinarRegistrantDetail {
  userId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  attended: boolean;
  joinedAt: string | null;
  leftAt: string | null;
  durationMinutes: number | null;
}

export interface WebinarEngagementSummary {
  questionsAsked: number;
  questionsApproved: number;
  questionsAnswered: number;
  pollsRun: number;
  pollVotesCast: number;
  chatMessages: number;
}

export interface WebinarReplaySummary {
  recordingUrl: string | null;
  recordingDurationSeconds: number | null;
  recordingStatus: string | null;
  attendeeCount: number;
}

export async function getAttendanceSummary(webinarId: string): Promise<WebinarAttendanceSummary | null> {
  const { data, error } = await supabase.rpc('webinar_attendance_summary', { p_webinar_id: webinarId });
  if (error) { console.error('[webinarAnalyticsService] getAttendanceSummary failed:', error.message); return null; }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    registeredCount: row.registered_count ?? 0,
    attendedCount: row.attended_count ?? 0,
    noShowCount: row.no_show_count ?? 0,
    avgDurationMinutes: row.avg_duration_minutes ?? null,
  };
}

export async function getRegistrantDetail(webinarId: string): Promise<WebinarRegistrantDetail[]> {
  const { data, error } = await supabase.rpc('webinar_registrant_attendance', { p_webinar_id: webinarId });
  if (error) { console.error('[webinarAnalyticsService] getRegistrantDetail failed:', error.message); return []; }
  return ((data ?? []) as any[]).map((r) => ({
    userId: r.user_id ?? null,
    guestName: r.guest_name ?? null,
    guestEmail: r.guest_email ?? null,
    attended: !!r.attended,
    joinedAt: r.joined_at ?? null,
    leftAt: r.left_at ?? null,
    durationMinutes: r.duration_minutes ?? null,
  }));
}

export async function getEngagementSummary(webinarId: string): Promise<WebinarEngagementSummary> {
  const [questions, polls, chat] = await Promise.all([
    supabase.from('webinar_questions').select('status').eq('webinar_id', webinarId),
    supabase.from('webinar_polls').select('id').eq('webinar_id', webinarId),
    supabase.from('meeting_chat').select('id', { count: 'exact', head: true }).eq('meeting_id', webinarId),
  ]);

  const questionRows = (questions.data ?? []) as { status: string }[];
  const pollIds = ((polls.data ?? []) as { id: string }[]).map((p) => p.id);
  const pollVotes = pollIds.length
    ? await supabase.from('webinar_poll_votes').select('id', { count: 'exact', head: true }).in('poll_id', pollIds)
    : { count: 0 };

  return {
    questionsAsked: questionRows.length,
    questionsApproved: questionRows.filter((q) => q.status === 'approved' || q.status === 'answered').length,
    questionsAnswered: questionRows.filter((q) => q.status === 'answered').length,
    pollsRun: pollIds.length,
    pollVotesCast: pollVotes.count ?? 0,
    chatMessages: chat.count ?? 0,
  };
}

export function getReplaySummary(webinar: MinistryWebinar): WebinarReplaySummary {
  return {
    recordingUrl: webinar.recording_url,
    recordingDurationSeconds: webinar.recording_duration_seconds,
    recordingStatus: webinar.recording_status,
    attendeeCount: webinar.attendee_count,
  };
}
