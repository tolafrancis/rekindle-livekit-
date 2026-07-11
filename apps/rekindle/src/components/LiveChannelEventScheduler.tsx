import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUserEntitlements } from '@/hooks/useUserEntitlements';
import { supabase } from '@/lib/supabase';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Alert, AlertDescription } from './ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from './ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './ui/select';
import {
  Calendar as CalendarIcon,
  Clock,
  Video,
  Mic,
  Users,
  Plus,
  Loader2,
  Upload,
  X,
  AlertCircle,
  Lock,
  Crown
} from 'lucide-react';
import { toast } from './ui/use-toast';
import { LiveChannel, ChannelEvent } from '@/types/liveChannelTypes';

interface LiveChannelEventSchedulerProps {
  channel: LiveChannel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEventCreated?: (event: ChannelEvent) => void;
  editEvent?: ChannelEvent | null;
}

export const LiveChannelEventScheduler: React.FC<LiveChannelEventSchedulerProps> = ({
  channel,
  open,
  onOpenChange,
  onEventCreated,
  editEvent
}) => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const entitlements = useUserEntitlements();

  // Form state
  const [formData, setFormData] = useState({
    title: editEvent?.title || '',
    description: editEvent?.description || '',
    scheduled_date: editEvent?.scheduled_start ? new Date(editEvent.scheduled_start).toISOString().split('T')[0] : '',
    scheduled_time: editEvent?.scheduled_start ? new Date(editEvent.scheduled_start).toTimeString().slice(0, 5) : '',
    duration_minutes: editEvent?.duration_minutes || 60,
    is_video_enabled: editEvent?.is_video_enabled ?? true,
    max_participants: editEvent?.max_participants || null,
    requires_registration: true,
    cover_image_url: editEvent?.cover_image_url || '',
    is_recurring: false,
    recurrence_rule: ''
  });

  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Recurring events are a channel-owner (ministry/admin) capability — the same
  // entitlement that lets a user create the channel this event belongs to.
  const canScheduleRecurring = entitlements.canCreateLiveChannel;

  // Reset form when dialog opens/closes
  React.useEffect(() => {
    if (open && editEvent) {
      setFormData({
        title: editEvent.title,
        description: editEvent.description || '',
        scheduled_date: new Date(editEvent.scheduled_start).toISOString().split('T')[0],
        scheduled_time: new Date(editEvent.scheduled_start).toTimeString().slice(0, 5),
        duration_minutes: editEvent.duration_minutes || 60,
        is_video_enabled: editEvent.is_video_enabled,
        max_participants: editEvent.max_participants,
        requires_registration: true,
        cover_image_url: editEvent.cover_image_url || '',
        is_recurring: editEvent.is_recurring || false,
        recurrence_rule: editEvent.recurrence_rule || ''
      });
    } else if (open && !editEvent) {
      setFormData({
        title: '',
        description: '',
        scheduled_date: '',
        scheduled_time: '',
        duration_minutes: 60,
        is_video_enabled: true,
        max_participants: null,
        requires_registration: true,
        cover_image_url: '',
        is_recurring: false,
        recurrence_rule: ''
      });
    }
    setErrors({});
  }, [open, editEvent]);

  // Handle cover image upload
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: t('liveChannelEventScheduler', 'invalidFile', 'Invalid File'),
        description: t('liveChannelEventScheduler', 'pleaseUploadImage', 'Please upload an image file'),
        variant: 'destructive'
      });
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user?.id}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('event-covers')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('event-covers')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, cover_image_url: publicUrl }));
      toast({
        title: t('liveChannelEventScheduler', 'imageUploaded', 'Image Uploaded'),
        description: t('liveChannelEventScheduler', 'coverImageUploadedSuccess', 'Cover image uploaded successfully')
      });
    } catch (err) {
      console.error('Failed to upload cover image:', err);
      toast({
        title: t('liveChannelEventScheduler', 'uploadFailed', 'Upload Failed'),
        description: t('liveChannelEventScheduler', 'failedUploadCoverImage', 'Failed to upload cover image'),
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = t('liveChannelEventScheduler', 'titleRequired', 'Title is required');
    }

    if (!formData.scheduled_date) {
      newErrors.scheduled_date = t('liveChannelEventScheduler', 'dateRequired', 'Date is required');
    }

    if (!formData.scheduled_time) {
      newErrors.scheduled_time = t('liveChannelEventScheduler', 'timeRequired', 'Time is required');
    }

    // Check if date/time is in the past
    if (formData.scheduled_date && formData.scheduled_time) {
      const scheduledDateTime = new Date(`${formData.scheduled_date}T${formData.scheduled_time}`);
      if (scheduledDateTime < new Date()) {
        newErrors.scheduled_date = t('liveChannelEventScheduler', 'cannotScheduleInPast', 'Cannot schedule event in the past');
      }
    }

    if (formData.duration_minutes < 15) {
      newErrors.duration_minutes = t('liveChannelEventScheduler', 'durationMin', 'Duration must be at least 15 minutes');
    }

    if (formData.max_participants !== null && formData.max_participants < 1) {
      newErrors.max_participants = t('liveChannelEventScheduler', 'minOneParticipant', 'Must allow at least 1 participant');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Create or update event
  const handleSubmit = async () => {
    if (!validateForm()) return;

    setCreating(true);
    try {
      const scheduledDateTime = new Date(`${formData.scheduled_date}T${formData.scheduled_time}`);
      const scheduledEnd = new Date(scheduledDateTime.getTime() + formData.duration_minutes * 60000);

      const eventData = {
        channel_id: channel.id,
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        scheduled_start: scheduledDateTime.toISOString(),
        scheduled_end: scheduledEnd.toISOString(),
        duration_minutes: formData.duration_minutes,
        is_video_enabled: formData.is_video_enabled,
        max_participants: formData.max_participants,
        requires_registration: formData.requires_registration,
        cover_image_url: formData.cover_image_url || null,
        is_recurring: formData.is_recurring,
        recurrence_rule: formData.is_recurring ? formData.recurrence_rule : null,
        status: 'upcoming' as const,
        created_by: user?.id
      };

      if (editEvent) {
        // Update existing event
        const { data, error } = await supabase
          .from('channel_events')
          .update(eventData)
          .eq('id', editEvent.id)
          .select('*, channel:live_channels(*)')
          .single();

        if (error) throw error;

        toast({
          title: t('liveChannelEventScheduler', 'eventUpdated', 'Event Updated'),
          description: t('liveChannelEventScheduler', 'eventUpdatedDesc', '{title} has been updated').replace('{title}', String(data.title))
        });

        onEventCreated?.(data);
      } else {
        // Create new event
        const { data, error } = await supabase
          .from('channel_events')
          .insert(eventData)
          .select('*, channel:live_channels(*)')
          .single();

        if (error) throw error;

        toast({
          title: t('liveChannelEventScheduler', 'eventCreated', 'Event Created'),
          description: t('liveChannelEventScheduler', 'eventCreatedDesc', '{title} is scheduled for {date}')
            .replace('{title}', String(data.title))
            .replace('{date}', new Date(data.scheduled_start).toLocaleDateString())
        });

        onEventCreated?.(data);
      }

      onOpenChange(false);
    } catch (err: any) {
      console.error('[EventScheduler] Failed to save event:', err);
      toast({
        title: t('liveChannelEventScheduler', 'error', 'Error'),
        description: err.message || t('liveChannelEventScheduler', 'failedSaveEvent', 'Failed to save event'),
        variant: 'destructive'
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-purple-600" />
            {editEvent
              ? t('liveChannelEventScheduler', 'editEvent', 'Edit Event')
              : t('liveChannelEventScheduler', 'scheduleNewEvent', 'Schedule New Event')}
          </DialogTitle>
          <DialogDescription>
            {t('liveChannelEventScheduler', 'scheduleBroadcastFor', 'Schedule a broadcast event for {name}').replace('{name}', String(channel.name))}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Cover Image */}
          <div className="space-y-2">
            <Label>{t('liveChannelEventScheduler', 'coverImageOptional', 'Cover Image (Optional)')}</Label>
            <div className="space-y-2">
              {formData.cover_image_url ? (
                <div className="relative w-full h-40 rounded-lg overflow-hidden border-2 border-gray-200">
                  <img 
                    src={formData.cover_image_url} 
                    alt={t('liveChannelEventScheduler', 'eventCoverAlt', 'Event cover')}
                    className="w-full h-full object-cover" 
                  />
                  <button
                    onClick={() => setFormData(prev => ({ ...prev, cover_image_url: '' }))}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="w-full h-40 rounded-lg bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300">
                  <Upload className="h-12 w-12 text-gray-400" />
                </div>
              )}
              <Input
                type="file"
                accept="image/*"
                onChange={handleCoverUpload}
                disabled={uploading}
              />
              <p className="text-xs text-gray-500">{t('liveChannelEventScheduler', 'coverRecommended', 'Recommended: 16:9 ratio, at least 1200x675px')}</p>
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">{t('liveChannelEventScheduler', 'eventTitleLabel', 'Event Title *')}</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder={t('liveChannelEventScheduler', 'titlePlaceholder', 'Sunday Morning Worship')}
              maxLength={200}
              className={errors.title ? 'border-red-500' : ''}
            />
            {errors.title && (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.title}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">{t('liveChannelEventScheduler', 'descriptionLabel', 'Description')}</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder={t('liveChannelEventScheduler', 'descriptionPlaceholder', 'Join us for an inspiring worship session...')}
              rows={3}
              maxLength={1000}
            />
            <p className="text-xs text-gray-500">
              {t('liveChannelEventScheduler', 'charCounter', '{count}/1000 characters').replace('{count}', String(formData.description.length))}
            </p>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">{t('liveChannelEventScheduler', 'dateLabel', 'Date *')}</Label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="date"
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduled_date: e.target.value }))}
                  className={`pl-10 ${errors.scheduled_date ? 'border-red-500' : ''}`}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              {errors.scheduled_date && (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.scheduled_date}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="time">{t('liveChannelEventScheduler', 'timeLabel', 'Time *')}</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="time"
                  type="time"
                  value={formData.scheduled_time}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduled_time: e.target.value }))}
                  className={`pl-10 ${errors.scheduled_time ? 'border-red-500' : ''}`}
                />
              </div>
              {errors.scheduled_time && (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.scheduled_time}
                </p>
              )}
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label htmlFor="duration">{t('liveChannelEventScheduler', 'durationLabel', 'Duration (minutes) *')}</Label>
            <Select 
              value={formData.duration_minutes.toString()}
              onValueChange={(value) => setFormData(prev => ({ ...prev, duration_minutes: parseInt(value) }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">{t('liveChannelEventScheduler', 'duration15', '15 minutes')}</SelectItem>
                <SelectItem value="30">{t('liveChannelEventScheduler', 'duration30', '30 minutes')}</SelectItem>
                <SelectItem value="45">{t('liveChannelEventScheduler', 'duration45', '45 minutes')}</SelectItem>
                <SelectItem value="60">{t('liveChannelEventScheduler', 'duration60', '1 hour')}</SelectItem>
                <SelectItem value="90">{t('liveChannelEventScheduler', 'duration90', '1.5 hours')}</SelectItem>
                <SelectItem value="120">{t('liveChannelEventScheduler', 'duration120', '2 hours')}</SelectItem>
                <SelectItem value="180">{t('liveChannelEventScheduler', 'duration180', '3 hours')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Event Type */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {formData.is_video_enabled ? (
                  <Video className="h-5 w-5 text-purple-600" />
                ) : (
                  <Mic className="h-5 w-5 text-purple-600" />
                )}
                <div>
                  <Label>{t('liveChannelEventScheduler', 'videoEvent', 'Video Event')}</Label>
                  <p className="text-xs text-gray-500">{t('liveChannelEventScheduler', 'enableCameraForVideo', 'Enable camera for video broadcast')}</p>
                </div>
              </div>
              <Switch
                checked={formData.is_video_enabled}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_video_enabled: checked }))}
              />
            </div>
          </div>

          {/* Max Participants */}
          <div className="space-y-2">
            <Label htmlFor="max_participants">{t('liveChannelEventScheduler', 'maxParticipantsLabel', 'Maximum Participants (Optional)')}</Label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="max_participants"
                type="number"
                value={formData.max_participants || ''}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  max_participants: e.target.value ? parseInt(e.target.value) : null 
                }))}
                placeholder={t('liveChannelEventScheduler', 'unlimited', 'Unlimited')}
                className={`pl-10 ${errors.max_participants ? 'border-red-500' : ''}`}
                min={1}
              />
            </div>
            <p className="text-xs text-gray-500">{t('liveChannelEventScheduler', 'leaveEmptyUnlimited', 'Leave empty for unlimited participants')}</p>
            {errors.max_participants && (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.max_participants}
              </p>
            )}
          </div>

          {/* Recurring Event (Premium Plus+ Feature) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="flex items-center gap-2">
                  {t('liveChannelEventScheduler', 'recurringEvent', 'Recurring Event')}
                  {!canScheduleRecurring && (
                    <Badge variant="outline" className="text-xs">
                      <Lock className="h-3 w-3 mr-1" />
                      {t('liveChannelEventScheduler', 'premiumPlus', 'Premium Plus')}
                    </Badge>
                  )}
                </Label>
                <p className="text-xs text-gray-500">{t('liveChannelEventScheduler', 'repeatOnSchedule', 'Repeat this event on a schedule')}</p>
              </div>
              <Switch
                checked={formData.is_recurring}
                disabled={!canScheduleRecurring}
                onCheckedChange={(checked) => {
                  if (!canScheduleRecurring) {
                    toast({
                      title: t('liveChannelEventScheduler', 'premiumPlusRequired', 'Premium Plus Required'),
                      description: t('liveChannelEventScheduler', 'recurringRequiresPremium', 'Recurring sessions require Premium Plus subscription'),
                      variant: 'destructive'
                    });
                    return;
                  }
                  setFormData(prev => ({ ...prev, is_recurring: checked }));
                }}
              />
            </div>
            {!canScheduleRecurring && (
              <Alert className="bg-amber-50 border-amber-200">
                <Crown className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-700 text-xs">
                  {t('liveChannelEventScheduler', 'upgradeForRecurring', 'Upgrade to Premium Plus to schedule recurring events')}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('liveChannelEventScheduler', 'cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={creating || uploading}
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {editEvent
                  ? t('liveChannelEventScheduler', 'updating', 'Updating...')
                  : t('liveChannelEventScheduler', 'creating', 'Creating...')}
              </>
            ) : (
              <>
                {editEvent ? t('liveChannelEventScheduler', 'updateEvent', 'Update Event') : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('liveChannelEventScheduler', 'createEvent', 'Create Event')}
                  </>
                )}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LiveChannelEventScheduler;