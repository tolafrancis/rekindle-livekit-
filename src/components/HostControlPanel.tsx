import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  X, UserMinus, MicOff, Mic, VideoOff, Video, Users as UsersIcon, AlertTriangle,
  Shield, UserCheck, UserX, Hand, Video as VideoIcon, Lock, Unlock,
  MessageSquare, Settings2, Radio, Circle, Square, Crown, Star, Pin, UserPlus, Loader2
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ParticipantState, ParticipantRole, MeetingSettings, WaitingRoomParticipant } from '@/types/liveChannelTypes';

interface HostControlPanelProps {
  participants: ParticipantState[];
  waitingRoomParticipants: WaitingRoomParticipant[];
  meetingSettings: MeetingSettings;
  isRecording: boolean;
  spotlightedParticipantId: string | null;
  isHost: boolean;
  onMuteAll: () => void;
  onDisableAllVideo: () => void;
  onMuteParticipant: (participantId: string) => void;
  onAllowUnmute: (participantId: string) => void;
  onRequestUnmute: (participantId: string, participantName: string) => void;
  onDisableParticipantVideo: (participantId: string) => void;
  onAllowVideo: (participantId: string) => void;
  onRequestVideo: (participantId: string, participantName: string) => void;
  onRemoveParticipant: (participantId: string) => void;
  onAssignRole: (participantId: string, role: ParticipantRole) => void;
  onAdmitFromWaitingRoom: (participantId: string) => void;
  onAdmitAllFromWaitingRoom: () => void;
  onRejectFromWaitingRoom: (participantId: string) => void;
  onLockMeeting: (locked: boolean) => void;
  onUpdateSettings: (settings: Partial<MeetingSettings>) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  /** Whether the meeting was created with recording enabled (subscription-gated) */
  enableRecording?: boolean;
  /** Current recording lifecycle state from the parent */
  recordingStatus?: 'idle' | 'starting' | 'recording' | 'stopping' | 'error';
  onSpotlightParticipant: (participantId: string | null) => void;
  onLowerHand: (participantId: string) => void;
  onClose: () => void;
}

export const HostControlPanel: React.FC<HostControlPanelProps> = ({
  participants,
  waitingRoomParticipants,
  meetingSettings,
  isRecording,
  spotlightedParticipantId,
  isHost,
  onMuteAll,
  onDisableAllVideo,
  onMuteParticipant,
  onAllowUnmute,
  onRequestUnmute,
  onDisableParticipantVideo,
  onAllowVideo,
  onRequestVideo,
  onRemoveParticipant,
  onAssignRole,
  onAdmitFromWaitingRoom,
  onAdmitAllFromWaitingRoom,
  onRejectFromWaitingRoom,
  onLockMeeting,
  onUpdateSettings,
  onStartRecording,
  onStopRecording,
  enableRecording = false,
  recordingStatus = 'idle',
  onSpotlightParticipant,
  onLowerHand,
  onClose
}) => {
  const [showMuteAllDialog, setShowMuteAllDialog] = useState(false);
  const [showVideoOffDialog, setShowVideoOffDialog] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<ParticipantState | null>(null);
  const [activeTab, setActiveTab] = useState('participants');

  const handleMuteAll = () => {
    onMuteAll();
    setShowMuteAllDialog(false);
  };

  const handleDisableAllVideo = () => {
    onDisableAllVideo();
    setShowVideoOffDialog(false);
  };

  const handleRemoveParticipant = () => {
    if (selectedParticipant) {
      onRemoveParticipant(selectedParticipant.session_id);
      setShowRemoveDialog(false);
      setSelectedParticipant(null);
    }
  };

  const getRoleIcon = (role: ParticipantRole) => {
    switch (role) {
      case 'host': return <Crown className="h-3 w-3" />;
      case 'co-host': return <Shield className="h-3 w-3" />;
      case 'speaker': return <Mic className="h-3 w-3" />;
      case 'attendee': return <UserCheck className="h-3 w-3" />;
    }
  };

  const getRoleBadgeColor = (role: ParticipantRole) => {
    switch (role) {
      case 'host': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'co-host': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'speaker': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'attendee': return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  // Filter participants
  const activeParticipants = participants.filter(p => !p.isInWaitingRoom);
  const raisedHandParticipants = activeParticipants.filter(p => p.handRaised);

  return (
    <>
      <Card className="w-96 h-full flex flex-col bg-gray-800 border-l border-gray-700">
        <CardHeader className="border-b border-gray-700 flex-shrink-0 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <UsersIcon className="h-5 w-5" />
              {isHost ? 'Host Controls' : 'Meeting Info'}
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-gray-400 hover:text-white h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="mx-4 mt-3 grid grid-cols-3 bg-gray-700/50">
            <TabsTrigger value="participants" className="text-xs">
              Participants
              {raisedHandParticipants.length > 0 && (
                <Badge className="ml-1 h-4 px-1 bg-amber-500">{raisedHandParticipants.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="waiting" className="text-xs">
              Waiting
              {waitingRoomParticipants.length > 0 && (
                <Badge className="ml-1 h-4 px-1 bg-blue-500">{waitingRoomParticipants.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="settings" className="text-xs">Settings</TabsTrigger>
          </TabsList>

          {/* Participants Tab */}
          <TabsContent value="participants" className="flex-1 flex flex-col px-4 pb-4">
            {isHost && (
              <div className="space-y-2 mb-4">
                <h3 className="text-sm font-semibold text-gray-300">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full bg-gray-700 hover:bg-gray-600 text-white border-gray-600"
                    onClick={() => setShowMuteAllDialog(true)}
                    disabled={activeParticipants.length === 0}
                  >
                    <MicOff className="h-3 w-3 mr-1" />
                    Mute All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full bg-gray-700 hover:bg-gray-600 text-white border-gray-600"
                    onClick={() => setShowVideoOffDialog(true)}
                    disabled={activeParticipants.length === 0}
                  >
                    <VideoOff className="h-3 w-3 mr-1" />
                    Stop All Video
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-300">
                In Meeting ({activeParticipants.length})
              </h3>
            </div>

            <ScrollArea className="flex-1 -mx-4 px-4">
              {activeParticipants.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-gray-400 text-sm text-center">
                    No participants<br />in the meeting
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeParticipants.map((participant) => (
                    <div
                      key={participant.session_id}
                      className={`bg-gray-700 rounded-lg p-3 ${
                        participant.isSpotlighted ? 'ring-2 ring-amber-500' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center text-white font-semibold flex-shrink-0 text-sm relative">
                            {participant.user_name.charAt(0).toUpperCase()}
                            {participant.handRaised && (
                              <Hand className="absolute -top-1 -right-1 h-4 w-4 text-amber-400 fill-amber-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <p className="text-white text-sm font-medium truncate">
                                {participant.user_name}
                                {participant.isLocal && ' (You)'}
                              </p>
                              {participant.isSpotlighted && (
                                <Star className="h-3 w-3 text-amber-400 fill-amber-400 flex-shrink-0" />
                              )}
                            </div>
                            <Badge 
                              variant="outline" 
                              className={`text-xs mt-1 ${getRoleBadgeColor(participant.role)}`}
                            >
                              {getRoleIcon(participant.role)}
                              <span className="ml-1">{participant.role}</span>
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary" className={participant.hasAudio ? "bg-green-500/20 text-green-400 text-xs" : "bg-red-500/20 text-red-400 text-xs"}>
                          {participant.hasAudio ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
                        </Badge>
                        <Badge variant="secondary" className={participant.hasVideo ? "bg-blue-500/20 text-blue-400 text-xs" : "bg-gray-500/20 text-gray-400 text-xs"}>
                          {participant.hasVideo ? <Video className="h-3 w-3" /> : <VideoOff className="h-3 w-3" />}
                        </Badge>
                        {participant.hasScreenShare && (
                          <Badge variant="secondary" className="bg-purple-500/20 text-purple-400 text-xs">
                            Screen
                          </Badge>
                        )}
                      </div>

                      {isHost && !participant.isLocal && (
                        <div className="flex gap-1">
                          <Select
                            value={participant.role}
                            onValueChange={(role) => onAssignRole(participant.session_id, role as ParticipantRole)}
                          >
                            <SelectTrigger className="h-7 text-xs bg-gray-600 border-gray-500 flex-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="host">Host</SelectItem>
                              <SelectItem value="co-host">Co-host</SelectItem>
                              <SelectItem value="speaker">Speaker</SelectItem>
                              <SelectItem value="attendee">Attendee</SelectItem>
                            </SelectContent>
                          </Select>
                          
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-gray-400 hover:text-white hover:bg-gray-600"
                            onClick={() => {
                              if (participant.hasAudio) {
                                // Participant is unmuted - mute them
                                onMuteParticipant(participant.session_id);
                              } else if (participant.isMutedByHost) {
                                // Muted by host - allow them to unmute
                                onAllowUnmute(participant.session_id);
                              } else {
                                // Self-muted - request they unmute
                                onRequestUnmute(participant.session_id, participant.user_name);
                              }
                            }}
                            title={
                              participant.hasAudio 
                                ? "Mute" 
                                : participant.isMutedByHost 
                                ? "Allow unmute" 
                                : "Request unmute"
                            }
                          >
                            {participant.hasAudio ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                          </Button>
                          
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-gray-400 hover:text-white hover:bg-gray-600"
                            onClick={() => {
                              if (participant.hasVideo) {
                                // Participant has video on - disable it
                                onDisableParticipantVideo(participant.session_id);
                              } else if (!participant.videoEnabled) {
                                // Video disabled by host - allow them to enable
                                onAllowVideo(participant.session_id);
                              } else {
                                // Video is off by choice - request they enable
                                onRequestVideo(participant.session_id, participant.user_name);
                              }
                            }}
                            title={
                              participant.hasVideo 
                                ? "Stop video" 
                                : !participant.videoEnabled 
                                ? "Allow video" 
                                : "Request video"
                            }
                          >
                            {participant.hasVideo ? <VideoOff className="h-3 w-3" /> : <VideoIcon className="h-3 w-3" />}
                          </Button>

                          {participant.isSpotlighted ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-amber-400 hover:text-amber-300 hover:bg-gray-600"
                              onClick={() => onSpotlightParticipant(null)}
                              title="Remove spotlight"
                            >
                              <Star className="h-3 w-3 fill-current" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-gray-400 hover:text-amber-400 hover:bg-gray-600"
                              onClick={() => onSpotlightParticipant(participant.session_id)}
                              title="Spotlight"
                            >
                              <Star className="h-3 w-3" />
                            </Button>
                          )}

                          {participant.handRaised && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-amber-400 hover:text-white hover:bg-gray-600"
                              onClick={() => onLowerHand(participant.session_id)}
                              title="Lower hand"
                            >
                              <Hand className="h-3 w-3" />
                            </Button>
                          )}
                          
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                            onClick={() => {
                              setSelectedParticipant(participant);
                              setShowRemoveDialog(true);
                            }}
                            title="Remove participant"
                          >
                            <UserMinus className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Waiting Room Tab */}
          <TabsContent value="waiting" className="flex-1 flex flex-col px-4 pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-300">
                Waiting Room ({waitingRoomParticipants.length})
              </h3>
              {waitingRoomParticipants.length > 0 && isHost && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs bg-green-600 hover:bg-green-700 border-green-600"
                  onClick={onAdmitAllFromWaitingRoom}
                >
                  <UserPlus className="h-3 w-3 mr-1" />
                  Admit All
                </Button>
              )}
            </div>

            <ScrollArea className="flex-1 -mx-4 px-4">
              {waitingRoomParticipants.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-gray-400 text-sm text-center">
                    No one in<br />the waiting room
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {waitingRoomParticipants.map((participant) => (
                    <div key={participant.session_id} className="bg-gray-700 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gray-600 flex items-center justify-center text-white font-semibold text-sm">
                            {participant.user_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-white text-sm font-medium">{participant.user_name}</p>
                            <p className="text-xs text-gray-400">
                              Waiting since {new Date(participant.joinedWaitingRoomAt).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>

                        {isHost && (
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              className="h-7 w-7 bg-green-600 hover:bg-green-700"
                              onClick={() => onAdmitFromWaitingRoom(participant.session_id)}
                              title="Admit"
                            >
                              <UserCheck className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                              onClick={() => onRejectFromWaitingRoom(participant.session_id)}
                              title="Reject"
                            >
                              <UserX className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="flex-1 flex flex-col px-4 pb-4">
            <ScrollArea className="flex-1 -mx-4 px-4">
              <div className="space-y-4">
                {/* Meeting Security */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Security
                  </h3>
                  
                  <div className="flex items-center justify-between bg-gray-700 p-3 rounded-lg">
                    <div>
                      <Label className="text-sm text-white">Lock Meeting</Label>
                      <p className="text-xs text-gray-400">Prevent new participants from joining</p>
                    </div>
                    <Switch
                      checked={meetingSettings.isLocked}
                      onCheckedChange={onLockMeeting}
                      disabled={!isHost}
                    />
                  </div>

                  <div className="flex items-center justify-between bg-gray-700 p-3 rounded-lg">
                    <div>
                      <Label className="text-sm text-white">Waiting Room</Label>
                      <p className="text-xs text-gray-400">Admit participants before joining</p>
                    </div>
                    <Switch
                      checked={meetingSettings.waitingRoomEnabled}
                      onCheckedChange={(checked) => onUpdateSettings({ waitingRoomEnabled: checked })}
                      disabled={!isHost}
                    />
                  </div>
                </div>

                <Separator className="bg-gray-600" />

                {/* Participant Controls */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    Participant Defaults
                  </h3>

                  <div className="flex items-center justify-between bg-gray-700 p-3 rounded-lg">
                    <div>
                      <Label className="text-sm text-white">Mute on Entry</Label>
                      <p className="text-xs text-gray-400">Join with microphone muted</p>
                    </div>
                    <Switch
                      checked={meetingSettings.muteOnEntry}
                      onCheckedChange={(checked) => onUpdateSettings({ muteOnEntry: checked })}
                      disabled={!isHost}
                    />
                  </div>

                  <div className="flex items-center justify-between bg-gray-700 p-3 rounded-lg">
                    <div>
                      <Label className="text-sm text-white">Video Off on Entry</Label>
                      <p className="text-xs text-gray-400">Join with camera off</p>
                    </div>
                    <Switch
                      checked={meetingSettings.videoOnEntry}
                      onCheckedChange={(checked) => onUpdateSettings({ videoOnEntry: !checked })}
                      disabled={!isHost}
                    />
                  </div>

                  <div className="flex items-center justify-between bg-gray-700 p-3 rounded-lg">
                    <div>
                      <Label className="text-sm text-white">Allow Unmute</Label>
                      <p className="text-xs text-gray-400">Participants can unmute themselves</p>
                    </div>
                    <Switch
                      checked={meetingSettings.allowUnmute}
                      onCheckedChange={(checked) => onUpdateSettings({ allowUnmute: checked })}
                      disabled={!isHost}
                    />
                  </div>

                  <div className="flex items-center justify-between bg-gray-700 p-3 rounded-lg">
                    <div>
                      <Label className="text-sm text-white">Allow Video</Label>
                      <p className="text-xs text-gray-400">Participants can enable video</p>
                    </div>
                    <Switch
                      checked={meetingSettings.allowVideo}
                      onCheckedChange={(checked) => onUpdateSettings({ allowVideo: checked })}
                      disabled={!isHost}
                    />
                  </div>

                  <div className="flex items-center justify-between bg-gray-700 p-3 rounded-lg">
                    <div>
                      <Label className="text-sm text-white">Allow Screen Share</Label>
                      <p className="text-xs text-gray-400">Participants can share screen</p>
                    </div>
                    <Switch
                      checked={meetingSettings.allowScreenShare}
                      onCheckedChange={(checked) => onUpdateSettings({ allowScreenShare: checked })}
                      disabled={!isHost}
                    />
                  </div>
                </div>

                <Separator className="bg-gray-600" />

                {/* Chat Settings */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Chat Settings
                  </h3>

                  <div className="bg-gray-700 p-3 rounded-lg">
                    <Label className="text-sm text-white mb-2 block">Chat Mode</Label>
                    <Select
                      value={meetingSettings.chatMode}
                      onValueChange={(value: 'all' | 'host-only' | 'disabled') => 
                        onUpdateSettings({ chatMode: value })
                      }
                      disabled={!isHost}
                    >
                      <SelectTrigger className="bg-gray-600 border-gray-500">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Everyone can chat</SelectItem>
                        <SelectItem value="host-only">Host/Co-host only</SelectItem>
                        <SelectItem value="disabled">Chat disabled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator className="bg-gray-600" />

                {/* Recording */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                    <Radio className="h-4 w-4" />
                    Recording
                  </h3>

                  <div className="bg-gray-700 p-3 rounded-lg">
                    {!enableRecording ? (
                      <p className="text-xs text-gray-400">
                        Recording was not enabled when this meeting was created.
                        Create a new meeting with "Enable Recording" turned on.
                      </p>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm text-white">Recording Status</Label>
                          <p className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                            {recordingStatus === 'starting' ? (
                              <><Loader2 className="h-2.5 w-2.5 animate-spin text-orange-400" />Starting…</>
                            ) : recordingStatus === 'stopping' ? (
                              <><Loader2 className="h-2.5 w-2.5 animate-spin text-yellow-400" />Stopping…</>
                            ) : recordingStatus === 'error' ? (
                              <span className="text-red-400">Recording error — try again</span>
                            ) : isRecording ? (
                              <><Circle className="h-2 w-2 fill-red-500 text-red-500 animate-pulse" />Recording in progress</>
                            ) : (
                              'Not recording'
                            )}
                          </p>
                        </div>
                        {isHost && (
                          <Button
                            size="sm"
                            variant={isRecording ? 'destructive' : 'default'}
                            disabled={recordingStatus === 'starting' || recordingStatus === 'stopping'}
                            onClick={isRecording ? onStopRecording : onStartRecording}
                            className="h-8 min-w-[72px]"
                          >
                            {recordingStatus === 'starting' || recordingStatus === 'stopping' ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : isRecording ? (
                              <><Square className="h-3.5 w-3.5 mr-1" />Stop</>
                            ) : (
                              <><Circle className="h-3.5 w-3.5 mr-1" />Start</>
                            )}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Info Footer */}
        {isHost && (
          <div className="p-4 border-t border-gray-700 flex-shrink-0">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex gap-2">
              <AlertTriangle className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-200">
                As host, you have full control over meeting settings and participants.
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Mute All Confirmation Dialog */}
      <AlertDialog open={showMuteAllDialog} onOpenChange={setShowMuteAllDialog}>
        <AlertDialogContent className="bg-gray-800 border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Mute All Participants?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              This will mute all participants. They can unmute if allowed in settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-700 text-white hover:bg-gray-600">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleMuteAll} className="bg-red-600 hover:bg-red-700">
              Mute All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disable All Video Confirmation Dialog */}
      <AlertDialog open={showVideoOffDialog} onOpenChange={setShowVideoOffDialog}>
        <AlertDialogContent className="bg-gray-800 border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Stop All Video?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              This will disable video for all participants. They can enable if allowed in settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-700 text-white hover:bg-gray-600">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDisableAllVideo} className="bg-red-600 hover:bg-red-700">
              Stop All Video
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Participant Confirmation Dialog */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent className="bg-gray-800 border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Remove Participant?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              Are you sure you want to remove <strong>{selectedParticipant?.user_name}</strong> from the meeting?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-700 text-white hover:bg-gray-600">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveParticipant} className="bg-red-600 hover:bg-red-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default HostControlPanel;