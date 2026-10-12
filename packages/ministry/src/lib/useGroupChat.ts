// Live conversation for one small group: paged history, Supabase Realtime
// updates, optimistic sending with retry, read position, and members.
//
// Delivery model (see 0404): rows are inserted with a device-generated
// client_id that is unique per sender, so a retried send can never be saved
// twice, and the realtime copy of our own message is matched to the pending
// one by client_id instead of being shown again. Order is the server's
// created_at, then id, so every member sees the same sequence.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@rekindle/supabase';
import { randomId } from '@rekindle/ui/uuid';
import {
  groupChatApi, chatErrorText, removeChatImage,
  MESSAGE_COLUMNS, MESSAGES_PAGE, MESSAGE_MAX_LENGTH,
  type ChatMember, type ChatMessage, type LocalMessage,
} from './groupChatApi';
import { chatImagePrefix, prepareChatImage, uploadChatImage } from './groupChatImages';

const byTime = (a: ChatMessage, b: ChatMessage) =>
  a.created_at === b.created_at ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.created_at < b.created_at ? -1 : 1;

/** Saved messages in server order, then this device's unsent ones in the order they were written. */
function sortMessages(list: LocalMessage[]): LocalMessage[] {
  const saved = list.filter((m) => !m.localState).sort(byTime);
  const local = list.filter((m) => m.localState).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  return [...saved, ...local];
}

/** Adds or replaces messages by id, and swaps a pending message for its saved row by client_id. */
function mergeMessages(prev: LocalMessage[], incoming: ChatMessage[]): LocalMessage[] {
  if (!incoming.length) return prev;
  const next = [...prev];
  for (const msg of incoming) {
    const byId = next.findIndex((m) => m.id === msg.id);
    if (byId >= 0) {
      next[byId] = { ...msg };
      continue;
    }
    const pending = next.findIndex((m) => m.localState && m.client_id === msg.client_id && m.sender_id === msg.sender_id);
    if (pending >= 0) {
      const old = next[pending];
      if (old.localPreviewUrl) URL.revokeObjectURL(old.localPreviewUrl);
      next[pending] = { ...msg };
      continue;
    }
    next.push({ ...msg });
  }
  return sortMessages(next);
}

export interface SendInput {
  kind: 'text' | 'scripture' | 'prayer_request' | 'image';
  body?: string;
  scriptureRef?: string | null;
  file?: File | null;
  replyToId?: string | null;
}

export interface MyMembership {
  role: 'leader' | 'assistant_leader' | 'member';
  status: string;
  notify_level: 'all' | 'replies' | 'muted';
  chat_muted_until: string | null;
  whatsapp_notify: boolean | null;
}

export function useGroupChat(groupId: string, userId: string | undefined) {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [removed, setRemoved] = useState(false);
  const [connection, setConnection] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');
  const [initialReadAt, setInitialReadAt] = useState<string | null>(null);

  const messagesRef = useRef<LocalMessage[]>([]);
  messagesRef.current = messages;
  const mountedRef = useRef(true);
  const readTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingReadRef = useRef<string | null>(null);
  const lastSentReadRef = useRef<string | null>(null);
  const membersRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const membersRef = useRef<ChatMember[]>([]);
  membersRef.current = members;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const memberById = useMemo(() => {
    const map = new Map<string, ChatMember>();
    members.forEach((m) => map.set(m.user_id, m));
    return map;
  }, [members]);

  const loadMembers = useCallback(async () => {
    try {
      const list = await groupChatApi.members(groupId);
      if (mountedRef.current) setMembers(list || []);
    } catch {
      /* the chat still works with "Member" as the name */
    }
  }, [groupId]);

  const scheduleMembersRefresh = useCallback(() => {
    if (membersRefreshRef.current) return;
    membersRefreshRef.current = setTimeout(() => {
      membersRefreshRef.current = null;
      loadMembers();
    }, 1500);
  }, [loadMembers]);

  const loadMembership = useCallback(async () => {
    if (!userId) return null;
    const { data } = await supabase
      .from('small_group_members')
      .select('role, status, notify_level, chat_muted_until, whatsapp_notify, last_read_at, joined_at, created_at')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!mountedRef.current) return data;
    setMembership(data ? {
      role: data.role, status: data.status, notify_level: data.notify_level,
      chat_muted_until: data.chat_muted_until, whatsapp_notify: data.whatsapp_notify,
    } : null);
    return data;
  }, [groupId, userId]);

  // Newest page on open.
  const loadLatest = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const mine = await loadMembership();
      if (!mountedRef.current) return;
      if (!mine || mine.status !== 'active') {
        // Leaders of the ministry can read without a membership row; let the
        // select decide, and only flag "removed" for an explicit removal.
        if (mine?.status === 'removed') setRemoved(true);
      }
      setInitialReadAt(mine?.last_read_at || mine?.joined_at || mine?.created_at || null);
      const { data, error } = await supabase
        .from('small_group_messages')
        .select(MESSAGE_COLUMNS)
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(MESSAGES_PAGE);
      if (error) throw error;
      if (!mountedRef.current) return;
      const rows = ((data || []) as unknown as ChatMessage[]).reverse();
      setMessages((prev) => mergeMessages(prev.filter((m) => m.localState), rows));
      setHasOlder(rows.length === MESSAGES_PAGE);
    } catch (e) {
      if (mountedRef.current) setLoadError(chatErrorText(e, "Messages couldn't be loaded."));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [groupId, loadMembership]);

  // Messages newer than the newest one held (after a reconnect or resume).
  const catchUp = useCallback(async () => {
    const saved = messagesRef.current.filter((m) => !m.localState);
    const newest = saved[saved.length - 1];
    if (!newest) return loadLatest();
    const { data, error } = await supabase
      .from('small_group_messages')
      .select(MESSAGE_COLUMNS)
      .eq('group_id', groupId)
      .gte('created_at', newest.created_at)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error || !mountedRef.current) return;
    setMessages((prev) => mergeMessages(prev, (data || []) as unknown as ChatMessage[]));
    // Hides/pins that happened while away arrive as updates we missed; the
    // pinned list is small, so refresh it too.
    const { data: pinned } = await supabase
      .from('small_group_messages')
      .select(MESSAGE_COLUMNS)
      .eq('group_id', groupId)
      .not('pinned_at', 'is', null);
    if (pinned && mountedRef.current) {
      const held = new Set(messagesRef.current.map((m) => m.id));
      setMessages((prev) => mergeMessages(prev, (pinned as unknown as ChatMessage[]).filter((m) => held.has(m.id))));
    }
    loadMembership();
  }, [groupId, loadLatest, loadMembership]);

  const loadOlder = useCallback(async () => {
    const saved = messagesRef.current.filter((m) => !m.localState);
    const oldest = saved[0];
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const { data, error } = await supabase
        .from('small_group_messages')
        .select(MESSAGE_COLUMNS)
        .eq('group_id', groupId)
        .or(`created_at.lt."${oldest.created_at}",and(created_at.eq."${oldest.created_at}",id.lt.${oldest.id})`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(MESSAGES_PAGE);
      if (error) throw error;
      const rows = (data || []) as unknown as ChatMessage[];
      if (mountedRef.current) {
        setMessages((prev) => mergeMessages(prev, rows));
        setHasOlder(rows.length === MESSAGES_PAGE);
      }
    } catch (e) {
      if (mountedRef.current) setLoadError(chatErrorText(e, "Older messages couldn't be loaded."));
    } finally {
      if (mountedRef.current) setLoadingOlder(false);
    }
  }, [groupId, loadingOlder]);

  // Fetch one message (e.g. the original of a reply that isn't loaded).
  const fetchMessage = useCallback(async (id: string): Promise<ChatMessage | null> => {
    const held = messagesRef.current.find((m) => m.id === id);
    if (held) return held;
    const { data } = await supabase.from('small_group_messages').select(MESSAGE_COLUMNS).eq('id', id).maybeSingle();
    return (data as unknown as ChatMessage) || null;
  }, []);

  // Initial load + realtime subscription, one channel per open chat.
  useEffect(() => {
    if (!groupId || !userId) return;
    setMessages([]);
    setRemoved(false);
    setConnection('connecting');
    loadLatest();
    loadMembers();

    let wasLive = false;
    const channel = supabase
      .channel(`group-chat:${groupId}:${randomId().slice(0, 8)}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'small_group_messages', filter: `group_id=eq.${groupId}` },
        (payload) => {
          const msg = payload.new as ChatMessage;
          setMessages((prev) => mergeMessages(prev, [msg]));
          if (msg.sender_id && !membersRef.current.some((m) => m.user_id === msg.sender_id)) scheduleMembersRefresh();
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'small_group_messages', filter: `group_id=eq.${groupId}` },
        (payload) => {
          const msg = payload.new as ChatMessage;
          // Only update what's on screen; an old message we never loaded stays unloaded.
          if (messagesRef.current.some((m) => m.id === msg.id)) setMessages((prev) => mergeMessages(prev, [msg]));
        })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'small_group_members', filter: `group_id=eq.${groupId}` },
        (payload) => {
          const row = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as { user_id?: string; status?: string };
          if (row?.user_id === userId) {
            if (payload.eventType === 'DELETE' || row.status === 'removed') setRemoved(true);
            loadMembership();
          }
          scheduleMembersRefresh();
        })
      .subscribe((status) => {
        if (!mountedRef.current) return;
        if (status === 'SUBSCRIBED') {
          setConnection('live');
          if (wasLive) catchUp();
          wasLive = true;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnection('reconnecting');
        }
      });

    const onVisible = () => { if (document.visibilityState === 'visible') catchUp(); };
    const onOnline = () => catchUp();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      supabase.removeChannel(channel);
      if (membersRefreshRef.current) { clearTimeout(membersRefreshRef.current); membersRefreshRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, userId]);

  // ── Read position ──────────────────────────────────────────────────
  const flushRead = useCallback(() => {
    readTimerRef.current = null;
    const until = pendingReadRef.current;
    if (!until || (lastSentReadRef.current && until <= lastSentReadRef.current)) return;
    lastSentReadRef.current = until;
    groupChatApi.markRead(groupId, until)
      .then(() => window.dispatchEvent(new CustomEvent('group-chat-read', { detail: { groupId } })))
      .catch(() => { lastSentReadRef.current = null; });
  }, [groupId]);

  /** Call with the created_at of a message the person has actually seen. */
  const noteSeen = useCallback((createdAt: string) => {
    if (document.visibilityState !== 'visible') return;
    if (!pendingReadRef.current || createdAt > pendingReadRef.current) pendingReadRef.current = createdAt;
    if (!readTimerRef.current) readTimerRef.current = setTimeout(flushRead, 1200);
  }, [flushRead]);

  useEffect(() => () => {
    if (readTimerRef.current) { clearTimeout(readTimerRef.current); flushRead(); }
  }, [flushRead]);

  // ── Sending ────────────────────────────────────────────────────────
  const patchLocal = useCallback((clientId: string, patch: Partial<LocalMessage>) => {
    setMessages((prev) => prev.map((m) => (m.localState && m.client_id === clientId ? { ...m, ...patch } : m)));
  }, []);

  const deliver = useCallback(async (msg: LocalMessage) => {
    try {
      let saved: ChatMessage;
      if (msg.message_type === 'prayer_request') {
        saved = await groupChatApi.sharePrayer(groupId, msg.body, msg.client_id, msg.reply_to_id);
      } else {
        if (msg.message_type === 'image') {
          if (!msg.localFile) throw new Error('Choose the photo again to resend it.');
          const prepared = await prepareChatImage(msg.localFile);
          const prefix = chatImagePrefix(groupId, userId!, msg.client_id);
          await uploadChatImage(prefix, prepared);
          msg = { ...msg, attachment_path: prefix, attachment_width: prepared.width, attachment_height: prepared.height };
        }
        const { data, error } = await supabase
          .from('small_group_messages')
          .insert({
            group_id: groupId,
            client_id: msg.client_id,
            message_type: msg.message_type,
            body: msg.body,
            scripture_ref: msg.scripture_ref,
            reply_to_id: msg.reply_to_id,
            attachment_path: msg.attachment_path,
            attachment_width: msg.attachment_width,
            attachment_height: msg.attachment_height,
          })
          .select(MESSAGE_COLUMNS)
          .single();
        if (error) {
          // Saved on an earlier attempt whose reply was lost: fetch it.
          if (error.code === '23505') {
            const { data: existing } = await supabase.from('small_group_messages').select(MESSAGE_COLUMNS)
              .eq('sender_id', userId!).eq('client_id', msg.client_id).maybeSingle();
            if (existing) { saved = existing as unknown as ChatMessage; setMessages((p) => mergeMessages(p, [saved])); return; }
          }
          throw error;
        }
        saved = data as unknown as ChatMessage;
      }
      if (mountedRef.current) setMessages((prev) => mergeMessages(prev, [saved]));
    } catch (e) {
      if (mountedRef.current) patchLocal(msg.client_id, { localState: 'failed', errorText: chatErrorText(e, 'Not sent.') });
    }
  }, [groupId, userId, patchLocal]);

  const send = useCallback((input: SendInput): string | null => {
    if (!userId) return 'Please sign in again.';
    const body = (input.body || '').trim();
    if (input.kind === 'scripture' ? !input.scriptureRef : input.kind !== 'image' && !body) return null;
    if (body.length > MESSAGE_MAX_LENGTH) return `Messages can be up to ${MESSAGE_MAX_LENGTH.toLocaleString()} characters.`;
    const clientId = randomId();
    const local: LocalMessage = {
      id: `local-${clientId}`,
      group_id: groupId,
      ministry_id: '',
      sender_id: userId,
      client_id: clientId,
      message_type: input.kind,
      body,
      scripture_ref: input.kind === 'scripture' ? input.scriptureRef || null : null,
      prayer_post_id: null,
      reply_to_id: input.replyToId || null,
      attachment_path: null,
      attachment_width: null,
      attachment_height: null,
      pinned_at: null,
      pinned_by: null,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      deleted_by: null,
      localState: 'sending',
      localFile: input.file || null,
      localPreviewUrl: input.file ? URL.createObjectURL(input.file) : null,
    };
    setMessages((prev) => [...prev, local]);
    deliver(local);
    return null;
  }, [groupId, userId, deliver]);

  const retry = useCallback((clientId: string) => {
    const msg = messagesRef.current.find((m) => m.localState === 'failed' && m.client_id === clientId);
    if (!msg) return;
    patchLocal(clientId, { localState: 'sending', errorText: null });
    deliver({ ...msg, localState: 'sending' });
  }, [deliver, patchLocal]);

  const discard = useCallback((clientId: string) => {
    setMessages((prev) => prev.filter((m) => {
      if (m.localState && m.client_id === clientId) {
        if (m.localPreviewUrl) URL.revokeObjectURL(m.localPreviewUrl);
        return false;
      }
      return true;
    }));
  }, []);

  // ── Message actions ────────────────────────────────────────────────
  const deleteMessage = useCallback(async (id: string, reason?: string) => {
    const prefix = await groupChatApi.deleteMessage(id, reason);
    await removeChatImage(prefix);
    const { data } = await supabase.from('small_group_messages').select(MESSAGE_COLUMNS).eq('id', id).maybeSingle();
    if (data) setMessages((prev) => mergeMessages(prev, [data as unknown as ChatMessage]));
  }, []);

  const setPinned = useCallback(async (id: string, pinned: boolean) => {
    await groupChatApi.pin(id, pinned);
    const { data } = await supabase.from('small_group_messages').select(MESSAGE_COLUMNS).eq('id', id).maybeSingle();
    if (data) setMessages((prev) => mergeMessages(prev, [data as unknown as ChatMessage]));
  }, []);

  // Release object URLs on close.
  useEffect(() => () => {
    messagesRef.current.forEach((m) => { if (m.localPreviewUrl) URL.revokeObjectURL(m.localPreviewUrl); });
  }, []);

  return {
    messages, loading, loadError, hasOlder, loadingOlder, loadOlder, reload: loadLatest,
    members, memberById, reloadMembers: loadMembers, membership, reloadMembership: loadMembership,
    removed, connection, initialReadAt,
    send, retry, discard, deleteMessage, setPinned, fetchMessage, noteSeen,
  };
}
