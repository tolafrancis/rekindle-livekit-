import React, { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { X, Maximize, Share2, Gauge, Copy, Check } from 'lucide-react';
import { supabase } from '@rekindle/supabase';
import { useAuth } from '@rekindle/features/AuthContext';
import { MeetingReactionsLayer, ReactionButton } from './MeetingReactions';
import { useMeetingReactions } from '../useMeetingReactions';

interface VideoMessagePlayerProps {
  videoId: string;
  ministryId: string;
  title: string;
  speakerName?: string | null;
  playbackUrl: string;
  captionsUrl?: string | null;
  shareUrl: string;
  onClose: () => void;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// Progress is saved periodically (not on every timeupdate tick) to avoid
// hammering the DB — same throttling idea as the live-channel replay tracker.
const PROGRESS_SAVE_INTERVAL_MS = 5000;
const COMPLETION_THRESHOLD = 90;

/**
 * Plays a Pastor's Video Message (HLS, produced by the transcode worker).
 * Mirrors MuxVodPlayer's engine (hls.js / native HLS) but adds the fuller
 * media-platform experience the spec calls for: fullscreen, speed control,
 * captions, resume-from-last-position, reactions, and share — plus watch-time/
 * completion tracking against ministry_video_message_views, the same shape as
 * useChannelAnalytics's trackReplayView/updateReplayProgress for live channels.
 */
export const VideoMessagePlayer: React.FC<VideoMessagePlayerProps> = ({
  videoId,
  ministryId,
  title,
  speakerName,
  playbackUrl,
  captionsUrl,
  shareUrl,
  onClose,
}) => {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string>(`vm_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const lastSavedAtRef = useRef<number>(0);
  const resumeAppliedRef = useRef(false);

  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [copied, setCopied] = useState(false);
  const { floating, sendReaction } = useMeetingReactions(`video:${videoId}`, true);

  // Resume from where the viewer left off, and set up HLS/native playback.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playbackUrl) return;
    let hls: Hls | null = null;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playbackUrl;
    } else if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(playbackUrl);
      hls.attachMedia(video);
    } else {
      video.src = playbackUrl;
    }

    return () => { if (hls) { try { hls.destroy(); } catch { /* noop */ } } };
  }, [playbackUrl]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('ministry_video_message_views')
          .select('last_position_seconds, completion_percentage')
          .eq('video_id', videoId)
          .eq('user_id', user?.id ?? '')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data && data.completion_percentage < COMPLETION_THRESHOLD && data.last_position_seconds > 5) {
          const video = videoRef.current;
          const applyResume = () => {
            if (video && !resumeAppliedRef.current) {
              video.currentTime = data.last_position_seconds;
              resumeAppliedRef.current = true;
            }
          };
          video?.addEventListener('loadedmetadata', applyResume, { once: true });
        }
      } catch (err) {
        console.error('Error checking resume position:', err);
      }
    })();
  }, [videoId, user?.id]);

  // Start a view row on play (mirrors trackReplayView).
  const handlePlay = useCallback(async () => {
    if (viewIdRef.current) return;
    try {
      const { data, error } = await supabase
        .from('ministry_video_message_views')
        .insert({
          video_id: videoId,
          ministry_id: ministryId,
          user_id: user?.id,
          session_id: sessionIdRef.current,
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (error) throw error;
      viewIdRef.current = data.id;
    } catch (err) {
      console.error('Error starting video view tracking:', err);
    }
  }, [videoId, ministryId, user?.id]);

  // Periodically persist progress (mirrors updateReplayProgress).
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || !viewIdRef.current) return;
    const now = Date.now();
    if (now - lastSavedAtRef.current < PROGRESS_SAVE_INTERVAL_MS) return;
    lastSavedAtRef.current = now;

    const duration = video.duration || 0;
    const completion = duration > 0 ? Math.min(100, (video.currentTime / duration) * 100) : 0;
    supabase
      .from('ministry_video_message_views')
      .update({
        watch_duration_seconds: Math.round(video.currentTime),
        completion_percentage: Number(completion.toFixed(2)),
        last_position_seconds: Math.round(video.currentTime),
        ended_at: completion >= COMPLETION_THRESHOLD ? new Date().toISOString() : null,
      })
      .eq('id', viewIdRef.current)
      .then(({ error }) => { if (error) console.error('Error updating video view progress:', error); });
  }, []);

  const handleEnded = useCallback(() => {
    if (!viewIdRef.current) return;
    supabase
      .from('ministry_video_message_views')
      .update({ completion_percentage: 100, ended_at: new Date().toISOString() })
      .eq('id', viewIdRef.current)
      .then(({ error }) => { if (error) console.error('Error finalizing video view:', error); });
  }, []);

  const handleReact = useCallback(async (emoji: string) => {
    sendReaction(emoji);
    if (!user?.id) return;
    try {
      await supabase
        .from('ministry_video_message_reactions')
        .upsert({ video_id: videoId, ministry_id: ministryId, user_id: user.id, emoji }, { onConflict: 'video_id,user_id' });
    } catch (err) {
      console.error('Error saving reaction:', err);
    }
  }, [videoId, ministryId, user?.id, sendReaction]);

  const handleSpeedChange = (speed: number) => {
    setPlaybackRate(speed);
    if (videoRef.current) videoRef.current.playbackRate = speed;
    setShowSpeedMenu(false);
  };

  const handleFullscreen = () => {
    containerRef.current?.requestFullscreen?.().catch(() => {});
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url: shareUrl });
        return;
      } catch {
        // fall through to clipboard on cancel/error
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Error copying share link:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-2 sm:p-6">
      <div ref={containerRef} className="relative w-full max-w-4xl bg-black rounded-lg overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 h-9 w-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="relative aspect-video">
          <video
            ref={videoRef}
            controls
            autoPlay
            playsInline
            className="w-full h-full"
            onPlay={handlePlay}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            crossOrigin="anonymous"
          >
            {captionsUrl && <track kind="captions" src={captionsUrl} srcLang="en" label="English" default />}
          </video>
          <MeetingReactionsLayer reactions={floating} />
        </div>

        <div className="flex items-center justify-between gap-2 p-3 bg-gray-900 text-white flex-wrap">
          <div className="min-w-0">
            <h3 className="font-semibold truncate">{title}</h3>
            {speakerName && <p className="text-xs text-gray-400">{speakerName}</p>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <ReactionButton onReact={handleReact} />

            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu((v) => !v)}
                className="h-9 px-2 rounded-full hover:bg-white/10 flex items-center gap-1 text-sm"
                title="Playback speed"
              >
                <Gauge className="h-4 w-4" /> {playbackRate}x
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-gray-800 rounded-lg shadow-lg py-1 min-w-[80px]">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSpeedChange(s)}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 ${s === playbackRate ? 'text-purple-400' : ''}`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={handleShare} className="h-9 w-9 rounded-full hover:bg-white/10 flex items-center justify-center" title="Share">
              {copied ? <Check className="h-4 w-4 text-green-400" /> : <Share2 className="h-4 w-4" />}
            </button>

            <button onClick={handleFullscreen} className="h-9 w-9 rounded-full hover:bg-white/10 flex items-center justify-center" title="Fullscreen">
              <Maximize className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoMessagePlayer;
