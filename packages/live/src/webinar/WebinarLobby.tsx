import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Loader2, Radio, Users, Calendar, Play } from 'lucide-react';
import { toast } from 'sonner';
import { formatMeetingTime } from '@rekindle/features/meetingTime';
import RegisterMeetingButton from '../components/RegisterMeetingButton';
import { startWebinarNow, type MinistryWebinar } from './webinarControl';

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

  // The HLS Egress (startWebinarBroadcast) used to be started from here, but
  // that's before the host has ever connected to the LiveKit room (that only
  // happens once WebinarStage mounts, below) — LiveKit auto-creates a room on
  // the host's first real connection, not on token issuance, so Egress was
  // reliably targeting a room that didn't exist yet and failing with a 500.
  // Fixed by only flipping status here (which mounts WebinarStage/DailyVideoCall)
  // and starting the Egress from WebinarStage itself, once the host is actually
  // in the room.
  const handleStart = async () => {
    setStarting(true);
    try {
      await startWebinarNow(webinar.id);
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
                Start Webinar
              </Button>
            ) : (
              <p className="text-sm text-gray-500 text-center">Waiting for the host to start…</p>
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
          <p className="text-sm text-gray-500">Waiting for the host to start the webinar…</p>
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
