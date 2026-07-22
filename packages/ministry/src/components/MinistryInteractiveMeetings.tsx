import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Alert, AlertDescription } from '@rekindle/ui/alert';
import { shareMeeting, publicAppOrigin } from '@rekindle/features/liveShare';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@rekindle/ui/dialog';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Textarea } from '@rekindle/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@rekindle/ui/select';
import { Switch } from '@rekindle/ui/switch';
import {
  Video, Users, Calendar, Clock, Plus, Play, Circle,
  Copy, AlertCircle, Loader2,
  Lock, Globe,
  PhoneOff,
  MonitorUp, MessageSquare, Trash2,
  Crown, Zap, Sparkles, FileText,
  Hand, X, GripVertical
} from 'lucide-react';
import { supabase } from '@rekindle/supabase';
import { useUserEntitlements } from '@rekindle/auth/useUserEntitlements';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import {
  zonedWallTimeToUtcISO,
  utcISOToZonedInputValue,
  formatMeetingTime,
  guessUserTimeZone,
  commonTimeZones,
  REMINDER_OFFSET_OPTIONS,
} from '@rekindle/features/meetingTime';
import { toast } from 'sonner';
import RegisterMeetingButton from '@rekindle/live/components/RegisterMeetingButton';
import { useActiveCall } from '@rekindle/live/ActiveCallContext';
import MeetingRecordingPanel from '@rekindle/live/components/MeetingRecordingPanel';
import SavedMeetingInsights from '@rekindle/live/components/SavedMeetingInsights';

// Import the DailyVideoCall component - this is the SOLE controller of all media
import DailyVideoCall from '@rekindle/live/components/DailyVideoCall';
import { HlsPlayer } from '@rekindle/live/components/HlsPlayer';
import { createMeetingStream, getMeetingIngest, deleteMeetingStream, stopMeetingStream, reprovisionMeetingStream, startMeetingBroadcast, stopMeetingBroadcast } from '@rekindle/live/muxMeetingStream';
import { isLiveKitBackend } from '@rekindle/live/videoBackend';
import { useMeetingStage } from '@rekindle/live/useMeetingStage';
import { useMeetingReactions } from '@rekindle/live/useMeetingReactions';
import { MeetingReactionsLayer, ReactionBar } from '@rekindle/live/components/MeetingReactions';
import { MeetingNotesBanner } from '@rekindle/live/components/MeetingNotesBanner';
import { useMeetingPresence } from '@rekindle/live/useMeetingPresence';
import { MeetingChatPanel } from '@rekindle/live/components/MeetingChatPanel';
import { MeetingRecordings } from '@rekindle/live/components/MeetingRecordings';
import { MinistryRecordingsTab } from './MinistryRecordingsTab';

// Import subscription enforcement functions
import {
  getUserActiveSubscription,
  canHostInteractiveMeeting,
  getMaxMeetingDuration,
  logUsage,
  AccessCheckResult,
  UserSubscription
} from '@rekindle/auth/subscriptionEnforcement';

/* ======================================================
   TYPES
====================================================== */
interface MinistryVideoMeeting {
  id: string;
  ministry_id: string;
  host_id: string;
  title: string;
  description?: string;
  room_name: string;
  room_url?: string;
  scheduled_time?: string;
  duration_minutes: number;
  meeting_type: 'instant' | 'scheduled';
  is_recurring: boolean;
  recurrence_pattern?: string;
  max_participants: number;
  access_level: 'public' | 'members' | 'leaders';
  enable_recording: boolean;
  enable_chat: boolean;
  enable_screenshare: boolean;
  is_active: boolean;
  participant_count: number;
  mode?: 'meeting' | 'webinar';
  timezone?: string | null;
  reminder_offsets?: number[] | null;
  registration_enabled?: boolean;
  hls_playback_url?: string;
  cf_live_input_uid?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  ended_at?: string;
}

interface CreateMeetingFormData {
  title: string;
  description: string;
  meeting_type: 'instant' | 'scheduled';
  scheduled_time: string;
  timezone: string;
  reminder_offsets: number[];
  registration_enabled: boolean;
  duration_minutes: number;
  max_participants: number;
  access_level: 'public' | 'members' | 'leaders';
  enable_recording: boolean;
  enable_chat: boolean;
  enable_screenshare: boolean;
  mode: 'meeting' | 'webinar';
}

/* ======================================================
   ENHANCED VIDEO CALL WRAPPER FOR MINISTRY
   
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
  onEndMeeting 
}: { 
  meeting: MinistryVideoMeeting; 
  userName: string;
  userId: string;
  isHost: boolean;
  onLeave: () => void;
  onEndMeeting?: () => void;
}) => {
  // Webinar mode: attendees watch the Cloudflare HLS stream; only the host
  // (presenter) joins the Daily call and pushes the RTMP stream out.
  const { t } = useLanguage();
  const isWebinar = meeting.mode === 'webinar';
  const hlsUrl = meeting.hls_playback_url;
  const [rtmpUrl, setRtmpUrl] = useState<string | undefined>(undefined);

  // Presenters + raised hands (webinar invite-up). Host is always a presenter.
  const stage = useMeetingStage(meeting.id, userId, userName, isHost);
  const isPresenter = stage.isPresenter;
  // Live floating reactions (love, amen, clap…) for webinars
  // Enabled for every meeting (not just webinars) — reactions ride Supabase realtime.
  const { floating: reactions, sendReaction } = useMeetingReactions(meeting.id, true);
  // Host OR any ministry-tier member may take AI notes from their own browser.
  const { hasMinistryAccess } = useUserEntitlements();
  // True while AI notes run anywhere in the meeting — drives the consent banner.
  const [notesActive, setNotesActive] = useState(false);
  // Guests (not signed in) can watch + read chat, but must sign in to interact.
  const isGuest = !userId || userId.startsWith('guest-');
  const [showAiPanel, setShowAiPanel] = useState(false);
  // Live audience roster (everyone announces presence; host invites people up).
  const presenceMembers = useMeetingPresence(meeting.id, userId, userName, isGuest, isWebinar);
  const [meetingEnded, setMeetingEnded] = useState(false);

  // Draggable position for the host's "raised hands / audience" panel.
  // Stored as an offset from its default bottom-left anchor so it starts
  // exactly where it always has, but can be dragged anywhere afterward.
  const [stagePanelPos, setStagePanelPos] = useState({ x: 0, y: 0 });
  const stagePanelDrag = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [isDraggingStagePanel, setIsDraggingStagePanel] = useState(false);

  const handleStagePanelPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    stagePanelDrag.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: stagePanelPos.x,
      originY: stagePanelPos.y,
    };
    setIsDraggingStagePanel(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [stagePanelPos]);

  const handleStagePanelPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!stagePanelDrag.current) return;
    const { startX, startY, originX, originY } = stagePanelDrag.current;
    setStagePanelPos({
      x: originX + (e.clientX - startX),
      y: originY + (e.clientY - startY),
    });
  }, []);

  const handleStagePanelPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    stagePanelDrag.current = null;
    setIsDraggingStagePanel(false);
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  // Audience: detect when the host ends the webinar so we can say so plainly
  // (instead of an endless "connecting" spinner).
  useEffect(() => {
    if (isHost) return;
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase
        .from('ministry_video_meetings')
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
        .channel(`meeting-status-${meeting.id}`)
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'ministry_video_meetings', filter: `id=eq.${meeting.id}` },
          (payload) => { if ((payload.new as any)?.is_active === false) setMeetingEnded(true); })
        .subscribe();
    } catch { statusChannel = null; }

    return () => {
      cancelled = true;
      clearInterval(poll);
      try { if (statusChannel) supabase.removeChannel(statusChannel); } catch { /* noop */ }
    };
  }, [isWebinar, isHost, meeting.id]);

  // When the host ends the meeting, notify the audience and close automatically
  // instead of leaving them stuck on a dead screen.
  useEffect(() => {
    if (!meetingEnded || isHost) return;
    toast(t('ministryInteractiveMeetings', 'hostEndedMeeting', 'The host has ended this meeting'));
    const timer = setTimeout(() => { onLeave(); }, 2500);
    return () => clearTimeout(timer);
  }, [meetingEnded, isHost, onLeave]);

  useEffect(() => {
    if (!isHost) return;

    // LiveKit: no Mux, no RTMP push. A webinar needs an HLS Egress so the audience
    // has something to watch (the edge fn writes hls_playback_url onto the meeting
    // row, which the audience picks up via realtime). A plain meeting's recording is
    // handled by the record button (room-composite Egress), so nothing to provision.
    if (isLiveKitBackend()) {
      if (!isWebinar) return;
      startMeetingBroadcast(meeting.id, meeting.room_name, 'ministry_meeting').then(p => {
        if (!p) console.warn('[Ministry] HLS Egress did not start — audience has no stream.');
      });
      return () => { stopMeetingBroadcast(meeting.id, meeting.room_name, 'ministry_meeting'); };
    }

    // createMeetingStream reuses the existing input, or re-provisions one if a
    // previous session was torn down. A webinar needs it for the HLS audience
    // feed; a recording-enabled meeting needs it so Mux records the call.
    const needsStream = isWebinar || meeting.enable_recording !== false;
    if (!needsStream) return;
    createMeetingStream(meeting.id, meeting.enable_recording !== false).then(p => {
      if (p) setRtmpUrl(p.rtmpUrl);
    });
  }, [isWebinar, isHost, meeting.id, meeting.room_name, meeting.enable_recording]);

  // ── Hybrid seats ──
  // The first N non-host participants to join take the live seats; everyone
  // after that watches via HLS. Try to grab a seat once on join; if they're
  // full, claimSeat returns false and this attendee stays in the audience.
  const seatClaimAttempted = useRef(false);
  useEffect(() => {
    if (!isWebinar || isHost || isGuest) return;
    if (seatClaimAttempted.current) return;
    seatClaimAttempted.current = true;
    stage.claimSeat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWebinar, isHost, isGuest]);

  // Host is the single authority for promotions (no races): whenever a seat is
  // free and someone has a hand up, auto-promote the oldest raised hand.
  useEffect(() => {
    if (!isHost || !isWebinar) return;
    if (stage.seatsFull) return;
    if (stage.raisedHands.length === 0) return;
    const next = stage.raisedHands[0]; // oldest first (ordered by created_at)
    stage.claimSeat(next.user_id, next.user_name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, isWebinar, stage.seatsFull, stage.raisedHands, stage.seatsTaken]);

  // Free my seat when I leave so the next raised hand can take it.
  useEffect(() => {
    if (isHost || !isWebinar) return;
    return () => {
      supabase.from('meeting_presenters').delete()
        .eq('meeting_id', meeting.id).eq('user_id', userId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, isWebinar, meeting.id, userId]);

  // Wrap leave so a seated participant releases their seat on the way out.
  const handleLeave = useCallback(async () => {
    if (!isHost && isWebinar) {
      stage.removePresenter(userId);
    }
    // A webinar's host IS the sole broadcaster (the Daily→Mux push is theirs), so
    // if they hang up — via the call's leave button, not just "End for All" — the
    // stream dies and the audience would otherwise sit on a blank Mux slate with
    // no notice. End it for everyone: stop the stream + flip is_active so the
    // audience's ended-detection fires and auto-closes them out.
    if (isHost && isWebinar) {
      try {
        stopMeetingStream(meeting.id);
        await supabase
          .from('ministry_video_meetings')
          .update({ is_active: false, ended_at: new Date().toISOString(), participant_count: 0 })
          .eq('id', meeting.id);
      } catch (e) {
        console.error('[handleLeave] failed to end webinar on host leave:', e);
      }
    }
    onLeave();
  }, [isHost, isWebinar, stage, userId, onLeave, meeting.id]);

  // Handle host ending meeting for all participants
  const handleHostEndMeeting = async () => {
    if (!isHost || !onEndMeeting) return;

    try {
      // Pause the webinar stream (keep the input + URL so a restart works)
      if (isWebinar) {
        stopMeetingStream(meeting.id);
      }

      // Update meeting status in database
      await supabase
        .from('ministry_video_meetings')
        .update({
          is_active: false,
          ended_at: new Date().toISOString(),
          participant_count: 0
        })
        .eq('id', meeting.id);

      toast.success(t('ministryInteractiveMeetings', 'meetingEndedForAll', 'Meeting ended for all participants'));

      // Call the onEndMeeting callback
      onEndMeeting();
    } catch (error) {
      console.error('Error ending meeting:', error);
      toast.error(t('ministryInteractiveMeetings', 'failedToEndMeeting', 'Failed to end meeting'));
    }
  };

  // Handle session completion to update database
  const handleSessionComplete = async (duration: number) => {
    try {
      console.log('Meeting completed. Duration:', duration, 'seconds');
      
      // Log analytics if needed
      await logUsage(userId, 'ministry_meeting_ended', {
        meeting_id: meeting.id,
        duration_seconds: duration,
        ministry_id: meeting.ministry_id
      });
    } catch (error) {
      console.error('Error logging session completion:', error);
    }
  };

  // Handle admitting participant from waiting room
  const handleAdmitParticipant = async (participantId: string) => {
    try {
      console.log('Admitting participant:', participantId);
      toast.success(t('ministryInteractiveMeetings', 'participantAdmitted', 'Participant admitted to meeting'));
    } catch (error) {
      console.error('Error admitting participant:', error);
      toast.error(t('ministryInteractiveMeetings', 'failedToAdmit', 'Failed to admit participant'));
    }
  };

  // Handle removing participant from meeting
  const handleRemoveParticipant = async (participantId: string) => {
    try {
      // participantId is the sessionId from Daily.co
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
      toast.success(t('ministryInteractiveMeetings', 'participantRemoved', 'Participant removed from meeting'));
    } catch (error) {
      console.error('Error removing participant:', error);
      toast.error(t('ministryInteractiveMeetings', 'failedToRemove', 'Failed to remove participant'));
    }
  };

  // Webinar attendees (not yet a presenter) watch the HLS stream, chat, and can raise a hand
  if (isWebinar && !isPresenter) {
    return (
      <div className="min-h-screen h-full bg-black flex flex-col sm:flex-row">
        {/* Video area */}
        <div className="relative sm:flex-1 min-h-0 flex flex-col">
          <div className="w-full aspect-video sm:flex-1 sm:aspect-auto sm:min-h-0">
            {meetingEnded ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-300 p-6 text-center gap-3">
                <PhoneOff className="h-8 w-8 text-gray-400" />
                <div>
                  <p className="font-medium">{t('ministryInteractiveMeetings', 'webinarEnded', 'The webinar has ended')}</p>
                  <p className="text-sm text-gray-500">{t('ministryInteractiveMeetings', 'thanksForJoining', 'Thanks for joining.')}</p>
                </div>
              </div>
            ) : hlsUrl ? (
              <HlsPlayer src={hlsUrl} onEnded={() => setMeetingEnded(true)} className="w-full h-full" />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-300 p-6 text-center">
                {t('ministryInteractiveMeetings', 'waitingForHostWebinar', 'Waiting for the host to start the webinar…')}
              </div>
            )}
          </div>

          {/* Floating reactions over the stream */}
          <MeetingReactionsLayer reactions={reactions} />
          <div className="absolute top-3 left-3 z-50"><MeetingNotesBanner active={notesActive} /></div>

          <div className="z-50 flex flex-col items-center gap-2 py-3 sm:py-0 sm:absolute sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2">
            {/* Reactions — open to everyone, including guests */}
            <ReactionBar onReact={sendReaction} />
            {/* Raise hand stays as a small secondary action (it's how you ask for a live seat) */}
            {isGuest ? (
              <div className="bg-gray-800/80 backdrop-blur-sm text-gray-300 text-xs rounded-md px-2.5 py-1">
                {t('ministryInteractiveMeetings', 'signInToChatOrSeat', 'Sign in to chat or request a seat')}
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
                {stage.hasRaisedHand ? t('ministryInteractiveMeetings', 'waitingForSeat', 'Waiting for a seat…') : t('ministryInteractiveMeetings', 'raiseHandToSpeak', 'Raise hand to speak')}
              </button>
            )}
          </div>

          <div className="absolute top-3 right-3 z-50">
            <Button
              onClick={handleLeave}
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white shadow-lg"
            >
              <PhoneOff className="h-4 w-4 mr-2" />
              {t('ministryInteractiveMeetings', 'leave', 'Leave')}
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

  return (
    <div className="min-h-screen h-full flex flex-col lg:flex-row">
      <div className="relative flex-1 min-h-0">
      {/* 
        DailyVideoCall Component - SOLE CONTROLLER OF ALL MEDIA
        
        All audio, video, microphone, and camera controls are managed
        exclusively by this component through the Daily.co SDK.
        
        DO NOT add any local media state management in this wrapper.
      */}
      <DailyVideoCall
        roomName={meeting.room_name}
        userName={userName}
        userId={userId}
        isHost={isHost}
        meetingId={meeting.id}
        meetingKind="ministry_meeting"
        onCallEnd={handleLeave}
        onSessionComplete={handleSessionComplete}
        showControls={true}
        autoJoin={true}
        showParticipantList={isHost}
        onAdmitParticipant={handleAdmitParticipant}
        onRemoveParticipant={handleRemoveParticipant}
        enableRecording={!isWebinar && isHost && meeting.enable_recording}
        liveStreamRtmpUrl={isHost ? rtmpUrl : undefined}
      />

      {/* Floating reactions over the call + a compact bar so everyone can react —
          available in every meeting, not just webinars. */}
      <MeetingReactionsLayer reactions={reactions} />
      <div className="absolute top-14 left-2 sm:top-3 sm:left-3 z-50"><MeetingNotesBanner active={notesActive} /></div>
      {/* Reaction bar sits BELOW the call's own top bar (LIVE/timer) on mobile so
          the two don't overlap; centered under the header on larger screens. */}
      <div className="absolute top-14 sm:top-3 left-1/2 -translate-x-1/2 z-50">
        <ReactionBar onReact={sendReaction} compact />
      </div>

      {/* Additional Features Overlay - UI only, no media control */}
      <div className="absolute top-2 right-2 sm:top-4 sm:right-4 flex gap-1 sm:gap-2 z-50">
        {/* Copy Meeting Link */}
        <Button
          onClick={async () => {
            const link = `${publicAppOrigin()}/ministry/${meeting.ministry_id}/meeting/${meeting.id}`;
            const r = await shareMeeting({ title: meeting.title, scheduledTime: meeting.scheduled_time, timezone: meeting.timezone, registrationEnabled: meeting.registration_enabled, url: link });
            if (r.method !== 'native') toast.success(t('ministryInteractiveMeetings', 'inviteCopied', 'Meeting invite copied — paste it anywhere to invite people!'));
          }}
          variant="secondary"
          size="sm"
          className="bg-white/90 text-gray-900 hover:bg-white backdrop-blur-sm border border-gray-200 shadow-sm"
        >
          <Copy className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">{t('ministryInteractiveMeetings', 'copyLink', 'Copy Link')}</span>
        </Button>

        {/* Host End Meeting Button */}
        {isHost && onEndMeeting && (
          <Button
            onClick={handleHostEndMeeting}
            variant="destructive"
            size="sm"
            className="bg-orange-600/90 backdrop-blur-sm hover:bg-orange-700"
          >
            <PhoneOff className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('ministryInteractiveMeetings', 'endForAll', 'End for All')}</span>
          </Button>
        )}
      </div>

      {/* ── AI Recording & Transcription — tucked behind a compact button ── */}
      {isHost && (
        <div className="absolute top-20 left-4 z-50 max-w-xs">
          {showAiPanel ? (
            <div className="space-y-2">
              <div className="flex justify-end">
                <button
                  onClick={() => setShowAiPanel(false)}
                  className="bg-gray-900/80 backdrop-blur-sm text-white/80 hover:text-white rounded-full p-1.5"
                  title={t('ministryInteractiveMeetings', 'hideAiFeatures', 'Hide AI features')}
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
                tableName="ministry_video_meetings"
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
              title={t('ministryInteractiveMeetings', 'aiFeatures', 'AI features')}
            >
              <Sparkles className="h-4 w-4" /> {t('ministryInteractiveMeetings', 'ai', 'AI')}
            </button>
          )}
        </div>
      )}

      {/* Host: invite raised hands up to the stage, manage presenters (webinar) */}
      {isHost && isWebinar && (
        <div
          className="absolute bottom-36 left-4 z-50 w-64 max-w-[80vw] bg-gray-900/90 backdrop-blur-sm rounded-lg text-white max-h-[50vh] flex flex-col overflow-hidden"
          style={{
            transform: `translate(${stagePanelPos.x}px, ${stagePanelPos.y}px)`,
            touchAction: 'none',
          }}
        >
          <div
            onPointerDown={handleStagePanelPointerDown}
            onPointerMove={handleStagePanelPointerMove}
            onPointerUp={handleStagePanelPointerUp}
            onPointerCancel={handleStagePanelPointerUp}
            className={`flex items-center gap-1.5 px-3 py-2 border-b border-white/10 select-none ${isDraggingStagePanel ? 'cursor-grabbing' : 'cursor-grab'}`}
            title={t('ministryInteractiveMeetings', 'dragToMove', 'Drag to move')}
          >
            <GripVertical className="h-3.5 w-3.5 text-gray-500" />
            <span className="text-xs font-medium text-gray-400">
              {t('ministryInteractiveMeetings', 'stageSeats', 'Stage · {taken}/{max} seats').replace('{taken}', String(stage.seatsTaken)).replace('{max}', String(stage.maxSeats))}
            </span>
          </div>
          <div className="p-3 space-y-3 overflow-y-auto">
          <div>
            <p className="text-xs font-medium text-gray-300 mb-1">{t('ministryInteractiveMeetings', 'raisedHands', 'Raised hands')}</p>
            {stage.raisedHands.length === 0 ? (
              <p className="text-xs text-gray-500">{t('ministryInteractiveMeetings', 'noOneWaiting', 'No one waiting.')}</p>
            ) : (
              <div className="space-y-1">
                {stage.raisedHands.map(h => (
                  <div key={h.user_id} className="flex items-center justify-between gap-2">
                    <span className="text-sm truncate">{h.user_name || t('ministryInteractiveMeetings', 'guest', 'Guest')}</span>
                    <Button
                      size="sm"
                      className="h-7 px-2 bg-purple-600 hover:bg-purple-700"
                      onClick={() => stage.invitePresenter(h.user_id, h.user_name)}
                    >
                      {t('ministryInteractiveMeetings', 'inviteUp', 'Invite up')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {stage.presenters.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-300 mb-1">{t('ministryInteractiveMeetings', 'onStage', 'On stage')}</p>
              <div className="space-y-1">
                {stage.presenters.map(p => (
                  <div key={p.user_id} className="flex items-center justify-between gap-2">
                    <span className="text-sm truncate">{p.user_name || t('ministryInteractiveMeetings', 'guest', 'Guest')}{p.role === 'cohost' ? t('ministryInteractiveMeetings', 'cohostSuffix', ' (co-host)') : ''}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-gray-400 hover:text-white"
                      title={t('ministryInteractiveMeetings', 'sendBackToAudience', 'Send back to audience')}
                      onClick={() => stage.removePresenter(p.user_id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live audience — host can invite any signed-in viewer up directly */}
          <div>
            <p className="text-xs font-medium text-gray-300 mb-1">
              {t('ministryInteractiveMeetings', 'audienceCount', 'Audience ({count})').replace('{count}', String(presenceMembers.filter(m => m.userId !== userId).length))}
            </p>
            {presenceMembers.filter(m => m.userId !== userId).length === 0 ? (
              <p className="text-xs text-gray-500">{t('ministryInteractiveMeetings', 'noOneWatching', 'No one watching yet.')}</p>
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
                          {m.userName}{m.isGuest ? t('ministryInteractiveMeetings', 'guestSuffix', ' (guest)') : ''}
                        </span>
                        {m.isGuest ? (
                          <span className="text-[10px] text-gray-500">{t('ministryInteractiveMeetings', 'viewing', 'viewing')}</span>
                        ) : (
                          <Button
                            size="sm"
                            className="h-7 px-2 bg-purple-600 hover:bg-purple-700"
                            onClick={() => stage.invitePresenter(m.userId, m.userName)}
                          >
                            {t('ministryInteractiveMeetings', 'inviteUp', 'Invite up')}
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

      {/* Chat sidebar for webinars (host/presenter side) */}
      {isWebinar && (
        <div className="w-full lg:w-80 h-64 lg:h-auto shrink-0">
          <MeetingChatPanel meetingId={meeting.id} userId={userId} userName={userName} isGuest={isGuest} />
        </div>
      )}
    </div>
  );
};

/* ======================================================
   CREATE MEETING MODAL
====================================================== */
const CreateMeetingModal = ({ isOpen, onClose, onSuccess, ministryId, meeting }: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (meeting: MinistryVideoMeeting) => void;
  ministryId: string;
  /** When set, the modal edits this meeting instead of creating a new one. */
  meeting?: MinistryVideoMeeting | null;
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const isEditing = !!meeting;
  const [isLoading, setIsLoading] = useState(false);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [accessCheck, setAccessCheck] = useState<AccessCheckResult | null>(null);
  const [maxDuration, setMaxDuration] = useState<number | null>(null);

  const [formData, setFormData] = useState<CreateMeetingFormData>({
    title: '',
    description: '',
    meeting_type: 'instant',
    scheduled_time: '',
    timezone: guessUserTimeZone(),
    reminder_offsets: [],
    registration_enabled: false,
    duration_minutes: 60,
    max_participants: 50,
    access_level: 'members',
    enable_recording: false,
    enable_chat: true,
    enable_screenshare: true,
    mode: 'meeting',
  });
  const [modeTouched, setModeTouched] = useState(false);
  const tzOptions = React.useMemo(() => commonTimeZones(), []);

  // Prefill when opening in edit mode; reset to defaults for create.
  useEffect(() => {
    if (!isOpen) return;
    if (meeting) {
      const tz = meeting.timezone || guessUserTimeZone();
      setModeTouched(true);
      setFormData({
        title: meeting.title,
        description: meeting.description || '',
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
        mode: meeting.mode || 'meeting',
      });
    }
  }, [isOpen, meeting]);

  // "Pick the cheap path automatically": large sessions default to webinar
  const WEBINAR_AUTO_THRESHOLD = 15;
  useEffect(() => {
    if (modeTouched) return;
    setFormData(prev => ({
      ...prev,
      mode: prev.max_participants >= WEBINAR_AUTO_THRESHOLD ? 'webinar' : 'meeting',
    }));
  }, [formData.max_participants, modeTouched]);

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
      toast.error(t('ministryInteractiveMeetings', 'mustBeLoggedIn', 'You must be logged in to create a meeting'));
      return;
    }

    if (!accessCheck?.allowed) {
      toast.error(accessCheck?.reason || t('ministryInteractiveMeetings', 'subscriptionRequired', 'Subscription required'));
      return;
    }

    // A scheduled meeting stores a real UTC instant computed from the host's
    // wall-clock time in the chosen zone. Instant meetings carry no schedule.
    const isScheduled = formData.meeting_type === 'scheduled';
    const scheduledUtc = isScheduled && formData.scheduled_time
      ? zonedWallTimeToUtcISO(formData.scheduled_time, formData.timezone)
      : null;
    if (isScheduled && !scheduledUtc) {
      toast.error(t('ministryInteractiveMeetings', 'invalidScheduledTime', 'Please pick a valid scheduled time.'));
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

      if (isEditing && meeting) {
        // Editing an existing meeting: don't touch room_name/mode/provisioning.
        // Changing the schedule clears the reminder ledger so the new times fire.
        const { data, error } = await supabase
          .from('ministry_video_meetings')
          .update(sharedFields)
          .eq('id', meeting.id)
          .select()
          .single();
        if (error) throw error;

        await supabase.from('meeting_reminder_sends').delete().eq('meeting_id', meeting.id);

        toast.success(t('ministryInteractiveMeetings', 'meetingUpdatedSuccess', 'Meeting updated'));
        onSuccess(data);
        onClose();
        return;
      }

      const roomName = `ministry-${ministryId}-${Date.now()}`;
      const { data, error } = await supabase
        .from('ministry_video_meetings')
        .insert({
          ministry_id: ministryId,
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

      // Webinar mode: auto-provision a Cloudflare live input (platform-managed,
      // no host setup). This stores the HLS playback URL on the meeting.
      if (formData.mode === 'webinar') {
        const provisioned = await createMeetingStream(data.id, formData.enable_recording);
        if (!provisioned) {
          toast.error(t('ministryInteractiveMeetings', 'streamSetupFailed', 'Meeting created, but the live stream could not be set up. Check streaming configuration.'));
        }
      }

      await logUsage(user.id, 'ministry_meeting_created', {
        meeting_id: data.id,
        ministry_id: ministryId
      });

      toast.success(t('ministryInteractiveMeetings', 'meetingCreatedSuccess', 'Meeting created successfully!'));
      onSuccess(data);
      onClose();
    } catch (error: any) {
      console.error('Error saving meeting:', error);
      toast.error(error.message || t('ministryInteractiveMeetings', 'failedToCreate', 'Failed to create meeting'));
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
              ? t('ministryInteractiveMeetings', 'editMinistryMeeting', 'Edit Meeting')
              : t('ministryInteractiveMeetings', 'createMinistryMeeting', 'Create Ministry Meeting')}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? t('ministryInteractiveMeetings', 'editMeetingDesc', 'Update this meeting’s details, schedule, and reminders')
              : t('ministryInteractiveMeetings', 'createMeetingDesc', 'Set up a new video meeting for your ministry')}
          </DialogDescription>
        </DialogHeader>

        {!accessCheck?.allowed && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {accessCheck?.reason || t('ministryInteractiveMeetings', 'subscriptionRequired', 'Subscription required')}
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">{t('ministryInteractiveMeetings', 'meetingTitleLabel', 'Meeting Title *')}</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder={t('ministryInteractiveMeetings', 'meetingTitlePlaceholder', 'e.g., Leadership Meeting')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('ministryInteractiveMeetings', 'descriptionLabel', 'Description')}</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={t('ministryInteractiveMeetings', 'descriptionPlaceholder', 'Optional meeting description...')}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('ministryInteractiveMeetings', 'meetingTypeLabel', 'Meeting Type')}</Label>
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
                <SelectItem value="instant">{t('ministryInteractiveMeetings', 'instantMeeting', 'Instant Meeting')}</SelectItem>
                <SelectItem value="scheduled">{t('ministryInteractiveMeetings', 'scheduledMeeting', 'Scheduled Meeting')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.meeting_type === 'scheduled' && (
            <div className="space-y-4 rounded-lg border border-purple-100 bg-purple-50/40 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="scheduled_time">{t('ministryInteractiveMeetings', 'scheduledTimeLabel', 'Scheduled Time')}</Label>
                  <Input
                    id="scheduled_time"
                    type="datetime-local"
                    value={formData.scheduled_time}
                    onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">{t('ministryInteractiveMeetings', 'timezoneLabel', 'Time Zone')}</Label>
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
                  {t('ministryInteractiveMeetings', 'scheduledForNote', 'Scheduled for')}{' '}
                  <span className="font-medium">
                    {formatMeetingTime(zonedWallTimeToUtcISO(formData.scheduled_time, formData.timezone), formData.timezone)}
                  </span>
                </p>
              )}

              <div className="space-y-2">
                <Label>{t('ministryInteractiveMeetings', 'remindersLabel', 'Send reminders (in-app + email)')}</Label>
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
                        {t('ministryInteractiveMeetings', `reminderOffset_${opt.minutes}`, opt.label)}
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-500">
                  {t('ministryInteractiveMeetings', 'remindersTip', 'Eligible members (and you) get a notification and email at each selected time before the meeting.')}
                </p>
              </div>

              <div className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2">
                <div>
                  <Label className="text-sm">{t('ministryInteractiveMeetings', 'enableRegistrationLabel', 'Enable registration')}</Label>
                  <p className="text-xs text-gray-500">{t('ministryInteractiveMeetings', 'enableRegistrationTip', 'Let people RSVP from the meeting link (guests can register with name + email on public meetings).')}</p>
                </div>
                <Switch
                  checked={formData.registration_enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, registration_enabled: checked })}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="duration">{t('ministryInteractiveMeetings', 'durationLabel', 'Duration (minutes)')}</Label>
            <Input
              id="duration"
              type="number"
              min={15}
              max={maxDuration || 180}
              value={formData.duration_minutes}
              onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) })}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('ministryInteractiveMeetings', 'accessLevelLabel', 'Access Level')}</Label>
            <Select
              value={formData.access_level}
              onValueChange={(value: 'public' | 'members' | 'leaders') =>
                setFormData({ ...formData, access_level: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">{t('ministryInteractiveMeetings', 'accessPublic', 'Public - Anyone can join')}</SelectItem>
                <SelectItem value="members">{t('ministryInteractiveMeetings', 'accessMembers', 'Members Only')}</SelectItem>
                <SelectItem value="leaders">{t('ministryInteractiveMeetings', 'accessLeaders', 'Leaders Only')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Mode: Meeting vs Webinar */}
          <div className="space-y-2 border-t pt-4">
            <Label>{t('ministryInteractiveMeetings', 'modeLabel', 'Mode')}</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setModeTouched(true); setFormData({ ...formData, mode: 'meeting' }); }}
                className={`rounded-lg border p-3 text-left transition ${formData.mode === 'meeting' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <p className="font-medium text-sm">{t('ministryInteractiveMeetings', 'modeMeeting', 'Meeting')}</p>
                <p className="text-xs text-gray-500">{t('ministryInteractiveMeetings', 'modeMeetingDesc', 'Everyone on camera. Best for small groups.')}</p>
              </button>
              <button
                type="button"
                onClick={() => { setModeTouched(true); setFormData({ ...formData, mode: 'webinar' }); }}
                className={`rounded-lg border p-3 text-left transition ${formData.mode === 'webinar' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <p className="font-medium text-sm">{t('ministryInteractiveMeetings', 'modeWebinar', 'Webinar')}</p>
                <p className="text-xs text-gray-500">{t('ministryInteractiveMeetings', 'modeWebinarDesc', 'Host presents, audience watches.')}</p>
              </button>
            </div>
            {!modeTouched && formData.mode === 'webinar' && formData.max_participants >= WEBINAR_AUTO_THRESHOLD && (
              <p className="text-xs text-amber-600">
                {t('ministryInteractiveMeetings', 'autoSelectedWebinar', 'Auto-selected Webinar because this session allows {count} people. Switch to Meeting if you want everyone on camera.').replace('{count}', String(formData.max_participants))}
              </p>
            )}

            {formData.mode === 'webinar' && (
              <div className="rounded-lg bg-purple-50 border border-purple-100 p-3 mt-2">
                <p className="text-xs text-purple-700">
                  {t('ministryInteractiveMeetings', 'liveStreamingAuto', 'Live streaming is handled automatically. When you go live, the audience watches the stream and can raise a hand to be invited up. No setup needed.')}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-3 border-t pt-4">
            <Label>{t('ministryInteractiveMeetings', 'meetingFeatures', 'Meeting Features')}</Label>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="enable_recording">{t('ministryInteractiveMeetings', 'enableRecording', 'Enable Recording')}</Label>
                <p className="text-xs text-gray-500">{t('ministryInteractiveMeetings', 'enableRecordingDesc', 'Record meeting for later playback')}</p>
              </div>
              <Switch
                id="enable_recording"
                checked={formData.enable_recording}
                onCheckedChange={(checked) => setFormData({ ...formData, enable_recording: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="enable_chat">{t('ministryInteractiveMeetings', 'enableChat', 'Enable Chat')}</Label>
                <p className="text-xs text-gray-500">{t('ministryInteractiveMeetings', 'enableChatDesc', 'Allow participants to chat')}</p>
              </div>
              <Switch
                id="enable_chat"
                checked={formData.enable_chat}
                onCheckedChange={(checked) => setFormData({ ...formData, enable_chat: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="enable_screenshare">{t('ministryInteractiveMeetings', 'enableScreenShare', 'Enable Screen Share')}</Label>
                <p className="text-xs text-gray-500">{t('ministryInteractiveMeetings', 'enableScreenShareDesc', 'Allow screen sharing')}</p>
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
              {t('ministryInteractiveMeetings', 'cancel', 'Cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !accessCheck?.allowed}
            >
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing
                ? t('ministryInteractiveMeetings', 'saveChanges', 'Save Changes')
                : t('ministryInteractiveMeetings', 'createMeeting', 'Create Meeting')}
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
      toast.error(t('ministryInteractiveMeetings', 'enterNameToJoin', 'Please enter your name to join'));
      return;
    }
    onConfirm(trimmed);
    setName('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { onCancel(); setName(''); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('ministryInteractiveMeetings', 'joinMeeting', 'Join Meeting')}</DialogTitle>
          <DialogDescription>
            {t('ministryInteractiveMeetings', 'joinMeetingDesc', 'Enter your name to join the meeting. No sign-in required.')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="guest-name">{t('ministryInteractiveMeetings', 'yourName', 'Your Name')}</Label>
          <Input
            id="guest-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('ministryInteractiveMeetings', 'yourNamePlaceholder', 'e.g. John Smith')}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => { onCancel(); setName(''); }}>
            {t('ministryInteractiveMeetings', 'cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!name.trim()}>
            {t('ministryInteractiveMeetings', 'joinMeeting', 'Join Meeting')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ======================================================
   MAIN COMPONENT
====================================================== */
export const MinistryInteractiveMeetings = ({ ministryId }: { ministryId: string }) => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [meetings, setMeetings] = useState<MinistryVideoMeeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The live call is hosted by the app-level ActiveCallHost (survives navigation),
  // not rendered here. We only start it and reflect "you're in this meeting".
  const { call, startCall, endCall, maximize } = useActiveCall();
  const activeCallId = call?.id ?? null;
  const [recordingsMeeting, setRecordingsMeeting] = useState<MinistryVideoMeeting | null>(null);
  const [subTab, setSubTab] = useState<'meetings' | 'recordings'>('meetings');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<MinistryVideoMeeting | null>(null);
  const [isLeader, setIsLeader] = useState(false);
  const [ministryName, setMinistryName] = useState<string | null>(null);
  const [canCreateMeeting, setCanCreateMeeting] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  // Guest join support
  const [pendingJoinMeeting, setPendingJoinMeeting] = useState<MinistryVideoMeeting | null>(null);
  const [guestName, setGuestName] = useState<string | null>(null);
  // AI Insights state
  const [insightsMeeting, setInsightsMeeting] = useState<MinistryVideoMeeting | null>(null);
  const [showInsightsDialog, setShowInsightsDialog] = useState(false);

  // Check if user is ministry leader or owner
  useEffect(() => {
    const checkLeadership = async () => {
      if (!user || !ministryId) return;

      // First check if user is the ministry owner — this catches newly created
      // ministries where a ministry_members row may not exist yet
      const { data: ministryData } = await supabase
        .from('ministries')
        .select('owner_id, leader_id, name')
        .eq('id', ministryId)
        .single();

      setMinistryName(ministryData?.name || null);

      const isOwnerOrLeader =
        ministryData?.owner_id === user.id ||
        ministryData?.leader_id === user.id;

      if (isOwnerOrLeader) {
        setIsLeader(true);
        return;
      }

      // Fall back to ministry_members role check
      const { data, error } = await supabase
        .from('ministry_members')
        .select('role')
        .eq('ministry_id', ministryId)
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.warn('Leadership check failed:', error);
        setIsLeader(meetings.some(m => m.host_id === user.id));
        return;
      }

      setIsLeader(
        data?.role === 'leader' ||
        data?.role === 'admin' ||
        meetings.some(m => m.host_id === user.id)
      );
    };

    checkLeadership();
  }, [user, ministryId, meetings]);

  // Load user subscription
  useEffect(() => {
    const loadSubscription = async () => {
      if (!user?.id) return;
      
      try {
        const userSubscription = await getUserActiveSubscription(user.id);
        
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
    if (!ministryId) return;
    fetchMeetings();
  }, [ministryId]);

  // Auto-open meeting from Skeleton redirect
  useEffect(() => {
    const autoOpenMeetingId = sessionStorage.getItem('autoOpenMeetingId');
    
    if (autoOpenMeetingId && meetings.length > 0 && !activeCallId) {
      console.log('[MinistryInteractiveMeetings] Auto-opening meeting:', autoOpenMeetingId);
      
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
        // Auto-join the meeting
        doJoinMeeting(meeting);

        toast.success(t('ministryInteractiveMeetings', 'openingMeeting', 'Opening meeting...'));
      } else {
        toast.error(t('ministryInteractiveMeetings', 'meetingNotFound', 'Meeting not found'));
        console.error('[MinistryInteractiveMeetings] Meeting not found:', autoOpenMeetingId);
      }
    }
  }, [meetings, activeCallId]);

  const fetchMeetings = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('ministry_video_meetings')
        .select('*')
        .eq('ministry_id', ministryId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMeetings(data || []);
    } catch (err) {
      console.error('Error fetching meetings:', err);
      setError(t('ministryInteractiveMeetings', 'failedToLoad', 'Failed to load meetings'));
      toast.error(t('ministryInteractiveMeetings', 'failedToLoad', 'Failed to load meetings'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinMeeting = async (meeting: MinistryVideoMeeting) => {
    // If user is not signed in, prompt for their name first
    if (!user) {
      setPendingJoinMeeting(meeting);
      return;
    }
    await doJoinMeeting(meeting);
  };

  const doJoinMeeting = async (meeting: MinistryVideoMeeting) => {
    try {
      if (!meeting.is_active) {
        const { error } = await supabase
          .from('ministry_video_meetings')
          .update({ 
            is_active: true,
            started_at: new Date().toISOString()
          })
          .eq('id', meeting.id);

        if (error) throw error;
      }

      const { error: countError } = await supabase
        .from('ministry_video_meetings')
        .update({ 
          participant_count: meeting.participant_count + 1 
        })
        .eq('id', meeting.id);

      if (countError) console.error('Error updating participant count:', countError);

      beginCall(meeting);
    } catch (error) {
      console.error('Error joining meeting:', error);
      toast.error(t('ministryInteractiveMeetings', 'failedToJoin', 'Failed to join meeting'));
    }
  };

  // DB side of leaving/ending — self-contained (takes the meeting) so it still works
  // if this list component has since unmounted (e.g. left from the mini-player).
  const leaveMeetingDb = async (meeting: MinistryVideoMeeting) => {
    try {
      const newCount = Math.max(0, meeting.participant_count - 1);
      await supabase.from('ministry_video_meetings').update({ participant_count: newCount }).eq('id', meeting.id);
    } catch (error) {
      console.error('Error leaving meeting:', error);
    }
  };

  const endMeetingDb = async (meeting: MinistryVideoMeeting) => {
    try {
      await supabase
        .from('ministry_video_meetings')
        .update({ is_active: false, ended_at: new Date().toISOString(), participant_count: 0 })
        .eq('id', meeting.id);
    } catch (error) {
      console.error('Error ending meeting:', error);
    }
  };

  // Hand the fully-configured meeting element to the app-level ActiveCallHost, which
  // renders it above the router so it survives navigation.
  const beginCall = (meeting: MinistryVideoMeeting) => {
    const displayName = profile?.full_name || user?.email?.split('@')[0] || guestName || 'Guest';
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
    await doJoinMeeting(meeting);
  };

  const handleGuestNameCancel = () => {
    setPendingJoinMeeting(null);
  };

  const [deletingMeetingId, setDeletingMeetingId] = useState<string | null>(null);
  const [recordingBusyId, setRecordingBusyId] = useState<string | null>(null);

  // Flip a meeting's recording on/off after it exists. Mux can't toggle
  // recording on an existing live stream, so re-provision (delete + create).
  // Mints a new stream key + playback URL, so it's meant for use before going live.
  const toggleMeetingRecording = async (meeting: MinistryVideoMeeting, enabled: boolean) => {
    if (meeting.is_active) {
      toast.error(t('ministryInteractiveMeetings', 'cantChangeRecordingLive', "Can't change recording while the meeting is live — end it first."));
      return;
    }
    setRecordingBusyId(meeting.id);
    try {
      await supabase.from('ministry_video_meetings').update({ enable_recording: enabled }).eq('id', meeting.id);
      await reprovisionMeetingStream(meeting.id, enabled);
      toast.success(enabled ? t('ministryInteractiveMeetings', 'recordingOnNextBroadcast', 'Recording on for the next broadcast') : t('ministryInteractiveMeetings', 'recordingOff', 'Recording off'));
      fetchMeetings();
    } catch {
      toast.error(t('ministryInteractiveMeetings', 'couldNotChangeRecording', 'Could not change recording setting'));
    } finally {
      setRecordingBusyId(null);
    }
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    if (!confirm(t('ministryInteractiveMeetings', 'confirmDeleteMeeting', 'Are you sure you want to delete this meeting?'))) return;
    
    setDeletingMeetingId(meetingId);
    try {
      // Permanently tear down the Cloudflare live input first (best-effort)
      await deleteMeetingStream(meetingId);

      const { error } = await supabase
        .from('ministry_video_meetings')
        .delete()
        .eq('id', meetingId);

      if (error) throw error;

      // Log usage deletion
      if (user?.id) {
        const meeting = meetings.find(m => m.id === meetingId);
        await logUsage(user.id, 'meeting_delete', 'ministry_video_meeting', meetingId, 1, 0, {
          meeting_title: meeting?.title
        });
      }

      toast.success(t('ministryInteractiveMeetings', 'meetingDeleted', 'Meeting deleted'));
      fetchMeetings();
    } catch (error) {
      console.error('Error deleting meeting:', error);
      toast.error(t('ministryInteractiveMeetings', 'failedToDelete', 'Failed to delete meeting'));
    } finally {
      setDeletingMeetingId(null);
    }
  };

  // Meeting list view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold">{t('ministryInteractiveMeetings', 'videoMeetings', 'Video Meetings')}</h2>
            <Badge variant="default" className="bg-gradient-to-r from-purple-600 to-indigo-600">
              <Crown className="h-3 w-3 mr-1" />
              {t('ministryInteractiveMeetings', 'ministryPlus', 'Ministry Plus')}
            </Badge>
          </div>
          <p className="text-gray-500">{t('ministryInteractiveMeetings', 'connectThroughVideo', 'Connect with your ministry through video calls')}</p>
        </div>
        {isLeader && (
          <Button
            onClick={() => setShowCreateModal(true)}
            disabled={!canCreateMeeting}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('ministryInteractiveMeetings', 'createMeeting', 'Create Meeting')}
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
          {t('ministryInteractiveMeetings', 'tabMeetings', 'Meetings')}
        </button>
        <button
          onClick={() => setSubTab('recordings')}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${subTab === 'recordings' ? 'border-purple-600 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          {t('ministryInteractiveMeetings', 'tabRecordings', 'Recordings')}
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
            <h3 className="text-lg font-semibold mb-2">{t('ministryInteractiveMeetings', 'noMeetingsYet', 'No meetings yet')}</h3>
            <p className="text-gray-500 text-center mb-4">
              {t('ministryInteractiveMeetings', 'createFirstMeeting', 'Create your first ministry meeting to get started')}
            </p>
            {isLeader && (
              <Button onClick={() => setShowCreateModal(true)} disabled={!canCreateMeeting}>
                <Plus className="h-4 w-4 mr-2" />
                {t('ministryInteractiveMeetings', 'createMeeting', 'Create Meeting')}
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
                <h3 className="text-xl font-bold">{t('ministryInteractiveMeetings', 'activeMeetings', 'Active Meetings')}</h3>
              </div>

              <div className="space-y-3">
                {meetings.filter(m => m.is_active).map((meeting) => (
                  <div key={meeting.id} className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <h4 className="text-lg font-semibold">{meeting.title}</h4>
                          {meeting.mode === 'webinar' && (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">{t('ministryInteractiveMeetings', 'webinarBadge', 'Webinar')}</Badge>
                          )}
                          <Badge className="bg-green-500 text-white border-0">
                            <span className="w-2 h-2 bg-white rounded-full mr-1 animate-pulse" />
                            {t('ministryInteractiveMeetings', 'liveBadge', 'Live')}
                          </Badge>
                          <Badge variant="outline" className="border-gray-300">
                            <Globe className="h-3 w-3 mr-1" />
                            {t('ministryInteractiveMeetings', 'publicBadge', 'Public')}
                          </Badge>
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                            <Crown className="h-3 w-3 mr-1" />
                            {t('ministryInteractiveMeetings', 'ministryPlus', 'Ministry Plus')}
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
                            <span>{t('ministryInteractiveMeetings', 'durationMinutes', '{count} minutes').replace('{count}', String(meeting.duration_minutes))}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            <span>{meeting.participant_count} / {meeting.max_participants}</span>
                          </div>
                          {meeting.meeting_type === 'scheduled' && (meeting.reminder_offsets?.length ?? 0) > 0 && (
                            <div className="flex items-center gap-1 text-purple-700" title={t('ministryInteractiveMeetings', 'remindersOn', 'Reminders on')}>
                              <MessageSquare className="h-4 w-4" />
                              <span>{t('ministryInteractiveMeetings', 'reminderCount', '{count} reminders').replace('{count}', String(meeting.reminder_offsets!.length))}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 mt-3">
                          {meeting.enable_chat && (
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <MessageSquare className="h-4 w-4" />
                              <span>{t('ministryInteractiveMeetings', 'chat', 'Chat')}</span>
                            </div>
                          )}
                          {meeting.enable_screenshare && (
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <MonitorUp className="h-4 w-4" />
                              <span>{t('ministryInteractiveMeetings', 'screenShare', 'Screen Share')}</span>
                            </div>
                          )}
                          {meeting.meeting_type === 'scheduled' && !meeting.is_active && meeting.registration_enabled && (
                            <RegisterMeetingButton
                              meetingId={meeting.id}
                              meetingKind="ministry"
                              meetingTitle={meeting.title}
                              isHost={meeting.host_id === user?.id}
                              allowGuests={meeting.access_level === 'public'}
                            />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={async () => {
                            const link = `${publicAppOrigin()}/ministry/${meeting.ministry_id}/meeting/${meeting.id}`;
                            const r = await shareMeeting({ hostName: ministryName, title: meeting.title, scheduledTime: meeting.scheduled_time, timezone: meeting.timezone, registrationEnabled: meeting.registration_enabled, url: link });
                            if (r.method !== 'native') toast.success(t('ministryInteractiveMeetings', 'inviteCopied', 'Meeting invite copied — paste it anywhere to invite people!'));
                          }}
                          title={t('ministryInteractiveMeetings', 'copyMeetingLink', 'Copy meeting link')}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        {isLeader && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-purple-300 text-purple-700 hover:bg-purple-50"
                              onClick={() => {
                                setInsightsMeeting(meeting);
                                setShowInsightsDialog(true);
                              }}
                              title={t('ministryInteractiveMeetings', 'viewAiInsights', 'View AI insights')}
                            >
                              <Sparkles className="h-4 w-4 mr-1" />
                              {t('ministryInteractiveMeetings', 'insights', 'Insights')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={recordingBusyId === meeting.id || meeting.is_active}
                              onClick={() => toggleMeetingRecording(meeting, meeting.enable_recording === false)}
                              title={meeting.is_active ? t('ministryInteractiveMeetings', 'recordingCantChangeLive', "Recording can't be changed while the meeting is live") : (meeting.enable_recording !== false ? t('ministryInteractiveMeetings', 'recordingOnClickOff', 'Recording on — click to turn off') : t('ministryInteractiveMeetings', 'recordingOffClickOn', 'Recording off — click to turn on'))}
                            >
                              {recordingBusyId === meeting.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Circle className={`h-4 w-4 mr-1 ${meeting.enable_recording !== false ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
                              )}
                              {meeting.enable_recording !== false ? t('ministryInteractiveMeetings', 'recOn', 'Rec On') : t('ministryInteractiveMeetings', 'recOff', 'Rec Off')}
                            </Button>
                            {meeting.enable_recording !== false && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRecordingsMeeting(meeting)}
                                title={t('ministryInteractiveMeetings', 'viewRecordings', 'View recordings')}
                              >
                                <Video className="h-4 w-4 mr-1" />
                                {t('ministryInteractiveMeetings', 'recordingsBtn', 'Recordings')}
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
                            {t('ministryInteractiveMeetings', 'returnToMeeting', 'Return')}
                          </Button>
                        ) : (
                          <Button
                            onClick={() => handleJoinMeeting(meeting)}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <Play className="h-4 w-4 mr-2" />
                            {t('ministryInteractiveMeetings', 'joinNow', 'Join Now')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scheduled Meetings Section */}
          {meetings.some(m => !m.is_active) && (
            <div className="space-y-4 mt-8">
              <h3 className="text-xl font-bold">{t('ministryInteractiveMeetings', 'scheduledMeetings', 'Scheduled Meetings')}</h3>

              <div className="space-y-3">
                {meetings.filter(m => !m.is_active).map((meeting) => (
                  <div key={meeting.id} className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <h4 className="text-lg font-semibold">{meeting.title}</h4>
                          {meeting.mode === 'webinar' && (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">{t('ministryInteractiveMeetings', 'webinarBadge', 'Webinar')}</Badge>
                          )}
                          <Badge variant="outline" className="border-gray-300">
                            <Globe className="h-3 w-3 mr-1" />
                            {t('ministryInteractiveMeetings', 'publicBadge', 'Public')}
                          </Badge>
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                            <Crown className="h-3 w-3 mr-1" />
                            {t('ministryInteractiveMeetings', 'ministryPlus', 'Ministry Plus')}
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
                            <span>{t('ministryInteractiveMeetings', 'durationMinutes', '{count} minutes').replace('{count}', String(meeting.duration_minutes))}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            <span>{meeting.participant_count} / {meeting.max_participants}</span>
                          </div>
                          {meeting.meeting_type === 'scheduled' && (meeting.reminder_offsets?.length ?? 0) > 0 && (
                            <div className="flex items-center gap-1 text-purple-700" title={t('ministryInteractiveMeetings', 'remindersOn', 'Reminders on')}>
                              <MessageSquare className="h-4 w-4" />
                              <span>{t('ministryInteractiveMeetings', 'reminderCount', '{count} reminders').replace('{count}', String(meeting.reminder_offsets!.length))}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 mt-3">
                          {meeting.enable_chat && (
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <MessageSquare className="h-4 w-4" />
                              <span>{t('ministryInteractiveMeetings', 'chat', 'Chat')}</span>
                            </div>
                          )}
                          {meeting.enable_screenshare && (
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <MonitorUp className="h-4 w-4" />
                              <span>{t('ministryInteractiveMeetings', 'screenShare', 'Screen Share')}</span>
                            </div>
                          )}
                          {meeting.meeting_type === 'scheduled' && !meeting.is_active && meeting.registration_enabled && (
                            <RegisterMeetingButton
                              meetingId={meeting.id}
                              meetingKind="ministry"
                              meetingTitle={meeting.title}
                              isHost={meeting.host_id === user?.id}
                              allowGuests={meeting.access_level === 'public'}
                            />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={async () => {
                            const link = `${publicAppOrigin()}/ministry/${meeting.ministry_id}/meeting/${meeting.id}`;
                            const r = await shareMeeting({ hostName: ministryName, title: meeting.title, scheduledTime: meeting.scheduled_time, timezone: meeting.timezone, registrationEnabled: meeting.registration_enabled, url: link });
                            if (r.method !== 'native') toast.success(t('ministryInteractiveMeetings', 'inviteCopied', 'Meeting invite copied — paste it anywhere to invite people!'));
                          }}
                          title={t('ministryInteractiveMeetings', 'copyMeetingLink', 'Copy meeting link')}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        {isLeader && (
                          <>
                            {meeting.meeting_type === 'scheduled' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingMeeting(meeting)}
                                title={t('ministryInteractiveMeetings', 'editMeeting', 'Edit meeting')}
                              >
                                <Calendar className="h-4 w-4 mr-1" />
                                {t('ministryInteractiveMeetings', 'edit', 'Edit')}
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
                              title={t('ministryInteractiveMeetings', 'viewAiInsightsPrevious', 'View AI insights from previous sessions')}
                            >
                              <Sparkles className="h-4 w-4 mr-1" />
                              {t('ministryInteractiveMeetings', 'insights', 'Insights')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={recordingBusyId === meeting.id || meeting.is_active}
                              onClick={() => toggleMeetingRecording(meeting, meeting.enable_recording === false)}
                              title={meeting.is_active ? t('ministryInteractiveMeetings', 'recordingCantChangeLive', "Recording can't be changed while the meeting is live") : (meeting.enable_recording !== false ? t('ministryInteractiveMeetings', 'recordingOnClickOff', 'Recording on — click to turn off') : t('ministryInteractiveMeetings', 'recordingOffClickOn', 'Recording off — click to turn on'))}
                            >
                              {recordingBusyId === meeting.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Circle className={`h-4 w-4 mr-1 ${meeting.enable_recording !== false ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
                              )}
                              {meeting.enable_recording !== false ? t('ministryInteractiveMeetings', 'recOn', 'Rec On') : t('ministryInteractiveMeetings', 'recOff', 'Rec Off')}
                            </Button>
                            {meeting.enable_recording !== false && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRecordingsMeeting(meeting)}
                                title={t('ministryInteractiveMeetings', 'viewRecordings', 'View recordings')}
                              >
                                <Video className="h-4 w-4 mr-1" />
                                {t('ministryInteractiveMeetings', 'recordingsBtn', 'Recordings')}
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
                          {t('ministryInteractiveMeetings', 'startMeeting', 'Start Meeting')}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
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
        ministryId={ministryId}
      />

      {/* Guest Name Dialog - shown when unauthenticated user tries to join */}
      <GuestNameDialog
        isOpen={!!pendingJoinMeeting}
        onConfirm={handleGuestNameConfirm}
        onCancel={handleGuestNameCancel}
      />

      {/* Cloudflare recordings for webinar meetings */}
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
              {t('ministryInteractiveMeetings', 'meetingInsightsTitle', 'Meeting Insights — {title}').replace('{title}', String(insightsMeeting?.title ?? ''))}
            </DialogTitle>
            <DialogDescription>
              {t('ministryInteractiveMeetings', 'insightsDialogDesc', 'AI-generated summary, action items, and insights from this meeting session.')}
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

export default MinistryInteractiveMeetings;