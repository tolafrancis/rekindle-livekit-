import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';

const STORAGE_KEY = 'rk_preferred_audio_output';

export interface AudioOutputDevice {
  deviceId: string;
  label: string;
}

interface AudioOutputContextValue {
  /** false on Safari/iOS and any browser without HTMLMediaElement.setSinkId. */
  isSupported: boolean;
  devices: AudioOutputDevice[];
  /** '' means the system default output. */
  selectedDeviceId: string;
  selectDevice: (deviceId: string) => void;
  /** Called by every mounted remote <audio> element so device changes reach it. */
  registerAudioElement: (el: HTMLAudioElement) => void;
  unregisterAudioElement: (el: HTMLAudioElement) => void;
}

const AudioOutputContext = createContext<AudioOutputContextValue | null>(null);

const isSetSinkIdSupported = () =>
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

export const AudioOutputProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSupported] = useState(() => isSetSinkIdSupported() || Capacitor.isNativePlatform());
  const [devices, setDevices] = useState<AudioOutputDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const elementsRef = useRef<Set<HTMLAudioElement>>(new Set());

  const refreshDevices = useCallback(async () => {
    if (!isSupported) return;

    if (Capacitor.isNativePlatform()) {
      const raw = (window as any).AndroidBridge?.getAudioOutputs?.();
      if (raw) {
        try {
          const outputs = JSON.parse(raw).map((d: any) => ({ deviceId: d.id, label: d.label }));
          setDevices(outputs);
          
          setSelectedDeviceId((current) => {
            if (current && outputs.some((d: any) => d.deviceId === current)) return current;
            const persisted = localStorage.getItem(STORAGE_KEY);
            if (persisted && outputs.some((d: any) => d.deviceId === persisted)) return persisted;
            return '';
          });
        } catch (err) {
          console.error('[AudioOutput] Failed to parse native audio outputs:', err);
        }
      }
      return;
    }

    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const outputs = all
        .filter((d) => d.kind === 'audiooutput')
        .map((d) => ({ deviceId: d.deviceId, label: d.label || 'Audio device' }));
      setDevices(outputs);

      setSelectedDeviceId((current) => {
        if (current && outputs.some((d) => d.deviceId === current)) return current;
        const persisted = localStorage.getItem(STORAGE_KEY);
        if (persisted && outputs.some((d) => d.deviceId === persisted)) return persisted;
        return '';
      });
    } catch {
      // enumerateDevices can reject before mic/camera permission is granted; the
      // list simply stays empty until a later devicechange/permission event.
    }
  }, [isSupported]);

  useEffect(() => {
    if (!isSupported) return;
    refreshDevices();

    const handleCallActive = (e: Event) => {
      const active = (e as CustomEvent).detail as boolean;
      if (active) {
        refreshDevices();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('call:active', handleCallActive);
    }

    if (!Capacitor.isNativePlatform() && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('call:active', handleCallActive);
      }
      if (!Capacitor.isNativePlatform() && navigator.mediaDevices) {
        navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
      }
    };
  }, [isSupported, refreshDevices]);

  const applySinkId = useCallback((el: HTMLAudioElement, deviceId: string) => {
    (el as any).setSinkId?.(deviceId).catch(() => {
      // A device can disappear between selection and apply (unplugged, Bluetooth
      // dropped) — leave that element on its previous output rather than throwing.
    });
  }, []);

  const selectDevice = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId);
    localStorage.setItem(STORAGE_KEY, deviceId);
    if (Capacitor.isNativePlatform()) {
      (window as any).AndroidBridge?.setAudioOutput?.(deviceId || 'earpiece');
      return;
    }
    elementsRef.current.forEach((el) => applySinkId(el, deviceId));
  }, [applySinkId]);

  // Real root cause found live (2026-08-20): registerAudioElement used to
  // depend on [selectedDeviceId, applySinkId] — meaning ITS identity changed
  // every time selectedDeviceId changed, most commonly the very first time
  // (mount → async enumerateDevices() resolves → a persisted preferred
  // device from localStorage gets applied, a real state change that happens
  // moments AFTER a call already has real-time audio flowing). Every
  // consumer's effect that lists registerAudioElement in its own dependency
  // array (RemoteAudio in DailyVideoCall.tsx) was then forced to re-run:
  // tear down (unregisterAudioElement + el.srcObject = null — silence) and
  // immediately rebuild (new MediaStream wrapping the SAME already-flowing
  // WebRTC track). That's a real, live audio stream being torn down and
  // recreated for a reason that has nothing to do with the track itself —
  // exactly the shape of bug that can knock a browser's WebRTC jitter
  // buffer into a more conservative (higher-latency) state that doesn't
  // recover for the rest of the call, matching a live report precisely:
  // near-real-time at first, a glitch shortly after the meeting starts
  // (exactly when device enumeration resolves), then 15-20s of sustained
  // added latency for the rest of the session — on BOTH normal and
  // translated audio, since this element carries every remote participant's
  // voice regardless of what feature is active.
  //
  // Fixed by mirroring selectedDeviceId into a ref: registerAudioElement
  // still applies the CURRENT device to a newly-registering element (reads
  // the ref, always up to date), but its own identity no longer depends on
  // that value — it's now permanently stable (applySinkId is already `[]`),
  // so no consumer's effect is ever forced to tear down a live stream just
  // because the selected output device changed elsewhere.
  const selectedDeviceIdRef = useRef(selectedDeviceId);
  useEffect(() => { selectedDeviceIdRef.current = selectedDeviceId; }, [selectedDeviceId]);

  const registerAudioElement = useCallback((el: HTMLAudioElement) => {
    elementsRef.current.add(el);
    if (selectedDeviceIdRef.current && !Capacitor.isNativePlatform()) applySinkId(el, selectedDeviceIdRef.current);
  }, [applySinkId]);

  const unregisterAudioElement = useCallback((el: HTMLAudioElement) => {
    elementsRef.current.delete(el);
  }, []);

  // Memoized so the provider re-rendering (e.g. refreshDevices() setting a
  // brand-new `devices` array even when its contents didn't change) doesn't
  // hand every consumer a new object identity on every occurrence — belt
  // and braces alongside the registerAudioElement fix above: the individual
  // callbacks were already the thing that mattered for that specific bug,
  // but there's no reason to churn the wrapping object either.
  const value = useMemo<AudioOutputContextValue>(
    () => ({ isSupported, devices, selectedDeviceId, selectDevice, registerAudioElement, unregisterAudioElement }),
    [isSupported, devices, selectedDeviceId, selectDevice, registerAudioElement, unregisterAudioElement],
  );

  return (
    <AudioOutputContext.Provider value={value}>
      {children}
    </AudioOutputContext.Provider>
  );
};

/** Safe to call outside a provider (e.g. surfaces that haven't wired it up yet) —
 *  returns an unsupported/no-op value instead of throwing. */
export const useAudioOutput = (): AudioOutputContextValue => {
  const ctx = useContext(AudioOutputContext);
  if (ctx) return ctx;
  return {
    isSupported: false,
    devices: [],
    selectedDeviceId: '',
    selectDevice: () => {},
    registerAudioElement: () => {},
    unregisterAudioElement: () => {},
  };
};
