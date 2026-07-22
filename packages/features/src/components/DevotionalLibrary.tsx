import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Badge } from '@rekindle/ui/badge';
import { Progress } from '@rekindle/ui/progress';
import { Alert, AlertDescription } from '@rekindle/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@rekindle/ui/dialog';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { recordDailyActivity } from '../streak';
import { useUserEntitlements } from '@rekindle/auth/useUserEntitlements';
import { toast } from '@rekindle/ui/use-toast';
import { useViewHistory } from '../hooks/useViewHistory';
import { DevotionalModule } from './DevotionalModule';
import DevotionalSeriesViewer from './DevotionalSeriesViewer';
import { 
  BookOpen, Search, Filter, Star, StarOff, Share2, CheckCircle, 
  PlayCircle, Clock, TrendingUp, Award, Bookmark, BookmarkCheck,
  ChevronRight, Calendar, Users, Target, Loader2, Heart,
  Volume2, Video, MessageSquare, RefreshCw, ArrowLeft, Lock, Crown
} from 'lucide-react';

interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

interface Series {
  id: string;
  category_id: string;
  title: string;
  subtitle?: string;
  description: string;
  author?: string;
  author_social_url?: string;
  cover_image_url?: string;
  total_days: number;
  difficulty_level?: 'beginner' | 'intermediate' | 'advanced';
  tags?: string[];
  is_featured: boolean;
  progress?: number;
  is_bookmarked?: boolean;
}

interface DevotionalEntry {
  id: string;
  series_id: string;
  day_number: number;
  title: string;
  scripture_reference?: string;
  scripture_text?: string;
  content: string;
  reflection_questions?: string[];
  prayer?: string;
  audio_url?: string;
  video_url?: string;
  is_bookmarked?: boolean;
}

interface UserProgress {
  current_day: number;
  completed_days: number[];
  is_completed: boolean;
}

export const DevotionalLibrary: React.FC<{ hidePlanBanner?: boolean }> = ({ hidePlanBanner = false } = {}) => {
  const { user } = useAuth();
  const { t, language, getLocalizedContent } = useLanguage();
  const entitlements = useUserEntitlements();
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const [currentEntry, setCurrentEntry] = useState<DevotionalEntry | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [userProgress, setUserProgress] = useState<Record<string, UserProgress>>({});
  const [view, setView] = useState<'library' | 'series' | 'entry' | 'module'>('library');
  const { navigateView: navigateViewMode } = useViewHistory('devotional-library', view, setView as (v: string) => void);
  
  // Get devotional access level from subscription
  const devotionalAccessLevel = entitlements.hasUnlimitedDevotionals ? 'unlimited' : 'limited';
  const hasFullAccess = devotionalAccessLevel === 'unlimited';
  const loadingRef = useRef(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    loadCategories();
    loadSeries();
    if (user) loadUserProgress();

    return () => {
      isMounted.current = false;
    };
  }, [user]);

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('devotional_categories')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      if (error) throw error;
      if (isMounted.current) setCategories(data || []);
    } catch (err: any) {
      console.error('Error loading categories:', err);
    }
  };

  const loadSeries = async () => {
    if (loadingRef.current) return;
    
    loadingRef.current = true;
    setLoading(true);

    try {
      let query = supabase
        .from('devotional_series')
        .select('*')
        .eq('is_published', true)
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false });

      if (selectedCategory) {
        query = query.eq('category_id', selectedCategory);
      }

      const { data: seriesData, error: seriesError } = await query;
      if (seriesError) throw seriesError;

      // Load bookmarks if user is logged in
      if (user && seriesData) {
        const seriesIds = seriesData.map(s => s.id);
        const { data: bookmarksData } = await supabase
          .from('devotional_bookmarks')
          .select('series_id')
          .eq('user_id', user.id)
          .in('series_id', seriesIds);

        const bookmarkedIds = new Set(bookmarksData?.map(b => b.series_id) || []);

        const seriesWithBookmarks = seriesData.map(s => ({
          ...s,
          is_bookmarked: bookmarkedIds.has(s.id),
          progress: userProgress[s.id]?.completed_days?.length || 0
        }));

        if (isMounted.current) setSeries(seriesWithBookmarks);
      } else if (isMounted.current) {
        setSeries(seriesData || []);
      }
    } catch (err: any) {
      console.error('Error loading series:', err);
      toast({ title: t('common', 'error', 'Error'), description: t('devotionals', 'failedLoadDevotionals', 'Failed to load devotionals'), variant: 'destructive' });
    } finally {
      if (isMounted.current) setLoading(false);
      loadingRef.current = false;
    }
  };

  const loadUserProgress = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('devotional_user_progress')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;

      const progressMap: Record<string, UserProgress> = {};
      data?.forEach(p => {
        progressMap[p.series_id] = {
          current_day: p.current_day,
          completed_days: p.completed_days || [],
          is_completed: p.is_completed
        };
      });

      if (isMounted.current) setUserProgress(progressMap);
    } catch (err) {
      console.error('Error loading user progress:', err);
    }
  };

  const loadSeriesContent = async (seriesId: string) => {
    try {
      setLoading(true);
      
      // Get series details
      const { data: seriesData, error: seriesError } = await supabase
        .from('devotional_series')
        .select('*')
        .eq('id', seriesId)
        .single();

      if (seriesError) {
        console.error('Series error:', seriesError);
        toast({ 
          title: t('devotionals', 'seriesNotFound', 'Series Not Found'), 
          description: t('devotionals', 'seriesNotFoundDesc', 'This devotional series could not be loaded.'),
          variant: 'destructive' 
        });
        return;
      }

      // Get user's progress for this series
      const progress = userProgress[seriesId];
      const dayToLoad = progress?.current_day || 1;

      // Load the current entry - try maybeSingle first
      const { data: entryData, error: entryError } = await supabase
        .from('devotional_entries')
        .select('*')
        .eq('series_id', seriesId)
        .eq('day_number', dayToLoad)
        .maybeSingle();

      if (entryError) {
        console.error('Entry error:', entryError);
        toast({ 
          title: t('devotionals', 'contentErrorTitle', 'Content Error'), 
          description: t('devotionals', 'contentErrorDesc', 'Could not load devotional content.'),
          variant: 'destructive' 
        });
        return;
      }

      if (!entryData) {
        // No entry found for this day - try day 1
        const { data: firstEntry, error: firstError } = await supabase
          .from('devotional_entries')
          .select('*')
          .eq('series_id', seriesId)
          .eq('day_number', 1)
          .maybeSingle();

        if (firstError || !firstEntry) {
          toast({ 
            title: t('devotionals', 'noContentAvailable', 'No Content Available'), 
            description: t('devotionals', 'noContentAvailableDesc', 'This devotional series has no content yet.'),
            variant: 'destructive' 
          });
          return;
        }

        // Use day 1
        if (isMounted.current) {
          setSelectedSeries(seriesData);
          setCurrentEntry(firstEntry);
          navigateViewMode('module');
        }
      } else {
        if (isMounted.current) {
          setSelectedSeries(seriesData);
          setCurrentEntry(entryData);
          navigateViewMode('module');
        }
      }
    } catch (err: any) {
      console.error('Error loading series content:', err);
      toast({ 
        title: t('common', 'error', 'Error'), 
        description: err.message || 'Failed to load devotional',
        variant: 'destructive' 
      });
    } finally {
      setLoading(false);
    }
  };

  const markDayComplete = async () => {
    if (!user || !selectedSeries || !currentEntry) return;

    try {
      const progress = userProgress[selectedSeries.id];
      const completedDays = [...(progress?.completed_days || []), currentEntry.day_number];
      const isCompleted = completedDays.length === selectedSeries.total_days;

      const progressData = {
        user_id: user.id,
        series_id: selectedSeries.id,
        current_day: Math.min(currentEntry.day_number + 1, selectedSeries.total_days),
        completed_days: completedDays,
        last_read_at: new Date().toISOString(),
        is_completed: isCompleted,
        ...(isCompleted && { completed_at: new Date().toISOString() })
      };

      const { error } = await supabase
        .from('devotional_user_progress')
        .upsert(progressData, { onConflict: 'user_id,series_id' });

      if (error) throw error;

      recordDailyActivity(user.id, 'devotional_library');

      toast({ 
        title: t('devotionals', 'progressSaved', 'Progress Saved'), 
        description: isCompleted ? 'Series completed!' : 'Day marked as complete!' 
      });

      // Update local progress
      setUserProgress(prev => ({
        ...prev,
        [selectedSeries.id]: {
          current_day: progressData.current_day,
          completed_days: completedDays,
          is_completed: isCompleted
        }
      }));

      // Load next day if available
      if (!isCompleted) {
        loadNextDay();
      }
    } catch (err: any) {
      console.error('Error marking complete:', err);
      toast({ title: t('common', 'error', 'Error'), description: t('devotionals', 'failedSaveProgress', 'Failed to save progress'), variant: 'destructive' });
    }
  };

  const loadNextDay = async () => {
    if (!selectedSeries || !currentEntry) return;

    const nextDay = currentEntry.day_number + 1;
    if (nextDay > selectedSeries.total_days) {
      toast({ title: t('devotionals', 'seriesCompleteExcl', 'Series Complete!'), description: t('devotionals', 'seriesCompleteExclDesc', "You've finished this devotional series!") });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('devotional_entries')
        .select('*')
        .eq('series_id', selectedSeries.id)
        .eq('day_number', nextDay)
        .maybeSingle();

      if (error) {
        console.error('Error loading next day:', error);
        toast({ title: t('common', 'error', 'Error'), description: t('devotionals', 'couldNotLoadNextDay', 'Could not load next day'), variant: 'destructive' });
        return;
      }

      if (!data) {
        toast({ title: t('devotionals', 'contentNotAvailable', 'Content Not Available'), description: t('devotionals', 'dayNotAvailableYet', 'Day {day} is not available yet.', { day: nextDay }) });
        return;
      }

      if (isMounted.current) setCurrentEntry(data);
    } catch (err) {
      console.error('Error loading next day:', err);
    }
  };

  const loadPreviousDay = async () => {
    if (!selectedSeries || !currentEntry) return;

    const prevDay = currentEntry.day_number - 1;
    if (prevDay < 1) return;

    try {
      const { data, error } = await supabase
        .from('devotional_entries')
        .select('*')
        .eq('series_id', selectedSeries.id)
        .eq('day_number', prevDay)
        .maybeSingle();

      if (error) {
        console.error('Error loading previous day:', error);
        toast({ title: t('common', 'error', 'Error'), description: t('devotionals', 'couldNotLoadPrevDay', 'Could not load previous day'), variant: 'destructive' });
        return;
      }

      if (!data) {
        toast({ title: t('devotionals', 'contentNotAvailable', 'Content Not Available'), description: t('devotionals', 'dayNotAvailable', 'Day {day} is not available.', { day: prevDay }) });
        return;
      }

      if (isMounted.current) setCurrentEntry(data);
    } catch (err) {
      console.error('Error loading previous day:', err);
    }
  };

  const toggleBookmark = async (seriesId: string, entryId?: string) => {
    if (!user) {
      toast({ title: t('auth', 'signInRequired', 'Sign In Required'), description: t('devotionals', 'pleaseSignInBookmark', 'Please sign in to bookmark'), variant: 'destructive' });
      return;
    }

    try {
      const seriesItem = series.find(s => s.id === seriesId);
      
      if (seriesItem?.is_bookmarked) {
        // Remove bookmark
        const { error } = await supabase
          .from('devotional_bookmarks')
          .delete()
          .eq('user_id', user.id)
          .eq('series_id', seriesId);

        if (error) throw error;
        toast({ title: t('devotionals', 'removedTitle', 'Removed'), description: t('devotionals', 'bookmarkRemoved', 'Bookmark removed') });
      } else {
        // Add bookmark
        const { error } = await supabase
          .from('devotional_bookmarks')
          .insert({
            user_id: user.id,
            series_id: seriesId,
            entry_id: entryId || null
          });

        if (error) throw error;
        toast({ title: t('devotionals', 'savedTitle', 'Saved'), description: t('devotionals', 'addedToBookmarks', 'Added to bookmarks') });
      }

      // Refresh series to update bookmark status
      loadSeries();
    } catch (err: any) {
      console.error('Error toggling bookmark:', err);
      toast({ title: t('common', 'error', 'Error'), description: t('devotionals', 'failedUpdateBookmark', 'Failed to update bookmark'), variant: 'destructive' });
    }
  };

  const shareDevotional = async () => {
    if (!currentEntry || !shareEmail.trim()) {
      toast({ title: t('common', 'error', 'Error'), description: t('devotionals', 'enterEmailAddress', 'Please enter an email address'), variant: 'destructive' });
      return;
    }

    try {
      const { error } = await supabase
        .from('devotional_shares')
        .insert({
          user_id: user?.id,
          entry_id: currentEntry.id,
          shared_with_email: shareEmail,
          message: shareMessage
        });

      if (error) throw error;

      toast({ title: t('devotionals', 'sharedExcl', 'Shared!'), description: t('devotionals', 'devotionalSharedSuccess', 'Devotional shared successfully') });
      setShowShareDialog(false);
      setShareEmail('');
      setShareMessage('');
    } catch (err: any) {
      console.error('Error sharing:', err);
      toast({ title: t('common', 'error', 'Error'), description: t('devotionals', 'failedShareDevotional', 'Failed to share devotional'), variant: 'destructive' });
    }
  };

  const getDifficultyColor = (level?: string) => {
    switch (level) {
      case 'beginner': return 'bg-green-100 text-green-700';
      case 'intermediate': return 'bg-yellow-100 text-yellow-700';
      case 'advanced': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getProgressPercentage = (seriesId: string, totalDays: number) => {
    const completed = userProgress[seriesId]?.completed_days?.length || 0;
    return Math.round((completed / totalDays) * 100);
  };

  const filteredSeries = series.filter(s => 
    s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.author?.toLowerCase().includes(searchTerm.toLowerCase())
  );

 // Immersive Module View - with comprehensive null checking
  // Fixed: Removed total_days check as it might be 0 for some series
  if (view === 'module' && currentEntry && selectedSeries) {
    const lzSeries = getLocalizedContent(selectedSeries, ['title', 'subtitle', 'description']);
    const lzEntry = getLocalizedContent(currentEntry, ['title', 'scripture_reference', 'scripture_text', 'content', 'prayer', 'reflection_questions']);
    return (
      <DevotionalModule
        entry={lzEntry}
        seriesTitle={lzSeries.title || 'Devotional'}
        totalDays={selectedSeries.total_days || 1}
        shareUrl={`${window.location.origin}/devotional-series/${selectedSeries.id}`}
        onComplete={async () => {
          await loadUserProgress();
          await loadSeries();
          setSelectedSeries(null);
          setCurrentEntry(null);
          navigateViewMode('library');
          toast({ 
            title: t('devotionals', 'devotionalCompleteExcl', 'Devotional Complete!'), 
            description: t('devotionals', 'progressBeenSaved', 'Your progress has been saved.'),
            variant: 'default'
          });
        }}
        onClose={() => {
          setSelectedSeries(null);
          setCurrentEntry(null);
          navigateViewMode('library');
        }}
      />
    );
  }
 
  // Show loading if we're in module view but data isn't ready
  if (view === 'module') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-purple-500 mb-4" />
          <p className="text-gray-500">Loading devotional...</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => navigateViewMode('library')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Library
          </Button>
        </div>
      </div>
    );
  }


  // Main Library View with Sub-tabs
  return (
    <div className="space-y-6">
      
      {!hidePlanBanner && devotionalAccessLevel === 'unlimited' && (
        <Alert className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
          <Crown className="h-4 w-4 text-green-600" />
          <AlertDescription className="ml-2">
            <p className="text-sm font-medium text-green-800">
              ✨ Unlimited devotional access on your Premium plan
            </p>
          </AlertDescription>
        </Alert>
      )}
      
      {/* Devotional Series Content */}
      <DevotionalSeriesViewer />

      {/* Share Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('devotionals', 'shareThisDevotional', 'Share This Devotional')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t('devotionals', 'emailAddress', 'Email Address')}</label>
              <Input
                type="email"
                placeholder="friend@example.com"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('devotionals', 'personalMessageOptional', 'Personal Message (Optional)')}</label>
              <Textarea
                placeholder={t('devotionals', 'addPersonalNote', 'Add a personal note...')}
                value={shareMessage}
                onChange={(e) => setShareMessage(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShareDialog(false)}>{t('common', 'cancel', 'Cancel')}</Button>
            <Button onClick={shareDevotional}>
              <Share2 className="h-4 w-4 mr-2" />
              {t('common', 'share', 'Share')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};