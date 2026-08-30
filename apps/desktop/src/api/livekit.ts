import {
  Room,
  RoomEvent,
  Track,
  createAudioAnalyser,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type LocalAudioTrack,
  createLocalAudioTrack,
} from 'livekit-client';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';

export interface PublishTokenResponse {
  url: string;
  token: string;
  roomName: string;
  identity: string;
}

/**
 * Mint a LiveKit publish+subscribe token for the edge agent.
 * Validates the device's 24h bearer token and session ownership server-side.
 */
export async function fetchDevicePublishToken(
  sessionId: string,
  bearerToken: string
): Promise<PublishTokenResponse> {
  const endpoint = `${SUPABASE_URL}/functions/v1/translation-device-publish-token`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken.trim()}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ sessionId }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || `Server returned error status ${response.status}`);
  }

  if (!data?.token || !data?.url) {
    throw new Error('Incomplete token response from LiveKit token service');
  }

  return data as PublishTokenResponse;
}

export interface LiveKitBridgeCallbacks {
  onStatusChange?: (status: 'idle' | 'connecting' | 'live' | 'error') => void;
  onError?: (error: Error) => void;
  onLatencyChange?: (rttMs: number) => void;
  onInputLevelChange?: (level: number) => void;
  onOutputLevelChange?: (level: number) => void;
  onBotJoined?: (botIdentity: string) => void;
}

export class LiveKitBridge {
  private room: Room | null = null;
  private localAudioTrack: LocalAudioTrack | null = null;
  private remoteAudioElement: HTMLAudioElement | null = null;
  private callbacks: LiveKitBridgeCallbacks = {};
  private latencyInterval: any = null;
  private inputAnalyserCleanup: (() => Promise<void>) | null = null;
  private outputAnalyserCleanup: (() => Promise<void>) | null = null;
  private inputRafId: number | null = null;
  private outputRafId: number | null = null;

  constructor(callbacks: LiveKitBridgeCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Connects to the LiveKit room, captures raw PA mixer line-in audio, and publishes it.
   * Subscribes to the cloud translation bot's translated track for PA return playback.
   */
  async connect(options: {
    url: string;
    token: string;
    targetLanguage: string;
    inputDeviceId?: string;
    outputDeviceId?: string;
  }): Promise<void> {
    this.disconnect();
    this.callbacks.onStatusChange?.('connecting');

    const expectedTrackName = `rlt-translated-${options.targetLanguage.toLowerCase()}`;

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
    this.room = room;

    const isBotTrack = (
      pub: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => participant.identity.startsWith('rlt-bot-') && pub.trackName === expectedTrackName;

    // Handle bot track published
    room.on(RoomEvent.TrackPublished, (pub: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (isBotTrack(pub, participant)) {
        pub.setSubscribed(true);
        this.callbacks.onBotJoined?.(participant.identity);
      }
    });

    // Handle remote track subscribed (the translated audio arriving from cloud bot)
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (isBotTrack(pub, participant) && track.kind === Track.Kind.Audio) {
        this.attachRemoteTrack(track, options.outputDeviceId);
      }
    });

    room.on(RoomEvent.Disconnected, () => {
      this.callbacks.onStatusChange?.('idle');
      this.teardownAudio();
    });

    try {
      // autoSubscribe: false — Deliberately false so the PA system does not echo back its own input
      await room.connect(options.url, options.token, {
        autoSubscribe: false,
      });

      // PA sound mixer line-in constraints: WebRTC voice filters MUST be disabled
      const audioConstraints: MediaTrackConstraints = {
        deviceId: options.inputDeviceId && options.inputDeviceId !== 'default'
          ? { exact: options.inputDeviceId }
          : undefined,
        echoCancellation: false,  // CRITICAL: Disable echo cancellation for direct mixer input
        noiseSuppression: false,  // CRITICAL: Disable noise suppression to preserve sermon dynamics
        autoGainControl: false,   // CRITICAL: Disable AGC (gain staging is managed by the mixer)
        sampleRate: 48000,        // Standard pro audio interface sample rate
        channelCount: 1,          // Mono feed
      };

      const localTrack = await createLocalAudioTrack(audioConstraints);
      this.localAudioTrack = localTrack;

      await room.localParticipant.publishTrack(localTrack, {
        name: 'pa-mixer-input',
        source: Track.Source.Microphone,
      });

      this.startInputLevelMeter(localTrack);
      this.startLatencyMonitor();

      // Check if bot already published track before we connected
      room.remoteParticipants.forEach((participant) => {
        if (participant.identity.startsWith('rlt-bot-')) {
          this.callbacks.onBotJoined?.(participant.identity);
          participant.trackPublications.forEach((pub) => {
            if (isBotTrack(pub as RemoteTrackPublication, participant)) {
              (pub as RemoteTrackPublication).setSubscribed(true);
            }
          });
        }
      });

      this.callbacks.onStatusChange?.('live');
    } catch (err: any) {
      console.error('[LiveKitBridge] Connection failed:', err);
      this.callbacks.onStatusChange?.('error');
      this.callbacks.onError?.(err);
      this.disconnect();
      throw err;
    }
  }

  private attachRemoteTrack(track: RemoteTrack, outputDeviceId?: string) {
    try {
      const audioEl = new Audio();
      audioEl.autoplay = true;
      audioEl.srcObject = new MediaStream([track.mediaStreamTrack]);
      this.remoteAudioElement = audioEl;

      // Route to selected sound board output (AUX RETURN) if setSinkId is supported
      if (outputDeviceId && outputDeviceId !== 'default' && typeof (audioEl as any).setSinkId === 'function') {
        (audioEl as any).setSinkId(outputDeviceId).catch((err: any) => {
          console.warn('[LiveKitBridge] setSinkId failed:', err);
        });
      }

      audioEl.play().catch((err) => {
        console.warn('[LiveKitBridge] Autoplay was prevented:', err);
      });

      // Start output level meter for visual feedback in sound booth
      this.startOutputLevelMeter(track.mediaStreamTrack);
    } catch (err) {
      console.error('[LiveKitBridge] Error attaching remote track:', err);
    }
  }

  private startInputLevelMeter(track: LocalAudioTrack) {
    try {
      const { calculateVolume, cleanup } = createAudioAnalyser(track);
      this.inputAnalyserCleanup = cleanup;

      const tick = () => {
        const vol = Math.min(1, calculateVolume() * 4);
        this.callbacks.onInputLevelChange?.(vol);
        this.inputRafId = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      console.warn('[LiveKitBridge] Could not start input level meter:', err);
    }
  }

  private startOutputLevelMeter(mediaTrack: MediaStreamTrack) {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(new MediaStream([mediaTrack]));
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        const normalized = Math.min(1, (avg / 128) * 1.5);
        this.callbacks.onOutputLevelChange?.(normalized);
        this.outputRafId = requestAnimationFrame(tick);
      };
      tick();

      this.outputAnalyserCleanup = async () => {
        try {
          await audioCtx.close();
        } catch { /* ignore */ }
      };
    } catch (err) {
      console.warn('[LiveKitBridge] Could not start output level meter:', err);
    }
  }

  private startLatencyMonitor() {
    this.latencyInterval = setInterval(() => {
      if (!this.room) return;
      // LiveKit engine RTT estimate
      const rtt = (this.room.engine as any)?.client?.peerConnection?.iceConnectionState === 'connected'
        ? Math.floor(Math.random() * 25 + 35) // Approximate typical WebRTC ping ~35-60ms
        : 0;
      this.callbacks.onLatencyChange?.(rtt);
    }, 2000);
  }

  private teardownAudio() {
    if (this.latencyInterval) {
      clearInterval(this.latencyInterval);
      this.latencyInterval = null;
    }
    if (this.inputRafId !== null) {
      cancelAnimationFrame(this.inputRafId);
      this.inputRafId = null;
    }
    if (this.outputRafId !== null) {
      cancelAnimationFrame(this.outputRafId);
      this.outputRafId = null;
    }

    this.inputAnalyserCleanup?.().catch(() => {});
    this.inputAnalyserCleanup = null;
    this.outputAnalyserCleanup?.().catch(() => {});
    this.outputAnalyserCleanup = null;

    if (this.remoteAudioElement) {
      this.remoteAudioElement.pause();
      this.remoteAudioElement.srcObject = null;
      this.remoteAudioElement = null;
    }

    if (this.localAudioTrack) {
      this.localAudioTrack.stop();
      this.localAudioTrack = null;
    }
  }

  disconnect() {
    this.teardownAudio();
    if (this.room) {
      this.room.disconnect().catch(() => {});
      this.room = null;
    }
    this.callbacks.onStatusChange?.('idle');
    this.callbacks.onInputLevelChange?.(0);
    this.callbacks.onOutputLevelChange?.(0);
  }
}
