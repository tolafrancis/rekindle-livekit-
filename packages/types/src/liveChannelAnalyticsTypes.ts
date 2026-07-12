// Live Channel Analytics Types

export interface ChannelAnalytics {
  channel_id: string;
  
  // Attendance Metrics
  attendance: {
    totalParticipants: number;
    uniqueViewers: number;
    peakConcurrentViewers: number;
    averageConcurrentViewers: number;
    averageSessionDuration: number; // in seconds
    totalViewTime: number; // in seconds
  };
  
  // Engagement Metrics
  engagement: {
    totalChatMessages: number;
    uniqueChatters: number;
    totalReactions: number;
    totalPolls: number;
    pollParticipation: number;
    averageEngagementRate: number; // percentage
  };
  
  // Replay Metrics
  replay: {
    isAvailable: boolean;
    totalViews: number;
    uniqueViewers: number;
    averageWatchDuration: number; // in seconds
    completionRate: number; // percentage
  };
  
  // Time-based data
  period: {
    startDate: string;
    endDate: string;
  };
}

export interface BroadcastAnalytics {
  broadcast_id: string;
  channel_id: string;
  
  // Session info
  session: {
    startedAt: string;
    endedAt?: string;
    durationSeconds: number;
    title: string;
    isVideo: boolean;
  };
  
  // Attendance
  attendance: {
    peakViewers: number;
    totalViewers: number;
    uniqueViewers: number;
    averageViewDuration: number;
    joinLeaveTimestamps: ViewerSession[];
  };
  
  // Engagement
  engagement: {
    chatMessages: number;
    reactions: number;
    pollResponses: number;
  };
  
  // Recording/Replay
  replay: {
    recordingStatus: 'none' | 'recording' | 'processing' | 'completed' | 'failed';
    recordingUrl?: string;
    replayViews: number;
    averageReplayDuration: number;
  };
}

export interface ViewerSession {
  user_id?: string;
  session_id: string;
  joined_at: string;
  left_at?: string;
  duration_seconds?: number;
  user_name?: string;
  is_anonymous: boolean;
}

export interface ChannelEngagementMetric {
  id: string;
  channel_id: string;
  broadcast_id?: string;
  metric_type: 'chat_message' | 'reaction' | 'poll_response' | 'join' | 'leave';
  user_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface ChannelReplayView {
  id: string;
  broadcast_id: string;
  channel_id: string;
  user_id?: string;
  started_at: string;
  ended_at?: string;
  watch_duration_seconds?: number;
  completion_percentage?: number;
  session_id: string;
}

export interface AnalyticsSummary {
  totalBroadcasts: number;
  totalViewers: number;
  totalWatchTime: number;
  averageViewersPerBroadcast: number;
  topEngagementBroadcast?: {
    broadcast_id: string;
    title: string;
    engagement_score: number;
  };
  growthMetrics: {
    followerGrowth: number;
    viewerGrowth: number;
    engagementGrowth: number;
  };
}

export interface AnalyticsPermissions {
  canView: boolean;
  canExport: boolean;
  reason?: string;
}