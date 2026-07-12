import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/use-toast';
import { BookOpen, CheckCircle, Play, Star, Clock, Share2 } from 'lucide-react';
import { Devotional } from '@/data/devotionals';
import { DevotionalModule } from './DevotionalModule';
import { SocialShareModal } from './SocialShareModal';

interface Props {
  devotional: Devotional;
  onClose: () => void;
}

interface ProgressData {
  current_module: number;
  completed_modules: number[];
  is_favorite: boolean;
  notes: string;
}

export const DevotionalProgress: React.FC<Props> = ({ devotional, onClose }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeModule, setActiveModule] = useState(1);
  const [showDevotionalModule, setShowDevotionalModule] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    loadProgress();
  }, [devotional.id]);

  const loadProgress = async () => {
    try {
      // Use maybeSingle() to handle empty results gracefully
      const { data, error } = await supabase
        .from('devotional_progress')
        .select('*')
        .eq('user_id', user?.id)
        .eq('devotional_id', devotional.id)
        .maybeSingle();
      
      if (data && !error) {
        setProgress(data);
        setActiveModule(data.current_module);
      } else {
        setProgress({ current_module: 1, completed_modules: [], is_favorite: false, notes: '' });
      }
    } catch { 
      setProgress({ current_module: 1, completed_modules: [], is_favorite: false, notes: '' }); 
    }
    setLoading(false);
  };


  const startModule = () => {
    setShowDevotionalModule(true);
  };

  const handleModuleComplete = async () => {
    if (!progress) return;
    const newCompleted = [...new Set([...progress.completed_modules, activeModule])];
    const nextModule = activeModule < devotional.modules ? activeModule + 1 : activeModule;
    
    try {
      await supabase.from('devotional_progress').upsert({
        user_id: user?.id, 
        devotional_id: devotional.id, 
        current_module: nextModule,
        total_modules: devotional.modules, 
        completed_modules: newCompleted, 
        is_favorite: progress.is_favorite,
        completed_at: newCompleted.length === devotional.modules ? new Date().toISOString() : null
      }, { onConflict: 'user_id,devotional_id' });
      
      setProgress({ ...progress, completed_modules: newCompleted, current_module: nextModule });
      setActiveModule(nextModule);
      setShowDevotionalModule(false);
      
      toast({
        title: newCompleted.length === devotional.modules ? t('devotionalProgress', 'devotionalComplete', 'Devotional Complete!') : t('devotionalProgress', 'dayComplete', 'Day Complete'),
        description: newCompleted.length === devotional.modules ? t('devotionalProgress', 'congratsFinishing', 'Congratulations on finishing!') : t('devotionalProgress', 'dayXCompleted', 'Day {day} completed').replace('{day}', String(activeModule))
      });
    } catch (err: any) {
      toast({ title: t('devotionalProgress', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const toggleFavorite = async () => {
    if (!progress) return;
    const newFav = !progress.is_favorite;
    await supabase.from('devotional_progress').upsert({ user_id: user?.id, devotional_id: devotional.id, total_modules: devotional.modules, is_favorite: newFav }, { onConflict: 'user_id,devotional_id' });
    setProgress({ ...progress, is_favorite: newFav });
    toast({ title: newFav ? t('devotionalProgress', 'addedToFavorites', 'Added to Favorites') : t('devotionalProgress', 'removedFromFavorites', 'Removed from Favorites') });
  };

  const completedCount = progress?.completed_modules.length || 0;
  const progressPercent = (completedCount / devotional.modules) * 100;

  if (showDevotionalModule) {
    return (
      <DevotionalModule
        devotional={devotional}
        moduleNumber={activeModule}
        onComplete={handleModuleComplete}
        onClose={() => setShowDevotionalModule(false)}
      />
    );
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl">{devotional.title}</CardTitle>
            <p className="text-purple-600 text-sm mt-1">{devotional.scripture}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={() => setShowShareModal(true)}>
              <Share2 className="h-5 w-5 text-gray-400 hover:text-purple-600" />
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleFavorite}>
              <Star className={`h-5 w-5 ${progress?.is_favorite ? 'fill-amber-400 text-amber-400' : 'text-gray-400'}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <img src={devotional.imageUrl} alt={devotional.title} className="w-full h-48 object-cover rounded-lg" />
        <p className="text-gray-600">{devotional.excerpt}</p>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{devotional.duration}</span>
          <span className="flex items-center gap-1"><BookOpen className="h-4 w-4" />{devotional.modules} {t('devotionalProgress', 'days', 'days')}</span>
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>{t('devotionalProgress', 'progress', 'Progress')}</span>
            <span>{completedCount}/{devotional.modules}</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {Array.from({ length: devotional.modules }, (_, i) => i + 1).map(m => (
            <button 
              key={m} 
              onClick={() => setActiveModule(m)} 
              className={`p-2 rounded-lg text-sm font-medium transition-all ${progress?.completed_modules.includes(m) ? 'bg-green-100 text-green-700' : activeModule === m ? 'bg-purple-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
            >
              {progress?.completed_modules.includes(m) ? <CheckCircle className="h-4 w-4 mx-auto" /> : m}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button onClick={startModule} className="flex-1 bg-purple-600 hover:bg-purple-700">
            <Play className="h-4 w-4 mr-2" />
            {(completedCount > 0 ? t('devotionalProgress', 'continueDayX', 'Continue Day {day}') : t('devotionalProgress', 'startDayX', 'Start Day {day}')).replace('{day}', String(activeModule))}
          </Button>
        </div>
        <Button variant="ghost" onClick={onClose} className="w-full">{t('devotionalProgress', 'close', 'Close')}</Button>
      </CardContent>

      {showShareModal && (
        <SocialShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          title={t('devotionalProgress', 'shareTitle', 'I\'m reading "{title}" devotional').replace('{title}', devotional.title)}
          description={`${devotional.excerpt} - ${devotional.scripture}`}
          url={window.location.href}
          imageUrl={devotional.imageUrl}
        />
      )}
    </Card>
  );
};
