import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { useUserEntitlements } from '@rekindle/auth/useUserEntitlements';
import { supabase } from '@rekindle/supabase';
import { useDailyRoom } from '../useDailyRoom';
import { 
  postLiveChannelJoined,
  postLiveChannelEventAttended
} from '@rekindle/features/communityActivityService';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { LiveChannelChat } from './LiveChannelChat';
import { HlsPlayer } from './HlsPlayer';
import { useMeetingPresence } from '../useMeetingPresence';
import { useMeetingReactions } from '../useMeetingReactions';
import { MeetingReactionsLayer, ReactionBar } from './MeetingReactions';
import ReplayAccessGate from '@rekindle/features/components/ReplayAccessGate';
import {
  Radio,
  RadioTower,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Users,
  Heart,
  HeartOff,
  Maximize,
  Minimize,
  Volume2,
  VolumeX,
  X,
  Loader2,
  AlertCircle,
  Bell,
  Download,
  Lock,
  UserPlus,
  VideoIcon,
  Hand
} from 'lucide-react';
import { toast } from '@rekindle/ui/use-toast';
import { ShareChannelButton } from './ShareChannelButton';
import { LiveChannel } from '@rekindle/types/liveChannelTypes';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@rekindle/ui/dialog';

interface LiveChannelViewerProps {
  channel: LiveChannel;
  onLeave: () => void;
  isFollowing?: boolean;
  onToggleFollow?: () => void;
  context?: "main" | "ministry";
  allowDownloads?: boolean;
  /** Open this channel's recordings (past broadcasts / replays). */
  onViewRecordings?: () => void;
}

// ── SpeakerVideoTile ─────────────────────────────────────────────────────────
// Renders a single remote participant's video+audio track.
// Used by LiveChannelViewer to show all active speakers (host + invited).
const SpeakerVideoTile: React.FC<{
  participant: { sessionId: string; userName: string; isOwner: boolean; hasVideo: boolean; hasAudio: boolean; videoTrack?: MediaStreamTrack; audioTrack?: MediaStreamTrack };
  muted: boolean;
  isLarge?: boolean;
}> = ({ participant, muted, isLarge = false }) => {
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
      audioRef.current.muted = muted;
      audioRef.current.play().catch(() => {});
    }
  }, [participant.audioTrack, participant.hasAudio, muted]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  return (
    <div className={`relative bg-gray-900 rounded-lg overflow-hidden ${isLarge ? 'w-full h-full' : 'aspect-video'}`}>
      <audio ref={audioRef} autoPlay className="hidden" />
      {participant.hasVideo ? (
        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-700 to-indigo-800">
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-white text-xl font-bold mx-auto mb-2">
              {participant.userName.charAt(0).toUpperCase()}
            </div>
            <p className="text-white text-xs">{participant.userName}</p>
          </div>
        </div>
      )}
      <div className="absolute bottom-1 left-2 flex items-center gap-1">
        <span className="text-white text-xs bg-black/60 px-1.5 py-0.5 rounded">
          {participant.isOwner ? '👑 ' : ''}{participant.userName}
        </span>
        {!participant.hasAudio && (
          <MicOff className="h-3 w-3 text-red-400" />
        )}
      </div>
    </div>
  );
};

export const LiveChannelViewer: React.FC<LiveChannelViewerProps> = ({
  channel,
  onLeave,
  isFollowing = false,
  onToggleFollow,
  context = "main",
  allowDownloads = false,
  onViewRecordings
}) => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const entitlements = useUserEntitlements();
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [viewerCount, setViewerCount] = useState(channel.viewer_count);
  const [hasPostedJoin, setHasPostedJoin] = useState(false);
  const [replayAvailable, setReplayAvailable] = useState(false);
  const [replayUrl, setReplayUrl] = useState<string | null>(null);
  
  // Speaker invitation state
  const [pendingInvitation, setPendingInvitation] = useState<any>(null);
  const [showInvitationDialog, setShowInvitationDialog] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [acceptingInvitation, setAcceptingInvitation] = useState(false);

  // Raised hand state
  const [hasRaisedHand, setHasRaisedHand] = useState(false);
  const [raisingHand, setRaisingHand] = useState(false);
  const [currentBroadcastId, setCurrentBroadcastId] = useState<string | null>(null);

  const videoContainerRef = useRef<HTMLDivElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  
  const canAccessReplays = entitlements.canAccessReplays;
  const canDownloadReplays = entitlements.canAccessReplays;

  // FIXED: Initialize Daily room as viewer with strict viewer-only mode
  const dailyRoom = useDailyRoom({
    roomName: channel.daily_room_name || `channel-${channel.id}`,
    userName: profile?.full_name || user?.email?.split('@')[0] || 'Viewer',
    userId: user?.id || 'anonymous',
    isHost: false,
    // CRITICAL: Enable viewer-only mode to prevent automatic media access
    viewerOnlyMode: true,
    channelId: channel.id,   // scope speaker permission checks to this channel
    onParticipantJoined: () => {
      setViewerCount(prev => prev + 1);
    },
    onParticipantLeft: () => {
      setViewerCount(prev => Math.max(0, prev - 1));
    }
  });

  // HLS delivery: if the channel has a Cloudflare playback URL, plain viewers
  // watch the HLS stream instead of joining the Daily room (no participant cost).
  // Speakers still join Daily so they can talk. Channels without an HLS URL keep
  // the old participant-based behaviour as a fallback.
  const [ministryBanner, setMinistryBanner] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (context !== 'ministry') return;
    const mid = (channel as any).ministry_id;
    if (!mid) return;
    let active = true;
    supabase.from('ministries').select('banner').eq('id', mid).maybeSingle()
      .then(({ data }) => { if (active && (data as any)?.banner) setMinistryBanner((data as any).banner); });
    return () => { active = false; };
  }, [context, (channel as any).ministry_id]);

  // Live state can change after the viewer opens (host goes live, HLS url gets
  // written). Track those fields locally and patch them from the realtime
  // subscription so the viewer switches to the stream without a manual reload.
  const [livePatch, setLivePatch] = useState<{ is_live?: boolean; hls_playback_url?: string | null; is_hls_live?: boolean }>({});
  useEffect(() => { setLivePatch({}); }, [channel.id]);
  const isLive = livePatch.is_live ?? channel.is_live;
  const isHlsLive = livePatch.is_hls_live ?? (channel as any).is_hls_live;
  const hlsPlaybackUrl = (livePatch.hls_playback_url ?? (channel as any).hls_playback_url) as string | undefined;
  // Mux poster: https://stream.mux.com/<id>.m3u8 → https://image.mux.com/<id>/thumbnail.jpg
  const muxPoster = (() => {
    const m = hlsPlaybackUrl?.match(/stream\.mux\.com\/([^/.]+)\.m3u8/);
    return m ? `https://image.mux.com/${m[1]}/thumbnail.jpg` : undefined;
  })();
  // Offline poster: ministry banner (from the ministry record) for ministry
  // channels, else the main-app featured image, then the logo, then Mux.
  const posterUrl = ministryBanner
    || (channel as any).banner
    || (channel as any).featured_image_url
    || (channel as any).channel_logo_url
    || muxPoster;
  // On LiveKit, viewers subscribe to the broadcast over WebRTC (sub-second latency,
  // and they see the host directly from the room) instead of the ~6s HLS path — a
  // normal low-latency live stream/webinar. This also ignores any stale Mux
  // hls_playback_url left over from a previous Daily/Mux broadcast. HLS Egress still
  // runs for recording/VOD (and can front huge audiences later), but the LIVE view
  // is WebRTC. On Daily/Mux, keep the original HLS-when-live behaviour.
  // LiveKit-only: the live view is always WebRTC (no legacy Mux/Daily HLS-when-live
  // path). HLS Egress still runs for recording/VOD; the LIVE view never uses it.
  const watchViaHls = false;

  // Join the channel's live presence so the host can see/count this viewer — even
  // when watching via HLS (no Daily room). Mirrors the meetings presence layer.
  const guestPresenceIdRef = useRef('guest-' + Math.random().toString(36).slice(2));
  const presenceId = user?.id || guestPresenceIdRef.current;
  const presenceName = profile?.full_name || user?.email?.split('@')[0] || 'Viewer';
  useMeetingPresence(channel.id, presenceId, presenceName, !user?.id, isLive);

  // Live reactions — same `channel.id` broadcast channel the host publishes on, so
  // audience emojis float on the host's screen and vice-versa. Works on HLS too,
  // since the transport is Supabase realtime, not the video pipeline.
  const { floating: reactions, sendReaction } = useMeetingReactions(channel.id, true);

  // Join the broadcast on mount — but only when NOT watching via HLS.
  useEffect(() => {
    if (!isLive) return;
    if (watchViaHls) {
      // Watching the HLS stream; make sure we're not also in the Daily room.
      if (dailyRoom.isConnected) dailyRoom.leaveRoom();
      return;
    }
    if (!dailyRoom.isConnected && !dailyRoom.isConnecting) {
      console.log('[LiveChannelViewer] Joining Daily room (speaker or no HLS configured)');
      dailyRoom.joinRoom();
    }
  }, [isLive, watchViaHls]);

  // FIXED: Track current broadcast ID for proper chat session management
  useEffect(() => {
    const fetchCurrentBroadcast = async () => {
      if (channel.is_live) {
        const { data, error } = await supabase
          .from('channel_broadcasts')
          .select('id')
          .eq('channel_id', channel.id)
          .is('ended_at', null)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          console.log('[LiveChannelViewer] Current broadcast ID:', data.id);
          setCurrentBroadcastId(data.id);
        }
      } else {
        setCurrentBroadcastId(null);
      }
    };

    fetchCurrentBroadcast();

    // Subscribe to broadcast changes
    const broadcastSub = supabase
      .channel(`broadcasts-${channel.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'channel_broadcasts',
          filter: `channel_id=eq.${channel.id}`
        },
        (payload) => {
          console.log('[LiveChannelViewer] Broadcast changed:', payload);
          fetchCurrentBroadcast();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(broadcastSub);
    };
  }, [channel.id, channel.is_live]);

  // Check for available replays
  useEffect(() => {
    const checkReplays = async () => {
      if (!channel.is_live && channel.replayAccessLevel && channel.replayAccessLevel !== 'none') {
        const { data: broadcasts } = await supabase
          .from('channel_broadcasts')
          .select('*')
          .eq('channel_id', channel.id)
          .eq('recording_status', 'completed')
          .order('started_at', { ascending: false })
          .limit(1);
        
        if (broadcasts && broadcasts.length > 0 && broadcasts[0].recording_url) {
          setReplayAvailable(true);
          setReplayUrl(broadcasts[0].recording_url);
        }
      }
    };
    
    checkReplays();
  }, [channel.id, channel.is_live, channel.replayAccessLevel]);

  // Attach remote video/audio tracks — host + all active speakers
  useEffect(() => {
    // We handle track attachment per-participant via SpeakerVideoTile below
    // This effect only handles the legacy single-ref audio for non-video broadcasts
    const hostParticipant = dailyRoom.remoteParticipants.find(p => p.isOwner);
    if (hostParticipant?.audioTrack && remoteAudioRef.current && !channel.is_video_enabled) {
      const stream = new MediaStream([hostParticipant.audioTrack]);
      remoteAudioRef.current.srcObject = stream;
      remoteAudioRef.current.muted = isMuted;
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [dailyRoom.remoteParticipants, isMuted, channel.is_video_enabled]);

  // Subscribe to channel updates
  useEffect(() => {
    const channelSub = supabase
      .channel(`channel-${channel.id}`, {
        config: {
          broadcast: { self: true }
        }
      })
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_channels',
          filter: `id=eq.${channel.id}`
        },
        (payload) => {
          const updated = payload.new as LiveChannel;
          setViewerCount(updated.viewer_count);
          setLivePatch({ is_live: updated.is_live, hls_playback_url: (updated as any).hls_playback_url, is_hls_live: (updated as any).is_hls_live });

          if (!updated.is_live) {
            toast({
              title: t('liveChannelViewer', 'broadcastEndedTitle', 'Broadcast Ended'),
              description: t('liveChannelViewer', 'broadcastEndedDesc', 'The host has ended the broadcast')
            });
            handleLeave();
          }
        }
      )
      .subscribe((status) => {
        console.log('[LiveChannelViewer] Channel subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channelSub);
    };
  }, [channel.id]);

  // Post channel join activity
  useEffect(() => {
    if (channel && user && profile && !hasPostedJoin) {
      const postJoin = async () => {
        try {
          await postLiveChannelJoined(
            user.id,
            profile.full_name || profile.email || 'Anonymous',
            profile.avatar_url,
            channel.id,
            channel.name
          );
          setHasPostedJoin(true);
        } catch (error) {
          console.error('Error posting channel join:', error);
        }
      };
      postJoin();
    }
  }, [channel, user, profile]);

  // FIXED: Monitor speaker status with real-time updates
  useEffect(() => {
    if (!user) return;

    const checkSpeakerStatus = async () => {
      const { data: speakerData } = await supabase
        .from('live_channel_speakers')
        .select('*')
        .eq('channel_id', channel.id)
        .eq('user_id', user.id)
        .maybeSingle();

      const wasSpeaker = isSpeaker;
      const nowSpeaker = !!speakerData;
      
      setIsSpeaker(nowSpeaker);

      // FIXED: If speaker status was removed, disable media access
      if (wasSpeaker && !nowSpeaker) {
        console.log('[LiveChannelViewer] Speaker status removed, disabling media');
        if (dailyRoom.isMicOn) await dailyRoom.toggleMic();
        if (dailyRoom.isCameraOn) await dailyRoom.toggleCamera();
        
        toast({
          title: t('liveChannelViewer', 'speakerStatusRemovedTitle', 'Speaker Status Removed'),
          description: t('liveChannelViewer', 'speakerStatusRemovedDesc', 'You are now in viewer-only mode'),
          variant: 'default'
        });
      }
    };

    checkSpeakerStatus();

    // FIXED: Subscribe to speaker changes with real-time updates
    const speakerChannel = supabase
      .channel(`viewer-speaker-status-${user.id}-${channel.id}`, {
        config: {
          broadcast: { self: true }
        }
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_channel_speakers',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('[LiveChannelViewer] Speaker status change:', payload);
          checkSpeakerStatus();
        }
      )
      .subscribe((status) => {
        console.log('[LiveChannelViewer] Speaker subscription status:', status);
      });

    return () => {
      supabase.removeChannel(speakerChannel);
    };
  }, [user, channel.id, isSpeaker, dailyRoom]);

  // FIXED: Monitor speaker invitations with real-time updates
  useEffect(() => {
    if (!user) return;

    const checkInvitationStatus = async () => {
      const { data: invitation } = await supabase
        .from('live_channel_speaker_invitations')
        .select('*')
        .eq('channel_id', channel.id)
        .eq('invitee_id', user.id)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (invitation && !showInvitationDialog) {
        console.log('[LiveChannelViewer] New speaker invitation received');
        setPendingInvitation(invitation);
        setShowInvitationDialog(true);
      }
    };

    checkInvitationStatus();

    // FIXED: Subscribe to invitation changes with real-time updates
    const invitationChannel = supabase
      .channel(`speaker-invitations-viewer-${user.id}-${channel.id}`, {
        config: {
          broadcast: { self: true }
        }
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_channel_speaker_invitations',
          filter: `invitee_id=eq.${user.id}`
        },
        (payload) => {
          console.log('[LiveChannelViewer] New invitation received:', payload);
          if (payload.new.channel_id === channel.id && payload.new.status === 'pending') {
            setPendingInvitation(payload.new);
            setShowInvitationDialog(true);
            
            toast({
              title: t('liveChannelViewer', 'invitationToSpeakTitle', 'Invitation to Speak'),
              description: t('liveChannelViewer', 'invitationToSpeakToastDesc', 'The host has invited you to speak'),
              duration: 5000
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('[LiveChannelViewer] Invitation subscription status:', status);
      });

    return () => {
      supabase.removeChannel(invitationChannel);
    };
  }, [user, channel.id, showInvitationDialog]);

  // FIXED: Monitor raised hand status with real-time updates
  useEffect(() => {
    if (!user) return;

    const checkRaisedHandStatus = async () => {
      const { data: myHand } = await supabase
        .from('live_channel_raised_hands')
        .select('*')
        .eq('channel_id', channel.id)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .maybeSingle();

      const wasRaised = hasRaisedHand;
      const nowRaised = !!myHand;
      
      setHasRaisedHand(nowRaised);

      // FIXED: Notify user if hand was lowered by host
      if (wasRaised && !nowRaised) {
        console.log('[LiveChannelViewer] Raised hand status removed');
      }
    };

    checkRaisedHandStatus();

    // FIXED: Subscribe to raised hand changes with real-time updates
    const handChannel = supabase
      .channel(`my-raised-hand-viewer-${user.id}-${channel.id}`, {
        config: {
          broadcast: { self: true }
        }
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_channel_raised_hands',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('[LiveChannelViewer] Raised hand change:', payload);
          checkRaisedHandStatus();
          
          // FIXED: Notify when hand status changes
          if (payload.eventType === 'UPDATE') {
            const status = (payload.new as any).status;
            if (status === 'approved') {
              toast({
                title: t('liveChannelViewer', 'requestApprovedTitle', 'Request Approved!'),
                description: t('liveChannelViewer', 'requestApprovedDesc', 'The host has approved your request to speak'),
                duration: 5000
              });
            } else if (status === 'denied') {
              toast({
                title: t('liveChannelViewer', 'requestDeniedTitle', 'Request Denied'),
                description: t('liveChannelViewer', 'requestDeniedDesc', 'The host has denied your request'),
                variant: 'default'
              });
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[LiveChannelViewer] Raised hand subscription status:', status);
      });

    return () => {
      supabase.removeChannel(handChannel);
    };
  }, [user, channel.id, hasRaisedHand]);

  // FIXED: Accept speaker invitation with proper media permission handling
  const acceptInvitation = async () => {
    if (!user || !pendingInvitation) return;

    setAcceptingInvitation(true);
    try {
      console.log('[LiveChannelViewer] Accepting speaker invitation...');
      
      toast({
        title: t('liveChannelViewer', 'requestingPermissionsTitle', 'Requesting Permissions'),
        description: channel.is_video_enabled
          ? t('liveChannelViewer', 'requestingPermissionsDescMicCamera', 'Please allow access to your microphone and camera')
          : t('liveChannelViewer', 'requestingPermissionsDescMic', 'Please allow access to your microphone'),
      });

      // Request OS-level media permissions first — this must happen before Daily enables tracks
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: channel.is_video_enabled 
      });
      // Stop the test stream — Daily will open its own after setLocalAudio/setLocalVideo
      stream.getTracks().forEach(track => track.stop());

      console.log('[LiveChannelViewer] Media permissions granted');

      // Mark invitation accepted in DB — this also triggers the live_channel_speakers
      // Realtime subscription in useDailyRoom to set hasSpeakerPermission=true,
      // but that fires async. We call enableSpeakerMedia() directly to avoid the race.
      await supabase
        .from('live_channel_speaker_invitations')
        .update({ status: 'accepted' })
        .eq('id', pendingInvitation.id);

      // FIXED: Use enableSpeakerMedia() which bypasses the permission gate and directly
      // calls setLocalAudio(true) / setLocalVideo(true) on the Daily call object.
      await dailyRoom.enableSpeakerMedia(channel.is_video_enabled);

      setIsSpeaker(true);
      setShowInvitationDialog(false);
      setPendingInvitation(null);
      
      // Clear raised hand if it exists
      if (hasRaisedHand) {
        await supabase
          .from('live_channel_raised_hands')
          .delete()
          .eq('channel_id', channel.id)
          .eq('user_id', user.id);
        setHasRaisedHand(false);
      }

      toast({
        title: t('liveChannelViewer', 'youCanNowSpeakTitle', 'You can now speak!'),
        description: channel.is_video_enabled
          ? t('liveChannelViewer', 'mediaEnabledDescMicCamera', 'Your microphone and camera are now enabled')
          : t('liveChannelViewer', 'mediaEnabledDescMic', 'Your microphone is now enabled'),
      });
    } catch (err: any) {
      console.error('Failed to accept invitation:', err);
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast({
          title: t('liveChannelViewer', 'permissionDeniedTitle', 'Permission Denied'),
          description: channel.is_video_enabled
            ? t('liveChannelViewer', 'permissionDeniedDescMicCamera', 'Please allow microphone and camera access to speak')
            : t('liveChannelViewer', 'permissionDeniedDescMic', 'Please allow microphone access to speak'),
          variant: 'destructive'
        });
      } else {
        toast({
          title: t('liveChannelViewer', 'errorTitle', 'Error'),
          description: t('liveChannelViewer', 'failedEnableMediaDesc', 'Failed to enable media devices'),
          variant: 'destructive'
        });
      }

      if (pendingInvitation) {
        await supabase
          .from('live_channel_speaker_invitations')
          .update({ status: 'declined' })
          .eq('id', pendingInvitation.id);
      }
    } finally {
      setAcceptingInvitation(false);
    }
  };

  // Decline speaker invitation
  const declineInvitation = async () => {
    if (!pendingInvitation) return;

    try {
      await supabase
        .from('live_channel_speaker_invitations')
        .update({ status: 'declined' })
        .eq('id', pendingInvitation.id);

      setShowInvitationDialog(false);
      setPendingInvitation(null);

      toast({
        title: t('liveChannelViewer', 'invitationDeclinedTitle', 'Invitation Declined'),
        description: t('liveChannelViewer', 'invitationDeclinedDesc', 'You remain in viewer-only mode'),
      });
    } catch (err) {
      console.error('Failed to decline invitation:', err);
    }
  };

  // FIXED: Raise hand to request permission to speak
  const raiseHand = async () => {
    if (!user || hasRaisedHand) return;

    setRaisingHand(true);
    try {
      const { error } = await supabase
        .from('live_channel_raised_hands')
        .insert({
          channel_id: channel.id,
          user_id: user.id,
          user_name: profile?.full_name || user.email?.split('@')[0] || 'Viewer',
          avatar_url: profile?.avatar_url,
          status: 'pending'
        });

      if (error) throw error;

      setHasRaisedHand(true);
      toast({
        title: t('liveChannelViewer', 'handRaisedTitle', 'Hand Raised'),
        description: t('liveChannelViewer', 'handRaisedDesc', 'The host will be notified of your request to speak')
      });
    } catch (err) {
      console.error('Failed to raise hand:', err);
      toast({
        title: t('liveChannelViewer', 'errorTitle', 'Error'),
        description: t('liveChannelViewer', 'failedRaiseHandDesc', 'Failed to raise hand'),
        variant: 'destructive'
      });
    } finally {
      setRaisingHand(false);
    }
  };

  // FIXED: Lower hand
  const lowerHand = async () => {
    if (!user || !hasRaisedHand) return;

    setRaisingHand(true);
    try {
      const { error } = await supabase
        .from('live_channel_raised_hands')
        .delete()
        .eq('channel_id', channel.id)
        .eq('user_id', user.id)
        .eq('status', 'pending');

      if (error) throw error;

      setHasRaisedHand(false);
      toast({
        title: t('liveChannelViewer', 'handLoweredTitle', 'Hand Lowered'),
        description: t('liveChannelViewer', 'handLoweredDesc', 'Your request has been cancelled')
      });
    } catch (err) {
      console.error('Failed to lower hand:', err);
      toast({
        title: t('liveChannelViewer', 'errorTitle', 'Error'),
        description: t('liveChannelViewer', 'failedLowerHandDesc', 'Failed to lower hand'),
        variant: 'destructive'
      });
    } finally {
      setRaisingHand(false);
    }
  };

  // Handle leave
  const handleLeave = async () => {
    await dailyRoom.leaveRoom();
    onLeave();
  };

  // Handle download replay
  const handleDownloadReplay = () => {
    if (!replayUrl) return;
    
    const a = document.createElement('a');
    a.href = replayUrl;
    a.download = `${channel.name}-replay-${new Date().toISOString().split('T')[0]}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    toast({
      title: t('liveChannelViewer', 'downloadStartedTitle', 'Download Started'),
      description: t('liveChannelViewer', 'downloadStartedDesc', 'Replay download has started')
    });
  };

  const toggleFullscreen = () => {
    if (!videoContainerRef.current) return;

    if (!isFullscreen) {
      videoContainerRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !isMuted;
    }
  };

  // Loading state
  if (dailyRoom.isConnecting || dailyRoom.isJoining) {
    return (
      <div className="min-h-[400px] sm:min-h-[500px] lg:min-h-[600px] bg-gray-900 rounded-xl flex items-center justify-center">
        <div className="text-center text-white">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-purple-500" />
          <p className="text-lg">{t('liveChannelViewer', 'joiningBroadcast', 'Joining broadcast...')}</p>
          <p className="text-gray-400 text-sm mt-2">{channel.name}</p>
        </div>
      </div>
    );
  }

  // Error state
  if (dailyRoom.connectionError) {
    return (
      <div className="min-h-[400px] sm:min-h-[500px] lg:min-h-[600px] bg-gray-900 rounded-xl flex items-center justify-center">
        <div className="text-center text-white max-w-md">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
          <p className="text-lg mb-2">{t('liveChannelViewer', 'connectionFailed', 'Connection Failed')}</p>
          <p className="text-gray-400 mb-4">{dailyRoom.connectionError}</p>
          <div className="flex gap-3 justify-center">
            <Button
              variant="outline"
              onClick={onLeave}
              className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              {t('liveChannelViewer', 'goBack', 'Go Back')}
            </Button>
            <Button onClick={() => dailyRoom.joinRoom()}>
              {t('liveChannelViewer', 'tryAgain', 'Try Again')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Not live - show replay gate if available
  if (!channel.is_live && replayAvailable && channel.replayAccessLevel && channel.replayAccessLevel !== 'none') {
    return (
      <ReplayAccessGate
        channel={channel}
        replayUrl={replayUrl}
        userSubscriptionTier={entitlements.hasMinistryAccess ? 'ministry' : entitlements.isPartner ? 'partner' : 'free'}
        onClose={onLeave}
        allowDownload={canDownloadReplays && allowDownloads}
      />
    );
  }

  // Not live - no replay
  if (!isLive && !dailyRoom.isConnected) {
    return (
      <div className="min-h-[400px] sm:min-h-[500px] lg:min-h-[600px] bg-gray-900 rounded-xl flex items-center justify-center">
        <div className="text-center text-white">
          <RadioTower className="h-16 w-16 mx-auto mb-4 text-gray-500" />
          <p className="text-lg mb-2">{t('liveChannelViewer', 'channelOffline', 'Channel Offline')}</p>
          <p className="text-gray-400 mb-6">{t('liveChannelViewer', 'channelNotLive', '{name} is not currently live').replace('{name}', String(channel.name))}</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button
              variant="outline"
              onClick={onLeave}
              className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              {t('liveChannelViewer', 'goBack', 'Go Back')}
            </Button>
            {onViewRecordings && (
              <Button onClick={onViewRecordings} className="bg-purple-600 hover:bg-purple-700 text-white">
                <Video className="h-4 w-4 mr-2" />
                {t('liveChannelViewer', 'watchRecordings', 'Watch Recordings')}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden">
      <div className="flex flex-col md:flex-row">
        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Video Container — renders all remote participants (host + invited speakers) */}
          <div
            ref={videoContainerRef}
            className="aspect-video bg-black relative flex items-center justify-center overflow-hidden"
          >
            {/* Live reactions — same channel.id broadcast channel as the host */}
            <MeetingReactionsLayer reactions={reactions} />
            {isLive && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-50">
                <ReactionBar onReact={sendReaction} compact />
              </div>
            )}

            {watchViaHls ? (
              <HlsPlayer src={hlsPlaybackUrl!} muted={isMuted} poster={posterUrl} className="w-full h-full" />
            ) : channel.is_video_enabled ? (() => {
              // All remote participants who have video OR audio (show avatar for audio-only speakers)
              const visibleParticipants = dailyRoom.remoteParticipants.filter(
                p => p.isOwner || p.hasVideo || p.hasAudio
              );

              if (visibleParticipants.length === 0) {
                return (
                  <div className="text-center text-gray-500">
                    <Loader2 className="h-10 w-10 animate-spin mx-auto mb-3 text-purple-500" />
                    <p className="text-white">{t('liveChannelViewer', 'waitingForHost', 'Waiting for host…')}</p>
                  </div>
                );
              }

              if (visibleParticipants.length === 1) {
                return (
                  <SpeakerVideoTile
                    participant={visibleParticipants[0]}
                    muted={isMuted}
                    isLarge
                  />
                );
              }

              // Grid layout: host takes ~60% width, speakers share the remainder
              const [hostP, ...speakerPs] = visibleParticipants;
              return (
                <div className="w-full h-full flex gap-1 p-1">
                  {/* Main / host feed */}
                  <div className="flex-1 min-w-0">
                    <SpeakerVideoTile participant={hostP} muted={isMuted} isLarge />
                  </div>
                  {/* Speaker strip on the right */}
                  <div className={`flex flex-col gap-1 ${speakerPs.length === 1 ? 'w-24 sm:w-40' : 'w-28 sm:w-48'}`}>
                    {speakerPs.map(sp => (
                      <div key={sp.sessionId} className="flex-1 min-h-0">
                        <SpeakerVideoTile participant={sp} muted={isMuted} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })() : (
              <div className="text-center text-gray-500">
                <div className="relative">
                  {channel.channel_logo_url ? (
                    <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-purple-500 mx-auto mb-4">
                      <img src={channel.channel_logo_url} alt={channel.name} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center mx-auto mb-4">
                      <Mic className="h-16 w-16 text-white" />
                    </div>
                  )}
                </div>
                <p className="text-xl text-white mt-4">{channel.owner_name || t('liveChannelViewer', 'hostFallback', 'Host')}</p>
                <p className="text-gray-400">{t('liveChannelViewer', 'audioBroadcast', 'Audio Broadcast')}</p>
              </div>
            )}

            {/* Hidden audio element for audio-only broadcasts */}
            <audio ref={remoteAudioRef} autoPlay className="hidden" />

            {/* Live Indicator */}
            <div className="absolute top-4 left-4 flex items-center gap-4">
              <Badge className="bg-red-600 px-3 py-1">
                <Radio className="h-3 w-3 mr-2 animate-pulse" />
                {t('liveChannelViewer', 'liveBadge', 'LIVE')}
              </Badge>
              <div className="flex items-center gap-2 bg-black/50 px-3 py-1 rounded-full text-white">
                <Users className="h-4 w-4" />
                <span>{t('liveChannelViewer', 'viewersCount', '{count} viewers').replace('{count}', String(viewerCount))}</span>
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70"
            >
              {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              className="absolute bottom-4 right-4 text-white bg-black/50 hover:bg-black/70"
            >
              {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </Button>
          </div>

          {/* Bottom Bar */}
          <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-3 px-4 py-3 bg-gray-800 border-t border-gray-700">
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 min-w-0">
              <div className="flex items-center gap-2">
                {channel.channel_logo_url ? (
                  <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-purple-500">
                    <img src={channel.channel_logo_url} alt={channel.name} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center text-white font-bold">
                    {channel.owner_name?.charAt(0) || 'H'}
                  </div>
                )}
                <div>
                  <p className="text-white font-medium">{channel.owner_name || t('liveChannelViewer', 'hostFallback', 'Host')}</p>
                  <p className="text-gray-400 text-sm">{t('liveChannelViewer', 'followersCount', '{count} followers').replace('{count}', String(channel.total_followers))}</p>
                </div>
              </div>

              {/* Speaker mic/camera controls — only shown when this viewer is an active speaker */}
              {isSpeaker && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={dailyRoom.isMicOn ? 'default' : 'destructive'}
                    onClick={dailyRoom.toggleMic}
                    className="rounded-full h-9 w-9 p-0"
                    title={dailyRoom.isMicOn ? t('liveChannelViewer', 'muteTitle', 'Mute') : t('liveChannelViewer', 'unmuteTitle', 'Unmute')}
                  >
                    {dailyRoom.isMicOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                  </Button>
                  {channel.is_video_enabled && (
                    <Button
                      size="sm"
                      variant={dailyRoom.isCameraOn ? 'default' : 'destructive'}
                      onClick={dailyRoom.toggleCamera}
                      className="rounded-full h-9 w-9 p-0"
                      title={dailyRoom.isCameraOn ? t('liveChannelViewer', 'stopCameraTitle', 'Stop Camera') : t('liveChannelViewer', 'startCameraTitle', 'Start Camera')}
                    >
                      {dailyRoom.isCameraOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              )}

              {onToggleFollow && (
                <Button
                  variant={isFollowing ? 'outline' : 'default'}
                  size="sm"
                  onClick={onToggleFollow}
                  className={isFollowing ? 'border-purple-500 text-purple-400' : 'bg-purple-600 hover:bg-purple-700'}
                >
                  {isFollowing ? (
                    <>
                      <HeartOff className="h-4 w-4 mr-2" />
                      {t('liveChannelViewer', 'unfollow', 'Unfollow')}
                    </>
                  ) : (
                    <>
                      <Heart className="h-4 w-4 mr-2" />
                      {t('liveChannelViewer', 'follow', 'Follow')}
                    </>
                  )}
                </Button>
              )}

              <ShareChannelButton channel={channel} variant="button" triggerClassName="border-gray-600" />
            </div>

            <div className="flex items-center gap-2">
              {allowDownloads && replayAvailable && replayUrl && !channel.is_live && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadReplay}
                  className="border-green-500 text-green-400 hover:bg-green-500 hover:text-white"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {t('liveChannelViewer', 'downloadReplay', 'Download Replay')}
                </Button>
              )}
              
              <Button
                variant="destructive"
                size="sm"
                onClick={handleLeave}
              >
                <X className="h-4 w-4 mr-2" />
                {t('liveChannelViewer', 'leave', 'Leave')}
              </Button>
            </div>
          </div>
        </div>

        {/* Side Chat */}
        {showChat && (
          <div className="w-full md:w-80 md:flex-shrink-0 border-t md:border-t-0 md:border-l border-gray-700 flex flex-col max-h-[70vh] md:max-h-none">
            <LiveChannelChat channelId={channel.id} isHost={false} broadcastId={currentBroadcastId || undefined} />
            
            {/* FIXED: Inline Raise Hand UI with clear state indication */}
            <div className="p-4 border-t border-gray-700 bg-gray-800">
              {/* FIXED: Show speaker status clearly */}
              {isSpeaker ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-green-400 mb-2">
                    <Mic className="h-4 w-4" />
                    <span className="text-sm font-medium">{t('liveChannelViewer', 'youreASpeaker', "You're a Speaker")}</span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {channel.is_video_enabled
                      ? t('liveChannelViewer', 'speakerPermissionMicCamera', 'You have permission to use your microphone and camera')
                      : t('liveChannelViewer', 'speakerPermissionMic', 'You have permission to use your microphone')}
                  </p>
                  {dailyRoom.isMicOn && (
                    <div className="flex items-center gap-2 text-green-400 text-xs">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span>{t('liveChannelViewer', 'microphoneActive', 'Microphone active')}</span>
                    </div>
                  )}
                </div>
              ) : (
                <Button
                  onClick={hasRaisedHand ? lowerHand : raiseHand}
                  disabled={raisingHand}
                  variant={hasRaisedHand ? 'secondary' : 'default'}
                  className="w-full"
                >
                  {raisingHand ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {hasRaisedHand ? t('liveChannelViewer', 'lowering', 'Lowering...') : t('liveChannelViewer', 'raising', 'Raising...')}
                    </>
                  ) : hasRaisedHand ? (
                    <>
                      <Hand className="h-4 w-4 mr-2 text-yellow-500" />
                      {t('liveChannelViewer', 'lowerHand', 'Lower Hand')}
                    </>
                  ) : (
                    <>
                      <Hand className="h-4 w-4 mr-2" />
                      {t('liveChannelViewer', 'raiseHandToSpeak', 'Raise Hand to Speak')}
                    </>
                  )}
                </Button>
              )}
              
              {hasRaisedHand && !isSpeaker && (
                <p className="text-xs text-gray-400 mt-2 text-center">
                  {t('liveChannelViewer', 'waitingForApproval', 'Waiting for host approval...')}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* FIXED: Speaker Invitation Dialog with clear permissions explanation */}
      <Dialog open={showInvitationDialog} onOpenChange={setShowInvitationDialog}>
        <DialogContent className="bg-gray-800 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-blue-500" />
              {t('liveChannelViewer', 'invitationToSpeakTitle', 'Invitation to Speak')}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {channel.is_video_enabled
                ? t('liveChannelViewer', 'invitationDialogDescMicCamera', "The host has invited you to speak in this live channel. You'll need to allow microphone and camera access.")
                : t('liveChannelViewer', 'invitationDialogDescMic', "The host has invited you to speak in this live channel. You'll need to allow microphone access.")}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-3 p-4 bg-gray-700 rounded-lg">
              <div className="flex items-center gap-2">
                <Mic className="h-5 w-5 text-green-500" />
                <span className="text-white text-sm">{t('liveChannelViewer', 'microphone', 'Microphone')}</span>
              </div>
              {channel.is_video_enabled && (
                <div className="flex items-center gap-2">
                  <VideoIcon className="h-5 w-5 text-green-500" />
                  <span className="text-white text-sm">{t('liveChannelViewer', 'camera', 'Camera')}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              {t('liveChannelViewer', 'browserPermissionNote', 'Your browser will request permission to access these devices.')}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={declineInvitation}
              disabled={acceptingInvitation}
              className="border-gray-600"
            >
              {t('liveChannelViewer', 'decline', 'Decline')}
            </Button>
            <Button
              onClick={acceptInvitation}
              disabled={acceptingInvitation}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {acceptingInvitation ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('liveChannelViewer', 'accepting', 'Accepting...')}
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  {t('liveChannelViewer', 'acceptEnableMedia', 'Accept & Enable Media')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LiveChannelViewer