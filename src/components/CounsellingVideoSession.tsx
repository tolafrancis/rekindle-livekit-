import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDailyRoom, DailyParticipantInfo } from '@/hooks/useDailyRoom';
import {
  Mic, MicOff, Video, VideoOff, Phone, PhoneOff,
  Monitor, MonitorOff, Users, Clock, Loader2, AlertCircle,
  Maximize2, Minimize2, MessageSquare, MoreVertical,
  Volume2, VolumeX, Signal, Wifi, WifiOff, UserMinus,
  MicOffIcon
} from 'lucide-react';
import { CounsellingChatSidebar } from './CounsellingChatSidebar';
import { HostControlPanel } from './HostControlPanel';
import { ConnectionQualityIndicator } from './ConnectionQualityIndicator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '@/components/ui/use-toast';

interface CounsellingVideoSessionProps {
  sessionId: string;
  roomName: string;
  userName: string;
  userId: string;
  isHost: boolean;
  onCallEnd?: () => void;
  onSessionComplete?: (duration: number) => void;
  autoJoin?: boolean;
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

const ParticipantVideo: React.FC<{
  participant: DailyParticipantInfo;
  isLarge?: boolean;
  onRemove?: () => void;
  onMute?: () => void;
  isHost?: boolean;
  connectionQuality?: 'good' | 'fair' | 'poor';
}> = ({ participant, isLarge = false, onRemove, onMute, isHost, connectionQuality = 'good' }) => {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showControls, setShowControls] = useState(false);

  useEffect(() => {
    if (videoRef.current && participant.videoTrack) {
      const stream = new MediaStream([participant.videoTrack]);
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [participant.videoTrack]);

  return (
    <div 
      className={`relative bg-gray-900 rounded-lg overflow-hidden ${isLarge ? 'aspect-video' : 'aspect-square'}`}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {participant.hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={participant.isLocal}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-600 to-indigo-700">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-white/20 flex items-center justify-center text-white text-2xl font-bold mb-2">
              {participant.userName.charAt(0).toUpperCase()}
            </div>
            <p className="text-white text-sm">{participant.userName}</p>
          </div>
        </div>
      )}
      
      {/* Participant info overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-white text-sm font-medium truncate">
              {participant.userName}
              {participant.isLocal && ` ${t('counsellingVideoSession', 'youSuffix', '(You)')}`}
            </span>
            <ConnectionQualityIndicator quality={connectionQuality} />
          </div>
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
      
      {/* Host badge */}
      {participant.isOwner && (
        <Badge className="absolute top-2 left-2 bg-amber-500 text-xs">{t('counsellingVideoSession', 'host', 'Host')}</Badge>
      )}

      {/* Host controls for remote participants */}
      {isHost && !participant.isLocal && showControls && (
        <div className="absolute top-2 right-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon" className="h-8 w-8 bg-black/50 hover:bg-black/70">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onMute}>
                <MicOffIcon className="h-4 w-4 mr-2" />
                {t('counsellingVideoSession', 'muteParticipant', 'Mute Participant')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onRemove} className="text-red-600">
                <UserMinus className="h-4 w-4 mr-2" />
                {t('counsellingVideoSession', 'removeFromCall', 'Remove from Call')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
};

export const CounsellingVideoSession: React.FC<CounsellingVideoSessionProps> = ({
  sessionId,
  roomName,
  userName,
  userId,
  isHost,
  onCallEnd,
  onSessionComplete,
  autoJoin = false
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showHostControls, setShowHostControls] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<'scheduled' | 'live' | 'completed' | 'cancelled'>('scheduled');
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    isConnected,
    isConnecting,
    isJoining,
    connectionError,
    participants,
    localParticipant,
    remoteParticipants,
    participantCount,
    isMicOn,
    isCameraOn,
    isScreenSharing,
    toggleMic,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    joinRoom,
    leaveRoom,
    sessionDuration,
    localVideoRef,
    callObject
  } = useDailyRoom({
    roomName,
    userName,
    userId,
    isHost,
    sessionId,
    onSessionEnd: async () => {
      await updateSessionStatus('completed');
      onCallEnd?.();
      if (sessionDuration > 0) {
        onSessionComplete?.(sessionDuration);
      }
    }
  });

  // Update session status in database
  const updateSessionStatus = async (status: 'scheduled' | 'live' | 'completed' | 'cancelled') => {
    try {
      const updates: any = {
        status,
        updated_at: new Date().toISOString()
      };

      if (status === 'live') {
        updates.session_started_at = new Date().toISOString();
      } else if (status === 'completed') {
        updates.session_ended_at = new Date().toISOString();
        updates.actual_duration = Math.ceil(sessionDuration / 60);
      }

      const { error } = await supabase
        .from('counselling_sessions')
        .update(updates)
        .eq('id', sessionId);

      if (error) throw error;
      setSessionStatus(status);
    } catch (error) {
      console.error('Failed to update session status:', error);
    }
  };

  // Auto-join if enabled
  useEffect(() => {
    if (autoJoin && !isConnected && !isConnecting) {
      joinRoom();
    }
  }, [autoJoin, isConnected, isConnecting, joinRoom]);

  // Update to live status when connected
  useEffect(() => {
    if (isConnected && sessionStatus === 'scheduled') {
      updateSessionStatus('live');
    }
  }, [isConnected]);

  const handleEndCall = async () => {
    await leaveRoom();
    await updateSessionStatus('completed');
    onCallEnd?.();
    if (sessionDuration > 0) {
      onSessionComplete?.(sessionDuration);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    
    if (!isFullscreen) {
      containerRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };

  const handleMuteParticipant = async (participant: DailyParticipantInfo) => {
    if (!callObject || !isHost) return;
    
    try {
      await callObject.updateParticipant(participant.sessionId, {
        setAudio: false
      });
      toast({
        title: t('counsellingVideoSession', 'participantMuted', 'Participant Muted'),
        description: t('counsellingVideoSession', 'participantMutedDesc', '{name} has been muted').replace('{name}', String(participant.userName))
      });
    } catch (error) {
      console.error('Failed to mute participant:', error);
      toast({
        title: t('counsellingVideoSession', 'error', 'Error'),
        description: t('counsellingVideoSession', 'failedMuteParticipant', 'Failed to mute participant'),
        variant: 'destructive'
      });
    }
  };

  const handleRemoveParticipant = async (participant: DailyParticipantInfo) => {
    if (!callObject || !isHost) return;
    
    try {
      await callObject.updateParticipant(participant.sessionId, {
        eject: true
      });
      toast({
        title: t('counsellingVideoSession', 'participantRemoved', 'Participant Removed'),
        description: t('counsellingVideoSession', 'participantRemovedDesc', '{name} has been removed from the call').replace('{name}', String(participant.userName))
      });
    } catch (error) {
      console.error('Failed to remove participant:', error);
      toast({
        title: t('counsellingVideoSession', 'error', 'Error'),
        description: t('counsellingVideoSession', 'failedRemoveParticipant', 'Failed to remove participant'),
        variant: 'destructive'
      });
    }
  };

  const handleMuteAll = async () => {
    if (!callObject || !isHost) return;
    
    try {
      // Mute all remote participants
      for (const participant of remoteParticipants) {
        await callObject.updateParticipant(participant.sessionId, {
          setAudio: false
        });
      }
      toast({
        title: t('counsellingVideoSession', 'allMuted', 'All Muted'),
        description: t('counsellingVideoSession', 'allMutedDesc', 'All participants have been muted')
      });
    } catch (error) {
      console.error('Failed to mute all:', error);
      toast({
        title: t('counsellingVideoSession', 'error', 'Error'),
        description: t('counsellingVideoSession', 'failedMuteAll', 'Failed to mute all participants'),
        variant: 'destructive'
      });
    }
  };

  // Pre-call screen
  if (!isConnected && !isConnecting && !isJoining) {
    return (
      <Card className="w-full max-w-lg mx-auto">
        <CardContent className="p-8 text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center mb-6">
            <Video className="h-10 w-10 text-white" />
          </div>
          <h3 className="text-xl font-semibold mb-2">{t('counsellingVideoSession', 'readyToJoin', 'Ready to Join Counselling Session?')}</h3>
          <p className="text-gray-500 mb-6">
            {t('counsellingVideoSession', 'aboutToJoinAs', "You're about to join as")} <strong>{userName}</strong>
            {isHost && ` ${t('counsellingVideoSession', 'hostSuffix', '(Host)')}`}
          </p>
          
          {connectionError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{connectionError}</p>
            </div>
          )}
          
          <Button 
            onClick={joinRoom}
            size="lg"
            className="w-full bg-green-600 hover:bg-green-700"
          >
            <Video className="h-5 w-5 mr-2" />
            {t('counsellingVideoSession', 'joinSession', 'Join Session')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Connecting screen
  if (isConnecting || isJoining) {
    return (
      <Card className="w-full max-w-lg mx-auto">
        <CardContent className="p-8 text-center">
          <Loader2 className="h-12 w-12 mx-auto animate-spin text-purple-600 mb-6" />
          <h3 className="text-xl font-semibold mb-2">
            {isJoining ? t('counsellingVideoSession', 'joiningSession', 'Joining Session...') : t('counsellingVideoSession', 'connecting', 'Connecting...')}
          </h3>
          <p className="text-gray-500">
            {t('counsellingVideoSession', 'settingUpSession', 'Please wait while we set up your counselling session')}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Active call screen
  return (
    <div className="flex h-screen bg-gray-900">
      {/* Main video area */}
      <div 
        ref={containerRef}
        className={`flex-1 relative ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}
      >
        {/* Video grid */}
        <div className="relative h-full bg-gray-800">
          {/* Remote participants or waiting screen */}
          {remoteParticipants.length > 0 ? (
            <div className={`grid gap-2 p-2 h-full ${
              remoteParticipants.length === 1 ? 'grid-cols-1' :
              remoteParticipants.length <= 4 ? 'grid-cols-2' :
              'grid-cols-3'
            }`}>
              {remoteParticipants.map(participant => (
                <ParticipantVideo 
                  key={participant.sessionId} 
                  participant={participant}
                  isLarge={remoteParticipants.length === 1}
                  isHost={isHost}
                  onMute={() => handleMuteParticipant(participant)}
                  onRemove={() => handleRemoveParticipant(participant)}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-white">
                <Users className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">{t('counsellingVideoSession', 'waitingForParticipant', 'Waiting for participant to join...')}</p>
                <Badge variant="secondary" className="mt-4 bg-amber-500/20 text-amber-400">
                  {t('counsellingVideoSession', 'sessionLabel', 'Session')} {sessionStatus}
                </Badge>
              </div>
            </div>
          )}

          {/* Local video (picture-in-picture) */}
          {localParticipant && (
            <div className="absolute bottom-20 right-4 w-48 aspect-video bg-gray-800 rounded-lg overflow-hidden shadow-lg border-2 border-gray-700">
              {isCameraOn ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-600 to-indigo-700">
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white text-xl font-bold">
                    {userName.charAt(0).toUpperCase()}
                  </div>
                </div>
              )}
              <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between">
                <span className="text-white text-xs bg-black/50 px-1 rounded">{t('counsellingVideoSession', 'you', 'You')}</span>
                <div className="flex items-center gap-1">
                  {isMicOn ? (
                    <Mic className="h-3 w-3 text-green-400" />
                  ) : (
                    <MicOff className="h-3 w-3 text-red-400" />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30">
                  <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse" />
                  {sessionStatus}
                </Badge>
                <div className="flex items-center gap-2 text-white">
                  <Clock className="h-4 w-4" />
                  <span className="font-mono">{formatDuration(sessionDuration)}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-white">
                  <Users className="h-4 w-4" />
                  <span>{participantCount}</span>
                </div>
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
              </div>
            </div>
          </div>

          {/* Controls bar */}
          <div className="absolute bottom-0 left-0 right-0 bg-gray-800 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Mic toggle */}
                <Button
                  variant={isMicOn ? 'secondary' : 'destructive'}
                  size="lg"
                  onClick={toggleMic}
                  className={`rounded-full w-14 h-14 ${isMicOn ? 'bg-gray-700 hover:bg-gray-600' : ''}`}
                >
                  {isMicOn ? (
                    <Mic className="h-6 w-6" />
                  ) : (
                    <MicOff className="h-6 w-6" />
                  )}
                </Button>

                {/* Camera toggle */}
                <Button
                  variant={isCameraOn ? 'secondary' : 'destructive'}
                  size="lg"
                  onClick={toggleCamera}
                  className={`rounded-full w-14 h-14 ${isCameraOn ? 'bg-gray-700 hover:bg-gray-600' : ''}`}
                >
                  {isCameraOn ? (
                    <Video className="h-6 w-6" />
                  ) : (
                    <VideoOff className="h-6 w-6" />
                  )}
                </Button>

                {/* Screen share toggle */}
                <Button
                  variant={isScreenSharing ? 'default' : 'secondary'}
                  size="lg"
                  onClick={isScreenSharing ? stopScreenShare : startScreenShare}
                  className={`rounded-full w-14 h-14 ${isScreenSharing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-600'}`}
                >
                  {isScreenSharing ? (
                    <MonitorOff className="h-6 w-6" />
                  ) : (
                    <Monitor className="h-6 w-6" />
                  )}
                </Button>
              </div>

              <div className="flex items-center gap-3">
                {/* Chat toggle */}
                <Button
                  variant={showChat ? 'default' : 'secondary'}
                  size="lg"
                  onClick={() => setShowChat(!showChat)}
                  className="rounded-full w-14 h-14 bg-gray-700 hover:bg-gray-600"
                >
                  <MessageSquare className="h-6 w-6" />
                </Button>

                {/* Host controls (only for host) */}
                {isHost && (
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={() => setShowHostControls(!showHostControls)}
                    className="rounded-full w-14 h-14 bg-gray-700 hover:bg-gray-600"
                  >
                    <Users className="h-6 w-6" />
                  </Button>
                )}

                {/* End call button */}
                <Button
                  variant="destructive"
                  size="lg"
                  onClick={handleEndCall}
                  className="rounded-full w-14 h-14 bg-red-600 hover:bg-red-700"
                >
                  <PhoneOff className="h-6 w-6" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chat sidebar */}
      {showChat && (
        <CounsellingChatSidebar
          sessionId={sessionId}
          userId={userId}
          userName={userName}
          isHost={isHost}
          onClose={() => setShowChat(false)}
        />
      )}

      {/* Host controls panel */}
      {isHost && showHostControls && (
        <HostControlPanel
          participants={remoteParticipants}
          onMuteAll={handleMuteAll}
          onMuteParticipant={handleMuteParticipant}
          onRemoveParticipant={handleRemoveParticipant}
          onClose={() => setShowHostControls(false)}
        />
      )}
    </div>
  );
};

export default CounsellingVideoSession;