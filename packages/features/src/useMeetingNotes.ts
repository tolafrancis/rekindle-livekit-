import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@rekindle/supabase';
import type { TranscriptLine } from './meetingAIEngine';

/**
 * Distributed AI note-taking for a meeting.
 *
 * Why distributed: the Web Speech API (`SpeechRecognition`) can ONLY listen to the
 * local microphone — by spec it cannot be fed a remote MediaStream. So one browser
 * can never transcribe the other participants. Instead, when the host starts notes:
 *
 *   1. `notes-started` is broadcast on a Supabase realtime channel.
 *   2. EVERY participant's browser starts transcribing its OWN microphone.
 *   3. Each final phrase is broadcast as a `line` with that speaker's name.
 *   4. Everyone merges the lines, so the note-taker ends up with a complete,
 *      speaker-attributed transcript.
 *
 * Because everyone's mic is transcribed, callers MUST show the notes banner
 * (see MeetingNotesBanner) for the duration.
 *
 * Transport is Supabase realtime broadcast — nothing to do with Daily/LiveKit.
 */

export interface UseMeetingNotes {
  /** True while notes are being taken anywhere in the meeting. */
  active: boolean;
  /** Display name of whoever started notes (for the banner). */
  startedBy: string | null;
  /** Merged, speaker-attributed transcript from all participants. */
  lines: TranscriptLine[];
  /** What the local mic is currently hearing (not yet final). */
  interimText: string;
  /** True if this browser can transcribe (Web Speech API present). */
  isSupported: boolean;
  /** Last fatal recognition error, if any (mic blocked, speech service refused…). */
  error: string | null;
  startNotes: () => void;
  stopNotes: () => void;
  reset: () => void;
}

/** Errors that will never resolve by restarting — restarting just loops silently. */
const FATAL_SPEECH_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported']);

function describeSpeechError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access for speech recognition was blocked. Allow the mic for this site, then start notes again.';
    case 'audio-capture':
      return 'No microphone was available to transcribe.';
    case 'language-not-supported':
      return 'Speech recognition does not support this language.';
    case 'network':
      return 'Speech recognition lost its network connection.';
    default:
      return `Speech recognition error: ${code}`;
  }
}

// Minimal shapes for the (still non-standard) Web Speech API.
interface SpeechResultEvent extends Event {
  resultIndex: number;
  results: { isFinal: boolean; 0: { transcript: string } ; length: number }[] & { length: number };
}
interface Recognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
}
// NOTE: do NOT `declare global` for Window.SpeechRecognition here — MeetingTranscriptionPanel
// already augments Window with its own (incompatible) shape, and two declarations conflict.
// Resolve the constructor through a local cast instead.
type RecognitionCtor = new () => Recognition;
function getRecognitionCtor(): RecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function useMeetingNotes(
  meetingId: string,
  speakerName: string,
  enabled: boolean = true,
): UseMeetingNotes {
  const [active, setActive] = useState(false);
  const [startedBy, setStartedBy] = useState<string | null>(null);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [interimText, setInterimText] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const startedAtRef = useRef<number | null>(null);
  // `active` inside recognition callbacks would be stale — mirror it in a ref.
  const activeRef = useRef(false);
  const speakerRef = useRef(speakerName);
  useEffect(() => { speakerRef.current = speakerName; }, [speakerName]);

  useEffect(() => {
    setIsSupported(!!getRecognitionCtor());
  }, []);

  const elapsed = () =>
    startedAtRef.current ? Math.floor((Date.now() - startedAtRef.current) / 1000) : 0;

  const addLine = useCallback((line: TranscriptLine) => {
    setLines((prev) => [...prev, line]);
  }, []);

  // ── Realtime channel: notes-started / notes-stopped / line ────────────────
  useEffect(() => {
    if (!meetingId || !enabled) return;

    const channel = supabase.channel(`meeting-notes-${meetingId}`, {
      config: { broadcast: { self: false } },
    });

    channel.on('broadcast', { event: 'notes-started' }, (payload) => {
      const p = payload?.payload as { by?: string; startedAt?: number } | undefined;
      startedAtRef.current = p?.startedAt ?? Date.now();
      setStartedBy(p?.by ?? 'Someone');
      setActive(true);
      activeRef.current = true;
    });

    channel.on('broadcast', { event: 'notes-stopped' }, () => {
      setActive(false);
      activeRef.current = false;
      setStartedBy(null);
    });

    channel.on('broadcast', { event: 'line' }, (payload) => {
      const l = payload?.payload as TranscriptLine | undefined;
      if (l?.text) addLine(l);
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      try { supabase.removeChannel(channel); } catch { /* noop */ }
      channelRef.current = null;
    };
  }, [meetingId, enabled, addLine]);

  // ── Local microphone transcription, whenever notes are active ─────────────
  useEffect(() => {
    if (!active || !isSupported) return;

    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    // NOT '' — the spec makes an empty lang mean "use the document language", and
    // Chrome can refuse start() outright. There is no auto-detect; pick the user's.
    recognition.lang = navigator.language || 'en-US';

    recognition.onresult = (event: SpeechResultEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i] as unknown as { isFinal: boolean; 0: { transcript: string } };
        const text = result[0]?.transcript?.trim() ?? '';
        if (!text) continue;

        if (result.isFinal) {
          const line: TranscriptLine = {
            speaker: speakerRef.current,
            text,
            timestamp: elapsed(),
          };
          addLine(line); // self (broadcast self:false means we won't hear our own)
          try {
            channelRef.current?.send({ type: 'broadcast', event: 'line', payload: line });
          } catch { /* noop */ }
        } else {
          interim += text + ' ';
        }
      }
      setInterimText(interim.trim());
    };

    // A fatal error must stop the restart loop, or onend/start ping-pongs forever
    // while capturing nothing — a silent failure with no way to diagnose it.
    let fatal = false;

    // The API stops on silence; restart while notes are still running.
    recognition.onend = () => {
      if (activeRef.current && !fatal) {
        try { recognition.start(); } catch { /* already starting */ }
      }
    };

    recognition.onerror = (e: Event) => {
      const code = (e as Event & { error?: string }).error ?? 'unknown';
      // no-speech fires constantly during silence; it is not a failure.
      if (code === 'no-speech' || code === 'aborted') return;

      console.warn('[useMeetingNotes] recognition error:', code);
      if (FATAL_SPEECH_ERRORS.has(code)) {
        fatal = true;
        setError(describeSpeechError(code));
      }
    };

    try {
      recognition.start();
    } catch (err) {
      console.warn('[useMeetingNotes] recognition.start() threw:', err);
      setError('Could not start speech recognition in this browser.');
    }
    recognitionRef.current = recognition;

    return () => {
      activeRef.current = false; // prevent the onend auto-restart
      try { recognition.stop(); } catch { /* noop */ }
      recognitionRef.current = null;
      setInterimText('');
    };
  }, [active, isSupported, addLine]);

  const startNotes = useCallback(() => {
    const startedAt = Date.now();
    startedAtRef.current = startedAt;
    setError(null);
    setLines([]);
    setStartedBy(speakerRef.current);
    setActive(true);
    activeRef.current = true;
    try {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'notes-started',
        payload: { by: speakerRef.current, startedAt },
      });
    } catch { /* noop */ }
  }, []);

  const stopNotes = useCallback(() => {
    setActive(false);
    activeRef.current = false;
    setStartedBy(null);
    try {
      channelRef.current?.send({ type: 'broadcast', event: 'notes-stopped', payload: {} });
    } catch { /* noop */ }
  }, []);

  const reset = useCallback(() => {
    setLines([]);
    setInterimText('');
    startedAtRef.current = null;
  }, []);

  return { active, startedBy, lines, interimText, isSupported, error, startNotes, stopNotes, reset };
}
