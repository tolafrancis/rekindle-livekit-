import React, { useEffect, useRef, useState } from 'react';
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
import { CaptionOverlay } from '../components/CaptionOverlay';
import { CaptionsButton } from '../components/CaptionsButton';
import { useLiveCaptions, type LiveCaptionsBridge } from '../useLiveCaptions';
import { useMeetingPresence } from '../useMeetingPresence';
import { useMeetingChat } from '../useMeetingChat';
import { useWebinarSpeakerRequests } from './useWebinarSpeakerRequests';
import { useWebinarQuestions } from './useWebinarQuestions';
import { useWebinarPolls } from './useWebinarPolls';
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
  // Called here (not just inside WebinarQAModerationPanel, which only exists
  // while the Manage popover happens to be open) so the Manage button can
  // show a pending-question badge unconditionally — same reason
  // speakerRequests is instantiated up here rather than inside its own tab.
  // Real bug found live (2026-09-22): webinar_questions/webinar_polls/etc
  // were never added to the supabase_realtime publication, so this hook's
  // 5s polling fallback (see useWebinarQuestions.ts) was the ONLY thing ever
  // delivering updates — and only while mounted. With no badge, a host had
  // no reason to open this tab at all. Fixed both: migration 0364 adds the
  // missing publication entries, and this badge gives a reason to look.
  const qa = useWebinarQuestions(webinar.id, userId, userName, isHost);
  // Same reason as qa above — instantiated unconditionally so a toast can
  // fire for a new chat message from the audience even while the Manage
  // popover is closed (real report, 2026-09-22: chat/Q&A/polls confirmed
  // reaching the database and passing RLS correctly, but the host never saw
  // them — a small badge on a button isn't a strong enough signal during a
  // live call; an active toast is).
  const { messages: chatMessages } = useMeetingChat(webinar.id, userId, userName, 'ministry_webinars');
  // Same reasoning — lifted so the control bar's Polls button can show a
  // new-votes badge without a second realtime subscription duplicating the
  // one WebinarPollHostPanel would otherwise open on its own.
  const polls = useWebinarPolls(webinar.id, userId, isHost);

  // Declared here (rather than beside the other UI-state below) because the
  // unread-watermark effect right after this needs it. Manage popover
  // open/closed + which tab it's on.
  const [showRequests, setShowRequests] = useState(false);
  const [activeManageTab, setActiveManageTab] = useState('speakers');

  // Unread tracking for the control-bar Chat/Polls badges (2026-09-22 — real
  // report: "the webinar chat icon is absent in the control button and...
  // aside from the push notification you can't know if a message entered
  // until you click manage and go to chats"). Q&A already has a natural
  // "needs attention" count (qa.pendingQuestions, unanswered questions) and
  // needs no watermark. Chat and Polls don't have a status field like that,
  // so unread here means "count since the tab was last actually viewed" —
  // the watermark advances whenever the popover is open AND that tab is
  // active, not merely on toast (a toast can fire while the host is looking
  // at Speakers or has the popover closed entirely).
  const audienceChatCount = chatMessages.filter((m) => m.user_id !== userId).length;
  const [chatSeenCount, setChatSeenCount] = useState(0);
  const chatUnread = Math.max(0, audienceChatCount - chatSeenCount);

  const activePollVotes = polls.activePoll
    ? polls.activePoll.options.reduce((sum, o) => sum + o.vote_count, 0)
    : 0;
  const [pollsSeenVotes, setPollsSeenVotes] = useState(0);
  const pollsUnread = Math.max(0, activePollVotes - pollsSeenVotes);

  useEffect(() => {
    if (!showRequests) return;
    if (activeManageTab === 'chat') setChatSeenCount(audienceChatCount);
    if (activeManageTab === 'polls') setPollsSeenVotes(activePollVotes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRequests, activeManageTab, audienceChatCount, activePollVotes]);

  // Active notifications for new audience Q&A/chat (2026-09-22) — see the
  // comment above chatMessages for why a passive badge wasn't enough. Skips
  // the very first load of each (mount-time seed, not "new" activity) and
  // never toasts the host's own chat messages back at themselves.
  const seenQuestionIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!isHost) return;
    const ids = new Set(qa.pendingQuestions.map((q) => q.id));
    if (seenQuestionIdsRef.current === null) { seenQuestionIdsRef.current = ids; return; }
    for (const q of qa.pendingQuestions) {
      if (!seenQuestionIdsRef.current.has(q.id)) {
        toast(`New question from ${q.user_name || 'an attendee'}`, { description: q.question });
      }
    }
    seenQuestionIdsRef.current = ids;
  }, [isHost, qa.pendingQuestions]);

  const seenChatIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!isHost) return;
    const ids = new Set(chatMessages.map((m) => m.id));
    if (seenChatIdsRef.current === null) { seenChatIdsRef.current = ids; return; }
    for (const m of chatMessages) {
      if (m.user_id !== userId && !seenChatIdsRef.current.has(m.id)) {
        toast(`${m.user_name || 'An attendee'}: ${m.content}`);
      }
    }
    seenChatIdsRef.current = ids;
  }, [isHost, chatMessages, userId]);
  // Live "who's actually watching" roster — same realtime presence channel
  // WebinarAttendeeViewer announces into, and the same hook
  // MinistryInteractiveMeetings already uses for its own webinar/presentation
  // mode. Only attendees join this channel from the audience side, but the
  // host/co-host/speakers on this page announce themselves too so anyone
  // checking presenceMembers elsewhere sees a complete picture.
  const presenceMembers = useMeetingPresence(webinar.id, userId, userName, false, true);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [streamConfigOpen, setStreamConfigOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [callTranslation, setCallTranslation] = useState<TranslationControls | null>(null);
  // On-demand captions for the host and speakers (they're in the LiveKit
  // room, so this is the same in-room path Interactive Meetings use). The
  // same agent also broadcasts to the HLS audience — see useHlsCaptions.
  const [callCaptionsBridge, setCallCaptionsBridge] = useState<LiveCaptionsBridge | null>(null);
  const captions = useLiveCaptions(callCaptionsBridge, { roomName: webinar.room_name, kind: 'ministry_webinar' });
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
    // Guard against starting a REDUNDANT egress (2026-09-22, real bug: an
    // audience member reported frequent quick breaks over several minutes
    // watching one webinar — confirmed directly against the DB that there
    // were actually THREE separate, cleanly-started-and-stopped egress
    // sessions for that single webinar in that window, each producing a
    // BRAND NEW hls_playback_url. Every time this component (re)mounts for
    // the host — a tab getting discarded and reloaded under memory
    // pressure is the most likely trigger, but any remount has the same
    // effect — this effect unconditionally started a fresh broadcast, even
    // when `webinar` (freshly reloaded from the DB by WebinarJoinPage's own
    // load()) already shows one in progress. Each restart handed the
    // audience a whole new URL to reconnect to — a real, disruptive break,
    // not a client-side false alarm. If a broadcast already appears to be
    // live for this webinar, reconnecting the host's own LiveKit room
    // (autoJoin, above) is all that's needed — skip re-starting the Egress.
    if (webinar.status === 'live' && webinar.hls_playback_url) {
      return () => { stopMeetingBroadcast(webinar.id, webinar.room_name, 'ministry_webinar'); };
    }
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

  const openManageTab = (tab: string) => { setActiveManageTab(tab); setShowRequests(true); };

  // Chat/Q&A/Polls buttons for the REAL control bar (2026-09-22 — see the
  // showChatButton={false} comment above for why the built-in ones are
  // suppressed here). Each opens the Manage popover straight to its tab and
  // carries its own unread badge, matching the built-in Chat button's visual
  // style exactly (w-12/16 circle, same badge shape) so they read as native
  // controls, not a bolted-on extra.
  const controlBarButton = (
    key: string, icon: React.ReactNode, label: string, unread: number, active: boolean, onClick: () => void,
  ) => (
    <button key={key} onClick={onClick} className="flex flex-col items-center gap-1 sm:gap-2 group shrink-0">
      <div className={`
        relative w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center
        transition-all duration-200 transform group-hover:scale-105
        ${active ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'}
      `}>
        {icon}
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </div>
      <span className="hidden sm:block text-xs font-medium text-gray-300">{label}</span>
    </button>
  );

  const extraControlButtons = isHost && (
    <>
      {webinar.enable_chat && controlBarButton(
        'chat', <MessageSquare className="h-5 w-5 sm:h-7 sm:w-7" />, 'Chat', chatUnread,
        showRequests && activeManageTab === 'chat', () => openManageTab('chat'),
      )}
      {webinar.enable_qa && controlBarButton(
        'qa', <HelpCircle className="h-5 w-5 sm:h-7 sm:w-7" />, 'Q&A', qa.pendingQuestions.length,
        showRequests && activeManageTab === 'qa', () => openManageTab('qa'),
      )}
      {webinar.enable_polls && controlBarButton(
        'polls', <BarChart3 className="h-5 w-5 sm:h-7 sm:w-7" />, 'Polls', pollsUnread,
        showRequests && activeManageTab === 'polls', () => openManageTab('polls'),
      )}
    </>
  );

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
          onCaptionsBridgeChange={setCallCaptionsBridge}
          // Real bug found live (2026-09-22, screenshotted): DailyVideoCall's
          // own generic Chat and Host Controls ("Manage") buttons were
          // showing in the control bar alongside this page's OWN correctly-
          // wired "Manage webinar" panel (top-right) — two same-labeled
          // buttons, only one of them actually connected to the webinar's
          // real audience-facing chat/roster. The built-in ones open a
          // disconnected RoomChatSidebar and a waiting-room admit UI neither
          // of which apply to webinars (audience never has a waiting room —
          // they're HLS-only viewers). Suppressed here; this Manage webinar
          // panel is the one true chat/roster/Q&A/polls surface.
          showChatButton={false}
          showHostControlsButton={false}
          extraControlButtons={extraControlButtons}
        />

        {!isPiP && captions.enabled && (
          <CaptionOverlay
            lines={captions.lines}
            size={captions.size}
            placeholder={
              captions.status === 'starting' || captions.status === 'waiting'
                ? 'Captions are on — they’ll appear when someone speaks.'
                : null
            }
          />
        )}

        {!isPiP && (callCaptionsBridge || (webinar.enable_translation && callTranslation)) && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2">
            {callCaptionsBridge && (
              <CaptionsButton
                enabled={captions.enabled}
                status={captions.status}
                size={captions.size}
                onToggle={captions.toggle}
                onSizeChange={captions.setSize}
              />
            )}
            {/* Live Translation only — captions no longer depend on the
                host's Captions setting (CaptionsButton above is on-demand). */}
            {webinar.enable_translation && callTranslation && (
              <FloatingTranslationButton
                translation={callTranslation}
                ministryId={webinar.ministry_id}
                roomName={webinar.room_name}
                isHost={isHost}
                userId={userId}
                showCaptionsOption={false}
              />
            )}
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
                {(speakerRequests.pendingRequests.length + qa.pendingQuestions.length + chatUnread + pollsUnread) > 0 && (
                  <Badge className="ml-2 bg-purple-600 text-white">
                    {speakerRequests.pendingRequests.length + qa.pendingQuestions.length + chatUnread + pollsUnread}
                  </Badge>
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
            <Tabs value={activeManageTab} onValueChange={setActiveManageTab} className="flex-1 flex flex-col min-h-0">
              <TabsList className="w-full justify-start rounded-none bg-transparent border-b border-white/10 h-auto p-0 px-2">
                <TabsTrigger value="speakers" className="gap-1.5 text-sm data-[state=active]:bg-white/10 py-3"><Hand className="h-4 w-4" /> Speakers</TabsTrigger>
                <TabsTrigger value="chat" className="gap-1.5 text-sm data-[state=active]:bg-white/10 py-3 relative">
                  <MessageSquare className="h-4 w-4" /> Chat
                  {chatUnread > 0 && (
                    <Badge className="h-4 min-w-4 px-1 bg-purple-600 text-white text-[10px]">{chatUnread}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="qa" className="gap-1.5 text-sm data-[state=active]:bg-white/10 py-3 relative">
                  <HelpCircle className="h-4 w-4" /> Q&amp;A
                  {qa.pendingQuestions.length > 0 && (
                    <Badge className="h-4 min-w-4 px-1 bg-purple-600 text-white text-[10px]">{qa.pendingQuestions.length}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="polls" className="gap-1.5 text-sm data-[state=active]:bg-white/10 py-3 relative">
                  <BarChart3 className="h-4 w-4" /> Polls
                  {pollsUnread > 0 && (
                    <Badge className="h-4 min-w-4 px-1 bg-purple-600 text-white text-[10px]">{pollsUnread}</Badge>
                  )}
                </TabsTrigger>
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
                    <WebinarQAModerationPanel qa={qa} />
                  ) : (
                    <p className="text-xs text-gray-500">Q&amp;A is disabled for this webinar.</p>
                  )}
                </TabsContent>
                <TabsContent value="polls" className="m-0">
                  {webinar.enable_polls ? (
                    <WebinarPollHostPanel polls={polls} />
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
