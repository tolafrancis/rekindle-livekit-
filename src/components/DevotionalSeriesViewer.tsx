import { useSwipe } from '@/hooks/useSwipe';
import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Alert, AlertDescription } from './ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { supabase } from '@/lib/supabase';
import { cachedRead, queuePendingProgress, flushPendingProgress } from '@/lib/offlineContentCache';
import { consumeDeepLink } from '@/lib/deepLink';
import { getCategoryColor } from '@/lib/categoryDisplay';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageFallbackMessage, LanguageFallbackBadge } from '@/components/LanguageFallbackMessage';
import { useUserEntitlements } from '@/hooks/useUserEntitlements';
import { useLocalizedScripture } from '@/hooks/useLocalizedScripture';
import { getCachedLocalizedScripture } from '@/lib/bibleLocalization';
import { useTapGesture, useOneTimeTip, ViewerGestureTip } from '@/components/viewerGestures';
import { toast } from './ui/use-toast';
import { instrumentalTracks } from '@/data/instrumentals';
import { SocialShareModal } from './SocialShareModal';
import { HighQualityAudioPlayer } from './HighQualityAudioPlayer';
import {
  SearchFilterPanel,
  searchFilterIconClass,
  searchFilterInputClass,
  searchFilterSelectTriggerClass
} from './SearchFilterPanel';
import { 
  postDevotionalStarted,
  postDevotionalCompleted,
  postDevotionalDayCompleted
} from '@/lib/communityActivityService';
import {
  BookOpen, Calendar, Clock, Star, Play, 
  CheckCircle, ChevronRight, ChevronLeft, Lock,
  Award, Loader2, Share2, Bookmark, BookmarkCheck,
  Volume2, Image as ImageIcon, ArrowLeft, Heart,
  Search, Filter, Crown, X, VolumeX, Volume1,
  Pause, Mic, MicOff, FastForward, Timer, Flame,
  Sparkles, Link, Copy, Check, Send, Headphones
} from 'lucide-react';

// Day-list scripture citation: localizes just the reference name (e.g.
// "Thi-thiên 130:6") to the reader's language when a published version exists.
const DayScriptureRef: React.FC<{ reference?: string }> = ({ reference }) => {
  const s = useLocalizedScripture({ reference });
  if (!s.reference) return null;
  return <p className="text-sm text-purple-600">{s.reference}</p>;
};

// Passage-slide scripture: resolves the stored English reference to a published
// Bible version in the reader's language (falls back to stored English). Kept as
// its own component so the useLocalizedScripture hook runs cleanly per render.
const SlideScripture: React.FC<{ reference?: string; text?: string; version?: string }> = ({ reference, text, version }) => {
  const s = useLocalizedScripture({ reference, text, version });
  return (
    <div className="mb-6 p-6 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20">
      <p className="text-lg font-semibold mb-3 text-amber-200">
        {s.reference}
        {s.version && <span className="text-sm ml-2 opacity-70">({s.version})</span>}
      </p>
      {s.text && (
        <p className="text-lg italic leading-relaxed">
          "{s.text}"
        </p>
      )}
    </div>
  );
};

// ── Share helpers (mirrors PrayerLibrary) ────────────────────────────────────
const buildShareLinks = (title: string, url: string) => {
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  return {
    whatsapp: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    x: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
  };
};

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
    toast({ title: t('devotionalSeriesViewer', 'linkCopied', 'Link Copied!'), description: t('devotionalSeriesViewer', 'shareLinkCopiedDesc', 'Share link copied to clipboard') });
    setTimeout(() => setCopied(false), 2000);
  };

  // The share menu is rendered via Radix DropdownMenu, which portals the content
  // to <body> so it is never clipped by a card's `overflow-hidden` (the reason
  // the old absolute-positioned menu appeared "unclickable" on the list page).
  const menuItems = (
    <DropdownMenuContent
      align="end"
      className="w-48"
      onClick={(e) => e.stopPropagation()}
    >
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
        {copied ? t('devotionalSeriesViewer', 'copied', 'Copied!') : t('devotionalSeriesViewer', 'copyLink', 'Copy Link')}
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
            title={t('devotionalSeriesViewer', 'share', 'Share')}
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
          {t('devotionalSeriesViewer', 'share', 'Share')}
        </Button>
      </DropdownMenuTrigger>
      {menuItems}
    </DropdownMenu>
  );
};
// ─────────────────────────────────────────────────────────────────────────────

const peacefulBackgrounds = [
  'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1765006543774_0da9902b.png',
  'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1765006544204_90a23c85.png',
  'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1765006539724_bc8b8863.jpg',
  'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1765006548901_cd90d7e5.png',
  'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1765006569417_9acb0a21.jpg',
  'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1765006574829_e2a0af96.png',
  'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1765006571635_45f2e485.jpg',
  'https://d64gsuwffb70l.cloudfront.net/6928073259bf69394fcb95e8_1765006576313_4bd35f98.png'
];

interface DevotionalSlide {
  type: 'intro' | 'passage' | 'devotional' | 'reflection' | 'prayer' | 'spirit' | 'action' | 'additional' | 'closing';
  title: string;
  content: string;
  scripture?: string;
  scriptureText?: string;
  scriptureVersion?: string;
  duration: number;
  questions?: string[];
  steps?: string[];
}

interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  display_order: number;
  is_active: boolean;
  language?: string;
  translations?: any;
}

interface Series {
  id: string;
  category_id?: string;
  title: string;
  description: string;
  author?: string;
  author_social_url?: string;
  total_days: number;
  cover_image_url?: string;
  background_music_id?: number;
  difficulty_level: string;
  start_behavior: string;
  fixed_start_date?: string;
  is_featured: boolean;
  language?: string;
  translations?: any;
}

interface SeriesDay {
  id: string;
  day_number: number;
  title: string;
  subtitle?: string;
  scripture_reference: string;
  scripture_text: string;
  scripture_references?: string | Array<{
    reference: string;
    text: string;
    version: string;
    is_primary: boolean;
  }>;
  main_content?: string;
  content?: string;
  devotional_text?: string;
  body?: string;
  introduction?: string;
  reflection?: string;
  reflection_questions?: string[];
  guided_prayer?: string;
  prayer?: string;
  action_step?: string;
  action_steps?: string[];
  additional_thoughts?: string;
  audio_url?: string;
  video_url?: string;
  image_url?: string;
  cover_image_url?: string;
  background_music_id?: number;
  estimated_reading_time?: number;
  themes?: string[];
  language?: string;
  translations?: any;
}

interface UserProgress {
  current_day: number;
  completed_days: number[];
  completed_days_data?: { day: number; completed_at: string }[];
  is_completed: boolean;
  started_at: string;
  last_read_at?: string;
}

interface DevotionalSeriesViewerProps {
  seriesId?: string;
  onBack?: () => void;
}

export const DevotionalSeriesViewer: React.FC<DevotionalSeriesViewerProps> = ({
  seriesId,
  onBack
}) => {
  const { user, profile } = useAuth();
  const { language, t } = useLanguage();
  const entitlements = useUserEntitlements();
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [allSeries, setAllSeries] = useState<Series[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const [days, setDays] = useState<SeriesDay[]>([]);
  const [currentDay, setCurrentDay] = useState<SeriesDay | null>(null);
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'series' | 'reading'>('list');
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showDayShareModal, setShowDayShareModal] = useState(false);
  const [unlockMessage, setUnlockMessage] = useState<string | null>(null);
  const [hasPostedSeriesStart, setHasPostedSeriesStart] = useState(false);
  
  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // Enhanced reading mode states
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slides, setSlides] = useState<DevotionalSlide[]>([]);
  const [isPlaying, setIsPlaying] = useState(true);
  // Background music auto-plays when the viewer opens. Single tap pauses, double
  // tap resumes — a plain tap never *resumes* audio, only the explicit gestures do.
  const [audioStarted, setAudioStarted] = useState(true);
  const gestureTip = useOneTimeTip();
  const [isMuted, setIsMuted] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [spiritPrayerMode, setSpiritPrayerMode] = useState(false);
  const [spiritPrayerTime, setSpiritPrayerTime] = useState(0);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSlideShareModal, setShowSlideShareModal] = useState(false);
  const [backgroundIndex] = useState(() => Math.floor(Math.random() * peacefulBackgrounds.length));
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [scrollSpeed, setScrollSpeed] = useState<'slow' | 'medium'>('medium');
  const [volume, setVolume] = useState(() => {
    const savedVolume = localStorage.getItem('devotional-volume');
    return savedVolume ? parseFloat(savedVolume) : 0.5;
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechRate, setSpeechRate] = useState(0.9);
  const [slideTimeRemaining, setSlideTimeRemaining] = useState(0);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  // HighQualityAudioPlayer wiring (same as DevotionalModule)
  const [shouldAutoPlay, setShouldAutoPlay] = useState(false);
  const [isAudioActive, setIsAudioActive] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  
  // Refs
  const audioRef = useRef<HTMLAudioElement>(null);
  const ttsAudioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoAdvanceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const lastAutoTopRef = useRef(0);
  const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentSlideRef = useRef<number>(currentSlide); // Track current slide in ref
  const shouldAutoAdvanceRef = useRef<boolean>(false); // Flag for auto-advance
  
  // Keep ref in sync with state
  useEffect(() => {
    currentSlideRef.current = currentSlide;
  }, [currentSlide]);
  
  // Get devotional access level
  const devotionalAccessLevel = entitlements.hasUnlimitedDevotionals ? 'unlimited' : 'limited';

  // Helper to calculate reading time
  const calculateReadingTime = (text: string, baseTime: number = 30): number => {
    const wordCount = text.split(/\s+/).length;
    const readingTimeSeconds = Math.max(baseTime, (wordCount / 200) * 60);
    return Math.ceil(readingTimeSeconds);
  };

  // Helper to get localized content
  const getLocalizedSeries = (series: Series | null | undefined): Series => {
    if (!series) {
      return {
        id: '',
        title: '',
        description: '',
        total_days: 0,
        difficulty_level: '',
        start_behavior: '',
        is_featured: false
      } as Series;
    }
    
    if (!series.translations || !series.translations[language]) return series;
    
    return {
      ...series,
      title: series.translations[language]?.title || series.title,
      description: series.translations[language]?.description || series.description,
    };
  };

  const getLocalizedDay = (day: SeriesDay | null | undefined): SeriesDay => {
    if (!day) {
      return {
        id: '',
        day_number: 0,
        title: '',
        scripture_reference: '',
        scripture_text: ''
      } as SeriesDay;
    }
    
    if (!day.translations || !day.translations[language]) return day;
    
    return {
      ...day,
      title: day.translations[language]?.title || day.title,
      scripture_text: day.translations[language]?.scripture_text || day.scripture_text,
      main_content: day.translations[language]?.main_content || day.main_content,
      content: day.translations[language]?.content || day.content,
      introduction: day.translations[language]?.introduction || day.introduction,
      reflection: day.translations[language]?.reflection || day.reflection,
      reflection_questions: day.translations[language]?.reflection_questions || day.reflection_questions,
      guided_prayer: day.translations[language]?.guided_prayer || day.guided_prayer,
      prayer: day.translations[language]?.prayer || day.prayer,
      action_step: day.translations[language]?.action_step || day.action_step,
      action_steps: day.translations[language]?.action_steps || day.action_steps,
      additional_thoughts: day.translations[language]?.additional_thoughts || day.additional_thoughts,
    };
  };

  const getLocalizedCategory = (category: Category | null | undefined): Category => {
    if (!category) {
      return {
        id: '',
        name: '',
        description: '',
        icon: '',
        color: '',
        display_order: 0,
        is_active: true
      } as Category;
    }
    
    if (!category.translations || !category.translations[language]) return category;
    
    return {
      ...category,
      name: category.translations[language]?.name || category.name,
      description: category.translations[language]?.description || category.description,
    };
  };

  // Helper function to get main content from any possible field name
  const getMainContent = (day: SeriesDay): string => {
    return day.main_content || day.content || day.devotional_text || day.body || '';
  };

  // Get prayer content
  const getPrayerContent = (day: SeriesDay): string => {
    return day.guided_prayer || day.prayer || t('devotionalSeriesViewer', 'defaultPrayer', "Lord, help me apply what I've learned today. Guide my steps and fill me with Your Spirit. Amen.");
  };

  // Build slides from current day
  const buildSlides = (day: SeriesDay): DevotionalSlide[] => {
    const localizedDay = getLocalizedDay(day);
    const mainContent = getMainContent(localizedDay);
    const prayerContent = getPrayerContent(localizedDay);
    
    const slideList: DevotionalSlide[] = [];

    // Intro slide — welcome-by-title line, plus the author entered when the
    // series was created (shown only when an author is set; no fallback text).
    const introTitle = localizedDay.title || t('devotionals', 'untitled');
    const authorName = selectedSeries?.author?.trim();
    const welcomeLine = t('devotionalSeriesViewer', 'welcomeLine', 'You are welcome to today\'s devotional titled "{title}". This time is set apart for you and God.').replace('{title}', String(introTitle));
    const introContent = authorName
      ? `${welcomeLine}\n\n${t('devotionalSeriesViewer', 'writtenByX', 'Written by {name}').replace('{name}', String(authorName))}`
      : welcomeLine;
    slideList.push({
      type: 'intro',
      title: introTitle,
      content: introContent,
      duration: calculateReadingTime(introContent, 20)
    });

    // Scripture passages
    let scriptureRefs = day.scripture_references || [];
    if (typeof scriptureRefs === 'string') {
      try {
        scriptureRefs = JSON.parse(scriptureRefs);
      } catch {
        scriptureRefs = [];
      }
    }

    if (Array.isArray(scriptureRefs) && scriptureRefs.length > 0) {
      scriptureRefs.forEach((ref: any, idx: number) => {
        slideList.push({
          type: 'passage',
          title: idx === 0 ? t('devotionalSeriesViewer', 'scripturePassage', 'Scripture Passage') : t('devotionalSeriesViewer', 'additionalScripture', 'Additional Scripture'),
          content: t('devotionalSeriesViewer', 'readSlowly', 'Read slowly. Let the words rest in your heart.'),
          scripture: ref.reference,
          scriptureText: ref.text,
          scriptureVersion: ref.version,
          duration: calculateReadingTime(ref.text, 45)
        });
      });
    } else if (localizedDay.scripture_reference || localizedDay.scripture_text) {
      slideList.push({
        type: 'passage',
        title: t('devotionalSeriesViewer', 'scripturePassage', 'Scripture Passage'),
        content: t('devotionalSeriesViewer', 'readSlowly', 'Read slowly. Let the words rest in your heart.'),
        scripture: localizedDay.scripture_reference,
        scriptureText: localizedDay.scripture_text,
        duration: calculateReadingTime(localizedDay.scripture_text, 45)
      });
    }

    // Main devotional content
    if (mainContent) {
      slideList.push({
        type: 'devotional',
        title: t('devotionalSeriesViewer', 'devotional', 'Devotional'),
        content: mainContent,
        duration: calculateReadingTime(mainContent, 120)
      });
    }

    // Reflection questions
    if (localizedDay.reflection_questions && localizedDay.reflection_questions.length > 0) {
      const questionsText = localizedDay.reflection_questions.join(' ');
      slideList.push({
        type: 'reflection',
        title: t('devotionalSeriesViewer', 'reflectionQuestions', 'Reflection Questions'),
        content: t('devotionalSeriesViewer', 'considerTruth', 'Consider how this truth meets you where you are today.'),
        questions: localizedDay.reflection_questions,
        duration: calculateReadingTime(questionsText, 60)
      });
    }

    // Prayer
    slideList.push({
      type: 'prayer',
      title: t('devotionalSeriesViewer', 'guidedPrayer', 'Guided Prayer'),
      content: prayerContent,
      duration: calculateReadingTime(prayerContent, 90)
    });

    // Action Steps — only if the admin filled this field
    if (localizedDay.action_steps && localizedDay.action_steps.length > 0) {
      const stepsText = localizedDay.action_steps.join(' ');
      slideList.push({
        type: 'action',
        title: t('devotionalSeriesViewer', 'actionSteps', 'Action Steps'),
        content: t('devotionalSeriesViewer', 'faithWithoutWorks', 'Faith without works is dead. Here are practical steps to live out today\'s truth.'),
        steps: localizedDay.action_steps,
        duration: calculateReadingTime(stepsText, 60)
      });
    }

    // Additional Thoughts — only if the admin filled this field
    if (localizedDay.additional_thoughts && localizedDay.additional_thoughts.trim()) {
      slideList.push({
        type: 'additional',
        title: t('devotionalSeriesViewer', 'additionalThoughts', 'Additional Thoughts'),
        content: localizedDay.additional_thoughts,
        duration: calculateReadingTime(localizedDay.additional_thoughts, 90)
      });
    }

    // Spirit prayer
    slideList.push({
      type: 'spirit',
      title: t('devotionalSeriesViewer', 'prayInTheSpirit', 'Pray in the Spirit'),
      content: t('devotionalSeriesViewer', 'spiritPrayerContent', 'There is no hurry. Stay as long as you need.\n\nWhen you are ready, gently mark this time complete.'),
      duration: 60
    });

    // Closing
    slideList.push({
      type: 'closing',
      title: t('devotionalSeriesViewer', 'goInPeace', 'Go in Peace'),
      content: t('devotionalSeriesViewer', 'closingBlessing', 'May the Lord bless you and keep you.\nMay His face shine upon you and give you peace.\nGo forth in His love today.'),
      duration: 20
    });

    return slideList;
  };


  // Build the narration text for the current slide (consumed by HighQualityAudioPlayer).
  const getDevotionalAudioText = (): string => {
    const slide = slides[currentSlide];
    if (!slide) return '';
    let text = '';
    if (slide.scripture && slide.scriptureText) text += `${slide.scripture}. ${slide.scriptureText}. `;
    if (slide.type === 'reflection' && slide.questions) {
      text += slide.content + ' ';
      slide.questions.forEach((q, idx) => { text += `${t('devotionalSeriesViewer', 'questionX', 'Question {n}').replace('{n}', String(idx + 1))}: ${q}. `; });
    } else if (slide.type === 'action' && slide.steps) {
      text += slide.content + ' ';
      slide.steps.forEach((step, idx) => { text += `${t('devotionalSeriesViewer', 'stepX', 'Step {n}').replace('{n}', String(idx + 1))}: ${step}. `; });
    } else {
      text += slide.content || '';
    }
    return text;
  };

  const stopSpeaking = () => {
    if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      speechSynthesisRef.current = null;
    }
    if (ttsAudioRef.current) {
      ttsAudioRef.current.onended = null;
      ttsAudioRef.current.onerror = null;
      ttsAudioRef.current.pause();
    }
    setIsSpeaking(false);
    shouldAutoAdvanceRef.current = false;
  };

  // (Narration + per-slide auto-advance now handled by <HighQualityAudioPlayer> onComplete.)

  // Navigation
  const goToNextSlide = () => {
    if (currentSlide < slides.length - 1) {
      // Stop any ongoing speech when navigating
      stopSpeaking();
      setCurrentSlide(prev => prev + 1);
      setTimeElapsed(0);
    } else {
      handleSlideComplete();
    }
  };

  const goToPrevSlide = () => {
    if (currentSlide > 0) {
      // Stop any ongoing speech when navigating
      stopSpeaking();
      setCurrentSlide(prev => prev - 1);
      setTimeElapsed(0);
    }
  };

  // Swipe to navigate slides
  const swipeHandlers = useSwipe({
    onSwipeLeft:  goToNextSlide,
    onSwipeRight: goToPrevSlide,
  });

  const handleSlideComplete = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    stopSpeaking();
    markDayComplete();
  };

  // Header button + SINGLE tap = toggle pause/resume the whole viewer. Background
  // music and the narration player both follow `isPaused` (HighQualityAudioPlayer
  // takes a `paused` prop), so narration RESUMES only if it was already playing.
  const togglePause = () => setIsPaused(prev => !prev);
  // DOUBLE tap = read the devotional aloud from the beginning (starts narration).
  const playNarration = () => { setIsPaused(false); setShouldAutoPlay(true); };
  const handleViewerTap = useTapGesture(togglePause, playNarration);

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getSlideIcon = (type: string) => {
    switch (type) {
      case 'intro':
        return <Sparkles className="h-6 w-6" />;
      case 'passage':
        return <BookOpen className="h-6 w-6" />;
      case 'devotional':
        return <Heart className="h-6 w-6" />;
      case 'reflection':
        return <Sparkles className="h-6 w-6" />;
      case 'prayer':
        return <Heart className="h-6 w-6" />;
      case 'action':
        return <CheckCircle className="h-6 w-6" />;
      case 'additional':
        return <BookOpen className="h-6 w-6" />;
      case 'spirit':
        return <Flame className="h-6 w-6" />;
      case 'closing':
        return <CheckCircle className="h-6 w-6" />;
      default:
        return <BookOpen className="h-6 w-6" />;
    }
  };

  // Get background music URL
  const getMusicUrl = () => {
    const musicId = currentDay?.background_music_id || selectedSeries?.background_music_id;
    if (musicId) {
      const track = instrumentalTracks.find(item => item.id === String(musicId));
      if (track) return track.file_url;
    }
    return instrumentalTracks[0]?.file_url || '';
  };

  // Timezone and date utilities
  const getUserTimezone = (): string => {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  };

  const getCalendarDay = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-CA');
  };

  const getDaysSinceCompletion = (completedAt: string): number => {
    // Parse both dates and normalize to start of day in UTC
    // This avoids timezone and locale issues
    const completedDate = new Date(completedAt);
    const today = new Date();
    
    // Get UTC midnight for both dates
    const completedDayUTC = Date.UTC(
      completedDate.getUTCFullYear(),
      completedDate.getUTCMonth(),
      completedDate.getUTCDate()
    );
    
    const todayDayUTC = Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate()
    );
    
    // Calculate the difference in milliseconds, then convert to days
    const diffTime = todayDayUTC - completedDayUTC;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  };

  const getDayUnlockMessage = (dayNumber: number): string | null => {
    if (dayNumber === 1) return null;
    if (!progress) return t('devotionals', 'startToUnlock');
    
    const previousDayNumber = dayNumber - 1;
    const isPreviousDayCompleted = progress.completed_days.includes(previousDayNumber);
    
    if (!isPreviousDayCompleted) {
      return `${t('devotionals', 'completeDay')} ${previousDayNumber} ${t('devotionals', 'first')}`;
    }
    
    const previousDayData = progress.completed_days_data?.find(d => d.day === previousDayNumber);
    if (!previousDayData) return null;
    
    const daysSince = getDaysSinceCompletion(previousDayData.completed_at);
    if (daysSince < 1) {
      return t('devotionals', 'unlocksTomorrow');
    }
    
    return null;
  };

  // A series id from a shared link (/devotional-series/:id), consumed once.
  const [deepLinkSeriesId] = useState<string | null>(() => consumeDeepLink('devotional-series')?.id ?? null);
  const firstLoadRef = useRef(true);

  // useEffects
  useEffect(() => {
    loadCategories();
    if (seriesId) {
      loadSeries(seriesId);
    } else if (firstLoadRef.current && deepLinkSeriesId) {
      // Initial load for a shared link is handled by the deep-link effect below
      // (loads the list first, then opens the shared series).
    } else {
      loadAllSeries();
    }
    firstLoadRef.current = false;
  }, [seriesId, filterCategory, language]);

  // Open a series arriving from a shared link, keeping the list populated so
  // "back" still works.
  useEffect(() => {
    if (!deepLinkSeriesId) return;
    (async () => {
      await loadAllSeries();
      await loadSeries(deepLinkSeriesId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flush any progress saved while offline once we're back online.
  useEffect(() => {
    flushPendingProgress(supabase);
    const onReconnect = () => flushPendingProgress(supabase);
    window.addEventListener('online', onReconnect);
    return () => window.removeEventListener('online', onReconnect);
  }, []);

  // Tell the app shell when the immersive reading view is active so it can hide
  // floating UI (e.g. the Stats button) while a devotional is playing.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('viewer:active', { detail: view === 'reading' }));
  }, [view]);
  useEffect(() => () => {
    window.dispatchEvent(new CustomEvent('viewer:active', { detail: false }));
  }, []);

  useEffect(() => {
    if (selectedSeries && progress && user && profile) {
      handleDevotionalSeriesStart(selectedSeries, progress);
    }
  }, [selectedSeries, progress, user, profile]);

  // Timer for overall elapsed time
  useEffect(() => {
    if (!isPaused && isPlaying && !spiritPrayerMode && view === 'reading') {
      timerRef.current = setInterval(() => {
        setTimeElapsed(prev => prev + 1);
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isPaused, isPlaying, spiritPrayerMode, view]);

  // Spirit prayer timer
  useEffect(() => {
    let spiritTimer: NodeJS.Timeout;
    if (spiritPrayerMode) {
      spiritTimer = setInterval(() => {
        setSpiritPrayerTime(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (spiritTimer) clearInterval(spiritTimer);
    };
  }, [spiritPrayerMode]);

  // Audio management
  useEffect(() => {
    if (audioRef.current && view === 'reading') {
      audioRef.current.volume = isMuted ? 0 : volume;
      // Audio plays only after an explicit start and while not paused.
      if (audioStarted && !isPaused) {
        audioRef.current.play().catch(() => {});
      } else {
        audioRef.current.pause();
      }
    }
  }, [audioStarted, isPaused, isMuted, volume, view]);

  // Save volume to localStorage
  useEffect(() => {
    localStorage.setItem('devotional-volume', volume.toString());
    if (ttsAudioRef.current) ttsAudioRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  // Auto-advance timer
  const goToNextSlideRef = useRef(goToNextSlide);
  useEffect(() => { goToNextSlideRef.current = goToNextSlide; }, [goToNextSlide]);

  useEffect(() => {
    if (autoAdvance && !isPaused && !spiritPrayerMode && currentSlide < slides.length - 1 && !isSpeaking && !isAudioActive && !isAudioLoading && view === 'reading') {
      const duration = slides[currentSlide]?.duration || 30;
      setSlideTimeRemaining(duration);

      const interval = setInterval(() => {
        setSlideTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            goToNextSlideRef.current();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      autoAdvanceTimerRef.current = interval;
      return () => clearInterval(interval);
    } else {
      if (autoAdvanceTimerRef.current) {
        clearInterval(autoAdvanceTimerRef.current);
      }
      setSlideTimeRemaining(0);
    }
  }, [autoAdvance, isPaused, currentSlide, spiritPrayerMode, slides.length, isSpeaking, isAudioActive, isAudioLoading, view]);

  // Auto-scroll — steady fixed speed (px/sec). Ported from DevotionalModule so it
  // actually moves on mobile/WebView and only pauses on a real user scroll, not on touch.
  useEffect(() => {
    const slideType = slides[currentSlide]?.type;
    if (!autoScroll || isPaused || isUserScrolling || view !== 'reading') return;
    if (slideType !== 'devotional' && slideType !== 'additional') return;
    const element = contentRef.current;
    if (!element) return;
    if (element.scrollHeight - element.clientHeight <= 0) return;

    lastAutoTopRef.current = element.scrollTop;

    const pixelsPerSecond = scrollSpeed === 'slow' ? 3 : 5;
    let lastTime: number | null = null;
    let animationFrameId: number;
    let pos = element.scrollTop;

    const animate = (currentTime: number) => {
      if (lastTime === null) lastTime = currentTime;
      const deltaMs = currentTime - lastTime;
      lastTime = currentTime;

      const el = contentRef.current;
      if (!el || isUserScrollingRef.current) return;

      const maxScroll = el.scrollHeight - el.clientHeight;
      pos = Math.min(pos + (pixelsPerSecond * deltaMs) / 1000, maxScroll);
      el.scrollTop = pos;
      lastAutoTopRef.current = el.scrollTop;

      if (pos < maxScroll - 0.5) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [autoScroll, isPaused, isUserScrolling, currentSlide, scrollSpeed, view]);

  // Pause auto-scroll only when the user ACTUALLY scrolls (position drifts beyond what
  // auto-scroll set). The old touchstart handler killed scrolling on first touch — that was
  // the freeze. Drift detection lets reading-taps through while still yielding to real drags.
  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const handleScroll = () => {
      const drift = Math.abs(element.scrollTop - lastAutoTopRef.current);
      if (drift <= 4) return;

      setIsUserScrolling(true);
      isUserScrollingRef.current = true;
      if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);

      const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 20;
      if (atBottom && autoAdvance && currentSlide < slides.length - 1) {
        userScrollTimeoutRef.current = setTimeout(() => {
          setIsUserScrolling(false);
          isUserScrollingRef.current = false;
          goToNextSlideRef.current();
        }, 1200);
      } else {
        userScrollTimeoutRef.current = setTimeout(() => {
          setIsUserScrolling(false);
          isUserScrollingRef.current = false;
        }, 2000);
      }
    };

    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      element.removeEventListener('scroll', handleScroll);
      if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
    };
  }, [currentSlide, autoAdvance, slides.length]);

  // Reset scroll position when slide changes
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
      setIsUserScrolling(false);
      isUserScrollingRef.current = false;
      lastAutoTopRef.current = 0;
    }
  }, [currentSlide]);

  // Data loading functions
  const loadCategories = async () => {
    try {
      const { data } = await cachedRead<Category[]>('devotional_categories', async () => {
        const { data, error } = await supabase
          .from('devotional_categories')
          .select('*')
          .eq('is_active', true)
          .order('display_order');

        if (error) throw error;
        return data || [];
      });
      setCategories(data || []);
    } catch (err) {
      console.error('Error loading categories:', err);
    }
  };

  const loadAllSeries = async () => {
    setLoading(true);
    try {
      const { data } = await cachedRead<Series[]>(`devotional_series_list_${filterCategory}`, async () => {
        let query = supabase
          .from('devotional_series')
          .select('*')
          .eq('is_published', true)
          .order('is_featured', { ascending: false })
          .order('created_at', { ascending: false });

        if (filterCategory !== 'all') {
          query = query.eq('category_id', filterCategory);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
      });
      setAllSeries(data || []);
      setView('list');
    } catch (err) {
      console.error('Error loading series:', err);
      toast({ title: t('errors', 'generic'), description: t('devotionals', 'loadError'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadSeries = async (id: string) => {
    setLoading(true);
    try {
      const { data: seriesData } = await cachedRead<Series>(`devotional_series_one_${id}`, async () => {
        const { data, error } = await supabase
          .from('devotional_series')
          .select('*')
          .eq('id', id)
          .single();
        if (error) throw error;
        return data;
      });
      setSelectedSeries(seriesData);

      const { data: daysData } = await cachedRead<SeriesDay[]>(`devotional_entries_${id}_${language}`, async () => {
        const { data, error } = await supabase
          .from('devotional_entries')
          .select('*')
          .eq('series_id', id)
          // Load ALL days regardless of translation state. localizeDay() below
          // swaps in translated fields per language and falls back to English for
          // anything not yet translated — so a not-yet-translated series reads in
          // English instead of showing empty (the old filter hid untranslated days).
          .order('day_number');
        if (error) throw error;
        return data || [];
      });
      setDays(daysData || []);

      if (user) {
        // Progress is user-specific; if the network is unavailable, fall back to
        // the localStorage backup written by markDayComplete so offline reading
        // still resumes at the right day.
        let progressData: any = null;
        try {
          const res = await supabase
            .from('devotional_user_progress')
            .select('*')
            .eq('user_id', user.id)
            .eq('series_id', id)
            .maybeSingle();
          progressData = res.data;
        } catch {
          progressData = null;
        }

        if (!progressData) {
          try {
            const backup = localStorage.getItem(`devotional_progress_${user.id}_${id}`);
            if (backup) progressData = JSON.parse(backup);
          } catch { /* ignore */ }
        }

        if (progressData) {
          const completedDaysData = progressData.completed_days_data || 
            (progressData.completed_days || []).map((day: number) => ({
              day,
              completed_at: progressData.last_read_at || progressData.started_at
            }));

          setProgress({
            current_day: progressData.current_day,
            completed_days: progressData.completed_days || [],
            completed_days_data: completedDaysData,
            is_completed: progressData.is_completed,
            started_at: progressData.started_at,
            last_read_at: progressData.last_read_at
          });
        }
      }

      setView('series');
    } catch (err) {
      console.error('Error loading series:', err);
      toast({ title: t('errors', 'generic'), description: t('devotionals', 'loadError'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const startSeries = async () => {
    if (!user || !selectedSeries) {
      toast({ 
        title: t('auth', 'signInRequired'), 
        description: t('devotionals', 'signInToStart'), 
        variant: 'destructive' 
      });
      return;
    }

    try {
      // CRITICAL FIX: Validate the upsert succeeded
      const { data: upsertData, error: upsertError } = await supabase
        .from('devotional_user_progress')
        .upsert({
          user_id: user.id,
          series_id: selectedSeries.id,
          current_day: 1,
          completed_days: [],
          completed_days_data: [],
          started_at: new Date().toISOString(),
          is_completed: false
        }, { 
          onConflict: 'user_id,series_id' 
        })
        .select();  // IMPORTANT: Get the result

      // Check if upsert succeeded
      if (upsertError) {
        console.error('Failed to start series:', upsertError);
        toast({
          title: t('errors', 'generic') || t('devotionalSeriesViewer', 'error', 'Error'),
          description: t('devotionalSeriesViewer', 'failedToStartSeriesX', 'Failed to start series: {msg}').replace('{msg}', String(upsertError.message)),
          variant: 'destructive',
          duration: 7000
        });
        return;
      }

      // Verify record was created
      if (!upsertData || upsertData.length === 0) {
        console.error('Upsert returned no data');
        toast({
          title: t('errors', 'generic') || t('devotionalSeriesViewer', 'error', 'Error'),
          description: t('devotionalSeriesViewer', 'failedToInitProgress', 'Failed to initialize your progress. Please try again.'),
          variant: 'destructive',
          duration: 7000
        });
        return;
      }

      console.log('✅ Series started successfully:', upsertData[0]);

      // Only update local state if database operation succeeded
      setProgress({
        current_day: 1,
        completed_days: [],
        completed_days_data: [],
        is_completed: false,
        started_at: new Date().toISOString()
      });

      // Post to community activity
      if (profile) {
        await handleDevotionalSeriesStart(selectedSeries, {
          current_day: 1,
          completed_days: [],
          completed_days_data: [],
          is_completed: false,
          started_at: new Date().toISOString()
        });
      }

      const firstDay = days.find(d => d.day_number === 1);
      if (firstDay) {
        openDayEnhanced(firstDay);
      }
    } catch (err) {
      console.error('Error starting series:', err);
      toast({ 
        title: t('errors', 'generic'), 
        description: t('devotionals', 'startError') || t('devotionalSeriesViewer', 'failedToStartSeries', 'Failed to start series'),
        variant: 'destructive',
        duration: 7000
      });
    }
  };

  const openDay = (dayNumber: number) => {
    if (!progress && dayNumber > 1) {
      toast({ 
        title: t('devotionals', 'startFirst'), 
        description: t('devotionals', 'startFirstDesc'), 
        variant: 'destructive' 
      });
      return;
    }

    const isUnlocked = isDayUnlocked(dayNumber);

    if (!isUnlocked) {
      const previousDayNumber = dayNumber - 1;
      const isPreviousDayCompleted = progress?.completed_days.includes(previousDayNumber);
      
      if (!isPreviousDayCompleted) {
        toast({ 
          title: t('devotionals', 'dayLocked'), 
          description: `${t('devotionals', 'completeDay')} ${previousDayNumber} ${t('devotionals', 'toUnlock')}`, 
          variant: 'destructive' 
        });
      } else {
        const previousDayData = progress?.completed_days_data?.find(d => d.day === previousDayNumber);
        if (previousDayData) {
          const daysSince = getDaysSinceCompletion(previousDayData.completed_at);
          if (daysSince === 0) {
            toast({ 
              title: t('devotionals', 'dayLocked'), 
              description: t('devotionals', 'unlocksTomorrowDesc'), 
              variant: 'destructive',
              duration: 5000
            });
          }
        }
      }
      return;
    }

    const day = days.find(d => d.day_number === dayNumber);
    if (day) {
      openDayEnhanced(day);
    }
  };

  const openDayEnhanced = (day: SeriesDay) => {
    setCurrentDay(day);
    const newSlides = buildSlides(day);
    setSlides(newSlides);
    setCurrentSlide(0);
    setTimeElapsed(0);
    setSpiritPrayerMode(false);
    setSpiritPrayerTime(0);
    setIsPlaying(true);
    setIsPaused(false);
    setView('reading');
  };

  const handleDevotionalSeriesStart = async (series: Series, progress: UserProgress) => {
    if (!user || !profile) return;
    
    if (!hasPostedSeriesStart && progress.completed_days.length === 0) {
      try {
        await postDevotionalStarted(
          user.id,
          profile.full_name || profile.email || 'Anonymous',
          profile.avatar_url,
          series.id,
          series.title,
          series.total_days
        );
        setHasPostedSeriesStart(true);
      } catch (error) {
        console.error('Error posting devotional start:', error);
      }
    }
  };

  const handleDevotionalDayComplete = async (
    day: SeriesDay,
    series: Series,
    progress: UserProgress
  ) => {
    if (!user || !profile) return;

    try {
      await postDevotionalDayCompleted(
        user.id,
        profile.full_name || profile.email || 'Anonymous',
        profile.avatar_url,
        series.id,
        series.title,
        day.day_number,
        series.total_days
      );

      const newCompletedDays = [...new Set([...progress.completed_days, day.day_number])];
      const isSeriesComplete = newCompletedDays.length >= series.total_days;

      if (isSeriesComplete) {
        await postDevotionalCompleted(
          user.id,
          profile.full_name || profile.email || 'Anonymous',
          profile.avatar_url,
          series.id,
          series.title,
          series.total_days
        );
      }
    } catch (error) {
      console.error('Error posting devotional day completion:', error);
    }
  };

  const markDayComplete = async () => {
    if (!user || !selectedSeries || !currentDay || !progress) return;

    try {
      const completedAt = new Date().toISOString();
      const completionEntry = { day: currentDay.day_number, completed_at: completedAt };
      
      const newCompletedDays = [...new Set([...progress.completed_days, currentDay.day_number])];
      const newCompletedDaysData = [
        ...(progress.completed_days_data || []).filter(d => d.day !== currentDay.day_number),
        completionEntry
      ];
      
      const isSeriesComplete = newCompletedDays.length >= selectedSeries.total_days;
      const nextDay = currentDay.day_number + 1;

      const progressPayload = {
        user_id: user.id,
        series_id: selectedSeries.id,
        completed_days: newCompletedDays,
        completed_days_data: newCompletedDaysData,
        current_day: isSeriesComplete ? currentDay.day_number : nextDay,
        is_completed: isSeriesComplete,
        last_read_at: completedAt,
        started_at: progress.started_at || new Date().toISOString()  // Preserve original start date
      };

      if (!navigator.onLine) {
        // OFFLINE: persist locally and queue the upsert for the next reconnect.
        // The reading experience stays "fully functional" without a network.
        queuePendingProgress({
          table: 'devotional_user_progress',
          data: progressPayload,
          onConflict: 'user_id,series_id'
        });
        toast({
          title: t('devotionals', 'dayComplete') || t('devotionalSeriesViewer', 'savedOffline', 'Saved Offline'),
          description: t('devotionalSeriesViewer', 'savedOfflineDesc', 'Your progress is saved on this device and will sync when you reconnect.')
        });
      } else {
        // ONLINE: Use UPSERT (fixes "Progress not found") with validation.
        const { data: updateData, error: updateError } = await supabase
          .from('devotional_user_progress')
          .upsert(progressPayload, { onConflict: 'user_id,series_id' })
          .select();  // IMPORTANT: Get the result to verify success

        if (updateError) {
          // Likely a transient/connectivity failure — fall back to the offline
          // queue instead of blocking the user, then continue the normal flow.
          console.error('Failed to save devotional progress, queuing offline:', updateError);
          queuePendingProgress({
            table: 'devotional_user_progress',
            data: progressPayload,
            onConflict: 'user_id,series_id'
          });
        } else if (!updateData || updateData.length === 0) {
          console.error('Upsert returned no data - unexpected error');
          toast({
            title: t('errors', 'saveFailed') || t('devotionalSeriesViewer', 'saveFailed', 'Save Failed'),
            description: t('devotionalSeriesViewer', 'failedToSaveProgress', 'Failed to save your progress. Please try again.'),
            variant: 'destructive',
            duration: 7000
          });
          return;
        } else {
          console.log('✅ Progress saved successfully:', updateData[0]);
          // Post community activity (online only)
          await handleDevotionalDayComplete(currentDay, selectedSeries, progress);
        }
      }

      // Update local state (online success OR offline/queued save)
      const updatedProgress = {
        ...progress,
        completed_days: newCompletedDays,
        completed_days_data: newCompletedDaysData,
        current_day: isSeriesComplete ? currentDay.day_number : nextDay,
        is_completed: isSeriesComplete,
        last_read_at: completedAt
      };
      
      setProgress(updatedProgress);

      // BONUS: Backup to localStorage for offline resilience
      try {
        const backupKey = `devotional_progress_${user.id}_${selectedSeries.id}`;
        localStorage.setItem(backupKey, JSON.stringify(updatedProgress));
      } catch (storageError) {
        console.warn('Failed to backup progress to localStorage:', storageError);
        // Not critical - don't show error to user
      }

      if (isSeriesComplete) {
        toast({ 
          title: t('devotionals', 'seriesComplete'), 
          description: `${t('devotionals', 'congratulations')} "${selectedSeries.title}"` 
        });
        setShowCompletionModal(true);
        setTimeout(() => {
          setView('series');
          setCurrentDay(null);
        }, 1000);
      } else {
        toast({ 
          title: t('devotionals', 'dayComplete'), 
          description: `${t('devotionals', 'day')} ${currentDay.day_number} ${t('devotionals', 'complete')}.`
        });
        
        // Show share prompt before navigating away
        setShowDayShareModal(true);
        setTimeout(() => {
          setView('series');
          setCurrentDay(null);
          setUnlockMessage(null);
        }, 2000);
      }
    } catch (err) {
      console.error('Error marking day complete:', err);
      toast({ 
        title: t('errors', 'generic'), 
        description: t('devotionals', 'completeError') || t('devotionalSeriesViewer', 'errorSavingProgress', 'An error occurred while saving your progress'),
        variant: 'destructive',
        duration: 7000
      });
    }
  };

  const isDayUnlocked = (dayNumber: number): boolean => {
    if (dayNumber === 1) return true;
    if (!progress) return false;
    
    const previousDayNumber = dayNumber - 1;
    const isPreviousDayCompleted = progress.completed_days.includes(previousDayNumber);
    
    if (!isPreviousDayCompleted) {
      return false;
    }
    
    const previousDayData = progress.completed_days_data?.find(d => d.day === previousDayNumber);
    
    if (!previousDayData) {
      return true;
    }
    
    const daysSinceCompletion = getDaysSinceCompletion(previousDayData.completed_at);
    
    return daysSinceCompletion >= 1;
  };

  const isDayCompleted = (dayNumber: number): boolean => {
    return progress?.completed_days.includes(dayNumber) || false;
  };

  const getProgressPercentage = (): number => {
    if (!progress || !selectedSeries) return 0;
    return Math.round((progress.completed_days.length / selectedSeries.total_days) * 100);
  };

  const getDifficultyColor = (level: string) => {
    switch (level) {
      case 'beginner': return 'bg-green-100 text-green-700';
      case 'intermediate': return 'bg-yellow-100 text-yellow-700';
      case 'advanced': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const filteredSeries = allSeries.filter(s => {
    const localized = getLocalizedSeries(s);
    return (
      localized.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      localized.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  // Enhanced Reading View - Slide Format with DevotionalModule features
  if (view === 'reading' && currentDay && selectedSeries && slides.length > 0) {
    const currentSlideData = slides[currentSlide];
    const progressPercent = ((currentSlide + 1) / slides.length) * 100;

    return (
      <div
        {...swipeHandlers}
        onClick={handleViewerTap}
        className="fixed inset-0 z-[70] flex flex-col overflow-x-hidden"
        style={{
          backgroundImage: `url(${peacefulBackgrounds[backgroundIndex]})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          touchAction: 'pan-y'
        }}
      >
        {/* Overlay for readability */}
        <div className="absolute inset-0 bg-black/40" />

        {/* First-run gesture onboarding tip (once per user). */}
        <ViewerGestureTip show={gestureTip.show} onDismiss={gestureTip.dismiss} message={t('viewers', 'gestureTipReadAloud', 'Double-tap to hear it read aloud · single tap to pause/resume')} />

        {/* Paused hint — single tap to resume */}
        <div className={`pointer-events-none fixed inset-0 z-40 flex items-center justify-center transition-opacity duration-200 ${isPaused ? 'opacity-100' : 'opacity-0'}`}>
          <div className={`flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-sm transition-transform duration-200 ${isPaused ? 'scale-100' : 'scale-95'}`}>
            <Pause className="h-4 w-4" />
            {t('viewers', 'pausedTapResume', 'Paused — tap to resume')}
          </div>
        </div>

        {/* Background Audio */}
        <audio
          ref={audioRef}
          src={getMusicUrl()}
          loop
          preload="auto"
        />


        {/* Header */}
        <div className="relative z-10 flex items-center justify-between p-3 md:p-4 text-white gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setView('series');
                setCurrentDay(null);
                if (audioRef.current) audioRef.current.pause();
                stopSpeaking();
              }}
              className="text-white hover:bg-white/20 shrink-0"
            >
              <X className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="text-xs md:text-sm opacity-80 truncate">{getLocalizedSeries(selectedSeries).title}</p>
              <p className="text-xs opacity-60">{t('devotionalSeriesViewer', 'dayXOfY', 'Day {day} of {total}').replace('{day}', String(currentDay.day_number)).replace('{total}', String(selectedSeries.total_days))}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Distinct "Read aloud" button — starts narration (same as a
                double-tap); when reading, it pauses. Reflects the player's state. */}
            <Button
              variant="ghost"
              size="sm"
              data-no-tap
              onClick={() => {
                if ((isSpeaking || isAudioActive) && !isPaused) {
                  setIsPaused(true);
                } else {
                  setIsPaused(false);
                  setShouldAutoPlay(true);
                }
              }}
              className={`gap-1.5 rounded-full text-white hover:bg-white/20 ${(isSpeaking || isAudioActive) && !isPaused ? 'bg-white/20' : ''}`}
              title={t('devotionals', 'readAloud', 'Read aloud')}
            >
              <Headphones className="h-5 w-5" />
              <span className="hidden sm:inline text-sm font-medium">
                {(isSpeaking || isAudioActive) && !isPaused
                  ? t('devotionals', 'reading', 'Reading…')
                  : t('devotionals', 'readAloud', 'Read aloud')}
              </span>
            </Button>

            {/* High-Quality Audio Player — same inline controls as DevotionalModule */}
            <HighQualityAudioPlayer
              text={getDevotionalAudioText()}
              contentId={`${selectedSeries.id}-d${currentDay.day_number}`}
              contentType="devotional"
              autoLoad={true}
              autoPlay={shouldAutoPlay}
              paused={isPaused}
              currentSlide={currentSlide}
              className=""
              onSpeakingChange={(speaking) => {
                setIsSpeaking(speaking);
                if (speaking) setShouldAutoPlay(true);
              }}
              onPlayingChange={(playing) => {
                setIsAudioActive(playing);
                if (playing) setShouldAutoPlay(true);
              }}
              onLoadingChange={(loading) => setIsAudioLoading(loading)}
              onComplete={() => {
                const cur = currentSlideRef.current;
                setTimeout(() => {
                  if (cur < slides.length - 1) {
                    goToNextSlide();
                  } else {
                    setShouldAutoPlay(false);
                  }
                }, 1500);
              }}
            />

            {/* Pause/Resume Timer */}
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePause}
              className="text-white hover:bg-white/20"
              title={isPaused ? t('devotionalSeriesViewer', 'resume', 'Resume') : t('devotionalSeriesViewer', 'pauseTimer', 'Pause timer')}
            >
              {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowShareModal(true)}
              className="text-white hover:bg-white/20"
              title={t('devotionalSeriesViewer', 'shareDevotional', 'Share devotional')}
            >
              <Share2 className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="relative z-10 px-4">
          <Progress value={progressPercent} className="h-1 bg-white/30" />
          <div className="flex justify-between mt-2 text-xs text-white/70">
            <div className="flex items-center gap-2">
              <span>{t('devotionalSeriesViewer', 'slideXOfY', 'Slide {current} of {total}').replace('{current}', String(currentSlide + 1)).replace('{total}', String(slides.length))}</span>
              {autoAdvance && slideTimeRemaining > 0 && (
                <span className="flex items-center gap-1 text-amber-300">
                  <Timer className="h-3 w-3" />
                  {formatTime(slideTimeRemaining)}
                </span>
              )}
            </div>
            <span>{formatTime(timeElapsed)}</span>
          </div>
          
          {/* Settings Bar */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 mt-3 text-xs">
            <button
              onClick={() => setAutoAdvance(!autoAdvance)}
              className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                autoAdvance ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/70'
              }`}
              title={t('devotionalSeriesViewer', 'autoAdvanceSlides', 'Auto-advance slides')}
            >
              <FastForward className="h-3 w-3" />
              {t('devotionalSeriesViewer', 'autoAdvance', 'Auto-advance')} {autoAdvance ? t('devotionalSeriesViewer', 'on', 'ON') : t('devotionalSeriesViewer', 'off', 'OFF')}
            </button>
            
            {(currentSlideData.type === 'devotional' || currentSlideData.type === 'additional') && (
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                  autoScroll ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/70'
                }`}
                title={t('devotionalSeriesViewer', 'autoScrollContent', 'Auto-scroll content')}
              >
                <BookOpen className="h-3 w-3" />
                {t('devotionalSeriesViewer', 'autoScroll', 'Auto-scroll')} {autoScroll ? t('devotionalSeriesViewer', 'on', 'ON') : t('devotionalSeriesViewer', 'off', 'OFF')}
              </button>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-4 md:p-6 overflow-hidden">
          <div className="max-w-2xl w-full text-center text-white overflow-hidden">
            {/* Slide Icon */}
            <div className="mb-4 flex justify-center">
              <div className="p-3 rounded-full bg-white/20 backdrop-blur-sm">
                {getSlideIcon(currentSlideData.type)}
              </div>
            </div>

            {/* Slide Title */}
            <h2 className="text-xl md:text-2xl lg:text-3xl font-serif font-bold mb-4 md:mb-6 px-2 break-words">
              {currentSlideData.title}
            </h2>

            {/* Scripture (if passage slide) — resolves to a published Bible
                version in the reader's language by reference. */}
            {currentSlideData.scripture && (
              <SlideScripture
                reference={currentSlideData.scripture}
                text={currentSlideData.scriptureText}
                version={currentSlideData.scriptureVersion}
              />
            )}

            {/* Main Content */}
            <div className="mb-6">
              {currentSlideData.type === 'devotional' ? (
                <div 
                  ref={contentRef}
                  className="relative text-left bg-white/10 backdrop-blur-sm rounded-xl p-6 md:p-7 max-h-[55vh] md:max-h-[65vh] overflow-y-auto scroll-smooth"
                  style={{ 
                    WebkitOverflowScrolling: 'touch',
                    touchAction: 'pan-y',
                    overscrollBehavior: 'contain'
                  }}
                >
                  {autoScroll && !isUserScrolling && (
                    <div className="absolute top-2 right-2 text-xs text-white/50 flex items-center gap-1">
                      <BookOpen className="h-3 w-3" />
                      {t('devotionalSeriesViewer', 'autoScrolling', 'Auto-scrolling...')}
                    </div>
                  )}
                  <p className="text-lg md:text-xl lg:text-2xl leading-relaxed whitespace-pre-wrap">
                    {currentSlideData.content}
                  </p>
                  <button
                    onClick={() => setShowSlideShareModal(true)}
                    className="mt-4 flex items-center gap-1.5 text-xs text-white/60 hover:text-white/90 transition-colors"
                    title={t('devotionalSeriesViewer', 'shareThisDevotional', 'Share this devotional')}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    {t('devotionalSeriesViewer', 'shareThisDevotional', 'Share this devotional')}
                  </button>
                </div>
              ) : currentSlideData.type === 'reflection' && currentSlideData.questions ? (
                <div className="text-left bg-white/10 backdrop-blur-sm rounded-xl p-6 max-h-[55vh] md:max-h-[65vh] overflow-y-auto">
                  <p className="mb-4 opacity-80">{currentSlideData.content}</p>
                  <ol className="list-decimal list-inside space-y-3">
                    {currentSlideData.questions.map((q, idx) => (
                      <li key={idx} className="text-lg leading-relaxed">{q}</li>
                    ))}
                  </ol>
                </div>
              ) : currentSlideData.type === 'action' && currentSlideData.steps ? (
                <div className="text-left bg-white/10 backdrop-blur-sm rounded-xl p-6 max-h-[55vh] md:max-h-[65vh] overflow-y-auto">
                  <p className="mb-5 opacity-80 italic">{currentSlideData.content}</p>
                  <ol className="space-y-3">
                    {currentSlideData.steps.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
                          {idx + 1}
                        </span>
                        <span className="text-lg leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : currentSlideData.type === 'additional' ? (
                <div
                  ref={contentRef}
                  className="relative text-left bg-white/10 backdrop-blur-sm rounded-xl p-6 md:p-7 max-h-[50vh] md:max-h-[60vh] overflow-y-auto scroll-smooth"
                >
                  {autoScroll && !isUserScrolling && (
                    <div className="absolute top-2 right-2 text-xs text-white/50 flex items-center gap-1">
                      <BookOpen className="h-3 w-3" />
                      {t('devotionalSeriesViewer', 'autoScrolling', 'Auto-scrolling...')}
                    </div>
                  )}
                  <p className="text-lg md:text-xl lg:text-2xl leading-relaxed whitespace-pre-wrap">
                    {currentSlideData.content}
                  </p>
                </div>
              ) : currentSlideData.type === 'spirit' ? (
                <div className="space-y-6">
                  <p className="text-lg leading-relaxed whitespace-pre-wrap opacity-90">
                    {currentSlideData.content}
                  </p>
                  {spiritPrayerMode && (
                    <div className="flex flex-col items-center gap-4">
                      <div className="text-4xl font-bold">
                        {formatTime(spiritPrayerTime)}
                      </div>
                      <Flame className="h-12 w-12 text-amber-400 animate-pulse" />
                    </div>
                  )}
                  <Button
                    onClick={() => setSpiritPrayerMode(!spiritPrayerMode)}
                    variant={spiritPrayerMode ? "secondary" : "default"}
                    className={spiritPrayerMode ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-amber-500 hover:bg-amber-600 text-white border-2 border-amber-400 shadow-lg"}
                  >
                    <Flame className="h-4 w-4 mr-2" />
                    {spiritPrayerMode ? t('devotionalSeriesViewer', 'endPrayerTime', 'End Prayer Time') : t('devotionalSeriesViewer', 'beginPrayerTime', 'Begin Prayer Time')}
                  </Button>
                </div>
              ) : currentSlideData.type === 'prayer' ? (
                <div className="text-left bg-white/10 backdrop-blur-sm rounded-xl p-6"
                  style={{ 
                    WebkitOverflowScrolling: 'touch',
                    touchAction: 'pan-y',
                    overscrollBehavior: 'contain'
                  }}
                >
                  <p className="text-lg leading-relaxed whitespace-pre-wrap">
                    {currentSlideData.content}
                  </p>
                  <button
                    onClick={() => setShowSlideShareModal(true)}
                    className="mt-4 flex items-center gap-1.5 text-xs text-white/60 hover:text-white/90 transition-colors"
                    title={t('devotionalSeriesViewer', 'shareThisPrayer', 'Share this prayer')}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    {t('devotionalSeriesViewer', 'shareThisPrayer', 'Share this prayer')}
                  </button>
                </div>
              ) : (
                <p className="text-lg leading-relaxed whitespace-pre-wrap">
                  {currentSlideData.content}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Footer */}
        <div className="relative z-10 p-4 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={goToPrevSlide}
            disabled={currentSlide === 0}
            className="text-white hover:bg-white/20 disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5 mr-1" />
            {t('devotionalSeriesViewer', 'previous', 'Previous')}
          </Button>

          {/* Slide Indicators */}
          <div className="flex gap-1">
            {slides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentSlide(idx)}
                className={`w-2 h-2 rounded-full transition-all ${
                  idx === currentSlide 
                    ? 'bg-white w-6' 
                    : idx < currentSlide 
                      ? 'bg-white/70' 
                      : 'bg-white/30'
                }`}
              />
            ))}
          </div>

          {currentSlide === slides.length - 1 ? (
            <Button
              onClick={handleSlideComplete}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="h-5 w-5 mr-1" />
              {t('devotionalSeriesViewer', 'complete', 'Complete')}
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={goToNextSlide}
              className="text-white hover:bg-white/20"
            >
              {t('devotionalSeriesViewer', 'next', 'Next')}
              <ChevronRight className="h-5 w-5 ml-1" />
            </Button>
          )}
        </div>

        {/* Slide Content Share Modal */}
        {showSlideShareModal && currentDay && selectedSeries && (() => {
          const localizedDay = getLocalizedDay(currentDay);
          const localizedSeries = getLocalizedSeries(selectedSeries);
          const seriesUrl = `${window.location.origin}/devotional-series/${selectedSeries.id}`;
          const isDevo = currentSlideData.type === 'devotional';
          const isPrayer = currentSlideData.type === 'prayer';

          // Devotional: teaser (first ~200 chars) + scripture + link
          // Prayer: full prayer text (naturally short) + scripture + link
          // Localize the citation to the reader's language if the passage was
          // already fetched (it is, once the day has been viewed).
          const rawScriptureRef = localizedDay.scripture_reference || '';
          const scriptureRef = rawScriptureRef
            ? (getCachedLocalizedScripture(rawScriptureRef, language)?.reference || rawScriptureRef)
            : '';
          const teaser = isDevo
            ? currentSlideData.content.slice(0, 200).trimEnd() + (currentSlideData.content.length > 200 ? '…' : '')
            : currentSlideData.content;

          const dayLabel = localizedDay.title || t('devotionalSeriesViewer', 'dayN', 'Day {n}').replace('{n}', String(currentDay.day_number));
          const shareMessage = isDevo
            ? `📖 "${dayLabel}"${scriptureRef ? ` — ${scriptureRef}` : ''}\n\n${teaser}\n\n${t('devotionalSeriesViewer', 'readFullDevotional', 'Read the full devotional')}: ${seriesUrl}`
            : `🙏 "${dayLabel}" — ${t('devotionalSeriesViewer', 'guidedPrayer', 'Guided Prayer')}${scriptureRef ? `\n\n${scriptureRef}` : ''}\n\n${teaser}\n\n${t('devotionalSeriesViewer', 'joinMe', 'Join me')}: ${seriesUrl}`;

          const encodedMsg = encodeURIComponent(shareMessage);
          const encodedUrl = encodeURIComponent(seriesUrl);
          const shareTitle = isDevo
            ? t('devotionalSeriesViewer', 'shareThisDevotional', 'Share this devotional')
            : t('devotionalSeriesViewer', 'shareThisPrayer', 'Share this prayer');

          return (
            <Dialog open={showSlideShareModal} onOpenChange={setShowSlideShareModal}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Share2 className="h-5 w-5 text-purple-500" />
                    {shareTitle}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Preview of what will be shared */}
                  <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 whitespace-pre-wrap max-h-36 overflow-y-auto border">
                    {shareMessage}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <a
                      href={`https://wa.me/?text=${encodedMsg}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors text-sm font-medium"
                      onClick={() => setShowSlideShareModal(false)}
                    >
                      <Send className="h-4 w-4" />
                      WhatsApp
                    </a>
                    <a
                      href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedMsg}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                      onClick={() => setShowSlideShareModal(false)}
                    >
                      <span className="font-bold">f</span>
                      Facebook
                    </a>
                    <a
                      href={`https://twitter.com/intent/tweet?text=${encodedMsg}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-black hover:bg-gray-800 text-white rounded-lg transition-colors text-sm font-medium"
                      onClick={() => setShowSlideShareModal(false)}
                    >
                      <span className="font-bold">𝕏</span>
                      Twitter / X
                    </a>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(shareMessage);
                        toast({ title: t('devotionalSeriesViewer', 'copied', 'Copied!'), description: t('devotionalSeriesViewer', 'messageCopiedDesc', 'Message copied to clipboard') });
                        setShowSlideShareModal(false);
                      }}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors text-sm font-medium"
                    >
                      <Copy className="h-4 w-4" />
                      {t('devotionalSeriesViewer', 'copyMessage', 'Copy Message')}
                    </button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          );
        })()}

        {/* Share Modal */}
        {showShareModal && (
          <SocialShareModal
            isOpen={showShareModal}
            onClose={() => setShowShareModal(false)}
            title={getLocalizedSeries(selectedSeries).title}
            description={`${t('devotionalSeriesViewer', 'dayN', 'Day {n}').replace('{n}', String(currentDay.day_number))}: ${getLocalizedDay(currentDay).title}`}
            url={window.location.href}
          />
        )}
      </div>
    );
  }

  // Series Detail View (keeping original)
  if (view === 'series' && selectedSeries) {
    const localizedSeries = getLocalizedSeries(selectedSeries);
    const showSeriesFallback = selectedSeries.language && selectedSeries.language !== language;

    return (
      <div className="space-y-6">
        {showSeriesFallback && (
          <LanguageFallbackMessage
            contentLanguage={selectedSeries.language || 'en'}
            variant="banner"
          />
        )}

        {/* Series Header */}
        <Card className="overflow-hidden">
          {selectedSeries.cover_image_url ? (
            <div className="h-64 bg-gradient-to-br from-purple-500 to-pink-500">
              <img 
                src={selectedSeries.cover_image_url} 
                alt={localizedSeries.title}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="h-64 bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <BookOpen className="h-24 w-24 text-white/30" />
            </div>
          )}
          
          <CardContent className="p-4 md:p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-4 gap-3">
              <div className="flex-1 min-w-0">
                {selectedSeries.is_featured && (
                  <Badge className="bg-amber-500 mb-2">
                    <Star className="h-3 w-3 mr-1" />
                    {t('devotionals', 'featured')}
                  </Badge>
                )}
                <h1 className="text-2xl md:text-3xl font-serif font-bold mb-2 break-words">{localizedSeries.title}</h1>
                <p className="text-gray-600 text-sm md:text-base">{localizedSeries.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    if (onBack) {
                      onBack();
                    } else {
                      setView('list');
                      setSelectedSeries(null);
                    }
                  }}
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  {t('common', 'back')}
                </Button>
                <ShareButton
                  title={localizedSeries.title}
                  url={`${window.location.origin}/devotional-series/${selectedSeries.id}`}
                  variant="icon"
                />
              </div>
            </div>

            <div className="flex gap-4 mb-4 items-center flex-wrap">
              <Badge variant="outline">
                <Calendar className="h-3 w-3 mr-1" />
                {selectedSeries.total_days} {t('devotionals', 'days')}
              </Badge>
              <Badge className={getDifficultyColor(selectedSeries.difficulty_level)}>
                {selectedSeries.difficulty_level}
              </Badge>
              {selectedSeries.author && (
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <span>{t('devotionalSeriesViewer', 'byX', 'by {name}').replace('{name}', String(selectedSeries.author))}</span>
                  {selectedSeries.author_social_url && (
                    <a 
                      href={selectedSeries.author_social_url} 
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

            {/* Progress */}
            {progress && (
              <div className="bg-purple-50 p-4 rounded-lg mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-purple-900">{t('devotionals', 'yourProgress')}</span>
                  <span className="font-bold text-purple-600">{getProgressPercentage()}%</span>
                </div>
                <Progress value={getProgressPercentage()} className="mb-2" />
                <p className="text-sm text-purple-700">
                  {progress.completed_days.length} {t('devotionals', 'of')} {selectedSeries.total_days} {t('devotionals', 'daysCompleted')}
                </p>
              </div>
            )}

            {/* Start/Continue Button */}
            {!progress ? (
              <Button onClick={startSeries} className="w-full bg-purple-600 hover:bg-purple-700">
                <Play className="h-4 w-4 mr-2" />
                {t('devotionals', 'startSeries')}
              </Button>
            ) : progress.is_completed ? (
              <Button onClick={() => openDay(1)} variant="outline" className="w-full">
                <BookOpen className="h-4 w-4 mr-2" />
                {t('devotionals', 'readAgain')}
              </Button>
            ) : (
              <Button onClick={() => openDay(progress.current_day)} className="w-full bg-purple-600 hover:bg-purple-700">
                <Play className="h-4 w-4 mr-2" />
                {t('devotionals', 'continue')} {t('devotionals', 'day')} {progress.current_day}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Days List */}
        <h2 className="text-xl font-semibold mb-4">{t('devotionals', 'dailyDevotionals')}</h2>
        <div className="space-y-3">
          {days.map((day) => {
            const localizedDay = getLocalizedDay(day);
            const unlocked = isDayUnlocked(day.day_number);
            const completed = isDayCompleted(day.day_number);
            const isCurrent = progress?.current_day === day.day_number && !completed;
            const unlockMessage = !unlocked ? getDayUnlockMessage(day.day_number) : null;
            const showDayFallback = day.language && day.language !== language;

            return (
              <Card 
                key={day.id}
                className={`cursor-pointer transition-all ${
                  unlocked ? 'hover:shadow-md' : 'opacity-60 cursor-not-allowed'
                } ${isCurrent ? 'ring-2 ring-purple-500' : ''}`}
                onClick={() => openDay(day.day_number)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold ${
                      completed ? 'bg-green-100 text-green-700' :
                      unlocked ? 'bg-purple-100 text-purple-700' :
                      'bg-gray-100 text-gray-400'
                    }`}>
                      {completed ? <CheckCircle className="h-6 w-6" /> : 
                       unlocked ? day.day_number : <Lock className="h-5 w-5" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className="text-xs">{t('devotionals', 'day')} {day.day_number}</Badge>
                        {isCurrent && <Badge className="bg-purple-600 text-xs">{t('devotionals', 'current')}</Badge>}
                        {completed && <Badge className="bg-green-600 text-xs">{t('devotionals', 'complete')}</Badge>}
                        {showDayFallback && <LanguageFallbackBadge contentLanguage={day.language || 'en'} />}
                        {!unlocked && unlockMessage && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                            <Clock className="h-3 w-3 mr-1" />
                            {unlockMessage}
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-medium">{localizedDay.title || t('devotionals', 'untitled')}</h3>
                      <DayScriptureRef reference={localizedDay.scripture_reference} />
                    </div>
                    {unlocked ? (
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    ) : (
                      <Lock className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // Series List View (keeping original)
  return (
    <div className="space-y-6">
      {onBack && (
        <div className="flex items-center justify-end">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common', 'back')}
          </Button>
        </div>
      )}

      {/* Search and Filter Controls */}
      <SearchFilterPanel icon={<BookOpen className="h-6 w-6 text-white/60" />}>
        <div className="relative flex-1">
          <Search className={searchFilterIconClass} />
          <Input
            placeholder={t('devotionals', 'searchSeries')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={searchFilterInputClass}
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className={`w-full md:w-56 ${searchFilterSelectTriggerClass}`}>
            <SelectValue placeholder={t('devotionals', 'allCategories')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('devotionals', 'allCategories')}</SelectItem>
            {categories.map(cat => {
              const localized = getLocalizedCategory(cat);
              return (
                <SelectItem key={cat.id} value={cat.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: getCategoryColor(localized.name, cat.color) }}
                    />
                    {localized.name}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </SearchFilterPanel>

      {/* Featured Series */}
      {filteredSeries.filter(s => s.is_featured).length > 0 && (
        <div>
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-500" />
            {t('devotionals', 'featuredSeries')}
          </h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSeries.filter(s => s.is_featured).map(series => {
              const localized = getLocalizedSeries(series);
              const showFallback = series.language && series.language !== language;

              return (
                <Card 
                  key={series.id} 
                  className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => loadSeries(series.id)}
                >
                  {series.cover_image_url ? (
                    <div className="h-40 bg-gradient-to-br from-purple-500 to-pink-500">
                      <img src={series.cover_image_url} alt={localized.title} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="h-40 bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <BookOpen className="h-12 w-12 text-white/50" />
                    </div>
                  )}
                  <CardContent className="p-4">
                    <div className="flex gap-2 mb-2">
                      <Badge className="bg-amber-500">
                        <Star className="h-3 w-3 mr-1" />
                        {t('devotionals', 'featured')}
                      </Badge>
                      {showFallback && <LanguageFallbackBadge contentLanguage={series.language || 'en'} />}
                    </div>
                    <h3 className="font-semibold text-lg mb-1">{localized.title}</h3>
                    <p className="text-sm text-gray-600 line-clamp-2 mb-3">{localized.description}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2">
                        <Badge variant="outline">
                          <Calendar className="h-3 w-3 mr-1" />
                          {series.total_days} {t('devotionals', 'days')}
                        </Badge>
                        <Badge className={getDifficultyColor(series.difficulty_level)}>
                          {series.difficulty_level}
                        </Badge>
                      </div>
                      <ShareButton
                        title={localized.title}
                        url={`${window.location.origin}/devotional-series/${series.id}`}
                      />
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
        <h3 className="text-xl font-semibold mb-4">{t('devotionals', 'allSeries')}</h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSeries.filter(s => !s.is_featured).map(series => {
            const localized = getLocalizedSeries(series);
            const showFallback = series.language && series.language !== language;

            return (
              <Card 
                key={series.id} 
                className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => loadSeries(series.id)}
              >
                {series.cover_image_url ? (
                  <div className="h-32 bg-gradient-to-br from-purple-500 to-pink-500">
                    <img src={series.cover_image_url} alt={localized.title} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="h-32 bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <BookOpen className="h-10 w-10 text-white/50" />
                  </div>
                )}
                <CardContent className="p-4">
                  {showFallback && (
                    <div className="mb-2">
                      <LanguageFallbackBadge contentLanguage={series.language || 'en'} />
                    </div>
                  )}
                  <h3 className="font-semibold text-lg mb-1">{localized.title}</h3>
                  <p className="text-sm text-gray-600 line-clamp-2 mb-3">{localized.description}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <Badge variant="outline">
                        <Calendar className="h-3 w-3 mr-1" />
                        {series.total_days} {t('devotionals', 'days')}
                      </Badge>
                      <Badge className={getDifficultyColor(series.difficulty_level)}>
                        {series.difficulty_level}
                      </Badge>
                    </div>
                    <ShareButton
                      title={localized.title}
                      url={`${window.location.origin}/devotional-series/${series.id}`}
                    />
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
            <h3 className="text-lg font-medium mb-2">
              {searchTerm || filterCategory !== 'all' ? t('devotionals', 'noSeriesFound') : t('devotionals', 'noSeriesAvailable')}
            </h3>
            <p className="text-gray-500">
              {searchTerm || filterCategory !== 'all' 
                ? t('devotionals', 'tryAdjusting')
                : t('devotionals', 'checkBack')}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Day Share Modal */}
      {showDayShareModal && currentDay && selectedSeries && (() => {
        const localizedDay = getLocalizedDay(currentDay);
        const localizedSeries = getLocalizedSeries(selectedSeries);
        const rawScripture = localizedDay.scripture_reference;
        const scripture = rawScripture
          ? (getCachedLocalizedScripture(rawScripture, language)?.reference || rawScripture)
          : rawScripture;
        const shareUrl = `${window.location.origin}/devotional-series/${selectedSeries.id}`;
        // Compose a rich share message: title + scripture ref + series context + link
        const shareMessage = scripture
          ? `📖 ${t('devotionalSeriesViewer', 'justCompletedDayX', 'Just completed Day {n}').replace('{n}', String(currentDay.day_number))}: "${localizedDay.title || ''}" — ${scripture}\n\n${t('devotionalSeriesViewer', 'fromSeriesX', 'From the "{title}" devotional series on ReKindle BC.').replace('{title}', String(localizedSeries.title))}\n\n${shareUrl}`
          : `📖 ${t('devotionalSeriesViewer', 'justCompletedDayX', 'Just completed Day {n}').replace('{n}', String(currentDay.day_number))}: "${localizedDay.title || ''}"\n\n${t('devotionalSeriesViewer', 'fromSeriesX', 'From the "{title}" devotional series on ReKindle BC.').replace('{title}', String(localizedSeries.title))}\n\n${shareUrl}`;
        const encodedMsg = encodeURIComponent(shareMessage);
        const encodedUrl = encodeURIComponent(shareUrl);

        return (
          <Dialog open={showDayShareModal} onOpenChange={setShowDayShareModal}>
            <DialogContent className="sm:max-w-md text-center">
              <DialogHeader>
                <DialogTitle className="text-xl flex items-center justify-center gap-2">
                  <CheckCircle className="h-6 w-6 text-green-500" />
                  {t('devotionalSeriesViewer', 'dayXComplete', 'Day {n} Complete!').replace('{n}', String(currentDay.day_number))}
                </DialogTitle>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <p className="text-gray-600 text-sm">
                  {t('devotionalSeriesViewer', 'greatWorkFinishing', 'Great work finishing')} <span className="font-medium">"{localizedDay.title || t('devotionalSeriesViewer', 'dayN', 'Day {n}').replace('{n}', String(currentDay.day_number))}"</span>.
                  {scripture && (
                    <span className="block mt-1 text-purple-600 italic text-xs">{scripture}</span>
                  )}
                </p>
                <p className="text-sm font-medium text-gray-700">{t('devotionalSeriesViewer', 'shareYourProgress', 'Share your progress:')}</p>
                <div className="grid grid-cols-2 gap-3">
                  <a
                    href={`https://wa.me/?text=${encodedMsg}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors text-sm font-medium"
                    onClick={() => setShowDayShareModal(false)}
                  >
                    <Send className="h-4 w-4" />
                    WhatsApp
                  </a>
                  <a
                    href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodeURIComponent(shareMessage)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                    onClick={() => setShowDayShareModal(false)}
                  >
                    <span className="font-bold">f</span>
                    Facebook
                  </a>
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodedMsg}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-black hover:bg-gray-800 text-white rounded-lg transition-colors text-sm font-medium"
                    onClick={() => setShowDayShareModal(false)}
                  >
                    <span className="font-bold">𝕏</span>
                    Twitter / X
                  </a>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(shareMessage);
                      toast({ title: t('devotionalSeriesViewer', 'copied', 'Copied!'), description: t('devotionalSeriesViewer', 'shareMessageCopiedDesc', 'Share message copied to clipboard') });
                      setShowDayShareModal(false);
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    <Copy className="h-4 w-4" />
                    {t('devotionalSeriesViewer', 'copyMessage', 'Copy Message')}
                  </button>
                </div>
                <button
                  onClick={() => setShowDayShareModal(false)}
                  className="text-sm text-gray-400 hover:text-gray-600 transition-colors mt-2"
                >
                  {t('devotionalSeriesViewer', 'skipForNow', 'Skip for now')}
                </button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Completion Modal */}
      <Dialog open={showCompletionModal} onOpenChange={setShowCompletionModal}>
        <DialogContent className="text-center">
          <DialogHeader>
            <DialogTitle className="text-2xl">{t('devotionals', 'congratulations')}!</DialogTitle>
          </DialogHeader>
          <div className="py-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Award className="h-10 w-10 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold mb-2">{t('devotionals', 'seriesComplete')}!</h3>
            <p className="text-gray-600 mb-4">
              {t('devotionals', 'completedAll')} {selectedSeries?.total_days} {t('devotionals', 'daysOf')} "{selectedSeries ? getLocalizedSeries(selectedSeries).title : ''}"
            </p>
            {/* Share series completion */}
            {selectedSeries && (() => {
              const localizedSeries = getLocalizedSeries(selectedSeries);
              const shareUrl = `${window.location.origin}/devotional-series/${selectedSeries.id}`;
              const completionMsg = `🎉 ${t('devotionalSeriesViewer', 'iJustCompletedSeriesX', 'I just completed the "{title}" devotional series on ReKindle BC!').replace('{title}', String(localizedSeries.title))}\n\n${shareUrl}`;
              const encodedMsg = encodeURIComponent(completionMsg);
              const encodedUrl = encodeURIComponent(shareUrl);
              return (
                <div className="mb-4 space-y-2">
                  <p className="text-sm font-medium text-gray-600">{t('devotionalSeriesViewer', 'shareYourAchievement', 'Share your achievement:')}</p>
                  <div className="flex justify-center gap-2">
                    <a href={`https://wa.me/?text=${encodedMsg}`} target="_blank" rel="noopener noreferrer"
                      className="w-10 h-10 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors"
                      title={t('devotionalSeriesViewer', 'shareOnWhatsApp', 'Share on WhatsApp')}>
                      <Send className="h-4 w-4" />
                    </a>
                    <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedMsg}`} target="_blank" rel="noopener noreferrer"
                      className="w-10 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center transition-colors font-bold text-sm"
                      title={t('devotionalSeriesViewer', 'shareOnFacebook', 'Share on Facebook')}>
                      f
                    </a>
                    <a href={`https://twitter.com/intent/tweet?text=${encodedMsg}`} target="_blank" rel="noopener noreferrer"
                      className="w-10 h-10 bg-black hover:bg-gray-800 text-white rounded-full flex items-center justify-center transition-colors font-bold text-sm"
                      title={t('devotionalSeriesViewer', 'shareOnX', 'Share on X')}>
                      𝕏
                    </a>
                    <button
                      onClick={() => { navigator.clipboard.writeText(completionMsg); toast({ title: t('devotionalSeriesViewer', 'copied', 'Copied!'), description: t('devotionalSeriesViewer', 'shareMessageCopiedDesc', 'Share message copied to clipboard') }); }}
                      className="w-10 h-10 bg-purple-500 hover:bg-purple-600 text-white rounded-full flex items-center justify-center transition-colors"
                      title={t('devotionalSeriesViewer', 'copyToClipboard', 'Copy to clipboard')}>
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })()}
            <Button onClick={() => { setShowCompletionModal(false); setView('series'); }}>
              {t('devotionals', 'viewSeries')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DevotionalSeriesViewer;
