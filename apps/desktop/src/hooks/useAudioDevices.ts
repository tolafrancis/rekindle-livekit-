import { useState, useEffect, useCallback } from 'react';

export interface AudioDeviceOption {
  deviceId: string;
  label: string;
  groupId: string;
}

export function useAudioDevices() {
  const [inputs, setInputs] = useState<AudioDeviceOption[]>([]);
  const [outputs, setOutputs] = useState<AudioDeviceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasPermissions, setHasPermissions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enumerate = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        throw new Error('Audio devices enumeration not supported in this environment');
      }

      const devices = await navigator.mediaDevices.enumerateDevices();

      const audioInputs: AudioDeviceOption[] = [];
      const audioOutputs: AudioDeviceOption[] = [];

      devices.forEach((d) => {
        if (d.kind === 'audioinput') {
          audioInputs.push({
            deviceId: d.deviceId,
            label: d.label || `Microphone / Line In (${audioInputs.length + 1})`,
            groupId: d.groupId,
          });
        } else if (d.kind === 'audiooutput') {
          audioOutputs.push({
            deviceId: d.deviceId,
            label: d.label || `Speaker / Line Out (${audioOutputs.length + 1})`,
            groupId: d.groupId,
          });
        }
      });

      setInputs(audioInputs);
      setOutputs(audioOutputs);
      setError(null);
    } catch (err: any) {
      console.error('[useAudioDevices] Error enumerating devices:', err);
      setError(err.message || 'Could not list audio devices');
    } finally {
      setLoading(false);
    }
  }, []);

  const requestPermissions = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Immediately stop all tracks from prompt
      stream.getTracks().forEach((t) => t.stop());
      setHasPermissions(true);
      await enumerate();
      return true;
    } catch (err: any) {
      console.warn('[useAudioDevices] Microphone permission denied or failed:', err);
      setError('Microphone permission is required to detect sound board devices');
      return false;
    }
  }, [enumerate]);

  useEffect(() => {
    enumerate();

    const handleDeviceChange = () => {
      enumerate();
    };

    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [enumerate]);

  return {
    inputs,
    outputs,
    loading,
    hasPermissions,
    error,
    requestPermissions,
    refreshDevices: enumerate,
  };
}
