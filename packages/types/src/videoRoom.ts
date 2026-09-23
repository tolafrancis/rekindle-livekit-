/**
 * Backend-neutral video-room types (Phase 2, plan §9).
 *
 * The seam: the hook exposes `DailyParticipantInfo` today. `NormalizedParticipant`
 * is the SAME shape (plus `metadata.role`), so a LiveKit-backed wrapper can emit it
 * directly and the hook's `updateParticipants` becomes a pass-through instead of a
 * Daily-specific `convertParticipant`.
 */
import type { ParticipantRole } from './liveChannelTypes';

/** Maps 1:1 to `DailyParticipantInfo` in useDailyRoom/useVideoRoom. */
export interface NormalizedParticipant {
  id: string; // LiveKit identity (== user.id) / Daily user_id
  sessionId: string; // identity or sid / Daily session_id
  userName: string;
  isLocal: boolean;
  isOwner: boolean; // derived from metadata.role, NOT a Daily `owner` flag
  hasAudio: boolean;
  hasVideo: boolean;
  hasScreenShare: boolean;
  isInCall: boolean;
  /** LiveKit's own speech-detection — undefined on the Daily wrapper (never
   *  set there). Drives the auto active-speaker layout in DailyVideoCall.tsx. */
  isSpeaking?: boolean;
  joinedAt: Date;
  audioTrack?: MediaStreamTrack;
  videoTrack?: MediaStreamTrack;
  screenVideoTrack?: MediaStreamTrack;
  screenAudioTrack?: MediaStreamTrack;
  /** Profile display picture, shown in place of the initial-letter avatar
   *  when this participant's camera is off. Undefined for guests / users
   *  with no photo uploaded. */
  avatarUrl?: string;
  metadata?: { role?: ParticipantRole };
}

/** Callbacks the hook wires into a wrapper. Superset of the Daily wrapper's,
 *  plus `onData` (LiveKit data channel → Phase 3 advisory handler). */
export interface VideoWrapperCallbacks {
  onJoined?: () => void;
  onLeft?: () => void;
  // Participant/event args are `any` to stay drop-in compatible with the existing
  // hook callback bodies (which read Daily-ish fields defensively) across both backends.
  onParticipantJoined?: (participant: any) => void;
  onParticipantLeft?: (participant: any) => void;
  onParticipantUpdated?: (participant: any) => void;
  onTrackStarted?: (event: any) => void;
  onTrackStopped?: (event: any) => void;
  onError?: (error: any) => void;
  onCameraError?: (error: any) => void;
  onMediaStateChange?: (video: boolean, audio: boolean) => void;
  /** LiveKit `DataReceived` — feeds the Phase 3 advisory (hand-raise/spotlight) handler. */
  onData?: (data: any, fromIdentity?: string) => void;
  /** ReKindle Live Translation — fires whenever the set of available
   *  "rlt-translated-{lang}" tracks changes (a bot joins/leaves or
   *  publishes/unpublishes). LiveKit-only, additive; unset on the Daily
   *  path (there is none left, but kept optional for interface stability —
   *  see LiveKitRoomWrapper.getAvailableTranslations). */
  onTranslationTracksChanged?: (tracks: Array<{ language: string; botIdentity: string }>) => void;
  /** Reconnection UX (2026-09-23, meeting architecture review): before this,
   *  a transient network blip gave zero feedback — tiles just froze with no
   *  "Reconnecting…" state, and if LiveKit's own reconnect succeeded there
   *  was nothing telling the user it recovered. Fired from RoomEvent.
   *  Reconnecting / RoomEvent.Reconnected. */
  onReconnecting?: () => void;
  onReconnected?: () => void;
  /** Autoplay-blocked audio (same review, Issue 2/4) — before this, a user
   *  whose browser blocked audio autoplay on join saw full video and heard
   *  nothing, with no indication why. Fired from RoomEvent.
   *  AudioPlaybackStatusChanged whenever room.canPlaybackAudio is false. */
  onAudioPlaybackBlocked?: () => void;
  /** Per-participant network quality (same review) — identity is the
   *  participant's LiveKit identity ('' for the local participant's own
   *  updates, mirroring how RoomEvent.ConnectionQualityChanged reports the
   *  local participant). quality is livekit-client's ConnectionQuality
   *  string ('excellent' | 'good' | 'poor' | 'lost' | 'unknown') — typed as
   *  string here rather than importing the LiveKit enum, same as this
   *  interface's other loosely-typed args, to stay drop-in compatible
   *  across both backends. */
  onConnectionQualityChanged?: (identity: string, quality: string) => void;
}

/**
 * The common surface both wrappers expose to the hook. `getParticipants` is loosely
 * typed because the Daily wrapper still returns Daily-shaped rows (converted in the
 * hook) while the LiveKit wrapper returns `NormalizedParticipant` directly; the hook
 * branches on the active backend.
 */
export interface IVideoRoomWrapper {
  startCameraPreview(preferredDeviceId?: string): Promise<MediaStream | null>;
  stopCameraPreview(): Promise<void>;
  startMicrophonePreview(preferredDeviceId?: string): Promise<MediaStream | null>;
  stopMicrophonePreview(): Promise<void>;
  stopAllPreviews(): Promise<void>;

  joinMeeting(url: string, token: string, userName: string, viewerOnly?: boolean, isHost?: boolean): Promise<boolean>;
  leaveMeeting(): Promise<void>;
  destroy(): Promise<void>;

  toggleAudio(): Promise<boolean>;
  setAudio(on: boolean): Promise<boolean>;
  toggleVideo(): Promise<boolean>;
  setVideo(on: boolean): Promise<boolean>;
  startScreenShare(): Promise<boolean>;
  stopScreenShare(): Promise<void>;

  getParticipants(): Record<string, unknown> | null;
  getLocalParticipant(): unknown | null;

  sendAppMessage(data: unknown, to?: string): Promise<void>;

  getVideoDevices(): Promise<MediaDeviceInfo[]>;
  getAudioInputDevices(): Promise<MediaDeviceInfo[]>;
  isJoined(): boolean;
  isJoining(): boolean;
  isVideoEnabled(): boolean;
  isAudioEnabled(): boolean;

  /** Retries starting audio playback from within a real user gesture (e.g. a
   *  "Tap to enable sound" button click) — the counterpart to
   *  onAudioPlaybackBlocked above. A no-op that resolves immediately on a
   *  wrapper with nothing to resume. */
  resumeAudioPlayback(): Promise<void>;

  /** Subscribe/unsubscribe a remote participant's CAMERA track specifically
   *  (never audio, never screen share) — lets a capped/off-screen tile stop
   *  pulling video bandwidth without muting their mic or affecting a
   *  screen-share they may be presenting. identity is their LiveKit
   *  identity (== NormalizedParticipant.id). */
  setParticipantVideoSubscribed(identity: string, subscribed: boolean): void;
}

export type VideoBackend = 'daily' | 'livekit';
