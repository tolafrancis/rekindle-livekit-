import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';

interface MuxVodPlayerProps {
  src: string;        // Mux HLS .m3u8 for a recorded asset (VOD)
  poster?: string;    // Mux thumbnail (https://image.mux.com/<id>/thumbnail.jpg)
  className?: string;
}

/**
 * Plays a Mux VOD recording with standard transport controls (scrub, pause,
 * seek). Unlike HlsPlayer — which pins to the live edge and ends on ENDLIST —
 * this is for finished recordings, so it lets the viewer move through the
 * timeline freely. Safari/iOS play HLS natively; everywhere else uses hls.js.
 */
export const MuxVodPlayer: React.FC<MuxVodPlayerProps> = ({ src, poster, className }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    let hls: Hls | null = null;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src; // native HLS (Safari / iOS)
    } else if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(src);
      hls.attachMedia(video);
    } else {
      video.src = src; // last-resort fallback
    }

    return () => { if (hls) { try { hls.destroy(); } catch { /* noop */ } } };
  }, [src]);

  return (
    <video
      ref={videoRef}
      poster={poster}
      controls
      playsInline
      className={className}
    />
  );
};

export default MuxVodPlayer;
