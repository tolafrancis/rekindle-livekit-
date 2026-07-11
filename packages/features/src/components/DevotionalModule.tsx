import { useSwipe } from '@rekindle/ui/useSwipe';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@rekindle/ui/button';
import { Progress } from '@rekindle/ui/progress';
import { HighQualityAudioPlayer } from './HighQualityAudioPlayer';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Volume2,
  VolumeX,
  BookOpen,
  CheckCircle,
  Pause,
  Play,
  Share2,
  Flame,
  Heart,
  Sparkles,
  Settings,
  Volume1,
  Mic,
  MicOff,
  FastForward,
  Timer,
  PartyPopper,
  Trophy,
  Headphones
} from 'lucide-react';
import { instrumentalTracks } from '../data/instrumentals';
import { SocialShareModal } from './SocialShareModal';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { useLocalizedScripture } from '../useLocalizedScripture';
import { useTapGesture, useOneTimeTip, ViewerGestureTip } from './viewerGestures';
import { recordDailyActivity, getStreakSummary, type StreakSummary } from '../streak';

/** Hold on the opening lines before the auto-scroll starts moving under the reader. */
const SCROLL_START_DELAY_MS = 8000;
/** Hold at the bottom so the closing lines can be read before the slide changes. */
const SCROLL_END_DWELL_MS = 10000;

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
  type: 'intro' | 'passage' | 'devotional' | 'reflection' | 'prayer' | 'spirit' | 'closing';
  title: string;
  content: string;
  scripture?: string;
  scriptureText?: string;
  scriptureVersion?: string;
  isLongPassage?: boolean;
  duration: number;
  questions?: string[];
}

interface OldDevotional {
  id: string;
  title: string;
  author?: string;
  scripture: string;
  scriptureText: string;
  biblePassageReference?: string;
  biblePassageText?: string;
  scriptureReferences?: Array<{
    reference: string;
    text: string;
    version: string;
  }>;
  cover_image_url?: string;
  background_music_id?: number;
  message: string;
  prayer: string;
  reflectionQuestions?: string[];
  excerpt?: string;
  theme?: string;
  modules?: number;
}

interface DevotionalEntry {
  id: string;
  series_id?: string;
  day_number: number;
  title: string;
  author?: string;
  scripture_reference?: string;
  scripture_text?: string;
  bible_passage_reference?: string;
  bible_passage_text?: string;
  scripture_references?: string | Array<{
    reference: string;
    text: string;
    version: string;
  }>;
  cover_image_url?: string;
  background_music_id?: number;
  content: string;
  reflection_questions?: string[];
  prayer?: string;
  audio_url?: string;
  video_url?: string;
  is_bookmarked?: boolean;
}

interface Props {
  devotional?: OldDevotional;
  moduleNumber?: number;
  entry?: DevotionalEntry;
  seriesTitle?: string;
  totalDays?: number;
  /** Public deep-link URL used by the in-module Share dialog (routes recipients
   *  to this devotional's free-taste preview). Falls back to the current URL. */
  shareUrl?: string;
  /** Ministry name for branded share text. Falls back to Rekindle when absent. */
  ministryName?: string | null;
  onComplete: () => void;
  onClose: () => void;
}

export const DevotionalModule: React.FC<Props> = ({
  devotional,
  moduleNumber,
  entry,
  shareUrl,
  ministryName,
  seriesTitle,
  totalDays,
  onComplete,
  onClose
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);
  // True while a scrollable slide is pacing itself (start delay → scroll → end dwell).
  // The fixed-duration auto-advance timer stands down for these, so the two clocks
  // can't race and cut a long devotional off mid-scroll.
  const [isScrollDriven, setIsScrollDriven] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  // Background music auto-plays when the viewer opens. A SINGLE tap pauses it and
  // a DOUBLE tap resumes — a plain tap never *resumes* audio, only the explicit
  // double-tap / Play button does (so navigation taps can't restart it).
  const [audioStarted, setAudioStarted] = useState(true);
  const gestureTip = useOneTimeTip();
  const [isMuted, setIsMuted] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [spiritPrayerMode, setSpiritPrayerMode] = useState(false);
  const [spiritPrayerTime, setSpiritPrayerTime] = useState(0);
  const [showShareModal, setShowShareModal] = useState(false);
  const [backgroundIndex] = useState(() => Math.floor(Math.random() * peacefulBackgrounds.length));

  // Completion congratulations popup + streak state
  const [showCompletionPopup, setShowCompletionPopup] = useState(false);
  const [streakSummary, setStreakSummary] = useState<StreakSummary | null>(null);
  const [popupSource, setPopupSource] = useState<'complete' | 'declaration' | null>(null);
  const completedRef = useRef(false);
  
  // New state for enhanced features
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [scrollSpeed, setScrollSpeed] = useState<'slow' | 'medium'>('medium');
  const [volume, setVolume] = useState(() => {
    const savedVolume = localStorage.getItem('devotional-volume');
    return savedVolume ? parseFloat(savedVolume) : 0.5;
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAudioActive, setIsAudioActive] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [speechRate, setSpeechRate] = useState(0.9);
  const [slideTimeRemaining, setSlideTimeRemaining] = useState(0);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(false);
  
  // Debug: Log when shouldAutoPlay changes
  useEffect(() => {
    console.log('🎛️ [DevotionalModule] shouldAutoPlay changed to:', shouldAutoPlay);
  }, [shouldAutoPlay]);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoAdvanceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoScrollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUserScrollingRef = useRef(false);
  const lastAutoTopRef = useRef(0);
  const currentSlideRef = useRef<number>(currentSlide); // Track current slide
  
  // Keep ref in sync with state
  useEffect(() => {
    currentSlideRef.current = currentSlide;
    console.log('📍 [DevotionalModule] currentSlide updated to:', currentSlide);
  }, [currentSlide]);

  const normalizedDevotional = React.useMemo(() => {
    if (devotional) {
      return {
        id: devotional.id,
        title: devotional.title,
        author: devotional.author || (devotional as any).author_name || '',
        scripture: devotional.scripture || '',
        scriptureText: devotional.scriptureText || '',
        biblePassageReference: devotional.biblePassageReference || '',
        biblePassageText: devotional.biblePassageText || '',
        scriptureReferences: devotional.scriptureReferences || [],
        message: devotional.message || '',
        prayer: devotional.prayer || '',
        reflectionQuestions: devotional.reflectionQuestions || [],
        excerpt: devotional.excerpt || '',
        coverImage: devotional.cover_image_url || null,
        musicId: devotional.background_music_id || null
      };
    }

    if (entry) {
      let scriptureRefs = entry.scripture_references || [];
      if (typeof scriptureRefs === 'string') {
        try {
          scriptureRefs = JSON.parse(scriptureRefs);
        } catch {
          scriptureRefs = [];
        }
      }

      return {
        id: entry.id,
        title: entry.title || 'Devotional',
        author: entry.author || (entry as any).author_name || '',
        scripture: entry.scripture_reference || '',
        scriptureText: entry.scripture_text || '',
        biblePassageReference: entry.bible_passage_reference || '',
        biblePassageText: entry.bible_passage_text || '',
        scriptureReferences: scriptureRefs,
        message: entry.content || '',
        prayer:
          entry.prayer ||
          "Lord, help me apply what I've learned today. Guide my steps and fill me with Your Spirit. Amen.",
        reflectionQuestions: entry.reflection_questions || [],
        excerpt: entry.content?.slice(0, 150) || '',
        coverImage: entry.cover_image_url || null,
        musicId: entry.background_music_id || null
      };
    }

    return {
      id: 'unknown',
      title: 'Devotional',
      author: '',
      scripture: '',
      scriptureText: '',
      biblePassageReference: '',
      biblePassageText: '',
      scriptureReferences: [],
      message: 'Content not available.',
      prayer: 'Lord, guide me today. Amen.',
      reflectionQuestions: [],
      excerpt: '',
      coverImage: null,
      musicId: null
    };
  }, [devotional, entry]);

  const displayTitle = seriesTitle || normalizedDevotional.title;
  const dayNumber = entry?.day_number || moduleNumber || 1;

  // Calculate reading time for content (words per minute)
  const calculateReadingTime = (text: string, baseTime: number = 30): number => {
    const wordCount = text.split(/\s+/).length;
    const readingTimeSeconds = Math.max(baseTime, (wordCount / 200) * 60); // 200 words per minute
    return Math.ceil(readingTimeSeconds);
  };

  const getDevotionalAudioText = () => {
    let text = `${displayTitle}\n\n`;
    const currentSlideData = slides[currentSlide];
    
    if (currentSlideData?.scripture) {
      text += `${currentSlideData.scripture}\n`;
    }
    if (currentSlideData?.scriptureText) {
      text += `${currentSlideData.scriptureText}\n\n`;
    }
    
    // Reflection slides: read the intro sentence AND each question
    if (currentSlideData?.type === 'reflection' && currentSlideData?.questions?.length) {
      text += currentSlideData.content + ' ';
      currentSlideData.questions.forEach((q, idx) => {
        text += `Question ${idx + 1}: ${q}. `;
      });
    } else {
      text += currentSlideData?.content || '';
    }
    
    if (currentSlideData?.type === 'prayer' || currentSlideData?.title.toLowerCase().includes('prayer')) {
      text = `Prayer:\n${text}`;
    }
    
    return text;
  };

  const slides: DevotionalSlide[] = React.useMemo(() => {
    // Intro: welcome-by-title line, plus the author entered when the devotional
    // was created (shown only when an author is set; no fallback text).
    const authorName = normalizedDevotional.author?.trim();
    const welcomeLine = t('devotionals', 'readerWelcome', "You are welcome to today's devotional. This time is set apart for you and God.");
    const introContent = authorName
      ? `${welcomeLine}\n\n${t('devotionals', 'readerWrittenBy', 'Written by')} ${authorName}`
      : welcomeLine;

    const slideList: DevotionalSlide[] = [
      {
        type: 'intro',
        title: normalizedDevotional.title,
        content: introContent,
        duration: 20
      }
    ];

    if (normalizedDevotional.scriptureReferences.length > 0) {
      normalizedDevotional.scriptureReferences.forEach((ref, idx) => {
        slideList.push({
          type: 'passage',
          title: idx === 0 ? t('devotionals', 'readerScripturePassage', 'Scripture Passage') : t('devotionals', 'readerAdditionalScripture', 'Additional Scripture'),
          content: t('devotionals', 'readerReadSlowly', 'Read slowly. Let the words rest in your heart.'),
          scripture: ref.reference,
          scriptureText: ref.text,
          scriptureVersion: ref.version,
          duration: 25
        });
      });
    } else if (normalizedDevotional.scripture || normalizedDevotional.scriptureText) {
      slideList.push({
        type: 'passage',
        title: t('devotionals', 'readerScripturePassage', 'Scripture Passage'),
        content: t('devotionals', 'readerReadSlowly', 'Read slowly. Let the words rest in your heart.'),
        scripture: normalizedDevotional.scripture,
        scriptureText: normalizedDevotional.scriptureText,
        duration: 25
      });
    }

    if (normalizedDevotional.biblePassageReference || normalizedDevotional.biblePassageText) {
      slideList.push({
        type: 'passage',
        title: t('devotionals', 'readerBiblePassage', 'Bible Passage'),
        content: t('devotionals', 'readerReadSlowly', 'Read slowly. Let the words rest in your heart.'),
        scripture: normalizedDevotional.biblePassageReference,
        scriptureText: normalizedDevotional.biblePassageText,
        isLongPassage: true,
        duration: calculateReadingTime(normalizedDevotional.biblePassageText, 30)
      });
    }

    slideList.push({
      type: 'devotional',
      title: t('devotionals', 'readerDevotional', 'Devotional'),
      content: normalizedDevotional.message,
      duration: calculateReadingTime(normalizedDevotional.message, 120)
    });

    if (normalizedDevotional.reflectionQuestions.length > 0) {
      slideList.push({
        type: 'reflection',
        title: t('devotionals', 'readerReflectionQuestions', 'Reflection Questions'),
        content: t('devotionals', 'readerReflectionContent', 'Consider how this truth meets you where you are today.'),
        questions: normalizedDevotional.reflectionQuestions,
        duration: 30
      });
    }

    if (normalizedDevotional.prayer && normalizedDevotional.prayer.trim()) {
      slideList.push({
        type: 'prayer',
        title: t('devotionals', 'readerGuidedPrayer', 'Guided Prayer'),
        content: normalizedDevotional.prayer,
        duration: calculateReadingTime(normalizedDevotional.prayer, 90)
      });
    }

    slideList.push(
      {
        type: 'spirit',
        title: t('devotionals', 'readerPrayInSpirit', 'Pray in the Spirit'),
        content: t('devotionals', 'readerPrayInSpiritContent', 'There is no hurry. Stay as long as you need.\n\nWhen you are ready, gently mark this time complete.'),
        duration: 60
      },
      {
        type: 'closing',
        title: t('devotionals', 'readerGoInPeace', 'Go in Peace'),
        content: t('devotionals', 'readerGoInPeaceContent', 'May the Lord bless you and keep you.\nMay His face shine upon you and give you peace.\nGo forth in His love today.'),
        duration: 20
      }
    );

    return slideList;
  }, [normalizedDevotional, t]);

  const currentSlideData = slides[currentSlide];
  const progressPercent = ((currentSlide + 1) / slides.length) * 100;

  // Localize the current slide's scripture to a published Bible version in the
  // reader's language by reference (falls back to the stored English text).
  const locScripture = useLocalizedScripture({
    reference: currentSlideData?.scripture,
    text: currentSlideData?.scriptureText,
    version: currentSlideData?.scriptureVersion,
  });

  // Reaching the final slide marks the devotional complete and updates the streak
  // right away, even if the user never explicitly taps "Complete".
  useEffect(() => {
    if (currentSlide === slides.length - 1) {
      persistCompletion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlide, slides.length]);

  // Function definitions (must be before useEffects that reference them)
  const goToNextSlide = () => {
    if (currentSlide < slides.length - 1) {
      stopSpeaking(); // Stop any ongoing speech before changing slide
      setCurrentSlide(prev => prev + 1);
      setTimeElapsed(0);
    } else {
      handleComplete();
    }
  };

  const goToPrevSlide = () => {
    if (currentSlide > 0) {
      stopSpeaking(); // Stop any ongoing speech before changing slide  
      setCurrentSlide(prev => prev - 1);
      setTimeElapsed(0);
    }
  };

  // Swipe to navigate slides
  const swipeHandlers = useSwipe({
    onSwipeLeft:  goToNextSlide,
    onSwipeRight: goToPrevSlide,
  });

  // Marks the devotional done and persists it + the streak immediately. Safe to call
  // multiple times (e.g. reaching the last slide, then clicking Complete) — only the
  // first call does any work.
  const persistCompletion = async () => {
    if (completedRef.current) return;
    completedRef.current = true;
    setCompleted(true);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    stopSpeaking();
    if (user?.id) {
      await recordDailyActivity(user.id, 'daily_devotional');
    }
  };

  // Shows the congratulations popup with the latest streak, after persisting completion.
  const celebrateCompletion = async (source: 'complete' | 'declaration') => {
    await persistCompletion();
    if (user?.id) {
      const summary = await getStreakSummary(user.id);
      setStreakSummary(summary);
    }
    setPopupSource(source);
    setShowCompletionPopup(true);
  };

  const handleComplete = () => {
    celebrateCompletion('complete');
  };

  const handleTakeDeclaration = () => {
    celebrateCompletion('declaration');
  };

  const dismissCompletionPopup = () => {
    setShowCompletionPopup(false);
    if (popupSource === 'declaration') {
      onClose();
      if (window.location.pathname !== '/home') {
        navigate('/home');
      }
      setTimeout(() => {
        document.getElementById('daily-declaration')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 350);
    } else {
      onComplete();
    }
  };

  // Header button + SINGLE tap = toggle pause/resume the whole viewer. Background
  // music and the narration player both follow `isPaused` (HighQualityAudioPlayer
  // takes a `paused` prop), so the narration RESUMES only if it was already
  // playing — a resume never *starts* narration the user didn't begin.
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

  // Text-to-Speech functions
  const getTextToSpeak = (): string => {
    let text = '';
    
    if (currentSlideData.scripture && currentSlideData.scriptureText) {
      text += `${currentSlideData.scripture}. ${currentSlideData.scriptureText}. `;
    }
    
    if (currentSlideData.type === 'reflection' && currentSlideData.questions) {
      text += currentSlideData.content + ' ';
      currentSlideData.questions.forEach((q, idx) => {
        text += `Question ${idx + 1}: ${q}. `;
      });
    } else {
      text += currentSlideData.content;
    }
    
    return text;
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const startSpeaking = () => {
    if ('speechSynthesis' in window) {
      stopSpeaking(); // Stop any existing speech
      
      const text = getTextToSpeak();
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Configure voice settings
      utterance.rate = speechRate;
      utterance.pitch = 1;
      utterance.volume = 1;
      
      // Try to use a natural-sounding voice
      const voices = speechSynthesis.getVoices();
      const preferredVoice = voices.find(voice => 
        voice.lang.startsWith('en') && 
        (voice.name.includes('Natural') || voice.name.includes('Enhanced') || voice.name.includes('Premium'))
      ) || voices.find(voice => voice.lang.startsWith('en'));
      
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onend = () => {
        setIsSpeaking(false);
        // Auto-advance to next slide when narration ends (if auto-advance is on)
        if (autoAdvance && currentSlide < slides.length - 1) {
          setTimeout(() => goToNextSlide(), 1000);
        }
      };

      utterance.onerror = () => {
        setIsSpeaking(false);
      };

      speechSynthesisRef.current = utterance;
      speechSynthesis.speak(utterance);
      setIsSpeaking(true);
      
      // Pause auto-advance while speaking
      if (autoAdvanceTimerRef.current) {
        clearInterval(autoAdvanceTimerRef.current);
      }
    }
  };

  const toggleSpeech = () => {
    if (isSpeaking) {
      stopSpeaking();
    } else {
      startSpeaking();
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
    const musicId = normalizedDevotional.musicId;
    if (musicId) {
      const track = instrumentalTracks.find(t => t.id === String(musicId));
      if (track) return track.file_url;
    }
    // Default to first track
    return instrumentalTracks[0]?.file_url || '';
  };

  // useEffects start here

  // This component only mounts while a devotional is actively playing — tell the
  // app shell so it can hide floating UI (e.g. the Stats button) for the duration.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('viewer:active', { detail: true }));
    return () => window.dispatchEvent(new CustomEvent('viewer:active', { detail: false }));
  }, []);

  // Timer for overall elapsed time
  useEffect(() => {
    if (!isPaused && isPlaying && !spiritPrayerMode) {
      timerRef.current = setInterval(() => {
        setTimeElapsed(prev => prev + 1);
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isPaused, isPlaying, spiritPrayerMode]);

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
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
      // Audio plays only after an explicit start (audioStarted) and while not paused.
      if (audioStarted && !isPaused) {
        audioRef.current.play().catch(() => {});
      } else {
        audioRef.current.pause();
      }
    }
  }, [audioStarted, isPaused, isMuted, volume]);

  // Save volume to localStorage
  useEffect(() => {
    localStorage.setItem('devotional-volume', volume.toString());
  }, [volume]);

  // Auto-advance timer - runs on its own. When audio is playing (isSpeaking), it
  // pauses and the audio workflow handles advancing instead. Audio player is untouched.
  const goToNextSlideRef = useRef(goToNextSlide);
  useEffect(() => { goToNextSlideRef.current = goToNextSlide; }, [goToNextSlide]);

  useEffect(() => {
    // isScrollDriven: a scrollable slide advances when its scroll reaches the bottom
    // and dwells there — not on a countdown that knows nothing about the content length.
    if (autoAdvance && !isPaused && !spiritPrayerMode && !isScrollDriven && currentSlide < slides.length - 1 && !isSpeaking && !isAudioActive && !isAudioLoading) {
      const duration = currentSlideData?.duration || 30;
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
  }, [autoAdvance, isPaused, currentSlide, spiritPrayerMode, slides.length, isSpeaking, isAudioActive, isAudioLoading, isScrollDriven]);

  // Auto-scroll for devotional content and the long Bible Passage — steady fixed speed (px/sec, independent of reading time)
  useEffect(() => {
    const scrolls = currentSlideData.type === 'devotional' || currentSlideData.isLongPassage;
    if (!autoScroll || isPaused || isUserScrolling || !scrolls) {
      setIsScrollDriven(false);
      return;
    }
    const element = contentRef.current;
    if (!element) return;
    if (element.scrollHeight - element.clientHeight <= 0) {
      // Nothing to scroll — let the fixed-duration timer advance this slide.
      setIsScrollDriven(false);
      return;
    }

    // This slide's pacing is owned by the scroll, not the duration timer: read the
    // top, scroll, dwell at the bottom, then advance. Two clocks racing meant a long
    // devotional could be cut off at 30s, mid-sentence.
    setIsScrollDriven(true);

    // Baseline so the scroll listener doesn't read the resume position as a user scroll
    lastAutoTopRef.current = element.scrollTop;

    const pixelsPerSecond = scrollSpeed === 'slow' ? 3 : 5;
    let lastTime: number | null = null;
    let animationFrameId: number;
    let startDelayId: NodeJS.Timeout | undefined;
    let endDwellId: NodeJS.Timeout | undefined;
    let pos = element.scrollTop; // float accumulator; browsers round scrollTop to whole px,
                                 // so reading it back would lose sub-pixel-per-frame movement

    const animate = (currentTime: number) => {
      if (lastTime === null) lastTime = currentTime;
      const deltaMs = currentTime - lastTime;
      lastTime = currentTime;

      const el = contentRef.current;
      // Stop if the user grabbed the content; the effect resumes when they let go
      if (!el || isUserScrollingRef.current) return;

      const maxScroll = el.scrollHeight - el.clientHeight;
      pos = Math.min(pos + (pixelsPerSecond * deltaMs) / 1000, maxScroll);
      el.scrollTop = pos;
      lastAutoTopRef.current = el.scrollTop;

      if (pos < maxScroll - 0.5) {
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      // Reached the bottom. Hold so the last paragraph can actually be read,
      // then move on.
      endDwellId = setTimeout(() => {
        if (autoAdvance && currentSlideRef.current < slides.length - 1) {
          goToNextSlideRef.current();
        }
      }, SCROLL_END_DWELL_MS);
    };

    // Give the reader time on the opening lines before anything moves. Only on a
    // fresh slide — when resuming after a manual scroll, pick up immediately.
    const atTop = element.scrollTop <= 2;
    startDelayId = setTimeout(
      () => { animationFrameId = requestAnimationFrame(animate); },
      atTop ? SCROLL_START_DELAY_MS : 0,
    );

    return () => {
      if (startDelayId) clearTimeout(startDelayId);
      if (endDwellId) clearTimeout(endDwellId);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [autoScroll, isPaused, isUserScrolling, currentSlide, scrollSpeed, autoAdvance, slides.length]);

  // Pause auto-scroll only when the user actually scrolls the content (position moves
  // beyond what auto-scroll set). Touching/swiping without dragging won't pause it.
  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const handleScroll = () => {
      const drift = Math.abs(element.scrollTop - lastAutoTopRef.current);
      if (drift <= 4) return; // this was our own programmatic scroll

      setIsUserScrolling(true);
      isUserScrollingRef.current = true;
      if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);

      const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 20;
      if (atBottom && autoAdvance && currentSlide < slides.length - 1) {
        userScrollTimeoutRef.current = setTimeout(() => {
          setIsUserScrolling(false);
          isUserScrollingRef.current = false;
          goToNextSlide();
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
    // Stop speaking when changing slides
    stopSpeaking();
  }, [currentSlide]);

  // Render JSX starts here
  return (
    <div
      {...swipeHandlers}
      onClick={handleViewerTap}
      className="fixed inset-0 z-[70] flex flex-col overflow-x-hidden"
      style={{
        backgroundImage: `url(${peacefulBackgrounds[backgroundIndex]})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
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
      <div className="relative z-10 flex items-center justify-between gap-2 p-4 text-white">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white hover:bg-white/20 flex-shrink-0"
          >
            <X className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <p className="text-sm opacity-80 truncate">{displayTitle}</p>
            <p className="text-xs opacity-60">Day {dayNumber}{totalDays ? ` of ${totalDays}` : ''}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Distinct "Read aloud" button — starts the narration (same as a
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

          {/* High-Quality Audio Player - Inline Controls (audio engine) */}
          <HighQualityAudioPlayer
            text={getDevotionalAudioText()}
            contentId={normalizedDevotional.id}
            contentType="daily_devotional"
            autoLoad={true}
            autoPlay={shouldAutoPlay}
            paused={isPaused}
            currentSlide={currentSlide}
            className=""
            onSpeakingChange={(speaking) => {
              console.log('🔊 Speaking state changed:', speaking);
              setIsSpeaking(speaking);
              // If user starts speaking, enable auto-play for future slides
              if (speaking) {
                console.log('▶️ Enabling autoPlay (TTS)');
                setShouldAutoPlay(true);
              }
            }}
            onPlayingChange={(playing) => {
              console.log('🎵 Playing state changed:', playing);
              // OpenAI audio-file playback must also pause the slide auto-advance
              // timer (it fires onPlayingChange, not onSpeakingChange), otherwise
              // the timer advances mid-narration and cuts the audio off.
              setIsAudioActive(playing);
              // If audio file starts playing, enable auto-play for future slides
              if (playing) {
                console.log('▶️ Enabling autoPlay (Audio file)');
                setShouldAutoPlay(true);
              }
            }}
            onLoadingChange={(loading) => {
              // Pause the slide timer while audio is being generated/loaded so a
              // slow first-time generation can't advance the slide before playback.
              setIsAudioLoading(loading);
            }}
            onComplete={() => {
              const currentSlideValue = currentSlideRef.current;
              console.log('🎯 [DevotionalModule] onComplete called - Current slide from ref:', currentSlideValue);
              console.log('   Total slides:', slides.length);
              
              // Auto-advance to next slide after a brief pause
              setTimeout(() => {
                if (currentSlideValue < slides.length - 1) {
                  console.log('⏭️ [DevotionalModule] Advancing to next slide:', currentSlideValue + 1);
                  goToNextSlide();
                  // shouldAutoPlay is already true, so next slide will auto-start
                } else {
                  console.log('🏁 [DevotionalModule] Last slide reached, stopping autoPlay');
                  // Last slide - stop auto-playing
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
            title={isPaused ? 'Resume' : 'Pause timer'}
          >
            {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowShareModal(true)}
            className="text-white hover:bg-white/20"
            title="Share devotional"
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
            <span>Slide {currentSlide + 1} of {slides.length}</span>
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
            title="Auto-advance slides"
          >
            <FastForward className="h-3 w-3" />
            Auto-advance {autoAdvance ? 'ON' : 'OFF'}
          </button>
          
          {currentSlideData.type === 'devotional' && (
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                autoScroll ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/70'
              }`}
              title="Auto-scroll content"
            >
              <BookOpen className="h-3 w-3" />
              Auto-scroll {autoScroll ? 'ON' : 'OFF'}
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 py-4 md:px-8 md:py-6 overflow-y-auto overflow-x-hidden">
        <div className="max-w-md w-full text-center text-white overflow-hidden">
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

          {/* Scripture (if passage slide) — localized to a published Bible
              version in the reader's language by reference. */}
          {currentSlideData.scripture && (
            <div className="mb-6 p-6 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20">
              <p className="text-lg font-semibold mb-3 text-amber-200">
                {locScripture.reference}
                {locScripture.version && (
                  <span className="text-sm ml-2 opacity-70">({locScripture.version})</span>
                )}
              </p>
              {locScripture.text && (
                currentSlideData.isLongPassage ? (
                  <div
                    ref={contentRef}
                    className="relative text-left max-h-[42vh] md:max-h-[58vh] overflow-y-auto pr-2"
                  >
                    {autoScroll && !isUserScrolling && (
                      <div className="absolute top-0 right-0 text-xs text-white/50 flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        Auto-scrolling...
                      </div>
                    )}
                    <p className="text-base md:text-lg leading-relaxed whitespace-pre-wrap text-left">
                      {locScripture.text}
                    </p>
                  </div>
                ) : (
                  <p className="text-lg italic leading-relaxed">
                    "{locScripture.text}"
                  </p>
                )
              )}
            </div>
          )}

          {/* Main Content */}
          <div className="mb-6">
            {currentSlideData.type === 'devotional' ? (
              <div 
                ref={contentRef}
                className="text-left bg-white/10 backdrop-blur-sm rounded-xl p-5 md:p-7 max-h-[42vh] md:max-h-[58vh] overflow-y-auto"
              >
                {autoScroll && !isUserScrolling && (
                  <div className="absolute top-2 right-2 text-xs text-white/50 flex items-center gap-1">
                    <BookOpen className="h-3 w-3" />
                    Auto-scrolling...
                  </div>
                )}
                <p className="text-base md:text-lg lg:text-xl leading-relaxed whitespace-pre-wrap break-words">
                  {currentSlideData.content}
                </p>
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
            ) : currentSlideData.type === 'spirit' ? (
              <div className="space-y-6">
                <p className="text-lg leading-relaxed whitespace-pre-wrap break-words opacity-90">
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
                  className={
                    spiritPrayerMode
                      ? "bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-900/30"
                      : "bg-amber-500/90 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/30"
                  }
                  size="lg"
                >
                  <Flame className="h-4 w-4 mr-2" />
                  {spiritPrayerMode ? 'End Prayer Time' : 'Begin Your Prayer Time'}
                </Button>
              </div>
            ) : (
              <p className="text-lg leading-relaxed whitespace-pre-wrap break-words">
                {currentSlideData.content}
              </p>
            )}
          </div>

          {currentSlideData.type === 'closing' && (
            <div className="mt-2 mx-auto max-w-md rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 p-4 text-left">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-amber-300 flex-shrink-0 mt-0.5" />
                <p className="text-sm leading-relaxed text-white/90">
                  Before you go, remember to speak <span className="font-semibold">today's Declaration</span> over your life.
                </p>
              </div>
              <Button
                onClick={handleTakeDeclaration}
                className="mt-3 w-full bg-amber-500 hover:bg-amber-600 text-white"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Take today's Declaration
              </Button>
            </div>
          )}
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
          Previous
        </Button>

        {/* Slide Indicators + swipe hint */}
        <div className="flex flex-col items-center gap-1">
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
          <p className="text-white/40 text-xs">swipe to navigate</p>
        </div>

        {currentSlide === slides.length - 1 ? (
          <Button
            onClick={handleComplete}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCircle className="h-5 w-5 mr-1" />
            Complete
          </Button>
        ) : (
          <Button
            variant="ghost"
            onClick={goToNextSlide}
            className="text-white hover:bg-white/20"
          >
            Next
            <ChevronRight className="h-5 w-5 ml-1" />
          </Button>
        )}
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <SocialShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          title={normalizedDevotional.title}
          description={normalizedDevotional.excerpt || normalizedDevotional.message.slice(0, 100)}
          url={shareUrl || window.location.href}
          ministryName={ministryName}
        />
      )}

      {/* Completion Congratulations Popup */}
      {showCompletionPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          {/* Lightweight confetti burst */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {Array.from({ length: 24 }).map((_, i) => (
              <span
                key={i}
                className="absolute top-[-10%] block rounded-sm"
                style={{
                  left: `${(i * 37) % 100}%`,
                  width: 8,
                  height: 14,
                  backgroundColor: ['#f59e0b', '#a855f7', '#22c55e', '#ec4899', '#3b82f6'][i % 5],
                  animation: `devotional-confetti-fall ${2 + (i % 5) * 0.3}s linear ${(i % 6) * 0.12}s forwards`,
                  opacity: 0.9
                }}
              />
            ))}
          </div>
          <style>{`
            @keyframes devotional-confetti-fall {
              0% { transform: translateY(0) rotate(0deg); opacity: 0.9; }
              100% { transform: translateY(110vh) rotate(540deg); opacity: 0; }
            }
          `}</style>

          <div className="relative bg-white rounded-2xl max-w-sm w-full p-6 text-center shadow-2xl">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
              <PartyPopper className="h-7 w-7 text-amber-500" />
            </div>
            <h3 className="text-2xl font-serif font-bold text-gray-900 mb-1">Congratulations!</h3>
            <p className="text-gray-600 mb-4">You have completed today's devotional.</p>

            {streakSummary && (
              <div className="bg-gradient-to-br from-orange-500 to-amber-600 text-white rounded-xl p-4 mb-4">
                <div className="flex items-center justify-center gap-2">
                  <Flame className="h-6 w-6" />
                  <span className="text-3xl font-bold leading-none">{streakSummary.current}</span>
                  <span className="text-sm opacity-90">day{streakSummary.current === 1 ? '' : 's'}</span>
                </div>
                <p className="text-xs uppercase tracking-wide opacity-80 mt-1">Current Streak</p>
                {[7, 30, 100, 365].includes(streakSummary.current) && (
                  <p className="text-sm mt-2 font-semibold flex items-center justify-center gap-1">
                    <Trophy className="h-4 w-4" /> {streakSummary.current}-day milestone reached!
                  </p>
                )}
              </div>
            )}

            <p className="text-sm text-gray-500 mb-5">Keep building your daily walk with God.</p>

            <Button
              onClick={dismissCompletionPopup}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
            >
              Continue
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};