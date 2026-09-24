import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@rekindle/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rekindle/ui/tabs';
import { Hand, PhoneOff, MessageSquare, HelpCircle, BarChart3, Loader2, Volume2, VolumeX } from 'lucide-react';
import { HlsPlayer, type HlsPlayerHandle } from '../components/HlsPlayer';
import { CaptionOverlay } from '../components/CaptionOverlay';
import { CaptionsButton } from '../components/CaptionsButton';
import { useHlsCaptions } from '../useHlsCaptions';
import { MeetingChatPanel } from '../components/MeetingChatPanel';
import { trackMeetingParticipant } from '../meetingStreamControl';
import { useMeetingPresence } from '../useMeetingPresence';
import { useWebinarSpeakerRequests } from './useWebinarSpeakerRequests';
import { WebinarQAPanel } from './WebinarQAPanel';
import { WebinarPollPanel } from './WebinarPollPanel';
import { WebinarTranslationButton } from './WebinarTranslationButton';
import type { MinistryWebinar } from './webinarControl';

// 4s -> 2s (2026-09-23, real report: "works fine but latency is around 16
// sec, tighten a little"). Safe to lower further than before specifically
// BECAUSE segment_duration is back at 4s (see the still-accurate history
// below) — the live window is ~20s, so sitting only 2s behind the edge
// (HlsPlayer's own floor — Math.max(targetLatencySeconds, 2) — so this is
// already the lowest value this prop can actually achieve) still leaves
// ~15s of margin before hls.js would ever need a segment the window has
// already dropped. Only the CLIENT-side sync target moved; segment_duration
// itself is untouched — that's the parameter that actually caused the
// reconnect-loop bug when it was reduced, this one didn't.
//
// 4s — just the starting target, not a hard floor (hlsLatencySeconds below
// re-syncs to the real measured value once playing). HlsPlayer itself caps
// this at 4s regardless of what's passed in (see its own comment on why:
// LiveKit's live playlist keeps a fixed ~5-segment window, and with
// start-hls's segment duration back at 4s — reverted from a same-day 2s
// experiment that halved the window to a too-tight 10s and caused periodic
// breaks — that's ~20s of real margin behind the edge).
const HLS_TARGET_LATENCY_SECONDS = 2;

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
  // Captions no longer depend on the host: CC below is on-demand for every
  // attendee (useHlsCaptions). This picker is now for Live Translation only.
  const showTranslation = webinar.enable_translation;
  const playerRef = useRef<HlsPlayerHandle>(null);
  const captions = useHlsCaptions({
    scope: { kind: 'webinar', webinarId: webinar.id },
    roomName: webinar.room_name,
    getPlaybackDate: () => playerRef.current?.getPlaybackDate() ?? null,
  });
  // Starts muted (2026-09-22, real bug reported live: "always starts with
  // tap to enable sound and it does nothing"). Root cause: HlsPlayer tries
  // to autoplay WITH sound the instant the manifest parses — before any real
  // user gesture — which browsers reliably block, so the full-screen "Tap to
  // enable sound" overlay showed up on literally every load; tapping it
  // called play() again, which could still fail silently if the stream was
  // also mid cold-start, giving no feedback at all. Muted autoplay is always
  // allowed (no gesture needed), so HlsPlayer's block never triggers in the
  // first place — a small, always-visible, non-blocking mute toggle below
  // lets the viewer opt into sound whenever they want it, same pattern
  // YouTube/Twitch use instead of a blocking prompt.
  const [audioMuted, setAudioMuted] = useState(true);

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
              ref={playerRef}
              src={webinar.hls_playback_url}
              onEnded={onEnded}
              className="w-full h-full"
              muted={audioMuted || translationActive}
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

        {!translationActive && (
          <button
            type="button"
            onClick={() => setAudioMuted((m) => !m)}
            title={audioMuted ? 'Unmute' : 'Mute'}
            className="absolute top-3 left-3 z-50 flex items-center justify-center h-9 w-9 rounded-full bg-black/60 hover:bg-black/80 text-white shadow-lg"
          >
            {audioMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        )}

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

        {captions.enabled && (
          <CaptionOverlay
            lines={captions.lines}
            size={captions.size}
            bottomOffsetClassName="bottom-16 sm:bottom-16"
            placeholder={
              captions.status === 'starting' || captions.status === 'waiting'
                ? 'Captions are on — they’ll appear when someone speaks.'
                : null
            }
          />
        )}

        <div className="absolute top-3 right-3 z-50 flex items-center gap-2">
          <CaptionsButton
            enabled={captions.enabled}
            status={captions.status}
            size={captions.size}
            onToggle={captions.toggle}
            onSizeChange={captions.setSize}
          />
          {showTranslation && (
            <WebinarTranslationButton
              webinarId={webinar.id}
              roomName={webinar.room_name}
              delaySeconds={hlsLatencySeconds}
              onActiveChange={setTranslationActive}
              showCaptionsOption={false}
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
