import { supabase } from '@rekindle/supabase';
import { badges, Badge, BadgeCategory } from './data/badges';
import { toast } from '@rekindle/ui/use-toast';

export interface UserProgress {
  user_id: string;
  badge_id: string;
  progress: number;
  earned: boolean;
  earned_at?: string;
  updated_at: string;
}

export interface AchievementEvent {
  userId: string;
  eventType: AchievementEventType;
  count?: number;
}

export type AchievementEventType =
  // Prayer Library Events
  | 'prayer_session_completed'
  | 'prayer_series_started'
  | 'prayer_series_completed'
  | 'prayer_watch_completed'
  | 'midnight_watch_completed'
  | 'prayer_topic_tried'
  
  // Devotional Library Events
  | 'devotional_completed'
  | 'devotional_series_completed'
  | 'devotional_bookmarked'
  | 'devotional_reflection_added'
  
  // Live Channel Events
  | 'live_channel_watched'
  | 'live_channel_created'
  | 'live_broadcast_hosted'
  | 'live_channel_followed'
  | 'live_event_attended'
  | 'live_chat_message_sent'
  
  // Community Events
  | 'community_post_created'
  | 'prayer_request_prayed'
  | 'community_reaction_added'
  | 'testimony_shared'
  | 'prayer_group_created'
  | 'group_prayer_led'
  
  // Streak Events
  | 'daily_streak_updated'
  
  // Referral Events
  | 'referral_completed'
  
  // Mentorship Events
  | 'mentor_verified'
  | 'mentorship_session_completed'
  | 'counsellor_verified'
  | 'counselling_session_completed'
  
  // Scripture Events
  | 'scripture_memorized'
  | 'bible_plan_completed'
  
  // AI Companion Events
  | 'ai_conversation_completed'
  | 'ai_prayer_generated'
  | 'ai_scripture_requested'
  
  // Special Events
  | 'user_sponsored'
  | 'voice_session_hosted'
  | 'prayer_room_joined'
  | 'prayer_room_hosted';

// Event to Badge Mapping
const eventBadgeMapping: Record<AchievementEventType, string[]> = {
  // Prayer Library
  prayer_session_completed: ['prayer_warrior_1', 'prayer_warrior_2', 'prayer_warrior_3', 'prayer_warrior_4', 'prayer_warrior_5'],
  prayer_series_started: ['prayer_series_starter'],
  prayer_series_completed: ['prayer_series_completer'],
  prayer_watch_completed: ['watchman'],
  midnight_watch_completed: ['midnight_intercessor'],
  prayer_topic_tried: ['prayer_explorer'],
  
  // Devotional Library
  devotional_completed: ['devotional_disciple_1', 'devotional_disciple_2', 'devotional_disciple_3', 'devotional_disciple_4'],
  devotional_series_completed: ['devotional_series_finisher'],
  devotional_bookmarked: ['devotional_bookworm'],
  devotional_reflection_added: ['reflection_master'],
  
  // Live Channel
  live_channel_watched: ['channel_viewer_1', 'channel_viewer_2', 'channel_viewer_3'],
  live_channel_created: ['channel_creator'],
  live_broadcast_hosted: ['broadcaster_1', 'broadcaster_2', 'broadcaster_3'],
  live_channel_followed: ['channel_supporter'],
  live_event_attended: ['event_attendee'],
  live_chat_message_sent: ['chat_engager'],
  
  // Community
  community_post_created: ['community_starter', 'active_member', 'community_leader'],
  prayer_request_prayed: ['prayer_request_supporter'],
  community_reaction_added: ['encourager'],
  testimony_shared: ['testimony_sharer'],
  prayer_group_created: ['group_founder'],
  group_prayer_led: ['group_leader'],
  
  // Streak
  daily_streak_updated: ['week_warrior', 'month_champion', 'quarter_master', 'year_legend'],
  
  // Referral
  referral_completed: ['soul_winner_1', 'soul_winner_2', 'soul_winner_3', 'soul_winner_4', 'soul_winner_5'],
  
  // Mentorship
  mentor_verified: ['mentor_starter'],
  mentorship_session_completed: ['mentor_helper', 'mentor_guide'],
  counsellor_verified: ['counsellor'],
  counselling_session_completed: ['counselling_helper'],
  
  // Scripture
  scripture_memorized: ['scripture_memorizer', 'scripture_master'],
  bible_plan_completed: ['bible_reader', 'bible_scholar'],
  
  // AI Companion
  ai_conversation_completed: ['ai_seeker'],
  ai_prayer_generated: ['ai_wisdom_seeker'],
  ai_scripture_requested: ['ai_scripture_explorer'],
  
  // Special
  user_sponsored: ['generous_giver'],
  voice_session_hosted: ['voice_helper'],
  prayer_room_joined: ['intercessor'],
  prayer_room_hosted: ['prayer_room_host']
};

class AchievementTrackerService {
  /**
   * Initialize user progress for all badges
   */
  async initializeUserProgress(userId: string): Promise<void> {
    try {
      const existingProgress = await this.getUserProgress(userId);
      const existingBadgeIds = new Set(existingProgress.map(p => p.badge_id));
      
      const newProgressEntries = badges
        .filter(badge => !existingBadgeIds.has(badge.id))
        .map(badge => ({
          user_id: userId,
          badge_id: badge.id,
          progress: 0,
          earned: false
        }));
      
      if (newProgressEntries.length > 0) {
        const { error } = await supabase
          .from('user_badge_progress')
          .insert(newProgressEntries);
        
        if (error) throw error;
      }
    } catch (error) {
      console.error('Error initializing user progress:', error);
    }
  }

  /**
   * Get user progress for all badges
   */
  async getUserProgress(userId: string): Promise<UserProgress[]> {
    try {
      const { data, error } = await supabase
        .from('user_badge_progress')
        .select('*')
        .eq('user_id', userId);
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching user progress:', error);
      return [];
    }
  }

  /**
   * Get user's badges with progress merged
   */
  async getUserBadges(userId: string): Promise<Badge[]> {
    try {
      const progress = await this.getUserProgress(userId);
      const progressMap = new Map(progress.map(p => [p.badge_id, p]));
      
      return badges.map(badge => ({
        ...badge,
        progress: progressMap.get(badge.id)?.progress || 0,
        earned: progressMap.get(badge.id)?.earned || false,
        unlockDate: progressMap.get(badge.id)?.earned_at
      }));
    } catch (error) {
      console.error('Error fetching user badges:', error);
      return badges;
    }
  }

  /**
   * Track achievement event and update badge progress
   */
  async trackAchievement(event: AchievementEvent): Promise<void> {
    try {
      const affectedBadgeIds = eventBadgeMapping[event.eventType] || [];
      
      if (affectedBadgeIds.length === 0) return;
      
      const progress = await this.getUserProgress(event.userId);
      const progressMap = new Map(progress.map(p => [p.badge_id, p]));
      
      const updates: Array<{ badge_id: string; new_progress: number; earned: boolean }> = [];
      const newlyEarnedBadges: Badge[] = [];
      
      for (const badgeId of affectedBadgeIds) {
        const badge = badges.find(b => b.id === badgeId);
        if (!badge) continue;
        
        const currentProgress = progressMap.get(badgeId);
        if (!currentProgress || currentProgress.earned) continue;
        
        const newProgress = Math.min(
          (currentProgress.progress || 0) + (event.count || 1),
          badge.target || 0
        );
        
        const earned = newProgress >= (badge.target || 0);
        
        if (newProgress !== currentProgress.progress) {
          updates.push({
            badge_id: badgeId,
            new_progress: newProgress,
            earned
          });
          
          if (earned) {
            newlyEarnedBadges.push(badge);
          }
        }
      }
      
      // Update progress in database
      for (const update of updates) {
        const { error } = await supabase
          .from('user_badge_progress')
          .update({
            progress: update.new_progress,
            earned: update.earned,
            earned_at: update.earned ? new Date().toISOString() : null,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', event.userId)
          .eq('badge_id', update.badge_id);
        
        if (error) throw error;
      }
      
      // Show notifications for newly earned badges
      for (const badge of newlyEarnedBadges) {
        this.showBadgeUnlockedNotification(badge);
        await this.awardBadgePoints(event.userId, badge.points);
      }
      
    } catch (error) {
      console.error('Error tracking achievement:', error);
    }
  }

  /**
   * Award points to user
   */
  private async awardBadgePoints(userId: string, points: number): Promise<void> {
    try {
      // Get current user stats
      const { data: stats, error: fetchError } = await supabase
        .from('user_stats')
        .select('total_points')
        .eq('user_id', userId)
        .single();
      
      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;
      
      const currentPoints = stats?.total_points || 0;
      
      // Update user stats
      const { error: updateError } = await supabase
        .from('user_stats')
        .upsert({
          user_id: userId,
          total_points: currentPoints + points,
          updated_at: new Date().toISOString()
        });
      
      if (updateError) throw updateError;
      
    } catch (error) {
      console.error('Error awarding badge points:', error);
    }
  }

  /**
   * Show badge unlocked notification
   */
  private showBadgeUnlockedNotification(badge: Badge): void {
    toast({
      title: `🎉 Badge Unlocked: ${badge.name}!`,
      description: `${badge.description} (+${badge.points} points)`,
      duration: 5000
    });
  }

  /**
   * Get user's total points
   */
  async getUserTotalPoints(userId: string): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('user_stats')
        .select('total_points')
        .eq('user_id', userId)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data?.total_points || 0;
    } catch (error) {
      console.error('Error fetching user points:', error);
      return 0;
    }
  }

  /**
   * Get user's rank based on points
   */
  async getUserRank(userId: string): Promise<{ rank: number; totalUsers: number }> {
    try {
      const userPoints = await this.getUserTotalPoints(userId);
      
      const { data, error } = await supabase
        .from('user_stats')
        .select('user_id, total_points')
        .order('total_points', { ascending: false });
      
      if (error) throw error;
      
      const totalUsers = data?.length || 0;
      const rank = (data?.findIndex(u => u.user_id === userId) || 0) + 1;
      
      return { rank, totalUsers };
    } catch (error) {
      console.error('Error fetching user rank:', error);
      return { rank: 0, totalUsers: 0 };
    }
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(limit: number = 50): Promise<Array<{ userId: string; points: number; rank: number }>> {
    try {
      const { data, error } = await supabase
        .from('user_stats')
        .select(`
          user_id,
          total_points,
          profiles!inner(full_name, avatar_url)
        `)
        .order('total_points', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      
      return (data || []).map((item, index) => ({
        userId: item.user_id,
        points: item.total_points,
        rank: index + 1,
        fullName: item.profiles?.full_name,
        avatarUrl: item.profiles?.avatar_url
      }));
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      return [];
    }
  }

  /**
   * Get category-specific progress
   */
  async getCategoryStats(userId: string, category: BadgeCategory): Promise<{
    earned: number;
    total: number;
    percentage: number;
    nextBadge?: Badge;
  }> {
    try {
      const userBadges = await this.getUserBadges(userId);
      const categoryBadges = userBadges.filter(b => b.category === category);
      const earnedCount = categoryBadges.filter(b => b.earned).length;
      
      // Find next badge to unlock
      const nextBadge = categoryBadges
        .filter(b => !b.earned)
        .sort((a, b) => (a.progress || 0) - (b.progress || 0))
        [0];
      
      return {
        earned: earnedCount,
        total: categoryBadges.length,
        percentage: categoryBadges.length > 0 ? (earnedCount / categoryBadges.length) * 100 : 0,
        nextBadge
      };
    } catch (error) {
      console.error('Error fetching category stats:', error);
      return { earned: 0, total: 0, percentage: 0 };
    }
  }
}

// Export singleton instance
export const achievementTracker = new AchievementTrackerService();

// Convenience functions for common events
export const trackPrayerSession = (userId: string) => 
  achievementTracker.trackAchievement({ userId, eventType: 'prayer_session_completed' });

export const trackDevotionalCompleted = (userId: string) => 
  achievementTracker.trackAchievement({ userId, eventType: 'devotional_completed' });

export const trackLiveChannelWatched = (userId: string) => 
  achievementTracker.trackAchievement({ userId, eventType: 'live_channel_watched' });

export const trackDailyStreak = (userId: string, streakCount: number) => 
  achievementTracker.trackAchievement({ userId, eventType: 'daily_streak_updated', count: streakCount });

export const trackReferral = (userId: string) => 
  achievementTracker.trackAchievement({ userId, eventType: 'referral_completed' });