import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from './ui/use-toast';
import {
  Trophy, Medal, Crown, Target, Flame, Users, Zap,
  TrendingUp, RefreshCw, Loader2
} from 'lucide-react';

interface LeaderboardUser {
  user_id: string;
  full_name: string;
  avatar_url: string;
  xp_points: number;
  prayer_streak: number;
  longest_prayer_streak: number;
  challenges_completed: number;
  disciples_mentored: number;
  prayers_said: number;
  devotionals_completed: number;
  xp_rank: number;
  streak_rank: number;
  challenges_rank: number;
  disciples_rank: number;
}

export const CommunityLeaderboard: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('xp');
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [userRank, setUserRank] = useState<LeaderboardUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, [activeTab, user]);

  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      
      // ✅ CORRECT: Use leaderboard_all_time view (same as Admin)
      const { data, error } = await supabase
        .from('leaderboard_all_time')
        .select('*')
        .limit(100);

      if (error) throw error;

      setLeaderboard(data || []);
      
      // Find current user's rank
      if (user) {
        const currentUser = data?.find(u => u.user_id === user.id);
        setUserRank(currentUser || null);
      }
    } catch (err: any) {
      console.error('Error loading leaderboard:', err);
      toast({
        title: t('communityLeaderboard', 'error', 'Error'),
        description: t('communityLeaderboard', 'loadError', 'Could not load leaderboard data'),
        variant: 'destructive'
      });
      setLeaderboard([]);
    } finally {
      setLoading(false);
    }
  };

  // ✅ STEP 3: Add Loading + Empty State Safety
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!leaderboard.length) {
    return (
      <div className="text-center py-12 text-gray-500">
        {t('communityLeaderboard', 'emptyState', 'No leaderboard data yet. Start praying to appear here')} 🙏
      </div>
    );
  }

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="h-6 w-6 text-yellow-500" />;
    if (rank === 2) return <Medal className="h-6 w-6 text-gray-400" />;
    if (rank === 3) return <Medal className="h-6 w-6 text-amber-600" />;
    return <span className="text-gray-500 font-bold">#{rank}</span>;
  };

  const getRankColor = (rank: number) => {
    if (rank === 1) return 'bg-gradient-to-r from-yellow-400 to-yellow-600';
    if (rank === 2) return 'bg-gradient-to-r from-gray-300 to-gray-500';
    if (rank === 3) return 'bg-gradient-to-r from-amber-400 to-amber-600';
    return 'bg-gray-100';
  };

  // ✅ Keep Ranking Logic (Already Correct)
  const getMetricValue = (user: LeaderboardUser) => {
    switch (activeTab) {
      case 'xp': return user.xp_points;
      case 'streak': return user.prayer_streak;
      case 'challenges': return user.challenges_completed;
      case 'disciples': return user.disciples_mentored;
      default: return 0;
    }
  };

  // ✅ Keep Ranking Logic (Already Correct)
  const getMetricRank = (user: LeaderboardUser) => {
    switch (activeTab) {
      case 'xp': return user.xp_rank;
      case 'streak': return user.streak_rank;
      case 'challenges': return user.challenges_rank;
      case 'disciples': return user.disciples_rank;
      default: return 0;
    }
  };

  // ✅ Keep Ranking Logic (Already Correct)
  const sortedLeaderboard = [...leaderboard].sort((a, b) => {
    return getMetricRank(a) - getMetricRank(b);
  });

  const getMetricLabel = () => {
    switch (activeTab) {
      case 'xp': return t('communityLeaderboard', 'labelXp', 'XP');
      case 'streak': return t('communityLeaderboard', 'labelDayStreak', 'day streak');
      case 'challenges': return t('communityLeaderboard', 'labelChallenges', 'challenges');
      case 'disciples': return t('communityLeaderboard', 'labelDisciples', 'disciples');
      default: return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-7 w-7 text-yellow-500" />
            {t('communityLeaderboard', 'title', 'Community Leaderboard')}
          </h2>
          <p className="text-gray-600">{t('communityLeaderboard', 'subtitle', 'Compete with others and earn rewards')}</p>
        </div>
        <Button variant="outline" onClick={loadLeaderboard} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {t('communityLeaderboard', 'refresh', 'Refresh')}
        </Button>
      </div>

      {/* User's Current Rank Card */}
      {userRank && (
        <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-purple-200 flex items-center justify-center text-2xl font-bold">
                  {getRankIcon(getMetricRank(userRank))}
                </div>
                <div>
                  <p className="text-sm text-gray-600">{t('communityLeaderboard', 'yourRank', 'Your Rank')}</p>
                  <p className="text-2xl font-bold text-purple-900">
                    #{getMetricRank(userRank)}
                  </p>
                  <p className="text-sm text-purple-600">
                    {getMetricValue(userRank)} {getMetricLabel()}
                  </p>
                </div>
              </div>
              {/* ❌ REMOVED: Badge UI section */}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Leaderboard Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="xp" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            {t('communityLeaderboard', 'tabXpPoints', 'XP Points')}
          </TabsTrigger>
          <TabsTrigger value="streak" className="flex items-center gap-2">
            <Flame className="h-4 w-4" />
            {t('communityLeaderboard', 'tabPrayerStreak', 'Prayer Streak')}
          </TabsTrigger>
          <TabsTrigger value="challenges" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            {t('communityLeaderboard', 'tabChallenges', 'Challenges')}
          </TabsTrigger>
          <TabsTrigger value="disciples" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t('communityLeaderboard', 'tabDisciples', 'Disciples')}
          </TabsTrigger>
        </TabsList>

        {/* Top 3 Podium */}
        {sortedLeaderboard.length >= 3 && (
          <div className="grid grid-cols-3 gap-4 my-6">
            {/* 2nd Place */}
            <Card className={`${getRankColor(2)} p-4 transform translate-y-4`}>
              <CardContent className="p-0 text-center">
                <div className="w-16 h-16 rounded-full bg-white mx-auto mb-2 flex items-center justify-center">
                  <Medal className="h-8 w-8 text-gray-400" />
                </div>
                <p className="font-bold text-white text-sm">{sortedLeaderboard[1]?.full_name || t('communityLeaderboard', 'userTwo', 'User #2')}</p>
                <p className="text-sm text-white opacity-90">
                  {getMetricValue(sortedLeaderboard[1])}
                </p>
              </CardContent>
            </Card>

            {/* 1st Place */}
            <Card className={`${getRankColor(1)} p-4`}>
              <CardContent className="p-0 text-center">
                <div className="w-20 h-20 rounded-full bg-white mx-auto mb-2 flex items-center justify-center">
                  <Crown className="h-10 w-10 text-yellow-500" />
                </div>
                <p className="font-bold text-white text-lg">{sortedLeaderboard[0]?.full_name || t('communityLeaderboard', 'topUser', 'Top User')}</p>
                <p className="text-white opacity-90">
                  {getMetricValue(sortedLeaderboard[0])}
                </p>
              </CardContent>
            </Card>

            {/* 3rd Place */}
            <Card className={`${getRankColor(3)} p-4 transform translate-y-8`}>
              <CardContent className="p-0 text-center">
                <div className="w-16 h-16 rounded-full bg-white mx-auto mb-2 flex items-center justify-center">
                  <Medal className="h-8 w-8 text-amber-600" />
                </div>
                <p className="font-bold text-white text-sm">{sortedLeaderboard[2]?.full_name || t('communityLeaderboard', 'userThree', 'User #3')}</p>
                <p className="text-sm text-white opacity-90">
                  {getMetricValue(sortedLeaderboard[2])}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Full Leaderboard List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {t('communityLeaderboard', 'fullRankings', 'Full Rankings')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {sortedLeaderboard.map((user) => {
                const rank = getMetricRank(user);
                const isCurrentUser = user.user_id === userRank?.user_id;
                
                return (
                  <div
                    key={user.user_id}
                    className={`flex items-center justify-between p-4 hover:bg-gray-50 ${
                      isCurrentUser ? 'bg-purple-50 border-l-4 border-purple-500' : ''
                    }`}
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-10 flex items-center justify-center">
                        {getRankIcon(rank)}
                      </div>
                      
                      <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-lg font-bold text-purple-600">
                        {user.full_name?.[0] || '?'}
                      </div>
                      
                      <div className="flex-1">
                        <p className="font-semibold flex items-center gap-2">
                          {user.full_name}
                          {isCurrentUser && (
                            <Badge variant="secondary" className="text-xs">{t('communityLeaderboard', 'you', 'You')}</Badge>
                          )}
                        </p>
                        <div className="flex gap-3 text-sm text-gray-600">
                          <span className="flex items-center gap-1">
                            <Zap className="h-3 w-3" />
                            {user.xp_points} {t('communityLeaderboard', 'labelXp', 'XP')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Flame className="h-3 w-3" />
                            {user.prayer_streak} {t('communityLeaderboard', 'labelStreak', 'streak')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-2xl font-bold text-purple-600">
                        {getMetricValue(user)}
                      </p>
                      <p className="text-xs text-gray-500 capitalize">{getMetricLabel()}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
};

export default CommunityLeaderboard;