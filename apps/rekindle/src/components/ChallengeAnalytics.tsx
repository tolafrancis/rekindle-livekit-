import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { supabase } from '@/lib/supabase';
import { PrayerChallenge } from '@rekindle/types/prayerTypes';
import { Users, CheckCircle, Flame, Trophy, TrendingUp } from 'lucide-react';

interface Props {
  challenge: PrayerChallenge;
}

interface Analytics {
  totalJoined: number;
  totalCompleted: number;
  avgStreak: number;
  completionRate: number;
  topParticipants: Array<{
    user_name: string;
    completed_sessions: number;
    current_streak: number;
  }>;
}

export const ChallengeAnalytics: React.FC<Props> = ({ challenge }) => {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, [challenge.id]);

  const fetchAnalytics = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('challenge-api', {
        body: { action: 'get_analytics', data: { challengeId: challenge.id } }
      });
      
      if (error) throw error;
      
      const completionRate = data.totalJoined > 0 
        ? Math.round((data.totalCompleted / (data.totalJoined * 21)) * 100) 
        : 0;
      
      setAnalytics({ ...data, completionRate });
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center py-4">Loading analytics...</div>;
  if (!analytics) return null;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">Challenge Analytics</h3>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 text-center">
          <Users className="h-6 w-6 mx-auto text-blue-500 mb-2" />
          <p className="text-2xl font-bold">{analytics.totalJoined}</p>
          <p className="text-xs text-gray-500">Participants</p>
        </Card>
        
        <Card className="p-4 text-center">
          <CheckCircle className="h-6 w-6 mx-auto text-green-500 mb-2" />
          <p className="text-2xl font-bold">{analytics.totalCompleted}</p>
          <p className="text-xs text-gray-500">Sessions Done</p>
        </Card>
        
        <Card className="p-4 text-center">
          <Flame className="h-6 w-6 mx-auto text-orange-500 mb-2" />
          <p className="text-2xl font-bold">{analytics.avgStreak.toFixed(1)}</p>
          <p className="text-xs text-gray-500">Avg Streak</p>
        </Card>
        
        <Card className="p-4 text-center">
          <TrendingUp className="h-6 w-6 mx-auto text-purple-500 mb-2" />
          <p className="text-2xl font-bold">{analytics.completionRate}%</p>
          <p className="text-xs text-gray-500">Completion</p>
        </Card>
      </div>

      {analytics.topParticipants.length > 0 && (
        <Card className="p-4">
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Top Participants
          </h4>
          <div className="space-y-2">
            {analytics.topParticipants.map((p, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? 'bg-amber-100 text-amber-700' : 
                    i === 1 ? 'bg-gray-100 text-gray-700' : 
                    i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-600'
                  }`}>
                    {i + 1}
                  </span>
                  <span className="font-medium">{p.user_name}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="h-3 w-3" />{p.completed_sessions}
                  </span>
                  <span className="flex items-center gap-1 text-orange-600">
                    <Flame className="h-3 w-3" />{p.current_streak}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
