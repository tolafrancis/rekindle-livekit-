import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rekindle/ui/tabs';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { toast } from '@rekindle/ui/use-toast';
import { 
  Heart, TrendingUp, Award, BookOpen, Flame, 
  Users, Filter, RefreshCw, Loader2, MessageCircle,
  Clock, Star, CheckCircle, Trophy, Target, Sparkles
} from 'lucide-react';
import { SearchFilterPanel, activeFilterChipClass, filterChipClass } from './SearchFilterPanel';

interface Activity {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar?: string;
  activity_type: 'prayer' | 'challenge_completed' | 'milestone' | 'devotional_completed' | 'streak';
  title: string;
  description?: string;
  content?: string;
  metadata?: any;
  reaction_count: number;
  created_at: string;
  user_reaction?: string;
}

interface TrendingTopic {
  topic: string;
  count: number;
}

const REACTION_EMOJIS = {
  amen: '🙏',
  pray: '🤲',
  heart: '❤️',
  fire: '🔥',
  raised_hands: '🙌'
};

export const CommunityActivityFeed: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [reacting, setReacting] = useState<string | null>(null);
  
  const loadingRef = useRef(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    loadActivities();
    loadTrendingTopics();

    // Set up realtime subscription
    const subscription = supabase
      .channel('community_activities_channel')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'community_activities' },
        () => {
          if (isMounted.current) {
            loadActivities();
          }
        }
      )
      .subscribe();

    return () => {
      isMounted.current = false;
      subscription.unsubscribe();
    };
  }, [filter]);

  const loadActivities = async () => {
    if (loadingRef.current) return;
    
    loadingRef.current = true;
    setLoading(true);

    try {
      let query = supabase
        .from('community_activities')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (filter !== 'all') {
        query = query.eq('activity_type', filter);
      }

      const { data: activitiesData, error: activitiesError } = await query;
      if (activitiesError) throw activitiesError;

      // Load user's reactions
      if (user && activitiesData) {
        const activityIds = activitiesData.map(a => a.id);
        const { data: reactionsData } = await supabase
          .from('activity_reactions')
          .select('activity_id, reaction_type')
          .eq('user_id', user.id)
          .in('activity_id', activityIds);

        const reactionsMap = new Map(
          reactionsData?.map(r => [r.activity_id, r.reaction_type]) || []
        );

        const activitiesWithReactions = activitiesData.map(activity => ({
          ...activity,
          user_reaction: reactionsMap.get(activity.id)
        }));

        if (isMounted.current) {
          setActivities(activitiesWithReactions);
        }
      } else if (isMounted.current) {
        setActivities(activitiesData || []);
      }
    } catch (err: any) {
      console.error('Error loading activities:', err);
      if (isMounted.current) {
        toast({
          title: t('communityActivityFeed', 'error', 'Error'),
          description: t('communityActivityFeed', 'failedLoadActivities', 'Failed to load community activities'),
          variant: 'destructive'
        });
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
      loadingRef.current = false;
    }
  };

  const loadTrendingTopics = async () => {
    try {
      // Get prayer activities from last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data, error } = await supabase
        .from('community_activities')
        .select('title, content, metadata')
        .eq('activity_type', 'prayer')
        .gte('created_at', sevenDaysAgo.toISOString());

      if (error) throw error;

      // Extract topics/keywords from titles and content
      const topicCounts: Record<string, number> = {};
      
      data?.forEach(activity => {
        const text = `${activity.title} ${activity.content || ''}`.toLowerCase();
        const words = text.split(/\s+/).filter(w => w.length > 3);
        
        words.forEach(word => {
          // Filter out common words
          const commonWords = ['that', 'this', 'with', 'from', 'have', 'been', 'will', 'your', 'their', 'about'];
          if (!commonWords.includes(word)) {
            topicCounts[word] = (topicCounts[word] || 0) + 1;
          }
        });
      });

      // Sort by count and get top 5
      const trending = Object.entries(topicCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([topic, count]) => ({ topic, count }));

      if (isMounted.current) {
        setTrendingTopics(trending);
      }
    } catch (err) {
      console.error('Error loading trending topics:', err);
    }
  };

  const handleReaction = async (activityId: string, reactionType: string) => {
    if (!user) {
      toast({ title: t('communityActivityFeed', 'error', 'Error'), description: t('communityActivityFeed', 'signInToReact', 'Please sign in to react'), variant: 'destructive' });
      return;
    }

    setReacting(activityId);

    try {
      const activity = activities.find(a => a.id === activityId);
      
      // If user already reacted with same type, remove it
      if (activity?.user_reaction === reactionType) {
        const { error } = await supabase
          .from('activity_reactions')
          .delete()
          .eq('activity_id', activityId)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        // Remove existing reaction if any
        await supabase
          .from('activity_reactions')
          .delete()
          .eq('activity_id', activityId)
          .eq('user_id', user.id);

        // Add new reaction
        const { error } = await supabase
          .from('activity_reactions')
          .insert({
            activity_id: activityId,
            user_id: user.id,
            reaction_type: reactionType
          });

        if (error) throw error;
      }

      // Reload activities to get updated counts
      loadActivities();
    } catch (err: any) {
      console.error('Error handling reaction:', err);
      toast({ title: t('communityActivityFeed', 'error', 'Error'), description: t('communityActivityFeed', 'failedAddReaction', 'Failed to add reaction'), variant: 'destructive' });
    } finally {
      setReacting(null);
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'prayer': return <MessageCircle className="h-5 w-5 text-purple-500" />;
      case 'challenge_completed': return <Trophy className="h-5 w-5 text-amber-500" />;
      case 'milestone': return <Award className="h-5 w-5 text-blue-500" />;
      case 'devotional_completed': return <BookOpen className="h-5 w-5 text-green-500" />;
      case 'streak': return <Flame className="h-5 w-5 text-orange-500" />;
      default: return <Star className="h-5 w-5 text-gray-500" />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'prayer': return 'border-l-purple-500';
      case 'challenge_completed': return 'border-l-amber-500';
      case 'milestone': return 'border-l-blue-500';
      case 'devotional_completed': return 'border-l-green-500';
      case 'streak': return 'border-l-orange-500';
      default: return 'border-l-gray-500';
    }
  };

  const getActivityCardTone = (type: string) => {
    switch (type) {
      case 'prayer': return 'bg-gradient-to-r from-purple-50 to-white';
      case 'challenge_completed': return 'bg-gradient-to-r from-amber-50 to-white';
      case 'milestone': return 'bg-gradient-to-r from-blue-50 to-white';
      case 'devotional_completed': return 'bg-gradient-to-r from-emerald-50 to-white';
      case 'streak': return 'bg-gradient-to-r from-orange-50 to-white';
      default: return 'bg-white';
    }
  };

  const getRelativeTime = (timestamp: string) => {
    const now = new Date();
    const then = new Date(timestamp);
    const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

    if (seconds < 60) return t('communityActivityFeed', 'justNow', 'just now');
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return then.toLocaleDateString();
  };

  const filterOptions = [
    { value: 'all', label: t('communityActivityFeed', 'allActivity', 'All Activity'), icon: Users },
    { value: 'prayer', label: t('communityActivityFeed', 'prayers', 'Prayers'), icon: MessageCircle },
    { value: 'challenge_completed', label: t('communityActivityFeed', 'challenges', 'Challenges'), icon: Trophy },
    { value: 'milestone', label: t('communityActivityFeed', 'milestones', 'Milestones'), icon: Award },
    { value: 'devotional_completed', label: t('communityActivityFeed', 'devotionals', 'Devotionals'), icon: BookOpen },
    { value: 'streak', label: t('communityActivityFeed', 'streaks', 'Streaks'), icon: Flame }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-end">
        <Button variant="outline" onClick={loadActivities} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {t('communityActivityFeed', 'refresh', 'Refresh')}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="overflow-hidden border-0 bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-md">
          <CardContent className="p-4 text-center">
            <Users className="h-8 w-8 mx-auto mb-2 text-white/80" />
            <p className="text-2xl font-bold">{activities.length}</p>
            <p className="text-xs text-white/80">{t('communityActivityFeed', 'recentActivities', 'Recent Activities')}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-0 bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-md">
          <CardContent className="p-4 text-center">
            <Heart className="h-8 w-8 mx-auto mb-2 text-white/80" />
            <p className="text-2xl font-bold">
              {activities.reduce((sum, a) => sum + a.reaction_count, 0)}
            </p>
            <p className="text-xs text-white/80">{t('communityActivityFeed', 'totalReactions', 'Total Reactions')}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-0 bg-gradient-to-br from-blue-500 to-cyan-600 text-white shadow-md">
          <CardContent className="p-4 text-center">
            <MessageCircle className="h-8 w-8 mx-auto mb-2 text-white/80" />
            <p className="text-2xl font-bold">
              {activities.filter(a => a.activity_type === 'prayer').length}
            </p>
            <p className="text-xs text-white/80">{t('communityActivityFeed', 'prayerRequests', 'Prayer Requests')}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-0 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md">
          <CardContent className="p-4 text-center">
            <Trophy className="h-8 w-8 mx-auto mb-2 text-white/80" />
            <p className="text-2xl font-bold">
              {activities.filter(a => a.activity_type === 'challenge_completed').length}
            </p>
            <p className="text-xs text-white/80">{t('communityActivityFeed', 'challengesDone', 'Challenges Done')}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Feed */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filters */}
          <SearchFilterPanel icon={<Filter className="h-6 w-6 text-white/60" />}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-sm font-medium text-purple-100">{t('communityActivityFeed', 'filter', 'Filter:')}</span>
              {filterOptions.map(option => {
                const Icon = option.icon;
                const active = filter === option.value;
                return (
                  <Button
                    key={option.value}
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilter(option.value)}
                    className={active ? activeFilterChipClass : filterChipClass}
                  >
                    <Icon className="h-3 w-3 mr-1" />
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </SearchFilterPanel>

          {/* Activity Feed */}
          {loading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-purple-500" />
                <p className="text-gray-500 mt-2">{t('communityActivityFeed', 'loadingActivities', 'Loading activities...')}</p>
              </CardContent>
            </Card>
          ) : activities.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">{t('communityActivityFeed', 'noActivitiesYet', 'No Activities Yet')}</h3>
                <p className="text-gray-500">{t('communityActivityFeed', 'beFirstShare', 'Be the first to share your spiritual journey!')}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {activities.map(activity => (
                <Card 
                  key={activity.id} 
                  className={`border-l-4 ${getActivityColor(activity.activity_type)} ${getActivityCardTone(activity.activity_type)} hover:shadow-md transition-shadow`}
                >
                  <CardContent className="p-4">
                    {/* Header */}
                    <div className="flex items-start gap-3 mb-3">
                      {activity.user_avatar ? (
                        <img 
                          src={activity.user_avatar} 
                          alt={activity.user_name}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                          <span className="text-purple-700 font-semibold">
                            {activity.user_name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {getActivityIcon(activity.activity_type)}
                          <span className="font-semibold text-gray-900">{activity.user_name}</span>
                          <Badge variant="outline" className="text-xs capitalize">
                            {activity.activity_type.replace('_', ' ')}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Clock className="h-3 w-3" />
                          {getRelativeTime(activity.created_at)}
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="ml-13">
                      <h4 className="font-semibold text-gray-900 mb-2">{activity.title}</h4>
                      {activity.description && (
                        <p className="text-gray-700 mb-2">{activity.description}</p>
                      )}
                      {activity.content && (
                        <p className="text-gray-600 text-sm italic border-l-2 border-purple-200 pl-3 py-1">
                          "{activity.content}"
                        </p>
                      )}
                    </div>

                    {/* Reactions */}
                    <div className="mt-4 flex items-center gap-2 flex-wrap">
                      {Object.entries(REACTION_EMOJIS).map(([type, emoji]) => (
                        <Button
                          key={type}
                          variant={activity.user_reaction === type ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => handleReaction(activity.id, type)}
                          disabled={reacting === activity.id}
                          className="text-sm"
                        >
                          {emoji}
                        </Button>
                      ))}
                      {activity.reaction_count > 0 && (
                        <span className="text-sm text-gray-500 ml-2">
                          {activity.reaction_count} {activity.reaction_count === 1 ? t('communityActivityFeed', 'reaction', 'reaction') : t('communityActivityFeed', 'reactions', 'reactions')}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Trending Topics */}
          <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5 text-purple-500" />
                {t('communityActivityFeed', 'trendingPrayerTopics', 'Trending Prayer Topics')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trendingTopics.length === 0 ? (
                <p className="text-sm text-gray-500">{t('communityActivityFeed', 'noTrendingTopics', 'No trending topics yet')}</p>
              ) : (
                <div className="space-y-2">
                  {trendingTopics.map((topic, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-white/70 hover:bg-white">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-purple-600">#{idx + 1}</span>
                        <span className="text-sm font-medium capitalize">{topic.topic}</span>
                      </div>
                      <Badge variant="secondary">{topic.count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-amber-500" />
                {t('communityActivityFeed', 'todaysHighlights', "Today's Highlights")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{t('communityActivityFeed', 'prayersShared', 'Prayers Shared')}</span>
                <span className="font-bold text-purple-600">
                  {activities.filter(a => {
                    const today = new Date().toDateString();
                    return a.activity_type === 'prayer' && new Date(a.created_at).toDateString() === today;
                  }).length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{t('communityActivityFeed', 'challengesCompleted', 'Challenges Completed')}</span>
                <span className="font-bold text-amber-600">
                  {activities.filter(a => {
                    const today = new Date().toDateString();
                    return a.activity_type === 'challenge_completed' && new Date(a.created_at).toDateString() === today;
                  }).length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{t('communityActivityFeed', 'milestonesReached', 'Milestones Reached')}</span>
                <span className="font-bold text-blue-600">
                  {activities.filter(a => {
                    const today = new Date().toDateString();
                    return a.activity_type === 'milestone' && new Date(a.created_at).toDateString() === today;
                  }).length}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Encouragement */}
          <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
            <CardContent className="p-6 text-center">
              <Heart className="h-8 w-8 mx-auto mb-3 text-purple-600" />
              <h3 className="font-semibold text-purple-900 mb-2">{t('communityActivityFeed', 'encourageOthers', 'Encourage Others')}</h3>
              <p className="text-sm text-purple-700">
                {t('communityActivityFeed', 'encourageOthersDesc', "Your reactions and support make a difference in someone's spiritual journey!")}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
