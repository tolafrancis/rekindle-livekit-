// Live Channel Analytics Service - FIXED VERSION
import { supabase } from '@/lib/supabase';
import {
  ChannelAnalytics,
  BroadcastAnalytics,
  ViewerSession,
  ChannelEngagementMetric,
  ChannelReplayView,
  AnalyticsSummary,
  AnalyticsPermissions
} from '@rekindle/types/liveChannelAnalyticsTypes';

/**
 * Check if user has permission to view analytics for a channel
 * FIXED: Properly handles ministry channels and permission logic
 */
export async function checkAnalyticsPermissions(
  channelId: string,
  userId: string | undefined
): Promise<AnalyticsPermissions> {
  if (!userId) {
    return {
      canView: false,
      canExport: false,
      reason: 'User not authenticated'
    };
  }

  try {
    // Check if user is channel owner or ministry leader
    const { data: channel, error } = await supabase
      .from('live_channels')
      .select('owner_id, ministry_id')
      .eq('id', channelId)
      .single();

    if (error) throw error;

    const isOwner = channel.owner_id === userId;
    
    // Check if this is a ministry channel and user is a ministry leader
    let isMinistryLeader = false;
    if (channel.ministry_id) {
      const { data: membership } = await supabase
        .from('ministry_members')
        .select('role')
        .eq('ministry_id', channel.ministry_id)
        .eq('user_id', userId)
        .single();
      
      isMinistryLeader = membership?.role === 'leader' || membership?.role === 'admin';
    }

    // Check user's subscription tier and role
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier, role')
      .eq('id', userId)
      .single();

    const isPremiumUser = 
      profile?.subscription_tier === 'premium' || 
      profile?.subscription_tier === 'ministry';
    
    const isAdmin = profile?.role === 'admin';

    // FIXED LOGIC:
    // Grant access if:
    // 1. User is admin (can see all analytics)
    // 2. User is channel owner AND has premium/ministry subscription
    // 3. User is ministry leader for the channel's ministry AND has ministry subscription
    const hasAnalyticsAccess = 
      isAdmin || 
      (isOwner && isPremiumUser) ||
      (isMinistryLeader && profile?.subscription_tier === 'ministry');

    // Provide specific reason for denial
    let denialReason: string | undefined;
    if (!hasAnalyticsAccess) {
      if (isOwner && !isPremiumUser) {
        denialReason = 'Upgrade to Premium to access channel analytics';
      } else if (isMinistryLeader && profile?.subscription_tier !== 'ministry') {
        denialReason = 'Ministry subscription required to access analytics';
      } else if (!isOwner && !isMinistryLeader && !isAdmin) {
        denialReason = 'Only channel owners and ministry leaders can view analytics';
      } else {
        denialReason = 'Requires premium subscription or channel ownership';
      }
    }

    return {
      canView: hasAnalyticsAccess,
      canExport: hasAnalyticsAccess,
      reason: denialReason
    };
  } catch (error) {
    console.error('[Analytics] Permission check failed:', error);
    return {
      canView: false,
      canExport: false,
      reason: 'Permission check failed'
    };
  }
}

/**
 * Get comprehensive channel analytics for a given time period
 */
export async function getChannelAnalytics(
  channelId: string,
  startDate: string,
  endDate: string
): Promise<ChannelAnalytics | null> {
  try {
    // Get all broadcasts in the period
    const { data: broadcasts, error: broadcastError } = await supabase
      .from('channel_broadcasts')
      .select('*')
      .eq('channel_id', channelId)
      .gte('started_at', startDate)
      .lte('started_at', endDate);

    if (broadcastError) throw broadcastError;

    if (!broadcasts || broadcasts.length === 0) {
      return {
        channel_id: channelId,
        attendance: {
          totalParticipants: 0,
          uniqueViewers: 0,
          peakConcurrentViewers: 0,
          averageConcurrentViewers: 0,
          averageSessionDuration: 0,
          totalViewTime: 0
        },
        engagement: {
          totalChatMessages: 0,
          uniqueChatters: 0,
          totalReactions: 0,
          totalPolls: 0,
          pollParticipation: 0,
          averageEngagementRate: 0
        },
        replay: {
          isAvailable: false,
          totalViews: 0,
          uniqueViewers: 0,
          averageWatchDuration: 0,
          completionRate: 0
        },
        period: {
          startDate,
          endDate
        }
      };
    }

    const broadcastIds = broadcasts.map(b => b.id);

    // Get viewer sessions
    const { data: sessions } = await supabase
      .from('channel_viewer_sessions')
      .select('*')
      .in('broadcast_id', broadcastIds);

    // Get engagement metrics
    const { data: engagementMetrics } = await supabase
      .from('channel_engagement_metrics')
      .select('*')
      .in('broadcast_id', broadcastIds);

    // Get replay views
    const { data: replayViews } = await supabase
      .from('channel_replay_views')
      .select('*')
      .in('broadcast_id', broadcastIds);

    // Calculate attendance metrics
    const totalParticipants = sessions?.length || 0;
    const uniqueViewers = new Set(sessions?.map(s => s.user_id || s.session_id)).size;
    const peakConcurrentViewers = Math.max(...(broadcasts.map(b => b.peak_viewers || 0)));
    const totalViewTime = sessions?.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) || 0;
    const averageSessionDuration = totalParticipants > 0 ? totalViewTime / totalParticipants : 0;
    const averageConcurrentViewers = broadcasts.reduce((sum, b) => sum + (b.peak_viewers || 0), 0) / broadcasts.length;

    // Calculate engagement metrics
    const chatMessages = engagementMetrics?.filter(m => m.metric_type === 'chat_message') || [];
    const reactions = engagementMetrics?.filter(m => m.metric_type === 'reaction') || [];
    const pollResponses = engagementMetrics?.filter(m => m.metric_type === 'poll_response') || [];
    
    const uniqueChatters = new Set(chatMessages.map(m => m.user_id).filter(Boolean)).size;
    const averageEngagementRate = totalParticipants > 0 
      ? ((chatMessages.length + reactions.length + pollResponses.length) / totalParticipants) * 100 
      : 0;

    // Calculate replay metrics
    const replayAvailable = broadcasts.some(b => b.recording_status === 'completed');
    const totalReplayViews = replayViews?.length || 0;
    const uniqueReplayViewers = new Set(replayViews?.map(v => v.user_id || v.session_id)).size;
    const totalReplayDuration = replayViews?.reduce((sum, v) => sum + (v.watch_duration_seconds || 0), 0) || 0;
    const averageReplayDuration = totalReplayViews > 0 ? totalReplayDuration / totalReplayViews : 0;
    const completionRate = replayViews?.reduce((sum, v) => sum + (v.completion_percentage || 0), 0) || 0;
    const avgCompletionRate = totalReplayViews > 0 ? completionRate / totalReplayViews : 0;

    return {
      channel_id: channelId,
      attendance: {
        totalParticipants,
        uniqueViewers,
        peakConcurrentViewers,
        averageConcurrentViewers,
        averageSessionDuration,
        totalViewTime
      },
      engagement: {
        totalChatMessages: chatMessages.length,
        uniqueChatters,
        totalReactions: reactions.length,
        totalPolls: 0, // This would need a separate polls table
        pollParticipation: pollResponses.length,
        averageEngagementRate
      },
      replay: {
        isAvailable: replayAvailable,
        totalViews: totalReplayViews,
        uniqueViewers: uniqueReplayViewers,
        averageWatchDuration: averageReplayDuration,
        completionRate: avgCompletionRate
      },
      period: {
        startDate,
        endDate
      }
    };
  } catch (error) {
    console.error('[Analytics] Failed to get channel analytics:', error);
    return null;
  }
}

/**
 * Get analytics for a specific broadcast
 */
export async function getBroadcastAnalytics(
  broadcastId: string
): Promise<BroadcastAnalytics | null> {
  try {
    // Get broadcast details
    const { data: broadcast, error: broadcastError } = await supabase
      .from('channel_broadcasts')
      .select('*')
      .eq('id', broadcastId)
      .single();

    if (broadcastError) throw broadcastError;

    // Get viewer sessions
    const { data: sessions } = await supabase
      .from('channel_viewer_sessions')
      .select('*')
      .eq('broadcast_id', broadcastId)
      .order('joined_at', { ascending: true });

    // Get engagement metrics
    const { data: engagementMetrics } = await supabase
      .from('channel_engagement_metrics')
      .select('*')
      .eq('broadcast_id', broadcastId);

    // Get replay views
    const { data: replayViews } = await supabase
      .from('channel_replay_views')
      .select('*')
      .eq('broadcast_id', broadcastId);

    const chatMessages = engagementMetrics?.filter(m => m.metric_type === 'chat_message').length || 0;
    const reactions = engagementMetrics?.filter(m => m.metric_type === 'reaction').length || 0;
    const pollResponses = engagementMetrics?.filter(m => m.metric_type === 'poll_response').length || 0;

    const uniqueViewers = new Set(sessions?.map(s => s.user_id || s.session_id)).size;
    const totalViewDuration = sessions?.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) || 0;
    const averageViewDuration = sessions && sessions.length > 0 ? totalViewDuration / sessions.length : 0;

    const totalReplayDuration = replayViews?.reduce((sum, v) => sum + (v.watch_duration_seconds || 0), 0) || 0;
    const averageReplayDuration = replayViews && replayViews.length > 0 ? totalReplayDuration / replayViews.length : 0;

    return {
      broadcast_id: broadcastId,
      channel_id: broadcast.channel_id,
      session: {
        startedAt: broadcast.started_at,
        endedAt: broadcast.ended_at,
        durationSeconds: broadcast.duration_seconds || 0,
        title: broadcast.title,
        isVideo: broadcast.is_video
      },
      attendance: {
        totalViewers: sessions?.length || 0,
        uniqueViewers,
        peakConcurrentViewers: broadcast.peak_viewers || 0,
        averageViewDuration
      },
      engagement: {
        chatMessages,
        reactions,
        pollResponses,
        totalEngagements: chatMessages + reactions + pollResponses
      },
      replay: {
        totalViews: replayViews?.length || 0,
        averageWatchDuration: averageReplayDuration
      }
    };
  } catch (error) {
    console.error('[Analytics] Failed to get broadcast analytics:', error);
    return null;
  }
}

/**
 * Get summary analytics for a channel over a period
 */
export async function getAnalyticsSummary(
  channelId: string,
  days: number
): Promise<AnalyticsSummary | null> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get broadcasts in period
    const { data: broadcasts } = await supabase
      .from('channel_broadcasts')
      .select('*')
      .eq('channel_id', channelId)
      .gte('started_at', startDate.toISOString())
      .lte('started_at', endDate.toISOString());

    const totalBroadcasts = broadcasts?.length || 0;
    const totalViewers = broadcasts?.reduce((sum, b) => sum + (b.total_viewers || 0), 0) || 0;
    
    // Calculate total watch time from all broadcasts
    const totalWatchTime = broadcasts?.reduce((sum, b) => {
      const duration = b.duration_seconds || 0;
      const viewers = b.total_viewers || 0;
      return sum + (duration * viewers);
    }, 0) || 0;

    const averageViewersPerBroadcast = totalBroadcasts > 0 ? totalViewers / totalBroadcasts : 0;

    // Find top engagement broadcast
    let topEngagementBroadcast;
    if (broadcasts && broadcasts.length > 0) {
      const broadcastWithEngagement = await Promise.all(
        broadcasts.map(async (b) => {
          const { data: metrics } = await supabase
            .from('channel_engagement_metrics')
            .select('id')
            .eq('broadcast_id', b.id);
          
          return {
            broadcast_id: b.id,
            title: b.title,
            engagement_score: metrics?.length || 0
          };
        })
      );

      topEngagementBroadcast = broadcastWithEngagement.reduce((max, current) => 
        current.engagement_score > (max?.engagement_score || 0) ? current : max
      );
    }

    // Calculate growth metrics (compare to previous period)
    const previousStartDate = new Date(startDate);
    previousStartDate.setDate(previousStartDate.getDate() - days);

    const { data: previousBroadcasts } = await supabase
      .from('channel_broadcasts')
      .select('*')
      .eq('channel_id', channelId)
      .gte('started_at', previousStartDate.toISOString())
      .lt('started_at', startDate.toISOString());

    const previousTotalViewers = previousBroadcasts?.reduce((sum, b) => sum + (b.total_viewers || 0), 0) || 0;
    const viewerGrowth = previousTotalViewers > 0 
      ? ((totalViewers - previousTotalViewers) / previousTotalViewers) * 100 
      : 0;

    // Get follower growth
    const { data: currentFollowers } = await supabase
      .from('channel_followers')
      .select('id', { count: 'exact' })
      .eq('channel_id', channelId)
      .lte('followed_at', endDate.toISOString());

    const { data: previousFollowers } = await supabase
      .from('channel_followers')
      .select('id', { count: 'exact' })
      .eq('channel_id', channelId)
      .lte('followed_at', startDate.toISOString());

    const currentFollowerCount = currentFollowers || 0;
    const previousFollowerCount = previousFollowers || 0;
    const followerGrowth = previousFollowerCount > 0
      ? ((currentFollowerCount - previousFollowerCount) / previousFollowerCount) * 100
      : 0;

    return {
      totalBroadcasts,
      totalViewers,
      totalWatchTime,
      averageViewersPerBroadcast,
      topEngagementBroadcast,
      growthMetrics: {
        followerGrowth,
        viewerGrowth,
        engagementGrowth: 0 // Would need historical engagement data
      }
    };
  } catch (error) {
    console.error('[Analytics] Failed to get analytics summary:', error);
    return null;
  }
}

/**
 * Track a viewer joining a broadcast
 */
export async function trackViewerJoin(
  broadcastId: string,
  channelId: string,
  userId: string | undefined,
  sessionId: string,
  userName?: string
): Promise<void> {
  try {
    await supabase.from('channel_viewer_sessions').insert({
      broadcast_id: broadcastId,
      channel_id: channelId,
      user_id: userId,
      session_id: sessionId,
      user_name: userName,
      joined_at: new Date().toISOString()
    });

    // Track as engagement metric
    await supabase.from('channel_engagement_metrics').insert({
      channel_id: channelId,
      broadcast_id: broadcastId,
      metric_type: 'join',
      user_id: userId,
      metadata: { session_id: sessionId }
    });
  } catch (error) {
    console.error('[Analytics] Failed to track viewer join:', error);
  }
}

/**
 * Track a viewer leaving a broadcast
 */
export async function trackViewerLeave(
  sessionId: string,
  channelId: string,
  broadcastId: string,
  userId?: string
): Promise<void> {
  try {
    const { data: session } = await supabase
      .from('channel_viewer_sessions')
      .select('joined_at')
      .eq('session_id', sessionId)
      .eq('broadcast_id', broadcastId)
      .single();

    if (session) {
      const leftAt = new Date();
      const joinedAt = new Date(session.joined_at);
      const durationSeconds = Math.floor((leftAt.getTime() - joinedAt.getTime()) / 1000);

      await supabase
        .from('channel_viewer_sessions')
        .update({
          left_at: leftAt.toISOString(),
          duration_seconds: durationSeconds
        })
        .eq('session_id', sessionId)
        .eq('broadcast_id', broadcastId);

      // Track as engagement metric
      await supabase.from('channel_engagement_metrics').insert({
        channel_id: channelId,
        broadcast_id: broadcastId,
        metric_type: 'leave',
        user_id: userId,
        metadata: { session_id: sessionId, duration_seconds: durationSeconds }
      });
    }
  } catch (error) {
    console.error('[Analytics] Failed to track viewer leave:', error);
  }
}

/**
 * Track chat message
 */
export async function trackChatMessage(
  channelId: string,
  broadcastId: string | undefined,
  userId: string | undefined
): Promise<void> {
  try {
    await supabase.from('channel_engagement_metrics').insert({
      channel_id: channelId,
      broadcast_id: broadcastId,
      metric_type: 'chat_message',
      user_id: userId
    });
  } catch (error) {
    console.error('[Analytics] Failed to track chat message:', error);
  }
}

/**
 * Track reaction
 */
export async function trackReaction(
  channelId: string,
  broadcastId: string | undefined,
  userId: string | undefined,
  reactionType: string
): Promise<void> {
  try {
    await supabase.from('channel_engagement_metrics').insert({
      channel_id: channelId,
      broadcast_id: broadcastId,
      metric_type: 'reaction',
      user_id: userId,
      metadata: { reaction_type: reactionType }
    });
  } catch (error) {
    console.error('[Analytics] Failed to track reaction:', error);
  }
}

/**
 * Track replay view
 */
export async function trackReplayView(
  broadcastId: string,
  channelId: string,
  userId: string | undefined,
  sessionId: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('channel_replay_views')
      .insert({
        broadcast_id: broadcastId,
        channel_id: channelId,
        user_id: userId,
        session_id: sessionId,
        started_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  } catch (error) {
    console.error('[Analytics] Failed to track replay view:', error);
    return null;
  }
}

/**
 * Update replay view progress
 */
export async function updateReplayProgress(
  viewId: string,
  watchDurationSeconds: number,
  completionPercentage: number
): Promise<void> {
  try {
    await supabase
      .from('channel_replay_views')
      .update({
        watch_duration_seconds: watchDurationSeconds,
        completion_percentage: completionPercentage,
        ended_at: completionPercentage >= 90 ? new Date().toISOString() : undefined
      })
      .eq('id', viewId);
  } catch (error) {
    console.error('[Analytics] Failed to update replay progress:', error);
  }
}