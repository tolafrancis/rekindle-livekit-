/// ENHANCED PRAYER SERIES VIEWER WITH AUDIO CONTROLS - COMPLETE VERSION
// Audio controls are now HIGHLY VISIBLE in traditional prayer mode

import { useSwipe } from '@rekindle/ui/useSwipe';
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { Progress } from '@rekindle/ui/progress';
import { Alert, AlertDescription } from '@rekindle/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@rekindle/ui/dialog';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { useTapGesture, useOneTimeTip, ViewerGestureTip } from './viewerGestures';
import { recordDailyActivity } from '../streak';
import { useUserEntitlements } from '@rekindle/auth/useUserEntitlements';
import { useUpgradePrompt } from '@rekindle/auth/useUpgradePrompt';
import { UpgradePromptModal } from './UpgradePromptModal';
import { useViewHistory } from '../hooks/useViewHistory';
import { toast } from '@rekindle/ui/use-toast';
import { 
  postPrayerSeriesStarted,
  postPrayerSeriesCompleted,
  postPrayerSeriesDayCompleted
} from '../communityActivityService';
import { InteractivePrayerSession } from './InteractivePrayerSession';
import { PrayerPoint, SESSION_DURATIONS } from '@rekindle/types/prayerTypes';
import { instrumentalTracks } from '../data/instrumentals';
import {
  BookOpen, Calendar, Clock, Star, Play, 
  CheckCircle, ChevronRight, ChevronLeft, Lock,
  Award, Loader2, Volume2, ArrowLeft, Flame,
  Timer, Pause, RotateCcw, Presentation, Crown,
  Volume1, VolumeX, Volume, Music,
  Share2, Copy, Send
} from 'lucide-react';

interface PrayerSeries {
  id: string;
  title: string;
  subtitle?: string;
  description: string;
  scripture_reference?: string;
  scripture_text?: string;
  scriptures?: { reference: string; text: string; }[];
  total_days: number;
  cover_image_url?: string;
  background_music_id?: number;
  difficulty_level: string;
  is_featured: boolean;
}

interface PrayerDay {
  id: string;
  day_number: number;
  title: string;
  prayer_text: string;
  scripture_reference: string;
  scripture_text: string;
  scriptures?: { reference: string; text: string; }[];
  audio_url?: string;
  background_music_id?: number;
  prayer_focus?: string;
  prayer_points: PrayerPoint[];
  duration_minutes: number;
  is_published: boolean;
}

interface UserProgress {
  current_day: number;
  completed_days: number[];
  day_completion_timestamps: Record<number, string>;
  is_completed: boolean;
  started_at: string;
  last_prayed_at?: string;
  days_observed: number;
}

interface PrayerSeriesViewerProps {
  seriesId?: string;
  onBack?: () => void;
}

const DURATION_OPTIONS = [
  { value: 5, label: '5 min', description: 'Quick prayer' },
  { value: 10, label: '10 min', description: 'Short session' },
  { value: 15, label: '15 min', description: 'Standard' },
  { value: 30, label: '30 min', description: 'Extended' },
];

const getCurrentDateInUserTimezone = (): string => {
  return new Date().toISOString().split('T')[0];
};

const getDateFromTimestamp = (isoTimestamp: string): string => {
  return new Date(isoTimestamp).toISOString().split('T')[0];
};

const calculateDaysObserved = (completionTimestamps: Record<number, string>): number => {
  if (!completionTimestamps || Object.keys(completionTimestamps).length === 0) {
    return 0;
  }
  
  const uniqueDates = new Set<string>();
  Object.values(completionTimestamps).forEach(timestamp => {
    if (timestamp) {
      uniqueDates.add(getDateFromTimestamp(timestamp));
    }
  });
  
  return uniqueDates.size;
};

const canUnlockDay = (
  dayNumber: number,
  progress: UserProgress | null,
  selectedSeries: PrayerSeries | null
): { canUnlock: boolean; reason?: string } => {
  // Day 1 is always unlocked
  if (dayNumber === 1) {
    return { canUnlock: true };
  }
  // Must have progress to unlock subsequent days
  if (!progress) {
    return { canUnlock: false, reason: 'Start the series first' };
  }
  // Previous day must be completed
  const previousDayCompleted = progress.completed_days.includes(dayNumber - 1);
  if (!previousDayCompleted) {
    return { canUnlock: false, reason: `Complete Day ${dayNumber - 1} first` };
  }
  // Must have completion timestamp for previous day
  const previousDayCompletionTimestamp = progress.day_completion_timestamps?.[dayNumber - 1];
  if (!previousDayCompletionTimestamp) {
    return { canUnlock: false, reason: `Complete Day ${dayNumber - 1} first` };
  }
  // Get date strings in YYYY-MM-DD format (ISO dates)
  const previousCompletionDate = getDateFromTimestamp(previousDayCompletionTimestamp);
  const currentDate = getCurrentDateInUserTimezone();
  
  // FIX: Change comparison logic to be more explicit
  // This handles edge cases better and makes the logic clearer
  
  // If current date is before completion date, something is wrong
  if (currentDate < previousCompletionDate) {
    console.error('Invalid state: completion date is in the future', {
      currentDate,
      previousCompletionDate
    });
    return { canUnlock: false, reason: 'Invalid completion date' };
  }
  
  // If same day as completion, must wait until tomorrow
  if (currentDate === previousCompletionDate) {
    return { canUnlock: false, reason: 'Next day unlocks tomorrow' };
  }
  // At this point: currentDate > previousCompletionDate
  // This means at least one calendar day has passed - unlock!
  return { canUnlock: true };
};

const generatePrayerPointsFromDay = (day: PrayerDay): PrayerPoint[] => {
  console.log('🔍 Generating prayer points for day:', day.day_number);
  console.log('📋 Day prayer_points:', day.prayer_points);
  
  const points: PrayerPoint[] = [];
  
  if (day.prayer_points && Array.isArray(day.prayer_points) && day.prayer_points.length > 0) {
    const validPoints = day.prayer_points.filter(point => 
      point && (point.title || point.content)
    );
    
    if (validPoints.length > 0) {
      console.log('✅ Using existing prayer points:', validPoints.length);
      return validPoints.map(point => ({
        title: point.title || 'Prayer Point',
        content: point.content || point.title || 'Pray about this topic.',
        scripture: point.scripture,
        scriptureText: point.scriptureText,
        reflection: point.reflection,
        duration: point.duration || 60
      }));
    }
  }
  
  console.log('⚠️  No valid prayer_points found, generating from day content');
  
  if (day.scripture_reference || day.scripture_text) {
    points.push({
      title: 'Scripture Meditation',
      content: day.scripture_text || `Meditate on ${day.scripture_reference || 'God\'s Word'}`,
      scripture: day.scripture_reference,
      scriptureText: day.scripture_text,
      duration: 60
    });
    console.log('✅ Added scripture point');
  }
  
  if (day.prayer_focus && day.prayer_focus.trim()) {
    points.push({
      title: 'Prayer Focus',
      content: day.prayer_focus,
      duration: 90
    });
    console.log('✅ Added prayer focus point');
  }
  
  if (day.prayer_text && day.prayer_text.trim()) {
    const paragraphs = day.prayer_text.split('\n\n').filter(p => p.trim());
    
    if (paragraphs.length > 1) {
      paragraphs.slice(0, 3).forEach((paragraph, idx) => {
        points.push({
          title: `Prayer ${idx + 1}`,
          content: paragraph.trim(),
          duration: 60
        });
      });
      console.log(`✅ Added ${Math.min(paragraphs.length, 3)} prayer text points`);
    } else {
      points.push({
        title: 'Prayer',
        content: day.prayer_text.trim(),
        duration: 90
      });
      console.log('✅ Added single prayer text point');
    }
  }
  
  if (points.length === 0) {
    console.warn('⚠️  NO CONTENT FOUND - Creating default point');
    points.push({
      title: day.title || 'Prayer Time',
      content: `Take this moment to lift up your prayers for: ${day.prayer_focus || 'God\'s guidance and presence in your life'}. Let the Holy Spirit guide your prayers.`,
      duration: 120
    });
  }
  
  console.log(`📊 Total points generated: ${points.length}`);
  return points;
};

export const PrayerSeriesViewer: React.FC<PrayerSeriesViewerProps> = ({
  seriesId,
  onBack
}) => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const entitlements = useUserEntitlements();
  
  const [allSeries, setAllSeries] = useState<PrayerSeries[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<PrayerSeries | null>(null);
  const [days, setDays] = useState<PrayerDay[]>([]);
  const [currentDay, setCurrentDay] = useState<PrayerDay | null>(null);
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'series' | 'praying' | 'interactive'>('list');
  const { navigateView: navigateViewMode } = useViewHistory('prayer-series-viewer', view, setView as (v: string) => void);
  const [hasPostedSeriesStart, setHasPostedSeriesStart] = useState(false);
  
  const [showDurationModal, setShowDurationModal] = useState(false);
  const [showScripturePreview, setShowScripturePreview] = useState(false);
  const [showModeSelectionModal, setShowModeSelectionModal] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(10);
  const [sessionType, setSessionType] = useState<'quick' | 'standard' | 'deep'>('standard');
  const [isPraying, setIsPraying] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  // Swipe to navigate prayer points
  const swipeHandlers = useSwipe({
    onSwipeLeft: () => {
      const nextIndex = currentPointIndex + 1;
      if (nextIndex < generatedPrayerPoints.length) {
        setCurrentPointIndex(nextIndex);
      }
    },
    onSwipeRight: () => {
      const prevIndex = currentPointIndex - 1;
      if (prevIndex >= 0) {
        setCurrentPointIndex(prevIndex);
      }
    },
  });

  const [isPaused, setIsPaused] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showPointShareModal, setShowPointShareModal] = useState(false);
  const [sharePointIndex, setSharePointIndex] = useState<number | null>(null);
  
  // Music selection states
  const [showMusicSelector, setShowMusicSelector] = useState(false);
  const [selectedMusicId, setSelectedMusicId] = useState<string>('1');
  
  const [generatedPrayerPoints, setGeneratedPrayerPoints] = useState<PrayerPoint[]>([]);
  
  // Audio & Music Controls
  const [volume, setVolume] = useState(() => {
    const savedVolume = localStorage.getItem('prayer-volume');
    return savedVolume ? parseFloat(savedVolume) : 0.5;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  // Background music auto-plays when the viewer opens. Single tap pauses, double
  // tap resumes — a plain tap never *resumes* audio, only the explicit gestures do.
  const [audioStarted, setAudioStarted] = useState(true);
  const gestureTip = useOneTimeTip();
  const audioRef = React.useRef<HTMLAudioElement>(null);
  
  const prayerLibraryAccessLevel = 'unlimited'; // Prayer library is free for all users
  const { activePrompt, show: showUpgradePrompt, dismiss: dismissUpgradePrompt } = useUpgradePrompt();
  const FREE_PRAYER_POINT_LIMIT = 5;

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const getMusicUrl = () => {
    // Priority: selectedMusicId > day music > series music
    const musicId = selectedMusicId || currentDay?.background_music_id || selectedSeries?.background_music_id;
    console.log('🎵 getMusicUrl - musicId:', musicId);
    
    if (musicId) {
      const track = instrumentalTracks.find(t => t.id === String(musicId));
      console.log('🎵 Found track:', track);
      if (track) return track.file_url;
    }
    
    const defaultUrl = instrumentalTracks[0]?.file_url || '';
    console.log('🎵 Using default URL:', defaultUrl);
    return defaultUrl;
  };

  useEffect(() => {
    console.log('🔊 Audio effect - view:', view, 'isPlaying:', isPlaying, 'isPaused:', isPaused);
    
    if (audioRef.current && (view === 'praying' || view === 'interactive')) {
      audioRef.current.volume = isMuted ? 0 : volume;
      console.log('🔊 Setting audio volume to:', audioRef.current.volume);
      
      if (audioStarted && !isPaused) {
        console.log('🔊 Attempting to play audio...');
        audioRef.current.play().catch((err) => {
          console.error('🔊 Audio play failed:', err);
        });
      } else {
        console.log('🔊 Pausing audio');
        audioRef.current.pause();
      }
    }
  }, [audioStarted, isPaused, isMuted, volume, view]);

  useEffect(() => {
    localStorage.setItem('prayer-volume', volume.toString());
  }, [volume]);

  useEffect(() => {
    if (seriesId) {
      loadSeries(seriesId);
    } else {
      loadAllSeries();
    }
    
    return () => {
      setCurrentDay(null);
      setGeneratedPrayerPoints([]);
      setShowModeSelectionModal(false);
      setShowDurationModal(false);
      setIsPraying(false);
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [seriesId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPraying && !isPaused && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            if (generatedPrayerPoints.length > 0 && currentPointIndex < generatedPrayerPoints.length - 1) {
              setCurrentPointIndex(prevIdx => prevIdx + 1);
              return generatedPrayerPoints[currentPointIndex + 1]?.duration || 60;
            } else {
              setIsPraying(false);
              completePrayer();
              return 0;
            }
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPraying, isPaused, timeRemaining, currentPointIndex, generatedPrayerPoints]);

  useEffect(() => {
    if (selectedSeries && progress && user && profile) {
      handleSeriesStart(selectedSeries, progress);
    }
  }, [selectedSeries, progress, user, profile]);

  const loadAllSeries = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('prayer_series')
        .select('*')
        .eq('is_published', true)
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const parsedSeries = (data || []).map(s => ({
        ...s,
        scriptures: typeof s.scriptures === 'string' ? JSON.parse(s.scriptures) : s.scriptures || []
      }));
      
      setAllSeries(parsedSeries);
      setView('list');
    } catch (err) {
      console.error('Error loading series:', err);
      toast({ title: t('prayerSeriesViewer', 'error', 'Error'), description: t('prayerSeriesViewer', 'failedLoadSeries', 'Failed to load prayer series'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadSeries = async (id: string) => {
    setLoading(true);
    try {
      const { data: seriesData, error: seriesError } = await supabase
        .from('prayer_series')
        .select('*')
        .eq('id', id)
        .single();

      if (seriesError) throw seriesError;
      
      // Parse scriptures
      const parsedSeries = {
        ...seriesData,
        scriptures: typeof seriesData.scriptures === 'string' 
          ? JSON.parse(seriesData.scriptures) 
          : seriesData.scriptures || []
      };
      
      setSelectedSeries(parsedSeries);

      let daysData = null;
      let daysError = null;
      
      const { data: publishedDays, error: publishedError } = await supabase
        .from('prayer_series_days')
        .select('*')
        .eq('series_id', id)
        .eq('is_published', true)
        .order('day_number');
      
      if (!publishedError && publishedDays && publishedDays.length > 0) {
        daysData = publishedDays;
      } else {
        const { data: allDays, error: allError } = await supabase
          .from('prayer_series_days')
          .select('*')
          .eq('series_id', id)
          .order('day_number');
        
        daysData = allDays;
        daysError = allError;
      }

      if (daysError) throw daysError;
      
      const parsedDays = (daysData || []).map(d => {
        let prayerPoints = [];
        let scriptures = [];
        
        try {
          if (typeof d.prayer_points === 'string') {
            const parsed = JSON.parse(d.prayer_points);
            prayerPoints = Array.isArray(parsed) ? parsed : [];
          } else if (Array.isArray(d.prayer_points)) {
            prayerPoints = d.prayer_points;
          } else if (d.prayer_points && typeof d.prayer_points === 'object') {
            prayerPoints = [d.prayer_points];
          }
        } catch (parseError) {
          console.error(`Failed to parse prayer_points for day ${d.day_number}:`, parseError);
          prayerPoints = [];
        }
        
        try {
          if (typeof d.scriptures === 'string') {
            const parsed = JSON.parse(d.scriptures);
            scriptures = Array.isArray(parsed) ? parsed : [];
          } else if (Array.isArray(d.scriptures)) {
            scriptures = d.scriptures;
          }
        } catch (parseError) {
          console.error(`Failed to parse scriptures for day ${d.day_number}:`, parseError);
          scriptures = [];
        }
        
        return {
          ...d,
          prayer_points: prayerPoints,
          scriptures: scriptures
        };
      });
      
      console.log(`📚 Loaded ${parsedDays.length} days for series ${seriesData.title}`);
      setDays(parsedDays);

      if (user) {
        const { data: progressData } = await supabase
          .from('prayer_user_progress')
          .select('*')
          .eq('user_id', user.id)
          .eq('series_id', id)
          .maybeSingle();

        if (progressData) {
          let completionTimestamps: Record<number, string> = {};
          try {
            if (typeof progressData.day_completion_timestamps === 'string') {
              completionTimestamps = JSON.parse(progressData.day_completion_timestamps);
            } else if (typeof progressData.day_completion_timestamps === 'object') {
              completionTimestamps = progressData.day_completion_timestamps || {};
            }
          } catch (e) {
            console.error('Error parsing completion timestamps:', e);
          }

          const daysObserved = calculateDaysObserved(completionTimestamps);

          setProgress({
            current_day: progressData.current_day,
            completed_days: progressData.completed_days || [],
            day_completion_timestamps: completionTimestamps,
            is_completed: progressData.is_completed,
            started_at: progressData.started_at || new Date().toISOString(),
            last_prayed_at: progressData.last_prayed_at,
            days_observed: daysObserved
          });
        }
      }

      setView('series');
    } catch (err) {
      console.error('Error loading series:', err);
      toast({ title: t('prayerSeriesViewer', 'error', 'Error'), description: t('prayerSeriesViewer', 'failedLoadSeriesSingle', 'Failed to load series'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const startSeries = async () => {
    if (!user || !selectedSeries) {
      toast({
        title: t('prayerSeriesViewer', 'signInRequired', 'Sign In Required'),
        description: t('prayerSeriesViewer', 'signInToStart', 'Please sign in to start this series'),
        variant: 'destructive'
      });
      return;
    }

    try {
      // CRITICAL FIX: Validate the upsert succeeded
      const { data: upsertData, error: upsertError } = await supabase
        .from('prayer_user_progress')
        .upsert({
          user_id: user.id,
          series_id: selectedSeries.id,
          current_day: 1,
          completed_days: [],
          day_completion_timestamps: {},
          started_at: new Date().toISOString(),
          is_completed: false
        }, {
          onConflict: 'user_id,series_id'
        })
        .select();

      if (upsertError) {
        console.error('Failed to start prayer series:', upsertError);
        toast({
          title: t('prayerSeriesViewer', 'error', 'Error'),
          description: t('prayerSeriesViewer', 'failedStartSeriesReason', 'Failed to start series: {reason}').replace('{reason}', upsertError.message),
          variant: 'destructive',
          duration: 7000
        });
        return;
      }

      if (!upsertData || upsertData.length === 0) {
        console.error('Upsert returned no data');
        toast({
          title: t('prayerSeriesViewer', 'error', 'Error'),
          description: t('prayerSeriesViewer', 'failedInitProgress', 'Failed to initialize your progress. Please try again.'),
          variant: 'destructive',
          duration: 7000
        });
        return;
      }

      console.log('✅ Prayer series started successfully:', upsertData[0]);

      setProgress({
        current_day: 1,
        completed_days: [],
        day_completion_timestamps: {},
        is_completed: false,
        started_at: new Date().toISOString(),
        days_observed: 0
      });

      if (profile) {
        await handleSeriesStart(selectedSeries, {
          current_day: 1,
          completed_days: [],
          day_completion_timestamps: {},
          is_completed: false,
          started_at: new Date().toISOString(),
          days_observed: 0
        });
      }

      const firstDay = days.find(d => d.day_number === 1);
      if (firstDay) {
        continueDay(1);
      }
    } catch (err) {
      console.error('Error starting series:', err);
      toast({
        title: t('prayerSeriesViewer', 'error', 'Error'),
        description: t('prayerSeriesViewer', 'failedStartSeries', 'Failed to start series'),
        variant: 'destructive',
        duration: 7000
      });
    }
  };

  const continueDay = (dayNumber: number) => {
    console.log('🎯 Continuing day:', dayNumber);
    
    if (!user) {
      toast({ title: t('prayerSeriesViewer', 'signInRequired', 'Sign In Required'), description: t('prayerSeriesViewer', 'signInToContinue', 'Please sign in to continue'), variant: 'destructive' });
      return;
    }

    const unlockCheck = canUnlockDay(dayNumber, progress, selectedSeries);

    if (!unlockCheck.canUnlock) {
      toast({
        title: t('prayerSeriesViewer', 'dayLocked', 'Day Locked'),
        description: unlockCheck.reason || t('prayerSeriesViewer', 'dayNotAvailable', 'This day is not yet available'),
        variant: 'destructive'
      });
      return;
    }

    const day = days.find(d => d.day_number === dayNumber);
    
    if (day) {
      console.log('📖 Found day:', day);
      setCurrentDay(day);
      
      const points = generatePrayerPointsFromDay(day);
      
      if (!points || points.length === 0) {
        console.error('❌ CRITICAL: No prayer points generated!');
        toast({
          title: t('prayerSeriesViewer', 'contentError', 'Content Error'),
          description: t('prayerSeriesViewer', 'dayNoContent', 'This day has no content yet. Please try another day or contact support.'),
          variant: 'destructive'
        });
        return;
      }

      console.log('✅ Setting generated prayer points:', points.length);
      setGeneratedPrayerPoints(points);
      
      // Set default music from day or series
      const defaultMusicId = String(day.background_music_id || selectedSeries?.background_music_id || '1');
      setSelectedMusicId(defaultMusicId);
      
      // Show music selector first
      setShowMusicSelector(true);
    } else {
      console.error('❌ Day not found:', dayNumber);
      toast({ title: t('prayerSeriesViewer', 'error', 'Error'), description: t('prayerSeriesViewer', 'prayerDayNotFound', 'Prayer day not found'), variant: 'destructive' });
    }
  };

  const proceedToModeSelection = () => {
    setShowMusicSelector(false);
    setShowScripturePreview(true);
  };

  const openInteractiveMode = (duration: 'quick' | 'standard' | 'deep') => {
    console.log('🎬 Opening interactive mode:', duration);
    
    if (!generatedPrayerPoints || generatedPrayerPoints.length === 0) {
      console.error('❌ CRITICAL: Cannot open interactive mode - no prayer points!');
      toast({
        title: t('prayerSeriesViewer', 'contentError', 'Content Error'),
        description: t('prayerSeriesViewer', 'noPrayerContent', 'No prayer content available. Please try again.'),
        variant: 'destructive'
      });
      return;
    }
    
    setSessionType(duration);
    setShowModeSelectionModal(false);
    
    setTimeout(() => {
      console.log('✅ Navigating to interactive view with points:', generatedPrayerPoints.length);
      navigateViewMode('interactive');
      setIsPlaying(true);
    }, 100);
  };

  const openTraditionalMode = () => {
    console.log('⏰ Opening traditional mode');
    
    if (!generatedPrayerPoints || generatedPrayerPoints.length === 0) {
      console.error('❌ CRITICAL: Cannot open traditional mode - no prayer points!');
      toast({
        title: t('prayerSeriesViewer', 'contentError', 'Content Error'),
        description: t('prayerSeriesViewer', 'noPrayerContent', 'No prayer content available. Please try again.'),
        variant: 'destructive'
      });
      return;
    }
    
    setShowModeSelectionModal(false);
    setShowDurationModal(true);
  };

  const handleCloseInteractive = () => {
    console.log('🚪 Closing interactive mode');
    setShowModeSelectionModal(false);
    setShowDurationModal(false);
    setCurrentDay(null);
    setGeneratedPrayerPoints([]);
    setSessionType('standard');
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    navigateViewMode('series');
  };

  const handleClosePraying = () => {
    console.log('🚪 Closing traditional mode');
    setShowModeSelectionModal(false);
    setShowDurationModal(false);
    setIsPraying(false);
    setIsPaused(false);
    setTimeRemaining(0);
    setCurrentPointIndex(0);
    setCurrentDay(null);
    setGeneratedPrayerPoints([]);
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    navigateViewMode('series');
  };

  const startPraying = () => {
    if (!currentDay || generatedPrayerPoints.length === 0) return;
    
    // Close duration modal and show scripture preview
    setShowDurationModal(false);
    setShowScripturePreview(true);
  };

  const proceedToPrayerFromPreview = () => {
    if (!currentDay || generatedPrayerPoints.length === 0) return;
    
    setShowScripturePreview(false);
    setCurrentPointIndex(0);
    
    const firstPointDuration = generatedPrayerPoints[0]?.duration || selectedDuration * 60;
    setTimeRemaining(firstPointDuration);
    setIsPraying(true);
    setIsPaused(false);
    setIsPlaying(true);
    navigateViewMode('praying');
  };

  const handleSeriesStart = async (series: PrayerSeries, progress: UserProgress) => {
    if (!user || !profile) return;
    
    if (!hasPostedSeriesStart && progress.completed_days.length === 0) {
      try {
        await postPrayerSeriesStarted(
          user.id,
          profile.full_name || profile.email || 'Anonymous',
          profile.avatar_url,
          series.id,
          series.title,
          series.total_days
        );
        setHasPostedSeriesStart(true);
      } catch (error) {
        console.error('Error posting series start:', error);
      }
    }
  };

  const handleDayComplete = async (
    day: PrayerDay,
    series: PrayerSeries,
    progress: UserProgress
  ) => {
    if (!user || !profile) return;

    try {
      await postPrayerSeriesDayCompleted(
        user.id,
        profile.full_name || profile.email || 'Anonymous',
        profile.avatar_url,
        series.id,
        series.title,
        day.day_number,
        series.total_days
      );

      const newCompletedDays = [...new Set([...progress.completed_days, day.day_number])];
      recordDailyActivity(user?.id, 'prayer_library');
      const isSeriesComplete = newCompletedDays.length >= series.total_days;

      if (isSeriesComplete) {
        await postPrayerSeriesCompleted(
          user.id,
          profile.full_name || profile.email || 'Anonymous',
          profile.avatar_url,
          series.id,
          series.title,
          series.total_days
        );
      }
    } catch (error) {
      console.error('Error posting day completion:', error);
    }
  };

  const completePrayerInteractive = async (duration?: number, pointsCompleted?: number) => {
    console.log('✅ Completing interactive prayer');
    if (!user || !currentDay || !selectedSeries || !progress) return;

    try {
      const completionTimestamp = new Date().toISOString();
      const nextDay = currentDay.day_number + 1;
      const newCompletedDays = [...new Set([...progress.completed_days, currentDay.day_number])];
      recordDailyActivity(user?.id, 'prayer_library');
      const isSeriesComplete = newCompletedDays.length >= selectedSeries.total_days;

      const updatedTimestamps = {
        ...progress.day_completion_timestamps,
        [currentDay.day_number]: completionTimestamp
      };

      const daysObserved = calculateDaysObserved(updatedTimestamps);

      // CRITICAL FIX: Add error handling and preserve started_at
      const { data: progressUpdateData, error: progressUpdateError } = await supabase
        .from('prayer_user_progress')
        .upsert({
          user_id: user.id,
          series_id: selectedSeries.id,
          current_day: Math.min(nextDay, selectedSeries.total_days),
          completed_days: newCompletedDays,
          day_completion_timestamps: updatedTimestamps,
          last_prayed_at: completionTimestamp,
          is_completed: isSeriesComplete,
          started_at: progress.started_at || new Date().toISOString()  // IMPORTANT: Preserve started_at
        }, { 
          onConflict: 'user_id,series_id'
        })
        .select();  // IMPORTANT: Get the result to verify success

      // Check if update succeeded
      if (progressUpdateError) {
        console.error('Failed to save prayer progress:', progressUpdateError);
        toast({
          title: t('prayerSeriesViewer', 'saveFailed', 'Save Failed'),
          description: t('prayerSeriesViewer', 'progressNotSavedReason', 'Your prayer progress could not be saved: {reason}').replace('{reason}', progressUpdateError.message),
          variant: 'destructive',
          duration: 7000
        });
        // DO NOT proceed if progress save failed
        return;
      }

      // Verify update actually happened
      if (!progressUpdateData || progressUpdateData.length === 0) {
        console.error('Progress upsert returned no data');
        toast({
          title: t('prayerSeriesViewer', 'saveFailed', 'Save Failed'),
          description: t('prayerSeriesViewer', 'failedSaveProgress', 'Failed to save your progress. Please try again.'),
          variant: 'destructive',
          duration: 7000
        });
        return;
      }

      console.log('✅ Prayer progress saved successfully:', progressUpdateData[0]);

      // Log the prayer session (secondary - don't block on failure)
      const { error: sessionError } = await supabase.from('prayer_sessions').insert({
        user_id: user.id,
        prayer_id: currentDay.id,
        series_id: selectedSeries.id,
        duration_selected: SESSION_DURATIONS[sessionType].minutes * 60,
        duration_actual: duration || SESSION_DURATIONS[sessionType].minutes * 60,
        status: 'completed',
        points_completed: pointsCompleted || generatedPrayerPoints.length,
        total_points: generatedPrayerPoints.length,
        completed_at: completionTimestamp
      });

      // Session logging is secondary - log error but don't block the user
      if (sessionError) {
        console.error('Failed to log prayer session (non-critical):', sessionError);
        // Don't show toast for this - the important progress was saved
      }

      // Post community activity
      await handleDayComplete(currentDay, selectedSeries, progress);

      // ONLY update local state if database save succeeded
      const updatedProgress: UserProgress = {
        ...progress,
        current_day: Math.min(nextDay, selectedSeries.total_days),
        completed_days: newCompletedDays,
        day_completion_timestamps: updatedTimestamps,
        last_prayed_at: completionTimestamp,
        is_completed: isSeriesComplete,
        days_observed: daysObserved
      };

      setProgress(updatedProgress);

      // BONUS: Backup to localStorage for offline resilience
      try {
        const backupKey = `prayer_progress_${user.id}_${selectedSeries.id}`;
        localStorage.setItem(backupKey, JSON.stringify(updatedProgress));
      } catch (storageError) {
        console.warn('Failed to backup progress to localStorage:', storageError);
        // Not critical - don't show error to user
      }

      // Reset session state
      setIsPraying(false);
      setIsPaused(false);
      setGeneratedPrayerPoints([]);
      setCurrentPointIndex(0);

      let feedbackMessage = t('prayerSeriesViewer', 'dayCompleted', 'Day {day} completed! ').replace('{day}', String(currentDay.day_number));

      if (isSeriesComplete) {
        feedbackMessage += t('prayerSeriesViewer', 'congratsEntireSeries', 'Congratulations on completing the entire "{title}" series!').replace('{title}', selectedSeries.title);
        setShowCompletionModal(true);
      } else {
        const canUnlockNext = canUnlockDay(nextDay, updatedProgress, selectedSeries);
        if (canUnlockNext.canUnlock) {
          feedbackMessage += t('prayerSeriesViewer', 'dayNowAvailable', 'Day {day} is now available!').replace('{day}', String(nextDay));
        } else {
          feedbackMessage += t('prayerSeriesViewer', 'nextDayTomorrow', ' Next day unlocks tomorrow.');
        }
      }

      toast({
        title: t('prayerSeriesViewer', 'prayerComplete', 'Prayer Complete'),
        description: feedbackMessage,
        duration: 5000
      });

      setTimeout(() => {
        setView('series');
        setCurrentDay(null);
        setShowModeSelectionModal(false);
        setShowDurationModal(false);
      }, 2000);

    } catch (err) {
      console.error('Error completing prayer:', err);
      toast({
        title: t('prayerSeriesViewer', 'error', 'Error'),
        description: t('prayerSeriesViewer', 'errorSavingPrayerRetry', 'An error occurred while saving your prayer. Please try again.'),
        variant: 'destructive',
        duration: 7000
      });
    }
  };

  const completePrayer = async () => {
    if (!user || !currentDay || !selectedSeries || !progress) return;

    try {
      const completionTimestamp = new Date().toISOString();
      const nextDay = currentDay.day_number + 1;
      const newCompletedDays = [...new Set([...progress.completed_days, currentDay.day_number])];
      recordDailyActivity(user?.id, 'prayer_library');
      const isSeriesComplete = newCompletedDays.length >= selectedSeries.total_days;

      const updatedTimestamps = {
        ...progress.day_completion_timestamps,
        [currentDay.day_number]: completionTimestamp
      };

      const daysObserved = calculateDaysObserved(updatedTimestamps);

      // CRITICAL FIX: Add error handling and preserve started_at
      const { data: progressUpdateData, error: progressUpdateError } = await supabase
        .from('prayer_user_progress')
        .upsert({
          user_id: user.id,
          series_id: selectedSeries.id,
          current_day: Math.min(nextDay, selectedSeries.total_days),
          completed_days: newCompletedDays,
          day_completion_timestamps: updatedTimestamps,
          last_prayed_at: completionTimestamp,
          is_completed: isSeriesComplete,
          started_at: progress.started_at || new Date().toISOString()  // IMPORTANT: Preserve started_at
        }, { 
          onConflict: 'user_id,series_id'
        })
        .select();

      if (progressUpdateError) {
        console.error('Failed to save prayer progress:', progressUpdateError);
        toast({
          title: t('prayerSeriesViewer', 'saveFailed', 'Save Failed'),
          description: t('prayerSeriesViewer', 'progressNotSavedReason', 'Your prayer progress could not be saved: {reason}').replace('{reason}', progressUpdateError.message),
          variant: 'destructive',
          duration: 7000
        });
        return;
      }

      if (!progressUpdateData || progressUpdateData.length === 0) {
        console.error('Progress upsert returned no data');
        toast({
          title: t('prayerSeriesViewer', 'saveFailed', 'Save Failed'),
          description: t('prayerSeriesViewer', 'failedSaveProgress', 'Failed to save your progress. Please try again.'),
          variant: 'destructive',
          duration: 7000
        });
        return;
      }

      console.log('✅ Prayer progress saved successfully');

      // Log session (non-critical)
      const { error: sessionError } = await supabase.from('prayer_sessions').insert({
        user_id: user.id,
        prayer_id: currentDay.id,
        series_id: selectedSeries.id,
        duration_selected: selectedDuration * 60,
        duration_actual: selectedDuration * 60,
        status: 'completed',
        completed_at: completionTimestamp
      });

      if (sessionError) {
        console.error('Failed to log prayer session (non-critical):', sessionError);
      }

      await handleDayComplete(currentDay, selectedSeries, progress);

      const updatedProgress: UserProgress = {
        ...progress,
        current_day: Math.min(nextDay, selectedSeries.total_days),
        completed_days: newCompletedDays,
        day_completion_timestamps: updatedTimestamps,
        last_prayed_at: completionTimestamp,
        is_completed: isSeriesComplete,
        days_observed: daysObserved
      };

      setProgress(updatedProgress);

      // Backup to localStorage
      try {
        const backupKey = `prayer_progress_${user.id}_${selectedSeries.id}`;
        localStorage.setItem(backupKey, JSON.stringify(updatedProgress));
      } catch (storageError) {
        console.warn('Failed to backup progress to localStorage:', storageError);
      }

      setIsPraying(false);

      let feedbackMessage = t('prayerSeriesViewer', 'dayCompleted', 'Day {day} completed! ').replace('{day}', String(currentDay.day_number));
      if (isSeriesComplete) {
        feedbackMessage += t('prayerSeriesViewer', 'congratsSeries', 'Congratulations on completing "{title}"!').replace('{title}', selectedSeries.title);
        setShowCompletionModal(true);
      } else {
        const canUnlockNext = canUnlockDay(nextDay, updatedProgress, selectedSeries);
        if (canUnlockNext.canUnlock) {
          feedbackMessage += t('prayerSeriesViewer', 'dayNowAvailable', 'Day {day} is now available!').replace('{day}', String(nextDay));
        } else {
          feedbackMessage += t('prayerSeriesViewer', 'nextDayTomorrow', ' Next day unlocks tomorrow.');
        }
      }

      toast({
        title: t('prayerSeriesViewer', 'prayerComplete', 'Prayer Complete'),
        description: feedbackMessage,
        duration: 5000
      });

      setTimeout(() => {
        navigateViewMode('series');
        setCurrentDay(null);
      }, 2000);

    } catch (err) {
      console.error('Error completing prayer:', err);
      toast({
        title: t('prayerSeriesViewer', 'error', 'Error'),
        description: t('prayerSeriesViewer', 'errorSavingPrayer', 'An error occurred while saving your prayer.'),
        variant: 'destructive',
        duration: 7000
      });
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // SINGLE tap = toggle pause/resume the viewer (background music follows
  // `isPaused`). DOUBLE tap = resume. No spoken narration here.
  const togglePauseViewer = () => setIsPaused(prev => !prev);
  const resumeViewer = () => setIsPaused(false);
  const handleViewerTap = useTapGesture(togglePauseViewer, resumeViewer);

  const getDifficultyColor = (level: string) => {
    switch (level) {
      case 'beginner': return 'bg-green-100 text-green-700';
      case 'intermediate': return 'bg-yellow-100 text-yellow-700';
      case 'advanced': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getProgressPercentage = () => {
    if (!progress || !selectedSeries) return 0;
    return (progress.completed_days.length / selectedSeries.total_days) * 100;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  // Interactive Prayer Session View with Audio Controls
  if (view === 'interactive' && currentDay && selectedSeries) {
    console.log('🎬 Rendering InteractivePrayerSession');
    
    if (!generatedPrayerPoints || generatedPrayerPoints.length === 0) {
      console.error('❌ CRITICAL ERROR: Attempting to render with no prayer points!');
      toast({
        title: t('prayerSeriesViewer', 'contentError', 'Content Error'),
        description: t('prayerSeriesViewer', 'contentMissingReturning', 'Prayer content is missing. Returning to series view.'),
        variant: 'destructive'
      });
      navigateViewMode('series');
      return null;
    }
    
    return (
      <>
        <audio
          ref={audioRef}
          src={getMusicUrl()}
          loop
          preload="auto"
        />
        
        <InteractivePrayerSession
          title={`${selectedSeries.title} - Day ${currentDay.day_number}: ${currentDay.title}`}
          prayerPoints={generatedPrayerPoints}
          sessionType={sessionType}
          instrumentalId={selectedMusicId || (currentDay.audio_url ? undefined : "1")}
          onComplete={(duration, pointsCompleted) => {
            console.log('🎉 Interactive session completed');
            completePrayerInteractive(duration, pointsCompleted);
          }}
          onClose={handleCloseInteractive}
          audioControls={{
            volume,
            isMuted,
            onVolumeChange: handleVolumeChange,
            onToggleMute: toggleMute
          }}
        />
      </>
    );
  }

  // 🔥 ENHANCED: Traditional Prayer Session View with HIGHLY VISIBLE Audio Controls
  if (view === 'praying' && currentDay && selectedSeries && generatedPrayerPoints.length > 0) {
    const currentPoint = generatedPrayerPoints[currentPointIndex];
    const totalPoints = generatedPrayerPoints.length;

    return (
      <div {...swipeHandlers} onClick={handleViewerTap} className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-purple-800 text-white p-4 sm:p-6 overflow-x-hidden">
        {/* Background Audio */}
        <audio
          ref={audioRef}
          src={getMusicUrl()}
          loop
          preload="auto"
        />

        {/* First-run gesture onboarding tip (once per user). */}
        <ViewerGestureTip show={gestureTip.show} onDismiss={gestureTip.dismiss} />

        {/* Paused hint — single tap to resume */}
        <div className={`pointer-events-none fixed inset-0 z-40 flex items-center justify-center transition-opacity duration-200 ${isPaused ? 'opacity-100' : 'opacity-0'}`}>
          <div className={`flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-sm transition-transform duration-200 ${isPaused ? 'scale-100' : 'scale-95'}`}>
            <Pause className="h-4 w-4" />
            {t('viewers', 'pausedTapResume', 'Paused — tap to resume')}
          </div>
        </div>
        
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <Button 
              variant="ghost" 
              className="text-white hover:bg-white/10"
              onClick={handleClosePraying}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('prayerSeriesViewer', 'exit', 'Exit')}
            </Button>

            <Badge className="bg-white/20 text-white">
              {t('prayerSeriesViewer', 'dayXofY', 'Day {day} of {total}').replace('{day}', String(currentDay.day_number)).replace('{total}', String(selectedSeries.total_days))}
            </Badge>
          </div>

          {/* Timer Circle */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative w-48 h-48 mb-6">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="96"
                  cy="96"
                  r="88"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="8"
                  fill="none"
                />
                <circle
                  cx="96"
                  cy="96"
                  r="88"
                  stroke="white"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 88}`}
                  strokeDashoffset={`${2 * Math.PI * 88 * (1 - timeRemaining / (currentPoint?.duration || 60))}`}
                  className="transition-all duration-1000 ease-linear"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-4xl font-bold">{formatTime(timeRemaining)}</div>
                <div className="text-sm opacity-70">{currentPointIndex + 1} of {totalPoints}</div>
              </div>
            </div>

            {/* Audio Controls - Testing without pause button */}
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 mb-6">
              {/* Volume Down Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  console.log('🔉 Volume Down clicked - Current:', volume);
                  handleVolumeChange(Math.max(0, volume - 0.1));
                }}
                className="text-white hover:bg-white/20 bg-blue-600"
                title={t('prayerSeriesViewer', 'decreaseVolume', 'Decrease volume ({percent}%)').replace('{percent}', String(Math.round(volume * 100)))}
              >
                <Volume1 className="h-5 w-5" />
              </Button>

              {/* Volume Up Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  console.log('🔊 Volume Up clicked - Current:', volume);
                  handleVolumeChange(Math.min(1, volume + 0.1));
                }}
                className="text-white hover:bg-white/20 bg-blue-600"
                title={t('prayerSeriesViewer', 'increaseVolume', 'Increase volume ({percent}%)').replace('{percent}', String(Math.round(volume * 100)))}
              >
                <Volume2 className="h-5 w-5" />
              </Button>

              {/* Mute/Unmute Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  console.log('🔇 Mute toggled - Was:', isMuted);
                  toggleMute();
                }}
                className={`text-white hover:bg-white/20 ${isMuted ? 'bg-red-600' : 'bg-green-600'}`}
                title={isMuted ? t('prayerSeriesViewer', 'unmute', 'Unmute') : t('prayerSeriesViewer', 'mute', 'Mute')}
              >
                <VolumeX className="h-5 w-5" />
              </Button>

              {/* Restart Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  console.log('🔄 Reset clicked');
                  setCurrentPointIndex(0);
                  setTimeRemaining(generatedPrayerPoints[0]?.duration || 60);
                }}
                className="text-white hover:bg-white/20 bg-orange-600"
                title={t('prayerSeriesViewer', 'restartPrayer', 'Restart prayer')}
              >
                <RotateCcw className="h-5 w-5" />
              </Button>
              
              {/* Volume Indicator */}
              <div className="ml-4 text-lg font-bold text-white bg-black/40 px-4 py-2 rounded">
                {isMuted ? t('prayerSeriesViewer', 'mutedIndicator', '🔇 MUTED') : `🔊 ${Math.round(volume * 100)}%`}
              </div>
            </div>
          </div>

          {/* Current Prayer Point */}
          {currentPoint && (
            <Card className="bg-white/10 backdrop-blur-sm border-white/20">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-2xl font-bold text-white">{currentPoint.title}</h3>
                  <button
                    onClick={() => { setSharePointIndex(currentPointIndex); setShowPointShareModal(true); }}
                    className="ml-3 flex-shrink-0 flex items-center gap-1 text-xs text-white/60 hover:text-white/90 transition-colors mt-1"
                    title={t('prayerSeriesViewer', 'shareThisPoint', 'Share this prayer point')}
                  >
                    <Share2 className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-lg mb-4 leading-relaxed text-white/90">{currentPoint.content}</p>
                
                {currentPoint.scripture && (
                  <div className="bg-white/10 rounded-lg p-4 mb-4">
                    <p className="font-medium text-amber-200 mb-2">{currentPoint.scripture}</p>
                    {currentPoint.scriptureText && (
                      <p className="italic text-white/90">"{currentPoint.scriptureText}"</p>
                    )}
                  </div>
                )}
                
                {currentPoint.reflection && (
                  <div className="bg-orange-500/20 rounded-lg p-4">
                    <p className="text-sm font-medium mb-1 text-orange-200">{t('prayerSeriesViewer', 'reflection', 'Reflection')}</p>
                    <p className="italic opacity-90 text-white/80">{currentPoint.reflection}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Prayer Point Share Modal */}
          {showPointShareModal && sharePointIndex !== null && selectedSeries && currentDay && (() => {
            const point = generatedPrayerPoints[sharePointIndex];
            if (!point) return null;
            const seriesUrl = `${window.location.origin}/prayer-series/${selectedSeries.id}`;
            const shareMessage = [
              `🙏 ${point.title}`,
              '',
              point.content,
              point.scripture ? `\n📖 ${point.scripture}${point.scriptureText ? `\n"${point.scriptureText}"` : ''}` : '',
              '',
              t('prayerSeriesViewer', 'fromDayOfSeries', 'From Day {day} of "{title}" on ReKindle BC').replace('{day}', String(currentDay.day_number)).replace('{title}', selectedSeries.title),
              seriesUrl
            ].filter(l => l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim();

            const encodedMsg = encodeURIComponent(shareMessage);
            const encodedUrl = encodeURIComponent(seriesUrl);

            return (
              <Dialog open={showPointShareModal} onOpenChange={setShowPointShareModal}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Share2 className="h-5 w-5 text-purple-500" />
                      {t('prayerSeriesViewer', 'sharePrayerPoint', 'Share prayer point')}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 whitespace-pre-wrap max-h-40 overflow-y-auto border">
                      {shareMessage}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <a href={`https://wa.me/?text=${encodedMsg}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors text-sm font-medium"
                        onClick={() => setShowPointShareModal(false)}>
                        <Send className="h-4 w-4" />
                        WhatsApp
                      </a>
                      <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedMsg}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                        onClick={() => setShowPointShareModal(false)}>
                        <span className="font-bold">f</span>
                        Facebook
                      </a>
                      <a href={`https://twitter.com/intent/tweet?text=${encodedMsg}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-black hover:bg-gray-800 text-white rounded-lg transition-colors text-sm font-medium"
                        onClick={() => setShowPointShareModal(false)}>
                        <span className="font-bold">𝕏</span>
                        Twitter / X
                      </a>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(shareMessage);
                          toast({ title: t('prayerSeriesViewer', 'copied', 'Copied!'), description: t('prayerSeriesViewer', 'pointCopied', 'Prayer point copied to clipboard') });
                          setShowPointShareModal(false);
                        }}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors text-sm font-medium"
                      >
                        <Copy className="h-4 w-4" />
                        {t('prayerSeriesViewer', 'copyMessage', 'Copy Message')}
                      </button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            );
          })()}

          {/* Skip Button */}
          {currentPointIndex < totalPoints - 1 && (
            <Button
              variant="outline"
              className="w-full mt-4 bg-white/10 border-white/20 hover:bg-white/20 text-white"
              onClick={() => {
                const nextIndex = currentPointIndex + 1;
                // Prayer library is free and unlimited for all users
                setCurrentPointIndex(nextIndex);
                setTimeRemaining(generatedPrayerPoints[nextIndex]?.duration || 60);
              }}
            >
              {t('prayerSeriesViewer', 'nextPrayerPoint', 'Next Prayer Point')}
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      <UpgradePromptModal
        prompt={activePrompt}
        onClose={dismissUpgradePrompt}
        onUpgrade={() => {}}
      />
      </div>
    );
  }

  // Series View
  if (view === 'series' && selectedSeries) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button variant="ghost" onClick={() => { navigateViewMode('list'); setSelectedSeries(null); }}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('prayerSeriesViewer', 'back', 'Back')}
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            {selectedSeries.cover_image_url && (
              <img 
                src={selectedSeries.cover_image_url} 
                alt={selectedSeries.title}
                className="w-full h-48 object-cover rounded-lg mb-4"
              />
            )}
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-2xl mb-2">{selectedSeries.title}</CardTitle>
                {selectedSeries.subtitle && (
                  <p className="text-lg text-gray-600 mb-2">{selectedSeries.subtitle}</p>
                )}
                <p className="text-gray-600 mb-4">{selectedSeries.description}</p>
                
                {/* Series Scriptures */}
                {((selectedSeries.scripture_reference || selectedSeries.scripture_text) || 
                  (selectedSeries.scriptures && selectedSeries.scriptures.length > 0)) && (
                  <div className="mb-4 space-y-3">
                    {/* Main Scripture */}
                    {(selectedSeries.scripture_reference || selectedSeries.scripture_text) && (
                      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-3 rounded-lg border border-indigo-200">
                        <div className="flex items-center gap-2 mb-1">
                          <BookOpen className="h-4 w-4 text-indigo-600" />
                          <p className="text-sm font-semibold text-indigo-900">{t('prayerSeriesViewer', 'scriptureFoundation', 'Scripture Foundation')}</p>
                        </div>
                        {selectedSeries.scripture_reference && (
                          <p className="text-xs font-medium text-indigo-700 mb-1">
                            {selectedSeries.scripture_reference}
                          </p>
                        )}
                        {selectedSeries.scripture_text && (
                          <p className="text-sm text-gray-700 italic border-l-2 border-indigo-400 pl-2">
                            "{selectedSeries.scripture_text}"
                          </p>
                        )}
                      </div>
                    )}
                    
                    {/* Additional Scriptures */}
                    {selectedSeries.scriptures && selectedSeries.scriptures.map((scripture, idx) => (
                      <div key={idx} className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                        <div className="flex items-center gap-2 mb-1">
                          <BookOpen className="h-4 w-4 text-blue-600" />
                          {scripture.reference && (
                            <p className="text-xs font-medium text-blue-700">
                              {scripture.reference}
                            </p>
                          )}
                        </div>
                        {scripture.text && (
                          <p className="text-sm text-gray-700 italic border-l-2 border-blue-400 pl-2">
                            "{scripture.text}"
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Badge variant="outline">
                    <Calendar className="h-3 w-3 mr-1" />
                    {t('prayerSeriesViewer', 'nDays', '{n} Days').replace('{n}', String(selectedSeries.total_days))}
                  </Badge>
                  <Badge className={getDifficultyColor(selectedSeries.difficulty_level)}>
                    {selectedSeries.difficulty_level}
                  </Badge>
                </div>
              </div>
            </div>
          </CardHeader>

          {progress && progress.completed_days.length > 0 && (
            <CardContent>
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span>{t('prayerSeriesViewer', 'progress', 'Progress')}</span>
                  <span>{Math.round(getProgressPercentage())}%</span>
                </div>
                <Progress value={getProgressPercentage()} className="h-2" />
                <div className="flex justify-between text-sm text-gray-500 mt-2">
                  <span>{t('prayerSeriesViewer', 'daysCompletedOfTotal', '{completed} of {total} days completed').replace('{completed}', String(progress.completed_days.length)).replace('{total}', String(selectedSeries.total_days))}</span>
                  <span className="text-indigo-600 font-medium">{t('prayerSeriesViewer', 'daysObserved', '{n} {unit} observed').replace('{n}', String(progress.days_observed)).replace('{unit}', progress.days_observed === 1 ? t('prayerSeriesViewer', 'dayUnit', 'day') : t('prayerSeriesViewer', 'daysUnit', 'days'))}</span>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        <div>
          <h3 className="text-xl font-semibold mb-4">{t('prayerSeriesViewer', 'prayerDays', 'Prayer Days')}</h3>
          <div className="grid gap-4">
            {days.map(day => {
              const isCompleted = progress?.completed_days.includes(day.day_number);
              const unlockCheck = canUnlockDay(day.day_number, progress, selectedSeries);
              const isUnlocked = unlockCheck.canUnlock;
              const isCurrent = progress?.current_day === day.day_number;

              return (
                <Card 
                  key={day.id}
                  className={`transition-all ${isCompleted ? 'bg-green-50 border-green-200' : ''} ${isCurrent ? 'ring-2 ring-indigo-400' : ''} ${!isUnlocked ? 'opacity-60' : ''}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant={isCompleted ? 'default' : 'outline'} className="bg-indigo-100 text-indigo-700">
                            {t('prayerSeriesViewer', 'dayN', 'Day {n}').replace('{n}', String(day.day_number))}
                          </Badge>
                          {isCompleted && <CheckCircle className="h-4 w-4 text-green-600" />}
                          {isCurrent && !isCompleted && <Star className="h-4 w-4 text-amber-500" />}
                          {!isUnlocked && <Lock className="h-4 w-4 text-gray-400" />}
                        </div>
                        <h4 className="font-semibold mb-1">{day.title}</h4>
                        {day.prayer_focus && (
                          <p className="text-sm text-gray-600 mb-1">{day.prayer_focus}</p>
                        )}
                        {day.scripture_reference && (
                          <p className="text-xs text-amber-600 flex items-center gap-1">
                            <BookOpen className="h-3 w-3" />
                            {day.scripture_reference}
                          </p>
                        )}
                        {!isUnlocked && unlockCheck.reason && (
                          <p className="text-xs text-gray-500 mt-1 italic">
                            {unlockCheck.reason}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        {isCompleted ? (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => continueDay(day.day_number)}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            {t('prayerSeriesViewer', 'prayAgain', 'Pray Again')}
                          </Button>
                        ) : isUnlocked ? (
                          <Button 
                            size="sm"
                            onClick={() => continueDay(day.day_number)}
                            className="bg-indigo-600 hover:bg-indigo-700"
                          >
                            <Play className="h-4 w-4 mr-1" />
                            {isCurrent ? t('prayerSeriesViewer', 'continue', 'Continue') : t('prayerSeriesViewer', 'start', 'Start')}
                          </Button>
                        ) : (
                          <Button size="sm" disabled variant="outline">
                            <Lock className="h-4 w-4 mr-1" />
                            {t('prayerSeriesViewer', 'locked', 'Locked')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {!progress && (
          <Card className="border-indigo-200 bg-indigo-50">
            <CardContent className="p-6 text-center">
              <Flame className="h-12 w-12 mx-auto text-indigo-600 mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('prayerSeriesViewer', 'readyToBegin', 'Ready to Begin?')}</h3>
              <p className="text-gray-600 mb-4">
                {t('prayerSeriesViewer', 'startNDayJourney', 'Start this {n}-day prayer journey today').replace('{n}', String(selectedSeries.total_days))}
              </p>
              <Button onClick={startSeries} size="lg" className="bg-indigo-600 hover:bg-indigo-700">
                <Play className="h-5 w-5 mr-2" />
                {t('prayerSeriesViewer', 'startSeries', 'Start Series')}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Music Selection Modal */}
        <Dialog open={showMusicSelector} onOpenChange={setShowMusicSelector}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Music className="h-5 w-5 text-purple-600" />
                {t('prayerSeriesViewer', 'selectBackgroundMusic', 'Select Background Music')}
              </DialogTitle>
              <DialogDescription>
                {t('prayerSeriesViewer', 'chooseInstrumental', 'Choose instrumental music to accompany your prayer session')}
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
                {t('prayerSeriesViewer', 'cancel', 'Cancel')}
              </Button>
              <Button onClick={proceedToModeSelection} className="bg-purple-600 hover:bg-purple-700">
                {t('prayerSeriesViewer', 'continue', 'Continue')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Mode Selection Modal */}
        <Dialog open={showModeSelectionModal} onOpenChange={(open) => {
          setShowModeSelectionModal(open);
          if (!open) {
            setCurrentDay(null);
            setGeneratedPrayerPoints([]);
            setSessionType('standard');
            if (view !== 'interactive' && view !== 'praying') {
              navigateViewMode('series');
            }
          }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-center text-xl">{t('prayerSeriesViewer', 'choosePrayerExperience', 'Choose Your Prayer Experience')}</DialogTitle>
            </DialogHeader>
            
            {currentDay && (
              <div className="text-center mb-4">
                <h3 className="font-semibold text-lg">{currentDay.title}</h3>
                {currentDay.prayer_focus && (
                  <p className="text-sm text-indigo-600">{currentDay.prayer_focus}</p>
                )}
                {currentDay.scripture_reference && (
                  <p className="text-sm text-amber-600">{currentDay.scripture_reference}</p>
                )}
                <p className="text-xs text-gray-500 mt-2">
                  {(generatedPrayerPoints.length === 1
                    ? t('prayerSeriesViewer', 'onePointPrepared', '{n} prayer point prepared')
                    : t('prayerSeriesViewer', 'manyPointsPrepared', '{n} prayer points prepared')
                  ).replace('{n}', String(generatedPrayerPoints.length))}
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div className="text-sm font-medium mb-2">{t('prayerSeriesViewer', 'interactiveSlideMode', 'Interactive Slide Mode:')}</div>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  onClick={() => openInteractiveMode('quick')}
                  className="h-auto py-4 flex flex-col items-center gap-1 bg-indigo-600 hover:bg-indigo-700"
                >
                  <Presentation className="h-6 w-6" />
                  <span className="text-xs font-bold">{t('prayerSeriesViewer', 'quick', 'Quick')}</span>
                  <span className="text-xs opacity-80">{SESSION_DURATIONS.quick.label}</span>
                </Button>
                <Button
                  onClick={() => openInteractiveMode('standard')}
                  className="h-auto py-4 flex flex-col items-center gap-1 bg-indigo-600 hover:bg-indigo-700"
                >
                  <Presentation className="h-6 w-6" />
                  <span className="text-xs font-bold">{t('prayerSeriesViewer', 'standard', 'Standard')}</span>
                  <span className="text-xs opacity-80">{SESSION_DURATIONS.standard.label}</span>
                </Button>
                <Button
                  onClick={() => openInteractiveMode('deep')}
                  className="h-auto py-4 flex flex-col items-center gap-1 bg-indigo-600 hover:bg-indigo-700"
                >
                  <Presentation className="h-6 w-6" />
                  <span className="text-xs font-bold">{t('prayerSeriesViewer', 'deep', 'Deep')}</span>
                  <span className="text-xs opacity-80">{SESSION_DURATIONS.deep.label}</span>
                </Button>
              </div>

              <div className="text-center text-xs text-gray-500 my-2">{t('prayerSeriesViewer', 'or', 'or')}</div>

              <Button
                onClick={openTraditionalMode}
                variant="outline"
                className="w-full h-auto py-4 flex flex-col items-center gap-2"
              >
                <Timer className="h-6 w-6" />
                <div>
                  <div className="font-bold">{t('prayerSeriesViewer', 'traditionalTimerMode', 'Traditional Timer Mode')}</div>
                  <div className="text-xs opacity-70">{t('prayerSeriesViewer', 'customDurationTimer', 'Custom duration with timer')}</div>
                </div>
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Duration Modal */}
        <Dialog open={showDurationModal} onOpenChange={(open) => {
          setShowDurationModal(open);
          if (!open) {
            setCurrentDay(null);
            setGeneratedPrayerPoints([]);
            setIsPraying(false);
            setIsPaused(false);
            setTimeRemaining(0);
            setCurrentPointIndex(0);
            if (view !== 'praying') {
              navigateViewMode('series');
            }
          }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-center">{t('prayerSeriesViewer', 'choosePrayerDuration', 'Choose Prayer Duration')}</DialogTitle>
            </DialogHeader>
            
            {currentDay && (
              <div className="text-center mb-4">
                <h3 className="font-semibold text-lg">{currentDay.title}</h3>
                {currentDay.prayer_focus && (
                  <p className="text-sm text-indigo-600">{currentDay.prayer_focus}</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {DURATION_OPTIONS.map(option => (
                <Button
                  key={option.value}
                  variant={selectedDuration === option.value ? 'default' : 'outline'}
                  className={`h-auto py-4 flex flex-col ${
                    selectedDuration === option.value ? 'bg-indigo-600' : ''
                  }`}
                  onClick={() => setSelectedDuration(option.value)}
                >
                  <span className="text-lg font-bold">{option.label}</span>
                  <span className="text-xs opacity-80">{option.description}</span>
                </Button>
              ))}
            </div>

            <DialogFooter>
              <Button className="w-full" onClick={startPraying}>
                <Flame className="h-4 w-4 mr-2" />
                {t('prayerSeriesViewer', 'startPraying', 'Start Praying')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Scripture Preview Modal */}
        <Dialog open={showScripturePreview} onOpenChange={setShowScripturePreview}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-indigo-900">
                {currentDay?.title}
              </DialogTitle>
              <DialogDescription className="text-base">
                {t('prayerSeriesViewer', 'dayNPrepareHeart', 'Day {n} • Prepare your heart for prayer').replace('{n}', String(currentDay?.day_number))}
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto space-y-6 py-4">
              {/* Prayer Focus */}
              {currentDay?.prayer_focus && (
                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                  <h3 className="font-semibold text-indigo-900 mb-2 flex items-center gap-2">
                    <Flame className="h-5 w-5" />
                    {t('prayerSeriesViewer', 'prayerFocus', 'Prayer Focus')}
                  </h3>
                  <p className="text-gray-700 leading-relaxed">
                    {currentDay.prayer_focus}
                  </p>
                </div>
              )}

              {/* Prayer Text/Introduction */}
              {currentDay?.prayer_text && (
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                  <h3 className="font-semibold text-purple-900 mb-2 flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    {t('prayerSeriesViewer', 'introduction', 'Introduction')}
                  </h3>
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {currentDay.prayer_text}
                  </p>
                </div>
              )}

              {/* Main Scripture Reference */}
              {(currentDay?.scripture_reference || currentDay?.scripture_text) && (
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-lg border border-indigo-200">
                  <h3 className="font-semibold text-indigo-900 mb-2 flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Scripture Foundation
                  </h3>
                  {currentDay.scripture_reference && (
                    <p className="text-sm font-medium text-indigo-700 mb-2">
                      {currentDay.scripture_reference}
                    </p>
                  )}
                  {currentDay.scripture_text && (
                    <p className="text-gray-700 leading-relaxed italic border-l-4 border-indigo-400 pl-4">
                      "{currentDay.scripture_text}"
                    </p>
                  )}
                </div>
              )}

              {/* Additional Scripture References */}
              {currentDay?.scriptures && currentDay.scriptures.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-blue-600" />
                    {t('prayerSeriesViewer', 'additionalScriptures', 'Additional Scriptures')}
                  </h3>
                  {currentDay.scriptures.map((scripture: any, idx: number) => (
                    <div 
                      key={idx} 
                      className="bg-blue-50 p-4 rounded-lg border border-blue-200"
                    >
                      {scripture.reference && (
                        <p className="text-sm font-medium text-blue-700 mb-2">
                          {scripture.reference}
                        </p>
                      )}
                      {scripture.text && (
                        <p className="text-gray-700 leading-relaxed italic border-l-4 border-blue-400 pl-4">
                          "{scripture.text}"
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Prayer Duration Info */}
              <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-amber-600" />
                  <div>
                    <p className="font-semibold text-amber-900">{t('prayerSeriesViewer', 'prayerDuration', 'Prayer Duration')}</p>
                    <p className="text-sm text-amber-700">
                      {t('prayerSeriesViewer', 'nMinutesFocused', '{n} minutes of focused prayer time').replace('{n}', String(selectedDuration))}
                    </p>
                  </div>
                </div>
              </div>

              {/* Prayer Points Preview */}
              {generatedPrayerPoints.length > 0 && (
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <h3 className="font-semibold text-green-900 mb-2">
                    {t('prayerSeriesViewer', 'prayerPointsCount', 'Prayer Points ({n})').replace('{n}', String(generatedPrayerPoints.length))}
                  </h3>
                  <p className="text-sm text-green-700">
                    {t('prayerSeriesViewer', 'includesGuidedPoints', 'This prayer includes {n} guided prayer points to help you focus your prayers.').replace('{n}', String(generatedPrayerPoints.length))}
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="border-t pt-4">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowScripturePreview(false);
                  setShowMusicSelector(true);
                }}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                {t('prayerSeriesViewer', 'back', 'Back')}
              </Button>
              <Button 
                onClick={() => {
                  setShowScripturePreview(false);
                  openInteractiveMode('standard');
                }}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
              >
                <Flame className="h-4 w-4 mr-2" />
                {t('prayerSeriesViewer', 'beginPrayer', 'Begin Prayer')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Completion Modal */}
        <Dialog open={showCompletionModal} onOpenChange={setShowCompletionModal}>
          <DialogContent className="text-center">
            <DialogHeader>
              <DialogTitle className="text-2xl">{t('prayerSeriesViewer', 'praiseGod', 'Praise God!')}</DialogTitle>
            </DialogHeader>
            <div className="py-6">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Award className="h-10 w-10 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{t('prayerSeriesViewer', 'seriesComplete', 'Series Complete!')}</h3>
              <p className="text-gray-600 mb-4">
                {t('prayerSeriesViewer', 'completedAllDays', 'You\'ve completed all {n} days of "{title}"').replace('{n}', String(selectedSeries.total_days)).replace('{title}', selectedSeries.title)}
              </p>
              {(() => {
                const seriesUrl = `${window.location.origin}/prayer-series/${selectedSeries.id}`;
                const completionMsg = t('prayerSeriesViewer', 'completionShareMsg', '🙏 I just completed all {n} days of the "{title}" prayer series on ReKindle BC!\n\n{url}').replace('{n}', String(selectedSeries.total_days)).replace('{title}', selectedSeries.title).replace('{url}', seriesUrl);
                const encodedMsg = encodeURIComponent(completionMsg);
                const encodedUrl = encodeURIComponent(seriesUrl);
                return (
                  <div className="mb-5 space-y-2">
                    <p className="text-sm font-medium text-gray-600">{t('prayerSeriesViewer', 'shareAchievement', 'Share your achievement:')}</p>
                    <div className="flex justify-center gap-2">
                      <a href={`https://wa.me/?text=${encodedMsg}`} target="_blank" rel="noopener noreferrer"
                        className="w-10 h-10 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors" title={t('prayerSeriesViewer', 'shareOnWhatsApp', 'Share on WhatsApp')}>
                        <Send className="h-4 w-4" />
                      </a>
                      <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedMsg}`} target="_blank" rel="noopener noreferrer"
                        className="w-10 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center transition-colors font-bold text-sm" title={t('prayerSeriesViewer', 'shareOnFacebook', 'Share on Facebook')}>
                        f
                      </a>
                      <a href={`https://twitter.com/intent/tweet?text=${encodedMsg}`} target="_blank" rel="noopener noreferrer"
                        className="w-10 h-10 bg-black hover:bg-gray-800 text-white rounded-full flex items-center justify-center transition-colors font-bold text-sm" title={t('prayerSeriesViewer', 'shareOnX', 'Share on X')}>
                        𝕏
                      </a>
                      <button
                        onClick={() => { navigator.clipboard.writeText(completionMsg); toast({ title: t('prayerSeriesViewer', 'copied', 'Copied!'), description: t('prayerSeriesViewer', 'shareMsgCopied', 'Share message copied to clipboard') }); }}
                        className="w-10 h-10 bg-purple-500 hover:bg-purple-600 text-white rounded-full flex items-center justify-center transition-colors" title={t('prayerSeriesViewer', 'copyToClipboard', 'Copy to clipboard')}>
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })()}
              <Button onClick={() => { setShowCompletionModal(false); navigateViewMode('series'); }}>
                {t('prayerSeriesViewer', 'viewSeries', 'View Series')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // List View
  return (
    <div className="space-y-8">
      {allSeries.filter(s => s.is_featured).length > 0 && (
        <div>
          <h3 className="text-xl font-semibold mb-4">{t('prayerSeriesViewer', 'featuredSeries', 'Featured Series')}</h3>
          <div className="grid md:grid-cols-2 gap-6">
            {allSeries.filter(s => s.is_featured).map(series => (
              <Card 
                key={series.id} 
                className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => loadSeries(series.id)}
              >
                {series.cover_image_url ? (
                  <div className="h-48 bg-gradient-to-br from-indigo-500 to-purple-500">
                    <img src={series.cover_image_url} alt={series.title} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="h-48 bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                    <Flame className="h-16 w-16 text-white/50" />
                  </div>
                )}
                <CardContent className="p-6">
                  <h3 className="font-bold text-xl mb-2">{series.title}</h3>
                  {series.subtitle && (
                    <p className="text-sm text-indigo-600 mb-2">{series.subtitle}</p>
                  )}
                  <p className="text-gray-600 line-clamp-2 mb-4">{series.description}</p>
                  <div className="flex gap-2">
                    <Badge variant="outline">
                      <Calendar className="h-3 w-3 mr-1" />
                      {t('prayerSeriesViewer', 'nDays', '{n} Days').replace('{n}', String(series.total_days))}
                    </Badge>
                    <Badge className={getDifficultyColor(series.difficulty_level)}>
                      {series.difficulty_level}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-xl font-semibold mb-4">{t('prayerSeriesViewer', 'allPrayerSeries', 'All Prayer Series')}</h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allSeries.filter(s => !s.is_featured).map(series => (
            <Card 
              key={series.id} 
              className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => loadSeries(series.id)}
            >
              {series.cover_image_url ? (
                <div className="h-32 bg-gradient-to-br from-indigo-500 to-purple-500">
                  <img src={series.cover_image_url} alt={series.title} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="h-32 bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                  <Flame className="h-10 w-10 text-white/50" />
                </div>
              )}
              <CardContent className="p-4">
                <h3 className="font-semibold text-lg mb-1">{series.title}</h3>
                <p className="text-sm text-gray-600 line-clamp-2 mb-3">{series.description}</p>
                <div className="flex gap-2">
                  <Badge variant="outline">
                    <Calendar className="h-3 w-3 mr-1" />
                    {series.total_days} Days
                  </Badge>
                  <Badge className={getDifficultyColor(series.difficulty_level)}>
                    {series.difficulty_level}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {allSeries.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Flame className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('prayerSeriesViewer', 'noSeriesAvailable', 'No Prayer Series Available')}</h3>
            <p className="text-gray-500">{t('prayerSeriesViewer', 'checkBackSoon', 'Check back soon for new prayer series')}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
export default PrayerSeriesViewer;