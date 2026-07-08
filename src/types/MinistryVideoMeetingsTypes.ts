/// =====================================================
// MINISTRY VIDEO MEETINGS - TYPESCRIPT TYPES
// Add these to your database-types.ts file
// =====================================================

export type MeetingType = 'instant' | 'scheduled';
export type MeetingAccessLevel = 'public' | 'members' | 'leaders';
export type MinistryMemberRole = 'admin' | 'leader' | 'member' | 'volunteer';
export type MinistryMemberStatus = 'active' | 'inactive' | 'suspended' | 'pending';

// =====================================================
// MINISTRY VIDEO MEETINGS TABLE
// =====================================================

export interface MinistryVideoMeeting {
  id: string;
  ministry_id: string;
  title: string;
  description: string | null;
  room_name: string;
  scheduled_time: string | null;
  duration_minutes: number;
  max_participants: number;
  is_active: boolean;
  is_recurring: boolean;
  recurrence_pattern: string | null;
  meeting_type: MeetingType;
  access_level: MeetingAccessLevel;
  enable_recording: boolean;
  enable_chat: boolean;
  enable_screenshare: boolean;
  host_id: string;
  room_url: string | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  participant_count: number;
  updated_at: string;
}

// =====================================================
// MINISTRY MEMBERS TABLE
// =====================================================

export interface MinistryMember {
  id: string;
  ministry_id: string;
  user_id: string;
  role: MinistryMemberRole;
  status: MinistryMemberStatus;
  joined_at: string;
  left_at: string | null;
  created_at: string;
  updated_at: string;
  permissions_json: Record<string, any>;
  notes: string | null;
}

// =====================================================
// INSERT/UPDATE TYPES
// =====================================================

export type MinistryVideoMeetingInsert = Omit<
  MinistryVideoMeeting,
  'id' | 'created_at' | 'updated_at' | 'started_at' | 'ended_at' | 'participant_count'
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
  started_at?: string | null;
  ended_at?: string | null;
  participant_count?: number;
};

export type MinistryVideoMeetingUpdate = Partial<MinistryVideoMeetingInsert>;

export type MinistryMemberInsert = Omit<
  MinistryMember,
  'id' | 'created_at' | 'updated_at' | 'joined_at'
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
  joined_at?: string;
};

export type MinistryMemberUpdate = Partial<MinistryMemberInsert>;

// =====================================================
// VIEW TYPES
// =====================================================

export interface ActiveMinistryMeeting extends MinistryVideoMeeting {
  ministry_name: string | null;
  ministry_slug: string | null;
  host_email: string | null;
}

// =====================================================
// REQUEST/RESPONSE TYPES FOR API
// =====================================================

export interface CreateMeetingRequest {
  ministry_id: string;
  title: string;
  description?: string;
  meeting_type: MeetingType;
  scheduled_time?: string;
  duration_minutes?: number;
  max_participants?: number;
  access_level?: MeetingAccessLevel;
  enable_recording?: boolean;
  enable_chat?: boolean;
  enable_screenshare?: boolean;
}

export interface CreateMeetingResponse {
  success: boolean;
  meeting: MinistryVideoMeeting;
  room_url?: string;
  error?: string;
}

export interface JoinMeetingRequest {
  meeting_id: string;
  user_id: string;
}

export interface JoinMeetingResponse {
  success: boolean;
  room_url: string;
  meeting: MinistryVideoMeeting;
  error?: string;
}

// =====================================================
// HELPER FUNCTIONS FOR TYPE SAFETY
// =====================================================

export function isValidMeetingType(type: string): type is MeetingType {
  return type === 'instant' || type === 'scheduled';
}

export function isValidAccessLevel(level: string): level is MeetingAccessLevel {
  return level === 'public' || level === 'members' || level === 'leaders';
}

export function isValidMemberRole(role: string): role is MinistryMemberRole {
  return ['admin', 'leader', 'member', 'volunteer'].includes(role);
}

export function isValidMemberStatus(status: string): status is MinistryMemberStatus {
  return ['active', 'inactive', 'suspended', 'pending'].includes(status);
}

// =====================================================
// VALIDATION SCHEMAS (for runtime validation)
// =====================================================

export const MEETING_TYPE_VALUES: MeetingType[] = ['instant', 'scheduled'];
export const ACCESS_LEVEL_VALUES: MeetingAccessLevel[] = ['public', 'members', 'leaders'];
export const MEMBER_ROLE_VALUES: MinistryMemberRole[] = ['admin', 'leader', 'member', 'volunteer'];
export const MEMBER_STATUS_VALUES: MinistryMemberStatus[] = ['active', 'inactive', 'suspended', 'pending'];

// Default values
export const DEFAULT_MEETING_VALUES = {
  duration_minutes: 60,
  max_participants: 50,
  access_level: 'members' as MeetingAccessLevel,
  enable_recording: false,
  enable_chat: true,
  enable_screenshare: true,
  is_active: false,
  is_recurring: false,
  participant_count: 0,
} as const;

// =====================================================
// EXAMPLE USAGE IN COMPONENTS
// =====================================================

/*
// In your React component:

import { MinistryVideoMeeting, CreateMeetingRequest, DEFAULT_MEETING_VALUES } from '@/types/ministry-video-meetings';

const createMeeting = async (data: CreateMeetingRequest) => {
  const meetingData = {
    ...data,
    room_name: `ministry-${data.ministry_id}-${Date.now()}`,
    host_id: user?.id,
    ...DEFAULT_MEETING_VALUES,
    is_active: data.meeting_type === 'instant',
  };

  const { data: meeting, error } = await supabase
    .from('ministry_video_meetings')
    .insert(meetingData)
    .select()
    .single();

  if (error) throw error;
  return meeting as MinistryVideoMeeting;
};
*/