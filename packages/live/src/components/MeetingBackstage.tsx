import React, { useEffect, useRef, useState } from 'react';
import {
  createLocalVideoTrack, createLocalAudioTrack,
  type LocalVideoTrack, type LocalAudioTrack,
} from 'livekit-client';
import { BackgroundBlur, VirtualBackground } from '@livekit/track-processors';
import { Button } from '@rekindle/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { Mic, MicOff, Video, VideoOff, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { VirtualBackgroundButton } from './VirtualBackgroundButton';

export interface BackstageReadyState {
  micEnabled: boolean;
  cameraEnabled: boolean;
  /** 'none' | 'blur' | <image URL> — same shape LiveKitRoomWrapper's
   *  setCameraBackground already takes, so the real call can just apply it
   *  once the camera track publishes. */
  cameraBackground: string;
  cameraDeviceId?: string;
  micDeviceId?: string;
}

interface MeetingBackstageProps {
  userName: string;
  onReady: (state: BackstageReadyState) => void;
}

/** Applies the same processor LiveKitRoomWrapper.applyCameraBackground()
 *  uses on the real published track, but directly to a standalone preview
 *  track — no room connection needed, `track.setProcessor()` works on any
 *  livekit-client LocalVideoTrack regardless of whether it's published. */
async function applyBackground(track: LocalVideoTrack, mode: string) {
  if (mode === 'none') { await track.stopProcessor(); return; }
  if (mode === 'blur') { await track.setProcessor(BackgroundBlur(15)); return; }
  await track.setProcessor(VirtualBackground(mode));
}

/**
 * Private pre-join "backstage" (2026-09-29): a local-only camera/mic check
 * with a LIVE virtual-background preview, before anyone else in the room can
 * see or hear this person. Nothing here touches the real call — it creates
 * its own standalone livekit-client tracks (createLocalVideoTrack /
 * createLocalAudioTrack), previews them in a plain <video>, and stops them
 * again on "Join"; the chosen mic/camera/background/device selections are
 * handed to the real join flow via onReady so they carry over without
 * re-selecting anything.
 */
export const MeetingBackstage: React.FC<MeetingBackstageProps> = ({ userName, onReady }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoTrackRef = useRef<LocalVideoTrack | null>(null);
  const audioTrackRef = useRef<LocalAudioTrack | null>(null);
  const levelMeterRef = useRef<{ ctx: AudioContext; raf: number } | null>(null);
  const levelBarRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cameraDeviceId, setCameraDeviceId] = useState<string | undefined>(undefined);
  const [micDeviceId, setMicDeviceId] = useState<string | undefined>(undefined);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [background, setBackground] = useState('none');
  const [applyingBackground, setApplyingBackground] = useState(false);
  const [joining, setJoining] = useState(false);

  const stopLevelMeter = () => {
    if (levelMeterRef.current) {
      cancelAnimationFrame(levelMeterRef.current.raf);
      levelMeterRef.current.ctx.close().catch(() => {});
      levelMeterRef.current = null;
    }
  };

  const startLevelMeter = (track: LocalAudioTrack) => {
    stopLevelMeter();
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
        if (levelBarRef.current) levelBarRef.current.style.width = `${Math.min(100, (avg / 128) * 100)}%`;
        levelMeterRef.current = { ctx, raf: requestAnimationFrame(tick) };
      };
      levelMeterRef.current = { ctx, raf: requestAnimationFrame(tick) };
      tick();
    } catch {
      // Level meter is a nicety — a failure here shouldn't block backstage.
    }
  };

  // Create the preview tracks once on mount. Device labels only populate
  // after a getUserMedia grant, so enumerate AFTER creating the first pair.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [videoTrack, audioTrack] = await Promise.all([
          createLocalVideoTrack({}),
          createLocalAudioTrack({}),
        ]);
        if (cancelled) { videoTrack.stop(); audioTrack.stop(); return; }
        videoTrackRef.current = videoTrack;
        audioTrackRef.current = audioTrack;
        if (videoRef.current) videoTrack.attach(videoRef.current);
        startLevelMeter(audioTrack);

        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setCameras(devices.filter((d) => d.kind === 'videoinput'));
        setMics(devices.filter((d) => d.kind === 'audioinput'));
        setCameraDeviceId(videoTrack.mediaStreamTrack.getSettings().deviceId);
        setMicDeviceId(audioTrack.mediaStreamTrack.getSettings().deviceId);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Couldn't access your camera or microphone. Check your browser's permissions and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      videoTrackRef.current?.stop();
      audioTrackRef.current?.stop();
      stopLevelMeter();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchCamera = async (deviceId: string) => {
    setCameraDeviceId(deviceId);
    const old = videoTrackRef.current;
    try {
      const next = await createLocalVideoTrack({ deviceId });
      videoTrackRef.current = next;
      if (videoRef.current) next.attach(videoRef.current);
      if (!cameraOn) await next.mute();
      if (background !== 'none') { setApplyingBackground(true); await applyBackground(next, background).finally(() => setApplyingBackground(false)); }
    } finally {
      old?.stop();
    }
  };

  const switchMic = async (deviceId: string) => {
    setMicDeviceId(deviceId);
    const old = audioTrackRef.current;
    try {
      const next = await createLocalAudioTrack({ deviceId });
      audioTrackRef.current = next;
      if (!micOn) await next.mute();
      startLevelMeter(next);
    } finally {
      old?.stop();
    }
  };

  const toggleMic = async () => {
    const next = !micOn;
    setMicOn(next);
    if (audioTrackRef.current) await (next ? audioTrackRef.current.unmute() : audioTrackRef.current.mute());
  };

  const toggleCamera = async () => {
    const next = !cameraOn;
    setCameraOn(next);
    if (videoTrackRef.current) await (next ? videoTrackRef.current.unmute() : videoTrackRef.current.mute());
  };

  const handleBackgroundChange = async (mode: string) => {
    setBackground(mode);
    if (!videoTrackRef.current) return;
    setApplyingBackground(true);
    try {
      await applyBackground(videoTrackRef.current, mode);
    } finally {
      setApplyingBackground(false);
    }
  };

  const handleJoin = () => {
    setJoining(true);
    videoTrackRef.current?.stop();
    audioTrackRef.current?.stop();
    stopLevelMeter();
    onReady({ micEnabled: micOn, cameraEnabled: cameraOn, cameraBackground: background, cameraDeviceId, micDeviceId });
  };

  const backgroundTrigger = (
    <button
      type="button"
      disabled={loading || !!error}
      className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
        background !== 'none' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'
      } disabled:opacity-50`}
      title="Background"
    >
      {applyingBackground ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
    </button>
  );

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-gray-900 p-6 shadow-2xl">
        <h2 className="text-center text-xl font-semibold text-white">Check your camera and mic</h2>
        <p className="mt-1 text-center text-sm text-gray-400">Only you can see this — {userName}</p>

        <div className="relative mt-5 aspect-video w-full overflow-hidden rounded-xl bg-black">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <p className="text-sm text-gray-300">{error}</p>
            </div>
          )}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} autoPlay playsInline muted className={`h-full w-full object-cover ${cameraOn && !error ? '' : 'hidden'}`} />
          {!cameraOn && !loading && !error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <VideoOff className="h-10 w-10 text-gray-500" />
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Mic className="h-4 w-4 shrink-0 text-gray-400" />
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-800">
            <div ref={levelBarRef} className="h-full rounded-full bg-green-500 transition-[width] duration-75" style={{ width: '0%' }} />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={toggleMic}
            disabled={loading || !!error}
            className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${
              micOn ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={toggleCamera}
            disabled={loading || !!error}
            className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${
              cameraOn ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            {cameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </button>
          <VirtualBackgroundButton value={background} onChange={handleBackgroundChange} trigger={backgroundTrigger} />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select value={cameraDeviceId} onValueChange={switchCamera} disabled={loading || !!error || cameras.length === 0}>
            <SelectTrigger className="bg-gray-800 text-white border-gray-700"><SelectValue placeholder="Camera" /></SelectTrigger>
            <SelectContent>
              {cameras.map((d) => <SelectItem key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={micDeviceId} onValueChange={switchMic} disabled={loading || !!error || mics.length === 0}>
            <SelectTrigger className="bg-gray-800 text-white border-gray-700"><SelectValue placeholder="Microphone" /></SelectTrigger>
            <SelectContent>
              {mics.map((d) => <SelectItem key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleJoin}
          disabled={joining}
          className="mt-6 w-full bg-purple-600 py-6 text-base hover:bg-purple-700"
        >
          {joining ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
          Join now
        </Button>
      </div>
    </div>
  );
};

export default MeetingBackstage;
