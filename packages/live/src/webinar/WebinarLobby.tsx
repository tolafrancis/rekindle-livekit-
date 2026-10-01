import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Loader2, Radio, Users, Calendar, Play } from 'lucide-react';
import { toast } from 'sonner';
import { formatMeetingTime } from '@rekindle/features/meetingTime';
import RegisterMeetingButton from '../components/RegisterMeetingButton';
import { openWebinarBackstage, type MinistryWebinar } from './webinarControl';

export type WebinarViewerRole = 'host' | 'co-host' | 'speaker' | 'attendee';

interface WebinarLobbyProps {
  webinar: MinistryWebinar;
  role: WebinarViewerRole;
  onLive: () => void;
}

/** Pre-join screen — host/speaker get a "go live" prep screen, attendees get a
 *  waiting/countdown screen. Neither ever connects to LiveKit here (Phase 1:
 *  attendees never do at all; host/speakers connect once WebinarStage mounts). */
export function WebinarLobby({ webinar, role, onLive }: WebinarLobbyProps) {
  const [starting, setStarting] = useState(false);
  const canStart = role === 'host' || role === 'co-host';

  // Opens the private backstage only — attendees keep waiting and no stream
  // starts until the host presses Go live inside WebinarStage (which is also
  // where the Egress starts: LiveKit only creates the room on the host's
  // first real connection, so starting Egress from here used to 500).
  const handleStart = async () => {
    setStarting(true);
    try {
      await openWebinarBackstage(webinar.id);
      onLive();
    } catch (e) {
      console.error('[WebinarLobby] start failed:', e);
      toast.error("Couldn't start the webinar.");
    } finally {
      setStarting(false);
    }
  };

  if (role === 'host' || role === 'co-host' || role === 'speaker') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-950 p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <Badge variant="outline" className="w-fit mb-2 bg-purple-50 text-purple-700 border-purple-200">
              <Radio className="h-3 w-3 mr-1" /> Webinar
            </Badge>
            <CardTitle>{webinar.title}</CardTitle>
            {webinar.description && <CardDescription>{webinar.description}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">
            {webinar.scheduled_start_at && (
              <p className="text-sm text-gray-500 flex items-center gap-2">
                <Calendar className="h-4 w-4" /> {formatMeetingTime(webinar.scheduled_start_at, webinar.timezone)}
              </p>
            )}
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Users className="h-4 w-4" /> Up to {webinar.max_attendees} attendees
            </p>
            {canStart ? (
              <Button onClick={handleStart} disabled={starting} className="w-full bg-purple-600 hover:bg-purple-700">
                {starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                Enter backstage
              </Button>
            ) : (
              <p className="text-sm text-gray-500 text-center">Waiting for the host to open the backstage…</p>
            )}
            {canStart && (
              <p className="text-xs text-gray-500 text-center">
                Only you and your speakers can see and hear each other backstage. Attendees are let in when you press Go live.
              </p>
            )}
            {webinar.registration_required && (
              <RegisterMeetingButton
                meetingId={webinar.id} meetingKind="webinar" meetingTitle={webinar.title}
                isHost={canStart} className="w-full"
              />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Attendee waiting/countdown screen — no LiveKit connection.
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gray-950 p-4 text-center">
      <Card className="max-w-md w-full">
        <CardHeader>
          <Badge variant="outline" className="w-fit mx-auto mb-2 bg-purple-50 text-purple-700 border-purple-200">
            <Radio className="h-3 w-3 mr-1" /> Webinar
          </Badge>
          <CardTitle>{webinar.title}</CardTitle>
          {webinar.description && <CardDescription>{webinar.description}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-3">
          {webinar.scheduled_start_at && (
            <p className="text-sm text-gray-500 flex items-center justify-center gap-2">
              <Calendar className="h-4 w-4" /> {formatMeetingTime(webinar.scheduled_start_at, webinar.timezone)}
            </p>
          )}
          <p className="text-sm text-gray-500">
            {webinar.status === 'backstage'
              ? "The host is getting ready. You'll be let in as soon as the webinar goes live…"
              : 'Waiting for the host to start the webinar…'}
          </p>
          {webinar.registration_required && (
            <RegisterMeetingButton
              meetingId={webinar.id} meetingKind="webinar" meetingTitle={webinar.title}
              allowGuests={webinar.is_public} className="w-full"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default WebinarLobby;
