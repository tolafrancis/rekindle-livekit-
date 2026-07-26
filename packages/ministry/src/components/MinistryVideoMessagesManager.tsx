import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Badge } from '@rekindle/ui/badge';
import { Label } from '@rekindle/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@rekindle/ui/dialog';
import { supabase } from '@rekindle/supabase';
import { toast } from '@rekindle/ui/use-toast';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { notify } from '@rekindle/features/notify';
import {
  Video, Plus, Edit, Trash2, Search, Loader2, Star, Archive, ArchiveRestore,
  Upload, Circle, Square, ChevronUp, ChevronDown, BarChart3, Users, Eye,
  Clock, X, Send, CalendarClock, FileText,
} from 'lucide-react';

interface Props {
  ministryId: string;
  ministryName?: string;
}

type VideoStatus = 'draft' | 'processing' | 'ready' | 'scheduled' | 'published' | 'archived' | 'error';

interface VideoMessage {
  id: string;
  ministry_id: string;
  title: string;
  description: string | null;
  speaker_name: string | null;
  category: string | null;
  status: VideoStatus;
  is_pinned: boolean;
  display_order: number | null;
  scheduled_publish_at: string | null;
  published_at: string | null;
  raw_storage_key: string | null;
  playback_url: string | null;
  thumbnail_url: string | null;
  captions_url: string | null;
  duration_seconds: number | null;
  processing_error: string | null;
  created_at: string;
}

interface Analytics {
  totalViews: number;
  uniqueViewers: number;
  averageWatchSeconds: number;
  averageCompletion: number;
  reactionCounts: Record<string, number>;
  lastViewedAt: string | null;
}

const EMPTY_FORM = {
  title: '',
  description: '',
  speaker_name: '',
  category: '',
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function statusBadge(status: VideoStatus): { label: string; className: string } {
  switch (status) {
    case 'published': return { label: 'Published', className: 'bg-green-100 text-green-700 border-0' };
    case 'scheduled': return { label: 'Scheduled', className: 'bg-blue-100 text-blue-700 border-0' };
    case 'ready': return { label: 'Ready to publish', className: 'bg-purple-100 text-purple-700 border-0' };
    case 'processing': return { label: 'Processing…', className: 'bg-amber-100 text-amber-700 border-0' };
    case 'draft': return { label: 'Draft', className: 'bg-gray-100 text-gray-600 border-0' };
    case 'archived': return { label: 'Archived', className: 'bg-gray-100 text-gray-500 border-0' };
    case 'error': return { label: 'Error', className: 'bg-red-100 text-red-700 border-0' };
  }
}

export const MinistryVideoMessagesManager: React.FC<Props> = ({ ministryId, ministryName }) => {
  const { user } = useAuth();
  const { t } = useLanguage();

  const [videos, setVideos] = useState<VideoMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [speakerFilter, setSpeakerFilter] = useState('all');

  const [showModal, setShowModal] = useState(false);
  const [editingVideo, setEditingVideo] = useState<VideoMessage | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Upload / record
  const [mode, setMode] = useState<'upload' | 'record'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordStreamRef = useRef<MediaStream | null>(null);

  // Schedule
  const [scheduleAt, setScheduleAt] = useState('');

  // Analytics
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [analyticsVideo, setAnalyticsVideo] = useState<VideoMessage | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  useEffect(() => {
    loadVideos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ministryId]);

  // Auto-refresh while anything is still processing, so the list picks up
  // the transcode worker's progress without the admin needing to reload.
  useEffect(() => {
    const hasProcessing = videos.some((v) => v.status === 'processing');
    if (!hasProcessing) return;
    const interval = setInterval(loadVideos, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      recordStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, [previewUrl]);

  const loadVideos = async () => {
    try {
      const { data, error } = await supabase
        .from('ministry_video_messages')
        .select('*')
        .eq('ministry_id', ministryId)
        .order('is_pinned', { ascending: false })
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      setVideos(data || []);
    } catch (err) {
      console.error('Error loading video messages:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Create / edit ────────────────────────────────────────────────────────

  const handleCreate = () => {
    setEditingVideo(null);
    setFormData(EMPTY_FORM);
    setMode('upload');
    setSelectedFile(null);
    setRecordedBlob(null);
    setPreviewUrl(null);
    setScheduleAt('');
    setShowModal(true);
  };

  const handleEdit = (video: VideoMessage) => {
    setEditingVideo(video);
    setFormData({
      title: video.title,
      description: video.description || '',
      speaker_name: video.speaker_name || '',
      category: video.category || '',
    });
    setSelectedFile(null);
    setRecordedBlob(null);
    setPreviewUrl(null);
    setScheduleAt(video.scheduled_publish_at ? video.scheduled_publish_at.slice(0, 16) : '');
    setShowModal(true);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      recordStreamRef.current = stream;
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        previewVideoRef.current.muted = true;
        await previewVideoRef.current.play().catch(() => {});
      }
      recordedChunksRef.current = [];
      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
        .find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        recordStreamRef.current?.getTracks().forEach((tr) => tr.stop());
        recordStreamRef.current = null;
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err: any) {
      toast({ title: t('ministryVideoMessagesManager', 'cameraError', 'Camera/microphone error'), description: err.message, variant: 'destructive' });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const reRecord = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setRecordedBlob(null);
    setPreviewUrl(null);
  };

  const uploadFileWithProgress = (url: string, file: Blob, contentType: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: HTTP ${xhr.status}`)));
      xhr.onerror = () => reject(new Error('Upload failed (network error)'));
      xhr.send(file);
    });
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast({ title: t('ministryVideoMessagesManager', 'error', 'Error'), description: t('ministryVideoMessagesManager', 'titleRequired', 'Title is required'), variant: 'destructive' });
      return;
    }

    const fileToUpload = mode === 'record' ? recordedBlob : selectedFile;
    setSaving(true);
    try {
      const metaPayload = {
        ministry_id: ministryId,
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        speaker_name: formData.speaker_name.trim() || null,
        category: formData.category.trim() || null,
        created_by: user?.id,
        updated_at: new Date().toISOString(),
      };

      let videoId: string;
      if (editingVideo) {
        const { error } = await supabase.from('ministry_video_messages').update(metaPayload).eq('id', editingVideo.id);
        if (error) throw error;
        videoId = editingVideo.id;
      } else {
        const { data, error } = await supabase.from('ministry_video_messages').insert({ ...metaPayload, status: 'draft' }).select('id').single();
        if (error) throw error;
        videoId = data.id;
      }

      if (fileToUpload) {
        setUploadProgress(0);
        const contentType = fileToUpload.type || 'video/mp4';
        const { data: presign, error: presignErr } = await supabase.functions.invoke('video-message-upload-url', {
          body: { ministryId, videoId, contentType },
        });
        if (presignErr) throw presignErr;
        if (presign?.error) throw new Error(presign.error);
        await uploadFileWithProgress(presign.uploadUrl, fileToUpload, contentType);
        setUploadProgress(null);
        toast({ title: t('ministryVideoMessagesManager', 'uploaded', 'Uploaded'), description: t('ministryVideoMessagesManager', 'processingDesc', 'Your video is processing — this can take a few minutes.') });
      } else {
        toast({ title: t('ministryVideoMessagesManager', 'saved', 'Saved') });
      }

      setShowModal(false);
      loadVideos();
    } catch (err: any) {
      toast({ title: t('ministryVideoMessagesManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('ministryVideoMessagesManager', 'confirmDelete', 'Delete this video message? This cannot be undone.'))) return;
    try {
      const { error } = await supabase.from('ministry_video_messages').delete().eq('id', id);
      if (error) throw error;
      toast({ title: t('ministryVideoMessagesManager', 'deleted', 'Deleted') });
      loadVideos();
    } catch (err: any) {
      toast({ title: t('ministryVideoMessagesManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  // ── Publish / schedule / draft ───────────────────────────────────────────

  const notifyMembersOfPublish = async (video: VideoMessage) => {
    const speaker = video.speaker_name ? `Pastor ${video.speaker_name}` : 'your ministry';
    await notify({
      type: 'pastor_video_message',
      title: `📹 New Video Message from ${speaker}`,
      body: `A new message titled "${video.title}" has been shared. Tap to watch now.`,
      ministryId,
      targetAudience: 'ministry_members',
      link: `/ministry-videos/${video.id}`,
    });
    // Email is called directly, not through notify() — notify()'s email path
    // targets a nonexistent function; send-email-broadcast is the real one.
    await supabase.functions.invoke('send-email-broadcast', {
      body: {
        ministryId,
        subject: `New video message: ${video.title}`,
        message: `${ministryName || 'Your ministry'} just posted a new video message${video.speaker_name ? ` from ${video.speaker_name}` : ''}: "${video.title}". Watch it now: ${window.location.origin}/ministry-videos/${video.id}`,
        messageCategory: 'transactional',
      },
    }).catch((err) => console.error('Email notification failed (non-fatal):', err));
  };

  const handlePublishNow = async (video: VideoMessage) => {
    try {
      const { error } = await supabase.from('ministry_video_messages').update({
        status: 'published',
        published_at: new Date().toISOString(),
        scheduled_publish_at: null,
        updated_at: new Date().toISOString(),
      }).eq('id', video.id);
      if (error) throw error;
      await notifyMembersOfPublish(video);
      toast({ title: t('ministryVideoMessagesManager', 'published', 'Published'), description: t('ministryVideoMessagesManager', 'membersNotified', 'Members have been notified.') });
      loadVideos();
    } catch (err: any) {
      toast({ title: t('ministryVideoMessagesManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleSchedule = async (video: VideoMessage) => {
    if (!scheduleAt) {
      toast({ title: t('ministryVideoMessagesManager', 'error', 'Error'), description: t('ministryVideoMessagesManager', 'pickDateTime', 'Pick a date and time first'), variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase.from('ministry_video_messages').update({
        status: 'scheduled',
        scheduled_publish_at: new Date(scheduleAt).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', video.id);
      if (error) throw error;
      toast({ title: t('ministryVideoMessagesManager', 'scheduled', 'Scheduled') });
      loadVideos();
    } catch (err: any) {
      toast({ title: t('ministryVideoMessagesManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleUnpublish = async (video: VideoMessage) => {
    try {
      const { error } = await supabase.from('ministry_video_messages').update({ status: 'ready', updated_at: new Date().toISOString() }).eq('id', video.id);
      if (error) throw error;
      loadVideos();
    } catch (err: any) {
      toast({ title: t('ministryVideoMessagesManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleTogglePin = async (video: VideoMessage) => {
    try {
      const { error } = await supabase.from('ministry_video_messages')
        .update({ is_pinned: !video.is_pinned, updated_at: new Date().toISOString() })
        .eq('id', video.id);
      if (error) throw error;
      loadVideos();
    } catch (err: any) {
      toast({ title: t('ministryVideoMessagesManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleReorder = async (video: VideoMessage, direction: 'up' | 'down') => {
    const pinned = videos.filter((v) => v.is_pinned).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    const idx = pinned.findIndex((v) => v.id === video.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= pinned.length) return;
    const a = pinned[idx];
    const b = pinned[swapIdx];
    const aOrder = a.display_order ?? idx;
    const bOrder = b.display_order ?? swapIdx;
    try {
      await Promise.all([
        supabase.from('ministry_video_messages').update({ display_order: bOrder }).eq('id', a.id),
        supabase.from('ministry_video_messages').update({ display_order: aOrder }).eq('id', b.id),
      ]);
      loadVideos();
    } catch (err: any) {
      toast({ title: t('ministryVideoMessagesManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleArchiveToggle = async (video: VideoMessage) => {
    try {
      const nextStatus: VideoStatus = video.status === 'archived' ? 'published' : 'archived';
      const { error } = await supabase.from('ministry_video_messages').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', video.id);
      if (error) throw error;
      loadVideos();
    } catch (err: any) {
      toast({ title: t('ministryVideoMessagesManager', 'error', 'Error'), description: err.message, variant: 'destructive' });
    }
  };

  // ── Analytics ─────────────────────────────────────────────────────────────

  const openAnalytics = async (video: VideoMessage) => {
    setAnalyticsVideo(video);
    setShowAnalyticsModal(true);
    setLoadingAnalytics(true);
    try {
      const [{ data: views }, { data: reactions }] = await Promise.all([
        supabase.from('ministry_video_message_views').select('user_id, session_id, watch_duration_seconds, completion_percentage, started_at').eq('video_id', video.id),
        supabase.from('ministry_video_message_reactions').select('emoji').eq('video_id', video.id),
      ]);
      const rows = views || [];
      const totalViews = rows.length;
      const uniqueViewers = new Set(rows.map((r: any) => r.user_id || r.session_id)).size;
      const totalWatch = rows.reduce((sum: number, r: any) => sum + (r.watch_duration_seconds || 0), 0);
      const totalCompletion = rows.reduce((sum: number, r: any) => sum + (Number(r.completion_percentage) || 0), 0);
      const lastViewedAt = rows.length ? rows.map((r: any) => r.started_at).sort().slice(-1)[0] : null;
      const reactionCounts: Record<string, number> = {};
      (reactions || []).forEach((r: any) => { reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1; });

      setAnalytics({
        totalViews,
        uniqueViewers,
        averageWatchSeconds: totalViews ? totalWatch / totalViews : 0,
        averageCompletion: totalViews ? totalCompletion / totalViews : 0,
        reactionCounts,
        lastViewedAt,
      });
    } catch (err) {
      console.error('Error loading video analytics:', err);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  // ── Filters ───────────────────────────────────────────────────────────────

  const categories = Array.from(new Set(videos.map((v) => v.category).filter(Boolean))) as string[];
  const speakers = Array.from(new Set(videos.map((v) => v.speaker_name).filter(Boolean))) as string[];

  const filteredVideos = videos.filter((v) => {
    const matchesSearch = v.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.speaker_name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || v.category === categoryFilter;
    const matchesSpeaker = speakerFilter === 'all' || v.speaker_name === speakerFilter;
    return matchesSearch && matchesCategory && matchesSpeaker;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder={t('ministryVideoMessagesManager', 'searchPlaceholder', 'Search by title or speaker...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-72"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('ministryVideoMessagesManager', 'allCategories', 'All categories')}</SelectItem>
              {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={speakerFilter} onValueChange={setSpeakerFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('ministryVideoMessagesManager', 'allSpeakers', 'All speakers')}</SelectItem>
              {speakers.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" /> {t('ministryVideoMessagesManager', 'newMessage', 'New Video Message')}
        </Button>
      </div>

      {/* List */}
      {filteredVideos.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Video className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700">{t('ministryVideoMessagesManager', 'noMessages', 'No Video Messages Yet')}</h3>
            <p className="text-gray-500 mb-4">{t('ministryVideoMessagesManager', 'noMessagesSubtitle', 'Record or upload your first message to the congregation')}</p>
            <Button onClick={handleCreate}><Plus className="h-4 w-4 mr-2" /> {t('ministryVideoMessagesManager', 'newMessage', 'New Video Message')}</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredVideos.map((video) => {
            const badge = statusBadge(video.status);
            const pinnedList = videos.filter((v) => v.is_pinned).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
            const pinnedIdx = pinnedList.findIndex((v) => v.id === video.id);
            return (
              <Card key={video.id}>
                <CardContent className="p-4 flex gap-4">
                  <div className="w-32 h-20 rounded bg-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {video.thumbnail_url ? (
                      <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" />
                    ) : (
                      <Video className="h-6 w-6 text-gray-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold truncate">{video.title}</h3>
                      <Badge className={badge.className}>{badge.label}</Badge>
                      {video.is_pinned && <Badge variant="outline" className="text-amber-600 border-amber-200"><Star className="h-3 w-3 mr-1 fill-amber-500 text-amber-500" />{t('ministryVideoMessagesManager', 'pinned', 'Pinned')}</Badge>}
                    </div>
                    <p className="text-sm text-gray-500 line-clamp-1">{video.description}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
                      {video.speaker_name && <span>{video.speaker_name}</span>}
                      {video.category && <span>· {video.category}</span>}
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(video.duration_seconds)}</span>
                      {video.status === 'error' && video.processing_error && (
                        <span className="text-red-500 truncate">· {video.processing_error}</span>
                      )}
                    </div>

                    {video.status === 'scheduled' && (
                      <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" /> {t('ministryVideoMessagesManager', 'scheduledFor', 'Scheduled for {when}').replace('{when}', new Date(video.scheduled_publish_at!).toLocaleString())}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <div className="flex gap-1">
                      {video.is_pinned && (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={pinnedIdx <= 0} onClick={() => handleReorder(video, 'up')}><ChevronUp className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={pinnedIdx >= pinnedList.length - 1} onClick={() => handleReorder(video, 'down')}><ChevronDown className="h-4 w-4" /></Button>
                        </>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleTogglePin(video)} title={t('ministryVideoMessagesManager', 'togglePin', 'Pin/unpin')}>
                        <Star className={`h-4 w-4 ${video.is_pinned ? 'fill-amber-500 text-amber-500' : 'text-gray-400'}`} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openAnalytics(video)} title={t('ministryVideoMessagesManager', 'analytics', 'Analytics')}>
                        <BarChart3 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(video)}><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleArchiveToggle(video)} title={video.status === 'archived' ? t('ministryVideoMessagesManager', 'unarchive', 'Unarchive') : t('ministryVideoMessagesManager', 'archive', 'Archive')}>
                        {video.status === 'archived' ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(video.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>

                    {(video.status === 'ready' || video.status === 'draft') && video.playback_url && (
                      <div className="flex items-center gap-2 mt-1">
                        <Input type="datetime-local" className="h-8 text-xs w-44" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
                        <Button size="sm" variant="outline" onClick={() => handleSchedule(video)}><CalendarClock className="h-3.5 w-3.5 mr-1" />{t('ministryVideoMessagesManager', 'schedule', 'Schedule')}</Button>
                        <Button size="sm" onClick={() => handlePublishNow(video)}><Send className="h-3.5 w-3.5 mr-1" />{t('ministryVideoMessagesManager', 'publishNow', 'Publish Now')}</Button>
                      </div>
                    )}
                    {video.status === 'published' && (
                      <Button size="sm" variant="outline" className="mt-1" onClick={() => handleUnpublish(video)}>{t('ministryVideoMessagesManager', 'unpublish', 'Unpublish')}</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVideo ? t('ministryVideoMessagesManager', 'editMessage', 'Edit Video Message') : t('ministryVideoMessagesManager', 'newMessage', 'New Video Message')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editingVideo?.playback_url && (
              <div>
                <div className="flex gap-2 mb-3">
                  <Button type="button" size="sm" variant={mode === 'upload' ? 'default' : 'outline'} onClick={() => setMode('upload')}>
                    <Upload className="h-4 w-4 mr-1" /> {t('ministryVideoMessagesManager', 'uploadTab', 'Upload')}
                  </Button>
                  <Button type="button" size="sm" variant={mode === 'record' ? 'default' : 'outline'} onClick={() => setMode('record')}>
                    <Circle className="h-4 w-4 mr-1" /> {t('ministryVideoMessagesManager', 'recordTab', 'Record')}
                  </Button>
                </div>

                {mode === 'upload' && (
                  <div>
                    <Input
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    />
                    {selectedFile && <p className="text-xs text-gray-500 mt-1">{selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)</p>}
                  </div>
                )}

                {mode === 'record' && (
                  <div className="space-y-2">
                    <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                      {previewUrl ? (
                        <video src={previewUrl} controls className="w-full h-full" />
                      ) : (
                        <video ref={previewVideoRef} muted playsInline className="w-full h-full object-contain" />
                      )}
                    </div>
                    <div className="flex gap-2">
                      {!isRecording && !recordedBlob && (
                        <Button type="button" size="sm" onClick={startRecording}><Circle className="h-4 w-4 mr-1 fill-red-500 text-red-500" />{t('ministryVideoMessagesManager', 'startRecording', 'Start Recording')}</Button>
                      )}
                      {isRecording && (
                        <Button type="button" size="sm" variant="destructive" onClick={stopRecording}><Square className="h-4 w-4 mr-1" />{t('ministryVideoMessagesManager', 'stopRecording', 'Stop')}</Button>
                      )}
                      {recordedBlob && !isRecording && (
                        <Button type="button" size="sm" variant="outline" onClick={reRecord}>{t('ministryVideoMessagesManager', 'reRecord', 'Re-record')}</Button>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400">{t('ministryVideoMessagesManager', 'recordHint', 'Recording works best in Chrome/Edge on desktop and Android. On iPhone/iPad, use Upload with a video recorded in your camera app.')}</p>
                  </div>
                )}

                {uploadProgress !== null && (
                  <div className="mt-2">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-600 transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{t('ministryVideoMessagesManager', 'uploading', 'Uploading… {pct}%').replace('{pct}', String(uploadProgress))}</p>
                  </div>
                )}
              </div>
            )}

            {editingVideo?.playback_url && (
              <p className="text-xs text-gray-500 bg-gray-50 rounded p-2 flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" /> {t('ministryVideoMessagesManager', 'videoAlreadyUploaded', 'Video already uploaded — delete and recreate this message to replace the file.')}
              </p>
            )}

            <div>
              <Label>{t('ministryVideoMessagesManager', 'labelTitle', 'Title *')}</Label>
              <Input value={formData.title} onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))} placeholder={t('ministryVideoMessagesManager', 'titlePlaceholder', 'e.g. Walking in Faith')} />
            </div>
            <div>
              <Label>{t('ministryVideoMessagesManager', 'labelDescription', 'Description')}</Label>
              <Textarea rows={3} value={formData.description} onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))} placeholder={t('ministryVideoMessagesManager', 'descriptionPlaceholder', 'A short message about this video...')} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>{t('ministryVideoMessagesManager', 'labelSpeaker', 'Speaker / Pastor name')}</Label>
                <Input value={formData.speaker_name} onChange={(e) => setFormData((f) => ({ ...f, speaker_name: e.target.value }))} placeholder={t('ministryVideoMessagesManager', 'speakerPlaceholder', 'e.g. John Doe')} />
              </div>
              <div>
                <Label>{t('ministryVideoMessagesManager', 'labelCategory', 'Category')}</Label>
                <Input value={formData.category} onChange={(e) => setFormData((f) => ({ ...f, category: e.target.value }))} placeholder={t('ministryVideoMessagesManager', 'categoryPlaceholder', 'e.g. Sunday Sermon')} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)} disabled={saving}>{t('ministryVideoMessagesManager', 'cancel', 'Cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editingVideo ? t('ministryVideoMessagesManager', 'saveChanges', 'Save Changes') : t('ministryVideoMessagesManager', 'saveAsDraft', 'Save as Draft')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Analytics modal */}
      <Dialog open={showAnalyticsModal} onOpenChange={setShowAnalyticsModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('ministryVideoMessagesManager', 'analyticsFor', 'Analytics: {title}').replace('{title}', String(analyticsVideo?.title ?? ''))}</DialogTitle>
          </DialogHeader>
          {loadingAnalytics ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-purple-600" /></div>
          ) : analytics ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500 flex items-center gap-1"><Eye className="h-3 w-3" /> {t('ministryVideoMessagesManager', 'totalViews', 'Total views')}</p>
                  <p className="text-xl font-bold">{analytics.totalViews}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500 flex items-center gap-1"><Users className="h-3 w-3" /> {t('ministryVideoMessagesManager', 'uniqueViewers', 'Unique viewers')}</p>
                  <p className="text-xl font-bold">{analytics.uniqueViewers}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500 flex items-center gap-1"><Clock className="h-3 w-3" /> {t('ministryVideoMessagesManager', 'avgWatchTime', 'Avg. watch time')}</p>
                  <p className="text-xl font-bold">{formatDuration(Math.round(analytics.averageWatchSeconds))}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">{t('ministryVideoMessagesManager', 'completionRate', 'Completion rate')}</p>
                  <p className="text-xl font-bold">{analytics.averageCompletion.toFixed(0)}%</p>
                </div>
              </div>
              {Object.keys(analytics.reactionCounts).length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">{t('ministryVideoMessagesManager', 'reactions', 'Reactions')}</p>
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(analytics.reactionCounts).map(([emoji, count]) => (
                      <Badge key={emoji} variant="outline">{emoji} {count}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-gray-400">
                {analytics.lastViewedAt
                  ? t('ministryVideoMessagesManager', 'lastViewed', 'Last viewed {when}').replace('{when}', new Date(analytics.lastViewedAt).toLocaleString())
                  : t('ministryVideoMessagesManager', 'noViewsYet', 'No views yet')}
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setShowAnalyticsModal(false)}>{t('ministryVideoMessagesManager', 'close', 'Close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MinistryVideoMessagesManager;
