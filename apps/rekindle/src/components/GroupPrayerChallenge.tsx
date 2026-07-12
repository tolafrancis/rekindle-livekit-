import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/lib/supabase';
import { Trophy, Users, Calendar, Flame, CheckCircle } from 'lucide-react';

interface Challenge {
  id: string;
  title: string;
  description: string;
  scripture_reference: string;
  start_date: string;
  end_date: string;
  goal_type: string;
  goal_count: number;
  category: string;
}

interface Participant {
  challenge_id: string;
  current_streak: number;
  total_prayers: number;
}

export function GroupPrayerChallenge() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [myParticipation, setMyParticipation] = useState<Record<string, Participant>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChallenges();
  }, []);

  const fetchChallenges = async () => {
    const { data: challengeData } = await supabase.from('prayer_challenges').select('*').eq('is_active', true);
    if (challengeData) setChallenges(challengeData);
    
    const { data: partData } = await supabase.from('challenge_participants').select('*').eq('user_id', 'current-user');
    if (partData) {
      const map: Record<string, Participant> = {};
      partData.forEach(p => map[p.challenge_id] = p);
      setMyParticipation(map);
    }
    setLoading(false);
  };

  const joinChallenge = async (challengeId: string) => {
    await supabase.from('challenge_participants').insert({
      challenge_id: challengeId,
      user_id: 'current-user',
      user_name: 'You'
    });
    fetchChallenges();
  };

  const logPrayer = async (challengeId: string) => {
    const part = myParticipation[challengeId];
    if (!part) return;
    await supabase.from('challenge_participants').update({
      total_prayers: part.total_prayers + 1,
      current_streak: part.current_streak + 1,
      last_prayer_date: new Date().toISOString().split('T')[0]
    }).eq('challenge_id', challengeId).eq('user_id', 'current-user');
    fetchChallenges();
  };


  const getDaysLeft = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  };

  const categoryColors: Record<string, string> = {
    commitment: 'from-purple-500 to-indigo-600',
    missions: 'from-blue-500 to-cyan-600',
    family: 'from-pink-500 to-rose-600',
    healing: 'from-green-500 to-emerald-600',
    gratitude: 'from-amber-500 to-orange-600'
  };

  if (loading) return <div className="text-center py-8">Loading challenges...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-500" />Prayer Challenges</h2>
      </div>
      <div className="grid gap-4">
        {challenges.map(challenge => {
          const participation = myParticipation[challenge.id];
          const progress = participation ? (participation.total_prayers / challenge.goal_count) * 100 : 0;
          const daysLeft = getDaysLeft(challenge.end_date);
          
          return (
            <Card key={challenge.id} className="overflow-hidden">
              <div className={`h-2 bg-gradient-to-r ${categoryColors[challenge.category] || 'from-gray-500 to-gray-600'}`} />
              <div className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-lg">{challenge.title}</h3>
                  <span className="text-xs bg-gray-100 px-2 py-1 rounded">{daysLeft} days left</span>
                </div>
                <p className="text-sm text-gray-600 mb-2">{challenge.description}</p>
                <p className="text-xs text-purple-600 italic mb-3">{challenge.scripture_reference}</p>
                
                {participation ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1"><Flame className="h-4 w-4 text-orange-500" />{participation.current_streak} streak</span>
                      <span className="flex items-center gap-1"><CheckCircle className="h-4 w-4 text-green-500" />{participation.total_prayers}/{challenge.goal_count}</span>
                    </div>
                    <Progress value={Math.min(progress, 100)} className="h-2" />
                    <Button onClick={() => logPrayer(challenge.id)} className="w-full">Log Today's Prayer</Button>
                  </div>
                ) : (
                  <Button onClick={() => joinChallenge(challenge.id)} variant="outline" className="w-full">
                    <Users className="h-4 w-4 mr-2" />Join Challenge
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
