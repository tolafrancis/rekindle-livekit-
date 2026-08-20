import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Loader2, PhoneOff, Volume2, VolumeX } from 'lucide-react';

interface HlsPlayerProps {
  src: string;
  muted?: boolean;
  className?: string;
  poster?: string;
  onEnded?: () => void;
  /** How many SECONDS behind the true live edge to sit. Lower = less latency
   *  but more sensitive to network jitter; higher = smoother but more delay.
   *  Time-based so it behaves the same whatever segment length the origin
   *  serves. Default 6 — enough forward-buffer headroom that the 1.1x catch-up
   *  can't overshoot into the edge and starve (that starvation was causing
   *  periodic mid-playback recoveries when sitting ~4s back). */
  targetLatencySeconds?: number;
  /** Show a small on-screen readout of edge-lag + recovery count for testing.
   *  Also auto-enabled by adding `?hlsdebug=1` (or `#hlsdebug`) to the URL. */
  debug?: boolean;
}

/**
 * Plays a LIVE HLS (.m3u8) stream — engine-agnostic (Mux, or LiveKit Egress HLS
 * output §6A/§6D; Egress serves ~4s segments, so the default 6s target latency
 * gives ~1.5 segments of headroom). hls.js manages live sync itself — it starts
 * ~`targetLatencySeconds` behind the edge and gently speeds playback (≤1.1x) to
 * correct drift, WITHOUT hard-seeking. (Earlier versions force-seeked to the
 * bleeding edge on start and on a timer; that seeks into not-yet-buffered data →
 * a stall → a visible "reconnect" a few seconds after joining, settling only once
 * the DVR window matured. We no longer do that.) When the broadcast finalizes
 * (ENDLIST) it shows an "ended" state; brief startup errors recover in place.
 */
export const HlsPlayer: React.FC<HlsPlayerProps> = ({ src, muted = false, className, poster, onEnded, targetLatencySeconds = 6, debug = false }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'loading' | 'playing' | 'waiting' | 'ended' | 'error'>('loading');
  // Real bug found live (2026-08-15), reproduced on BOTH mobile and desktop
  // Chrome, not just Safari: both play() calls below used to `.catch(() =>
  // {})`, silently swallowing the rejection. Autoplay-with-sound requires a
  // *trusted, low-latency* user gesture — but the actual play() call here
  // only fires after hls.js fetches and parses the manifest over the
  // network, which is enough async delay for browsers to no longer count it
  // as gesture-linked and block it outright. No error ever surfaced: the UI
  // showed "Listening" (this component mounted, `listening` flipped true)
  // with total silence and no way to tell why. Fixed by surfacing the
  // rejection and offering a real retry — a tap on THIS overlay calls
  // play() directly inside its own click handler, which browsers always
  // treat as gesture-linked regardless of how the player got here.
  const [needsUnlock, setNeedsUnlock] = useState(false);

  // Real gap found live (2026-08-19), measured with a real timed test: a
  // fresh broadcast's Egress job can take up to ~30s to produce its FIRST
  // segment (compositor worker cold start, well before any segment-duration
  // math even applies) — but the loading overlay just said "Connecting to
  // live stream…" the whole time, indistinguishable from something being
  // stuck. Track elapsed loading time and graduate the message so a long
  // wait reads as "this is normal, hang on" instead of "this is broken".
  // Self-adapts for a mid-broadcast joiner too — segments already exist for
  // them, so they clear 'loading' before ever seeing the later messages.
  const [loadingElapsedSec, setLoadingElapsedSec] = useState(0);

  const showDebug = debug || (typeof window !== 'undefined' && /hlsdebug/.test(window.location.search + window.location.hash));
  const [debugInfo, setDebugInfo] = useState<{ lag: number | null; recoveries: number }>({ lag: null, recoveries: 0 });
  const recoveriesRef = useRef(0);

  // Hold onEnded in a ref so an unstable callback identity doesn't re-run the
  // player effect (which would tear down + rebuild hls on every parent render).
  const onEndedRef = useRef(onEnded);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);

  // Ticks once a second for as long as we're in the initial 'loading' state
  // — resets fresh each time we (re-)enter it. Drives the graduated message
  // below; irrelevant once playing, ended, or mid-stream reconnecting
  // ('waiting' has its own fixed message regardless of duration).
  useEffect(() => {
    if (status !== 'loading') return;
    setLoadingElapsedSec(0);
    const interval = setInterval(() => setLoadingElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setNeedsUnlock(false); // fresh src (or first mount) — no stale unlock prompt from a previous stream
    let hls: Hls | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let endGuard: ReturnType<typeof setTimeout> | null = null;
    let recoverTimer: ReturnType<typeof setTimeout> | null = null;
    let debugTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    let wasLive = false;
    // Tracks whether we've EVER reached clean playback — a plain closure var
    // (like wasLive above), not React state, since the watchdog interval below
    // needs the current value and this effect only runs once per `src` change.
    let hasPlayedOnce = false;

    const clearEndGuard = () => { if (endGuard) { clearTimeout(endGuard); endGuard = null; } };
    const clearRecover = () => { if (recoverTimer) { clearTimeout(recoverTimer); recoverTimer = null; } };

    // Real gap found live (2026-08-20): a fatal NETWORK_ERROR/MEDIA_ERROR
    // recovers IN PLACE below (hls.startLoad() / hls.recoverMediaError()),
    // which is right for a one-off blip — but if the underlying condition
    // keeps failing (a flaky segment fetch, a bad CDN edge for that one
    // viewer's connection), there was NO cap: it just kept retrying in
    // place forever, "waiting" the whole time, with no escalation to a
    // full rebuild. Confirmed against a real report on a single CONTINUOUS
    // broadcast (host never restarted) whose Egress output was verified
    // gap-free for its entire duration — so the stall was purely client-
    // side recovery, not a real content gap. Two consequences of never
    // escalating: "reconnecting" can drag on far longer than it should,
    // and because in-place recovery resumes from wherever hls.js's
    // internal position got stuck rather than resetting it, the viewer
    // can land tens of seconds behind live once it finally does recover —
    // a fresh setup() below re-syncs near the live edge instead. Mirrors
    // the escalation the ENDLIST path (endGuard) already had; this is the
    // same idea for the fatal-error path, which had none.
    let recoveryEscalateTimer: ReturnType<typeof setTimeout> | null = null;
    const clearRecoveryEscalate = () => { if (recoveryEscalateTimer) { clearTimeout(recoveryEscalateTimer); recoveryEscalateTimer = null; } };
    const armRecoveryEscalate = () => {
      if (recoveryEscalateTimer || cancelled) return;
      recoveryEscalateTimer = setTimeout(() => {
        recoveryEscalateTimer = null;
        if (cancelled) return;
        console.warn('[HlsPlayer] in-place recovery did not resolve within 8s — forcing a full rebuild to re-sync near the live edge');
        if (hls) { try { hls.destroy(); } catch { /* noop */ } hls = null; }
        setup();
      }, 8000);
    };

    // Playback resumed cleanly — cancel any pending "reconnecting" overlay.
    const markPlaying = () => { hasPlayedOnce = true; clearRecover(); clearRecoveryEscalate(); clearEndGuard(); setStatus('playing'); };

    // Real report, screenshotted live (2026-08-20): playback ran fine with
    // sound for a couple of seconds, froze, and came back demanding a FRESH
    // "tap to enable sound" — even though sound had already been granted and
    // was actively playing moments before. Every automatic recovery path
    // below (tentativeEnd, the fatal-error fallback) used to call video.play()
    // straight from an async retry with a bare .catch(() => setNeedsUnlock(true)),
    // and an async retry is never gesture-linked, so a browser can legally
    // block it — even on an origin that already has real media engagement.
    // Once we've genuinely played before (hasPlayedOnce), that block is far
    // more likely a transient hiccup than an actual missing gesture — don't
    // punish the viewer for it on the first failure. Retry silently a couple
    // times first; only surface the unlock prompt if it's still failing.
    const attemptPlay = () => {
      video.play().then(() => setNeedsUnlock(false)).catch(() => {
        if (!hasPlayedOnce || cancelled) { setNeedsUnlock(true); return; }
        let attempt = 0;
        const retry = () => {
          if (cancelled) return;
          attempt += 1;
          video.play().then(() => setNeedsUnlock(false)).catch(() => {
            if (attempt >= 3) setNeedsUnlock(true);
            else setTimeout(retry, 400 * attempt);
          });
        };
        setTimeout(retry, 400);
      });
    };

    // A transient error is recovering IN PLACE. Don't flash the overlay for a
    // sub-second blip — only show "reconnecting" if it hasn't resumed shortly.
    // The next successful frame calls markPlaying() and cancels this.
    const markRecovering = () => {
      if (recoverTimer || cancelled) return;
      recoveriesRef.current += 1; // count distinct recovery episodes for the debug readout
      recoverTimer = setTimeout(() => { recoverTimer = null; setStatus('waiting'); }, 2500);
    };

    // A single "ended"/finalized signal soon after going live is usually a
    // transient hiccup (the source track briefly unpublishing/republishing,
    // an origin write hiccup — anything that can make Egress momentarily
    // finalize its current playlist), not a real end. Reload and give it a
    // grace window; if live playback resumes, the success paths cancel this.
    // Only after the window passes with no recovery do we actually declare
    // the stream ended.
    //
    // 2026-08-20: briefly tried recovering the existing Hls instance in
    // place here (stopLoad/startLoad) instead of a full destroy+rebuild, to
    // avoid re-triggering the MANIFEST_PARSED -> video.play() handshake
    // (which can demand a second "tap to enable sound"). Reverted the same
    // day: a real side-by-side comparison (an old build without ANY of
    // today's reconnect changes vs. the current one, same host, same
    // network) showed the old destroy+rebuild behavior playing perfectly —
    // zero breaks — while the newer in-place recovery attempt correlated
    // with the reported breaks/latency. attemptPlay() below already covers
    // the "don't demand a second tap" case on its own, so the full rebuild
    // doesn't need the in-place workaround to get that benefit too.
    const tentativeEnd = () => {
      if (endGuard) return; // already in a grace window
      markRecovering();
      if (hls) { try { hls.destroy(); } catch { /* noop */ } hls = null; }
      retryTimer = setTimeout(setup, 1500);
      endGuard = setTimeout(() => { endGuard = null; setStatus('ended'); onEndedRef.current?.(); }, 10000);
    };

    const setup = () => {
      if (cancelled) return;

      // Native HLS (Safari, iOS) — already sits near the live edge for live streams
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
        attemptPlay();
        video.onplaying = () => { wasLive = true; setNeedsUnlock(false); markPlaying(); };
        video.onended = () => { tentativeEnd(); };
        video.onerror = () => { markRecovering(); retryTimer = setTimeout(setup, 2000); };
        return;
      }

      if (Hls.isSupported()) {
        // Where to START, in seconds behind the edge. hls.js holds this position
        // and corrects drift by playback rate, not by seeking.
        const target = Math.min(Math.max(targetLatencySeconds, 2), 10);
        const maxLatency = Math.max(target + 8, 12);
        hls = new Hls({
          // lowLatencyMode intentionally OFF: Mux isn't serving usable LL-HLS
          // parts here (we measure ~10s), so it bought no latency and only made
          // hls.js chase the bleeding edge — the source of the startup stalls.
          lowLatencyMode: false,
          enableWorker: true,
          liveDurationInfinity: true,
          // Sit ~`target`s behind the edge, time-based so it's segment-agnostic.
          liveSyncDuration: target,
          // Only let hls.js re-seek if we fall WELL behind — a generous ceiling so
          // ordinary jitter is absorbed by the 1.1x catch-up, not a jarring seek.
          liveMaxLatencyDuration: maxLatency,
          maxLiveSyncPlaybackRate: 1.1,
          backBufferLength: 10,
          // While the audience waits for the host to go live, Mux returns 412
          // (stream not active) until RTMP starts. Poll STEADILY (linear, ~1.5s
          // apart) instead of exponential backoff, so we latch within ~1.5s of
          // the first segment appearing rather than sitting in a growing backoff
          // (1s→2s→4s→8s…) that stretched first-connect to ~18–20s. Many retries
          // so we keep polling for a host who's slow to start, without giving up.
          manifestLoadPolicy: {
            default: {
              maxTimeToFirstByteMs: 10000,
              maxLoadTimeMs: 20000,
              timeoutRetry: { maxNumRetry: 4, retryDelayMs: 1000, maxRetryDelayMs: 2000 },
              errorRetry: { maxNumRetry: 40, retryDelayMs: 1500, maxRetryDelayMs: 2000, backoff: 'linear' },
            },
          },
          playlistLoadPolicy: {
            default: {
              maxTimeToFirstByteMs: 10000,
              maxLoadTimeMs: 20000,
              timeoutRetry: { maxNumRetry: 4, retryDelayMs: 1000, maxRetryDelayMs: 2000 },
              errorRetry: { maxNumRetry: 40, retryDelayMs: 1500, maxRetryDelayMs: 2000, backoff: 'linear' },
            },
          },
          // Segments: a few quick retries to ride out transient 404s at the edge.
          fragLoadPolicy: {
            default: {
              maxTimeToFirstByteMs: 10000,
              maxLoadTimeMs: 30000,
              timeoutRetry: { maxNumRetry: 4, retryDelayMs: 1000, maxRetryDelayMs: 2000 },
              errorRetry: { maxNumRetry: 6, retryDelayMs: 1000, maxRetryDelayMs: 2000, backoff: 'linear' },
            },
          },
        });
        hls.loadSource(src);
        hls.attachMedia(video);

        // A resync watchdog (independently forcing a hard `currentTime` seek
        // when measured latency crossed a threshold) lived here from
        // 2026-08-19 to 2026-08-20 — added for a real "stuck behind forever"
        // report, then tuned back and forth across several live tests
        // (tighter -> better latency but visible stutters; looser/disabled
        // -> smooth but latency drifted upward) without ever landing on a
        // setting that avoided both complaints. Removed entirely after a
        // decisive side-by-side comparison: an old build with NONE of this
        // watchdog code, tested against the same host over the same
        // network, played with zero breaks in real time, while every build
        // that included some version of the watchdog kept reproducing
        // breaks/latency in one shape or another. hls.js's own built-in
        // mechanisms (liveMaxLatencyDuration + maxLiveSyncPlaybackRate,
        // still configured above) are left to manage live-sync on their
        // own, same as that old, working build did.
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          attemptPlay();
        });
        // Any successfully rendered frame means we're live and stable.
        video.onplaying = () => { wasLive = true; setNeedsUnlock(false); markPlaying(); };

        hls.on(Hls.Events.LEVEL_LOADED, (_event, data: any) => {
          const details = data?.details;
          if (!details) return;
          if (details.live) {
            wasLive = true;
            markPlaying();
          } else if (wasLive) {
            // Playlist finalized (ENDLIST). At startup this can be a brief blip
            // while Daily's RTMP settles, so recover within a grace window rather
            // than ending immediately. A genuine end stays finalized.
            tentativeEnd();
          }
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          // Logged unconditionally (2026-08-20) — a fatal error used to be
          // handled completely silently, so a "why is it stuck" report had
          // nothing to go on beyond the on-screen status. data.details is
          // hls.js's specific error code (e.g. fragLoadTimeOut,
          // levelLoadError) — that's the actual thing to look at next time.
          console.warn('[HlsPlayer] fatal hls.js error:', data.type, data.details, data);
          // A fatal error is NOT proof the broadcast ended — at startup the live
          // playlist has only a few segments, so transient stalls / 404s are
          // normal. Recover IN PLACE (no teardown, no overlay flash) first, but
          // cap how long we'll keep retrying in place before escalating to a
          // full rebuild (armRecoveryEscalate — see its comment above) so a
          // persistently-failing connection doesn't stay wedged indefinitely.
          // The only authoritative "ended" signal is ENDLIST, handled in
          // LEVEL_LOADED.
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            markRecovering();
            armRecoveryEscalate();
            try { hls?.startLoad(); return; } catch { /* fall through to reload */ }
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            markRecovering();
            armRecoveryEscalate();
            try { hls?.recoverMediaError(); return; } catch { /* fall through to reload */ }
          }
          markRecovering();
          clearRecoveryEscalate();
          if (hls) { hls.destroy(); hls = null; }
          retryTimer = setTimeout(setup, 2000);
        });
      } else {
        setStatus('error');
      }
    };

    setup();

    // Debug readout: sample the player's lag behind the HLS live edge ~1/sec.
    // NOTE: this is EDGE lag only (player → HLS edge). True glass-to-glass adds
    // the Daily→Mux encode/push pipeline on top, which the client can't see.
    if (showDebug) {
      debugTimer = setInterval(() => {
        let lag: number | null = null;
        const h = hls as any;
        if (h && isFinite(h.latency) && h.latency > 0) {
          lag = h.latency;
        } else if (video.buffered.length) {
          // Fallback: distance from playhead to the end of the buffered range.
          lag = video.buffered.end(video.buffered.length - 1) - video.currentTime;
        }
        setDebugInfo({ lag, recoveries: recoveriesRef.current });
      }, 1000);
    }

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (endGuard) clearTimeout(endGuard);
      if (recoverTimer) clearTimeout(recoverTimer);
      if (recoveryEscalateTimer) clearTimeout(recoveryEscalateTimer);
      if (debugTimer) clearInterval(debugTimer);
      if (hls) hls.destroy();
    };
  }, [src, showDebug]);

  // Real report (2026-08-19): translated audio selected but original audio
  // kept playing alongside it — "double voices". The prop plumbing here
  // (LiveChannelViewer passes `muted={isMuted || translationActive}`) reads
  // correctly on paper, so rather than guess again: track and SHOW the
  // actual DOM .muted state (ground truth, not the prop we asked for) so a
  // live report can confirm or rule out a prop/DOM desync directly.
  const [actualMuted, setActualMuted] = useState(muted);
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = muted;
      console.log(`[HlsPlayer] muted prop changed to ${muted}, applied to video element`);
    }
    setActualMuted(muted);
  }, [muted]);
  // Poll the REAL DOM property too, independent of the prop — catches any
  // case where something else (browser autoplay policy, another effect,
  // manual DOM manipulation) silently overrides what we just set.
  useEffect(() => {
    const interval = setInterval(() => {
      if (videoRef.current) setActualMuted(videoRef.current.muted);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`relative w-full h-full ${className || ''}`}>
      <video
        ref={videoRef}
        className="w-full h-full object-contain bg-black"
        playsInline
        autoPlay
        muted={muted}
        poster={poster}
      />
      {showDebug && (
        <div className="absolute top-1 left-1 z-10 rounded bg-black/70 px-2 py-1 font-mono text-[10px] leading-tight text-green-400">
          <div>edge lag: {debugInfo.lag != null ? `${debugInfo.lag.toFixed(1)}s` : '—'}</div>
          <div>recoveries: {debugInfo.recoveries}</div>
          <div>status: {status}</div>
          <div>muted (prop): {String(muted)}</div>
          <div>muted (actual DOM): {String(actualMuted)}</div>
        </div>
      )}
      {/* Always-on ground-truth mute badge — not gated behind ?hlsdebug=1.
          Reflects the video element's REAL .muted property (polled), not just
          the prop we asked for, so a "double voices" report can be checked
          against actual state at a glance instead of only trusting the code. */}
      <div className="absolute top-2 right-2 z-10 rounded-full bg-black/60 p-1.5">
        {actualMuted ? <VolumeX className="h-3.5 w-3.5 text-white/70" /> : <Volume2 className="h-3.5 w-3.5 text-white" />}
      </div>
      {needsUnlock && (
        // Takes priority over the status overlay below — the stream itself
        // may be perfectly healthy (loaded, buffered, ready), just blocked
        // from making sound until a gesture browsers actually trust unlocks
        // it. This button's own onClick IS that trusted gesture: play()
        // called directly inside it, with zero async gap, always counts.
        <button
          type="button"
          onClick={() => videoRef.current?.play().then(() => setNeedsUnlock(false)).catch(() => {})}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white bg-black/60 hover:bg-black/70 transition-colors"
        >
          <Volume2 className="h-8 w-8" />
          <p className="text-sm font-medium">Tap to enable sound</p>
        </button>
      )}
      {!needsUnlock && status !== 'playing' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300 bg-black/40 px-6 text-center">
          {status === 'ended' ? (
            <>
              <PhoneOff className="h-8 w-8 mb-2 text-gray-400" />
              <p className="text-sm font-medium">The broadcast has ended</p>
            </>
          ) : status === 'error' ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin mb-2 text-purple-400" />
              <p className="text-sm">Playback not supported on this device</p>
            </>
          ) : status === 'waiting' ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin mb-2 text-purple-400" />
              <p className="text-sm">Reconnecting…</p>
            </>
          ) : (
            <>
              <Loader2 className="h-8 w-8 animate-spin mb-2 text-purple-400" />
              <p className="text-sm">
                {loadingElapsedSec < 6
                  ? 'Connecting to live stream…'
                  : loadingElapsedSec < 15
                  ? 'Starting the stream…'
                  : 'Still starting…'}
              </p>
              {/* A fresh broadcast's Egress can take up to ~30s to produce
                  its first segment (compositor cold start, confirmed with a
                  real timed test) — say so past the point where silence
                  starts reading as "stuck" rather than "working". */}
              {loadingElapsedSec >= 15 && (
                <p className="text-xs text-gray-400 mt-1 max-w-[220px]">
                  A brand-new broadcast can take up to 30 seconds to begin — hang tight.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default HlsPlayer;
