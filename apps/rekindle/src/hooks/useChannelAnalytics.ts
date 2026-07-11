import { useState, useEffect, useCallback } from 'react';
import {
  getChannelAnalytics,
  getBroadcastAnalytics,
  getAnalyticsSummary,
  checkAnalyticsPermissions,
  trackViewerJoin,
  trackViewerLeave,
  trackChatMessage,
  trackReaction,
  trackReplayView,
  updateReplayProgress
} from '@/lib/liveChannelAnalyticsService';
import {
  ChannelAnalytics,
  BroadcastAnalytics,
  AnalyticsSummary,
  AnalyticsPermissions
} from '@/types/liveChannelAnalyticsTypes';

interface UseChannelAnalyticsOptions {
  channelId: string;
  userId?: string;
  autoLoad?: boolean;
  periodDays?: number;
}

export function useChannelAnalytics({
  channelId,
  userId,
  autoLoad = true,
  periodDays = 30
}: UseChannelAnalyticsOptions) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<AnalyticsPermissions>({
    canView: false,
    canExport: false
  });
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [analytics, setAnalytics] = useState<ChannelAnalytics | null>(null);

  // Check permissions
  const checkPermissions = useCallback(async () => {
    if (!userId) {
      setPermissions({
        canView: false,
        canExport: false,
        reason: 'User not authenticated'
      });
      return;
    }

    try {
      const perms = await checkAnalyticsPermissions(channelId, userId);
      setPermissions(perms);
    } catch (err) {
      console.error('[useChannelAnalytics] Permission check failed:', err);
      setPermissions({
        canView: false,
        canExport: false,
        reason: 'Permission check failed'
      });
    }
  }, [channelId, userId]);

  // Load analytics data
  const loadAnalytics = useCallback(async (days: number = periodDays) => {
    if (!permissions.canView) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const [summaryData, analyticsData] = await Promise.all([
        getAnalyticsSummary(channelId, days),
        getChannelAnalytics(
          channelId,
          startDate.toISOString(),
          endDate.toISOString()
        )
      ]);

      setSummary(summaryData);
      setAnalytics(analyticsData);
    } catch (err) {
      console.error('[useChannelAnalytics] Failed to load analytics:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  }, [channelId, periodDays, permissions.canView]);

  // Initial load
  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  useEffect(() => {
    if (autoLoad && permissions.canView) {
      loadAnalytics();
    }
  }, [autoLoad, permissions.canView, loadAnalytics]);

  return {
    loading,
    error,
    permissions,
    summary,
    analytics,
    loadAnalytics,
    checkPermissions
  };
}

interface UseBroadcastAnalyticsOptions {
  broadcastId: string;
  autoLoad?: boolean;
}

export function useBroadcastAnalytics({
  broadcastId,
  autoLoad = true
}: UseBroadcastAnalyticsOptions) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<BroadcastAnalytics | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getBroadcastAnalytics(broadcastId);
      setAnalytics(data);
    } catch (err) {
      console.error('[useBroadcastAnalytics] Failed to load:', err);
      setError('Failed to load broadcast analytics');
    } finally {
      setLoading(false);
    }
  }, [broadcastId]);

  useEffect(() => {
    if (autoLoad) {
      loadAnalytics();
    }
  }, [autoLoad, loadAnalytics]);

  return {
    loading,
    error,
    analytics,
    loadAnalytics
  };
}

interface UseAnalyticsTrackingOptions {
  channelId: string;
  broadcastId?: string;
  userId?: string;
  sessionId: string;
  userName?: string;
}

export function useAnalyticsTracking({
  channelId,
  broadcastId,
  userId,
  sessionId,
  userName
}: UseAnalyticsTrackingOptions) {
  const [replayViewId, setReplayViewId] = useState<string | null>(null);

  // Track viewer joining
  const trackJoin = useCallback(async () => {
    if (!broadcastId) return;
    
    try {
      await trackViewerJoin(broadcastId, channelId, userId, sessionId, userName);
    } catch (err) {
      console.error('[useAnalyticsTracking] Failed to track join:', err);
    }
  }, [broadcastId, channelId, userId, sessionId, userName]);

  // Track viewer leaving
  const trackLeave = useCallback(async () => {
    if (!broadcastId) return;

    try {
      await trackViewerLeave(sessionId, channelId, broadcastId, userId);
    } catch (err) {
      console.error('[useAnalyticsTracking] Failed to track leave:', err);
    }
  }, [broadcastId, channelId, userId, sessionId]);

  // Track chat message
  const trackMessage = useCallback(async () => {
    try {
      await trackChatMessage(channelId, broadcastId, userId);
    } catch (err) {
      console.error('[useAnalyticsTracking] Failed to track message:', err);
    }
  }, [channelId, broadcastId, userId]);

  // Track reaction
  const trackReactionEvent = useCallback(async (reactionType: string) => {
    try {
      await trackReaction(channelId, broadcastId, userId, reactionType);
    } catch (err) {
      console.error('[useAnalyticsTracking] Failed to track reaction:', err);
    }
  }, [channelId, broadcastId, userId]);

  // Start replay tracking
  const startReplayTracking = useCallback(async () => {
    if (!broadcastId) return;

    try {
      const viewId = await trackReplayView(broadcastId, channelId, userId, sessionId);
      setReplayViewId(viewId);
    } catch (err) {
      console.error('[useAnalyticsTracking] Failed to start replay tracking:', err);
    }
  }, [broadcastId, channelId, userId, sessionId]);

  // Update replay progress
  const updateProgress = useCallback(async (
    watchDurationSeconds: number,
    completionPercentage: number
  ) => {
    if (!replayViewId) return;

    try {
      await updateReplayProgress(replayViewId, watchDurationSeconds, completionPercentage);
    } catch (err) {
      console.error('[useAnalyticsTracking] Failed to update replay progress:', err);
    }
  }, [replayViewId]);

  // Auto-track join on mount if in a broadcast
  useEffect(() => {
    if (broadcastId) {
      trackJoin();
    }

    // Track leave on unmount
    return () => {
      if (broadcastId) {
        trackLeave();
      }
    };
  }, [broadcastId, trackJoin, trackLeave]);

  return {
    trackJoin,
    trackLeave,
    trackMessage,
    trackReaction: trackReactionEvent,
    startReplayTracking,
    updateProgress,
    replayViewId
  };
}