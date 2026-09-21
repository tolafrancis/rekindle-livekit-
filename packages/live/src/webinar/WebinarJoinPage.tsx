import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useActiveCall } from '../ActiveCallContext';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '@rekindle/features/AuthContext';
import RegisterMeetingButton from '../components/RegisterMeetingButton';
import { getWebinar, type MinistryWebinar } from './webinarControl';
import { WebinarLobby, type WebinarViewerRole } from './WebinarLobby';
import { WebinarStage } from './WebinarStage';
import { WebinarAttendeeViewer } from './WebinarAttendeeViewer';
import { WebinarEndScreen } from './WebinarEndScreen';

const ENDED_STATUSES = new Set(['ended', 'recording_processing', 'completed', 'cancelled']);

async function resolveRole(webinarId: string, hostId: string, userId: string): Promise<WebinarViewerRole> {
  if (hostId === userId) return 'host';

  const { data: speaker } = await supabase
    .from('webinar_speakers').select('role').eq('webinar_id', webinarId).eq('user_id', userId).eq('status', 'confirmed').maybeSingle();
  if (speaker) return (speaker as { role: WebinarViewerRole }).role;

  const { data: request } = await supabase
    .from('webinar_speaker_requests').select('status').eq('webinar_id', webinarId).eq('user_id', userId).eq('status', 'accepted').maybeSingle();
  if (request) return 'speaker';

  return 'attendee';
}

/** Public join route (/ministry/:ministryId/webinar/:webinarId) — resolves the
 *  viewer's role server-confirmed-adjacent (client-side check here just picks
 *  the UI; livekit-token's own resolveRole is the actual security boundary for
 *  publish rights) and branches into Lobby / Stage / AttendeeViewer / EndScreen. */
export function WebinarJoinPage() {
  const { ministryId, webinarId } = useParams<{ ministryId: string; webinarId: string }>();
  const navigate = useNavigate();
  const { user, profile, isLoading: authLoading } = useAuth();

  const [webinar, setWebinar] = useState<MinistryWebinar | null>(null);
  const [role, setRole] = useState<WebinarViewerRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promoted, setPromoted] = useState(false);
  const [isRegistered, setIsRegistered] = useState<boolean | null>(null);

  const userName = profile?.full_name || user?.email?.split('@')[0] || 'Guest';

  const load = useCallback(async () => {
    if (!webinarId || !user?.id) return;
    const w = await getWebinar(webinarId);
    if (!w) { setError("This webinar doesn't exist or you don't have access."); setLoading(false); return; }
    setWebinar(w);
    const r = await resolveRole(webinarId, w.host_id, user.id);
    setRole(r);

    // Only plain attendees are gated on registration — host/co-host/speaker
    // never need to register for their own webinar.
    if (w.registration_required && r === 'attendee') {
      const { data: reg } = await supabase
        .from('meeting_registrations')
        .select('id')
        .eq('meeting_id', webinarId).eq('meeting_kind', 'webinar')
        .eq('user_id', user.id).eq('status', 'registered')
        .maybeSingle();
      setIsRegistered(!!reg);
    } else {
      setIsRegistered(true);
    }
    setLoading(false);
  }, [webinarId, user?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    load();
  }, [authLoading, user, load]);

  useEffect(() => {
    if (!webinarId) return;
    const channel = supabase
      .channel(`webinar-join-${webinarId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ministry_webinars', filter: `id=eq.${webinarId}` },
        (payload) => setWebinar(payload.new as MinistryWebinar))
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch { /* noop */ } };
  }, [webinarId]);

  // 'ministries/:id' isn't a real route in this app (only 'ministries/:id/live'
  // is) — it fell through to the app's catch-all "*" -> "/" redirect, which
  // loses everything including which ministry/tab to land on, so this landed
  // wherever MinistriesHub's own history state last happened to be. Query
  // params on '/' (a real route) survive that and mirror the existing
  // ?connect=return pattern MinistrySpace.tsx already uses to restore a tab
  // after a real navigation round-trip — MinistriesHub reads `ministry`,
  // MinistrySpace reads `tab`.
  const handleHome = useCallback(
    () => navigate(ministryId ? `/?ministry=${ministryId}&tab=webinars` : '/'),
    [navigate, ministryId],
  );

  // Host/co-host/speaker (or a just-promoted attendee) get a real LiveKit
  // connection via WebinarStage — handed to the app's persistent
  // ActiveCallHost (packages/live/src/components/ActiveCallHost.tsx) instead
  // of being rendered inline here, the same way MinistryInteractiveMeetings
  // does for every meeting call. WebinarStage rendered inline (the old
  // behavior) never had an ActiveCallContext ancestor, so its minimize button
  // never appeared and its frame never got ActiveCallHost's tuned full-screen/
  // mini-player sizing — both fixed just by going through startCall() here.
  const { call, startCall, endCall } = useActiveCall();
  const isSpeakerRole = role === 'host' || role === 'co-host' || role === 'speaker';
  const isOnStage = !!webinar && webinar.status === 'live' && (isSpeakerRole || promoted);
  const callIsThisWebinar = !!webinar && call?.id === webinar.id;

  useEffect(() => {
    if (!isOnStage || !webinar || !user) return;
    if (callIsThisWebinar) return; // already started for this webinar

    const leaveAndGoHome = () => { endCall(); handleHome(); };
    // load() (which flips webinar.status away from 'live') runs BEFORE
    // endCall() clears the active call — reversed, there'd be a render where
    // call is null but webinar.status is still stale 'live', re-passing the
    // `callIsThisWebinar` guard above and restarting the just-ended broadcast.
    const endedAndReload = async () => { await load(); endCall(); };
    startCall({
      id: webinar.id,
      title: webinar.title,
      onLeave: leaveAndGoHome,
      node: (
        <WebinarStage
          webinar={webinar}
          userId={user.id}
          userName={userName}
          role={isSpeakerRole ? role! : 'speaker'}
          onEnded={endedAndReload}
          onLeave={leaveAndGoHome}
        />
      ),
    });
    // Intentionally narrow deps — webinar/role/userName are captured in the
    // closure at start time (same trade-off MinistryInteractiveMeetings.tsx
    // already accepts: the mounted call gets a frozen snapshot, not live
    // prop updates — WebinarStage's own realtime hooks (speaker requests,
    // Q&A, polls) still update live regardless).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnStage, webinar?.id, callIsThisWebinar]);

  // While isOnStage is true but the call hasn't actually started yet (the
  // startCall() above runs in an effect, one tick after this render), return
  // null here would paint nothing at all for a frame — a genuine blank/white
  // flash (reported live: "showed a white page"). Keep showing the spinner
  // until ActiveCallHost actually has something on screen.
  if (isOnStage && !callIsThisWebinar) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-950">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }
  // The call itself is rendered by ActiveCallHost (fixed, full-screen,
  // z-[70]) — this only becomes visible if the host minimizes it, so it just
  // needs to be real content, not blank. Previously navigated away to the
  // Webinars tab instead of rendering this, but that forced a real route
  // change (unmounting/remounting MinistriesHub/MinistrySpace) that turned
  // out to interfere with the call actually showing — reverted in favor of
  // this simpler, no-navigation fix.
  if (isOnStage) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-950 p-4 text-center">
        <div className="text-gray-400">
          <p className="text-sm">You're live in</p>
          <p className="text-lg font-medium text-white">{webinar?.title}</p>
        </div>
      </div>
    );
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-950">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-950 p-4">
        <Card className="max-w-sm w-full text-center">
          <CardHeader><CardTitle>Sign in to join this webinar</CardTitle></CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/')} className="w-full">Go to sign in</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !webinar || !role) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-950 p-4">
        <Card className="max-w-sm w-full text-center">
          <CardHeader>
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
            <CardTitle>Can't open this webinar</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-4">{error || 'Something went wrong.'}</p>
            <Button onClick={handleHome} variant="outline" className="w-full">Back home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (ENDED_STATUSES.has(webinar.status)) {
    return <WebinarEndScreen webinar={webinar} onHome={handleHome} isHost={role === 'host' || role === 'co-host'} />;
  }

  if (webinar.registration_required && role === 'attendee' && isRegistered === false) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-950 p-4">
        <Card className="max-w-sm w-full text-center">
          <CardHeader><CardTitle>Registration required</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-500">{webinar.title} requires registration to join.</p>
            <RegisterMeetingButton
              meetingId={webinar.id} meetingKind="webinar" meetingTitle={webinar.title}
              allowGuests={webinar.is_public} className="w-full"
            />
            <Button onClick={load} variant="outline" className="w-full">I've registered — refresh</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // isOnStage (host/co-host/speaker/promoted-attendee, live) is handled above
  // via startCall()/ActiveCallHost — this branch only reaches plain attendees.
  if (webinar.status === 'live' && !isSpeakerRole) {
    return (
      <WebinarAttendeeViewer
        webinar={webinar}
        userId={user.id}
        userName={userName}
        onEnded={load}
        onLeave={handleHome}
        onPromoted={() => setPromoted(true)}
      />
    );
  }

  return <WebinarLobby webinar={webinar} role={role} onLive={load} />;
}

export default WebinarJoinPage;
