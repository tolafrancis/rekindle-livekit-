import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/lib/supabase';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from './ui/dialog';
import {
  Calendar,
  Clock,
  Users,
  Video,
  Mic,
  MapPin,
  Bell,
  BellOff,
  Radio,
  Share2,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  User
} from 'lucide-react';
import { toast } from './ui/use-toast';
import { shareEvent } from '@/lib/liveShare';
import { ChannelEvent, EventRegistration } from '@/types/liveChannelTypes';

interface LiveChannelEventDetailsProps {
  event: ChannelEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onWatchLive?: () => void;
}

export const LiveChannelEventDetails: React.FC<LiveChannelEventDetailsProps> = ({
  event,
  open,
  onOpenChange,
  onWatchLive
}) => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [isRegistered, setIsRegistered] = useState(false);
  const [registration, setRegistration] = useState<EventRegistration | null>(null);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [copied, setCopied] = useState(false);

  // Check if user is registered
  useEffect(() => {
    if (!event || !user) {
      setIsRegistered(false);
      setRegistration(null);
      return;
    }

    const checkRegistration = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('event_registrations')
          .select('*')
          .eq('event_id', event.id)
          .eq('user_id', user.id)
          .single();

        if (!error && data) {
          setIsRegistered(true);
          setRegistration(data);
        } else {
          setIsRegistered(false);
          setRegistration(null);
        }
      } catch (err) {
        console.error('[EventDetails] Failed to check registration:', err);
      } finally {
        setLoading(false);
      }
    };

    checkRegistration();
  }, [event, user]);

  if (!event) return null;

  // Format date and time
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const getTimeUntilEvent = () => {
    const now = new Date();
    const eventDate = new Date(event.scheduled_start);
    const diffMs = eventDate.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffDays > 1) return `${diffDays} days`;
    if (diffHours > 1) return `${diffHours} hours`;
    if (diffMins > 0) return `${diffMins} minutes`;
    return t('liveChannelEventDetails', 'startingNow', 'Starting now');
  };

  // Handle registration
  const handleRegister = async () => {
    if (!user) {
      toast({
        title: t('liveChannelEventDetails', 'signInRequired', 'Sign In Required'),
        description: t('liveChannelEventDetails', 'signInToRegister', 'Please sign in to register for events'),
        variant: 'destructive'
      });
      return;
    }

    setRegistering(true);
    try {
      // Use the SQL function for registration with validation
      const { data, error } = await supabase.rpc('register_for_event', {
        p_event_id: event.id,
        p_user_id: user.id,
        p_user_name: profile?.full_name || user.email?.split('@')[0] || 'User',
        p_user_email: user.email || ''
      });

      if (error) throw error;

      setIsRegistered(true);
      
      toast({
        title: t('liveChannelEventDetails', 'registrationSuccessful', 'Registration Successful!'),
        description: t('liveChannelEventDetails', 'youllReceiveReminders', "You'll receive reminders before the event starts")
      });

      // Refresh registration data
      const { data: regData } = await supabase
        .from('event_registrations')
        .select('*')
        .eq('event_id', event.id)
        .eq('user_id', user.id)
        .single();

      if (regData) setRegistration(regData);
    } catch (err: any) {
      console.error('[EventDetails] Registration failed:', err);
      
      let errorMessage = t('liveChannelEventDetails', 'failedToRegister', 'Failed to register for event');
      if (err.message) {
        if (err.message.includes('maximum capacity')) {
          errorMessage = t('liveChannelEventDetails', 'eventAtMaxCapacity', 'This event is at maximum capacity');
        } else if (err.message.includes('closed')) {
          errorMessage = t('liveChannelEventDetails', 'registrationClosed', 'Registration has closed for this event');
        } else {
          errorMessage = err.message;
        }
      }

      toast({
        title: t('liveChannelEventDetails', 'registrationFailed', 'Registration Failed'),
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setRegistering(false);
    }
  };

  // Handle unregister
  const handleUnregister = async () => {
    if (!user) return;

    setRegistering(true);
    try {
      const { error } = await supabase
        .from('event_registrations')
        .delete()
        .eq('event_id', event.id)
        .eq('user_id', user.id);

      if (error) throw error;

      setIsRegistered(false);
      setRegistration(null);

      toast({
        title: t('liveChannelEventDetails', 'unregistered', 'Unregistered'),
        description: t('liveChannelEventDetails', 'removedFromEvent', 'You have been removed from this event')
      });
    } catch (err: any) {
      console.error('[EventDetails] Unregister failed:', err);
      toast({
        title: t('liveChannelEventDetails', 'failedToUnregister', 'Failed to Unregister'),
        description: err.message || t('liveChannelEventDetails', 'couldNotUnregister', 'Could not unregister from event'),
        variant: 'destructive'
      });
    } finally {
      setRegistering(false);
    }
  };

  // Handle share
  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/events/${event.id}`;
    const r = await shareEvent({
      title: event.title,
      channelName: (event as any).channel?.name,
      description: event.description,
      scheduledTime: (event as any).scheduled_start,
      url: shareUrl,
    });
    if (r.method === 'clipboard') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: t('liveChannelEventDetails', 'copiedToShare', 'Copied to share!'), description: t('liveChannelEventDetails', 'eventInviteOnClipboard', 'The event invite is on your clipboard.') });
    }
  };

  const isLive = event.status === 'live';
  const isUpcoming = event.status === 'upcoming';
  const isPast = event.status === 'ended';
  const isCancelled = event.status === 'cancelled';
  const isFull = event.max_participants !== null && event.total_registered >= event.max_participants;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Cover Image */}
        {event.cover_image_url && (
          <div 
            className="relative h-48 -mx-6 -mt-6 mb-4 bg-gradient-to-br from-purple-600 to-indigo-700"
            style={{
              backgroundImage: `url(${event.cover_image_url})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          >
            <div className="absolute inset-0 bg-black/30" />
            
            {/* Status Badge */}
            <Badge className={`absolute top-4 left-4 ${
              isLive ? 'bg-red-500 text-white animate-pulse' :
              isUpcoming ? 'bg-purple-500 text-white' :
              isPast ? 'bg-gray-500 text-white' :
              'bg-gray-500 text-white'
            }`}>
              {isLive && <Radio className="h-3 w-3 mr-1" />}
              {event.status.toUpperCase()}
            </Badge>

            {/* Share Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleShare}
              className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70"
            >
              {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            </Button>
          </div>
        )}

        <DialogHeader>
          <DialogTitle className="text-2xl pr-10">{event.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Channel Info */}
          {event.channel && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              {event.channel.channel_logo_url ? (
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-purple-500">
                  <img 
                    src={event.channel.channel_logo_url} 
                    alt={event.channel.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center text-white font-bold">
                  {event.channel.name.charAt(0)}
                </div>
              )}
              <div className="flex-1">
                <p className="font-semibold">{event.channel.name}</p>
                <p className="text-sm text-gray-500">
                  {t('liveChannelEventDetails', 'followersCount', '{count} followers').replace('{count}', String(event.channel.total_followers))}
                </p>
              </div>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div>
              <h4 className="font-semibold mb-2">{t('liveChannelEventDetails', 'aboutThisEvent', 'About This Event')}</h4>
              <p className="text-gray-600 whitespace-pre-wrap">{event.description}</p>
            </div>
          )}

          {/* Event Details */}
          <div className="grid grid-cols-2 gap-4">
            {/* Date */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-purple-600 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">{t('liveChannelEventDetails', 'dateLabel', 'Date')}</p>
                    <p className="font-semibold">{formatDate(event.scheduled_start)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Time */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-purple-600 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">{t('liveChannelEventDetails', 'timeLabel', 'Time')}</p>
                    <p className="font-semibold">{formatTime(event.scheduled_start)}</p>
                    {event.duration_minutes && (
                      <p className="text-sm text-gray-500">{t('liveChannelEventDetails', 'durationMinutes', '{count} minutes').replace('{count}', String(event.duration_minutes))}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Type */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {event.is_video_enabled ? (
                    <Video className="h-5 w-5 text-purple-600 mt-0.5" />
                  ) : (
                    <Mic className="h-5 w-5 text-purple-600 mt-0.5" />
                  )}
                  <div>
                    <p className="text-sm text-gray-500">{t('liveChannelEventDetails', 'eventType', 'Event Type')}</p>
                    <p className="font-semibold">
                      {event.is_video_enabled ? t('liveChannelEventDetails', 'videoBroadcast', 'Video Broadcast') : t('liveChannelEventDetails', 'audioBroadcast', 'Audio Broadcast')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Participants */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Users className="h-5 w-5 text-purple-600 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">{t('liveChannelEventDetails', 'registeredLabel', 'Registered')}</p>
                    <p className="font-semibold">
                      {event.total_registered}
                      {event.max_participants && ` / ${event.max_participants}`}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Time Until Event */}
          {isUpcoming && (
            <div className="p-4 bg-purple-50 rounded-lg border-2 border-purple-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-purple-600" />
                  <span className="font-semibold text-purple-900">
                    {t('liveChannelEventDetails', 'startsIn', 'Starts in {time}').replace('{time}', getTimeUntilEvent())}
                  </span>
                </div>
                {isRegistered && (
                  <Badge className="bg-green-500 text-white">
                    <Check className="h-3 w-3 mr-1" />
                    {t('liveChannelEventDetails', 'youreRegistered', "You're Registered")}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Capacity Warning */}
          {isFull && !isRegistered && isUpcoming && (
            <div className="p-4 bg-red-50 rounded-lg border-2 border-red-200 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-red-900">{t('liveChannelEventDetails', 'eventAtCapacity', 'Event at Capacity')}</p>
                <p className="text-sm text-red-700">
                  {t('liveChannelEventDetails', 'reachedMaxParticipants', 'This event has reached its maximum number of participants.')}
                </p>
              </div>
            </div>
          )}

          {/* Cancelled Message */}
          {isCancelled && (
            <div className="p-4 bg-red-50 rounded-lg border-2 border-red-200 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-red-900">{t('liveChannelEventDetails', 'eventCancelled', 'Event Cancelled')}</p>
                <p className="text-sm text-red-700">
                  {t('liveChannelEventDetails', 'cancelledByOrganizer', 'This event has been cancelled by the organizer.')}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {isLive && (
            <Button 
              className="w-full sm:flex-1 bg-red-500 hover:bg-red-600 text-white"
              onClick={() => {
                onWatchLive?.();
                onOpenChange(false);
              }}
            >
              <Radio className="h-4 w-4 mr-2 animate-pulse" />
              {t('liveChannelEventDetails', 'watchLiveNow', 'Watch Live Now')}
            </Button>
          )}

          {isUpcoming && !isCancelled && (
            <>
              {loading ? (
                <Button disabled className="w-full sm:flex-1">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('liveChannelEventDetails', 'loading', 'Loading...')}
                </Button>
              ) : isRegistered ? (
                <Button 
                  variant="outline"
                  className="w-full sm:flex-1 border-purple-500 text-purple-600"
                  onClick={handleUnregister}
                  disabled={registering}
                >
                  {registering ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t('liveChannelEventDetails', 'unregistering', 'Unregistering...')}
                    </>
                  ) : (
                    <>
                      <BellOff className="h-4 w-4 mr-2" />
                      {t('liveChannelEventDetails', 'unregisterButton', 'Unregister')}
                    </>
                  )}
                </Button>
              ) : (
                <Button 
                  className="w-full sm:flex-1 bg-purple-600 hover:bg-purple-700"
                  onClick={handleRegister}
                  disabled={registering || isFull}
                >
                  {registering ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t('liveChannelEventDetails', 'registering', 'Registering...')}
                    </>
                  ) : (
                    <>
                      <Bell className="h-4 w-4 mr-2" />
                      {t('liveChannelEventDetails', 'registerForEvent', 'Register for Event')}
                    </>
                  )}
                </Button>
              )}
            </>
          )}

          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('liveChannelEventDetails', 'close', 'Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LiveChannelEventDetails;