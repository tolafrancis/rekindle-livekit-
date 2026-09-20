import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@rekindle/supabase';
import { toast } from 'sonner';

export type SpeakerRequestStatus = 'requested' | 'invited' | 'accepted' | 'declined' | 'withdrawn' | 'revoked';

export interface WebinarSpeakerRequest {
  id: string;
  webinar_id: string;
  user_id: string;
  user_name: string | null;
  status: SpeakerRequestStatus;
  requested_at: string;
  invited_at: string | null;
  accepted_at: string | null;
  granted_at: string | null;
}

/**
 * Live "attendee requests to speak" handshake for a webinar (webinar_speaker_requests) —
 * the Phase 1 counterpart to useMeetingStage's raise-hand, but with an explicit
 * host-invite/attendee-accept round trip instead of a single-step promotion, since a
 * webinar attendee has no LiveKit token until they accept (see webinarControl.ts header).
 * Mirrors useMeetingStage.ts's realtime + polling-fallback shape.
 */
export function useWebinarSpeakerRequests(webinarId: string, userId: string, userName: string, isHost: boolean) {
  const [requests, setRequests] = useState<WebinarSpeakerRequest[]>([]);

  const myRequest = requests.find((r) => r.user_id === userId) ?? null;

  const load = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('webinar_speaker_requests')
        .select('*')
        .eq('webinar_id', webinarId)
        .order('requested_at', { ascending: true });
      setRequests((data ?? []) as WebinarSpeakerRequest[]);
    } catch {
      setRequests([]);
    }
  }, [webinarId]);

  useEffect(() => {
    if (!webinarId) return;
    load();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`webinar-speaker-requests-${webinarId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'webinar_speaker_requests', filter: `webinar_id=eq.${webinarId}` },
          load)
        .subscribe();
    } catch {
      channel = null;
    }

    const poll = setInterval(load, 5000);
    return () => {
      clearInterval(poll);
      try { if (channel) supabase.removeChannel(channel); } catch { /* noop */ }
    };
  }, [webinarId, load]);

  // Attendee action: ask to be invited up to the stage.
  const requestToSpeak = useCallback(async () => {
    const { error } = await supabase.from('webinar_speaker_requests').upsert(
      { webinar_id: webinarId, user_id: userId, user_name: userName, status: 'requested', requested_at: new Date().toISOString() },
      { onConflict: 'webinar_id,user_id' },
    );
    if (error) {
      console.error('[useWebinarSpeakerRequests] requestToSpeak failed:', error.message);
      toast.error(`Couldn't send request: ${error.message}`);
    } else load();
  }, [webinarId, userId, userName, load]);

  const withdrawRequest = useCallback(async () => {
    const { error } = await supabase
      .from('webinar_speaker_requests')
      .update({ status: 'withdrawn' })
      .eq('webinar_id', webinarId).eq('user_id', userId);
    if (error) console.error('[useWebinarSpeakerRequests] withdrawRequest failed:', error.message);
    else load();
  }, [webinarId, userId, load]);

  // Host action: invite a requester (or anyone) up to the stage.
  const hostInvite = useCallback(async (uid: string, name: string | null) => {
    if (!isHost) return;
    const { error } = await supabase.from('webinar_speaker_requests').upsert(
      { webinar_id: webinarId, user_id: uid, user_name: name, status: 'invited', invited_at: new Date().toISOString() },
      { onConflict: 'webinar_id,user_id' },
    );
    if (error) {
      console.error('[useWebinarSpeakerRequests] hostInvite failed:', error.message);
      toast.error(`Couldn't invite: ${error.message}`);
    } else load();
  }, [isHost, webinarId, load]);

  // Attendee action: accept a host invite — grants a real 'speaker' token (resolveRole
  // in livekit-token picks this up via the 'accepted' status) and seats them on stage.
  const acceptInvite = useCallback(async () => {
    const { error } = await supabase
      .from('webinar_speaker_requests')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('webinar_id', webinarId).eq('user_id', userId);
    if (error) {
      console.error('[useWebinarSpeakerRequests] acceptInvite failed:', error.message);
      toast.error(`Couldn't accept: ${error.message}`);
      return false;
    }
    const { error: seatError } = await supabase
      .from('meeting_presenters')
      .upsert({ meeting_id: webinarId, user_id: userId, user_name: userName, role: 'speaker' }, { onConflict: 'meeting_id,user_id' });
    if (seatError) console.error('[useWebinarSpeakerRequests] seating after accept failed:', seatError.message);
    await load();
    return true;
  }, [webinarId, userId, userName, load]);

  const declineInvite = useCallback(async () => {
    const { error } = await supabase
      .from('webinar_speaker_requests')
      .update({ status: 'declined' })
      .eq('webinar_id', webinarId).eq('user_id', userId);
    if (error) console.error('[useWebinarSpeakerRequests] declineInvite failed:', error.message);
    else load();
  }, [webinarId, userId, load]);

  // Host action: send a live speaker back to viewer-only.
  const revoke = useCallback(async (uid: string) => {
    if (!isHost) return;
    await supabase.from('meeting_presenters').delete().eq('meeting_id', webinarId).eq('user_id', uid);
    const { error } = await supabase
      .from('webinar_speaker_requests')
      .update({ status: 'revoked' })
      .eq('webinar_id', webinarId).eq('user_id', uid);
    if (error) console.error('[useWebinarSpeakerRequests] revoke failed:', error.message);
    else load();
  }, [isHost, webinarId, load]);

  return {
    requests,
    myRequest,
    pendingRequests: requests.filter((r) => r.status === 'requested'),
    requestToSpeak,
    withdrawRequest,
    hostInvite,
    acceptInvite,
    declineInvite,
    revoke,
  };
}
