import React, { useState } from 'react';
import { Card, CardContent, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
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
  Eye,
  Share2,
  Copy,
  Check
} from 'lucide-react';
import { shareEvent } from '@/lib/liveShare';
import { ChannelEvent } from '@rekindle/types/liveChannelTypes';
import { toast } from './ui/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';

interface LiveChannelEventCardProps {
  event: ChannelEvent;
  isRegistered?: boolean;
  onRegister?: () => void;
  onUnregister?: () => void;
  onViewDetails?: () => void;
  onWatchLive?: () => void;
  showActions?: boolean;
}

export const LiveChannelEventCard: React.FC<LiveChannelEventCardProps> = ({
  event,
  isRegistered = false,
  onRegister,
  onUnregister,
  onViewDetails,
  onWatchLive,
  showActions = true
}) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const formatEventDate = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffDays > 7) {
      return d.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    } else if (diffDays > 0) {
      return diffDays > 1
        ? t('liveChannelEventCard', 'inDays', 'In {count} days').replace('{count}', String(diffDays))
        : t('liveChannelEventCard', 'inDay', 'In {count} day').replace('{count}', String(diffDays));
    } else if (diffHours > 0) {
      return diffHours > 1
        ? t('liveChannelEventCard', 'inHours', 'In {count} hours').replace('{count}', String(diffHours))
        : t('liveChannelEventCard', 'inHour', 'In {count} hour').replace('{count}', String(diffHours));
    } else if (diffMins > 0) {
      return diffMins > 1
        ? t('liveChannelEventCard', 'inMinutes', 'In {count} minutes').replace('{count}', String(diffMins))
        : t('liveChannelEventCard', 'inMinute', 'In {count} minute').replace('{count}', String(diffMins));
    } else if (diffMins > -60) {
      return t('liveChannelEventCard', 'startingNow', 'Starting now');
    } else {
      return t('liveChannelEventCard', 'past', 'Past');
    }
  };

  const formatEventTime = (date: string) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'live':
        return 'bg-red-500 text-white animate-pulse';
      case 'upcoming':
        return 'bg-purple-500 text-white';
      case 'ended':
        return 'bg-gray-500 text-white';
      case 'cancelled':
        return 'bg-red-600 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

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
      toast({ title: t('liveChannelEventCard', 'copiedToShareTitle', 'Copied to share!'), description: t('liveChannelEventCard', 'copiedToShareDesc', 'The event invite is on your clipboard.') });
    }
  };

  const isLive = event.status === 'live';
  const isPast = event.status === 'ended';
  const isCancelled = event.status === 'cancelled';
  const isUpcoming = event.status === 'upcoming';

  return (
    <Card className={`overflow-hidden hover:shadow-lg transition-all duration-300 group ${
      isCancelled ? 'opacity-60' : ''
    }`}>
      {/* Cover Image */}
      <div 
        className="relative h-40 bg-gradient-to-br from-purple-600 to-indigo-700 cursor-pointer"
        onClick={onViewDetails}
        style={event.cover_image_url ? {
          backgroundImage: `url(${event.cover_image_url})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        } : undefined}
      >
        {/* Overlay */}
        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors" />

        {/* Status Badge */}
        <Badge className={`absolute top-3 left-3 ${getStatusColor(event.status)}`}>
          {isLive && <Radio className="h-3 w-3 mr-1" />}
          {event.status.toUpperCase()}
        </Badge>

        {/* Share Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            handleShare();
          }}
          className="absolute top-3 right-3 text-white bg-black/50 hover:bg-black/70 backdrop-blur-sm"
        >
          {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
        </Button>

        {/* Event Type Badge */}
        <Badge 
          variant="secondary" 
          className="absolute bottom-3 right-3 bg-white/20 text-white backdrop-blur-sm"
        >
          {event.is_video_enabled ? (
            <>
              <Video className="h-3 w-3 mr-1" />
              {t('liveChannelEventCard', 'video', 'Video')}
            </>
          ) : (
            <>
              <Mic className="h-3 w-3 mr-1" />
              {t('liveChannelEventCard', 'audio', 'Audio')}
            </>
          )}
        </Badge>

        {/* Registration Status (if registered) */}
        {isRegistered && (
          <Badge className="absolute bottom-3 left-3 bg-green-500 text-white">
            <Check className="h-3 w-3 mr-1" />
            {t('liveChannelEventCard', 'registered', 'Registered')}
          </Badge>
        )}
      </div>

      <CardContent className="p-4">
        {/* Title */}
        <div className="mb-3 cursor-pointer" onClick={onViewDetails}>
          <h3 className="font-semibold text-lg truncate group-hover:text-purple-600 transition-colors">
            {event.title}
          </h3>
          {event.channel && (
            <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
              <MapPin className="h-3 w-3" />
              {event.channel.name}
            </p>
          )}
        </div>

        {/* Description */}
        {event.description && (
          <p className="text-sm text-gray-600 line-clamp-2 mb-3">
            {event.description}
          </p>
        )}

        {/* Date & Time */}
        <div className="space-y-2 mb-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="h-4 w-4 text-purple-500" />
            <span className="font-medium">{formatEventDate(event.scheduled_start)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Clock className="h-4 w-4 text-purple-500" />
            <span>{formatEventTime(event.scheduled_start)}</span>
            {event.duration_minutes && (
              <span className="text-gray-400">
                • {event.duration_minutes} {t('liveChannelEventCard', 'minAbbrev', 'min')}
              </span>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span>{event.total_registered} {t('liveChannelEventCard', 'registeredCountLabel', 'registered')}</span>
          </div>
          {event.max_participants && (
            <span className="text-gray-400">
              / {event.max_participants} {t('liveChannelEventCard', 'maxLabel', 'max')}
            </span>
          )}
        </div>

        {/* Capacity Warning */}
        {event.max_participants && event.total_registered >= event.max_participants && !isRegistered && (
          <div className="mt-2">
            <Badge variant="destructive" className="text-xs">
              {t('liveChannelEventCard', 'eventFull', 'Event Full')}
            </Badge>
          </div>
        )}
      </CardContent>

      {/* Actions */}
      {showActions && !isCancelled && (
        <CardFooter className="p-4 pt-0 flex gap-2">
          {isLive ? (
            <Button 
              className="flex-1 bg-red-500 hover:bg-red-600 text-white"
              onClick={onWatchLive}
            >
              <Radio className="h-4 w-4 mr-2 animate-pulse" />
              {t('liveChannelEventCard', 'watchLive', 'Watch Live')}
            </Button>
          ) : isUpcoming ? (
            <>
              {isRegistered ? (
                <Button 
                  variant="outline" 
                  className="flex-1 border-purple-500 text-purple-600"
                  onClick={onUnregister}
                >
                  <BellOff className="h-4 w-4 mr-2" />
                  {t('liveChannelEventCard', 'unregister', 'Unregister')}
                </Button>
              ) : (
                <Button 
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                  onClick={onRegister}
                  disabled={event.max_participants !== null && event.total_registered >= event.max_participants}
                >
                  <Bell className="h-4 w-4 mr-2" />
                  {t('liveChannelEventCard', 'register', 'Register')}
                </Button>
              )}
              <Button 
                variant="outline" 
                size="icon"
                onClick={onViewDetails}
              >
                <Eye className="h-4 w-4" />
              </Button>
            </>
          ) : isPast ? (
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={onViewDetails}
            >
              <Eye className="h-4 w-4 mr-2" />
              {t('liveChannelEventCard', 'viewDetails', 'View Details')}
            </Button>
          ) : null}
        </CardFooter>
      )}

      {/* Cancelled Message */}
      {isCancelled && (
        <CardFooter className="p-4 pt-0">
          <div className="w-full text-center text-sm text-red-600 font-medium">
            {t('liveChannelEventCard', 'eventCancelled', 'This event has been cancelled')}
          </div>
        </CardFooter>
      )}
    </Card>
  );
};

export default LiveChannelEventCard;