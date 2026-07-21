// Live Channel Types with Extended Fields
export interface LiveChannel {
  id: string;
  name: string;
  description?: string;
  category: ChannelCategory;
  owner_id: string;
  owner_name?: string;
  
  // NEW: Image fields
  featured_image_url?: string;
  channel_logo_url?: string;
  
  // Existing fields
  cover_image_url?: string;
  is_live: boolean;
  is_video_enabled: boolean;
  is_recording: boolean;
  viewer_count: number;
  total_followers: number;
  total_broadcasts: number;
  last_live_at?: string;
  daily_room_name?: string;
  created_at: string;
  updated_at: string;
  
  // ADDED: New fields
  is_ministry?: boolean;
  replayAccessLevel?: ReplayAccessLevel;
}

export interface ChannelEvent {
  id: string;
  channel_id: string;
  title: string;
  description?: string;
  scheduled_start: string;
  recurrence_rule?: string;
  status: 'upcoming' | 'live' | 'ended' | 'cancelled';
  created_at: string;
  updated_at: string;
  created_by?: string;
  
  // Event metadata
  duration_minutes?: number;
  is_video_enabled: boolean;
  max_participants?: number;
  cover_image_url?: string;
  
  // Stats
  total_registered: number;
  total_attended: number;
  
  // Relations
  channel?: LiveChannel;
}

export interface EventRegistration {
  id: string;
  event_id: string;
  user_id: string;
  user_name?: string;
  registered_at: string;
  attended: boolean;
}

export interface ChannelBroadcast {
  id: string;
  channel_id: string;
  event_id?: string;
  title: string;
  is_video: boolean;
  daily_room_name: string;
  daily_room_id?: string;
  recording_status: 'none' | 'recording' | 'processing' | 'completed' | 'failed';
  recording_url?: string;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  peak_viewers?: number;
  total_viewers?: number;
  created_at: string;
  updated_at: string;
}

export interface ChannelFollower {
  id: string;
  channel_id: string;
  user_id: string;
  user_name?: string;
  followed_at: string;
  notifications_enabled: boolean;
}

export interface ChannelCoHost {
  id: string;
  channel_id: string;
  broadcast_id?: string;
  user_id: string;
  user_name?: string;
  role: 'co_host' | 'moderator' | 'guest';
  can_stream: boolean;
  can_moderate_chat: boolean;
  added_at: string;
  removed_at?: string;
}

export interface ChannelChatMessage {
  id: string;
  channel_id: string;
  user_id: string;
  user_name: string;
  message: string;
  message_type: 'text' | 'system' | 'announcement' | 'emoji' | 'prayer_request';
  parent_message_id?: string;
  is_pinned: boolean;
  created_at: string;
}

export type ChannelCategory = 
  | 'prayer' 
  | 'worship' 
  | 'teaching' 
  | 'devotional' 
  | 'testimony' 
  | 'counselling' 
  | 'general';

export const CHANNEL_CATEGORIES: Array<{ value: ChannelCategory; label: string }> = [
  { value: 'prayer', label: 'Prayer' },
  { value: 'worship', label: 'Worship' },
  { value: 'teaching', label: 'Teaching' },
  { value: 'devotional', label: 'Devotional' },
  { value: 'testimony', label: 'Testimony' },
  { value: 'counselling', label: 'Counselling' },
  { value: 'general', label: 'General' }
];

// Participant role types for permission management
export type ParticipantRole = 'host' | 'co-host' | 'speaker' | 'attendee';

// Permission presets for each role
export interface RolePermissions {
  canUnmuteAudio: boolean;
  canEnableVideo: boolean;
  canShareScreen: boolean;
  canChat: boolean;
  canManageParticipants: boolean;
  canRecord: boolean;
  canEndMeeting: boolean;
  canAssignRoles: boolean;
  canLockMeeting: boolean;
}

// Participant state for role-based system
export interface ParticipantState {
  session_id: string;
  user_id: string;
  user_name: string;
  role: ParticipantRole;
  isLocal: boolean;
  isInWaitingRoom: boolean;
  hasAudio: boolean;
  hasVideo: boolean;
  hasScreenShare: boolean;
  audioEnabled: boolean; // Permission to use audio
  videoEnabled: boolean; // Permission to use video
  handRaised: boolean;
  isSpotlighted: boolean;
  isPinned: boolean;
  isMutedByHost: boolean;
  joinedAt: Date;
  videoTrack?: MediaStreamTrack;
  audioTrack?: MediaStreamTrack;
  screenVideoTrack?: MediaStreamTrack;
  screenAudioTrack?: MediaStreamTrack;
}

// Meeting settings for Zoom-like controls
export interface MeetingSettings {
  isLocked: boolean;
  waitingRoomEnabled: boolean;
  muteOnEntry: boolean;
  videoOnEntry: boolean;
  allowUnmute: boolean;
  allowVideo: boolean;
  allowScreenShare: boolean;
  allowChat: boolean;
  chatMode: 'all' | 'host-only' | 'disabled';
  recordingEnabled: boolean;
  recordingStatus: 'none' | 'recording' | 'paused' | 'processing' | 'completed';
  hostVideoOnEntry: boolean;
  coHostsEnabled: boolean;
}

// Chat message types
export interface ChatAttachment {
  url: string;
  name: string;
  type: string;   // MIME
  size: number;   // bytes
}

export interface ChatMessageType {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: ParticipantRole;
  content: string;
  timestamp: Date;
  messageType: 'text' | 'system' | 'host-announcement';
  isPrivate: boolean;
  recipientId?: string;
  attachment?: ChatAttachment | null;
}

// Waiting room participant
export interface WaitingRoomParticipant {
  session_id: string;
  user_id: string;
  user_name: string;
  joinedWaitingRoomAt: Date;
}

export interface DailyParticipant {
  session_id: string;
  user_id: string;
  user_name: string;
  local: boolean;
  audio: boolean;
  video: boolean;
  screen: boolean;
  isOwner?: boolean;
  videoTrack?: MediaStreamTrack;
  audioTrack?: MediaStreamTrack;
  screenVideoTrack?: MediaStreamTrack;
  screenAudioTrack?: MediaStreamTrack;
}

export interface DailyRoomState {
  isConnected: boolean;
  isConnecting: boolean;
  isJoining: boolean;
  connectionError: string | null;
  localParticipant: DailyParticipant | null;
  remoteParticipants: DailyParticipant[];
  isMicOn: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  sessionDuration: number;
  meetingSettings: MeetingSettings;
  participants: ParticipantState[];
  waitingRoomParticipants: WaitingRoomParticipant[];
  joinRoom: () => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
  // Host/Co-host controls
  assignRole: (participantId: string, role: ParticipantRole) => Promise<void>;
  muteParticipant: (participantId: string) => Promise<void>;
  muteAll: () => Promise<void>;
  disableParticipantVideo: (participantId: string) => Promise<void>;
  disableAllVideo: () => Promise<void>;
  removeParticipant: (participantId: string) => Promise<void>;
  admitFromWaitingRoom: (participantId: string) => Promise<void>;
  lockMeeting: (locked: boolean) => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  spotlightParticipant: (participantId: string | null) => Promise<void>;
  pinParticipant: (participantId: string | null) => void;
  raiseHand: () => Promise<void>;
  lowerHand: (participantId?: string) => Promise<void>;
}

export const STORAGE_BUCKETS = {
  CHANNEL_LOGOS: 'channel-logos',
  CHANNEL_FEATURED: 'channel-featured',
  EVENT_COVERS: 'event-covers'
} as const;

// ADDED: New type definition
export type ReplayAccessLevel = "none" | "stream" | "download";

// Role permission presets
export const ROLE_PERMISSIONS: Record<ParticipantRole, RolePermissions> = {
  host: {
    canUnmuteAudio: true,
    canEnableVideo: true,
    canShareScreen: true,
    canChat: true,
    canManageParticipants: true,
    canRecord: true,
    canEndMeeting: true,
    canAssignRoles: true,
    canLockMeeting: true,
  },
  'co-host': {
    canUnmuteAudio: true,
    canEnableVideo: true,
    canShareScreen: true,
    canChat: true,
    canManageParticipants: true,
    canRecord: true,
    canEndMeeting: false,
    canAssignRoles: false,
    canLockMeeting: false,
  },
  speaker: {
    canUnmuteAudio: true,
    canEnableVideo: true,
    canShareScreen: true,
    canChat: true,
    canManageParticipants: false,
    canRecord: false,
    canEndMeeting: false,
    canAssignRoles: false,
    canLockMeeting: false,
  },
  attendee: {
    canUnmuteAudio: false,
    canEnableVideo: false,
    canShareScreen: false,
    canChat: true,
    canManageParticipants: false,
    canRecord: false,
    canEndMeeting: false,
    canAssignRoles: false,
    canLockMeeting: false,
  },
};

// Helper to check if user has permission.
// Defensive: LiveKit mints roles like 'viewer'/'egress' that aren't in
// ROLE_PERMISSIONS (they have no publish rights). Any unknown role → no permission,
// instead of crashing on ROLE_PERMISSIONS[role] being undefined.
export const hasPermission = (role: ParticipantRole, permission: keyof RolePermissions): boolean => {
  return ROLE_PERMISSIONS[role]?.[permission] ?? false;
};

// Default meeting settings
export const DEFAULT_MEETING_SETTINGS: MeetingSettings = {
  isLocked: false,
  waitingRoomEnabled: false,
  muteOnEntry: false,
  videoOnEntry: false,
  allowUnmute: true,
  allowVideo: true,
  allowScreenShare: true,
  allowChat: true,
  chatMode: 'all',
  recordingEnabled: false,
  recordingStatus: 'none',
  hostVideoOnEntry: true,
  coHostsEnabled: true,
};