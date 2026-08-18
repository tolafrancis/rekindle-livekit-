/**
 * LiveKitRoomWrapper (Phase 2, plan §9)
 *
 * Drop-in replacement for EnhancedDailyVideoWrapper behind the `UseDailyRoomReturn`
 * seam. Preserves method NAMES so the hook body barely changes, but:
 *   - owns a livekit-client `Room` instead of a Daily `callObject`
 *   - emits `NormalizedParticipant` (already the hook's public shape), so the hook's
 *     `updateParticipants` is a pass-through — no Daily-shaped field reads
 *   - exposes NO raw call object (getCallObject / updateParticipant are gone — remote
 *     control is server-only in LiveKit → `livekit-token`/`livekit-moderation` fns)
 *
 * Preview (camera/mic getUserMedia) is identical to the Daily wrapper — it was never
 * Daily-specific — so it's reproduced verbatim.
 *
 * NOTE: imports `livekit-client`. Keep this file OUT of the build graph until that
 * package is installed (see videoBackend.ts factory, which lazy-loads it).
 */

import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  type Participant,
  type RemoteParticipant,
  type LocalParticipant,
  type LocalVideoTrack,
  type TrackPublication,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';
import { BackgroundBlur, VirtualBackground } from '@livekit/track-processors';

/** Virtual-background mode: 'none' | 'blur' | an image URL. */
export type CameraBackground = 'none' | 'blur' | string;
import type {
  NormalizedParticipant,
  VideoWrapperCallbacks,
  IVideoRoomWrapper,
} from '@rekindle/types/videoRoom';
import type { ParticipantRole } from '@rekindle/types/liveChannelTypes';

interface PreviewState {
  isActive: boolean;
  videoStream: MediaStream | null;
  audioStream: MediaStream | null;
  videoDeviceId: string | null;
  audioDeviceId: string | null;
}

export class LiveKitRoomWrapper implements IVideoRoomWrapper {
  private room: Room | null = null;
  private callbacks: VideoWrapperCallbacks = {};
  private joined = false;
  private joining = false;
  private viewerOnly = false;
  private localAudioEnabled = false;
  private localVideoEnabled = false;

  private previewState: PreviewState = {
    isActive: false,
    videoStream: null,
    audioStream: null,
    videoDeviceId: null,
    audioDeviceId: null,
  };

  constructor(callbacks?: VideoWrapperCallbacks) {
    if (callbacks) this.callbacks = callbacks;
  }

  // ============================================================
  // PREVIEW — raw getUserMedia (unchanged from the Daily wrapper)
  // ============================================================

  async startCameraPreview(preferredDeviceId?: string): Promise<MediaStream | null> {
    await this.stopCameraPreview();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: this.buildVideoConstraints(preferredDeviceId),
    });
    this.previewState.videoStream = stream;
    this.previewState.isActive = true;
    this.previewState.videoDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? null;
    return stream;
  }

  async stopCameraPreview(): Promise<void> {
    this.previewState.videoStream?.getTracks().forEach((t) => t.stop());
    this.previewState.videoStream = null;
    this.previewState.videoDeviceId = null;
  }

  async startMicrophonePreview(preferredDeviceId?: string): Promise<MediaStream | null> {
    await this.stopMicrophonePreview();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: this.buildAudioConstraints(preferredDeviceId),
    });
    this.previewState.audioStream = stream;
    this.previewState.isActive = true;
    this.previewState.audioDeviceId = stream.getAudioTracks()[0]?.getSettings().deviceId ?? null;
    return stream;
  }

  async stopMicrophonePreview(): Promise<void> {
    this.previewState.audioStream?.getTracks().forEach((t) => t.stop());
    this.previewState.audioStream = null;
    this.previewState.audioDeviceId = null;
  }

  async stopAllPreviews(): Promise<void> {
    await this.stopCameraPreview();
    await this.stopMicrophonePreview();
    this.previewState.isActive = false;
    await new Promise((r) => setTimeout(r, 200));
  }

  // ============================================================
  // LIVE MEETING — livekit-client Room
  // ============================================================

  async joinMeeting(
    url: string,
    token: string,
    userName: string,
    viewerOnly = false,
  ): Promise<boolean> {
    if (this.previewState.isActive) await this.stopAllPreviews();
    this.joining = true;
    this.viewerOnly = viewerOnly;

    try {
      const room = new Room({ adaptiveStream: true, dynacast: true });
      this.room = room;
      this.wireEvents(room);

      await room.connect(url, token);
      this.joined = true;
      this.joining = false;

      // Real bug found live (2026-08-18): a bot that started translating
      // BEFORE this participant joined was never discovered. Every trigger
      // for notifyTranslationTracksChanged() (ParticipantConnected,
      // TrackPublished, etc. — see wireEvents() below) only fires for
      // events that happen AFTER you're already connected; a track
      // published earlier by an already-present bot produces none of them
      // for a participant joining now. The bot's track was genuinely
      // there and genuinely translating — the participant's picker just
      // never got told, and stayed stuck on "no translation running" or
      // an empty list forever, with no event ever coming along to fix it.
      // One explicit scan right after connect() picks up whatever's
      // already live at join time; everything after that stays reactive.
      this.notifyTranslationTracksChanged();

      // Set local participant name explicitly — ensures guest display names persist.
      // The LiveKit token should include the name, but set it explicitly as a backup.
      if (userName && this.room?.localParticipant) {
        try {
          this.room.localParticipant.setName(userName);
        } catch (err) {
          console.warn('[LiveKitRoomWrapper] Could not set local participant name:', err);
        }
      }

      // Join MUTED: mic + camera start OFF (unless viewer-only, which can't publish
      // anyway). Auto-publishing on join raced the browser permission prompt +
      // device warm-up, leaving the buttons showing OFF with no local video until a
      // manual toggle. Instead the user enables mic/camera themselves when ready
      // (the room UI prompts them on join) — deterministic, no timing race.
      if (!viewerOnly) {
        this.syncLocalMediaState(); // reports (false, false) — buttons show muted
      }
      return true;
    } catch (error) {
      this.joining = false;
      this.callbacks.onError?.(error);
      throw error;
    }
  }

  /**
   * Read the actual local mic/camera state from LiveKit and report it via
   * onMediaStateChange, keeping the internal flags in sync. This is the single
   * source of truth for the control buttons; reading our own intent flags let the
   * buttons drift from the real track (they'd say "on" while the tile showed muted).
   */
  private syncLocalMediaState(): void {
    const lp = this.room?.localParticipant;
    if (!lp) return;
    this.localAudioEnabled = lp.isMicrophoneEnabled;
    this.localVideoEnabled = lp.isCameraEnabled;
    this.callbacks.onMediaStateChange?.(this.localVideoEnabled, this.localAudioEnabled);
  }

  async leaveMeeting(): Promise<void> {
    if (this.room) {
      try {
        await this.room.disconnect();
      } catch { /* ignore */ }
      this.room = null;
    }
    this.joined = false;
    this.joining = false;
    this.localAudioEnabled = false;
    this.localVideoEnabled = false;
  }

  async destroy(): Promise<void> {
    await this.stopAllPreviews();
    await this.leaveMeeting();
    this.callbacks = {};
  }

  // ---- media controls ----

  async toggleAudio(): Promise<boolean> {
    return this.setAudio(!this.localAudioEnabled);
  }

  async setAudio(on: boolean): Promise<boolean> {
    const lp = this.room?.localParticipant;
    if (!lp || !this.joined) return this.localAudioEnabled;
    try {
      await lp.setMicrophoneEnabled(on);
      this.syncLocalMediaState();
    } catch (e) {
      this.callbacks.onError?.(e);
    }
    return this.localAudioEnabled;
  }

  async toggleVideo(): Promise<boolean> {
    return this.setVideo(!this.localVideoEnabled);
  }

  async setVideo(on: boolean): Promise<boolean> {
    const lp = this.room?.localParticipant;
    if (!lp || !this.joined) return this.localVideoEnabled;
    try {
      await lp.setCameraEnabled(on);
      // The camera track is fresh each time it turns on, so re-apply any chosen
      // virtual background to the new track.
      if (on && this.cameraBackground !== 'none') await this.applyCameraBackground();
      this.syncLocalMediaState();
    } catch (e) {
      this.callbacks.onCameraError?.(e);
    }
    return this.localVideoEnabled;
  }

  // ---- virtual background (LiveKit track processors) ----
  private cameraBackground: CameraBackground = 'none';

  /** Set 'none' | 'blur' | <image URL>. Stored so it re-applies whenever the
   *  camera restarts; applied immediately if the camera is currently on. */
  async setCameraBackground(mode: CameraBackground): Promise<void> {
    this.cameraBackground = mode;
    await this.applyCameraBackground();
  }

  getCameraBackground(): CameraBackground { return this.cameraBackground; }

  private async applyCameraBackground(): Promise<void> {
    const pub = this.room?.localParticipant?.getTrackPublication(Track.Source.Camera);
    const track = pub?.track as LocalVideoTrack | undefined;
    if (!track) return; // camera off — applies on next enable
    try {
      if (this.cameraBackground === 'none') {
        await track.stopProcessor();
      } else if (this.cameraBackground === 'blur') {
        await track.setProcessor(BackgroundBlur(15));
      } else {
        await track.setProcessor(VirtualBackground(this.cameraBackground));
      }
    } catch (e) {
      this.callbacks.onCameraError?.(e);
    }
  }

  // ---- ReKindle Live Translation audio (LiveKit-only, additive) ----
  //
  // Same "extra method not on IVideoRoomWrapper, called via `(wrapper as
  // any).method?.()`" pattern setCameraBackground/getCameraBackground
  // already use above — see useDailyRoom.ts's setVideoBackground for the
  // precedent. Deliberately NOT touching normalize()/getParticipants(): a
  // translation bot is a real room participant (identity "rlt-bot-
  // {sessionId}") but its audio must never auto-play the way a normal
  // participant's microphone does, so it publishes with Track.Source.Unknown
  // rather than .Microphone (see rekindle-translation-bot's LiveKitAgent.ts)
  // and is invisible to the existing mic/camera/screen-share lookups here —
  // it just shows up as a normal-looking silent tile with no camera. A
  // dedicated tile-filter is a reasonable follow-up, not done here.

  private translationAudioEl: HTMLAudioElement | null = null;
  private mutedSpeakerTrack: RemoteTrack | null = null;
  private currentTranslationLanguage: string | null = null;

  /** Every "rlt-translated-{lang}" track currently published by any rlt-bot-*
   *  participant in the room — i.e. every language a listener can switch to. */
  getAvailableTranslations(): Array<{ language: string; botIdentity: string }> {
    if (!this.room) return [];
    const out: Array<{ language: string; botIdentity: string }> = [];
    this.room.remoteParticipants.forEach((p) => {
      if (!p.identity.startsWith('rlt-bot-')) return;
      p.audioTrackPublications.forEach((pub) => {
        const m = /^rlt-translated-(.+)$/.exec(pub.trackName);
        if (m) out.push({ language: m[1], botIdentity: p.identity });
      });
    });
    return out;
  }

  getCurrentTranslationLanguage(): string | null {
    return this.currentTranslationLanguage;
  }

  /**
   * Switch the local listener's audio to a translated track, or back to
   * "Original" with `language = null`. `originalSpeakerIdentity` (from
   * language_configs.speaker_identity, same field the bot uses) gets
   * locally muted while a translation plays and restored on switch-back —
   * build plan §2.7: "Selecting 'Translated': subscribes to the
   * rlt-translated LiveKit audio track; mutes the original track." This
   * mute is local only (MediaStreamTrack.enabled = false) — it doesn't
   * touch what the speaker publishes or what anyone else hears.
   */
  async setTranslationLanguage(language: string | null, originalSpeakerIdentity?: string): Promise<void> {
    if (this.mutedSpeakerTrack) {
      try { this.mutedSpeakerTrack.mediaStreamTrack.enabled = true; } catch { /* track may be gone already */ }
      this.mutedSpeakerTrack = null;
    }
    if (this.translationAudioEl) {
      this.translationAudioEl.pause();
      this.translationAudioEl.srcObject = null;
      this.translationAudioEl = null;
    }
    this.currentTranslationLanguage = null;

    if (!language || !this.room) return;

    let targetPub: RemoteTrackPublication | undefined;
    this.room.remoteParticipants.forEach((p) => {
      if (targetPub || !p.identity.startsWith('rlt-bot-')) return;
      p.audioTrackPublications.forEach((pub) => {
        if (pub.trackName === `rlt-translated-${language}`) targetPub = pub;
      });
    });
    if (!targetPub) return; // language no longer available — caller should re-check getAvailableTranslations()

    // Should already be auto-subscribed (this wrapper never disables
    // autoSubscribe); explicit call is a defensive no-op either way.
    targetPub.setSubscribed(true);
    const track = targetPub.track as RemoteTrack | undefined;
    if (track) {
      const el = new Audio();
      el.autoplay = true;
      el.srcObject = new MediaStream([track.mediaStreamTrack]);
      this.translationAudioEl = el;
    }

    if (originalSpeakerIdentity) {
      const speaker = this.room.remoteParticipants.get(originalSpeakerIdentity);
      const micPub = speaker?.getTrackPublication(Track.Source.Microphone);
      if (micPub?.track) {
        try {
          micPub.track.mediaStreamTrack.enabled = false;
          this.mutedSpeakerTrack = micPub.track as RemoteTrack;
        } catch { /* ignore */ }
      }
    }

    this.currentTranslationLanguage = language;
  }

  /** Called from wireEvents() whenever a bot's tracks or presence change, so the
   *  UI (via VideoWrapperCallbacks.onTranslationTracksChanged) can refresh its
   *  language list and fall back to Original if the selected one disappeared. */
  private notifyTranslationTracksChanged(): void {
    const tracks = this.getAvailableTranslations();
    if (this.currentTranslationLanguage && !tracks.some((t) => t.language === this.currentTranslationLanguage)) {
      this.setTranslationLanguage(null).catch(() => {});
    }
    this.callbacks.onTranslationTracksChanged?.(tracks);
  }

  async startScreenShare(): Promise<boolean> {
    const lp = this.room?.localParticipant;
    if (!lp || !this.joined) return false;
    try {
      await lp.setScreenShareEnabled(true);
      return true;
    } catch (e) {
      this.callbacks.onError?.(e);
      return false;
    }
  }

  async stopScreenShare(): Promise<void> {
    await this.room?.localParticipant?.setScreenShareEnabled(false).catch(() => {});
  }

  // ---- participants (normalized) ----

  getParticipants(): Record<string, NormalizedParticipant> | null {
    if (!this.room) return null;
    const out: Record<string, NormalizedParticipant> = {};
    const lp = this.room.localParticipant;
    if (lp) out[lp.identity] = this.normalize(lp, true);
    this.room.remoteParticipants.forEach((p) => {
      out[p.identity] = this.normalize(p, false);
    });
    return out;
  }

  getLocalParticipant(): NormalizedParticipant | null {
    const lp = this.room?.localParticipant;
    return lp ? this.normalize(lp, true) : null;
  }

  // ---- data channel ----

  async sendAppMessage(data: unknown, to: string = '*'): Promise<void> {
    const lp = this.room?.localParticipant;
    if (!lp) return;
    const payload = new TextEncoder().encode(JSON.stringify(data));
    const opts = to === '*' ? { reliable: true } : { reliable: true, destinationIdentities: [to] };
    // v2 types the arg as NonSharedUint8Array; a fresh TextEncoder buffer qualifies.
    await lp.publishData(payload as Parameters<typeof lp.publishData>[0], opts);
  }

  // ---- devices / state ----

  async getVideoDevices(): Promise<MediaDeviceInfo[]> {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  }

  async getAudioInputDevices(): Promise<MediaDeviceInfo[]> {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  }

  isJoined(): boolean { return this.joined; }
  isJoining(): boolean { return this.joining; }
  isVideoEnabled(): boolean { return this.localVideoEnabled; }
  isAudioEnabled(): boolean { return this.localAudioEnabled; }

  // ============================================================
  // internals
  // ============================================================

  /** Wire room events → wrapper callbacks (plan §9 mapping table). */
  private wireEvents(room: Room): void {
    room
      .on(RoomEvent.Connected, () => this.callbacks.onJoined?.())
      .on(RoomEvent.Disconnected, () => {
        this.joined = false;
        this.callbacks.onLeft?.();
      })
      .on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        this.callbacks.onParticipantJoined?.(this.normalize(p, false));
        if (p.identity.startsWith('rlt-bot-')) this.notifyTranslationTracksChanged();
      })
      .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        this.callbacks.onParticipantLeft?.(this.normalize(p, false));
        if (p.identity.startsWith('rlt-bot-')) this.notifyTranslationTracksChanged();
      })
      .on(RoomEvent.ParticipantMetadataChanged, (_prev, p: Participant) =>
        this.callbacks.onParticipantUpdated?.(this.normalize(p, p.isLocal)))
      .on(RoomEvent.TrackMuted, (_pub, p: Participant) => {
        this.callbacks.onParticipantUpdated?.(this.normalize(p, p.isLocal));
        // Keep the control buttons in lockstep with the tile when OUR track is
        // muted (by us, a host, or an auto-mute) — same source of truth for both.
        if (p.isLocal) this.syncLocalMediaState();
      })
      .on(RoomEvent.TrackUnmuted, (_pub, p: Participant) => {
        this.callbacks.onParticipantUpdated?.(this.normalize(p, p.isLocal));
        if (p.isLocal) this.syncLocalMediaState();
      })
      .on(RoomEvent.TrackSubscribed, (track, _pub, p) => this.callbacks.onTrackStarted?.({ track, participant: p }))
      .on(RoomEvent.TrackUnsubscribed, (track, _pub, p) => this.callbacks.onTrackStopped?.({ track, participant: p }))
      // A remote track being PUBLISHED / UNPUBLISHED (e.g. a screen share starting
      // or STOPPING) must refresh that participant so tiles recompute. Without the
      // unpublished case, a viewer's screen-share stage stayed frozen after the host
      // stopped sharing until some other event forced a re-render (a manual toggle).
      .on(RoomEvent.TrackPublished, (_pub, p: Participant) => {
        this.callbacks.onParticipantUpdated?.(this.normalize(p, p.isLocal));
        if (p.identity.startsWith('rlt-bot-')) this.notifyTranslationTracksChanged();
      })
      .on(RoomEvent.TrackUnpublished, (_pub, p: Participant) => {
        this.callbacks.onParticipantUpdated?.(this.normalize(p, p.isLocal));
        if (p.identity.startsWith('rlt-bot-')) this.notifyTranslationTracksChanged();
      })
      .on(RoomEvent.LocalTrackPublished, () => {
        this.syncLocalMediaState();
        // Refresh the local participant so the video TILES re-attach the new track.
        // Without this, enabling the camera updated the mic/cam BUTTON (via
        // syncLocalMediaState) but NOT the participant object the tiles render from,
        // so the local video only appeared after a SECOND toggle (that one fires
        // TrackMuted/Unmuted → onParticipantUpdated, which is what refreshed it).
        // LocalTrackPublished is the local analogue of TrackSubscribed (which only
        // fires for remote tracks), so it's the right place to drive the local tile.
        const lp = this.room?.localParticipant;
        if (lp) this.callbacks.onParticipantUpdated?.(this.normalize(lp, true));
      })
      .on(RoomEvent.LocalTrackUnpublished, () => {
        this.syncLocalMediaState();
        const lp = this.room?.localParticipant;
        if (lp) this.callbacks.onParticipantUpdated?.(this.normalize(lp, true));
      })
      .on(RoomEvent.MediaDevicesError, (e: Error) => this.callbacks.onCameraError?.(e))
      .on(RoomEvent.ConnectionStateChanged, (s: ConnectionState) => {
        if (s === ConnectionState.Disconnected) this.joined = false;
      })
      .on(RoomEvent.DataReceived, (payload: Uint8Array, participant) => {
        try {
          this.callbacks.onData?.(JSON.parse(new TextDecoder().decode(payload)), participant?.identity);
        } catch { /* non-JSON data ignored */ }
      });
  }

  /** LiveKit participant → NormalizedParticipant (the hook's DailyParticipantInfo shape). */
  private normalize(p: Participant, isLocal: boolean): NormalizedParticipant {
    const camera = this.pub(p, Track.Source.Camera);
    const mic = this.pub(p, Track.Source.Microphone);
    const screen = this.pub(p, Track.Source.ScreenShare);

    let role: ParticipantRole | undefined;
    try {
      role = p.metadata ? (JSON.parse(p.metadata).role as ParticipantRole) : undefined;
    } catch { /* metadata not JSON */ }

    const videoTrack = camera?.track?.mediaStreamTrack;
    const audioTrack = mic?.track?.mediaStreamTrack;
    const screenVideoTrack = screen?.track?.mediaStreamTrack;

    return {
      id: p.identity,
      // Use identity (stable user.id) for BOTH — moderation targets by identity and
      // the hook keys participant_states / control messages by sessionId. Aligning
      // them means participantId flows straight through to the moderation edge fn.
      sessionId: p.identity,
      userName: p.name || p.identity,
      isLocal,
      isOwner: role === 'host' || role === 'co-host',
      hasAudio: !!audioTrack && !mic?.isMuted,
      hasVideo: !!videoTrack && !camera?.isMuted,
      hasScreenShare: !!screenVideoTrack,
      isInCall: true,
      joinedAt: p.joinedAt ?? new Date(),
      audioTrack,
      videoTrack,
      screenVideoTrack,
      metadata: role ? { role } : undefined,
    };
  }

  private pub(p: Participant, source: Track.Source): TrackPublication | undefined {
    return (p as LocalParticipant | RemoteParticipant).getTrackPublication(source);
  }

  private buildVideoConstraints(deviceId?: string): MediaTrackConstraints {
    if (!deviceId || deviceId === 'default') {
      return { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' };
    }
    return { deviceId: { ideal: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } };
  }

  private buildAudioConstraints(deviceId?: string): MediaTrackConstraints {
    const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    return !deviceId || deviceId === 'default' ? base : { deviceId: { ideal: deviceId }, ...base };
  }
}

export default LiveKitRoomWrapper;
