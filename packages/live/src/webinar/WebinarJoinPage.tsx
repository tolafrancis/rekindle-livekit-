import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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

  const handleHome = useCallback(() => navigate(ministryId ? `/ministries/${ministryId}` : '/'), [navigate, ministryId]);

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

  const isSpeakerRole = role === 'host' || role === 'co-host' || role === 'speaker';

  if (webinar.status === 'live' && (isSpeakerRole || promoted)) {
    return (
      <WebinarStage
        webinar={webinar}
        userId={user.id}
        userName={userName}
        role={isSpeakerRole ? role : 'speaker'}
        onEnded={load}
        onLeave={handleHome}
      />
    );
  }

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
