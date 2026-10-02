import { useEffect, useRef, useState } from 'react';

/**
 * Continuous speech-to-text from this device's microphone, using the
 * browser's own Web Speech API (the same engine /display uses for spoken
 * questions). Each finalized phrase goes to onFinal; the phrase still
 * being spoken goes to onInterim.
 *
 * Browsers end a recognition session on their own after a pause or a
 * minute or so of talking; this restarts it for as long as `enabled` is
 * true, so the speaker can just keep talking. Fatal errors (mic blocked,
 * no microphone) stop it and are reported through `error`.
 *
 * Not available everywhere (notably Firefox) — `supported` is false there
 * and the caller offers typing instead.
 */

export type SpeechCaptureError = 'mic_denied' | 'no_mic' | 'speech_network' | 'speech_failed' | null;

interface Options {
  /** BCP-47 tag, e.g. 'vi-VN'. Changing it restarts recognition. */
  lang: string;
  enabled: boolean;
  onFinal: (text: string) => void;
  onInterim?: (text: string) => void;
}

const getRecognitionCtor = (): any =>
  typeof window === 'undefined' ? null : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;

export const speechCaptureSupported = () => !!getRecognitionCtor();

export function useSpeechCapture({ lang, enabled, onFinal, onInterim }: Options) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<SpeechCaptureError>(null);
  const onFinalRef = useRef(onFinal);
  const onInterimRef = useRef(onInterim);
  onFinalRef.current = onFinal;
  onInterimRef.current = onInterim;

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (!enabled || !Ctor) {
      setListening(false);
      return;
    }

    let stopped = false;
    let recognition: any = null;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    // Back-to-back failures without any speech in between — keeps a
    // persistently failing engine from restarting in a tight loop.
    let consecutiveFailures = 0;

    const start = () => {
      if (stopped) return;
      recognition = new Ctor();
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => { setListening(true); setError(null); };
      recognition.onresult = (e: any) => {
        consecutiveFailures = 0;
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i];
          const text = (result[0]?.transcript || '').trim();
          if (!text) continue;
          if (result.isFinal) onFinalRef.current(text);
          else interim += (interim ? ' ' : '') + text;
        }
        onInterimRef.current?.(interim);
      };
      recognition.onerror = (e: any) => {
        switch (e.error) {
          case 'not-allowed':
          case 'service-not-allowed':
            stopped = true;
            setError('mic_denied');
            break;
          case 'audio-capture':
            stopped = true;
            setError('no_mic');
            break;
          case 'network':
            consecutiveFailures++;
            setError('speech_network');
            break;
          case 'no-speech':
          case 'aborted':
            break; // a pause, or our own stop — just restart
          default:
            consecutiveFailures++;
            if (consecutiveFailures >= 3) setError('speech_failed');
        }
      };
      recognition.onend = () => {
        setListening(false);
        onInterimRef.current?.('');
        if (stopped) return;
        if (consecutiveFailures >= 5) {
          stopped = true;
          setError((prev) => prev || 'speech_failed');
          return;
        }
        // Back off a little after failures (e.g. a network blip) so it
        // recovers on its own once the connection returns.
        restartTimer = setTimeout(start, consecutiveFailures > 0 ? Math.min(4000, 500 * 2 ** consecutiveFailures) : 150);
      };

      try {
        recognition.start();
      } catch (err) {
        console.error('[useSpeechCapture] start failed:', err);
        consecutiveFailures++;
        restartTimer = setTimeout(start, 1000);
      }
    };

    setError(null);
    start();

    return () => {
      stopped = true;
      if (restartTimer) clearTimeout(restartTimer);
      try { recognition?.abort(); } catch { /* already stopped */ }
      setListening(false);
      onInterimRef.current?.('');
    };
  }, [lang, enabled]);

  return { listening, error, supported: speechCaptureSupported() };
}

/** Asks for microphone permission up front with a plain getUserMedia
 *  call, so a block shows a clear message before recognition starts
 *  (and so iOS shows its prompt in response to the tap). */
export async function ensureMicrophonePermission(): Promise<SpeechCaptureError> {
  if (!navigator.mediaDevices?.getUserMedia) return null; // let recognition prompt on its own
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return null;
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return 'mic_denied';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'no_mic';
    return 'speech_failed';
  }
}
