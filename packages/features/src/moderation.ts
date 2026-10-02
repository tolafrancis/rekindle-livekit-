import { supabase } from '@rekindle/supabase';

// Report + block (Google Play User-Generated Content policy). Server side:
// supabase/migrations/0388_ugc_report_block.sql — flagged_content is the
// report inbox, user_blocks the block list, and the moderation_* RPCs the
// admin actions. The database also enforces the rules (no self-reports,
// banned users can't post, blocked users can't message the blocker), so
// these helpers are a convenience, not the only line of defence.

/** One per UGC table, plus a whole profile. Must match the
 *  flagged_content_content_type_check constraint and public.ugc_source(). */
export type ReportableContentType =
  | 'chat_messages'
  | 'room_chat_messages'
  | 'channel_chat_messages'
  | 'meeting_chat_messages'
  | 'group_messages'
  | 'prayer_group_messages'
  | 'prayer_wall_posts'
  | 'prayer_wall_responses'
  | 'community_activities'
  | 'community_questions'
  | 'community_answers'
  | 'ministry_testimonies'
  | 'voice_notes'
  | 'meeting_chat'
  | 'small_group_posts'
  | 'community_revelations'
  | 'app_testimonies'
  | 'ministry_prayer_requests'
  | 'counselling_session_messages'
  | 'user';

export type ReportReason = 'spam' | 'harassment' | 'hate_speech' | 'sexual_content' | 'violence' | 'other';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'hate_speech', label: 'Hate speech' },
  { value: 'sexual_content', label: 'Sexual content' },
  { value: 'violence', label: 'Violence' },
  { value: 'other', label: 'Other' },
];

export const REPORT_THANKS = 'Thanks, our team will review this within 24 hours.';
export const BLOCK_CONFIRM = "They won't be able to message you and you won't see their posts.";

export interface ReportTarget {
  contentType: ReportableContentType;
  /** Row id of the reported item (uuid or bigint, as text); the user id for 'user'. */
  contentId: string | number;
  /** Who wrote it — used to hide Report on your own content. */
  authorId?: string | null;
  authorName?: string | null;
  contentUrl?: string | null;
  ministryId?: string | null;
}

export interface SubmitReportInput extends ReportTarget {
  reason: ReportReason;
  description?: string;
}

export interface SubmitReportResult {
  ok: boolean;
  /** Set when ok is false. */
  error?: string;
}

export async function submitReport(input: SubmitReportInput): Promise<SubmitReportResult> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return { ok: false, error: 'Please sign in to report content.' };
  if (input.authorId && input.authorId === uid) {
    return { ok: false, error: "You can't report your own content." };
  }

  // No .select(): reporters can insert but (by design) can't read reports back.
  const { error } = await supabase.from('flagged_content').insert({
    content_type: input.contentType,
    content_id: String(input.contentId),
    content_url: input.contentUrl ?? (typeof window !== 'undefined' ? window.location.href : null),
    reason: input.reason,
    description: input.description?.trim() || null,
    flagged_by: uid,
    status: 'pending',
    ministry_id: input.ministryId ?? null,
  });

  // 23505 = this user already has an open report on this item. Same outcome.
  if (error && error.code !== '23505') {
    return { ok: false, error: error.message || 'Could not send your report. Please try again.' };
  }
  return { ok: true };
}

export interface BlockedUser {
  blockedId: string;
  createdAt: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface PublicProfile {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  memberSince: string | null;
}

/** Name/avatar for the profile sheet. Null for a banned or unknown account. */
export async function fetchPublicProfile(userId: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase.rpc('get_public_profile', { p_user_id: userId });
  if (error) throw error;
  const row = ((data ?? []) as { user_id: string; name: string | null; avatar_url: string | null; member_since: string | null }[])[0];
  return row ? { userId: row.user_id, name: row.name, avatarUrl: row.avatar_url, memberSince: row.member_since } : null;
}

export async function fetchBlockedUserIds(): Promise<string[]> {
  const { data, error } = await supabase.from('user_blocks').select('blocked_id');
  if (error) throw error;
  return (data ?? []).map((r: { blocked_id: string }) => r.blocked_id);
}

export async function fetchBlockedUsers(): Promise<BlockedUser[]> {
  // RPC rather than a user_profiles join: profiles RLS only exposes your own row.
  const { data, error } = await supabase.rpc('list_my_blocked_users');
  if (error) throw error;
  return ((data ?? []) as { blocked_id: string; created_at: string; name: string | null; avatar_url: string | null }[])
    .map((r) => ({ blockedId: r.blocked_id, createdAt: r.created_at, name: r.name, avatarUrl: r.avatar_url }));
}

export async function blockUser(blockedId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Please sign in to block users.');
  if (uid === blockedId) throw new Error("You can't block yourself.");
  const { error } = await supabase.from('user_blocks').insert({ blocker_id: uid, blocked_id: blockedId });
  if (error && error.code !== '23505') throw error;
}

export async function unblockUser(blockedId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Please sign in.');
  const { error } = await supabase.from('user_blocks').delete().eq('blocker_id', uid).eq('blocked_id', blockedId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Admin moderation
// ---------------------------------------------------------------------------

export type ReportStatus = 'pending' | 'under_review' | 'resolved' | 'dismissed';

export interface ModerationReport {
  id: string;
  content_type: ReportableContentType | string;
  content_id: string;
  content_url: string | null;
  content_preview: string | null;
  reason: ReportReason | string;
  description: string | null;
  status: ReportStatus;
  action_taken: string | null;
  review_notes: string | null;
  flagged_at: string;
  reviewed_at: string | null;
  flagged_by: string | null;
  reporter_name: string | null;
  reported_user_id: string | null;
  reported_user_name: string | null;
  reported_user_is_banned: boolean;
  ministry_id: string | null;
}

export async function listReports(status?: ReportStatus): Promise<ModerationReport[]> {
  const { data, error } = await supabase.rpc('moderation_list_reports', {
    p_status: status ?? null,
    p_limit: 200,
  });
  if (error) throw error;
  return (data ?? []) as ModerationReport[];
}

export type ModerationAction = 'dismiss' | 'remove' | 'ban';

const ACTION_RPC: Record<ModerationAction, string> = {
  dismiss: 'moderation_dismiss_report',
  remove: 'moderation_remove_content',
  ban: 'moderation_ban_user',
};

export async function moderateReport(reportId: string, action: ModerationAction, notes?: string): Promise<void> {
  const { error } = await supabase.rpc(ACTION_RPC[action], {
    p_report_id: reportId,
    p_notes: notes?.trim() || null,
  });
  if (error) throw error;
}

export function reportReasonLabel(reason: string): string {
  return REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason.replace(/_/g, ' ');
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  chat_messages: 'Meeting chat message',
  room_chat_messages: 'Room chat message',
  channel_chat_messages: 'Live channel chat',
  meeting_chat_messages: 'Meeting chat message',
  group_messages: 'Group message',
  prayer_group_messages: 'Prayer group message',
  prayer_wall_posts: 'Prayer wall post',
  prayer_wall_responses: 'Prayer wall response',
  community_activities: 'Community post',
  community_questions: 'Community question',
  community_answers: 'Community answer',
  ministry_testimonies: 'Testimony',
  voice_notes: 'Voice note',
  meeting_chat: 'Meeting chat message',
  small_group_posts: 'Small group post',
  community_revelations: 'Revelation',
  app_testimonies: 'Testimony',
  ministry_prayer_requests: 'Prayer request',
  counselling_session_messages: 'Counselling chat message',
  user: 'User profile',
};

export function contentTypeLabel(type: string): string {
  return CONTENT_TYPE_LABELS[type] ?? type.replace(/_/g, ' ');
}
