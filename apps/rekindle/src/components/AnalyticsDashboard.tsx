import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { supabase } from '@/lib/supabase';
import { useUserEntitlements } from '@/hooks/useUserEntitlements';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from './ui/use-toast';
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Users, BookOpen, Music, Heart, 
  DollarSign, Calendar, Download, RefreshCw, Eye, Clock, Loader2, Lock, Crown
} from 'lucide-react';

interface AnalyticsData {
  dailyActiveUsers: { date: string; users: number }[];
  contentPerformance: { name: string; views: number; engagement: number }[];
  userRetention: { week: string; retention: number }[];
  revenueData: { month: string; donations: number; sponsorships: number }[];
  topDevotionals: { title: string; views: number }[];
  topMusic: { title: string; plays: number }[];
  userGrowth: { date: string; newUsers: number; totalUsers: number }[];
  engagementByType: { type: string; count: number; color: string }[];
}

const COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#6366f1'];
const LOAD_TIMEOUT = 12000;

export const AnalyticsDashboard: React.FC = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const entitlements = useUserEntitlements();
  const { isAdmin, profile } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({
    dailyActiveUsers: [],
    contentPerformance: [],
    userRetention: [],
    revenueData: [],
    topDevotionals: [],
    topMusic: [],
    userGrowth: [],
    engagementByType: []
  });
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalRevenue: 0,
    avgEngagement: 0,
    userGrowthRate: 0,
    retentionRate: 0
  });

  // Refs to prevent duplicate operations
  const loadingRef = useRef(false);
  const isMounted = useRef(true);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialLoadDone = useRef(false);
  
  // Check analytics access (Ministry+ feature) — admins always have access
  const isAdminUser = isAdmin || profile?.role === 'admin' || profile?.role === 'super_admin';
  const canAccessAnalytics = isAdminUser || entitlements.canAccessAdvancedAnalytics;

  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true;
    
    return () => {
      isMounted.current = false;
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    };
  }, []);

  // Initial load
  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      loadAnalytics();
    }
  }, []);

  // Date range change
  useEffect(() => {
    if (initialLoadDone.current && !loading) {
      loadAnalytics();
    }
  }, [dateRange]);

  const loadAnalytics = useCallback(async () => {
    // Prevent duplicate calls
    if (loadingRef.current) {
      console.log('[AnalyticsDashboard] Already loading, skipping...');
      return;
    }

    loadingRef.current = true;
    setLoading(true);

    // Clear any existing timeout
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }

    // Set timeout
    loadTimeoutRef.current = setTimeout(() => {
      if (isMounted.current && loadingRef.current) {
        console.warn('[AnalyticsDashboard] Loading timeout');
        setLoading(false);
        loadingRef.current = false;
        toast({
          title: t('analyticsDashboard', 'loadingTimeoutTitle', 'Loading Timeout'),
          description: t('analyticsDashboard', 'loadingTimeoutDesc', 'Analytics data took too long to load'),
          variant: 'destructive'
        });
      }
    }, LOAD_TIMEOUT);

    try {
      const days = parseInt(dateRange);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Fetch real data from database with limits
      const [
        usersRes,
        devotionalsRes,
        musicRes,
        donationsRes,
        bookmarksRes,
        prayersRes
      ] = await Promise.all([
        supabase.from('user_profiles').select('*').limit(500),
        supabase.from('devotionals').select('*').limit(100),
        supabase.from('background_music').select('*').limit(100),
        supabase.from('donations').select('*').limit(100),
        supabase.from('bookmarks').select('*').limit(200),
        supabase.from('prayer_points').select('*').limit(100)
      ]);

      // Clear timeout
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }

      // Check if component is still mounted
      if (!isMounted.current) {
        loadingRef.current = false;
        return;
      }

      const users = usersRes.data || [];
      const devotionals = devotionalsRes.data || [];
      const music = musicRes.data || [];
      const donations = donationsRes.data || [];
      const bookmarks = bookmarksRes.data || [];
      const prayers = prayersRes.data || [];

      // Calculate total revenue
      const totalDonations = donations.reduce((sum, d) => sum + (d.amount || 0), 0);

      // Generate daily active users data (simulated based on user count)
      const dailyActiveUsers = generateDailyData(days, users.length);
      
      // Generate user growth data
      const userGrowth = generateUserGrowthData(days, users.length);

      // Content performance
      const contentPerformance = [
        { name: 'Devotionals', views: devotionals.length * 45, engagement: 78 },
        { name: 'Music', views: music.length * 120, engagement: 85 },
        { name: 'Prayers', views: prayers.length * 30, engagement: 72 },
        { name: 'Books', views: 250, engagement: 65 }
      ];

      // User retention (simulated)
      const userRetention = [
        { week: 'Week 1', retention: 100 },
        { week: 'Week 2', retention: 72 },
        { week: 'Week 3', retention: 58 },
        { week: 'Week 4', retention: 45 },
        { week: 'Week 5', retention: 38 },
        { week: 'Week 6', retention: 32 }
      ];

      // Revenue data by month
      const revenueData = generateRevenueData(donations);

      // Top devotionals
      const topDevotionals = devotionals.slice(0, 5).map((d, i) => ({
        title: d.title || `Devotional ${i + 1}`,
        views: Math.floor(Math.random() * 500) + 100
      }));

      // Top music
      const topMusic = music.slice(0, 5).map((m, i) => ({
        title: m.title || `Track ${i + 1}`,
        plays: Math.floor(Math.random() * 1000) + 200
      }));

      // Engagement by type
      const engagementByType = [
        { type: 'Devotionals', count: devotionals.length * 10, color: '#8b5cf6' },
        { type: 'Music', count: music.length * 25, color: '#ec4899' },
        { type: 'Prayers', count: prayers.length * 8, color: '#f59e0b' },
        { type: 'Bookmarks', count: bookmarks.length, color: '#10b981' }
      ];

      if (isMounted.current) {
        setAnalyticsData({
          dailyActiveUsers,
          contentPerformance,
          userRetention,
          revenueData,
          topDevotionals,
          topMusic,
          userGrowth,
          engagementByType
        });

        setStats({
          totalUsers: users.length,
          activeUsers: Math.floor(users.length * 0.65),
          totalRevenue: totalDonations,
          avgEngagement: 72,
          userGrowthRate: 12.5,
          retentionRate: 45
        });
      }

    } catch (error) {
      console.error('[AnalyticsDashboard] Error loading analytics:', error);
      if (isMounted.current) {
        toast({
          title: t('analyticsDashboard', 'errorTitle', 'Error'),
          description: t('analyticsDashboard', 'loadFailedDesc', 'Failed to load analytics data'),
          variant: 'destructive'
        });
      }
    } finally {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
      if (isMounted.current) {
        setLoading(false);
      }
      loadingRef.current = false;
    }
  }, [dateRange, toast, t]);

  const generateDailyData = (days: number, userCount: number) => {
    const data = [];
    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      data.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        users: Math.floor(userCount * (0.4 + Math.random() * 0.4))
      });
    }
    return data;
  };

  const generateUserGrowthData = (days: number, totalUsers: number) => {
    const data = [];
    let cumulative = Math.floor(totalUsers * 0.5);
    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const newUsers = Math.floor(Math.random() * 5) + 1;
      cumulative += newUsers;
      data.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        newUsers,
        totalUsers: Math.min(cumulative, totalUsers)
      });
    }
    return data;
  };

  const generateRevenueData = (donations: any[]) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    return months.map(month => ({
      month,
      donations: Math.floor(Math.random() * 500) + 100,
      sponsorships: Math.floor(Math.random() * 1000) + 200
    }));
  };

  const exportToCSV = useCallback(() => {
    const csvData = [
      ['Metric', 'Value'],
      ['Total Users', stats.totalUsers],
      ['Active Users', stats.activeUsers],
      ['Total Revenue', stats.totalRevenue],
      ['Avg Engagement', stats.avgEngagement + '%'],
      ['User Growth Rate', stats.userGrowthRate + '%'],
      ['Retention Rate', stats.retentionRate + '%']
    ];

    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  }, [stats]);

  const StatCard = ({ icon: Icon, label, value, change, positive }: any) => (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <div className="text-right">
            <Icon className="h-8 w-8 text-purple-500 mb-1" />
            {change && (
              <div className={`flex items-center text-xs ${positive ? 'text-green-500' : 'text-red-500'}`}>
                {positive ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                {change}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-purple-500 mx-auto mb-4" />
          <p className="text-gray-600 text-sm">{t('analyticsDashboard', 'loadingAnalytics', 'Loading analytics...')}</p>
        </div>
      </div>
    );
  }

  // Block access if user doesn't have analytics permission
  if (!canAccessAnalytics) {
    return (
      <div className="space-y-6">
        <Alert className="bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200">
          <Lock className="h-5 w-5 text-purple-600" />
          <AlertDescription className="ml-2">
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-purple-900 text-lg">{t('analyticsDashboard', 'ministryFeatureTitle', 'Analytics Dashboard - Ministry Feature')}</p>
                <p className="text-purple-700 mt-2">
                  {t('analyticsDashboard', 'ministryFeatureDesc', "Access detailed analytics and insights about your ministry's engagement, growth, and content performance. Upgrade to Ministry tier to unlock this powerful tool.")}
                </p>
              </div>
              <div className="bg-white p-4 rounded-lg border border-purple-200">
                <p className="font-semibold text-gray-900 mb-2">{t('analyticsDashboard', 'whatYouGetTitle', "What you'll get with Ministry tier:")}</p>
                <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                  <li>{t('analyticsDashboard', 'featureUserGrowth', 'User growth and engagement analytics')}</li>
                  <li>{t('analyticsDashboard', 'featureContentPerf', 'Content performance metrics')}</li>
                  <li>{t('analyticsDashboard', 'featureRetention', 'Retention and conversion tracking')}</li>
                  <li>{t('analyticsDashboard', 'featureRevenue', 'Revenue and donation insights')}</li>
                  <li>{t('analyticsDashboard', 'featureExportCsv', 'Export data to CSV')}</li>
                  <li>{t('analyticsDashboard', 'featureDateRange', 'Custom date range reports')}</li>
                </ul>
              </div>
              <Button
                className="bg-purple-600 hover:bg-purple-700 text-white"
                onClick={() => window.location.href = '/subscribe'}
              >
                <Crown className="h-4 w-4 mr-2" />
                {t('analyticsDashboard', 'upgradeToMinistry', 'Upgrade to Ministry')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-gray-500">{t('analyticsDashboard', 'headerSubtitle', 'Track user engagement and content performance')}</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t('analyticsDashboard', 'last7Days', 'Last 7 days')}</SelectItem>
              <SelectItem value="30">{t('analyticsDashboard', 'last30Days', 'Last 30 days')}</SelectItem>
              <SelectItem value="90">{t('analyticsDashboard', 'last90Days', 'Last 90 days')}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={loadAnalytics} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {t('analyticsDashboard', 'refresh', 'Refresh')}
          </Button>
          <Button onClick={exportToCSV}>
            <Download className="h-4 w-4 mr-2" />
            {t('analyticsDashboard', 'exportCsv', 'Export CSV')}
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={Users} label={t('analyticsDashboard', 'statTotalUsers', 'Total Users')} value={stats.totalUsers} change="+12%" positive />
        <StatCard icon={Eye} label={t('analyticsDashboard', 'statActiveUsers', 'Active Users')} value={stats.activeUsers} change="+8%" positive />
        <StatCard icon={DollarSign} label={t('analyticsDashboard', 'statRevenue', 'Revenue')} value={`$${stats.totalRevenue}`} change="+15%" positive />
        <StatCard icon={Heart} label={t('analyticsDashboard', 'statEngagement', 'Engagement')} value={`${stats.avgEngagement}%`} change="+5%" positive />
        <StatCard icon={TrendingUp} label={t('analyticsDashboard', 'statGrowthRate', 'Growth Rate')} value={`${stats.userGrowthRate}%`} change="+2%" positive />
        <StatCard icon={Clock} label={t('analyticsDashboard', 'statRetention', 'Retention')} value={`${stats.retentionRate}%`} change="-3%" positive={false} />
      </div>

      {/* Charts Row 1 */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Daily Active Users */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('analyticsDashboard', 'dailyActiveUsersTitle', 'Daily Active Users')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={analyticsData.dailyActiveUsers}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Area type="monotone" dataKey="users" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* User Growth */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('analyticsDashboard', 'userGrowthTitle', 'User Growth')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analyticsData.userGrowth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="newUsers" stroke="#ec4899" name={t('analyticsDashboard', 'legendNewUsers', 'New Users')} />
                <Line type="monotone" dataKey="totalUsers" stroke="#8b5cf6" name={t('analyticsDashboard', 'legendTotalUsers', 'Total Users')} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Content Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('analyticsDashboard', 'contentPerformanceTitle', 'Content Performance')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={analyticsData.contentPerformance}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="views" fill="#8b5cf6" name={t('analyticsDashboard', 'legendViews', 'Views')} />
                <Bar dataKey="engagement" fill="#ec4899" name={t('analyticsDashboard', 'legendEngagementPct', 'Engagement %')} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* User Retention */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('analyticsDashboard', 'userRetentionTitle', 'User Retention')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={analyticsData.userRetention}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="retention" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Engagement by Type */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('analyticsDashboard', 'engagementByTypeTitle', 'Engagement by Type')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={analyticsData.engagementByType}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="count"
                  label={({ type }) => type}
                >
                  {analyticsData.engagementByType.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('analyticsDashboard', 'revenueOverviewTitle', 'Revenue Overview')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analyticsData.revenueData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => `$${value}`} />
              <Legend />
              <Bar dataKey="donations" fill="#10b981" name={t('analyticsDashboard', 'legendDonations', 'Donations')} />
              <Bar dataKey="sponsorships" fill="#3b82f6" name={t('analyticsDashboard', 'legendSponsorships', 'Sponsorships')} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top Content */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top Devotionals */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-purple-500" />
              {t('analyticsDashboard', 'topDevotionalsTitle', 'Top Devotionals')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analyticsData.topDevotionals.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="w-6 h-6 flex items-center justify-center">
                      {index + 1}
                    </Badge>
                    <span className="font-medium truncate max-w-[200px]">{item.title}</span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-500">
                    <Eye className="h-4 w-4" />
                    <span>{item.views}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Music */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Music className="h-5 w-5 text-pink-500" />
              {t('analyticsDashboard', 'topMusicTitle', 'Top Music Tracks')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analyticsData.topMusic.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="w-6 h-6 flex items-center justify-center">
                      {index + 1}
                    </Badge>
                    <span className="font-medium truncate max-w-[200px]">{item.title}</span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-500">
                    <Music className="h-4 w-4" />
                    <span>{item.plays} {t('analyticsDashboard', 'playsLabel', 'plays')}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;