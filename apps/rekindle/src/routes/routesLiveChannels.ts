// =====================================================
// LIVE CHANNELS ROUTES CONFIGURATION
// Route definitions for live channel navigation
// =====================================================

/**
 * Live channel route paths
 */
export const LIVE_CHANNEL_ROUTES = {
  // Main live channels page
  channels: '/live-channels',
  
  // Individual channel page
  channel: (channelId: string) => `/live-channels/${channelId}`,
  
  // Channel broadcast (for hosts)
  broadcast: (channelId: string) => `/live-channels/${channelId}/broadcast`,
  
  // Channel watch (for viewers)
  watch: (channelId: string) => `/live-channels/${channelId}/watch`,
  
  // Channel replays
  replays: (channelId: string) => `/live-channels/${channelId}/replays`,
  
  // Single replay
  replay: (channelId: string, replayId: string) => `/live-channels/${channelId}/replays/${replayId}`,
  
  // Channel events
  events: (channelId: string) => `/live-channels/${channelId}/events`,
  
  // Single event
  event: (channelId: string, eventId: string) => `/live-channels/${channelId}/events/${eventId}`,
  
  // Channel analytics (for owners)
  analytics: (channelId: string) => `/live-channels/${channelId}/analytics`,
  
  // Channel settings (for owners)
  settings: (channelId: string) => `/live-channels/${channelId}/settings`,
  
  // Ministry live channels
  ministryChannels: (ministryId: string) => `/ministries/${ministryId}/live`,
  
  // Ministry channel
  ministryChannel: (ministryId: string, channelId: string) => `/ministries/${ministryId}/live/${channelId}`,
} as const;

/**
 * Route parameter types
 */
export interface LiveChannelRouteParams {
  channelId?: string;
  replayId?: string;
  eventId?: string;
  ministryId?: string;
}

/**
 * Parse channel ID from URL path
 */
export function parseChannelIdFromPath(path: string): string | null {
  const match = path.match(/\/live-channels\/([^\/]+)/);
  return match ? match[1] : null;
}

/**
 * Parse ministry ID from URL path
 */
export function parseMinistryIdFromPath(path: string): string | null {
  const match = path.match(/\/ministries\/([^\/]+)/);
  return match ? match[1] : null;
}

/**
 * Check if current path is a live channel route
 */
export function isLiveChannelRoute(path: string): boolean {
  return path.startsWith('/live-channels') || path.includes('/live');
}

/**
 * Check if current path is a broadcast route
 */
export function isBroadcastRoute(path: string): boolean {
  return path.includes('/broadcast');
}

/**
 * Check if current path is a watch route
 */
export function isWatchRoute(path: string): boolean {
  return path.includes('/watch');
}

/**
 * Get breadcrumb items for live channel routes
 */
export function getLiveChannelBreadcrumbs(
  path: string,
  channelName?: string,
  ministryName?: string
): { label: string; href: string }[] {
  const breadcrumbs: { label: string; href: string }[] = [];
  
  if (path.includes('/ministries/')) {
    const ministryId = parseMinistryIdFromPath(path);
    if (ministryId) {
      breadcrumbs.push({
        label: ministryName || 'Ministry',
        href: `/ministries/${ministryId}`,
      });
      breadcrumbs.push({
        label: 'Live',
        href: LIVE_CHANNEL_ROUTES.ministryChannels(ministryId),
      });
    }
  } else {
    breadcrumbs.push({
      label: 'Live Channels',
      href: LIVE_CHANNEL_ROUTES.channels,
    });
  }
  
  const channelId = parseChannelIdFromPath(path);
  if (channelId && channelName) {
    breadcrumbs.push({
      label: channelName,
      href: LIVE_CHANNEL_ROUTES.channel(channelId),
    });
  }
  
  if (path.includes('/broadcast')) {
    breadcrumbs.push({ label: 'Broadcast', href: path });
  } else if (path.includes('/watch')) {
    breadcrumbs.push({ label: 'Watch', href: path });
  } else if (path.includes('/replays')) {
    breadcrumbs.push({ label: 'Replays', href: path });
  } else if (path.includes('/events')) {
    breadcrumbs.push({ label: 'Events', href: path });
  } else if (path.includes('/analytics')) {
    breadcrumbs.push({ label: 'Analytics', href: path });
  } else if (path.includes('/settings')) {
    breadcrumbs.push({ label: 'Settings', href: path });
  }
  
  return breadcrumbs;
}

/**
 * Navigation helper for live channels
 */
export const liveChannelNavigation = {
  goToChannels: () => LIVE_CHANNEL_ROUTES.channels,
  goToChannel: (channelId: string) => LIVE_CHANNEL_ROUTES.channel(channelId),
  goToBroadcast: (channelId: string) => LIVE_CHANNEL_ROUTES.broadcast(channelId),
  goToWatch: (channelId: string) => LIVE_CHANNEL_ROUTES.watch(channelId),
  goToReplays: (channelId: string) => LIVE_CHANNEL_ROUTES.replays(channelId),
  goToReplay: (channelId: string, replayId: string) => LIVE_CHANNEL_ROUTES.replay(channelId, replayId),
  goToEvents: (channelId: string) => LIVE_CHANNEL_ROUTES.events(channelId),
  goToEvent: (channelId: string, eventId: string) => LIVE_CHANNEL_ROUTES.event(channelId, eventId),
  goToAnalytics: (channelId: string) => LIVE_CHANNEL_ROUTES.analytics(channelId),
  goToSettings: (channelId: string) => LIVE_CHANNEL_ROUTES.settings(channelId),
  goToMinistryChannels: (ministryId: string) => LIVE_CHANNEL_ROUTES.ministryChannels(ministryId),
  goToMinistryChannel: (ministryId: string, channelId: string) => LIVE_CHANNEL_ROUTES.ministryChannel(ministryId, channelId),
};
