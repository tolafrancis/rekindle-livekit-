import React, { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, type RemoteTrack, type RemoteTrackPublication, type RemoteParticipant } from 'livekit-client';
import { Popover, PopoverContent, PopoverTrigger } from '@rekindle/ui/popover';
import { Languages, Check, Volume2, Captions, X, Loader2 } from 'lucide-react';
import { supabase } from '@rekindle/supabase';

interface AvailableSession {
  id: string;
  target_language: string;
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

interface BroadcastTranslationButtonProps {
  channelId: string;
  /** The LiveKit room the broadcast (and the bot) actually run in — same
   *  string LiveChannelViewer already computes for its own room join, so
   *  callers should pass that exact value rather than re-deriving it. */
  roomName: string;
  /** How many seconds behind real time the HLS video is expected to run —
   *  the translated audio is deliberately delayed by the same amount (via
   *  a Web Audio DelayNode) so the dub doesn't arrive before the viewer
   *  sees the speaker's mouth move. Pass the same value given to
   *  HlsPlayer's targetLatencySeconds so both stay in sync by construction. */
  delaySeconds: number;
  /** True whenever a real (non-Original) language is selected — the caller
   *  mutes the HLS video's own audio while this is true, same idea as the
   *  meeting picker muting the room's other mics. */
  onActiveChange?: (active: boolean) => void;
}

const sessionIdFromBotIdentity = (botIdentity: string): string => botIdentity.replace(/^rlt-bot-/, '');

/**
 * Translation picker for HLS-viewing broadcast audience (see
 * LiveChannelViewer.tsx's watchViaHls / isSpeaker split) — the audience
 * isn't in the LiveKit room at all, so unlike FloatingTranslationButton
 * (which just reads room state a parent already has), this owns its OWN
 * lightweight, subscribe-only WebRTC connection: the exact same
 * translation-listener-token flow TranslationDisplayPage.tsx (/display)
 * uses, just with a delay buffer added since this audio now has to line up
 * against several-second-delayed HLS video instead of real-time WebRTC video.
 */
export const BroadcastTranslationButton: React.FC<BroadcastTranslationButtonProps> = ({
  channelId,
  roomName,
  delaySeconds,
  onActiveChange,
}) => {
  const [sessions, setSessions] = useState<AvailableSession[]>([]);
  const [currentLanguage, setCurrentLanguage] = useState<string | null>(null);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>('idle');
  const [audioError, setAudioError] = useState<string | null>(null);
  const [needsUnlock, setNeedsUnlock] = useState(false);

  const [captionMode, setCaptionMode] = useState<CaptionMode>('off');
  const [captionLines, setCaptionLines] = useState<CaptionLine[]>([]);
  const captionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Timing instrumentation (2026-08-19) — a real report of translated audio
  // taking 15-20s to be heard, vs. the bot's own server-side pipeline logging
  // well under 1.5s per utterance (translate + TTS) and audio flowing into
  // the outgoing WebRTC track within ~20ms of that. That accounts for maybe
  // 7-8s total with the deliberate delaySeconds alignment buffer added in —
  // nowhere near 15-20s. The remaining gap has to be in the one link server
  // logs can't see: THIS component's own token-fetch + WebRTC connect +
  // subscribe path. Logged (and shown on-screen, so a live report doesn't
  // need devtools) at every stage so the next test pins down exactly which
  // one is slow instead of guessing again.
  const timingT0Ref = useRef(0);
  const [timingStatus, setTimingStatus] = useState<string | null>(null);
  const markTiming = (label: string) => {
    const elapsedMs = Date.now() - timingT0Ref.current;
    console.log(`[BroadcastTranslationButton] +${elapsedMs}ms: ${label}`);
    setTimingStatus(`${label} (${(elapsedMs / 1000).toFixed(1)}s)`);
  };

  const roomRef = useRef<Room | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  // Created synchronously inside the language button's own onClick — see
  // primeAudioContext() below — so it's reliably treated as gesture-linked
  // by the browser's autoplay policy. playTrack() consumes this instead of
  // constructing a fresh (and, by then, no-longer-gesture-linked) context
  // once the track actually arrives several awaits later.
  const primedCtxRef = useRef<AudioContext | null>(null);

  // Real fix (2026-08-19): constructing the AudioContext only once the
  // track finally arrived — after a token fetch + a full WebRTC handshake —
  // meant `resume()` ran well outside the window most browsers treat as
  // "linked to a user gesture," so it silently needed a second, separate
  // tap almost every time (real report: "translated audio isn't playing on
  // its own, it's mute"). Creating + resuming the context RIGHT HERE,
  // synchronously inside the click itself, is what browsers actually honor.
  const primeAudioContext = () => {
    // Close out a previous primed-but-never-consumed context first (rapid
    // re-clicking before the last selection's track ever subscribed) so it
    // doesn't leak.
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

  // Which languages the bot currently has running for this broadcast —
  // realtime, same pattern MinistryTranslationServiceManager.tsx already
  // uses for the dashboard's own session list.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      supabase
        .from('translation_sessions')
        .select('id, target_language')
        .eq('livekit_room_name', roomName)
        .in('status', ['initialising', 'joining', 'active', 'paused'])
        .then(({ data }) => {
          if (!cancelled && data) setSessions(data as AvailableSession[]);
        });
    };
    load();

    const channel = supabase
      .channel(`broadcast-translation-sessions-${channelId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'translation_sessions', filter: `livekit_room_name=eq.${roomName}` },
        load)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [channelId, roomName]);

  // Bumped every time the selected language changes — every async callback
  // below (the resume() promise especially) checks this before touching
  // anything, so a callback that was already in flight when the user
  // switched languages can never act on stale state.
  const generationRef = useRef(0);

  const teardownAudio = () => {
    roomRef.current?.disconnect().catch(() => {});
    roomRef.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null; // clear the ref BEFORE closing (async) so any
    // in-flight callback closing over the old `ctx` can tell it's stale by
    // comparing against the ref, not just by checking truthiness.
    if (ctx) ctx.close().catch(() => {});
    // A primed-but-never-consumed context (selected, then switched away
    // before the track ever subscribed) would otherwise leak silently.
    if (primedCtxRef.current) {
      primedCtxRef.current.close().catch(() => {});
      primedCtxRef.current = null;
    }
  };

  // Real bug found live (2026-08-15): selecting a language whose audio got
  // autoplay-blocked (common — the resume() call below lands well after the
  // original click, once several awaits have passed, so it's no longer
  // treated as gesture-linked), then switching back to Original, could
  // leave TWO things audible: the video's own audio (correctly unmuted)
  // AND the translated dub (which the earlier resume() call — still
  // pending, not yet rejected — finally resolved once the NEW click on
  // "Original" gave the browser a fresh, valid gesture to retroactively
  // honor). The teardown for switching away ran, but a dangling .then()
  // from the OLD selection's resume() call fired afterward and started
  // audio from a context that was already supposed to be dead. Every
  // callback below now checks generationRef before doing anything, so a
  // late resume() from an abandoned selection can never produce sound.
  //
  // The IDENTITY of the currently selected session — not just the language
  // STRING. Real bug found live (2026-08-19), described as "cracking" audio
  // with the first few words repeated twice: this effect used to depend on
  // [currentLanguage] alone. Across a session restart during testing (same
  // target language, e.g. host stops and starts a new "vi" session), the
  // LANGUAGE never changed, so the effect never re-ran — the listener's
  // Room stayed connected to the OLD session's now-abandoned bot, with its
  // TrackPublished/TrackSubscribed handlers still live. When the NEW bot
  // joined the SAME physical room and published a track with the same name
  // (rlt-translated-vi), those still-active handlers picked it up too —
  // playTrack() ran a SECOND time, building a second AudioContext/DelayNode
  // graph on top of the first. Two overlapping copies of the same speech
  // playing back a moment apart is exactly "cracking" + "repeated twice".
  // Keying on the actual session id instead forces a full teardown+reconnect
  // whenever the underlying session changes, even if the language string
  // the user picked didn't.
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
      // The language disappeared (bot stopped, or hasn't started its
      // replacement session yet) while selected.
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

      const playTrack = (track: RemoteTrack) => {
        if (stale()) return;
        markTiming(`translated track subscribed — wiring up audio (~${delaySeconds}s alignment delay still ahead)`);
        try {
          // Prefer the context primed synchronously in the click handler
          // (primeAudioContext) — already resumed there, while it still
          // counted as gesture-linked. Consume-and-clear so a later
          // selection can't accidentally reuse a stale primed context.
          const audioCtx = primedCtxRef.current ?? new AudioContext();
          primedCtxRef.current = null;
          audioCtxRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
          // maxDelayTime headroom well above delaySeconds so a later config
          // bump doesn't need this node rebuilt.
          const delayNode = audioCtx.createDelay(Math.max(delaySeconds + 5, 15));
          delayNode.delayTime.value = delaySeconds;
          source.connect(delayNode);
          delayNode.connect(audioCtx.destination);
          setAudioStatus('live');
          const stillCurrent = () => !stale() && audioCtxRef.current === audioCtx;
          audioCtx.resume().then(() => {
            markTiming(`audio graph running — sound reaches speakers ~${delaySeconds}s after this point`);
            // The generation check alone isn't quite enough here — a NEWER
            // selection could in principle have already created its own
            // audioCtx by the time this resolves. Comparing against the
            // ref (not just truthiness) catches both cases.
            if (stillCurrent()) setNeedsUnlock(false);
          }).catch(() => {
            if (stillCurrent()) setNeedsUnlock(true);
          });
          // Real bug found live (2026-08-19): some browsers leave resume()
          // pending indefinitely instead of ever resolving or rejecting —
          // confirmed live (captions worked, proving the session/connection
          // were fine, but audio stayed permanently silent with no error
          // and no unlock button ever appearing — exactly what a
          // never-settling promise looks like). Don't trust the promise
          // alone: check the context's actual state directly, twice, and
          // force the unlock affordance if it's still not 'running' by
          // then, regardless of what resume() ever reports.
          [800, 2500].forEach((delayMs) => {
            setTimeout(() => {
              if (stillCurrent() && audioCtx.state !== 'running') setNeedsUnlock(true);
            }, delayMs);
          });
        } catch (err) {
          console.error('[BroadcastTranslationButton] Web Audio setup failed:', err);
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
          console.error('[BroadcastTranslationButton] LiveKit connect failed:', err);
          setAudioError('connection_failed');
          setAudioStatus('error');
        }
      }
    })();

    return () => {
      generationRef.current += 1; // in case this unmount races a same-tick re-run
      teardownAudio();
    };
    // currentSessionId, not currentLanguage — see the comment above this
    // effect for why the session identity has to be what re-triggers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId]);

  useEffect(() => () => teardownAudio(), []);

  // Captions — independent of Audio, same translation_logs feed pattern as
  // FloatingTranslationButton.tsx's in-meeting captions.
  const sessionIdForCaptionMode = (mode: CaptionMode): string | null => {
    if (mode === 'off') return null;
    const session = mode === 'original' ? sessions[0] : sessions.find((s) => s.target_language === mode);
    return session?.id ?? null;
  };

  useEffect(() => {
    if (captionChannelRef.current) {
      supabase.removeChannel(captionChannelRef.current);
      captionChannelRef.current = null;
    }
    setCaptionLines([]);

    const sessionId = sessionIdForCaptionMode(captionMode);
    if (!sessionId) {
      if (captionMode !== 'off') setCaptionMode('off');
      return;
    }

    const field = captionMode === 'original' ? 'source_text' : 'translated_text';
    let cancelled = false;

    // Caption/audio sync (2026-08-19) — real report: translated captions
    // appeared well ahead of the translated audio (captions come straight off
    // this realtime feed the instant the bot writes a row; audio can't beat
    // its own translate+TTS pipeline plus the deliberate `delaySeconds`
    // alignment buffer). Original-language captions have nothing to sync
    // against but the ALREADY-real-time original audio, so those stay
    // immediate. For a translated language, hold each new caption line back
    // by roughly the same delay the audio is under, minus a small lead —
    // captions arriving a beat before their audio reads naturally (same
    // convention broadcast subtitles use), arriving well ahead of it doesn't.
    const isTranslated = captionMode !== 'original';
    const CAPTION_LEAD_SECONDS = 0.4;
    const captionDelayMs = isTranslated ? Math.max((delaySeconds - CAPTION_LEAD_SECONDS) * 1000, 0) : 0;
    const pendingTimers: ReturnType<typeof setTimeout>[] = [];

    supabase
      .from('translation_logs')
      .select('id, source_text, translated_text')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(2)
      .then(({ data }) => {
        if (cancelled || !data) return;
        // Catch-up view of recent history on first opening captions — these
        // already happened, so show them immediately regardless of mode.
        setCaptionLines([...data].reverse().map((row: any) => ({ id: row.id, text: row[field] })));
      });

    const channel = supabase
      .channel(`broadcast-captions-${sessionId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'translation_logs', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as { id: string; source_text: string; translated_text: string };
          const line = { id: row.id, text: field === 'source_text' ? row.source_text : row.translated_text };
          const apply = () => {
            if (cancelled) return;
            setCaptionLines((prev) => [...prev, line].slice(-2));
          };
          if (captionDelayMs > 0) pendingTimers.push(setTimeout(apply, captionDelayMs));
          else apply();
        })
      .subscribe();
    captionChannelRef.current = channel;

    return () => {
      cancelled = true;
      pendingTimers.forEach(clearTimeout);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captionMode, sessions, delaySeconds]);

  // Real bug found live (2026-08-19), the same one already fixed once for
  // the meeting picker: hiding this entirely when there's nothing running
  // yet makes a STATE ("no translation started") look exactly like a
  // PERMISSION ("this feature doesn't exist here") — confirmed live
  // against a real broadcast with is_hls_live=true but zero
  // translation_sessions rows for its room. Always render; say so instead.

  const row = 'w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-left transition-colors';
  const sel = (on: boolean) => (on ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-100');
  const placeholderText = captionMode === 'original' ? 'Waiting for speech…' : 'Waiting for translation…';

  return (
    <>
      {captionMode !== 'off' && (
        <div className="fixed bottom-40 sm:bottom-44 left-1/2 -translate-x-1/2 z-50 w-[94vw] sm:w-[85vw] md:w-[70vw] lg:max-w-3xl px-2">
          <div className="flex items-start gap-3 rounded-2xl bg-black/80 backdrop-blur-md text-white px-5 py-4 shadow-xl ring-1 ring-white/10">
            <div className="flex-1 min-w-0 space-y-1">
              {captionLines.length === 0 ? (
                <p className="text-base sm:text-lg text-center text-white/60 leading-relaxed">{placeholderText}</p>
              ) : (
                captionLines.map((line, i) => (
                  <p
                    key={line.id}
                    className={`text-center leading-relaxed ${
                      i === captionLines.length - 1 ? 'text-base sm:text-xl font-medium' : 'text-sm sm:text-base text-white/50'
                    }`}
                  >
                    {line.text}
                  </p>
                ))
              )}
            </div>
            <button type="button" onClick={() => setCaptionMode('off')} title="Turn off captions" className="shrink-0 text-white/60 hover:text-white mt-0.5">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Temporary diagnostic readout (2026-08-19) — see markTiming above.
          Shows exactly which stage the connection is at and how long it took
          to get there, so a "voice is delayed" report can be pinned to a
          specific stage instead of guessed at. Safe to remove once the
          15-20s report is resolved and confirmed fixed. */}
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

      <Popover>
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
          {sessions.length === 0 && (
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
            {sessions.map((s) => (
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
            <button type="button" onClick={() => setCaptionMode('original')} className={`${row} ${sel(captionMode === 'original')}`}>
              <Captions className="h-4 w-4" />
              <span className="flex-1">Original</span>
              {captionMode === 'original' && <Check className="h-3.5 w-3.5 text-indigo-600" />}
            </button>
            {sessions.map((s) => (
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

          <p className="text-[10px] text-gray-400 px-2.5 pt-1.5">
            Translated audio is deliberately delayed ~{delaySeconds}s to line up with the video.
          </p>
        </PopoverContent>
      </Popover>
    </>
  );
};

export default BroadcastTranslationButton;
