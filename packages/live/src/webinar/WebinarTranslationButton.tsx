import React, { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, type RemoteTrack, type RemoteTrackPublication, type RemoteParticipant } from 'livekit-client';
import { Popover, PopoverContent, PopoverTrigger } from '@rekindle/ui/popover';
import { Languages, Check, Volume2, Captions, X, Loader2 } from 'lucide-react';
import { supabase } from '@rekindle/supabase';
import { useDraggableOverlay } from '../useDraggableOverlay';

interface AvailableSession {
  id: string;
  target_language: string;
  source_language: string;
}

interface CaptionLine {
  id: string;
  text: string;
}

type CaptionMode = 'off' | 'original' | string;
type AudioStatus = 'idle' | 'connecting' | 'live' | 'error';

/** translation-listener-token's 200 response — same shape TranslationDisplayPage.tsx uses. */
interface ListenerToken {
  url: string;
  token: string;
  roomName: string;
  trackName: string;
  targetLanguage: string;
}

interface WebinarTranslationButtonProps {
  webinarId: string;
  /** The LiveKit room the webinar (and the bot) actually run in —
   *  ministry_webinars.room_name. */
  roomName: string;
  /** How many seconds behind real time the HLS video is expected to run —
   *  the translated audio is deliberately delayed by the same amount (via
   *  a Web Audio DelayNode) so the dub doesn't arrive before the viewer
   *  sees the speaker's mouth move. Pass the same value given to
   *  HlsPlayer's targetLatencySeconds so both stay in sync by construction. */
  delaySeconds: number;
  /** True whenever a real (non-Original) language is selected — the caller
   *  mutes the HLS video's own audio while this is true. */
  onActiveChange?: (active: boolean) => void;
}

const sessionIdFromBotIdentity = (botIdentity: string): string => botIdentity.replace(/^rlt-bot-/, '');

/**
 * Translation picker for HLS-viewing webinar attendees (WebinarAttendeeViewer
 * never joins the LiveKit room at all) — a near-verbatim mirror of
 * BroadcastTranslationButton.tsx (the equivalent for Live Channel Broadcast
 * HLS viewers), swapped from channelId/start_captions_session to
 * webinarId/start_webinar_captions_session (migration 0358). Every real-bug
 * fix in that component's history (audio sync, caption timing, gesture-linked
 * AudioContext, etc. — see its own comments) applies identically here, since
 * this is the exact same subscribe-only translation-listener-token flow,
 * just scoped to a webinar's room instead of a broadcast's.
 */
export const WebinarTranslationButton: React.FC<WebinarTranslationButtonProps> = ({
  webinarId,
  roomName,
  delaySeconds,
  onActiveChange,
}) => {
  const [sessions, setSessions] = useState<AvailableSession[]>([]);
  const [currentLanguage, setCurrentLanguage] = useState<string | null>(null);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>('idle');
  const [audioError, setAudioError] = useState<string | null>(null);
  const [needsUnlock, setNeedsUnlock] = useState(false);

  const delaySecondsRef = useRef(delaySeconds);
  delaySecondsRef.current = delaySeconds;

  // Persisted per webinar (2026-09-23, real gap flagged in a captions
  // pipeline review): every reload/reconnect lost the viewer's caption
  // choice — Meet/Zoom/YouTube all remember it.
  const CAPTION_MODE_STORAGE_KEY = `rk-caption-mode-${webinarId}`;
  const [captionMode, setCaptionModeState] = useState<CaptionMode>(() => {
    try { return (localStorage.getItem(CAPTION_MODE_STORAGE_KEY) as CaptionMode) || 'off'; } catch { return 'off'; }
  });
  const setCaptionMode = (mode: CaptionMode) => {
    setCaptionModeState(mode);
    try { localStorage.setItem(CAPTION_MODE_STORAGE_KEY, mode); } catch { /* private-browsing / quota — non-fatal */ }
  };
  const [captionLines, setCaptionLines] = useState<CaptionLine[]>([]);
  // Near-real-time interim text (2026-09-23, captions pipeline review Phase
  // 3, F-CAP-1) — mirrors FloatingTranslationButton.tsx's interimText.
  // translation_sessions.interim_text now updates for every session
  // (same-language AND translated — see AudioPipeline.ts's own comment).
  const [interimText, setInterimText] = useState('');
  const captionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [captionsStarting, setCaptionsStarting] = useState(false);
  const [captionsError, setCaptionsError] = useState<string | null>(null);
  const hadSessionForModeRef = useRef<{ mode: CaptionMode; had: boolean }>({ mode: 'off', had: false });
  const captionOverlay = useDraggableOverlay({
    resetKey: captionMode === 'off' ? 'off' : 'on',
    baseTransform: 'translateX(-50%)',
  });

  // Deferred until the picker is actually opened (hasOpened) — same reasoning
  // as BroadcastTranslationButton: don't burn a Realtime channel per idle
  // attendee the instant they load the page.
  const [hasOpened, setHasOpened] = useState(false);

  const timingT0Ref = useRef(0);
  const [timingStatus, setTimingStatus] = useState<string | null>(null);
  const markTiming = (label: string) => {
    const elapsedMs = Date.now() - timingT0Ref.current;
    console.log(`[WebinarTranslationButton] +${elapsedMs}ms: ${label}`);
    setTimingStatus(`${label} (${(elapsedMs / 1000).toFixed(1)}s)`);
  };

  const roomRef = useRef<Room | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const primedCtxRef = useRef<AudioContext | null>(null);

  const primeAudioContext = () => {
    if (primedCtxRef.current) {
      primedCtxRef.current.close().catch(() => {});
      primedCtxRef.current = null;
    }
    try {
      const ctx = new AudioContext();
      ctx.resume().catch(() => {});
      primedCtxRef.current = ctx;
    } catch {
      /* ignore — playTrack() falls back to creating its own */
    }
  };

  // Which languages the bot currently has running for this webinar.
  useEffect(() => {
    if (!hasOpened) return;
    let cancelled = false;
    const load = () => {
      supabase
        .from('translation_sessions')
        .select('id, target_language, source_language')
        .eq('livekit_room_name', roomName)
        .in('status', ['initialising', 'joining', 'active', 'paused'])
        .then(({ data }) => {
          if (!cancelled && data) setSessions(data as AvailableSession[]);
        });
    };
    load();

    const channel = supabase
      .channel(`webinar-translation-sessions-${webinarId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'translation_sessions', filter: `livekit_room_name=eq.${roomName}` },
        load)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [webinarId, roomName, hasOpened]);

  const generationRef = useRef(0);

  const teardownAudio = () => {
    roomRef.current?.disconnect().catch(() => {});
    roomRef.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx) ctx.close().catch(() => {});
    if (primedCtxRef.current) {
      primedCtxRef.current.close().catch(() => {});
      primedCtxRef.current = null;
    }
  };

  const currentSessionId = currentLanguage
    ? sessions.find((s) => s.target_language === currentLanguage)?.id ?? null
    : null;

  useEffect(() => {
    const myGeneration = ++generationRef.current;
    teardownAudio();
    setNeedsUnlock(false);
    onActiveChange?.(!!currentLanguage);

    if (!currentLanguage) {
      setAudioStatus('idle');
      setTimingStatus(null);
      return;
    }
    if (!currentSessionId) {
      setCurrentLanguage(null);
      return;
    }

    const stale = () => generationRef.current !== myGeneration;
    setAudioStatus('connecting');
    setAudioError(null);
    timingT0Ref.current = Date.now();
    markTiming('language selected — fetching listener token');

    (async () => {
      const { data, error } = await supabase.functions.invoke('translation-listener-token', {
        body: { sessionId: currentSessionId },
      });
      if (stale()) return;
      if (error || !data?.token) {
        setAudioError((data as { error?: string })?.error ?? 'connection_failed');
        setAudioStatus('error');
        return;
      }
      markTiming('token received — opening WebRTC connection');
      const { url, token, trackName } = data as ListenerToken;

      const room = new Room({ adaptiveStream: true });
      roomRef.current = room;

      const isBotTranslatedTrack = (pub: RemoteTrackPublication, participant: RemoteParticipant) =>
        participant.identity.startsWith('rlt-bot-') && pub.trackName === trackName;

      let audioWired = false;

      const playTrack = (track: RemoteTrack) => {
        if (stale() || audioWired) return;
        audioWired = true;
        markTiming(`translated track subscribed — wiring up audio (~${delaySeconds}s alignment delay still ahead)`);
        try {
          const audioCtx = primedCtxRef.current ?? new AudioContext();
          primedCtxRef.current = null;
          audioCtxRef.current = audioCtx;
          const stillCurrent = () => !stale() && audioCtxRef.current === audioCtx;
          const source = audioCtx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));

          const delayNode = audioCtx.createDelay(Math.max(delaySecondsRef.current + 5, 15));
          delayNode.delayTime.value = delaySecondsRef.current;
          source.connect(delayNode);
          delayNode.connect(audioCtx.destination);

          setAudioStatus('live');
          audioCtx.resume().then(() => {
            markTiming(`audio graph running — sound reaches speakers ~${delaySeconds}s after this point`);
            if (stillCurrent()) setNeedsUnlock(false);
          }).catch(() => {
            if (stillCurrent()) setNeedsUnlock(true);
          });
          [800, 2500].forEach((delayMs) => {
            setTimeout(() => {
              if (stillCurrent() && audioCtx.state !== 'running') setNeedsUnlock(true);
            }, delayMs);
          });
        } catch (err) {
          console.error('[WebinarTranslationButton] Web Audio setup failed:', err);
          if (!stale()) {
            setAudioError('connection_failed');
            setAudioStatus('error');
          }
        }
      };

      room.on(RoomEvent.TrackPublished, (pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (isBotTranslatedTrack(pub, participant)) pub.setSubscribed(true);
      });
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (isBotTranslatedTrack(pub, participant)) playTrack(track);
      });
      room.on(RoomEvent.Disconnected, () => {
        if (!stale()) setCurrentLanguage(null);
      });

      try {
        await room.connect(url, token, { autoSubscribe: false });
        if (stale()) return;
        markTiming('WebRTC room connected — looking for the translated track');
        room.remoteParticipants.forEach((participant) => {
          participant.trackPublications.forEach((pub) => {
            if (isBotTranslatedTrack(pub as RemoteTrackPublication, participant)) {
              (pub as RemoteTrackPublication).setSubscribed(true);
            }
          });
        });
      } catch (err) {
        if (!stale()) {
          console.error('[WebinarTranslationButton] LiveKit connect failed:', err);
          setAudioError('connection_failed');
          setAudioStatus('error');
        }
      }
    })();

    return () => {
      generationRef.current += 1;
      teardownAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId]);

  useEffect(() => () => teardownAudio(), []);

  const sessionIdForCaptionMode = (mode: CaptionMode): string | null => {
    if (mode === 'off') return null;
    const session = mode === 'original' ? sessions[0] : sessions.find((s) => s.target_language === mode);
    return session?.id ?? null;
  };

  const startCaptionsSession = async () => {
    setCaptionsError(null);
    setCaptionMode('original');
    if (sessions.length > 0) return; // some session already running — reuse it
    setCaptionsStarting(true);
    try {
      const { error } = await supabase.rpc('start_webinar_captions_session', { p_webinar_id: webinarId });
      if (error) throw error;
    } catch (err: any) {
      console.error('[WebinarTranslationButton] could not start captions:', err);
      setCaptionsError(err.message || 'Could not start captions');
      setCaptionMode('off');
    } finally {
      setCaptionsStarting(false);
    }
  };

  useEffect(() => {
    if (captionChannelRef.current) {
      supabase.removeChannel(captionChannelRef.current);
      captionChannelRef.current = null;
    }
    setCaptionLines([]);
    setInterimText('');

    const sessionId = sessionIdForCaptionMode(captionMode);
    const hadSessionForThisMode = hadSessionForModeRef.current.mode === captionMode && hadSessionForModeRef.current.had;
    if (!sessionId) {
      if (captionMode !== 'off' && hadSessionForThisMode) setCaptionMode('off');
      return;
    }
    hadSessionForModeRef.current = { mode: captionMode, had: true };

    const field = captionMode === 'original' ? 'source_text' : 'translated_text';
    let cancelled = false;

    const CAPTION_LEAD_SECONDS = 0.4;
    const pendingTimers: ReturnType<typeof setTimeout>[] = [];

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
      .channel(`webinar-captions-${sessionId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'translation_logs', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as { id: string; source_text: string; translated_text: string };
          const line = { id: row.id, text: field === 'source_text' ? row.source_text : row.translated_text };
          const apply = () => {
            if (cancelled) return;
            setCaptionLines((prev) => [...prev, line].slice(-2));
            setInterimText(''); // a final line supersedes whatever was growing
          };
          const captionDelayMs = Math.max((delaySecondsRef.current - CAPTION_LEAD_SECONDS) * 1000, 0);
          if (captionDelayMs > 0) pendingTimers.push(setTimeout(apply, captionDelayMs));
          else apply();
        })
      // F-CAP-1 (2026-09-23, captions pipeline review Phase 3): the bot now
      // publishes the growing, not-yet-finalized line for EVERY session,
      // not just same-language ones — see AudioPipeline.ts. No caption-sync
      // delay applied here (unlike final lines above) — an interim preview
      // is explicitly labeled "still being heard" below, so it's shown as
      // soon as it arrives rather than held back to line up with delayed
      // audio (it's a live status indicator, not in-sync dialogue).
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'translation_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          if (cancelled) return;
          const row = payload.new as { interim_text: string | null };
          setInterimText(row.interim_text || '');
        })
      .subscribe();
    captionChannelRef.current = channel;

    return () => {
      cancelled = true;
      pendingTimers.forEach(clearTimeout);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captionMode, sessions]);

  // Clear stale captions after silence (2026-09-23, real gap flagged in a
  // captions pipeline review): without this, the last spoken line(s) sat on
  // screen forever through any pause. Resets on every new line so an
  // actively-talking speaker never gets cut off mid-flow.
  useEffect(() => {
    if (captionLines.length === 0 && !interimText) return;
    const CLEAR_AFTER_SILENCE_MS = 8000;
    const timer = setTimeout(() => { setCaptionLines([]); setInterimText(''); }, CLEAR_AFTER_SILENCE_MS);
    return () => clearTimeout(timer);
  }, [captionLines, interimText]);

  const row = 'w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-left transition-colors';
  const sel = (on: boolean) => (on ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-100');
  const placeholderText = captionsStarting
    ? 'Starting captions…'
    : captionMode === 'original' ? 'Waiting for speech…' : 'Waiting for translation…';
  const realSessions = sessions.filter((s) => s.source_language !== s.target_language);

  return (
    <>
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
            {/* aria-live="polite" (2026-09-23, real gap flagged in a
                captions pipeline review): announces each final caption
                line to screen readers. interimText is kept out of this
                region (aria-hidden below) — it updates on nearly every
                Deepgram chunk while someone's talking. */}
            <div className="flex-1 min-w-0 space-y-1" aria-live="polite" aria-atomic="false">
              {captionLines.length === 0 && !interimText ? (
                <p className="text-base sm:text-lg text-center text-white/60 leading-relaxed">{placeholderText}</p>
              ) : (
                <>
                  {captionLines.map((line, i) => (
                    <p
                      key={line.id}
                      className={`text-center leading-relaxed ${
                        i === captionLines.length - 1 && !interimText ? 'text-base sm:text-xl font-medium' : 'text-sm sm:text-base text-white/50'
                      }`}
                    >
                      {line.text}
                    </p>
                  ))}
                  {/* F-CAP-1 (2026-09-23, captions pipeline review Phase 3):
                      the bot now publishes interim text for translated
                      sessions too — labeled "Hearing:" and dimmer/italic so
                      it can't be mistaken for the real translated line. */}
                  {interimText && (
                    captionMode === 'original' ? (
                      <p aria-hidden="true" className="text-base sm:text-xl font-medium text-center leading-relaxed text-white/90">
                        {interimText}
                      </p>
                    ) : (
                      <p aria-hidden="true" className="text-sm text-center leading-relaxed text-white/40 italic">
                        Hearing: {interimText}
                      </p>
                    )
                  )}
                </>
              )}
            </div>
            <button type="button" onClick={() => setCaptionMode('off')} title="Turn off captions" className="shrink-0 text-white/60 hover:text-white mt-0.5">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {timingStatus && audioStatus !== 'idle' && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[90vw]">
          <div className="rounded-full bg-black/70 text-white text-[11px] px-3 py-1.5 text-center backdrop-blur-sm">
            {timingStatus}
          </div>
        </div>
      )}

      {needsUnlock && audioStatus === 'live' && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50">
          <button
            type="button"
            onClick={() => audioCtxRef.current?.resume().then(() => setNeedsUnlock(false)).catch(() => {})}
            className="flex items-center gap-2 rounded-full bg-indigo-600 text-white px-4 py-2 text-sm font-medium shadow-lg"
          >
            <Volume2 className="h-4 w-4" />
            Tap to enable translated audio
          </button>
        </div>
      )}

      <Popover onOpenChange={(open) => { if (open) setHasOpened(true); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Live Translation"
            className={`flex h-10 items-center gap-1.5 rounded-full shadow-lg backdrop-blur-sm px-3 transition-colors ${
              currentLanguage || captionMode !== 'off' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-black/50 text-white hover:bg-black/70'
            }`}
          >
            <Languages className="h-5 w-5" />
            {currentLanguage && <span className="text-xs font-semibold">{currentLanguage.toUpperCase()}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2">
          {realSessions.length === 0 && (
            <p className="text-xs text-muted-foreground px-2.5 py-2">
              No live translation running yet — once the host starts one, it'll show up here automatically.
            </p>
          )}
          <p className="text-xs font-semibold text-gray-700 px-2.5 mb-1">Audio</p>
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            <button type="button" onClick={() => setCurrentLanguage(null)} className={`${row} ${sel(currentLanguage === null)}`}>
              <Volume2 className="h-4 w-4" />
              <span className="flex-1">Original</span>
              {currentLanguage === null && <Check className="h-3.5 w-3.5 text-indigo-600" />}
            </button>
            {realSessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { primeAudioContext(); setCurrentLanguage(s.target_language); }}
                className={`${row} ${sel(currentLanguage === s.target_language)}`}
              >
                {currentLanguage === s.target_language && audioStatus === 'connecting'
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Languages className="h-4 w-4" />}
                <span className="flex-1">{s.target_language.toUpperCase()}</span>
                {currentLanguage === s.target_language && audioStatus === 'live' && <Check className="h-3.5 w-3.5 text-indigo-600" />}
              </button>
            ))}
          </div>
          {audioStatus === 'error' && (
            <p className="text-xs text-red-600 px-2.5 pt-1.5">
              {audioError === 'not_found' ? 'This session is no longer available.' : 'Could not connect — try again.'}
            </p>
          )}

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
            {realSessions.map((s) => (
              <button
                key={`caption-${s.id}`}
                type="button"
                onClick={() => setCaptionMode(s.target_language)}
                className={`${row} ${sel(captionMode === s.target_language)}`}
              >
                <Captions className="h-4 w-4" />
                <span className="flex-1">{s.target_language.toUpperCase()}</span>
                {captionMode === s.target_language && <Check className="h-3.5 w-3.5 text-indigo-600" />}
              </button>
            ))}
          </div>
          {captionsError && (
            <p className="text-xs text-red-600 px-2.5 pt-1.5">{captionsError}</p>
          )}

          <p className="text-[10px] text-gray-400 px-2.5 pt-1.5">
            Translated audio is deliberately delayed ~{delaySeconds}s to line up with the video.
          </p>
        </PopoverContent>
      </Popover>
    </>
  );
};

export default WebinarTranslationButton;
