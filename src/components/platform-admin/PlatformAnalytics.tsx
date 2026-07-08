import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '../ui/use-toast';
import {
  BarChart3, TrendingUp, Users, Building2, Calendar,
  Loader2, RefreshCw, Activity, Eye, MessageSquare,
  Heart, BookOpen, Mic, Video, ArrowUpRight, ArrowDownRight
} from 'lucide-react';

interface AnalyticsData {
  totalUsers: number;
  activeUsers: number;
  newUsersThisMonth: number;
  totalMinistries: number;
  activeMinistries: number;
  totalDevotionals: number;
  totalPrayers: number;
  totalVoiceRooms: number;
  totalLiveChannels: number;
  totalMessages: number;
  userGrowth: number;
  ministryGrowth: number;
  engagementRate: number;
}

interface DailyMetric {
  date: string;
  users: number;
  sessions: number;
  devotionals_read: number;
  prayers_submitted: number;
}

export const PlatformAnalytics: React.FC = () => {
  const { t } = useLanguage();
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalUsers: 0,
    activeUsers: 0,
    newUsersThisMonth: 0,
    totalMinistries: 0,
    activeMinistries: 0,
    totalDevotionals: 0,
    totalPrayers: 0,
    totalVoiceRooms: 0,
    totalLiveChannels: 0,
    totalMessages: 0,
    userGrowth: 0,
    ministryGrowth: 0,
    engagementRate: 0
  });
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30');
  const [topMinistries, setTopMinistries] = useState<any[]>([]);

  useEffect(() => {
    loadAnalytics();
  }, [dateRange]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(dateRange));
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);

      const [
        usersRes,
        newUsersRes,
        ministriesRes,
        devotionalsRes,
        prayersRes,
        voiceRoomsRes,
        liveChannelsRes,
        messagesRes
      ] = await Promise.all([
        supabase.from('user_profiles').select('id, created_at, last_active_at'),
        supabase.from('user_profiles').select('id').gte('created_at', monthAgo.toISOString()),
        supabase.from('ministry_groups').select('id, name, member_count, is_active, approval_status, theme_color').order('member_count', { ascending: false }),
        supabase.from('devotionals').select('id'),
        supabase.from('prayer_points').select('id'),
        supabase.from('voice_rooms').select('id'),
        supabase.from('live_channels').select('id'),
        supabase.from('room_chat_messages').select('id').gte('created_at', daysAgo.toISOString())
      ]);

      const users = usersRes.data || [];
      const ministries = ministriesRes.data || [];
      
      // Calculate active users (active in last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const activeUsers = users.filter(u => u.last_active_at && new Date(u.last_active_at) > sevenDaysAgo).length;

      // Calculate growth
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      const lastMonthUsers = users.filter(u => new Date(u.created_at) < monthAgo && new Date(u.created_at) > twoMonthsAgo).length;
      const thisMonthUsers = newUsersRes.data?.length || 0;
      const userGrowth = lastMonthUsers > 0 ? ((thisMonthUsers - lastMonthUsers) / lastMonthUsers) * 100 : 0;

      setAnalytics({
        totalUsers: users.length,
        activeUsers,
        newUsersThisMonth: thisMonthUsers,
        totalMinistries: ministries.length,
        activeMinistries: ministries.filter(m => m.is_active && m.approval_status === 'approved').length,
        totalDevotionals: devotionalsRes.data?.length || 0,
        totalPrayers: prayersRes.data?.length || 0,
        totalVoiceRooms: voiceRoomsRes.data?.length || 0,
        totalLiveChannels: liveChannelsRes.data?.length || 0,
        totalMessages: messagesRes.data?.length || 0,
        userGrowth: Math.round(userGrowth),
        ministryGrowth: 8, // Placeholder
        engagementRate: users.length > 0 ? Math.round((activeUsers / users.length) * 100) : 0
      });

      // Top ministries
      setTopMinistries(ministries.slice(0, 10));
    } catch (err) {
      console.error('Error loading analytics:', err);
      toast({ title: t('platformAnalytics', 'error', 'Error'), description: t('platformAnalytics', 'failedToLoad', 'Failed to load analytics'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('platformAnalytics', 'title', 'Platform Analytics')}</h2>
        <div className="flex gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-36">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t('platformAnalytics', 'last7Days', 'Last 7 days')}</SelectItem>
              <SelectItem value="30">{t('platformAnalytics', 'last30Days', 'Last 30 days')}</SelectItem>
              <SelectItem value="90">{t('platformAnalytics', 'last90Days', 'Last 90 days')}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={loadAnalytics}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('platformAnalytics', 'refresh', 'Refresh')}
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600">{t('platformAnalytics', 'totalUsers', 'Total Users')}</p>
                <p className="text-2xl font-bold text-blue-700">{analytics.totalUsers.toLocaleString()}</p>
                <div className="flex items-center text-xs text-blue-600 mt-1">
                  {analytics.userGrowth >= 0 ? (
                    <ArrowUpRight className="h-3 w-3 mr-1" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 mr-1" />
                  )}
                  {Math.abs(analytics.userGrowth)}{t('platformAnalytics', 'percentThisMonth', '% this month')}
                </div>
              </div>
              <Users className="h-10 w-10 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600">{t('platformAnalytics', 'activeUsers', 'Active Users')}</p>
                <p className="text-2xl font-bold text-green-700">{analytics.activeUsers.toLocaleString()}</p>
                <p className="text-xs text-green-600 mt-1">{t('platformAnalytics', 'last7Days', 'Last 7 days')}</p>
              </div>
              <Activity className="h-10 w-10 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600">{t('platformAnalytics', 'ministries', 'Ministries')}</p>
                <p className="text-2xl font-bold text-purple-700">{analytics.totalMinistries}</p>
                <p className="text-xs text-purple-600 mt-1">{t('platformAnalytics', 'xActive', '{count} active').replace('{count}', String(analytics.activeMinistries))}</p>
              </div>
              <Building2 className="h-10 w-10 text-purple-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-amber-600">{t('platformAnalytics', 'engagementRate', 'Engagement Rate')}</p>
                <p className="text-2xl font-bold text-amber-700">{analytics.engagementRate}%</p>
                <p className="text-xs text-amber-600 mt-1">{t('platformAnalytics', 'activeTotalUsers', 'Active/Total users')}</p>
              </div>
              <TrendingUp className="h-10 w-10 text-amber-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Content Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <BookOpen className="h-8 w-8 mx-auto text-blue-500 mb-2" />
            <p className="text-2xl font-bold">{analytics.totalDevotionals}</p>
            <p className="text-sm text-gray-500">{t('platformAnalytics', 'devotionals', 'Devotionals')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Heart className="h-8 w-8 mx-auto text-red-500 mb-2" />
            <p className="text-2xl font-bold">{analytics.totalPrayers}</p>
            <p className="text-sm text-gray-500">{t('platformAnalytics', 'prayers', 'Prayers')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Mic className="h-8 w-8 mx-auto text-green-500 mb-2" />
            <p className="text-2xl font-bold">{analytics.totalVoiceRooms}</p>
            <p className="text-sm text-gray-500">{t('platformAnalytics', 'voiceRooms', 'Voice Rooms')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Video className="h-8 w-8 mx-auto text-purple-500 mb-2" />
            <p className="text-2xl font-bold">{analytics.totalLiveChannels}</p>
            <p className="text-sm text-gray-500">{t('platformAnalytics', 'liveChannels', 'Live Channels')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <MessageSquare className="h-8 w-8 mx-auto text-indigo-500 mb-2" />
            <p className="text-2xl font-bold">{analytics.totalMessages.toLocaleString()}</p>
            <p className="text-sm text-gray-500">{t('platformAnalytics', 'messages', 'Messages')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Ministries */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            {t('platformAnalytics', 'topMinistriesByMembers', 'Top Ministries by Members')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {topMinistries.map((ministry, index) => (
              <div key={ministry.id} className="flex items-center gap-4">
                <span className="text-lg font-bold text-gray-400 w-6">#{index + 1}</span>
                <div 
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: ministry.theme_color || '#7c3aed' }}
                >
                  <Building2 className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{ministry.name}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant={ministry.is_active && ministry.approval_status === 'approved' ? 'default' : 'secondary'} className="text-xs">
                      {ministry.approval_status}
                    </Badge>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg">{ministry.member_count?.toLocaleString() || 0}</p>
                  <p className="text-xs text-gray-500">{t('platformAnalytics', 'members', 'members')}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* New Users This Month */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('platformAnalytics', 'newUsersThisMonth', 'New Users This Month')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                  style={{ width: `${Math.min(100, (analytics.newUsersThisMonth / 100) * 100)}%` }}
                />
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">{analytics.newUsersThisMonth}</p>
              <p className="text-sm text-gray-500">{t('platformAnalytics', 'newUsers', 'new users')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PlatformAnalytics;
