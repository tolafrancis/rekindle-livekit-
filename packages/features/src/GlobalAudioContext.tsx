import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

export interface NowPlayingInfo {
  title: string;
  subtitle?: string;   // artist/source/category
  isPlaying: boolean;
}

export interface AudioControls {
  onPlayPause: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
}

interface GlobalAudioContextValue {
  nowPlaying: NowPlayingInfo | null;
  reportPlayback: (info: NowPlayingInfo | null) => void;
  registerControls: (controls: AudioControls) => void;
}

const GlobalAudioContext = createContext<GlobalAudioContextValue | null>(null);

export const GlobalAudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [nowPlaying, setNowPlayingState] = useState<NowPlayingInfo | null>(null);
  const nowPlayingRef = useRef<NowPlayingInfo | null>(null);
  const controlsRef = useRef<AudioControls | null>(null);

  const registerControls = useCallback((controls: AudioControls) => {
    controlsRef.current = controls;
    const currentNP = nowPlayingRef.current;
    if (Capacitor.isNativePlatform() && currentNP) {
      (window as any).AndroidBridge?.showMediaNotification?.(
        currentNP.title,
        currentNP.subtitle ?? '',
        currentNP.isPlaying,
        !!controls.onPrevious,
        !!controls.onNext
      );
    }
  }, []);

  const reportPlayback = useCallback((info: NowPlayingInfo | null) => {
    const prev = nowPlayingRef.current;
    nowPlayingRef.current = info;
    setNowPlayingState(info);

    if (Capacitor.isNativePlatform()) {
      if (info) {
        if (prev && prev.title === info.title && prev.subtitle === info.subtitle) {
          if (prev.isPlaying !== info.isPlaying) {
            (window as any).AndroidBridge?.updateMediaPlaybackState?.(info.isPlaying);
          }
        } else {
          (window as any).AndroidBridge?.showMediaNotification?.(
            info.title,
            info.subtitle ?? '',
            info.isPlaying,
            !!controlsRef.current?.onPrevious,
            !!controlsRef.current?.onNext
          );
        }
      } else {
        (window as any).AndroidBridge?.hideMediaNotification?.();
        controlsRef.current = null;
      }
    }
  }, []);

  // Listen for media session action events from native
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleMediaAction = (e: Event) => {
      const action = (e as CustomEvent).detail?.action;
      if (!controlsRef.current) return;

      if (action === 'play_pause') {
        controlsRef.current.onPlayPause();
      } else if (action === 'next' && controlsRef.current.onNext) {
        controlsRef.current.onNext();
      } else if (action === 'previous' && controlsRef.current.onPrevious) {
        controlsRef.current.onPrevious();
      }
    };

    window.addEventListener('mediaSessionAction', handleMediaAction);
    return () => {
      window.removeEventListener('mediaSessionAction', handleMediaAction);
    };
  }, []);

  return (
    <GlobalAudioContext.Provider value={{ nowPlaying, reportPlayback, registerControls }}>
      {children}
    </GlobalAudioContext.Provider>
  );
};

export const useGlobalAudio = () => {
  const context = useContext(GlobalAudioContext);
  if (!context) {
    throw new Error('useGlobalAudio must be used within a GlobalAudioProvider');
  }
  return context;
};
