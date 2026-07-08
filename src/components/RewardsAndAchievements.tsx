import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge as UIBadge } from './ui/badge';
import { Progress } from './ui/progress';
import { Button } from './ui/button';
import { BadgeCard } from './BadgeCard';
import { useAuth } from '@/contexts/AuthContext';
import { achievementTracker } from '@/lib/achievementTracker';
import { Badge, BadgeCategory, badges, getBadgesByCategory } from '@/data/badges';
import {
  Trophy,
  Star,
  TrendingUp,
  Award,
  Crown,
  Zap,
  Target,
  Users,
  BookOpen,
  Tv,
  Heart,
  Flame,
  Gift,
  GraduationCap,
  BookMarked,
  Sparkles,
  ChevronRight,
  Medal,
  Loader2
} from 'lucide-react';

const categoryIcons: Record<BadgeCategory, React.ElementType> = {
  prayer: BookOpen,
  devotional: BookMarked,
  live_channel: Tv,
  community: Heart,
  mentorship: GraduationCap,
  referral: Users,
  scripture: BookMarked,
  streak: Flame,
  ai_companion: Sparkles,
  counselling: Heart,
  special: Star
};

const categoryLabels: Record<BadgeCategory, string> = {
  prayer: 'Prayer Library',
  devotional: 'Devotional Library',
  live_channel: 'Live Channels',
  community: 'Community',
  mentorship: 'Mentorship',
  referral: 'Referrals',
  scripture: 'Scripture',
  streak: 'Streaks',
  ai_companion: 'AI Companion',
  counselling: 'Counselling',
  special: 'Special'
};

export const RewardsAndAchievements: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [userBadges, setUserBadges] = useState<Badge[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [userRank, setUserRank] = useState({ rank: 0, totalUsers: 0 });
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<BadgeCategory | 'all'>('all');

  useEffect(() => {
    if (user) {
      loadAchievementsData();
    }
  }, [user]);

  const loadAchievementsData = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      // Initialize user progress if needed
      await achievementTracker.initializeUserProgress(user.id);
      
      // Load user badges
      const badges = await achievementTracker.getUserBadges(user.id);
      setUserBadges(badges);
      
      // Load total points
      const points = await achievementTracker.getUserTotalPoints(user.id);
      setTotalPoints(points);
      
      // Load user rank
      const rank = await achievementTracker.getUserRank(user.id);
      setUserRank(rank);
      
      // Load leaderboard
      const leaders = await achievementTracker.getLeaderboard(10);
      setLeaderboard(leaders);
      
    } catch (error) {
      console.error('Error loading achievements:', error);
    } finally {
      setLoading(false);
    }
  };

  const earnedBadges = userBadges.filter(b => b.earned);
  const totalBadges = badges.length;
  const completionPercentage = (earnedBadges.length / totalBadges) * 100;

  const filteredBadges = selectedCategory === 'all' 
    ? userBadges 
    : userBadges.filter(b => b.category === selectedCategory);

  const categoryStats = React.useMemo(() => {
    const stats: Record<BadgeCategory, { earned: number; total: number }> = {} as any;
    
    Object.keys(categoryLabels).forEach(category => {
      const cat = category as BadgeCategory;
      const categoryBadges = userBadges.filter(b => b.category === cat);
      stats[cat] = {
        earned: categoryBadges.filter(b => b.earned).length,
        total: categoryBadges.length
      };
    });
    
    return stats;
  }, [userBadges]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header with stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-purple-500 to-purple-700 text-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              Total Points
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalPoints.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500 to-amber-700 text-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Award className="w-4 h-4" />
              Badges Earned
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {earnedBadges.length}/{totalBadges}
            </div>
            <Progress value={completionPercentage} className="mt-2 h-2" />
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500 to-blue-700 text-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Global Rank
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              #{userRank.rank}
            </div>
            <p className="text-xs text-white/80 mt-1">
              out of {userRank.totalUsers} users
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500 to-green-700 text-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="w-4 h-4" />
              Completion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {completionPercentage.toFixed(0)}%
            </div>
            <p className="text-xs text-white/80 mt-1">
              of all achievements
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main content */}
      <Tabs defaultValue="badges" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="badges">My Badges</TabsTrigger>
          <TabsTrigger value="categories">By Category</TabsTrigger>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
        </TabsList>

        {/* Badges Tab */}
        <TabsContent value="badges" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Badge Collection</CardTitle>
              <CardDescription>
                Track your progress and unlock achievements across all features
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Filter badges */}
              <div className="flex gap-2 mb-6 flex-wrap">
                <Button
                  variant={selectedCategory === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory('all')}
                >
                  All Badges
                </Button>
                {Object.entries(categoryLabels).map(([key, label]) => {
                  const Icon = categoryIcons[key as BadgeCategory];
                  return (
                    <Button
                      key={key}
                      variant={selectedCategory === key ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedCategory(key as BadgeCategory)}
                      className="gap-2"
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </Button>
                  );
                })}
              </div>

              {/* Badge grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredBadges.map(badge => (
                  <BadgeCard key={badge.id} badge={badge} />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(categoryLabels).map(([key, label]) => {
              const cat = key as BadgeCategory;
              const Icon = categoryIcons[cat];
              const stats = categoryStats[cat];
              const percentage = stats.total > 0 ? (stats.earned / stats.total) * 100 : 0;
              
              return (
                <Card key={key} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <Icon className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{label}</CardTitle>
                        <CardDescription className="text-sm">
                          {stats.earned}/{stats.total} badges earned
                        </CardDescription>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </CardHeader>
                  <CardContent>
                    <Progress value={percentage} className="h-2" />
                    <p className="text-xs text-gray-500 mt-2">
                      {percentage.toFixed(0)}% complete
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Leaderboard Tab */}
        <TabsContent value="leaderboard" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-yellow-500" />
                Global Leaderboard
              </CardTitle>
              <CardDescription>
                Top achievers in the Rekindle community
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {leaderboard.map((leader, index) => (
                  <div
                    key={leader.userId}
                    className={`
                      flex items-center justify-between p-4 rounded-lg transition-colors
                      ${leader.userId === user?.id ? 'bg-purple-50 border-2 border-purple-200' : 'bg-gray-50 hover:bg-gray-100'}
                    `}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`
                        flex items-center justify-center w-10 h-10 rounded-full font-bold
                        ${index === 0 ? 'bg-yellow-400 text-yellow-900' : ''}
                        ${index === 1 ? 'bg-gray-300 text-gray-700' : ''}
                        ${index === 2 ? 'bg-amber-600 text-white' : ''}
                        ${index > 2 ? 'bg-gray-200 text-gray-600' : ''}
                      `}>
                        {index === 0 && <Crown className="w-5 h-5" />}
                        {index > 0 && `#${index + 1}`}
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {leader.avatarUrl && (
                          <img
                            src={leader.avatarUrl}
                            alt={leader.fullName}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        )}
                        <div>
                          <p className="font-semibold">
                            {leader.fullName || 'Anonymous User'}
                            {leader.userId === user?.id && (
                              <span className="ml-2 text-xs text-purple-600">(You)</span>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Medal className="w-5 h-5 text-purple-600" />
                      <span className="font-bold text-lg">
                        {leader.points.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              
              {userRank.rank > 10 && (
                <div className="mt-6 pt-4 border-t">
                  <p className="text-sm text-gray-600 mb-2">Your Position:</p>
                  <div className="flex items-center justify-between p-4 bg-purple-50 border-2 border-purple-200 rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200 text-gray-600 font-bold">
                        #{userRank.rank}
                      </div>
                      <p className="font-semibold">You</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Medal className="w-5 h-5 text-purple-600" />
                      <span className="font-bold text-lg">{totalPoints.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Recent achievements */}
      {earnedBadges.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              Recently Earned
            </CardTitle>
            <CardDescription>
              Your latest achievements
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {earnedBadges
                .sort((a, b) => {
                  const dateA = new Date(a.unlockDate || 0).getTime();
                  const dateB = new Date(b.unlockDate || 0).getTime();
                  return dateB - dateA;
                })
                .slice(0, 6)
                .map(badge => (
                  <BadgeCard key={badge.id} badge={badge} />
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};