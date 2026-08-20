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
    let resyncTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    let wasLive = false;
    // Tracks whether we've EVER reached clean playback — a plain closure var
    // (like wasLive above), not React state, since the watchdog interval below
    // needs the current value and this effect only runs once per `src` change.
    let hasPlayedOnce = false;

    const clearEndGuard = () => { if (endGuard) { clearTimeout(endGuard); endGuard = null; } };
    const clearRecover = () => { if (recoverTimer) { clearTimeout(recoverTimer); recoverTimer = null; } };

    // Playback resumed cleanly — cancel any pending "reconnecting" overlay.
    const markPlaying = () => { hasPlayedOnce = true; clearRecover(); clearEndGuard(); setStatus('playing'); };

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
    // Real report, screenshotted live (2026-08-20): this used to ALWAYS
    // hls.destroy() + rebuild a brand-new Hls instance via setup() — which
    // re-fires MANIFEST_PARSED and, with it, a fresh video.play() call. That
    // call is never gesture-linked (it's an async retry, not a click), so a
    // browser can legally block it — surfacing a SECOND "tap to enable
    // sound" moments after the first one already succeeded and audio was
    // playing fine. Recover the EXISTING Hls instance in place
    // (stopLoad/startLoad, same idea as the NETWORK_ERROR handler already
    // uses below) whenever one exists — it resumes the same video element's
    // playback without ever re-running that handshake. Only fall back to a
    // full rebuild when there's no hls instance to resume (the native
    // Safari branch, which never creates one).
    const tentativeEnd = () => {
      if (endGuard) return; // already in a grace window
      markRecovering();
      let recoveredInPlace = false;
      if (hls) {
        try { hls.stopLoad(); hls.startLoad(); recoveredInPlace = true; } catch { /* fall through to full rebuild below */ }
      }
      if (!recoveredInPlace) {
        if (hls) { try { hls.destroy(); } catch { /* noop */ } hls = null; }
        retryTimer = setTimeout(setup, 1500);
      }
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
        // Shared with the resync watchdog below, so both agree on the same ceiling.
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
          // Briefly bumped to 1.15 (2026-08-20) while chasing the freeze-vs-
          // latency trade below, then reverted back to 1.1 the same day — once
          // watchdogCeiling was restored to target+6 (the configuration
          // actually confirmed working, "for audio the latency is better"),
          // this was the one remaining difference from that known-good state.
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

        // Resync watchdog (2026-08-19) — real bug reported live: playback started
        // near real-time, then a mid-stream stall (buffer underrun, backgrounded
        // tab, brief network jitter — anything that isn't a `fatal` hls.js error)
        // left the player sitting tens of seconds behind the live edge, and it
        // STAYED there. liveMaxLatencyDuration is supposed to make hls.js hard-seek
        // back toward the target once latency crosses that ceiling, but that
        // correction lives inside hls.js's internal stream/buffer controllers and
        // only evaluates against ongoing segment-loading — a genuinely STALLED
        // video (nothing fires MEDIA_ERROR/NETWORK_ERROR, so none of our existing
        // handlers see it) can fall outside that loop entirely. Once behind, the
        // only passive recovery is the ≤1.1x catch-up rate — closing a 20s gap at
        // 0.1x extra speed takes ~200s, which reads as "just stuck at 25s".
        // Independently watch measured latency and force a seek back to the
        // intended live-sync position if it's been over the ceiling for a few
        // consecutive samples (not one — a single spike can be a normal transient
        // the passive mechanisms are already handling; we only step in when they
        // provably haven't).
        //
        // Real report (2026-08-20): a stream that resettled at ~14s after a
        // hiccup never triggered this at all — it was using the SAME ceiling
        // (maxLatency, 14s for a 6s target) hls.js's own internal mechanism
        // uses, deliberately generous so ordinary jitter isn't over-corrected.
        // But "at the ceiling" and "over the ceiling" are different things —
        // a stream sitting exactly at hls.js's own threshold sails right past
        // our `> maxLatency` check forever. Our OWN threshold doesn't need to
        // be as generous as hls.js's — a few seconds over the intended TARGET
        // is already worth actively correcting, not just worth tolerating.
        //
        // Real report, same day, on an actual production broadcast (real
        // network jitter, not our clean test channel): tightening this to
        // target+4 fixed the latency (confirmed — "audio latency is
        // better"), but the forced seek this triggers is a real, visible
        // stutter — status never left 'playing' and never showed
        // 'waiting' (this ISN'T a stall/reconnect), yet "recoveries: 4"
        // in the debug readout proved the watchdog itself fired 4 times,
        // each one a hard `currentTime` jump. Loosening to target+6
        // (still same day) wasn't enough either — same report shape
        // (status stayed 'playing', recoveries kept climbing) even AFTER
        // that loosening AND after widening the target latency itself
        // (more buffer before drift becomes a problem, per a live-edge-
        // race theory that didn't hold up: it still fired).
        //
        // Pushed all the way to a near-inactive floor (30s+) the same day,
        // reasoning the complaint was purely about the freeze — but that
        // went too far the other way: with correction effectively
        // disabled, latency climbed back to ~20s (explicitly reported as
        // worse than the ~8-12s this middle-ground threshold had been
        // producing). The freeze-vs-latency trade doesn't have a setting
        // that eliminates both — passive catch-up alone (maxLiveSyncPlaybackRate,
        // still 1.15) isn't strong enough to hold the line on a real,
        // jittery connection. Restored to the middle ground that was
        // actually measured to work reasonably (occasional corrections,
        // but latency back in the range that was asked for) rather than
        // the untested extremes on either side.
        const watchdogCeiling = target + 6;
        // setup() can re-run without the effect's own cleanup firing (tentativeEnd's
        // retryTimer, or the fatal-error reload path both call setup() directly) —
        // clear any interval from a previous run first so they don't pile up.
        if (resyncTimer) clearInterval(resyncTimer);
        let overCeilingStreak = 0;
        resyncTimer = setInterval(() => {
          if (cancelled || !hls) return;
          // Guard added after a live report that this made things WORSE — the
          // most likely cause is hls.latency reading a bogus/inflated value
          // during the initial cold-start window (before the live edge and our
          // starting position have both stabilized), which isn't a real "stuck
          // behind" stall at all. Only ever act once we've reached clean
          // playback at least once, so the watchdog can't fire during startup.
          if (!hasPlayedOnce) { overCeilingStreak = 0; return; }
          const h = hls as any;
          const lag = isFinite(h.latency) && h.latency > 0 ? h.latency : null;
          if (lag == null) { overCeilingStreak = 0; return; }
          if (lag <= watchdogCeiling) { overCeilingStreak = 0; return; }
          overCeilingStreak += 1;
          if (overCeilingStreak < 5) return; // ~10s sustained, not ordinary jitter
          overCeilingStreak = 0;
          const syncPos = isFinite(h.liveSyncPosition) ? h.liveSyncPosition : null;
          if (syncPos == null || syncPos <= video.currentTime) return;
          // Only seek somewhere already buffered — landing in an unbuffered gap
          // would itself cause a fresh stall, defeating the point of this fix.
          let landsInBuffer = false;
          for (let i = 0; i < video.buffered.length; i++) {
            if (syncPos >= video.buffered.start(i) && syncPos <= video.buffered.end(i)) { landsInBuffer = true; break; }
          }
          if (!landsInBuffer) return;
          console.warn(`[HlsPlayer] resync watchdog: ${lag.toFixed(1)}s behind edge (watchdog ceiling ${watchdogCeiling}s) — seeking back to live sync position`);
          markRecovering();
          try { video.currentTime = syncPos; } catch { /* noop */ }
        }, 2000);

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
          // A fatal error is NOT proof the broadcast ended — at startup the live
          // playlist has only a few segments, so transient stalls / 404s are
          // normal. Recover IN PLACE (no teardown, no overlay flash) and only do
          // a full reload if in-place recovery isn't possible. The only
          // authoritative "ended" signal is ENDLIST, handled in LEVEL_LOADED.
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            markRecovering();
            try { hls?.startLoad(); return; } catch { /* fall through to reload */ }
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            markRecovering();
            try { hls?.recoverMediaError(); return; } catch { /* fall through to reload */ }
          }
          markRecovering();
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
      if (debugTimer) clearInterval(debugTimer);
      if (resyncTimer) clearInterval(resyncTimer);
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
