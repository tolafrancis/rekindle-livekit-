import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@rekindle/features/AuthContext';
import { useLanguage } from '@rekindle/features/LanguageContext';
import { useViewHistory } from '@rekindle/features/hooks/useViewHistory';
import { useUserEntitlements } from '@rekindle/auth/useUserEntitlements';
import { supabase } from '@rekindle/supabase';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Textarea } from '@rekindle/ui/textarea';
import { Label } from '@rekindle/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@rekindle/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@rekindle/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rekindle/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@rekindle/ui/dialog';
import { Alert, AlertDescription } from '@rekindle/ui/alert';
import { Badge } from '@rekindle/ui/badge';
import { LiveChannelCard } from '@rekindle/live/components/LiveChannelCard';
import { LiveChannelBroadcast } from '@rekindle/live/components/LiveChannelBroadcast';
import { ChannelStreamConfig } from '@rekindle/live/components/ChannelStreamConfig';
import { ChannelRecordingsViewer } from '@rekindle/live/components/ChannelRecordingsViewer';
import { LiveChannelViewer } from '@rekindle/live/components/LiveChannelViewer';
import { LiveChannelAnalyticsDashboard } from '@rekindle/live/components/LiveChannelAnalyticsDashboard';
import { MinistryInteractiveMeetings } from './MinistryInteractiveMeetings';
import {
  Radio,
  Plus,
  Search,
  RefreshCw,
  Loader2,
  Tv,
  Heart,
  Users,
  Mic,
  Calendar,
  Clock,
  Upload,
  X,
  Lock,
  Crown,
  BarChart3,
  Video,
  Youtube,
  Facebook,
  Info
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@rekindle/ui/popover';
import { toast } from '@rekindle/ui/use-toast';
import { LiveChannel, CHANNEL_CATEGORIES, ChannelCategory } from '@rekindle/types/liveChannelTypes';
import {
  SearchFilterPanel,
  searchFilterIconClass,
  searchFilterInputClass,
  searchFilterSelectTriggerClass
} from '@rekindle/features/components/SearchFilterPanel';

interface ChannelEvent {
  id: string;
  channel_id: string;
  title: string;
  description: string;
  scheduled_start: string;
  status: 'upcoming' | 'live' | 'ended' | 'cancelled';
  is_video_enabled: boolean;
  total_registered: number;
  channel?: LiveChannel;
}

interface MLiveChannelProps {
  ministryId: string;
  ministryName: string;
  isLeader?: boolean;
  themeColor?: string;
}

export const MLiveChannel: React.FC<MLiveChannelProps> = ({
  ministryId,
  ministryName,
  isLeader = false,
  themeColor = '#7c3aed'
}) => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const entitlements = useUserEntitlements();
  const location = useLocation();
  
  // State - mirrors LiveChannels
  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [followedChannels, setFollowedChannels] = useState<LiveChannel[]>([]);
  const [myChannels, setMyChannels] = useState<LiveChannel[]>([]);
  const [events, setEvents] = useState<ChannelEvent[]>([]);
  const [liveEvents, setLiveEvents] = useState<ChannelEvent[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<ChannelEvent[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('discover');
  
  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newChannel, setNewChannel] = useState({
    name: '',
    description: '',
    category: 'general' as ChannelCategory,
    featured_image_url: '',
    channel_logo_url: ''
  });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFeatured, setUploadingFeatured] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // Active view state - mirrors LiveChannels
  const [selectedChannel, setSelectedChannel] = useState<LiveChannel | null>(null);
  const [configChannel, setConfigChannel] = useState<LiveChannel | null>(null);
  const [recordingsChannel, setRecordingsChannel] = useState<LiveChannel | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'broadcast' | 'watch'>('list');
  const { navigateView: navigateViewMode } = useViewHistory('ministry-live-channel', viewMode, setViewMode);

  // Upload image to Supabase Storage
  const uploadImage = async (file: File, bucket: 'channel-logos' | 'channel-featured') => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${user?.id}-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return publicUrl;
  };

  // Handle logo upload
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: t('mLiveChannel', 'invalidFileTitle', 'Invalid File'),
        description: t('mLiveChannel', 'invalidFileDesc', 'Please upload an image file'),
        variant: 'destructive'
      });
      return;
    }

    setUploadingLogo(true);
    try {
      const url = await uploadImage(file, 'channel-logos');
      setNewChannel(prev => ({ ...prev, channel_logo_url: url }));
      toast({
        title: t('mLiveChannel', 'logoUploadedTitle', 'Logo Uploaded'),
        description: t('mLiveChannel', 'logoUploadedDesc', 'Channel logo uploaded successfully')
      });
    } catch (err) {
      console.error('Failed to upload logo:', err);
      toast({
        title: t('mLiveChannel', 'uploadFailedTitle', 'Upload Failed'),
        description: t('mLiveChannel', 'logoUploadFailedDesc', 'Failed to upload logo'),
        variant: 'destructive'
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  // Handle featured image upload
  const handleFeaturedUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: t('mLiveChannel', 'invalidFileTitle', 'Invalid File'),
        description: t('mLiveChannel', 'invalidFileDesc', 'Please upload an image file'),
        variant: 'destructive'
      });
      return;
    }

    setUploadingFeatured(true);
    try {
      const url = await uploadImage(file, 'channel-featured');
      setNewChannel(prev => ({ ...prev, featured_image_url: url }));
      toast({
        title: t('mLiveChannel', 'imageUploadedTitle', 'Image Uploaded'),
        description: t('mLiveChannel', 'imageUploadedDesc', 'Featured image uploaded successfully')
      });
    } catch (err) {
      console.error('Failed to upload featured image:', err);
      toast({
        title: t('mLiveChannel', 'uploadFailedTitle', 'Upload Failed'),
        description: t('mLiveChannel', 'featuredUploadFailedDesc', 'Failed to upload featured image'),
        variant: 'destructive'
      });
    } finally {
      setUploadingFeatured(false);
    }
  };

  // Load channels and events - filtered by ministry
  const loadChannels = useCallback(async () => {
    setLoading(true);
    try {
      // Load ministry channels
      let query = supabase
        .from('live_channels')
        .select('*')
        .eq('ministry_id', ministryId)
        .order('is_live', { ascending: false })
        .order('total_followers', { ascending: false });

      if (categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter);
      }

      if (searchQuery) {
        query = query.ilike('name', `%${searchQuery}%`);
      }

      const { data: allChannels, error } = await query;
      if (error) throw error;

      setChannels(allChannels || []);

      // Load events for ministry channels
      const channelIds = (allChannels || []).map(c => c.id);
      if (channelIds.length > 0) {
        const { data: allEvents } = await supabase
          .from('channel_events')
          .select(`
            *,
            channel:live_channels(*)
          `)
          .in('channel_id', channelIds)
          .in('status', ['upcoming', 'live'])
          .order('scheduled_start', { ascending: true });

        const eventsList = allEvents || [];
        setEvents(eventsList);
        setLiveEvents(eventsList.filter(e => e.status === 'live'));
        setUpcomingEvents(eventsList.filter(e => e.status === 'upcoming'));
      } else {
        setEvents([]);
        setLiveEvents([]);
        setUpcomingEvents([]);
      }

      // Load user's followed channels within this ministry
      if (user?.id) {
        const { data: follows } = await supabase
          .from('channel_followers')
          .select('channel_id')
          .eq('user_id', user.id);

        const followIds = new Set((follows || []).map(f => f.channel_id));
        setFollowingIds(followIds);

        const followed = (allChannels || []).filter(c => followIds.has(c.id));
        setFollowedChannels(followed);

        // Load user's own channels within this ministry
        const { data: owned } = await supabase
          .from('live_channels')
          .select('*')
          .eq('owner_id', user.id)
          .eq('ministry_id', ministryId)
          .order('created_at', { ascending: false });

        setMyChannels(owned || []);
      }
    } catch (err) {
      console.error('[MLiveChannel] Failed to load:', err);
      toast({
        title: t('mLiveChannel', 'errorTitle', 'Error'),
        description: t('mLiveChannel', 'loadFailedDesc', 'Failed to load channels'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id, ministryId, categoryFilter, searchQuery]);

  // Initial load
  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // Check URL for meeting ID to auto-open
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const meetingId = params.get('meetingId');
    const autoJoin = params.get('autoJoin');

    console.log('[MLiveChannel] Checking URL params:', { meetingId, autoJoin });

    if (meetingId && autoJoin === 'true' && !loading) {
      // Switch to meetings tab
      setActiveTab('meetings');
      
      // Store meeting ID for MinistryInteractiveMeetings to pick up
      sessionStorage.setItem('autoOpenMeetingId', meetingId);
      
      toast({
        title: t('mLiveChannel', 'openingMeetingTitle', 'Opening Meeting'),
        description: t('mLiveChannel', 'openingMeetingDesc', 'Switching to meetings tab...')
      });
      
      console.log('[MLiveChannel] Switched to meetings tab, stored meeting ID:', meetingId);
    }
  }, [location.search, loading]);

  // Subscribe to real-time updates
  useEffect(() => {
    const channel = supabase
      .channel(`ministry-live-channels-${ministryId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_channels',
          filter: `ministry_id=eq.${ministryId}`
        },
        () => {
          loadChannels();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadChannels, ministryId]);

  // Create channel
  const createChannel = async () => {
    if (!newChannel.name.trim() || !user?.id) {
      toast({
        title: t('mLiveChannel', 'validationErrorTitle', 'Validation Error'),
        description: t('mLiveChannel', 'provideChannelNameDesc', 'Please provide a channel name'),
        variant: 'destructive'
      });
      return;
    }

    // Check if user can create channels
    if (!entitlements.canCreateLiveChannel) {
      toast({
        title: t('mLiveChannel', 'upgradeRequiredTitle', 'Upgrade Required'),
        description: t('mLiveChannel', 'upgradeToCreateDesc', 'You need to upgrade your subscription to create live channels'),
        variant: 'destructive'
      });
      return;
    }

    // Check channel limit
    const maxChannels = entitlements.maxLiveChannels;
    const currentCount = myChannels.length;

    if (maxChannels !== null && currentCount >= maxChannels) {
      toast({
        title: t('mLiveChannel', 'channelLimitReachedTitle', 'Channel Limit Reached'),
        description: t('mLiveChannel', 'channelLimitFullDesc', 'You have reached your limit of {max} live channels. Please upgrade your subscription to create more.').replace('{max}', String(maxChannels)),
        variant: 'destructive'
      });
      return;
    }

    if (creating) {
      return;
    }

    setCreating(true);
    
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error(t('mLiveChannel', 'signInToCreateChannel', 'Please sign in to create a channel'));
      }

      const channelData = {
        name: newChannel.name.trim(),
        description: newChannel.description.trim() || null,
        category: newChannel.category,
        owner_id: user.id,
        owner_name: profile?.full_name || user.email?.split('@')[0] || 'Anonymous',
        daily_room_name: `ministry-${ministryId}-channel-${Date.now()}`,
        featured_image_url: newChannel.featured_image_url || null,
        channel_logo_url: newChannel.channel_logo_url || null,
        ministry_id: ministryId,
        is_ministry: true
      };

      const { data, error } = await supabase
        .from('live_channels')
        .insert(channelData)
        .select()
        .single();

      if (error) {
        throw error;
      }

      toast({
        title: t('mLiveChannel', 'channelCreatedTitle', 'Channel Created'),
        description: t('mLiveChannel', 'channelCreatedDesc', '{name} is ready to go live!').replace('{name}', String(data.name))
      });

      setShowCreateModal(false);
      setNewChannel({ 
        name: '', 
        description: '', 
        category: 'general',
        featured_image_url: '',
        channel_logo_url: ''
      });
      
      await loadChannels();
      
    } catch (err: any) {
      console.error('[MLiveChannel] Failed to create channel:', err);
      
      let errorMessage = t('mLiveChannel', 'createChannelFailedDesc', 'Failed to create channel');

      if (err.message?.includes('row-level security') || err.message?.includes('RLS')) {
        errorMessage = t('mLiveChannel', 'noPermissionCreateDesc', 'You do not have permission to create channels. Please check your account settings.');
      } else if (err.message?.includes('unique constraint')) {
        errorMessage = t('mLiveChannel', 'channelNameExistsDesc', 'A channel with this name already exists. Please choose a different name.');
      } else if (err.message) {
        errorMessage = err.message;
      }

      toast({
        title: t('mLiveChannel', 'errorCreatingChannelTitle', 'Error Creating Channel'),
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setCreating(false);
    }
  };

  // Follow/unfollow channel
  const toggleFollow = async (channel: LiveChannel) => {
    if (!user?.id) {
      toast({
        title: t('mLiveChannel', 'signInRequiredTitle', 'Sign In Required'),
        description: t('mLiveChannel', 'signInToFollowDesc', 'Please sign in to follow channels'),
        variant: 'destructive'
      });
      return;
    }

    const isFollowing = followingIds.has(channel.id);

    try {
      if (isFollowing) {
        await supabase
          .from('channel_followers')
          .delete()
          .eq('channel_id', channel.id)
          .eq('user_id', user.id);

        await supabase
          .from('live_channels')
          .update({ total_followers: Math.max(0, channel.total_followers - 1) })
          .eq('id', channel.id);

        setFollowingIds(prev => {
          const next = new Set(prev);
          next.delete(channel.id);
          return next;
        });

        toast({
          title: t('mLiveChannel', 'unfollowedTitle', 'Unfollowed'),
          description: t('mLiveChannel', 'unfollowedDesc', 'You unfollowed {name}').replace('{name}', String(channel.name))
        });
      } else {
        await supabase
          .from('channel_followers')
          .insert({
            channel_id: channel.id,
            user_id: user.id,
            user_name: profile?.full_name || user.email?.split('@')[0]
          });

        await supabase
          .from('live_channels')
          .update({ total_followers: channel.total_followers + 1 })
          .eq('id', channel.id);

        setFollowingIds(prev => new Set([...prev, channel.id]));

        toast({
          title: t('mLiveChannel', 'followingTitle', 'Following'),
          description: t('mLiveChannel', 'followingDesc', "You'll be notified when {name} goes live").replace('{name}', String(channel.name))
        });
      }

      loadChannels();
    } catch (err) {
      console.error('[MLiveChannel] Failed to toggle follow:', err);
    }
  };

  // Watch channel
  const watchChannel = (channel: LiveChannel) => {
    setSelectedChannel(channel);
    navigateViewMode('watch');
  };

  // Go live on own channel
  const goLive = (channel: LiveChannel) => {
    setSelectedChannel(channel);
    navigateViewMode('broadcast');
  };

  // Handle end broadcast
  const handleEndBroadcast = async () => {
    setSelectedChannel(null);
    navigateViewMode('list');
    await new Promise(resolve => setTimeout(resolve, 300));
    await loadChannels();
  };

  // Handle leave viewer
  const handleLeaveViewer = () => {
    setSelectedChannel(null);
    navigateViewMode('list');
  };

  // Render broadcast view
  if (viewMode === 'broadcast' && selectedChannel) {
    return (
      <LiveChannelBroadcast
        channel={selectedChannel}
        onEndBroadcast={handleEndBroadcast}
      />
    );
  }

  // Render viewer
  if (viewMode === 'watch' && selectedChannel) {
    return (
      <LiveChannelViewer
        channel={selectedChannel}
        onLeave={handleLeaveViewer}
        isFollowing={followingIds.has(selectedChannel.id)}
        onToggleFollow={() => toggleFollow(selectedChannel)}
        context="ministry"
      />
    );
  }

  // Live channels count
  const liveCount = channels.filter(c => c.is_live).length;

  return (
    <div className="space-y-6 min-w-0 max-w-full overflow-x-hidden">
      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl border border-white/60 p-4 text-white shadow-sm sm:p-5"
        style={{
          background: `
            radial-gradient(circle at 8% 18%, rgba(45, 212, 191, 0.38), transparent 30%),
            radial-gradient(circle at 88% 20%, rgba(244, 114, 182, 0.28), transparent 28%),
            linear-gradient(135deg, #0f766e 0%, ${themeColor} 48%, #111827 100%)
          `
        }}
      >
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/10 to-transparent" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-full border border-white/45 bg-amber-400 p-4 text-slate-950 shadow-sm">
              <Radio className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold sm:text-2xl">{t('mLiveChannel', 'ministryLiveHeading', '{ministry} Live').replace('{ministry}', String(ministryName))}</h2>
              <p className="mt-1 max-w-2xl text-sm text-white/80">
                {t('mLiveChannel', 'headerSubtitle', 'Watch live broadcasts or create your own channel.')}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
          <Button
            variant="secondary"
            size="icon"
            onClick={loadChannels}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          {isLeader && (
            <Button 
              onClick={() => {
                if (!entitlements.canCreateLiveChannel) {
                  toast({
                    title: t('mLiveChannel', 'upgradeRequiredTitle', 'Upgrade Required'),
                    description: t('mLiveChannel', 'upgradeToCreateShortDesc', 'You need to upgrade to create live channels'),
                    variant: 'destructive'
                  });
                  return;
                }
                if (entitlements.maxLiveChannels !== null && myChannels.length >= entitlements.maxLiveChannels) {
                  toast({
                    title: t('mLiveChannel', 'channelLimitReachedTitle', 'Channel Limit Reached'),
                    description: t('mLiveChannel', 'channelLimitShortDesc', 'You have reached your limit of {max} channels').replace('{max}', String(entitlements.maxLiveChannels)),
                    variant: 'destructive'
                  });
                  return;
                }
                setShowCreateModal(true);
              }}
              disabled={!entitlements.canCreateLiveChannel || (entitlements.maxLiveChannels !== null && myChannels.length >= entitlements.maxLiveChannels)}
              className="bg-white text-slate-950 hover:bg-white/90"
            >
              {(!entitlements.canCreateLiveChannel || (entitlements.maxLiveChannels !== null && myChannels.length >= entitlements.maxLiveChannels)) && (
                <Lock className="h-4 w-4 mr-2" />
              )}
              <Plus className="h-4 w-4 mr-2" />
              {t('mLiveChannel', 'createChannelBtn', 'Create Channel')}
            </Button>
          )}
          </div>
        </div>
      </div>

      {/* Live Now Banner */}
      {liveCount > 0 && (
        <Card className="text-white border-0" style={{ background: `linear-gradient(to right, ${themeColor}, ${themeColor}cc)` }}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                <span className="font-semibold text-lg">
                  {liveCount === 1
                    ? t('mLiveChannel', 'oneChannelLiveNow', '{count} Channel Live Now').replace('{count}', String(liveCount))
                    : t('mLiveChannel', 'manyChannelsLiveNow', '{count} Channels Live Now').replace('{count}', String(liveCount))}
                </span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setCategoryFilter('all');
                  setActiveTab('discover');
                }}
              >
                {t('mLiveChannel', 'watchNowBtn', 'Watch Now')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <SearchFilterPanel icon={<Radio className="h-6 w-6 text-white/60" />}>
        <div className="relative w-full md:max-w-sm">
          <Search className={searchFilterIconClass} />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('mLiveChannel', 'searchChannelsPlaceholder', 'Search channels...')}
            className={searchFilterInputClass}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className={`w-full md:w-48 ${searchFilterSelectTriggerClass}`}>
            <SelectValue placeholder={t('mLiveChannel', 'allCategories', 'All Categories')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('mLiveChannel', 'allCategories', 'All Categories')}</SelectItem>
            {CHANNEL_CATEGORIES.map(cat => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SearchFilterPanel>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full overflow-x-auto gap-1 h-auto p-1 flex-nowrap">
          <TabsTrigger value="discover" className="flex items-center gap-1 text-xs sm:text-sm whitespace-nowrap flex-shrink-0">
            <Tv className="h-4 w-4" />
            {t('mLiveChannel', 'discoverTab', 'Discover')}
          </TabsTrigger>
          <TabsTrigger value="events" className="flex items-center gap-1 text-xs sm:text-sm whitespace-nowrap flex-shrink-0">
            <Calendar className="h-4 w-4" />
            {t('mLiveChannel', 'eventsTab', 'Events')}
          </TabsTrigger>
          <TabsTrigger value="meetings" className="flex items-center gap-1 text-xs sm:text-sm whitespace-nowrap flex-shrink-0">
            <Users className="h-4 w-4" />
            {t('mLiveChannel', 'meetingsTab', 'Meetings')}
          </TabsTrigger>
          <TabsTrigger value="following" className="flex items-center gap-1 text-xs sm:text-sm whitespace-nowrap flex-shrink-0">
            <Heart className="h-4 w-4" />
            {t('mLiveChannel', 'followingTab', 'Following ({count})').replace('{count}', String(followedChannels.length))}
          </TabsTrigger>
          <TabsTrigger value="my-channels" className="flex items-center gap-1 text-xs sm:text-sm whitespace-nowrap flex-shrink-0">
            <Mic className="h-4 w-4" />
            {t('mLiveChannel', 'myChannelsTab', 'My Channels ({count})').replace('{count}', String(myChannels.length))}
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-1 text-xs sm:text-sm whitespace-nowrap flex-shrink-0">
            <BarChart3 className="h-4 w-4" />
            {t('mLiveChannel', 'analyticsTab', 'Analytics')}
          </TabsTrigger>
        </TabsList>

        {/* Discover Tab */}
        <TabsContent value="discover" className="mt-6 space-y-6">
          {/* Live Events Section */}
          {liveEvents.length > 0 && (
            <div>
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Radio className="h-5 w-5 text-red-500 animate-pulse" />
                {t('mLiveChannel', 'liveEventsHeading', 'Live Events')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {liveEvents.map(event => (
                  <Card key={event.id} className="hover:shadow-lg transition-all">
                    <CardContent className="p-4">
                      <Badge className="bg-red-500 text-white mb-2">{t('mLiveChannel', 'liveBadge', 'LIVE')}</Badge>
                      <h4 className="font-semibold mb-1">{event.title}</h4>
                      <p className="text-sm text-gray-500 mb-3">{event.channel?.name}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">{t('mLiveChannel', 'registeredCount', '{count} registered').replace('{count}', String(event.total_registered))}</span>
                        <Button size="sm" onClick={() => event.channel && watchChannel(event.channel)}>
                          {t('mLiveChannel', 'watchBtn', 'Watch')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Events Section */}
          {upcomingEvents.length > 0 && (
            <div>
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Calendar className="h-5 w-5" style={{ color: themeColor }} />
                {t('mLiveChannel', 'upcomingEventsHeading', 'Upcoming Events')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {upcomingEvents.map(event => (
                  <Card key={event.id} className="hover:shadow-lg transition-all">
                    <CardContent className="p-4">
                      <Badge variant="secondary" className="mb-2">
                        <Clock className="h-3 w-3 mr-1" />
                        {new Date(event.scheduled_start).toLocaleDateString()}
                      </Badge>
                      <h4 className="font-semibold mb-1">{event.title}</h4>
                      <p className="text-sm text-gray-500 mb-3">{event.channel?.name}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">{t('mLiveChannel', 'registeredCount', '{count} registered').replace('{count}', String(event.total_registered))}</span>
                        <Button variant="outline" size="sm">
                          {t('mLiveChannel', 'registerBtn', 'Register')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Live Channels Section */}
          <div>
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Radio className="h-5 w-5" style={{ color: themeColor }} />
              {t('mLiveChannel', 'ministryChannelsHeading', 'Ministry Channels')}
            </h3>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" style={{ color: themeColor }} />
              </div>
            ) : channels.length === 0 ? (
              <Card className="p-12 text-center">
                <Radio className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">{t('mLiveChannel', 'noChannelsFound', 'No Channels Found')}</h3>
                <p className="text-gray-500 mb-4">
                  {searchQuery || categoryFilter !== 'all'
                    ? t('mLiveChannel', 'adjustSearchFilters', 'Try adjusting your search or filters')
                    : t('mLiveChannel', 'beFirstToCreate', 'Be the first to create a channel!')}
                </p>
                {isLeader && (
                  <Button onClick={() => setShowCreateModal(true)} style={{ backgroundColor: themeColor }}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('mLiveChannel', 'createChannelBtn', 'Create Channel')}
                  </Button>
                )}
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {channels.map(channel => (
                  <LiveChannelCard
                    key={channel.id}
                    channel={channel}
                    isFollowing={followingIds.has(channel.id)}
                    onFollow={() => toggleFollow(channel)}
                    onUnfollow={() => toggleFollow(channel)}
                    onWatch={() => watchChannel(channel)}
                    onViewProfile={() => watchChannel(channel)}
                    showFollowButton={channel.owner_id !== user?.id}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="events" className="mt-6">
          {events.length === 0 ? (
            <Card className="p-12 text-center">
              <Calendar className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('mLiveChannel', 'noScheduledEvents', 'No Scheduled Events')}</h3>
              <p className="text-gray-500">
                {t('mLiveChannel', 'checkBackLater', 'Check back later for upcoming events')}
              </p>
            </Card>
          ) : (
            <div className="space-y-6">
              {liveEvents.length > 0 && (
                <div>
                  <h3 className="text-xl font-semibold mb-4">{t('mLiveChannel', 'liveNowHeading', 'Live Now')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {liveEvents.map(event => (
                      <Card key={event.id} className="hover:shadow-lg transition-all">
                        <CardContent className="p-4">
                          <Badge className="bg-red-500 text-white mb-2">{t('mLiveChannel', 'liveBadge', 'LIVE')}</Badge>
                          <h4 className="font-semibold mb-1">{event.title}</h4>
                          <p className="text-sm text-gray-500 mb-3">{event.channel?.name}</p>
                          <Button size="sm" className="w-full" onClick={() => event.channel && watchChannel(event.channel)}>
                            {t('mLiveChannel', 'watchNowBtn', 'Watch Now')}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
              {upcomingEvents.length > 0 && (
                <div>
                  <h3 className="text-xl font-semibold mb-4">{t('mLiveChannel', 'upcomingHeading', 'Upcoming')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {upcomingEvents.map(event => (
                      <Card key={event.id} className="hover:shadow-lg transition-all">
                        <CardContent className="p-4">
                          <Badge variant="secondary" className="mb-2">
                            <Clock className="h-3 w-3 mr-1" />
                            {new Date(event.scheduled_start).toLocaleDateString()}
                          </Badge>
                          <h4 className="font-semibold mb-1">{event.title}</h4>
                          <p className="text-sm text-gray-500 mb-3">{event.channel?.name}</p>
                          <Button variant="outline" size="sm" className="w-full">
                            {t('mLiveChannel', 'registerBtn', 'Register')}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Following Tab */}
        <TabsContent value="following" className="mt-6">
          {followedChannels.length === 0 ? (
            <Card className="p-12 text-center">
              <Heart className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('mLiveChannel', 'noFollowedChannels', 'No Followed Channels')}</h3>
              <p className="text-gray-500 mb-4">
                {t('mLiveChannel', 'followToGetNotified', 'Follow channels to get notified when they go live')}
              </p>
              <Button variant="outline" onClick={() => setActiveTab('discover')}>
                {t('mLiveChannel', 'discoverChannelsBtn', 'Discover Channels')}
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {followedChannels.map(channel => (
                <LiveChannelCard
                  key={channel.id}
                  channel={channel}
                  isFollowing={true}
                  onUnfollow={() => toggleFollow(channel)}
                  onWatch={() => watchChannel(channel)}
                  onViewProfile={() => watchChannel(channel)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* My Channels Tab */}
        <TabsContent value="my-channels" className="mt-6">
          {myChannels.length === 0 ? (
            <Card className="p-12 text-center">
              <Mic className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('mLiveChannel', 'noChannelsYet', 'No Channels Yet')}</h3>
              <p className="text-gray-500 mb-4">
                {isLeader
                  ? t('mLiveChannel', 'createFirstChannel', 'Create your first channel and start broadcasting')
                  : t('mLiveChannel', 'noChannelsInMinistry', "You don't have any channels in this ministry")}
              </p>
              {isLeader && (
                <Button onClick={() => setShowCreateModal(true)} style={{ backgroundColor: themeColor }}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('mLiveChannel', 'createChannelBtn', 'Create Channel')}
                </Button>
              )}
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {myChannels.map(channel => (
                <div key={channel.id} className="space-y-2">
                  <LiveChannelCard
                    channel={channel}
                    showFollowButton={false}
                    showGoLiveButton={true}
                    onWatch={() => watchChannel(channel)}
                    onViewProfile={() => watchChannel(channel)}
                    onGoLive={() => goLive(channel)}
                  />
                  {/* Attractive "connect to socials" entry point — opens the same
                      Broadcast setup dialog, where the YouTube/Facebook restream lives. */}
                  <Button
                    size="sm"
                    onClick={() => setConfigChannel(channel)}
                    className="w-full border-0 text-white shadow-sm bg-gradient-to-r from-red-500 via-rose-500 to-blue-600 hover:opacity-90"
                  >
                    <Youtube className="h-4 w-4 mr-1.5" />
                    <Facebook className="h-4 w-4 mr-1.5" />
                    {t('mLiveChannel', 'connectYoutubeFacebook', 'Connect to YouTube & Facebook')}
                  </Button>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setConfigChannel(channel)}
                    >
                      <Radio className="h-4 w-4 mr-1" />
                      {t('mLiveChannel', 'broadcastSetupBtn', 'Broadcast setup (OBS / encoder)')}
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label={t('mLiveChannel', 'whatIsBroadcastSetupAria', 'What is Broadcast setup?')}>
                          <Info className="h-4 w-4 text-gray-500" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-72 text-sm text-gray-600 space-y-2">
                        <p className="font-medium text-gray-800">{t('mLiveChannel', 'whatIsBroadcastSetupHeading', 'What is Broadcast setup?')}</p>
                        <p>{t('mLiveChannel', 'broadcastSetupIntro', 'Open it to set up everything for this channel before you go live:')}</p>
                        <ul className="list-disc pl-4 space-y-1">
                          <li><b>{t('mLiveChannel', 'restreamLabel', 'Restream')}</b> {t('mLiveChannel', 'restreamDesc', 'your broadcast to YouTube Live & Facebook Live at the same time.')}</li>
                          <li>{t('mLiveChannel', 'recordingToggleBefore', 'Turn')} <b>{t('mLiveChannel', 'recordingLabel', 'recording')}</b> {t('mLiveChannel', 'recordingToggleAfter', 'on or off for replays.')}</li>
                          <li>{t('mLiveChannel', 'obsBefore', 'Get')} <b>{t('mLiveChannel', 'obsLabel', 'OBS / encoder')}</b> {t('mLiveChannel', 'obsAfter', 'details to stream from external software (under Advanced).')}</li>
                        </ul>
                        <p className="text-xs text-gray-400">
                          {t('mLiveChannel', 'goLiveFromBrowserNote', 'To just go live from your browser, use the “Go Live” button — no setup needed.')}
                        </p>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setRecordingsChannel(channel)}
                  >
                    <Video className="h-4 w-4 mr-1" />
                    {t('mLiveChannel', 'recordingsBtn', 'Recordings')}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Meetings Tab */}
        <TabsContent value="meetings" className="mt-6">
          <MinistryInteractiveMeetings ministryId={ministryId} />
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="mt-6">
          {myChannels.length === 0 ? (
            <Card className="p-12 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('mLiveChannel', 'noAnalyticsAvailable', 'No Analytics Available')}</h3>
              <p className="text-gray-500 mb-4">
                {isLeader
                  ? t('mLiveChannel', 'createChannelForAnalytics', 'Create a channel to start tracking analytics')
                  : t('mLiveChannel', 'noChannelsWithAnalytics', "You don't have any channels with analytics")}
              </p>
              {isLeader && (
                <Button onClick={() => setShowCreateModal(true)} style={{ backgroundColor: themeColor }}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('mLiveChannel', 'createChannelBtn', 'Create Channel')}
                </Button>
              )}
            </Card>
          ) : (
            <div className="space-y-6">
              <Alert>
                <BarChart3 className="h-4 w-4" />
                <AlertDescription>
                  {t('mLiveChannel', 'analyticsAlertDesc', 'Select a channel to view detailed analytics including attendance, engagement, and replay metrics for {ministry}.').replace('{ministry}', String(ministryName))}
                </AlertDescription>
              </Alert>
              
              <div className="grid grid-cols-1 gap-6">
                {myChannels.map(channel => (
                  <Card key={channel.id} className="overflow-hidden">
                    <CardHeader className="bg-gradient-to-r from-purple-50 to-blue-50">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>{channel.name}</CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            {channel.description || t('mLiveChannel', 'noDescription', 'No description')}
                          </p>
                        </div>
                        <Badge variant="secondary">{channel.category}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <LiveChannelAnalyticsDashboard
                        channelId={channel.id}
                        userId={user?.id}
                        channelName={channel.name}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Channel Modal */}
      {configChannel && (
        <ChannelStreamConfig
          channel={configChannel}
          open={!!configChannel}
          onClose={() => { setConfigChannel(null); loadChannels(); }}
        />
      )}

      {recordingsChannel && (
        <Dialog open={!!recordingsChannel} onOpenChange={(v) => { if (!v) setRecordingsChannel(null); }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-gray-900 text-white border-gray-700">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Video className="h-5 w-5" />
                {t('mLiveChannel', 'channelRecordingsTitle', '{name} — Recordings').replace('{name}', String(recordingsChannel.name))}
              </DialogTitle>
            </DialogHeader>
            <ChannelRecordingsViewer
              channelId={recordingsChannel.id}
              isOwner={recordingsChannel.owner_id === user?.id}
            />
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={showCreateModal} onOpenChange={(open) => {
        if (!creating) setShowCreateModal(open);      }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5" style={{ color: themeColor }} />
              {t('mLiveChannel', 'createMinistryChannelTitle', 'Create Ministry Channel')}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-4 px-1">
            {/* Channel Name */}
            <div className="space-y-2">
              <Label htmlFor="channel-name">{t('mLiveChannel', 'channelNameLabel', 'Channel Name')} <span className="text-red-500">*</span></Label>
              <Input
                id="channel-name"
                value={newChannel.name}
                onChange={(e) => setNewChannel(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t('mLiveChannel', 'channelNamePlaceholder', 'My Prayer Channel')}
                maxLength={100}
                className={!newChannel.name.trim() ? 'border-orange-300 focus:border-orange-500' : ''}
              />
              {!newChannel.name.trim() && (
                <p className="text-xs text-orange-500">{t('mLiveChannel', 'channelNameRequired', 'Channel name is required')}</p>
              )}
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="channel-category">{t('mLiveChannel', 'categoryLabel', 'Category')}</Label>
              <Select
                value={newChannel.category}
                onValueChange={(value: ChannelCategory) => setNewChannel(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNEL_CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="channel-description">{t('mLiveChannel', 'descriptionOptionalLabel', 'Description (Optional)')}</Label>
              <Textarea
                id="channel-description"
                value={newChannel.description}
                onChange={(e) => setNewChannel(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('mLiveChannel', 'descriptionPlaceholder', 'What is your channel about?')}
                rows={2}
                maxLength={500}
              />
            </div>

            {/* Channel Logo */}
            <div className="space-y-2">
              <Label>{t('mLiveChannel', 'channelLogoOptionalLabel', 'Channel Logo (Optional)')}</Label>
              <div className="flex items-center gap-3">
                {newChannel.channel_logo_url ? (
                  <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-gray-200 flex-shrink-0">
                    <img src={newChannel.channel_logo_url} alt={t('mLiveChannel', 'logoAlt', 'Logo')} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setNewChannel(prev => ({ ...prev, channel_logo_url: '' }))}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Upload className="h-5 w-5 text-gray-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={uploadingLogo}
                    className="text-sm"
                  />
                  {uploadingLogo && (
                    <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: themeColor }}>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {t('mLiveChannel', 'uploading', 'Uploading...')}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Featured Image */}
            <div className="space-y-2">
              <Label>{t('mLiveChannel', 'featuredImageOptionalLabel', 'Featured Image (Optional)')}</Label>
              {newChannel.featured_image_url ? (
                <div className="relative w-full h-24 rounded-lg overflow-hidden border-2 border-gray-200">
                  <img src={newChannel.featured_image_url} alt={t('mLiveChannel', 'featuredAlt', 'Featured')} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setNewChannel(prev => ({ ...prev, featured_image_url: '' }))}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="w-full h-20 rounded-lg bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300">
                  <Upload className="h-8 w-8 text-gray-400" />
                </div>
              )}
              <Input
                type="file"
                accept="image/*"
                onChange={handleFeaturedUpload}
                disabled={uploadingFeatured}
                className="text-sm"
              />
              {uploadingFeatured && (
                <div className="flex items-center gap-2 text-xs" style={{ color: themeColor }}>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t('mLiveChannel', 'uploadingFeatured', 'Uploading featured image...')}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 gap-2 sm:gap-0 border-t pt-4">
            <Button 
              variant="outline" 
              onClick={() => setShowCreateModal(false)}
              disabled={creating}
            >
              {t('mLiveChannel', 'cancelBtn', 'Cancel')}
            </Button>
            <Button
              onClick={createChannel}
              disabled={creating || uploadingLogo || uploadingFeatured || !newChannel.name.trim()}
              style={{ backgroundColor: themeColor }}
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('mLiveChannel', 'creating', 'Creating...')}
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('mLiveChannel', 'createChannelBtn', 'Create Channel')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MLiveChannel;
