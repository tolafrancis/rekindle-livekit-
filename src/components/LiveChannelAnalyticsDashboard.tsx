import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import {
  Users,
  Eye,
  MessageSquare,
  Heart,
  Clock,
  TrendingUp,
  Download,
  Calendar,
  BarChart3,
  Activity,
  PlayCircle,
  Loader2
} from 'lucide-react';
import { 
  getChannelAnalytics, 
  getBroadcastAnalytics,
  getAnalyticsSummary,
  checkAnalyticsPermissions 
} from '@/lib/liveChannelAnalyticsService';
import { 
  ChannelAnalytics, 
  BroadcastAnalytics,
  AnalyticsSummary 
} from '@/types/liveChannelAnalyticsTypes';

interface LiveChannelAnalyticsDashboardProps {
  channelId: string;
  userId: string | undefined;
  channelName: string;
}

export const LiveChannelAnalyticsDashboard: React.FC<LiveChannelAnalyticsDashboardProps> = ({
  channelId,
  userId,
  channelName
}) => {
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [accessReason, setAccessReason] = useState<string>('');
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [periodAnalytics, setPeriodAnalytics] = useState<ChannelAnalytics | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    loadAnalytics();
  }, [channelId, userId, selectedPeriod]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      // Check permissions
      const permissions = await checkAnalyticsPermissions(channelId, userId);
      setHasAccess(permissions.canView);
      setAccessReason(permissions.reason || '');

      if (!permissions.canView) {
        setLoading(false);
        return;
      }

      // Load summary
      const days = selectedPeriod === '7d' ? 7 : selectedPeriod === '30d' ? 30 : 90;
      const summaryData = await getAnalyticsSummary(channelId, days);
      setSummary(summaryData);

      // Load period analytics
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const analyticsData = await getChannelAnalytics(
        channelId,
        startDate.toISOString(),
        endDate.toISOString()
      );
      setPeriodAnalytics(analyticsData);
    } catch (error) {
      console.error('[Analytics Dashboard] Failed to load:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!hasAccess) {
    return (
      <Alert>
        <Activity className="h-4 w-4" />
        <AlertDescription>
          {accessReason || 'You do not have permission to view analytics for this channel.'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Channel Analytics</h2>
          <p className="text-muted-foreground">{channelName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Period Selector */}
      <div className="flex gap-2">
        <Button
          variant={selectedPeriod === '7d' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedPeriod('7d')}
        >
          Last 7 Days
        </Button>
        <Button
          variant={selectedPeriod === '30d' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedPeriod('30d')}
        >
          Last 30 Days
        </Button>
        <Button
          variant={selectedPeriod === '90d' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedPeriod('90d')}
        >
          Last 90 Days
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Broadcasts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalBroadcasts}</div>
              {summary.growthMetrics.viewerGrowth > 0 && (
                <div className="flex items-center text-sm text-green-600 mt-1">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  {summary.growthMetrics.viewerGrowth.toFixed(1)}%
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Viewers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(summary.totalViewers)}</div>
              <div className="text-sm text-muted-foreground mt-1">
                Avg: {formatNumber(summary.averageViewersPerBroadcast)} per broadcast
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Watch Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatDuration(summary.totalWatchTime)}</div>
              <div className="text-sm text-muted-foreground mt-1">
                All broadcasts combined
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Follower Growth
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary.growthMetrics.followerGrowth > 0 ? '+' : ''}
                {summary.growthMetrics.followerGrowth.toFixed(1)}%
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                vs previous period
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed Analytics Tabs */}
      {periodAnalytics && (
        <Tabs defaultValue="attendance" className="space-y-4">
          <TabsList>
            <TabsTrigger value="attendance">
              <Users className="h-4 w-4 mr-2" />
              Attendance
            </TabsTrigger>
            <TabsTrigger value="engagement">
              <Activity className="h-4 w-4 mr-2" />
              Engagement
            </TabsTrigger>
            <TabsTrigger value="replay">
              <PlayCircle className="h-4 w-4 mr-2" />
              Replay
            </TabsTrigger>
          </TabsList>

          {/* Attendance Tab */}
          <TabsContent value="attendance" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Total Participants</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {formatNumber(periodAnalytics.attendance.totalParticipants)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {formatNumber(periodAnalytics.attendance.uniqueViewers)} unique viewers
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Peak Concurrent Viewers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {formatNumber(periodAnalytics.attendance.peakConcurrentViewers)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Avg: {formatNumber(periodAnalytics.attendance.averageConcurrentViewers)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Avg Session Duration</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {formatDuration(periodAnalytics.attendance.averageSessionDuration)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Total: {formatDuration(periodAnalytics.attendance.totalViewTime)}
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Engagement Tab */}
          <TabsContent value="engagement" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Chat Messages</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {formatNumber(periodAnalytics.engagement.totalChatMessages)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {formatNumber(periodAnalytics.engagement.uniqueChatters)} participants
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Reactions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {formatNumber(periodAnalytics.engagement.totalReactions)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Poll Participation</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {formatNumber(periodAnalytics.engagement.pollParticipation)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Engagement Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {periodAnalytics.engagement.averageEngagementRate.toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Interactions per viewer
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Replay Tab */}
          <TabsContent value="replay" className="space-y-4">
            {periodAnalytics.replay.isAvailable ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Total Replay Views</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {formatNumber(periodAnalytics.replay.totalViews)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {formatNumber(periodAnalytics.replay.uniqueViewers)} unique viewers
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Avg Watch Duration</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {formatDuration(periodAnalytics.replay.averageWatchDuration)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Completion Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {periodAnalytics.replay.completionRate.toFixed(1)}%
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Viewers who finished
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Badge variant="secondary">Available</Badge>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Alert>
                <PlayCircle className="h-4 w-4" />
                <AlertDescription>
                  No replay recordings available for this period. Enable recording in your broadcast settings to track replay metrics.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Top Engagement Broadcast */}
      {summary?.topEngagementBroadcast && (
        <Card>
          <CardHeader>
            <CardTitle>Top Engagement Broadcast</CardTitle>
            <CardDescription>Most active broadcast in the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{summary.topEngagementBroadcast.title}</p>
                <p className="text-sm text-muted-foreground">
                  {summary.topEngagementBroadcast.engagement_score} total interactions
                </p>
              </div>
              <Badge variant="default">
                <Activity className="h-3 w-3 mr-1" />
                Top Performer
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};