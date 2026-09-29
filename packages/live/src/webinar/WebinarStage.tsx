import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rekindle/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@rekindle/ui/dialog';
import { PhoneOff, X, Settings2, HelpCircle, BarChart3, Radio, MessageSquare, Users, Loader2 } from 'lucide-react';
import { supabase } from '@rekindle/supabase';
import DailyVideoCall, { type ModeratorControls } from '../components/DailyVideoCall';
import { useActiveCallOptional } from '../ActiveCallContext';
import { ChannelStreamConfig } from '../components/ChannelStreamConfig';
import { MeetingChatPanel } from '../components/MeetingChatPanel';
import { FloatingTranslationButton, type TranslationControls, type ScriptureControlState } from '../components/FloatingTranslationButton';
import { useMeetingPresence } from '../useMeetingPresence';
import { useMeetingChat } from '../useMeetingChat';
import { useWebinarSpeakerRequests } from './useWebinarSpeakerRequests';
import { useWebinarQuestions } from './useWebinarQuestions';
import { useWebinarPolls } from './useWebinarPolls';
import { stopWebinarBroadcast, goLiveWebinar, resolveWebinarRole, type MinistryWebinar } from './webinarControl';
import { startMeetingBroadcast, stopMeetingBroadcast } from '../meetingStreamControl';
import type { WebinarViewerRole } from './WebinarLobby';
import { WebinarQAModerationPanel } from './WebinarQAModerationPanel';
import { WebinarPollHostPanel } from './WebinarPollHostPanel';
import { WebinarPeoplePanel } from './WebinarPeoplePanel';

interface WebinarStageProps {
  webinar: MinistryWebinar;
  userId: string;
  userName: string;
  role: WebinarViewerRole;
  onEnded: () => void;
  onLeave: () => void;
  /** The host sent this speaker back to the audience. */
  onDemoted?: () => void;
}

/** Host/co-host/speaker broadcast view — the only participants who ever hold a
 *  LiveKit token in Phase 1. Attendees never appear here (see
 *  WebinarAttendeeViewer); a promoted attendee re-mounts into this component
 *  once their speaker request is accepted. */
export function WebinarStage({ webinar, userId, userName, role, onEnded, onLeave, onDemoted }: WebinarStageProps) {
  // `webinar` is the snapshot taken when the call started (WebinarJoinPage
  // hands a frozen node to ActiveCallHost), so status changes — backstage →
  // live above all — are tracked here from the row itself.
  const [liveStatus, setLiveStatus] = useState(webinar.status);
  useEffect(() => {
    const channel = supabase
      .channel(`webinar-stage-${webinar.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ministry_webinars', filter: `id=eq.${webinar.id}` },
        (payload) => setLiveStatus((payload.new as MinistryWebinar).status))
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch { /* noop */ } };
  }, [webinar.id]);
  const isBackstage = liveStatus === 'backstage';

  // The role can change mid-webinar: the host makes a speaker co-host, or
  // sends them back to the audience. The DB is the source of truth (it's what
  // RLS and livekit-token read); re-check it on a light poll.
  const [liveRole, setLiveRole] = useState(role);
  useEffect(() => {
    if (role === 'host') return;
    let cancelled = false;
    const check = async () => {
      const r = await resolveWebinarRole(webinar.id, webinar.host_id, userId);
      if (!cancelled) setLiveRole(r);
    };
    const poll = setInterval(check, 5000);
    return () => { cancelled = true; clearInterval(poll); };
  }, [role, webinar.id, webinar.host_id, userId]);
  useEffect(() => {
    if (liveRole === 'attendee' && role !== 'host') onDemoted?.();
  }, [liveRole, role, onDemoted]);

  // Who gets the host's controls right now (co-host included). DailyVideoCall
  // keeps the role it joined with; a co-host promoted mid-call gets its
  // in-room controls from their LiveKit metadata instead.
  const isHost = liveRole === 'host' || liveRole === 'co-host';
  const joinedAsHost = role === 'host' || role === 'co-host';
  const [moderatorControls, setModeratorControls] = useState<ModeratorControls | null>(null);
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
  const [activeManageTab, setActiveManageTab] = useState('people');

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
  // Live Scripture control state (2026-09-29) — same lift-to-parent pattern
  // as callTranslation, so DailyVideoCall can render its own toggle button +
  // side panel instead of it living in FloatingTranslationButton's popover.
  const [callScripture, setCallScripture] = useState<ScriptureControlState | null>(null);
  // Minimized mini-player awareness (2026-09-21) — mirrors
  // MinistryInteractiveMeetings.tsx's isPiP: this component is now mounted by
  // WebinarJoinPage via startCall()/ActiveCallHost (see that file), the same
  // persistent render surface Interactive Meetings uses, instead of rendering
  // inline. Without this, the frame kept forcing full viewport height even
  // inside ActiveCallHost's small mini-player frame, and the minimize button
  // itself only renders when this context is actually present (DailyVideoCall's
  // own logic) — both silently broken before this file ever wired in.
  const isPiP = useActiveCallOptional()?.minimized ?? false;

  // The audience-facing HLS Egress. It starts when someone presses Go live
  // (never backstage — that's the point of backstage), by then the room
  // exists because the host is in it. On (re)mount while already live it's
  // resumed: skipped when the stream is already running (a remount after the
  // tab was discarded used to start a redundant egress and hand the audience
  // a new URL mid-stream), started if it never did. Only the host's own
  // unmount stops it, so a co-host leaving doesn't cut the stream.
  const broadcastingRef = useRef(false);
  const [goingLive, setGoingLive] = useState(false);
  const startBroadcast = useCallback(async (): Promise<boolean> => {
    if (broadcastingRef.current) return true;
    broadcastingRef.current = true;
    // expectVideo=true: webinars are overwhelmingly presentations with video.
    const result = await startMeetingBroadcast(webinar.id, webinar.room_name, 'ministry_webinar', undefined, true);
    if (!result) broadcastingRef.current = false;
    return !!result;
  }, [webinar.id, webinar.room_name]);

  useEffect(() => {
    if (!joinedAsHost) return;
    if (webinar.status === 'live') {
      if (webinar.hls_playback_url) broadcastingRef.current = true;
      else startBroadcast().then((ok) => {
        if (!ok) toast.error("The stream couldn't start — attendees won't see anything yet. Try ending and restarting the webinar.");
      });
    }
    return () => {
      if (role === 'host' && broadcastingRef.current) stopMeetingBroadcast(webinar.id, webinar.room_name, 'ministry_webinar');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinedAsHost, webinar.id, webinar.room_name]);

  const handleGoLive = async () => {
    setGoingLive(true);
    try {
      const ok = await startBroadcast();
      if (!ok) {
        toast.error("The stream couldn't start, so attendees weren't let in. Try Go live again.");
        return;
      }
      await goLiveWebinar(webinar.id);
      setLiveStatus('live');
      toast.success("You're live. Attendees are being let in now.");
    } catch (err) {
      console.error('[WebinarStage] go live failed:', err);
      toast.error("Couldn't go live. Try again.");
    } finally {
      setGoingLive(false);
    }
  };

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
          isHost={joinedAsHost}
          meetingId={webinar.id}
          meetingKind="ministry_webinar"
          onCallEnd={onLeave}
          showControls
          autoJoin
          enableRecording={webinar.enable_recording}
          onTranslationControlsChange={setCallTranslation}
          onModeratorControlsChange={setModeratorControls}
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
          scriptureControl={callScripture}
        />

        {/* Was gated on (webinar.enable_captions || webinar.enable_translation)
            — that hid the button (Live Scripture included) entirely for any
            webinar that had both off. Neither flag is enforced server-side
            (start_webinar_captions_session only checks language_configs.
            is_public), so it was purely a client convenience toggle, not a
            real permission boundary — dropped it so Live Scripture is
            reachable independently of Captions/Translation here too
            (2026-09-28), matching MinistryInteractiveMeetings.tsx's own
            FloatingTranslationButton, which was already unconditional. */}
        {!isPiP && callTranslation && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50">
            <FloatingTranslationButton
              translation={callTranslation}
              ministryId={webinar.ministry_id}
              roomName={webinar.room_name}
              isHost={isHost}
              userId={userId}
              onScriptureStateChange={setCallScripture}
            />
          </div>
        )}

        {!isPiP && isBackstage && (
          <div className="absolute top-3 left-3 z-50 max-w-[60vw] rounded-lg bg-amber-500/95 px-3 py-2 text-sm text-gray-950 shadow-lg">
            <span className="font-semibold">Backstage.</span>{' '}
            {isHost
              ? 'Only you and your speakers can see and hear this. Attendees are let in when you press Go live.'
              : "You're backstage. Attendees can't see or hear you until the host goes live."}
          </div>
        )}

        {!isPiP && (
          <div className="absolute top-3 right-3 z-50 flex gap-2">
            {isHost && isBackstage && (
              <Button
                onClick={handleGoLive}
                disabled={goingLive}
                size="sm"
                className="h-10 px-4 text-sm bg-green-600 hover:bg-green-700 text-white shadow-lg"
              >
                {goingLive ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Radio className="h-5 w-5 mr-2" />}
                {goingLive ? 'Going live…' : 'Go live'}
              </Button>
            )}
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
                <TabsTrigger value="people" className="gap-1.5 text-sm data-[state=active]:bg-white/10 py-3 relative">
                  <Users className="h-4 w-4" /> People
                  {speakerRequests.pendingRequests.length > 0 && (
                    <Badge className="h-4 min-w-4 px-1 bg-purple-600 text-white text-[10px]">{speakerRequests.pendingRequests.length}</Badge>
                  )}
                </TabsTrigger>
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
                <TabsContent value="people" className="m-0">
                  <WebinarPeoplePanel
                    webinar={{ ...webinar, status: liveStatus }}
                    userId={userId}
                    isHost={liveRole === 'host'}
                    controls={moderatorControls}
                    speakerRequests={speakerRequests}
                    presenceMembers={presenceMembers}
                  />
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
