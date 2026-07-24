import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Card, CardContent } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { useDailyRoom, DailyParticipantInfo } from '../useDailyRoom';
import { isLiveKitBackend } from '../videoBackend';
import { HostControlPanel } from './HostControlPanel';
import { RoomChatSidebar } from './RoomChatSidebar';
import { ReactionButton } from './MeetingReactions';
import { VirtualBackgroundButton } from './VirtualBackgroundButton';
import { AudioOutputButton } from './AudioOutputButton';
import { AudioOutputProvider, useAudioOutput } from '../AudioOutputContext';
import {
  Mic, MicOff, Video, VideoOff, Phone, PhoneOff,
  Monitor, MonitorOff, Users, Clock, Loader2, AlertCircle,
  Maximize2, Minimize2, Settings, Volume2, VolumeX, CheckCircle2,
  XCircle, HelpCircle, X, MessageSquare, Hand, Circle, Square, Pin, Sparkles, Shield, PictureInPicture2, Headphones
} from 'lucide-react';
import { supabase } from '@rekindle/supabase';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { useAuth } from '@rekindle/features/AuthContext';
import { useActiveCallOptional } from '../ActiveCallContext';
import { useToast } from '@rekindle/ui/use-toast';
import { Alert, AlertDescription } from '@rekindle/ui/alert';
import { Progress } from '@rekindle/ui/progress';

interface DailyVideoCallProps {
  roomName: string;
  userName: string;
  userId: string;
  isHost: boolean;
  sessionId?: string;
  onCallEnd?: () => void;
  onSessionComplete?: (duration: number) => void;
  showControls?: boolean;
  autoJoin?: boolean;
  meetingId?: string;
  /** LiveKit role-derivation: which DB table holds this meeting's host_id.
   *  Defaults to 'meeting' (the `meetings` table). */
  meetingKind?: 'meeting' | 'ministry_meeting' | 'channel_meeting' | 'channel';
  showParticipantList?: boolean;
  onAdmitParticipant?: (participantId: string) => void;
  onRemoveParticipant?: (participantId: string) => void;
  /** Whether the meeting was created with recording enabled (subscription-gated) */
  enableRecording?: boolean;
  /** When set (webinar mode, host only), push an RTMP stream to this URL so attendees can watch via HLS */
  liveStreamRtmpUrl?: string;
  /** Fired when a side panel (chat or host controls) opens/closes, so the parent
   *  overlay can hide its own chrome (Copy Link / End) that would collide with it. */
  onSidePanelToggle?: (open: boolean) => void;
  /** Broadcast a reaction emoji — wired to the mini-player's reaction button so the
   *  host can react while the call is minimized (the overlay bar is hidden then). */
  onReact?: (emoji: string) => void;
}

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

// Audio Status Indicator Component
const AudioStatusIndicator: React.FC<{
  status: 'detecting' | 'active' | 'blocked' | 'inactive';
  level?: number;
}> = ({ status, level = 0 }) => {
  const { t } = useLanguage();
  const getStatusConfig = () => {
    switch (status) {
      case 'detecting':
        return {
          icon: HelpCircle,
          text: t('dailyVideoCall', 'detectingMicrophone', 'Detecting microphone...'),
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-50 border-yellow-200'
        };
      case 'active':
        return {
          icon: CheckCircle2,
          text: t('dailyVideoCall', 'microphoneActive', 'Microphone active'),
          color: 'text-green-500',
          bgColor: 'bg-green-50 border-green-200'
        };
      case 'blocked':
        return {
          icon: XCircle,
          text: t('dailyVideoCall', 'microphoneBlocked', 'Microphone blocked'),
          color: 'text-red-500',
          bgColor: 'bg-red-50 border-red-200'
        };
      case 'inactive':
        return {
          icon: MicOff,
          text: t('dailyVideoCall', 'microphoneInactive', 'Microphone inactive'),
          color: 'text-gray-500',
          bgColor: 'bg-gray-50 border-gray-200'
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-3 p-3 border rounded-lg ${config.bgColor}`}>
      <Icon className={`h-5 w-5 ${config.color}`} />
      <div className="flex-1">
        <p className={`text-sm font-medium ${config.color}`}>{config.text}</p>
        {status === 'active' && level > 0 && (
          <div className="mt-1">
            <Progress value={level} className="h-1" />
          </div>
        )}
      </div>
    </div>
  );
};

// Test Microphone Component - releases resources before joining
const TestMicrophone: React.FC<{
  onTestComplete: (success: boolean) => void;
  onStopTest?: () => void;
}> = ({ onTestComplete, onStopTest }) => {
  const { t } = useLanguage();
  const [isTesting, setIsTesting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [status, setStatus] = useState<'detecting' | 'active' | 'blocked'>('detecting');
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const stopTest = useCallback(() => {
    console.log('[TestMicrophone] Stopping test and releasing resources...');
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('[TestMicrophone] Stopped track:', track.kind);
      });
      streamRef.current = null;
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }
    
    analyserRef.current = null;
    setIsTesting(false);
    setAudioLevel(0);
    
    onStopTest?.();
  }, [onStopTest]);

  const startTest = async () => {
    // Stop any existing test first
    stopTest();
    
    setIsTesting(true);
    setStatus('detecting');

    try {
      console.log('[TestMicrophone] Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      streamRef.current = stream;
      console.log('[TestMicrophone] Got microphone stream');

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      
      const analyser = audioContext.createAnalyser();
      analyserRef.current = analyser;
      analyser.fftSize = 256;
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevel = () => {
        if (!analyserRef.current || !streamRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const level = Math.min(100, (average / 128) * 100);
        
        setAudioLevel(level);
        setStatus('active');
        
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
      onTestComplete(true);
      console.log('[TestMicrophone] Test started successfully');

    } catch (error) {
      console.error('[TestMicrophone] Microphone test failed:', error);
      setStatus('blocked');
      onTestComplete(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTest();
    };
  }, [stopTest]);

  // Expose stopTest for parent to call
  useEffect(() => {
    // Store reference for external access
    (window as any).__stopMicTest = stopTest;
    return () => {
      delete (window as any).__stopMicTest;
    };
  }, [stopTest]);

  return (
    <div className="space-y-3">
      <AudioStatusIndicator status={status} level={audioLevel} />
      
      <div className="flex gap-2">
        {!isTesting ? (
          <Button onClick={startTest} variant="outline" className="w-full">
            <Mic className="h-4 w-4 mr-2" />
            {t('dailyVideoCall', 'testMicrophone', 'Test Microphone')}
          </Button>
        ) : (
          <Button onClick={stopTest} variant="outline" className="w-full">
            <MicOff className="h-4 w-4 mr-2" />
            {t('dailyVideoCall', 'stopTest', 'Stop Test')}
          </Button>
        )}
      </div>

      {status === 'blocked' && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t('dailyVideoCall', 'micBlockedHelp', 'Microphone access is blocked. Please enable microphone permissions in your browser settings.')}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

// Video Status Indicator Component
const VideoStatusIndicator: React.FC<{
  status: 'inactive' | 'detecting' | 'active' | 'blocked';
}> = ({ status }) => {
  const { t } = useLanguage();
  const getStatusConfig = () => {
    switch (status) {
      case 'detecting':
        return {
          icon: HelpCircle,
          text: t('dailyVideoCall', 'detectingCamera', 'Detecting camera...'),
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-50 border-yellow-200'
        };
      case 'active':
        return {
          icon: CheckCircle2,
          text: t('dailyVideoCall', 'cameraActive', 'Camera active'),
          color: 'text-green-500',
          bgColor: 'bg-green-50 border-green-200'
        };
      case 'blocked':
        return {
          icon: XCircle,
          text: t('dailyVideoCall', 'cameraBlocked', 'Camera blocked'),
          color: 'text-red-500',
          bgColor: 'bg-red-50 border-red-200'
        };
      case 'inactive':
      default:
        return {
          icon: VideoOff,
          text: t('dailyVideoCall', 'cameraInactive', 'Camera inactive'),
          color: 'text-gray-500',
          bgColor: 'bg-gray-50 border-gray-200'
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-3 p-3 border rounded-lg ${config.bgColor}`}>
      <Icon className={`h-5 w-5 ${config.color}`} />
      <p className={`text-sm font-medium ${config.color}`}>{config.text}</p>
    </div>
  );
};

// Serializable camera device info (MediaDeviceInfo is not cloneable)
interface CameraDevice {
  deviceId: string;
  label: string;
  kind: string;
  groupId: string;
}

// Test Camera Component - releases resources before joining
const TestCamera: React.FC<{
  onTestComplete: (success: boolean) => void;
  onStopTest?: () => void;
}> = ({ onTestComplete, onStopTest }) => {
  const { t } = useLanguage();
  const [isTesting, setIsTesting] = useState(false);
  const [status, setStatus] = useState<'inactive' | 'detecting' | 'active' | 'blocked'>('inactive');
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Effect to attach stream to video element when both are available
  useEffect(() => {
    const attachStream = async () => {
      if (videoRef.current && streamRef.current && isTesting) {
        console.log('[TestCamera] Attaching stream to video element');
        try {
          videoRef.current.srcObject = streamRef.current;
          await videoRef.current.play();
          console.log('[TestCamera] Video playback started successfully');
        } catch (e) {
          console.error('[TestCamera] Error playing video:', e);
        }
      }
    };
    
    attachStream();
  }, [isTesting, status]); // Re-run when testing state or status changes

  const stopTest = useCallback(() => {
    console.log('[TestCamera] Stopping test and releasing resources...');
    
    // First, clear the video element
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('[TestCamera] Stopped track:', track.kind, track.label);
      });
      streamRef.current = null;
    }
    
    setIsTesting(false);
    setStatus('inactive');
    
    onStopTest?.();
  }, [onStopTest]);

  // Get available cameras - extract serializable properties only
  const getAvailableCameras = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      // Extract only serializable properties from MediaDeviceInfo objects
      const cameras: CameraDevice[] = devices
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${device.deviceId.slice(0, 8)}`,
          kind: device.kind,
          groupId: device.groupId
        }));
      
      console.log('[TestCamera] Available cameras:', cameras);
      setAvailableCameras(cameras);
      
      if (cameras.length > 0 && !selectedCameraId) {
        setSelectedCameraId(cameras[0].deviceId);
      }
      
      return cameras;
    } catch (error) {
      console.error('[TestCamera] Error getting cameras:', error);
      return [];
    }
  };


  const startTest = async (cameraId?: string) => {
    // Stop any existing test first
    stopTest();
    
    // Small delay to ensure cleanup is complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    setIsTesting(true);
    setStatus('detecting');

    try {
      console.log('[TestCamera] Requesting camera access...', cameraId ? `deviceId: ${cameraId}` : 'default camera');
      
      const constraints: MediaStreamConstraints = {
        video: cameraId 
          ? { deviceId: { exact: cameraId } } 
          : { 
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user'
            }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      const videoTrack = stream.getVideoTracks()[0];
      console.log('[TestCamera] Got camera stream, track:', videoTrack?.label, 'enabled:', videoTrack?.enabled, 'readyState:', videoTrack?.readyState);

      // Directly attach to video element if available
      if (videoRef.current) {
        console.log('[TestCamera] Video ref available, attaching stream directly');
        videoRef.current.srcObject = stream;
        
        // Wait for video to be ready
        videoRef.current.onloadedmetadata = () => {
          console.log('[TestCamera] Video metadata loaded, playing...');
          videoRef.current?.play()
            .then(() => {
              console.log('[TestCamera] Video playback started');
            })
            .catch(e => {
              console.error('[TestCamera] Play failed:', e);
            });
        };
      }
      
      // Get available cameras after permission is granted
      await getAvailableCameras();
      
      setStatus('active');
      onTestComplete(true);
      console.log('[TestCamera] Test started successfully');

    } catch (error: any) {
      console.error('[TestCamera] Camera test failed:', error?.name, error?.message);
      setStatus('blocked');
      setIsTesting(false);
      onTestComplete(false);
    }
  };

  // Switch camera
  const switchCamera = async (newCameraId: string) => {
    console.log('[TestCamera] Switching to camera:', newCameraId);
    setSelectedCameraId(newCameraId);
    if (isTesting) {
      await startTest(newCameraId);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTest();
    };
  }, [stopTest]);

  // Expose stopTest for parent to call
  useEffect(() => {
    (window as any).__stopCameraTest = stopTest;
    return () => {
      delete (window as any).__stopCameraTest;
    };
  }, [stopTest]);

  return (
    <div className="space-y-3">
      {/* Video Preview - Always render the video element, just hide when not active */}
      <div className={`relative aspect-video bg-gray-900 rounded-lg overflow-hidden ${!isTesting ? 'hidden' : ''}`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover mirror"
          style={{ transform: 'scaleX(-1)' }} // Mirror the preview
        />
        {status === 'active' && (
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
            <Badge className="bg-green-500/80 text-white text-xs">
              <Video className="h-3 w-3 mr-1" />
              {t('dailyVideoCall', 'preview', 'Preview')}
            </Badge>
          </div>
        )}
        {status === 'detecting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
            <div className="text-center text-white">
              <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
              <p className="text-sm">{t('dailyVideoCall', 'startingCamera', 'Starting camera...')}</p>
            </div>
          </div>
        )}
      </div>
      
      {/* Camera not active placeholder */}
      {!isTesting && (
        <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
          <div className="text-center text-gray-500">
            <VideoOff className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('dailyVideoCall', 'cameraPreviewPlaceholder', 'Camera preview will appear here')}</p>
          </div>
        </div>
      )}
      
      <VideoStatusIndicator status={status} />
      
      {/* Camera selector - only show when testing and multiple cameras available */}
      {isTesting && availableCameras.length > 1 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">{t('dailyVideoCall', 'selectCamera', 'Select Camera')}</label>
          <select
            value={selectedCameraId}
            onChange={(e) => switchCamera(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {availableCameras.map((camera, index) => (
              <option key={camera.deviceId} value={camera.deviceId}>
                {camera.label || t('dailyVideoCall', 'cameraN', 'Camera {n}').replace('{n}', String(index + 1))}
              </option>
            ))}
          </select>
        </div>
      )}
      
      <div className="flex gap-2">
        {!isTesting ? (
          <Button onClick={() => startTest(selectedCameraId || undefined)} variant="outline" className="w-full">
            <Video className="h-4 w-4 mr-2" />
            {t('dailyVideoCall', 'testCamera', 'Test Camera')}
          </Button>
        ) : (
          <Button onClick={stopTest} variant="outline" className="w-full">
            <VideoOff className="h-4 w-4 mr-2" />
            {t('dailyVideoCall', 'stopPreview', 'Stop Preview')}
          </Button>
        )}
      </div>

      {status === 'blocked' && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t('dailyVideoCall', 'cameraBlockedHelp', 'Camera access is blocked. Please enable camera permissions in your browser settings.')}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};





// Waiting Room Component
const WaitingRoom: React.FC<{
  roomName: string;
  userName: string;
  isHost: boolean;
  hostHasJoined: boolean;
  onCancel: () => void;
}> = ({ roomName, userName, isHost, hostHasJoined, onCancel }) => {
  const { t } = useLanguage();
  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardContent className="p-8 text-center">
        <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center mb-6">
          <Users className="h-10 w-10 text-white" />
        </div>

        <h3 className="text-xl font-semibold mb-2">
          {isHost ? t('dailyVideoCall', 'readyToStart', 'Ready to Start') : t('dailyVideoCall', 'waitingRoom', 'Waiting Room')}
        </h3>

        <p className="text-gray-500 mb-6">
          {isHost
            ? t('dailyVideoCall', 'aboutToStartMeeting', 'You\'re about to start the meeting "{name}"').replace('{name}', String(roomName))
            : hostHasJoined
              ? t('dailyVideoCall', 'hostWillLetYouIn', 'The host will let you in shortly...')
              : t('dailyVideoCall', 'waitingForHostToStart', 'Waiting for the host to start the meeting...')
          }
        </p>

        {!isHost && (
          <div className="mb-6">
            <div className="flex justify-center mb-4">
              <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
            </div>
            <p className="text-sm text-gray-400">
              {t('dailyVideoCall', 'joinedAs', 'Joined as:')} <strong>{userName}</strong>
            </p>
          </div>
        )}

        <div className="flex gap-3">
          {isHost ? (
            <Button 
              onClick={() => {}} 
              size="lg"
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              <Video className="h-5 w-5 mr-2" />
              {t('dailyVideoCall', 'startMeeting', 'Start Meeting')}
            </Button>
          ) : null}

          <Button
            onClick={onCancel}
            variant="outline"
            size="lg"
            className={isHost ? 'flex-1' : 'w-full'}
          >
            {t('dailyVideoCall', 'cancel', 'Cancel')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Participant Video Component with Audio Element
const ParticipantVideo: React.FC<{
  participant: DailyParticipantInfo;
  isLarge?: boolean;
  /** Fill the parent box (w/h 100%) instead of using a fixed aspect ratio.
   *  Used by the mini-player, whose parent already sets the frame size — without
   *  this the aspect-ratio box collapses to zero width and the video goes blank. */
  fill?: boolean;
  /** Hide the name/status overlay (the mini-player draws its own title bar). */
  hideOverlay?: boolean;
  onParticipantJoin?: (participantId: string, userName: string) => void;
  onParticipantLeave?: (participantId: string) => void;
}> = ({ participant, isLarge = false, fill = false, hideOverlay = false, onParticipantJoin, onParticipantLeave }) => {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasJoined, setHasJoined] = useState(false);
  const [videoAttached, setVideoAttached] = useState(false);

  // Attach video track - with retry logic for tracks that aren't immediately ready
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 10;
    let retryTimeout: NodeJS.Timeout | null = null;

    const attachVideo = () => {
      if (!videoRef.current) {
        console.log('[ParticipantVideo] No video ref for:', participant.userName);
        return false;
      }

      // Try to get the video track
      const track = participant.videoTrack;

      if (track && track.readyState === 'live') {
        // FLICKER FIX: if this exact track is already attached, do nothing.
        // Reassigning srcObject to a fresh MediaStream reloads the <video> and
        // flickers on every participant update (mute/unmute, roster refresh, etc.).
        const cur = videoRef.current.srcObject;
        if (cur instanceof MediaStream && cur.getVideoTracks()[0] === track) {
          setVideoAttached(true);
          return true;
        }
        try {
          videoRef.current.srcObject = new MediaStream([track]);
          videoRef.current.play().catch(() => { /* autoplay may defer */ });
          setVideoAttached(true);
          return true;
        } catch (e) {
          console.error('[ParticipantVideo] Error attaching video:', e);
        }
      }

      return false;
    };

    const tryAttach = () => {
      if (attachVideo()) {
        return; // Success
      }
      
      // Retry if we have a track but it's not ready yet
      if (participant.videoTrack && retryCount < maxRetries) {
        retryCount++;
        console.log('[ParticipantVideo] Retrying video attach for:', participant.userName, 'attempt:', retryCount);
        retryTimeout = setTimeout(tryAttach, 500);
      }
    };

    if (participant.hasVideo || participant.videoTrack) {
      tryAttach();
    } else {
      // No video - clear the element
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setVideoAttached(false);
    }

    return () => {
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
    // `fill` is included so switching into the mini-player (a fresh, empty <video>)
    // re-runs the attach — otherwise the host's own tile could stay a black frame
    // until the camera was toggled (the old "re-toggle to show" bug).
  }, [participant.videoTrack, participant.hasVideo, participant.userName, participant.sessionId, fill]);

  // NOTE: audio is intentionally NOT played here. It's handled by the persistent
  // RemoteAudioLayer so it survives layout changes (screen share / pin / reflow)
  // that unmount these tiles. Playing it here too would double up.

  // Track join/leave
  useEffect(() => {
    if (!participant.isLocal && participant.sessionId) {
      if (participant.isInCall && !hasJoined) {
        onParticipantJoin?.(participant.sessionId, participant.userName);
        setHasJoined(true);
      } else if (!participant.isInCall && hasJoined) {
        onParticipantLeave?.(participant.sessionId);
        setHasJoined(false);
      }
    }
  }, [participant.isInCall, participant.sessionId, participant.userName, participant.isLocal, hasJoined, onParticipantJoin, onParticipantLeave]);

  // Determine if we should show video
  const showVideo = videoAttached || participant.hasVideo;

  return (
    <div className={`relative bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center ${fill ? 'w-full h-full' : isLarge ? 'aspect-video' : 'aspect-square'}`}>
      {/* Always render video element, just hide if no video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={participant.isLocal}
        // A freshly-mounted <video> (e.g. the mini-player tile) sometimes has its
        // srcObject set before it can play; nudge it to play once it's ready so the
        // frame actually appears without needing a camera re-toggle.
        onLoadedMetadata={() => { videoRef.current?.play().catch(() => {}); }}
        onCanPlay={() => { videoRef.current?.play().catch(() => {}); }}
        className={`w-full h-full ${fill ? 'object-cover' : 'object-contain'} ${showVideo ? '' : 'hidden'}`}
      />
      
      {/* Avatar fallback when no video */}
      {!showVideo && (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-600 to-indigo-700">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-white/20 flex items-center justify-center text-white text-2xl font-bold mb-2">
              {participant.userName.charAt(0).toUpperCase()}
            </div>
            <p className="text-white text-sm">{participant.userName}</p>
          </div>
        </div>
      )}
      
      {!hideOverlay && (
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
        <div className="flex items-center justify-between">
          <span className="text-white text-sm font-medium truncate">
            {participant.userName}
            {participant.isLocal && ` ${t('dailyVideoCall', 'youSuffix', '(You)')}`}
          </span>
          <div className="flex items-center gap-1">
            {participant.hasAudio ? (
              <Mic className="h-4 w-4 text-green-400" />
            ) : (
              <MicOff className="h-4 w-4 text-red-400" />
            )}
            {participant.hasScreenShare && (
              <Monitor className="h-4 w-4 text-blue-400" />
            )}
          </div>
        </div>
      </div>
      )}

      {!hideOverlay && participant.isOwner && (
        <Badge className="absolute top-2 left-2 bg-amber-500 text-xs">{t('dailyVideoCall', 'host', 'Host')}</Badge>
      )}
    </div>
  );
};

// Renders a participant's SCREEN-SHARE track as the main stage. Previously the UI
// only showed a Monitor *icon* when hasScreenShare was true — the shared screen
// track (participant.screenVideoTrack) was never bound to a <video>, so no one
// could actually see the shared screen. Attaches with a short retry because the
// remote track can arrive a beat after the participant object updates.
const ScreenShareView: React.FC<{ participant: DailyParticipantInfo }> = ({ participant }) => {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const track = participant.screenVideoTrack;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attach = () => {
      const el = videoRef.current;
      if (el && track && track.readyState === 'live') {
        const cur = el.srcObject;
        if (!(cur instanceof MediaStream) || cur.getVideoTracks()[0] !== track) {
          el.srcObject = new MediaStream([track]);
          el.play().catch(() => { /* autoplay may defer until interaction */ });
        }
        return;
      }
      if (tries++ < 20) timer = setTimeout(attach, 150); // ~3s window
    };
    attach();
    return () => { if (timer) clearTimeout(timer); if (videoRef.current) videoRef.current.srcObject = null; };
  }, [participant.screenVideoTrack]);

  return (
    <div className="flex flex-col h-full gap-2 p-2">
      <div className="relative flex-1 min-h-0 flex items-center justify-center bg-black rounded-xl overflow-hidden">
        {/* absolute inset-0 pins the video to the container box, so a large shared
            screen (e.g. 2560x1440) is letterboxed to fit (object-contain) and can
            NEVER grow the panel to its native resolution. */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-contain"
        />
        <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-2 text-white/90 text-xs bg-black/50 backdrop-blur-sm px-3 py-1 rounded-full">
          <Monitor className="h-3.5 w-3.5" />
          {t('dailyVideoCall', 'isSharingScreen', '{name} is sharing their screen').replace('{name}', participant.userName)}
        </div>
      </div>
    </div>
  );
};

// One hidden <audio> for a remote participant, kept alive regardless of the
// visual layout. Audio MUST NOT live inside the video tiles: any layout that
// unmounts them (a screen share taking the stage, pin/unpin, grid reflow) would
// otherwise silently cut that participant's audio.
const RemoteAudio: React.FC<{ participant: DailyParticipantInfo }> = ({ participant }) => {
  const ref = useRef<HTMLAudioElement>(null);
  const { registerAudioElement, unregisterAudioElement } = useAudioOutput();
  useEffect(() => {
    const track = participant.audioTrack;
    const el = ref.current;
    if (!el || !track || track.readyState !== 'live') return;
    el.srcObject = new MediaStream([track]);
    el.play().catch(() => {
      // Autoplay can be blocked until a user gesture — resume on the next click.
      const resume = () => { el.play().catch(() => {}); document.removeEventListener('click', resume); };
      document.addEventListener('click', resume);
    });
    return () => { if (el) el.srcObject = null; };
  }, [participant.audioTrack]);
  // Registered separately from the track-attach effect so a device selected
  // mid-call is applied to this element as soon as it exists, not just on join.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    registerAudioElement(el);
    return () => unregisterAudioElement(el);
  }, [registerAudioElement, unregisterAudioElement]);
  return <audio ref={ref} autoPlay playsInline className="hidden" />;
};

// Always-mounted audio for every remote participant, independent of the grid /
// pinned / screen-share view.
const RemoteAudioLayer: React.FC<{ participants: DailyParticipantInfo[] }> = ({ participants }) => (
  <>{participants.filter((p) => !p.isLocal && p.audioTrack).map((p) => <RemoteAudio key={p.sessionId} participant={p} />)}</>
);


const DailyVideoCallInner: React.FC<DailyVideoCallProps> = ({
  roomName,
  userName,
  userId,
  isHost,
  sessionId,
  onCallEnd,
  onSessionComplete,
  showControls = true,
  autoJoin = false,
  meetingId,
  meetingKind,
  showParticipantList = false,
  onAdmitParticipant,
  onRemoveParticipant,
  enableRecording = false,
  liveStreamRtmpUrl,
  onSidePanelToggle,
  onReact,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  // iOS Safari has no Fullscreen API for arbitrary elements (only <video>), so
  // requestFullscreen() throws there. Detect support once and hide the button
  // rather than offering a control that silently does nothing on tap.
  const [supportsFullscreen] = useState(() =>
    typeof document !== 'undefined' &&
    !!(document.documentElement.requestFullscreen ||
      (document.documentElement as any).webkitRequestFullscreen)
  );
  const [micTestComplete, setMicTestComplete] = useState(false);
  const [cameraTestComplete, setCameraTestComplete] = useState(false);
  const [audioStatus, setAudioStatus] = useState<'detecting' | 'active' | 'blocked' | 'inactive'>('inactive');
  const [hostHasJoined, setHostHasJoined] = useState(isHost);
  const [meetingEnded, setMeetingEnded] = useState(false);
  const [waitingParticipants, setWaitingParticipants] = useState<DailyParticipantInfo[]>([]);
  const [recordingStatus, setRecordingStatus] = useState<'idle' | 'starting' | 'recording' | 'stopping' | 'error'>('idle');
  // True while the host is pushing the call's composite to Mux (which records it).
  // Replaces Daily cloud recording, which this app no longer uses.
  const [isMuxRecording, setIsMuxRecording] = useState(false);

  // Enhanced control panels
  const [showHostControls, setShowHostControls] = useState(false);
  const [showChat, setShowChat] = useState(false);

  // Tell the parent overlay whenever a side panel is open so it can hide its own
  // top-right chrome (Copy Link / End for All), which would otherwise sit under it.
  useEffect(() => {
    onSidePanelToggle?.(showChat || showHostControls);
  }, [showChat, showHostControls, onSidePanelToggle]);

  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { t } = useLanguage();
  const { user: authUser } = useAuth();  // members can attach files; guests cannot
  const activeCallCtx = useActiveCallOptional(); // present when hosted by ActiveCallHost
  const { selectedDeviceId: selectedAudioOutputId } = useAudioOutput();


  // Track participant join function
  const trackParticipantJoin = async (participantId: string, participantUserName: string) => {
    if (!meetingId) return;
    
    try {
      const { data: existing } = await supabase
        .from('meeting_participants')
        .select('id')
        .eq('meeting_id', meetingId)
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('meeting_participants')
          .update({
            is_active: true,
            left_at: null
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('meeting_participants')
          .insert({
            meeting_id: meetingId,
            user_id: userId,
            user_name: participantUserName,
            is_active: true,
            joined_at: new Date().toISOString()
          });
      }
      
      console.log('[DailyVideoCall] Participant joined tracked:', participantId);
    } catch (error) {
      console.error('[DailyVideoCall] Error tracking participant join:', error);
    }
  };

  // Track participant leave function
  const trackParticipantLeave = async (participantId: string) => {
    if (!meetingId) return;
    
    try {
      await supabase
        .from('meeting_participants')
        .update({
          is_active: false,
          left_at: new Date().toISOString()
        })
        .eq('meeting_id', meetingId)
        .eq('user_id', userId)
        .eq('is_active', true);
      
      console.log('[DailyVideoCall] Participant leave tracked:', participantId);
    } catch (error) {
      console.error('[DailyVideoCall] Error tracking participant leave:', error);
    }
  };

  // All media control is handled by useDailyRoom - this is the SOLE source of truth
  const {
    isConnected,
    isConnecting,
    isJoining,
    connectionError,
    participants,
    participantStates,
    localParticipant,
    remoteParticipants,
    participantCount,
    waitingRoomParticipants,
    meetingSettings,
    isRecording,
    isModerator,
    spotlightedParticipantId,
    pinnedParticipantId,
    handRaised,
    isMicOn,
    isCameraOn,
    isScreenSharing,
    toggleMic,
    toggleCamera,
    videoBackground,
    setVideoBackground,
    startScreenShare,
    stopScreenShare,
    joinRoom,
    leaveRoom,
    sessionDuration,
    localVideoRef,
    callObject,
    // Enhanced host controls
    assignRole,
    getParticipantRole,
    muteParticipant,
    allowUnmute,
    requestUnmute,
    muteAll,
    disableParticipantVideo,
    allowVideo,
    requestVideo,
    disableAllVideo,
    removeParticipant,
    admitFromWaitingRoom,
    admitAllFromWaitingRoom,
    rejectFromWaitingRoom,
    lockMeeting,
    updateMeetingSettings,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    spotlightParticipant,
    pinParticipant,
    raiseHand,
    lowerHand,
    raisedHands,
    chatMessages,
    sendChatMessage,
  } = useDailyRoom({
    roomName,
    userName,
    userId,
    isHost,
    sessionId,
    meetingId,
    meetingKind,
    onHostJoined: () => {
      console.log('[DailyVideoCall] Host has joined - callback triggered');
      setHostHasJoined(true);
    },
    onParticipantJoined: (participant) => {
      if (participant.owner) {
        console.log('[DailyVideoCall] Host participant joined');
        setHostHasJoined(true);
      }
    },
    onParticipantLeft: (participant) => {
      if (participant.owner && !isHost) {
        console.log('[DailyVideoCall] Host left meeting');
      }
    }
  });

  // One-time nudge: the room joins MUTED (mic + camera OFF) to avoid the auto-
  // enable timing race, so tell the user to turn them on. Restores the pre-
  // migration "please unmute / enable video" prompt.
  const mutedPromptShownRef = useRef(false);
  useEffect(() => {
    if (isConnected && !mutedPromptShownRef.current) {
      mutedPromptShownRef.current = true;
      toast({
        title: t('dailyVideoCall', 'joinedMuted', "You've joined muted"),
        description: t('dailyVideoCall', 'tapMicCamToStart', 'Tap the microphone and camera buttons below to turn on your audio and video.'),
      });
    }
  }, [isConnected, toast, t]);

  // The host pushes the call's composite to Mux via one RTMP stream. This serves
  // two purposes depending on mode: in a webinar it's the feed the HLS audience
  // watches; in a normal meeting it's how the session gets recorded (Mux records
  // whatever it ingests). Starts once the host is connected and a stream URL is
  // available; stops when the call ends.
  const liveStreamStartedRef = useRef(false);
  useEffect(() => {
    if (!isHost || !liveStreamRtmpUrl || !callObject || !isConnected) return;
    if (liveStreamStartedRef.current) return;
    liveStreamStartedRef.current = true;
    (async () => {
      try {
        await callObject.startLiveStreaming({ rtmpUrl: liveStreamRtmpUrl, width: 1280, height: 720 });
        setIsMuxRecording(true);
        setRecordingStatus('recording');
        console.log('[DailyVideoCall] RTMP push to Mux started (broadcast/recording)');
      } catch (e) {
        console.warn('[DailyVideoCall] Failed to start RTMP streaming:', e);
        liveStreamStartedRef.current = false;
      }
    })();
    return () => {
      if (liveStreamStartedRef.current && callObject) {
        try {
          const result = callObject.stopLiveStreaming();
          if (result && typeof (result as any).catch === 'function') {
            (result as any).catch(() => {});
          }
        } catch {
          // The call object may already be destroyed during teardown — ignore.
        }
        liveStreamStartedRef.current = false;
        setIsMuxRecording(false);
      }
    };
  }, [isHost, liveStreamRtmpUrl, callObject, isConnected]);

  // Toggle recording by starting/stopping the RTMP push to Mux. Mux records the
  // ingested stream automatically (the live stream is provisioned with recording),
  // so there's no separate Daily cloud-recording call. Webinars hide this control
  // and keep the push running as the audience broadcast.
  const handleToggleRecording = async () => {
    if (!isHost) return;

    // LiveKit: recording is a room-composite Egress (no RTMP push, no call object).
    // The hook's startRecording/stopRecording hit the livekit-egress edge fn.
    if (isLiveKitBackend()) {
      if (isMuxRecording) {
        setRecordingStatus('stopping');
        try {
          await stopRecording();
          setIsMuxRecording(false);
          setRecordingStatus('idle');
        } catch {
          setRecordingStatus('error');
          toast({ title: t('dailyVideoCall', 'failedToStopRecording', 'Failed to stop recording'), variant: 'destructive' });
        }
      } else {
        setRecordingStatus('starting');
        try {
          await startRecording();
          setIsMuxRecording(true);
          setRecordingStatus('recording');
        } catch {
          setRecordingStatus('error');
          toast({ title: t('dailyVideoCall', 'failedToStartRecording', 'Failed to start recording'), variant: 'destructive' });
        }
      }
      return;
    }

    if (!liveStreamRtmpUrl || !callObject) {
      toast({ title: t('dailyVideoCall', 'recordingNotAvailable', 'Recording not available'), description: t('dailyVideoCall', 'enableRecordingFirst', 'Enable recording for this meeting first.'), variant: 'destructive' });
      return;
    }

    if (isMuxRecording) {
      setRecordingStatus('stopping');
      try {
        await callObject.stopLiveStreaming();
        liveStreamStartedRef.current = false;
        setIsMuxRecording(false);
        setRecordingStatus('idle');
      } catch {
        setRecordingStatus('error');
        toast({ title: t('dailyVideoCall', 'failedToStopRecording', 'Failed to stop recording'), variant: 'destructive' });
      }
    } else {
      setRecordingStatus('starting');
      try {
        await callObject.startLiveStreaming({ rtmpUrl: liveStreamRtmpUrl, width: 1280, height: 720 });
        liveStreamStartedRef.current = true;
        setIsMuxRecording(true);
        setRecordingStatus('recording');
      } catch {
        setRecordingStatus('error');
        toast({ title: t('dailyVideoCall', 'failedToStartRecording', 'Failed to start recording'), variant: 'destructive' });
      }
    }
  };

  // Check if host is already in meeting when participant joins
  useEffect(() => {
    if (!isConnected || isHost) return;
    
    console.log('[DailyVideoCall] Checking for host presence, participants:', participants.length);

    const hasHost = participants.some(p => {
      console.log('[DailyVideoCall] Participant:', p.userName, 'isOwner:', p.isOwner);
      return p.isOwner;
    });
    
    if (hasHost) {
      console.log('[DailyVideoCall] Host detected in meeting - admitting participant');
      setHostHasJoined(true);
    } else {
      console.log('[DailyVideoCall] No host present - participant waiting');
      setHostHasJoined(false);
    }
  }, [isConnected, participants, isHost]);

  // Track participants in waiting room (for host view)
  useEffect(() => {
    if (!isConnected || !isHost || !showParticipantList) return;

    const waiting = participants.filter(p => 
      !p.isOwner &&
      !p.hasAudio &&
      !p.hasVideo
    );
    
    console.log('[DailyVideoCall] Waiting room participants:', waiting.length);
    setWaitingParticipants(waiting);
  }, [isConnected, isHost, participants, showParticipantList]);

  // The host is featured (spotlighted) by default so every participant lands on
  // the host's video. Fires once, when the host's own participant first appears;
  // the host can spotlight someone else or clear it afterward.
  const didInitSpotlightRef = useRef(false);
  useEffect(() => {
    if (!isHost || didInitSpotlightRef.current) return;
    const me = participants.find((p: any) => p.isLocal);
    if (me) {
      didInitSpotlightRef.current = true;
      spotlightParticipant(me.sessionId);
    }
  }, [isHost, participants, spotlightParticipant]);

  // Spotlight is broadcast once when set; re-send it whenever the roster grows so
  // late arrivals land on the same featured participant.
  const prevParticipantCountRef = useRef(0);
  useEffect(() => {
    if (isHost && spotlightedParticipantId && participants.length > prevParticipantCountRef.current) {
      spotlightParticipant(spotlightedParticipantId);
    }
    prevParticipantCountRef.current = participants.length;
  }, [participants.length, isHost, spotlightedParticipantId, spotlightParticipant]);

  // Monitor audio track state from Daily SDK
  useEffect(() => {
    if (!callObject || !isConnected) {
      setAudioStatus('inactive');
      return;
    }

    const checkAudioState = () => {
      const local = callObject.participants()?.local;
      if (!local) {
        setAudioStatus('inactive');
        return;
      }

      if (local.tracks?.audio?.blocked) {
        setAudioStatus('blocked');
      } else if (local.tracks?.audio?.state === 'playable' && isMicOn) {
        setAudioStatus('active');
      } else if (isMicOn) {
        setAudioStatus('detecting');
      } else {
        setAudioStatus('inactive');
      }
    };

    checkAudioState();
    const interval = setInterval(checkAudioState, 1000);
    
    return () => clearInterval(interval);
  }, [callObject, isConnected, isMicOn]);

  // Subscribe to meeting end events
  useEffect(() => {
    if (!meetingId) return;

    const channel = supabase
      .channel(`meeting-${meetingId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'meetings',
          filter: `id=eq.${meetingId}`
        },
        async (payload) => {
          console.log('[DailyVideoCall] Meeting update received:', payload.new);
          if (payload.new.status === 'ended' || payload.new.is_active === false) {
            console.log('[DailyVideoCall] Meeting ended by host');
            setMeetingEnded(true);
            await handleMeetingEnded();
          }
        }
      )
      .subscribe((status) => {
        console.log('[DailyVideoCall] Subscription status:', status);
      });

    return () => {
      console.log('[DailyVideoCall] Unsubscribing from meeting channel');
      channel.unsubscribe();
    };
  }, [meetingId]);

  const handleMeetingEnded = async () => {
    console.log('[DailyVideoCall] Handling meeting ended');
    
    toast({
      title: t('dailyVideoCall', 'meetingEnded', 'Meeting Ended'),
      description: t('dailyVideoCall', 'hostEndedThisMeeting', 'The host has ended this meeting'),
      variant: 'default'
    });

    try {
      await leaveRoom();
    } catch (error) {
      console.error('[DailyVideoCall] Error leaving room after meeting end:', error);
    }
    
    setTimeout(() => {
      onCallEnd?.();
    }, 500);
  };

  const handleEndCall = async () => {
    if (isHost && meetingId) {
      try {
        await supabase
          .from('meetings')
          .update({ 
            status: 'ended',
            ended_at: new Date().toISOString()
          })
          .eq('id', meetingId);

        toast({
          title: t('dailyVideoCall', 'meetingEnded', 'Meeting Ended'),
          description: t('dailyVideoCall', 'meetingEndedForAll', 'The meeting has been ended for all participants')
        });
      } catch (error) {
        console.error('[DailyVideoCall] Error ending meeting:', error);
      }
    }

    const duration = sessionDuration;
    await leaveRoom();
    onSessionComplete?.(duration);
    onCallEnd?.();
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      if (!isFullscreen) {
        const el = containerRef.current as any;
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        const doc = document as any;
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch (error) {
      console.error('[DailyVideoCall] Fullscreen error:', error);
    }
  };

  const handleJoinRoom = async () => {
    console.log('[DailyVideoCall] Joining room...');
    const success = await joinRoom();
    
    if (success) {
      console.log('[DailyVideoCall] Successfully joined room');
    }
  };

  // Auto-join on mount — skip the pre-join screen entirely
  useEffect(() => {
    if (!isConnected && !isConnecting && !isJoining) {
      handleJoinRoom();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Show meeting ended screen
  if (meetingEnded) {
    return (
      <Card className="w-full max-w-lg mx-auto">
        <CardContent className="p-8 text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-gray-200 flex items-center justify-center mb-6">
            <PhoneOff className="h-10 w-10 text-gray-600" />
          </div>
          <h3 className="text-xl font-semibold mb-2">{t('dailyVideoCall', 'meetingEnded', 'Meeting Ended')}</h3>
          <p className="text-gray-500 mb-6">
            {t('dailyVideoCall', 'meetingEndedByHost', 'This meeting has been ended by the host')}
          </p>
          <Button onClick={onCallEnd} className="w-full">
            {t('dailyVideoCall', 'returnToHome', 'Return to Home')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Show waiting room for non-hosts when connected but host hasn't joined
  if (isConnected && !isHost && !hostHasJoined) {
    return (
      <WaitingRoom
        roomName={roomName}
        userName={userName}
        isHost={isHost}
        hostHasJoined={hostHasJoined}
        onCancel={() => {
          leaveRoom();
          onCallEnd?.();
        }}
      />
    );
  }



  // Connecting screen
  if (isConnecting || isJoining) {
    return (
      <Card className="w-full max-w-lg mx-auto">
        <CardContent className="p-8 text-center">
          <Loader2 className="h-12 w-12 mx-auto animate-spin text-purple-600 mb-6" />
          <h3 className="text-xl font-semibold mb-2">
            {isJoining ? t('dailyVideoCall', 'joiningCall', 'Joining Call...') : t('dailyVideoCall', 'connecting', 'Connecting...')}
          </h3>
          <p className="text-gray-500">
            {t('dailyVideoCall', 'settingUpVideoCall', 'Please wait while we set up your video call')}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Whoever is actively screen-sharing (local or remote) — their screen becomes
  // the main stage. Require the track to be LIVE: when a share stops, the track
  // ends (readyState 'ended') but the participant object can linger a beat; without
  // this check ScreenShareView kept rendering the dead track as a frozen black
  // stage instead of falling back to the camera grid.
  const screenSharer = participants.find((p: any) =>
    p.hasScreenShare && p.screenVideoTrack && p.screenVideoTrack.readyState === 'live') || null;

  // The main stage features ONE participant. A personal PIN (local to this viewer)
  // takes priority over the host's SPOTLIGHT (broadcast to everyone). The featured
  // participant is found among ALL participants, so it can be the local host (who
  // is spotlighted by default).
  const featuredId = pinnedParticipantId || spotlightedParticipantId;
  const featuredParticipant = featuredId
    ? participants.find((p: any) => p.sessionId === featuredId)
    : null;
  const featuredIsSpotlight = !!featuredParticipant && !pinnedParticipantId;
  const featuredIsLocal = !!featuredParticipant && featuredParticipant.isLocal;
  const filmstripParticipants = featuredParticipant
    ? remoteParticipants.filter((p: any) => p.sessionId !== featuredParticipant.sessionId)
    : remoteParticipants;

  // Per-tile pin / spotlight / co-host controls, shared by the filmstrip and grid.
  const renderTileControls = (p: any) => {
    const isPinned = pinnedParticipantId === p.sessionId;
    const isSpot = spotlightedParticipantId === p.sessionId;
    const isCoHost = getParticipantRole(p.sessionId) === 'co-host';
    const base = 'flex items-center justify-center rounded text-white transition-colors px-1.5 py-0.5';
    return (
      <div className="absolute top-1 right-1 z-10 flex items-center gap-1">
        <button
          onClick={() => pinParticipant(isPinned ? null : p.sessionId)}
          title={isPinned ? t('dailyVideoCall', 'unpin', 'Unpin') : t('dailyVideoCall', 'pin', 'Pin')}
          className={`${base} ${isPinned ? 'bg-purple-600' : 'bg-black/60 hover:bg-purple-600'}`}
        >
          <Pin className="h-2.5 w-2.5" />
        </button>
        {isModerator && (
          <button
            onClick={() => spotlightParticipant(isSpot ? null : p.sessionId)}
            title={isSpot ? t('dailyVideoCall', 'removeSpotlight', 'Remove spotlight') : t('dailyVideoCall', 'spotlight', 'Spotlight')}
            className={`${base} ${isSpot ? 'bg-amber-500' : 'bg-black/60 hover:bg-amber-500'}`}
          >
            <Sparkles className="h-2.5 w-2.5" />
          </button>
        )}
        {isModerator && !p.isLocal && (
          <button
            onClick={() => assignRole(p.sessionId, isCoHost ? 'attendee' : 'co-host')}
            title={isCoHost ? t('dailyVideoCall', 'removeCoHost', 'Remove co-host') : t('dailyVideoCall', 'makeCoHost', 'Make co-host')}
            className={`${base} ${isCoHost ? 'bg-blue-600' : 'bg-black/60 hover:bg-blue-600'}`}
          >
            <Shield className="h-2.5 w-2.5" />
          </button>
        )}
      </div>
    );
  };

  // Minimized mini-player: a clean, centered, contained video ONLY — no top bar,
  // control bar, reactions or filmstrip (those belong to full-screen; the host's
  // maximize/leave chrome is drawn by ActiveCallHost). Audio keeps playing.
  const isPiP = (activeCallCtx?.minimized || activeCallCtx?.isSystemPiP) ?? false;
  if (isPiP) {
    // Prefer whoever is actually on-camera so the tiny frame isn't a black tile:
    // screen share → featured (if it has video) → any remote with video → local →
    // finally fall back to featured/first-remote/local even without video.
    const hasVid = (p: any) => !!p && (p.hasVideo || !!p.videoTrack);
    const miniFeature =
      screenSharer ||
      (hasVid(featuredParticipant) ? featuredParticipant : null) ||
      remoteParticipants.find(hasVid) ||
      (hasVid(localParticipant) ? localParticipant : null) ||
      featuredParticipant ||
      remoteParticipants[0] ||
      localParticipant;
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gray-900">
        <RemoteAudioLayer participants={remoteParticipants} />
        {miniFeature ? (
          // fill: the mini-player parent already fixes the frame size; without it
          // the aspect-ratio box collapses to zero width and the video goes blank.
          // key on the feature's id forces a clean remount (and re-attach) whenever
          // the featured participant changes while minimized.
          <ParticipantVideo
            key={`mini-${miniFeature.sessionId}`}
            participant={miniFeature}
            fill
            hideOverlay
            onParticipantJoin={trackParticipantJoin}
            onParticipantLeave={trackParticipantLeave}
          />
        ) : (
          <div className="text-xs text-white/50">{t('dailyVideoCall', 'connecting', 'Connecting…')}</div>
        )}

        {/* Compact media controls for the mini-player — mute, camera and (if wired)
            react — so the host doesn't have to maximize just to toggle their mic or
            camera. Sits bottom-center; the host maximize/leave chrome is up top. */}
        {!activeCallCtx?.isSystemPiP && (
          <div className="absolute bottom-1.5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/55 px-1.5 py-1 backdrop-blur-sm">
            <button
              onClick={toggleMic}
              title={isMicOn ? t('dailyVideoCall', 'mute', 'Mute') : t('dailyVideoCall', 'unmute', 'Unmute')}
              aria-label={isMicOn ? 'Mute' : 'Unmute'}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-white transition-colors ${isMicOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'}`}
            >
              {isMicOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </button>
            <button
              onClick={toggleCamera}
              title={isCameraOn ? t('dailyVideoCall', 'stopVideo', 'Stop Video') : t('dailyVideoCall', 'startVideo', 'Start Video')}
              aria-label={isCameraOn ? 'Stop video' : 'Start video'}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-white transition-colors ${isCameraOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'}`}
            >
              {isCameraOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
            </button>
            {onReact && <ReactionButton onReact={onReact} />}
          </div>
        )}
      </div>
    );
  }

  // Active call screen - all media controls come from useDailyRoom
  return (
    <div
      ref={containerRef}
      className={`relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl bg-gray-900 sm:flex-row ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}
    >
      {/* Persistent remote audio — mounted once, independent of the video layout
          below, so audio never cuts when a screen share takes the stage etc. */}
      <RemoteAudioLayer participants={remoteParticipants} />

      {/* Main video area */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* min-h-0 is required: without it this flex-1 child can't shrink below its
            content, so a screen share (h-full video) grew the panel to the shared
            screen's native resolution instead of fitting within the stage. */}
        <div className="relative w-full flex-1 min-h-0 overflow-hidden bg-gray-800">
        {/* A live screen share takes over the main stage (local or remote), with a
            camera filmstrip beside it so viewers still see the presenter. */}
        {screenSharer ? (
          <div className="flex h-full flex-col gap-2 overflow-hidden p-2 lg:flex-row">
            <div className="flex-1 min-h-0">
              <ScreenShareView participant={screenSharer} />
            </div>
            {remoteParticipants.length > 0 && (
              <div className="flex lg:flex-col gap-2 lg:w-44 shrink-0 overflow-x-auto lg:overflow-y-auto overflow-y-hidden lg:overflow-x-hidden">
                {remoteParticipants.map((p: any) => (
                  <div key={p.sessionId} className="w-28 lg:w-full shrink-0">
                    <ParticipantVideo
                      participant={p}
                      onParticipantJoin={trackParticipantJoin}
                      onParticipantLeave={trackParticipantLeave}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : remoteParticipants.length === 0 ? (
          <div className="flex items-center justify-center h-full p-2 sm:p-4">
            <div className="relative w-full max-w-3xl">
              {localParticipant ? (
                <ParticipantVideo
                  participant={localParticipant}
                  isLarge
                  onParticipantJoin={trackParticipantJoin}
                  onParticipantLeave={trackParticipantLeave}
                />
              ) : (
                <div className="aspect-video bg-gray-800 rounded-xl flex items-center justify-center">
                  <Users className="h-12 w-12 text-white/40" />
                </div>
              )}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 text-white/80 text-xs bg-black/40 backdrop-blur-sm px-3 py-1 rounded-full">
                <Users className="h-3.5 w-3.5 opacity-70" />
                {t('dailyVideoCall', 'waitingForOthers', 'Waiting for others to join…')}
              </div>
            </div>
          </div>
        ) : featuredParticipant ? (
          <div className="flex flex-col h-full gap-2 p-1 sm:p-2">
            <div className="relative flex-1 min-h-0 flex items-center justify-center">
              <div className="relative w-full max-w-4xl">
                <ParticipantVideo
                  key={featuredParticipant.sessionId}
                  participant={featuredParticipant}
                  isLarge
                  onParticipantJoin={trackParticipantJoin}
                  onParticipantLeave={trackParticipantLeave}
                />
                {/* Feature badge — spotlight (host, global) vs pin (this viewer).
                    Sits below the top status bar so it doesn't overlap it on entry. */}
                <div className="absolute top-12 sm:top-14 left-2 z-10">
                  {featuredIsSpotlight ? (
                    <span className="flex items-center gap-1 text-xs font-medium bg-amber-500 text-white px-2 py-1 rounded-md shadow">
                      <Sparkles className="h-3 w-3" /> {t('dailyVideoCall', 'spotlight', 'Spotlight')}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-medium bg-purple-600 text-white px-2 py-1 rounded-md shadow">
                      <Pin className="h-3 w-3" /> {t('dailyVideoCall', 'pinned', 'Pinned')}
                    </span>
                  )}
                </div>
                {/* Remove control: anyone can unpin their own pin; only a moderator
                    (host or co-host) can clear a spotlight. Below the top bar. */}
                <div className="absolute top-12 sm:top-14 right-2 z-10">
                  {!featuredIsSpotlight ? (
                    <button
                      onClick={() => pinParticipant(null)}
                      className="flex items-center gap-1 text-xs bg-purple-600 hover:bg-purple-700 text-white px-2 py-1 rounded-md shadow"
                    >
                      <Pin className="h-3 w-3" /> {t('dailyVideoCall', 'unpin', 'Unpin')}
                    </button>
                  ) : isModerator ? (
                    <button
                      onClick={() => spotlightParticipant(null)}
                      className="flex items-center gap-1 text-xs bg-amber-500 hover:bg-amber-600 text-white px-2 py-1 rounded-md shadow"
                    >
                      <Sparkles className="h-3 w-3" /> {t('dailyVideoCall', 'removeSpotlight', 'Remove spotlight')}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            {filmstripParticipants.length > 0 && (
              <div className="flex gap-2 h-24 sm:h-28 shrink-0 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                {filmstripParticipants.map((participant: any) => (
                  <div key={participant.sessionId} className="relative h-full aspect-video shrink-0">
                    <ParticipantVideo
                      participant={participant}
                      isLarge
                      onParticipantJoin={trackParticipantJoin}
                      onParticipantLeave={trackParticipantLeave}
                    />
                    {renderTileControls(participant)}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className={`grid gap-1 sm:gap-2 p-1 sm:p-2 h-full place-items-center ${
            remoteParticipants.length === 1 ? 'grid-cols-1' :
            remoteParticipants.length <= 4 ? 'grid-cols-2' :
            'grid-cols-3'
          }`}>
            {remoteParticipants.map(participant => (
              <div key={participant.sessionId} className="relative">
                <ParticipantVideo
                  participant={participant}
                  isLarge={remoteParticipants.length === 1}
                  onParticipantJoin={trackParticipantJoin}
                  onParticipantLeave={trackParticipantLeave}
                />
                {renderTileControls(participant)}
              </div>
            ))}
          </div>
        )}

        {/* Local video (picture-in-picture). The <video> stays MOUNTED even while
            the local user is the featured (spotlit) tile — we just hide the PiP —
            so its stream stays attached. Unmounting it (the old behaviour) left it
            blank after removing your own spotlight until a re-render re-attached. */}
        {localParticipant && remoteParticipants.length > 0 && (
          <div className={`absolute bottom-3 right-3 z-20 aspect-video w-24 max-w-[40vw] overflow-hidden rounded-lg border-2 border-gray-700 bg-gray-800 shadow-lg sm:bottom-4 sm:right-4 sm:w-36 md:w-48 flex items-center justify-center ${featuredIsLocal ? 'hidden' : ''}`}>
            {/* Always render video element so ref is available for track attachment */}
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-contain ${isCameraOn ? '' : 'hidden'}`}
              style={{ transform: 'scaleX(-1)' }} // Mirror the local video
            />
            {/* Spotlight yourself / see that you're spotlighted (moderators). */}
            {isModerator && (
              <button
                onClick={() => spotlightParticipant(spotlightedParticipantId === localParticipant.sessionId ? null : localParticipant.sessionId)}
                title={spotlightedParticipantId === localParticipant.sessionId ? t('dailyVideoCall', 'youAreSpotlighted', "You're spotlighted — tap to remove") : t('dailyVideoCall', 'spotlightYourself', 'Spotlight yourself')}
                className={`absolute top-1 right-1 z-10 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-white ${spotlightedParticipantId === localParticipant.sessionId ? 'bg-amber-500' : 'bg-black/60 hover:bg-amber-500'}`}
              >
                <Sparkles className="h-2.5 w-2.5" />
                {spotlightedParticipantId === localParticipant.sessionId && <span className="hidden sm:inline">{t('dailyVideoCall', 'spotlightedShort', 'Spotlight')}</span>}
              </button>
            )}
            {/* Avatar fallback when camera is off */}
            {!isCameraOn && (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-600 to-indigo-700">
                <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-white/20 flex items-center justify-center text-white text-sm sm:text-xl font-bold">
                  {userName.charAt(0).toUpperCase()}
                </div>
              </div>
            )}
            <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between">
              <span className="text-white text-xs bg-black/50 px-1 rounded">{t('dailyVideoCall', 'you', 'You')}</span>
              <div className="flex items-center gap-1">
                {isMicOn ? (
                  <Mic className="h-3 w-3 text-green-400" />
                ) : (
                  <MicOff className="h-3 w-3 text-red-400" />
                )}
              </div>
            </div>
            
            {/* Audio status badge in local video */}
            {audioStatus === 'blocked' && (
              <div className="absolute top-1 left-1 right-1">
                <Badge variant="destructive" className="text-xs">
                  {t('dailyVideoCall', 'micBlocked', 'Mic Blocked')}
                </Badge>
              </div>
            )}
          </div>
        )}


        {/* Top bar. Extra right padding reserves room for the wrapper's top-right
            Copy Link / End for All buttons so the meeting's own right controls
            (participant count · mini-player · fullscreen) don't sit under them. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent px-2 py-2 pr-28 sm:px-4 sm:py-4 sm:pr-72">
          <div className="pointer-events-auto flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30">
                <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse" />
                {t('dailyVideoCall', 'live', 'Live')}
              </Badge>
              <div className="flex items-center gap-2 text-white">
                <Clock className="h-4 w-4" />
                <span className="font-mono">{formatDuration(sessionDuration)}</span>
              </div>

              {/* Recording status badge */}
              {isHost && enableRecording && (isMuxRecording || recordingStatus === 'starting') && (
                <Badge className={`flex items-center gap-1 text-white text-xs border-0 ${
                  recordingStatus === 'starting' ? 'bg-orange-500' : 'bg-red-600'
                }`}>
                  {recordingStatus === 'starting'
                    ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    : <Circle className="h-2 w-2 fill-current" />
                  }
                  {recordingStatus === 'starting' ? t('dailyVideoCall', 'startingEllipsis', 'Starting…') : t('dailyVideoCall', 'rec', 'REC')}
                </Badge>
              )}
              
              {/* Audio status in top bar */}
              {audioStatus === 'active' && (
                <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30">
                  <Mic className="h-3 w-3 sm:mr-1" />
                  <span className="hidden sm:inline">{t('dailyVideoCall', 'audioTransmitting', 'Audio Transmitting')}</span>
                </Badge>
              )}
              {audioStatus === 'blocked' && (
                <Badge variant="destructive" className="animate-pulse">
                  <XCircle className="h-3 w-3 sm:mr-1" />
                  <span className="hidden sm:inline">{t('dailyVideoCall', 'micBlockedCheckPermissions', 'Mic Blocked - Check Permissions')}</span>
                  <span className="sm:hidden">{t('dailyVideoCall', 'micBlocked', 'Mic Blocked')}</span>
                </Badge>
              )}
              {audioStatus === 'detecting' && (
                <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                  <HelpCircle className="h-3 w-3 mr-1 animate-spin" />
                  {t('dailyVideoCall', 'detectingMicrophoneBadge', 'Detecting Microphone')}
                </Badge>
              )}
              {audioStatus === 'inactive' && isMicOn && (
                <Badge variant="secondary" className="bg-gray-500/20 text-gray-400 border-gray-500/30">
                  <MicOff className="h-3 w-3 mr-1" />
                  {t('dailyVideoCall', 'micMuted', 'Mic Muted')}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-white">
                <Users className="h-4 w-4" />
                <span>{participantCount}</span>
              </div>
              {/* Shrink into a floating mini-player so the user can browse other tabs
                  while the call keeps running (only when hosted by ActiveCallHost). */}
              {activeCallCtx && !activeCallCtx.minimized && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => activeCallCtx.minimize()}
                  className="text-white hover:bg-white/20"
                  title={t('dailyVideoCall', 'minimizeToMiniPlayer', 'Minimize to mini-player')}
                >
                  <PictureInPicture2 className="h-5 w-5" />
                </Button>
              )}
              {supportsFullscreen && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleFullscreen}
                  className="text-white hover:bg-white/20"
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-5 w-5" />
                  ) : (
                    <Maximize2 className="h-5 w-5" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Persistent raised-hands panel (moderators) */}
        {isModerator && raisedHands.filter(h => h.sessionId !== localParticipant?.sessionId).length > 0 && (
          <div className="absolute top-16 right-2 sm:right-4 z-40 w-56 max-w-[70vw] bg-gray-900/90 backdrop-blur-sm rounded-lg p-3 text-white space-y-2 max-h-[40vh] overflow-y-auto">
            <p className="text-xs font-medium text-gray-300 flex items-center gap-1">
              <Hand className="h-3 w-3" /> {t('dailyVideoCall', 'raisedHandsCount', 'Raised hands ({count})').replace('{count}', String(raisedHands.filter(h => h.sessionId !== localParticipant?.sessionId).length))}
            </p>
            {raisedHands.filter(h => h.sessionId !== localParticipant?.sessionId).map(h => (
              <div key={h.sessionId} className="flex items-center justify-between gap-2">
                <span className="text-sm truncate">{h.userName}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-gray-300 hover:text-white"
                  onClick={() => lowerHand(h.sessionId)}
                >
                  {t('dailyVideoCall', 'lower', 'Lower')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Controls bar - all controls from useDailyRoom (Daily SDK).
          pb uses the iOS safe-area inset so the buttons clear the home indicator /
          browser chrome and stay tappable on mobile (they were being cut off). */}
      {showControls && (
        <div className="bg-gray-900 border-t border-gray-800 px-2 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-6">
          <div className="flex items-center justify-center gap-2 sm:gap-6 overflow-x-auto px-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {/* Mic toggle - controlled by Daily SDK via useDailyRoom */}
            <button
              onClick={toggleMic}
              className="flex flex-col items-center gap-1 sm:gap-2 group shrink-0"
            >
              <div className={`
                w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center
                transition-all duration-200 transform group-hover:scale-105
                ${isMicOn 
                  ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                  : 'bg-red-600 hover:bg-red-700 text-white'}
              `}>
                {isMicOn ? (
                  <Mic className="h-5 w-5 sm:h-7 sm:w-7" />
                ) : (
                  <MicOff className="h-5 w-5 sm:h-7 sm:w-7" />
                )}
              </div>
              <span className="hidden sm:block text-xs font-medium text-gray-300">
                {isMicOn ? t('dailyVideoCall', 'mute', 'Mute') : t('dailyVideoCall', 'unmute', 'Unmute')}
              </span>
            </button>

            {/* Audio output (speaker/headset/Bluetooth) picker — renders nothing
                if the browser doesn't support HTMLMediaElement.setSinkId. */}
            <AudioOutputButton
              trigger={
                <button className="flex flex-col items-center gap-1 sm:gap-2 group shrink-0">
                  <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all duration-200 transform group-hover:scale-105 ${selectedAudioOutputId ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}>
                    <Headphones className="h-5 w-5 sm:h-7 sm:w-7" />
                  </div>
                  <span className="hidden sm:block text-xs font-medium text-gray-300">
                    {t('dailyVideoCall', 'audioOutput', 'Audio')}
                  </span>
                </button>
              }
            />

            {/* Camera toggle - controlled by Daily SDK via useDailyRoom */}
            <button
              onClick={toggleCamera}
              className="flex flex-col items-center gap-1 sm:gap-2 group shrink-0"
            >
              <div className={`
                w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center
                transition-all duration-200 transform group-hover:scale-105
                ${isCameraOn 
                  ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                  : 'bg-red-600 hover:bg-red-700 text-white'}
              `}>
                {isCameraOn ? (
                  <Video className="h-5 w-5 sm:h-7 sm:w-7" />
                ) : (
                  <VideoOff className="h-5 w-5 sm:h-7 sm:w-7" />
                )}
              </div>
              <span className="hidden sm:block text-xs font-medium text-gray-300">
                {isCameraOn ? t('dailyVideoCall', 'stopVideo', 'Stop Video') : t('dailyVideoCall', 'startVideo', 'Start Video')}
              </span>
            </button>

            {/* Virtual background */}
            <VirtualBackgroundButton
              value={videoBackground}
              onChange={setVideoBackground}
              trigger={
                <button className="flex flex-col items-center gap-1 sm:gap-2 group shrink-0">
                  <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all duration-200 transform group-hover:scale-105 ${videoBackground !== 'none' ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}>
                    <Sparkles className="h-5 w-5 sm:h-7 sm:w-7" />
                  </div>
                  <span className="hidden sm:block text-xs font-medium text-gray-300">
                    {t('dailyVideoCall', 'background', 'Background')}
                  </span>
                </button>
              }
            />

            {/* Screen share toggle - controlled by Daily SDK via useDailyRoom */}
            <button
              onClick={isScreenSharing ? stopScreenShare : startScreenShare}
              className="flex flex-col items-center gap-1 sm:gap-2 group shrink-0"
            >
              <div className={`
                w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center
                transition-all duration-200 transform group-hover:scale-105
                ${isScreenSharing 
                  ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                  : 'bg-gray-700 hover:bg-gray-600 text-white'}
              `}>
                {isScreenSharing ? (
                  <MonitorOff className="h-5 w-5 sm:h-7 sm:w-7" />
                ) : (
                  <Monitor className="h-5 w-5 sm:h-7 sm:w-7" />
                )}
              </div>
              <span className="hidden sm:block text-xs font-medium text-gray-300">
                {isScreenSharing ? t('dailyVideoCall', 'stopShare', 'Stop Share') : t('dailyVideoCall', 'shareScreen', 'Share Screen')}
              </span>
            </button>

            {/* Raise Hand button */}
            <button
              onClick={raiseHand}
              disabled={handRaised}
              className="flex flex-col items-center gap-1 sm:gap-2 group shrink-0"
            >
              <div className={`
                w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center
                transition-all duration-200 transform group-hover:scale-105
                ${handRaised 
                  ? 'bg-amber-600 hover:bg-amber-700 text-white' 
                  : 'bg-gray-700 hover:bg-gray-600 text-white'}
              `}>
                <Hand className="h-5 w-5 sm:h-7 sm:w-7" />
              </div>
              <span className="hidden sm:block text-xs font-medium text-gray-300">
                {handRaised ? t('dailyVideoCall', 'handRaised', 'Hand Raised') : t('dailyVideoCall', 'raiseHand', 'Raise Hand')}
              </span>
            </button>

            {/* Chat button — opening chat closes Host Controls so only one side
                panel shows at a time (they otherwise overlap on the right edge). */}
            <button
              onClick={() => { setShowChat((v) => !v); setShowHostControls(false); }}
              className="flex flex-col items-center gap-1 sm:gap-2 group shrink-0"
            >
              <div className={`
                w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center
                transition-all duration-200 transform group-hover:scale-105
                ${showChat 
                  ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                  : 'bg-gray-700 hover:bg-gray-600 text-white'}
              `}>
                <MessageSquare className="h-5 w-5 sm:h-7 sm:w-7" />
                {chatMessages.length > 0 && !showChat && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {chatMessages.length > 9 ? '9+' : chatMessages.length}
                  </span>
                )}
              </div>
              <span className="hidden sm:block text-xs font-medium text-gray-300">
                {t('dailyVideoCall', 'chat', 'Chat')}
              </span>
            </button>

            {/* Host Controls button (host or co-host) */}
            {isModerator && (
              <button
                onClick={() => { setShowHostControls((v) => !v); setShowChat(false); }}
                className="flex flex-col items-center gap-1 sm:gap-2 group shrink-0"
              >
                <div className={`
                  w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center
                  transition-all duration-200 transform group-hover:scale-105
                  ${showHostControls 
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white' 
                    : 'bg-gray-700 hover:bg-gray-600 text-white'}
                `}>
                  <Users className="h-5 w-5 sm:h-7 sm:w-7" />
                  {waitingRoomParticipants.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                      {waitingRoomParticipants.length}
                    </span>
                  )}
                </div>
                <span className="hidden sm:block text-xs font-medium text-gray-300">
                  {t('dailyVideoCall', 'manage', 'Manage')}
                </span>
              </button>
            )}

            {/* Recording button — host only, shown when enableRecording is true */}
            {isHost && enableRecording && (
              <button
                onClick={handleToggleRecording}
                disabled={recordingStatus === 'starting' || recordingStatus === 'stopping'}
                className="flex flex-col items-center gap-1 sm:gap-2 group shrink-0"
              >
                <div className={`
                  w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center relative
                  transition-all duration-200 transform group-hover:scale-105
                  ${isMuxRecording
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : recordingStatus === 'starting' || recordingStatus === 'stopping'
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : recordingStatus === 'error'
                    ? 'bg-orange-600 hover:bg-orange-700 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-white'}
                `}>
                  {recordingStatus === 'starting' || recordingStatus === 'stopping' ? (
                    <Loader2 className="h-4 w-4 sm:h-7 sm:w-7 animate-spin" />
                  ) : isMuxRecording ? (
                    <Square className="h-5 w-5 sm:h-7 sm:w-7" />
                  ) : (
                    <Circle className="h-5 w-5 sm:h-7 sm:w-7" />
                  )}
                </div>
                <span className="hidden sm:block text-xs font-medium text-gray-300">
                  {recordingStatus === 'starting' ? t('dailyVideoCall', 'startingEllipsis', 'Starting…')
                    : recordingStatus === 'stopping' ? t('dailyVideoCall', 'stoppingEllipsis', 'Stopping…')
                    : recordingStatus === 'error' ? t('dailyVideoCall', 'recError', 'Rec Error')
                    : isMuxRecording ? t('dailyVideoCall', 'stopRec', 'Stop Rec')
                    : t('dailyVideoCall', 'record', 'Record')}
                </span>
              </button>
            )}

            {/* End call button */}
            <button
              onClick={handleEndCall}
              className="flex flex-col items-center gap-1 sm:gap-2 group shrink-0"
            >
              <div className="
                w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center
                bg-red-600 hover:bg-red-700 text-white
                transition-all duration-200 transform group-hover:scale-105
              ">
                <PhoneOff className="h-5 w-5 sm:h-7 sm:w-7" />
              </div>
              <span className="hidden sm:block text-xs font-medium text-gray-300">
                {isHost ? t('dailyVideoCall', 'endForAll', 'End for All') : t('dailyVideoCall', 'leave', 'Leave')}
              </span>
            </button>
          </div>
        </div>
      )}
      </div>

      {/* Host Control Panel (host or co-host) */}
      {showHostControls && isModerator && (
        <HostControlPanel
          participants={participantStates}
          waitingRoomParticipants={waitingRoomParticipants}
          meetingSettings={meetingSettings}
          isRecording={isMuxRecording}
          spotlightedParticipantId={spotlightedParticipantId}
          isHost={isModerator}
          canRecord={isHost}
          onMuteAll={() => muteAll()}
          onDisableAllVideo={() => disableAllVideo()}
          onMuteParticipant={(id) => muteParticipant(id)}
          onAllowUnmute={(id) => allowUnmute(id)}
          onRequestUnmute={(id, name) => requestUnmute(id, name)}
          onDisableParticipantVideo={(id) => disableParticipantVideo(id)}
          onAllowVideo={(id) => allowVideo(id)}
          onRequestVideo={(id, name) => requestVideo(id, name)}
          onRemoveParticipant={(id) => removeParticipant(id)}
          onAssignRole={(id, role) => assignRole(id, role)}
          onAdmitFromWaitingRoom={(id) => admitFromWaitingRoom(id)}
          onAdmitAllFromWaitingRoom={admitAllFromWaitingRoom}
          onRejectFromWaitingRoom={(id) => rejectFromWaitingRoom(id)}
          onLockMeeting={(locked) => lockMeeting(locked)}
          onUpdateSettings={(settings) => updateMeetingSettings(settings)}
          onStartRecording={handleToggleRecording}
          onStopRecording={handleToggleRecording}
          enableRecording={enableRecording}
          recordingStatus={recordingStatus}
          onSpotlightParticipant={(id) => spotlightParticipant(id)}
          onLowerHand={(id) => lowerHand(id)}
          onClose={() => setShowHostControls(false)}
        />
      )}

      {/* Chat Sidebar */}
      {showChat && (
        <RoomChatSidebar
          messages={chatMessages}
          onSendMessage={sendChatMessage}
          currentUserId={userId}
          chatMode={meetingSettings.chatMode}
          onClose={() => setShowChat(false)}
          canAttach={!!authUser}
          meetingId={meetingId}
          participants={participants.map((p) => ({ sessionId: p.sessionId, userName: p.userName, isLocal: p.isLocal }))}
        />
      )}
    </div>
  );
};

// AudioOutputProvider wraps the whole component (rather than just the control
// bar) because DailyVideoCallInner has multiple early returns (minimized
// mini-player, loading/error states, main view) that each mount their own
// RemoteAudioLayer — a single outer provider keeps device selection shared
// and stable across all of them instead of resetting on every branch switch.
export const DailyVideoCall: React.FC<DailyVideoCallProps> = (props) => (
  <AudioOutputProvider>
    <DailyVideoCallInner {...props} />
  </AudioOutputProvider>
);

export default DailyVideoCall;