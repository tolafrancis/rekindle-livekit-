import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from './ui/use-toast';
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  Users, BookOpen, Heart, Calendar, RefreshCw, 
  Trophy, Target, Share2, Flame, BookMarked, 
  MessageCircle, Mic, Award, TrendingUp, Clock,
  Gift, Zap, Eye, CheckCircle, Copy, Check,
  Send, Star, ExternalLink, TrendingDown
} from 'lucide-react';

/* ✅ NEW — REQUIRED IMPORT */
import { CommunityLeaderboard } from './CommunityLeaderboard';

interface UserActivityData {
  prayerGroupsJoined: number;
  challengesCompleted: number;
  challengesInProgress: number;
  disciplesCount: number;
  bookReferrals: number;
  bookReferralClicks: number;
  bookReferralConversions: number;
  totalPrayers: number;
  prayerStreak: number;
  xpPoints: number;
  devotionalsCompleted: number;
  journalEntries: number;
  voiceRoomsJoined: number;
  revelationsShared: number;
  prayerMinutes: number;
  prayerPoints: number;
  referralsCount: number;
  referralsCompleted: number;
}

interface ActivityTrend {
  date: string;
  prayers: number;
  devotionals: number;
  challenges: number;
}

interface ReferralTrend {
  date: string;
  shares: number;
  clicks: number;
  conversions: number;
}

interface EngagementData {
  name: string;
  value: number;
  color: string;
}

interface TopSharedBook {
  book_id: string;
  book_title: string;
  book_author: string;
  share_count: number;
  clicks: number;
  conversions: number;
  conversion_rate: number;
}

const COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#6366f1'];

export const UserActivityDashboard: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [activityData, setActivityData] = useState<UserActivityData>({
    prayerGroupsJoined: 0,
    challengesCompleted: 0,
    challengesInProgress: 0,
    disciplesCount: 0,
    bookReferrals: 0,
    bookReferralClicks: 0,
    bookReferralConversions: 0,
    totalPrayers: 0,
    prayerStreak: 0,
    xpPoints: 0,
    devotionalsCompleted: 0,
    journalEntries: 0,
    voiceRoomsJoined: 0,
    revelationsShared: 0,
    prayerMinutes: 0,
    prayerPoints: 0,
    referralsCount: 0,
    referralsCompleted: 0
  });
  const [activityTrend, setActivityTrend] = useState<ActivityTrend[]>([]);
  const [referralTrend, setReferralTrend] = useState<ReferralTrend[]>([]);
  const [engagementData, setEngagementData] = useState<EngagementData[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [topSharedBooks, setTopSharedBooks] = useState<TopSharedBook[]>([]);
  const [referralCode, setReferralCode] = useState<string>('');
  const [showReferralDetails, setShowReferralDetails] = useState(false);

  useEffect(() => {
    if (user?.id) {
      loadUserActivity();
    }
  }, [user?.id]);

  const loadUserActivity = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      // Fetch all user activity data in parallel
      const [
        groupMembersRes,
        challengeParticipantsRes,
        bookReferralsRes,
        journalRes,
        devotionalProgressRes,
        revelationsRes,
        activityLogRes,
        disciplesRes,
        userProfileRes,
        prayerHistoryRes,
        ministryDevRes,
        libraryDevRes,
        referralsRes
      ] = await Promise.all([
        supabase.from('prayer_group_members').select('*').eq('user_id', user.id),
        supabase.from('challenge_participants').select('*, prayer_challenges(*)').eq('user_id', user.id),
        supabase.from('book_referrals').select('*, book_summaries(title, author)').eq('referrer_id', user.id),
        supabase.from('prayer_journal').select('*').eq('user_id', user.id),
        supabase.from('devotional_progress').select('*').eq('user_id', user.id),
        supabase.from('community_revelations').select('*').eq('user_id', user.id),
        supabase.from('user_activity_log').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
        supabase.from('discipleship_connections').select('*').eq('mentor_user_id', user.id),
        supabase.from('user_profiles').select('referral_code').eq('id', user.id).single(),
        supabase.from('prayer_history').select('duration_minutes, prayer_points_count').eq('user_id', user.id),
        supabase.from('ministry_devotional_progress').select('id').eq('user_id', user.id),
        supabase.from('devotional_user_progress').select('completed_days').eq('user_id', user.id),
        supabase.from('referrals').select('status').eq('referrer_user_id', user.id)
      ]);

      const groupMembers = groupMembersRes.data || [];
      const challengeParticipants = challengeParticipantsRes.data || [];
      const bookReferrals = bookReferralsRes.data || [];
      const journalEntries = journalRes.data || [];
      const devotionalProgress = devotionalProgressRes.data || [];
      const revelations = revelationsRes.data || [];
      const activityLog = activityLogRes.data || [];
      const disciples = disciplesRes.data || [];

      // Set referral code
      if (userProfileRes.data?.referral_code) {
        setReferralCode(userProfileRes.data.referral_code);
      }

      // Calculate metrics
      const completedChallenges = challengeParticipants.filter(c => c.completed);
      const inProgressChallenges = challengeParticipants.filter(c => !c.completed);
      const completedDevotionals = devotionalProgress.filter(d => d.completed);

      // Calculate book referral metrics
      const totalClicks = bookReferrals.reduce((sum, r) => sum + (r.clicks || 0), 0);
      const totalConversions = bookReferrals.reduce((sum, r) => sum + (r.conversions || 0), 0);

      // All-feature metrics (aligned with the home stat tiles)
      const prayerHistory = prayerHistoryRes.data || [];
      const ministryDevs = ministryDevRes.data || [];
      const libraryDevs = libraryDevRes.data || [];
      const referralRows = referralsRes.data || [];
      const prayerMinutes = prayerHistory.reduce((s: number, r: any) => s + (Number(r.duration_minutes) || 0), 0);
      const prayerPoints = prayerHistory.reduce((s: number, r: any) => s + (Number(r.prayer_points_count) || 0), 0);
      const libraryDevDays = libraryDevs.reduce((s: number, r: any) => s + (Array.isArray(r.completed_days) ? r.completed_days.length : 0), 0);
      const devotionalsAll = completedDevotionals.length + ministryDevs.length + libraryDevDays;
      const referralsDone = referralRows.filter((r: any) => r.status === 'completed' || r.status === 'rewarded').length;

      setActivityData({
        prayerGroupsJoined: groupMembers.length,
        challengesCompleted: completedChallenges.length,
        challengesInProgress: inProgressChallenges.length,
        disciplesCount: disciples.length || profile?.disciples_count || 0,
        bookReferrals: bookReferrals.length,
        bookReferralClicks: totalClicks,
        bookReferralConversions: totalConversions,
        totalPrayers: profile?.total_prayers || 0,
        prayerStreak: profile?.prayer_streak || 0,
        xpPoints: profile?.xp_points || 0,
        devotionalsCompleted: devotionalsAll,
        journalEntries: journalEntries.length,
        voiceRoomsJoined: activityLog.filter(a => a.activity_type === 'voice_room_joined').length,
        revelationsShared: revelations.length,
        prayerMinutes,
        prayerPoints,
        referralsCount: referralRows.length,
        referralsCompleted: referralsDone
      });

      // Generate activity trend data (last 14 days)
      const trendData = generateActivityTrend(activityLog);
      setActivityTrend(trendData);

      // Generate referral trend data (last 14 days)
      const refTrendData = generateReferralTrend(bookReferrals);
      setReferralTrend(refTrendData);

      // Generate engagement breakdown
      const engagement: EngagementData[] = [
        { name: 'Prayer Points', value: prayerPoints, color: '#8b5cf6' },
        { name: 'Devotionals', value: devotionalsAll, color: '#ec4899' },
        { name: 'Challenges', value: completedChallenges.length, color: '#f59e0b' },
        { name: 'Referrals', value: referralRows.length, color: '#10b981' },
        { name: 'Book Shares', value: bookReferrals.length, color: '#3b82f6' },
        { name: 'Revelations', value: revelations.length, color: '#6366f1' }
      ];
      setEngagementData(engagement);

      // Calculate top shared books
      const bookMap = new Map<string, TopSharedBook>();
      bookReferrals.forEach(ref => {
        const bookId = ref.book_id;
        if (bookMap.has(bookId)) {
          const book = bookMap.get(bookId)!;
          book.share_count += 1;
          book.clicks += ref.clicks || 0;
          book.conversions += ref.conversions || 0;
        } else {
          bookMap.set(bookId, {
            book_id: bookId,
            book_title: ref.book_summaries?.title || 'Unknown Book',
            book_author: ref.book_summaries?.author || 'Unknown Author',
            share_count: 1,
            clicks: ref.clicks || 0,
            conversions: ref.conversions || 0,
            conversion_rate: 0
          });
        }
      });

      const topBooks = Array.from(bookMap.values())
        .map(book => ({
          ...book,
          conversion_rate: book.clicks > 0 ? (book.conversions / book.clicks) * 100 : 0
        }))
        .sort((a, b) => b.share_count - a.share_count)
        .slice(0, 5);
      
      setTopSharedBooks(topBooks);

      // Set recent activity
      setRecentActivity(activityLog.slice(0, 10));

    } catch (error) {
      console.error('Error loading user activity:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateActivityTrend = (activityLog: any[]): ActivityTrend[] => {
    const days = 14;
    const data: ActivityTrend[] = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayActivities = activityLog.filter(a => 
        a.created_at?.startsWith(dateStr)
      );
      
      data.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        prayers: dayActivities.filter(a => a.activity_type === 'prayer').length,
        devotionals: dayActivities.filter(a => a.activity_type === 'devotional_completed').length,
        challenges: dayActivities.filter(a => a.activity_type === 'challenge_progress').length
      });
    }
    
    return data;
  };

  const generateReferralTrend = (bookReferrals: any[]): ReferralTrend[] => {
    const days = 14;
    const data: ReferralTrend[] = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayReferrals = bookReferrals.filter(r => 
        r.created_at?.startsWith(dateStr)
      );
      
      data.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        shares: dayReferrals.length,
        clicks: dayReferrals.reduce((sum, r) => sum + (r.clicks || 0), 0),
        conversions: dayReferrals.reduce((sum, r) => sum + (r.conversions || 0), 0)
      });
    }
    
    return data;
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'prayer': return <Heart className="h-4 w-4 text-purple-500" />;
      case 'devotional_completed': return <BookOpen className="h-4 w-4 text-pink-500" />;
      case 'challenge_progress': return <Target className="h-4 w-4 text-amber-500" />;
      case 'voice_room_joined': return <Mic className="h-4 w-4 text-blue-500" />;
      case 'group_joined': return <Users className="h-4 w-4 text-green-500" />;
      case 'book_referral': return <Share2 className="h-4 w-4 text-indigo-500" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const copyReferralCode = () => {
    navigator.clipboard.writeText(referralCode);
    toast({
      title: t('userActivityDashboard', 'copied', 'Copied!'),
      description: t('userActivityDashboard', 'referralCodeCopied', 'Referral code copied to clipboard')
    });
  };

  const shareReferralLink = (book: TopSharedBook) => {
    const url = `${window.location.origin}/books/${book.book_id}?ref=${referralCode}`;
    navigator.clipboard.writeText(url);
    toast({
      title: t('userActivityDashboard', 'linkCopied', 'Link Copied!'),
      description: t('userActivityDashboard', 'shareLinkCopied', 'Share link for "{title}" copied to clipboard').replace('{title}', String(book.book_title))
    });
  };

  const StatCard = ({ icon: Icon, label, value, subValue, color, onClick }: any) => (
    <Card 
      className={`hover:shadow-lg transition-shadow ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subValue && <p className="text-xs text-gray-400">{subValue}</p>}
          </div>
          <div className={`p-3 rounded-full ${color}`}>
            <Icon className="h-6 w-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const conversionRate = activityData.bookReferralClicks > 0 
    ? ((activityData.bookReferralConversions / activityData.bookReferralClicks) * 100).toFixed(1)
    : '0';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">{t('userActivityDashboard', 'yourSpiritualActivity', 'Your Spiritual Activity')}</h2>
          <p className="text-gray-500">{t('userActivityDashboard', 'trackYourFaithJourney', 'Track your faith journey and engagement')}</p>
        </div>
        <Button variant="outline" onClick={loadUserActivity}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {t('userActivityDashboard', 'refresh', 'Refresh')}
        </Button>
      </div>

      {/* ============================= */}
      {/* ✅ COMMUNITY LEADERBOARD */}
      {/* ============================= */}
      {user && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              {t('userActivityDashboard', 'communityLeaderboard', 'Community Leaderboard')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CommunityLeaderboard />
          </CardContent>
        </Card>
      )}

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Clock}
          label={t('userActivityDashboard', 'prayerMinutes', 'Prayer Minutes')}
          value={activityData.prayerMinutes}
          subValue={t('userActivityDashboard', 'inPrayer', 'In prayer')}
          color="bg-gradient-to-br from-orange-500 to-red-600"
        />
        <StatCard
          icon={Heart}
          label={t('userActivityDashboard', 'prayerPoints', 'Prayer Points')}
          value={activityData.prayerPoints}
          subValue={t('userActivityDashboard', 'prayed', 'Prayed')}
          color="bg-gradient-to-br from-purple-500 to-purple-700"
        />
        <StatCard
          icon={BookOpen}
          label={t('userActivityDashboard', 'devotionals', 'Devotionals')}
          value={activityData.devotionalsCompleted}
          subValue={t('userActivityDashboard', 'completed', 'Completed')}
          color="bg-gradient-to-br from-pink-500 to-rose-600"
        />
        <StatCard
          icon={Trophy}
          label={t('userActivityDashboard', 'challenges', 'Challenges')}
          value={activityData.challengesCompleted}
          subValue={t('userActivityDashboard', 'xInProgress', '{count} in progress').replace('{count}', String(activityData.challengesInProgress))}
          color="bg-gradient-to-br from-amber-500 to-amber-600"
        />
        <StatCard
          icon={Gift}
          label={t('userActivityDashboard', 'referrals', 'Referrals')}
          value={activityData.referralsCount}
          subValue={t('userActivityDashboard', 'xJoined', '{count} joined').replace('{count}', String(activityData.referralsCompleted))}
          color="bg-gradient-to-br from-emerald-500 to-green-600"
        />
        <StatCard
          icon={Users}
          label={t('userActivityDashboard', 'disciples', 'Disciples')}
          value={activityData.disciplesCount}
          subValue={t('userActivityDashboard', 'mentoring', 'Mentoring')}
          color="bg-gradient-to-br from-blue-500 to-blue-600"
        />
        <StatCard
          icon={Share2}
          label={t('userActivityDashboard', 'bookReferrals', 'Book Referrals')}
          value={activityData.bookReferrals}
          subValue={t('userActivityDashboard', 'xClicks', '{count} clicks').replace('{count}', String(activityData.bookReferralClicks))}
          color="bg-gradient-to-br from-indigo-500 to-indigo-600"
          onClick={() => setShowReferralDetails(true)}
        />
        <StatCard
          icon={Eye}
          label={t('userActivityDashboard', 'revelations', 'Revelations')}
          value={activityData.revelationsShared}
          subValue={t('userActivityDashboard', 'shared', 'Shared')}
          color="bg-gradient-to-br from-violet-500 to-purple-600"
        />
      </div>

      {/* Book Referral Highlight (if user has referrals) */}
      {activityData.bookReferrals > 0 && (
        <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <Gift className="h-6 w-6 text-indigo-600" />
                  <h3 className="text-lg font-bold text-indigo-900">{t('userActivityDashboard', 'bookSharingImpact', 'Book Sharing Impact')}</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-2xl font-bold text-indigo-900">{activityData.bookReferrals}</p>
                    <p className="text-xs text-indigo-600">{t('userActivityDashboard', 'booksShared', 'Books Shared')}</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-indigo-900">{activityData.bookReferralClicks}</p>
                    <p className="text-xs text-indigo-600">{t('userActivityDashboard', 'totalClicks', 'Total Clicks')}</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-indigo-900">{activityData.bookReferralConversions}</p>
                    <p className="text-xs text-indigo-600">{t('userActivityDashboard', 'booksRead', 'Books Read')}</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-indigo-900">{conversionRate}%</p>
                    <p className="text-xs text-indigo-600">{t('userActivityDashboard', 'conversionRate', 'Conversion Rate')}</p>
                  </div>
                </div>
              </div>
              <Button
                onClick={() => setShowReferralDetails(true)}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {t('userActivityDashboard', 'viewDetails', 'View Details')}
                <ExternalLink className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Secondary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Heart className="h-8 w-8 mx-auto mb-2 text-purple-500" />
            <p className="text-2xl font-bold">{activityData.totalPrayers}</p>
            <p className="text-xs text-gray-500">{t('userActivityDashboard', 'totalPrayers', 'Total Prayers')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <BookOpen className="h-8 w-8 mx-auto mb-2 text-pink-500" />
            <p className="text-2xl font-bold">{activityData.devotionalsCompleted}</p>
            <p className="text-xs text-gray-500">{t('userActivityDashboard', 'devotionalsCompleted', 'Devotionals Completed')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <BookMarked className="h-8 w-8 mx-auto mb-2 text-amber-500" />
            <p className="text-2xl font-bold">{activityData.journalEntries}</p>
            <p className="text-xs text-gray-500">{t('userActivityDashboard', 'journalEntries', 'Journal Entries')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <MessageCircle className="h-8 w-8 mx-auto mb-2 text-blue-500" />
            <p className="text-2xl font-bold">{activityData.revelationsShared}</p>
            <p className="text-xs text-gray-500">{t('userActivityDashboard', 'revelationsShared', 'Revelations Shared')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Activity Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-500" />
              {t('userActivityDashboard', 'activityTrend14Days', 'Activity Trend (Last 14 Days)')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={activityTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="prayers" stackId="1" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.6} name={t('userActivityDashboard', 'prayers', 'Prayers')} />
                <Area type="monotone" dataKey="devotionals" stackId="1" stroke="#ec4899" fill="#ec4899" fillOpacity={0.6} name={t('userActivityDashboard', 'devotionals', 'Devotionals')} />
                <Area type="monotone" dataKey="challenges" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.6} name={t('userActivityDashboard', 'challenges', 'Challenges')} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Referral Trend or Engagement Breakdown */}
        {activityData.bookReferrals > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Share2 className="h-5 w-5 text-indigo-500" />
                {t('userActivityDashboard', 'bookReferralTrend14Days', 'Book Referral Trend (Last 14 Days)')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={referralTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="shares" stroke="#6366f1" strokeWidth={2} name={t('userActivityDashboard', 'shares', 'Shares')} />
                  <Line type="monotone" dataKey="clicks" stroke="#3b82f6" strokeWidth={2} name={t('userActivityDashboard', 'clicks', 'Clicks')} />
                  <Line type="monotone" dataKey="conversions" stroke="#10b981" strokeWidth={2} name={t('userActivityDashboard', 'conversions', 'Conversions')} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5 text-pink-500" />
                {t('userActivityDashboard', 'engagementBreakdown', 'Engagement Breakdown')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={engagementData.filter(d => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {engagementData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Progress Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Active Challenges Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              {t('userActivityDashboard', 'activeChallenges', 'Active Challenges')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activityData.challengesInProgress > 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  {t('userActivityDashboard', 'youHaveXChallengesInProgress', 'You have {count} challenge(s) in progress').replace('{count}', String(activityData.challengesInProgress))}
                </p>
                <div className="space-y-3">
                  {/* Placeholder for actual challenge progress */}
                  <div className="p-3 bg-amber-50 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">{t('userActivityDashboard', 'prayerChallenge21Day', '21-Day Prayer Challenge')}</span>
                      <Badge variant="outline">{t('userActivityDashboard', 'inProgress', 'In Progress')}</Badge>
                    </div>
                    <Progress value={65} className="h-2" />
                    <p className="text-xs text-gray-500 mt-1">{t('userActivityDashboard', 'xOfYDaysCompleted', '14 of 21 days completed')}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <Trophy className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                <p className="text-gray-500">{t('userActivityDashboard', 'noActiveChallenges', 'No active challenges')}</p>
                <Button variant="outline" size="sm" className="mt-2">
                  {t('userActivityDashboard', 'browseChallenges', 'Browse Challenges')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              {t('userActivityDashboard', 'recentActivity', 'Recent Activity')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                    {getActivityIcon(activity.activity_type)}
                    <div className="flex-1">
                      <p className="text-sm font-medium capitalize">
                        {activity.activity_type?.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(activity.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <Clock className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                <p className="text-gray-500">{t('userActivityDashboard', 'noRecentActivity', 'No recent activity')}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {t('userActivityDashboard', 'startPrayingHint', 'Start praying, reading devotionals, or joining groups!')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Milestones */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Award className="h-5 w-5 text-purple-500" />
            {t('userActivityDashboard', 'milestonesAndAchievements', 'Milestones & Achievements')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`p-4 rounded-lg text-center ${activityData.totalPrayers >= 100 ? 'bg-purple-100' : 'bg-gray-100'}`}>
              <Heart className={`h-8 w-8 mx-auto mb-2 ${activityData.totalPrayers >= 100 ? 'text-purple-500' : 'text-gray-400'}`} />
              <p className="font-medium">{t('userActivityDashboard', 'prayerWarrior', 'Prayer Warrior')}</p>
              <p className="text-xs text-gray-500">{t('userActivityDashboard', 'hundredPrayers', '100 Prayers')}</p>
              <Progress value={Math.min((activityData.totalPrayers / 100) * 100, 100)} className="h-1 mt-2" />
            </div>
            <div className={`p-4 rounded-lg text-center ${activityData.prayerStreak >= 30 ? 'bg-orange-100' : 'bg-gray-100'}`}>
              <Flame className={`h-8 w-8 mx-auto mb-2 ${activityData.prayerStreak >= 30 ? 'text-orange-500' : 'text-gray-400'}`} />
              <p className="font-medium">{t('userActivityDashboard', 'onFire', 'On Fire')}</p>
              <p className="text-xs text-gray-500">{t('userActivityDashboard', 'thirtyDayStreak', '30-Day Streak')}</p>
              <Progress value={Math.min((activityData.prayerStreak / 30) * 100, 100)} className="h-1 mt-2" />
            </div>
            <div className={`p-4 rounded-lg text-center ${activityData.disciplesCount >= 5 ? 'bg-blue-100' : 'bg-gray-100'}`}>
              <Users className={`h-8 w-8 mx-auto mb-2 ${activityData.disciplesCount >= 5 ? 'text-blue-500' : 'text-gray-400'}`} />
              <p className="font-medium">{t('userActivityDashboard', 'mentor', 'Mentor')}</p>
              <p className="text-xs text-gray-500">{t('userActivityDashboard', 'fiveDisciples', '5 Disciples')}</p>
              <Progress value={Math.min((activityData.disciplesCount / 5) * 100, 100)} className="h-1 mt-2" />
            </div>
            <div className={`p-4 rounded-lg text-center ${activityData.challengesCompleted >= 10 ? 'bg-amber-100' : 'bg-gray-100'}`}>
              <Trophy className={`h-8 w-8 mx-auto mb-2 ${activityData.challengesCompleted >= 10 ? 'text-amber-500' : 'text-gray-400'}`} />
              <p className="font-medium">{t('userActivityDashboard', 'champion', 'Champion')}</p>
              <p className="text-xs text-gray-500">{t('userActivityDashboard', 'tenChallenges', '10 Challenges')}</p>
              <Progress value={Math.min((activityData.challengesCompleted / 10) * 100, 100)} className="h-1 mt-2" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Book Referral Details Dialog */}
      <Dialog open={showReferralDetails} onOpenChange={setShowReferralDetails}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-6 w-6 text-indigo-600" />
              {t('userActivityDashboard', 'bookReferralDetails', 'Book Referral Details')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Your Referral Code */}
            {referralCode && (
              <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200">
                <CardContent className="p-6">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Zap className="h-5 w-5 text-purple-600" />
                    {t('userActivityDashboard', 'yourReferralCode', 'Your Referral Code')}
                  </h4>
                  <div className="flex gap-2">
                    <Input 
                      value={referralCode} 
                      readOnly 
                      className="font-mono bg-white"
                    />
                    <Button onClick={copyReferralCode}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-gray-600 mt-2">
                    {t('userActivityDashboard', 'shareBooksHint', 'Share books with this code to track your referrals and inspire others to read')}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Stats Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-indigo-50 border-indigo-200">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-indigo-900">{activityData.bookReferrals}</p>
                  <p className="text-xs text-indigo-600 mt-1">{t('userActivityDashboard', 'booksShared', 'Books Shared')}</p>
                </CardContent>
              </Card>

              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-blue-900">{activityData.bookReferralClicks}</p>
                  <p className="text-xs text-blue-600 mt-1">{t('userActivityDashboard', 'totalClicks', 'Total Clicks')}</p>
                </CardContent>
              </Card>

              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-green-900">{activityData.bookReferralConversions}</p>
                  <p className="text-xs text-green-600 mt-1">{t('userActivityDashboard', 'booksRead', 'Books Read')}</p>
                </CardContent>
              </Card>

              <Card className="bg-amber-50 border-amber-200">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-amber-900">{conversionRate}%</p>
                  <p className="text-xs text-amber-600 mt-1">{t('userActivityDashboard', 'conversionRate', 'Conversion Rate')}</p>
                </CardContent>
              </Card>
            </div>

            {/* Top Shared Books */}
            {topSharedBooks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Star className="h-5 w-5 text-amber-500" />
                    {t('userActivityDashboard', 'yourTopSharedBooks', 'Your Top Shared Books')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {topSharedBooks.map((book, index) => (
                      <div 
                        key={book.book_id}
                        className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                            index === 0 ? 'bg-amber-500 text-white' :
                            index === 1 ? 'bg-gray-400 text-white' :
                            index === 2 ? 'bg-amber-700 text-white' :
                            'bg-gray-200 text-gray-700'
                          }`}>
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{book.book_title}</p>
                            <p className="text-xs text-gray-500">{book.book_author}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-bold text-indigo-900">{book.share_count}</p>
                            <p className="text-xs text-gray-500">{t('userActivityDashboard', 'sharesLabel', 'shares')}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-blue-900">{book.clicks}</p>
                            <p className="text-xs text-gray-500">{t('userActivityDashboard', 'clicksLabel', 'clicks')}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-green-900">{book.conversions}</p>
                            <p className="text-xs text-gray-500">{t('userActivityDashboard', 'readsLabel', 'reads')}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => shareReferralLink(book)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Referral Trend Chart */}
            {referralTrend.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-indigo-500" />
                    {t('userActivityDashboard', 'referralPerformance', 'Referral Performance')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={referralTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="shares" fill="#6366f1" name={t('userActivityDashboard', 'shares', 'Shares')} />
                      <Bar dataKey="clicks" fill="#3b82f6" name={t('userActivityDashboard', 'clicks', 'Clicks')} />
                      <Bar dataKey="conversions" fill="#10b981" name={t('userActivityDashboard', 'conversions', 'Conversions')} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserActivityDashboard;