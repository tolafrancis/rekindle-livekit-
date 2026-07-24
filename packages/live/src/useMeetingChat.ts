import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@rekindle/supabase';
import type { ChatAttachment } from '@rekindle/types/liveChannelTypes';

export interface MeetingChatMessage {
  id: string;
  user_id: string;
  user_name: string | null;
  content: string;
  created_at: string;
  attachment?: ChatAttachment | null;
}

/**
 * Meeting-level chat that works for everyone in a webinar — including HLS
 * attendees who are not in the Daily room. Backed by the meeting_chat table
 * with Supabase realtime. Degrades quietly if the table/realtime is missing.
 */
export function useMeetingChat(meetingId: string, userId: string, userName: string) {
  const [messages, setMessages] = useState<MeetingChatMessage[]>([]);

  const load = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('meeting_chat')
        .select('id, user_id, user_name, content, created_at, attachment')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: true })
        .limit(300);
      setMessages(data || []);
    } catch {
      /* table may not exist yet — keep current messages */
    }
  }, [meetingId]);

  useEffect(() => {
    if (!meetingId) return;
    load();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`meeting-chat-${meetingId}`)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'meeting_chat', filter: `meeting_id=eq.${meetingId}` },
          (payload) => {
            const m = payload.new as MeetingChatMessage;
            setMessages(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m]));
          })
        .subscribe();
    } catch {
      channel = null;
    }

    // Polling fallback so messages still arrive if realtime is unavailable.
    const poll = setInterval(load, 6000);

    return () => {
      clearInterval(poll);
      try { if (channel) supabase.removeChannel(channel); } catch { /* noop */ }
    };
  }, [meetingId, load]);

  const sendMessage = useCallback(async (content: string, attachment?: ChatAttachment | null) => {
    const text = content.trim();
    if (!text && !attachment) return;
    const { error } = await supabase
      .from('meeting_chat')
      .insert({ meeting_id: meetingId, user_id: userId, user_name: userName, content: text, attachment: attachment || null });
    if (error) console.error('[useMeetingChat] send failed:', error.message, error);
    else load();
  }, [meetingId, userId, userName, load]);

  return { messages, sendMessage };
}
