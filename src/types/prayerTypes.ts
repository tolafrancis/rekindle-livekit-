// =====================================================
// PRAYER TYPES - BACKWARD COMPATIBLE WITH PRAYER WATCH
// =====================================================

// ============= EXISTING TYPES (Keep these!) =============
export interface PrayerPoint {
  title: string;
  content: string;
  scripture?: string;
  scriptureText?: string;
  reflection?: string;
  duration?: number; // Duration in seconds, optional for backward compatibility
}
export interface PrayerChallenge {
  id: string;
  title: string;
  description: string;
  category: string;
  session_type: 'quick' | 'standard' | 'deep';
  prayer_points: PrayerPoint[];
  instrumental_id?: string;
  creator_id: string;
  creator_name?: string;
  live_session_date?: string;
  live_session_duration?: number;
  live_room_id?: string;
  is_active: boolean;
  created_at: string;
  // Prayer reminder settings
  reminder_enabled?: boolean;
  reminder_frequency?: 'hourly' | 'daily' | 'weekly' | 'monthly';
  reminder_time?: string; // Format: "HH:MM" for daily, or specific time
  reminder_days?: number[]; // 0-6 for weekly (0=Sunday), 1-31 for monthly
}

export interface ChallengeParticipant {
  id: string;
  challenge_id: string;
  user_id: string;
  user_name?: string;
  completed_sessions: number;
  current_streak: number;
  last_session_date?: string;
  joined_at: string;
  // User-specific reminder preferences
  reminder_enabled?: boolean;
  reminder_frequency?: 'hourly' | 'daily' | 'weekly' | 'monthly';
  reminder_time?: string; // Format: "HH:MM"
  reminder_days?: number[]; // For weekly/monthly reminders
}

export interface PrayerGroup {
  id: string;
  name: string;
  description?: string;
  is_private: boolean;
  category: string;
  image_url?: string;
  admin_ids: string[];
  member_count: number;
  is_active: boolean;
  created_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  user_name?: string;
  role: 'admin' | 'moderator' | 'member';
  is_muted: boolean;
  joined_at: string;
}

export interface GroupMessage {
  id: string;
  group_id: string;
  user_id: string;
  user_name?: string;
  message_type: 'text' | 'prayer_request' | 'testimony' | 'scripture' | 'announcement' | 'voice_note';
  content: string;
  scripture_ref?: string;
  voice_note_url?: string;
  voice_note_duration?: number;
  amen_count: number;
  amen_users: string[];
  is_pinned: boolean;
  is_deleted: boolean;
  created_at: string;
}

export interface UserTier {
  user_id: string;
  tier: number;
  tier_name: string;
}

// KEEP THESE EXPORTS - Other files depend on them!
export const SESSION_DURATIONS = {
  quick: { minutes: 2, label: 'Quick Session (2 min)', duration: 2 },
  standard: { minutes: 5, label: 'Standard Session (5 min)', duration: 5 },
  deep: { minutes: 10, label: 'Deep Guided (10 min)', duration: 10 }
};

export const CHALLENGE_CATEGORIES = [
  'Healing', 'Thanksgiving', 'Intercession', 'Revival', 
  'Family', 'Career', 'Spiritual Growth', 'Missions'
];

// ============= NEW PRAYER WATCH TYPES =============
export interface PrayerWatchTopic {
  id: string;
  ministry_id?: string;
  title: string;
  description: string;
  cover_image_url?: string;
  is_featured: boolean;
  is_published: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Extended fields
  slots?: PrayerWatchSlot[];
  progress?: PrayerWatchUserProgress[];
  is_bookmarked?: boolean;
  total_slots?: number;
}

export interface PrayerWatchSlot {
  id: string;
  prayer_watch_id: string;
  time_slot: string; // Format: "HH:MM:SS" e.g., "06:00:00"
  prayer_point: string;
  study_content?: string;
  scripture_reference?: string;
  scripture_text?: string;
  reflection?: string;
  audio_url?: string;
  image_url?: string;
  is_published: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
  // Extended fields
  is_current?: boolean;
  is_past?: boolean;
  is_completed?: boolean;
}

export interface PrayerWatchUserProgress {
  id: string;
  user_id: string;
  prayer_watch_id: string;
  time_slot: string;
  observed_at: string;
  completed: boolean;
  duration_minutes: number;
  notes?: string;
  created_at: string;
}

export interface PrayerWatchBookmark {
  id: string;
  user_id: string;
  prayer_watch_id: string;
  created_at: string;
}

// Standard time slots (fixed, non-editable)
export const PRAYER_WATCH_TIME_SLOTS = [
  { value: '06:00:00', label: '6:00 AM', displayOrder: 1 },
  { value: '09:00:00', label: '9:00 AM', displayOrder: 2 },
  { value: '12:00:00', label: '12:00 PM', displayOrder: 3 },
  { value: '15:00:00', label: '3:00 PM', displayOrder: 4 },
  { value: '18:00:00', label: '6:00 PM', displayOrder: 5 },
  { value: '21:00:00', label: '9:00 PM', displayOrder: 6 },
  { value: '00:00:00', label: '12:00 AM', displayOrder: 7 },
] as const;

// Helper function to format time slot
export const formatTimeSlot = (timeSlot: string): string => {
  const slot = PRAYER_WATCH_TIME_SLOTS.find(s => s.value === timeSlot);
  return slot?.label || timeSlot;
};

// Helper function to get current time slot
export const getCurrentTimeSlot = (): string => {
  const now = new Date();
  const hours = now.getHours();
  
  if (hours >= 0 && hours < 6) return '00:00:00';
  if (hours >= 6 && hours < 9) return '06:00:00';
  if (hours >= 9 && hours < 12) return '09:00:00';
  if (hours >= 12 && hours < 15) return '12:00:00';
  if (hours >= 15 && hours < 18) return '15:00:00';
  if (hours >= 18 && hours < 21) return '18:00:00';
  return '21:00:00';
};

// Convert PrayerWatchSlot to PrayerPoint (for compatibility)
export const convertSlotToPrayerPoints = (slot: PrayerWatchSlot): PrayerPoint[] => {
  return [
    {
      title: slot.prayer_point,
      content: slot.study_content || slot.prayer_point,
      scripture: slot.scripture_reference,
      scriptureText: slot.scripture_text,
      reflection: slot.reflection
    }
  ];
};