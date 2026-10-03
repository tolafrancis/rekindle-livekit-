import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Room, RoomEvent, createAudioAnalyser } from 'livekit-client';
import type { LocalAudioTrack } from 'livekit-client';
import { supabase } from '@rekindle/supabase';
import { useSpeakerScripture } from './useSpeakerScripture';
import { playQuestionChime, setTitleBadge } from '../questionAlert';
import { Card, CardContent } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { toast } from '@rekindle/ui/use-toast';
import { Loader2, Mic, MicOff, Radio, Copy, Square, AlertCircle, CheckCircle2, Captions, Plus, Maximize2, Minimize2, MessageCircle, Pin, X, User, Reply } from 'lucide-react';
import { publicWebOrigin } from '@rekindle/features/platform';

type Phase = 'idle' | 'requesting-mic' | 'connecting' | 'live' | 'ended' | 'error';

/** get_speaker_pending_questions' row shape (translation_questions). */
interface PendingQuestion {
  id: string;
  asker_name: string | null;
  speaker_text: string | null;
  original_text: string;
  created_at: string;
}
interface PinnedQuestion {
  id: string;
  asker_name: string | null;
  pinned_translations: Record<string, string>;
  answer_text: string | null;
}

/** translation-speaker-token's 200 response. */
interface SpeakerToken {
  url: string;
  token: string;
  roomName: string;
  identity: string;
  sourceLanguage: string;
  targetLanguage: string;
}

const ERROR_COPY: Record<string, string> = {
  missing_link: 'This link is incomplete — ask whoever shared it for the full URL.',
  invalid_speaker_token: "This speaker link isn't valid — it may have been replaced by a newer one.",
  session_not_found: 'This speaker session no longer exists.',
  session_ended: 'This speaker session has already ended.',
  session_stopped: "Translation for this session was stopped, so listeners can't hear you any more. Ask the person who sent this link for a new one.",
  session_failed: 'Translation for this session stopped because of a problem on our side. Ask the person who sent this link for a new one.',
  mic_denied: 'Microphone access was denied — check your browser/site permissions and reload.',
  connection_failed: 'Could not connect. Check your internet connection and try again.',
};

/**
 * /speak/:sessionId?t=<speaker token> — "Speaker Link" (migration 0288),
 * the third way to start a translation session alongside Meetings and the
 * PA edge agent. Public, unauthenticated — the token in the URL IS the
 * credential (see that migration's header comment for the threat model).
 * No video call: this page's only job is turning the visitor's microphone
 * into a published LiveKit track the cloud bot subscribes to and
 * translates, same pipeline every other source already uses. Listeners
 * still use the ordinary /display/:sessionId link — this page shows it
 * for convenience but doesn't render it itself.
 */
export const SpeakerPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const speakerToken = searchParams.get('t');

  const [phase, setPhase] = useState<Phase>('idle');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  // Live Scripture: verses the speaker reads out go up on the listener
  // display automatically while this page is live (see useSpeakerScripture).
  useSpeakerScripture(sessionId, speakerToken, phase === 'live');
  const [languages, setLanguages] = useState<{ source: string; target: string } | null>(null);
  const [muted, setMuted] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Copy listener link');
  const [level, setLevel] = useState(0); // 0–1, simple mic-activity meter

  // Live captions — what the bot's STT actually heard, per finalized
  // utterance. Purely informational: this never blocks or feeds back into
  // translation (which keeps firing instantly, same as before) — it just
  // lets the speaker glance at the screen and catch a misheard name/term.
  // Sourced from translation_logs, which the bot already writes to in
  // real time and which is already public-readable + realtime-enabled
  // (migration 0273) — no bot-side changes needed for this.
  const [captions, setCaptions] = useState<Array<{ id: string; text: string }>>([]);
  const MAX_CAPTIONS = 6; // a short trailing window, not a full transcript

  // "That word looked wrong" — banks a correction into the ministry's
  // approved-terms vocabulary (same table/mechanism Sermon Library uses)
  // so future sessions/uploads recognize it better. Explicitly does NOT
  // touch anything already translated/spoken.
  const [correctionText, setCorrectionText] = useState('');
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  // "Conversation" (live Q&A, 2026-09-28) — listeners on /display can ask a
  // question; it's translated into this speaker's language and shown here
  // to pin (surfaces it, translated, on every listener's /display) or
  // dismiss. The anon RLS policy on translation_questions only allows
  // reading PINNED rows directly; the pending queue is only reachable via
  // get_speaker_pending_questions, a security-definer RPC keyed on this
  // page's speaker_token. So instead of postgres_changes, this page
  // listens for translation-submit-question's content-free broadcast ping
  // and re-fetches on each one, with a 5s poll as the backstop.
  //
  // Real bug fixed 2026-10-02 (migration 0385): that RPC raised on every
  // call (pgcrypto's digest() unreachable from its search_path) and this
  // page ignored the error, so questions never showed up here at all.
  const [pendingQuestions, setPendingQuestions] = useState<PendingQuestion[]>([]);
  const [pinnedQuestion, setPinnedQuestion] = useState<PinnedQuestion | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [questionsError, setQuestionsError] = useState(false);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  // Every question id this page has already alerted for — a re-fetch (poll
  // or ping) returning the same pending rows never chimes twice.
  const seenQuestionIdsRef = useRef<Set<string> | null>(null);
  const serviceIdRef = useRef<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  const analyserCleanupRef = useRef<(() => Promise<void>) | null>(null);
  const levelRafRef = useRef<number | null>(null);
  const captionsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const captionsScrollRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);

  // Full screen (2026-09-23, real report: speaker at a podium wants browser
  // chrome/notification bars out of the way so the caption text reads as
  // large as possible from a distance). Native Fullscreen API on the whole
  // page container, not just the captions box, so Mute/Stop stay reachable
  // too. Not every browser supports it (notably iOS Safari has none for
  // arbitrary elements, only <video>) — detect support up front and simply
  // don't render the button rather than offering something that'll silently
  // no-op or throw.
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fullscreenSupported = typeof document !== 'undefined' && !!document.fullscreenEnabled;

  useEffect(() => {
    if (!fullscreenSupported) return;
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [fullscreenSupported]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await pageRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('[SpeakerPage] fullscreen toggle failed:', err);
    }
  };

  // Real bug found live (2026-09-23): "the scroll is always stuck and
  // speaker dont see what's below" — new caption lines were appended to
  // this box (overflow-y-auto) with nothing ever moving the scroll position,
  // so once there was enough text to scroll at all, the newest (biggest,
  // most important) line could sit below the visible area with no way to
  // reveal it short of the speaker manually scrolling mid-sentence. Always
  // snap to the bottom whenever the caption list changes — this box is a
  // short trailing live-glance window (MAX_CAPTIONS), not something meant
  // for scrolling back through, so there's no "was the user reviewing
  // history" case to preserve.
  useEffect(() => {
    const el = captionsScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [captions]);

  useEffect(() => {
    if (!sessionId || !speakerToken) {
      setErrorCode('missing_link');
      setPhase('error');
    }
  }, [sessionId, speakerToken]);

  // Real bug fixed 2026-10-02: the session could end (bot stopped, admin
  // pressed Stop, a new link was issued) while this page kept showing the
  // speaker as live, because nothing here watched the session row; the
  // speaker only found out after a refresh. Watch it now, through realtime
  // where the row is readable and a token-checked poll everywhere.
  useEffect(() => {
    if (phase !== 'live' || !sessionId || !speakerToken) return;
    let cancelled = false;

    const endLocally = (code: string) => {
      if (cancelled) return;
      cancelled = true;
      teardownLevelMeter();
      teardownCaptions();
      roomRef.current?.disconnect().catch(() => {});
      roomRef.current = null;
      setErrorCode(code);
      setPhase('error');
    };
    const applyStatus = (status: string | null | undefined) => {
      if (status === 'ended') endLocally('session_stopped');
      else if (status === 'error') endLocally('session_failed');
      else if (status === 'invalid_token') endLocally('invalid_speaker_token');
      else if (status === 'not_found') endLocally('session_not_found');
    };
    const check = async () => {
      const { data, error } = await supabase.rpc('get_speaker_session_status', { p_session_id: sessionId, p_speaker_token: speakerToken });
      if (!error) applyStatus(data as string);
    };

    const channel = supabase
      .channel(`speaker-session-${sessionId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'translation_sessions', filter: `id=eq.${sessionId}` },
        (payload) => applyStatus((payload.new as { status?: string }).status))
      .subscribe((status) => { if (status === 'SUBSCRIBED') check(); });
    const interval = setInterval(check, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sessionId, speakerToken]);

  // Conversation — see pendingQuestions' doc comment above.
  useEffect(() => {
    if (phase !== 'live' || !sessionId || !speakerToken) return;
    let cancelled = false;
    let inFlight = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const fetchQuestions = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const [pendingRes, pinnedRes] = await Promise.all([
          supabase.rpc('get_speaker_pending_questions', { p_session_id: sessionId, p_speaker_token: speakerToken }),
          serviceIdRef.current
            ? supabase.from('translation_questions').select('id, asker_name, pinned_translations, answer_text')
                .eq('service_id', serviceIdRef.current).eq('status', 'pinned').maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        if (cancelled) return;
        if (pendingRes.error) {
          console.error('[SpeakerPage] get_speaker_pending_questions failed:', pendingRes.error);
          setQuestionsError(true);
          return;
        }
        setQuestionsError(false);
        const pending = (pendingRes.data as PendingQuestion[]) || [];
        setPendingQuestions(pending);
        setPinnedQuestion((pinnedRes as { data: PinnedQuestion | null }).data);

        const seen = seenQuestionIdsRef.current;
        const fresh = seen ? pending.filter((q) => !seen.has(q.id)) : pending;
        seenQuestionIdsRef.current = new Set([...(seen || []), ...pending.map((q) => q.id)]);
        if (fresh.length > 0) {
          playQuestionChime();
          toast({
            title: fresh.length === 1 ? 'New question' : `${fresh.length} new questions`,
            description: fresh.length === 1
              ? `${fresh[0].asker_name || 'Anonymous'}: ${fresh[0].speaker_text || fresh[0].original_text}`
              : 'Scroll down to Conversation to see them.',
          });
        }
      } finally {
        inFlight = false;
      }
    };

    (async () => {
      if (!serviceIdRef.current) {
        const { data } = await supabase.from('translation_sessions').select('service_id').eq('id', sessionId).maybeSingle();
        serviceIdRef.current = data?.service_id ?? null;
      }
      if (cancelled) return;
      fetchQuestions();
      if (serviceIdRef.current) {
        channel = supabase
          .channel(`translation-questions-speaker-${serviceIdRef.current}`)
          .on('broadcast', { event: 'new_question' }, () => fetchQuestions())
          // Back from a dropped connection — catch up on anything missed.
          .subscribe((status) => { if (status === 'SUBSCRIBED') fetchQuestions(); });
      }
    })();

    const interval = setInterval(fetchQuestions, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
    };
  }, [phase, sessionId, speakerToken]);

  useEffect(() => {
    setTitleBadge(pendingQuestions.length);
  }, [pendingQuestions.length]);
  useEffect(() => () => setTitleBadge(0), []);

  const pinQuestion = async (questionId: string, answerText?: string) => {
    if (!speakerToken) return;
    setPinningId(questionId);
    try {
      const { data, error } = await supabase.functions.invoke('translation-pin-question', {
        body: { questionId, speakerToken, answerText: answerText?.trim() || undefined },
      });
      if (error || (data as { error?: string })?.error) throw new Error((data as { error?: string })?.error || error?.message);
      const question = pendingQuestions.find((q) => q.id === questionId);
      setPendingQuestions((prev) => prev.filter((q) => q.id !== questionId));
      if (question && languages) {
        setPinnedQuestion({
          id: questionId,
          asker_name: question.asker_name,
          pinned_translations: { [languages.source]: question.speaker_text || question.original_text },
          answer_text: answerText?.trim() || null,
        });
      }
      if (replyingId === questionId) { setReplyingId(null); setReplyText(''); }
      toast({ title: answerText?.trim() ? 'Answer pinned for everyone' : 'Pinned for everyone' });
    } catch (err: any) {
      toast({ title: "Couldn't pin that question", description: err.message, variant: 'destructive' });
    } finally {
      setPinningId(null);
    }
  };

  const dismissQuestion = async (questionId: string) => {
    if (!speakerToken) return;
    setDismissingId(questionId);
    try {
      const { error } = await supabase.rpc('dismiss_translation_question', { p_question_id: questionId, p_speaker_token: speakerToken });
      if (error) throw error;
      setPendingQuestions((prev) => prev.filter((q) => q.id !== questionId));
    } catch (err: any) {
      toast({ title: "Couldn't dismiss that question", description: err.message, variant: 'destructive' });
    } finally {
      setDismissingId(null);
    }
  };

  const teardownLevelMeter = () => {
    if (levelRafRef.current !== null) cancelAnimationFrame(levelRafRef.current);
    levelRafRef.current = null;
    analyserCleanupRef.current?.().catch(() => {});
    analyserCleanupRef.current = null;
  };

  // livekit-client's own analyser helper — reassurance that audio is
  // actually reaching the room, not a from-scratch AudioContext setup.
  const startLevelMeter = (track: LocalAudioTrack) => {
    try {
      const { calculateVolume, cleanup } = createAudioAnalyser(track);
      analyserCleanupRef.current = cleanup;
      const tick = () => {
        setLevel(Math.min(1, calculateVolume() * 4)); // scaled up — normal speech volume reads low otherwise
        levelRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      console.error('[SpeakerPage] level meter setup failed (non-fatal):', err);
    }
  };

  const startSpeaking = async () => {
    if (!sessionId || !speakerToken) return;
    setErrorCode(null);
    setPhase('requesting-mic');

    const { data, error } = await supabase.functions.invoke('translation-speaker-token', {
      body: { sessionId, speakerToken },
    });
    if (error || !data?.token) {
      setErrorCode((data as { error?: string })?.error ?? 'connection_failed');
      setPhase('error');
      return;
    }
    const { url, token, identity, sourceLanguage, targetLanguage } = data as SpeakerToken;
    setLanguages({ source: sourceLanguage, target: targetLanguage });

    setPhase('connecting');
    const room = new Room();
    roomRef.current = room;
    room.on(RoomEvent.Disconnected, () => {
      teardownLevelMeter();
      teardownCaptions();
      setPhase((prev) => (prev === 'error' ? prev : 'ended')); // keep a stopped-session message if that's why we disconnected
    });

    try {
      await room.connect(url, token);
      // setMicrophoneEnabled handles getUserMedia + publish in one call —
      // if the visitor denies the permission prompt, it rejects here. Its
      // own return value is the fresh publication, no separate lookup needed.
      const micPub = await room.localParticipant.setMicrophoneEnabled(true);
      if (micPub?.track) startLevelMeter(micPub.track as LocalAudioTrack);
      setPhase('live');
      startCaptions(sessionId);
      console.log('[SpeakerPage] publishing as', identity);
    } catch (err) {
      console.error('[SpeakerPage] connect/publish failed:', err);
      await room.disconnect().catch(() => {});
      roomRef.current = null;
      setErrorCode(
        err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
          ? 'mic_denied'
          : 'connection_failed',
      );
      setPhase('error');
    }
  };

  const teardownCaptions = () => {
    if (captionsChannelRef.current) {
      supabase.removeChannel(captionsChannelRef.current);
      captionsChannelRef.current = null;
    }
  };

  const startCaptions = (forSessionId: string) => {
    teardownCaptions();
    setCaptions([]);
    captionsChannelRef.current = supabase
      .channel(`speaker-captions-${forSessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'translation_logs', filter: `session_id=eq.${forSessionId}` },
        (payload) => {
          const row = payload.new as { id: string; source_text: string };
          if (!row?.source_text) return;
          setCaptions((prev) => [...prev, { id: row.id, text: row.source_text }].slice(-MAX_CAPTIONS));
        },
      )
      .subscribe();
  };

  const submitCorrection = async () => {
    if (!sessionId || !speakerToken || !correctionText.trim()) return;
    setSubmittingCorrection(true);
    try {
      const { error } = await supabase.rpc('speaker_add_vocabulary_term', {
        p_session_id: sessionId,
        p_speaker_token: speakerToken,
        p_term: correctionText.trim(),
      });
      if (error) throw error;
      toast({ title: 'Added', description: `"${correctionText.trim()}" will be recognized better going forward.` });
      setCorrectionText('');
    } catch (err: any) {
      console.error('[SpeakerPage] submitCorrection failed:', err);
      toast({ title: "Couldn't add that", description: err.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmittingCorrection(false);
    }
  };

  const toggleMute = async () => {
    if (!roomRef.current) return;
    const next = !muted;
    await roomRef.current.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  };

  const stopSpeaking = async () => {
    if (!sessionId || !speakerToken) return;
    teardownLevelMeter();
    teardownCaptions();
    try {
      await roomRef.current?.disconnect();
    } catch { /* already gone */ }
    roomRef.current = null;
    try {
      await supabase.rpc('speaker_stop_session', { p_session_id: sessionId, p_speaker_token: speakerToken });
    } catch (err) {
      console.error('[SpeakerPage] speaker_stop_session failed (session may still show active):', err);
    }
    setPhase('ended');
  };

  // Leaving the tab/closing the browser mid-session — best-effort stop so
  // the session doesn't sit "live" forever with nobody actually speaking.
  // Not guaranteed to complete (unload is not awaitable), but the bot's own
  // ParticipantDisconnected handling is the real backstop either way.
  useEffect(() => {
    const onUnload = () => {
      if (roomRef.current) roomRef.current.disconnect();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      teardownLevelMeter();
      teardownCaptions();
      roomRef.current?.disconnect().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listenerLink = sessionId ? `${publicWebOrigin()}/display/${sessionId}` : '';
  const copyListenerLink = () => {
    navigator.clipboard.writeText(listenerLink).then(() => {
      setCopyLabel('Copied!');
      setTimeout(() => setCopyLabel('Copy listener link'), 1500);
    });
  };

  return (
    <div ref={pageRef} className="relative min-h-screen bg-slate-950 text-white flex items-center justify-center px-4 py-6 sm:py-10">
      {fullscreenSupported && (
        <button
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit full screen' : 'Full screen'}
          className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
        </button>
      )}
      {/* Widened (2026-09-14, per the user's request) from max-w-md so the
          "What's being heard" captions below have room for a much bigger,
          glance-readable font — the speaker is meant to read this while
          talking, from further than arm's length, not just confirm it's
          working. w-full keeps it filling the viewport (minus this div's
          own px-4) on mobile, same as before. */}
      <Card className="max-w-5xl w-full bg-white/5 border-white/10">
        <CardContent className="py-6 sm:py-8 px-4 sm:px-8 space-y-5">
          <div className="text-center space-y-1">
            <Radio className="h-7 w-7 sm:h-8 sm:w-8 mx-auto text-indigo-400" />
            <p className="text-sm sm:text-base font-medium text-white">Speaker Link</p>
            {languages && (
              <p className="text-xs sm:text-sm text-white/50">
                {languages.source.toUpperCase()} → {languages.target.toUpperCase()}
              </p>
            )}
          </div>

          {phase === 'idle' && (
            <>
              <p className="text-sm text-white/70 text-center leading-relaxed">
                Tap Start when you're ready to speak. Your microphone will be translated live for anyone using the
                listener link — keep this tab open while you talk.
              </p>
              <Button className="w-full" onClick={startSpeaking}>
                <Mic className="h-4 w-4 mr-2" /> Start Speaking
              </Button>
            </>
          )}

          {(phase === 'requesting-mic' || phase === 'connecting') && (
            <div className="flex flex-col items-center gap-2 py-2">
              <Loader2 className="h-6 w-6 animate-spin text-white/60" />
              <p className="text-xs text-white/50">
                {phase === 'requesting-mic' ? 'Requesting microphone access…' : 'Connecting…'}
              </p>
            </div>
          )}

          {phase === 'live' && (
            <>
              <div className="flex items-center justify-center gap-3">
                <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm sm:text-base font-medium text-emerald-400">Live — you're being translated</span>
              </div>

              {/* Simple mic-activity meter — reassurance that audio is actually
                  reaching the room, not just that the button says "Live". */}
              <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-[width] duration-75"
                  style={{ width: `${Math.round(level * 100)}%` }}
                />
              </div>

              {/* What the system is hearing — informational only. Nothing here
                  delays or changes translation, which keeps firing instantly
                  per utterance same as always; this is purely so the speaker
                  can catch a misheard name/term at a glance. */}
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs font-medium text-white/50">
                  <Captions className="h-3.5 w-3.5" /> What's being heard
                </p>
                <div ref={captionsScrollRef} className="min-h-[10rem] max-h-[28rem] overflow-y-auto rounded-lg bg-black/30 px-4 py-3 space-y-2">
                  {captions.length === 0 ? (
                    <p className="text-sm text-white/40 italic">Captions will appear here once you start talking…</p>
                  ) : (
                    // Current line sized well past the listener /display page's
                    // own "large" preset (text-2xl sm:text-3xl) — this is meant
                    // to be read by the speaker from further than arm's length
                    // while they're mid-sentence, not just glanced at up close.
                    // Older lines stay smaller/dim, just for scroll-back context.
                    captions.map((c, i) => (
                      <p
                        key={c.id}
                        className={i === captions.length - 1
                          ? 'text-3xl sm:text-5xl font-semibold leading-snug text-white'
                          : 'text-base sm:text-lg leading-snug text-white/40'}
                      >
                        {c.text}
                      </p>
                    ))
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={correctionText}
                    onChange={(e) => setCorrectionText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitCorrection(); }}
                    placeholder="Heard a word/name wrong? Type the correct one…"
                    className="h-8 flex-1 border-white/20 bg-white/5 text-sm text-white placeholder:text-white/40"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 text-white border-white/20 bg-white/5 hover:bg-white/10 hover:text-white"
                    onClick={submitCorrection}
                    disabled={submittingCorrection || !correctionText.trim()}
                  >
                    {submittingCorrection ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                <p className="text-[11px] text-white/40">
                  This won't change what's already been translated — it just helps recognition going forward.
                </p>
              </div>

              <div className="space-y-2 border-t border-white/10 pt-4" aria-live="polite">
                <p className="flex items-center gap-1.5 text-xs font-medium text-white/50">
                  <MessageCircle className="h-3.5 w-3.5" /> Conversation
                  {pendingQuestions.length > 0 && (
                    <span className="ml-1 rounded-full bg-indigo-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {pendingQuestions.length} new
                    </span>
                  )}
                </p>
                {questionsError && (
                  <p className="flex items-center gap-1.5 text-xs text-amber-400">
                    <AlertCircle className="h-3.5 w-3.5" /> Couldn't load audience questions — retrying…
                  </p>
                )}
                {pinnedQuestion && (
                  <div className="rounded-lg border border-indigo-400/40 bg-indigo-500/10 px-3 py-2">
                    <p className="flex items-center gap-1.5 text-[11px] text-indigo-300 mb-1">
                      <Pin className="h-3 w-3" /> Pinned for everyone
                    </p>
                    <p className="text-sm text-white">
                      {pinnedQuestion.asker_name || 'Anonymous'}:{' '}
                      {(languages && pinnedQuestion.pinned_translations[languages.source]) || Object.values(pinnedQuestion.pinned_translations)[0]}
                    </p>
                    {pinnedQuestion.answer_text && (
                      <p className="mt-1 text-sm text-indigo-200">Your answer: {pinnedQuestion.answer_text}</p>
                    )}
                  </div>
                )}
                {pendingQuestions.length === 0 && !pinnedQuestion && !questionsError && (
                  <p className="text-xs text-white/40">
                    No questions yet. When a listener asks one, it appears here with a sound and a notification.
                  </p>
                )}
                {pendingQuestions.map((q) => (
                  <div key={q.id} className="rounded-lg bg-black/30 px-3 py-2 space-y-2">
                    <div className="flex items-start gap-2">
                      <User className="h-4 w-4 text-white/40 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white/40">
                          {q.asker_name || 'Anonymous'} · {new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-sm sm:text-base text-white break-words">{q.speaker_text || q.original_text}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-7 p-0 text-white border-white/20 bg-white/5 hover:bg-white/10 hover:text-white"
                          onClick={() => { setReplyingId(replyingId === q.id ? null : q.id); setReplyText(''); }}
                          disabled={pinningId === q.id || dismissingId === q.id}
                          title="Write an answer"
                        >
                          <Reply className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-7 p-0 text-white border-white/20 bg-white/5 hover:bg-white/10 hover:text-white"
                          onClick={() => pinQuestion(q.id)}
                          disabled={pinningId === q.id || dismissingId === q.id}
                          title="Pin for everyone (answer it out loud)"
                        >
                          {pinningId === q.id && replyingId !== q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pin className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-7 p-0 text-white border-white/20 bg-white/5 hover:bg-white/10 hover:text-white"
                          onClick={() => dismissQuestion(q.id)}
                          disabled={pinningId === q.id || dismissingId === q.id}
                          title="Dismiss"
                        >
                          {dismissingId === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>
                    {replyingId === q.id && (
                      <div className="flex items-center gap-2 pl-6">
                        <Input
                          autoFocus
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && replyText.trim() && pinningId !== q.id) pinQuestion(q.id, replyText); }}
                          placeholder="Type a short answer — it's translated for every listener"
                          maxLength={1000}
                          className="h-8 flex-1 border-white/20 bg-white/5 text-sm text-white placeholder:text-white/40"
                        />
                        <Button
                          size="sm"
                          className="h-8 shrink-0"
                          onClick={() => pinQuestion(q.id, replyText)}
                          disabled={pinningId === q.id || !replyText.trim()}
                        >
                          {pinningId === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Pin answer'}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 text-white border-white/20 bg-white/5 hover:bg-white/10 hover:text-white" onClick={toggleMute}>
                  {muted ? <Mic className="h-4 w-4 mr-2" /> : <MicOff className="h-4 w-4 mr-2" />}
                  {muted ? 'Unmute' : 'Mute'}
                </Button>
                <Button variant="destructive" className="flex-1" onClick={stopSpeaking}>
                  <Square className="h-4 w-4 mr-2" /> Stop
                </Button>
              </div>

              <div className="border-t border-white/10 pt-4 space-y-2">
                <p className="text-xs text-white/50 text-center">Share this with anyone following along:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-black/30 px-2 py-1.5 text-[11px] text-white/70 truncate">{listenerLink}</code>
                  <Button variant="outline" size="sm" className="text-white border-white/20 bg-white/5 hover:bg-white/10 hover:text-white shrink-0" onClick={copyListenerLink}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {copyLabel === 'Copied!' && <p className="text-[11px] text-emerald-400 text-center">{copyLabel}</p>}
              </div>
            </>
          )}

          {phase === 'ended' && (
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <CheckCircle2 className="h-7 w-7 text-white/40" />
              <p className="text-sm font-medium text-white">Session ended</p>
              <p className="text-xs text-white/50">You can close this tab now.</p>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <AlertCircle className="h-7 w-7 text-red-400" />
              <p className="text-sm text-red-400">{ERROR_COPY[errorCode ?? ''] ?? 'Something went wrong.'}</p>
              {!['missing_link', 'session_ended', 'invalid_speaker_token', 'session_stopped', 'session_failed', 'session_not_found'].includes(errorCode ?? '') && (
                <Button variant="outline" className="text-white border-white/20 bg-white/5 hover:bg-white/10 hover:text-white" onClick={startSpeaking}>
                  Try again
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SpeakerPage;
