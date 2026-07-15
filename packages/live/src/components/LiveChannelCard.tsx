import React from 'react';
import { Card, CardContent } from '@rekindle/ui/card';
import { Button } from '@rekindle/ui/button';
import { Badge } from '@rekindle/ui/badge';
import { 
  Radio, 
  Video, 
  Mic, 
  Users, 
  Heart, 
  Bell,
  BellOff,
  Play,
  Clock
} from 'lucide-react';
import { ShareChannelButton } from './ShareChannelButton';
import { LiveChannel } from '@rekindle/types/liveChannelTypes';
import { useLanguage } from '@rekindle/features/LanguageContext';

interface LiveChannelCardProps {
  channel: LiveChannel;
  isFollowing?: boolean;
  onFollow?: () => void;
  onUnfollow?: () => void;
  onWatch?: () => void;
  onViewProfile?: () => void;
  onGoLive?: () => void;
  onViewRecordings?: () => void;
  showFollowButton?: boolean;
  showGoLiveButton?: boolean;
  showRecordingsButton?: boolean;
}

export const LiveChannelCard: React.FC<LiveChannelCardProps> = ({
  channel,
  isFollowing = false,
  onFollow,
  onUnfollow,
  onWatch,
  onViewProfile,
  onGoLive,
  onViewRecordings,
  showFollowButton = true,
  showGoLiveButton = false,
  showRecordingsButton = false
}) => {
  const { t } = useLanguage();

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      prayer: 'bg-purple-500',
      worship: 'bg-pink-500',
      teaching: 'bg-blue-500',
      devotional: 'bg-green-500',
      testimony: 'bg-amber-500',
      counselling: 'bg-teal-500',
      general: 'bg-gray-500'
    };
    return colors[category] || colors.general;
  };

  const formatLastLive = (date?: string) => {
    if (!date) return t('liveChannelCard', 'never', 'Never');
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return t('liveChannelCard', 'justNow', 'Just now');
    if (diffHours < 24) return t('liveChannelCard', 'hoursAgo', '{count}h ago').replace('{count}', String(diffHours));
    if (diffDays < 7) return t('liveChannelCard', 'daysAgo', '{count}d ago').replace('{count}', String(diffDays));
    return d.toLocaleDateString();
  };

  // Determine background image
  const backgroundImage = channel.featured_image_url || channel.cover_image_url;
  const hasBackground = !!backgroundImage;

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 group">
      {/* Cover Image / Live Indicator */}
      <div 
        className="relative h-40 bg-gradient-to-br from-purple-600 to-indigo-700 cursor-pointer"
        onClick={onViewProfile}
        style={hasBackground ? {
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        } : undefined}
      >
        {/* Overlay */}
        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors" />

        {/* Channel Logo (if available) */}
        {channel.channel_logo_url && (
          <div className="absolute top-3 left-3 w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-lg">
            <img 
              src={channel.channel_logo_url} 
              alt={channel.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Live Badge */}
        {channel.is_live && (
          <div className={`absolute top-3 ${channel.channel_logo_url ? 'left-[4.5rem]' : 'left-3'} flex items-center gap-2`}>
            <Badge className="bg-red-500 text-white animate-pulse flex items-center gap-1">
              <Radio className="h-3 w-3" />
              {t('liveChannelCard', 'live', 'LIVE')}
            </Badge>
            {channel.is_video_enabled ? (
              <Badge variant="secondary" className="bg-white/20 text-white">
                <Video className="h-3 w-3 mr-1" />
                {t('liveChannelCard', 'video', 'Video')}
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-white/20 text-white">
                <Mic className="h-3 w-3 mr-1" />
                {t('liveChannelCard', 'audio', 'Audio')}
              </Badge>
            )}
          </div>
        )}

        {/* Ministry Badge */}
        {channel.is_ministry && (
          <Badge className="absolute top-3 right-12 bg-blue-500 text-white">
            {t('liveChannelCard', 'ministry', 'Ministry')}
          </Badge>
        )}

        {/* Recording Badge */}
        {channel.is_recording && (
          <Badge className="absolute top-3 right-3 bg-red-600 text-white">
            {t('liveChannelCard', 'rec', 'REC')}
          </Badge>
        )}

        {/* Viewer Count */}
        {channel.is_live && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1 text-white text-sm bg-black/50 px-2 py-1 rounded">
            <Users className="h-4 w-4" />
            <span>{channel.viewer_count.toLocaleString()}</span>
          </div>
        )}

        {/* Category Badge */}
        <Badge className={`absolute bottom-3 right-3 ${getCategoryColor(channel.category)} text-white`}>
          {channel.category.charAt(0).toUpperCase() + channel.category.slice(1)}
        </Badge>

        {/* Share Button — Books-style dropdown (WhatsApp/Facebook/X/Email/Copy) */}
        <ShareChannelButton
          channel={channel}
          variant="icon"
          triggerClassName="absolute top-3 right-3 text-white bg-black/50 hover:bg-black/70 hover:text-white backdrop-blur-sm"
        />
      </div>

      <CardContent className="p-4">
        {/* Channel Info */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0 cursor-pointer" onClick={onViewProfile}>
            <h3 className="font-semibold text-base sm:text-lg truncate group-hover:text-purple-600 transition-colors">
              {channel.name}
            </h3>
            <p className="text-sm text-gray-500">
              {channel.owner_name || t('liveChannelCard', 'anonymousHost', 'Anonymous Host')}
            </p>
          </div>
        </div>

        {/* Description */}
        {channel.description && (
          <p className="text-sm text-gray-600 line-clamp-2 mb-3">
            {channel.description}
          </p>
        )}

        {/* Stats */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-500 mb-3">
          <div className="flex items-center gap-1">
            <Heart className="h-4 w-4" />
            <span>{channel.total_followers.toLocaleString()}</span>
          </div>
          {!channel.is_live && (
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{formatLastLive(channel.last_live_at)}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 min-w-0">
          {channel.is_live ? (
            <Button 
              className="flex-1 bg-red-500 hover:bg-red-600 text-white"
              onClick={showGoLiveButton ? onGoLive : onWatch}
            >
              <Play className="h-4 w-4 mr-2" />
              {showGoLiveButton ? t('liveChannelCard', 'rejoinBroadcast', 'Rejoin Broadcast') : t('liveChannelCard', 'watchNow', 'Watch Now')}
            </Button>
          ) : (
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={onViewProfile}
            >
              {t('liveChannelCard', 'viewChannel', 'View Channel')}
            </Button>
          )}

          {showFollowButton && (
            isFollowing ? (
              <Button 
                variant="outline" 
                size="icon"
                onClick={onUnfollow}
                className="text-purple-600 border-purple-600"
              >
                <BellOff className="h-4 w-4" />
              </Button>
            ) : (
              <Button 
                variant="outline" 
                size="icon"
                onClick={onFollow}
              >
                <Bell className="h-4 w-4" />
              </Button>
            )
          )}
        </div>

        {/* Go Live Button (below card) */}
        {showGoLiveButton && !channel.is_live && (
          <Button
            className="w-full mt-3 bg-red-500 hover:bg-red-600 text-white"
            onClick={onGoLive}
          >
            <Radio className="h-4 w-4 mr-2" />
            {t('liveChannelCard', 'goLive', 'Go Live')}
          </Button>
        )}
        {showGoLiveButton && channel.is_live && (
          <Button
            className="w-full mt-3 bg-green-600 hover:bg-green-700 text-white"
            onClick={onGoLive}
          >
            <Radio className="h-4 w-4 mr-2" />
            {t('liveChannelCard', 'manageBroadcast', 'Manage Broadcast')}
          </Button>
        )}

        {/* Recordings — past broadcasts (replays). */}
        {showRecordingsButton && (
          <Button
            variant="outline"
            className="w-full mt-2"
            onClick={onViewRecordings}
          >
            <Video className="h-4 w-4 mr-2" />
            {t('liveChannelCard', 'recordings', 'Recordings')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default LiveChannelCard;