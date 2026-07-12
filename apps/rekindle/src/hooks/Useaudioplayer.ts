import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/lib/supabase';
import { getCachedAudio } from '@/lib/services/openaiTTSService.ts';

export interface AudioPlayerState {
  audioUrl: string | null;
  isLoading: boolean;
  error: string | null;
  currentPosition: number;
  duration: number;
  playbackSpeed: number;
  isCompleted: boolean;
}

export interface UseAudioPlayerOptions {
  contentId: string;
  contentType: 'devotional' | 'book' | 'daily_devotional' | 'prayer' | 'declaration' | 'affirmation';
  text: string;
  autoLoad?: boolean;
}

export function useAudioPlayer({
  contentId,
  contentType,
  text,
  autoLoad = false
}: UseAudioPlayerOptions) {
  const { user } = useAuth();
  const { language } = useLanguage();

  const [state, setState] = useState<AudioPlayerState>({
    audioUrl: null,
    isLoading: false,
    error: null,
    currentPosition: 0,
    duration: 0,
    playbackSpeed: 1.0,
    isCompleted: false,
  });

  // Check if audio exists in cache
  const checkCache = useCallback(async () => {
    try {
      const cached = await getCachedAudio(contentId, contentType, language);
      if (cached) {
        setState(prev => ({ ...prev, audioUrl: cached.audio_url }));
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error checking cache:', err);
      return false;
    }
  }, [contentId, contentType, language]);

  // Load saved playback state
  const loadPlaybackState = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data } = await supabase
        .from('user_audio_playback_state')
        .select('*')
        .eq('user_id', user.id)
        .eq('content_id', contentId)
        .eq('content_type', contentType)
        .eq('language', language)
        .single();

      if (data) {
        setState(prev => ({
          ...prev,
          currentPosition: data.current_position_seconds || 0,
          duration: data.duration_seconds || 0,
          playbackSpeed: data.playback_speed || 1.0,
          isCompleted: data.completed || false,
        }));
      }
    } catch (err) {
      // No saved state, that's okay
    }
  }, [user?.id, contentId, contentType, language]);

  // Save playback state
  const savePlaybackState = useCallback(async (
    position: number,
    duration: number,
    speed: number,
    completed: boolean
  ) => {
    if (!user?.id) return;

    try {
      await supabase
        .from('user_audio_playback_state')
        .upsert({
          user_id: user.id,
          content_id: contentId,
          content_type: contentType,
          language: language,
          current_position_seconds: position,
          duration_seconds: Math.floor(duration),
          playback_speed: speed,
          completed: completed,
          last_played_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,content_id,content_type,language'
        });

      // Track analytics if completed
      if (completed && !state.isCompleted) {
        await supabase
          .from('audio_playback_analytics')
          .insert({
            user_id: user.id,
            content_id: contentId,
            content_type: contentType,
            language: language,
            session_duration_seconds: Math.floor(position),
            completion_percentage: 100,
            playback_speed: speed,
            completed_at: new Date().toISOString(),
          });
      }
    } catch (err) {
      console.error('Error saving playback state:', err);
    }
  }, [user?.id, contentId, contentType, language, state.isCompleted]);

  // Initialize
  useEffect(() => {
    if (autoLoad) {
      checkCache();
    }
    if (user?.id) {
      loadPlaybackState();
    }
  }, [autoLoad, user?.id, checkCache, loadPlaybackState]);

  return {
    state,
    checkCache,
    loadPlaybackState,
    savePlaybackState,
  };
}

// Hook for tracking audio analytics
export function useAudioAnalytics(contentType: string) {
  const { user } = useAuth();

  const trackListening = useCallback(async (
    contentId: string,
    language: string,
    durationSeconds: number,
    completionPercentage: number,
    playbackSpeed: number
  ) => {
    if (!user?.id) return;

    try {
      await supabase
        .from('audio_playback_analytics')
        .insert({
          user_id: user.id,
          content_id: contentId,
          content_type: contentType,
          language: language,
          session_duration_seconds: durationSeconds,
          completion_percentage: completionPercentage,
          playback_speed: playbackSpeed,
          played_at: new Date().toISOString(),
        });
    } catch (err) {
      console.error('Error tracking analytics:', err);
    }
  }, [user?.id, contentType]);

  const getListeningHistory = useCallback(async (limit = 10) => {
    if (!user?.id) return [];

    try {
      const { data } = await supabase
        .from('audio_playback_analytics')
        .select('*')
        .eq('user_id', user.id)
        .eq('content_type', contentType)
        .order('played_at', { ascending: false })
        .limit(limit);

      return data || [];
    } catch (err) {
      console.error('Error fetching history:', err);
      return [];
    }
  }, [user?.id, contentType]);

  return {
    trackListening,
    getListeningHistory,
  };
}

// Hook for checking available audio
export function useAvailableAudio(contentId: string, contentType: string) {
  const { language } = useLanguage();
  const [isAvailable, setIsAvailable] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    const checkAvailability = async () => {
      setIsChecking(true);
      try {
        const cached = await getCachedAudio(contentId, contentType, language);
        setIsAvailable(!!cached);
      } catch (err) {
        setIsAvailable(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkAvailability();
  }, [contentId, contentType, language]);

  return { isAvailable, isChecking };
}