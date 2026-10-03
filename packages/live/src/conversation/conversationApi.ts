import { supabase } from '@rekindle/supabase';
import { publicWebOrigin } from '@rekindle/features/platform';

/**
 * Live Translation → Conversation (bilingual, two-person) — client side of the
 * bilingual-conversation edge function. See migration
 * 0386_bilingual_conversations.sql for the access model.
 */

export type ConversationRole = 'host' | 'guest';

export interface ConversationInfo {
  id: string;
  hostName: string;
  hostLanguage: string;
  guestName: string | null;
  guestLanguage: string | null;
  status: 'waiting' | 'active' | 'ended';
  channelKey: string;
  createdAt: string;
  endedAt: string | null;
}

export interface ConversationEntry {
  id: string;
  speaker_role: ConversationRole;
  speaker_name: string;
  original_text: string;
  original_language: string;
  translated_text: string | null;
  translated_language: string | null;
  translation_failed: boolean;
  client_utterance_id: string;
  created_at: string;
}

export interface ConversationState {
  role: ConversationRole;
  conversation: ConversationInfo;
  entries: ConversationEntry[];
}

/** Languages offered for a conversation. `speech` is the BCP-47 tag the
 *  browser's speech recognition / speech synthesis wants. */
export const CONVERSATION_LANGUAGES: Array<{ value: string; label: string; speech: string }> = [
  { value: 'en', label: 'English', speech: 'en-US' },
  { value: 'vi', label: 'Vietnamese', speech: 'vi-VN' },
  { value: 'es', label: 'Spanish', speech: 'es-ES' },
  { value: 'fr', label: 'French', speech: 'fr-FR' },
  { value: 'pt', label: 'Portuguese', speech: 'pt-BR' },
  { value: 'de', label: 'German', speech: 'de-DE' },
  { value: 'it', label: 'Italian', speech: 'it-IT' },
  { value: 'nl', label: 'Dutch', speech: 'nl-NL' },
  { value: 'pl', label: 'Polish', speech: 'pl-PL' },
  { value: 'ru', label: 'Russian', speech: 'ru-RU' },
  { value: 'uk', label: 'Ukrainian', speech: 'uk-UA' },
  { value: 'tr', label: 'Turkish', speech: 'tr-TR' },
  { value: 'ar', label: 'Arabic', speech: 'ar-SA' },
  { value: 'hi', label: 'Hindi', speech: 'hi-IN' },
  { value: 'id', label: 'Indonesian', speech: 'id-ID' },
  { value: 'tl', label: 'Filipino', speech: 'fil-PH' },
  { value: 'th', label: 'Thai', speech: 'th-TH' },
  { value: 'zh', label: 'Chinese (Mandarin)', speech: 'zh-CN' },
  { value: 'ja', label: 'Japanese', speech: 'ja-JP' },
  { value: 'ko', label: 'Korean', speech: 'ko-KR' },
  { value: 'sw', label: 'Swahili', speech: 'sw-KE' },
  { value: 'yo', label: 'Yoruba', speech: 'yo-NG' },
];

export const languageLabel = (code: string | null | undefined) =>
  CONVERSATION_LANGUAGES.find((l) => l.value === code)?.label || (code ? code.toUpperCase() : '');

export const speechTag = (code: string) =>
  CONVERSATION_LANGUAGES.find((l) => l.value === code)?.speech || code;

/** A best guess at the visitor's own language from the browser, limited
 *  to the languages offered above. */
export function defaultLanguage(): string {
  try {
    const base = (navigator.language || 'en').split('-')[0].toLowerCase();
    if (base === 'fil') return 'tl';
    return CONVERSATION_LANGUAGES.some((l) => l.value === base) ? base : 'en';
  } catch {
    return 'en';
  }
}

export class ConversationApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

const ERROR_COPY: Record<string, string> = {
  network_error: "Couldn't reach the server. Check your connection and try again.",
  server_error: 'Something went wrong on our side. Please try again.',
  unauthorized: 'Please sign in to do that.',
  seat_revoked: 'The host started a new invite, so this device is no longer in the conversation.',
  conversation_not_found: "This conversation doesn't exist.",
  conversation_ended: 'This conversation has ended.',
  invalid_invite: "This invite link isn't valid. Ask the host to send it again.",
  already_joined: 'Someone has already joined with this invite link. Ask the host for a new link.',
  invite_expired: 'This invite link has expired. Ask the host for a new link.',
  invalid_language: 'Please choose a language from the list.',
  not_a_member: 'Only members of this ministry can start a conversation here.',
  text_too_long: 'That was too long to send in one go.',
};

export const conversationErrorMessage = (err: unknown) => {
  const code = err instanceof ConversationApiError ? err.code : 'network_error';
  return ERROR_COPY[code] || ERROR_COPY.server_error;
};

/** Calls the edge function and turns every failure into a
 *  ConversationApiError with the server's error code (or network_error). */
export async function callConversation<T>(body: Record<string, unknown>): Promise<T> {
  let res: { data: unknown; error: unknown };
  try {
    res = await supabase.functions.invoke('bilingual-conversation', { body });
  } catch {
    throw new ConversationApiError('network_error');
  }
  const data = res.data as (T & { error?: string }) | null;
  if (res.error) {
    // supabase-js puts a non-2xx response on error.context; a fetch
    // failure has no Response there at all.
    const ctx = (res.error as { context?: unknown }).context;
    if (typeof Response !== 'undefined' && ctx instanceof Response) {
      const errBody = await ctx.json().catch(() => null);
      throw new ConversationApiError(errBody?.error && ERROR_COPY[errBody.error] ? errBody.error : 'server_error');
    }
    throw new ConversationApiError('network_error');
  }
  if (data?.error) throw new ConversationApiError(ERROR_COPY[data.error] ? data.error : 'server_error');
  return data as T;
}

// ── Guest seat token, kept per conversation so a reload/reconnect on the
//    same device goes straight back in without the (now spent) invite.
const seatKey = (conversationId: string) => `rk-conversation-seat-${conversationId}`;

export function loadSeatToken(conversationId: string): string | null {
  try { return localStorage.getItem(seatKey(conversationId)); } catch { return null; }
}
export function saveSeatToken(conversationId: string, token: string) {
  try { localStorage.setItem(seatKey(conversationId), token); } catch { /* private mode — session only */ }
}
export function clearSeatToken(conversationId: string) {
  try { localStorage.removeItem(seatKey(conversationId)); } catch { /* non-fatal */ }
}

/** The invite token rides in the URL fragment, which browsers never send
 *  to a server, so it stays out of access logs and referrers. */
export const buildInviteLink = (conversationId: string, inviteToken: string) =>
  `${publicWebOrigin()}/conversation/${conversationId}#invite=${inviteToken}`;

export const newUtteranceId = () => {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
};
