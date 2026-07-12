import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from './ui/use-toast';
import {
  Calendar, CheckCircle, Clock, Award, TrendingUp, 
  Target, Flame, ChevronRight, BookOpen, Star
} from 'lucide-react';

interface SeriesProgress {
  id: string;
  series_id: string;
  series_title: string;
  series_cover: string;
  category_name: string;
  current_day: number;
  total_days: number;
  completed_days: number[];
  last_read_at: string;
  is_completed: boolean;
  completed_at?: string;
  progress_percentage: number;
  days_in_streak: number;
}

interface ProgressStats {
  total_series_started: number;
  total_series_completed: number;
  total_days_completed: number;
  current_streak: number;
  longest_streak: number;
  total_reading_time: number;
}

export const DevotionalProgressTracker: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [progressList, setProgressList] = useState<SeriesProgress[]>([]);
  const [stats, setStats] = useState<ProgressStats>({
    total_series_started: 0,
    total_series_completed: 0,
    total_days_completed: 0,
    current_streak: 0,
    longest_streak: 0,
    total_reading_time: 0
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'in-progress' | 'completed'>('all');

  useEffect(() => {
    if (user) {
      loadProgress();
    }
  }, [user, filter]);

  const loadProgress = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      // Load user progress with series details
      const { data: progressData, error: progressError } = await supabase
        .from('devotional_user_progress')
        .select(`
          *,
          devotional_series (
            id,
            title,
            cover_image_url,
            total_days,
            devotional_categories (
              name
            )
          )
        `)
        .eq('user_id', user.id)
        .order('last_read_at', { ascending: false });

      if (progressError) throw progressError;

      // Transform data
      const transformedProgress: SeriesProgress[] = (progressData || []).map((p: any) => {
        const completedDays = p.completed_days || [];
        const progressPercentage = (completedDays.length / p.devotional_series.total_days) * 100;
        
        return {
          id: p.id,
          series_id: p.series_id,
          series_title: p.devotional_series.title,
          series_cover: p.devotional_series.cover_image_url || '',
          category_name: p.devotional_series.devotional_categories?.name || 'Uncategorized',
          current_day: p.current_day,
          total_days: p.devotional_series.total_days,
          completed_days: completedDays,
          last_read_at: p.last_read_at,
          is_completed: p.is_completed,
          completed_at: p.completed_at,
          progress_percentage: Math.round(progressPercentage),
          days_in_streak: calculateStreak(completedDays)
        };
      });

      // Apply filter
      let filteredProgress = transformedProgress;
      if (filter === 'in-progress') {
        filteredProgress = transformedProgress.filter(p => !p.is_completed);
      } else if (filter === 'completed') {
        filteredProgress = transformedProgress.filter(p => p.is_completed);
      }

      setProgressList(filteredProgress);

      // Calculate stats
      const totalDaysCompleted = transformedProgress.reduce((sum, p) => sum + p.completed_days.length, 0);
      const completedSeries = transformedProgress.filter(p => p.is_completed).length;
      const currentStreak = calculateOverallStreak(transformedProgress);

      setStats({
        total_series_started: transformedProgress.length,
        total_series_completed: completedSeries,
        total_days_completed: totalDaysCompleted,
        current_streak: currentStreak,
        longest_streak: currentStreak, // Simplified
        total_reading_time: totalDaysCompleted * 5 // Avg 5 min per day
      });

    } catch (err: any) {
      console.error('Error loading progress:', err);
      toast({ title: t('devotionalProgressTracker', 'error', 'Error'), description: t('devotionalProgressTracker', 'failedToLoadProgress', 'Failed to load progress'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const calculateStreak = (completedDays: number[]): number => {
    if (completedDays.length === 0) return 0;
    
    const sorted = [...completedDays].sort((a, b) => b - a);
    let streak = 1;
    
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i] - sorted[i + 1] === 1) {
        streak++;
      } else {
        break;
      }
    }
    
    return streak;
  };

  const calculateOverallStreak = (progressList: SeriesProgress[]): number => {
    // Simplified: look at last read dates
    const today = new Date();
    let streak = 0;
    
    for (const progress of progressList) {
      if (!progress.last_read_at) continue;
      
      const lastRead = new Date(progress.last_read_at);
      const daysDiff = Math.floor((today.getTime() - lastRead.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDiff <= 1) {
        streak = Math.max(streak, progress.days_in_streak);
      }
    }
    
    return streak;
  };

  const getStreakIcon = (streak: number) => {
    if (streak >= 30) return '🔥🔥🔥';
    if (streak >= 14) return '🔥🔥';
    if (streak >= 7) return '🔥';
    return '⭐';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('devotionalProgressTracker', 'loadingYourProgress', 'Loading your progress...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <BookOpen className="h-8 w-8 mx-auto mb-2 text-purple-600" />
            <p className="text-2xl font-bold">{stats.total_series_started}</p>
            <p className="text-xs text-gray-500">{t('devotionalProgressTracker', 'seriesStarted', 'Series Started')}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-600" />
            <p className="text-2xl font-bold">{stats.total_series_completed}</p>
            <p className="text-xs text-gray-500">{t('devotionalProgressTracker', 'completed', 'Completed')}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <Flame className="h-8 w-8 mx-auto mb-2 text-orange-600" />
            <p className="text-2xl font-bold">{stats.current_streak}</p>
            <p className="text-xs text-gray-500">{t('devotionalProgressTracker', 'dayStreak', 'Day Streak')}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-8 w-8 mx-auto mb-2 text-blue-600" />
            <p className="text-2xl font-bold">{stats.total_reading_time}</p>
            <p className="text-xs text-gray-500">{t('devotionalProgressTracker', 'minutesRead', 'Minutes Read')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Achievements */}
      {stats.current_streak >= 7 && (
        <Card className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
          <CardContent className="p-4 flex items-center gap-4">
            <Award className="h-12 w-12 text-amber-600" />
            <div className="flex-1">
              <h3 className="font-semibold text-amber-900">
                {stats.current_streak >= 30 ? t('devotionalProgressTracker', 'fireWarrior', 'Fire Warrior! 🔥🔥🔥') :
                 stats.current_streak >= 14 ? t('devotionalProgressTracker', 'streakMaster', 'Streak Master! 🔥🔥') :
                 t('devotionalProgressTracker', 'weekWarrior', 'Week Warrior! 🔥')}
              </h3>
              <p className="text-sm text-amber-700">
                {t('devotionalProgressTracker', 'maintainedStreak', "You've maintained a {days}-day devotional streak!").replace('{days}', String(stats.current_streak))}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            filter === 'all' 
              ? 'border-purple-600 text-purple-600' 
              : 'border-transparent text-gray-600 hover:text-purple-600'
          }`}
        >
          {t('devotionalProgressTracker', 'all', 'All')} ({stats.total_series_started})
        </button>
        <button
          onClick={() => setFilter('in-progress')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            filter === 'in-progress' 
              ? 'border-purple-600 text-purple-600' 
              : 'border-transparent text-gray-600 hover:text-purple-600'
          }`}
        >
          {t('devotionalProgressTracker', 'inProgress', 'In Progress')} ({stats.total_series_started - stats.total_series_completed})
        </button>
        <button
          onClick={() => setFilter('completed')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            filter === 'completed' 
              ? 'border-purple-600 text-purple-600' 
              : 'border-transparent text-gray-600 hover:text-purple-600'
          }`}
        >
          {t('devotionalProgressTracker', 'completed', 'Completed')} ({stats.total_series_completed})
        </button>
      </div>

      {/* Progress List */}
      {progressList.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 mb-2">{t('devotionalProgressTracker', 'noDevotionalsInProgress', 'No devotionals in progress')}</p>
            <p className="text-sm text-gray-500">{t('devotionalProgressTracker', 'startNewSeriesToTrack', 'Start a new series to track your progress!')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {progressList.map(progress => (
            <Card key={progress.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-4">
                <div className="flex gap-4">
                  {progress.series_cover && (
                    <img
                      src={progress.series_cover}
                      alt={progress.series_title}
                      className="w-24 h-24 object-cover rounded-lg"
                    />
                  )}
                  
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-lg">{progress.series_title}</h3>
                        <Badge variant="outline" className="text-xs mt-1">
                          {progress.category_name}
                        </Badge>
                      </div>
                      
                      <div className="text-right">
                        {progress.is_completed ? (
                          <Badge className="bg-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {t('devotionalProgressTracker', 'completed', 'Completed')}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            {t('devotionalProgressTracker', 'dayXOfY', 'Day {current} of {total}').replace('{current}', String(progress.current_day)).replace('{total}', String(progress.total_days))}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">{t('devotionalProgressTracker', 'progress', 'Progress')}</span>
                        <span className="font-medium">{progress.progress_percentage}%</span>
                      </div>
                      <Progress value={progress.progress_percentage} className="h-2" />
                      
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {t('devotionalProgressTracker', 'xOfYDays', '{completed} of {total} days').replace('{completed}', String(progress.completed_days.length)).replace('{total}', String(progress.total_days))}
                        </span>
                        {progress.days_in_streak > 1 && (
                          <span className="flex items-center gap-1">
                            <Flame className="h-3 w-3 text-orange-500" />
                            {t('devotionalProgressTracker', 'xDayStreak', '{days} day streak').replace('{days}', String(progress.days_in_streak))}
                          </span>
                        )}
                      </div>

                      {progress.last_read_at && (
                        <p className="text-xs text-gray-400">
                          {t('devotionalProgressTracker', 'lastRead', 'Last read: {date}').replace('{date}', new Date(progress.last_read_at).toLocaleDateString())}
                        </p>
                      )}

                      {progress.is_completed && progress.completed_at && (
                        <div className="flex items-center gap-2 mt-2 p-2 bg-green-50 rounded-lg">
                          <Star className="h-4 w-4 text-green-600" />
                          <span className="text-sm text-green-700">
                            {t('devotionalProgressTracker', 'completedOn', 'Completed on {date}').replace('{date}', new Date(progress.completed_at).toLocaleDateString())}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Motivational Footer */}
      {progressList.length > 0 && !progressList.every(p => p.is_completed) && (
        <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
          <CardContent className="p-4 flex items-center gap-4">
            <Target className="h-10 w-10 text-purple-600" />
            <div>
              <h3 className="font-semibold text-purple-900">{t('devotionalProgressTracker', 'keepGrowing', 'Keep Growing!')}</h3>
              <p className="text-sm text-purple-700">
                {stats.total_days_completed >= 100
                  ? t('devotionalProgressTracker', 'championMessage', "You're a devotional champion! 100+ days completed!")
                  : stats.total_days_completed >= 30
                  ? t('devotionalProgressTracker', 'amazingProgressMessage', 'Amazing progress! Keep up the daily habit!')
                  : t('devotionalProgressTracker', 'everyDayMessage', 'Every day brings you closer to spiritual maturity!')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};