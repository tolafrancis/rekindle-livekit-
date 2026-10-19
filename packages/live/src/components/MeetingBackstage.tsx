import React, { useEffect, useRef, useState } from 'react';
import {
  createLocalVideoTrack, createLocalAudioTrack, createLocalTracks, Track,
  type LocalVideoTrack, type LocalAudioTrack,
} from 'livekit-client';
import { BackgroundBlur, VirtualBackground } from '@livekit/track-processors';
import { Button } from '@rekindle/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { Mic, MicOff, Video, VideoOff, Sparkles, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { VirtualBackgroundButton } from './VirtualBackgroundButton';

/** Result of asking for one device. Camera and mic are requested separately,
 *  so a camera denial (or no camera at all) never blocks the mic, and vice
 *  versa. */
type DeviceStatus = 'pending' | 'ok' | 'blocked' | 'missing' | 'error';

function deviceStatusFromError(err: any): DeviceStatus {
  const name = String(err?.name || '');
  const msg = String(err?.message || '').toLowerCase();
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError'
    || msg.includes('permission') || msg.includes('not allowed') || msg.includes('denied')) return 'blocked';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError'
    || msg.includes('not found') || msg.includes('requested device')) return 'missing';
  return 'error';
}

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

  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [camStatus, setCamStatus] = useState<DeviceStatus>('pending');
  const [micStatus, setMicStatus] = useState<DeviceStatus>('pending');
  // Bumped by Retry to run the device check again (e.g. after the person
  // allows the camera/mic in the browser's site settings).
  const [attempt, setAttempt] = useState(0);
  const camOk = camStatus === 'ok';
  const micOk = micStatus === 'ok';
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
      // One loop only, and it stops once stopLevelMeter has replaced or
      // cleared it. It used to start two loops (rAF plus a direct tick())
      // and cancel only one, so a meter kept running for the whole meeting
      // and every mic switch added another.
      const meter = { ctx, raf: 0 };
      const tick = () => {
        if (levelMeterRef.current !== meter) return;
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
        if (levelBarRef.current) levelBarRef.current.style.width = `${Math.min(100, (avg / 128) * 100)}%`;
        meter.raf = requestAnimationFrame(tick);
      };
      levelMeterRef.current = meter;
      meter.raf = requestAnimationFrame(tick);
    } catch {
      // Level meter is a nicety — a failure here shouldn't block backstage.
    }
  };

  // Create the preview tracks on mount (and again on Retry). Both are asked
  // for together first (one browser prompt); if that fails, camera and mic
  // are retried separately so one denial or missing device doesn't stop the
  // other from working. Device labels only populate after a getUserMedia
  // grant, so enumerate AFTER requesting them.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setCamStatus('pending');
    setMicStatus('pending');
    (async () => {
      try {
        let videoTrack: LocalVideoTrack | null = null;
        let audioTrack: LocalAudioTrack | null = null;
        // Ask for both together first, so the browser shows one prompt…
        try {
          const tracks = await createLocalTracks({ audio: true, video: true });
          for (const tr of tracks) {
            if (tr.kind === Track.Kind.Video) videoTrack = tr as LocalVideoTrack;
            else if (tr.kind === Track.Kind.Audio) audioTrack = tr as LocalAudioTrack;
          }
        } catch {
          // …and if that fails, one at a time, so a missing or blocked camera
          // still leaves a working mic (and the other way round).
        }
        if (cancelled) { videoTrack?.stop(); audioTrack?.stop(); return; }
        if (!videoTrack) {
          try {
            videoTrack = await createLocalVideoTrack({});
          } catch (err) {
            if (!cancelled) setCamStatus(deviceStatusFromError(err));
          }
        }
        if (cancelled) { videoTrack?.stop(); audioTrack?.stop(); return; }
        if (!audioTrack) {
          try {
            audioTrack = await createLocalAudioTrack({});
          } catch (err) {
            if (!cancelled) setMicStatus(deviceStatusFromError(err));
          }
        }
        if (cancelled) { videoTrack?.stop(); audioTrack?.stop(); return; }

        if (videoTrack) {
          videoTrackRef.current = videoTrack;
          if (videoRef.current) videoTrack.attach(videoRef.current);
          if (!cameraOn) await videoTrack.mute();
          if (background !== 'none') {
            setApplyingBackground(true);
            await applyBackground(videoTrack, background).catch(() => {}).finally(() => setApplyingBackground(false));
          }
          setCamStatus('ok');
        }
        if (audioTrack) {
          audioTrackRef.current = audioTrack;
          if (!micOn) await audioTrack.mute();
          startLevelMeter(audioTrack);
          setMicStatus('ok');
        }

        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
        if (cancelled) return;
        setCameras(devices.filter((d) => d.kind === 'videoinput'));
        setMics(devices.filter((d) => d.kind === 'audioinput'));
        if (videoTrack) setCameraDeviceId(videoTrack.mediaStreamTrack.getSettings().deviceId);
        if (audioTrack) setMicDeviceId(audioTrack.mediaStreamTrack.getSettings().deviceId);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      videoTrackRef.current?.stop();
      audioTrackRef.current?.stop();
      videoTrackRef.current = null;
      audioTrackRef.current = null;
      stopLevelMeter();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

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
    // A device that couldn't be opened here joins switched off (the screen
    // says so) rather than failing again inside the call.
    onReady({
      micEnabled: micOn && micOk,
      cameraEnabled: cameraOn && camOk,
      cameraBackground: background,
      cameraDeviceId: camOk ? cameraDeviceId : undefined,
      micDeviceId: micOk ? micDeviceId : undefined,
    });
  };

  const backgroundTrigger = (
    <button
      type="button"
      disabled={loading || !camOk}
      className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
        background !== 'none' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'
      } disabled:opacity-50`}
      title={t('meetingBackstage', 'background', 'Background')}
      aria-label={t('meetingBackstage', 'background', 'Background')}
    >
      {applyingBackground ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
    </button>
  );

  return (
    // The meeting is mounted inside ActiveCallHost's fixed, overflow-hidden
    // 100dvh frame, so the page's own scrollbar can't reach anything below the
    // fold. This screen scrolls itself (h-full + overflow-y-auto, capped at
    // 100dvh in case the parent height doesn't resolve), and m-auto centers the
    // card without pushing its top or the Join button out of reach on short
    // windows. z-[60] keeps the call's floating buttons (z-50) from sitting on
    // top of it before the person has joined.
    <div className="relative z-[60] flex h-full max-h-[100dvh] min-h-0 w-full flex-col overflow-y-auto bg-gray-950 p-4">
      <div className="m-auto w-full max-w-xl rounded-2xl bg-gray-900 p-6 shadow-2xl">
        <h2 className="text-center text-xl font-semibold text-white">{t('meetingBackstage', 'title', 'Check your camera and mic')}</h2>
        <p className="mt-1 text-center text-sm text-gray-400">{t('meetingBackstage', 'onlyYou', 'Only you can see this')} — {userName}</p>

        <div className="relative mt-5 aspect-video max-h-[40dvh] w-full overflow-hidden rounded-xl bg-black">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center" role="status" aria-label={t('meetingBackstage', 'checking', 'Checking your camera and mic…')}>
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          )}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} autoPlay playsInline muted className={`h-full w-full object-cover ${cameraOn && camOk ? '' : 'hidden'}`} />
          {!loading && (!camOk || !cameraOn) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <VideoOff className="h-10 w-10 text-gray-500" />
              {!camOk && (
                <p className="text-sm text-gray-300">{t('meetingBackstage', 'joinCameraOff', "You'll join with camera off")}</p>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          {micOk || loading ? <Mic className="h-4 w-4 shrink-0 text-gray-400" /> : <MicOff className="h-4 w-4 shrink-0 text-red-400" />}
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-800">
            <div ref={levelBarRef} className="h-full rounded-full bg-green-500 transition-[width] duration-75" style={{ width: '0%' }} />
          </div>
        </div>

        {/* What went wrong, per device, and how to fix it. */}
        {!loading && (!camOk || !micOk) && (
          <div role="alert" className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div className="space-y-1">
                {!camOk && (
                  <p>
                    {camStatus === 'blocked'
                      ? t('meetingBackstage', 'cameraBlocked', 'Camera access is blocked.')
                      : camStatus === 'missing'
                        ? t('meetingBackstage', 'cameraMissing', 'No camera was found.')
                        : t('meetingBackstage', 'cameraError', "Your camera couldn't be started — another app may be using it.")}
                    {' '}{t('meetingBackstage', 'joinCameraOff', "You'll join with camera off")}.
                  </p>
                )}
                {!micOk && (
                  <p>
                    {micStatus === 'blocked'
                      ? t('meetingBackstage', 'micBlocked', 'Microphone access is blocked.')
                      : micStatus === 'missing'
                        ? t('meetingBackstage', 'micMissing', 'No microphone was found.')
                        : t('meetingBackstage', 'micError', "Your microphone couldn't be started — another app may be using it.")}
                    {' '}{t('meetingBackstage', 'joinMicOff', "You'll join muted")}.
                  </p>
                )}
                {(camStatus === 'blocked' || micStatus === 'blocked') && (
                  <p className="text-amber-200/90">
                    {t('meetingBackstage', 'unblockHelp', 'To allow it, tap the lock or camera icon in your browser’s address bar, set Camera and Microphone to Allow, then tap Retry. On iPhone or iPad, open Settings → Safari (or your browser) → Camera / Microphone.')}
                  </p>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAttempt((n) => n + 1)}
              className="mt-3 min-h-11 w-full border-amber-500/40 bg-transparent text-amber-100 hover:bg-amber-500/20 hover:text-white"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('meetingBackstage', 'retry', 'Retry')}
            </Button>
          </div>
        )}

        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={toggleMic}
            disabled={loading || !micOk}
            aria-label={micOn && micOk ? t('meetingBackstage', 'turnMicOff', 'Turn microphone off') : t('meetingBackstage', 'turnMicOn', 'Turn microphone on')}
            className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${
              micOn && micOk ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            {micOn && micOk ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={toggleCamera}
            disabled={loading || !camOk}
            aria-label={cameraOn && camOk ? t('meetingBackstage', 'turnCameraOff', 'Turn camera off') : t('meetingBackstage', 'turnCameraOn', 'Turn camera on')}
            className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${
              cameraOn && camOk ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            {cameraOn && camOk ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </button>
          <VirtualBackgroundButton value={background} onChange={handleBackgroundChange} trigger={backgroundTrigger} />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select value={cameraDeviceId} onValueChange={switchCamera} disabled={loading || !camOk || cameras.length === 0}>
            <SelectTrigger aria-label={t('meetingBackstage', 'camera', 'Camera')} className="min-h-11 bg-gray-800 text-white border-gray-700"><SelectValue placeholder={t('meetingBackstage', 'camera', 'Camera')} /></SelectTrigger>
            <SelectContent>
              {cameras.map((d) => <SelectItem key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={micDeviceId} onValueChange={switchMic} disabled={loading || !micOk || mics.length === 0}>
            <SelectTrigger aria-label={t('meetingBackstage', 'microphone', 'Microphone')} className="min-h-11 bg-gray-800 text-white border-gray-700"><SelectValue placeholder={t('meetingBackstage', 'microphone', 'Microphone')} /></SelectTrigger>
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
          {t('meetingBackstage', 'joinNow', 'Join now')}
        </Button>
      </div>
    </div>
  );
};

export default MeetingBackstage;
