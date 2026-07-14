import { useSwipe } from '@rekindle/ui/useSwipe';
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@rekindle/ui/button';
import { Progress } from '@rekindle/ui/progress';
import { PrayerPoint, SESSION_DURATIONS } from '@rekindle/types/prayerTypes';
import { 
  X, ChevronRight, Volume2, VolumeX, BookOpen, CheckCircle, 
  Pause, Play, Flame, Clock, Timer, Volume1 
} from 'lucide-react';
import { instrumentalTracks } from '../data/instrumentals';
import { useLocalizedScripture } from '../useLocalizedScripture';
import { useLanguage } from '../LanguageContext';
import { useTapGesture, useOneTimeTip, ViewerGestureTip } from './viewerGestures';

// Scripture within a prayer point — resolves to a published Bible version in the
// reader's language by reference (falls back to the stored English text).
const PointScripture: React.FC<{ reference?: string; text?: string }> = ({ reference, text }) => {
  const s = useLocalizedScripture({ reference, text });
  return (
    <div className="bg-white/20 rounded-xl p-4 mb-4">
      <BookOpen className="h-6 w-6 mx-auto mb-2 opacity-80" />
      <p className="font-medium text-amber-200 mb-2">{s.reference}</p>
      {s.text && <p className="italic text-lg">"{s.text}"</p>}
    </div>
  );
};

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

interface Props {
  title: string;
  prayerPoints: PrayerPoint[];
  sessionType: 'quick' | 'standard' | 'deep';
  instrumentalId?: string;
  onComplete: (duration?: number, pointsCompleted?: number) => void;
  onClose: () => void;
  // Additional props for Prayer Watch support
  isPrayerWatch?: boolean;
  prayerWatchData?: {
    topicId?: string;
    timeSlot?: string;
    slotId?: string;
  };
  // Audio control props (NEW)
  audioControls?: {
    volume: number;
    isMuted: boolean;
    onVolumeChange: (newVolume: number) => void;
    onToggleMute: () => void;
  };
}

export const InteractivePrayerSession: React.FC<Props> = ({
  title, prayerPoints, sessionType, instrumentalId, onComplete, onClose,
  isPrayerWatch = false,
  prayerWatchData = {},
  audioControls
}) => {
  const { t } = useLanguage();
  const [currentSlide, setCurrentSlide] = useState(0);

  // Swipe to navigate prayer slides
  const swipeHandlers = useSwipe({
    onSwipeLeft:  () => setCurrentSlide(p => p + 1),
    onSwipeRight: () => setCurrentSlide(p => Math.max(0, p - 1)),
  });
  const [isPlaying, setIsPlaying] = useState(true);
  // Background music auto-plays when the session opens. Single tap pauses, double
  // tap resumes — a plain tap never *resumes* audio, only the explicit gestures do.
  const [audioStarted, setAudioStarted] = useState(true);
  const gestureTip = useOneTimeTip();
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [continueMode, setContinueMode] = useState(false);
  const [extraTime, setExtraTime] = useState(0);
  
  // Local audio state (fallback if audioControls not provided)
  const [localVolume, setLocalVolume] = useState(() => {
    const savedVolume = localStorage.getItem('prayer-volume');
    return savedVolume ? parseFloat(savedVolume) : 0.5;
  });
  const [localIsMuted, setLocalIsMuted] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  
  // Use provided audioControls or local state
  const volume = audioControls?.volume ?? localVolume;
  const isMuted = audioControls?.isMuted ?? localIsMuted;
  const handleVolumeChange = audioControls?.onVolumeChange ?? ((newVolume: number) => {
    setLocalVolume(newVolume);
    localStorage.setItem('prayer-volume', newVolume.toString());
    if (newVolume > 0 && localIsMuted) {
      setLocalIsMuted(false);
    }
  });
  const toggleMute = audioControls?.onToggleMute ?? (() => setLocalIsMuted(!localIsMuted));
  
  const totalSlides = prayerPoints.length + 2;
  
  // Safe session type handling with fallback
  const safeSessionType = sessionType || 'standard';
  const sessionDuration = SESSION_DURATIONS[safeSessionType] || SESSION_DURATIONS.standard;
  // Localized session label ("Standard Session (5 min)" etc.); falls back to the
  // English constant from SESSION_DURATIONS.
  const sessionLabel = t('prayerSession', `sessionLabel_${safeSessionType}`, sessionDuration.label);
  
  const track = instrumentalTracks.find(t => t.id === instrumentalId) || instrumentalTracks[0];
  const currentBackground = peacefulBackgrounds[currentSlide % peacefulBackgrounds.length];

  // For Prayer Watch sessions, add timer icon to header
  const showPrayerWatchIndicator = isPrayerWatch;

  useEffect(() => {
    setTimeElapsed(0);
    setContinueMode(false);
    setExtraTime(0);
  }, [currentSlide]);

  useEffect(() => {
    if (isPaused || completed) return;
    
    const timer = setInterval(() => {
      if (continueMode) {
        setExtraTime(prev => prev + 1);
      } else {
        setTimeElapsed(prev => prev + 1);
      }
    }, 1000);
    
    return () => clearInterval(timer);
  }, [isPaused, completed, continueMode]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
      // Audio plays only after an explicit start and while not paused.
      if (audioStarted && !isPaused) {
        audioRef.current.play().catch(() => {});
      } else {
        audioRef.current.pause();
      }
    }
  }, [audioStarted, isPaused, isMuted, volume]);

  const handleNext = () => {
    if (currentSlide < totalSlides - 1) {
      setCurrentSlide(prev => prev + 1);
    } else {
      setCompleted(true);
      
      // Calculate total duration (including extra time in continue mode)
      const totalDuration = timeElapsed + (continueMode ? extraTime : 0);
      const pointsCompleted = prayerPoints.length;
      
      // Pass duration and points completed for Prayer Watch tracking
      onComplete(totalDuration, pointsCompleted);
    }
  };

  const handleContinuePraying = () => {
    setContinueMode(true);
  };

  // Header button + SINGLE tap = toggle pause/resume the session (background music
  // follows `isPaused`). DOUBLE tap = resume. No spoken narration here.
  const togglePause = () => setIsPaused(prev => !prev);
  const resumeSession = () => setIsPaused(false);
  const handleViewerTap = useTapGesture(togglePause, resumeSession);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = ((currentSlide + 1) / totalSlides) * 100;
  const currentPoint = currentSlide > 0 && currentSlide <= prayerPoints.length 
    ? prayerPoints[currentSlide - 1] : null;

  if (completed) {
    // Calculate total time for display
    const totalDuration = timeElapsed + (continueMode ? extraTime : 0);
    const totalMinutes = Math.round(totalDuration / 60);
    
    return (
      <div 
        {...swipeHandlers} className="fixed inset-0 z-50 flex items-center justify-center"
        style={{
          backgroundImage: `url(${peacefulBackgrounds[7]})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative text-center text-white p-8 max-w-lg">
          <div className="relative mb-6">
            <CheckCircle className="h-24 w-24 mx-auto text-green-400 drop-shadow-lg" />
            {showPrayerWatchIndicator && (
              <div className="absolute -top-2 -right-2 bg-purple-600 p-2 rounded-full">
                <Timer className="h-6 w-6 text-white" />
              </div>
            )}
          </div>
          <h2 className="text-4xl font-serif font-bold mb-4 drop-shadow-lg">{t('prayerSession', 'prayerComplete', 'Prayer Complete!')}</h2>
          <p className="text-xl opacity-90 mb-8 drop-shadow">{t('prayerSession', 'peacePresence', "May God's peace and presence be with you today and always.")}</p>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 mb-6">
            <p className="text-lg">{t('prayerSession', 'sessionDuration', 'Session Duration')}: {sessionLabel}</p>
            <p className="text-sm opacity-80">{t('prayerSession', 'youCompletedPoints', 'You completed {n} prayer points').replace('{n}', String(prayerPoints.length))}</p>
            {totalDuration > 0 && (
              <p className="text-sm opacity-80 mt-1">
                {t('prayerSession', 'totalPrayerTime', 'Total prayer time')}: {formatTime(totalDuration)}
              </p>
            )}
          </div>
          <Button onClick={onClose} className="bg-white text-purple-900 hover:bg-gray-100 px-8 py-3 text-lg">
            {t('common', 'close', 'Close')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      {...swipeHandlers} onClick={handleViewerTap} className="fixed inset-0 z-50 flex flex-col"
      style={{
        backgroundImage: `url(${currentBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div className="absolute inset-0 bg-black/30" />
      <audio ref={audioRef} src={track.file_url} loop />

      {/* First-run gesture onboarding tip (once per user). */}
      <ViewerGestureTip show={gestureTip.show} onDismiss={gestureTip.dismiss} />

      {/* Paused hint — single tap to resume */}
      <div className={`pointer-events-none fixed inset-0 z-40 flex items-center justify-center transition-opacity duration-200 ${isPaused ? 'opacity-100' : 'opacity-0'}`}>
        <div className={`flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-sm transition-transform duration-200 ${isPaused ? 'scale-100' : 'scale-95'}`}>
          <Pause className="h-4 w-4" />
          {t('viewers', 'pausedTapResume', 'Paused — tap to resume')}
        </div>
      </div>
      
      {/* Header */}
      <div className="relative flex items-center justify-between p-4 text-white">
        <div className="flex items-center">
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20 mr-2">
            <X className="h-6 w-6" />
          </Button>
          {showPrayerWatchIndicator && (
            <div className="flex items-center bg-purple-600/80 backdrop-blur-sm px-3 py-1 rounded-full">
              <Timer className="h-4 w-4 mr-2" />
              <span className="text-sm font-medium">{t('prayerSession', 'prayerWatch', 'Prayer Watch')}</span>
            </div>
          )}
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold drop-shadow-lg flex items-center justify-center gap-2">
            {continueMode ? `+${formatTime(extraTime)}` : formatTime(timeElapsed)}
            {showPrayerWatchIndicator && prayerWatchData.timeSlot && (
              <span className="text-sm bg-purple-500/30 px-2 py-1 rounded-full">
                {prayerWatchData.timeSlot}
              </span>
            )}
          </div>
          <p className="text-xs opacity-70">
            {continueMode ? t('prayerSession', 'continuePraying', 'Continue praying...') : t('prayerSession', 'timeInPrayer', 'Time in prayer')}
          </p>
        </div>
        
        {/* ENHANCED: Audio Controls with Volume Up/Down */}
        <div className="flex gap-2">
          {/* Volume Down Button */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => handleVolumeChange(Math.max(0, volume - 0.1))}
            className="text-white hover:bg-white/20"
            title={`Decrease volume (${Math.round(volume * 100)}%)`}
          >
            <Volume1 className="h-5 w-5" />
          </Button>
          
          {/* Volume Up Button */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => handleVolumeChange(Math.min(1, volume + 0.1))}
            className="text-white hover:bg-white/20"
            title={`Increase volume (${Math.round(volume * 100)}%)`}
          >
            <Volume2 className="h-5 w-5" />
          </Button>
          
          {/* Mute/Unmute Button */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleMute}
            className="text-white hover:bg-white/20"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            <VolumeX className="h-5 w-5" />
          </Button>
          
          {/* Pause/Play Button */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={togglePause} 
            className="text-white hover:bg-white/20"
          >
            {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
          </Button>
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="relative px-4">
        <Progress value={progress} className="h-2 bg-white/30" />
        <div className="flex justify-between mt-1 text-xs text-white/70">
          <span>{t('prayerSession', 'slideXofY', 'Slide {n} of {total}').replace('{n}', String(currentSlide + 1)).replace('{total}', String(totalSlides))}</span>
          <span>{sessionLabel}</span>
        </div>
      </div>
      
      {/* Main content */}
      <div className="relative flex-1 flex items-center justify-center p-6 overflow-y-auto">
        <div className="max-w-2xl text-center text-white">
          {currentSlide === 0 && (
            <div className="animate-fade-in">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                {showPrayerWatchIndicator ? (
                  <Clock className="h-10 w-10" />
                ) : (
                  <BookOpen className="h-10 w-10" />
                )}
              </div>
              <h1 className="text-4xl md:text-5xl font-serif font-bold mb-6 drop-shadow-lg">{title}</h1>
              <p className="text-xl opacity-90 mb-4 drop-shadow">
                {showPrayerWatchIndicator
                  ? t('prayerSession', 'watchIntro1', 'Join believers worldwide in this prayer watch...')
                  : t('prayerSession', 'intro1', 'Take a deep breath and prepare your heart for prayer...')}
              </p>
              <p className="text-lg opacity-80 mb-6">
                {showPrayerWatchIndicator
                  ? t('prayerSession', 'watchIntro2', 'Praying together at this appointed time strengthens our faith.')
                  : t('prayerSession', 'intro2', "Let go of all distractions and focus on God's presence.")}
              </p>
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4">
                <p className="text-sm opacity-90">{sessionLabel} - {t('prayerSession', 'nPrayerPoints', '{n} Prayer Points').replace('{n}', String(prayerPoints.length))}</p>
                {showPrayerWatchIndicator && (
                  <p className="text-xs opacity-70 mt-1">
                    <Timer className="h-3 w-3 inline mr-1" />
                    {t('prayerSession', 'prayerWatchSession', 'Prayer Watch Session')}
                  </p>
                )}
              </div>
            </div>
          )}
          
          {currentPoint && (
            <div className="animate-fade-in">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 md:p-8 mb-6">
                <h2 className="text-3xl md:text-4xl font-serif font-bold mb-6 drop-shadow-lg">{currentPoint.title}</h2>
                <p className="text-xl leading-relaxed mb-6 drop-shadow">{currentPoint.content}</p>
                
                {currentPoint.scripture && (
                  <PointScripture reference={currentPoint.scripture} text={currentPoint.scriptureText} />
                )}
                
                {currentPoint.reflection && (
                  <div className="mt-4 p-4 bg-amber-500/20 rounded-xl">
                    <p className="text-sm font-medium mb-1">{t('prayerSession', 'reflection', 'Reflection')}</p>
                    <p className="italic opacity-90">{currentPoint.reflection}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {currentSlide === totalSlides - 1 && (
            <div className="animate-fade-in">
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-green-500/30 backdrop-blur-sm flex items-center justify-center">
                {showPrayerWatchIndicator ? (
                  <>
                    <CheckCircle className="h-12 w-12 text-green-300" />
                    <div className="absolute -top-1 -right-1 bg-purple-600 p-1 rounded-full">
                      <Timer className="h-4 w-4 text-white" />
                    </div>
                  </>
                ) : (
                  <CheckCircle className="h-12 w-12 text-green-300" />
                )}
              </div>
              <h2 className="text-4xl md:text-5xl font-serif font-bold mb-6 drop-shadow-lg">{t('prayerSession', 'amen', 'Amen')}</h2>
              <p className="text-xl opacity-90 mb-4 drop-shadow">
                {showPrayerWatchIndicator
                  ? t('prayerSession', 'watchOutro', 'Your prayer at this appointed time has been lifted up to God.')
                  : t('prayerSession', 'outro', "May God's grace and peace be with you today and always.")}
              </p>
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4">
                <p className="italic text-lg">"{t('prayerSession', 'benediction', 'The Lord bless you and keep you; the Lord make his face shine on you and be gracious to you.')}"</p>
                <p className="text-sm mt-2 opacity-80">- {t('prayerSession', 'benedictionRef', 'Numbers 6:24-25')}</p>
                {showPrayerWatchIndicator && (
                  <p className="text-xs opacity-70 mt-2">
                    <Clock className="h-3 w-3 inline mr-1" />
                    {t('prayerSession', 'watchRecorded', 'This prayer watch has been recorded')}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Footer actions */}
      <div className="relative p-6 space-y-3">
        {!continueMode && currentSlide > 0 && currentSlide < totalSlides - 1 && (
          <Button 
            onClick={handleContinuePraying}
            variant="outline"
            className="w-full bg-orange-500/30 border-orange-300/50 text-white hover:bg-orange-500/50 py-4"
          >
            <Flame className="mr-2 h-5 w-5" />
            {t('prayerSession', 'continuePrayingSpirit', 'Continue Praying in the Spirit')}
          </Button>
        )}

        <Button
          onClick={handleNext}
          className="w-full py-6 text-lg bg-white text-purple-900 hover:bg-gray-100"
        >
          {currentSlide === totalSlides - 1 ? t('prayerSession', 'completePrayer', 'Complete Prayer') : t('prayerSession', 'continue', 'Continue')}
          <ChevronRight className="ml-2 h-5 w-5" />
        </Button>

        {isPaused && (
          <p className="text-center text-white/70 text-sm">{t('prayerSession', 'sessionPausedResume', 'Session paused - tap play to resume')}</p>
        )}
      </div>
    </div>
  );
};