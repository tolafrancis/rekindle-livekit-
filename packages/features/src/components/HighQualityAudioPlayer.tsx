import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Slider } from '@rekindle/ui/slider';
import { Badge } from '@rekindle/ui/badge';
import { 
  Play, Pause, Volume2, VolumeX, Loader2, AlertCircle,
  SkipBack, SkipForward, Download, Repeat
} from 'lucide-react';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { toast } from '@rekindle/ui/use-toast';

interface HighQualityAudioPlayerProps {
  text: string;
  contentId: string;
  contentType: 'devotional' | 'book' | 'daily_devotional' | 'prayer' | 'declaration' | 'affirmation';
  title?: string;
  autoLoad?: boolean;
  autoPlay?: boolean;
  /** External pause control (e.g. tap-to-pause on the slide). */
  paused?: boolean;
  currentSlide?: number;
  className?: string;
  onPlayingChange?: (isPlaying: boolean) => void;
  onSpeakingChange?: (isSpeaking: boolean) => void;
  onLoadingChange?: (isLoading: boolean) => void;
  onComplete?: () => void;
}

// Browser TTS helpers
function getBrowserTTSSupport(): boolean {
  return 'speechSynthesis' in window;
}

function preprocessTextForTTS(text: string): string {
  let processed = text;
  processed = processed.replace(/\n\n/g, '\n\n... ');
  processed = processed.replace(/:\n/g, '... \n');
  processed = processed.replace(/(\w+)\s+(\d+):(\d+)/g, '$1 chapter $2, verse $3');
  processed = processed.replace(/\s+/g, ' ').trim();
  return processed;
}

// Check for cached audio
async function getCachedAudio(contentId: string, contentType: string, language: string) {
  try {
    const { data, error } = await supabase
      .from('tts_audio_cache')
      .select('*')
      .eq('content_id', contentId)
      .eq('content_type', contentType)
      .eq('language', language)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    if (data) {
      await supabase
        .from('tts_audio_cache')
        .update({
          last_accessed_at: new Date().toISOString(),
          access_count: (data.access_count || 0) + 1,
        })
        .eq('id', data.id);
    }

    return data;
  } catch (error) {
    console.error('Error checking audio cache:', error);
    return null;
  }
}

// Request server-side generation (only if Edge Function is deployed)
// NOTE: caller (handleLoadAudio) already checked the cache — do NOT query it again here.
const EDGE_FN_TIMEOUT_MS = 30000; // 30 seconds - OpenAI TTS can take 10-20 seconds for long text

async function requestAudioGeneration(options: {
  text: string;
  language: string;
  contentId: string;
  contentType: string;
  userId?: string;
}): Promise<string | null> {
  try {
    // Race the edge-function call against a timeout so a missing function
    // doesn't block the UI for the full default fetch timeout.
    const result = await Promise.race([
      supabase.functions.invoke('generate-tts-audio', { body: options }),
      new Promise<{ data: null; error: Error }>((resolve) =>
        setTimeout(
          () => resolve({ data: null, error: new Error('Edge function timed out') }),
          EDGE_FN_TIMEOUT_MS
        )
      ),
    ]);

    if (result.error) {
      console.warn('[AudioPlayer] Edge Function not available or returned error:', result.error.message);
      return null;
    }

    return result.data?.audioUrl || null;
  } catch (error) {
    console.warn('[AudioPlayer] Server audio generation failed, falling back to browser TTS:', error);
    return null;
  }
}

export const HighQualityAudioPlayer: React.FC<HighQualityAudioPlayerProps> = ({
  text,
  contentId,
  contentType,
  title,
  autoLoad = false,
  autoPlay = false,
  paused,
  currentSlide,
  className = '',
  onPlayingChange,
  onSpeakingChange,
  onLoadingChange,
  onComplete
}) => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Set when the user hits play before the OpenAI audio has finished loading, so
  // we can start the high-quality audio the moment it's ready instead of
  // immediately dropping to the browser voice.
  const pendingPlayRef = useRef(false);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [useBrowserTTS, setUseBrowserTTS] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [isLooping, setIsLooping] = useState(false);
  const [showAudioMenu, setShowAudioMenu] = useState(false);

  const speeds = [0.75, 1, 1.25, 1.5, 1.75, 2];

  // Track which slide the current load is for so we don't clobber state
  // if a stale load resolves after the user already moved on.
  const loadingForSlideRef = useRef<number | null>(null);

  // Auto-load: re-run whenever the slide (and therefore the text) changes
  useEffect(() => {
    if (autoLoad && text) {
      // Only kick off a new load if we aren't already loading THIS slide
      if (loadingForSlideRef.current !== currentSlide) {
        handleLoadAudio();
      }
    }
  }, [autoLoad, currentSlide, text]);

  // Auto-play audio file when autoPlay becomes true
  useEffect(() => {
    if (autoPlay && audioUrl && audioRef.current && !isPlaying) {
      console.log('🎵 [AudioPlayer] AutoPlay enabled for audio file - playing');
      audioRef.current.play().catch((err) => {
        console.error('❌ [AudioPlayer] Auto-play failed:', err);
      });
    }
  }, [autoPlay, audioUrl]); // Run when autoPlay or audioUrl changes

  // Cleanup
  useEffect(() => {
    return () => {
      if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }
      if (utteranceRef.current && useBrowserTTS) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Surface loading state so the parent can pause slide auto-advance while audio generates
  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading]);

  // Memoize startNewSpeech to prevent stale closures
  const startNewSpeech = useCallback(() => {
    console.log('🎤 [AudioPlayer] startNewSpeech called');
    console.log('   Current slide:', currentSlide);
    console.log('   Text available:', !!text);
    console.log('   Text length:', text?.length);
    
    if (!('speechSynthesis' in window)) {
      console.error('❌ [AudioPlayer] Speech synthesis not supported');
      return;
    }
    
    if (!text || text.trim() === '') {
      console.warn('⚠️ [AudioPlayer] No text to speak');
      return;
    }
    
    console.log('🗣️ [AudioPlayer] Text preview:', text?.substring(0, 100) + '...');
    
    // Cancel any existing speech
    if (window.speechSynthesis.speaking) {
      console.log('🛑 [AudioPlayer] Canceling existing speech');
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    
    // FIREFOX FIX: Add small delay after cancel to prevent premature onend
    // Firefox sometimes fires onend for cancelled speech after new speech starts
    setTimeout(() => {
      // Create and start new speech
      const processedText = preprocessTextForTTS(text);
      const utterance = new SpeechSynthesisUtterance(processedText);
      utterance.lang = language === 'zh' ? 'zh-CN' : language;
      utterance.rate = playbackSpeed * 0.9;
      utterance.pitch = 1.0;
      utterance.volume = isMuted ? 0 : volume;
      
      // Track if speech actually started
      let speechStarted = false;
      
      utterance.onstart = () => {
        console.log('🎵 [AudioPlayer] Speech STARTED for slide:', currentSlide);
        speechStarted = true;
      };
      
      utterance.onend = () => {
        if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }
        console.log('✅ [AudioPlayer] Speech ended for slide:', currentSlide);
        console.log('   Speech had started:', speechStarted);
        
        // FIREFOX FIX: Only call onComplete if speech actually started
        // This prevents advancing slides when Firefox fires onend prematurely
        if (speechStarted) {
          if (isLooping) {
            console.log('🔁 [AudioPlayer] Looping - restarting speech');
            // Restart speech after a brief delay
            setTimeout(() => {
              startNewSpeech();
            }, 300);
          } else {
            setIsPlaying(false);
            onSpeakingChange?.(false);
            utteranceRef.current = null;
            
            console.log('📞 [AudioPlayer] Calling onComplete callback');
            onComplete?.();
          }
        } else {
          console.warn('⚠️ [AudioPlayer] onend fired but speech never started - ignoring (Firefox bug)');
        }
      };
      
      utterance.onerror = (error) => {
        if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }
        console.error('❌ [AudioPlayer] Speech error:', error);
        setIsPlaying(false);
        onSpeakingChange?.(false);
      };
      
      utteranceRef.current = utterance;
      console.log('🔊 [AudioPlayer] Calling speechSynthesis.speak()');
      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);
      onSpeakingChange?.(true);

      // Chrome/mobile silently cut speechSynthesis off after ~15s on long text,
      // which was breaking narration mid-slide on the browser-TTS fallback path.
      // Nudge pause()/resume() under that interval to keep long text playing.
      if (keepAliveRef.current) clearInterval(keepAliveRef.current);
      keepAliveRef.current = setInterval(() => {
        if (!('speechSynthesis' in window)) return;
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        } else if (keepAliveRef.current) {
          clearInterval(keepAliveRef.current);
          keepAliveRef.current = null;
        }
      }, 10000);
    }, 50); // 50ms delay for Firefox compatibility
  }, [text, currentSlide, language, playbackSpeed, isMuted, volume, isLooping, onSpeakingChange, onComplete]);

  // Auto-play when slide changes OR when autoPlay is enabled.
  // Waits for any pending load to finish first so we don't race the edge-function call.
  useEffect(() => {
    console.log('🎬 [AudioPlayer] Auto-play effect triggered');
    console.log('   autoPlay:', autoPlay, '  isLoading:', isLoading);
    console.log('   text available:', !!text, '  currentSlide:', currentSlide);
    console.log('   audioUrl:', audioUrl, '  useBrowserTTS:', useBrowserTTS);

    // If a load is still in-flight (cache check / edge fn call) don't start TTS yet.
    // The effect will re-run once isLoading becomes false.
    if (isLoading) {
      console.log('⏳ [AudioPlayer] Load still in progress — deferring autoPlay');
      return;
    }

    // If we have an audio URL, the separate audio auto-play effect will handle it
    if (audioUrl) {
      console.log('🎵 [AudioPlayer] Audio URL available - audio file will auto-play via separate effect');
      return;
    }

    // Only use browser TTS if no audio URL is available
    if (autoPlay && text && !audioUrl) {
      console.log('✅ [AudioPlayer] AutoPlay conditions met (no audio URL) - starting browser TTS in 300ms');

      const timer = setTimeout(() => {
        console.log('⏰ [AudioPlayer] Timer fired - calling startNewSpeech (browser TTS)');
        setUseBrowserTTS(true);
        startNewSpeech();
      }, 300);

      return () => {
        console.log('🧹 [AudioPlayer] Cleaning up timer');
        clearTimeout(timer);
      };
    } else {
      console.log('⏸️ [AudioPlayer] AutoPlay disabled or no text. Slide:', currentSlide, 'AutoPlay:', autoPlay);
    }
  }, [currentSlide, autoPlay, text, isLoading, audioUrl]); // added audioUrl dependency

  const handleLoadAudio = async () => {
    // Stamp which slide this load is for so we can discard stale results
    const slideAtStart = currentSlide;
    loadingForSlideRef.current = slideAtStart;

    setIsLoading(true);
    setLoadProgress(0);
    // Reset audio state for the new slide
    setAudioUrl(null);
    setUseBrowserTTS(false);

    try {
      // Build a per-slide cache key so each slide gets its own cached audio
      const slideContentId = `${contentId}_slide${slideAtStart}`;

      setLoadProgress(25);
      const cached = await getCachedAudio(slideContentId, contentType, language);

      // If the user already moved past this slide while we were awaiting, bail out
      if (currentSlide !== slideAtStart) {
        console.log('[AudioPlayer] Slide changed during load — discarding result for slide', slideAtStart);
        return;
      }

      if (cached) {
        setAudioUrl(cached.audio_url);
        setLoadProgress(100);
        setUseBrowserTTS(false);
      } else {
        // Try server-side generation (will time out fast if edge fn is missing)
        setLoadProgress(50);
        const url = await requestAudioGeneration({
          text,
          language,
          contentId: slideContentId,
          contentType,
          userId: user?.id,
        });

        // Discard again if slide moved while we awaited the edge function
        if (currentSlide !== slideAtStart) {
          console.log('[AudioPlayer] Slide changed during generation — discarding for slide', slideAtStart);
          return;
        }

        if (url) {
          setAudioUrl(url);
          setUseBrowserTTS(false);
        } else {
          // Edge function missing / returned null — go straight to browser TTS
          console.log('[AudioPlayer] Using browser TTS for slide', slideAtStart);
          setUseBrowserTTS(true);
        }
        setLoadProgress(100);
      }
    } catch (err) {
      console.warn('[AudioPlayer] Falling back to browser TTS:', err);
      setUseBrowserTTS(true);
      setLoadProgress(100);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayPause = () => {
    console.log('🔘 [AudioPlayer] handlePlayPause CLICKED');
    console.log('   isPlaying:', isPlaying);
    console.log('   useBrowserTTS:', useBrowserTTS);
    console.log('   audioUrl:', audioUrl);
    console.log('   text available:', !!text);
    
    // PRIORITY 1: If we have an audio URL, always use that instead of browser TTS
    if (audioUrl && audioRef.current) {
      console.log('🎵 [AudioPlayer] Using audio URL playback (priority over TTS)');
      // Make sure we're not in browser TTS mode
      if (useBrowserTTS && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      setUseBrowserTTS(false);
      
      if (isPlaying) {
        console.log('⏸️ [AudioPlayer] Pausing audio');
        audioRef.current.pause();
        setIsPlaying(false); // Explicitly set state immediately
        onPlayingChange?.(false);
      } else {
        console.log('▶️ [AudioPlayer] Playing audio');
        audioRef.current.play();
        setIsPlaying(true); // Explicitly set state immediately
        onPlayingChange?.(true);
      }
      return;
    }
    
    // PRIORITY 2: OpenAI audio is still generating for this slide (common on the
    // longer Bible-passage slide). Don't drop to the browser voice — remember the
    // intent and let the pending-play effect start the OpenAI audio once ready.
    if (!audioUrl && isLoading) {
      console.log('⏳ [AudioPlayer] Load in progress — will play OpenAI audio when ready');
      pendingPlayRef.current = true;
      return;
    }

    // PRIORITY 3: Browser TTS only when OpenAI has actually failed for this slide.
    if (useBrowserTTS && text) {
      console.log('📱 [AudioPlayer] OpenAI unavailable for this slide — using browser TTS');
      if (isPlaying) {
        window.speechSynthesis.pause();
        setIsPlaying(false);
        onSpeakingChange?.(false);
      } else if (utteranceRef.current) {
        window.speechSynthesis.resume();
        setIsPlaying(true);
        onSpeakingChange?.(true);
      } else {
        startNewSpeech();
      }
      return;
    }

    // PRIORITY 4: No audio yet and nothing in flight — kick off OpenAI generation
    // and play it as soon as it lands (only falls back to browser TTS if it fails).
    if (!audioUrl && text) {
      console.log('🔄 [AudioPlayer] Generating OpenAI audio, will play when ready');
      pendingPlayRef.current = true;
      handleLoadAudio();
      return;
    }

    // Fallback: try to load audio
    console.log('⚠️ [AudioPlayer] No audio URL available, triggering load');
    handleLoadAudio();
  };

  // When the user pressed play while audio was still loading, start playback the
  // moment it resolves: prefer the OpenAI audio URL, and only use the browser
  // voice if generation ultimately failed for this slide.
  useEffect(() => {
    if (!pendingPlayRef.current || isLoading) return;
    if (audioUrl && audioRef.current) {
      pendingPlayRef.current = false;
      setUseBrowserTTS(false);
      audioRef.current.play()
        .then(() => { setIsPlaying(true); onPlayingChange?.(true); })
        .catch((e) => console.error('[AudioPlayer] pending OpenAI play failed:', e));
    } else if (useBrowserTTS && text) {
      pendingPlayRef.current = false;
      startNewSpeech();
    }
  }, [audioUrl, useBrowserTTS, isLoading, text, startNewSpeech, onPlayingChange]);

  // External pause control (tap-to-pause on the slide). Pauses/resumes both the
  // generated-audio playback and the browser-TTS narration. Only reacts to the
  // `paused` flag flipping so it never fights slide/audio loading.
  useEffect(() => {
    if (paused === undefined) return;

    if (paused) {
      // Stop the keep-alive nudger so it can't auto-resume paused speech.
      if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }
      if (audioRef.current && !audioRef.current.paused) audioRef.current.pause();
      if ('speechSynthesis' in window && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
      }
      setIsPlaying(false);
      onPlayingChange?.(false);
      onSpeakingChange?.(false);
    } else {
      if (audioUrl && audioRef.current) {
        audioRef.current.play()
          .then(() => { setIsPlaying(true); onPlayingChange?.(true); })
          .catch(() => {});
      } else if (useBrowserTTS && 'speechSynthesis' in window && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setIsPlaying(true);
        onSpeakingChange?.(true);
      }
    }
    // Intentionally only depends on `paused` — reads current audio state at toggle time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  const handleSeek = (value: number[]) => {
    if (!audioRef.current || useBrowserTTS) return;
    const time = value[0];
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const handleVolumeChange = (value: number[]) => {
    const vol = value[0];
    setVolume(vol);
    setIsMuted(vol === 0);
    
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
    if (utteranceRef.current) {
      utteranceRef.current.volume = vol;
    }
  };

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      if (audioRef.current) audioRef.current.volume = volume;
    } else {
      setIsMuted(true);
      if (audioRef.current) audioRef.current.volume = 0;
    }
  };

  const changeSpeed = () => {
    const currentIndex = speeds.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % speeds.length;
    const newSpeed = speeds[nextIndex];
    
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed;
    }
    setPlaybackSpeed(newSpeed);
  };

  const skip = (seconds: number) => {
    if (!audioRef.current || useBrowserTTS) return;
    audioRef.current.currentTime = Math.max(0, Math.min(duration, currentTime + seconds));
  };

  const handleAudioLoaded = () => {
    if (!audioRef.current) return;
    setDuration(audioRef.current.duration);
    audioRef.current.playbackRate = playbackSpeed;
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const downloadAudio = () => {
    if (!audioUrl) return;
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = `${title || 'audio'}.mp3`;
    link.click();
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Main Play/Pause Button */}
      <Button
        onClick={handlePlayPause}
        disabled={isLoading}
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-gray-700 hover:bg-gray-100"
        title={isPlaying ? 'Pause voice' : 'Play voice'}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>

      {/* Audio menu — volume slider + mute in one place */}
      <div className="relative">
        <Button
          onClick={() => setShowAudioMenu(v => !v)}
          variant="ghost"
          size="sm"
          disabled={isLoading}
          className={`h-8 w-8 p-0 text-gray-700 hover:bg-gray-100 ${showAudioMenu ? 'bg-gray-100' : ''}`}
          title="Audio settings"
        >
          {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
        {showAudioMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowAudioMenu(false)} />
            <div className="absolute right-0 top-full mt-2 z-50 w-44 rounded-xl bg-white p-3 shadow-xl border border-gray-200">
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleMute}
                  className="text-gray-700 hover:text-gray-900 shrink-0"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange([parseFloat(e.target.value)])}
                  className="flex-1 accent-purple-600 cursor-pointer"
                />
              </div>
              <p className="mt-2 text-center text-[10px] text-gray-500">
                Volume {Math.round((isMuted ? 0 : volume) * 100)}%
              </p>
            </div>
          </>
        )}
      </div>

      {/* Loop/Repeat Toggle */}
      <Button
        onClick={() => setIsLooping(!isLooping)}
        variant="ghost"
        size="sm"
        disabled={isLoading}
        className={`h-8 w-8 p-0 hover:bg-gray-100 ${isLooping ? 'text-blue-600' : 'text-gray-700'}`}
        title={isLooping ? 'Disable loop' : 'Enable loop (repeat continuously)'}
      >
        <Repeat className="h-4 w-4" />
      </Button>

      {/* Speed Control - Small indicator */}
      {audioUrl && !useBrowserTTS && (
        <button
          onClick={changeSpeed}
          className="h-8 px-2 text-xs text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
          title="Change playback speed"
        >
          {playbackSpeed}x
        </button>
      )}

      {/* Hidden audio element */}
      {audioUrl && !useBrowserTTS && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onLoadedMetadata={handleAudioLoaded}
          onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
          onPlay={() => {
            console.log('▶️ [AudioPlayer] Audio file playing');
            setIsPlaying(true);
            onPlayingChange?.(true);
          }}
          onPause={() => {
            console.log('⏸️ [AudioPlayer] Audio file paused');
            setIsPlaying(false);
            onPlayingChange?.(false);
          }}
          onEnded={() => {
            console.log('✅ [AudioPlayer] Audio file ended');
            if (isLooping && audioRef.current) {
              console.log('🔁 [AudioPlayer] Looping - restarting audio');
              audioRef.current.currentTime = 0;
              audioRef.current.play();
            } else {
              setIsPlaying(false);
              onPlayingChange?.(false);
              console.log('📞 [AudioPlayer] Calling onComplete for slide advance');
              onComplete?.();
            }
          }}
          preload="metadata"
        />
      )}
    </div>
  );
};