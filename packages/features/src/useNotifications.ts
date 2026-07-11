import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@rekindle/supabase';
import { useAuth } from './AuthContext';

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  ministry_id?: string;
  sender_name?: string;
  is_read: boolean;
  created_at: string;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setNotifications([]); setUnreadCount(0); setLoading(false); return; }
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    const items = data || [];
    setNotifications(items);
    setUnreadCount(items.filter(n => !n.is_read).length);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription — new rows for this user
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const n = payload.new as AppNotification;
        setNotifications(prev => [n, ...prev]);
        setUnreadCount(c => c + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markRead = useCallback(async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(c => Math.max(0, c - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true })
      .eq('user_id', user.id).eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [user]);

  const dismiss = useCallback(async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications(prev => {
      const removed = prev.find(n => n.id === id);
      if (removed && !removed.is_read) setUnreadCount(c => Math.max(0, c - 1));
      return prev.filter(n => n.id !== id);
    });
  }, []);

  return { notifications, unreadCount, loading, markRead, markAllRead, dismiss, reload: load };
}
