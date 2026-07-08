import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDailyRoom, DailyParticipantInfo } from '@/hooks/useDailyRoom';
import {
  Mic, MicOff, Phone, PhoneOff, Users, Clock, Loader2, AlertCircle,
  CheckCircle2, XCircle, HelpCircle, Volume2, VolumeX
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DailyAudioProps {
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
          text: t('dailyaudio', 'detectingMicrophone', 'Detecting microphone...'),
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-50 border-yellow-200'
        };
      case 'active':
        return {
          icon: CheckCircle2,
          text: t('dailyaudio', 'microphoneActive', 'Microphone active'),
          color: 'text-green-500',
          bgColor: 'bg-green-50 border-green-200'
        };
      case 'blocked':
        return {
          icon: XCircle,
          text: t('dailyaudio', 'microphoneBlocked', 'Microphone blocked'),
          color: 'text-red-500',
          bgColor: 'bg-red-50 border-red-200'
        };
      case 'inactive':
        return {
          icon: MicOff,
          text: t('dailyaudio', 'microphoneInactive', 'Microphone inactive'),
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

// Test Microphone Component
const TestMicrophone: React.FC<{
  onTestComplete: (success: boolean) => void;
}> = ({ onTestComplete }) => {
  const { t } = useLanguage();
  const [isTesting, setIsTesting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [status, setStatus] = useState<'detecting' | 'active' | 'blocked'>('detecting');
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const startTest = async () => {
    setIsTesting(true);
    setStatus('detecting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      
      const analyser = audioContext.createAnalyser();
      analyserRef.current = analyser;
      analyser.fftSize = 256;
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevel = () => {
        if (!analyserRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const level = Math.min(100, (average / 128) * 100);
        
        setAudioLevel(level);
        setStatus('active');
        
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
      onTestComplete(true);

    } catch (error) {
      console.error('Microphone test failed:', error);
      setStatus('blocked');
      onTestComplete(false);
    }
  };

  const stopTest = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    setIsTesting(false);
    setAudioLevel(0);
  };

  useEffect(() => {
    return () => {
      stopTest();
    };
  }, []);

  return (
    <div className="space-y-4">
      <AudioStatusIndicator status={status} level={audioLevel} />
      
      <div className="flex gap-2">
        {!isTesting ? (
          <Button onClick={startTest} className="w-full">
            <Mic className="h-4 w-4 mr-2" />
            {t('dailyaudio', 'testMicrophone', 'Test Microphone')}
          </Button>
        ) : (
          <Button onClick={stopTest} variant="outline" className="w-full">
            <MicOff className="h-4 w-4 mr-2" />
            {t('dailyaudio', 'stopTest', 'Stop Test')}
          </Button>
        )}
      </div>

      {status === 'blocked' && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t('dailyaudio', 'micBlockedHelp', 'Microphone access is blocked. Please enable microphone permissions in your browser settings.')}
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
        <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-6">
          <Users className="h-10 w-10 text-white" />
        </div>
        
        <h3 className="text-xl font-semibold mb-2">
          {isHost ? t('dailyaudio', 'readyToStart', 'Ready to Start') : t('dailyaudio', 'waitingRoom', 'Waiting Room')}
        </h3>

        <p className="text-gray-500 mb-6">
          {isHost
            ? t('dailyaudio', 'aboutToStartCall', 'You\'re about to start the audio call "{roomName}"').replace('{roomName}', String(roomName))
            : hostHasJoined
              ? t('dailyaudio', 'hostWillLetYouIn', 'The host will let you in shortly...')
              : t('dailyaudio', 'waitingForHostToStart', 'Waiting for the host to start the call...')
          }
        </p>

        {!isHost && (
          <div className="mb-6">
            <div className="flex justify-center mb-4">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
            <p className="text-sm text-gray-400">
              {t('dailyaudio', 'joinedAs', 'Joined as:')} <strong>{userName}</strong>
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
              <Phone className="h-5 w-5 mr-2" />
              {t('dailyaudio', 'startCall', 'Start Call')}
            </Button>
          ) : null}

          <Button
            onClick={onCancel}
            variant="outline"
            size="lg"
            className={isHost ? 'flex-1' : 'w-full'}
          >
            {t('dailyaudio', 'cancel', 'Cancel')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Audio Participant Card Component
const AudioParticipantCard: React.FC<{
  participant: DailyParticipantInfo;
  isHost: boolean;
}> = ({ participant, isHost }) => {
  const { t } = useLanguage();
  const [audioLevel, setAudioLevel] = useState(0);

  useEffect(() => {
    if (!participant.audioTrack) return;

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;

    const stream = new MediaStream([participant.audioTrack]);
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateLevel = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      const level = Math.min(100, (average / 128) * 100);
      setAudioLevel(level);
      requestAnimationFrame(updateLevel);
    };

    updateLevel();

    return () => {
      audioContext.close();
    };
  }, [participant.audioTrack]);

  return (
    <div className="flex items-center gap-3 p-4 bg-white rounded-lg border border-gray-200 hover:border-indigo-300 transition-colors">
      {/* Avatar with audio level indicator */}
      <div className="relative">
        <div className={`w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-lg font-bold ${
          participant.hasAudio && audioLevel > 20 ? 'ring-4 ring-green-400 ring-opacity-50' : ''
        }`}>
          {participant.userName.charAt(0).toUpperCase()}
        </div>
        
        {/* Audio indicator */}
        <div className="absolute -bottom-1 -right-1">
          {participant.hasAudio ? (
            <div className="bg-green-500 rounded-full p-1">
              <Mic className="h-3 w-3 text-white" />
            </div>
          ) : (
            <div className="bg-red-500 rounded-full p-1">
              <MicOff className="h-3 w-3 text-white" />
            </div>
          )}
        </div>
      </div>

      {/* Participant info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-gray-900 truncate">
            {participant.userName}
            {participant.isLocal && ` ${t('dailyaudio', 'youSuffix', '(You)')}`}
          </p>
          {(participant.isOwner || isHost) && (
            <Badge className="bg-amber-500 text-xs">{t('dailyaudio', 'host', 'Host')}</Badge>
          )}
        </div>
        
        {/* Audio level bar */}
        {participant.hasAudio && audioLevel > 0 && (
          <div className="mt-1">
            <Progress value={audioLevel} className="h-1" />
          </div>
        )}
      </div>

      {/* Speaking indicator */}
      {participant.hasAudio && audioLevel > 30 && (
        <div className="flex items-center gap-1">
          <Volume2 className="h-4 w-4 text-green-500 animate-pulse" />
          <span className="text-xs text-green-600 font-medium">{t('dailyaudio', 'speaking', 'Speaking')}</span>
        </div>
      )}
    </div>
  );
};

export const DailyAudio: React.FC<DailyAudioProps> = ({
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
}) => {
  const [micTestComplete, setMicTestComplete] = useState(false);
  const [audioStatus, setAudioStatus] = useState<'detecting' | 'active' | 'blocked' | 'inactive'>('inactive');
  const [hostHasJoined, setHostHasJoined] = useState(isHost);
  const [meetingEnded, setMeetingEnded] = useState(false);

  const { toast } = useToast();
  const { t } = useLanguage();

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
    toggleMic,
    joinRoom,
    leaveRoom,
    sessionDuration,
    callObject
  } = useDailyRoom({
    roomName,
    userName,
    userId,
    isHost,
    sessionId,
    meetingId,
    onHostJoined: () => {
      console.log('[DailyAudio] Host has joined');
      setHostHasJoined(true);
    },
    onParticipantJoined: (participant) => {
      if (participant.owner) {
        console.log('[DailyAudio] Host participant joined');
        setHostHasJoined(true);
      }
    }
  });

  // Check if host is already in meeting when participant joins
  useEffect(() => {
    if (!isConnected || isHost) return;

    const hasHost = participants.some(p => p.isOwner);
    
    if (hasHost) {
      console.log('[DailyAudio] Host detected in meeting');
      setHostHasJoined(true);
    } else {
      console.log('[DailyAudio] No host present');
      setHostHasJoined(false);
    }
  }, [isConnected, participants, isHost]);

  // Monitor audio track state
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
          console.log('[DailyAudio] Meeting update received:', payload.new);
          if (payload.new.status === 'ended' || payload.new.is_active === false) {
            console.log('[DailyAudio] Meeting ended by host');
            setMeetingEnded(true);
            await handleMeetingEnded();
          }
        }
      )
      .subscribe((status) => {
        console.log('[DailyAudio] Subscription status:', status);
      });

    return () => {
      console.log('[DailyAudio] Unsubscribing from meeting channel');
      channel.unsubscribe();
    };
  }, [meetingId]);

  const handleMeetingEnded = async () => {
    console.log('[DailyAudio] Handling meeting ended');
    
    toast({
      title: t('dailyaudio', 'callEnded', 'Call Ended'),
      description: t('dailyaudio', 'hostEndedThisCall', 'The host has ended this call'),
      variant: 'default'
    });

    try {
      await leaveRoom();
    } catch (error) {
      console.error('[DailyAudio] Error leaving room after meeting end:', error);
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
          title: t('dailyaudio', 'callEnded', 'Call Ended'),
          description: t('dailyaudio', 'callEndedForAll', 'The call has been ended for all participants')
        });
      } catch (error) {
        console.error('Error ending call:', error);
      }
    }

    const duration = sessionDuration;
    await leaveRoom();
    onSessionComplete?.(duration);
    onCallEnd?.();
  };

  const handleJoinRoom = async () => {
    if (!micTestComplete && !isHost) {
      toast({
        title: t('dailyaudio', 'micTestRequired', 'Microphone Test Required'),
        description: t('dailyaudio', 'testMicBeforeJoining', 'Please test your microphone before joining'),
        variant: 'destructive'
      });
      return;
    }

    const success = await joinRoom();
    if (success && !isHost) {
      setShowWaitingRoom(true);
    }
  };

  // Show meeting ended screen
  if (meetingEnded) {
    return (
      <Card className="w-full max-w-lg mx-auto">
        <CardContent className="p-8 text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-gray-200 flex items-center justify-center mb-6">
            <PhoneOff className="h-10 w-10 text-gray-600" />
          </div>
          <h3 className="text-xl font-semibold mb-2">{t('dailyaudio', 'callEnded', 'Call Ended')}</h3>
          <p className="text-gray-500 mb-6">
            {t('dailyaudio', 'callEndedByHost', 'This call has been ended by the host')}
          </p>
          <Button onClick={onCallEnd} className="w-full">
            {t('dailyaudio', 'returnToHome', 'Return to Home')}
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

  // Pre-join screen with microphone test
  if (!isConnected && !isConnecting && !isJoining) {
    return (
      <Card className="w-full max-w-lg mx-auto">
        <CardContent className="p-8">
          <div className="text-center mb-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-4">
              <Phone className="h-10 w-10 text-white" />
            </div>
            <h3 className="text-xl font-semibold mb-2">{t('dailyaudio', 'readyToJoin', 'Ready to Join?')}</h3>
            <p className="text-gray-500">
              {t('dailyaudio', 'aboutToJoinAs', "You're about to join as")} <strong>{userName}</strong>
            </p>
          </div>

          {/* Audio Status Indicator */}
          {isConnected && (
            <div className="mb-6">
              <AudioStatusIndicator status={audioStatus} />
            </div>
          )}

          {/* Microphone Test */}
          <div className="mb-6">
            <TestMicrophone onTestComplete={setMicTestComplete} />
          </div>
          
          {connectionError && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{connectionError}</AlertDescription>
            </Alert>
          )}
          
          <Button 
            onClick={handleJoinRoom}
            size="lg"
            className="w-full bg-green-600 hover:bg-green-700"
            disabled={!micTestComplete && !isHost}
          >
            <Phone className="h-5 w-5 mr-2" />
            {isHost ? t('dailyaudio', 'startCall', 'Start Call') : t('dailyaudio', 'joinCall', 'Join Call')}
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
          <Loader2 className="h-12 w-12 mx-auto animate-spin text-indigo-600 mb-6" />
          <h3 className="text-xl font-semibold mb-2">
            {isJoining ? t('dailyaudio', 'joiningCall', 'Joining Call...') : t('dailyaudio', 'connecting', 'Connecting...')}
          </h3>
          <p className="text-gray-500">
            {t('dailyaudio', 'settingUpAudioCall', 'Please wait while we set up your audio call')}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Active call screen
  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardContent className="p-6">
        {/* Header with call info */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="bg-green-500/20 text-green-600 border-green-500/30">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" />
              {t('dailyaudio', 'live', 'Live')}
            </Badge>
            <div className="flex items-center gap-2 text-gray-700">
              <Clock className="h-4 w-4" />
              <span className="font-mono font-medium">{formatDuration(sessionDuration)}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Audio status indicator - Enhanced */}
            {audioStatus === 'active' && (
              <Badge variant="secondary" className="bg-green-500/20 text-green-600 border-green-500/30">
                <Mic className="h-3 w-3 mr-1" />
                {t('dailyaudio', 'audioTransmitting', 'Audio Transmitting')}
              </Badge>
            )}
            {audioStatus === 'blocked' && (
              <Badge variant="destructive" className="animate-pulse">
                <XCircle className="h-3 w-3 mr-1" />
                {t('dailyaudio', 'micBlockedCheckPermissions', 'Mic Blocked - Check Permissions')}
              </Badge>
            )}
            {audioStatus === 'detecting' && (
              <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">
                <HelpCircle className="h-3 w-3 mr-1 animate-spin" />
                {t('dailyaudio', 'detectingMicrophoneShort', 'Detecting Microphone')}
              </Badge>
            )}
            {audioStatus === 'inactive' && isMicOn && (
              <Badge variant="secondary" className="bg-gray-500/20 text-gray-600 border-gray-500/30">
                <MicOff className="h-3 w-3 mr-1" />
                {t('dailyaudio', 'micMuted', 'Mic Muted')}
              </Badge>
            )}
            
            <div className="flex items-center gap-2 text-gray-700">
              <Users className="h-4 w-4" />
              <span className="font-medium">{participantCount}</span>
            </div>
          </div>
        </div>

        {/* Participants list */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            {t('dailyaudio', 'participantsCount', 'Participants ({count})').replace('{count}', String(participantCount))}
          </h4>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              {participants.map((participant) => (
                <AudioParticipantCard
                  key={participant.sessionId}
                  participant={participant}
                  isHost={isHost}
                />
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Controls - Enhanced with stacked icon-first design */}
        {showControls && (
          <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
            <div className="flex items-center justify-center gap-8">
              {/* Mic toggle - Stacked icon + label */}
              <button
                onClick={toggleMic}
                className="flex flex-col items-center gap-2 group"
              >
                <div className={`
                  w-16 h-16 rounded-full flex items-center justify-center
                  transition-all duration-200 transform group-hover:scale-105
                  ${isMicOn 
                    ? 'bg-gray-200 hover:bg-gray-300 text-gray-700' 
                    : 'bg-red-600 hover:bg-red-700 text-white'}
                `}>
                  {isMicOn ? (
                    <Mic className="h-7 w-7" />
                  ) : (
                    <MicOff className="h-7 w-7" />
                  )}
                </div>
                <span className="text-xs font-medium text-gray-600">
                  {isMicOn ? t('dailyaudio', 'mute', 'Mute') : t('dailyaudio', 'unmute', 'Unmute')}
                </span>
              </button>

              {/* End call button - Stacked icon + label */}
              <button
                onClick={handleEndCall}
                className="flex flex-col items-center gap-2 group"
              >
                <div className="
                  w-16 h-16 rounded-full flex items-center justify-center
                  bg-red-600 hover:bg-red-700 text-white
                  transition-all duration-200 transform group-hover:scale-105
                ">
                  <PhoneOff className="h-7 w-7" />
                </div>
                <span className="text-xs font-medium text-gray-600">
                  {isHost ? t('dailyaudio', 'endForAll', 'End for All') : t('dailyaudio', 'leave', 'Leave')}
                </span>
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DailyAudio;