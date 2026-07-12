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
  joinedAt: Date;
  audioTrack?: MediaStreamTrack;
  videoTrack?: MediaStreamTrack;
  screenVideoTrack?: MediaStreamTrack;
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

  joinMeeting(url: string, token: string, userName: string, viewerOnly?: boolean): Promise<boolean>;
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
}

export type VideoBackend = 'daily' | 'livekit';
