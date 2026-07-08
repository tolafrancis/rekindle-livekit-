import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Loader2, PhoneOff } from 'lucide-react';

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
 * Plays a LIVE HLS (.m3u8) stream. hls.js manages live sync itself — it starts
 * ~`targetLatencySeconds` behind the edge and gently speeds playback (≤1.1x) to
 * correct drift, WITHOUT hard-seeking. (Earlier versions force-seeked to the
 * bleeding edge on start and on a timer; on Mux that seeks into not-yet-buffered
 * data → a stall → a visible "reconnect" a few seconds after joining, settling
 * only after the DVR window matured. We no longer do that.) When the broadcast
 * finalizes (ENDLIST) it shows an "ended" state; brief startup errors recover in
 * place without flashing the overlay.
 */
export const HlsPlayer: React.FC<HlsPlayerProps> = ({ src, muted = false, className, poster, onEnded, targetLatencySeconds = 6, debug = false }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'loading' | 'playing' | 'waiting' | 'ended' | 'error'>('loading');

  const showDebug = debug || (typeof window !== 'undefined' && /hlsdebug/.test(window.location.search + window.location.hash));
  const [debugInfo, setDebugInfo] = useState<{ lag: number | null; recoveries: number }>({ lag: null, recoveries: 0 });
  const recoveriesRef = useRef(0);

  // Hold onEnded in a ref so an unstable callback identity doesn't re-run the
  // player effect (which would tear down + rebuild hls on every parent render).
  const onEndedRef = useRef(onEnded);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let hls: Hls | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let endGuard: ReturnType<typeof setTimeout> | null = null;
    let recoverTimer: ReturnType<typeof setTimeout> | null = null;
    let debugTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    let wasLive = false;

    const clearEndGuard = () => { if (endGuard) { clearTimeout(endGuard); endGuard = null; } };
    const clearRecover = () => { if (recoverTimer) { clearTimeout(recoverTimer); recoverTimer = null; } };

    // Playback resumed cleanly — cancel any pending "reconnecting" overlay.
    const markPlaying = () => { clearRecover(); clearEndGuard(); setStatus('playing'); };

    // A transient error is recovering IN PLACE. Don't flash the overlay for a
    // sub-second blip — only show "reconnecting" if it hasn't resumed shortly.
    // The next successful frame calls markPlaying() and cancels this.
    const markRecovering = () => {
      if (recoverTimer || cancelled) return;
      recoveriesRef.current += 1; // count distinct recovery episodes for the debug readout
      recoverTimer = setTimeout(() => { recoverTimer = null; setStatus('waiting'); }, 2500);
    };

    // A single "ended"/finalized signal soon after going live is usually Daily's
    // RTMP reconnecting at startup, not a real end. Reload and give it a grace
    // window; if live playback resumes, the success paths cancel this. Only after
    // the window passes with no recovery do we actually declare the stream ended.
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
        video.play().catch(() => {});
        video.onplaying = () => { wasLive = true; markPlaying(); };
        video.onended = () => { tentativeEnd(); };
        video.onerror = () => { markRecovering(); retryTimer = setTimeout(setup, 2000); };
        return;
      }

      if (Hls.isSupported()) {
        // Where to START, in seconds behind the edge. hls.js holds this position
        // and corrects drift by playback rate, not by seeking.
        const target = Math.min(Math.max(targetLatencySeconds, 2), 10);
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
          liveMaxLatencyDuration: Math.max(target + 8, 12),
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

        hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); });
        // Any successfully rendered frame means we're live and stable.
        video.onplaying = () => { wasLive = true; markPlaying(); };

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
      if (hls) hls.destroy();
    };
  }, [src, showDebug]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

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
        </div>
      )}
      {status !== 'playing' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300 bg-black/40">
          {status === 'ended' ? (
            <>
              <PhoneOff className="h-8 w-8 mb-2 text-gray-400" />
              <p className="text-sm font-medium">The broadcast has ended</p>
            </>
          ) : (
            <>
              <Loader2 className="h-8 w-8 animate-spin mb-2 text-purple-400" />
              <p className="text-sm">
                {status === 'error' ? 'Playback not supported on this device' : 'Connecting to live stream…'}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default HlsPlayer;
