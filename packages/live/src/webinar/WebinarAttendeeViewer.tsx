import React, { useEffect, useState } from 'react';
import { Button } from '@rekindle/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rekindle/ui/tabs';
import { Hand, PhoneOff, MessageSquare, HelpCircle, BarChart3, Loader2 } from 'lucide-react';
import { HlsPlayer } from '../components/HlsPlayer';
import { MeetingChatPanel } from '../components/MeetingChatPanel';
import { trackMeetingParticipant } from '../meetingStreamControl';
import { useMeetingPresence } from '../useMeetingPresence';
import { useWebinarSpeakerRequests } from './useWebinarSpeakerRequests';
import { WebinarQAPanel } from './WebinarQAPanel';
import { WebinarPollPanel } from './WebinarPollPanel';
import { WebinarTranslationButton } from './WebinarTranslationButton';
import type { MinistryWebinar } from './webinarControl';

// 4s (2026-09-22, reduced from 6s): livekit-egress's start-hls segment
// duration was just halved to 2s specifically so this could come down too —
// hlsLatencySeconds (below) re-syncs to the real measured value once
// playing, so this is just the starting target, not a hard floor.
const HLS_TARGET_LATENCY_SECONDS = 4;

interface WebinarAttendeeViewerProps {
  webinar: MinistryWebinar;
  userId: string;
  userName: string;
  onEnded: () => void;
  onLeave: () => void;
  /** Fired once the attendee accepts a promotion to speaker — the parent
   *  re-mounts WebinarStage in place of this component. */
  onPromoted: () => void;
}

/** Viewer-only attendee experience — HLS playback of the webinar's live stream,
 *  never a LiveKit connection. Chat/Q&A/Polls tabs are gated by the webinar's
 *  own enable_chat/enable_qa/enable_polls toggles set at creation. */
export function WebinarAttendeeViewer({ webinar, userId, userName, onEnded, onLeave, onPromoted }: WebinarAttendeeViewerProps) {
  const speakerRequests = useWebinarSpeakerRequests(webinar.id, userId, userName, false);
  const myRequest = speakerRequests.myRequest;
  const [hlsLatencySeconds, setHlsLatencySeconds] = useState(HLS_TARGET_LATENCY_SECONDS);
  const [translationActive, setTranslationActive] = useState(false);
  const showTranslation = webinar.enable_captions || webinar.enable_translation;

  useEffect(() => {
    trackMeetingParticipant(webinar.id, userId, userName, false, 'join', 'ministry_webinar');
    return () => { trackMeetingParticipant(webinar.id, userId, userName, false, 'leave', 'ministry_webinar'); };
  }, [webinar.id, userId, userName]);

  // Announces this attendee into the webinar's realtime presence channel so the
  // host's Manage panel can show a live "who's here" roster and invite them up —
  // same mechanism MinistryInteractiveMeetings already uses for its own webinar/
  // presentation mode (attendees never join LiveKit there either).
  useMeetingPresence(webinar.id, userId, userName, false, true);

  useEffect(() => {
    if (myRequest?.status === 'accepted') onPromoted();
  }, [myRequest?.status, onPromoted]);

  return (
    <div className="min-h-[100dvh] h-full bg-black flex flex-col sm:flex-row">
      <div className="relative sm:flex-1 min-h-0 flex flex-col">
        {/* max-w-3xl (2026-09-22, moderately reduced): sm:flex-1 sm:aspect-auto
            previously let the frame stretch to fill all remaining vertical
            space with no aspect-ratio cap, which on a normal desktop screen
            made it look oversized rather than a properly proportioned player.
            Centering an aspect-video box with a moderate max-width instead —
            same cap DailyVideoCall.tsx's featured tile now uses, for a
            consistent frame size across Meetings and Webinar. */}
        <div className="w-full aspect-video sm:flex-1 sm:aspect-auto sm:min-h-0 sm:flex sm:items-center sm:justify-center">
          <div className="w-full aspect-video sm:max-w-3xl">
          {webinar.hls_playback_url ? (
            <HlsPlayer
              src={webinar.hls_playback_url}
              onEnded={onEnded}
              className="w-full h-full"
              muted={translationActive}
              targetLatencySeconds={HLS_TARGET_LATENCY_SECONDS}
              onLatencyChange={setHlsLatencySeconds}
            />
          ) : (
            // This only ever renders once the webinar is already live (the
            // parent gates on webinar.status === 'live' before mounting this
            // component) — hls_playback_url is null only during the Egress's
            // own cold-start window (a few seconds, shorter since Track
            // Composite Egress was extended to webinars). "Waiting for the
            // host" was misleading here: the host already started.
            <div className="flex flex-col items-center justify-center gap-3 h-full text-gray-300 p-6 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              <span>Stream is starting…</span>
            </div>
          )}
          </div>
        </div>

        {myRequest?.status === 'invited' && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-gray-900/95 text-white rounded-lg px-4 py-3 flex items-center gap-3 shadow-lg">
            <span className="text-sm">The host invited you to speak</span>
            <Button size="sm" className="h-7 bg-purple-600 hover:bg-purple-700" onClick={speakerRequests.acceptInvite}>Accept</Button>
            <Button size="sm" variant="ghost" className="h-7 text-gray-300" onClick={speakerRequests.declineInvite}>Decline</Button>
          </div>
        )}

        <div className="z-50 flex flex-col items-center gap-2 py-3 sm:py-0 sm:absolute sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2">
          {myRequest?.status === 'requested' ? (
            <button
              onClick={speakerRequests.withdrawRequest}
              className="flex items-center text-xs rounded-full px-3 py-1.5 bg-gray-700 text-white hover:bg-gray-600"
            >
              <Hand className="h-3.5 w-3.5 mr-1" /> Waiting for the host…
            </button>
          ) : (
            <button
              onClick={speakerRequests.requestToSpeak}
              className="flex items-center text-xs rounded-full px-3 py-1.5 bg-purple-600/90 text-white hover:bg-purple-700"
            >
              <Hand className="h-3.5 w-3.5 mr-1" /> Request to speak
            </button>
          )}
        </div>

        <div className="absolute top-3 right-3 z-50 flex items-center gap-2">
          {showTranslation && (
            <WebinarTranslationButton
              webinarId={webinar.id}
              roomName={webinar.room_name}
              delaySeconds={hlsLatencySeconds}
              onActiveChange={setTranslationActive}
            />
          )}
          <Button onClick={onLeave} size="sm" className="bg-red-600 hover:bg-red-700 text-white shadow-lg">
            <PhoneOff className="h-4 w-4 mr-2" /> Leave
          </Button>
        </div>
      </div>

      <div className="w-full sm:w-80 flex-1 sm:flex-none min-h-0 sm:h-auto shrink-0 bg-white">
        <Tabs defaultValue="chat" className="h-full flex flex-col">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-auto p-0">
            <TabsTrigger value="chat" className="flex-1 gap-1.5 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-purple-600 py-2" disabled={!webinar.enable_chat}>
              <MessageSquare className="h-3.5 w-3.5" /> Chat
            </TabsTrigger>
            <TabsTrigger value="qa" className="flex-1 gap-1.5 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-purple-600 py-2" disabled={!webinar.enable_qa}>
              <HelpCircle className="h-3.5 w-3.5" /> Q&amp;A
            </TabsTrigger>
            <TabsTrigger value="polls" className="flex-1 gap-1.5 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-purple-600 py-2" disabled={!webinar.enable_polls}>
              <BarChart3 className="h-3.5 w-3.5" /> Polls
            </TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="flex-1 min-h-0 m-0">
            {webinar.enable_chat && <MeetingChatPanel meetingId={webinar.id} userId={userId} userName={userName} isGuest={false} meetingTable="ministry_webinars" />}
          </TabsContent>
          <TabsContent value="qa" className="flex-1 min-h-0 m-0">
            {webinar.enable_qa && <WebinarQAPanel webinarId={webinar.id} userId={userId} userName={userName} />}
          </TabsContent>
          <TabsContent value="polls" className="flex-1 min-h-0 m-0">
            {webinar.enable_polls && <WebinarPollPanel webinarId={webinar.id} userId={userId} />}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default WebinarAttendeeViewer;
