// =====================================================
// PRAYER CHALLENGES - COMPREHENSIVE TYPESCRIPT TYPES
// Rekindle Spiritual Mentorship Application
// =====================================================

// =====================================================
// 1. CORE CHALLENGE TYPES
// =====================================================

export type SessionType = 'quick' | 'standard' | 'deep';
export type ChallengeType = 'individual' | 'group' | 'team' | 'ministry';
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';
export type ChallengeVisibility = 'public' | 'private' | 'ministry_only' | 'members_only';
export type ParticipantStatus = 'pending' | 'active' | 'completed' | 'dropped' | 'paused';
export type CommentType = 'comment' | 'testimony' | 'question' | 'encouragement' | 'answered_prayer';
export type ReactionType = 'amen' | 'prayer' | 'encouragement' | 'heart' | 'praise';
export type SharePlatform = 'facebook' | 'twitter' | 'whatsapp' | 'email' | 'link' | 'instagram' | 'telegram';
export type MilestoneType = 'sessions' | 'days' | 'streak' | 'points' | 'time' | 'custom';
export type BadgeType = 'completion' | 'streak' | 'participation' | 'milestone' | 'special' | 'seasonal';
export type BadgeRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type TeamRole = 'leader' | 'member';
export type PrayerRequestType = 'personal' | 'family' | 'health' | 'work' | 'ministry' | 'nation' | 'other';
export type PrayerRequestStatus = 'active' | 'answered' | 'ongoing' | 'archived';
export type PrayerRequestPriority = 'low' | 'normal' | 'high' | 'urgent';
export type UserTierLevel = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'flagged';
export type NotificationType = 
  | 'challenge_start'
  | 'challenge_end'
  | 'daily_reminder'
  | 'streak_milestone'
  | 'badge_earned'
  | 'milestone_achieved'
  | 'team_update'
  | 'comment_reply'
  | 'prayer_answered'
  | 'leaderboard_update'
  | 'challenge_invite'
  | 'encouragement';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'cancelled';

// =====================================================
// 2. PRAYER POINT STRUCTURE
// =====================================================

export interface PrayerPoint {
  title: string;
  content: string;
  scripture?: string;
  scriptureText?: string;
  reflection?: string;
  duration?: number; // Duration in seconds
  order?: number;
}

export interface ResourceLink {
  title: string;
  url: string;
  type?: 'article' | 'video' | 'audio' | 'pdf' | 'external';
  description?: string;
}

// =====================================================
// 3. ENHANCED CHALLENGE INTERFACE
// =====================================================

export interface EnhancedPrayerChallenge {
  id: string;
  
  // Basic Information
  title: string;
  description?: string;
  category: string;
  tags?: string[];
  
  // Challenge Configuration
  session_type: SessionType;
  challenge_type: ChallengeType;
  duration_days: number;
  difficulty_level: DifficultyLevel;
  
  // Content
  prayer_points: PrayerPoint[];
  
  // Media & Resources
  instrumental_id?: string;
  cover_image_url?: string;
  video_intro_url?: string;
  resource_links?: ResourceLink[];
  
  // Scheduling
  start_date?: string;
  end_date?: string;
  live_session_date?: string;
  live_session_duration?: number;
  live_room_id?: string;
  reminder_times?: string[];
  
  // Creator & Ministry
  creator_id: string;
  creator_name?: string;
  ministry_id?: string;
  
  // Visibility & Access
  is_active: boolean;
  is_featured: boolean;
  is_private: boolean;
  requires_approval: boolean;
  visibility: ChallengeVisibility;
  
  // Gamification
  points_per_session: number;
  bonus_points_streak: number;
  completion_badge_id?: string;
  
  // Requirements
  min_participants: number;
  max_participants?: number;
  join_deadline?: string;
  prerequisites?: string[];
  
  // Statistics
  total_participants: number;
  total_sessions_completed: number;
  average_completion_rate: number;
  total_prayer_time_minutes: number;
  
  // Metadata
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

// =====================================================
// 4. PARTICIPANT TRACKING
// =====================================================

export interface ChallengeParticipant {
  id: string;
  challenge_id: string;
  user_id: string;
  user_name?: string;
  
  // Status
  status: ParticipantStatus;
  joined_at: string;
  completed_at?: string;
  dropped_at?: string;
  drop_reason?: string;
  
  // Progress
  completed_sessions: number;
  total_prayer_time_minutes: number;
  current_streak: number;
  longest_streak: number;
  last_session_date?: string;
  
  // Detailed Progress
  prayer_points_progress: Record<string, {
    completed: boolean;
    completedAt: string;
    duration: number;
  }>;
  daily_checkins: DailyCheckin[];
  
  // Gamification
  total_points_earned: number;
  badges_earned: string[];
  rank?: number;
  
  // Team
  team_id?: string;
  team_role?: TeamRole;
  
  // Settings
  reminder_enabled: boolean;
  notification_preferences: NotificationPreferences;
  
  // Metadata
  created_at: string;
  updated_at: string;
}

export interface DailyCheckin {
  date: string;
  completed: boolean;
  prayerTime: number; // seconds
  notes?: string;
}

export interface NotificationPreferences {
  push_enabled?: boolean;
  email_enabled?: boolean;
  sms_enabled?: boolean;
  daily_reminder?: boolean;
  team_updates?: boolean;
  leaderboard_updates?: boolean;
  encouragement_messages?: boolean;
}

// =====================================================
// 5. SESSION LOGGING
// =====================================================

export interface ChallengeSessionLog {
  id: string;
  challenge_id: string;
  participant_id: string;
  user_id: string;
  
  // Session Details
  session_date: string;
  session_start: string;
  session_end?: string;
  duration_minutes?: number;
  
  // Content
  prayer_points_completed: string[];
  scripture_references_used: string[];
  
  // Quality Metrics
  completion_percentage: number;
  engagement_score?: number; // 1-10
  
  // Notes
  notes?: string;
  reflections?: string;
  answered_prayers?: string[];
  
  // Context
  instrumental_used?: string;
  location_type?: string;
  
  // Metadata
  created_at: string;
}

// =====================================================
// 6. MILESTONES & ACHIEVEMENTS
// =====================================================

export interface ChallengeMilestone {
  id: string;
  challenge_id: string;
  
  // Definition
  title: string;
  description?: string;
  icon?: string;
  milestone_type: MilestoneType;
  
  // Criteria
  target_value: number;
  criteria_json?: Record<string, any>;
  
  // Rewards
  points_reward: number;
  badge_reward_id?: string;
  unlock_content?: string;
  
  // Display
  display_order: number;
  is_secret: boolean;
  
  // Metadata
  created_at: string;
}

export interface ParticipantMilestoneAchievement {
  id: string;
  participant_id: string;
  milestone_id: string;
  challenge_id: string;
  user_id: string;
  
  // Achievement
  achieved_at: string;
  value_achieved: number;
  
  // Rewards
  points_claimed: number;
  badge_claimed: boolean;
  
  // Metadata
  created_at: string;
}

// =====================================================
// 7. SOCIAL FEATURES
// =====================================================

export interface ChallengeComment {
  id: string;
  challenge_id: string;
  user_id: string;
  user_name?: string;
  user_avatar_url?: string;
  
  // Content
  comment_type: CommentType;
  content: string;
  
  // References
  parent_comment_id?: string;
  prayer_point_reference?: string;
  
  // Media
  attachments?: Attachment[];
  
  // Engagement
  amen_count: number;
  prayer_count: number;
  encouragement_count: number;
  
  // Moderation
  is_featured: boolean;
  is_hidden: boolean;
  is_pinned: boolean;
  flagged_count: number;
  moderation_status: ModerationStatus;
  
  // Metadata
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  
  // Populated fields (not in DB)
  replies?: ChallengeComment[];
  user_reaction?: ReactionType;
}

export interface Attachment {
  type: 'image' | 'video' | 'audio';
  url: string;
  thumbnail_url?: string;
  duration?: number;
  size?: number;
}

export interface ChallengeCommentReaction {
  id: string;
  comment_id: string;
  user_id: string;
  reaction_type: ReactionType;
  created_at: string;
}

export interface ChallengeShare {
  id: string;
  challenge_id: string;
  shared_by_user_id: string;
  
  // Share Details
  share_platform: SharePlatform;
  share_message?: string;
  referral_code?: string;
  
  // Tracking
  views_count: number;
  clicks_count: number;
  conversions_count: number;
  
  // Metadata
  created_at: string;
}

// =====================================================
// 8. TEAM/GROUP CHALLENGES
// =====================================================

export interface ChallengeTeam {
  id: string;
  challenge_id: string;
  
  // Team Info
  team_name: string;
  team_description?: string;
  team_avatar_url?: string;
  team_color?: string;
  
  // Leadership
  leader_user_id: string;
  
  // Stats
  member_count: number;
  total_sessions_completed: number;
  total_points_earned: number;
  average_completion_rate: number;
  team_rank?: number;
  
  // Settings
  is_private: boolean;
  join_code?: string;
  max_members: number;
  
  // Metadata
  created_at: string;
  updated_at: string;
  
  // Populated fields
  members?: ChallengeParticipant[];
  leader?: {
    id: string;
    name: string;
    avatar_url?: string;
  };
}

export interface TeamPrayerRequest {
  id: string;
  team_id: string;
  challenge_id: string;
  user_id: string;
  
  // Request
  title: string;
  description?: string;
  request_type: PrayerRequestType;
  
  // Status
  status: PrayerRequestStatus;
  priority: PrayerRequestPriority;
  
  // Engagement
  prayer_count: number;
  prayed_by_users: string[];
  
  // Answer
  is_answered: boolean;
  answer_testimony?: string;
  answered_at?: string;
  
  // Metadata
  created_at: string;
  updated_at: string;
  expires_at?: string;
}

// =====================================================
// 9. LEADERBOARDS
// =====================================================

export interface ChallengeLeaderboardEntry {
  challenge_id: string;
  user_id: string;
  user_name?: string;
  completed_sessions: number;
  total_prayer_time_minutes: number;
  current_streak: number;
  longest_streak: number;
  total_points_earned: number;
  status: ParticipantStatus;
  joined_at: string;
  team_id?: string;
  overall_rank: number;
  streak_rank: number;
  time_rank: number;
}

export interface ChallengeTeamLeaderboardEntry {
  challenge_id: string;
  team_id: string;
  team_name: string;
  member_count: number;
  total_sessions_completed: number;
  total_points_earned: number;
  average_completion_rate: number;
  team_rank: number;
}

// =====================================================
// 10. ANALYTICS & STATISTICS
// =====================================================

export interface ChallengeAnalyticsDaily {
  id: string;
  challenge_id: string;
  analytics_date: string;
  
  // Participation
  new_participants: number;
  active_participants: number;
  dropped_participants: number;
  total_participants: number;
  
  // Activity
  sessions_completed: number;
  total_prayer_time_minutes: number;
  average_session_duration: number;
  
  // Engagement
  comments_posted: number;
  testimonies_shared: number;
  shares_count: number;
  reactions_count: number;
  
  // Completion
  daily_completion_rate: number;
  average_engagement_score: number;
  
  // Peak Times
  peak_prayer_hour?: number;
  peak_day_of_week?: number;
  
  // Metadata
  created_at: string;
  updated_at: string;
}

export interface UserChallengeStatistics {
  user_id: string;
  
  // Overall Stats
  total_challenges_joined: number;
  total_challenges_completed: number;
  total_challenges_dropped: number;
  
  // Performance
  total_sessions_completed: number;
  total_prayer_time_minutes: number;
  total_points_earned: number;
  
  // Streaks
  current_global_streak: number;
  longest_global_streak: number;
  
  // Achievements
  total_badges_earned: number;
  total_milestones_achieved: number;
  
  // Engagement
  total_comments_posted: number;
  total_testimonies_shared: number;
  total_prayers_said: number;
  
  // Rankings
  global_rank?: number;
  tier_level?: UserTierLevel;
  
  // Metadata
  last_activity_at?: string;
  created_at: string;
  updated_at: string;
}

// =====================================================
// 11. BADGES & REWARDS
// =====================================================

export interface ChallengeBadge {
  id: string;
  
  // Badge Info
  badge_name: string;
  badge_description?: string;
  badge_icon_url?: string;
  badge_color?: string;
  
  // Criteria
  badge_type: BadgeType;
  criteria_json: Record<string, any>;
  
  // Value
  points_value: number;
  rarity: BadgeRarity;
  
  // Visibility
  is_active: boolean;
  is_secret: boolean;
  display_order: number;
  
  // Metadata
  created_at: string;
  updated_at: string;
}

export interface UserBadgeAward {
  id: string;
  user_id: string;
  badge_id: string;
  challenge_id?: string;
  
  // Award
  awarded_at: string;
  award_reason?: string;
  
  // Display
  is_displayed: boolean;
  display_priority: number;
  
  // Metadata
  created_at: string;
  
  // Populated fields
  badge?: ChallengeBadge;
}

// =====================================================
// 12. NOTIFICATIONS
// =====================================================

export interface ChallengeNotification {
  id: string;
  user_id: string;
  challenge_id?: string;
  
  // Notification
  notification_type: NotificationType;
  title: string;
  message: string;
  
  // Delivery
  send_push: boolean;
  send_email: boolean;
  send_sms: boolean;
  
  // Scheduling
  scheduled_for: string;
  delivered_at?: string;
  
  // Status
  status: NotificationStatus;
  delivery_attempts: number;
  error_message?: string;
  
  // Actions
  action_url?: string;
  action_type?: string;
  action_data?: Record<string, any>;
  
  // Metadata
  created_at: string;
}

// =====================================================
// 13. REQUEST/RESPONSE TYPES
// =====================================================

export interface CreateChallengeRequest {
  title: string;
  description?: string;
  category: string;
  tags?: string[];
  session_type: SessionType;
  challenge_type?: ChallengeType;
  duration_days?: number;
  difficulty_level?: DifficultyLevel;
  prayer_points: PrayerPoint[];
  instrumental_id?: string;
  cover_image_url?: string;
  video_intro_url?: string;
  resource_links?: ResourceLink[];
  start_date?: string;
  end_date?: string;
  live_session_date?: string;
  live_session_duration?: number;
  visibility?: ChallengeVisibility;
  is_private?: boolean;
  requires_approval?: boolean;
  min_participants?: number;
  max_participants?: number;
  join_deadline?: string;
  points_per_session?: number;
  bonus_points_streak?: number;
  reminder_times?: string[];
}

export interface UpdateChallengeRequest extends Partial<CreateChallengeRequest> {
  id: string;
}

export interface JoinChallengeRequest {
  challenge_id: string;
  team_id?: string;
  message?: string;
}

export interface LogSessionRequest {
  challenge_id: string;
  session_start: string;
  session_end?: string;
  duration_minutes?: number;
  prayer_points_completed: string[];
  scripture_references_used?: string[];
  completion_percentage?: number;
  engagement_score?: number;
  notes?: string;
  reflections?: string;
  answered_prayers?: string[];
  instrumental_used?: string;
  location_type?: string;
}

export interface CreateCommentRequest {
  challenge_id: string;
  comment_type?: CommentType;
  content: string;
  parent_comment_id?: string;
  prayer_point_reference?: string;
  attachments?: Attachment[];
}

export interface CreateTeamRequest {
  challenge_id: string;
  team_name: string;
  team_description?: string;
  team_avatar_url?: string;
  team_color?: string;
  is_private?: boolean;
  max_members?: number;
}

export interface CreateTeamPrayerRequest {
  team_id: string;
  title: string;
  description?: string;
  request_type: PrayerRequestType;
  priority?: PrayerRequestPriority;
}

export interface ShareChallengeRequest {
  challenge_id: string;
  share_platform: SharePlatform;
  share_message?: string;
}

// =====================================================
// 14. FILTER & QUERY TYPES
// =====================================================

export interface ChallengeFilters {
  category?: string[];
  session_type?: SessionType[];
  challenge_type?: ChallengeType[];
  difficulty_level?: DifficultyLevel[];
  visibility?: ChallengeVisibility[];
  is_active?: boolean;
  is_featured?: boolean;
  ministry_id?: string;
  creator_id?: string;
  start_date_from?: string;
  start_date_to?: string;
  tags?: string[];
  search?: string;
}

export interface ParticipantFilters {
  challenge_id?: string;
  user_id?: string;
  status?: ParticipantStatus[];
  team_id?: string;
  min_sessions?: number;
  min_streak?: number;
  joined_after?: string;
  joined_before?: string;
}

export interface LeaderboardFilters {
  challenge_id: string;
  team_id?: string;
  status?: ParticipantStatus[];
  rank_type?: 'overall' | 'streak' | 'time';
  limit?: number;
  offset?: number;
}

// =====================================================
// 15. PAGINATION & SORTING
// =====================================================

export interface PaginationParams {
  page: number;
  per_page: number;
}

export interface SortParams {
  sort_by: string;
  sort_order: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    per_page: number;
    total_items: number;
    total_pages: number;
  };
}

// =====================================================
// 16. DASHBOARD & UI TYPES
// =====================================================

export interface ChallengeDashboardStats {
  active_challenges: number;
  completed_challenges: number;
  total_prayer_time_hours: number;
  current_streak: number;
  total_points: number;
  badges_earned: number;
  global_rank?: number;
  tier_level?: UserTierLevel;
}

export interface ChallengeSummary {
  id: string;
  title: string;
  category: string;
  cover_image_url?: string;
  participant_count: number;
  completion_rate: number;
  difficulty_level: DifficultyLevel;
  session_type: SessionType;
  duration_days: number;
  is_joined: boolean;
  my_progress?: number;
  start_date?: string;
  end_date?: string;
}

export interface TeamSummary {
  id: string;
  team_name: string;
  team_avatar_url?: string;
  member_count: number;
  team_rank: number;
  total_points: number;
  is_member: boolean;
  is_leader: boolean;
}

// =====================================================
// 17. VALIDATION SCHEMAS
// =====================================================

export const CHALLENGE_CATEGORIES = [
  'Healing',
  'Thanksgiving',
  'Intercession',
  'Revival',
  'Family',
  'Career',
  'Spiritual Growth',
  'Missions',
  'Worship',
  'Fasting',
  'Breakthrough',
  'Deliverance',
  'Prophetic',
  'Youth',
  'Marriage',
  'Financial',
  'Health',
  'Ministry',
  'Evangelism',
  'Nation',
] as const;

export const SESSION_DURATIONS = {
  quick: { minutes: 2, label: 'Quick Session (2 min)', duration: 2 },
  standard: { minutes: 5, label: 'Standard Session (5 min)', duration: 5 },
  deep: { minutes: 10, label: 'Deep Guided (10 min)', duration: 10 },
} as const;

export const DIFFICULTY_DESCRIPTIONS = {
  beginner: 'New to prayer challenges? Start here!',
  intermediate: 'For those building consistent prayer habits',
  advanced: 'Deep prayer and commitment required',
} as const;

export const TIER_REQUIREMENTS = {
  bronze: { min_points: 0, max_points: 999 },
  silver: { min_points: 1000, max_points: 4999 },
  gold: { min_points: 5000, max_points: 14999 },
  platinum: { min_points: 15000, max_points: 49999 },
  diamond: { min_points: 50000, max_points: Infinity },
} as const;

// =====================================================
// 18. UTILITY TYPES
// =====================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type WithPopulated<T, K extends keyof T> = T & {
  [P in K]-?: NonNullable<T[P]>;
};

export type ChallengeWithParticipation = WithPopulated<
  EnhancedPrayerChallenge,
  'total_participants'
> & {
  my_participation?: ChallengeParticipant;
  is_joined: boolean;
  is_creator: boolean;
};

export type CommentWithReplies = ChallengeComment & {
  replies: ChallengeComment[];
  user_reaction?: ReactionType;
};

// =====================================================
// END OF TYPES
// =====================================================