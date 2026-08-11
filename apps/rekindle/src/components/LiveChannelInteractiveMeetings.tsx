import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { shareMeeting, publicAppOrigin } from '@/lib/liveShare';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Video, Users, Clock, Plus, Play,
  Copy, AlertCircle, Loader2,
  PhoneOff, MessageSquare,
  Zap, Circle, Trash2, Crown, Globe, MonitorUp,
  Sparkles, FileText, Hand, GripVertical, X, Calendar
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useUserEntitlements } from '@/hooks/useUserEntitlements';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  zonedWallTimeToUtcISO,
  utcISOToZonedInputValue,
  formatMeetingTime,
  guessUserTimeZone,
  commonTimeZones,
  REMINDER_OFFSET_OPTIONS,
} from '@rekindle/features/meetingTime';
import RegisterMeetingButton from '@rekindle/live/components/RegisterMeetingButton';
import { useActiveCall, useActiveCallOptional } from '@rekindle/live/ActiveCallContext';
import { toast } from 'sonner';
import MeetingRecordingPanel from './MeetingRecordingPanel';
import { MeetingRecordings } from '@/components/MeetingRecordings';
import { MinistryRecordingsTab } from '@/components/MinistryRecordingsTab';
import SavedMeetingInsights from './SavedMeetingInsights';

// Import the DailyVideoCall component - SOLE CONTROLLER OF ALL MEDIA
import DailyVideoCall from './DailyVideoCall';
import { HlsPlayer } from './HlsPlayer';
import { createMeetingStream, reprovisionMeetingStream, stopMeetingStream, startMeetingBroadcast, stopMeetingBroadcast } from '@/lib/muxMeetingStream';
import { isLiveKitBackend } from '@/lib/videoBackend';
import { useMeetingStage } from '@/hooks/useMeetingStage';
import { useMeetingReactions } from '@/hooks/useMeetingReactions';
import { useMeetingPresence } from '@/hooks/useMeetingPresence';
import { MeetingReactionsLayer, ReactionBar, ReactionButton } from '@/components/MeetingReactions';
import { FloatingBackgroundButton } from '@rekindle/live/components/FloatingBackgroundButton';
import { FloatingSpeakerButton } from '@rekindle/live/components/FloatingSpeakerButton';
import { MeetingNotesBanner } from '@/components/MeetingNotesBanner';
import { MeetingChatPanel } from '@/components/MeetingChatPanel';

// Import subscription enforcement functions
import {
  getUserActiveSubscription,
  canHostInteractiveMeeting,
  getMaxMeetingDuration,
  canRecordMeetings,
  logUsage,
  AccessCheckResult,
  UserSubscription
} from '@/lib/subscriptionEnforcement';

/* ======================================================
   TYPES
====================================================== */
interface LiveChannelVideoMeeting {
  id: string;
  channel_id: string;
  host_id: string;
  title: string;
  description?: string;
  room_name: string;
  room_url?: string;
  mode?: 'meeting' | 'webinar';
  hls_playback_url?: string;
  scheduled_time?: string;
  duration_minutes: number;
  meeting_type: 'instant' | 'scheduled';
  is_recurring: boolean;
  recurrence_pattern?: string;
  max_participants: number;
  access_level: 'public' | 'followers' | 'cohosts';
  enable_recording: boolean;
  enable_chat: boolean;
  enable_screenshare: boolean;
  is_active: boolean;
  participant_count: number;
  timezone?: string | null;
  reminder_offsets?: number[] | null;
  registration_enabled?: boolean;
  created_at: string;
  updated_at: string;
  started_at?: string;
  ended_at?: string;
}

interface CreateMeetingFormData {
  title: string;
  description: string;
  mode: 'meeting' | 'webinar';
  meeting_type: 'instant' | 'scheduled';
  scheduled_time: string;
  timezone: string;
  reminder_offsets: number[];
  registration_enabled: boolean;
  duration_minutes: number;
  max_participants: number;
  access_level: 'public' | 'followers' | 'cohosts';
  enable_recording: boolean;
  enable_chat: boolean;
  enable_screenshare: boolean;
}

/* ======================================================
   ENHANCED VIDEO CALL WRAPPER
   
   IMPORTANT: This wrapper does NOT manage any media state.
   All audio, video, and participant media is exclusively
   controlled by the DailyVideoCall component (Daily.co).
====================================================== */
const EnhancedVideoCallWrapper = ({ 
  meeting, 
  userName, 
  userId, 
  isHost, 
  onLeave, 
  channelId, 
  onEndMeeting 
}: { 
  meeting: LiveChannelVideoMeeting; 
  userName: string;
  userId: string;
  isHost: boolean;
  onLeave: () => void;
  channelId: string;
  onEndMeeting?: () => void;
}) => {
  const { t } = useLanguage();
  const [meetingEnded, setMeetingEnded] = useState(false);

  // Webinar/livestream mode: the host (and any speakers the host invites up) join
  // the Daily call; everyone else watches the HLS output with live reactions,
  // chat, and the option to raise a hand to be invited up. The audience never
  // counts as a Daily participant — cost is bounded to host + invited seats.
  const isWebinar = meeting.mode === 'webinar';
  const hlsUrl = meeting.hls_playback_url;
  const isGuest = !userId || userId.startsWith('guest-');
  const [rtmpUrl, setRtmpUrl] = useState<string | undefined>(undefined);

  // Shared webinar building blocks (all keyed by meeting id).
  const stage = useMeetingStage(meeting.id, userId, userName, isHost);
  const isPresenter = stage.isPresenter; // host, or a viewer the host invited up
  // Enabled for every meeting (not just webinars) — reactions ride Supabase realtime.
  const { floating: reactions, sendReaction } = useMeetingReactions(meeting.id, true);
  // Host OR any ministry-tier member may take AI notes from their own browser.
  const { hasMinistryAccess } = useUserEntitlements();
  // True while AI notes run anywhere in the meeting — drives the consent banner.
  const [notesActive, setNotesActive] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const presenceMembers = useMeetingPresence(meeting.id, userId, userName, isGuest, isWebinar);

  // Minimized (mini-player) state comes straight from the ActiveCall host, so the
  // reaction bar and other overlays hide reliably — a width heuristic was flaky
  // (the mini-player is ~352px wide, above the 300px threshold, so it never fired).
  const activeCall = useActiveCallOptional();
  const isPiP = (activeCall?.minimized || activeCall?.isSystemPiP) ?? false;
  const wrapperRef = useRef<HTMLDivElement>(null);
  // True while a DailyVideoCall side panel (chat / host controls) is open — used to
  // hide the Copy Link / End chrome so it doesn't collide with the panel.
  const [panelOpen, setPanelOpen] = useState(false);
  // In-call raise-hand, reported by DailyVideoCall so the button can sit beside
  // ReactionButton instead of taking a slot in the control bar.
  const [callHandRaise, setCallHandRaise] = useState<{ handRaised: boolean; raiseHand: () => void } | null>(null);
  // Same idea for the Background/Effects picker — reported by DailyVideoCall so
  // it can sit beside ReactionButton + Raise Hand instead of the control bar.
  const [callBackground, setCallBackground] = useState<{ videoBackground: string; setVideoBackground: (mode: string) => void; isNative: boolean } | null>(null);

  // Draggable host "stage" panel position.
  const [stagePanelPos, setStagePanelPos] = useState({ x: 0, y: 0 });
  const stagePanelDrag = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [isDraggingStagePanel, setIsDraggingStagePanel] = useState(false);
  const handleStagePanelPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    stagePanelDrag.current = { startX: e.clientX, startY: e.clientY, originX: stagePanelPos.x, originY: stagePanelPos.y };
    setIsDraggingStagePanel(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [stagePanelPos]);
  const handleStagePanelPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!stagePanelDrag.current) return;
    const { startX, startY, originX, originY } = stagePanelDrag.current;
    setStagePanelPos({ x: originX + (e.clientX - startX), y: originY + (e.clientY - startY) });
  }, []);
  const handleStagePanelPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    stagePanelDrag.current = null;
    setIsDraggingStagePanel(false);
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  // The host pushes one RTMP stream to Mux. A webinar needs it for the HLS
  // audience feed; a recording-enabled meeting needs it so Mux records the call.
  useEffect(() => {
    if (!isHost) return;

    // LiveKit: no Mux, no RTMP push. A webinar needs an HLS Egress so the audience
    // has something to watch; a plain meeting's recording is handled by the record
    // button (room-composite Egress), so nothing to provision here.
    if (isLiveKitBackend()) {
      if (!isWebinar) return;
      startMeetingBroadcast(meeting.id, meeting.room_name, 'channel_meeting', channelId).then((p) => {
        if (!p) console.warn('[Meeting] HLS Egress did not start — audience has no stream.');
      });
      return () => { stopMeetingBroadcast(meeting.id, meeting.room_name, 'channel_meeting', channelId); };
    }

    const needsStream = isWebinar || meeting.enable_recording !== false;
    if (!needsStream) return;
    createMeetingStream(meeting.id, meeting.enable_recording !== false).then((p) => {
      if (p?.rtmpUrl) setRtmpUrl(p.rtmpUrl);
    });
  }, [isWebinar, isHost, meeting.id, meeting.room_name, meeting.enable_recording, channelId]);

  // When an invited speaker leaves, free their seat for the next raised hand.
  useEffect(() => {
    if (isHost || !isWebinar) return;
    return () => { stage.removePresenter(userId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWebinar, isHost, userId]);

  // Audience: detect when the host ends the meeting (poll + realtime) so we can
  // notify them and close automatically instead of leaving them on a dead screen.
  useEffect(() => {
    if (isHost) return;
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase
        .from('live_channel_video_meetings')
        .select('is_active')
        .eq('id', meeting.id)
        .maybeSingle();
      if (!cancelled && data && data.is_active === false) setMeetingEnded(true);
    };
    check();
    const poll = setInterval(check, 4000);

    let statusChannel: ReturnType<typeof supabase.channel> | null = null;
    try {
      statusChannel = supabase
        .channel(`lc-meeting-status-${meeting.id}`)
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'live_channel_video_meetings', filter: `id=eq.${meeting.id}` },
          (payload) => { if ((payload.new as any)?.is_active === false) setMeetingEnded(true); })
        .subscribe();
    } catch { statusChannel = null; }

    return () => {
      cancelled = true;
      clearInterval(poll);
      try { if (statusChannel) supabase.removeChannel(statusChannel); } catch { /* noop */ }
    };
  }, [isHost, meeting.id]);

  // Notify + auto-close the audience when the host ends the meeting.
  useEffect(() => {
    if (!meetingEnded || isHost) return;
    toast(t('liveChannelInteractiveMeetings', 'hostEndedMeeting', 'The host has ended this meeting'));
    const timer = setTimeout(() => { onLeave(); }, 2500);
    return () => clearTimeout(timer);
  }, [meetingEnded, isHost, onLeave]);

  // Handle host ending meeting for all participants
  const handleHostEndMeeting = async () => {
    if (!isHost || !onEndMeeting) return;

    try {
      await supabase
        .from('live_channel_video_meetings')
        .update({
          is_active: false,
          ended_at: new Date().toISOString(),
          participant_count: 0
        })
        .eq('id', meeting.id);

      toast.success(t('liveChannelInteractiveMeetings', 'meetingEndedForAll', 'Meeting ended for all participants'));
      onEndMeeting();
    } catch (error) {
      console.error('Error ending meeting:', error);
      toast.error(t('liveChannelInteractiveMeetings', 'failedEndMeeting', 'Failed to end meeting'));
    }
  };

  // Handle session completion to update database
  const handleSessionComplete = async (duration: number) => {
    try {
      console.log('Meeting completed. Duration:', duration, 'seconds');
      await logUsage(userId, 'interactive_meeting_ended', {
        meeting_id: meeting.id,
        duration_seconds: duration,
        channel_id: channelId
      });
    } catch (error) {
      console.error('Error logging session completion:', error);
    }
  };

  // Handle admitting participant from waiting room
  const handleAdmitParticipant = async (participantId: string) => {
    try {
      console.log('Admitting participant:', participantId);
      toast.success(t('liveChannelInteractiveMeetings', 'participantAdmitted', 'Participant admitted to meeting'));
    } catch (error) {
      console.error('Error admitting participant:', error);
      toast.error(t('liveChannelInteractiveMeetings', 'failedAdmit', 'Failed to admit participant'));
    }
  };

  // Handle removing participant from meeting
  const handleRemoveParticipant = async (participantId: string) => {
    try {
      const { error } = await supabase
        .from('meeting_participants')
        .update({
          is_active: false,
          left_at: new Date().toISOString()
        })
        .eq('meeting_id', meeting.id)
        .eq('session_id', participantId);

      if (error) {
        console.error('Database error removing participant:', error);
      }

      console.log('Removing participant:', participantId);
      toast.success(t('liveChannelInteractiveMeetings', 'participantRemoved', 'Participant removed from meeting'));
    } catch (error) {
      console.error('Error removing participant:', error);
      toast.error(t('liveChannelInteractiveMeetings', 'failedRemove', 'Failed to remove participant'));
    }
  };

  if (meetingEnded && !isHost) {
    return (
      <div className="relative h-screen flex flex-col items-center justify-center bg-gray-900 text-center text-gray-200 gap-3 p-6">
        <PhoneOff className="h-10 w-10 text-gray-400" />
        <div>
          <p className="font-medium text-lg">{t('liveChannelInteractiveMeetings', 'hostEndedMeeting', 'The host has ended this meeting')}</p>
          <p className="text-sm text-gray-500">{t('liveChannelInteractiveMeetings', 'closing', 'Closing…')}</p>
        </div>
      </div>
    );
  }

  // ── Webinar audience (not a presenter): HLS + reactions + chat + raise hand ──
  if (isWebinar && !isPresenter) {
    return (
      <div className="min-h-screen h-full bg-black flex flex-col sm:flex-row">
        <div className="relative sm:flex-1 min-h-0 flex flex-col">
          <div className="w-full aspect-video sm:flex-1 sm:aspect-auto sm:min-h-0">
            {hlsUrl ? (
              <HlsPlayer src={hlsUrl} onEnded={() => setMeetingEnded(true)} className="w-full h-full" />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-300 p-6 text-center">
                {t('liveChannelInteractiveMeetings', 'broadcastNotStarted', 'The broadcast hasn’t started yet. This will begin playing automatically once the host goes live.')}
              </div>
            )}
          </div>

          {/* Floating reactions over the stream */}
          <MeetingReactionsLayer reactions={reactions} />
          <div className="absolute top-3 left-3 z-50"><MeetingNotesBanner active={notesActive} /></div>

          <div className="z-50 flex flex-col items-center gap-2 py-3 sm:py-0 sm:absolute sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2">
            <ReactionBar onReact={sendReaction} />
            {isGuest ? (
              <div className="bg-gray-800/80 backdrop-blur-sm text-gray-300 text-xs rounded-md px-2.5 py-1">
                {t('liveChannelInteractiveMeetings', 'signInToChat', 'Sign in to chat or request to speak')}
              </div>
            ) : (
              <button
                onClick={stage.hasRaisedHand ? stage.lowerHand : stage.raiseHand}
                className={`flex items-center text-xs rounded-full px-3 py-1.5 transition-colors ${
                  stage.hasRaisedHand
                    ? 'bg-gray-700 text-white hover:bg-gray-600'
                    : 'bg-purple-600/90 text-white hover:bg-purple-700'
                }`}
              >
                <Hand className="h-3.5 w-3.5 mr-1" />
                {stage.hasRaisedHand ? t('liveChannelInteractiveMeetings', 'waitingToBeInvited', 'Waiting to be invited…') : t('liveChannelInteractiveMeetings', 'raiseHandToSpeak', 'Raise hand to speak')}
              </button>
            )}
          </div>

          <div className="absolute top-3 right-3 z-50">
            <Button onClick={onLeave} size="sm" className="bg-red-600 hover:bg-red-700 text-white shadow-lg">
              <PhoneOff className="h-4 w-4 mr-2" />
              {t('liveChannelInteractiveMeetings', 'leave', 'Leave')}
            </Button>
          </div>
        </div>

        {/* Chat sidebar (below the video on mobile, beside it on larger screens) */}
        <div className="w-full sm:w-80 flex-1 sm:flex-none min-h-0 sm:h-auto shrink-0">
          <MeetingChatPanel meetingId={meeting.id} userId={userId} userName={userName} isGuest={isGuest} />
        </div>
      </div>
    );
  }

  // ── Host / invited speakers (webinar), and everyone (meeting mode) ──
  return (
    <div
      ref={wrapperRef}
      // In the mini-player, fill the host's small frame (h-full). Forcing viewport
      // height here made the video render full-height and object-contain letterbox
      // it, so the clipped mini-player showed only the black bar → blank frame.
      className={isPiP ? 'relative h-full w-full' : 'relative h-[100dvh]'}
    >
      <DailyVideoCall
        roomName={meeting.room_name}
        userName={userName}
        userId={userId}
        isHost={isHost}
        meetingId={meeting.id}
        meetingKind="channel_meeting"
        onCallEnd={onLeave}
        onSessionComplete={handleSessionComplete}
        showControls={true}
        autoJoin={false}
        showParticipantList={isHost}
        onAdmitParticipant={handleAdmitParticipant}
        onRemoveParticipant={handleRemoveParticipant}
        enableRecording={!isWebinar && isHost && meeting.enable_recording}
        liveStreamRtmpUrl={isHost ? rtmpUrl : undefined}
        onSidePanelToggle={setPanelOpen}
        onReact={sendReaction}
        onRaiseHandStateChange={setCallHandRaise}
        onBackgroundStateChange={setCallBackground}
      />

      {/* Floating reactions + a single reaction button that opens a popover just
          above the control bar — available in every meeting, not just webinars
          (transport is Supabase realtime broadcast). HIDDEN in PiP mode. Raise
          Hand, the Background/Effects picker, and Speaker all sit right beside
          it (all moved out of the control bar, which was overflowing the
          screen on mobile with too many buttons in one row). */}
      {!isPiP && <MeetingReactionsLayer reactions={reactions} />}
      {!isPiP && <div className="absolute top-3 left-3 z-50"><MeetingNotesBanner active={notesActive} /></div>}
      {!isPiP && (
        <div className="absolute bottom-24 sm:bottom-28 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2">
          {callBackground && (
            <FloatingBackgroundButton
              isNative={callBackground.isNative}
              value={callBackground.videoBackground}
              onChange={callBackground.setVideoBackground}
            />
          )}
          {callBackground && !callBackground.isNative && <FloatingSpeakerButton />}
          <ReactionButton onReact={sendReaction} />
          {callHandRaise && (
            <button
              type="button"
              onClick={callHandRaise.raiseHand}
              disabled={callHandRaise.handRaised}
              title={callHandRaise.handRaised ? 'Hand Raised' : 'Raise Hand'}
              className={`flex h-10 w-10 items-center justify-center rounded-full shadow-lg backdrop-blur-sm transition-colors ${
                callHandRaise.handRaised ? 'bg-amber-600 text-white' : 'bg-gray-900/70 text-white hover:bg-gray-800/80'
              }`}
            >
              <Hand className="h-5 w-5" />
            </button>
          )}
        </div>
      )}

      {/* Additional Features Overlay - UI only, no media control. Hidden in the
          mini-player, and while a side panel (chat / host controls) is open so the
          Copy Link / End buttons don't sit on top of it. */}
      {!isPiP && !panelOpen && (
      <div className="absolute top-2 right-2 sm:top-4 sm:right-4 flex gap-1 sm:gap-2 z-50">
        <Button
          onClick={async () => {
            const link = `${publicAppOrigin()}/channel/${channelId}/meeting/${meeting.id}`;
            const r = await shareMeeting({ title: meeting.title, scheduledTime: meeting.scheduled_time, timezone: meeting.timezone, registrationEnabled: meeting.registration_enabled, url: link });
            if (r.method !== 'native') toast.success(t('liveChannelInteractiveMeetings', 'inviteCopied', 'Meeting invite copied — paste it anywhere to invite people!'));
          }}
          variant="secondary"
          size="sm"
          className="bg-white/90 text-gray-900 hover:bg-white backdrop-blur-sm border border-gray-200 shadow-sm"
        >
          <Copy className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">{t('liveChannelInteractiveMeetings', 'copyLink', 'Copy Link')}</span>
        </Button>

        {isHost && onEndMeeting && (
          <Button
            onClick={handleHostEndMeeting}
            variant="destructive"
            size="sm"
            className="bg-orange-600/90 backdrop-blur-sm hover:bg-orange-700"
          >
            <PhoneOff className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('liveChannelInteractiveMeetings', 'endForAll', 'End for All')}</span>
          </Button>
        )}
      </div>
      )}

      {/* ── AI Recording & Transcription — tucked behind a compact button ── */}
      {isHost && !isPiP && (
        <div className="absolute top-20 left-4 z-50 max-w-xs">
          {showAiPanel ? (
            <div className="space-y-2">
              <div className="flex justify-end">
                <button
                  onClick={() => setShowAiPanel(false)}
                  className="bg-gray-900/80 backdrop-blur-sm text-white/80 hover:text-white rounded-full p-1.5"
                  title={t('liveChannelInteractiveMeetings', 'hideAiFeatures', 'Hide AI features')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <MeetingRecordingPanel
                meetingId={meeting.id}
                meetingTitle={meeting.title}
                speakerName={userName}
                userId={userId}
                isHost={isHost}
                tableName="live_channel_video_meetings"
                enableRecording={meeting.enable_recording}
                inCallOverlay={true}
                canTakeNotes={hasMinistryAccess}
                onStateChange={(s) => setNotesActive(s === 'recording')}
              />
            </div>
          ) : (
            <button
              onClick={() => setShowAiPanel(true)}
              className="flex items-center gap-1.5 bg-gray-900/80 backdrop-blur-sm text-white rounded-full px-3 py-2 text-sm hover:bg-gray-800"
              title={t('liveChannelInteractiveMeetings', 'aiFeatures', 'AI features')}
            >
              <Sparkles className="h-4 w-4" /> {t('liveChannelInteractiveMeetings', 'ai', 'AI')}
            </button>
          )}
        </div>
      )}

      {/* Host stage panel (webinar): invite raised hands / audience up, manage speakers */}
      {isHost && isWebinar && !isPiP && (
        <div
          className="absolute bottom-36 left-4 z-50 w-64 max-w-[80vw] bg-gray-900/90 backdrop-blur-sm rounded-lg text-white max-h-[50vh] flex flex-col overflow-hidden"
          style={{ transform: `translate(${stagePanelPos.x}px, ${stagePanelPos.y}px)`, touchAction: 'none' }}
        >
          <div
            onPointerDown={handleStagePanelPointerDown}
            onPointerMove={handleStagePanelPointerMove}
            onPointerUp={handleStagePanelPointerUp}
            onPointerCancel={handleStagePanelPointerUp}
            className={`flex items-center gap-1.5 px-3 py-2 border-b border-white/10 select-none ${isDraggingStagePanel ? 'cursor-grabbing' : 'cursor-grab'}`}
            title={t('liveChannelInteractiveMeetings', 'dragToMove', 'Drag to move')}
          >
            <GripVertical className="h-3.5 w-3.5 text-gray-500" />
            <span className="text-xs font-medium text-gray-400">
              {t('liveChannelInteractiveMeetings', 'stageSeats', 'Stage · {taken}/{max} seats').replace('{taken}', String(stage.seatsTaken)).replace('{max}', String(stage.maxSeats))}
            </span>
          </div>
          <div className="p-3 space-y-3 overflow-y-auto">
            <div>
              <p className="text-xs font-medium text-gray-300 mb-1">{t('liveChannelInteractiveMeetings', 'raisedHands', 'Raised hands')}</p>
              {stage.raisedHands.length === 0 ? (
                <p className="text-xs text-gray-500">{t('liveChannelInteractiveMeetings', 'noOneWaiting', 'No one waiting.')}</p>
              ) : (
                <div className="space-y-1">
                  {stage.raisedHands.map(h => (
                    <div key={h.user_id} className="flex items-center justify-between gap-2">
                      <span className="text-sm truncate">{h.user_name || t('liveChannelInteractiveMeetings', 'guest', 'Guest')}</span>
                      <Button
                        size="sm"
                        className="h-7 px-2 bg-purple-600 hover:bg-purple-700"
                        onClick={() => stage.invitePresenter(h.user_id, h.user_name)}
                      >
                        {t('liveChannelInteractiveMeetings', 'inviteUp', 'Invite up')}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {stage.presenters.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-300 mb-1">{t('liveChannelInteractiveMeetings', 'onStage', 'On stage')}</p>
                <div className="space-y-1">
                  {stage.presenters.map(p => (
                    <div key={p.user_id} className="flex items-center justify-between gap-2">
                      <span className="text-sm truncate">{p.user_name || t('liveChannelInteractiveMeetings', 'guest', 'Guest')}{p.role === 'cohost' ? t('liveChannelInteractiveMeetings', 'cohostSuffix', ' (co-host)') : ''}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-gray-400 hover:text-white"
                        title={t('liveChannelInteractiveMeetings', 'sendBackToAudience', 'Send back to audience')}
                        onClick={() => stage.removePresenter(p.user_id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-gray-300 mb-1">
                {t('liveChannelInteractiveMeetings', 'audienceCount', 'Audience ({count})').replace('{count}', String(presenceMembers.filter(m => m.userId !== userId).length))}
              </p>
              {presenceMembers.filter(m => m.userId !== userId).length === 0 ? (
                <p className="text-xs text-gray-500">{t('liveChannelInteractiveMeetings', 'noOneWatching', 'No one watching yet.')}</p>
              ) : (
                <div className="space-y-1">
                  {presenceMembers
                    .filter(m => m.userId !== userId && !stage.presenters.some(p => p.user_id === m.userId))
                    .map(m => {
                      const raised = stage.raisedHands.some(h => h.user_id === m.userId);
                      return (
                        <div key={m.userId} className="flex items-center justify-between gap-2">
                          <span className="text-sm truncate">
                            {raised && <Hand className="inline h-3 w-3 text-purple-300 mr-1" />}
                            {m.userName}{m.isGuest ? t('liveChannelInteractiveMeetings', 'guestSuffix', ' (guest)') : ''}
                          </span>
                          {m.isGuest ? (
                            <span className="text-[10px] text-gray-500">{t('liveChannelInteractiveMeetings', 'viewing', 'viewing')}</span>
                          ) : (
                            <Button
                              size="sm"
                              className="h-7 px-2 bg-purple-600 hover:bg-purple-700"
                              onClick={() => stage.invitePresenter(m.userId, m.userName)}
                            >
                              {t('liveChannelInteractiveMeetings', 'inviteUp', 'Invite up')}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const CreateMeetingModal = ({ isOpen, onClose, onSuccess, channelId, meeting }: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (meeting: LiveChannelVideoMeeting) => void;
  channelId: string;
  /** When set, the modal edits this meeting instead of creating a new one. */
  meeting?: LiveChannelVideoMeeting | null;
}) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isEditing = !!meeting;
  const [isLoading, setIsLoading] = useState(false);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [accessCheck, setAccessCheck] = useState<AccessCheckResult | null>(null);
  const [maxDuration, setMaxDuration] = useState<number | null>(null);

  const [formData, setFormData] = useState<CreateMeetingFormData>({
    title: '',
    description: '',
    mode: 'meeting',
    meeting_type: 'instant',
    scheduled_time: '',
    timezone: guessUserTimeZone(),
    reminder_offsets: [],
    registration_enabled: false,
    duration_minutes: 60,
    max_participants: 50,
    access_level: 'public',
    enable_recording: false,
    enable_chat: true,
    enable_screenshare: true,
  });
  const tzOptions = React.useMemo(() => commonTimeZones(), []);

  // Prefill when opening in edit mode.
  useEffect(() => {
    if (!isOpen || !meeting) return;
    const tz = meeting.timezone || guessUserTimeZone();
    setFormData({
      title: meeting.title,
      description: meeting.description || '',
      mode: meeting.mode || 'meeting',
      meeting_type: meeting.meeting_type,
      scheduled_time: meeting.scheduled_time ? utcISOToZonedInputValue(meeting.scheduled_time, tz) : '',
      timezone: tz,
      reminder_offsets: meeting.reminder_offsets || [],
      registration_enabled: meeting.registration_enabled ?? false,
      duration_minutes: meeting.duration_minutes,
      max_participants: meeting.max_participants,
      access_level: meeting.access_level,
      enable_recording: meeting.enable_recording,
      enable_chat: meeting.enable_chat,
      enable_screenshare: meeting.enable_screenshare,
    });
  }, [isOpen, meeting]);

  useEffect(() => {
    const loadSubscription = async () => {
      if (!user?.id) return;
      
      try {
        const userSubscription = await getUserActiveSubscription(user.id);
        setSubscription(userSubscription);
        
        if (userSubscription) {
          const canHost = await canHostInteractiveMeeting(user.id);
          setAccessCheck(canHost);
          
          const maxDur = await getMaxMeetingDuration(user.id);
          setMaxDuration(maxDur);
          
          if (formData.enable_recording) {
            const canRecord = await canRecordMeetings(user.id);
            if (!canRecord.allowed) {
              setFormData(prev => ({ ...prev, enable_recording: false }));
              toast.warning(t('liveChannelInteractiveMeetings', 'recordingRequiresPlus', 'Recording requires Ministry Plus subscription'));
            }
          }
        }
      } catch (error) {
        console.error('Error loading subscription:', error);
      }
    };

    if (isOpen && user?.id) {
      loadSubscription();
    }
  }, [isOpen, user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error(t('liveChannelInteractiveMeetings', 'mustBeLoggedIn', 'You must be logged in to create a meeting'));
      return;
    }

    if (!accessCheck?.allowed) {
      toast.error(accessCheck?.reason || t('liveChannelInteractiveMeetings', 'subscriptionRequired', 'Subscription required for interactive meetings'));
      return;
    }

    const isScheduled = formData.meeting_type === 'scheduled';
    const scheduledUtc = isScheduled && formData.scheduled_time
      ? zonedWallTimeToUtcISO(formData.scheduled_time, formData.timezone)
      : null;
    if (isScheduled && !scheduledUtc) {
      toast.error(t('liveChannelInteractiveMeetings', 'invalidScheduledTime', 'Please pick a valid scheduled time.'));
      return;
    }

    setIsLoading(true);

    try {
      const sharedFields = {
        title: formData.title,
        description: formData.description,
        meeting_type: formData.meeting_type,
        scheduled_time: scheduledUtc,
        timezone: isScheduled ? formData.timezone : null,
        reminder_offsets: isScheduled ? formData.reminder_offsets : [],
        registration_enabled: isScheduled ? formData.registration_enabled : false,
        duration_minutes: formData.duration_minutes,
        max_participants: formData.max_participants,
        access_level: formData.access_level,
        enable_recording: formData.enable_recording,
        enable_chat: formData.enable_chat,
        enable_screenshare: formData.enable_screenshare,
      };

      // Editing an existing meeting: update in place, don't touch room/mode/stream.
      // Changing the schedule clears the reminder ledger so new times re-fire.
      if (isEditing && meeting) {
        const { data, error } = await supabase
          .from('live_channel_video_meetings')
          .update(sharedFields)
          .eq('id', meeting.id)
          .select()
          .single();
        if (error) throw error;
        await supabase.from('meeting_reminder_sends').delete().eq('meeting_id', meeting.id);
        toast.success(t('liveChannelInteractiveMeetings', 'meetingUpdatedSuccess', 'Meeting updated'));
        onSuccess(data);
        onClose();
        return;
      }

      const roomName = `channel-${channelId}-${Date.now()}`;
      const { data, error } = await supabase
        .from('live_channel_video_meetings')
        .insert({
          channel_id: channelId,
          host_id: user.id,
          room_name: roomName,
          mode: formData.mode,
          is_active: false,
          participant_count: 0,
          ...sharedFields,
        })
        .select()
        .single();

      if (error) throw error;

      // Webinar/livestream: provision a Cloudflare live input and store its HLS
      // playback URL on the meeting, so the audience can watch a one-way stream
      // without joining the Daily call as participants.
      if (formData.mode === 'webinar') {
        const provisioned = await createMeetingStream(data.id, formData.enable_recording);
        if (provisioned?.playbackUrl) {
          await supabase
            .from('live_channel_video_meetings')
            .update({ hls_playback_url: provisioned.playbackUrl })
            .eq('id', data.id);
        } else {
          toast.error(t('liveChannelInteractiveMeetings', 'streamSetupFailed', 'Meeting created, but the live stream could not be set up. Check streaming configuration.'));
        }
      }

      await logUsage(user.id, 'interactive_meeting_created', {
        meeting_id: data.id,
        channel_id: channelId
      });

      toast.success(t('liveChannelInteractiveMeetings', 'meetingCreatedSuccess', 'Meeting created successfully!'));
      onSuccess(data);
      onClose();
    } catch (error: any) {
      console.error('Error creating meeting:', error);
      toast.error(error.message || t('liveChannelInteractiveMeetings', 'failedCreateMeeting', 'Failed to create meeting'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? t('liveChannelInteractiveMeetings', 'editInteractiveMeeting', 'Edit Meeting')
              : t('liveChannelInteractiveMeetings', 'createInteractiveMeeting', 'Create Interactive Meeting')}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? t('liveChannelInteractiveMeetings', 'editMeetingDesc', 'Update this meeting’s details, schedule, and reminders')
              : t('liveChannelInteractiveMeetings', 'setUpNewMeeting', 'Set up a new video meeting for your channel')}
          </DialogDescription>
        </DialogHeader>

        {!accessCheck?.allowed && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {accessCheck?.reason || t('liveChannelInteractiveMeetings', 'subscriptionRequired', 'Subscription required for interactive meetings')}
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">{t('liveChannelInteractiveMeetings', 'meetingTitleLabel', 'Meeting Title *')}</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder={t('liveChannelInteractiveMeetings', 'meetingTitlePlaceholder', 'e.g., Weekly Prayer Meeting')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('liveChannelInteractiveMeetings', 'descriptionLabel', 'Description')}</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={t('liveChannelInteractiveMeetings', 'descriptionPlaceholder', 'Optional meeting description...')}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('liveChannelInteractiveMeetings', 'meetingTypeLabel', 'Meeting Type')}</Label>
            <Select
              value={formData.meeting_type}
              onValueChange={(value: 'instant' | 'scheduled') => 
                setFormData({ ...formData, meeting_type: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="instant">{t('liveChannelInteractiveMeetings', 'instantMeeting', 'Instant Meeting')}</SelectItem>
                <SelectItem value="scheduled">{t('liveChannelInteractiveMeetings', 'scheduledMeeting', 'Scheduled Meeting')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.meeting_type === 'scheduled' && (
            <div className="space-y-4 rounded-lg border border-purple-100 bg-purple-50/40 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="scheduled_time">{t('liveChannelInteractiveMeetings', 'scheduledTimeLabel', 'Scheduled Time')}</Label>
                  <Input
                    id="scheduled_time"
                    type="datetime-local"
                    value={formData.scheduled_time}
                    onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">{t('liveChannelInteractiveMeetings', 'timezoneLabel', 'Time Zone')}</Label>
                  <Select
                    value={formData.timezone}
                    onValueChange={(value) => setFormData({ ...formData, timezone: value })}
                  >
                    <SelectTrigger id="timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {tzOptions.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {formData.scheduled_time && (
                <p className="text-xs text-gray-600">
                  {t('liveChannelInteractiveMeetings', 'scheduledForNote', 'Scheduled for')}{' '}
                  <span className="font-medium">
                    {formatMeetingTime(zonedWallTimeToUtcISO(formData.scheduled_time, formData.timezone), formData.timezone)}
                  </span>
                </p>
              )}

              <div className="space-y-2">
                <Label>{t('liveChannelInteractiveMeetings', 'remindersLabel', 'Send reminders (in-app + email)')}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {REMINDER_OFFSET_OPTIONS.map((opt) => {
                    const checked = formData.reminder_offsets.includes(opt.minutes);
                    return (
                      <label
                        key={opt.minutes}
                        className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${
                          checked ? 'border-purple-500 bg-purple-100/60' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="accent-purple-600"
                          checked={checked}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              reminder_offsets: e.target.checked
                                ? [...prev.reminder_offsets, opt.minutes]
                                : prev.reminder_offsets.filter((m) => m !== opt.minutes),
                            }))
                          }
                        />
                        {t('liveChannelInteractiveMeetings', `reminderOffset_${opt.minutes}`, opt.label)}
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-500">
                  {t('liveChannelInteractiveMeetings', 'remindersTip', 'Followers (per access level) and anyone who registers get a notification and email before the meeting.')}
                </p>
              </div>

              <div className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2">
                <div>
                  <Label className="text-sm">{t('liveChannelInteractiveMeetings', 'enableRegistrationLabel', 'Enable registration')}</Label>
                  <p className="text-xs text-gray-500">{t('liveChannelInteractiveMeetings', 'enableRegistrationTip', 'Let people RSVP from the meeting link (guests can register with name + email on public meetings).')}</p>
                </div>
                <Switch
                  checked={formData.registration_enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, registration_enabled: checked })}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="duration">{t('liveChannelInteractiveMeetings', 'durationLabel', 'Duration (minutes)')}</Label>
            <Input
              id="duration"
              type="number"
              min={15}
              max={maxDuration || 180}
              value={formData.duration_minutes}
              onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) })}
            />
            {maxDuration && (
              <p className="text-xs text-gray-500">
                {t('liveChannelInteractiveMeetings', 'maxDurationForPlan', 'Max duration for your plan: {minutes} minutes').replace('{minutes}', String(maxDuration))}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t('liveChannelInteractiveMeetings', 'accessLevelLabel', 'Access Level')}</Label>
            <Select
              value={formData.access_level}
              onValueChange={(value: 'public' | 'followers' | 'cohosts') => 
                setFormData({ ...formData, access_level: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">{t('liveChannelInteractiveMeetings', 'accessPublic', 'Public - Anyone can join')}</SelectItem>
                <SelectItem value="followers">{t('liveChannelInteractiveMeetings', 'accessFollowers', 'Followers Only')}</SelectItem>
                <SelectItem value="cohosts">{t('liveChannelInteractiveMeetings', 'accessCohosts', 'Co-hosts Only')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 border-t pt-4">
            <Label>{t('liveChannelInteractiveMeetings', 'meetingFeatures', 'Meeting Features')}</Label>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="webinar_mode">{t('liveChannelInteractiveMeetings', 'webinarModeLabel', 'Webinar / livestream mode')}</Label>
                <p className="text-xs text-gray-500">{t('liveChannelInteractiveMeetings', 'webinarModeDesc', 'Audience watches a one-way stream (HLS) instead of joining the call — best for large broadcasts. Only the host is on camera.')}</p>
              </div>
              <Switch
                id="webinar_mode"
                checked={formData.mode === 'webinar'}
                onCheckedChange={(checked) => setFormData({ ...formData, mode: checked ? 'webinar' : 'meeting' })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="enable_recording">{t('liveChannelInteractiveMeetings', 'enableRecordingLabel', 'Enable Recording')}</Label>
                <p className="text-xs text-gray-500">{t('liveChannelInteractiveMeetings', 'enableRecordingDesc', 'Record meeting for later playback')}</p>
              </div>
              <Switch
                id="enable_recording"
                checked={formData.enable_recording}
                onCheckedChange={(checked) => setFormData({ ...formData, enable_recording: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="enable_chat">{t('liveChannelInteractiveMeetings', 'enableChatLabel', 'Enable Chat')}</Label>
                <p className="text-xs text-gray-500">{t('liveChannelInteractiveMeetings', 'enableChatDesc', 'Allow participants to chat')}</p>
              </div>
              <Switch
                id="enable_chat"
                checked={formData.enable_chat}
                onCheckedChange={(checked) => setFormData({ ...formData, enable_chat: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="enable_screenshare">{t('liveChannelInteractiveMeetings', 'enableScreenShareLabel', 'Enable Screen Share')}</Label>
                <p className="text-xs text-gray-500">{t('liveChannelInteractiveMeetings', 'enableScreenShareDesc', 'Allow screen sharing')}</p>
              </div>
              <Switch
                id="enable_screenshare"
                checked={formData.enable_screenshare}
                onCheckedChange={(checked) => setFormData({ ...formData, enable_screenshare: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              {t('liveChannelInteractiveMeetings', 'cancel', 'Cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !accessCheck?.allowed}
            >
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing
                ? t('liveChannelInteractiveMeetings', 'saveChanges', 'Save Changes')
                : t('liveChannelInteractiveMeetings', 'createMeeting', 'Create Meeting')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/* ======================================================
   GUEST NAME DIALOG
====================================================== */
const GuestNameDialog = ({ isOpen, onConfirm, onCancel }: {
  isOpen: boolean;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) => {
  const { t } = useLanguage();
  const [name, setName] = useState('');

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t('liveChannelInteractiveMeetings', 'enterNameToJoin', 'Please enter your name to join'));
      return;
    }
    onConfirm(trimmed);
    setName('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { onCancel(); setName(''); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('liveChannelInteractiveMeetings', 'joinMeeting', 'Join Meeting')}</DialogTitle>
          <DialogDescription>
            {t('liveChannelInteractiveMeetings', 'enterNameNoSignIn', 'Enter your name to join the meeting. No sign-in required.')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="guest-name">{t('liveChannelInteractiveMeetings', 'yourName', 'Your Name')}</Label>
          <Input
            id="guest-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('liveChannelInteractiveMeetings', 'yourNamePlaceholder', 'e.g. John Smith')}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => { onCancel(); setName(''); }}>
            {t('liveChannelInteractiveMeetings', 'cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!name.trim()}>
            {t('liveChannelInteractiveMeetings', 'joinMeeting', 'Join Meeting')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ======================================================
   MAIN COMPONENT
====================================================== */
export const LiveChannelInteractiveMeetings = ({ channelId }: { channelId: string }) => {
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const [meetings, setMeetings] = useState<LiveChannelVideoMeeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The live call is hosted by the app-level ActiveCallHost (survives tab changes),
  // not rendered here. We only start it and reflect "you're in this meeting".
  const { call, startCall, endCall, maximize } = useActiveCall();
  const activeCallId = call?.id ?? null;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<LiveChannelVideoMeeting | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [channelName, setChannelName] = useState<string | null>(null);
  const [ministryId, setMinistryId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [canCreateMeeting, setCanCreateMeeting] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [deletingMeetingId, setDeletingMeetingId] = useState<string | null>(null);
  // Guest join support
  const [pendingJoinMeeting, setPendingJoinMeeting] = useState<LiveChannelVideoMeeting | null>(null);
  const [guestName, setGuestName] = useState<string | null>(null);
  // AI Insights state
  const [insightsMeeting, setInsightsMeeting] = useState<LiveChannelVideoMeeting | null>(null);
  const [showInsightsDialog, setShowInsightsDialog] = useState(false);
  // Recordings (Mux): a per-meeting viewer dialog + a standalone library tab.
  const [recordingsMeeting, setRecordingsMeeting] = useState<LiveChannelVideoMeeting | null>(null);
  const [subTab, setSubTab] = useState<'meetings' | 'recordings'>('meetings');
  const [recordingBusyId, setRecordingBusyId] = useState<string | null>(null);

  // Check if user owns the channel
  useEffect(() => {
    const checkOwnership = async () => {
      if (!user || !channelId) return;

      const { data } = await supabase
        .from('live_channels')
        .select('owner_id, name, ministry_id')
        .eq('id', channelId)
        .single();

      setIsOwner(data?.owner_id === user.id);
      setChannelName(data?.name || null);
      setMinistryId(data?.ministry_id || null);
    };

    checkOwnership();
  }, [user, channelId]);

  // Load user subscription
  useEffect(() => {
    const loadSubscription = async () => {
      if (!user?.id) return;
      
      try {
        const userSubscription = await getUserActiveSubscription(user.id);
        setSubscription(userSubscription);
        
        if (userSubscription) {
          const canHost = await canHostInteractiveMeeting(user.id);
          setCanCreateMeeting(canHost.allowed);
          if (!canHost.allowed) {
            setSubscriptionError(canHost.reason || 'Subscription required');
          }
        } else {
          setCanCreateMeeting(false);
          setSubscriptionError('No active subscription found');
        }
      } catch (error) {
        console.error('Error loading subscription:', error);
      }
    };

    if (user?.id) {
      loadSubscription();
    }
  }, [user?.id]);

  // Fetch meetings
  useEffect(() => {
    if (!channelId) return;
    fetchMeetings();
  }, [channelId]);

  // Auto-open meeting from Skeleton redirect
  useEffect(() => {
    const autoOpenMeetingId = sessionStorage.getItem('autoOpenMeetingId');
    
    if (autoOpenMeetingId && meetings.length > 0 && !activeCallId) {
      console.log('[LiveChannelInteractiveMeetings] Auto-opening meeting:', autoOpenMeetingId);

      // Pick up guest name set by Skeleton.tsx for unauthenticated users
      const storedGuestName = sessionStorage.getItem('guestDisplayName');
      if (storedGuestName && !user) {
        setGuestName(storedGuestName);
        sessionStorage.removeItem('guestDisplayName');
      }

      // Clear the storage
      sessionStorage.removeItem('autoOpenMeetingId');

      // Find the meeting
      const meeting = meetings.find(m => m.id === autoOpenMeetingId);

      if (meeting) {
        // Auto-join the meeting (pass the guest name explicitly — state isn't set yet)
        doJoinMeeting(meeting, storedGuestName || undefined);
        
        toast.success(t('liveChannelInteractiveMeetings', 'openingMeeting', 'Opening meeting...'));
      } else {
        toast.error(t('liveChannelInteractiveMeetings', 'meetingNotFound', 'Meeting not found'));
        console.error('[LiveChannelInteractiveMeetings] Meeting not found:', autoOpenMeetingId);
      }
    }
  }, [meetings, activeCallId]);

  const fetchMeetings = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('live_channel_video_meetings')
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMeetings(data || []);
    } catch (err) {
      console.error('Error fetching meetings:', err);
      setError(t('liveChannelInteractiveMeetings', 'failedLoadMeetings', 'Failed to load meetings'));
      toast.error(t('liveChannelInteractiveMeetings', 'failedLoadMeetings', 'Failed to load meetings'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinMeeting = async (meeting: LiveChannelVideoMeeting) => {
    // If user is not signed in, prompt for their name first
    if (!user) {
      setPendingJoinMeeting(meeting);
      return;
    }
    await doJoinMeeting(meeting);
  };

  const doJoinMeeting = async (meeting: LiveChannelVideoMeeting, guestNameOverride?: string) => {
    try {
      const { data: freshMeeting } = await supabase
        .from('live_channel_video_meetings')
        .select('is_active')
        .eq('id', meeting.id)
        .single();
      
      const wasInactive = freshMeeting ? !freshMeeting.is_active : !meeting.is_active;

      if (wasInactive) {
        const { error } = await supabase
          .from('live_channel_video_meetings')
          .update({ 
            is_active: true,
            started_at: new Date().toISOString()
          })
          .eq('id', meeting.id);

        if (error) throw error;
      }

      const { error: countError } = await supabase
        .from('live_channel_video_meetings')
        .update({ 
          participant_count: meeting.participant_count + 1 
        })
        .eq('id', meeting.id);

      if (countError) console.error('Error updating participant count:', countError);

      beginCall(meeting, guestNameOverride);
    } catch (error) {
      console.error('Error joining meeting:', error);
      toast.error(t('liveChannelInteractiveMeetings', 'failedJoinMeeting', 'Failed to join meeting'));
    }
  };

  // DB side of leaving/ending — self-contained (takes the meeting) so it still works
  // if this list component has since unmounted (e.g. left from the mini-player).
  const leaveMeetingDb = async (meeting: LiveChannelVideoMeeting) => {
    const isHost = meeting.host_id === user?.id;
    const isWebinar = meeting.mode === 'webinar';
    try {
      if (isHost && isWebinar) {
        stopMeetingStream(meeting.id);
        await supabase
          .from('live_channel_video_meetings')
          .update({ is_active: false, ended_at: new Date().toISOString(), participant_count: 0 })
          .eq('id', meeting.id);
      } else {
        const newCount = Math.max(0, meeting.participant_count - 1);
        await supabase.from('live_channel_video_meetings').update({ participant_count: newCount }).eq('id', meeting.id);
      }
    } catch (error) {
      console.error('Error leaving meeting:', error);
    }
  };

  const endMeetingDb = async (meeting: LiveChannelVideoMeeting) => {
    try {
      await supabase
        .from('live_channel_video_meetings')
        .update({ is_active: false, ended_at: new Date().toISOString(), participant_count: 0 })
        .eq('id', meeting.id);
    } catch (error) {
      console.error('Error ending meeting:', error);
    }
  };

  // Hand the fully-configured meeting element to the app-level ActiveCallHost, which
  // renders it above the tab router so it survives navigation.
  const beginCall = (meeting: LiveChannelVideoMeeting, guestNameOverride?: string) => {
    // Use the explicitly-passed guest name — relying on the `guestName` state is
    // racy (it's set in the same tick we join, so the state hasn't applied yet).
    const displayName = profile?.full_name || user?.email?.split('@')[0] || guestNameOverride || guestName || t('liveChannelInteractiveMeetings', 'guest', 'Guest');
    const participantId = user?.id || `guest-${guestName?.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`;
    const isHost = meeting.host_id === user?.id;
    const doLeave = async () => { await leaveMeetingDb(meeting); endCall(); };
    const doEnd = async () => { await endMeetingDb(meeting); endCall(); };
    startCall({
      id: meeting.id,
      title: meeting.title,
      onLeave: doLeave,
      node: (
        <EnhancedVideoCallWrapper
          meeting={meeting}
          userName={displayName}
          userId={participantId}
          isHost={isHost}
          onLeave={doLeave}
          channelId={channelId}
          onEndMeeting={isHost ? doEnd : undefined}
        />
      ),
    });
  };

  const handleGuestNameConfirm = async (name: string) => {
    if (!pendingJoinMeeting) return;
    setGuestName(name);
    const meeting = pendingJoinMeeting;
    setPendingJoinMeeting(null);
    await doJoinMeeting(meeting, name);
  };

  const handleGuestNameCancel = () => {
    setPendingJoinMeeting(null);
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    if (!confirm(t('liveChannelInteractiveMeetings', 'confirmDeleteMeeting', 'Are you sure you want to delete this meeting?'))) return;
    
    setDeletingMeetingId(meetingId);
    try {
      const { error } = await supabase
        .from('live_channel_video_meetings')
        .delete()
        .eq('id', meetingId);

      if (error) throw error;

      // Log usage deletion
      if (user?.id) {
        const meeting = meetings.find(m => m.id === meetingId);
        await logUsage(user.id, 'meeting_delete', 'live_channel_video_meeting', meetingId, 1, 0, {
          meeting_title: meeting?.title
        });
      }

      toast.success(t('liveChannelInteractiveMeetings', 'meetingDeleted', 'Meeting deleted'));
      fetchMeetings();
    } catch (error) {
      console.error('Error deleting meeting:', error);
      toast.error(t('liveChannelInteractiveMeetings', 'failedDeleteMeeting', 'Failed to delete meeting'));
    } finally {
      setDeletingMeetingId(null);
    }
  };

  // Flip a meeting's recording on/off after it exists. Mux can't toggle
  // recording on an existing live stream, so re-provision (delete + create).
  // Mints a new stream key + playback URL, so it's meant for use before going live.
  const toggleMeetingRecording = async (meeting: LiveChannelVideoMeeting, enabled: boolean) => {
    if (meeting.is_active) {
      toast.error(t('liveChannelInteractiveMeetings', 'cantChangeRecordingLive', "Can't change recording while the meeting is live — end it first."));
      return;
    }
    setRecordingBusyId(meeting.id);
    try {
      await supabase.from('live_channel_video_meetings').update({ enable_recording: enabled }).eq('id', meeting.id);
      await reprovisionMeetingStream(meeting.id, enabled);
      toast.success(enabled ? t('liveChannelInteractiveMeetings', 'recordingOnNextBroadcast', 'Recording on for the next broadcast') : t('liveChannelInteractiveMeetings', 'recordingOff', 'Recording off'));
      fetchMeetings();
    } catch (error) {
      console.error('Error toggling recording:', error);
      toast.error(t('liveChannelInteractiveMeetings', 'couldNotChangeRecording', 'Could not change recording setting'));
    } finally {
      setRecordingBusyId(null);
    }
  };

  // Meeting list view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('liveChannelInteractiveMeetings', 'interactiveMeetings', 'Interactive Meetings')}</h2>
          <p className="text-gray-500">{t('liveChannelInteractiveMeetings', 'hostJoinSubtitle', 'Host and join video meetings for your channel')}</p>
        </div>
        {isOwner && (
          <Button
            onClick={() => setShowCreateModal(true)}
            disabled={!canCreateMeeting}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('liveChannelInteractiveMeetings', 'createMeeting', 'Create Meeting')}
          </Button>
        )}
      </div>

      {subscriptionError && !canCreateMeeting && (
        <Alert>
          <Zap className="h-4 w-4" />
          <AlertDescription>{subscriptionError}</AlertDescription>
        </Alert>
      )}

      {/* Sub-tabs: live Meetings vs the standalone Recordings library */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        <button
          onClick={() => setSubTab('meetings')}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${subTab === 'meetings' ? 'border-purple-600 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          {t('liveChannelInteractiveMeetings', 'meetingsTab', 'Meetings')}
        </button>
        <button
          onClick={() => setSubTab('recordings')}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${subTab === 'recordings' ? 'border-purple-600 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          {t('liveChannelInteractiveMeetings', 'recordingsTab', 'Recordings')}
        </button>
      </div>

      {subTab === 'recordings' ? (
        <MinistryRecordingsTab meetings={meetings} />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : meetings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Video className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('liveChannelInteractiveMeetings', 'noMeetingsYet', 'No meetings yet')}</h3>
            <p className="text-gray-500 text-center mb-4">
              {t('liveChannelInteractiveMeetings', 'createFirstMeeting', 'Create your first interactive meeting to get started')}
            </p>
            {isOwner && canCreateMeeting && (
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Meeting
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Active Meetings Section */}
          {meetings.some(m => m.is_active) && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <h3 className="text-xl font-bold">{t('liveChannelInteractiveMeetings', 'activeMeetings', 'Active Meetings')}</h3>
              </div>

              <div className="space-y-3">
                {meetings.filter(m => m.is_active).map((meeting) => {
                  // Check if user can delete this meeting (owner or creator)
                  const canDelete = isOwner || meeting.host_id === user?.id;
                  
                  return (
                    <div key={meeting.id} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-3">
                            <h4 className="text-lg font-semibold">{meeting.title}</h4>
                            <Badge className="bg-green-500 text-white border-0">
                              <span className="w-2 h-2 bg-white rounded-full mr-1 animate-pulse" />
                              {t('liveChannelInteractiveMeetings', 'live', 'Live')}
                            </Badge>
                            <Badge variant="outline" className="border-gray-300">
                              <Globe className="h-3 w-3 mr-1" />
                              {t('liveChannelInteractiveMeetings', 'public', 'Public')}
                            </Badge>
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                              <Crown className="h-3 w-3 mr-1" />
                              {t('liveChannelInteractiveMeetings', 'ministryPlus', 'Ministry Plus')}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-gray-600">
                            {meeting.meeting_type === 'scheduled' && meeting.scheduled_time && (
                              <div className="flex items-center gap-1 font-medium text-gray-800">
                                <Calendar className="h-4 w-4 text-purple-600" />
                                <span>{formatMeetingTime(meeting.scheduled_time, meeting.timezone)}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              <span>{t('liveChannelInteractiveMeetings', 'minutesCount', '{count} minutes').replace('{count}', String(meeting.duration_minutes))}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              <span>{meeting.participant_count} / {meeting.max_participants}</span>
                            </div>
                            {meeting.meeting_type === 'scheduled' && (meeting.reminder_offsets?.length ?? 0) > 0 && (
                              <div className="flex items-center gap-1 text-purple-700">
                                <MessageSquare className="h-4 w-4" />
                                <span>{t('liveChannelInteractiveMeetings', 'reminderCount', '{count} reminders').replace('{count}', String(meeting.reminder_offsets!.length))}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 mt-3">
                            {meeting.enable_chat && (
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <MessageSquare className="h-4 w-4" />
                                <span>{t('liveChannelInteractiveMeetings', 'chat', 'Chat')}</span>
                              </div>
                            )}
                            {meeting.enable_screenshare && (
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <MonitorUp className="h-4 w-4" />
                                <span>{t('liveChannelInteractiveMeetings', 'screenShare', 'Screen Share')}</span>
                              </div>
                            )}
                            {meeting.meeting_type === 'scheduled' && !meeting.is_active && meeting.registration_enabled && (
                              <RegisterMeetingButton
                                meetingId={meeting.id}
                                meetingKind="channel"
                                meetingTitle={meeting.title}
                                isHost={meeting.host_id === user?.id}
                                allowGuests={meeting.access_level === 'public'}
                              />
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={async () => {
                              const link = `${publicAppOrigin()}/channel/${channelId}/meeting/${meeting.id}`;
                              const r = await shareMeeting({ hostName: channelName, title: meeting.title, scheduledTime: meeting.scheduled_time, timezone: meeting.timezone, registrationEnabled: meeting.registration_enabled, url: link });
                              if (r.method !== 'native') toast.success(t('liveChannelInteractiveMeetings', 'inviteCopied', 'Meeting invite copied — paste it anywhere to invite people!'));
                            }}
                            title={t('liveChannelInteractiveMeetings', 'copyMeetingLink', 'Copy meeting link')}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          {canDelete && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-purple-300 text-purple-700 hover:bg-purple-50"
                                onClick={() => {
                                  setInsightsMeeting(meeting);
                                  setShowInsightsDialog(true);
                                }}
                                title={t('liveChannelInteractiveMeetings', 'viewAiInsights', 'View AI insights')}
                              >
                                <Sparkles className="h-4 w-4 mr-1" />
                                {t('liveChannelInteractiveMeetings', 'insights', 'Insights')}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={recordingBusyId === meeting.id || meeting.is_active}
                                onClick={() => toggleMeetingRecording(meeting, meeting.enable_recording === false)}
                                title={meeting.is_active ? t('liveChannelInteractiveMeetings', 'recordingCantChangeLiveTitle', "Recording can't be changed while the meeting is live") : (meeting.enable_recording !== false ? t('liveChannelInteractiveMeetings', 'recordingOnClickOff', 'Recording on — click to turn off') : t('liveChannelInteractiveMeetings', 'recordingOffClickOn', 'Recording off — click to turn on'))}
                              >
                                {recordingBusyId === meeting.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Circle className={`h-4 w-4 mr-1 ${meeting.enable_recording !== false ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
                                )}
                                {meeting.enable_recording !== false ? t('liveChannelInteractiveMeetings', 'recOn', 'Rec On') : t('liveChannelInteractiveMeetings', 'recOff', 'Rec Off')}
                              </Button>
                              {meeting.enable_recording !== false && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setRecordingsMeeting(meeting)}
                                  title={t('liveChannelInteractiveMeetings', 'viewRecordings', 'View recordings')}
                                >
                                  <Video className="h-4 w-4 mr-1" />
                                  {t('liveChannelInteractiveMeetings', 'recordings', 'Recordings')}
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleDeleteMeeting(meeting.id)}
                                disabled={deletingMeetingId === meeting.id}
                              >
                                {deletingMeetingId === meeting.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                )}
                              </Button>
                            </>
                          )}
                          {activeCallId === meeting.id ? (
                            <Button onClick={() => maximize()} className="bg-green-600 hover:bg-green-700">
                              <Play className="h-4 w-4 mr-2" />
                              {t('liveChannelInteractiveMeetings', 'returnToMeeting', 'Return')}
                            </Button>
                          ) : (
                            <Button
                              onClick={() => handleJoinMeeting(meeting)}
                              className="bg-blue-600 hover:bg-blue-700"
                            >
                              <Play className="h-4 w-4 mr-2" />
                              {t('liveChannelInteractiveMeetings', 'joinNow', 'Join Now')}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Scheduled Meetings Section */}
          {meetings.some(m => !m.is_active) && (
            <div className="space-y-4 mt-8">
              <h3 className="text-xl font-bold">{t('liveChannelInteractiveMeetings', 'scheduledMeetings', 'Scheduled Meetings')}</h3>

              <div className="space-y-3">
                {meetings.filter(m => !m.is_active).map((meeting) => {
                  // Check if user can delete this meeting (owner or creator)
                  const canDelete = isOwner || meeting.host_id === user?.id;
                  
                  return (
                    <div key={meeting.id} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-3">
                            <h4 className="text-lg font-semibold">{meeting.title}</h4>
                            <Badge variant="outline" className="border-gray-300">
                              <Globe className="h-3 w-3 mr-1" />
                              {t('liveChannelInteractiveMeetings', 'public', 'Public')}
                            </Badge>
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                              <Crown className="h-3 w-3 mr-1" />
                              {t('liveChannelInteractiveMeetings', 'ministryPlus', 'Ministry Plus')}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-gray-600">
                            {meeting.meeting_type === 'scheduled' && meeting.scheduled_time && (
                              <div className="flex items-center gap-1 font-medium text-gray-800">
                                <Calendar className="h-4 w-4 text-purple-600" />
                                <span>{formatMeetingTime(meeting.scheduled_time, meeting.timezone)}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              <span>{t('liveChannelInteractiveMeetings', 'minutesCount', '{count} minutes').replace('{count}', String(meeting.duration_minutes))}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              <span>{meeting.participant_count} / {meeting.max_participants}</span>
                            </div>
                            {meeting.meeting_type === 'scheduled' && (meeting.reminder_offsets?.length ?? 0) > 0 && (
                              <div className="flex items-center gap-1 text-purple-700">
                                <MessageSquare className="h-4 w-4" />
                                <span>{t('liveChannelInteractiveMeetings', 'reminderCount', '{count} reminders').replace('{count}', String(meeting.reminder_offsets!.length))}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 mt-3">
                            {meeting.enable_chat && (
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <MessageSquare className="h-4 w-4" />
                                <span>{t('liveChannelInteractiveMeetings', 'chat', 'Chat')}</span>
                              </div>
                            )}
                            {meeting.enable_screenshare && (
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <MonitorUp className="h-4 w-4" />
                                <span>{t('liveChannelInteractiveMeetings', 'screenShare', 'Screen Share')}</span>
                              </div>
                            )}
                            {meeting.meeting_type === 'scheduled' && !meeting.is_active && meeting.registration_enabled && (
                              <RegisterMeetingButton
                                meetingId={meeting.id}
                                meetingKind="channel"
                                meetingTitle={meeting.title}
                                isHost={meeting.host_id === user?.id}
                                allowGuests={meeting.access_level === 'public'}
                              />
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              const link = `${publicAppOrigin()}/channel/${channelId}/meeting/${meeting.id}`;
                              navigator.clipboard.writeText(link);
                              toast.success(t('liveChannelInteractiveMeetings', 'meetingLinkCopied', 'Meeting link copied'));
                            }}
                            title={t('liveChannelInteractiveMeetings', 'copyMeetingLink', 'Copy meeting link')}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          {canDelete && (
                            <>
                              {meeting.meeting_type === 'scheduled' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setEditingMeeting(meeting)}
                                  title={t('liveChannelInteractiveMeetings', 'editMeeting', 'Edit meeting')}
                                >
                                  <Calendar className="h-4 w-4 mr-1" />
                                  {t('liveChannelInteractiveMeetings', 'edit', 'Edit')}
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-purple-300 text-purple-700 hover:bg-purple-50"
                                onClick={() => {
                                  setInsightsMeeting(meeting);
                                  setShowInsightsDialog(true);
                                }}
                                title={t('liveChannelInteractiveMeetings', 'viewAiInsightsPrevious', 'View AI insights from previous sessions')}
                              >
                                <Sparkles className="h-4 w-4 mr-1" />
                                {t('liveChannelInteractiveMeetings', 'insights', 'Insights')}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={recordingBusyId === meeting.id || meeting.is_active}
                                onClick={() => toggleMeetingRecording(meeting, meeting.enable_recording === false)}
                                title={meeting.is_active ? t('liveChannelInteractiveMeetings', 'recordingCantChangeLiveTitle', "Recording can't be changed while the meeting is live") : (meeting.enable_recording !== false ? t('liveChannelInteractiveMeetings', 'recordingOnClickOff', 'Recording on — click to turn off') : t('liveChannelInteractiveMeetings', 'recordingOffClickOn', 'Recording off — click to turn on'))}
                              >
                                {recordingBusyId === meeting.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Circle className={`h-4 w-4 mr-1 ${meeting.enable_recording !== false ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
                                )}
                                {meeting.enable_recording !== false ? t('liveChannelInteractiveMeetings', 'recOn', 'Rec On') : t('liveChannelInteractiveMeetings', 'recOff', 'Rec Off')}
                              </Button>
                              {meeting.enable_recording !== false && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setRecordingsMeeting(meeting)}
                                  title={t('liveChannelInteractiveMeetings', 'viewRecordings', 'View recordings')}
                                >
                                  <Video className="h-4 w-4 mr-1" />
                                  {t('liveChannelInteractiveMeetings', 'recordings', 'Recordings')}
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleDeleteMeeting(meeting.id)}
                                disabled={deletingMeetingId === meeting.id}
                              >
                                {deletingMeetingId === meeting.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                )}
                              </Button>
                            </>
                          )}
                          <Button
                            onClick={() => handleJoinMeeting(meeting)}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <Play className="h-4 w-4 mr-2" />
                            {t('liveChannelInteractiveMeetings', 'startMeeting', 'Start Meeting')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <CreateMeetingModal
        isOpen={showCreateModal || !!editingMeeting}
        meeting={editingMeeting}
        onClose={() => { setShowCreateModal(false); setEditingMeeting(null); }}
        onSuccess={() => {
          fetchMeetings();
        }}
        channelId={channelId}
      />

      {/* Guest Name Dialog - shown when unauthenticated user tries to join */}
      <GuestNameDialog
        isOpen={!!pendingJoinMeeting}
        onConfirm={handleGuestNameConfirm}
        onCancel={handleGuestNameCancel}
      />

      {/* Mux recordings for webinar meetings */}
      <MeetingRecordings
        meetingId={recordingsMeeting?.id || ''}
        open={!!recordingsMeeting}
        onClose={() => setRecordingsMeeting(null)}
      />

      {/* AI Insights Dialog - view post-session insights for any meeting */}
      <Dialog open={showInsightsDialog} onOpenChange={(open) => {
        setShowInsightsDialog(open);
        if (!open) setInsightsMeeting(null);
      }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              {t('liveChannelInteractiveMeetings', 'meetingInsightsTitle', 'Meeting Insights — {title}').replace('{title}', String(insightsMeeting?.title ?? ''))}
            </DialogTitle>
            <DialogDescription>
              {t('liveChannelInteractiveMeetings', 'insightsDialogDesc', 'AI-generated summary, action items, and insights from this meeting session.')}
            </DialogDescription>
          </DialogHeader>
          {insightsMeeting && (
            <SavedMeetingInsights
              meetingTitle={insightsMeeting.title}
              meetingId={insightsMeeting.id}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};