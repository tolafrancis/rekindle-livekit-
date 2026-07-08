import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUserEntitlements } from '@/hooks/useUserEntitlements';
import { useUpgradePrompt } from '@/hooks/useUpgradePrompt';
import { UpgradePromptModal } from './UpgradePromptModal';
import { supabase } from '@/lib/supabase';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { LiveChannelCard } from './LiveChannelCard';
import { ChannelStreamConfig } from './ChannelStreamConfig';
import { LiveChannelBroadcast } from './LiveChannelBroadcast';
import { LiveChannelViewer } from './LiveChannelViewer';
import { LiveChannelEventScheduler } from './LiveChannelEventScheduler';
import { LiveChannelEventsCalendar } from './LiveChannelEventsCalendar';
import { LiveChannelEventCard } from './LiveChannelEventCard';
import { LiveChannelEventDetails } from './LiveChannelEventDetails';
import { LiveChannelAnalyticsDashboard } from './LiveChannelAnalyticsDashboard';
import { LiveChannelInteractiveMeetings } from './LiveChannelInteractiveMeetings';
import { ChannelRecordingsViewer } from './ChannelRecordingsViewer';
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
  Church,
  Youtube,
  Facebook,
  Info
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { toast } from './ui/use-toast';
import { LiveChannel, ChannelFollower, CHANNEL_CATEGORIES, ChannelCategory } from '@/types/liveChannelTypes';
import {
  SearchFilterPanel,
  searchFilterIconClass,
  searchFilterInputClass,
  searchFilterSelectTriggerClass
} from './SearchFilterPanel';

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

type LiveChannelsTab = 'discover' | 'events' | 'following' | 'my-channels' | 'meetings' | 'analytics';

interface LiveChannelsProps {
  activeTab?: LiveChannelsTab;
  onActiveTabChange?: (tab: LiveChannelsTab) => void;
}

export const LiveChannels: React.FC<LiveChannelsProps> = ({ activeTab: controlledActiveTab, onActiveTabChange }) => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const entitlements = useUserEntitlements();
  const { activePrompt, show: showUpgradePrompt, dismiss: dismissUpgradePrompt } = useUpgradePrompt();
  
  console.log('[LiveChannels] Component mounted/rendered');
  
  // State
  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [followedChannels, setFollowedChannels] = useState<LiveChannel[]>([]);
  const [myChannels, setMyChannels] = useState<LiveChannel[]>([]);
  const [events, setEvents] = useState<ChannelEvent[]>([]);
  const [liveEvents, setLiveEvents] = useState<ChannelEvent[]>([]);
  const [showEventScheduler, setShowEventScheduler] = useState(false);
  const [showEventDetails, setShowEventDetails] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ChannelEvent | null>(null);
  const [viewCalendar, setViewCalendar] = useState(false);
  const [upcomingEvents, setUpcomingEvents] = useState<ChannelEvent[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  
  // Check if we need to auto-open a meeting — read once into state so we
  // don't lose values after sessionStorage is cleared
  const [autoOpenMeetingId, setAutoOpenMeetingId] = useState<string | null>(null);
  const [autoOpenChannelId, setAutoOpenChannelId] = useState<string | null>(null);
  const shouldAutoOpen = !!(autoOpenMeetingId && autoOpenChannelId);
  
  console.log('[LiveChannels] shouldAutoOpen:', shouldAutoOpen, 'meetingId:', autoOpenMeetingId, 'channelId:', autoOpenChannelId);
  
  const [internalActiveTab, setInternalActiveTab] = useState<LiveChannelsTab>('discover');
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const setActiveTab = useCallback((tab: LiveChannelsTab) => {
    setInternalActiveTab(tab);
    onActiveTabChange?.(tab);
  }, [onActiveTabChange]);
  
  // On mount, read sessionStorage and store into state (handles the race where
  // Index.tsx writes sessionStorage inside a useEffect after this component renders)
  useEffect(() => {
    const checkStorage = () => {
      const meetingId = sessionStorage.getItem('autoOpenMeetingId');
      const channelId = sessionStorage.getItem('autoOpenChannelId');
      if (meetingId && channelId) {
        setAutoOpenMeetingId(meetingId);
        setAutoOpenChannelId(channelId);
        setActiveTab('meetings');
      }
    };

    // Check immediately
    checkStorage();

    // Also check after a short delay in case Index.tsx writes sessionStorage
    // in a useEffect that fires after this component mounts
    const t1 = setTimeout(checkStorage, 100);
    const t2 = setTimeout(checkStorage, 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  
  console.log('[LiveChannels] activeTab:', activeTab);
  
  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newChannel, setNewChannel] = useState({
    name: '',
    description: '',
    category: 'general' as ChannelCategory,
    featured_image_url: '',
    channel_logo_url: '',
    is_ministry: false
  });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFeatured, setUploadingFeatured] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // Active view state
  const [selectedChannel, setSelectedChannel] = useState<LiveChannel | null>(null);
  const [configChannel, setConfigChannel] = useState<LiveChannel | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'broadcast' | 'watch' | 'recordings'>('list');

  // Safe helper function to get live channel count
  const getLiveChannelCount = async (): Promise<number> => {
    if (!user?.id) return 0;
    
    const { count, error } = await supabase
      .from('live_channels')
      .select('id', { count: 'exact' })
      .eq('owner_id', user.id);

    if (error) {
      console.error('[LiveChannels] Error counting channels', error);
      return 0;
    }

    return Number(count ?? 0);
  };

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
        title: t('live', 'invalidFile', "Invalid File"),
        description: t('live', 'uploadImageFile', "Please upload an image file"),
        variant: 'destructive'
      });
      return;
    }

    setUploadingLogo(true);
    try {
      const url = await uploadImage(file, 'channel-logos');
      setNewChannel(prev => ({ ...prev, channel_logo_url: url }));
      toast({
        title: t('live', 'logoUploaded', "Logo Uploaded"),
        description: t('live', 'logoUploadedDesc', "Channel logo uploaded successfully")
      });
    } catch (err) {
      console.error('Failed to upload logo:', err);
      toast({
        title: t('live', 'uploadFailed', "Upload Failed"),
        description: t('live', 'failedUploadLogo', "Failed to upload logo"),
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
        title: t('live', 'invalidFile', "Invalid File"),
        description: t('live', 'uploadImageFile', "Please upload an image file"),
        variant: 'destructive'
      });
      return;
    }

    setUploadingFeatured(true);
    try {
      const url = await uploadImage(file, 'channel-featured');
      setNewChannel(prev => ({ ...prev, featured_image_url: url }));
      toast({
        title: t('live', 'imageUploaded', "Image Uploaded"),
        description: t('live', 'imageUploadedDesc', "Featured image uploaded successfully")
      });
    } catch (err) {
      console.error('Failed to upload featured image:', err);
      toast({
        title: t('live', 'uploadFailed', "Upload Failed"),
        description: t('live', 'failedUploadImage', "Failed to upload featured image"),
        variant: 'destructive'
      });
    } finally {
      setUploadingFeatured(false);
    }
  };

  // Load channels and events
  const loadChannels = useCallback(async () => {
    setLoading(true);
    try {
      // Load all channels
      let query = supabase
        .from('live_channels')
        .select('*')
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

      // Include ministry streams in the global directory
      // Removed any exclusion logic for ministry channels
      setChannels(allChannels || []);

      // Load events
      const { data: allEvents } = await supabase
        .from('channel_events')
        .select(`
          *,
          channel:live_channels(*)
        `)
        .in('status', ['upcoming', 'live'])
        .order('scheduled_start', { ascending: true });

      const eventsList = allEvents || [];
      setEvents(eventsList);
      setLiveEvents(eventsList.filter(e => e.status === 'live'));
      setUpcomingEvents(eventsList.filter(e => e.status === 'upcoming'));

      // Load user's followed channels
      if (user?.id) {
        const { data: follows } = await supabase
          .from('channel_followers')
          .select('channel_id')
          .eq('user_id', user.id);

        const followIds = new Set((follows || []).map(f => f.channel_id));
        setFollowingIds(followIds);

        // Include ministry channels in followed channels
        const followed = (allChannels || []).filter(c => followIds.has(c.id));
        setFollowedChannels(followed);

        // Load user's own channels
        const { data: owned } = await supabase
          .from('live_channels')
          .select('*')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false });

        setMyChannels(owned || []);
      }
    } catch (err) {
      console.error('[LiveChannels] Failed to load:', err);
      toast({
        title: t('common', 'error', 'Error'),
        description: t('live', 'failedLoadChannels', "Failed to load channels"),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id, categoryFilter, searchQuery]);

  // Initial load
  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // Auto-open meeting: fires whenever channels load OR autoOpenChannelId is set
  useEffect(() => {
    if (!autoOpenMeetingId || !autoOpenChannelId) return;
    if (loading || channels.length === 0) return;

    console.log('[LiveChannels] Auto-opening meeting:', { autoOpenMeetingId, autoOpenChannelId });

    // Clear sessionStorage now that we have the values in state
    sessionStorage.removeItem('autoOpenChannelId');
    // Note: autoOpenMeetingId stays in sessionStorage for LiveChannelInteractiveMeetings

    const channel = channels.find(c => c.id === autoOpenChannelId);
    console.log('[LiveChannels] Found channel:', channel ? channel.name : 'NOT FOUND');

    if (channel) {
      setActiveTab('meetings');
      toast({
        title: t('live', 'openingMeeting', "Opening Meeting"),
        description: t('live', 'loadingMeeting', "Loading interactive meeting...")
      });
      console.log('[LiveChannels] Switched to meetings tab, meeting will auto-open');
    } else {
      sessionStorage.removeItem('autoOpenMeetingId');
      setAutoOpenMeetingId(null);
      setAutoOpenChannelId(null);
      toast({
        title: t('live', 'channelNotFound', "Channel Not Found"),
        description: t('live', 'channelNotFoundDesc', "Could not find the channel for this meeting"),
        variant: 'destructive'
      });
    }
  }, [loading, channels, autoOpenMeetingId, autoOpenChannelId]);

  // Subscribe to real-time updates
  useEffect(() => {
    const channel = supabase
      .channel('live-channels-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_channels'
        },
        () => {
          loadChannels();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'channel_events'
        },
        () => {
          loadChannels();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadChannels]);

  // Create channel
  const createChannel = async () => {
    if (!newChannel.name.trim() || !user?.id) {
      toast({
        title: t('live', 'validationError', "Validation Error"),
        description: t('live', 'provideChannelName', "Please provide a channel name"),
        variant: 'destructive'
      });
      return;
    }

    // Check if user can create channels
    if (!entitlements.canCreateLiveChannel) {
      showUpgradePrompt('live_channel_create');
      return;
    }

    // SAFE COUNT QUERY - Get current channel count for user
    const usedChannels = await getLiveChannelCount();
    const maxChannels = entitlements.maxLiveChannels;
    
    // SAFE LIMIT CHECK - Fix the comparison
    if (maxChannels !== null && usedChannels >= maxChannels) {
      showUpgradePrompt('live_channel_create');
      return;
    }

    // Prevent double submission
    if (creating) {
      console.log('[LiveChannels] Already creating channel, ignoring duplicate request');
      return;
    }

    setCreating(true);
    console.log('[LiveChannels] Creating channel:', newChannel.name);
    
    try {
      // Verify user session first
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error('Please sign in to create a channel');
      }

      console.log('[LiveChannels] Session verified, inserting channel...');

      const channelData = {
        name: newChannel.name.trim(),
        description: newChannel.description.trim() || null,
        category: newChannel.category,
        owner_id: user.id,
        owner_name: profile?.full_name || user.email?.split('@')[0] || 'Anonymous',
        daily_room_name: `channel-${Date.now()}`,
        featured_image_url: newChannel.featured_image_url || null,
        channel_logo_url: newChannel.channel_logo_url || null,
        is_ministry: newChannel.is_ministry || false
      };

      console.log('[LiveChannels] Channel data:', channelData);

      const { data, error } = await supabase
        .from('live_channels')
        .insert(channelData)
        .select()
        .single();

      if (error) {
        console.error('[LiveChannels] Insert error:', error);
        throw error;
      }

      console.log('[LiveChannels] Channel created successfully:', data);

      toast({
        title: t('live', 'channelCreated', "Channel Created"),
        description: t('live', 'channelReadyLive', "{name} is ready to go live!") .replace('{name}', data.name)
      });

      // Reset form and close modal
      setShowCreateModal(false);
      setNewChannel({ 
        name: '', 
        description: '', 
        category: 'general',
        featured_image_url: '',
        channel_logo_url: '',
        is_ministry: false
      });
      
      // Reload channels
      await loadChannels();
      
    } catch (err: any) {
      console.error('[LiveChannels] Failed to create channel:', err);
      
      let errorMessage = 'Failed to create channel';
      
      if (err.message?.includes('row-level security') || err.message?.includes('RLS')) {
        errorMessage = 'You do not have permission to create channels. Please check your account settings.';
      } else if (err.message?.includes('unique constraint')) {
        errorMessage = 'A channel with this name already exists. Please choose a different name.';
      } else if (err.message?.includes('network')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      toast({
        title: t('live', 'errorCreatingChannel', "Error Creating Channel"),
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
        title: t('auth', 'signInRequired', 'Sign In Required'),
        description: t('live', 'signInFollow', "Please sign in to follow channels"),
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
          title: t('live', 'unfollowed', "Unfollowed"),
          description: t('live', 'unfollowedDesc', "You unfollowed {name}") .replace('{name}', channel.name)
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
          title: t('live', 'following', "Following"),
          description: t('live', 'followingDesc', "You'll be notified when {name} goes live") .replace('{name}', channel.name)
        });
      }

      loadChannels();
    } catch (err) {
      console.error('[LiveChannels] Failed to toggle follow:', err);
    }
  };

  // Watch channel
  const watchChannel = (channel: LiveChannel) => {
    setSelectedChannel(channel);
    setViewMode('watch');
  };

  // Go live on own channel
  const goLive = (channel: LiveChannel) => {
    setSelectedChannel(channel);
    setViewMode('broadcast');
  };

  // Handle end broadcast
  const handleEndBroadcast = async () => {
    console.log('[LiveChannels] Broadcast ended, refreshing channels...');
    setSelectedChannel(null);
    setViewMode('list');
    // Force refresh after a small delay to ensure database updates have propagated
    await new Promise(resolve => setTimeout(resolve, 300));
    await loadChannels();
    console.log('[LiveChannels] Channels refreshed after broadcast end');
  };

  // Handle leave viewer
  const handleLeaveViewer = () => {
    setSelectedChannel(null);
    setViewMode('list');
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
        onViewRecordings={() => setViewMode('recordings')}
      />
    );
  }

  // Render recordings viewer
  if (viewMode === 'recordings' && selectedChannel) {
    const isOwner = selectedChannel.owner_id === user?.id;
    return (
      <div className="bg-gray-900 rounded-xl p-6">
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => {
            setViewMode('list');
            setSelectedChannel(null);
          }}
        >
          ← Back to Channels
        </Button>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">{selectedChannel.name} - Recordings</h1>
          <p className="text-gray-400">{selectedChannel.description}</p>
        </div>
        {/* Channel recordings */}
        <ChannelRecordingsViewer channelId={selectedChannel.id} isOwner={isOwner} />
      </div>
    );
  }

  // Live channels count - Include ministry channels in count
  const liveCount = channels.filter(c => c.is_live).length;

  return (
    <div className="space-y-6 min-w-0 max-w-full overflow-x-hidden">
      
      {entitlements.canCreateLiveChannel && entitlements.maxLiveChannels !== null && myChannels.length >= entitlements.maxLiveChannels && (
        <Alert className="bg-blue-50 border-blue-200">
          <AlertDescription className="ml-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className="font-semibold text-blue-900">Channel Limit Reached</p>
                <p className="text-sm text-blue-700 mt-1">
                  You've used all {entitlements.maxLiveChannels} of your channel slots. Upgrade for more channels.
                </p>
              </div>
              <Button 
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white ml-4"
                onClick={() => window.location.href = '/subscribe'}
              >
                <Crown className="h-3 w-3 mr-1" />
                Upgrade
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      
      {/* Header */}
      <div className="flex items-center justify-end">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={loadChannels}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          
          {/* Channel Usage Display */}
          {entitlements.maxLiveChannels !== null && (
            <div className="text-sm text-gray-600">
              <Badge variant="outline">
                {myChannels.length} / {entitlements.maxLiveChannels} channels
              </Badge>
            </div>
          )}
          
          <Button 
            onClick={() => {
              if (!entitlements.canCreateLiveChannel || (entitlements.maxLiveChannels !== null && myChannels.length >= entitlements.maxLiveChannels)) {
                showUpgradePrompt('live_channel_create');
                return;
              }
              setShowCreateModal(true);
            }}
            disabled={false}
          >
            {(!entitlements.canCreateLiveChannel || (entitlements.maxLiveChannels !== null && myChannels.length >= entitlements.maxLiveChannels)) && (
              <Lock className="h-4 w-4 mr-2" />
            )}
            <Plus className="h-4 w-4 mr-2" />
            Create Channel
          </Button>
        </div>
      </div>

      {/* Live Now Banner */}
      {liveCount > 0 && (
        <Card className="bg-gradient-to-r from-red-500 to-pink-500 text-white border-0">
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                <span className="font-semibold text-lg">
                  {liveCount} {liveCount === 1 ? 'Channel' : 'Channels'} Live Now
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
                Watch Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Filters */}
      <SearchFilterPanel icon={<Radio className="h-6 w-6 text-white/60" />}>
        <div className="relative flex-1">
          <Search className={searchFilterIconClass} />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('live', 'searchChannels', "Search channels...")}
            className={searchFilterInputClass}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className={`w-full sm:w-48 ${searchFilterSelectTriggerClass}`}>
            <SelectValue placeholder={t('live', 'allCategories', "All Categories")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('live', 'allCategories', "All Categories")}</SelectItem>
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
        <TabsList className="flex w-full overflow-x-auto gap-1 h-auto p-1 flex-nowrap md:hidden">
          <TabsTrigger value="discover" className="flex items-center gap-1 text-xs sm:text-sm whitespace-nowrap flex-shrink-0">
            <Tv className="h-4 w-4" />
            Discover
          </TabsTrigger>
          <TabsTrigger value="events" className="flex items-center gap-1 text-xs sm:text-sm whitespace-nowrap flex-shrink-0">
            <Calendar className="h-4 w-4" />
            Events
          </TabsTrigger>
          <TabsTrigger value="following" className="flex items-center gap-1 text-xs sm:text-sm whitespace-nowrap flex-shrink-0">
            <Heart className="h-4 w-4" />
            Following ({followedChannels.length})
          </TabsTrigger>
          <TabsTrigger value="my-channels" className="flex items-center gap-1 text-xs sm:text-sm whitespace-nowrap flex-shrink-0">
            <Mic className="h-4 w-4" />
            My Channels ({myChannels.length})
          </TabsTrigger>
          <TabsTrigger value="meetings" className="flex items-center gap-1 text-xs sm:text-sm whitespace-nowrap flex-shrink-0">
            <Video className="h-4 w-4" />
            Meetings
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-1 text-xs sm:text-sm whitespace-nowrap flex-shrink-0">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>


        {/* Discover Tab */}
        <TabsContent value="discover" className="mt-6 space-y-6">
          {/* Live Events Section */}
          {liveEvents.length > 0 && (
            <div>
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Radio className="h-5 w-5 text-red-500 animate-pulse" />
                Live Events
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {liveEvents.map(event => (
                  <Card key={event.id} className="hover:shadow-lg transition-all">
                    <CardContent className="p-4">
                      <Badge className="bg-red-500 text-white mb-2">LIVE</Badge>
                      <h4 className="font-semibold mb-1">{event.title}</h4>
                      <p className="text-sm text-gray-500 mb-3">{event.channel?.name}</p>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <span className="text-sm text-gray-500">{event.total_registered} registered</span>
                        <Button size="sm" onClick={() => event.channel && watchChannel(event.channel)}>
                          Watch
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
                <Calendar className="h-5 w-5 text-purple-600" />
                Upcoming Events
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {upcomingEvents.map(event => (
                  <Card key={event.id} className="hover:shadow-lg transition-all">
                    <CardContent className="p-4">
                      <Badge variant="secondary" className="mb-2">
                        <Clock className="h-3 w-3 mr-1" />
                        {new Date(event.scheduled_start).toLocaleDateString()}
                      </Badge>
                      <h4 className="font-semibold mb-1">{event.title}</h4>
                      <p className="text-sm text-gray-500 mb-3">{event.channel?.name}</p>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <span className="text-sm text-gray-500">{event.total_registered} registered</span>
                        <Button variant="outline" size="sm">
                          Register
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
              <Radio className="h-5 w-5 text-red-500" />
              Live Broadcast
            </h3>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
              </div>
            ) : channels.length === 0 ? (
              <Card className="p-12 text-center">
                <Radio className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Channels Found</h3>
                <p className="text-gray-500 mb-4">
                  {searchQuery || categoryFilter !== 'all'
                    ? 'Try adjusting your search or filters'
                    : 'Be the first to create a channel!'}
                </p>
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Channel
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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

        {/* Following Tab */}
        <TabsContent value="following" className="mt-6">
          {followedChannels.length === 0 ? (
            <Card className="p-12 text-center">
              <Heart className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Followed Channels</h3>
              <p className="text-gray-500 mb-4">
                Follow channels to get notified when they go live
              </p>
              <Button variant="outline" onClick={() => setActiveTab('discover')}>
                Discover Channels
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
              <h3 className="text-lg font-semibold mb-2">No Channels Yet</h3>
              <p className="text-gray-500 mb-4">
                Create your first channel and start broadcasting
              </p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Channel
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {myChannels.map(channel => (
                <div key={channel.id} className="space-y-2">
                  <LiveChannelCard
                    channel={channel}
                    showFollowButton={false}
                    showGoLiveButton={true}
                    showRecordingsButton={true}
                    onWatch={() => watchChannel(channel)}
                    onViewProfile={() => watchChannel(channel)}
                    onGoLive={() => goLive(channel)}
                    onViewRecordings={() => {
                      setSelectedChannel(channel);
                      setViewMode('recordings');
                    }}
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
                    Connect to YouTube &amp; Facebook
                  </Button>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setConfigChannel(channel)}
                    >
                      <Radio className="h-4 w-4 mr-1" />
                      Broadcast setup (OBS / encoder)
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="What is Broadcast setup?">
                          <Info className="h-4 w-4 text-gray-500" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-72 text-sm text-gray-600 space-y-2">
                        <p className="font-medium text-gray-800">{t('live', 'whatIsBroadcast', "What is Broadcast setup?")}</p>
                        <p>{t('live', 'broadcastIntro', "Open it to set up everything for this channel before you go live:")}</p>
                        <ul className="list-disc pl-4 space-y-1">
                          <li><b>Restream</b> your broadcast to YouTube Live &amp; Facebook Live at the same time.</li>
                          <li>Turn <b>recording</b> on or off for replays.</li>
                          <li>Get <b>OBS / encoder</b> details to stream from external software (under Advanced).</li>
                        </ul>
                        <p className="text-xs text-gray-400">
                          To just go live from your browser, use the “Go Live” button — no setup needed.
                        </p>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="mt-6">
          {myChannels.length === 0 ? (
            <Card className="p-12 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Analytics Available</h3>
              <p className="text-gray-500 mb-4">
                Create a channel to start tracking analytics
              </p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Channel
              </Button>
            </Card>
          ) : (
            <div className="space-y-6">
              <Alert>
                <BarChart3 className="h-4 w-4" />
                <AlertDescription>
                  Select a channel to view detailed analytics including attendance, engagement, and replay metrics.
                </AlertDescription>
              </Alert>
              
              <div className="grid grid-cols-1 gap-6">
                {myChannels.map(channel => (
                  <Card key={channel.id} className="overflow-hidden">
                    <CardHeader className="bg-gradient-to-r from-purple-50 to-blue-50">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <CardTitle>{channel.name}</CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            {channel.description || 'No description'}
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

        {/* Interactive Meetings Tab */}
        <TabsContent value="meetings" className="mt-6">
          {myChannels.length === 0 && !autoOpenChannelId ? (
            <Card className="p-12 text-center">
              <Video className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Channels Available</h3>
              <p className="text-gray-500 mb-4">
                Create a channel to host interactive meetings
              </p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Channel
              </Button>
            </Card>
          ) : (
            <div className="space-y-6">
              {myChannels.length > 0 && (
                <Alert>
                  <Crown className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <p className="font-semibold">{t('live', 'premiumFeature', "Premium+ Feature")}</p>
                      <p>{t('live', 'interactiveMeetingsDesc', "Interactive Meetings allow you to host live video sessions for your channel followers.")}</p>
                      <p className="text-sm text-muted-foreground">{t('live', 'selectChannelBelow', "Select a channel below to manage its meetings.")}</p>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="grid grid-cols-1 gap-6">
                {/* Render channels you own */}
                {myChannels.map(channel => (
                  <Card key={channel.id} className="overflow-hidden">
                    <CardHeader className="bg-gradient-to-r from-purple-50 to-blue-50">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            {channel.name}
                            {entitlements?.canHostInteractiveMeetings && (
                              <Badge variant="secondary" className="border-purple-500 text-purple-600">
                                <Crown className="h-3 w-3 mr-1" />
                                Premium+
                              </Badge>
                            )}
                          </CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            {channel.description || 'No description'}
                          </p>
                        </div>
                        <Badge variant="secondary">{channel.category}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <LiveChannelInteractiveMeetings channelId={channel.id} />
                    </CardContent>
                  </Card>
                ))}
                
                {/* Render channel from meeting link if not in myChannels */}
                {autoOpenChannelId && !myChannels.find(c => c.id === autoOpenChannelId) && (() => {
                  const channel = channels.find(c => c.id === autoOpenChannelId);
                  if (channel) {
                    return (
                      <Card key={`auto-${channel.id}`} className="overflow-hidden border-purple-200">
                        <CardHeader className="bg-gradient-to-r from-purple-100 to-blue-100">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                              <CardTitle className="flex items-center gap-2">
                                {channel.name}
                                <Badge variant="secondary" className="border-purple-500 text-purple-600">
                                  Joining Meeting
                                </Badge>
                              </CardTitle>
                              <p className="text-sm text-muted-foreground mt-1">
                                {channel.description || 'No description'}
                              </p>
                            </div>
                            <Badge variant="secondary">{channel.category}</Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-6">
                          <LiveChannelInteractiveMeetings channelId={channel.id} />
                        </CardContent>
                      </Card>
                    );
                  }
                  return null;
                })()}
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

      <Dialog open={showCreateModal} onOpenChange={(open) => {
        if (!creating) setShowCreateModal(open);
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-purple-600" />
              Create New Channel
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-4 px-1">
            {/* Channel Name - At top for visibility */}
            <div className="space-y-2">
              <Label htmlFor="channel-name">{t('live', 'channelName', "Channel Name")} <span className="text-red-500">*</span></Label>
              <Input
                id="channel-name"
                value={newChannel.name}
                onChange={(e) => setNewChannel(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t('live', 'channelNamePlaceholder', "My Prayer Channel")}
                maxLength={100}
                className={!newChannel.name.trim() ? 'border-orange-300 focus:border-orange-500' : ''}
              />
              {!newChannel.name.trim() && (
                <p className="text-xs text-orange-500">{t('live', 'channelNameRequired', "Channel name is required")}</p>
              )}
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="channel-category">{t('live', 'category', "Category")}</Label>
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

            {/* Ministry Stream Option */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is-ministry"
                  checked={newChannel.is_ministry}
                  onChange={(e) => setNewChannel(prev => ({ ...prev, is_ministry: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <Label htmlFor="is-ministry" className="text-sm font-medium">
                  Ministry Stream
                </Label>
              </div>
              <p className="text-xs text-gray-500">
                Ministry streams are featured in the global directory and can be followed by all users.
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="channel-description">{t('live', 'descriptionOptional', "Description (Optional)")}</Label>
              <Textarea
                id="channel-description"
                value={newChannel.description}
                onChange={(e) => setNewChannel(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('live', 'channelAboutPlaceholder', "What is your channel about?")}
                rows={2}
                maxLength={500}
              />
            </div>

            {/* Channel Logo - Optional, Compact */}
            <div className="space-y-2">
              <Label>{t('live', 'channelLogoOptional', "Channel Logo (Optional)")}</Label>
              <div className="flex items-center gap-3">
                {newChannel.channel_logo_url ? (
                  <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-gray-200 flex-shrink-0">
                    <img src={newChannel.channel_logo_url} alt="Logo" className="w-full h-full object-cover" />
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
                    <div className="flex items-center gap-2 mt-1 text-xs text-purple-600">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Uploading...
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Featured Image - Optional, Compact */}
            <div className="space-y-2">
              <Label>Featured Image (Optional)</Label>
              {newChannel.featured_image_url ? (
                <div className="relative w-full h-24 rounded-lg overflow-hidden border-2 border-gray-200">
                  <img src={newChannel.featured_image_url} alt="Featured" className="w-full h-full object-cover" />
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
                <div className="flex items-center gap-2 text-xs text-purple-600">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Uploading featured image...
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
              Cancel
            </Button>
            <Button
              onClick={createChannel}
              disabled={creating || uploadingLogo || uploadingFeatured || !newChannel.name.trim()}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Channel
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <UpgradePromptModal
        prompt={activePrompt}
        onClose={dismissUpgradePrompt}
        onUpgrade={() => {}}
      />
    </div>
  );
};

export default LiveChannels;
