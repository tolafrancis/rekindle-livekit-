import React, { useState, useEffect, useRef } from 'react';
import { useViewHistory } from '@rekindle/features/hooks/useViewHistory';
import Hls from 'hls.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  Download, Share2, Eye, EyeOff, Lock, Unlock, Calendar,
  Clock, Users, TrendingUp, BarChart3, AlertCircle,
  Check, X, Plus, Trash2, Edit, Settings, ChevronRight,
  Film, FileVideo, Loader2
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';

/* ======================================================
   TYPES
====================================================== */
interface Recording {
  meeting_id: string;
  meeting_title: string;
  channel_id: string;
  channel_name: string;
  recording_url: string;
  recording_duration_seconds: number;
  recording_size_mb: number;
  recording_status: 'none' | 'recording' | 'processing' | 'completed' | 'failed';
  recording_access_level: 'host_only' | 'participants' | 'followers' | 'public';
  recording_started_at: string;
  recording_ended_at: string;
  created_at: string;
}

interface RecordingMetadata {
  id: string;
  meeting_id: string;
  title?: string;
  description?: string;
  thumbnail_url?: string;
  resolution?: string;
  bitrate_kbps?: number;
  chapters?: Chapter[];
  transcript_url?: string;
  transcript_status?: string;
  captions_url?: string;
}

interface Chapter {
  time: number;
  title: string;
  description?: string;
}

interface RecordingView {
  id: string;
  meeting_id: string;
  viewer_id?: string;
  viewer_name?: string;
  started_at: string;
  ended_at?: string;
  watch_duration_seconds: number;
  completion_percentage: number;
}

interface RecordingAccess {
  id: string;
  meeting_id: string;
  user_id?: string;
  email?: string;
  access_type: 'view' | 'download' | 'admin';
  granted_by: string;
  granted_at: string;
  expires_at?: string;
  is_revoked: boolean;
  access_count: number;
}

interface AccessCheckResult {
  has_access: boolean;
  access_type?: string;
  reason: string;
}

/* ======================================================
   RECORDING PLAYER COMPONENT
====================================================== */
export const RecordingPlayer = ({ 
  recording, 
  metadata,
  onClose 
}: { 
  recording: Recording;
  metadata?: RecordingMetadata;
  onClose: () => void;
}) => {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState(0);

  // Load the recording into the <video>. LiveKit Egress serves HLS (.m3u8), which
  // only Safari plays natively — everywhere else needs hls.js. Mux/Daily MP4 URLs
  // still load directly. Attaching to our own videoRef keeps the custom controls.
  useEffect(() => {
    const video = videoRef.current;
    const url = recording.recording_url;
    if (!video || !url) return;
    let hls: Hls | null = null;
    const isHls = /\.m3u8($|\?)/i.test(url);
    if (isHls && !video.canPlayType('application/vnd.apple.mpegurl') && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(url);
      hls.attachMedia(video);
    } else {
      video.src = url;
    }
    return () => { if (hls) { try { hls.destroy(); } catch { /* noop */ } } };
  }, [recording.recording_url]);

  // Track recording view on mount
  useEffect(() => {
    const trackView = async () => {
      try {
        const { data, error } = await supabase.rpc('track_recording_view', {
          p_meeting_id: recording.meeting_id,
          p_channel_id: recording.channel_id,
          p_viewer_id: user?.id,
          p_session_id: `${Date.now()}-${Math.random()}`,
          p_viewer_name: user?.email
        });

        if (error) throw error;
        setViewId(data);
      } catch (error) {
        console.error('Error tracking view:', error);
      }
    };

    trackView();
  }, [recording.meeting_id, recording.channel_id, user?.id]);

  // Update progress every 10 seconds
  useEffect(() => {
    if (!viewId || !isPlaying) return;

    const interval = setInterval(() => {
      if (currentTime > lastUpdateTime + 10) {
        updateProgress();
        setLastUpdateTime(currentTime);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [viewId, isPlaying, currentTime, lastUpdateTime]);

  // Update progress on unmount
  useEffect(() => {
    return () => {
      if (viewId && currentTime > 0) {
        updateProgress();
      }
    };
  }, [viewId]);

  const updateProgress = async () => {
    if (!viewId || duration === 0) return;

    try {
      const completionPercentage = (currentTime / duration) * 100;
      await supabase.rpc('update_recording_view_progress', {
        p_view_id: viewId,
        p_watch_duration_seconds: Math.floor(currentTime),
        p_completion_percentage: completionPercentage
      });
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (value: number[]) => {
    const newTime = value[0];
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      videoRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const jumpToChapter = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">
              {metadata?.title || recording.meeting_title}
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {recording.channel_name} • {format(new Date(recording.recording_ended_at), 'MMM dd, yyyy')}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} className="text-white">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Player */}
        <div className="flex-1 flex items-center justify-center bg-black">
          <div className="relative w-full h-full">
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={() => {
                setIsPlaying(false);
                updateProgress();
              }}
            />

            {/* Video Controls Overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
              {/* Progress Bar */}
              <div className="mb-4">
                <input
                  type="range"
                  min={0}
                  max={duration}
                  value={currentTime}
                  onChange={(e) => handleSeek([parseFloat(e.target.value)])}
                  className="w-full"
                />
                <div className="flex items-center justify-between text-sm text-white mt-1">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={togglePlay}
                    className="text-white hover:bg-white/20"
                  >
                    {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                  </Button>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={toggleMute}
                      className="text-white hover:bg-white/20"
                    >
                      {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </Button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={isMuted ? 0 : volume}
                      onChange={(e) => handleVolumeChange([parseFloat(e.target.value)])}
                      className="w-24"
                    />
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleFullscreen}
                  className="text-white hover:bg-white/20"
                >
                  {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar - Chapters & Info */}
        {metadata?.chapters && metadata.chapters.length > 0 && (
          <div className="w-80 bg-gray-900 border-l border-gray-800 overflow-y-auto">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Chapters</h3>
              <div className="space-y-2">
                {metadata.chapters.map((chapter, index) => (
                  <button
                    key={index}
                    onClick={() => jumpToChapter(chapter.time)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      currentTime >= chapter.time && 
                      (index === metadata.chapters!.length - 1 || currentTime < metadata.chapters![index + 1].time)
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{chapter.title}</span>
                      <span className="text-sm text-gray-400">{formatTime(chapter.time)}</span>
                    </div>
                    {chapter.description && (
                      <p className="text-sm text-gray-400">{chapter.description}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ======================================================
   RECORDING MANAGER COMPONENT
====================================================== */
export const RecordingManager = ({ channelId }: { channelId: string }) => {
  const { user } = useAuth();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [recordingMetadata, setRecordingMetadata] = useState<Record<string, RecordingMetadata>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showAccessManager, setShowAccessManager] = useState(false);
  const [showMetadataEditor, setShowMetadataEditor] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [activeTab, setActiveTab] = useViewHistory<string>('recording-manager', 'recordings');

  useEffect(() => {
    loadRecordings();
  }, [channelId]);

  const loadRecordings = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('live_channel_video_meetings')
        .select(`
          id,
          title,
          channel_id,
          recording_url,
          recording_duration_seconds,
          recording_size_mb,
          recording_status,
          recording_access_level,
          recording_started_at,
          recording_ended_at,
          created_at,
          live_channels!inner(name)
        `)
        .eq('channel_id', channelId)
        .eq('recording_status', 'completed')
        .not('recording_url', 'is', null)
        .order('recording_ended_at', { ascending: false });

      if (error) throw error;

      const formattedRecordings: Recording[] = (data || []).map(item => ({
        meeting_id: item.id,
        meeting_title: item.title,
        channel_id: item.channel_id,
        channel_name: (item.live_channels as any).name,
        recording_url: item.recording_url!,
        recording_duration_seconds: item.recording_duration_seconds || 0,
        recording_size_mb: item.recording_size_mb || 0,
        recording_status: item.recording_status as any,
        recording_access_level: item.recording_access_level as any,
        recording_started_at: item.recording_started_at!,
        recording_ended_at: item.recording_ended_at!,
        created_at: item.created_at
      }));

      setRecordings(formattedRecordings);

      // Load metadata for each recording
      for (const recording of formattedRecordings) {
        loadMetadata(recording.meeting_id);
      }
    } catch (error) {
      console.error('Error loading recordings:', error);
      toast.error('Failed to load recordings');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMetadata = async (meetingId: string) => {
    try {
      const { data, error } = await supabase
        .from('live_channel_recording_metadata')
        .select('*')
        .eq('meeting_id', meetingId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setRecordingMetadata(prev => ({
          ...prev,
          [meetingId]: {
            ...data,
            chapters: data.chapters as Chapter[]
          }
        }));
      }
    } catch (error) {
      console.error('Error loading metadata:', error);
    }
  };

  const checkAccess = async (recording: Recording): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('check_recording_access', {
        p_meeting_id: recording.meeting_id,
        p_user_id: user?.id
      });

      if (error) throw error;

      if (!data || !data[0]?.has_access) {
        toast.error(data?.[0]?.reason || 'You do not have access to this recording');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error checking access:', error);
      toast.error('Failed to verify access');
      return false;
    }
  };

  const handlePlayRecording = async (recording: Recording) => {
    const hasAccess = await checkAccess(recording);
    if (hasAccess) {
      setSelectedRecording(recording);
      setShowPlayer(true);
    }
  };

  const handleUpdateAccessLevel = async (meetingId: string, accessLevel: string) => {
    try {
      const { error } = await supabase
        .from('live_channel_video_meetings')
        .update({ recording_access_level: accessLevel })
        .eq('id', meetingId);

      if (error) throw error;

      toast.success('Access level updated');
      loadRecordings();
    } catch (error) {
      console.error('Error updating access level:', error);
      toast.error('Failed to update access level');
    }
  };

  const handleDeleteRecording = async (meetingId: string) => {
    if (!confirm('Are you sure you want to delete this recording? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('live_channel_video_meetings')
        .update({ 
          recording_url: null,
          recording_status: 'none'
        })
        .eq('id', meetingId);

      if (error) throw error;

      toast.success('Recording deleted');
      loadRecordings();
    } catch (error) {
      console.error('Error deleting recording:', error);
      toast.error('Failed to delete recording');
    }
  };

  const formatFileSize = (mb: number) => {
    if (mb < 1) return `${Math.round(mb * 1024)} KB`;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
  };

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins}m ${secs}s`;
  };

  if (showPlayer && selectedRecording) {
    return (
      <RecordingPlayer
        recording={selectedRecording}
        metadata={recordingMetadata[selectedRecording.meeting_id]}
        onClose={() => {
          setShowPlayer(false);
          setSelectedRecording(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Recording Library</h2>
          <p className="text-gray-600 mt-1">Manage and share your meeting recordings</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="recordings" className="flex items-center gap-2">
            <Film className="h-4 w-4" />
            Recordings ({recordings.length})
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recordings" className="space-y-4 mt-6">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
            </div>
          ) : recordings.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <FileVideo className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Recordings Yet</h3>
                <p className="text-gray-600">
                  Recordings from your meetings will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recordings.map(recording => {
                const metadata = recordingMetadata[recording.meeting_id];
                return (
                  <Card key={recording.meeting_id} className="overflow-hidden hover:shadow-lg transition-shadow">
                    {/* Thumbnail */}
                    <div className="relative aspect-video bg-gray-900">
                      {metadata?.thumbnail_url ? (
                        <img 
                          src={metadata.thumbnail_url} 
                          alt={recording.meeting_title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <FileVideo className="h-16 w-16 text-gray-600" />
                        </div>
                      )}
                      <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 px-2 py-1 rounded text-white text-sm">
                        {formatDuration(recording.recording_duration_seconds)}
                      </div>
                      <Button
                        size="lg"
                        className="absolute inset-0 m-auto w-16 h-16 rounded-full opacity-0 hover:opacity-100 transition-opacity"
                        onClick={() => handlePlayRecording(recording)}
                      >
                        <Play className="h-8 w-8" />
                      </Button>
                    </div>

                    <CardHeader>
                      <div className="space-y-2">
                        <CardTitle className="line-clamp-2">{metadata?.title || recording.meeting_title}</CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {recording.recording_access_level.replace('_', ' ')}
                          </Badge>
                          <span className="text-sm text-gray-500">
                            {format(new Date(recording.recording_ended_at), 'MMM dd, yyyy')}
                          </span>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent>
                      <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
                        <span>{formatFileSize(recording.recording_size_mb)}</span>
                        {metadata?.resolution && <span>{metadata.resolution}</span>}
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handlePlayRecording(recording)}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Play
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedRecording(recording);
                            setShowAccessManager(true);
                          }}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          <RecordingAnalytics recordings={recordings} channelId={channelId} />
        </TabsContent>
      </Tabs>

      {/* Access Manager Dialog */}
      {showAccessManager && selectedRecording && (
        <RecordingAccessManager
          recording={selectedRecording}
          onClose={() => {
            setShowAccessManager(false);
            setSelectedRecording(null);
            loadRecordings();
          }}
        />
      )}
    </div>
  );
};

/* ======================================================
   RECORDING ACCESS MANAGER
====================================================== */
const RecordingAccessManager = ({ 
  recording, 
  onClose 
}: { 
  recording: Recording;
  onClose: () => void;
}) => {
  const { user } = useAuth();
  const [accessGrants, setAccessGrants] = useState<RecordingAccess[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showGrantDialog, setShowGrantDialog] = useState(false);
  const [grantEmail, setGrantEmail] = useState('');
  const [grantAccessType, setGrantAccessType] = useState<'view' | 'download'>('view');
  const [grantExpires, setGrantExpires] = useState('');

  useEffect(() => {
    loadAccessGrants();
  }, [recording.meeting_id]);

  const loadAccessGrants = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('live_channel_recording_access')
        .select('*')
        .eq('meeting_id', recording.meeting_id)
        .eq('is_revoked', false)
        .order('granted_at', { ascending: false });

      if (error) throw error;
      setAccessGrants(data || []);
    } catch (error) {
      console.error('Error loading access grants:', error);
      toast.error('Failed to load access grants');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGrantAccess = async () => {
    if (!grantEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('grant_recording_access', {
        p_meeting_id: recording.meeting_id,
        p_granted_by: user?.id,
        p_email: grantEmail,
        p_access_type: grantAccessType,
        p_expires_at: grantExpires || null
      });

      if (error) throw error;

      toast.success('Access granted successfully');
      setShowGrantDialog(false);
      setGrantEmail('');
      setGrantExpires('');
      loadAccessGrants();
    } catch (error: any) {
      console.error('Error granting access:', error);
      toast.error(error.message || 'Failed to grant access');
    }
  };

  const handleRevokeAccess = async (accessId: string) => {
    try {
      const { error } = await supabase.rpc('revoke_recording_access', {
        p_access_id: accessId,
        p_revoked_by: user?.id
      });

      if (error) throw error;

      toast.success('Access revoked');
      loadAccessGrants();
    } catch (error) {
      console.error('Error revoking access:', error);
      toast.error('Failed to revoke access');
    }
  };

  const handleUpdateAccessLevel = async (accessLevel: string) => {
    try {
      const { error } = await supabase
        .from('live_channel_video_meetings')
        .update({ recording_access_level: accessLevel })
        .eq('id', recording.meeting_id);

      if (error) throw error;

      toast.success('Access level updated');
      onClose();
    } catch (error) {
      console.error('Error updating access level:', error);
      toast.error('Failed to update access level');
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Recording Access Management</DialogTitle>
          <DialogDescription>
            Control who can access and view this recording
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Default Access Level */}
          <div>
            <Label>Default Access Level</Label>
            <Select
              value={recording.recording_access_level}
              onValueChange={handleUpdateAccessLevel}
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="host_only">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    <span>Host Only</span>
                  </div>
                </SelectItem>
                <SelectItem value="participants">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>Meeting Participants</span>
                  </div>
                </SelectItem>
                <SelectItem value="followers">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    <span>Channel Followers</span>
                  </div>
                </SelectItem>
                <SelectItem value="public">
                  <div className="flex items-center gap-2">
                    <Unlock className="h-4 w-4" />
                    <span>Public</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-gray-500 mt-2">
              This controls who can access the recording by default
            </p>
          </div>

          {/* Individual Access Grants */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <Label>Individual Access Grants</Label>
              <Button size="sm" onClick={() => setShowGrantDialog(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Grant Access
              </Button>
            </div>

            {isLoading ? (
              <div className="text-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" />
              </div>
            ) : accessGrants.length === 0 ? (
              <div className="text-center py-8 border rounded-lg">
                <p className="text-gray-500">No individual access grants yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {accessGrants.map(grant => (
                  <Card key={grant.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{grant.email}</p>
                          <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                            <Badge variant="secondary">{grant.access_type}</Badge>
                            <span>•</span>
                            <span>Granted {format(new Date(grant.granted_at), 'MMM dd, yyyy')}</span>
                            {grant.expires_at && (
                              <>
                                <span>•</span>
                                <span>Expires {format(new Date(grant.expires_at), 'MMM dd, yyyy')}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevokeAccess(grant.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Grant Access Dialog */}
        {showGrantDialog && (
          <Dialog open={showGrantDialog} onOpenChange={setShowGrantDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Grant Recording Access</DialogTitle>
                <DialogDescription>
                  Give someone access to view or download this recording
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="grant-email">Email Address</Label>
                  <Input
                    id="grant-email"
                    type="email"
                    value={grantEmail}
                    onChange={(e) => setGrantEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="grant-access-type">Access Type</Label>
                  <Select
                    value={grantAccessType}
                    onValueChange={(value: 'view' | 'download') => setGrantAccessType(value)}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="view">View Only</SelectItem>
                      <SelectItem value="download">View & Download</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="grant-expires">Expires At (Optional)</Label>
                  <Input
                    id="grant-expires"
                    type="datetime-local"
                    value={grantExpires}
                    onChange={(e) => setGrantExpires(e.target.value)}
                    className="mt-2"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Leave empty for permanent access
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowGrantDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleGrantAccess}>
                  Grant Access
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
};

/* ======================================================
   RECORDING ANALYTICS
====================================================== */
const RecordingAnalytics = ({ 
  recordings, 
  channelId 
}: { 
  recordings: Recording[];
  channelId: string;
}) => {
  const [views, setViews] = useState<RecordingView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  useEffect(() => {
    loadAnalytics();
  }, [channelId, dateRange]);

  const loadAnalytics = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('live_channel_recording_views')
        .select('*')
        .eq('channel_id', channelId)
        .order('started_at', { ascending: false });

      // Apply date filter
      if (dateRange !== 'all') {
        const days = parseInt(dateRange);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        query = query.gte('started_at', startDate.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      setViews(data || []);
    } catch (error) {
      console.error('Error loading analytics:', error);
      toast.error('Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  };

  const totalViews = views.length;
  const uniqueViewers = new Set(views.map(v => v.viewer_id).filter(Boolean)).size;
  const totalWatchTime = views.reduce((sum, v) => sum + v.watch_duration_seconds, 0);
  const avgCompletion = views.length > 0 
    ? views.reduce((sum, v) => sum + v.completion_percentage, 0) / views.length 
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Recording Analytics</h3>
        <Select value={dateRange} onValueChange={(value: any) => setDateRange(value)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Views</p>
                <p className="text-3xl font-bold mt-2">{totalViews}</p>
              </div>
              <Eye className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Unique Viewers</p>
                <p className="text-3xl font-bold mt-2">{uniqueViewers}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Watch Time</p>
                <p className="text-3xl font-bold mt-2">
                  {Math.round(totalWatchTime / 3600)}h
                </p>
              </div>
              <Clock className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Avg Completion</p>
                <p className="text-3xl font-bold mt-2">{Math.round(avgCompletion)}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Views Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Views</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" />
            </div>
          ) : views.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No views recorded yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4">Viewer</th>
                    <th className="text-left py-3 px-4">Started</th>
                    <th className="text-left py-3 px-4">Duration</th>
                    <th className="text-left py-3 px-4">Completion</th>
                  </tr>
                </thead>
                <tbody>
                  {views.slice(0, 10).map(view => (
                    <tr key={view.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">{view.viewer_name || 'Anonymous'}</td>
                      <td className="py-3 px-4">
                        {format(new Date(view.started_at), 'MMM dd, yyyy HH:mm')}
                      </td>
                      <td className="py-3 px-4">
                        {Math.round(view.watch_duration_seconds / 60)}m
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Progress value={view.completion_percentage} className="w-24" />
                          <span className="text-sm">{Math.round(view.completion_percentage)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RecordingManager;