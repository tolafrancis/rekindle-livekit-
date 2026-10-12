// The person's group chats across all their ministries, kept fresh by
// Realtime: any new message they're allowed to see (RLS decides which), and
// any change to their own memberships (invitations, removals), reloads the
// list after a short pause so a busy group doesn't trigger a reload per message.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@rekindle/supabase';
import { randomId } from '@rekindle/ui/uuid';
import { groupChatApi, chatErrorText, type GroupChatSummary } from './groupChatApi';

const RELOAD_DELAY_MS = 1500;

export function useGroupChatInbox(userId: string | undefined, opts: { ministryId?: string; enabled?: boolean } = {}) {
  const { ministryId, enabled = true } = opts;
  const [all, setAll] = useState<GroupChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      const rows = await groupChatApi.myChats();
      if (!mountedRef.current) return;
      setAll(rows || []);
      setError(null);
    } catch (e) {
      if (mountedRef.current) setError(chatErrorText(e, "Your chats couldn't be loaded."));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [userId]);

  const scheduleReload = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setTimeout(() => { timerRef.current = null; reload(); }, RELOAD_DELAY_MS);
  }, [reload]);

  useEffect(() => {
    if (!userId || !enabled) { setLoading(false); return; }
    reload();
    const channel = supabase
      .channel(`group-chat-inbox:${userId}:${randomId().slice(0, 8)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'small_group_messages' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'small_group_members', filter: `user_id=eq.${userId}` }, scheduleReload)
      .subscribe((status) => { if (status === 'SUBSCRIBED') scheduleReload(); });
    const onVisible = () => { if (document.visibilityState === 'visible') scheduleReload(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', scheduleReload);
    // Reading a chat lowers its count; the chat screen announces it.
    window.addEventListener('group-chat-read', scheduleReload);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', scheduleReload);
      window.removeEventListener('group-chat-read', scheduleReload);
      supabase.removeChannel(channel);
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [userId, enabled, reload, scheduleReload]);

  const chats = useMemo(
    () => (ministryId ? all.filter((c) => c.ministry_id === ministryId) : all),
    [all, ministryId],
  );
  const unreadTotal = useMemo(
    () => chats.reduce((n, c) => n + (c.membership_status === 'active' && c.notify_level !== 'muted' ? c.unread_count : 0), 0),
    [chats],
  );
  const inviteCount = useMemo(() => chats.filter((c) => c.membership_status === 'invited').length, [chats]);

  return { chats, loading, error, reload, unreadTotal, inviteCount };
}
