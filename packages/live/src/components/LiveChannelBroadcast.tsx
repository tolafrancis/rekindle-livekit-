import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { useUserEntitlements } from '@rekindle/auth/useUserEntitlements';
import { supabase } from '@rekindle/supabase';
import { useDailyRoom } from '../useDailyRoom';
import { provisionChannelStream, getChannelStreamCreds, listSimulcastTargets, reprovisionChannelStream, startChannelBroadcast, stopChannelBroadcast } from '../muxStream';
import { isLiveKitBackend } from '../videoBackend';
import { useMeetingPresence } from '../useMeetingPresence';
import { useMeetingReactions } from '../useMeetingReactions';
import { MeetingReactionsLayer, ReactionBar } from './MeetingReactions';
import { MeetingNotesBanner } from './MeetingNotesBanner';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@rekindle/ui/card';
import { Input } from '@rekindle/ui/input';
import { Switch } from '@rekindle/ui/switch';
import { Label } from '@rekindle/ui/label';
import { Alert, AlertDescription } from '@rekindle/ui/alert';
import { ScrollArea } from '@rekindle/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@rekindle/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@rekindle/ui/dialog';
import { LiveChannelChat } from './LiveChannelChat';
import MeetingRecordingPanel from './MeetingRecordingPanel';
import SavedMeetingInsights from './SavedMeetingInsights';
// REMOVED: import { LiveChannelParticipantManager } from './LiveChannelParticipantManager';
import {
  Radio,
  RadioOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Users,
  Settings,
  UserPlus,
  UserMinus,
  Crown,
  Circle,
  Maximize,
  Minimize,
  PhoneOff,
  Loader2,
  AlertCircle,
  Lock,
  Send,
  Hand,
  X,
  Sparkles,
  FileText
} from 'lucide-react';
import { toast } from '@rekindle/ui/use-toast';
import { LiveChannel, ChannelCoHost } from '@rekindle/types/liveChannelTypes';

interface RaisedHandRequest {
  id: string;
  channel_id: string;
  user_id: string;
  user_name: string;
  avatar_url?: string;
  requested_at: string;
  status: 'pending' | 'approved' | 'denied';
}

interface LiveChannelBroadcastProps {
  channel: LiveChannel;
  onEndBroadcast: () => void;
  broadcastState?: "upcoming" | "live" | "replay" | "replay_locked";
}

// ── BroadcastSpeakerTile ──────────────────────────────────────────────────────
// Renders an invited speaker's video (or avatar) + audio in the host broadcast view.
// Audio is played so the host can hear speakers; video shows their camera feed.
const BroadcastSpeakerTile: React.FC<{
  participant: {
    sessionId: string;
    userName: string;
    hasVideo: boolean;
    hasAudio: boolean;
    videoTrack?: MediaStreamTrack;
    audioTrack?: MediaStreamTrack;
  };
}> = ({ participant }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (participant.videoTrack && participant.videoTrack.readyState === 'live' && videoRef.current) {
      videoRef.current.srcObject = new MediaStream([participant.videoTrack]);
      videoRef.current.play().catch(() => {});
    } else if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [participant.videoTrack, participant.hasVideo]);

  useEffect(() => {
    if (participant.audioTrack && participant.audioTrack.readyState === 'live' && audioRef.current) {
      audioRef.current.srcObject = new MediaStream([participant.audioTrack]);
      audioRef.current.play().catch(() => {});
    }
  }, [participant.audioTrack, participant.hasAudio]);

  return (
    <div className="flex-1 min-h-0 relative bg-gray-900 rounded-lg overflow-hidden">
      <audio ref={audioRef} autoPlay className="hidden" />
      {participant.hasVideo ? (
        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-purple-700 flex items-center justify-center text-white text-lg font-bold mb-1">
            {participant.userName.charAt(0).toUpperCase()}
          </div>
          <p className="text-white text-xs truncate px-1 max-w-full">{participant.userName}</p>
        </div>
      )}
      <div className="absolute bottom-1 left-1 flex items-center gap-1">
        <span className="text-white text-xs bg-black/60 px-1 py-0.5 rounded truncate max-w-[80px]">
          {participant.userName}
        </span>
        {!participant.hasAudio && <MicOff className="h-3 w-3 text-red-400 flex-shrink-0" />}
      </div>
    </div>
  );
};

export const LiveChannelBroadcast: React.FC<LiveChannelBroadcastProps> = ({
  channel,
  onEndBroadcast,
  broadcastState = "live"
}) => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const entitlements = useUserEntitlements();
  
  const [isVideoMode, setIsVideoMode] = useState(channel.is_video_enabled);
  // Recording is governed by the channel's setting and performed by Mux (it
  // auto-records the ingested RTMP). Seeded from the channel; synced below.
  const [isRecording, setIsRecording] = useState(channel.enable_recording !== false);
  const [showSettings, setShowSettings] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [coHosts, setCoHosts] = useState<ChannelCoHost[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [broadcastId, setBroadcastId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [broadcastStartTime, setBroadcastStartTime] = useState<number | null>(null);

  // AI features state
  const [showAIPanel, setShowAIPanel] = useState(false);
  // True while the AI notes recogniser is running — makes the AI button flicker.
  const [notesActive, setNotesActive] = useState(false);
  const [showInsightsDialog, setShowInsightsDialog] = useState(false);

  // ADDED: Participant management state
  const [raisedHands, setRaisedHands] = useState<RaisedHandRequest[]>([]);
  // Live reactions. Keyed on channel.id so LiveChannelViewer joins the SAME Supabase
  // broadcast channel and host↔audience see each other's emojis.
  const { floating: reactions, sendReaction } = useMeetingReactions(channel.id, true);
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());
  const [showParticipants, setShowParticipants] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);

  const videoContainerRef = useRef<HTMLDivElement>(null);
  // REMOVED: const localVideoRef = useRef<HTMLVideoElement>(null);
  // Use the localVideoRef from dailyRoom hook instead
  
  const canUseBroadcastMessaging = entitlements.canUseBroadcastMessaging;

  // Initialize Daily room
  const dailyRoom = useDailyRoom({
    roomName: `channel-${channel.id}`,
    userName: profile?.full_name || user?.email?.split('@')[0] || 'Host',
    userId: user?.id || 'anonymous',
    isHost: true,
    // LiveKit derives host status SERVER-SIDE and ignores `isHost` above (auth hole,
    // plan §7). Without channelId it can't match live_channels.owner_id, so the
    // broadcaster would be issued an attendee token — losing isOwner, host-only UI,
    // moderation and egress. Pass the channel so the host is actually recognised.
    channelId: channel.id,
    meetingKind: 'channel',
    onParticipantJoined: (participant) => {
      // Viewer counting is handled by the presence layer below (HLS viewers
      // never join the Daily room). Daily participants here are speakers only.
      if (!participant.local) { /* speaker joined — video tiles handle render */ }
    },
    onParticipantLeft: (participant) => {
      if (!participant.local) { /* speaker left */ }
    }
  });

  // Recording is handled by Mux, not Daily: the channel's Mux live stream is
  // provisioned with/without recording and Mux auto-records the whole session.
  // So just mirror the channel's setting; there is no Daily recording to sync.
  useEffect(() => {
    setIsRecording(channel.enable_recording !== false);
  }, [channel.enable_recording]);

  // Host audience presence: viewers (including HLS viewers who never join Daily)
  // announce themselves on the channel presence channel, so the host gets a live
  // roster and an accurate viewer count regardless of how they're watching.
  const hostPresenceId = user?.id || 'host';
  const audience = useMeetingPresence(
    channel.id,
    hostPresenceId,
    profile?.full_name || user?.email?.split('@')[0] || 'Host',
    false,
    hasStarted
  );
  const audienceViewers = audience.filter(m => m.userId !== hostPresenceId);
  useEffect(() => {
    if (!hasStarted) return;
    const c = audienceViewers.length;
    setViewerCount(c);
    updateViewerCount(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceViewers.length, hasStarted]);

  // Bridge the host's Daily room to Mux once the call object is actually ready.
  // The hook exposes callObject from a ref, so it's null right after joinRoom —
  // this effect fires when it becomes available (after connect), provisions the
  // channel's Mux stream, starts the RTMP push, and flags HLS live so viewers
  // watch the Mux stream instead of joining Daily as participants.
  const muxBridgeStartedRef = useRef(false);
  useEffect(() => {
    if (!hasStarted) return;

    // §6A — LiveKit: the host already publishes to the room; Egress composites it
    // to HLS. No Mux provision, no callObject.startLiveStreaming — just start the
    // HLS Egress (which also sets hls_playback_url + is_hls_live server-side).
    if (isLiveKitBackend()) {
      if (muxBridgeStartedRef.current) return;
      muxBridgeStartedRef.current = true;
      (async () => {
        // Live viewers subscribe over WebRTC (sub-second). HLS Egress is only needed
        // to RECORD the broadcast to VOD, so start it only when recording is on.
        if (isRecording) {
          const res = await startChannelBroadcast(channel.id);
          if (res) console.log('[Broadcast] LiveKit HLS Egress (VOD) live:', res.playbackUrl);
          else { console.warn('[Broadcast] HLS Egress did not start'); muxBridgeStartedRef.current = false; }
        } else {
          // Pure WebRTC webinar — clear any stale HLS flag so viewers use the room.
          await supabase.from('live_channels').update({ is_hls_live: false }).eq('id', channel.id);
        }
      })();
      return;
    }

    const callObject = dailyRoom.callObject;
    if (!callObject) return;
    if (muxBridgeStartedRef.current) return;
    muxBridgeStartedRef.current = true;
    (async () => {
      try {
        let mux = await getChannelStreamCreds(channel.id);
        if (!mux?.rtmpUrl) mux = await provisionChannelStream(channel.id, isRecording);
        if (!mux?.rtmpUrl) {
          console.warn('[Broadcast] No Mux stream available — viewers fall back to Daily.');
          muxBridgeStartedRef.current = false;
          return;
        }
        await supabase
          .from('live_channels')
          .update({ hls_playback_url: mux.playbackUrl || null })
          .eq('id', channel.id);

        // Simulcast safety-net: targets persist on the Mux stream and auto-activate
        // when it goes live, so normally there's nothing to do here. We only surface
        // a warning if an enabled target somehow lacks a Mux target id (e.g. saved
        // while the stream was active and skipped) — re-attaching needs the stream
        // key, which is write-only on the server, so it must be re-saved from the
        // channel's stream settings. Never block go-live on this.
        try {
          const sim = await listSimulcastTargets(channel.id);
          if (sim.ok && sim.data) {
            const unattached = sim.data.targets.filter(t => t.enabled && !t.mux_target_id);
            if (unattached.length) {
              console.warn(
                '[Broadcast] Simulcast targets not attached to Mux (re-save them in stream settings):',
                unattached.map(t => t.platform).join(', '),
              );
            }
          }
        } catch (simErr) {
          console.warn('[Broadcast] Simulcast reconcile check failed (non-fatal):', simErr);
        }

        await callObject.startLiveStreaming({ rtmpUrl: mux.rtmpUrl, width: 1280, height: 720 });
        console.log('[Broadcast] Daily→Mux RTMP push started');
        await supabase
          .from('live_channels')
          .update({ is_hls_live: true })
          .eq('id', channel.id);
        console.log('[Broadcast] is_hls_live set true — viewers will watch the Mux HLS stream');
      } catch (streamErr) {
        console.warn('[Broadcast] Daily→Mux bridge failed; viewers fall back to Daily:', streamErr);
        muxBridgeStartedRef.current = false;
      }
    })();
  }, [hasStarted, dailyRoom.callObject, channel.id, isRecording]);

  // Update viewer count in database
  const updateViewerCount = async (count: number) => {
    await supabase
      .from('live_channels')
      .update({ viewer_count: count })
      .eq('id', channel.id);
  };

  // ADDED: Load raised hands
  const loadRaisedHands = useCallback(async () => {
    const { data, error } = await supabase
      .from('live_channel_raised_hands')
      .select('*')
      .eq('channel_id', channel.id)
      .eq('status', 'pending')
      .order('requested_at', { ascending: true });

    if (!error && data) {
      setRaisedHands(data);
    }
  }, [channel.id]);

  // ADDED: Load active speakers
  const loadActiveSpeakers = useCallback(async () => {
    const { data, error } = await supabase
      .from('live_channel_speakers')
      .select('user_id')
      .eq('channel_id', channel.id);

    if (!error && data) {
      setActiveSpeakers(new Set(data.map(s => s.user_id)));
    }
  }, [channel.id]);

  // ADDED: Subscribe to real-time updates for participant management
  useEffect(() => {
    if (!hasStarted) return;

    loadRaisedHands();
    loadActiveSpeakers();

    const raisedHandsChannel = supabase
      .channel(`raised-hands-${channel.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_channel_raised_hands',
          filter: `channel_id=eq.${channel.id}`
        },
        () => {
          loadRaisedHands();
        }
      )
      .subscribe();

    const speakersChannel = supabase
      .channel(`speakers-${channel.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_channel_speakers',
          filter: `channel_id=eq.${channel.id}`
        },
        () => {
          loadActiveSpeakers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(raisedHandsChannel);
      supabase.removeChannel(speakersChannel);
    };
  }, [hasStarted, channel.id, loadRaisedHands, loadActiveSpeakers]);

  // ADDED: Approve raised hand
  const approveRaisedHand = async (handId: string, userId: string, userName: string) => {
    setLoadingAction(true);
    try {
      await supabase
        .from('live_channel_raised_hands')
        .update({ status: 'approved' })
        .eq('id', handId);

      await supabase
        .from('live_channel_speakers')
        .insert({
          channel_id: channel.id,
          user_id: userId,
          user_name: userName,
          invited_by: user?.id
        });

      await supabase
        .from('live_channel_speaker_invitations')
        .insert({
          channel_id: channel.id,
          inviter_id: user?.id,
          invitee_id: userId,
          invitee_name: userName,
          status: 'pending'
        });

      toast({
        title: t('liveChannelBroadcast', 'invitationSent', 'Invitation Sent'),
        description: t('liveChannelBroadcast', 'userCanNowSpeak', '{name} can now speak').replace('{name}', String(userName))
      });

      loadRaisedHands();
      loadActiveSpeakers();
    } catch (err) {
      console.error('Failed to approve raised hand:', err);
      toast({
        title: t('liveChannelBroadcast', 'error', 'Error'),
        description: t('liveChannelBroadcast', 'failedToSendInvitation', 'Failed to send invitation'),
        variant: 'destructive'
      });
    } finally {
      setLoadingAction(false);
    }
  };

  // ADDED: Deny raised hand
  const denyRaisedHand = async (handId: string) => {
    setLoadingAction(true);
    try {
      await supabase
        .from('live_channel_raised_hands')
        .update({ status: 'denied' })
        .eq('id', handId);

      toast({
        title: t('liveChannelBroadcast', 'requestDenied', 'Request Denied'),
        description: t('liveChannelBroadcast', 'viewerHasBeenNotified', 'The viewer has been notified')
      });

      loadRaisedHands();
    } catch (err) {
      console.error('Failed to deny raised hand:', err);
      toast({
        title: t('liveChannelBroadcast', 'error', 'Error'),
        description: t('liveChannelBroadcast', 'failedToDenyRequest', 'Failed to deny request'),
        variant: 'destructive'
      });
    } finally {
      setLoadingAction(false);
    }
  };

  // ADDED: Invite participant to speak
  const inviteToSpeak = async (participantId: string, participantName: string) => {
    if (!user) return;

    setLoadingAction(true);
    try {
      if (activeSpeakers.has(participantId)) {
        toast({
          title: t('liveChannelBroadcast', 'alreadySpeaking', 'Already Speaking'),
          description: t('liveChannelBroadcast', 'participantAlreadySpeaker', '{name} is already a speaker').replace('{name}', String(participantName)),
          variant: 'destructive'
        });
        return;
      }

      await supabase
        .from('live_channel_speakers')
        .insert({
          channel_id: channel.id,
          user_id: participantId,
          user_name: participantName,
          invited_by: user.id
        });

      await supabase
        .from('live_channel_speaker_invitations')
        .insert({
          channel_id: channel.id,
          inviter_id: user.id,
          invitee_id: participantId,
          invitee_name: participantName,
          status: 'pending'
        });

      toast({
        title: t('liveChannelBroadcast', 'invitationSent', 'Invitation Sent'),
        description: t('liveChannelBroadcast', 'participantInvitedToSpeak', '{name} has been invited to speak').replace('{name}', String(participantName))
      });

      loadActiveSpeakers();
    } catch (err) {
      console.error('Failed to invite to speak:', err);
      toast({
        title: t('liveChannelBroadcast', 'error', 'Error'),
        description: t('liveChannelBroadcast', 'failedToSendInvitation', 'Failed to send invitation'),
        variant: 'destructive'
      });
    } finally {
      setLoadingAction(false);
    }
  };

  // ADDED: Remove speaker
  // §3F — mute/unmute a speaker. On Daily keep the native ENFORCED path
  // (updateParticipant). On LiveKit there is no raw call object, so go through the
  // hook (server-enforced via the livekit-moderation edge fn).
  const muteSpeaker = async (sessionId: string, mute: boolean) => {
    try {
      const callObject = dailyRoom.callObject;
      if (callObject) {
        await callObject.updateParticipant(sessionId, { setAudio: !mute });
        return;
      }
      if (mute) await dailyRoom.muteParticipant(sessionId);
      else await dailyRoom.allowUnmute(sessionId);
    } catch (err) {
      console.error('Failed to mute speaker:', err);
    }
  };

  const removeSpeaker = async (userId: string) => {
    setLoadingAction(true);
    try {
      // §3F — force-disable the speaker's audio+video before removing the DB record.
      // Daily: native enforced updateParticipant. LiveKit: via the hook (no call object).
      const participant = dailyRoom.participants.find(p => p.id === userId);
      if (participant?.sessionId) {
        try {
          if (dailyRoom.callObject) {
            await dailyRoom.callObject.updateParticipant(participant.sessionId, {
              setAudio: false,
              setVideo: false,
            });
          } else {
            await dailyRoom.muteParticipant(participant.sessionId);
            await dailyRoom.disableParticipantVideo(participant.sessionId);
          }
        } catch (mediaErr) {
          // Non-fatal — DB removal triggers the speaker's Realtime subscription to disable locally
          console.warn('Could not force-disable media:', mediaErr);
        }
      }

      await supabase
        .from('live_channel_speakers')
        .delete()
        .eq('channel_id', channel.id)
        .eq('user_id', userId);

      toast({
        title: t('liveChannelBroadcast', 'speakerRemoved', 'Speaker Removed'),
        description: t('liveChannelBroadcast', 'participantRemovedFromSpeakers', 'The participant has been removed from speakers')
      });

      loadActiveSpeakers();
    } catch (err) {
      console.error('Failed to remove speaker:', err);
      toast({
        title: t('liveChannelBroadcast', 'error', 'Error'),
        description: t('liveChannelBroadcast', 'failedToRemoveSpeaker', 'Failed to remove speaker'),
        variant: 'destructive'
      });
    } finally {
      setLoadingAction(false);
    }
  };


  // Start broadcast
  const startBroadcast = async () => {
    if (isStarting || hasStarted) return;
    setIsStarting(true);

    try {
      console.log('[Broadcast] Starting broadcast setup...');
      
      const { data: broadcast, error: broadcastError } = await supabase
        .from('channel_broadcasts')
        .insert({
          channel_id: channel.id,
          title: `${channel.name} Live`,
          is_video: isVideoMode,
          daily_room_name: `channel-${channel.id}`,
          recording_status: isRecording ? 'recording' : 'none'
        })
        .select()
        .single();

      if (broadcastError) throw broadcastError;
      setBroadcastId(broadcast.id);
      console.log('[Broadcast] Broadcast record created:', broadcast.id);

      await supabase
        .from('live_channels')
        .update({
          is_live: true,
          is_video_enabled: isVideoMode,
          is_recording: isRecording,
          last_live_at: new Date().toISOString(),
          daily_room_name: `channel-${channel.id}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', channel.id);
      console.log('[Broadcast] Channel status updated');

      console.log('[Broadcast] Joining Daily room...');
      const joined = await dailyRoom.joinRoom();
      if (!joined) {
        throw new Error('Failed to join broadcast room');
      }
      console.log('[Broadcast] Successfully joined Daily room');

      // FIXED: Clean up ALL stale chat messages before starting new broadcast
      // This includes system messages to prevent "is now live" accumulation
      console.log('[Broadcast] Cleaning up ALL stale chat messages');
      try {
        const { error: deleteError } = await supabase
          .from('channel_chat_messages')
          .delete()
          .eq('channel_id', channel.id);

        if (deleteError) {
          console.warn('[Broadcast] Could not clean up old messages:', deleteError);
        } else {
          console.log('[Broadcast] ALL stale messages cleaned up');
        }
      } catch (cleanupErr) {
        console.warn('[Broadcast] Failed to cleanup messages:', cleanupErr);
      }

      console.log('[Broadcast] Waiting for room to be fully ready...');
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      console.log('[Broadcast] Requesting microphone permission...');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        console.log('[Broadcast] Microphone permission granted');
      } catch (permErr) {
        console.error('[Broadcast] Microphone permission denied:', permErr);
        toast({
          title: t('liveChannelBroadcast', 'microphoneAccessRequired', 'Microphone Access Required'),
          description: t('liveChannelBroadcast', 'enableMicPermissions', 'Please enable microphone permissions to broadcast audio'),
          variant: 'destructive'
        });
      }
      
      console.log('[Broadcast] Enabling host microphone...');
      // Guarded: if enabling the mic rejects, it must NOT abort startBroadcast —
      // otherwise setHasStarted(true) below never runs and the entire live control
      // bar (AI, invite, recording, participants) silently fails to render.
      try {
        await dailyRoom.toggleMic();
      } catch (micErr) {
        console.error('[Broadcast] Could not enable microphone (non-fatal):', micErr);
      }
      
      // FIXED: Enable camera if video mode is enabled
      if (isVideoMode && !dailyRoom.isCameraOn) {
        console.log('[Broadcast] Enabling host camera for video mode...');
        try {
          // Request camera permission
          const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
          videoStream.getTracks().forEach(track => track.stop());
          console.log('[Broadcast] Camera permission granted');
          
          // Enable camera
          await dailyRoom.toggleCamera();
          
          setTimeout(() => {
            if (dailyRoom.isCameraOn) {
              console.log('[Broadcast] ✓ Host camera enabled successfully');
              console.log('[Broadcast] ✓ Video should now be transmitting to viewers');
            } else {
              console.warn('[Broadcast] ⚠️ Host camera may not be enabled - check permissions');
              toast({
                title: t('liveChannelBroadcast', 'camera', 'Camera'),
                description: t('liveChannelBroadcast', 'clickCameraButton', 'Please click the camera button to enable video'),
                variant: 'destructive'
              });
            }
          }, 1000);
        } catch (camErr) {
          console.error('[Broadcast] Camera permission denied:', camErr);
          toast({
            title: t('liveChannelBroadcast', 'cameraAccessRequired', 'Camera Access Required'),
            description: t('liveChannelBroadcast', 'enableCameraPermissions', 'Please enable camera permissions to broadcast video'),
            variant: 'destructive'
          });
        }
      }
      
      setTimeout(() => {
        if (dailyRoom.isMicOn) {
          console.log('[Broadcast] ✓ Host microphone enabled successfully');
          console.log('[Broadcast] ✓ Audio should now be transmitting to viewers');
        } else {
          console.warn('[Broadcast] ⚠️ Host microphone may not be enabled - check permissions');
          toast({
            title: t('liveChannelBroadcast', 'microphone', 'Microphone'),
            description: t('liveChannelBroadcast', 'clickMicButton', 'Please click the microphone button to enable audio'),
            variant: 'destructive'
          });
        }
      }, 1000);

      await supabase
        .from('channel_chat_messages')
        .insert({
          channel_id: channel.id,
          user_id: user?.id || 'system',
          user_name: 'System',
          message: `${channel.name} is now live!`,
          message_type: 'system'
        });

      setHasStarted(true);
      setBroadcastStartTime(Date.now());
      console.log('[Broadcast] ✓✓✓ Broadcast started successfully ✓✓✓');

      // The Daily→Mux bridge runs from an effect (see bridgeToMux) once the Daily
      // call object is actually available — it's null immediately after joinRoom.

      // Recording needs no action here: Mux auto-records the ingested RTMP when
      // the channel's stream was provisioned with recording on (Broadcast setup).

      toast({
        title: t('liveChannelBroadcast', 'youAreLive', 'You are LIVE!'),
        description: t('liveChannelBroadcast', 'broadcastStartedEnsureMic', 'Your broadcast has started. Make sure your microphone is enabled.')
      });
    } catch (err: any) {
      console.error('[Broadcast] Failed to start:', err);
      toast({
        title: t('liveChannelBroadcast', 'failedToStart', 'Failed to Start'),
        description: err.message || t('liveChannelBroadcast', 'couldNotStartBroadcast', 'Could not start broadcast'),
        variant: 'destructive'
      });
    } finally {
      setIsStarting(false);
    }
  };

  // End broadcast with room cleanup
  const endBroadcast = async () => {
    if (isEnding) return;
    setIsEnding(true);
    
    try {
      console.log('[Broadcast] Ending broadcast for channel:', channel.id);

      // Stop the outbound stream. §6A LiveKit: stop the HLS Egress (and its VOD
      // finalises via the egress webhook). Daily/Mux: stop the RTMP push (Mux then
      // finalises the VOD on its own after the reconnect window).
      try {
        if (isLiveKitBackend()) {
          await stopChannelBroadcast(channel.id);
          console.log('[Broadcast] LiveKit HLS Egress stopped');
        } else {
          await dailyRoom.callObject?.stopLiveStreaming();
          console.log('[Broadcast] Daily→Mux RTMP push stopped');
        }
      } catch (streamErr) {
        console.warn('[Broadcast] stop broadcast failed (non-fatal):', streamErr);
      }
      muxBridgeStartedRef.current = false;

      await dailyRoom.leaveRoom();
      console.log('[Broadcast] Left Daily room');

      try {
        const roomDeleted = await dailyRoom.deleteRoom();
        if (roomDeleted) {
          console.log('[Broadcast] Daily.co room cleaned up successfully');
        } else {
          console.warn('[Broadcast] Failed to delete Daily.co room, it will expire automatically');
        }
      } catch (deleteErr) {
        console.warn('[Broadcast] Error deleting room:', deleteErr);
      }

      if (broadcastId) {
        const { error: broadcastError } = await supabase
          .from('channel_broadcasts')
          .update({
            ended_at: new Date().toISOString(),
            duration_seconds: dailyRoom.sessionDuration,
            peak_viewers: viewerCount,
            total_viewers: viewerCount,
            recording_status: isRecording ? 'processing' : 'none'
          })
          .eq('id', broadcastId);
        
        if (broadcastError) {
          console.error('[Broadcast] Error updating broadcast record:', broadcastError);
        } else {
          console.log('[Broadcast] Updated broadcast record');
        }
      }

      const { error: channelError } = await supabase
        .from('live_channels')
        .update({
          is_live: false,
          is_recording: false,
          is_hls_live: false,
          viewer_count: 0,
          daily_room_name: null,
          total_broadcasts: channel.total_broadcasts + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', channel.id);

      if (channelError) {
        console.error('[Broadcast] Error updating channel status:', channelError);
        throw channelError;
      }
      
      console.log('[Broadcast] Channel status updated - is_live set to false');

      await supabase
        .from('channel_chat_messages')
        .insert({
          channel_id: channel.id,
          user_id: user?.id || 'system',
          user_name: 'System',
          message: 'The broadcast has ended. Thank you for watching!',
          message_type: 'system'
        });

      // FIXED: Clean up ALL chat messages from this broadcast session
      // This prevents system messages from accumulating across sessions
      console.log('[Broadcast] Cleaning up ALL chat messages from ended broadcast');
      try {
        // Delete ALL messages from this broadcast (including system messages)
        // This prevents the "is now live" and "has ended" messages from piling up
        const { error: deleteError } = await supabase
          .from('channel_chat_messages')
          .delete()
          .eq('channel_id', channel.id);

        if (deleteError) {
          console.error('[Broadcast] Error cleaning up chat messages:', deleteError);
        } else {
          console.log('[Broadcast] ALL chat messages cleaned up successfully');
        }
      } catch (cleanupErr) {
        console.error('[Broadcast] Failed to cleanup chat messages:', cleanupErr);
      }

      toast({
        title: t('liveChannelBroadcast', 'broadcastEnded', 'Broadcast Ended'),
        description: t('liveChannelBroadcast', 'durationRoomCleanedUp', 'Duration: {duration}. Room cleaned up successfully.').replace('{duration}', formatDuration(dailyRoom.sessionDuration))
      });

      await new Promise(resolve => setTimeout(resolve, 500));
      
      onEndBroadcast();
    } catch (err: any) {
      console.error('[Broadcast] Failed to end:', err);
      
      try {
        await supabase
          .from('live_channels')
          .update({
            is_live: false,
            is_recording: false,
            viewer_count: 0,
            daily_room_name: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', channel.id);
        console.log('[Broadcast] Fallback: Channel status updated after error');
      } catch (fallbackErr) {
        console.error('[Broadcast] Fallback update also failed:', fallbackErr);
      }
      
      toast({
        title: t('liveChannelBroadcast', 'broadcastEnded', 'Broadcast Ended'),
        description: t('liveChannelBroadcast', 'broadcastEndedCleanupIssue', 'Broadcast ended but there was an issue with cleanup.'),
        variant: 'destructive'
      });
      onEndBroadcast();
    } finally {
      setIsEnding(false);
    }
  };

  // Toggle recording. Recording is performed by Mux: the channel's Mux live
  // stream is provisioned with (or without) recording, so the setting can only
  // change BEFORE going live. Mux then auto-records the whole broadcast — there
  // is no mid-session start/stop to proxy.
  const toggleRecording = async () => {
    const canRecord = entitlements.canRecordMeetings;

    if (!canRecord) {
      toast({
        title: t('liveChannelBroadcast', 'ministryPlusRequired', 'Ministry Plus Required'),
        description: t('liveChannelBroadcast', 'recordingRequiresMinistryPlus', 'Recording requires Ministry Plus subscription'),
        variant: 'destructive'
      });
      return;
    }

    if (hasStarted) {
      toast({
        title: t('liveChannelBroadcast', 'recordingSetBeforeLive', 'Recording is set before you go live'),
        description: t('liveChannelBroadcast', 'muxRecordsAutomatically', 'Mux records the full broadcast automatically. Change recording in Broadcast setup before going live.')
      });
      return;
    }

    const next = !isRecording;
    setIsRecording(next);
    try {
      await supabase.from('live_channels').update({ enable_recording: next }).eq('id', channel.id);
      // LiveKit: recording is just this flag — the broadcast's HLS Egress reads it at
      // go-live and records to VOD. No stream to re-provision (Ingress ≠ recording).
      if (isLiveKitBackend()) return;
      // Mux: recording can't be toggled on an existing stream — re-provision it so
      // the live stream is (re)created with recording on/off. Re-provisioning mints
      // a new stream key + playback URL, so refresh the channel's stored config.
      const p = await reprovisionChannelStream(channel.id, next);
      if (p) {
        await supabase.from('live_channel_broadcast_config').upsert({
          channel_id: channel.id,
          owner_id: channel.owner_id,
          rtmps_url: p.serverUrl,
          stream_key: p.streamKey,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'channel_id' });
        await supabase.from('live_channels')
          .update({ hls_playback_url: p.playbackUrl || null })
          .eq('id', channel.id);
      }
    } catch (err) {
      console.warn('[Broadcast] Could not update recording setting:', err);
      setIsRecording(!next); // revert optimistic flip
      toast({ title: t('liveChannelBroadcast', 'couldNotChangeRecording', 'Could not change recording'), variant: 'destructive' });
    }
  };

  // Invite co-host
  const inviteCoHost = async () => {
    if (!inviteEmail.trim()) return;

    try {
      const { data: invitedUser } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .eq('email', inviteEmail)
        .single();

      if (!invitedUser) {
        toast({
          title: t('liveChannelBroadcast', 'userNotFound', 'User Not Found'),
          description: t('liveChannelBroadcast', 'noUserFoundWithEmail', 'No user found with that email'),
          variant: 'destructive'
        });
        return;
      }

      const { error } = await supabase
        .from('channel_co_hosts')
        .insert({
          channel_id: channel.id,
          broadcast_id: broadcastId,
          user_id: invitedUser.id,
          user_name: invitedUser.full_name,
          role: 'co_host'
        });

      if (error) throw error;

      toast({
        title: t('liveChannelBroadcast', 'invitationSent', 'Invitation Sent'),
        description: t('liveChannelBroadcast', 'userInvitedAsCoHost', '{name} has been invited as co-host').replace('{name}', String(invitedUser.full_name))
      });

      setInviteEmail('');
      setShowInvite(false);
    } catch (err) {
      console.error('[Broadcast] Failed to invite co-host:', err);
      toast({
        title: t('liveChannelBroadcast', 'failedToInvite', 'Failed to Invite'),
        description: t('liveChannelBroadcast', 'couldNotSendInvitation', 'Could not send invitation'),
        variant: 'destructive'
      });
    }
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!videoContainerRef.current) return;

    if (!isFullscreen) {
      videoContainerRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };

  // Format duration
  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // REMOVED: Old duplicate video attachment code
  // The video track is now properly attached by the useDailyRoom hook
  // using the dailyRoom.localVideoRef that we're using in the video element

  // Pre-broadcast setup screen
  if (!hasStarted) {
    switch (broadcastState) {
      case "replay_locked":
        const backgroundImage = channel.featured_image_url || channel.cover_image_url;
        
        return (
          <div className="min-h-[400px] sm:min-h-[500px] lg:min-h-[600px] bg-gray-900 rounded-xl overflow-hidden">
            {backgroundImage && (
              <div 
                className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage: `url(${backgroundImage})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: 'blur(20px)'
                }}
              />
            )}
            
            <div className="relative p-4 sm:p-8 flex flex-col items-center justify-center min-h-[400px] sm:min-h-[500px] lg:min-h-[600px]">
              <div className="max-w-md w-full space-y-6 text-center">
                <div className="text-center">
                  <div className="w-24 h-24 rounded-full mx-auto mb-4 border-4 border-yellow-500 shadow-lg flex items-center justify-center bg-yellow-500/10">
                    <Lock className="h-12 w-12 text-yellow-500" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">{t('liveChannelBroadcast', 'replayLocked', 'Replay Locked')}</h2>
                  <p className="text-gray-400 mb-6">
                    {t('liveChannelBroadcast', 'upgradeToWatchReplay', 'Upgrade your subscription to watch or download this replay.')}
                  </p>
                </div>

                <Card className="p-6 bg-gray-800 border-gray-700">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Radio className="h-5 w-5 text-purple-400" />
                      <div>
                        <h3 className="text-white font-medium">{t('liveChannelBroadcast', 'premiumFeatures', 'Premium Features')}</h3>
                        <p className="text-xs text-gray-400">
                          {t('liveChannelBroadcast', 'premiumFeaturesDesc', 'Get access to all replays, ad-free viewing, and exclusive content')}
                        </p>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-300">{t('liveChannelBroadcast', 'watchReplays', 'Watch Replays')}</span>
                        <Badge className="bg-yellow-500 text-black">{t('liveChannelBroadcast', 'premium', 'Premium')}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-300">{t('liveChannelBroadcast', 'downloadReplays', 'Download Replays')}</span>
                        <Badge className="bg-yellow-500 text-black">{t('liveChannelBroadcast', 'premium', 'Premium')}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-300">{t('liveChannelBroadcast', 'adFreeExperience', 'Ad-Free Experience')}</span>
                        <Badge className="bg-yellow-500 text-black">{t('liveChannelBroadcast', 'premium', 'Premium')}</Badge>
                      </div>
                    </div>
                  </div>
                </Card>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800"
                    onClick={onEndBroadcast}
                  >
                    {t('liveChannelBroadcast', 'goBack', 'Go Back')}
                  </Button>
                  <Button
                    className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black"
                    onClick={() => {
                      window.location.href = '/subscription';
                    }}
                  >
                    {t('liveChannelBroadcast', 'upgradeNow', 'Upgrade Now')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
    }

    const backgroundImage = channel.featured_image_url || channel.cover_image_url;
    
    return (
      <div className="min-h-[400px] sm:min-h-[500px] lg:min-h-[600px] bg-gray-900 rounded-xl overflow-hidden">
        {backgroundImage && (
          <div 
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `url(${backgroundImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'blur(20px)'
            }}
          />
        )}
        
        <div className="relative p-4 sm:p-8 flex flex-col items-center justify-center min-h-[400px] sm:min-h-[500px] lg:min-h-[600px]">
          <div className="max-w-md w-full space-y-4 sm:space-y-6">
            <div className="text-center">
              {channel.channel_logo_url ? (
                <div className="w-24 h-24 rounded-full overflow-hidden mx-auto mb-4 border-4 border-purple-500 shadow-lg">
                  <img src={channel.channel_logo_url} alt={channel.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <Radio className="h-16 w-16 text-red-500 mx-auto mb-4" />
              )}
              <h2 className="text-2xl font-bold text-white mb-2">{t('liveChannelBroadcast', 'goLiveOnChannel', 'Go Live on {name}').replace('{name}', String(channel.name))}</h2>
              <p className="text-gray-400">{t('liveChannelBroadcast', 'configureBroadcastSettings', 'Configure your broadcast settings before going live')}</p>
            </div>

            <Card className="p-6 bg-gray-800 border-gray-700">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Video className="h-5 w-5 text-purple-400" />
                    <div>
                      <Label className="text-white">{t('liveChannelBroadcast', 'videoMode', 'Video Mode')}</Label>
                      <p className="text-xs text-gray-400">{t('liveChannelBroadcast', 'enableCameraForVideo', 'Enable camera for video broadcast')}</p>
                    </div>
                  </div>
                  <Switch
                    checked={isVideoMode}
                    onCheckedChange={setIsVideoMode}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Circle className="h-5 w-5 text-red-400" />
                    <div>
                      <Label className="text-white flex items-center gap-2">
                        {t('liveChannelBroadcast', 'recordBroadcast', 'Record Broadcast')}
                        {!entitlements.canRecordMeetings && (
                          <Badge variant="outline" className="text-xs border-amber-400 text-amber-400">
                            <Lock className="h-3 w-3 mr-1" />
                            {t('liveChannelBroadcast', 'ministryPlus', 'Ministry Plus')}
                          </Badge>
                        )}
                      </Label>
                      <p className="text-xs text-gray-400">
                        {entitlements.canRecordMeetings
                          ? t('liveChannelBroadcast', 'saveRecordingForLater', 'Save recording for later')
                          : t('liveChannelBroadcast', 'requiresMinistryPlusSub', 'Requires Ministry Plus subscription')}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={isRecording}
                    disabled={!entitlements.canRecordMeetings}
                    onCheckedChange={() => toggleRecording()}
                  />
                </div>
              </div>
            </Card>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800"
                onClick={onEndBroadcast}
              >
                {t('liveChannelBroadcast', 'cancel', 'Cancel')}
              </Button>
              <Button
                className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                onClick={startBroadcast}
                disabled={isStarting}
              >
                {isStarting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('liveChannelBroadcast', 'starting', 'Starting...')}
                  </>
                ) : (
                  <>
                    <Radio className="h-4 w-4 mr-2" />
                    {t('liveChannelBroadcast', 'goLive', 'Go Live')}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Live broadcast screen
  return (
    <div className="min-h-[400px] sm:min-h-[500px] lg:min-h-[600px] bg-gray-900 rounded-xl overflow-hidden">
      {!canUseBroadcastMessaging && (
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-2">
          <div className="flex items-center justify-between text-white text-sm">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              <span>{t('liveChannelBroadcast', 'broadcastMessagingRequiresMinistry', 'Broadcast messaging (one-to-many) requires Ministry tier subscription')}</span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => window.location.href = '/subscribe'}
            >
              {t('liveChannelBroadcast', 'upgrade', 'Upgrade')}
            </Button>
          </div>
        </div>
      )}
      
      <div className="flex h-full">
        {/* Main Video/Audio Area */}
        <div className="flex-1 flex flex-col">
          {/* Top Bar */}
          <div className="flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 bg-gray-800 border-b border-gray-700">
            <div className="flex items-center gap-3">
              {channel.channel_logo_url && (
                <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-red-500">
                  <img src={channel.channel_logo_url} alt={channel.name} className="w-full h-full object-cover" />
                </div>
              )}
              <Badge className="bg-red-500 text-white animate-pulse flex items-center gap-1 text-xs sm:text-sm">
                <Radio className="h-2 w-2 sm:h-3 sm:w-3" />
                {t('liveChannelBroadcast', 'live', 'LIVE')}
              </Badge>
              <span className="text-white font-medium text-sm sm:text-base truncate max-w-[120px] sm:max-w-none">{channel.name}</span>
              {isRecording && (
                <Badge className="bg-red-600 text-white flex items-center gap-1 text-xs sm:text-sm">
                  <Circle className="h-1.5 w-1.5 sm:h-2 sm:w-2 fill-current" />
                  {t('liveChannelBroadcast', 'rec', 'REC')}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 text-gray-300">
              <div className="relative">
                <button
                  onClick={() => setShowViewers(v => !v)}
                  className="flex items-center gap-1 hover:text-white transition-colors"
                  title={t('liveChannelBroadcast', 'seeWhosWatching', "See who's watching")}
                >
                  <Users className="h-4 w-4" />
                  <span>{viewerCount}</span>
                </button>
                {showViewers && (
                  <div className="absolute top-7 left-0 z-50 w-56 max-h-72 overflow-y-auto bg-gray-900/95 backdrop-blur-sm rounded-lg shadow-xl border border-white/10 text-sm">
                    <div className="px-3 py-2 border-b border-white/10 text-xs font-medium text-gray-400">
                      {t('liveChannelBroadcast', 'watchingNow', 'Watching now ({count})').replace('{count}', String(audienceViewers.length))}
                    </div>
                    {audienceViewers.length === 0 ? (
                      <div className="px-3 py-3 text-gray-500 text-xs">{t('liveChannelBroadcast', 'noViewersYet', 'No viewers yet.')}</div>
                    ) : (
                      <div className="py-1">
                        {audienceViewers.map(v => (
                          <div key={v.userId} className="px-3 py-1.5 flex items-center gap-2 text-gray-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500 flex-shrink-0" />
                            <span className="truncate">{v.userName}{v.isGuest ? t('liveChannelBroadcast', 'guestSuffix', ' (guest)') : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="text-sm">
                {formatDuration(dailyRoom.sessionDuration)}
              </div>
            </div>
          </div>

          {/* Video Container — host feed + active invited speakers */}
          <div
            ref={videoContainerRef}
            className="flex-1 relative bg-black flex items-center justify-center overflow-hidden"
          >
            {/* Live reactions — audience + host share the `channel.id` broadcast channel */}
            <MeetingReactionsLayer reactions={reactions} />
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50">
              <ReactionBar onReact={sendReaction} compact />
            </div>

            {/* Consent notice — AI notes transcribe every participant's mic */}
            <div className="absolute top-3 left-3 z-50">
              <MeetingNotesBanner active={notesActive} />
            </div>

            {(() => {
              const remoteSpeakers = dailyRoom.remoteParticipants.filter(
                p => activeSpeakers.has(p.id) && (p.hasVideo || p.hasAudio)
              );
              const showHostVideo = isVideoMode && dailyRoom.isCameraOn;

              if (!showHostVideo && remoteSpeakers.length === 0) {
                return (
                  <div className="text-center text-gray-500">
                    {channel.channel_logo_url ? (
                      <div className="relative">
                        <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-purple-500 mx-auto mb-4">
                          <img src={channel.channel_logo_url} alt={channel.name} className="w-full h-full object-cover" />
                        </div>
                      </div>
                    ) : (
                      <Mic className="h-24 w-24 mx-auto mb-4 text-purple-500" />
                    )}
                    <p className="text-xl text-white">{t('liveChannelBroadcast', 'audioOnlyBroadcast', 'Audio Only Broadcast')}</p>
                    <p className="text-gray-400">{t('liveChannelBroadcast', 'viewersCanHearYou', 'Your viewers can hear you')}</p>
                  </div>
                );
              }

              if (remoteSpeakers.length === 0) {
                // Host only, no remote speakers yet
                return (
                  <video
                    ref={dailyRoom.localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                );
              }

              // Host + speakers side-by-side
              return (
                <div className="w-full h-full flex gap-1 p-1">
                  <div className="flex-1 min-w-0 relative bg-gray-900 rounded-lg overflow-hidden">
                    {showHostVideo ? (
                      <video
                        ref={dailyRoom.localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {channel.channel_logo_url
                          ? <img src={channel.channel_logo_url} alt={channel.name} className="w-24 h-24 rounded-full object-cover border-4 border-purple-500" />
                          : <Mic className="h-16 w-16 text-purple-500" />
                        }
                      </div>
                    )}
                    <span className="absolute bottom-1 left-2 text-xs text-white bg-black/60 px-1.5 py-0.5 rounded">
                      👑 {t('liveChannelBroadcast', 'youHost', 'You (Host)')}
                    </span>
                  </div>
                  <div className={`flex flex-col gap-1 ${remoteSpeakers.length === 1 ? 'w-40' : 'w-48'}`}>
                    {remoteSpeakers.map(sp => (
                      <BroadcastSpeakerTile key={sp.sessionId} participant={sp} />
                    ))}
                  </div>
                </div>
              );
            })()}

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70"
            >
              {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </Button>

            {dailyRoom.connectionError && (
              <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                <div className="text-center text-white">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
                  <p className="text-lg mb-2">{t('liveChannelBroadcast', 'connectionError', 'Connection Error')}</p>
                  <p className="text-gray-400">{dailyRoom.connectionError}</p>
                </div>
              </div>
            )}
          </div>

          {/* Control Bar */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 px-2 sm:px-4 py-3 sm:py-4 bg-gray-800 border-t border-gray-700 flex-wrap">
            <Button
              variant={dailyRoom.isMicOn ? 'default' : 'destructive'}
              size="sm"
              onClick={dailyRoom.toggleMic}
              className="rounded-full px-3 sm:px-5 h-10 sm:h-12 flex items-center gap-2"
            >
              {dailyRoom.isMicOn ? <Mic className="h-4 w-4 sm:h-5 sm:w-5" /> : <MicOff className="h-4 w-4 sm:h-5 sm:w-5" />}
              <span className="hidden md:inline">{dailyRoom.isMicOn ? t('liveChannelBroadcast', 'mute', 'Mute') : t('liveChannelBroadcast', 'unmute', 'Unmute')}</span>
            </Button>

            {isVideoMode && (
              <Button
                variant={dailyRoom.isCameraOn ? 'default' : 'destructive'}
                size="sm"
                onClick={dailyRoom.toggleCamera}
                className="rounded-full px-3 sm:px-5 h-10 sm:h-12 flex items-center gap-2"
              >
                {dailyRoom.isCameraOn ? <Video className="h-4 w-4 sm:h-5 sm:w-5" /> : <VideoOff className="h-4 w-4 sm:h-5 sm:w-5" />}
                <span className="hidden md:inline">{dailyRoom.isCameraOn ? t('liveChannelBroadcast', 'stopVideo', 'Stop Video') : t('liveChannelBroadcast', 'startVideo', 'Start Video')}</span>
              </Button>
            )}

            <Button
              variant={dailyRoom.isScreenSharing ? 'default' : 'outline'}
              size="sm"
              onClick={dailyRoom.isScreenSharing ? dailyRoom.stopScreenShare : dailyRoom.startScreenShare}
              className="rounded-full px-3 sm:px-5 h-10 sm:h-12 flex items-center gap-2"
            >
              {dailyRoom.isScreenSharing ? <MonitorOff className="h-4 w-4 sm:h-5 sm:w-5" /> : <Monitor className="h-4 w-4 sm:h-5 sm:w-5" />}
              <span className="hidden md:inline">{dailyRoom.isScreenSharing ? t('liveChannelBroadcast', 'stopShare', 'Stop Share') : t('liveChannelBroadcast', 'shareScreen', 'Share Screen')}</span>
            </Button>

            {/* Recording is automatic (Mux) and fixed for the session — show its
                state, not a toggle. Change it in Broadcast setup before going live. */}
            <div
              title={isRecording ? t('liveChannelBroadcast', 'muxIsRecording', 'Mux is recording this broadcast') : t('liveChannelBroadcast', 'recordingIsOff', 'Recording is off for this broadcast')}
              className={`rounded-full px-3 sm:px-5 h-10 sm:h-12 flex items-center gap-2 border ${
                isRecording ? 'border-red-500 text-red-400' : 'border-gray-600 text-gray-400'
              }`}
            >
              <Circle className={`h-4 w-4 sm:h-5 sm:w-5 ${isRecording ? 'fill-current' : ''}`} />
              <span className="hidden md:inline">{isRecording ? t('liveChannelBroadcast', 'recording', 'Recording') : t('liveChannelBroadcast', 'notRecording', 'Not recording')}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowInvite(!showInvite)}
              className="rounded-full px-3 sm:px-5 h-10 sm:h-12 flex items-center gap-2"
            >
              <UserPlus className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden md:inline">{t('liveChannelBroadcast', 'invite', 'Invite')}</span>
            </Button>

            {/* AI Notes button — flickers while notes are being taken, so we don't
                need a big REC-style overlay sitting on the video. */}
            <Button
              variant={showAIPanel ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowAIPanel(!showAIPanel)}
              title={notesActive ? 'AI notes are being taken' : 'AI notes'}
              className={`rounded-full px-3 sm:px-5 h-10 sm:h-12 flex items-center gap-2 ${
                notesActive
                  ? 'bg-purple-600 hover:bg-purple-700 border-purple-400 ring-2 ring-purple-400 animate-pulse'
                  : showAIPanel
                  ? 'bg-purple-600 hover:bg-purple-700 border-purple-600'
                  : 'border-purple-400 text-purple-300 hover:bg-purple-900/30'
              }`}
            >
              <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden md:inline">
                {notesActive ? 'Notes' : t('liveChannelBroadcast', 'ai', 'AI')}
              </span>
            </Button>

            <Button
              variant="destructive"
              size="sm"
              onClick={endBroadcast}
              disabled={isEnding}
              className="rounded-full px-4 sm:px-6 h-10 sm:h-12 flex items-center gap-2 bg-red-600 hover:bg-red-700"
            >
              {isEnding ? (
                <>
                  <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                  <span className="hidden md:inline">{t('liveChannelBroadcast', 'ending', 'Ending...')}</span>
                </>
              ) : (
                <>
                  <PhoneOff className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="hidden md:inline">{t('liveChannelBroadcast', 'endBroadcast', 'End Broadcast')}</span>
                </>
              )}
            </Button>
          </div>

          {showInvite && (
            <div className="px-4 py-3 bg-gray-800 border-t border-gray-700">
              <div className="flex gap-2">
                <Input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={t('liveChannelBroadcast', 'enterEmailToInviteCoHost', 'Enter email to invite as co-host')}
                  className="flex-1 bg-gray-700 border-gray-600 text-white"
                />
                <Button onClick={inviteCoHost}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  {t('liveChannelBroadcast', 'invite', 'Invite')}
                </Button>
              </div>
            </div>
          )}

          {/* AI Notes panel. Kept MOUNTED once the broadcast has an id and merely
              hidden when collapsed — unmounting it would tear down the speech
              recogniser and silently stop note-taking. The pulsing AI button above
              is the "notes running" indicator. */}
          {broadcastId && (
            <div className={showAIPanel ? 'px-4 py-3 bg-gray-900 border-t border-purple-800' : 'hidden'}>
              <MeetingRecordingPanel
                meetingId={broadcastId}
                meetingTitle={`${channel.name} — Live Broadcast`}
                speakerName={profile?.full_name || user?.email?.split('@')[0] || 'Host'}
                userId={user?.id || ''}
                isHost={true}
                tableName="channel_broadcasts"
                enableRecording={isRecording}
                inCallOverlay={false}
                onStateChange={(s) => setNotesActive(s === 'recording')}
              />
            </div>
          )}
        </div>

        {/* Side Panel - Chat and Participants */}
        <div className="hidden lg:flex w-80 border-l border-gray-700 flex-col">
          <div className="flex-1 overflow-auto">
            <LiveChannelChat channelId={channel.id} isHost={true} broadcastId={broadcastId || undefined} />
          </div>

          {/* AI Insights quick-access button in side panel */}
          {broadcastId && (
            <div className="px-3 py-2 border-t border-gray-700">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-purple-300 hover:bg-purple-900/30 hover:text-purple-200 flex items-center gap-2"
                onClick={() => setShowInsightsDialog(true)}
              >
                <Sparkles className="h-4 w-4" />
                {t('liveChannelBroadcast', 'viewBroadcastInsights', 'View Broadcast Insights')}
              </Button>
            </div>
          )}
          
          {/* Inline Participant Management */}
          <div className="border-t border-gray-700">
            <Card className="bg-gray-800 border-0 rounded-none">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-white text-sm">
                    <Users className="h-4 w-4" />
                    {t('liveChannelBroadcast', 'participantsCount', 'Participants ({count})').replace('{count}', String(dailyRoom.participants.length))}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowParticipants(!showParticipants)}
                    className="h-6 w-6 p-0"
                  >
                    {showParticipants ? <Minimize className="h-3 w-3" /> : <Maximize className="h-3 w-3" />}
                  </Button>
                </div>
              </CardHeader>
              
              {showParticipants && (
                <CardContent className="pt-0">
                  {/* Raised Hands Section */}
                  {raisedHands.length > 0 && (
                    <div className="mb-3">
                      <h3 className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-2">
                        <Hand className="h-3 w-3 text-yellow-500 animate-bounce" />
                        {t('liveChannelBroadcast', 'raisedHandsCount', 'Raised Hands ({count})').replace('{count}', String(raisedHands.length))}
                      </h3>
                      <ScrollArea className="h-32">
                        <div className="space-y-2">
                          {raisedHands.map((hand) => (
                            <div
                              key={hand.id}
                              className="flex items-center justify-between p-2 bg-gray-700 rounded-lg"
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <Avatar className="h-6 w-6">
                                  {hand.avatar_url && <AvatarImage src={hand.avatar_url} />}
                                  <AvatarFallback className="text-xs">{hand.user_name.charAt(0).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <span className="text-xs text-white truncate">{hand.user_name}</span>
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  onClick={() => approveRaisedHand(hand.id, hand.user_id, hand.user_name)}
                                  disabled={loadingAction}
                                  className="h-6 w-6 p-0 bg-green-600 hover:bg-green-700"
                                >
                                  <UserPlus className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => denyRaisedHand(hand.id)}
                                  disabled={loadingAction}
                                  className="h-6 w-6 p-0"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  {/* All Participants Section */}
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 mb-2">{t('liveChannelBroadcast', 'allParticipants', 'All Participants')}</h3>
                    <ScrollArea className="h-48">
                      <div className="space-y-2">
                        {dailyRoom.participants.map((participant) => {
                          const isSpeaker = activeSpeakers.has(participant.id);
                          const isOwner = participant.isOwner;

                          return (
                            <div
                              key={participant.sessionId}
                              className="flex items-center justify-between p-2 bg-gray-700 rounded-lg"
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div className="flex items-center gap-1">
                                  {participant.hasAudio ? (
                                    <Mic className="h-3 w-3 text-green-500" />
                                  ) : (
                                    <MicOff className="h-3 w-3 text-gray-500" />
                                  )}
                                  {participant.hasVideo ? (
                                    <Video className="h-3 w-3 text-green-500" />
                                  ) : (
                                    <VideoOff className="h-3 w-3 text-gray-500" />
                                  )}
                                </div>
                                <span className="text-xs text-white truncate">{participant.userName}</span>
                                {isOwner && (
                                  <Badge className="bg-purple-600 h-4 px-1">
                                    <Crown className="h-2 w-2" />
                                  </Badge>
                                )}
                                {isSpeaker && !isOwner && (
                                  <Badge className="bg-blue-600 h-4 px-1 text-[10px]">
                                    {t('liveChannelBroadcast', 'speaker', 'Speaker')}
                                  </Badge>
                                )}
                              </div>
                              {!isOwner && (
                                <div className="flex gap-1">
                                  {isSpeaker && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => muteSpeaker(participant.sessionId, participant.hasAudio)}
                                      disabled={loadingAction}
                                      className={`h-6 w-6 p-0 ${participant.hasAudio ? 'text-green-400 hover:text-red-400' : 'text-gray-400 hover:text-green-400'}`}
                                      title={participant.hasAudio ? t('liveChannelBroadcast', 'muteSpeaker', 'Mute speaker') : t('liveChannelBroadcast', 'unmuteSpeaker', 'Unmute speaker')}
                                    >
                                      {participant.hasAudio
                                        ? <Mic className="h-3 w-3" />
                                        : <MicOff className="h-3 w-3" />}
                                    </Button>
                                  )}
                                  {isSpeaker ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => removeSpeaker(participant.id)}
                                      disabled={loadingAction}
                                      className="h-6 w-6 p-0 border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                                    >
                                      <UserMinus className="h-3 w-3" />
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      onClick={() => inviteToSpeak(participant.id, participant.userName)}
                                      disabled={loadingAction}
                                      className="h-6 w-6 p-0 bg-blue-600 hover:bg-blue-700"
                                    >
                                      <UserPlus className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* AI Broadcast Insights Dialog */}
      <Dialog open={showInsightsDialog} onOpenChange={setShowInsightsDialog}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              {t('liveChannelBroadcast', 'broadcastInsightsTitle', 'Broadcast Insights — {name}').replace('{name}', String(channel.name))}
            </DialogTitle>
            <DialogDescription>
              {t('liveChannelBroadcast', 'broadcastInsightsDesc', 'AI-generated summary, action items, and insights from this broadcast session.')}
            </DialogDescription>
          </DialogHeader>
          {broadcastId && (
            <SavedMeetingInsights
              meetingTitle={`${channel.name} — Live Broadcast`}
              meetingId={broadcastId}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default LiveChannelBroadcast;