// Small Group chat: types and thin wrappers over the database functions in
// supabase/migrations/0404_small_group_chat.sql. The database enforces every
// permission; these helpers only shape the calls and turn errors into the
// plain sentences the functions already raise.

import { supabase } from '@rekindle/supabase';

export const CHAT_BUCKET = 'group-chat-media';
export const MESSAGE_MAX_LENGTH = 2000;
export const MESSAGES_PAGE = 30;

export type ChatMessageType = 'text' | 'scripture' | 'prayer_request' | 'image' | 'system';
export type NotifyLevel = 'all' | 'replies' | 'muted';
export type SmallGroupRole = 'leader' | 'assistant_leader' | 'member';

export interface ChatMessage {
  id: string;
  group_id: string;
  ministry_id: string;
  sender_id: string | null;
  client_id: string;
  message_type: ChatMessageType;
  body: string;
  scripture_ref: string | null;
  prayer_post_id: string | null;
  reply_to_id: string | null;
  attachment_path: string | null;
  attachment_width: number | null;
  attachment_height: number | null;
  pinned_at: string | null;
  pinned_by: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

/** A message as the chat screen holds it: saved, still sending, or failed. */
export interface LocalMessage extends ChatMessage {
  localState?: 'sending' | 'failed';
  /** For a failed/pending image, the file to upload on retry. */
  localFile?: File | null;
  /** Object URL previewing a pending image. */
  localPreviewUrl?: string | null;
  errorText?: string | null;
}

export interface ChatMember {
  user_id: string;
  name: string;
  avatar_url: string | null;
  role: SmallGroupRole;
  joined_at: string;
  chat_muted_until: string | null;
}

export interface GroupChatSummary {
  group_id: string;
  ministry_id: string;
  ministry_name: string | null;
  name: string;
  cover_image_url: string | null;
  category: string | null;
  member_count: number;
  role: SmallGroupRole;
  membership_status: 'active' | 'invited';
  notify_level: NotifyLevel;
  chat_enabled: boolean;
  last_message_at: string | null;
  last_message_type: ChatMessageType | null;
  last_message_body: string | null;
  last_sender_id: string | null;
  last_sender_name: string | null;
  last_message_deleted: boolean | null;
  unread_count: number;
  invited_by_name: string | null;
}

export interface InviteCandidate {
  user_id: string;
  name: string;
  avatar_url: string | null;
  group_status: string | null;
}

export interface ModerationLogEntry {
  id: string;
  action: string;
  created_at: string;
  detail: string | null;
  actor_name: string;
  target_name: string | null;
  target_message_id: string | null;
}

export const MESSAGE_COLUMNS =
  'id, group_id, ministry_id, sender_id, client_id, message_type, body, scripture_ref, prayer_post_id, reply_to_id, ' +
  'attachment_path, attachment_width, attachment_height, pinned_at, pinned_by, created_at, edited_at, deleted_at, deleted_by';

/** The message the database raised, or a plain fallback. */
export function chatErrorText(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const err = e as { message?: string; code?: string } | null;
  if (!err) return fallback;
  if (err.code === '23505') return 'That message was already sent.';
  if (err.code === '42501' && err.message?.includes('row-level security')) {
    return "You don't have permission to do that in this group.";
  }
  if (err.message && /fetch|network|Failed to fetch|Load failed/i.test(err.message)) {
    return 'No connection. Check your internet and try again.';
  }
  return err.message || fallback;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const groupChatApi = {
  myChats: () => rpc<GroupChatSummary[]>('my_group_chats', {}),
  members: (groupId: string) => rpc<ChatMember[]>('group_chat_members', { p_group_id: groupId }),
  markRead: (groupId: string, until: string) =>
    rpc<void>('group_chat_mark_read', { p_group_id: groupId, p_read_until: until }),
  updateMySettings: (groupId: string, settings: { notifyLevel?: NotifyLevel; whatsappNotify?: boolean }) =>
    rpc<void>('small_group_update_my_settings', {
      p_group_id: groupId,
      p_notify_level: settings.notifyLevel ?? null,
      p_whatsapp_notify: settings.whatsappNotify ?? null,
    }),
  inviteCandidates: (groupId: string) =>
    rpc<InviteCandidate[]>('group_chat_invite_candidates', { p_group_id: groupId }),
  invite: (groupId: string, userIds: string[]) =>
    rpc<number>('group_chat_invite', { p_group_id: groupId, p_user_ids: userIds }),
  respondInvite: (groupId: string, accept: boolean) =>
    rpc<void>('group_chat_respond_invite', { p_group_id: groupId, p_accept: accept }),
  leave: (groupId: string) => rpc<void>('group_chat_leave', { p_group_id: groupId }),
  removeMember: (groupId: string, userId: string, reason?: string) =>
    rpc<void>('group_chat_remove_member', { p_group_id: groupId, p_user_id: userId, p_reason: reason || null }),
  muteMember: (groupId: string, userId: string, until: string | null, reason?: string) =>
    rpc<void>('group_chat_mute_member', {
      p_group_id: groupId, p_user_id: userId, p_until: until, p_reason: reason || null,
    }),
  setRole: (groupId: string, userId: string, role: SmallGroupRole) =>
    rpc<void>('group_chat_set_member_role', { p_group_id: groupId, p_user_id: userId, p_role: role }),
  transferLeadership: (groupId: string, newLeader: string) =>
    rpc<void>('group_chat_transfer_leadership', { p_group_id: groupId, p_new_leader: newLeader }),
  pin: (messageId: string, pinned: boolean) =>
    rpc<void>('group_chat_pin_message', { p_message_id: messageId, p_pinned: pinned }),
  /** Returns the removed image's storage prefix, if the message had one. */
  deleteMessage: (messageId: string, reason?: string) =>
    rpc<string | null>('group_chat_delete_message', { p_message_id: messageId, p_reason: reason || null }),
  sharePrayer: (groupId: string, body: string, clientId: string, replyTo?: string | null) =>
    rpc<ChatMessage>('group_chat_share_prayer', {
      p_group_id: groupId, p_body: body, p_client_id: clientId, p_reply_to: replyTo || null,
    }),
  moderationLog: (groupId: string) =>
    rpc<ModerationLogEntry[]>('group_chat_moderation_log', { p_group_id: groupId, p_limit: 100 }),
};

/** Removes both stored sizes of an image message (best effort). */
export async function removeChatImage(prefix: string | null | undefined) {
  if (!prefix) return;
  try {
    await supabase.storage.from(CHAT_BUCKET).remove([`${prefix}-full.jpg`, `${prefix}-thumb.jpg`]);
  } catch {
    /* the message is already gone; a leftover file is only reachable by members */
  }
}

/** Short inbox preview for a group's last message. */
export function lastMessagePreview(s: GroupChatSummary, myId?: string | null): string {
  if (!s.last_message_type) return '';
  if (s.last_message_deleted) return 'Message removed';
  const who = s.last_sender_id && s.last_sender_id === myId ? 'You' : (s.last_sender_name || 'Someone');
  switch (s.last_message_type) {
    case 'image': return `${who} sent a photo`;
    case 'prayer_request': return `${who} shared a prayer request`;
    case 'scripture': return `${who}: ${s.last_message_body || 'shared a Scripture'}`;
    case 'system': return s.last_message_body || '';
    default: return `${who}: ${s.last_message_body || ''}`;
  }
}

export const NOTIFY_LEVEL_LABELS: Record<NotifyLevel, { label: string; description: string }> = {
  all: { label: 'All messages', description: 'A notification when there are new messages.' },
  replies: { label: 'Replies to me', description: 'Only when someone replies to you.' },
  muted: { label: 'Muted', description: 'No notifications. Unread counts still show.' },
};
