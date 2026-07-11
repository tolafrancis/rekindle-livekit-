import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { PrayerChallenge, ChallengeParticipant, PrayerPoint } from '@rekindle/types/prayerTypes';
import { ChallengeCard } from './ChallengeCard';
import { CreateChallengeModal } from './CreateChallengeModal';
import { ShareChallengeModal } from './ShareChallengeModal';
import { InteractivePrayerSession } from './InteractivePrayerSession';
import { ChallengeAnalytics } from './ChallengeAnalytics';
import { Trophy, Plus, Filter, BarChart3, List, Music } from 'lucide-react';
import { toast } from './ui/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { instrumentalTracks } from '@/data/instrumentals';
import { SearchFilterPanel, searchFilterSelectTriggerClass } from './SearchFilterPanel';

export const EnhancedPrayerChallenges: React.FC = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [challenges, setChallenges] = useState<PrayerChallenge[]>([]);
  const [participation, setParticipation] = useState<Record<string, ChallengeParticipant>>({});
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});
  const [userSubscriptionPlan, setUserSubscriptionPlan] = useState<string>('free');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [shareChallenge, setShareChallenge] = useState<PrayerChallenge | null>(null);
  const [activeSession, setActiveSession] = useState<PrayerChallenge | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'list' | 'analytics'>('list');
  const [selectedForAnalytics, setSelectedForAnalytics] = useState<PrayerChallenge | null>(null);
  
  // Music selection state
  const [showMusicSelector, setShowMusicSelector] = useState(false);
  const [challengeToStart, setChallengeToStart] = useState<PrayerChallenge | null>(null);
  const [selectedMusicId, setSelectedMusicId] = useState<string>('1');

  useEffect(() => { fetchData(); }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch challenges (no user ID needed for public view)
      const challengeRes = await supabase
        .from('enhanced_prayer_challenges')
        .select('*')
        .eq('is_active', true);
      
      if (challengeRes.data) {
        const parsed = challengeRes.data.map(c => {
          // Convert prayer_points from string[] to PrayerPoint[]
          let prayerPoints: PrayerPoint[];
          const rawPoints = typeof c.prayer_points === 'string' ? JSON.parse(c.prayer_points) : c.prayer_points;
          
          // Check if already in PrayerPoint format or simple strings
          if (Array.isArray(rawPoints) && rawPoints.length > 0) {
            if (typeof rawPoints[0] === 'string') {
              // Convert simple strings to PrayerPoint objects
              prayerPoints = rawPoints.map((point: string, index: number) => ({
                title: `Prayer Point ${index + 1}`,
                content: point,
                scripture: undefined,
                scriptureText: undefined,
                reflection: undefined
              }));
            } else {
              // Already in PrayerPoint format
              prayerPoints = rawPoints;
            }
          } else {
            prayerPoints = [];
          }

          return {
            ...c,
            prayer_points: prayerPoints
          };
        });
        setChallenges(parsed);
        
        // Get participant counts
        const counts: Record<string, number> = {};
        for (const c of parsed) {
          const { count } = await supabase
            .from('challenge_participants')
            .select('*', { count: 'exact', head: true })
            .eq('challenge_id', c.id);
          counts[c.id] = count || 0;
        }
        setParticipantCounts(counts);
      }
      
      // Only fetch user-specific data if user is logged in
      if (user?.id) {
        // Fetch user's subscription plan
        const subscriptionRes = await supabase
          .from('user_subscriptions')
          .select('plan')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (subscriptionRes.data) {
          setUserSubscriptionPlan(subscriptionRes.data.plan);
        }
        
        // Fetch user's participation
        const { data: partData } = await supabase
          .from('challenge_participants')
          .select('*')
          .eq('user_id', user.id);
          
        if (partData) {
          const map: Record<string, ChallengeParticipant> = {};
          partData.forEach(p => map[p.challenge_id] = p);
          setParticipation(map);
        }
      }
    } catch (err) {
      console.error('Error fetching challenges:', err);
    }
    setLoading(false);
  };


  const joinChallenge = async (challenge: PrayerChallenge) => {
    if (!user?.id) {
      toast({ title: t('enhancedPrayerChallenges', 'error', 'Error'), description: t('enhancedPrayerChallenges', 'mustLoginToJoin', 'You must be logged in to join a challenge'), variant: 'destructive' });
      return;
    }

    // Validate challenge ID exists
    if (!challenge.id) {
      toast({ title: t('enhancedPrayerChallenges', 'error', 'Error'), description: t('enhancedPrayerChallenges', 'invalidChallengeMissingId', 'Invalid challenge - missing ID'), variant: 'destructive' });
      return;
    }

    // Check if already joined
    if (participation[String(challenge.id)]) {
      toast({ title: t('enhancedPrayerChallenges', 'alreadyJoined', 'Already Joined'), description: t('enhancedPrayerChallenges', 'alreadyParticipating', 'You are already participating in this challenge') });
      return;
    }

    const { error } = await supabase.from('challenge_participants').insert({
      challenge_id: String(challenge.id), // Ensure it's a string
      user_id: user.id, 
      user_name: profile?.full_name || 'Anonymous'
    });
    
    if (error) { 
      console.error('Join challenge error:', error);
      toast({
        title: t('enhancedPrayerChallenges', 'error', 'Error'),
        description: error.message || t('enhancedPrayerChallenges', 'failedToJoin', 'Failed to join challenge'),
        variant: 'destructive'
      });
      return; 
    }
    
    toast({ title: t('enhancedPrayerChallenges', 'joined', 'Joined!'), description: t('enhancedPrayerChallenges', 'youJoinedX', 'You joined "{title}"').replace('{title}', challenge.title) });
    fetchData();
  };

  const completeSession = async (challenge: PrayerChallenge) => {
    if (!user?.id) {
      toast({ title: t('enhancedPrayerChallenges', 'error', 'Error'), description: t('enhancedPrayerChallenges', 'mustLoginToComplete', 'You must be logged in to complete a session'), variant: 'destructive' });
      return;
    }

    const part = participation[challenge.id];
    if (!part) return;
    
    await supabase.from('challenge_session_logs').insert({
      challenge_id: challenge.id, 
      user_id: user.id,
      slides_completed: challenge.prayer_points.length, 
      total_slides: challenge.prayer_points.length
    });
    
    const today = new Date().toISOString().split('T')[0];
    const isNewDay = part.last_session_date !== today;
    
    await supabase.from('challenge_participants').update({
      completed_sessions: part.completed_sessions + 1,
      current_streak: isNewDay ? part.current_streak + 1 : part.current_streak,
      last_session_date: today
    }).eq('id', part.id);
    
    toast({ title: t('enhancedPrayerChallenges', 'sessionComplete', 'Session Complete!'), description: t('enhancedPrayerChallenges', 'prayerLogged', 'Your prayer has been logged.') });
    setActiveSession(null);
    fetchData();
  };

  const updateReminderSettings = async (challengeId: string, settings: {
    enabled: boolean;
    frequency?: 'hourly' | 'daily' | 'weekly' | 'monthly';
    time?: string;
    days?: number[];
  }) => {
    if (!user?.id) {
      toast({ title: t('enhancedPrayerChallenges', 'error', 'Error'), description: t('enhancedPrayerChallenges', 'mustLoginToSetReminders', 'You must be logged in to set reminders'), variant: 'destructive' });
      return;
    }

    const part = participation[challengeId];
    if (!part) {
      toast({ title: t('enhancedPrayerChallenges', 'error', 'Error'), description: t('enhancedPrayerChallenges', 'mustJoinFirst', 'You must join this challenge first'), variant: 'destructive' });
      return;
    }

    const { error } = await supabase
      .from('challenge_participants')
      .update({
        reminder_enabled: settings.enabled,
        reminder_frequency: settings.frequency,
        reminder_time: settings.time,
        reminder_days: settings.days
      })
      .eq('id', part.id);

    if (error) {
      console.error('Update reminder error:', error);
      toast({
        title: t('enhancedPrayerChallenges', 'error', 'Error'),
        description: t('enhancedPrayerChallenges', 'failedToUpdateReminders', 'Failed to update reminder settings'),
        variant: 'destructive'
      });
      return;
    }

    toast({
      title: settings.enabled ? t('enhancedPrayerChallenges', 'remindersEnabled', 'Reminders Enabled') : t('enhancedPrayerChallenges', 'remindersDisabled', 'Reminders Disabled'),
      description: settings.enabled
        ? t('enhancedPrayerChallenges', 'youWillReceiveXReminders', "You'll receive {frequency} reminders for this challenge").replace('{frequency}', settings.frequency || '')
        : t('enhancedPrayerChallenges', 'prayerRemindersOff', 'Prayer reminders have been turned off')
    });
    
    fetchData();
  };

  // Handle start button - show music selector
  const handleStartChallenge = (challenge: PrayerChallenge) => {
    setChallengeToStart(challenge);
    // Set default music if challenge has one
    setSelectedMusicId(challenge.instrumental_id || '1');
    setShowMusicSelector(true);
  };

  // Start session with selected music
  const startSessionWithMusic = () => {
    if (!challengeToStart) return;
    
    // Create a new challenge object with the selected music
    const challengeWithMusic = {
      ...challengeToStart,
      instrumental_id: selectedMusicId
    };
    
    setActiveSession(challengeWithMusic);
    setShowMusicSelector(false);
    setChallengeToStart(null);
  };

  // Check if user can create challenges (only premium and ministry plans)
  const canCreate = userSubscriptionPlan === 'premium' || userSubscriptionPlan === 'ministry';
  const filtered = categoryFilter === 'all' ? challenges : challenges.filter(c => c.category === categoryFilter);

  if (loading) return <div className="text-center py-8">{t('enhancedPrayerChallenges', 'loadingChallenges', 'Loading challenges...')}</div>;

  return (
    <div className="space-y-6">
      <SearchFilterPanel icon={<Trophy className="h-6 w-6 text-white/60" />}>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className={`w-full sm:w-40 ${searchFilterSelectTriggerClass}`}><Filter className="h-4 w-4 mr-2 text-purple-200" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('enhancedPrayerChallenges', 'all', 'All')}</SelectItem>
              <SelectItem value="Healing">{t('enhancedPrayerChallenges', 'healing', 'Healing')}</SelectItem>
              <SelectItem value="Thanksgiving">{t('enhancedPrayerChallenges', 'thanksgiving', 'Thanksgiving')}</SelectItem>
              <SelectItem value="Revival">{t('enhancedPrayerChallenges', 'revival', 'Revival')}</SelectItem>
            </SelectContent>
          </Select>
          {canCreate && <Button onClick={() => setShowCreate(true)} className="bg-purple-600 hover:bg-purple-700"><Plus className="h-4 w-4 mr-2" />{t('enhancedPrayerChallenges', 'create', 'Create')}</Button>}
        </div>
      </SearchFilterPanel>

      <Tabs defaultValue="challenges">
        <TabsList><TabsTrigger value="challenges"><List className="h-4 w-4 mr-2" />{t('enhancedPrayerChallenges', 'challenges', 'Challenges')}</TabsTrigger><TabsTrigger value="analytics"><BarChart3 className="h-4 w-4 mr-2" />{t('enhancedPrayerChallenges', 'analytics', 'Analytics')}</TabsTrigger></TabsList>
        <TabsContent value="challenges" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(challenge => {
  if (!challenge.id) return null;
  const challengeId = String(challenge.id);
  return (
    <ChallengeCard 
      key={challengeId} 
      challenge={challenge} 
      participation={participation[challengeId]}
      participantCount={participantCounts[challengeId] || 0} 
      onJoin={() => joinChallenge(challenge)}
      onStart={() => handleStartChallenge(challenge)} 
      onShare={() => setShareChallenge(challenge)}
      onUpdateReminder={(settings) => updateReminderSettings(challengeId, settings)}
    />
  );
})}
          </div>
          {filtered.length === 0 && <div className="text-center py-12 bg-white rounded-xl"><Trophy className="h-12 w-12 mx-auto text-gray-300 mb-4" /><p className="text-gray-500">{t('enhancedPrayerChallenges', 'noChallengesFound', 'No challenges found')}</p></div>}
        </TabsContent>
        <TabsContent value="analytics" className="mt-4">
          {selectedForAnalytics ? (
            <div><Button variant="ghost" onClick={() => setSelectedForAnalytics(null)} className="mb-4">{t('enhancedPrayerChallenges', 'back', 'Back')}</Button><ChallengeAnalytics challenge={selectedForAnalytics} /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {challenges.map(c => {
  if (!c.id) return null;
  const challengeId = String(c.id);
  return (
    <Button key={challengeId} variant="outline" className="h-auto p-4 justify-start" onClick={() => setSelectedForAnalytics(c)}>
      <div className="text-left"><p className="font-semibold">{c.title}</p><p className="text-xs text-gray-500">{t('enhancedPrayerChallenges', 'xParticipants', '{count} participants').replace('{count}', String(participantCounts[challengeId] || 0))}</p></div>
    </Button>
  );
})}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Music Selection Dialog */}
      <Dialog open={showMusicSelector} onOpenChange={setShowMusicSelector}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Music className="h-5 w-5 text-purple-600" />
              {t('enhancedPrayerChallenges', 'selectBackgroundMusic', 'Select Background Music')}
            </DialogTitle>
            <DialogDescription>
              {t('enhancedPrayerChallenges', 'chooseInstrumentalMusic', 'Choose instrumental music to accompany your prayer session')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {instrumentalTracks.map(track => (
              <div
                key={track.id}
                onClick={() => setSelectedMusicId(track.id)}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedMusicId === track.id
                    ? 'border-purple-600 bg-purple-50'
                    : 'border-gray-200 hover:border-purple-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm">{track.title}</h4>
                    <p className="text-xs text-gray-600 mt-1">
                      {track.genre} • {track.mood}
                    </p>
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {track.tags.map(tag => (
                        <span key={tag} className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  {selectedMusicId === track.id && (
                    <div className="w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0 ml-2">
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMusicSelector(false)}>
              {t('enhancedPrayerChallenges', 'cancel', 'Cancel')}
            </Button>
            <Button onClick={startSessionWithMusic} className="bg-purple-600 hover:bg-purple-700">
              {t('enhancedPrayerChallenges', 'startPrayer', 'Start Prayer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateChallengeModal 
        open={showCreate} 
        onClose={() => setShowCreate(false)} 
        onCreated={() => fetchData()} 
        userId={user?.id} 
        userName={profile?.full_name || 'Anonymous'} 
      />
      {shareChallenge && <ShareChallengeModal open={!!shareChallenge} onClose={() => setShareChallenge(null)} title={shareChallenge.title} description={shareChallenge.description || ''} challengeId={shareChallenge.id} />}
      {activeSession && <InteractivePrayerSession title={activeSession.title} prayerPoints={activeSession.prayer_points} sessionType={activeSession.session_type} instrumentalId={activeSession.instrumental_id} onComplete={() => completeSession(activeSession)} onClose={() => setActiveSession(null)} />}
    </div>
  );
};
