import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  MonitorUp,
  MonitorX,
  Users,
  Signal
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoCallControlsProps {
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  isScreenSharing: boolean;
  isConnected: boolean;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'disconnected';
  participants: Map<string, any>;
  onToggleVideo: () => void;
  onToggleAudio: () => void;
  onStartScreenShare: () => void;
  onStopScreenShare: () => void;
  onLeave: () => void;
  isHost?: boolean;
}

export const VideoCallControls: React.FC<VideoCallControlsProps> = ({
  isVideoEnabled,
  isAudioEnabled,
  isScreenSharing,
  isConnected,
  connectionQuality,
  participants,
  onToggleVideo,
  onToggleAudio,
  onStartScreenShare,
  onStopScreenShare,
  onLeave,
  isHost = false
}) => {
  const getConnectionColor = () => {
    switch (connectionQuality) {
      case 'excellent': return 'text-green-500';
      case 'good': return 'text-blue-500';
      case 'poor': return 'text-yellow-500';
      default: return 'text-red-500';
    }
  };

  return (
    <div className="bg-gray-900 rounded-lg p-4">
      {/* Status Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Badge className="bg-green-500 text-white">
            <Users className="h-3 w-3 mr-1" />
            {participants.size + 1} Participants
          </Badge>
          
          <Badge className={cn("flex items-center gap-1", getConnectionColor())}>
            <Signal className="h-3 w-3" />
            {connectionQuality}
          </Badge>
        </div>
      </div>

      {/* Main Controls */}
      <div className="flex items-center justify-center gap-4">
        {/* Audio Toggle */}
        <Button
          onClick={onToggleAudio}
          size="lg"
          className={cn(
            "h-14 w-14 rounded-full transition-all",
            isAudioEnabled
              ? "bg-gray-700 hover:bg-gray-600 text-white"
              : "bg-red-600 hover:bg-red-700 text-white"
          )}
          title={isAudioEnabled ? "Mute microphone" : "Unmute microphone"}
        >
          {isAudioEnabled ? (
            <Mic className="h-6 w-6" />
          ) : (
            <MicOff className="h-6 w-6" />
          )}
        </Button>

        {/* Video Toggle */}
        <Button
          onClick={onToggleVideo}
          size="lg"
          className={cn(
            "h-14 w-14 rounded-full transition-all",
            isVideoEnabled
              ? "bg-gray-700 hover:bg-gray-600 text-white"
              : "bg-red-600 hover:bg-red-700 text-white"
          )}
          title={isVideoEnabled ? "Turn off camera" : "Turn on camera"}
        >
          {isVideoEnabled ? (
            <Video className="h-6 w-6" />
          ) : (
            <VideoOff className="h-6 w-6" />
          )}
        </Button>

        {/* Screen Share Toggle */}
        <Button
          onClick={isScreenSharing ? onStopScreenShare : onStartScreenShare}
          size="lg"
          className={cn(
            "h-14 w-14 rounded-full transition-all",
            isScreenSharing
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-gray-700 hover:bg-gray-600 text-white"
          )}
          title={isScreenSharing ? "Stop sharing screen" : "Share screen"}
        >
          {isScreenSharing ? (
            <MonitorX className="h-6 w-6" />
          ) : (
            <MonitorUp className="h-6 w-6" />
          )}
        </Button>

        {/* Leave Call */}
        <Button
          onClick={onLeave}
          size="lg"
          className="h-14 w-14 rounded-full bg-red-600 hover:bg-red-700 text-white transition-all"
          title="Leave call"
        >
          <PhoneOff className="h-6 w-6" />
        </Button>
      </div>

      {/* Helper Text */}
      {!isConnected && (
        <div className="text-center mt-4">
          <p className="text-yellow-500 text-sm">
            Connecting to video call...
          </p>
        </div>
      )}
    </div>
  );
};