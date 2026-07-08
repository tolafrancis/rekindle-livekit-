/**
 * EnhancedDailyVideoWrapper
 * 
 * A Daily-aware enhanced wrapper that:
 * - Owns the Daily call object
 * - Controls the full media lifecycle
 * - Safely manages join, device selection, and media enablement
 * - Sanitizes all camera and microphone constraints
 * - Avoids reusing preview state
 * - Explicitly re-enables audio and video after every real meeting join
 * - Separates preview logic from live meeting logic
 * 
 * This wrapper prevents invalid constraint errors by:
 * 1. Never passing device IDs from preview to live meeting
 * 2. Ensuring all preview streams are released before joining
 * 3. Using Daily.co's automatic device selection for live meetings
 * 4. Providing explicit media enablement after join
 */

import DailyIframe, { DailyCall, DailyParticipant, DailyEventObject } from '@daily-co/daily-js';

// Types
export interface MediaDeviceState {
  hasPermission: boolean;
  isAvailable: boolean;
  isBlocked: boolean;
  deviceId: string | null;
  deviceLabel: string | null;
}

export interface PreviewState {
  isActive: boolean;
  videoStream: MediaStream | null;
  audioStream: MediaStream | null;
  videoDeviceId: string | null;
  audioDeviceId: string | null;
}

export interface LiveMeetingState {
  isJoined: boolean;
  isJoining: boolean;
  callObject: DailyCall | null;
  localVideoEnabled: boolean;
  localAudioEnabled: boolean;
}

export interface WrapperCallbacks {
  onJoined?: () => void;
  onLeft?: () => void;
  onParticipantJoined?: (participant: DailyParticipant) => void;
  onParticipantLeft?: (participant: DailyParticipant) => void;
  onParticipantUpdated?: (participant: DailyParticipant) => void;
  onTrackStarted?: (event: any) => void;
  onTrackStopped?: (event: any) => void;
  onError?: (error: any) => void;
  onCameraError?: (error: any) => void;
  onMediaStateChange?: (video: boolean, audio: boolean) => void;
}

export class EnhancedDailyVideoWrapper {
  private previewState: PreviewState = {
    isActive: false,
    videoStream: null,
    audioStream: null,
    videoDeviceId: null,
    audioDeviceId: null,
  };

  private liveMeetingState: LiveMeetingState = {
    isJoined: false,
    isJoining: false,
    callObject: null,
    localVideoEnabled: false,
    localAudioEnabled: false,
  };

  private callbacks: WrapperCallbacks = {};
  private mediaEnablementRetryCount = 0;
  private maxMediaRetries = 3;
  private mediaEnablementDelay = 500; // ms

  constructor(callbacks?: WrapperCallbacks) {
    if (callbacks) {
      this.callbacks = callbacks;
    }
  }

  // ============================================
  // PREVIEW MODE - Separate from Live Meeting
  // ============================================

  /**
   * Start camera preview - completely separate from Daily.co
   * Uses sanitized constraints that won't cause issues
   */
  async startCameraPreview(preferredDeviceId?: string): Promise<MediaStream | null> {
    console.log('[EnhancedWrapper] Starting camera preview...');
    
    // Release any existing preview first
    await this.stopCameraPreview();

    try {
      // Build sanitized constraints - never use deviceId directly if it might be invalid
      const constraints: MediaStreamConstraints = {
        video: this.buildSanitizedVideoConstraints(preferredDeviceId),
      };

      console.log('[EnhancedWrapper] Camera preview constraints:', JSON.stringify(constraints));
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      this.previewState.videoStream = stream;
      this.previewState.isActive = true;
      
      // Store the actual device ID from the track (not the requested one)
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        this.previewState.videoDeviceId = settings.deviceId || null;
        console.log('[EnhancedWrapper] Camera preview started, actual deviceId:', settings.deviceId);
      }

      return stream;
    } catch (error: any) {
      console.error('[EnhancedWrapper] Camera preview failed:', error.name, error.message);
      this.previewState.videoStream = null;
      throw error;
    }
  }

  /**
   * Stop camera preview and release all resources
   */
  async stopCameraPreview(): Promise<void> {
    console.log('[EnhancedWrapper] Stopping camera preview...');
    
    if (this.previewState.videoStream) {
      this.previewState.videoStream.getTracks().forEach(track => {
        track.stop();
        console.log('[EnhancedWrapper] Stopped preview video track:', track.label);
      });
      this.previewState.videoStream = null;
    }
    
    // CRITICAL: Clear the device ID to prevent reuse in live meeting
    this.previewState.videoDeviceId = null;
  }

  /**
   * Start microphone preview - completely separate from Daily.co
   */
  async startMicrophonePreview(preferredDeviceId?: string): Promise<MediaStream | null> {
    console.log('[EnhancedWrapper] Starting microphone preview...');
    
    // Release any existing preview first
    await this.stopMicrophonePreview();

    try {
      const constraints: MediaStreamConstraints = {
        audio: this.buildSanitizedAudioConstraints(preferredDeviceId),
      };

      console.log('[EnhancedWrapper] Microphone preview constraints:', JSON.stringify(constraints));
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      this.previewState.audioStream = stream;
      this.previewState.isActive = true;
      
      // Store the actual device ID from the track
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const settings = audioTrack.getSettings();
        this.previewState.audioDeviceId = settings.deviceId || null;
        console.log('[EnhancedWrapper] Microphone preview started, actual deviceId:', settings.deviceId);
      }

      return stream;
    } catch (error: any) {
      console.error('[EnhancedWrapper] Microphone preview failed:', error.name, error.message);
      this.previewState.audioStream = null;
      throw error;
    }
  }

  /**
   * Stop microphone preview and release all resources
   */
  async stopMicrophonePreview(): Promise<void> {
    console.log('[EnhancedWrapper] Stopping microphone preview...');
    
    if (this.previewState.audioStream) {
      this.previewState.audioStream.getTracks().forEach(track => {
        track.stop();
        console.log('[EnhancedWrapper] Stopped preview audio track:', track.label);
      });
      this.previewState.audioStream = null;
    }
    
    // CRITICAL: Clear the device ID to prevent reuse in live meeting
    this.previewState.audioDeviceId = null;
  }

  /**
   * Stop all previews - MUST be called before joining live meeting
   */
  async stopAllPreviews(): Promise<void> {
    console.log('[EnhancedWrapper] Stopping all previews before live meeting...');
    
    await this.stopCameraPreview();
    await this.stopMicrophonePreview();
    
    this.previewState.isActive = false;
    
    // Add a small delay to ensure browser releases the devices
    await new Promise(resolve => setTimeout(resolve, 200));
    
    console.log('[EnhancedWrapper] All previews stopped and resources released');
  }

  // ============================================
  // LIVE MEETING MODE - Daily.co Integration
  // ============================================

  /**
   * Create a fresh Daily call object with clean state
   * NEVER reuses preview state or device IDs
   */
  private async createFreshCallObject(): Promise<DailyCall> {
    console.log('[EnhancedWrapper] Creating fresh Daily call object...');
    
    // Destroy any existing call object first
    if (this.liveMeetingState.callObject) {
      console.log('[EnhancedWrapper] Destroying existing call object...');
      try {
        await this.liveMeetingState.callObject.destroy();
      } catch (e) {
        console.warn('[EnhancedWrapper] Error destroying existing call object:', e);
      }
      this.liveMeetingState.callObject = null;
    }

    // Create new call object with automatic device selection
    // CRITICAL: Do NOT pass specific device IDs - let Daily.co handle it
    const callObject = DailyIframe.createCallObject({
      audioSource: true,
      videoSource: true,
      subscribeToTracksAutomatically: true,
      dailyConfig: {
        micAudioMode: 'speech',
        // avoidEval fixes Chrome CSP issues — critical for Chrome compatibility in daily-js 0.89+
        avoidEval: true,
      },
    });

    this.liveMeetingState.callObject = callObject;
    this.setupEventListeners(callObject);

    return callObject;
  }

  /**
   * Setup all Daily.co event listeners
   */
  private setupEventListeners(callObject: DailyCall): void {
    callObject
      .on('joined-meeting', this.handleJoinedMeeting.bind(this))
      .on('left-meeting', this.handleLeftMeeting.bind(this))
      .on('participant-joined', this.handleParticipantJoined.bind(this))
      .on('participant-left', this.handleParticipantLeft.bind(this))
      .on('participant-updated', this.handleParticipantUpdated.bind(this))
      .on('track-started', this.handleTrackStarted.bind(this))
      .on('track-stopped', this.handleTrackStopped.bind(this))
      .on('camera-error', this.handleCameraError.bind(this))
      .on('error', this.handleError.bind(this));
  }

  /**
   * Handle joined-meeting event - CRITICAL for media enablement
   */
  private async handleJoinedMeeting(event: any): Promise<void> {
    console.log('[EnhancedWrapper] Joined meeting event received');
    
    this.liveMeetingState.isJoined = true;
    this.liveMeetingState.isJoining = false;
    this.mediaEnablementRetryCount = 0;

    // CRITICAL: Explicitly enable media after join
    // This is the key fix - we MUST enable media after joining, not before
    await this.enableMediaAfterJoin();

    this.callbacks.onJoined?.();
  }

  /**
   * Enable media after joining - with retry logic
   * This is separated from the join process to ensure proper initialization
   * SKIPPED in viewer-only mode to avoid requesting media permissions
   */
  private async enableMediaAfterJoin(): Promise<void> {
    const callObject = this.liveMeetingState.callObject;
    if (!callObject) {
      console.error('[EnhancedWrapper] No call object for media enablement');
      return;
    }

    // Skip media enablement if in viewer-only mode
    const viewerOnlyMode = (this.liveMeetingState as any).viewerOnlyMode;
    if (viewerOnlyMode) {
      console.log('[EnhancedWrapper] Skipping media enablement (viewer-only mode)');
      return;
    }

    console.log('[EnhancedWrapper] Enabling media after join, attempt:', this.mediaEnablementRetryCount + 1);

    // Wait for Daily.co to be fully ready
    await new Promise(resolve => setTimeout(resolve, this.mediaEnablementDelay));

    // IMPORTANT: Enable audio FIRST. In Chrome, if audio initialisation fails it
    // cascades and also blocks video. Enabling audio first surfaces the real error
    // and lets video succeed independently if audio is the only problem.
    try {
      console.log('[EnhancedWrapper] Enabling local audio...');
      await callObject.setLocalAudio(true);
      this.liveMeetingState.localAudioEnabled = true;
      console.log('[EnhancedWrapper] Local audio enabled successfully');
    } catch (audioError: any) {
      console.error('[EnhancedWrapper] Failed to enable audio:', audioError.message);
      this.liveMeetingState.localAudioEnabled = false;
      // Don't return — still try video independently
    }

    try {
      // Enable video
      console.log('[EnhancedWrapper] Enabling local video...');
      await callObject.setLocalVideo(true);
      this.liveMeetingState.localVideoEnabled = true;
      console.log('[EnhancedWrapper] Local video enabled successfully');
    } catch (videoError: any) {
      console.error('[EnhancedWrapper] Failed to enable video:', videoError.message);
      this.liveMeetingState.localVideoEnabled = false;

      // Retry video once after a short delay
      if (this.mediaEnablementRetryCount < this.maxMediaRetries) {
        this.mediaEnablementRetryCount++;
        console.log('[EnhancedWrapper] Retrying video enablement...');
        await new Promise(resolve => setTimeout(resolve, 800));
        try {
          await callObject.setLocalVideo(true);
          this.liveMeetingState.localVideoEnabled = true;
          console.log('[EnhancedWrapper] Video enabled on retry');
        } catch (retryError) {
          console.error('[EnhancedWrapper] Video retry failed:', retryError);
        }
      }
    }

    // Notify about media state
    this.callbacks.onMediaStateChange?.(
      this.liveMeetingState.localVideoEnabled,
      this.liveMeetingState.localAudioEnabled
    );
  }

  /**
   * Handle left-meeting event
   */
  private handleLeftMeeting(event: any): void {
    console.log('[EnhancedWrapper] Left meeting event received');
    
    this.liveMeetingState.isJoined = false;
    this.liveMeetingState.localVideoEnabled = false;
    this.liveMeetingState.localAudioEnabled = false;

    this.callbacks.onLeft?.();
  }

  /**
   * Handle participant-joined event
   */
  private handleParticipantJoined(event: any): void {
    if (event?.participant) {
      console.log('[EnhancedWrapper] Participant joined:', event.participant.user_name);
      this.callbacks.onParticipantJoined?.(event.participant);
    }
  }

  /**
   * Handle participant-left event
   */
  private handleParticipantLeft(event: any): void {
    if (event?.participant) {
      console.log('[EnhancedWrapper] Participant left:', event.participant.user_name);
      this.callbacks.onParticipantLeft?.(event.participant);
    }
  }

  /**
   * Handle participant-updated event
   */
  private handleParticipantUpdated(event: any): void {
    if (event?.participant) {
      this.callbacks.onParticipantUpdated?.(event.participant);
    }
  }

  /**
   * Handle track-started event
   */
  private handleTrackStarted(event: any): void {
    console.log('[EnhancedWrapper] Track started:', event?.track?.kind, 'local:', event?.participant?.local);
    this.callbacks.onTrackStarted?.(event);
  }

  /**
   * Handle track-stopped event
   */
  private handleTrackStopped(event: any): void {
    console.log('[EnhancedWrapper] Track stopped:', event?.track?.kind);
    this.callbacks.onTrackStopped?.(event);
  }

  /**
   * Handle camera-error event
   */
  private handleCameraError(event: any): void {
    console.error('[EnhancedWrapper] Camera error:', event);
    this.liveMeetingState.localVideoEnabled = false;
    this.callbacks.onCameraError?.(event);
  }

  /**
   * Handle general error event
   */
  private handleError(event: any): void {
    console.error('[EnhancedWrapper] Error event:', event);
    this.callbacks.onError?.(event);
  }

  /**
   * Join a live meeting
   * CRITICAL: This MUST be called AFTER stopAllPreviews()
   */
  async joinMeeting(
    roomUrl: string,
    token: string,
    userName: string,
    viewerOnlyMode: boolean = false
  ): Promise<boolean> {
    console.log('[EnhancedWrapper] Joining meeting...', viewerOnlyMode ? '(viewer-only mode)' : '');

    // Verify previews are stopped
    if (this.previewState.isActive || this.previewState.videoStream || this.previewState.audioStream) {
      console.warn('[EnhancedWrapper] Previews still active, stopping them first...');
      await this.stopAllPreviews();
    }

    this.liveMeetingState.isJoining = true;

    try {
      // Store viewer-only state BEFORE joining
      (this.liveMeetingState as any).viewerOnlyMode = viewerOnlyMode;
      console.log('[EnhancedWrapper] Viewer-only mode set to:', viewerOnlyMode);

      // Create fresh call object
      const callObject = await this.createFreshCallObject();

      await callObject.join({
        url: roomUrl,
        token: token,
        userName: userName,
        startVideoOff: true,  // Always start off; media enabled explicitly afterwards
        startAudioOff: true,
      });

      return true;
    } catch (error: any) {
      console.error('[EnhancedWrapper] Failed to join meeting:', error);
      this.liveMeetingState.isJoining = false;
      throw error;
    }
  }

  /**
   * Leave the current meeting
   */
  async leaveMeeting(): Promise<void> {
    console.log('[EnhancedWrapper] Leaving meeting...');

    const callObject = this.liveMeetingState.callObject;
    if (callObject) {
      try {
        await callObject.leave();
        await callObject.destroy();
      } catch (e) {
        console.warn('[EnhancedWrapper] Error during leave/destroy:', e);
      }
      this.liveMeetingState.callObject = null;
    }

    this.liveMeetingState.isJoined = false;
    this.liveMeetingState.isJoining = false;
    this.liveMeetingState.localVideoEnabled = false;
    this.liveMeetingState.localAudioEnabled = false;
  }

  /**
   * Toggle local video
   */
  async toggleVideo(): Promise<boolean> {
    const callObject = this.liveMeetingState.callObject;
    if (!callObject || !this.liveMeetingState.isJoined) {
      console.warn('[EnhancedWrapper] Cannot toggle video - not in meeting');
      return this.liveMeetingState.localVideoEnabled;
    }

    const newState = !this.liveMeetingState.localVideoEnabled;
    console.log('[EnhancedWrapper] Toggling video to:', newState);

    try {
      await callObject.setLocalVideo(newState);
      this.liveMeetingState.localVideoEnabled = newState;
      this.callbacks.onMediaStateChange?.(newState, this.liveMeetingState.localAudioEnabled);
      return newState;
    } catch (error) {
      console.error('[EnhancedWrapper] Failed to toggle video:', error);
      return this.liveMeetingState.localVideoEnabled;
    }
  }

  /**
   * Set video to specific state (for host controls)
   */
  async setVideo(enabled: boolean): Promise<boolean> {
    const callObject = this.liveMeetingState.callObject;
    if (!callObject || !this.liveMeetingState.isJoined) {
      console.warn('[EnhancedWrapper] Cannot set video - not in meeting');
      return this.liveMeetingState.localVideoEnabled;
    }

    console.log('[EnhancedWrapper] Setting video to:', enabled);

    try {
      await callObject.setLocalVideo(enabled);
      this.liveMeetingState.localVideoEnabled = enabled;
      this.callbacks.onMediaStateChange?.(enabled, this.liveMeetingState.localAudioEnabled);
      return enabled;
    } catch (error) {
      console.error('[EnhancedWrapper] Failed to set video:', error);
      return this.liveMeetingState.localVideoEnabled;
    }
  }

  /**
   * Toggle local audio
   */
  async toggleAudio(): Promise<boolean> {
    const callObject = this.liveMeetingState.callObject;
    if (!callObject || !this.liveMeetingState.isJoined) {
      console.warn('[EnhancedWrapper] Cannot toggle audio - not in meeting');
      return this.liveMeetingState.localAudioEnabled;
    }

    const newState = !this.liveMeetingState.localAudioEnabled;
    console.log('[EnhancedWrapper] Toggling audio to:', newState);

    try {
      await callObject.setLocalAudio(newState);
      this.liveMeetingState.localAudioEnabled = newState;
      this.callbacks.onMediaStateChange?.(this.liveMeetingState.localVideoEnabled, newState);
      return newState;
    } catch (error) {
      console.error('[EnhancedWrapper] Failed to toggle audio:', error);
      return this.liveMeetingState.localAudioEnabled;
    }
  }

  /**
   * Set audio to specific state (for host controls)
   */
  async setAudio(enabled: boolean): Promise<boolean> {
    const callObject = this.liveMeetingState.callObject;
    if (!callObject || !this.liveMeetingState.isJoined) {
      console.warn('[EnhancedWrapper] Cannot set audio - not in meeting');
      return this.liveMeetingState.localAudioEnabled;
    }

    console.log('[EnhancedWrapper] Setting audio to:', enabled);

    try {
      await callObject.setLocalAudio(enabled);
      this.liveMeetingState.localAudioEnabled = enabled;
      this.callbacks.onMediaStateChange?.(this.liveMeetingState.localVideoEnabled, enabled);
      return enabled;
    } catch (error) {
      console.error('[EnhancedWrapper] Failed to set audio:', error);
      return this.liveMeetingState.localAudioEnabled;
    }
  }

  /**
   * Start screen sharing
   */
  async startScreenShare(): Promise<boolean> {
    const callObject = this.liveMeetingState.callObject;
    if (!callObject || !this.liveMeetingState.isJoined) {
      console.warn('[EnhancedWrapper] Cannot start screen share - not in meeting');
      return false;
    }

    try {
      await callObject.startScreenShare();
      return true;
    } catch (error) {
      console.error('[EnhancedWrapper] Failed to start screen share:', error);
      return false;
    }
  }

  /**
   * Stop screen sharing
   */
  async stopScreenShare(): Promise<void> {
    const callObject = this.liveMeetingState.callObject;
    if (!callObject) return;

    try {
      await callObject.stopScreenShare();
    } catch (error) {
      console.error('[EnhancedWrapper] Failed to stop screen share:', error);
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Build sanitized video constraints
   * NEVER uses device IDs that might be invalid
   */
  private buildSanitizedVideoConstraints(preferredDeviceId?: string): MediaTrackConstraints | boolean {
    // If no preferred device, use simple constraints
    if (!preferredDeviceId || preferredDeviceId === '' || preferredDeviceId === 'default') {
      return {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
      };
    }

    // If we have a device ID, validate it first
    // Use 'ideal' instead of 'exact' to allow fallback
    return {
      deviceId: { ideal: preferredDeviceId },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    };
  }

  /**
   * Build sanitized audio constraints
   */
  private buildSanitizedAudioConstraints(preferredDeviceId?: string): MediaTrackConstraints | boolean {
    // If no preferred device, use simple constraints
    if (!preferredDeviceId || preferredDeviceId === '' || preferredDeviceId === 'default') {
      return {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
    }

    // If we have a device ID, use 'ideal' to allow fallback
    return {
      deviceId: { ideal: preferredDeviceId },
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
  }

  /**
   * Get available video devices
   */
  async getVideoDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'videoinput');
    } catch (error) {
      console.error('[EnhancedWrapper] Failed to enumerate video devices:', error);
      return [];
    }
  }

  /**
   * Get available audio input devices
   */
  async getAudioInputDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'audioinput');
    } catch (error) {
      console.error('[EnhancedWrapper] Failed to enumerate audio devices:', error);
      return [];
    }
  }

  /**
   * Get current state
   */
  getState(): { preview: PreviewState; live: LiveMeetingState } {
    return {
      preview: { ...this.previewState },
      live: { ...this.liveMeetingState },
    };
  }

  /**
   * Get the Daily call object (for advanced usage)
   */
  getCallObject(): DailyCall | null {
    return this.liveMeetingState.callObject;
  }

  /**
   * Get participants from Daily
   */
  getParticipants(): Record<string, DailyParticipant> | null {
    return this.liveMeetingState.callObject?.participants() || null;
  }

  /**
   * Get local participant
   */
  getLocalParticipant(): DailyParticipant | null {
    return this.liveMeetingState.callObject?.participants()?.local || null;
  }

  /**
   * Check if video is enabled
   */
  isVideoEnabled(): boolean {
    return this.liveMeetingState.localVideoEnabled;
  }

  /**
   * Check if audio is enabled
   */
  isAudioEnabled(): boolean {
    return this.liveMeetingState.localAudioEnabled;
  }

  /**
   * Check if joined
   */
  isJoined(): boolean {
    return this.liveMeetingState.isJoined;
  }

  /**
   * Check if joining
   */
  isJoining(): boolean {
    return this.liveMeetingState.isJoining;
  }

  /**
   * Send app message to participants
   */
  async sendAppMessage(data: any, to: string = '*'): Promise<void> {
    const callObject = this.liveMeetingState.callObject;
    if (!callObject) {
      console.error('[EnhancedWrapper] Cannot send app message: not in meeting');
      return;
    }

    try {
      await callObject.sendAppMessage(data, to);
      console.log('[EnhancedWrapper] Sent app message:', data, 'to:', to);
    } catch (error) {
      console.error('[EnhancedWrapper] Failed to send app message:', error);
      throw error;
    }
  }

  /**
   * Update participant settings (for host control)
   */
  async updateParticipant(sessionId: string, updates: any): Promise<void> {
    const callObject = this.liveMeetingState.callObject;
    if (!callObject) {
      console.error('[EnhancedWrapper] Cannot update participant: not in meeting');
      return;
    }

    try {
      await callObject.updateParticipant(sessionId, updates);
      console.log('[EnhancedWrapper] Updated participant:', sessionId, updates);
    } catch (error) {
      console.error('[EnhancedWrapper] Failed to update participant:', error);
      throw error;
    }
  }

  /**
   * Cleanup everything
   */
  async destroy(): Promise<void> {
    console.log('[EnhancedWrapper] Destroying wrapper...');
    
    await this.stopAllPreviews();
    await this.leaveMeeting();
    
    this.callbacks = {};
  }
}

// Export singleton factory
let wrapperInstance: EnhancedDailyVideoWrapper | null = null;

export function getEnhancedDailyVideoWrapper(callbacks?: WrapperCallbacks): EnhancedDailyVideoWrapper {
  if (!wrapperInstance) {
    wrapperInstance = new EnhancedDailyVideoWrapper(callbacks);
  }
  return wrapperInstance;
}

export function destroyEnhancedDailyVideoWrapper(): void {
  if (wrapperInstance) {
    wrapperInstance.destroy();
    wrapperInstance = null;
  }
}

export default EnhancedDailyVideoWrapper;