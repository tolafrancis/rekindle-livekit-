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
  /** True while start_bot_session RPC or session lookup is in flight. */
  isStarting: boolean;
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
  /** Currently selected display language for transcripts ('en' default). */
  selectedLanguage: string;
  /** Set display language for transcripts. */
  setSelectedLanguage: (lang: string) => void;
  /** List of available transcript languages active for this room. */
  availableLanguages: string[];
  startNotes: () => void;
  stopNotes: () => void;
  reset: () => void;
}

export function useMeetingNotes(
  meetingId: string,
  speakerName: string,
  enabled: boolean = true,
  roomName?: string,
  ministryId?: string,
  userId?: string,
): UseMeetingNotes {
  const [active, setActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [startedBy, setStartedBy] = useState<string | null>(null);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [interimText, setInterimText] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('en');
  const [availableLanguages, setAvailableLanguages] = useState<string[]>(['en']);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const startTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);
  const speakerRef = useRef(speakerName);
  useEffect(() => { speakerRef.current = speakerName; }, [speakerName]);

  // Real bug found live (2026-08-22): startNotes() below dispatched its STT
  // bot session with source_language HARDCODED to 'en', regardless of what
  // the ministry actually speaks — same class of bug already fixed for Show
  // Captions (FloatingTranslationButton.tsx). Read the ministry's own
  // configured source_language (which may itself be 'auto' — see
  // MinistryTranslationSettings.tsx — the bot then auto-detects) instead of
  // assuming English. Read via ref, not state, so it doesn't force
  // startNotes to be recreated on every render.
  const sourceLanguageRef = useRef('auto');
  useEffect(() => {
    if (!ministryId) return;
    supabase
      .from('language_configs')
      .select('source_language')
      .eq('ministry_id', ministryId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.source_language) sourceLanguageRef.current = data.source_language;
      });
  }, [ministryId]);

  const elapsed = () =>
    startedAtRef.current ? Math.floor((Date.now() - startedAtRef.current) / 1000) : 0;

  const addLine = useCallback((line: TranscriptLine) => {
    setLines((prev) => [...prev, line]);
  }, []);

  // ── Poll & Subscribe to Active Bot Sessions and translation_logs ─────────
  useEffect(() => {
    if (!roomName) return;
    let cancelled = false;
    let logChannel: ReturnType<typeof supabase.channel> | null = null;
    let currentSessionId: string | null = null;

    const setupLogSubscription = (sessionId: string, sourceLang: string) => {
      if (currentSessionId === sessionId && logChannel) return;
      currentSessionId = sessionId;

      if (logChannel) {
        supabase.removeChannel(logChannel);
        logChannel = null;
      }

      const useSourceText = selectedLanguage === 'en' || selectedLanguage === sourceLang;

      // Fetch historical logs for active session
      supabase
        .from('translation_logs')
        .select('id, source_text, translated_text, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .then(({ data: logs }) => {
          if (cancelled || !logs || !Array.isArray(logs)) return;
          const mapped: TranscriptLine[] = logs
            .filter((row: any) => row && (row.source_text || row.translated_text))
            .map((row: any) => ({
              speaker: 'Speaker',
              text: useSourceText ? (row.source_text ?? '') : (row.translated_text ?? ''),
              timestamp: Math.floor((new Date(row.created_at).getTime() - (startedAtRef.current || Date.now())) / 1000),
            }));
          setLines(mapped);
        });

      // Realtime insert listener on translation_logs for active session
      logChannel = supabase
        .channel(`notes-logs-${sessionId}-${selectedLanguage}`)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'translation_logs', filter: `session_id=eq.${sessionId}` },
          (payload) => {
            const row = payload.new as any;
            if (!row) return;
            const line: TranscriptLine = {
              speaker: 'Speaker',
              text: useSourceText ? (row.source_text ?? '') : (row.translated_text ?? ''),
              timestamp: Math.floor((new Date(row.created_at).getTime() - (startedAtRef.current || Date.now())) / 1000),
            };
            setLines((prev) => [...prev, line]);
          })
        .subscribe();
    };

    const syncSession = () => {
      supabase
        .from('translation_sessions')
        .select('id, target_language, source_language, status')
        .eq('livekit_room_name', roomName)
        .in('status', ['initialising', 'joining', 'active', 'paused'])
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          if (cancelled || !data || !Array.isArray(data)) return;
          const validSessions = data.filter((s: any) => s && s.target_language);
          const langs = Array.from(new Set(['en', ...validSessions.map((s: any) => s.target_language)]));
          setAvailableLanguages(langs);

          if (validSessions.length > 0) {
            if (startTimeoutRef.current) {
              clearTimeout(startTimeoutRef.current);
              startTimeoutRef.current = null;
            }
            setActive(true);
            setIsStarting(false);

            const matchingSession = validSessions.find((s: any) => s.target_language === selectedLanguage) || validSessions[0];
            if (matchingSession && matchingSession.id) {
              setupLogSubscription(matchingSession.id, matchingSession.source_language ?? 'en');
            }
          }
        });
    };

    syncSession();

    // Re-sync whenever translation_sessions for this room changes (e.g. new bot session created)
    const sessionChannel = supabase
      .channel(`notes-sessions-${roomName}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'translation_sessions', filter: `livekit_room_name=eq.${roomName}` },
        syncSession)
      .subscribe();

    return () => {
      cancelled = true;
      if (startTimeoutRef.current) {
        clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = null;
      }
      supabase.removeChannel(sessionChannel);
      if (logChannel) supabase.removeChannel(logChannel);
    };
  }, [roomName, selectedLanguage]);

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
      setIsStarting(false);
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

  const startNotes = useCallback(() => {
    const startedAt = Date.now();
    startedAtRef.current = startedAt;
    setError(null);
    setLines([]);
    setStartedBy(speakerRef.current);
    setIsStarting(true);
    setActive(true);
    activeRef.current = true;

    if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current);

    // 10-second startup safety timeout: prevents UI from staying on "Starting..." indefinitely
    startTimeoutRef.current = setTimeout(() => {
      setIsStarting((starting) => {
        if (starting) {
          console.warn('[useMeetingNotes] Bot startup timed out after 10s');
          setError('AI notes bot timed out while starting. Please try again.');
          setActive(false);
          activeRef.current = false;
          return false;
        }
        return false;
      });
    }, 10000);

    try {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'notes-started',
        payload: { by: speakerRef.current, startedAt },
      });
    } catch { /* noop */ }

    // Dispatch or reuse translation/STT bot session via start_bot_session RPC
    if (roomName && ministryId) {
      (async () => {
        try {
          // Check if ANY active bot session (translation or notes) is already running for this room
          const { data: existing } = await supabase
            .from('translation_sessions')
            .select('id')
            .eq('livekit_room_name', roomName)
            .in('status', ['initialising', 'joining', 'active', 'paused'])
            .limit(1);

          if (existing && existing.length > 0 && existing[0]?.id) {
            console.log('[useMeetingNotes] Active bot session already running for room — reusing existing session');
            if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current);
            setIsStarting(false);
            return;
          }

          // No bot session is running — start a same-language (captions/
          // notes-only, no translation) STT session in whatever language
          // this ministry actually speaks (or 'auto' to detect it).
          const sourceLanguage = sourceLanguageRef.current;
          const { error: rpcError } = await supabase.rpc('start_bot_session', {
            p_ministry_id: ministryId,
            p_room_name: roomName,
            p_source_language: sourceLanguage,
            p_target_language: sourceLanguage,
            p_speaker_identity: userId || null,
          });
          if (rpcError) {
            console.warn('[useMeetingNotes] start_bot_session returned error:', rpcError);
            if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current);
            setError(rpcError.message || 'Failed to start AI notes bot.');
            setIsStarting(false);
            setActive(false);
            activeRef.current = false;
          }
        } catch (err: any) {
          console.warn('[useMeetingNotes] start_bot_session check failed:', err);
          if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current);
          setError(err?.message || 'Failed to start AI notes bot.');
          setIsStarting(false);
          setActive(false);
          activeRef.current = false;
        }
      })();
    } else {
      if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current);
      setIsStarting(false);
    }
  }, [roomName, ministryId]);

  const stopNotes = useCallback(() => {
    if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current);
    setActive(false);
    setIsStarting(false);
    activeRef.current = false;
    setStartedBy(null);
    try {
      channelRef.current?.send({ type: 'broadcast', event: 'notes-stopped', payload: {} });
    } catch { /* noop */ }
  }, []);

  const reset = useCallback(() => {
    if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current);
    setLines([]);
    setInterimText('');
    startedAtRef.current = null;
    setIsStarting(false);
  }, []);

  return {
    active,
    isStarting,
    startedBy,
    lines,
    interimText,
    isSupported,
    error,
    selectedLanguage,
    setSelectedLanguage,
    availableLanguages,
    startNotes,
    stopNotes,
    reset,
  };
}
