import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface FloatingReaction {
  id: string;
  emoji: string;
  x: number; // horizontal position, 0–100%
}

/**
 * Live, ephemeral reactions for a webinar. Uses Supabase Realtime *broadcast*
 * (not a table) — reactions are transient by nature, so nothing is persisted.
 * Everyone on the channel sees each reaction float up and disappear.
 */
export function useMeetingReactions(meetingId: string, enabled: boolean = true) {
  const [floating, setFloating] = useState<FloatingReaction[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const spawn = useCallback((emoji: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const x = 8 + Math.random() * 84;
    setFloating((prev) => [...prev.slice(-40), { id, emoji, x }]);
    setTimeout(() => {
      setFloating((prev) => prev.filter((f) => f.id !== id));
    }, 3200);
  }, []);

  useEffect(() => {
    if (!meetingId || !enabled) return;
    const channel = supabase.channel(`meeting-reactions-${meetingId}`, {
      config: { broadcast: { self: false } },
    });
    channel.on('broadcast', { event: 'reaction' }, (payload) => {
      const emoji = (payload?.payload as { emoji?: string })?.emoji;
      if (emoji) spawn(emoji);
    });
    channel.subscribe();
    channelRef.current = channel;

    return () => {
      try { supabase.removeChannel(channel); } catch { /* noop */ }
      channelRef.current = null;
    };
  }, [meetingId, enabled, spawn]);

  const sendReaction = useCallback((emoji: string) => {
    spawn(emoji); // show our own immediately (broadcast self is off)
    try {
      channelRef.current?.send({ type: 'broadcast', event: 'reaction', payload: { emoji } });
    } catch { /* noop */ }
  }, [spawn]);

  return { floating, sendReaction };
}
