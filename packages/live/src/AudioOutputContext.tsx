import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

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
  const [isSupported] = useState(isSetSinkIdSupported);
  const [devices, setDevices] = useState<AudioOutputDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const elementsRef = useRef<Set<HTMLAudioElement>>(new Set());

  const refreshDevices = useCallback(async () => {
    if (!isSupported || !navigator.mediaDevices?.enumerateDevices) return;
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
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
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
    elementsRef.current.forEach((el) => applySinkId(el, deviceId));
  }, [applySinkId]);

  const registerAudioElement = useCallback((el: HTMLAudioElement) => {
    elementsRef.current.add(el);
    if (selectedDeviceId) applySinkId(el, selectedDeviceId);
  }, [selectedDeviceId, applySinkId]);

  const unregisterAudioElement = useCallback((el: HTMLAudioElement) => {
    elementsRef.current.delete(el);
  }, []);

  return (
    <AudioOutputContext.Provider
      value={{ isSupported, devices, selectedDeviceId, selectDevice, registerAudioElement, unregisterAudioElement }}
    >
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
