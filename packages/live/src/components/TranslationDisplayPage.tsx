import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Room, RoomEvent, type RemoteTrack, type RemoteTrackPublication, type RemoteParticipant } from 'livekit-client';
import { supabase } from '@rekindle/supabase';
import { Card, CardContent } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@rekindle/ui/dropdown-menu';
import { Loader2, Lock, Radio, Type, Languages, Maximize2, Minimize2, Volume2, VolumeX, MoreVertical, MessageCircle, Mic, Pin, Send, User, CheckCircle2, AlertCircle } from 'lucide-react';
import { ScripturePanel } from './ScripturePanel';
import { randomId } from '@rekindle/ui/uuid';

interface SessionInfo {
  id: string;
  ministry_id: string;
  source_language: string;
  target_language: string;
  status: string;
  service_id: string | null;
  // PostgREST embeds the FK target as an object (service_id -> id, a
  // to-one relationship), not an array — see migration 0295 for why an
  // anon /display visitor is now allowed to read this at all.
  translation_services: { name: string } | null;
}

/** translation_questions' pinned-row shape, as read publicly (RLS only
 *  allows status='pinned' rows through — see migration
 *  0373_translation_questions.sql). */
interface PinnedQuestion {
  id: string;
  asker_name: string | null;
  pinned_translations: Record<string, string>;
  pinned_answer_translations: Record<string, string> | null;
}

/** A question this browser sent this visit — local only, so the asker can
 *  see it was delivered (the pending queue itself is speaker-only). */
interface SentQuestion {
  id: string;
  text: string;
  sentAt: number;
}

/** translation-listener-token's 200 response. */
interface ListenerToken {
  url: string;
  token: string;
  roomName: string;
  trackName: string;
  targetLanguage: string;
}

type AudioStatus = 'idle' | 'connecting' | 'waiting-for-bot' | 'live' | 'error';

const AUDIO_ERROR_COPY: Record<string, string> = {
  not_found: 'This session is no longer available.',
  not_ready: "The translation hasn't started yet — try again in a moment.",
  ended: 'This session has ended.',
  at_capacity: "This session's listener limit is full right now — try again shortly.",
};

interface LogLine {
  id: string;
  source_text: string;
  translated_text: string;
  created_at: string;
}

type ConnStatus = 'connecting' | 'live' | 'reconnecting' | 'ended';
type FontSize = 'small' | 'large' | 'full';

// Size of the newest line. "large" (the default) matches the speaker
// link's current line; earlier lines stay on screen smaller and dimmed
// underneath it, the same way the speaker link shows them.
const FONT_SIZE_CLASS: Record<FontSize, string> = {
  small: 'text-2xl sm:text-3xl',
  large: 'text-3xl sm:text-5xl',
  full: 'text-4xl sm:text-6xl',
};
const OLDER_LINE_CLASS = 'text-base sm:text-lg text-white/40';
// How many lines stay on screen: the newest plus a few earlier ones for
// context, like the speaker link (not a full transcript).
const MAX_LINES = 6;
const FONT_SIZE_CYCLE: FontSize[] = ['small', 'large', 'full'];

/**
 * /display/:sessionId — public, unauthenticated. Anyone with the link (or
 * who scans the QR) lands here; no ReKindle account needed.
 *
 * Phase 2 (see docs/rlt-build-checklist.md § 2.7–2.8): language label, text
 * feed, PIN gate (Phase 1), plus font-size presets, bilingual toggle,
 * presenter mode, and — per the later "WebRTC-only /display" plan — a
 * direct LiveKit connection for audio instead of an HLS pull: this page
 * mints a subscribe-only listener token (translation-listener-token Edge
 * Function), joins the session's room with autoSubscribe:false, and
 * explicitly subscribes only to the bot's "rlt-translated-{lang}" track —
 * sub-second delivery, no storage hop, and no risk of also hearing the
 * room's raw original-language mic track.
 *
 * Private-session note: after a correct PIN, this page retries the direct
 * row fetch — for a PUBLIC session that always works, but for a genuinely
 * PRIVATE one it will keep failing today, because RLS (migration 0273)
 * blocks anon reads of private sessions outright and verify_display_pin()
 * doesn't yet mint anything that changes that. Flagged in the migration's
 * header comment; shows up below as the "PIN correct, but..." screen
 * rather than a silent stall.
 */
export const TranslationDisplayPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [pinRequired, setPinRequired] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinChecking, setPinChecking] = useState(false);
  const [privateNotReady, setPrivateNotReady] = useState(false);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [connStatus, setConnStatus] = useState<ConnStatus>('connecting');
  const [downloadingTranscript, setDownloadingTranscript] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Display preferences — local to this visitor's browser only, no account
  // to save them to. Persisted (2026-09-23, real gap flagged in a captions
  // pipeline review): these are device-level accessibility choices (text
  // size especially), not session-specific, so every /display link this
  // visitor opens remembers them instead of resetting to defaults each time.
  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    try { return (localStorage.getItem('rk-display-font-size') as FontSize) || 'large'; } catch { return 'large'; }
  });
  const setFontSize = (updater: FontSize | ((prev: FontSize) => FontSize)) => {
    setFontSizeState((prev) => {
      const next = typeof updater === 'function' ? (updater as (p: FontSize) => FontSize)(prev) : updater;
      try { localStorage.setItem('rk-display-font-size', next); } catch { /* private-browsing / quota — non-fatal */ }
      return next;
    });
  };
  const [bilingual, setBilingualState] = useState(() => {
    try { return localStorage.getItem('rk-display-bilingual') === 'true'; } catch { return false; }
  });
  const setBilingual = (updater: boolean | ((prev: boolean) => boolean)) => {
    setBilingualState((prev) => {
      const next = typeof updater === 'function' ? (updater as (p: boolean) => boolean)(prev) : updater;
      try { localStorage.setItem('rk-display-bilingual', String(next)); } catch { /* non-fatal */ }
      return next;
    });
  };
  const [presenterMode, setPresenterMode] = useState(false);

  // "Conversation" (live Q&A, 2026-09-28) — tab switcher next to the
  // existing captions feed, not a replacement for it. Only offered when
  // the session came from a named service (pin fanout needs service_id to
  // find sibling sessions — see translation-pin-question) and the
  // ministry hasn't turned it off in Settings.
  const [activeTab, setActiveTabState] = useState<'captions' | 'conversation'>(() => {
    try { return (localStorage.getItem('rk-display-tab') as 'captions' | 'conversation') || 'captions'; } catch { return 'captions'; }
  });
  const setActiveTab = (tab: 'captions' | 'conversation') => {
    setActiveTabState(tab);
    try { localStorage.setItem('rk-display-tab', tab); } catch { /* non-fatal */ }
  };
  const [questionsEnabled, setQuestionsEnabled] = useState(false);
  const [pinnedQuestion, setPinnedQuestion] = useState<PinnedQuestion | null>(null);
  const [askText, setAskText] = useState('');
  const [askerName, setAskerName] = useState('');
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [sentQuestions, setSentQuestions] = useState<SentQuestion[]>([]);
  // Synchronous guard against a double Enter/tap sending the same question
  // twice before `asking` re-renders the button disabled.
  const askingRef = useRef(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldownNow, setCooldownNow] = useState(Date.now());
  const [listeningForSpeech, setListeningForSpeech] = useState(false);
  const speechRecognitionRef = useRef<any>(null);
  // Anonymous per-browser identifier (2026-09-28) — the only thing the
  // server's 20s rate limit can key on when no name was given; generated
  // once and reused for every question this browser ever asks, on any
  // session, same discipline as the font-size/bilingual prefs above.
  const fingerprintRef = useRef<string>('');
  if (!fingerprintRef.current) {
    try {
      let fp = localStorage.getItem('rk-question-fingerprint');
      if (!fp) {
        fp = randomId();
        localStorage.setItem('rk-question-fingerprint', fp);
      }
      fingerprintRef.current = fp;
    } catch {
      fingerprintRef.current = `${Date.now()}-${Math.random()}`; // private browsing / quota — session-only fallback
    }
  }
  // Joining LiveKit needs an explicit tap — browsers block unmuted
  // autoplay, and the build plan calls for a "Listen" gesture anyway
  // (§2.8). listening = the visitor tapped; audioStatus tracks what
  // actually happened since (WebRTC-only /display plan).
  const [listening, setListening] = useState(false);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>('idle');
  const [audioError, setAudioError] = useState<string | null>(null);
  // Real bug found live (2026-08-18): setting `autoplay` on a detached Audio()
  // element and never actually calling .play() ourselves is NOT reliable —
  // by the time the bot's track subscribes, several awaits (token fetch, room
  // connect, waiting for TrackPublished) separate this from the "Listen" tap
  // that granted the browser's user-gesture window, so autoplay silently
  // fails: captions kept updating (that path never touched audio) while
  // nothing played, with no error surfaced anywhere. Same class of bug
  // HlsPlayer.tsx already hardened against — same fix here.
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  // Silent token refresh (2026-09-23, captions pipeline review F-CAP-10) —
  // translation-listener-token mints a 4h JWT; LiveKit doesn't revoke an
  // already-connected session at TTL expiry, but a reconnect attempted after
  // that point (a network blip, the SFU restarting the connection) reuses
  // this same token and fails outright, leaving a long-running /display
  // visitor silently dead with the "Listening" UI still showing. Bumping
  // this nonce a bit before actual expiry re-runs the connect effect below
  // exactly as a fresh "Listen" tap would — same teardown+reconnect path,
  // fetching a new token. Brief (sub-second) audio/caption gap once every
  // ~3h45m for anyone listening that long continuously, instead of going
  // permanently silent.
  const [refreshNonce, setRefreshNonce] = useState(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSession = async (): Promise<SessionInfo | null> => {
    const { data } = await supabase
      .from('translation_sessions')
      .select('id, ministry_id, source_language, target_language, status, service_id, translation_services(name)')
      .eq('id', sessionId)
      .maybeSingle();
    if (!data) return null;
    // The untyped generic SupabaseClient here infers every embedded
    // to-one relation as an array (no generated Database types for this
    // table), but PostgREST actually returns a single object at runtime
    // for a many-to-one FK like service_id -> translation_services.id —
    // normalize defensively rather than fighting the inferred type.
    const raw = data as unknown as Omit<SessionInfo, 'translation_services'> & {
      translation_services: { name: string } | { name: string }[] | null;
    };
    const svc = Array.isArray(raw.translation_services) ? (raw.translation_services[0] ?? null) : raw.translation_services;
    return { ...raw, translation_services: svc };
  };

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      setLoading(true);
      const row = await fetchSession();
      if (row) {
        setSession(row);
        setPinRequired(false);
      } else {
        // RLS returned nothing — either the session doesn't exist, or it's
        // private and no PIN has been proven yet. We deliberately can't
        // tell those apart (not leaking which private session IDs are
        // real), so both show the same PIN screen.
        setPinRequired(true);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (!session || !sessionId) return;

    let cancelled = false;
    const loadLines = async () => {
      const { data } = await supabase
        .from('translation_logs')
        .select('id, source_text, translated_text, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(MAX_LINES);
      if (!cancelled && data) setLines([...data].reverse() as LogLine[]);
    };
    loadLines();

    const channel = supabase
      .channel(`translation-display-${sessionId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'translation_logs', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as LogLine;
          setLines(prev => [...prev, row].slice(-MAX_LINES));
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'translation_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          // Realtime's payload.new is the flat table row — no
          // translation_services join like the initial fetchSession() had,
          // so merge onto what's already loaded rather than clobbering it.
          const row = payload.new as Omit<SessionInfo, 'translation_services'>;
          setSession(prev => ({ ...row, translation_services: prev?.translation_services ?? null }));
          if (row.status === 'ended') setConnStatus('ended');
        })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnStatus(prev => (prev === 'ended' ? prev : 'live'));
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnStatus('reconnecting');
      });
    channelRef.current = channel;

    // Realtime is the primary path; poll as a quiet fallback so the feed
    // still moves if the socket drops without firing CHANNEL_ERROR cleanly.
    const poll = setInterval(loadLines, 6000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [session, sessionId]);

  // Conversation — whether this ministry has it turned on at all (Settings
  // tab default true). language_configs has no public SELECT policy
  // (member-only), hence the narrow RPC rather than a direct table read.
  useEffect(() => {
    if (!session) return;
    supabase.rpc('get_questions_enabled', { p_ministry_id: session.ministry_id })
      .then(({ data }) => setQuestionsEnabled(data !== false));
  }, [session?.ministry_id]);

  // Pinned question — publicly readable (RLS only allows status='pinned'
  // rows through). Re-fetches on any insert/update for this service rather
  // than trusting the realtime payload's own fields, since an UPDATE's
  // `old` record isn't guaranteed to include status without REPLICA
  // IDENTITY FULL on this table — simplest to just always re-ask for the
  // current pinned row, cheap and correct either way.
  useEffect(() => {
    if (!session?.service_id) { setPinnedQuestion(null); return; }
    const serviceId = session.service_id;

    const loadPinned = async () => {
      const { data } = await supabase
        .from('translation_questions')
        .select('id, asker_name, pinned_translations, pinned_answer_translations')
        .eq('service_id', serviceId)
        .eq('status', 'pinned')
        .maybeSingle();
      setPinnedQuestion((data as PinnedQuestion | null) || null);
    };
    loadPinned();

    // Realtime needs translation_questions in the supabase_realtime
    // publication (migration 0385 — it was missing, so this never fired).
    // The 15s poll is the backstop for a dropped connection.
    const channel = supabase
      .channel(`translation-questions-${serviceId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'translation_questions', filter: `service_id=eq.${serviceId}` },
        () => loadPinned())
      .subscribe((status) => { if (status === 'SUBSCRIBED') loadPinned(); });
    const interval = setInterval(loadPinned, 15000);
    return () => { clearInterval(interval); supabase.removeChannel(channel); };
  }, [session?.service_id]);

  // Cooldown countdown — re-renders once a second while a rate-limit
  // window is active so "Ask again in Ns" actually ticks down instead of
  // sitting frozen until the next unrelated re-render.
  useEffect(() => {
    if (!cooldownUntil) return;
    const interval = setInterval(() => setCooldownNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [cooldownUntil]);
  const cooldownRemainingMs = cooldownUntil ? Math.max(0, cooldownUntil - cooldownNow) : 0;

  const submitQuestion = async () => {
    const text = askText.trim();
    if (!sessionId || !text || cooldownRemainingMs > 0 || askingRef.current) return;
    askingRef.current = true;
    setAsking(true);
    setAskError(null);
    try {
      const { data, error } = await supabase.functions.invoke('translation-submit-question', {
        body: { sessionId, text, askerName: askerName.trim() || undefined, fingerprint: fingerprintRef.current },
      });
      const body = data as { id?: string; error?: string; retryAfterMs?: number } | null;
      // supabase-js puts a non-2xx response's body on error.context rather
      // than data — read the error code from there too.
      let errCode = body?.error;
      let retryAfterMs = body?.retryAfterMs;
      if (error && !errCode) {
        try {
          const ctx = await (error as { context?: Response }).context?.json();
          errCode = ctx?.error;
          retryAfterMs = ctx?.retryAfterMs;
        } catch { /* not a JSON error body — treat as a network failure */ }
      }
      if (error || errCode || !body?.id) {
        if (errCode === 'rate_limited') {
          setCooldownUntil(Date.now() + (retryAfterMs || 20000));
          setAskError("You're asking too quickly — please wait a moment.");
        } else if (errCode === 'questions_disabled') {
          setAskError('Questions are turned off for this service.');
        } else if (errCode === 'session_not_found') {
          setAskError('This session has ended, so questions can no longer be sent.');
        } else {
          setAskError('Your question was not sent — check your connection and tap Send to try again.');
        }
        return;
      }
      const sentId = body.id;
      setSentQuestions((prev) => (prev.some((q) => q.id === sentId) ? prev : [...prev, { id: sentId, text, sentAt: Date.now() }]));
      setAskText('');
      setCooldownUntil(Date.now() + 20000); // matches the server's own 20s window
    } catch {
      setAskError('Your question was not sent — check your connection and tap Send to try again.');
    } finally {
      askingRef.current = false;
      setAsking(false);
    }
  };

  // Voice input — the browser's own one-shot speech recognition, not the
  // bot's continuous streaming STT (Deepgram): a single question is a
  // one-shot capture, not a live stream, so there's no reason to route it
  // through the VPS bot at all. Not every browser implements this
  // (notably Firefox) — detected up front, mic button just doesn't render
  // where it's unsupported rather than offering something that'll throw.
  const speechRecognitionSupported = typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const toggleVoiceInput = () => {
    if (listeningForSpeech) {
      speechRecognitionRef.current?.stop();
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = session?.target_language || 'en';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e: any) => {
      const transcript = e.results?.[0]?.[0]?.transcript;
      if (transcript) setAskText((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onerror = () => setListeningForSpeech(false);
    recognition.onend = () => setListeningForSpeech(false);
    speechRecognitionRef.current = recognition;
    setListeningForSpeech(true);
    recognition.start();
  };

  // Earlier lines stay up through pauses (no clearing on silence), so a
  // listener who looks away for a moment can catch up. Keep the newest line
  // in view when the lines don't all fit.
  const mainRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = mainRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // WebRTC-only audio (see docs/rlt-build-checklist.md's "WebRTC-only
  // /display" plan): join the LiveKit room directly as a subscribe-only
  // listener and play the bot's "rlt-translated-{lang}" track — no HLS/
  // Egress hop. Runs once the visitor taps "Listen" (listening=true);
  // tears itself down on unmount or once the session ends.
  useEffect(() => {
    if (!listening || !sessionId) return;

    let cancelled = false;
    const teardown = () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      audioElRef.current?.pause();
      if (audioElRef.current) audioElRef.current.srcObject = null;
      audioElRef.current = null;
      roomRef.current?.disconnect().catch(() => {});
      roomRef.current = null;
    };

    (async () => {
      setAudioStatus('connecting');
      setAudioError(null);
      setNeedsUnlock(false);

      const { data, error } = await supabase.functions.invoke('translation-listener-token', {
        body: { sessionId },
      });
      if (cancelled) return;
      if (error || !data?.token) {
        setAudioError((data as { error?: string })?.error ?? 'connection_failed');
        setAudioStatus('error');
        return;
      }
      const { url, token, trackName } = data as ListenerToken;

      // Schedule the silent refresh (see refreshNonce's doc comment above)
      // from THIS token's actual mint time, not from when the effect
      // started, so the schedule stays accurate regardless of how long the
      // token fetch itself took.
      const TOKEN_TTL_MS = 4 * 60 * 60 * 1000; // matches translation-listener-token's ttl: '4h'
      const REFRESH_MARGIN_MS = 15 * 60 * 1000; // refresh 15 min before actual expiry
      refreshTimerRef.current = setTimeout(() => {
        if (!cancelled) setRefreshNonce((n) => n + 1);
      }, TOKEN_TTL_MS - REFRESH_MARGIN_MS);

      const room = new Room({ adaptiveStream: true });
      roomRef.current = room;

      // Play whichever RemoteTrack turns out to be the bot's translated
      // track, however it arrives (already published, or published after
      // we joined) — both paths funnel through here.
      const playTrack = (track: RemoteTrack) => {
        if (cancelled) return;
        // A bot handover or reconnect can deliver the track again: replace
        // the previous element rather than play both (2026-10-10).
        const prev = audioElRef.current;
        if (prev) {
          const cur = prev.srcObject;
          if (cur instanceof MediaStream && cur.getAudioTracks()[0] === track.mediaStreamTrack) return;
          prev.pause();
          prev.srcObject = null;
        }
        const el = new Audio();
        el.autoplay = true;
        el.srcObject = new MediaStream([track.mediaStreamTrack]);
        audioElRef.current = el;
        setAudioStatus('live');
        // Explicit play() + catch, not just the `autoplay` attribute — see
        // the needsUnlock state's doc comment above for why the attribute
        // alone isn't trustworthy here.
        el.play().then(() => setNeedsUnlock(false)).catch(() => setNeedsUnlock(true));
      };

      const isBotTranslatedTrack = (pub: RemoteTrackPublication, participant: RemoteParticipant) =>
        participant.identity.startsWith('rlt-bot-') && pub.trackName === trackName;

      room.on(RoomEvent.TrackPublished, (pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (isBotTranslatedTrack(pub, participant)) pub.setSubscribed(true);
      });
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (isBotTranslatedTrack(pub, participant)) playTrack(track);
      });
      room.on(RoomEvent.Disconnected, () => {
        if (cancelled) return;
        // Unexpected drop (not our own teardown, which sets `cancelled`
        // first) — reset all the way back to idle so "Listen" in the header
        // menu is offered again and a re-tap actually re-triggers this effect (it only
        // fires on a false→true transition of `listening`).
        setAudioStatus('idle');
        setListening(false);
      });

      try {
        // autoSubscribe:false — deliberate. A translation session's room can
        // also carry the original speaker's raw mic track; auto-subscribing
        // to everything would hand a /display listener audio no one meant
        // for them. Only the matching bot track (isBotTranslatedTrack above)
        // is ever explicitly subscribed.
        await room.connect(url, token, { autoSubscribe: false });
        if (cancelled) return;

        let found = false;
        room.remoteParticipants.forEach((participant) => {
          participant.trackPublications.forEach((pub) => {
            if (isBotTranslatedTrack(pub as RemoteTrackPublication, participant)) {
              found = true;
              (pub as RemoteTrackPublication).setSubscribed(true);
            }
          });
        });
        if (!found) setAudioStatus('waiting-for-bot');
      } catch (err) {
        if (!cancelled) {
          console.error('[TranslationDisplayPage] LiveKit connect failed:', err);
          setAudioError('connection_failed');
          setAudioStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      teardown();
    };
    // refreshNonce is the silent-refresh mechanism above — bumping it
    // deliberately re-runs this same effect to reconnect with a fresh token,
    // without needing `listening` itself to change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, sessionId, refreshNonce]);

  // Session ended while listening — drop the LiveKit connection instead of
  // leaving a dead room joined in the background.
  useEffect(() => {
    if (session?.status === 'ended' && roomRef.current) {
      setListening(false);
      setAudioStatus('idle');
    }
  }, [session?.status]);

  // Available for a defined window after a session ends (translation_logs
  // ages out with the session 24h after it ends — cleanup_ended_translation_sessions,
  // migration 0341), then genuinely gone rather than kept forever. Only the
  // last 3 lines are ever kept in `lines` (the live-view feed), so this
  // re-fetches the full log rather than reusing that state. Same public RLS
  // as the live 3-line feed (migration 0273) — nothing new to grant.
  const downloadTranscript = async () => {
    if (!sessionId) return;
    setDownloadingTranscript(true);
    try {
      const { data, error } = await supabase
        .from('translation_logs')
        .select('source_text, translated_text, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) {
        setDownloadError('No transcript was recorded for this session.');
        return;
      }
      const bodyText = (data as Array<Pick<LogLine, 'source_text' | 'translated_text' | 'created_at'>>)
        .map((row) => `[${new Date(row.created_at).toLocaleTimeString()}] ${row.source_text}\n→ ${row.translated_text}`)
        .join('\n\n');
      const blob = new Blob([bodyText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transcript-${session?.translation_services?.name || sessionId}.txt`.replace(/[^\w.-]+/g, '-');
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[TranslationDisplayPage] downloadTranscript failed:', err);
      setDownloadError('Could not download the transcript. Please try again.');
    } finally {
      setDownloadingTranscript(false);
    }
  };

  const submitPin = async () => {
    if (!sessionId || !pin.trim()) return;
    setPinChecking(true);
    setPinError(null);
    try {
      const { data: ok, error } = await supabase.rpc('verify_display_pin', { p_session_id: sessionId, p_pin: pin.trim() });
      if (error) throw error;
      if (!ok) {
        setPinError('Incorrect PIN');
        return;
      }
      const row = await fetchSession();
      if (row) {
        setSession(row);
        setPinRequired(false);
      } else {
        setPrivateNotReady(true);
      }
    } catch (err: any) {
      setPinError(err.message || 'Something went wrong');
    } finally {
      setPinChecking(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-white/60" />
      </div>
    );
  }

  // Explicit bg/text on both Cards below, not Card's own bg-background
  // default — same theme-mismatch class as the landing page's language
  // buttons (see TranslationDisplayLanding.tsx): Card's light-theme
  // background rendered as a bright box against this page's dark
  // bg-slate-950, inconsistent even where text stayed technically legible.
  if (privateNotReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
        <Card className="max-w-sm w-full bg-white/5 border-white/10">
          <CardContent className="py-8 text-center space-y-2">
            <Lock className="h-8 w-8 mx-auto text-amber-500" />
            <p className="text-sm font-medium text-white">PIN correct</p>
            <p className="text-sm text-white/50">
              Live viewing for private sessions isn't available yet — check back once this ministry's translation
              feature finishes rolling out.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (pinRequired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
        <Card className="max-w-sm w-full bg-white/5 border-white/10">
          <CardContent className="py-8 space-y-4">
            <div className="text-center space-y-1">
              <Lock className="h-8 w-8 mx-auto text-indigo-500" />
              <p className="text-sm font-medium text-white">This translation session is private</p>
              <p className="text-xs text-white/50">Enter the PIN your ministry shared with you.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="display-pin" className="text-white/70">PIN</Label>
              <Input
                id="display-pin"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={e => setPin(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitPin(); }}
                autoFocus
                className="bg-white/5 border-white/20 text-white"
              />
              {pinError && <p className="text-xs text-red-500">{pinError}</p>}
            </div>
            <Button className="w-full" onClick={submitPin} disabled={pinChecking || !pin.trim()}>
              {pinChecking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              View Translation
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Ended sessions hide immediately (explicit product decision) — a link
  // that's over stops looking like a live page at all rather than sitting
  // around in the "This session has ended" chrome indefinitely.
  if (session && session.status === 'ended') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
        <Card className="max-w-sm w-full bg-white/5 border-white/10">
          <CardContent className="py-8 text-center space-y-3">
            <Radio className="h-8 w-8 mx-auto text-white/30" />
            <p className="text-sm font-medium text-white">This link is no longer available</p>
            <p className="text-sm text-white/50">
              This translation session has ended. Ask your ministry for a new link if there's another one starting.
            </p>
            <Button
              variant="outline"
              className="text-white border-white/20 bg-white/5 hover:bg-white/10 hover:text-white"
              onClick={downloadTranscript}
              disabled={downloadingTranscript}
            >
              {downloadingTranscript ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Download transcript
            </Button>
            {downloadError && <p className="text-xs text-red-400">{downloadError}</p>}
            <p className="text-[11px] text-white/30">Available for a limited time after the session ends.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stopListening = () => {
    setListening(false);
    setAudioStatus('idle');
    setNeedsUnlock(false);
  };
  const statusDot = connStatus === 'live' ? 'bg-emerald-500' : connStatus === 'ended' ? 'bg-slate-500' : 'bg-amber-500';
  const visibleLines = presenterMode ? lines.slice(-1) : lines;
  const iconBtn = 'flex h-8 w-8 items-center justify-center rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors';

  return (
    // FIXED height, not min-h's minimum — so flexbox actually reserves the
    // footer's space and it's always on-screen without scrolling. Real bug
    // found live (round 2): min-h-[100dvh] alone fixed the *calculation*
    // (mobile browsers' collapsing address-bar chrome otherwise makes 100vh
    // taller than the true visible area) but a MINIMUM height still lets
    // the div grow past one screen and push the footer below the fold —
    // user still had to scroll to find "Listen". Fixed height +
    // overflow-y-auto on <main> below means any content that doesn't fit
    // scrolls internally instead, and the footer stays pinned.
    //
    // Round 3 (real bug found live again): the round-2 fix used BOTH
    // `h-screen` (100vh) and `h-[100dvh]` as Tailwind classes and relied on
    // dvh "winning" by cascade order — but Tailwind's compiled stylesheet
    // doesn't order utilities by where they appear in className, and in the
    // actual production build `.h-screen{height:100vh}` landed AFTER
    // `.h-[100dvh]{...}` in the CSS file, so the 100vh rule silently won on
    // every real mobile browser and this "fix" never once took effect.
    // Inline style always outranks any class regardless of stylesheet
    // order, so it's used here instead — dvh-supporting browsers get the
    // correct height; a browser too old to parse the `dvh` unit just
    // ignores that one invalid declaration and falls back to the
    // `h-screen` class's 100vh, same graceful-degradation shape as before.
    <div className="h-screen bg-slate-950 text-white flex flex-col overflow-hidden" style={{ height: '100dvh' }}>
      {!presenterMode && (
        <header className="flex items-center gap-1 px-4 py-2.5 border-b border-white/10">
          <Radio className="h-4 w-4 text-indigo-400 shrink-0" />
          {/* Service name (migration 0295) takes the top billing when the
              session came from a named service — falls back to the old
              "{lang} Translation" title for sessions with none. */}
          <div className="mr-auto min-w-0 leading-tight">
            <p className="text-sm font-medium truncate">
              {session?.translation_services?.name || (session ? `${session.target_language.toUpperCase()} Translation` : 'Translation')}
            </p>
            {session?.translation_services?.name && (
              <p className="text-[11px] text-white/40 truncate">{session.target_language.toUpperCase()} Translation</p>
            )}
          </div>
          {questionsEnabled && session?.service_id && (
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === 'conversation' ? 'captions' : 'conversation')}
              className={`${iconBtn} relative ${activeTab === 'conversation' ? 'text-indigo-400' : ''}`}
              title="Conversation — ask a question"
            >
              <MessageCircle className="h-4 w-4" />
              {pinnedQuestion && activeTab !== 'conversation' && (
                <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-indigo-400" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => setFontSize(prev => FONT_SIZE_CYCLE[(FONT_SIZE_CYCLE.indexOf(prev) + 1) % FONT_SIZE_CYCLE.length])}
            className={iconBtn}
            title={`Text size: ${fontSize} (tap to change)`}
          >
            <Type className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setBilingual(v => !v)}
            className={`${iconBtn} ${bilingual ? 'text-indigo-400' : ''}`}
            title="Show original language too"
          >
            <Languages className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setPresenterMode(true)}
            className={iconBtn}
            title="Presenter mode (one line, full screen)"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          {/* Listen lives behind this menu, not as a full-width button: the
              captions are the default view, and a prominent "Listen" got
              tapped by almost everyone on arrival. */}
          {session && session.status !== 'error' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={`${iconBtn} relative`} title="More options" aria-label="More options">
                  <MoreVertical className="h-4 w-4" />
                  {listening && <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {listening ? (
                  <DropdownMenuItem onSelect={stopListening}>
                    <VolumeX className="h-4 w-4 mr-2" /> Stop listening
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => setListening(true)}>
                    <Volume2 className="h-4 w-4 mr-2" /> Listen to live audio
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <span className={`ml-1 h-2.5 w-2.5 rounded-full shrink-0 ${statusDot}`} title={connStatus} />
        </header>
      )}

      {presenterMode && (
        <button
          type="button"
          onClick={() => setPresenterMode(false)}
          className={`${iconBtn} absolute top-3 right-3 z-10 bg-black/30`}
          title="Exit presenter mode"
        >
          <Minimize2 className="h-4 w-4" />
        </button>
      )}

      {/* Live Scripture: the verse the operator put up, above the captions. */}
      {session && <ScripturePanel sessionId={session.id} variant="display" />}

      {/* aria-live="polite" (2026-09-23, real gap flagged in a captions
          pipeline review): announces each final caption line to screen
          readers — this page has no growing interim text, only finalized
          lines, so nothing extra to gate out of the live region. */}
      {(presenterMode || activeTab === 'captions') ? (
        <main
          ref={mainRef}
          aria-live="polite"
          aria-atomic="false"
          className={`flex-1 min-h-0 overflow-y-auto flex flex-col justify-center items-center p-6 gap-3 max-w-3xl mx-auto w-full ${presenterMode ? 'text-center' : 'justify-end'}`}
        >
          {visibleLines.length === 0 ? (
            // session.status === 'ended' never reaches here — the early
            // return above swaps to the "no longer available" page first.
            <p className="text-center text-white/50 text-lg">Translation starting…</p>
          ) : (
            visibleLines.map((line, i) => (
              <div key={line.id} className={presenterMode ? '' : 'w-full'}>
                {bilingual && (
                  <p className="text-sm sm:text-base text-white/50 mb-1">{line.source_text}</p>
                )}
                <p className={i === visibleLines.length - 1
                  ? `${FONT_SIZE_CLASS[fontSize]} leading-snug font-semibold`
                  : `${OLDER_LINE_CLASS} leading-snug`}>
                  {line.translated_text}
                </p>
              </div>
            ))
          )}
        </main>
      ) : (
        <main className="flex-1 min-h-0 overflow-y-auto flex flex-col p-4 gap-4 max-w-2xl mx-auto w-full">
          {pinnedQuestion && (
            <div className="rounded-lg border border-indigo-400/40 bg-indigo-500/10 px-4 py-3">
              <p className="flex items-center gap-1.5 text-xs text-indigo-300 mb-1.5">
                <Pin className="h-3.5 w-3.5" /> Pinned question
              </p>
              <p className="text-sm text-white/60 mb-1">{pinnedQuestion.asker_name || 'Anonymous'} asked:</p>
              <p className="text-lg text-white font-medium">
                {session && pinnedQuestion.pinned_translations[session.target_language]}
              </p>
              {session && pinnedQuestion.pinned_answer_translations?.[session.target_language] && (
                <div className="mt-2 border-t border-indigo-400/20 pt-2">
                  <p className="text-xs text-indigo-300 mb-0.5">Speaker's answer</p>
                  <p className="text-base text-white">{pinnedQuestion.pinned_answer_translations[session.target_language]}</p>
                </div>
              )}
            </div>
          )}
          {sentQuestions.length > 0 && (
            <div className="space-y-1.5" aria-live="polite">
              <p className="text-xs text-white/40">Your questions</p>
              {sentQuestions.map((q) => (
                <div key={q.id} className="rounded-lg bg-white/5 px-3 py-2">
                  <p className="text-sm text-white/80 break-words">{q.text}</p>
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    {pinnedQuestion?.id === q.id ? 'Pinned by the speaker' : 'Delivered to the speaker'}
                  </p>
                </div>
              ))}
            </div>
          )}
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-6">
            <MessageCircle className="h-8 w-8 text-white/20" />
            <p className="text-sm text-white/40 max-w-xs">
              {pinnedQuestion
                ? "Ask another question below — it's sent privately to the speaker."
                : 'Ask a question below — it\'s translated for the speaker and sent privately. They can pin it here for everyone to see.'}
            </p>
          </div>
        </main>
      )}

      {!presenterMode && activeTab === 'conversation' && session && session.status !== 'error' && (
        <div className="border-t border-white/10 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={askText}
              onChange={(e) => setAskText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitQuestion(); }}
              placeholder="Type your question…"
              maxLength={500}
              className="flex-1 border-white/20 bg-white/5 text-white placeholder:text-white/40"
            />
            {speechRecognitionSupported && (
              <Button
                variant="outline"
                size="icon"
                className={`shrink-0 border-white/20 bg-white/5 hover:bg-white/10 ${listeningForSpeech ? 'text-red-400' : 'text-white'}`}
                onClick={toggleVoiceInput}
                title={listeningForSpeech ? 'Listening… tap to stop' : 'Speak your question'}
              >
                <Mic className={`h-4 w-4 ${listeningForSpeech ? 'animate-pulse' : ''}`} />
              </Button>
            )}
            <Button
              size="icon"
              className="shrink-0"
              onClick={submitQuestion}
              disabled={asking || !askText.trim() || cooldownRemainingMs > 0}
              title="Send"
            >
              {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <User className="h-3.5 w-3.5 text-white/30 shrink-0" />
            <Input
              value={askerName}
              onChange={(e) => setAskerName(e.target.value)}
              placeholder="Your name (optional — anonymous by default)"
              maxLength={60}
              className="h-8 flex-1 border-white/10 bg-transparent text-xs text-white placeholder:text-white/30"
            />
          </div>
          {asking && <p className="text-xs text-white/50">Sending your question…</p>}
          {cooldownRemainingMs > 0 && (
            <p className="text-xs text-amber-400">Ask again in {Math.ceil(cooldownRemainingMs / 1000)}s</p>
          )}
          {askError && (
            <p className="flex items-center gap-1 text-xs text-red-400" role="alert">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {askError}
            </p>
          )}
        </div>
      )}

      {/* session.status === 'ended' never reaches here, same as above. */}
      {/* Only shown once the visitor turns audio on from the header menu. */}
      {!presenterMode && session && session.status !== 'error' && audioStatus !== 'idle' && (
        <footer className="border-t border-white/10 px-4 py-3">
          {audioStatus === 'live' && needsUnlock && (
            <Button
              variant="outline"
              className="w-full text-white border-white/20 bg-white/5 hover:bg-white/10 hover:text-white"
              // A direct click IS a trusted user gesture, so play() succeeds
              // here even though the earlier automatic attempt was blocked.
              onClick={() => audioElRef.current?.play().then(() => setNeedsUnlock(false)).catch(() => {})}
            >
              <Volume2 className="h-4 w-4 mr-2" />
              Tap to enable sound
            </Button>
          )}
          {audioStatus === 'live' && !needsUnlock && (
            <div className="flex items-center gap-3">
              <Volume2 className="h-5 w-5 shrink-0 text-emerald-400" />
              {/* WebRTC direct — same room the bot publishes into, not a
                  segmented HLS pull, so this is real-time (sub-second),
                  not the "2–8s behind" caption the old HLS player carried. */}
              <span className="text-xs text-white/50 flex-1">Listening — live audio, real time.</span>
              <Button
                variant="outline"
                size="sm"
                className="text-white border-white/20 bg-white/5 hover:bg-white/10 hover:text-white shrink-0"
                onClick={stopListening}
              >
                Stop
              </Button>
            </div>
          )}
          {(audioStatus === 'connecting' || audioStatus === 'waiting-for-bot') && (
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-white/60" />
              <span className="text-xs text-white/50">
                {audioStatus === 'connecting' ? 'Connecting…' : 'Translation starting — audio will begin automatically…'}
              </span>
            </div>
          )}
          {audioStatus === 'error' && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-red-400 flex-1">
                {AUDIO_ERROR_COPY[audioError ?? ''] ?? 'Could not connect — please try again.'}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="text-white border-white/20 bg-white/5 hover:bg-white/10 hover:text-white shrink-0"
                onClick={() => { setListening(false); setTimeout(() => setListening(true), 0); }}
              >
                Try again
              </Button>
            </div>
          )}
        </footer>
      )}
    </div>
  );
};

export default TranslationDisplayPage;
