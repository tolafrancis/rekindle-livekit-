import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rekindle/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@rekindle/ui/dialog';
import { PhoneOff, X, Hand, Settings2, HelpCircle, BarChart3, Radio, MessageSquare } from 'lucide-react';
import DailyVideoCall from '../components/DailyVideoCall';
import { useActiveCallOptional } from '../ActiveCallContext';
import { ChannelStreamConfig } from '../components/ChannelStreamConfig';
import { MeetingChatPanel } from '../components/MeetingChatPanel';
import { FloatingTranslationButton, type TranslationControls } from '../components/FloatingTranslationButton';
import { useMeetingPresence } from '../useMeetingPresence';
import { useWebinarSpeakerRequests } from './useWebinarSpeakerRequests';
import { stopWebinarBroadcast, type MinistryWebinar } from './webinarControl';
import { startMeetingBroadcast, stopMeetingBroadcast } from '../meetingStreamControl';
import type { WebinarViewerRole } from './WebinarLobby';
import { WebinarQAModerationPanel } from './WebinarQAModerationPanel';
import { WebinarPollHostPanel } from './WebinarPollHostPanel';

interface WebinarStageProps {
  webinar: MinistryWebinar;
  userId: string;
  userName: string;
  role: WebinarViewerRole;
  onEnded: () => void;
  onLeave: () => void;
}

/** Host/co-host/speaker broadcast view — the only participants who ever hold a
 *  LiveKit token in Phase 1. Attendees never appear here (see
 *  WebinarAttendeeViewer); a promoted attendee re-mounts into this component
 *  once their speaker request is accepted. */
export function WebinarStage({ webinar, userId, userName, role, onEnded, onLeave }: WebinarStageProps) {
  const isHost = role === 'host' || role === 'co-host';
  const speakerRequests = useWebinarSpeakerRequests(webinar.id, userId, userName, isHost);
  // Live "who's actually watching" roster — same realtime presence channel
  // WebinarAttendeeViewer announces into, and the same hook
  // MinistryInteractiveMeetings already uses for its own webinar/presentation
  // mode. Only attendees join this channel from the audience side, but the
  // host/co-host/speakers on this page announce themselves too so anyone
  // checking presenceMembers elsewhere sees a complete picture.
  const presenceMembers = useMeetingPresence(webinar.id, userId, userName, false, true);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [streamConfigOpen, setStreamConfigOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [callTranslation, setCallTranslation] = useState<TranslationControls | null>(null);
  // Minimized mini-player awareness (2026-09-21) — mirrors
  // MinistryInteractiveMeetings.tsx's isPiP: this component is now mounted by
  // WebinarJoinPage via startCall()/ActiveCallHost (see that file), the same
  // persistent render surface Interactive Meetings uses, instead of rendering
  // inline. Without this, the frame kept forcing full viewport height even
  // inside ActiveCallHost's small mini-player frame, and the minimize button
  // itself only renders when this context is actually present (DailyVideoCall's
  // own logic) — both silently broken before this file ever wired in.
  const isPiP = useActiveCallOptional()?.minimized ?? false;

  // Start the audience-facing HLS Egress once the host is actually here —
  // this component (with DailyVideoCall autoJoin) is where the host's LiveKit
  // room connection happens, so the room genuinely exists by the time this
  // fires (see the comment in WebinarLobby.handleStart for why it used to
  // 500 when started earlier). Attendees are HLS-only viewers (Phase 1), so a
  // failure here means the audience sees nothing — worth a visible toast, not
  // just a console warning.
  useEffect(() => {
    if (!isHost) return;
    // expectVideo=true: webinars are overwhelmingly presentations with video,
    // and this is what makes livekit-egress's Track Composite fallback (added
    // below for the cold-start fix) actually fall back to Room Composite if
    // the host's camera isn't on yet, instead of silently locking audio-only.
    startMeetingBroadcast(webinar.id, webinar.room_name, 'ministry_webinar', undefined, true).then((result) => {
      if (!result) toast.error("The stream couldn't start — attendees won't see anything yet. Try ending and restarting the webinar.");
    });
    return () => { stopMeetingBroadcast(webinar.id, webinar.room_name, 'ministry_webinar'); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, webinar.id, webinar.room_name]);

  const handleEndForEveryone = async () => {
    setEnding(true);
    try {
      await stopWebinarBroadcast(webinar.id, webinar.room_name);
      onEnded();
    } finally {
      setEnding(false);
      setShowEndConfirm(false);
    }
  };

  return (
    <div className={isPiP ? 'h-full w-full flex flex-col' : 'min-h-[100dvh] h-full flex flex-col'}>
      <div className="relative flex-1 min-h-0">
        <DailyVideoCall
          roomName={webinar.room_name}
          userName={userName}
          userId={userId}
          isHost={isHost}
          meetingId={webinar.id}
          meetingKind="ministry_webinar"
          onCallEnd={onLeave}
          showControls
          autoJoin
          enableRecording={webinar.enable_recording}
          onTranslationControlsChange={setCallTranslation}
        />

        {!isPiP && (webinar.enable_captions || webinar.enable_translation) && callTranslation && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50">
            <FloatingTranslationButton
              translation={callTranslation}
              ministryId={webinar.ministry_id}
              roomName={webinar.room_name}
              isHost={isHost}
              userId={userId}
            />
          </div>
        )}

        {!isPiP && (
          <div className="absolute top-3 right-3 z-50 flex gap-2">
            {isHost && (
              <Button
                onClick={() => setStreamConfigOpen(true)}
                size="sm"
                variant="secondary"
                className="h-10 px-4 text-sm bg-white/90 text-gray-900 hover:bg-white shadow-lg"
                title="OBS / restream setup"
              >
                <Radio className="h-5 w-5 sm:mr-2" />
                <span className="hidden sm:inline">Stream</span>
              </Button>
            )}
            {isHost && (
              <Button
                onClick={() => setShowRequests((v) => !v)}
                size="sm"
                variant="secondary"
                className="h-10 px-4 text-sm bg-white/90 text-gray-900 hover:bg-white shadow-lg relative"
              >
                <Settings2 className="h-5 w-5 mr-2" />
                Manage
                {speakerRequests.pendingRequests.length > 0 && (
                  <Badge className="ml-2 bg-purple-600 text-white">{speakerRequests.pendingRequests.length}</Badge>
                )}
              </Button>
            )}
            {isHost ? (
              <Button onClick={() => setShowEndConfirm(true)} size="sm" className="h-10 px-4 text-sm bg-red-600 hover:bg-red-700 text-white shadow-lg">
                <PhoneOff className="h-5 w-5 mr-2" /> End webinar
              </Button>
            ) : (
              <Button onClick={onLeave} size="sm" className="h-10 px-4 text-sm bg-red-600 hover:bg-red-700 text-white shadow-lg">
                <PhoneOff className="h-5 w-5 mr-2" /> Leave
              </Button>
            )}
          </div>
        )}

        {!isPiP && isHost && showRequests && (
          <div className="absolute top-16 right-3 z-50 w-96 max-w-[90vw] bg-gray-900/95 backdrop-blur-sm rounded-lg text-white max-h-[75vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <span className="text-base font-medium flex items-center gap-2"><Settings2 className="h-5 w-5" /> Manage webinar</span>
              <button onClick={() => setShowRequests(false)} className="p-1.5 -m-1.5 rounded hover:bg-white/10"><X className="h-5 w-5 text-gray-400 hover:text-white" /></button>
            </div>
            <Tabs defaultValue="speakers" className="flex-1 flex flex-col min-h-0">
              <TabsList className="w-full justify-start rounded-none bg-transparent border-b border-white/10 h-auto p-0 px-2">
                <TabsTrigger value="speakers" className="gap-1.5 text-sm data-[state=active]:bg-white/10 py-3"><Hand className="h-4 w-4" /> Speakers</TabsTrigger>
                <TabsTrigger value="chat" className="gap-1.5 text-sm data-[state=active]:bg-white/10 py-3"><MessageSquare className="h-4 w-4" /> Chat</TabsTrigger>
                <TabsTrigger value="qa" className="gap-1.5 text-sm data-[state=active]:bg-white/10 py-3"><HelpCircle className="h-4 w-4" /> Q&amp;A</TabsTrigger>
                <TabsTrigger value="polls" className="gap-1.5 text-sm data-[state=active]:bg-white/10 py-3"><BarChart3 className="h-4 w-4" /> Polls</TabsTrigger>
              </TabsList>
              <div className="p-4 overflow-y-auto">
                <TabsContent value="speakers" className="m-0 space-y-4">
                  <div>
                    <p className="text-sm font-medium text-gray-300 mb-2">Requesting to speak</p>
                    {speakerRequests.pendingRequests.length === 0 ? (
                      <p className="text-sm text-gray-500">No pending requests.</p>
                    ) : (
                      <div className="space-y-2">
                        {speakerRequests.pendingRequests.map((r) => (
                          <div key={r.id} className="flex items-center justify-between gap-2">
                            <span className="text-sm truncate">{r.user_name || 'Attendee'}</span>
                            <Button size="sm" className="h-9 px-3 bg-purple-600 hover:bg-purple-700" onClick={() => speakerRequests.hostInvite(r.user_id, r.user_name)}>
                              Invite up
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-300 mb-2">On stage</p>
                    {speakerRequests.requests.filter((r) => r.status === 'accepted').length === 0 ? (
                      <p className="text-sm text-gray-500">No promoted speakers yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {speakerRequests.requests.filter((r) => r.status === 'accepted').map((r) => (
                          <div key={r.id} className="flex items-center justify-between gap-2">
                            <span className="text-sm truncate">{r.user_name || 'Attendee'}</span>
                            <Button size="icon" variant="ghost" className="h-9 w-9 text-gray-400 hover:text-white" title="Send back to viewer" onClick={() => speakerRequests.revoke(r.user_id)}>
                              <X className="h-5 w-5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {(() => {
                    const onStageIds = new Set(speakerRequests.requests.filter((r) => r.status === 'accepted').map((r) => r.user_id));
                    const audience = presenceMembers.filter((m) => m.userId !== userId && !onStageIds.has(m.userId));
                    return (
                      <div>
                        <p className="text-sm font-medium text-gray-300 mb-2">Audience ({audience.length})</p>
                        {audience.length === 0 ? (
                          <p className="text-sm text-gray-500">No one watching yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {audience.map((m) => {
                              const requested = speakerRequests.pendingRequests.some((r) => r.user_id === m.userId);
                              return (
                                <div key={m.userId} className="flex items-center justify-between gap-2">
                                  <span className="text-sm truncate">
                                    {requested && <Hand className="inline h-3.5 w-3.5 text-purple-300 mr-1" />}
                                    {m.userName}
                                  </span>
                                  <Button size="sm" className="h-9 px-3 bg-purple-600 hover:bg-purple-700" onClick={() => speakerRequests.hostInvite(m.userId, m.userName)}>
                                    Invite up
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </TabsContent>
                <TabsContent value="chat" className="m-0 h-96 -m-4 p-0">
                  {webinar.enable_chat ? (
                    <MeetingChatPanel meetingId={webinar.id} userId={userId} userName={userName} isGuest={false} meetingTable="ministry_webinars" />
                  ) : (
                    <p className="text-xs text-gray-500 p-4">Chat is disabled for this webinar.</p>
                  )}
                </TabsContent>
                <TabsContent value="qa" className="m-0">
                  {webinar.enable_qa ? (
                    <WebinarQAModerationPanel webinarId={webinar.id} userId={userId} userName={userName} />
                  ) : (
                    <p className="text-xs text-gray-500">Q&amp;A is disabled for this webinar.</p>
                  )}
                </TabsContent>
                <TabsContent value="polls" className="m-0">
                  {webinar.enable_polls ? (
                    <WebinarPollHostPanel webinarId={webinar.id} userId={userId} />
                  ) : (
                    <p className="text-xs text-gray-500">Polls are disabled for this webinar.</p>
                  )}
                </TabsContent>
              </div>
            </Tabs>
          </div>
        )}
      </div>

      <Dialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End webinar for everyone?</DialogTitle>
            <DialogDescription>
              This ends the broadcast for every attendee, finalizes attendance and the recording, and can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEndConfirm(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleEndForEveryone} disabled={ending}>
              {ending ? 'Ending…' : 'End webinar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OBS / Restream config — same shared dialog Interactive Meetings uses
          (MinistryInteractiveMeetings.tsx), contextKind='ministry_webinar'
          routes livekit-ingress's auth check to ministry_webinars. */}
      {isHost && (
        <ChannelStreamConfig
          meeting={webinar}
          contextKind="ministry_webinar"
          open={streamConfigOpen}
          onClose={() => setStreamConfigOpen(false)}
        />
      )}
    </div>
  );
}

export default WebinarStage;
