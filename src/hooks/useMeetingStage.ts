import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export interface RaisedHand {
  user_id: string;
  user_name: string | null;
}

export interface Presenter {
  user_id: string;
  user_name: string | null;
  role: string;
}

/**
 * Manages the "stage" of a webinar meeting: who is a presenter (publishes in the
 * live Daily call) and who has raised a hand. The host is always a presenter.
 * Updates live via Supabase realtime so a promoted attendee switches from HLS
 * to the live call automatically.
 */
export function useMeetingStage(
  meetingId: string,
  userId: string,
  userName: string,
  isHost: boolean,
  maxSeats: number = 8
) {
  const [presenters, setPresenters] = useState<Presenter[]>([]);
  const [raisedHands, setRaisedHands] = useState<RaisedHand[]>([]);

  const isPresenter = isHost || presenters.some(p => p.user_id === userId);
  const hasRaisedHand = raisedHands.some(h => h.user_id === userId);
  // The host sits OUTSIDE the seat count, so seats = presenter rows.
  const seatsTaken = presenters.length;
  const seatsFull = seatsTaken >= maxSeats;

  const loadPresenters = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('meeting_presenters')
        .select('user_id, user_name, role')
        .eq('meeting_id', meetingId);
      setPresenters(data || []);
    } catch {
      setPresenters([]);
    }
  }, [meetingId]);

  const loadHands = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('meeting_raised_hands')
        .select('user_id, user_name')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: true });
      setRaisedHands(data || []);
    } catch {
      setRaisedHands([]);
    }
  }, [meetingId]);

  useEffect(() => {
    if (!meetingId) return;
    loadPresenters();
    loadHands();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`meeting-stage-${meetingId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'meeting_presenters', filter: `meeting_id=eq.${meetingId}` },
          loadPresenters)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'meeting_raised_hands', filter: `meeting_id=eq.${meetingId}` },
          loadHands)
        .subscribe();
    } catch {
      channel = null;
    }

    // Polling fallback so the host still sees raised hands / promotions if realtime is unavailable.
    const poll = setInterval(() => { loadPresenters(); loadHands(); }, 5000);

    return () => {
      clearInterval(poll);
      try { if (channel) supabase.removeChannel(channel); } catch { /* noop */ }
    };
  }, [meetingId, loadPresenters, loadHands]);

  const raiseHand = useCallback(async () => {
    // delete-then-insert avoids ON CONFLICT (no dependency on a unique constraint)
    await supabase.from('meeting_raised_hands').delete().eq('meeting_id', meetingId).eq('user_id', userId);
    const { error } = await supabase
      .from('meeting_raised_hands')
      .insert({ meeting_id: meetingId, user_id: userId, user_name: userName });
    if (error) {
      console.error('[useMeetingStage] raiseHand failed:', error.message, error);
      toast.error(`Couldn't raise hand: ${error.message}`);
    } else loadHands();
  }, [meetingId, userId, userName, loadHands]);

  const lowerHand = useCallback(async () => {
    const { error } = await supabase
      .from('meeting_raised_hands')
      .delete()
      .eq('meeting_id', meetingId)
      .eq('user_id', userId);
    if (error) console.error('[useMeetingStage] lowerHand failed:', error.message, error);
    else loadHands();
  }, [meetingId, userId, loadHands]);

  // Atomically take one of the limited live seats (used both for a participant
  // claiming a seat on join, and for the host promoting a raised hand). Returns
  // true if a seat was secured, false if all seats are full.
  const claimSeat = useCallback(async (uid: string = userId, name: string | null = userName) => {
    try {
      const { data, error } = await supabase.rpc('claim_meeting_seat', {
        p_meeting_id: meetingId,
        p_user_id: uid,
        p_user_name: name,
        p_max: maxSeats,
      });
      if (error) {
        console.error('[useMeetingStage] claimSeat failed:', error.message, error);
        return false;
      }
      if (data === true) {
        // They're seated now — clear any raised hand and refresh the stage
        await supabase.from('meeting_raised_hands').delete().eq('meeting_id', meetingId).eq('user_id', uid);
        loadPresenters();
        loadHands();
      }
      return data === true;
    } catch (e) {
      console.error('[useMeetingStage] claimSeat threw:', e);
      return false;
    }
  }, [meetingId, userId, userName, maxSeats, loadPresenters, loadHands]);

  // Host action: invite a raised hand up to the stage (respects the seat cap)
  const invitePresenter = useCallback(async (uid: string, name: string | null) => {
    const ok = await claimSeat(uid, name);
    if (!ok) toast.error(`All ${maxSeats} live seats are full`);
  }, [claimSeat, maxSeats]);

  // Host action: send a presenter back to the audience
  const removePresenter = useCallback(async (uid: string) => {
    await supabase
      .from('meeting_presenters')
      .delete()
      .eq('meeting_id', meetingId)
      .eq('user_id', uid);
  }, [meetingId]);

  return {
    presenters,
    raisedHands,
    isPresenter,
    hasRaisedHand,
    seatsTaken,
    seatsFull,
    maxSeats,
    raiseHand,
    lowerHand,
    claimSeat,
    invitePresenter,
    removePresenter,
  };
}
