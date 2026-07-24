import { useState, useEffect, useRef, useCallback } from 'react';
// Daily removed — LiveKit is the only backend. These structural stand-ins keep the
// legacy participant-conversion types compiling; those Daily code paths are now
// unreachable (isLiveKitBackend() is always true). No @daily-co dependency remains.
type DailyCall = unknown;
type DailyParticipant = any;
type DailyEventObjectParticipant = any;
type DailyEventObjectParticipantLeft = any;
import { supabase } from '@rekindle/supabase';
import { useAuth } from '@rekindle/features/AuthContext';
import { toast } from '@rekindle/ui/use-toast';
import { createVideoWrapper, isLiveKitBackend } from './videoBackend';
import type { IVideoRoomWrapper, NormalizedParticipant } from '@rekindle/types/videoRoom';
import {
  ParticipantRole,
  ParticipantState, 
  MeetingSettings, 
  WaitingRoomParticipant,
  ChatMessageType,
  ChatAttachment,
  DEFAULT_MEETING_SETTINGS,
  hasPermission
} from '@rekindle/types/liveChannelTypes';

// Types
export interface DailyRoomOptions {
  roomName: string;
  userName: string;
  userId: string;
  isHost: boolean;
  viewerOnlyMode?: boolean;
  channelId?: string;       // Required when viewerOnlyMode=true to scope speaker permission checks
  sessionId?: string;
  onSessionEnd?: () => void;
  onParticipantJoined?: (participant: DailyParticipant) => void;
  onParticipantLeft?: (participant: DailyParticipant) => void;
  onHostJoined?: () => void;
  onMeetingEnded?: () => void;
  enableWaitingRoom?: boolean;
  meetingId?: string;
  /** LiveKit only: which DB table the `livekit-token` fn checks for host status.
   *  Defaults to 'channel' when a channelId is present, else 'meeting'. */
  meetingKind?: 'meeting' | 'ministry_meeting' | 'channel_meeting' | 'channel' | 'counselling';
}

export interface DailyParticipantInfo {
  id: string;
  sessionId: string;
  userName: string;
  isLocal: boolean;
  isOwner: boolean;
  hasAudio: boolean;
  hasVideo: boolean;
  hasScreenShare: boolean;
  isInCall: boolean;
  joinedAt: Date;
  audioTrack?: MediaStreamTrack;
  videoTrack?: MediaStreamTrack;
  screenVideoTrack?: MediaStreamTrack;
}

export interface UseDailyRoomReturn {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  isJoining: boolean;
  connectionError: string | null;
  
  // Room info
  roomUrl: string | null;
  roomToken: string | null;
  roomName: string;
  
  // Participants with role management
  participants: DailyParticipantInfo[];
  participantStates: ParticipantState[];
  localParticipant: DailyParticipantInfo | null;
  remoteParticipants: DailyParticipantInfo[];
  participantCount: number;
  
  // Waiting room
  waitingRoomParticipants: WaitingRoomParticipant[];
  
  // Meeting settings and state
  meetingSettings: MeetingSettings;
  isRecording: boolean;
  /** True host (DB) OR a co-host promoted live — gets full in-call moderator controls. */
  isModerator: boolean;
  spotlightedParticipantId: string | null;
  pinnedParticipantId: string | null;
  
  // Media state
  isMicOn: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  handRaised: boolean;
  raisedHands: { sessionId: string; userName: string }[];
  
  // Audio state tracking
  audioInputState: 'available' | 'blocked' | 'detecting' | 'unavailable';
  hasSpeakerPermission: boolean;
  
  // Media controls
  toggleMic: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  // Virtual background: 'none' | 'blur' | <image URL>.
  videoBackground: string;
  setVideoBackground: (mode: string) => Promise<void>;
  /** Directly enables mic+optional video for an accepted speaker, bypassing the permission gate */
  enableSpeakerMedia: (withVideo: boolean) => Promise<void>;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
  
  // Room actions
  joinRoom: () => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  deleteRoom: () => Promise<boolean>;
  endMeetingForAll: () => Promise<void>;
  
  // Role-based participant management
  assignRole: (participantId: string, role: ParticipantRole) => Promise<void>;
  getParticipantRole: (participantId: string) => ParticipantRole;
  
  // Host/Co-host controls
  muteParticipant: (participantId: string) => Promise<void>;
  allowUnmute: (participantId: string) => Promise<void>;
  requestUnmute: (participantId: string, participantName: string) => Promise<void>;
  muteAll: (except?: string[]) => Promise<void>;
  disableParticipantVideo: (participantId: string) => Promise<void>;
  allowVideo: (participantId: string) => Promise<void>;
  requestVideo: (participantId: string, participantName: string) => Promise<void>;
  disableAllVideo: (except?: string[]) => Promise<void>;
  removeParticipant: (participantId: string) => Promise<void>;
  
  // Waiting room controls
  admitFromWaitingRoom: (participantId: string) => Promise<void>;
  admitAllFromWaitingRoom: () => Promise<void>;
  rejectFromWaitingRoom: (participantId: string) => Promise<void>;
  
  // Meeting controls
  lockMeeting: (locked: boolean) => Promise<void>;
  updateMeetingSettings: (settings: Partial<MeetingSettings>) => Promise<void>;
  
  // Recording controls
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
  
  // Spotlight and pin
  spotlightParticipant: (participantId: string | null) => void;
  pinParticipant: (participantId: string | null) => void;
  
  // Raise hand
  raiseHand: () => Promise<void>;
  lowerHand: (participantId?: string) => Promise<void>;
  
  // Chat messages
  chatMessages: ChatMessageType[];
  sendChatMessage: (content: string, isPrivate?: boolean, recipientId?: string, attachment?: ChatAttachment | null) => Promise<void>;
  
  // Session tracking
  sessionStartTime: Date | null;
  sessionDuration: number;
  
  // Daily call instance
  callObject: DailyCall | null;
  
  // Video element refs
  localVideoRef: React.RefObject<HTMLVideoElement>;
  
  // Cleanup
  cleanup: () => void;
}

export const useDailyRoom = (options: DailyRoomOptions): UseDailyRoomReturn => {
  const { user, profile } = useAuth();
  
  // Refs
  const wrapperRef = useRef<IVideoRoomWrapper | null>(null);
  // Phase 3: LiveKit-only. identity→role map (from participant metadata) and a
  // stable pointer to the current advisory-message handler (fed by wrapper.onData).
  const livekitRolesRef = useRef<Map<string, ParticipantRole>>(new Map());
  const controlMessageHandlerRef = useRef<((event: { data: any; fromId?: string }) => void) | null>(null);
  // Phase 5: active Egress recording id (LiveKit), so stopRecording can target it.
  const recordingEgressIdRef = useRef<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const sessionStartTimeRef = useRef<Date | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // Room info
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [roomToken, setRoomToken] = useState<string | null>(null);
  
  // Participants
  const [participants, setParticipants] = useState<DailyParticipantInfo[]>([]);
  // Always-current mirror so effects can read the roster without listing
  // `participants` as a dependency (it changes every 2s via the state sync, which
  // would otherwise tear down long-lived subscriptions like chat on every tick).
  const participantsRef = useRef(participants);
  participantsRef.current = participants;
  
  // Media state
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [videoBackground, setVideoBackgroundState] = useState<string>('none');
  const [audioInputState, setAudioInputState] = useState<'available' | 'blocked' | 'detecting' | 'unavailable'>('unavailable');

  // Enhanced state for role-based system
  const [participantStates, setParticipantStates] = useState<ParticipantState[]>([]);
  const [participantRoles, setParticipantRoles] = useState<Map<string, ParticipantRole>>(new Map());
  const [waitingRoomParticipants, setWaitingRoomParticipants] = useState<WaitingRoomParticipant[]>([]);
  const [meetingSettings, setMeetingSettings] = useState<MeetingSettings>(DEFAULT_MEETING_SETTINGS);
  const [isRecording, setIsRecording] = useState(false);
  const [spotlightedParticipantId, setSpotlightedParticipantId] = useState<string | null>(null);
  const [pinnedParticipantId, setPinnedParticipantId] = useState<string | null>(null);
  const [handRaised, setHandRaised] = useState(false);
  // Reactive list of raised hands (the ref alone never triggers re-renders)
  const [raisedHands, setRaisedHands] = useState<{ sessionId: string; userName: string }[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessageType[]>([]);
  const raisedHandsRef = useRef<Set<string>>(new Set());
  const hostMutedParticipantsRef = useRef<Set<string>>(new Set());
  const hostDisabledVideoParticipantsRef = useRef<Set<string>>(new Set());
  
  // Host control enforcement state
  const [hostMutedByHost, setHostMutedByHost] = useState(false);
  const [videoDisabledByHost, setVideoDisabledByHost] = useState(false);
  const hasJoinedMeetingRef = useRef(false);

  // Viewer-only mode permission state
  const [hasSpeakerPermission, setHasSpeakerPermission] = useState(options.isHost);
  
  // Subscribe to speaker permission changes — scoped to the specific channel
  useEffect(() => {
    if (options.viewerOnlyMode && !options.isHost && user?.id) {
      const checkSpeakerPermission = async () => {
        let query = supabase
          .from('live_channel_speakers')
          .select('*')
          .eq('user_id', user.id);
        // Scope to channel when channelId is provided
        if (options.channelId) {
          query = query.eq('channel_id', options.channelId);
        }
        const { data } = await query.maybeSingle();
        setHasSpeakerPermission(!!data);
      };
      
      checkSpeakerPermission();
      
      // Subscribe to changes
      const channelFilter = options.channelId
        ? `user_id=eq.${user.id}`
        : `user_id=eq.${user.id}`;
      const channel = supabase
        .channel(`speaker-permission-${user.id}-${options.channelId ?? 'global'}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'live_channel_speakers',
            filter: channelFilter
          },
          () => {
            checkSpeakerPermission();
          }
        )
        .subscribe();
      
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [options.viewerOnlyMode, options.isHost, user?.id, options.channelId]);

  // Auto-disable media when speaker permission is removed (moderators are exempt —
  // a co-host keeps publishing until actually demoted). isModeratorRef is read in
  // the body rather than the deps: it's declared further down, so listing it here
  // would hit the temporal dead zone during render.
  useEffect(() => {
    if (options.viewerOnlyMode && !isModeratorRef.current && !hasSpeakerPermission) {
      // If we lost speaker permission, disable media
      if (isMicOn || isCameraOn) {
        console.log('[Daily] Speaker permission removed, disabling media');

        (async () => {
          if (isMicOn) {
            await toggleMic();
          }
          if (isCameraOn) {
            await toggleCamera();
          }
        })();
      }
    }
  }, [hasSpeakerPermission, options.viewerOnlyMode, isMicOn, isCameraOn]);

  // Convert Daily participant to our format
  const convertParticipant = useCallback((participant: DailyParticipant): DailyParticipantInfo => {
    // Get video track - check multiple possible states
    const videoTrack = participant.tracks?.video?.persistentTrack || 
                       participant.tracks?.video?.track || 
                       undefined;
    const audioTrack = participant.tracks?.audio?.persistentTrack || 
                       participant.tracks?.audio?.track || 
                       undefined;
    const screenVideoTrack = participant.tracks?.screenVideo?.persistentTrack || 
                             participant.tracks?.screenVideo?.track || 
                             undefined;
    
    // Check if video/audio is available - be more lenient with state checks
    const videoState = participant.tracks?.video?.state;
    const audioState = participant.tracks?.audio?.state;
    const screenState = participant.tracks?.screenVideo?.state;
    
    // Video is available if: track exists AND (state is playable OR sendable OR loading OR interrupted)
    const hasVideo = participant.video && videoTrack && 
                     (videoState === 'playable' || videoState === 'sendable' || videoState === 'loading' || videoState === 'interrupted');
    const hasAudio = participant.audio && audioTrack && 
                     (audioState === 'playable' || audioState === 'sendable' || audioState === 'loading' || audioState === 'interrupted');
    const hasScreenShare = participant.screen && screenVideoTrack && 
                           (screenState === 'playable' || screenState === 'sendable' || screenState === 'loading');

    console.log(`[Daily] Convert participant ${participant.user_name}: video=${participant.video}, videoState=${videoState}, hasTrack=${!!videoTrack}`);

    return {
      id: participant.user_id || participant.session_id,
      sessionId: participant.session_id,
      userName: participant.user_name || 'Anonymous',
      isLocal: participant.local || false,
      isOwner: participant.owner || false,
      hasAudio: hasAudio || false,
      hasVideo: hasVideo || false,
      hasScreenShare: hasScreenShare || false,
      isInCall: true,
      joinedAt: new Date(participant.joined_at || Date.now()),
      audioTrack: audioTrack,
      videoTrack: videoTrack,
      screenVideoTrack: screenVideoTrack
    };
  }, []);


  // Update participants list
  const updateParticipants = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    
    const raw = wrapper.getParticipants();
    if (!raw) return;

    // LiveKit wrapper already emits NormalizedParticipant (== DailyParticipantInfo);
    // the Daily wrapper emits Daily-shaped rows that need convertParticipant.
    let participantList: DailyParticipantInfo[];
    if (isLiveKitBackend()) {
      const list = Object.values(raw) as (DailyParticipantInfo & { metadata?: { role?: ParticipantRole } })[];
      // Mirror metadata roles so getParticipantRole (§3E) reads them.
      const roles = new Map<string, ParticipantRole>();
      list.forEach((p) => { if (p.metadata?.role) roles.set(p.sessionId, p.metadata.role); });
      livekitRolesRef.current = roles;
      participantList = list;
    } else {
      participantList = Object.values(raw).map((p) => convertParticipant(p as DailyParticipant));
    }

    setParticipants(participantList);
  }, [convertParticipant]);

  // Initialize participant role (host gets host, others get attendee by default)
  const initializeParticipantRole = useCallback((sessionId: string, isOwner: boolean): ParticipantRole => {
    if (isOwner) return 'host';
    return meetingSettings.waitingRoomEnabled ? 'attendee' : 'attendee';
  }, [meetingSettings.waitingRoomEnabled]);

  // Role-derivation context for the livekit edge fns (which table proves host).
  // Counselling resolves from sessionId (counselling_sessions.id); everything else
  // from meetingId. This is LiveKit-only — the Daily path never reads it.
  const roleContext = useCallback(() => ({
    kind: options.meetingKind ?? (options.channelId ? 'channel' : 'meeting'),
    meetingId: options.meetingKind === 'counselling' ? options.sessionId : options.meetingId,
    channelId: options.channelId,
  }), [options.meetingKind, options.channelId, options.meetingId, options.sessionId]);

  // §3A — server-enforced moderation. No-op on Daily (callers keep the advisory
  // sendAppMessage path); on LiveKit it hits the livekit-moderation edge fn.
  const moderate = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('livekit-moderation', {
      body: { action, roomName: options.roomName, context: roleContext(), ...extra },
    });
    if (error) throw new Error(error.message || `moderation ${action} failed`);
    if (data?.error) throw new Error(data.error);
    return data;
  }, [options.roomName, roleContext]);

  // Get participant role. On LiveKit the source of truth is participant metadata
  // (§3E), mirrored into livekitRolesRef during updateParticipants.
  const getParticipantRole = useCallback((participantId: string): ParticipantRole => {
    if (isLiveKitBackend()) {
      const role = livekitRolesRef.current.get(participantId);
      if (role) return role;
    }
    return participantRoles.get(participantId) || 'attendee';
  }, [participantRoles]);

  // A "moderator" is the true host (from the DB, via options.isHost) OR a co-host
  // promoted live (role carried in LiveKit participant metadata). Co-hosts get the
  // same in-call controls; the livekit-moderation edge fn authorizes both server
  // side, so this is only the client-side gate. Kept in a ref so the many
  // moderation callbacks can read the CURRENT value without being re-created (and
  // without re-subscribing) every time a role changes.
  const localSelf = participants.find(p => p.isLocal);
  const localRole: ParticipantRole = localSelf
    ? getParticipantRole(localSelf.sessionId)
    : (options.isHost ? 'host' : 'attendee');
  const isModerator = options.isHost || localRole === 'host' || localRole === 'co-host';
  const isModeratorRef = useRef(isModerator);
  isModeratorRef.current = isModerator;
  // A live co-host (or the host) is a full publisher, even in a viewer-only webinar
  // where attendees join with canPublish:false. Promotion widens their publish grant
  // server-side (set-role), so treat them as speakers on the client too. This is an
  // *effective* override — the raw hasSpeakerPermission state is left alone, so a
  // later demotion cleanly reverts to whatever real speaker permission they hold.
  const effectiveSpeakerPermission = hasSpeakerPermission || isModerator;

  // Assign role to participant
  const assignRole = useCallback(async (participantId: string, role: ParticipantRole) => {
    if (!isModeratorRef.current) {
      toast({ title: 'Permission Denied', description: 'Only hosts/co-hosts can assign roles', variant: 'destructive' });
      return;
    }
    // Protect the host: a co-host may not promote anyone to host nor change the
    // existing host's role — only the true host can. (The server grants co-hosts
    // set-role, so this guard has to live here.)
    if (!options.isHost && (role === 'host' || getParticipantRole(participantId) === 'host')) {
      toast({ title: 'Permission Denied', description: 'Only the host can change the host role', variant: 'destructive' });
      return;
    }

    setParticipantRoles(prev => {
      const updated = new Map(prev);
      updated.set(participantId, role);
      return updated;
    });

    // Broadcast role change via app message
    const wrapper = wrapperRef.current;
    if (wrapper) {
      await wrapper.sendAppMessage({
        type: 'role-change',
        participantId,
        role
      }, '*');
      if (isLiveKitBackend()) await moderate('set-role', { identity: participantId, role });
    }

    // Update database if meetingId exists
    if (options.meetingId) {
      await supabase
        .from('meeting_participants')
        .update({ role })
        .eq('meeting_id', options.meetingId)
        .eq('session_id', participantId);
    }

    toast({ title: 'Role Updated', description: `Participant role changed to ${role}` });
  }, [options.isHost, options.meetingId]);

  // Sync participant states with Daily participants
  const syncParticipantStates = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const raw = wrapper.getParticipants();
    if (!raw) return;

    const normalized: DailyParticipantInfo[] = isLiveKitBackend()
      ? (Object.values(raw) as DailyParticipantInfo[])
      : Object.values(raw).map((p) => convertParticipant(p as DailyParticipant));

    const states: ParticipantState[] = [];
    normalized.forEach((convertedParticipant) => {
      const role = getParticipantRole(convertedParticipant.sessionId);
      
      // Check if host has disabled this participant's audio/video
      const isMutedByHost = hostMutedParticipantsRef.current.has(convertedParticipant.sessionId);
      const isVideoDisabledByHost = hostDisabledVideoParticipantsRef.current.has(convertedParticipant.sessionId);
      
      states.push({
        session_id: convertedParticipant.sessionId,
        user_id: convertedParticipant.id,
        user_name: convertedParticipant.userName,
        role,
        isLocal: convertedParticipant.isLocal,
        isInWaitingRoom: false,
        hasAudio: convertedParticipant.hasAudio,
        hasVideo: convertedParticipant.hasVideo,
        hasScreenShare: convertedParticipant.hasScreenShare,
        audioEnabled: !isMutedByHost && (hasPermission(role, 'canUnmuteAudio') || role === 'host'),
        videoEnabled: !isVideoDisabledByHost && (hasPermission(role, 'canEnableVideo') || role === 'host'),
        handRaised: raisedHandsRef.current.has(convertedParticipant.sessionId),
        isSpotlighted: spotlightedParticipantId === convertedParticipant.sessionId,
        isPinned: pinnedParticipantId === convertedParticipant.sessionId,
        isMutedByHost: isMutedByHost,
        joinedAt: convertedParticipant.joinedAt,
        videoTrack: convertedParticipant.videoTrack,
        audioTrack: convertedParticipant.audioTrack,
        screenVideoTrack: convertedParticipant.screenVideoTrack,
      });
    });

    setParticipantStates(states);
  }, [convertParticipant, getParticipantRole, spotlightedParticipantId, pinnedParticipantId]);

  // Check audio input availability
  const checkAudioInput = useCallback(async () => {
    try {
      setAudioInputState('detecting');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setAudioInputState('available');
      return true;
    } catch (error: any) {
      console.error('[Daily] Audio input check failed:', error);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setAudioInputState('blocked');
      } else {
        setAudioInputState('unavailable');
      }
      return false;
    }
  }, []);

  // Create or get room from edge function
  const createRoom = useCallback(async (): Promise<{ url: string; token: string } | null> => {
    try {
      // §1F — LiveKit collapses get-or-create + generate-token into ONE locally-signed
      // JWT. Role is derived server-side (the client `isHost` is NOT trusted).
      if (isLiveKitBackend()) {
        const { data, error } = await supabase.functions.invoke('livekit-token', {
          body: {
            action: 'token',
            roomName: options.roomName,
            userName: options.userName,
            viewerOnly: options.viewerOnlyMode && !options.isHost,
            enableWaitingRoom: options.enableWaitingRoom || false,
            context: roleContext(),
          },
        });
        if (error) throw new Error(error.message || 'Failed to get LiveKit token');
        if (data?.waiting) {
          // Gated into the waiting room (§1C). Phase 3D wires the admit round-trip.
          setConnectionError('waiting-room');
          return null;
        }
        if (data?.error) throw new Error(data.error === 'locked' ? 'This meeting is locked' : data.error);
        if (!data?.url || !data?.token) throw new Error('Invalid response from livekit-token');
        // Debug: log token info for guest name validation
        if (!options.isHost) {
          console.log('[Daily] Guest token generated for:', options.userName);
        }
        return { url: data.url, token: data.token };
      }

      // Legacy Daily get-or-create-room + generate-token path removed (LiveKit-only).
      // The LiveKit branch above always runs and returns.
      return null;
    } catch (error: any) {
      console.error('[Daily] Failed to create room:', error);
      
      let userMessage = 'Could not create video room';
      let description = error.message || 'Unknown error occurred';
      
      if (error.message?.includes('TIMEOUT')) {
        description = 'Video room creation is taking too long. Please check your connection.';
      } else if (error.message?.includes('not configured')) {
        description = 'The video service is not properly set up.';
      }
      
      setConnectionError(description);
      
      toast({
        title: userMessage,
        description,
        variant: 'destructive'
      });
      
      return null;
    }
  }, [options.roomName, options.userName, options.userId, options.isHost, options.enableWaitingRoom, options.viewerOnlyMode, options.channelId, options.meetingId, options.meetingKind, roleContext]);

  // Attach local video track to video element
  const attachLocalVideoTrack = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !localVideoRef.current) return;
    
    const local = wrapper.getLocalParticipant();
    if (!local) return;

    const track = isLiveKitBackend()
      ? (local as NormalizedParticipant).videoTrack
      : ((local as DailyParticipant).tracks?.video?.persistentTrack || (local as DailyParticipant).tracks?.video?.track);

    if (track && track.readyState === 'live') {
      // Don't reattach the same track — reassigning srcObject reloads the <video>
      // and flickers. The periodic 2s re-check + track-published events would
      // otherwise flicker the local tile continuously.
      const cur = localVideoRef.current.srcObject;
      if (cur instanceof MediaStream && cur.getVideoTracks()[0] === track) return;
      console.log('[Daily] Attaching local video track to element');
      localVideoRef.current.srcObject = new MediaStream([track]);
      localVideoRef.current.play().catch(e => console.warn('[Daily] Video play error:', e));
    }
  }, []);

  // Join room using EnhancedDailyVideoWrapper
  const joinRoom = useCallback(async (): Promise<boolean> => {
    if (isConnecting || isJoining || isConnected) {
      console.log('[Daily] Already connecting/joined');
      return false;
    }

    setIsJoining(true);
    setConnectionError(null);

    try {
      // Check audio input before joining (skip for viewer-only mode)
      if (!options.viewerOnlyMode || options.isHost) {
        await checkAudioInput();
      }

      const roomInfo = await createRoom();
      if (!roomInfo) {
        setIsJoining(false);
        return false;
      }

      setRoomUrl(roomInfo.url);
      setRoomToken(roomInfo.token);

      setIsConnecting(true);
      console.log('[Daily] Creating EnhancedDailyVideoWrapper...');

      // Create the wrapper with callbacks (Daily or LiveKit, per VITE_VIDEO_BACKEND)
      const wrapper = await createVideoWrapper({
        onJoined: () => {
          console.log('[Daily] Wrapper: onJoined callback');
          setIsConnected(true);
          setIsConnecting(false);
          setIsJoining(false);
          
          const startTime = new Date();
          sessionStartTimeRef.current = startTime;
          
          // Clear chat messages on fresh join (not reconnect)
          if (!hasJoinedMeetingRef.current) {
            setChatMessages([]);
            setHostMutedByHost(false);
            setVideoDisabledByHost(false);
            setHandRaised(false);
            raisedHandsRef.current.clear();
            setRaisedHands([]);
            hasJoinedMeetingRef.current = true;
          }

          durationIntervalRef.current = setInterval(() => {
            if (sessionStartTimeRef.current) {
              // Duration is calculated but not stored in state to avoid re-renders
            }
          }, 1000);

          updateParticipants();

          // Notify if host joined (owner from Daily flag / normalized isOwner)
          const localParticipant = wrapper.getLocalParticipant() as (DailyParticipant & NormalizedParticipant) | null;
          if (localParticipant?.owner || localParticipant?.isOwner) {
            options.onHostJoined?.();
          }
        },
        onLeft: () => {
          console.log('[Daily] Wrapper: onLeft callback');
          setIsConnected(false);
          
          if (durationIntervalRef.current) {
            clearInterval(durationIntervalRef.current);
            durationIntervalRef.current = null;
          }
        },
        onParticipantJoined: (participant: any) => {
          console.log('[Daily] Wrapper: Participant joined', participant?.user_name ?? participant?.userName);
          updateParticipants();
          options.onParticipantJoined?.(participant);

          if (participant?.owner || participant?.isOwner) {
            options.onHostJoined?.();
          }
        },
        onParticipantLeft: (participant: any) => {
          console.log('[Daily] Wrapper: Participant left', participant?.user_name ?? participant?.userName);
          const sid = participant?.session_id ?? participant?.sessionId;
          if (sid) {
            raisedHandsRef.current.delete(sid);
            setRaisedHands(prev => prev.filter(h => h.sessionId !== sid));
          }
          updateParticipants();
          options.onParticipantLeft?.(participant);
        },
        onParticipantUpdated: () => {
          updateParticipants();
        },
        onTrackStarted: (event) => {
          console.log('[Daily] Wrapper: Track started', event?.track?.kind, 'local:', event?.participant?.local);
          updateParticipants();
          
          // If local video track started, attach it
          if (event?.track?.kind === 'video' && event?.participant?.local) {
            console.log('[Daily] Local video track started, attaching...');
            requestAnimationFrame(() => {
              attachLocalVideoTrack();
            });
          }
        },
        onTrackStopped: (event) => {
          console.log('[Daily] Wrapper: Track stopped', event?.track?.kind);
          updateParticipants();
          
          if (event?.track?.kind === 'video' && event?.participant?.local) {
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = null;
            }
          }
        },
        onCameraError: (event) => {
          console.error('[Daily] Wrapper: Camera error', event);
          setIsCameraOn(false);
          toast({
            title: 'Camera Error',
            description: event?.errorMsg?.errorMsg || 'Failed to access camera',
            variant: 'destructive'
          });
        },
        onError: (event) => {
          console.error('[Daily] Wrapper: Error', event);
          setConnectionError(event?.errorMsg || 'An error occurred');
        },
        onData: (data: any, fromIdentity?: string) => {
          // LiveKit advisory data channel (§3C) → the same control-message handler
          // Daily uses. fromIdentity == sessionId (we align identity/sessionId).
          controlMessageHandlerRef.current?.({ data, fromId: fromIdentity });
        },
        onMediaStateChange: (video, audio) => {
          console.log('[Daily] Wrapper: Media state changed - video:', video, 'audio:', audio);
          setIsCameraOn(video);
          setIsMicOn(audio);
          
          // Attach video track when video is enabled
          if (video) {
            setTimeout(() => {
              attachLocalVideoTrack();
            }, 100);
          }
        }
      });

      wrapperRef.current = wrapper;

      // CRITICAL: Stop all previews before joining
      // This is handled by the component calling stopAllPreviews before joinRoom
      // But we do it here as a safety measure
      await wrapper.stopAllPreviews();

      console.log('[Daily] Joining meeting via wrapper...');
      
      // Implement viewer-only mode
      if (options.viewerOnlyMode && !options.isHost) {
        console.log('[Daily] Joining in VIEWER-ONLY mode (no mic/camera access)');
        // Pass true as boolean — wrapper signature expects boolean, not options object
        await wrapper.joinMeeting(roomInfo.url, roomInfo.token, options.userName, true);

        // Ensure local tracks are hard-disabled after join (backend-agnostic).
        await wrapper.setAudio(false);
        await wrapper.setVideo(false);

        console.log('[Daily] Viewer-only mode: Joined without media access');
      } else {
        // Normal join for hosts or when viewer-only mode is disabled
        await wrapper.joinMeeting(roomInfo.url, roomInfo.token, options.userName, false);
      }

      return true;
    } catch (error: any) {
      console.error('[Daily] Failed to join room:', error);
      setConnectionError(error.message || 'Failed to join room');
      setIsConnecting(false);
      setIsJoining(false);
      
      toast({
        title: 'Failed to Join',
        description: error.message || 'Could not join the room',
        variant: 'destructive'
      });
      
      return false;
    }
  }, [isConnecting, isJoining, isConnected, createRoom, updateParticipants, checkAudioInput, options, attachLocalVideoTrack]);


  // Leave room
  const leaveRoom = useCallback(async () => {
    try {
      console.log('[Daily] Leaving room...');
      
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      const finalDuration = sessionStartTimeRef.current 
        ? Math.floor((Date.now() - sessionStartTimeRef.current.getTime()) / 1000)
        : 0;

      if (wrapperRef.current) {
        await wrapperRef.current.leaveMeeting();
        wrapperRef.current = null;
      }

      setIsConnected(false);
      setIsConnecting(false);
      setIsJoining(false);
      setIsMicOn(false);
      setIsCameraOn(false);
      setIsScreenSharing(false);
      setParticipants([]);
      sessionStartTimeRef.current = null;
      hasJoinedMeetingRef.current = false;
      
      // Clear chat messages when leaving
      setChatMessages([]);
      
      // Reset host-enforced restrictions
      setHostMutedByHost(false);
      setVideoDisabledByHost(false);
      setHandRaised(false);
      raisedHandsRef.current.clear();
            setRaisedHands([]);

      if (options.sessionId && finalDuration > 0) {
        await supabase
          .from('counseling_sessions')
          .update({
            duration: finalDuration,
            status: 'completed',
            ended_at: new Date().toISOString()
          })
          .eq('id', options.sessionId);
      }

      options.onSessionEnd?.();
    } catch (error: any) {
      console.error('[Daily] Error leaving room:', error);
    }
  }, [options.sessionId]);

  // End meeting for all participants (host only)
  const endMeetingForAll = useCallback(async () => {
    if (!options.isHost) {
      console.warn('[Daily] Only host can end meeting for all');
      return;
    }

    if (!options.meetingId) {
      console.warn('[Daily] Meeting ID required to end meeting');
      return;
    }

    try {
      console.log('[Daily] Ending meeting for all participants...');
      
      // Clear chat messages from this session
      if (sessionStartTimeRef.current) {
        const sessionStartTime = sessionStartTimeRef.current.toISOString();
        const { error: chatError } = await supabase
          .from('chat_messages')
          .delete()
          .eq('meeting_id', options.meetingId)
          .eq('session_start_time', sessionStartTime);

        if (chatError) {
          console.error('[Daily] Failed to clear chat messages:', chatError);
        } else {
          console.log('[Daily] Cleared chat messages for session');
        }
      }
      
      await supabase
        .from('meetings')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString()
        })
        .eq('id', options.meetingId);
      
      toast({
        title: 'Meeting Ended',
        description: 'The meeting has been ended for all participants'
      });

      await leaveRoom();
    } catch (error: any) {
      console.error('[Daily] Error ending meeting:', error);
      toast({
        title: 'Error',
        description: 'Failed to end meeting for all participants',
        variant: 'destructive'
      });
    }
  }, [options.isHost, options.meetingId, leaveRoom]);

  // Mute specific participant (can only mute, not unmute)
  const muteParticipant = useCallback(async (participantId: string) => {
    if (!isModeratorRef.current) {
      toast({ title: 'Permission Denied', description: 'Only hosts/co-hosts can mute participants', variant: 'destructive' });
      return;
    }

    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    try {
      // Track that this participant is muted by host
      hostMutedParticipantsRef.current.add(participantId);
      
      // Advisory (drives the target's mute-gating UI) + server-enforced on LiveKit.
      await wrapper.sendAppMessage({
        type: 'mute-participant',
        participantId
      }, participantId);
      if (isLiveKitBackend()) await moderate('mute-track', { identity: participantId, source: 'microphone' });

      // Update database
      const { error } = await supabase
        .from('participant_states')
        .update({
          has_audio: false,
          is_host_muted: true,
          updated_at: new Date().toISOString()
        })
        .eq('meeting_id', options.meetingId)
        .eq('session_id', participantId);

      if (error) {
        console.error('[useDailyRoom] Failed to update participant state:', error);
      }

      // Trigger state sync to update UI
      syncParticipantStates();
      
      toast({ title: 'Participant Muted', description: 'Participant has been muted' });
    } catch (error) {
      console.error('[useDailyRoom] Failed to mute participant:', error);
      toast({ title: 'Error', description: 'Failed to mute participant', variant: 'destructive' });
    }
  }, [options.isHost, options.meetingId, getParticipantRole, syncParticipantStates]);

  // Allow participant to unmute themselves
  const allowUnmute = useCallback(async (participantId: string) => {
    if (!isModeratorRef.current) {
      toast({ title: 'Permission Denied', description: 'Only hosts/co-hosts can manage participants', variant: 'destructive' });
      return;
    }

    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    try {
      // Remove from tracking
      hostMutedParticipantsRef.current.delete(participantId);
      
      // Send app message to remove restriction
      await wrapper.sendAppMessage({
        type: 'allow-unmute',
        participantId
      }, participantId);

      // Update database
      const { error } = await supabase
        .from('participant_states')
        .update({ 
          is_host_muted: false,
          updated_at: new Date().toISOString()
        })
        .eq('meeting_id', options.meetingId)
        .eq('session_id', participantId);

      if (error) {
        console.error('[useDailyRoom] Failed to update participant state:', error);
      }

      // Trigger state sync to update UI
      syncParticipantStates();

      toast({ title: 'Restriction Removed', description: 'Participant can now unmute themselves' });
    } catch (error) {
      console.error('[useDailyRoom] Failed to allow unmute:', error);
      toast({ title: 'Error', description: 'Failed to update permission', variant: 'destructive' });
    }
  }, [options.isHost, options.meetingId, getParticipantRole, syncParticipantStates]);

  // Request participant to unmute (does not force)
  const requestUnmute = useCallback(async (participantId: string, participantName: string) => {
    if (!isModeratorRef.current) {
      toast({ title: 'Permission Denied', description: 'Only hosts/co-hosts can make requests', variant: 'destructive' });
      return;
    }

    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    try {
      // Send request to participant
      await wrapper.sendAppMessage({
        type: 'request-unmute',
        participantId,
        requestedBy: participants.find(p => p.isLocal)?.userName || 'Host'
      }, participantId);

      toast({ title: 'Request Sent', description: `Asked ${participantName} to unmute` });
    } catch (error) {
      console.error('[useDailyRoom] Failed to send unmute request:', error);
      toast({ title: 'Error', description: 'Failed to send request', variant: 'destructive' });
    }
  }, [options.isHost, getParticipantRole, participants]);

  // Mute all participants
  const muteAll = useCallback(async (except: string[] = []) => {
    if (!isModeratorRef.current) {
      toast({ title: 'Permission Denied', description: 'Only hosts/co-hosts can mute all', variant: 'destructive' });
      return;
    }

    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    await wrapper.sendAppMessage({
      type: 'mute-all',
      except
    }, '*');
    if (isLiveKitBackend()) await moderate('mute-all', { source: 'microphone', except });

    toast({ title: 'All Muted', description: 'All participants have been muted' });
  }, [options.isHost]);

  // Disable participant video (can only disable, not enable)
  const disableParticipantVideo = useCallback(async (participantId: string) => {
    if (!isModeratorRef.current) {
      toast({ title: 'Permission Denied', description: 'Only hosts/co-hosts can control video', variant: 'destructive' });
      return;
    }

    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    try {
      // Track that this participant's video is disabled by host
      hostDisabledVideoParticipantsRef.current.add(participantId);
      
      // Advisory + server-enforced on LiveKit.
      await wrapper.sendAppMessage({
        type: 'disable-video',
        participantId
      }, participantId);
      if (isLiveKitBackend()) await moderate('mute-track', { identity: participantId, source: 'camera' });

      // Update database
      const { error } = await supabase
        .from('participant_states')
        .update({ 
          has_video: false,
          is_video_disabled_by_host: true,
          updated_at: new Date().toISOString()
        })
        .eq('meeting_id', options.meetingId)
        .eq('session_id', participantId);

      if (error) {
        console.error('[useDailyRoom] Failed to update participant video state:', error);
      }

      // Trigger state sync to update UI
      syncParticipantStates();

      toast({ title: 'Video Disabled', description: 'Participant video has been stopped' });
    } catch (error) {
      console.error('[useDailyRoom] Failed to disable participant video:', error);
      toast({ title: 'Error', description: 'Failed to disable video', variant: 'destructive' });
    }
  }, [options.isHost, options.meetingId, getParticipantRole, syncParticipantStates]);

  // Allow participant to enable their own video
  const allowVideo = useCallback(async (participantId: string) => {
    if (!isModeratorRef.current) {
      toast({ title: 'Permission Denied', description: 'Only hosts/co-hosts can manage participants', variant: 'destructive' });
      return;
    }

    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    try {
      // Remove from tracking
      hostDisabledVideoParticipantsRef.current.delete(participantId);
      
      // Send app message to remove restriction
      await wrapper.sendAppMessage({
        type: 'allow-video',
        participantId
      }, participantId);

      // Update database
      const { error } = await supabase
        .from('participant_states')
        .update({ 
          is_video_disabled_by_host: false,
          updated_at: new Date().toISOString()
        })
        .eq('meeting_id', options.meetingId)
        .eq('session_id', participantId);

      if (error) {
        console.error('[useDailyRoom] Failed to update participant video state:', error);
      }

      // Trigger state sync to update UI
      syncParticipantStates();

      toast({ title: 'Restriction Removed', description: 'Participant can now enable video' });
    } catch (error) {
      console.error('[useDailyRoom] Failed to allow video:', error);
      toast({ title: 'Error', description: 'Failed to update permission', variant: 'destructive' });
    }
  }, [options.isHost, options.meetingId, getParticipantRole, syncParticipantStates]);

  // Request participant to enable video (does not force)
  const requestVideo = useCallback(async (participantId: string, participantName: string) => {
    if (!isModeratorRef.current) {
      toast({ title: 'Permission Denied', description: 'Only hosts/co-hosts can make requests', variant: 'destructive' });
      return;
    }

    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    try {
      // Send request to participant
      await wrapper.sendAppMessage({
        type: 'request-video',
        participantId,
        requestedBy: participants.find(p => p.isLocal)?.userName || 'Host'
      }, participantId);

      toast({ title: 'Request Sent', description: `Asked ${participantName} to enable video` });
    } catch (error) {
      console.error('[useDailyRoom] Failed to send video request:', error);
      toast({ title: 'Error', description: 'Failed to send request', variant: 'destructive' });
    }
  }, [options.isHost, getParticipantRole, participants]);

  // Disable all video
  const disableAllVideo = useCallback(async (except: string[] = []) => {
    if (!isModeratorRef.current) {
      toast({ title: 'Permission Denied', description: 'Only hosts/co-hosts can disable all video', variant: 'destructive' });
      return;
    }

    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    await wrapper.sendAppMessage({
      type: 'disable-all-video',
      except
    }, '*');
    if (isLiveKitBackend()) await moderate('mute-all', { source: 'camera', except });

    toast({ title: 'All Video Disabled', description: 'Video disabled for all participants' });
  }, [options.isHost]);

  // Remove participant from meeting
  const removeParticipant = useCallback(async (participantId: string) => {
    if (!isModeratorRef.current) {
      toast({ title: 'Permission Denied', description: 'Only hosts/co-hosts can remove participants', variant: 'destructive' });
      return;
    }

    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    await wrapper.sendAppMessage({
      type: 'remove-participant',
      participantId
    }, participantId);
    if (isLiveKitBackend()) await moderate('remove-participant', { identity: participantId });

    // Update database
    if (options.meetingId) {
      await supabase
        .from('meeting_participants')
        .update({ is_active: false, left_at: new Date().toISOString() })
        .eq('meeting_id', options.meetingId)
        .eq('session_id', participantId);
    }

    toast({ title: 'Participant Removed', description: 'Participant has been removed from the meeting' });
  }, [options.isHost, options.meetingId]);

  // Admit participant from waiting room
  const admitFromWaitingRoom = useCallback(async (participantId: string) => {
    if (!isModeratorRef.current) {
      toast({ title: 'Permission Denied', description: 'Only hosts/co-hosts can admit participants', variant: 'destructive' });
      return;
    }

    setWaitingRoomParticipants(prev => prev.filter(p => p.session_id !== participantId));

    if (isLiveKitBackend()) {
      // Waiting client has no connection — flip its DB row to 'admitted'; it's
      // subscribed to that row and re-requests a token when admitted (§3D).
      await moderate('admit-waiting', { identity: participantId });
    } else {
      const wrapper = wrapperRef.current;
      if (wrapper) {
        await wrapper.sendAppMessage({
          type: 'admit-from-waiting-room',
          participantId
        }, participantId);
      }
    }

    toast({ title: 'Participant Admitted', description: 'Participant has been admitted to the meeting' });
  }, [options.isHost, moderate]);

  // Admit all from waiting room
  const admitAllFromWaitingRoom = useCallback(async () => {
    if (!isModeratorRef.current) return;

    for (const participant of waitingRoomParticipants) {
      if (isLiveKitBackend()) {
        await moderate('admit-waiting', { identity: participant.session_id });
      } else {
        await wrapperRef.current?.sendAppMessage({
          type: 'admit-from-waiting-room',
          participantId: participant.session_id
        }, participant.session_id);
      }
    }

    setWaitingRoomParticipants([]);
    toast({ title: 'All Admitted', description: 'All waiting participants have been admitted' });
  }, [options.isHost, waitingRoomParticipants, moderate]);

  // Reject from waiting room
  const rejectFromWaitingRoom = useCallback(async (participantId: string) => {
    if (!isModeratorRef.current) return;

    setWaitingRoomParticipants(prev => prev.filter(p => p.session_id !== participantId));

    if (isLiveKitBackend()) {
      await moderate('reject-waiting', { identity: participantId });
    } else {
      const wrapper = wrapperRef.current;
      if (wrapper) {
        await wrapper.sendAppMessage({
          type: 'reject-from-waiting-room',
          participantId
        }, participantId);
      }
    }
  }, [options.isHost, moderate]);

  // Lock/unlock meeting
  const lockMeeting = useCallback(async (locked: boolean) => {
    if (!isModeratorRef.current) {
      toast({ title: 'Permission Denied', description: 'Only hosts/co-hosts can lock meetings', variant: 'destructive' });
      return;
    }

    setMeetingSettings(prev => ({ ...prev, isLocked: locked }));

    // Broadcast to all participants
    const wrapper = wrapperRef.current;
    if (wrapper) {
      await wrapper.sendAppMessage({
        type: 'meeting-lock-change',
        locked
      }, '*');
      if (isLiveKitBackend()) await moderate('lock', { locked });
    }

    toast({ title: locked ? 'Meeting Locked' : 'Meeting Unlocked' });
  }, [options.isHost]);

  // Update meeting settings
  const updateMeetingSettings = useCallback(async (settings: Partial<MeetingSettings>) => {
    if (!isModeratorRef.current) return;

    setMeetingSettings(prev => ({ ...prev, ...settings }));

    // Broadcast settings to all participants
    const wrapper = wrapperRef.current;
    if (wrapper) {
      await wrapper.sendAppMessage({
        type: 'settings-update',
        settings
      }, '*');
    }
  }, [options.isHost]);

  // Recording controls
  const startRecording = useCallback(async () => {
    if (!options.isHost) {
      toast({ title: 'Permission Denied', description: 'Only hosts can start recording', variant: 'destructive' });
      return;
    }

    try {
      // §12 — record the room composite via LiveKit Egress → S3 HLS.
      const { data, error } = await supabase.functions.invoke('livekit-egress', {
        body: {
          action: 'start-recording',
          roomName: options.roomName,
          kind: options.channelId ? 'channel' : 'meeting',
          channelId: options.channelId,
          meetingId: options.meetingId,
          context: roleContext(),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      recordingEgressIdRef.current = data?.egressId ?? null;

      setIsRecording(true);
      setMeetingSettings(prev => ({ ...prev, recordingStatus: 'recording' }));
      toast({ title: 'Recording Started', description: 'Meeting is now being recorded' });
    } catch (error) {
      console.error('Failed to start recording:', error);
      toast({ title: 'Recording Failed', description: 'Could not start recording', variant: 'destructive' });
    }
  }, [options.isHost, options.roomName, options.channelId, options.meetingId, roleContext]);

  const stopRecording = useCallback(async () => {
    if (!options.isHost) return;

    try {
      await supabase.functions.invoke('livekit-egress', {
        body: {
          action: 'stop-recording',
          roomName: options.roomName,
          egressId: recordingEgressIdRef.current,
          context: roleContext(),
        },
      });
      recordingEgressIdRef.current = null;

      setIsRecording(false);
      setMeetingSettings(prev => ({ ...prev, recordingStatus: 'processing' }));
      toast({ title: 'Recording Stopped', description: 'Recording has been stopped' });
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  }, [options.isHost, options.roomName, roleContext]);

  const pauseRecording = useCallback(async () => {
    if (!options.isHost) return;
    setMeetingSettings(prev => ({ ...prev, recordingStatus: 'paused' }));
  }, [options.isHost]);

  const resumeRecording = useCallback(async () => {
    if (!options.isHost) return;
    setMeetingSettings(prev => ({ ...prev, recordingStatus: 'recording' }));
  }, [options.isHost]);

  // Spotlight participant
  const spotlightParticipant = useCallback((participantId: string | null) => {
    setSpotlightedParticipantId(participantId);
    
    const wrapper = wrapperRef.current;
    if (wrapper) {
      wrapper.sendAppMessage({
        type: 'spotlight-change',
        participantId
      }, '*');
    }
  }, []);

  // Pin participant (local only). Toggle semantics: pinning the already-pinned
  // participant — or passing null — clears the pin. (Previously the "Unpin" button
  // re-passed the same id and so re-pinned instead of clearing.)
  const pinParticipant = useCallback((participantId: string | null) => {
    setPinnedParticipantId(prev =>
      participantId !== null && prev === participantId ? null : participantId
    );
  }, []);

  // Raise hand
  const raiseHand = useCallback(async () => {
    const localParticipant = participants.find(p => p.isLocal);
    if (!localParticipant) return;

    raisedHandsRef.current.add(localParticipant.sessionId);
    setHandRaised(true);
    setRaisedHands(prev =>
      prev.some(h => h.sessionId === localParticipant.sessionId)
        ? prev
        : [...prev, { sessionId: localParticipant.sessionId, userName: localParticipant.userName }]
    );

    const wrapper = wrapperRef.current;
    if (wrapper) {
      await wrapper.sendAppMessage({
        type: 'hand-raised',
        participantId: localParticipant.sessionId,
        userName: localParticipant.userName
      }, '*');
    }

    toast({ title: 'Hand Raised', description: 'Your hand has been raised' });
  }, [participants]);

  // Lower hand
  const lowerHand = useCallback(async (participantId?: string) => {
    const localParticipant = participants.find(p => p.isLocal);
    if (!localParticipant) return;

    const targetId = participantId || localParticipant.sessionId;
    raisedHandsRef.current.delete(targetId);
    setRaisedHands(prev => prev.filter(h => h.sessionId !== targetId));
    
    if (targetId === localParticipant.sessionId) {
      setHandRaised(false);
    }

    const wrapper = wrapperRef.current;
    if (wrapper) {
      await wrapper.sendAppMessage({
        type: 'hand-lowered',
        participantId: targetId
      }, '*');
    }
  }, [participants]);

  // Send chat message
  const sendChatMessage = useCallback(async (content: string, isPrivate: boolean = false, recipientId?: string, attachment?: ChatAttachment | null) => {
    const localParticipant = participants.find(p => p.isLocal);
    // GUESTS may chat too: no `user` required. Registered users store their uid in
    // sender_id; a guest stores null (their name is in sender_name). chat_messages
    // RLS is permissive and sender_id is now nullable (migration 0245).
    if (!localParticipant) return;

    const role = getParticipantRole(localParticipant.sessionId);

    // Check chat permissions
    if (meetingSettings.chatMode === 'disabled') {
      toast({ title: 'Chat Disabled', description: 'Chat has been disabled by the host', variant: 'destructive' });
      return;
    }

    if (meetingSettings.chatMode === 'host-only' && role !== 'host' && role !== 'co-host') {
      toast({ title: 'Permission Denied', description: 'Only hosts can send messages', variant: 'destructive' });
      return;
    }

    if (!options.meetingId || !sessionStartTimeRef.current) {
      console.error('[Chat] Cannot send message: missing meeting ID or session start time', {
        meetingId: options.meetingId,
        sessionStartTime: sessionStartTimeRef.current
      });
      toast({ title: 'Cannot send message', description: 'Meeting not properly initialized', variant: 'destructive' });
      return;
    }

    const sessionStartTime = sessionStartTimeRef.current.toISOString();
    
    console.log('[Chat] Sending message:', {
      content,
      meetingId: options.meetingId,
      sessionStartTime,
      userId: user?.id ?? null,
      userName: localParticipant.userName
    });

    try {
      // Save to database for persistence and real-time sync
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          meeting_id: options.meetingId,
          session_start_time: sessionStartTime,
          sender_id: user?.id ?? null,
          sender_name: localParticipant.userName,
          sender_role: role,
          content,
          message_type: role === 'host' ? 'host-announcement' : 'text',
          is_private: isPrivate,
          recipient_id: recipientId || null,
          attachment_url: attachment?.url ?? null,
          attachment_name: attachment?.name ?? null,
          attachment_type: attachment?.type ?? null,
          attachment_size: attachment?.size ?? null
        })
        .select()
        .single();

      console.log('[Chat] Database insert result:', { data, error });

      if (error) {
        console.error('[Chat] Failed to save message:', error);
        toast({ title: 'Failed to send message', description: error.message, variant: 'destructive' });
        return;
      }

      console.log('[Chat] Message saved successfully with ID:', data.id);

      // Create message object for app message backup
      const message: ChatMessageType = {
        id: data.id,
        sender_id: user?.id ?? localParticipant.sessionId,
        sender_name: localParticipant.userName,
        sender_role: role,
        content,
        timestamp: new Date(data.created_at),
        messageType: data.message_type as 'text' | 'system' | 'host-announcement',
        isPrivate,
        recipientId,
        attachment: attachment ?? null
      };

      // Also send via app message for immediate delivery (backup to database)
      const wrapper = wrapperRef.current;
      if (wrapper) {
        await wrapper.sendAppMessage({
          type: 'chat-message',
          message
        }, isPrivate && recipientId ? recipientId : '*');
        console.log('[Chat] App message sent as backup');
      }
    } catch (error) {
      console.error('[Chat] Error sending message:', error);
      toast({ title: 'Failed to send message', variant: 'destructive' });
    }
  }, [participants, getParticipantRole, meetingSettings.chatMode, options.meetingId, user]);

  // Sync participant states periodically
  useEffect(() => {
    if (!isConnected) return;

    syncParticipantStates();
    const interval = setInterval(syncParticipantStates, 2000);
    
    return () => clearInterval(interval);
  }, [isConnected, syncParticipantStates]);

  // Real-time chat subscription and loading. Keyed on the LOCAL participant's
  // session id (stable for the session), NOT the whole `participants` array — so a
  // new participant joining (or the 2s state sync) no longer tears the channel down
  // and reloads, which was dropping the chat on the host's side.
  const chatLocalSessionId = participants.find(p => p.isLocal)?.sessionId;
  useEffect(() => {
    // Guests subscribe too — no `user` gate — so they SEE the conversation, not
    // just send into it. chat_messages read RLS (read_all_chat) is USING(true).
    if (!isConnected || !options.meetingId || !sessionStartTimeRef.current) {
      console.log('[Chat] Subscription NOT starting:', {
        isConnected,
        hasMeetingId: !!options.meetingId,
        hasSessionStart: !!sessionStartTimeRef.current,
      });
      return;
    }

    const sessionStartTime = sessionStartTimeRef.current.toISOString();
    const localParticipant = participantsRef.current.find(p => p.isLocal);
    if (!localParticipant) {
      console.log('[Chat] No local participant, delaying subscription');
      return;
    }

    console.log('[Chat] Setting up real-time subscription:', {
      guest: !user,
      meetingId: options.meetingId,
      sessionStartTime,
      userId: user?.id ?? null
    });

    // Load existing messages from current session
    const loadMessages = async () => {
      try {
        console.log('[Chat] Loading existing messages...');
        const { data, error } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('meeting_id', options.meetingId)
          .eq('session_start_time', sessionStartTime)
          .order('created_at', { ascending: true });

        if (error) {
          console.error('[Chat] Failed to load messages:', error);
          return;
        }

        console.log('[Chat] Loaded messages from database:', data?.length || 0);

        if (data && data.length > 0) {
          const messages: ChatMessageType[] = data.map((msg: any) => ({
            id: msg.id,
            sender_id: msg.sender_id,
            sender_name: msg.sender_name,
            sender_role: msg.sender_role,
            content: msg.content,
            timestamp: new Date(msg.created_at),
            messageType: msg.message_type,
            isPrivate: msg.is_private,
            recipientId: msg.recipient_id,
            attachment: msg.attachment_url
              ? { url: msg.attachment_url, name: msg.attachment_name, type: msg.attachment_type, size: msg.attachment_size }
              : null
          }));

          // Filter out private messages not meant for this participant. Guests
          // have no uid, so match on their session id for the sender check too.
          const selfId = user?.id ?? localParticipant.sessionId;
          const visibleMessages = messages.filter(msg =>
            !msg.isPrivate ||
            msg.sender_id === selfId ||
            msg.recipientId === localParticipant.sessionId
          );

          setChatMessages(visibleMessages);
          console.log('[Chat] Set', visibleMessages.length, 'visible messages');
        }
      } catch (error) {
        console.error('[Chat] Error loading messages:', error);
      }
    };

    loadMessages();

    // Subscribe to new messages - SIMPLIFIED FILTER
    console.log('[Chat] Creating real-time channel...');
    const channel = supabase
      .channel(`chat:${options.meetingId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `meeting_id=eq.${options.meetingId}` // Simplified - no session filter
        },
        (payload) => {
          console.log('[Chat] ✅ Received real-time message:', payload);
          const msg = payload.new as any;
          
          // Filter by session on client side - normalize timestamps for comparison
          const msgSessionTime = new Date(msg.session_start_time).toISOString();
          if (msgSessionTime !== sessionStartTime) {
            console.log('[Chat] Message from different session, ignoring', {
              msgSessionTime,
              expectedSessionTime: sessionStartTime
            });
            return;
          }
          
          const newMessage: ChatMessageType = {
            attachment: msg.attachment_url
              ? { url: msg.attachment_url, name: msg.attachment_name, type: msg.attachment_type, size: msg.attachment_size }
              : null,
            id: msg.id,
            sender_id: msg.sender_id,
            sender_name: msg.sender_name,
            sender_role: msg.sender_role,
            content: msg.content,
            timestamp: new Date(msg.created_at),
            messageType: msg.message_type,
            isPrivate: msg.is_private,
            recipientId: msg.recipient_id
          };

          // Only add if message is visible to this participant (guest = session id).
          if (!newMessage.isPrivate ||
              newMessage.sender_id === (user?.id ?? localParticipant.sessionId) ||
              newMessage.recipientId === localParticipant.sessionId) {
            
            setChatMessages(prev => {
              // Prevent duplicates
              if (prev.some(m => m.id === newMessage.id)) {
                console.log('[Chat] Duplicate message, skipping');
                return prev;
              }
              console.log('[Chat] Adding message to state');
              return [...prev, newMessage];
            });
          } else {
            console.log('[Chat] Private message not for this user, skipping');
          }
        }
      )
      .subscribe((status) => {
        console.log('[Chat] Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[Chat] ✅ Successfully subscribed to real-time updates');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Chat] ❌ Subscription error:', status);
        }
      });

    return () => {
      console.log('[Chat] Cleaning up real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [isConnected, options.meetingId, chatLocalSessionId, user]);

  // enableSpeakerMedia — called by LiveChannelViewer after an invitation is accepted.
  // Bypasses the hasSpeakerPermission gate (the DB row was just written, Realtime fires async).
  // Directly calls setLocalAudio(true) / setLocalVideo(true) on the Daily call object.
  const enableSpeakerMedia = useCallback(async (withVideo: boolean) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      console.warn('[Daily] enableSpeakerMedia: no wrapper');
      return;
    }
    try {
      console.log('[Daily] enableSpeakerMedia: enabling audio', withVideo ? '+ video' : '');
      // Optimistically grant permission so toggleMic/toggleCamera stop being blocked
      setHasSpeakerPermission(true);

      // §1D — LiveKit viewer tokens have canPublish:false, so the SFU rejects a
      // publish until permissions are widened server-side. Do that before enabling.
      if (isLiveKitBackend() && options.viewerOnlyMode && !options.isHost) {
        await supabase.functions.invoke('livekit-token', {
          body: { action: 'grant-publish', roomName: options.roomName, context: { channelId: options.channelId } },
        });
      }

      const audioOn = await wrapper.setAudio(true);
      setIsMicOn(audioOn);

      if (withVideo) {
        const videoOn = await wrapper.setVideo(true);
        setIsCameraOn(videoOn);
        if (videoOn) {
          setTimeout(() => attachLocalVideoTrack(), 200);
        }
      }
    } catch (err) {
      console.error('[Daily] enableSpeakerMedia failed:', err);
      toast({ title: 'Media Error', description: 'Could not enable microphone/camera', variant: 'destructive' });
    }
  }, [attachLocalVideoTrack]);

  // Toggle microphone
  const toggleMic = useCallback(async () => {
    // Check viewer-only mode permission (moderators — host & live co-hosts — bypass).
    if (options.viewerOnlyMode && !isModeratorRef.current && !hasSpeakerPermission) {
      console.log('[Daily] toggleMic blocked: No speaker permission in viewer-only mode');
      toast({
        title: 'Permission Required',
        description: 'The host must grant you permission to speak',
        variant: 'destructive'
      });
      return;
    }

    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    // Prevent unmuting if host has muted this participant
    if (!isMicOn && hostMutedByHost && !options.isHost) {
      toast({
        title: 'Cannot Unmute',
        description: 'You have been muted by the host',
        variant: 'destructive'
      });
      return;
    }

    try {
      const newState = await wrapper.toggleAudio();
      setIsMicOn(newState);
      console.log('[Daily] Microphone toggled:', newState ? 'on' : 'off');
    } catch (error: any) {
      console.error('[Daily] Failed to toggle mic:', error);
      toast({
        title: 'Microphone Error',
        description: 'Failed to toggle microphone',
        variant: 'destructive'
      });
    }
  }, [isMicOn, hostMutedByHost, options.isHost, options.viewerOnlyMode, hasSpeakerPermission]);

  // Toggle camera
  const toggleCamera = useCallback(async () => {
    // Check viewer-only mode permission (moderators — host & live co-hosts — bypass).
    if (options.viewerOnlyMode && !isModeratorRef.current && !hasSpeakerPermission) {
      console.log('[Daily] toggleCamera blocked: No speaker permission in viewer-only mode');
      toast({
        title: 'Permission Required',
        description: 'The host must grant you permission to enable video',
        variant: 'destructive'
      });
      return;
    }

    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    // Prevent enabling video if host has disabled it
    if (!isCameraOn && videoDisabledByHost && !options.isHost) {
      toast({
        title: 'Cannot Enable Video',
        description: 'Your video has been disabled by the host',
        variant: 'destructive'
      });
      return;
    }

    try {
      const newState = await wrapper.toggleVideo();
      setIsCameraOn(newState);
      console.log('[Daily] Camera toggled:', newState ? 'on' : 'off');
      
      // Attach video track after enabling
      if (newState) {
        setTimeout(() => {
          attachLocalVideoTrack();
        }, 200);
      }
    } catch (error: any) {
      console.error('[Daily] Failed to toggle camera:', error);
      toast({
        title: 'Camera Error',
        description: 'Failed to toggle camera. Please check your device settings.',
        variant: 'destructive'
      });
    }
  }, [attachLocalVideoTrack, isCameraOn, videoDisabledByHost, options.isHost, options.viewerOnlyMode, hasSpeakerPermission]);

  // Virtual background: 'none' | 'blur' | <image URL>. Delegated to the LiveKit
  // wrapper's track processor; only meaningful on the LiveKit backend.
  const setVideoBackground = useCallback(async (mode: string) => {
    const wrapper = wrapperRef.current as any;
    if (!wrapper?.setCameraBackground) {
      toast({ title: 'Not supported', description: 'Virtual background is unavailable here.', variant: 'destructive' });
      return;
    }
    try {
      await wrapper.setCameraBackground(mode);
      setVideoBackgroundState(mode);
      // setProcessor() swaps the camera track's underlying output (the canvas
      // feed), same as a fresh camera-on track — without re-attaching, the
      // local <video> element keeps pointing at the now-replaced track and
      // goes dark/flickers, even though remote viewers get the new track fine
      // via the SFU. Mirrors the same re-attach toggleCamera() already does.
      setTimeout(() => {
        attachLocalVideoTrack();
        updateParticipants();
      }, 200);
    } catch (e: any) {
      console.error('[Daily] Failed to set video background:', e);
      toast({ title: 'Background Error', description: 'Could not apply the background.', variant: 'destructive' });
    }
  }, [attachLocalVideoTrack, updateParticipants]);

  // Start screen share
  const startScreenShare = useCallback(async () => {
    const wrapper = wrapperRef.current;
    if (!wrapper || isScreenSharing) return;

    try {
      const success = await wrapper.startScreenShare();
      if (success) {
        setIsScreenSharing(true);
        toast({
          title: 'Screen Sharing',
          description: 'You are now sharing your screen'
        });
      }
    } catch (error: any) {
      console.error('[Daily] Failed to start screen share:', error);
      
      if (error.message !== 'Permission denied') {
        toast({
          title: 'Screen Share Error',
          description: 'Could not start screen sharing',
          variant: 'destructive'
        });
      }
    }
  }, [isScreenSharing]);

  // Stop screen share
  const stopScreenShare = useCallback(async () => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !isScreenSharing) return;

    try {
      await wrapper.stopScreenShare();
      setIsScreenSharing(false);
    } catch (error: any) {
      console.error('[Daily] Failed to stop screen share:', error);
    }
  }, [isScreenSharing]);

  // Delete room — LiveKit rooms auto-close once empty, so this is a no-op.
  const deleteRoom = useCallback(async (): Promise<boolean> => {
    return true;
  }, []);

  // Listen for app messages from host for controls
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !isConnected) return;

    const handleAppMessage = async (event: any) => {
      const { data, fromId } = event;
      
      console.log('[useDailyRoom] Received app message:', data);

      // Only process control messages from host/co-host
      // Check if sender is owner (host) instead of relying on role system
      const senderParticipant = participants.find(p => p.sessionId === fromId);
      const senderRole = getParticipantRole(fromId);
      const isFromHost = senderParticipant?.isOwner || senderRole === 'host' || senderRole === 'co-host';
      
      console.log('[Control] Message from:', {
        fromId,
        senderRole,
        isOwner: senderParticipant?.isOwner,
        isFromHost,
        messageType: data.type
      });
      
      if (!isFromHost && (
        data.type === 'mute-participant' ||
        data.type === 'allow-unmute' ||
        data.type === 'mute-all' ||
        data.type === 'disable-video' ||
        data.type === 'allow-video' ||
        data.type === 'disable-all-video' ||
        data.type === 'remove-participant'
      )) {
        console.log('[Control] Ignoring control message from non-host');
        return;
      }

      const localPart = participants.find(p => p.isLocal);
      const localSessionId = localPart?.sessionId;

      switch (data.type) {
        case 'mute-participant':
          if (data.participantId === localSessionId) {
            console.log('[Control] Received mute command from host');
            setHostMutedByHost(true);
            
            // Directly turn off audio using wrapper
            const wrapper = wrapperRef.current;
            if (wrapper && isMicOn) {
              try {
                console.log('[Control] Turning off microphone...');
                await wrapper.setAudio(false);
                setIsMicOn(false);
                console.log('[Control] Microphone turned off successfully');
              } catch (error) {
                console.error('[Control] Failed to turn off microphone:', error);
              }
            }
            
            toast({ 
              title: 'You have been muted', 
              description: 'The host has muted your microphone',
              variant: 'destructive'
            });
          }
          break;

        case 'allow-unmute':
          if (data.participantId === localSessionId) {
            setHostMutedByHost(false);
            toast({ 
              title: 'You can now unmute', 
              description: 'Click the microphone button to speak'
            });
          }
          break;

        case 'request-unmute':
          if (data.participantId === localSessionId) {
            toast({ 
              title: `${data.requestedBy} is asking you to unmute`, 
              description: 'Click the microphone button if you wish to speak',
              duration: 10000
            });
          }
          break;

        case 'mute-all':
          if (!data.except?.includes(localSessionId)) {
            console.log('[Control] Received mute-all command from host');
            setHostMutedByHost(true);
            
            // Directly turn off audio using wrapper
            const wrapper = wrapperRef.current;
            if (wrapper && isMicOn) {
              try {
                console.log('[Control] Turning off microphone (mute-all)...');
                await wrapper.setAudio(false);
                setIsMicOn(false);
                console.log('[Control] Microphone turned off successfully');
              } catch (error) {
                console.error('[Control] Failed to turn off microphone:', error);
              }
            }
            
            toast({ 
              title: 'All participants muted', 
              description: 'The host has muted everyone',
              variant: 'destructive'
            });
          }
          break;

        case 'disable-video':
          if (data.participantId === localSessionId) {
            console.log('[Control] Received disable-video command from host');
            setVideoDisabledByHost(true);
            
            // Directly turn off video using wrapper
            const wrapper = wrapperRef.current;
            if (wrapper && isCameraOn) {
              try {
                console.log('[Control] Turning off camera...');
                await wrapper.setVideo(false);
                setIsCameraOn(false);
                console.log('[Control] Camera turned off successfully');
              } catch (error) {
                console.error('[Control] Failed to turn off camera:', error);
              }
            }
            
            toast({ 
              title: 'Your video has been stopped', 
              description: 'The host has stopped your camera',
              variant: 'destructive'
            });
          }
          break;

        case 'allow-video':
          if (data.participantId === localSessionId) {
            setVideoDisabledByHost(false);
            toast({ 
              title: 'You can now enable video', 
              description: 'Click the camera button if you wish to show video'
            });
          }
          break;

        case 'request-video':
          if (data.participantId === localSessionId) {
            toast({ 
              title: `${data.requestedBy} is asking you to enable video`, 
              description: 'Click the camera button if you wish to show yourself',
              duration: 10000
            });
          }
          break;

        case 'disable-all-video':
          if (!data.except?.includes(localSessionId)) {
            console.log('[Control] Received disable-all-video command from host');
            setVideoDisabledByHost(true);
            
            // Directly turn off video using wrapper
            const wrapper = wrapperRef.current;
            if (wrapper && isCameraOn) {
              try {
                console.log('[Control] Turning off camera (disable-all)...');
                await wrapper.setVideo(false);
                setIsCameraOn(false);
                console.log('[Control] Camera turned off successfully');
              } catch (error) {
                console.error('[Control] Failed to turn off camera:', error);
              }
            }
            
            toast({ 
              title: 'All video stopped', 
              description: 'The host has stopped everyone\'s cameras',
              variant: 'destructive'
            });
          }
          break;

        case 'remove-participant':
          if (data.participantId === localSessionId) {
            toast({ title: 'You have been removed from the meeting', variant: 'destructive' });
            await leaveRoom();
          }
          break;

        case 'role-change':
          if (data.participantId === localSessionId) {
            toast({ title: 'Your role has been updated', description: `You are now a ${data.role}` });
          }
          break;

        case 'admit-from-waiting-room':
          if (data.participantId === localSessionId) {
            toast({ title: 'You have been admitted to the meeting', description: 'Welcome!' });
          }
          break;

        case 'reject-from-waiting-room':
          if (data.participantId === localSessionId) {
            toast({ title: 'Access denied', description: 'The host has denied your entry', variant: 'destructive' });
            await leaveRoom();
          }
          break;

        case 'meeting-lock-change':
          setMeetingSettings(prev => ({ ...prev, isLocked: data.locked }));
          if (data.locked) {
            toast({ title: 'Meeting locked', description: 'No new participants can join' });
          }
          break;

        case 'settings-update':
          setMeetingSettings(prev => ({ ...prev, ...data.settings }));
          break;

        case 'spotlight-change':
          setSpotlightedParticipantId(data.participantId);
          break;

        case 'hand-raised':
          raisedHandsRef.current.add(data.participantId);
          setRaisedHands(prev =>
            prev.some(h => h.sessionId === data.participantId)
              ? prev
              : [...prev, { sessionId: data.participantId, userName: data.userName || 'Participant' }]
          );
          if (options.isHost) {
            toast({ title: 'Hand Raised', description: `${data.userName} raised their hand` });
          }
          break;

        case 'hand-lowered':
          raisedHandsRef.current.delete(data.participantId);
          setRaisedHands(prev => prev.filter(h => h.sessionId !== data.participantId));
          if (data.participantId === localSessionId) {
            setHandRaised(false);
          }
          break;

        case 'chat-message':
          console.log('[Chat] Received app message:', data.message);
          // App messages are now a fallback - database real-time is primary
          // Only add if we don't already have this message from database
          if (data.message) {
            setChatMessages(prev => {
              // Check if message already exists (came from database)
              if (prev.some(m => m.id === data.message.id)) {
                console.log('[Chat] App message already in state (from database), skipping');
                return prev;
              }
              // Add message from app message as fallback
              console.log('[Chat] Adding message from app message (fallback)');
              return [...prev, data.message];
            });
          }
          break;
      }
    };

    // Keep the ref pointed at the freshest handler so the LiveKit wrapper's onData
    // (DataReceived, wired at construction) always calls current state/closures (§3C).
    controlMessageHandlerRef.current = handleAppMessage;

    // LiveKit delivers advisory control messages via onData → controlMessageHandlerRef
    // above. (The former Daily app-message path was removed with the Daily backend.)

    return () => { controlMessageHandlerRef.current = null; };
  }, [isConnected, isMicOn, isCameraOn, toggleMic, toggleCamera, leaveRoom, participants, getParticipantRole, options.isHost]);

  // §3D — LiveKit waiting room, host side: mirror the meeting_waiting_room table
  // (status='waiting') into waitingRoomParticipants via Supabase realtime.
  useEffect(() => {
    // Co-hosts moderate too, so they also mirror the waiting room (not just the host).
    if (!isLiveKitBackend() || !isModerator || !isConnected) return;
    const meetingKey = options.meetingId ?? options.roomName;

    const load = async () => {
      const { data } = await supabase
        .from('meeting_waiting_room')
        .select('user_id, name, requested_at')
        .eq('meeting_id', meetingKey)
        .eq('status', 'waiting');
      setWaitingRoomParticipants((data ?? []).map((r: any) => ({
        session_id: r.user_id,
        user_id: r.user_id,
        user_name: (r.name && r.name.trim()) ? r.name : 'Guest',
        joinedWaitingRoomAt: new Date(r.requested_at),
      })));
    };

    load();
    const ch = supabase
      .channel(`waiting-room-${meetingKey}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_waiting_room', filter: `meeting_id=eq.${meetingKey}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isModerator, options.meetingId, options.roomName, isConnected]);

  // §3D — waiting room, guest side: while gated (connectionError==='waiting-room'),
  // watch our own row; on 'admitted' reconnect (livekit-token now issues a token).
  useEffect(() => {
    if (!isLiveKitBackend() || connectionError !== 'waiting-room' || !user?.id) return;
    const meetingKey = options.meetingId ?? options.roomName;

    const ch = supabase
      .channel(`waiting-self-${meetingKey}-${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'meeting_waiting_room', filter: `user_id=eq.${user.id}` }, (payload: any) => {
        if (payload.new?.meeting_id !== meetingKey) return;
        if (payload.new?.status === 'admitted') {
          setConnectionError(null);
          joinRoom();
        } else if (payload.new?.status === 'rejected') {
          setConnectionError('rejected');
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [connectionError, user?.id, options.meetingId, options.roomName, joinRoom]);

  // Cleanup function
  const cleanup = useCallback(() => {
    console.log('[Daily] Cleaning up...');
    
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    if (wrapperRef.current) {
      wrapperRef.current.destroy().catch(() => {});
      wrapperRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    setIsJoining(false);
    setIsMicOn(false);
    setIsCameraOn(false);
    setIsScreenSharing(false);
    setParticipants([]);
    setRoomUrl(null);
    setRoomToken(null);
    sessionStartTimeRef.current = null;
  }, []);

  // Attach local video track to video element - periodic check
  useEffect(() => {
    if (!wrapperRef.current || !localVideoRef.current || !isConnected) return;
    
    const checkAndAttach = () => {
      if (!isCameraOn) {
        // Camera is off, clear srcObject
        if (localVideoRef.current?.srcObject) {
          localVideoRef.current.srcObject = null;
        }
        return;
      }
      
      attachLocalVideoTrack();
    };
    
    // Attach immediately
    checkAndAttach();
    
    // Re-check periodically (but less frequently to avoid thrashing)
    const interval = setInterval(checkAndAttach, 2000);
    
    return () => clearInterval(interval);
  }, [isConnected, isCameraOn, attachLocalVideoTrack]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Calculate session duration
  const [sessionDuration, setSessionDuration] = useState(0);
  
  useEffect(() => {
    if (!isConnected || !sessionStartTimeRef.current) {
      setSessionDuration(0);
      return;
    }
    
    const interval = setInterval(() => {
      if (sessionStartTimeRef.current) {
        const duration = Math.floor((Date.now() - sessionStartTimeRef.current.getTime()) / 1000);
        setSessionDuration(duration);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isConnected]);

  // Computed values
  const localParticipant = participants.find(p => p.isLocal) || null;
  const remoteParticipants = participants.filter(p => !p.isLocal);
  const participantCount = participants.length;

  return {
    isConnected,
    isConnecting,
    isJoining,
    connectionError,
    roomUrl,
    roomToken,
    roomName: options.roomName,
    participants,
    participantStates,
    localParticipant,
    remoteParticipants,
    participantCount,
    waitingRoomParticipants,
    meetingSettings,
    isRecording,
    isModerator,
    spotlightedParticipantId,
    pinnedParticipantId,
    isMicOn,
    isCameraOn,
    isScreenSharing,
    handRaised,
    raisedHands,
    audioInputState,
    hasSpeakerPermission: effectiveSpeakerPermission,
    toggleMic,
    toggleCamera,
    videoBackground,
    setVideoBackground,
    enableSpeakerMedia,
    startScreenShare,
    stopScreenShare,
    joinRoom,
    leaveRoom,
    deleteRoom,
    endMeetingForAll,
    assignRole,
    getParticipantRole,
    muteParticipant,
    allowUnmute,
    requestUnmute,
    muteAll,
    disableParticipantVideo,
    allowVideo,
    requestVideo,
    disableAllVideo,
    removeParticipant,
    admitFromWaitingRoom,
    admitAllFromWaitingRoom,
    rejectFromWaitingRoom,
    lockMeeting,
    updateMeetingSettings,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    spotlightParticipant,
    pinParticipant,
    raiseHand,
    lowerHand,
    chatMessages,
    sendChatMessage,
    sessionStartTime: sessionStartTimeRef.current,
    sessionDuration,
    // Legacy handle kept for API compatibility: consumers still read `callObject`
    // behind `if (!callObject) return` guards. LiveKit has no raw call object (remote
    // control is server-side), so it is always null and those Daily-only paths no-op.
    callObject: null as DailyCall | null,
    localVideoRef,
    cleanup
  };
};
export default useDailyRoom;

/** Phase 2 seam alias — the canonical name going forward is `useVideoRoom`.
 *  Consumers may import either; the implementation is backend-agnostic. */
export const useVideoRoom = useDailyRoom;