import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { supabase } from '@/lib/supabase';
import { cachedRead } from '@/lib/offlineContentCache';
import { consumeDeepLink } from '@/lib/deepLink';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUserEntitlements } from '@/hooks/useUserEntitlements';
import { useLocalizedScripture, useLocalizedScriptures } from '@/hooks/useLocalizedScripture';
import { toast } from './ui/use-toast';
import { 
  postPrayerSeriesStarted,
  postPrayerSeriesCompleted,
  postPrayerSeriesDayCompleted,
  postPrayerWatchJoined,
  postPrayerWatchCompleted,
  postPrayerTopicCompleted
} from '@/lib/communityActivityService';
import PrayerSeriesViewer from './PrayerSeriesViewer';
import { InteractivePrayerSession } from './InteractivePrayerSession';
import { PrayerPoint } from '@/types/prayerTypes';
import { instrumentalTracks } from '@/data/instrumentals';
import { 
  BookOpen, Search, Star, Share2, CheckCircle, 
  PlayCircle, Clock, Bookmark, BookmarkCheck,
  ChevronRight, Calendar, Users, Loader2, Heart,
  RefreshCw, Shield, Flame, Send,
  Timer, Compass, Flag, Stethoscope, Bell, BellOff, ArrowLeft,
  Copy, Check, Lock, Crown, Music, Link
} from 'lucide-react';
import { SearchFilterPanel, searchFilterIconClass, searchFilterInputClass } from './SearchFilterPanel';

const buildShareLinks = (title: string, url: string) => {
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  return {
    whatsapp: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    x: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`
  };
};

// Share Button Component
interface ShareButtonProps {
  title: string;
  url: string;
  variant?: 'icon' | 'full';
}

const ShareButton: React.FC<ShareButtonProps> = ({ title, url, variant = 'icon' }) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const shareLinks = buildShareLinks(title, url);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast({
      title: t('prayers', 'linkCopied', 'Link Copied!'),
      description: t('prayers', 'linkCopiedDesc', 'Share link copied to clipboard')
    });
    setTimeout(() => setCopied(false), 2000);
  };

  // Rendered via Radix DropdownMenu so the menu portals to <body> and is never
  // clipped by a card's `overflow-hidden` (which made the old menu unclickable).
  const menuItems = (
    <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
      <DropdownMenuItem asChild>
        <a href={shareLinks.whatsapp} target="_blank" rel="noopener noreferrer" className="cursor-pointer gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500"><Send className="h-4 w-4 text-white" /></span>
          WhatsApp
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <a href={shareLinks.facebook} target="_blank" rel="noopener noreferrer" className="cursor-pointer gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">f</span>
          Facebook
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <a href={shareLinks.x} target="_blank" rel="noopener noreferrer" className="cursor-pointer gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-sm font-bold text-white">𝕏</span>
          X (Twitter)
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-500">
          {copied ? <Check className="h-4 w-4 text-white" /> : <Copy className="h-4 w-4 text-white" />}
        </span>
        {copied ? 'Copied!' : 'Copy Link'}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  if (variant === 'icon') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            title="Share"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="hover:bg-purple-50 hover:border-purple-300 transition-colors"
          >
            <Share2 className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        {menuItems}
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="hover:bg-purple-50 hover:border-purple-300 transition-colors"
        >
          <Share2 className="h-4 w-4 mr-2" />
          Share
        </Button>
      </DropdownMenuTrigger>
      {menuItems}
    </DropdownMenu>
  );
};


interface PrayerCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  display_order: number;
  is_active: boolean;
}

interface PrayerTopic {
  id: string;
  title: string;
  description: string;
  author?: string;
  author_social_url?: string;
  prayer_points: PrayerPoint[];
  scripture_reference?: string;
  scripture_text?: string;
  scriptures?: { reference: string; text: string; }[];
  cover_image_url?: string;
  is_featured: boolean;
  is_published: boolean;
}

interface PrayerSeries {
  id: string;
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
  is_published: boolean;
  progress?: number;
  is_bookmarked?: boolean;
}

interface PrayerWatchEntry {
  id: string;
  title: string;
  content: string;
  author?: string;
  author_social_url?: string;
  scripture_reference?: string;
  scripture_text?: string;
  scriptures?: { reference: string; text: string; }[];
  prayer_points: PrayerPoint[];
  duration_minutes: number;
  is_prayer_watch: boolean;
  prayer_watch_time?: string;
  prayer_watch_topic?: string;
  is_active: boolean;
}

interface PrayerWatchTopic {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  is_active: boolean;
}

interface UserProgress {
  current_day: number;
  completed_days: number[];
  is_completed: boolean;
}

const DURATION_OPTIONS = [
  { value: 5, label: '5 min', description: 'Quick prayer' },
  { value: 10, label: '10 min', description: 'Short session' },
  { value: 15, label: '15 min', description: 'Standard session' },
  { value: 30, label: '30 min', description: 'Deep prayer' },
];

const ICON_MAP: Record<string, React.ReactNode> = {
  Heart: <Heart className="h-5 w-5" />,
  Shield: <Shield className="h-5 w-5" />,
  Stethoscope: <Stethoscope className="h-5 w-5" />,
  Users: <Users className="h-5 w-5" />,
  Flag: <Flag className="h-5 w-5" />,
  Compass: <Compass className="h-5 w-5" />,
  ShieldCheck: <Shield className="h-5 w-5" />,
  Clock: <Clock className="h-5 w-5" />,
  BookOpen: <BookOpen className="h-5 w-5" />
};

const PRAYER_WATCH_TIMES = [
  { value: '06:00:00', label: 'Morning Watch', displayTime: '6:00 AM' },
  { value: '09:00:00', label: 'Third Hour Watch', displayTime: '9:00 AM' },
  { value: '12:00:00', label: 'Noon Watch', displayTime: '12:00 PM' },
  { value: '15:00:00', label: 'Ninth Hour Watch', displayTime: '3:00 PM' },
  { value: '18:00:00', label: 'Evening Watch', displayTime: '6:00 PM' },
  { value: '21:00:00', label: 'Night Watch', displayTime: '9:00 PM' },
  { value: '00:00:00', label: 'Midnight Watch', displayTime: '12:00 AM' },
];

// Default Prayer Watch Topics
const DEFAULT_PRAYER_WATCH_TOPICS: PrayerWatchTopic[] = [
  {
    id: 'breakthrough',
    name: 'Prayer for Breakthrough',
    description: 'Praying for breakthrough in spiritual, financial, and personal areas',
    icon: 'Shield',
    color: 'purple',
    is_active: true
  },
  {
    id: 'healing',
    name: 'Prayer for Healing',
    description: 'Interceding for physical, emotional, and spiritual healing',
    icon: 'Heart',
    color: 'pink',
    is_active: true
  },
  {
    id: 'family',
    name: 'Prayer for Family',
    description: 'Standing in the gap for your family members and loved ones',
    icon: 'Users',
    color: 'blue',
    is_active: true
  },
  {
    id: 'nation',
    name: 'Prayer for Nation',
    description: 'Interceding for your country, leaders, and national transformation',
    icon: 'Flag',
    color: 'red',
    is_active: true
  },
  {
    id: 'wisdom',
    name: 'Prayer for Wisdom',
    description: 'Seeking divine guidance and understanding for life decisions',
    icon: 'Compass',
    color: 'indigo',
    is_active: true
  },
  {
    id: 'protection',
    name: 'Prayer for Protection',
    description: "Covering yourself and loved ones with God's protection",
    icon: 'Shield',
    color: 'green',
    is_active: true
  }
];

// Scripture sections of the prayer-topic preview modal. Resolves the main and
// additional references to a published Bible version in the reader's language
// (falls back to stored English). Isolated so the bible hooks run per render.
const PrayerScriptures: React.FC<{
  main?: { reference?: string; text?: string };
  additional: Array<{ reference?: string; text?: string }>;
}> = ({ main, additional }) => {
  const { t } = useLanguage();
  const mainRes = useLocalizedScripture({ reference: main?.reference, text: main?.text });
  const addRes = useLocalizedScriptures(additional);
  return (
    <>
      {(mainRes.reference || mainRes.text) && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-lg border border-indigo-200">
          <h3 className="font-semibold text-indigo-900 mb-2 flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {t('prayerLibrary', 'scriptureFoundation', 'Scripture Foundation')}
          </h3>
          {mainRes.reference && (
            <p className="text-sm font-medium text-indigo-700 mb-2">{mainRes.reference}</p>
          )}
          {mainRes.text && (
            <p className="text-gray-700 leading-relaxed italic border-l-4 border-indigo-400 pl-4">
              "{mainRes.text}"
            </p>
          )}
        </div>
      )}

      {addRes.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-600" />
            {t('prayerLibrary', 'additionalScriptures', 'Additional Scriptures')}
          </h3>
          {addRes.map((s, idx) => (
            <div key={idx} className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              {s.reference && <p className="text-sm font-medium text-blue-700 mb-2">{s.reference}</p>}
              {s.text && (
                <p className="text-gray-700 leading-relaxed italic border-l-4 border-blue-400 pl-4">
                  "{s.text}"
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export function PrayerLibrary() {
  const { user, profile } = useAuth();
  const { t, getLocalizedContent } = useLanguage();
  const entitlements = useUserEntitlements();
  const isMounted = useRef(true);
  const loadingRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'prayer-topics' | 'prayer-series' | 'prayer-watch'>('prayer-topics');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Data states
  const [categories, setCategories] = useState<PrayerCategory[]>([]);
  const [prayerTopics, setPrayerTopics] = useState<PrayerTopic[]>([]);
  const [series, setSeries] = useState<PrayerSeries[]>([]);
  const [prayerWatchEntries, setPrayerWatchEntries] = useState<PrayerWatchEntry[]>([]);
  const [prayerWatchTopics, setPrayerWatchTopics] = useState<PrayerWatchTopic[]>(DEFAULT_PRAYER_WATCH_TOPICS);
  const [userProgress, setUserProgress] = useState<Record<string, UserProgress>>({});
  const [prayerHistory, setPrayerHistory] = useState<any[]>([]);

  // Modal and session states
  const [showDurationModal, setShowDurationModal] = useState(false);
  const [showScripturePreview, setShowScripturePreview] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<PrayerTopic | null>(null);
  const [selectedDuration, setSelectedDuration] = useState(15);
  const [showPrayerSession, setShowPrayerSession] = useState(false);
  const [sessionData, setSessionData] = useState<any>(null);

  // Music selection states
  const [showMusicSelector, setShowMusicSelector] = useState(false);
  const [selectedMusicId, setSelectedMusicId] = useState<string>('1');
  const [pendingPrayerStart, setPendingPrayerStart] = useState<{
    type: 'topic' | 'watch';
    data: any;
  } | null>(null);

  // Series viewer
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);

  // Prayer Watch states
  const [selectedPrayerWatchTopic, setSelectedPrayerWatchTopic] = useState<PrayerWatchTopic | null>(null);
  const [showPrayerWatchSchedule, setShowPrayerWatchSchedule] = useState(false);

  // Prayer Watch Reminders
  const [enabledReminders, setEnabledReminders] = useState<Set<string>>(new Set());
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    isMounted.current = true;
    loadData();

    return () => {
      isMounted.current = false;
    };
  }, [user]);

  // Open a prayer series arriving from a shared link (/prayer-series/:id).
  useEffect(() => {
    const dl = consumeDeepLink('prayer-series');
    if (dl?.id) setSelectedSeriesId(dl.id);
  }, []);

  // Tell the app shell when a prayer session or series viewer is open so it can
  // hide floating UI (e.g. the Stats button) while a prayer is playing.
  useEffect(() => {
    const active = showPrayerSession || selectedSeriesId !== null;
    window.dispatchEvent(new CustomEvent('viewer:active', { detail: active }));
  }, [showPrayerSession, selectedSeriesId]);
  useEffect(() => () => {
    window.dispatchEvent(new CustomEvent('viewer:active', { detail: false }));
  }, []);

  const loadData = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    setLoading(true);
    try {
      // Load each data source independently to prevent one failure from blocking others
      await Promise.allSettled([
        loadCategories(),
        loadPrayerTopics(),
        loadSeries(),
        loadPrayerWatch(),
        loadUserProgress(),
        loadPrayerHistory(),
        loadPrayerWatchTopics()
      ]);
    } catch (err) {
      console.error('Error loading data:', err);
      // Don't show error toast since individual loaders handle their own errors
    } finally {
      if (isMounted.current) setLoading(false);
      loadingRef.current = false;
    }
  };


  const loadCategories = async () => {
    const { data } = await cachedRead<any[]>('prayer_categories', async () => {
      const { data, error } = await supabase
        .from('prayer_categories')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      if (error) throw error;
      return data || [];
    });
    if (isMounted.current) setCategories(data || []);
  };

  const loadPrayerTopics = async () => {
    try {
      const { data } = await cachedRead<any[]>('prayer_topics', async () => {
        const { data, error } = await supabase
          .from('prayer_topics')
          .select('*')
          .eq('is_published', true)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
      });

      const parsed = (data || []).map(t => ({
        ...t,
        prayer_points: typeof t.prayer_points === 'string' 
          ? JSON.parse(t.prayer_points) 
          : t.prayer_points || [],
        scriptures: typeof t.scriptures === 'string'
          ? JSON.parse(t.scriptures)
          : t.scriptures || []
      }));

      if (isMounted.current) setPrayerTopics(parsed);
    } catch (err) {
      console.error('Error loading prayer topics:', err);
    }
  };

  const loadSeries = async () => {
    try {
      const { data } = await cachedRead<any[]>('prayer_series', async () => {
        const { data, error } = await supabase
          .from('prayer_series')
          .select('*')
          .eq('is_published', true)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
      });

      if (user && data) {
        const seriesIds = data.map(s => s.id);

        // Bookmarks are user-specific and require the network; offline, just
        // show the cached series without the bookmark flag rather than failing.
        let bookmarkedIds = new Set<string>();
        try {
          const { data: bookmarksData } = await supabase
            .from('prayer_series_bookmarks')
            .select('series_id')
            .eq('user_id', user.id)
            .in('series_id', seriesIds);
          bookmarkedIds = new Set(bookmarksData?.map(b => b.series_id) || []);
        } catch { /* offline — ignore bookmarks */ }

        const seriesWithBookmarks = data.map(s => ({
          ...s,
          is_bookmarked: bookmarkedIds.has(s.id),
          progress: userProgress[s.id]?.completed_days?.length || 0
        }));

        if (isMounted.current) setSeries(seriesWithBookmarks);
      } else if (isMounted.current) {
        setSeries(data || []);
      }
    } catch (err) {
      console.error('Error loading series:', err);
      toast({ title: t('common', 'error', 'Error'), description: t('prayers', 'failedLoadSeries', 'Failed to load prayer series'), variant: 'destructive' });
    }
  };

  const loadPrayerWatch = async () => {
    try {
      const { data } = await cachedRead<any[]>('prayer_watch', async () => {
        const { data, error } = await supabase
          .from('prayer_library')
          .select('*')
          .eq('is_prayer_watch', true)
          .eq('is_active', true)
          .order('prayer_watch_time');

        if (error) throw error;
        return data || [];
      });

      const parsed = (data || []).map(p => ({
        ...p,
        prayer_points: typeof p.prayer_points === 'string' 
          ? JSON.parse(p.prayer_points) 
          : p.prayer_points || [],
        scriptures: typeof p.scriptures === 'string'
          ? JSON.parse(p.scriptures)
          : p.scriptures || []
      }));
      
      if (isMounted.current) setPrayerWatchEntries(parsed);
    } catch (err) {
      console.error('Error loading prayer watch:', err);
    }
  };

  const loadPrayerWatchTopics = async () => {
    try {
      const { data, error } = await supabase
        .from('prayer_watch_topics')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) {
        console.log('No prayer_watch_topics table, using defaults');
        if (isMounted.current) setPrayerWatchTopics(DEFAULT_PRAYER_WATCH_TOPICS);
        return;
      }
      
      if (data && data.length > 0) {
        if (isMounted.current) setPrayerWatchTopics(data);
      } else {
        if (isMounted.current) setPrayerWatchTopics(DEFAULT_PRAYER_WATCH_TOPICS);
      }
    } catch (err) {
      console.error('Error loading prayer watch topics:', err);
      if (isMounted.current) setPrayerWatchTopics(DEFAULT_PRAYER_WATCH_TOPICS);
    }
  };

  const loadUserProgress = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('prayer_user_progress')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;
      
      const progressMap: Record<string, UserProgress> = {};
      (data || []).forEach(p => {
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

  const loadPrayerHistory = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('prayer_history')
        .select('*')
        .eq('user_id', user.id)
        .order('prayed_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      if (isMounted.current) setPrayerHistory(data || []);
    } catch (err) {
      console.error('Error loading prayer history:', err);
    }
  };

  const handlePrayerSessionComplete = async (sessionData: any) => {
    if (!user || !profile) return;

    const duration = sessionData.duration_minutes || selectedDuration;
    
    try {
      await postPrayerTopicCompleted(
        user.id,
        profile.full_name || profile.email || 'Anonymous',
        profile.avatar_url,
        sessionData.id,
        sessionData.title,
        duration
      );

      await supabase
        .from('prayer_history')
        .insert({
          user_id: user.id,
          prayer_title: sessionData.title,
          duration_minutes: duration,
          prayed_at: new Date().toISOString()
        });

      await loadPrayerHistory();
      
      toast({ 
        title: t('prayers', 'prayerCompleted', 'Prayer Completed! 🙏'), 
        description: t('prayers', 'prayerCompletedDesc', 'Your prayer activity has been shared with the community') 
      });
    } catch (error) {
      console.error('Error completing prayer session:', error);
    }
  };

  const handlePrayerWatchComplete = async (sessionData: any, timeSlot: string, watchLabel: string) => {
    if (!user || !profile || !selectedPrayerWatchTopic) return;

    const duration = sessionData.duration_minutes;
    
    try {
      await postPrayerWatchCompleted(
        user.id,
        profile.full_name || profile.email || 'Anonymous',
        profile.avatar_url,
        sessionData.id,
        selectedPrayerWatchTopic.name,
        duration
      );

      await supabase
        .from('prayer_history')
        .insert({
          user_id: user.id,
          prayer_title: `${watchLabel} - ${selectedPrayerWatchTopic.name}`,
          duration_minutes: duration,
          prayer_watch_topic: selectedPrayerWatchTopic.id,
          prayer_watch_time: timeSlot,
          prayed_at: new Date().toISOString()
        });

      await loadPrayerHistory();
      
      toast({ 
        title: t('prayers', 'prayerWatchCompleted', 'Prayer Watch Completed! 🙏'), 
        description: t('prayers', 'prayerWatchCompletedDesc', 'Your faithful watch has been recorded') 
      });
    } catch (error) {
      console.error('Error completing prayer watch:', error);
    }
  };

  const handleJoinPrayerWatch = async (timeSlot: string, watchLabel: string) => {
    if (!user || !profile || !selectedPrayerWatchTopic) return;

    try {
      await postPrayerWatchJoined(
        user.id,
        profile.full_name || profile.email || 'Anonymous',
        profile.avatar_url,
        selectedPrayerWatchTopic.id,
        selectedPrayerWatchTopic.name,
        watchLabel
      );

      toast({ 
        title: t('prayers', 'joinedPrayerWatch', 'Joined Prayer Watch!'), 
        description: t('prayers', 'joinedPrayerWatchDesc', "You've joined the {watch} watch", { watch: watchLabel }) 
      });
    } catch (error) {
      console.error('Error joining prayer watch:', error);
    }
  };

  const getUserCurrentPrayerWatch = () => {
    const now = new Date();
    const hours = now.getHours();

    let targetTime: string;
    if (hours >= 0 && hours < 6) targetTime = '00:00';
    else if (hours >= 6 && hours < 9) targetTime = '06:00';
    else if (hours >= 9 && hours < 12) targetTime = '09:00';
    else if (hours >= 12 && hours < 15) targetTime = '12:00';
    else if (hours >= 15 && hours < 18) targetTime = '15:00';
    else if (hours >= 18 && hours < 21) targetTime = '18:00';
    else targetTime = '21:00';

    return targetTime;
  };

  const openTopicWithDuration = (topic: PrayerTopic) => {
    setSelectedTopic(topic);
    // Show music selector before duration modal
    setPendingPrayerStart({ type: 'topic', data: topic });
    setSelectedMusicId('1'); // Default music
    setShowMusicSelector(true);
  };

  const proceedWithTopicDuration = () => {
    setShowMusicSelector(false);
    setShowScripturePreview(true);
  };

  const startPrayerSession = () => {
    if (!selectedTopic) return;
    
    // Close duration modal and show scripture preview
    setShowDurationModal(false);
    setShowScripturePreview(true);
  };

  const proceedToPrayerSession = () => {
    if (!selectedTopic) return;
    
    console.log('🎵 [Prayer Topic] Starting prayer with selected music ID:', selectedMusicId);
    
    if (user) {
      supabase
        .from('prayer_history')
        .insert({
          user_id: user.id,
          prayer_title: selectedTopic.title,
          duration_minutes: selectedDuration,
          prayed_at: new Date().toISOString()
        })
        .then(() => loadPrayerHistory());
    }

    // Localize the whole topic once (title/description/prayer_points come from
    // translations[lang] when present; falls back to English).
    const locTopic = getLocalizedContent(selectedTopic, ['title', 'description', 'prayer_points']);
    const devotionalData = {
      id: selectedTopic.id,
      title: locTopic.title,
      content: locTopic.description,
      scripture_reference: selectedTopic.scripture_reference || '',
      scripture_text: selectedTopic.scripture_text || '',
      prayer_points: locTopic.prayer_points,
      reflection: '',
      duration_minutes: selectedDuration,
      audio_url: '',
      image_url: selectedTopic.cover_image_url || '',
      instrumental_id: selectedMusicId // Add selected music
    };

    console.log('🎵 [Prayer Topic] Session data:', devotionalData);
    console.log('🎵 [Prayer Topic] instrumental_id:', devotionalData.instrumental_id);

    setSessionData(devotionalData);
    setShowScripturePreview(false);
    setShowPrayerSession(true);
    setPendingPrayerStart(null);
  };

  const startPrayerWatchSession = async (timeSlot: string, watchLabel: string) => {
    if (!selectedPrayerWatchTopic) return;

    const prayer = prayerWatchEntries.find(p => 
      p.prayer_watch_time === timeSlot && 
      p.prayer_watch_topic === selectedPrayerWatchTopic.id
    );

    if (!prayer) {
      toast({ 
        title: t('prayers', 'noPrayerContent', 'No Prayer Content'), 
        description: t('prayers', 'noPrayerContentDesc', 'No prayer content available for {topic} at this time.', { topic: selectedPrayerWatchTopic.name }),
        variant: 'destructive'
      });
      return;
    }

    // Show music selector before starting
    setPendingPrayerStart({ 
      type: 'watch', 
      data: { timeSlot, watchLabel, prayer } 
    });
    setSelectedMusicId('1'); // Default music
    setShowMusicSelector(true);
  };

  const proceedWithPrayerWatch = async () => {
    if (!pendingPrayerStart || pendingPrayerStart.type !== 'watch') return;
    
    const { timeSlot, watchLabel, prayer } = pendingPrayerStart.data;

    // Store prayer watch data for preview
    setSelectedTopic({
      id: prayer.id,
      title: `${watchLabel} - ${selectedPrayerWatchTopic?.name}`,
      description: prayer.content,
      scripture_reference: prayer.scripture_reference || '',
      scripture_text: prayer.scripture_text || '',
      scriptures: prayer.scriptures || [],
      prayer_points: prayer.prayer_points,
      cover_image_url: '',
      is_featured: false,
      is_published: true
    } as any);

    // Close music selector and show scripture preview
    setShowMusicSelector(false);
    setShowScripturePreview(true);
  };

  const proceedToPrayerWatchSession = async () => {
    if (!pendingPrayerStart || pendingPrayerStart.type !== 'watch') return;
    
    const { timeSlot, watchLabel, prayer } = pendingPrayerStart.data;

    console.log('🎵 [Prayer Watch] Starting prayer with selected music ID:', selectedMusicId);

    // NEW: Post about joining the prayer watch
    await handleJoinPrayerWatch(timeSlot, watchLabel);

    if (user) {
      supabase
        .from('prayer_history')
        .insert({
          user_id: user.id,
          prayer_title: `${watchLabel} - ${selectedPrayerWatchTopic?.name}`,
          duration_minutes: prayer.duration_minutes,
          prayer_watch_topic: selectedPrayerWatchTopic?.id,
          prayer_watch_time: timeSlot,
          prayed_at: new Date().toISOString()
        })
        .then(() => loadPrayerHistory());
    }

    const devotionalData = {
      id: prayer.id,
      title: `${watchLabel} - ${selectedPrayerWatchTopic?.name}`,
      content: prayer.content,
      scripture_reference: prayer.scripture_reference || '',
      scripture_text: prayer.scripture_text || '',
      prayer_points: prayer.prayer_points,
      reflection: '',
      duration_minutes: prayer.duration_minutes,
      audio_url: '',
      image_url: '',
      isPrayerWatch: true,
      prayerWatchTime: timeSlot,
      prayerWatchLabel: watchLabel,
      instrumental_id: selectedMusicId // Add selected music
    };

    console.log('🎵 [Prayer Watch] Session data:', devotionalData);
    console.log('🎵 [Prayer Watch] instrumental_id:', devotionalData.instrumental_id);

    setSessionData(devotionalData);
    setShowScripturePreview(false);
    setShowPrayerSession(true);
    setPendingPrayerStart(null);
  };

  const openSeriesInViewer = (seriesId: string) => {
    setSelectedSeriesId(seriesId);
  };

  const toggleBookmark = async (seriesId: string) => {
    if (!user) {
      toast({ title: t('auth', 'signInRequired', 'Sign In Required'), description: t('prayers', 'signInBookmarkSeries', 'Please sign in to bookmark series') });
      return;
    }

    const series_item = series.find(s => s.id === seriesId);
    const isCurrentlyBookmarked = series_item?.is_bookmarked;

    try {
      if (isCurrentlyBookmarked) {
        await supabase
          .from('prayer_series_bookmarks')
          .delete()
          .eq('user_id', user.id)
          .eq('series_id', seriesId);
        
        toast({ title: t('prayers', 'removed', 'Removed'), description: t('prayers', 'seriesRemovedBookmarks', 'Series removed from bookmarks') });
      } else {
        await supabase
          .from('prayer_series_bookmarks')
          .insert({ user_id: user.id, series_id: seriesId });
        
        toast({ title: t('prayers', 'bookmarked', 'Bookmarked'), description: t('prayers', 'seriesAddedBookmarks', 'Series added to bookmarks') });
      }

      loadSeries();
    } catch (err: any) {
      toast({ title: t('common', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const selectPrayerWatchTopic = (topic: PrayerWatchTopic) => {
    setSelectedPrayerWatchTopic(topic);
    setShowPrayerWatchSchedule(true);
  };

  const backToTopicSelection = () => {
    setShowPrayerWatchSchedule(false);
    setSelectedPrayerWatchTopic(null);
  };

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
      loadReminders();
    }
  }, [user]);

  const loadReminders = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('user_profiles')
        .select('prayer_watch_reminders')
        .eq('user_id', user.id)
        .single();
      if (data?.prayer_watch_reminders) {
        setEnabledReminders(new Set(data.prayer_watch_reminders));
        localStorage.setItem(`prayer_watch_reminders_${user.id}`, JSON.stringify(data.prayer_watch_reminders));
        return;
      }
      // Fallback to localStorage
      const stored = localStorage.getItem(`prayer_watch_reminders_${user.id}`);
      if (stored) setEnabledReminders(new Set(JSON.parse(stored)));
    } catch {
      const stored = localStorage.getItem(`prayer_watch_reminders_${user.id}`);
      if (stored) setEnabledReminders(new Set(JSON.parse(stored)));
    }
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      toast({ 
        title: t('prayers', 'notSupported', 'Not Supported'), 
        description: t('prayers', 'notificationsNotSupported', 'Notifications are not supported in this browser'),
        variant: 'destructive'
      });
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      
      if (permission === 'granted') {
        toast({ 
          title: t('prayers', 'notificationsEnabled', 'Notifications Enabled'), 
          description: t('prayers', 'notificationsEnabledDesc', 'You will receive prayer watch reminders') 
        });
        return true;
      } else if (permission === 'denied') {
        toast({ 
          title: t('errors', 'permissionDenied', 'Permission Denied'), 
          description: t('prayers', 'enableNotificationsSettings', 'Please enable notifications in your browser settings'),
          variant: 'destructive'
        });
        return false;
      }
    } catch (err) {
      console.error('Error requesting notification permission:', err);
      return false;
    }
    return false;
  };

  const scheduleNotification = (timeSlot: string, title: string, timeLabel: string) => {
    const now = new Date();
    const [hours, minutes] = timeSlot.split(':').map(Number);
    
    const scheduledTime = new Date();
    scheduledTime.setHours(hours, minutes - 10, 0, 0);

    if (scheduledTime <= now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    const timeUntil = scheduledTime.getTime() - now.getTime();

    setTimeout(() => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Prayer Watch Reminder', {
          body: `${title} begins at ${timeLabel} (in 10 minutes)`,
          icon: '/prayer-icon.png',
          tag: `prayer-watch-${timeSlot}`,
          requireInteraction: false
        });
      }
      
      scheduleNotification(timeSlot, title, timeLabel);
    }, timeUntil);
  };

  const toggleReminder = async (timeSlot: string, watchLabel: string) => {
    if (!user) {
      toast({ title: t('auth', 'signInRequired', 'Sign In Required'), description: t('prayers', 'signInReminders', 'Please sign in to set reminders') });
      return;
    }

    if (!selectedPrayerWatchTopic) return;

    const reminderKey = `${timeSlot}_${selectedPrayerWatchTopic.id}`;
    const isEnabled = enabledReminders.has(reminderKey);

    if (!isEnabled) {
      if (notificationPermission !== 'granted') {
        const granted = await requestNotificationPermission();
        if (!granted) return;
      }

      const newReminders = new Set(enabledReminders);
      newReminders.add(reminderKey);
      setEnabledReminders(newReminders);

      const remindersArray = Array.from(newReminders);
      localStorage.setItem(`prayer_watch_reminders_${user.id}`, JSON.stringify(remindersArray));
      supabase.from('user_profiles').update({ prayer_watch_reminders: remindersArray }).eq('user_id', user.id);

      const slot = PRAYER_WATCH_TIMES.find(s => s.value === timeSlot);
      if (slot) {
        scheduleNotification(timeSlot, `${watchLabel} - ${selectedPrayerWatchTopic.name}`, slot.displayTime);
      }

      toast({ 
        title: t('prayers', 'reminderSet', 'Reminder Set'), 
        description: t('prayers', 'reminderSetDesc', "You'll be notified 10 minutes before {watch}", { watch: watchLabel }) 
      });
    } else {
      const newReminders = new Set(enabledReminders);
      newReminders.delete(reminderKey);
      setEnabledReminders(newReminders);

      const remindersArray = Array.from(newReminders);
      localStorage.setItem(`prayer_watch_reminders_${user.id}`, JSON.stringify(remindersArray));
      supabase.from('user_profiles').update({ prayer_watch_reminders: remindersArray }).eq('user_id', user.id);

      toast({ 
        title: t('prayers', 'reminderRemoved', 'Reminder Removed'), 
        description: t('prayers', 'reminderRemovedDesc', 'Prayer watch reminder has been disabled') 
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  if (selectedSeriesId) {
    return (
      <div>
        <Button
          variant="ghost"
          onClick={() => setSelectedSeriesId(null)}
          className="mb-4"
        >
          <ChevronRight className="h-4 w-4 mr-2 rotate-180" />
          Back to Prayer Library
        </Button>
        <PrayerSeriesViewer seriesId={selectedSeriesId} />
      </div>
    );
  }

  if (showPrayerSession && sessionData) {
    const handleComplete = (duration?: number, pointsCompleted?: number) => {
      if (sessionData.isPrayerWatch) {
        handlePrayerWatchComplete(
          sessionData, 
          sessionData.prayerWatchTime, 
          sessionData.prayerWatchLabel
        );
      } else {
        handlePrayerSessionComplete(sessionData);
      }
      setShowPrayerSession(false);
      setSessionData(null);
    };

    const handleClose = () => {
      setShowPrayerSession(false);
      setSessionData(null);
    };

    // Convert sessionData to prayer points format
    const prayerPoints: PrayerPoint[] = sessionData.prayer_points?.map((point: any, index: number) => ({
      id: point.id || `point-${index}`,
      title: point.title || point.content || `Prayer Point ${index + 1}`,
      content: point.content || point.title || '',
      duration_seconds: point.duration_seconds || 60,
      order_index: point.order_index ?? index
    })) || [];

    // Determine session type based on duration
    const sessionType: 'quick' | 'standard' | 'deep' = 
      selectedDuration <= 5 ? 'quick' :
      selectedDuration <= 15 ? 'standard' : 'deep';

    const instrumentalIdToUse = sessionData.audio_url ? undefined : (sessionData.instrumental_id || "1");
    console.log('🎵 [Render Session] sessionData.instrumental_id:', sessionData.instrumental_id);
    console.log('🎵 [Render Session] sessionData.audio_url:', sessionData.audio_url);
    console.log('🎵 [Render Session] instrumentalIdToUse:', instrumentalIdToUse);

    return (
      <InteractivePrayerSession
        title={sessionData.title || 'Prayer Session'}
        prayerPoints={prayerPoints}
        sessionType={sessionType}
        instrumentalId={instrumentalIdToUse}
        onComplete={handleComplete}
        onClose={handleClose}
        isPrayerWatch={sessionData.isPrayerWatch}
        prayerWatchData={sessionData.isPrayerWatch ? {
          topicId: selectedPrayerWatchTopic?.id,
          timeSlot: sessionData.prayerWatchTime,
          slotId: sessionData.prayerWatchTime
        } : undefined}
      />
    );
  }

  const filteredTopics = prayerTopics.filter(topic => {
    const matchesSearch = topic.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         topic.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const filteredSeries = series.filter(s =>
    s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const userCurrentWatchTime = getUserCurrentPrayerWatch();

  const lzSelectedTopic = selectedTopic
    ? getLocalizedContent(selectedTopic, ['title', 'description', 'scripture_reference', 'scripture_text'])
    : null;

  return (
    <div className="space-y-6">

      {/* Search Bar */}
      <SearchFilterPanel>
        <div className="relative flex-1">
          <Search className={searchFilterIconClass} />
          <Input
            placeholder={t('prayers', 'searchPrayers', 'Search prayers...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={searchFilterInputClass}
          />
        </div>
      </SearchFilterPanel>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="prayer-topics">{t('prayers', 'prayerTopics', 'Prayer Topics')}</TabsTrigger>
          <TabsTrigger value="prayer-series">{t('prayers', 'series', 'Prayer Series')}</TabsTrigger>
          <TabsTrigger value="prayer-watch">{t('prayers', 'prayerWatch', 'Prayer Watch')}</TabsTrigger>
        </TabsList>

        {/* ===== PRAYER TOPICS TAB ===== */}
        <TabsContent value="prayer-topics" className="space-y-6">
          <Card className="bg-gradient-to-r from-purple-100 to-indigo-100 border-purple-200">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-purple-600 rounded-full">
                  <Flame className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-purple-900">Interactive Prayer Topics</h3>
                  <p className="text-purple-700">Select a prayer topic and choose your duration</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Featured Topics */}
          {filteredTopics.filter(t => t.is_featured).length > 0 && (
            <div>
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Star className="h-5 w-5 text-amber-500" />
                Featured Prayer Topics
              </h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTopics.filter(t => t.is_featured).map(topic => {
                  const shareUrl = `${window.location.origin}/prayer-topics/${topic.id}`;
                  const lz = getLocalizedContent(topic, ['title', 'description', 'scripture_reference']);

                  return (
                    <Card key={topic.id} className="hover:shadow-lg transition-shadow">
                      <div className="h-32 bg-gradient-to-br from-purple-500 to-pink-500 relative">
                        {topic.cover_image_url ? (
                          <img src={topic.cover_image_url} alt={lz.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Flame className="h-12 w-12 text-white/50" />
                          </div>
                        )}
                        <Badge className="absolute top-2 left-2 bg-amber-500">
                          <Star className="h-3 w-3 mr-1" />
                          Featured
                        </Badge>
                      </div>
                      <CardContent className="p-4">
                        <h4 className="font-semibold text-lg mb-2">{lz.title}</h4>
                        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{lz.description}</p>

                        {lz.scripture_reference && (
                          <div className="bg-amber-50 rounded-lg p-2 mb-3">
                            <p className="text-xs font-medium text-amber-800">{lz.scripture_reference}</p>
                          </div>
                        )}

                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {topic.prayer_points?.length || 0} Prayer Points
                          </Badge>
                          {topic.author && (
                            <div className="flex items-center gap-1 text-xs text-gray-600">
                              <span>by {topic.author}</span>
                              {topic.author_social_url && (
                                <a 
                                  href={topic.author_social_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center hover:text-purple-600 transition-colors"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Link className="h-3 w-3 ml-1" />
                                </a>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <Button 
                            className="flex-1"
                            onClick={() => openTopicWithDuration(topic)}
                          >
                            <PlayCircle className="h-4 w-4 mr-2" />
                            Start Prayer
                          </Button>
                          
                          <ShareButton title={lz.title} url={shareUrl} />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* All Topics */}
          <div>
            <h3 className="text-xl font-semibold mb-4">All Prayer Topics</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTopics.filter(t => !t.is_featured).map(topic => {
                const shareUrl = `${window.location.origin}/prayer-topics/${topic.id}`;
                const lz = getLocalizedContent(topic, ['title', 'description', 'scripture_reference']);

                return (
                  <Card key={topic.id} className="hover:shadow-lg transition-shadow">
                    <div className="h-32 bg-gradient-to-br from-indigo-500 to-purple-500 relative">
                      {topic.cover_image_url ? (
                        <img src={topic.cover_image_url} alt={lz.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <BookOpen className="h-12 w-12 text-white/50" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-4">
                      <h4 className="font-semibold text-lg mb-2">{lz.title}</h4>
                      <p className="text-sm text-gray-600 mb-3 line-clamp-2">{lz.description}</p>

                      {lz.scripture_reference && (
                        <div className="bg-blue-50 rounded-lg p-2 mb-3">
                          <p className="text-xs font-medium text-blue-800">{lz.scripture_reference}</p>
                        </div>
                      )}

                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          {topic.prayer_points?.length || 0} Prayer Points
                        </Badge>
                        {topic.author && (
                          <div className="flex items-center gap-1 text-xs text-gray-600">
                            <span>by {topic.author}</span>
                            {topic.author_social_url && (
                              <a 
                                href={topic.author_social_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center hover:text-purple-600 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Link className="h-3 w-3 ml-1" />
                              </a>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Button 
                          className="flex-1"
                          variant="outline"
                          onClick={() => openTopicWithDuration(topic)}
                        >
                          <PlayCircle className="h-4 w-4 mr-2" />
                          Start Prayer
                        </Button>
                        
                        <ShareButton title={lz.title} url={shareUrl} />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {filteredTopics.length === 0 && (
            <Card>
              <CardContent className="p-12 text-center">
                <Flame className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium mb-2">No Prayer Topics Found</h3>
                <p className="text-gray-500">Try adjusting your search terms</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== PRAYER SERIES TAB ===== */}
        <TabsContent value="prayer-series" className="space-y-6">
          <Card className="bg-gradient-to-r from-blue-100 to-indigo-100 border-blue-200">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-600 rounded-full">
                  <BookOpen className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-blue-900">Multi-Day Prayer Series</h3>
                  <p className="text-blue-700">Journey through structured prayer series</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Featured Series */}
          {filteredSeries.filter(s => s.is_featured).length > 0 && (
            <div>
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Star className="h-5 w-5 text-amber-500" />
                Featured Prayer Series
              </h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredSeries.filter(s => s.is_featured).map(s => {
                  const shareUrl = `${window.location.origin}/prayer-series/${s.id}`;
                  const lz = getLocalizedContent(s, ['title', 'subtitle', 'description']);

                  return (
                    <Card key={s.id} className="hover:shadow-lg transition-shadow">
                      <div className="h-32 bg-gradient-to-br from-blue-500 to-purple-500 relative">
                        {s.cover_image_url ? (
                          <img src={s.cover_image_url} alt={lz.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <BookOpen className="h-12 w-12 text-white/50" />
                          </div>
                        )}
                        <Badge className="absolute top-2 left-2 bg-amber-500">
                          <Star className="h-3 w-3 mr-1" />
                          Featured
                        </Badge>
                        {s.is_bookmarked && (
                          <Badge className="absolute top-2 right-2 bg-green-600">
                            <BookmarkCheck className="h-3 w-3" />
                          </Badge>
                        )}
                      </div>
                      <CardContent className="p-4">
                        <h4 className="font-semibold text-lg mb-1">{lz.title}</h4>
                        {lz.subtitle && <p className="text-sm text-gray-600 mb-2">{lz.subtitle}</p>}
                        <p className="text-sm text-gray-500 mb-3 line-clamp-2">{lz.description}</p>
                        
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          <Badge variant="outline">
                            <Calendar className="h-3 w-3 mr-1" />
                            {s.total_days} Days
                          </Badge>
                          {s.author && (
                            <div className="flex items-center gap-1 text-xs text-gray-600">
                              <span>by {s.author}</span>
                              {s.author_social_url && (
                                <a 
                                  href={s.author_social_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center hover:text-purple-600 transition-colors ml-1"
                                  onClick={(e) => e.stopPropagation()}
                                  title="Visit author's social media"
                                >
                                  <Link className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          )}
                          <Badge variant="outline" className={s.progress && s.progress > 0 ? "bg-green-50" : ""}>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {s.progress || 0} completed
                          </Badge>
                        </div>

                        <div className="flex gap-2 mb-2">
                          <Button 
                            className="flex-1"
                            onClick={() => openSeriesInViewer(s.id)}
                          >
                            <PlayCircle className="h-4 w-4 mr-2" />
                            Start Series
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => toggleBookmark(s.id)}
                          >
                            {s.is_bookmarked ? (
                              <BookmarkCheck className="h-4 w-4 text-green-600" />
                            ) : (
                              <Bookmark className="h-4 w-4" />
                            )}
                          </Button>
                          <ShareButton title={lz.title} url={shareUrl} />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* All Series */}
          <div>
            <h3 className="text-xl font-semibold mb-4">All Prayer Series</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSeries.filter(s => !s.is_featured).map(s => {
                const shareUrl = `${window.location.origin}/prayer-series/${s.id}`;
                const lz = getLocalizedContent(s, ['title', 'subtitle', 'description']);

                return (
                  <Card key={s.id} className="hover:shadow-lg transition-shadow">
                    <div className="h-32 bg-gradient-to-br from-indigo-500 to-blue-500 relative">
                      {s.cover_image_url ? (
                        <img src={s.cover_image_url} alt={lz.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <BookOpen className="h-12 w-12 text-white/50" />
                        </div>
                      )}
                      {s.is_bookmarked && (
                        <Badge className="absolute top-2 right-2 bg-green-600">
                          <BookmarkCheck className="h-3 w-3" />
                        </Badge>
                      )}
                    </div>
                    <CardContent className="p-4">
                      <h4 className="font-semibold text-lg mb-1">{lz.title}</h4>
                      {lz.subtitle && <p className="text-sm text-gray-600 mb-2">{lz.subtitle}</p>}
                      <p className="text-sm text-gray-500 mb-3 line-clamp-2">{lz.description}</p>
                      
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <Badge variant="outline">
                          <Calendar className="h-3 w-3 mr-1" />
                          {s.total_days} Days
                        </Badge>
                        {s.author && (
                          <div className="flex items-center gap-1 text-xs text-gray-600">
                            <span>by {s.author}</span>
                            {s.author_social_url && (
                              <a 
                                href={s.author_social_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center hover:text-purple-600 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Link className="h-3 w-3 ml-1" />
                              </a>
                            )}
                          </div>
                        )}
                        <Badge variant="outline" className={s.progress && s.progress > 0 ? "bg-green-50" : ""}>
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {s.progress || 0} completed
                        </Badge>
                      </div>

                      <div className="flex gap-2">
                        <Button 
                          className="flex-1"
                          variant="outline"
                          onClick={() => openSeriesInViewer(s.id)}
                        >
                          <PlayCircle className="h-4 w-4 mr-2" />
                          Start Series
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => toggleBookmark(s.id)}
                        >
                          {s.is_bookmarked ? (
                            <BookmarkCheck className="h-4 w-4 text-green-600" />
                          ) : (
                            <Bookmark className="h-4 w-4" />
                          )}
                        </Button>
                        <ShareButton title={lz.title} url={shareUrl} />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {filteredSeries.length === 0 && (
            <Card>
              <CardContent className="p-12 text-center">
                <BookOpen className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium mb-2">No Prayer Series Found</h3>
                <p className="text-gray-500">Try adjusting your search terms</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== PRAYER WATCH TAB ===== */}
        <TabsContent value="prayer-watch" className="space-y-6">
          {/* Biblical Context */}
          <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <BookOpen className="h-6 w-6 text-blue-600 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-bold text-blue-900 mb-2">What is Prayer Watch?</h3>
                    <p className="text-gray-700 leading-relaxed mb-3">
                      Prayer Watch is a biblical practice of intentional, watchful prayer—setting apart specific hours to seek God with focus, expectancy, and perseverance. Throughout Scripture, God's people observed prayer watches to intercede, wait on the Lord, and align their hearts with His purposes, often through the night or at appointed times of the day.
                    </p>
                    <p className="text-gray-700 leading-relaxed mb-3">
                      Jesus Himself modeled prayer watches, spending entire nights in prayer (Mark 1:35; Luke 6:12).
                    </p>
                  </div>
                </div>
                
                <div className="bg-white/70 rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="w-1 h-full bg-blue-500 rounded-full flex-shrink-0 mt-1"></div>
                    <div>
                      <p className="text-sm font-semibold text-blue-900">Lamentations 2:19</p>
                      <p className="text-sm text-gray-700 italic">
                        "Arise, cry out in the night, at the beginning of the watches; pour out your heart like water before the presence of the Lord."
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <div className="w-1 h-full bg-blue-500 rounded-full flex-shrink-0 mt-1"></div>
                    <div>
                      <p className="text-sm font-semibold text-blue-900">Exodus 14:24</p>
                      <p className="text-sm text-gray-700 italic">
                        "During the morning watch, the Lord looked down on the Egyptian army..." (Shows God's activity during a specific watch hour.)
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {!showPrayerWatchSchedule ? (
            /* TOPIC SELECTION VIEW */
            <>
              <Card className="bg-gradient-to-r from-amber-100 to-orange-100 border-amber-200">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-amber-600 rounded-full">
                      <Timer className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-amber-900">Choose a Prayer Watch Topic</h3>
                      <p className="text-amber-700">Select what you want to pray for, then see available watch times</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {prayerWatchTopics.map(topic => {
                  const colorClasses = {
                    purple: 'from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700',
                    pink: 'from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700',
                    blue: 'from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700',
                    red: 'from-red-500 to-red-600 hover:from-red-600 hover:to-red-700',
                    indigo: 'from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700',
                    green: 'from-green-500 to-green-600 hover:from-green-600 hover:to-green-700'
                  };

                  const shareUrl = `${window.location.origin}/prayer-watch/${topic.id}`;
                  const lz = getLocalizedContent(topic, ['name', 'description']);

                  return (
                    <Card 
                      key={topic.id}
                      className="hover:shadow-xl transition-all"
                    >
                      <div className={`h-40 bg-gradient-to-br ${colorClasses[topic.color as keyof typeof colorClasses]} flex items-center justify-center`}>
                        {ICON_MAP[topic.icon] && (
                          <div className="text-white scale-[2]">
                            {ICON_MAP[topic.icon]}
                          </div>
                        )}
                      </div>
                      <CardContent className="p-4">
                        <h4 className="font-bold text-lg mb-2">{lz.name}</h4>
                        <p className="text-sm text-gray-600 mb-4">{lz.description}</p>
                        
                        <div className="flex gap-2">
                          <Button 
                            className="flex-1" 
                            variant="outline"
                            onClick={() => selectPrayerWatchTopic(topic)}
                          >
                            <ChevronRight className="h-4 w-4 mr-2" />
                            Choose This Topic
                          </Button>
                          
                          <ShareButton title={lz.name} url={shareUrl} />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          ) : (
            /* DAILY WATCH SCHEDULE VIEW */
            <>
              <Button
                variant="ghost"
                onClick={backToTopicSelection}
                className="mb-4"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Topics
              </Button>

              <Card className={`bg-gradient-to-r from-${selectedPrayerWatchTopic?.color}-100 to-${selectedPrayerWatchTopic?.color}-200 border-${selectedPrayerWatchTopic?.color}-300`}>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 bg-${selectedPrayerWatchTopic?.color}-600 rounded-full`}>
                      {selectedPrayerWatchTopic && ICON_MAP[selectedPrayerWatchTopic.icon] && (
                        <div className="text-white">
                          {ICON_MAP[selectedPrayerWatchTopic.icon]}
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">{selectedPrayerWatchTopic?.name}</h3>
                      <p className="text-gray-700">Your personal prayer watch schedule</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-3">
                {PRAYER_WATCH_TIMES.map(timeSlot => {
                  const prayer = prayerWatchEntries.find(p => 
                    p.prayer_watch_time === timeSlot.value && 
                    p.prayer_watch_topic === selectedPrayerWatchTopic?.id
                  );
                  const isUserCurrentWatch = userCurrentWatchTime === timeSlot.value.substring(0, 5);
                  const reminderKey = `${timeSlot.value}_${selectedPrayerWatchTopic?.id}`;
                  const hasReminder = enabledReminders.has(reminderKey);
                  const lzPrayer = prayer ? getLocalizedContent(prayer, ['title', 'content', 'scripture_reference']) : null;

                  return (
                    <Card 
                      key={timeSlot.value}
                      className={isUserCurrentWatch ? 'bg-amber-50 border-amber-300 border-2' : prayer ? 'bg-green-50 border-green-200' : 'border-dashed'}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="flex items-center gap-2">
                                <Clock className={`h-5 w-5 ${isUserCurrentWatch ? 'text-amber-600' : 'text-purple-600'}`} />
                                <div>
                                  <p className="text-xl font-bold">{timeSlot.displayTime}</p>
                                  <p className="text-sm text-gray-600">{timeSlot.label}</p>
                                </div>
                              </div>
                              
                              {isUserCurrentWatch && (
                                <Badge className="bg-amber-600">Your Current Watch</Badge>
                              )}

                              {hasReminder && prayer && (
                                <Badge className="bg-blue-500">
                                  <Bell className="h-3 w-3 mr-1" />
                                  Reminder On
                                </Badge>
                              )}
                            </div>
                            
                            {prayer ? (
                              <>
                                <h4 className="font-medium text-gray-900 mb-1">{lzPrayer?.title}</h4>
                                {lzPrayer?.scripture_reference && (
                                  <p className="text-sm text-purple-600 mb-1">
                                    <BookOpen className="h-3 w-3 inline mr-1" />
                                    {lzPrayer.scripture_reference}
                                  </p>
                                )}
                                <p className="text-sm text-gray-600 line-clamp-2">{lzPrayer?.content}</p>
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                  <Badge variant="outline" className="text-xs">
                                    {prayer.prayer_points?.length || 0} Prayer Points
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    <Clock className="h-3 w-3 mr-1" />
                                    {prayer.duration_minutes} min
                                  </Badge>
                                  {prayer.author && (
                                    <div className="flex items-center gap-1 text-xs text-gray-600">
                                      <span>by {prayer.author}</span>
                                      {prayer.author_social_url && (
                                        <a 
                                          href={prayer.author_social_url} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center hover:text-purple-600 transition-colors"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <Link className="h-3 w-3 ml-1" />
                                        </a>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </>
                            ) : (
                              <p className="text-sm text-gray-500">
                                No prayer content available for {selectedPrayerWatchTopic?.name} at this time.
                              </p>
                            )}
                          </div>
                          
                          <div className="flex flex-col gap-2 ml-4">
                            {prayer && (
                              <>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => toggleReminder(timeSlot.value, timeSlot.label)}
                                  title={hasReminder ? 'Disable reminder' : 'Enable reminder'}
                                  className={hasReminder ? 'bg-blue-50 border-blue-300' : ''}
                                >
                                  {hasReminder ? (
                                    <Bell className="h-4 w-4 text-blue-600" />
                                  ) : (
                                    <BellOff className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button 
                                  variant={isUserCurrentWatch ? 'default' : 'outline'}
                                  size="sm"
                                  onClick={() => startPrayerWatchSession(timeSlot.value, timeSlot.label)}
                                  className={isUserCurrentWatch ? 'bg-amber-600 hover:bg-amber-700' : ''}
                                >
                                  <PlayCircle className="h-4 w-4 mr-1" />
                                  Join
                                </Button>
                                {selectedPrayerWatchTopic && (
                                  <ShareButton 
                                    title={`${timeSlot.label} - ${selectedPrayerWatchTopic.name}`}
                                    url={`${window.location.origin}/prayer-watch/${selectedPrayerWatchTopic.id}/${timeSlot.value}`}
                                  />
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Timer className="h-5 w-5 text-blue-600 mt-1" />
                    <div className="text-sm text-gray-700">
                      <p className="font-semibold mb-1">Your Personal Prayer Watch</p>
                      <p>This is your personal prayer schedule for {selectedPrayerWatchTopic?.name}. Each watch time is an opportunity for you to join in prayer at that specific hour.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Music Selection Dialog */}
      <Dialog open={showMusicSelector} onOpenChange={setShowMusicSelector}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Music className="h-5 w-5 text-purple-600" />
              Select Background Music
            </DialogTitle>
            <DialogDescription>
              Choose instrumental music to accompany your prayer session
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
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (pendingPrayerStart?.type === 'topic') {
                  proceedWithTopicDuration();
                } else if (pendingPrayerStart?.type === 'watch') {
                  proceedWithPrayerWatch();
                }
              }} 
              className="bg-purple-600 hover:bg-purple-700"
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duration Selection Modal */}
      <Dialog open={showDurationModal} onOpenChange={setShowDurationModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('prayers', 'choosePrayerDuration', 'Choose Prayer Duration')}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-3 py-4">
            {DURATION_OPTIONS.map(option => (
              <button
                key={option.value}
                onClick={() => setSelectedDuration(option.value)}
                className={`w-full p-4 rounded-lg border-2 transition-all ${
                  selectedDuration === option.value
                    ? 'border-purple-600 bg-purple-50'
                    : 'border-gray-200 hover:border-purple-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <p className="font-semibold">{option.label}</p>
                    <p className="text-sm text-gray-600">{option.description}</p>
                  </div>
                  {selectedDuration === option.value && (
                    <CheckCircle className="h-5 w-5 text-purple-600" />
                  )}
                </div>
              </button>
            ))}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDurationModal(false)}>{t('common', 'cancel', 'Cancel')}</Button>
            <Button onClick={startPrayerSession}>
              <PlayCircle className="h-4 w-4 mr-2" />
              Start Prayer Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scripture Preview Modal */}
      <Dialog open={showScripturePreview} onOpenChange={setShowScripturePreview}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-purple-900">
              {lzSelectedTopic?.title}
            </DialogTitle>
            <DialogDescription className="text-base">
              {t('prayerLibrary', 'prepareYourHeart', 'Prepare your heart for prayer')}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-6 py-4">
            {/* Introduction/Description */}
            {lzSelectedTopic?.description && (
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                <h3 className="font-semibold text-purple-900 mb-2 flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  {t('prayerLibrary', 'introduction', 'Introduction')}
                </h3>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {lzSelectedTopic.description}
                </p>
              </div>
            )}

            {/* Scripture Foundation + Additional Scriptures — localized by
                reference to a published Bible version in the reader's language. */}
            <PrayerScriptures
              main={{
                reference: lzSelectedTopic?.scripture_reference,
                text: lzSelectedTopic?.scripture_text,
              }}
              additional={selectedTopic?.scriptures || []}
            />

            {/* Prayer Duration Info */}
            <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-semibold text-amber-900">{t('prayerLibrary', 'prayerDuration', 'Prayer Duration')}</p>
                  <p className="text-sm text-amber-700">
                    {t('prayerLibrary', 'minutesFocusedPrayer', '{n} minutes of focused prayer time').replace('{n}', String(selectedDuration))}
                  </p>
                </div>
              </div>
            </div>

            {/* Prayer Points Preview */}
            {selectedTopic?.prayer_points && selectedTopic.prayer_points.length > 0 && (
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <h3 className="font-semibold text-green-900 mb-2">
                  {t('prayerLibrary', 'prayerPointsCount', 'Prayer Points ({n})').replace('{n}', String(selectedTopic.prayer_points.length))}
                </h3>
                <p className="text-sm text-green-700">
                  {t('prayerLibrary', 'prayerPointsHelp', 'This prayer includes {n} guided prayer points to help you focus your prayers.').replace('{n}', String(selectedTopic.prayer_points.length))}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="border-t pt-4">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowScripturePreview(false);
                if (pendingPrayerStart?.type === 'watch') {
                  setShowMusicSelector(true);
                } else {
                  setShowMusicSelector(true);
                }
              }}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('common', 'back', 'Back')}
            </Button>
            <Button 
              onClick={() => {
                if (pendingPrayerStart?.type === 'watch') {
                  proceedToPrayerWatchSession();
                } else {
                  proceedToPrayerSession();
                }
              }}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
            >
              <PlayCircle className="h-4 w-4 mr-2" />
              {t('prayerLibrary', 'beginPrayer', 'Begin Prayer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
