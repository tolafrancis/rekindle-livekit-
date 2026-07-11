import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface PresenceMember {
  userId: string;
  userName: string;
  isGuest: boolean;
}

/**
 * Tracks who is currently in a webinar using Supabase Realtime Presence.
 * Everyone (host + audience) joins the same channel and announces themselves;
 * the host reads the roster so they can invite a viewer up to speak directly.
 * Presence is ephemeral — when someone closes the tab they drop off the list.
 */
export function useMeetingPresence(
  meetingId: string,
  userId: string,
  userName: string,
  isGuest: boolean,
  enabled: boolean
) {
  const [members, setMembers] = useState<PresenceMember[]>([]);

  useEffect(() => {
    if (!enabled || !meetingId || !userId) return;

    const channel = supabase.channel(`meeting-presence-${meetingId}`, {
      config: { presence: { key: userId } },
    });

    channel.on('presence', { event: 'sync' }, () => {
      try {
        const state = channel.presenceState() as Record<string, any[]>;
        const list: PresenceMember[] = [];
        const seen = new Set<string>();
        Object.values(state).forEach(arr => {
          arr.forEach((m: any) => {
            if (m?.userId && !seen.has(m.userId)) {
              seen.add(m.userId);
              list.push({ userId: m.userId, userName: m.userName || 'Guest', isGuest: !!m.isGuest });
            }
          });
        });
        setMembers(list);
      } catch {
        /* noop */
      }
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        try {
          await channel.track({ userId, userName, isGuest });
        } catch {
          /* noop */
        }
      }
    });

    return () => {
      try { supabase.removeChannel(channel); } catch { /* noop */ }
    };
  }, [meetingId, userId, userName, isGuest, enabled]);

  return members;
}
