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

// Same per-error copy TranslationDisplayPage.tsx already has for these exact
// codes (translation-listener-token's documented error responses) — this
// component never had it (2026-09-23, captions pipeline review F-CAP-9
// follow-up: verifying the existing TRANSLATION_LISTENER_CAP mechanism
// surfaced that hitting it here just showed a generic "could not connect,"
// giving no indication the room was actually full vs. genuinely broken).
const AUDIO_ERROR_COPY: Record<string, string> = {
  not_found: 'This session is no longer available.',
  not_ready: "The translation hasn't started yet — try again in a moment.",
  ended: 'This session has ended.',
  at_capacity: "This session's listener limit is full right now — try again shortly.",
};

/** translation-listener-token's 200 response — same shape TranslationDisplayPage.tsx uses. */
interface ListenerToken {
  url: string;
  token: string;
  roomName: string;
  trackName: string;
  targetLanguage: string;
}

export interface TranslationListenerButtonProps {
  /** Unique id for this HLS surface — a channelId or webinarId. Used for the
   *  localStorage caption-mode key and Realtime channel naming. */
  scopeId: string;
  /** Distinguishes the caller in log lines and Realtime channel names, so two
   *  different scopeKinds can never collide on the same channel name even if
   *  a channelId and webinarId were ever equal (they're separate tables). */
  scopeKind: 'broadcast' | 'webinar';
  /** The LiveKit room the broadcast/webinar (and the bot) actually run in. */
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
  /** "Show Captions" dispatches a same-language captions-only session on
   *  demand when nothing is running yet — the RPC name and its single
   *  scope-id param differ between broadcast (start_captions_session /
   *  p_channel_id) and webinar (start_webinar_captions_session /
   *  p_webinar_id), migrations 0289 and 0358 respectively. */
  startCaptionsSession: {
    rpc: string;
    params: Record<string, string>;
  };
}

/**
 * Translation picker for HLS-viewing audiences (LiveChannelViewer's
 * watchViaHls / WebinarAttendeeViewer — the viewer isn't in the LiveKit room
 * at all), shared by BroadcastTranslationButton.tsx and
 * WebinarTranslationButton.tsx (2026-09-23, captions pipeline review Phase
 * 4 — those two files were a near-byte-identical duplicate pair, unlike
 * FloatingTranslationButton.tsx/TranslationDisplayPage.tsx which have
 * genuinely different connection-ownership and audio-playback models and
 * were deliberately left separate). Owns its OWN lightweight, subscribe-only
 * WebRTC connection: the same translation-listener-token flow
 * TranslationDisplayPage.tsx (/display) uses, with a delay buffer added
 * since this audio has to line up against several-second-delayed HLS video
 * instead of real-time WebRTC video. Every real-bug fix in this component's
 * history (audio sync, caption timing, gesture-linked AudioContext, etc.)
 * applies to both callers identically now that there's only one copy.
 */
export const TranslationListenerButton: React.FC<TranslationListenerButtonProps> = ({
  scopeId,
  scopeKind,
  roomName,
  delaySeconds,
  onActiveChange,
  startCaptionsSession,
}) => {
  const logTag = `TranslationListenerButton:${scopeKind}`;

  const [sessions, setSessions] = useState<AvailableSession[]>([]);
  const [currentLanguage, setCurrentLanguage] = useState<string | null>(null);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>('idle');
  const [audioError, setAudioError] = useState<string | null>(null);
  const [needsUnlock, setNeedsUnlock] = useState(false);

  // delaySeconds is measured live (LiveChannelViewer's/WebinarAttendeeViewer's
  // HlsPlayer onLatencyChange, ~1/sec) rather than a fixed constant — read
  // through a ref (not as an effect dependency) wherever it's needed
  // mid-flight, so a fresh measurement can be USED without being a reason to
  // tear anything down. Shared by both the caption-sync effect below and the
  // translated-audio DelayNode (playTrack) — same underlying value, two
  // consumers.
  const delaySecondsRef = useRef(delaySeconds);
  delaySecondsRef.current = delaySeconds;

  // Persisted per scope (2026-09-23, real gap flagged in a captions
  // pipeline review): every reload/reconnect lost the viewer's caption
  // choice — Meet/Zoom/YouTube all remember it.
  const CAPTION_MODE_STORAGE_KEY = `rk-caption-mode-${scopeId}`;
  const [captionMode, setCaptionModeState] = useState<CaptionMode>(() => {
    try { return (localStorage.getItem(CAPTION_MODE_STORAGE_KEY) as CaptionMode) || 'off'; } catch { return 'off'; }
  });
  const setCaptionMode = (mode: CaptionMode) => {
    setCaptionModeState(mode);
    try { localStorage.setItem(CAPTION_MODE_STORAGE_KEY, mode); } catch { /* private-browsing / quota — non-fatal */ }
  };
  const [captionLines, setCaptionLines] = useState<CaptionLine[]>([]);
  // Near-real-time interim text (2026-09-23, captions pipeline review Phase
  // 3, F-CAP-1) — mirrors FloatingTranslationButton.tsx's own interimText.
  // translation_sessions.interim_text now updates for every session
  // (same-language AND translated — see AudioPipeline.ts's own comment).
  const [interimText, setInterimText] = useState('');
  const captionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [captionsStarting, setCaptionsStarting] = useState(false);
  const [captionsError, setCaptionsError] = useState<string | null>(null);
  // Only auto-revert-to-off when the CURRENT mode previously had a real
  // session and it's now gone — not on the first tick right after a fresh
  // "Show Captions" click, before the just-dispatched session's row has
  // appeared yet. Keyed by mode so switching modes doesn't leak a stale flag.
  const hadSessionForModeRef = useRef<{ mode: CaptionMode; had: boolean }>({ mode: 'off', had: false });
  const captionOverlay = useDraggableOverlay({
    resetKey: captionMode === 'off' ? 'off' : 'on',
    baseTransform: 'translateX(-50%)',
  });

  // Deferred until the picker is actually opened (hasOpened) — a real
  // regression found live (2026-08-20): mounting this for every viewer the
  // instant they load the page burst a Realtime channel per idle viewer all
  // at once, degrading the host's own presence/live-status channel too. None
  // of this data is needed until someone opens the picker (the panel already
  // says "No live translation running yet" when sessions is empty).
  const [hasOpened, setHasOpened] = useState(false);

  // Timing instrumentation (2026-08-19) — pins down which stage of
  // token-fetch + WebRTC connect + subscribe is slow when a "translated
  // audio is delayed" report comes in, instead of guessing.
  const timingT0Ref = useRef(0);
  const [timingStatus, setTimingStatus] = useState<string | null>(null);
  const markTiming = (label: string) => {
    const elapsedMs = Date.now() - timingT0Ref.current;
    console.log(`[${logTag}] +${elapsedMs}ms: ${label}`);
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

  // Which languages the bot currently has running for this room — realtime,
  // deferred until `hasOpened` (see the comment above that state).
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
      .channel(`${scopeKind}-translation-sessions-${scopeId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'translation_sessions', filter: `livekit_room_name=eq.${roomName}` },
        load)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [scopeKind, scopeId, roomName, hasOpened]);

  // Bumped every time the selected language changes — every async callback
  // below (the resume() promise especially) checks this before touching
  // anything, so a callback that was already in flight when the user
  // switched languages can never act on stale state.
  const generationRef = useRef(0);

  // Silent token refresh (2026-09-23, captions pipeline review F-CAP-10):
  // translation-listener-token mints a 4h JWT. LiveKit doesn't revoke an
  // already-connected session when that TTL passes, but a reconnect
  // attempted AFTER expiry (a network blip, the SFU restarting the
  // connection, anything) reuses this same token and fails outright — a
  // listener who's had translated audio/captions on for 4+ continuous hours
  // would silently go dead with no error and no way back in short of
  // manually reselecting the language. Bumping this nonce a bit before the
  // token actually expires re-runs the connect effect below exactly as if
  // the underlying session had changed — the same teardown+reconnect path
  // already proven safe for that case — fetching a fresh token and rebuilding
  // the WebRTC/audio graph from scratch. Trade-off, explicit: a brief (sub-
  // second) audio/caption gap once every ~3h45m for anyone listening that
  // long continuously, in exchange for never going permanently silent.
  const [refreshNonce, setRefreshNonce] = useState(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const teardownAudio = () => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
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

  // The IDENTITY of the currently selected session, not just the language
  // STRING — real bug found live (2026-08-19), "cracking" audio with the
  // first few words repeated twice, from a session restart landing on the
  // same target language: keying on the session id forces a full
  // teardown+reconnect whenever the underlying session changes even if the
  // language string the user picked didn't.
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

      // Schedule the silent refresh (see refreshNonce's doc comment above)
      // from THIS token's actual mint time, not from when the surrounding
      // effect started — keeps the schedule accurate even though fetching
      // the token itself took some (small, variable) amount of time.
      const TOKEN_TTL_MS = 4 * 60 * 60 * 1000; // matches translation-listener-token's ttl: '4h'
      const REFRESH_MARGIN_MS = 15 * 60 * 1000; // refresh 15 min before actual expiry
      refreshTimerRef.current = setTimeout(() => {
        if (!stale()) setRefreshNonce((n) => n + 1);
      }, TOKEN_TTL_MS - REFRESH_MARGIN_MS);

      const room = new Room({ adaptiveStream: true });
      roomRef.current = room;

      const isBotTranslatedTrack = (pub: RemoteTrackPublication, participant: RemoteParticipant) =>
        participant.identity.startsWith('rlt-bot-') && pub.trackName === trackName;

      // One graph per generation, no matter how many times TrackSubscribed
      // fires — real bug found live (2026-08-20): two subscribe paths both
      // targeting the same publication could each call playTrack, building
      // two independent MediaStreamSource/DelayNode graphs off the same
      // track ("every speech is said twice").
      let audioWired = false;

      const playTrack = (track: RemoteTrack) => {
        if (stale() || audioWired) return;
        audioWired = true;
        markTiming(`translated track subscribed — wiring up audio (~${delaySeconds}s alignment delay still ahead)`);
        try {
          // Prefer the context primed synchronously in the click handler
          // (primeAudioContext) — already resumed there, while it still
          // counted as gesture-linked. Consume-and-clear so a later
          // selection can't accidentally reuse a stale primed context.
          const audioCtx = primedCtxRef.current ?? new AudioContext();
          primedCtxRef.current = null;
          audioCtxRef.current = audioCtx;
          const stillCurrent = () => !stale() && audioCtxRef.current === audioCtx;
          const source = audioCtx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));

          // Set once, from the live delaySecondsRef value at THIS moment,
          // and never touched again for the rest of the session — a
          // continuously re-targeted DelayNode audibly warps pitch/skips
          // content (real bug found live, twice, 2026-08-22 — see prior
          // component history). Trade-off, explicit: on a very long
          // broadcast where real latency keeps climbing after connecting,
          // translated audio can drift a little stale.
          const delayNode = audioCtx.createDelay(Math.max(delaySecondsRef.current + 5, 15));
          delayNode.delayTime.value = delaySecondsRef.current;
          source.connect(delayNode);
          delayNode.connect(audioCtx.destination);

          setAudioStatus('live');
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
          // Some browsers leave resume() pending indefinitely instead of
          // ever resolving or rejecting (real bug found live, 2026-08-19) —
          // don't trust the promise alone: check the context's actual state
          // directly, twice, and force the unlock affordance if it's still
          // not 'running' by then.
          [800, 2500].forEach((delayMs) => {
            setTimeout(() => {
              if (stillCurrent() && audioCtx.state !== 'running') setNeedsUnlock(true);
            }, delayMs);
          });
        } catch (err) {
          console.error(`[${logTag}] Web Audio setup failed:`, err);
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
          console.error(`[${logTag}] LiveKit connect failed:`, err);
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
    // refreshNonce is the silent-refresh mechanism above — bumping it
    // deliberately re-runs this same effect to reconnect with a fresh token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId, refreshNonce]);

  useEffect(() => () => teardownAudio(), []);

  // Captions — independent of Audio, same translation_logs feed pattern as
  // FloatingTranslationButton.tsx's in-meeting captions.
  const sessionIdForCaptionMode = (mode: CaptionMode): string | null => {
    if (mode === 'off') return null;
    const session = mode === 'original' ? sessions[0] : sessions.find((s) => s.target_language === mode);
    return session?.id ?? null;
  };

  // "Show Captions" — turns captions on immediately (optimistic — the
  // overlay appears right away in a loading state) and, only if no
  // session/row exists yet for this room at all, dispatches a same-language
  // one via the anon-safe start-captions RPC the caller supplies. Once that
  // session's row appears (via the existing translation_sessions realtime
  // subscription above), sessionIdForCaptionMode resolves it exactly like
  // any other session — zero changes needed to the caption-rendering path.
  const startCaptions = async () => {
    setCaptionsError(null);
    setCaptionMode('original');
    if (sessions.length > 0) return; // some session already running — reuse it
    setCaptionsStarting(true);
    try {
      const { error } = await supabase.rpc(startCaptionsSession.rpc, startCaptionsSession.params);
      if (error) throw error;
    } catch (err: any) {
      console.error(`[${logTag}] could not start captions:`, err);
      setCaptionsError(err.message || 'Could not start captions');
      setCaptionMode('off');
    } finally {
      setCaptionsStarting(false);
    }
  };

  // Real bug found live (2026-08-22), right after delaySeconds became a
  // live-measured value instead of a fixed constant: this effect used to
  // have delaySeconds in its dependency array, so it tore the whole
  // subscription down and rebuilt it on EVERY latency sample — a permanent
  // flicker. Fixed by reading delaySeconds through the shared ref above
  // instead: fresh values are still used for each NEW line's hold-back
  // timer, without that being a reason to rebuild the subscription itself.
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

    // Caption/audio-video sync (2026-08-19, corrected 2026-08-22, refined
    // 2026-09-23 for F-CAP-2) — hold each new caption line back by roughly
    // the same lag its reference (dub audio or HLS video) is under, minus a
    // small lead so captions read a beat ahead of audio rather than well
    // ahead. Computed FRESH per line (not once per effect run) from the ref
    // above, so a live latency update changes how long the NEXT line waits
    // without tearing down anything already on screen.
    //
    // F-CAP-2 fix: the video-latency hold-back alone assumes the caption
    // TEXT had ~zero latency relative to when the words were spoken — true
    // for Original mode (Deepgram's near-instant STT), false for a real
    // translation (the bot's translate+TTS relay measurably takes real
    // time — see AudioPipeline.ts). pipeline_latency_ms (migration 0370) is
    // the bot's own MEASURED elapsed time for that specific utterance
    // (Deepgram UtteranceEnd -> about to write the row), not a guessed
    // constant, so subtracting it here corrects the hold-back per line
    // instead of assuming a fixed amount. Null/undefined (older rows, or an
    // engine that doesn't measure it) falls back to 0 — today's behavior,
    // no regression.
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
        // Catch-up view of recent history on first opening captions — these
        // already happened, so show them immediately regardless of mode.
        setCaptionLines([...data].reverse().map((row: any) => ({ id: row.id, text: row[field] })));
      });

    const channel = supabase
      .channel(`${scopeKind}-captions-${sessionId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'translation_logs', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as { id: string; source_text: string; translated_text: string; pipeline_latency_ms: number | null };
          const line = { id: row.id, text: field === 'source_text' ? row.source_text : row.translated_text };
          const apply = () => {
            if (cancelled) return;
            setCaptionLines((prev) => [...prev, line].slice(-2));
            setInterimText(''); // a final line supersedes whatever was growing
          };
          const pipelineLatencyMs = row.pipeline_latency_ms ?? 0;
          const captionDelayMs = Math.max(
            delaySecondsRef.current * 1000 - pipelineLatencyMs - CAPTION_LEAD_SECONDS * 1000,
            0,
          );
          if (captionDelayMs > 0) pendingTimers.push(setTimeout(apply, captionDelayMs));
          else apply();
        })
      // F-CAP-1 (2026-09-23, captions pipeline review Phase 3): the bot now
      // publishes the growing, not-yet-finalized line for EVERY session,
      // not just same-language ones — see AudioPipeline.ts. No caption-
      // sync delay applied here (unlike final lines above): an interim
      // preview is explicitly labeled "still being heard" in the render
      // below, so showing it as soon as it arrives (rather than holding it
      // back to line up with delayed audio) is correct — it's a live
      // status indicator, not a line being presented as in-sync dialogue.
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

  // Real bug found live (2026-08-19): hiding this entirely when there's
  // nothing running yet makes a STATE ("no translation started") look
  // exactly like a PERMISSION ("this feature doesn't exist here"). Always
  // render; say so instead.

  const row = 'w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-left transition-colors';
  const sel = (on: boolean) => (on ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-100');
  const placeholderText = captionsStarting
    ? 'Starting captions…'
    : captionMode === 'original' ? 'Waiting for speech…' : 'Waiting for translation…';
  // A same-language ("Show Captions") session shouldn't show up as its own
  // confusing duplicate row in Audio/per-language Captions — captioning your
  // own language back at yourself isn't a real choice, it's exactly what
  // "Show Captions" already is. Real translations are always source!=target.
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
                captions pipeline review): announces each final caption line
                to screen readers. interimText (below) is deliberately kept
                out of this region (aria-hidden) — it updates on nearly
                every Deepgram chunk while someone's talking, and including
                it would spam a screen reader with per-keystroke-like
                announcements instead of one per settled sentence. */}
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
                      it can't be mistaken for the real translated line
                      (this IS the source language, not a translation).
                      'original' mode keeps the unlabeled, full-weight
                      treatment — it already IS the thing being captioned. */}
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
              {AUDIO_ERROR_COPY[audioError ?? ''] ?? 'Could not connect — try again.'}
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
              onClick={startCaptions}
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

export default TranslationListenerButton;
