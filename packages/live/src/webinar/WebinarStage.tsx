import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rekindle/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@rekindle/ui/dialog';
import { PhoneOff, X, Hand, Settings2, HelpCircle, BarChart3 } from 'lucide-react';
import DailyVideoCall from '../components/DailyVideoCall';
import { FloatingTranslationButton, type TranslationControls } from '../components/FloatingTranslationButton';
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
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [ending, setEnding] = useState(false);
  const [callTranslation, setCallTranslation] = useState<TranslationControls | null>(null);

  // Start the audience-facing HLS Egress once the host is actually here —
  // this component (with DailyVideoCall autoJoin) is where the host's LiveKit
  // room connection happens, so the room genuinely exists by the time this
  // fires (see the comment in WebinarLobby.handleStart for why it used to
  // 500 when started earlier). Attendees are HLS-only viewers (Phase 1), so a
  // failure here means the audience sees nothing — worth a visible toast, not
  // just a console warning.
  useEffect(() => {
    if (!isHost) return;
    startMeetingBroadcast(webinar.id, webinar.room_name, 'ministry_webinar').then((result) => {
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
    <div className="min-h-[100dvh] h-full flex flex-col">
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

        {(webinar.enable_captions || webinar.enable_translation) && callTranslation && (
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

        <div className="absolute top-3 right-3 z-50 flex gap-2">
          {isHost && (
            <Button
              onClick={() => setShowRequests((v) => !v)}
              size="sm"
              variant="secondary"
              className="bg-white/90 text-gray-900 hover:bg-white shadow-lg relative"
            >
              <Settings2 className="h-4 w-4 mr-2" />
              Manage
              {speakerRequests.pendingRequests.length > 0 && (
                <Badge className="ml-2 bg-purple-600 text-white">{speakerRequests.pendingRequests.length}</Badge>
              )}
            </Button>
          )}
          {isHost ? (
            <Button onClick={() => setShowEndConfirm(true)} size="sm" className="bg-red-600 hover:bg-red-700 text-white shadow-lg">
              <PhoneOff className="h-4 w-4 mr-2" /> End webinar
            </Button>
          ) : (
            <Button onClick={onLeave} size="sm" className="bg-red-600 hover:bg-red-700 text-white shadow-lg">
              <PhoneOff className="h-4 w-4 mr-2" /> Leave
            </Button>
          )}
        </div>

        {isHost && showRequests && (
          <div className="absolute top-16 right-3 z-50 w-80 max-w-[85vw] bg-gray-900/95 backdrop-blur-sm rounded-lg text-white max-h-[70vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <span className="text-sm font-medium flex items-center gap-1.5"><Settings2 className="h-4 w-4" /> Manage webinar</span>
              <button onClick={() => setShowRequests(false)}><X className="h-4 w-4 text-gray-400 hover:text-white" /></button>
            </div>
            <Tabs defaultValue="speakers" className="flex-1 flex flex-col min-h-0">
              <TabsList className="w-full justify-start rounded-none bg-transparent border-b border-white/10 h-auto p-0 px-2">
                <TabsTrigger value="speakers" className="gap-1.5 text-xs data-[state=active]:bg-white/10 py-2"><Hand className="h-3.5 w-3.5" /> Speakers</TabsTrigger>
                <TabsTrigger value="qa" className="gap-1.5 text-xs data-[state=active]:bg-white/10 py-2"><HelpCircle className="h-3.5 w-3.5" /> Q&amp;A</TabsTrigger>
                <TabsTrigger value="polls" className="gap-1.5 text-xs data-[state=active]:bg-white/10 py-2"><BarChart3 className="h-3.5 w-3.5" /> Polls</TabsTrigger>
              </TabsList>
              <div className="p-3 overflow-y-auto">
                <TabsContent value="speakers" className="m-0 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-gray-300 mb-1">Requesting to speak</p>
                    {speakerRequests.pendingRequests.length === 0 ? (
                      <p className="text-xs text-gray-500">No pending requests.</p>
                    ) : (
                      <div className="space-y-1">
                        {speakerRequests.pendingRequests.map((r) => (
                          <div key={r.id} className="flex items-center justify-between gap-2">
                            <span className="text-sm truncate">{r.user_name || 'Attendee'}</span>
                            <Button size="sm" className="h-7 px-2 bg-purple-600 hover:bg-purple-700" onClick={() => speakerRequests.hostInvite(r.user_id, r.user_name)}>
                              Invite up
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-300 mb-1">On stage</p>
                    {speakerRequests.requests.filter((r) => r.status === 'accepted').length === 0 ? (
                      <p className="text-xs text-gray-500">No promoted speakers yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {speakerRequests.requests.filter((r) => r.status === 'accepted').map((r) => (
                          <div key={r.id} className="flex items-center justify-between gap-2">
                            <span className="text-sm truncate">{r.user_name || 'Attendee'}</span>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-white" title="Send back to viewer" onClick={() => speakerRequests.revoke(r.user_id)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
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
    </div>
  );
}

export default WebinarStage;
