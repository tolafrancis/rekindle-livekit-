import React, { useEffect, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@rekindle/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { Button } from '@rekindle/ui/button';
import { Languages, Check, Volume2, Copy, Square, Plus, Loader2, Captions, X } from 'lucide-react';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { notify } from '@rekindle/features/notify';
import { useAuth } from '@rekindle/features/AuthContext';
import { useDraggableOverlay } from '../useDraggableOverlay';

interface CaptionLine {
  id: string;
  text: string;
}

/** 'off' | 'original' (source_text, whatever language the speaker is
 *  actually using) | a target language code (translated_text for that
 *  language's session). Independent of the audio picker below — a
 *  participant can keep the real voice AND read translated captions, or
 *  mute translated audio but still read along, same as any video app's
 *  separate CC menu. */
type CaptionMode = 'off' | 'original' | string;

const liveTranslateTips = [
  'Use a better mic',
  'Reduce background noise',
  'Keep the speaker close to the mic',
  'Pause slightly between sentences',
  'If possible, use a directional mic or clean room audio',
];

export interface TranslationControls {
  tracks: Array<{ language: string; botIdentity: string }>;
  currentLanguage: string | null;
  setLanguage: (language: string | null) => void;
}

interface FloatingTranslationButtonProps {
  translation: TranslationControls;
  /** Needed to dispatch start_bot_session for "+ Add language" (host-only)
   *  and for "Ask a question" (any participant) — the meeting's own LiveKit
   *  room name and ministry, from `meeting.room_name` / `meeting.ministry_id`. */
  ministryId: string;
  roomName: string;
  /** Shows the per-language Stop control and "+ Add language". Advisory
   *  only — start_bot_session/stop_bot_session actually require
   *  is_group_admin (or, for "Ask a question", ministry membership —
   *  migration 0278) server-side, so a non-admin "host" (e.g. a meeting
   *  co-host who isn't a ministry admin) would see the buttons but get an
   *  RPC error, same as every other advisory-vs-server-enforced control in
   *  this file (mute-all, etc). */
  isHost?: boolean;
  /** This participant's own LiveKit identity (== auth.uid() for a real
   *  user) — needed for "Ask a question": migration 0278 only allows a
   *  self-service start_bot_session call when p_speaker_identity is
   *  literally the caller's own auth.uid(), so the button is hidden
   *  entirely without this. */
  userId?: string;
}

const sessionIdFromBotIdentity = (botIdentity: string): string => botIdentity.replace(/^rlt-bot-/, '');

/** Live-translation language picker + status, styled to match the other
 *  floating pills (FloatingSpeakerButton, FloatingBackgroundButton) that sit
 *  bottom-center above the control bar. Always visible to every participant
 *  now — it used to hide itself entirely for non-hosts with zero tracks
 *  ("nothing to pick yet"), but that made a state ("no language started")
 *  read exactly like a permission ("only the host can see this"), which is
 *  the opposite of what was intended. Non-hosts with nothing available yet
 *  now see the button with a "not started yet" message instead of no
 *  button at all — see the tracks.length === 0 branch in the popover body. */
export const FloatingTranslationButton: React.FC<FloatingTranslationButtonProps> = ({
  translation,
  ministryId,
  roomName,
  isHost = false,
  userId,
}) => {
  const { user } = useAuth();
  const { tracks, currentLanguage, setLanguage } = translation;
  const [stoppingLanguage, setStoppingLanguage] = useState<string | null>(null);
  const [showAddLanguage, setShowAddLanguage] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [supportedLanguages, setSupportedLanguages] = useState<string[]>([]);
  const [newLanguage, setNewLanguage] = useState('');
  const [starting, setStarting] = useState(false);

  // "Ask a question" (bidirectional Q&A — build plan) — a participant
  // push-to-talks a REVERSE translation (their language -> sourceLanguage,
  // the room's own language) instead of waiting on a host. askingLanguage
  // is captured at start (not re-derived from myLanguage below) so it
  // can't silently change out from under an in-progress question if the
  // asker fiddles with their own Audio/Captions selection mid-question.
  const [askingSessionId, setAskingSessionId] = useState<string | null>(null);
  const [askingLanguage, setAskingLanguage] = useState<string | null>(null);
  const [askStarting, setAskStarting] = useState(false);
  // Which languages already had a track last render — lets the host-facing
  // auto-surface effect below tell "a Q&A track for MY language just
  // appeared" apart from "it was already there."
  const prevTrackLangsRef = useRef<Set<string>>(new Set());

  // In-meeting captions (real first-class option, not just the "copy link
  // to /display" workaround) — same translation_logs Realtime feed
  // TranslationDisplayPage.tsx reads, just condensed for an in-call overlay.
  const [captionMode, setCaptionMode] = useState<CaptionMode>('off');
  const [captionLines, setCaptionLines] = useState<CaptionLine[]>([]);
  const captionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Draggable overlay (2026-08-22) — default position is the existing
  // bottom-center anchor (`left-1/2` + this hook's own translateX(-50%)),
  // draggable anywhere afterward, viewport-clamped, and reset back to
  // default every time captions go off → on again (resetKey: captionMode
  // === 'off' ? 'off' : 'on' collapses every non-off mode to one reset key,
  // so switching BETWEEN caption languages while captions stay on doesn't
  // reset a position someone just dragged).
  const captionOverlay = useDraggableOverlay({
    resetKey: captionMode === 'off' ? 'off' : 'on',
    baseTransform: 'translateX(-50%)',
  });
  // "Show Captions" (standalone from Live Translate, 2026-08-22) — dispatches
  // a same-language (source==target) session on demand instead of requiring
  // one to already exist. captionsStarting drives the overlay's loading text
  // between "we just clicked" and "a track/session actually exists yet".
  const [captionsStarting, setCaptionsStarting] = useState(false);
  // Tracks whether the CURRENT captionMode has ever resolved a real session —
  // only auto-revert-to-off when a mode HAD one and it disappeared (host
  // stopped it), never on the very first tick right after switching modes,
  // before a freshly-dispatched session's track has shown up yet. Keyed by
  // mode so switching between modes doesn't leak a stale "had one" flag.
  const hadSessionForModeRef = useRef<{ mode: CaptionMode; had: boolean }>({ mode: 'off', had: false });

  // Resolve which session's log feed to read: an exact language match for a
  // real target code, or — for 'original' — any currently active session,
  // since every session for the same speaker carries the identical
  // source_text regardless of which target language it's translating to.
  const sessionIdForCaptionMode = (mode: CaptionMode): string | null => {
    if (mode === 'off') return null;
    const track = mode === 'original' ? tracks[0] : tracks.find((t) => t.language === mode);
    return track ? sessionIdFromBotIdentity(track.botIdentity) : null;
  };

  useEffect(() => {
    if (captionChannelRef.current) {
      supabase.removeChannel(captionChannelRef.current);
      captionChannelRef.current = null;
    }
    setCaptionLines([]);

    const sessionId = sessionIdForCaptionMode(captionMode);
    const hadSessionForThisMode = hadSessionForModeRef.current.mode === captionMode && hadSessionForModeRef.current.had;
    if (!sessionId) {
      // Only snap back to off if THIS mode previously had a real session and
      // it's now gone — not on the first tick after a fresh "Show Captions"
      // click, while the just-dispatched session's track hasn't appeared yet.
      if (captionMode !== 'off' && hadSessionForThisMode) setCaptionMode('off');
      return;
    }
    hadSessionForModeRef.current = { mode: captionMode, had: true };

    const field = captionMode === 'original' ? 'source_text' : 'translated_text';
    let cancelled = false;

    supabase
      .from('translation_logs')
      .select('id, source_text, translated_text')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(2)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setCaptionLines([...data].reverse().map((row: any) => ({ id: row.id, text: row[field] })));
      });

    const channel = supabase
      .channel(`meeting-captions-${sessionId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'translation_logs', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as { id: string; source_text: string; translated_text: string };
          setCaptionLines((prev) => [...prev, { id: row.id, text: field === 'source_text' ? row.source_text : row.translated_text }].slice(-2));
        })
      .subscribe();
    captionChannelRef.current = channel;

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captionMode, tracks]);

  // Used to be loaded lazily (host-only, only once "+ Add language" was
  // opened). Now fetched eagerly for everyone on mount — "Ask a question"
  // needs sourceLanguage (the room's own language, i.e. what a reverse
  // translation should target) available to any participant, not just a
  // host who happens to open the add-language panel.
  useEffect(() => {
    supabase
      .from('language_configs')
      .select('source_language, supported_target_languages')
      .eq('ministry_id', ministryId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSourceLanguage(data.source_language || 'en');
          setSupportedLanguages(data.supported_target_languages || []);
        }
      });
  }, [ministryId]);

  // "MY own spoken/understood language" — inferred from whichever picker
  // they've actually engaged with (per the product decision: no extra
  // "what language do you speak" prompt). Audio takes priority since it's
  // the stronger signal (they chose to LISTEN in that language, not just
  // read along); Captions is the fallback for someone who muted audio
  // entirely but is following the text.
  const myLanguage = currentLanguage || (captionMode !== 'off' && captionMode !== 'original' ? captionMode : null);

  const askQuestion = async () => {
    // sourceLanguage === 'auto' (2026-08-22) means the room has no single
    // fixed language to translate a question INTO — GPT-4o/ElevenLabs both
    // need a concrete target. "Ask a question" needs the ministry to have
    // pinned a real language in Settings; the button below is hidden in
    // that case, this is just the same guard defensively at the call site.
    if (!myLanguage || !userId || myLanguage === sourceLanguage || sourceLanguage === 'auto') return;
    setAskStarting(true);
    try {
      const { data, error } = await supabase.rpc('start_bot_session', {
        p_ministry_id: ministryId,
        p_room_name: roomName,
        p_source_language: myLanguage,
        p_target_language: sourceLanguage,
        p_speaker_identity: userId,
      });
      if (error) throw error;
      setAskingSessionId((data as { session_id: string })?.session_id ?? null);
      setAskingLanguage(myLanguage);
      toast({ title: 'Go ahead, ask your question', description: `Translating to ${sourceLanguage.toUpperCase()} for the host — tap "Done asking" when finished.` });
    } catch (err: any) {
      toast({ title: 'Could not start', description: err.message, variant: 'destructive' });
    } finally {
      setAskStarting(false);
    }
  };

  const doneAsking = async () => {
    if (!askingSessionId) return;
    const sessionId = askingSessionId;
    setAskingSessionId(null);
    setAskingLanguage(null);
    try {
      await supabase.rpc('stop_bot_session', { p_session_id: sessionId });
    } catch (err: any) {
      console.error('[FloatingTranslationButton] failed to stop Q&A session:', err);
    }
  };

  // Host-facing auto-surface: when a NEW track appears in the room's OWN
  // language (i.e. someone just started a reverse "Ask a question"
  // translation aimed at the host), automatically switch the host's Audio
  // to it and announce it — they shouldn't have to notice a new dropdown
  // entry mid-service to hear a question. Reverts to Original once that
  // track goes away (question finished), but only if they hadn't since
  // manually switched to something else themselves.
  //
  // Real bug found live (2026-08-22): "Question incoming" fired — and the
  // host's audio got auto-switched to it — the instant ANYONE (host or a
  // participant) clicked Show Captions, not just on a genuine question.
  // Root cause: Show Captions dispatches a same-language session
  // (target_language === sourceLanguage, so the bot skips translation),
  // which is EXACTLY the track shape "Ask a question" also produces
  // (deliberately translates back to sourceLanguage for the host to hear).
  // A LiveKit track carries no session_kind (that's DB-only), so this can't
  // be told apart from track data alone — auto-switching the host's actual
  // audio to a Show Captions track is especially bad since that track is
  // pure silence by design (rekindle-translation-bot's AudioPipeline.ts
  // skips TTS entirely for a same-language session), which reads exactly
  // like "the audio just went off." Cross-check session_kind (migration
  // 0291) before treating a new sourceLanguage track as a real question.
  useEffect(() => {
    const currentLangs = new Set(tracks.map((t) => t.language));
    const prevLangs = prevTrackLangsRef.current;

    if (isHost) {
      const newlyAppeared = [...currentLangs].filter((l) => !prevLangs.has(l));
      const questionTrackLang = newlyAppeared.find((l) => l === sourceLanguage);
      if (questionTrackLang) {
        const questionTrack = tracks.find((t) => t.language === questionTrackLang);
        if (questionTrack) {
          const sessionId = sessionIdFromBotIdentity(questionTrack.botIdentity);
          supabase
            .from('translation_sessions')
            .select('session_kind')
            .eq('id', sessionId)
            .maybeSingle()
            .then(({ data }) => {
              if (data?.session_kind === 'captions') return; // Show Captions, not a real question
              setLanguage(questionTrackLang);
              toast({ title: '🎤 Question incoming', description: `Playing the translated question in ${questionTrackLang.toUpperCase()} now.` });
            });
        }
      }
      const disappeared = [...prevLangs].filter((l) => !currentLangs.has(l));
      if (disappeared.includes(sourceLanguage) && currentLanguage === sourceLanguage) {
        setLanguage(null);
        toast({ title: 'Question finished', description: 'Back to the room\'s normal audio.' });
      }
    }

    prevTrackLangsRef.current = currentLangs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, isHost, sourceLanguage]);

  // My own in-progress question ended from the other side too (e.g. it
  // auto-stopped) — don't leave the "Asking…" UI stuck forever.
  useEffect(() => {
    if (askingLanguage && !tracks.some((t) => t.language === sourceLanguage)) {
      setAskingSessionId(null);
      setAskingLanguage(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  const addLanguage = async () => {
    if (!newLanguage) return;
    setStarting(true);
    try {
      const { error } = await supabase.rpc('start_bot_session', {
        p_ministry_id: ministryId,
        p_room_name: roomName,
        p_source_language: sourceLanguage,
        p_target_language: newLanguage,
        // No configured speaker identity here — the host's "+ Add language"
        // has always run in first-active-speaker fallback mode in practice
        // (this call site never actually had a speakerIdentity to pass).
        p_speaker_identity: null,
      });
      if (error) throw error;
      toast({ title: `${newLanguage.toUpperCase()} translation starting…` });
      setNewLanguage('');
      setShowAddLanguage(false);
      // The new "rlt-translated-{lang}" track shows up via
      // onTranslationTracksChanged once the bot actually joins and
      // publishes — no local state to update here.
    } catch (err: any) {
      toast({ title: 'Could not start translation', description: err.message, variant: 'destructive' });
    } finally {
      setStarting(false);
    }
  };

  // "Show Captions" — standalone from Live Translate. Turns on captions
  // immediately (optimistic — the overlay appears right away in a loading
  // state) and, only if no session/track exists yet for the room's own
  // language, dispatches one via start_bot_session with target==source. The
  // bot skips translate/TTS for a same-language session (rekindle-translation-bot's
  // AudioPipeline.ts) but still runs STT and logs source_text — the existing
  // caption-rendering/realtime-subscription code above needs no changes at
  // all once that session's track appears via the normal track-scan.
  const startCaptionsSession = async () => {
    setCaptionMode('original');
    if (tracks.some((t) => t.language === sourceLanguage)) return; // already running
    setCaptionsStarting(true);
    try {
      const { error } = await supabase.rpc('start_bot_session', {
        p_ministry_id: ministryId,
        p_room_name: roomName,
        p_source_language: sourceLanguage,
        p_target_language: sourceLanguage,
        // Admin/host path doesn't care about this value (matches "+ Add
        // language" passing null); a non-host participant needs their own
        // id to qualify for the self-service path (migration 0278).
        p_speaker_identity: isHost ? null : (userId || null),
        // Real bug found live (2026-08-22): without this, useMeetingNotes.ts
        // couldn't tell this same-language session apart from its OWN
        // same-language dispatch and treated Show Captions as "AI Notes
        // started" for every participant. session_kind (migration 0291) is
        // the explicit fix.
        p_session_kind: 'captions',
      });
      if (error) throw error;
    } catch (err: any) {
      toast({ title: 'Could not start captions', description: err.message, variant: 'destructive' });
      setCaptionMode('off');
    } finally {
      setCaptionsStarting(false);
    }
  };

  const copyDisplayLink = (botIdentity: string) => {
    const url = `${window.location.origin}/display/${sessionIdFromBotIdentity(botIdentity)}`;
    navigator.clipboard.writeText(url).then(
      () => toast({ title: 'Display link copied' }),
      () => toast({ title: 'Could not copy link', description: url, variant: 'destructive' }),
    );
  };

  const stopLanguage = async (track: { language: string; botIdentity: string }) => {
    setStoppingLanguage(track.language);
    try {
      const { error } = await supabase.rpc('stop_bot_session', {
        p_session_id: sessionIdFromBotIdentity(track.botIdentity),
      });
      if (error) throw error;
      if (currentLanguage === track.language) setLanguage(null);
      toast({ title: `${track.language.toUpperCase()} translation stopped` });
    } catch (err: any) {
      toast({ title: 'Could not stop translation', description: err.message, variant: 'destructive' });
    } finally {
      setStoppingLanguage(null);
    }
  };

  const row = 'w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-left transition-colors';
  const sel = (on: boolean) => (on ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-100');
  const placeholderText = captionsStarting
    ? 'Starting captions…'
    : captionMode === 'original' ? 'Waiting for speech…' : 'Waiting for translation…';
  // A same-language ("Show Captions") session's track shouldn't show up as
  // its own confusing duplicate "EN" row in either picker below — dubbing/
  // captioning your own language back at yourself isn't a real choice, it's
  // exactly what "Show Captions" (the row above) already is.
  const realTranslationTracks = tracks.filter((t) => t.language !== sourceLanguage);

  return (
    <>
      {/* In-meeting captions — a real overlay, not a link out to /display.
          Sits above the floating-pill row (bottom-24/28 in the meeting
          layout) so it never overlaps the controls beneath it. Only takes
          up space once a caption language is actually chosen.
          Widened + restyled per a real usability report ("not fitting and
          appealing... should be wider") — was capped at max-w-xl (576px),
          cramped against a real video-call width; now scales with the
          viewport up to a much larger cap, with room for the previous line
          too (context, like any real captions bar) instead of just the
          latest one. */}
      {captionMode !== 'off' && (
        <div
          ref={captionOverlay.ref}
          className="fixed bottom-40 sm:bottom-44 left-1/2 z-50 w-[94vw] sm:w-[85vw] md:w-[70vw] lg:max-w-3xl px-2"
          style={captionOverlay.style}
        >
          <div
            onPointerDown={captionOverlay.onPointerDown}
            onPointerMove={captionOverlay.onPointerMove}
            onPointerUp={captionOverlay.onPointerUp}
            onPointerCancel={captionOverlay.onPointerCancel}
            title="Drag to move"
            className={`flex items-start gap-3 rounded-2xl bg-black/80 backdrop-blur-md text-white px-5 py-4 shadow-xl ring-1 ring-white/10 select-none ${
              captionOverlay.isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            <div className="flex-1 min-w-0 space-y-1">
              {captionLines.length === 0 ? (
                <p className="text-base sm:text-lg text-center text-white/60 leading-relaxed">{placeholderText}</p>
              ) : (
                captionLines.map((line, i) => (
                  <p
                    key={line.id}
                    className={`text-center leading-relaxed ${
                      i === captionLines.length - 1
                        ? 'text-base sm:text-xl font-medium'
                        : 'text-sm sm:text-base text-white/50'
                    }`}
                  >
                    {line.text}
                  </p>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={() => setCaptionMode('off')}
              title="Turn off captions"
              className="shrink-0 text-white/60 hover:text-white mt-0.5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Live Translation"
            className={`flex h-10 items-center gap-1.5 rounded-full shadow-lg backdrop-blur-sm px-3 transition-colors ${
              currentLanguage || captionMode !== 'off' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-900/70 text-white hover:bg-gray-800/80'
            }`}
          >
            <Languages className="h-5 w-5" />
            {currentLanguage && <span className="text-xs font-semibold">{currentLanguage.toUpperCase()}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-72 p-2">
          {tracks.length === 0 && !isHost && (
            <p className="text-xs text-muted-foreground px-2.5 py-2">
              No live translation running yet — ask the host to start one, and it'll show up here automatically.
            </p>
          )}
          <p className="text-xs font-semibold text-gray-700 px-2.5 mb-1">Audio</p>
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            <button type="button" onClick={() => setLanguage(null)} className={`${row} ${sel(currentLanguage === null)}`}>
              <Volume2 className="h-4 w-4" />
              <span className="flex-1">Original</span>
              {currentLanguage === null && <Check className="h-3.5 w-3.5 text-indigo-600" />}
            </button>
            {realTranslationTracks.map((track) => (
              <div key={track.botIdentity} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setLanguage(track.language)}
                  className={`${row} flex-1 ${sel(currentLanguage === track.language)}`}
                >
                  <Languages className="h-4 w-4" />
                  <span className="flex-1">{track.language.toUpperCase()}</span>
                  {currentLanguage === track.language && <Check className="h-3.5 w-3.5 text-indigo-600" />}
                </button>
                <button
                  type="button"
                  onClick={() => copyDisplayLink(track.botIdentity)}
                  title="Copy display link"
                  className="p-2 text-gray-500 hover:text-gray-800"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                {isHost && (
                  <button
                    type="button"
                    onClick={() => stopLanguage(track)}
                    disabled={stoppingLanguage === track.language}
                    title="Stop this language"
                    className="p-2 text-gray-500 hover:text-red-600 disabled:opacity-50"
                  >
                    <Square className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Captions — standalone feature, independent of both the Audio
              choice above AND of Live Translate: "Show Captions" works the
              instant it's clicked, with no translation language ever having
              been selected by anyone (see startCaptionsSession above — it
              self-dispatches a same-language STT-only session on demand).
              Also independent of Audio the same way it always was: keep the
              real voice and still read captions, or mute translated audio
              but read along, same idea as any video app's separate CC menu. */}
          <p className="text-xs font-semibold text-gray-700 px-2.5 mb-1 mt-2 border-t pt-2">Captions</p>
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            <button type="button" onClick={() => setCaptionMode('off')} className={`${row} ${sel(captionMode === 'off')}`}>
              <X className="h-4 w-4" />
              <span className="flex-1">Off</span>
              {captionMode === 'off' && <Check className="h-3.5 w-3.5 text-indigo-600" />}
            </button>
            <button
              type="button"
              onClick={startCaptionsSession}
              disabled={captionsStarting}
              className={`${row} ${sel(captionMode === 'original')} disabled:opacity-50`}
            >
              {captionsStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Captions className="h-4 w-4" />}
              <span className="flex-1">Show Captions</span>
              {captionMode === 'original' && !captionsStarting && <Check className="h-3.5 w-3.5 text-indigo-600" />}
            </button>
            {realTranslationTracks.map((track) => (
              <button
                key={`caption-${track.botIdentity}`}
                type="button"
                onClick={() => setCaptionMode(track.language)}
                className={`${row} ${sel(captionMode === track.language)}`}
              >
                <Captions className="h-4 w-4" />
                <span className="flex-1">{track.language.toUpperCase()}</span>
                {captionMode === track.language && <Check className="h-3.5 w-3.5 text-indigo-600" />}
              </button>
            ))}
          </div>

          {isHost && (
            <div className="mt-2 border-t pt-2 px-2.5 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">Best audio tips</p>
              <ul className="space-y-1 text-[11px] text-gray-600">
                {liveTranslateTips.map((tip) => (
                  <li key={tip} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>

              <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-700">Approved phrases</p>
                <div className="mt-1 text-xs text-muted-foreground">
                  Approved ministry phrases are managed in Live Translation settings.
                </div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => window.open(`${window.location.origin}/ministries/${ministryId}/live`, '_blank')}>
                    Edit in Settings
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Ask a question — bidirectional Q&A (build plan). Only makes
              sense once we know MY language (inferred from Audio/Captions
              above) and it differs from the room's own language — asking
              "in English" back to an English-speaking host is a no-op. */}
          {userId && myLanguage && myLanguage !== sourceLanguage && sourceLanguage !== 'auto' && (
            <div className="mt-2 border-t pt-2">
              {askingSessionId ? (
                <button type="button" onClick={doneAsking} className={`${row} text-red-600 hover:bg-red-50`}>
                  <Square className="h-4 w-4" />
                  <span className="flex-1">Asking in {askingLanguage?.toUpperCase()}… tap when done</span>
                </button>
              ) : (
                <button type="button" onClick={askQuestion} disabled={askStarting} className={`${row} text-indigo-700 hover:bg-indigo-50 disabled:opacity-50`}>
                  {askStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
                  <span className="flex-1">Ask a question in {myLanguage.toUpperCase()}</span>
                </button>
              )}
            </div>
          )}

          {isHost && !showAddLanguage && (
          <button
            type="button"
            onClick={() => setShowAddLanguage(true)}
            className={`${row} text-indigo-700 hover:bg-indigo-50 mt-1`}
          >
            <Plus className="h-4 w-4" />
            <span className="flex-1">Add language</span>
          </button>
        )}

          {!isHost && !showAddLanguage && (
            <button
              type="button"
              onClick={async () => {
                toast({ title: 'Unavailable', description: 'Speech translation and caption translation are unavailable until the host adds that language.' });
                try {
                  await notify({
                    type: 'onboarding_tip',
                    title: 'Translation requested',
                    body: `${user?.email || 'A participant'} requested translation/captions in this meeting.`,
                    ministryId,
                    targetAudience: 'leaders',
                    link: `/ministries/${ministryId}/live`,
                  });
                } catch (err) {
                  // notify errors shouldn't block UX
                  console.error('[FloatingTranslationButton] notify failed', err);
                }
              }}
              className={`${row} text-gray-700 hover:bg-gray-100 mt-1`}
            >
              <Plus className="h-4 w-4" />
              <span className="flex-1">Add language</span>
            </button>
          )}

        {isHost && showAddLanguage && (
          <div className="mt-1.5 space-y-1.5 border-t pt-1.5">
            {supportedLanguages.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2.5">
                No supported languages configured yet — set them in Live Translation → Settings first.
              </p>
            ) : (
              <>
                <Select value={newLanguage} onValueChange={setNewLanguage}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Choose a language" /></SelectTrigger>
                  <SelectContent>
                    {supportedLanguages
                      .filter((code) => !tracks.some((t) => t.language === code))
                      .map((code) => (
                        <SelectItem key={code} value={code}>{code.toUpperCase()}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-1.5">
                  <Button size="sm" className="flex-1" onClick={addLanguage} disabled={!newLanguage || starting}>
                    {starting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                    Start
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddLanguage(false)}>Cancel</Button>
                </div>
              </>
            )}
          </div>
        )}

        <p className="text-[10px] text-gray-400 px-2.5 pt-1.5">
          Audio "Original" mutes the translation and restores the room's normal audio. Captions run independently of
          whichever audio you're listening to.
        </p>
      </PopoverContent>
    </Popover>
    </>
  );
};

export default FloatingTranslationButton;
